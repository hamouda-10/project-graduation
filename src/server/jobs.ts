import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { ThinkingLevel } from "@google/genai";
import { db, JobRecord, TranscriptSegment } from "./db";
import {
  extractHighlightsFromSegments,
  extractKeywordsWithFrequency,
  generateAiSummary,
  generateAiLectureAnalysis,
  generateAiQuiz,
  generateAiFlashcards,
  generateAiMindMap,
} from "./ai";
import { extractGeminiTranscriptText, getGeminiClient } from "./gemini";
import { getChunksDir, inspectMediaContainerSignature } from "./storage";
import { notifySync } from "./sync";

const TEXT_MODEL = "gemini-4-hydrogen";

const execFileAsync = promisify(execFile);
const CHUNKS_BASE_DIR = getChunksDir();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL?.replace(/\/$/, "");
const MAX_SIZE_BYTES = Number(process.env.MAX_RECORDING_SIZE_MB || 500) * 1024 * 1024;
const INLINE_AUDIO_LIMIT_BYTES = 8 * 1024 * 1024;

if (!fs.existsSync(CHUNKS_BASE_DIR)) {
  fs.mkdirSync(CHUNKS_BASE_DIR, { recursive: true });
}

let cachedMediaToolsStatus: { ffmpeg: boolean; ffprobe: boolean; checkedAt: number } | null = null;

function isBinaryUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string | number; message?: string };
  // A numeric exit code proves the binary executed and rejected the media file
  if (typeof e.code === "number") return false;
  const code = String(e.code || "");
  const msg = String(e.message || "");
  return (
    code === "ENOENT" ||
    code === "EACCES" ||
    code === "ERR_UNSUPPORTED" ||
    /ENOENT|command not found|not implemented|spawn (?:ffmpeg|ffprobe)\s+ENOENT/i.test(msg)
  );
}

export async function checkMediaToolsAvailable(): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
  if (cachedMediaToolsStatus && Date.now() - cachedMediaToolsStatus.checkedAt < 60_000) {
    return { ffmpeg: cachedMediaToolsStatus.ffmpeg, ffprobe: cachedMediaToolsStatus.ffprobe };
  }
  const [ffprobeOk, ffmpegOk] = await Promise.all([
    execFileAsync("ffprobe", ["-version"], { timeout: 5000 })
      .then(() => true)
      .catch(() => false),
    execFileAsync("ffmpeg", ["-version"], { timeout: 5000 })
      .then(() => true)
      .catch(() => false),
  ]);
  cachedMediaToolsStatus = { ffmpeg: ffmpegOk, ffprobe: ffprobeOk, checkedAt: Date.now() };
  return { ffmpeg: ffmpegOk, ffprobe: ffprobeOk };
}

const cancelledJobs = new Set<string>();
const BLOCKED_NON_MEDIA_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".cs",
  ".java",
  ".c",
  ".cpp",
  ".sh",
  ".bat",
  ".ps1",
  ".exe",
  ".dll",
  ".so",
  ".dmg",
  ".msi",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".bmp",
  ".webp",
  ".ico",
]);

function logPipelineEvent(
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown>,
) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    service: "meetmind-pipeline",
    level,
    event,
    ...details,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export interface MediaProbeResult {
  valid: boolean;
  error?: string;
  category?: string;
  correlationId?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  durationSeconds: number;
  formatName?: string;
  codec?: string;
  detectedMimeType?: string;
  ffprobeAvailable?: boolean;
  repairedPath?: string;
}

async function probeDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-analyzeduration",
        "100M",
        "-probesize",
        "100M",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { timeout: 45000, maxBuffer: 4 * 1024 * 1024 },
    );
    const dur = parseFloat((stdout || "").trim());
    return isNaN(dur) || dur < 0 ? 0 : dur;
  } catch {
    return 0;
  }
}

async function tryTolerantFfmpegRepair(
  inputPath: string,
): Promise<{ repairedPath: string; durationSeconds: number } | null> {
  const repairedPath = `${inputPath}.repaired.wav`;
  const demuxerAttempts: Array<string[]> = [
    [],
    ["-f", "aac"],
    ["-f", "mp3"],
    ["-f", "ogg"],
    ["-f", "matroska"],
    ["-f", "amr"],
    ["-f", "wav"],
  ];

  for (const demuxArgs of demuxerAttempts) {
    try {
      if (fs.existsSync(repairedPath)) fs.unlinkSync(repairedPath);
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-err_detect",
          "ignore_err",
          "-fflags",
          "+genpts+igndts+discardcorrupt",
          "-analyzeduration",
          "100M",
          "-probesize",
          "100M",
          ...demuxArgs,
          "-i",
          inputPath,
          "-vn",
          "-acodec",
          "pcm_s16le",
          "-ar",
          "16000",
          "-ac",
          "1",
          repairedPath,
        ],
        { timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
      );

      if (fs.existsSync(repairedPath) && fs.statSync(repairedPath).size > 2048) {
        const dur = await probeDurationSeconds(repairedPath);
        if (dur >= 0.5) {
          return { repairedPath, durationSeconds: dur };
        }
        // Decoded audio was genuinely too short
        fs.unlinkSync(repairedPath);
        return { repairedPath: "", durationSeconds: dur };
      }
    } catch {
      if (fs.existsSync(repairedPath)) {
        try {
          fs.unlinkSync(repairedPath);
        } catch {
          /* ignore */
        }
      }
    }
  }

  return null;
}

export async function validateMediaFile(
  filePath: string,
  originalFilename?: string,
): Promise<MediaProbeResult> {
  const correlationId = `val_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;

  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      error: `Media file not found on storage (ref: ${correlationId}).`,
      category: "StorageError",
      correlationId,
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
    };
  }

  const stat = fs.statSync(filePath);
  if (stat.size <= 0) {
    return {
      valid: false,
      error: "Uploaded file is empty (0 bytes).",
      category: "MediaValidationError",
      correlationId,
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
    };
  }
  if (stat.size > MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `File exceeds maximum allowed size of ${Math.round(MAX_SIZE_BYTES / (1024 * 1024))} MB.`,
      category: "FileSizeLimitExceeded",
      correlationId,
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
    };
  }

  const ext = path.extname(originalFilename || filePath).toLowerCase();
  if (ext && BLOCKED_NON_MEDIA_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported non-media file format (${ext}).`,
      category: "UnsupportedMediaFormat",
      correlationId,
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
    };
  }

  // Always inspect actual binary container magic bytes (works even if extension mismatches or ffprobe is unavailable)
  const signature = inspectMediaContainerSignature(filePath);
  if (signature.isLikelyTextOrNonMedia) {
    return {
      valid: false,
      error: `Unsupported media container: file contents are not audio or video (ref: ${correlationId}).`,
      category: "UnsupportedMediaContainer",
      correlationId,
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
    };
  }

  let probeErrorMsg = "";
  let ffprobeUnavailable = false;
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-analyzeduration",
        "100M",
        "-probesize",
        "100M",
        "-show_entries",
        "stream=codec_type,codec_name,duration:format=duration,format_name",
        "-of",
        "json",
        filePath,
      ],
      { timeout: 60000, maxBuffer: 10 * 1024 * 1024 },
    );

    const parsed = JSON.parse(stdout || "{}");
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const audioStream = streams.find((s: { codec_type?: string }) => s.codec_type === "audio");
    const hasAudio = Boolean(audioStream);
    const hasVideo = streams.some((s: { codec_type?: string }) => s.codec_type === "video");
    const audioStreamDur = streams
      .filter((s: { codec_type?: string }) => s.codec_type === "audio")
      .map((s: { duration?: string }) => parseFloat(s.duration || "0"))
      .find((d: number) => !isNaN(d) && d > 0);
    const rawDuration = parseFloat(parsed.format?.duration || "0") || audioStreamDur || 0;
    const durationSeconds = isNaN(rawDuration) ? 0 : rawDuration;
    const formatName = String(parsed.format?.format_name || signature.containerName || "unknown");
    const codec = String(audioStream?.codec_name || "unknown");

    if (!hasAudio && hasVideo) {
      return {
        valid: false,
        error: "Invalid audio stream: video file contains no audio track.",
        category: "InvalidAudioStream",
        correlationId,
        hasAudio: false,
        hasVideo: true,
        durationSeconds,
        formatName,
        ffprobeAvailable: true,
      };
    }

    if (hasAudio) {
      if (durationSeconds > 0 && durationSeconds < 0.5) {
        return {
          valid: false,
          error: "Recording is too short (minimum 0.5 seconds).",
          category: "MediaValidationError",
          correlationId,
          hasAudio,
          hasVideo,
          durationSeconds,
          formatName,
          codec,
          ffprobeAvailable: true,
        };
      }
      return {
        valid: true,
        correlationId,
        hasAudio,
        hasVideo,
        durationSeconds: Math.max(1, Math.round(durationSeconds || 1)),
        formatName,
        codec,
        detectedMimeType: signature.recognized ? signature.mimeType : getAudioMimeType(filePath),
        ffprobeAvailable: true,
      };
    }
  } catch (err) {
    probeErrorMsg = err instanceof Error ? err.message : String(err);
    ffprobeUnavailable = isBinaryUnavailableError(err);
  }

  // Production resilience: if ffprobe is not installed in a slim runtime container,
  // validate strictly using real binary magic-byte container signatures rather than falsely claiming corruption.
  if (ffprobeUnavailable) {
    if (signature.recognized) {
      logPipelineEvent("warn", "ffprobe_unavailable_binary_signature_validated", {
        correlationId,
        originalFilename: originalFilename || path.basename(filePath),
        sizeBytes: stat.size,
        containerName: signature.containerName,
        mimeType: signature.mimeType,
      });
      return {
        valid: true,
        correlationId,
        hasAudio: true,
        hasVideo: false,
        durationSeconds: Math.max(1, Math.round(stat.size / 16000)),
        formatName: signature.containerName,
        detectedMimeType: signature.mimeType,
        ffprobeAvailable: false,
      };
    }

    logPipelineEvent("error", "ffprobe_unavailable_unrecognized_container", {
      correlationId,
      originalFilename: originalFilename || path.basename(filePath),
      sizeBytes: stat.size,
    });
    return {
      valid: false,
      error: `Unsupported media container: unrecognized binary signature while FFprobe is unavailable (ref: ${correlationId}).`,
      category: "FFmpegUnavailable",
      correlationId,
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
      ffprobeAvailable: false,
    };
  }

  // Fallback: tolerant FFmpeg decode/repair for real-world phone/WhatsApp/M4A containers with header quirks
  const recovered = await tryTolerantFfmpegRepair(filePath);
  if (recovered) {
    if (!recovered.repairedPath && recovered.durationSeconds < 0.5) {
      return {
        valid: false,
        error: "Recording is too short (minimum 0.5 seconds).",
        category: "MediaValidationError",
        correlationId,
        hasAudio: true,
        hasVideo: false,
        durationSeconds: recovered.durationSeconds,
        ffprobeAvailable: true,
      };
    }
    if (recovered.repairedPath) {
      logPipelineEvent("info", "media_container_repaired", {
        correlationId,
        originalFilename: originalFilename || path.basename(filePath),
        sizeBytes: stat.size,
        durationSeconds: Math.round(recovered.durationSeconds),
      });
      return {
        valid: true,
        correlationId,
        hasAudio: true,
        hasVideo: false,
        durationSeconds: Math.max(1, Math.round(recovered.durationSeconds)),
        formatName: "wav",
        codec: "pcm_s16le",
        detectedMimeType: "audio/wav",
        ffprobeAvailable: true,
        repairedPath: recovered.repairedPath,
      };
    }
  }

  logPipelineEvent("warn", "media_validation_failed", {
    correlationId,
    originalFilename: originalFilename || path.basename(filePath),
    sizeBytes: stat.size,
    recognizedSignature: signature.recognized,
    containerName: signature.containerName,
    reason: probeErrorMsg.slice(0, 240),
  });

  return {
    valid: false,
    error: `File is corrupted or unreadable media container (ref: ${correlationId}).`,
    category: "UnsupportedMediaContainer",
    correlationId,
    hasAudio: false,
    hasVideo: false,
    durationSeconds: 0,
    ffprobeAvailable: true,
  };
}

async function extractAndNormalizeAudio(inputPath: string, outputPath: string): Promise<number> {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-err_detect",
      "ignore_err",
      "-fflags",
      "+genpts+igndts+discardcorrupt",
      "-analyzeduration",
      "100M",
      "-probesize",
      "100M",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      outputPath,
    ],
    { timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
  );

  const dur = await probeDurationSeconds(outputPath);
  return dur <= 0 ? 1 : Math.round(dur);
}

async function splitAudioIntoChunks(
  audioPath: string,
  outputDir: string,
  chunkDurationSec = 120,
): Promise<Array<{ chunkIndex: number; filePath: string; startSec: number; endSec: number }>> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const chunkPattern = path.join(outputDir, "chunk_%03d.mp3");
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      audioPath,
      "-f",
      "segment",
      "-segment_time",
      String(chunkDurationSec),
      "-reset_timestamps",
      "1",
      "-vn",
      "-acodec",
      "libmp3lame",
      "-b:a",
      "48k",
      "-ar",
      "16000",
      "-ac",
      "1",
      chunkPattern,
    ],
    { timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
  );

  const files = fs
    .readdirSync(outputDir)
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
    .sort();

  const chunks: Array<{ chunkIndex: number; filePath: string; startSec: number; endSec: number }> =
    [];
  for (let i = 0; i < files.length; i++) {
    const chunkFile = path.join(outputDir, files[i]);
    const startSec = i * chunkDurationSec;
    const probed = await probeDurationSeconds(chunkFile);
    const dur = probed > 0 ? Math.round(probed) : chunkDurationSec;
    chunks.push({
      chunkIndex: i,
      filePath: chunkFile,
      startSec,
      endSec: startSec + dur,
    });
  }
  return chunks;
}

function getAudioMimeType(filePath: string): string {
  // Always prefer real binary container signature over filename extension
  // (e.g. a WebM/Opus file saved with `.m4a` extension must be sent as `audio/webm`)
  const sig = inspectMediaContainerSignature(filePath);
  if (sig.recognized && sig.mimeType) {
    return sig.mimeType;
  }

  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "audio/mp3";
    case ".wav":
      return "audio/wav";
    case ".m4a":
    case ".aac":
    case ".mp4":
      return "audio/mp4";
    case ".ogg":
    case ".oga":
    case ".opus":
      return "audio/ogg";
    case ".flac":
      return "audio/flac";
    case ".webm":
      return "audio/webm";
    default:
      return "audio/wav";
  }
}

function splitVerbatimTextIntoSegments(
  rawText: string,
  isMeeting: boolean,
  startOffsetSec: number,
  durationSeconds: number,
  language: string,
): TranscriptSegment[] {
  const cleaned = rawText
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!cleaned) return [];

  const rawSentences = cleaned
    .split(/(?<=[.!?؟।\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

  if (rawSentences.length === 0) {
    return [
      {
        id: `seg_${Date.now()}_1`,
        speaker: isMeeting ? "Speaker 1" : "Lecturer",
        startTime: startOffsetSec,
        endTime: startOffsetSec + Math.max(5, durationSeconds),
        text: cleaned,
        confidence: 0.9,
        language,
        isPartial: false,
      },
    ];
  }

  const groupedTexts: string[] = [];
  let currentGroup = "";
  for (const sent of rawSentences) {
    if (currentGroup.length + sent.length > 180 && currentGroup.length > 0) {
      groupedTexts.push(currentGroup.trim());
      currentGroup = sent;
    } else {
      currentGroup = currentGroup ? `${currentGroup} ${sent}` : sent;
    }
  }
  if (currentGroup.trim()) groupedTexts.push(currentGroup.trim());

  const totalChars = Math.max(
    1,
    groupedTexts.reduce((acc, t) => acc + t.length, 0),
  );
  const effectiveDuration = Math.max(groupedTexts.length * 4, durationSeconds || 10);
  let cursorSec = startOffsetSec;

  return groupedTexts.map((txt, idx) => {
    const share = Math.max(2, Math.round((txt.length / totalChars) * effectiveDuration));
    const segStart = cursorSec;
    const segEnd =
      idx === groupedTexts.length - 1
        ? Math.max(segStart + 2, startOffsetSec + effectiveDuration)
        : segStart + share;
    cursorSec = segEnd;

    let speaker = isMeeting ? `Speaker ${(idx % 2) + 1}` : "Lecturer";
    let cleanText = txt;
    const speakerMatch = txt.match(/^([^:]{2,25}):\s*(.+)$/s);
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      cleanText = speakerMatch[2].trim();
    }

    return {
      id: `seg_${Date.now()}_${idx + 1}`,
      speaker,
      startTime: segStart,
      endTime: segEnd,
      text: cleanText,
      confidence: 0.9,
      language,
      isPartial: false,
    };
  });
}

async function transcribeWithPythonAiService(
  audioFilePath: string,
  resourceType: "meeting" | "lecture",
  language: string,
): Promise<TranscriptSegment[]> {
  if (!AI_SERVICE_URL) return [];
  try {
    const fileBuf = fs.readFileSync(audioFilePath);
    const form = new FormData();
    form.append("file", new Blob([fileBuf]), path.basename(audioFilePath));
    form.append("is_meeting", resourceType === "meeting" ? "true" : "false");
    form.append("language", language || "auto");

    const resp = await fetch(`${AI_SERVICE_URL}/api/v1/transcribe`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      segments?: Array<{
        id?: string;
        speaker?: string;
        start_time?: number;
        end_time?: number;
        startTime?: number;
        endTime?: number;
        text?: string;
        confidence?: number;
        language?: string;
      }>;
      detected_language?: string;
    };
    if (!Array.isArray(data.segments)) return [];
    return data.segments
      .filter((s) => s.text && s.text.trim())
      .map((s, idx) => {
        const sTime =
          typeof s.start_time === "number"
            ? s.start_time
            : typeof s.startTime === "number"
              ? s.startTime
              : idx * 5;
        const eTime =
          typeof s.end_time === "number"
            ? s.end_time
            : typeof s.endTime === "number"
              ? s.endTime
              : sTime + 5;
        return {
          id: s.id || `seg_py_${Date.now()}_${idx + 1}`,
          speaker: s.speaker || (resourceType === "meeting" ? "Speaker 1" : "Lecturer"),
          startTime: sTime,
          endTime: eTime,
          text: s.text!.trim(),
          confidence: typeof s.confidence === "number" ? s.confidence : 0.92,
          language: s.language || data.detected_language || language,
          isPartial: false,
        };
      });
  } catch {
    return [];
  }
}

interface GeminiTranscriptionOutcome {
  segments: TranscriptSegment[];
  errorMessage?: string;
  silent?: boolean;
}

function formatGeminiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || "Unknown Gemini API error");
  if (
    raw.includes("API_KEY_INVALID") ||
    raw.includes("API key not valid") ||
    raw.includes("PERMISSION_DENIED") ||
    raw.includes("403")
  ) {
    return "Gemini API key is missing or invalid (API_KEY_INVALID / 403). Please set a valid GEMINI_API_KEY in Settings > Secrets.";
  }
  if (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("429") || raw.includes("quota")) {
    return "Gemini API rate limit or quota exceeded (429 RESOURCE_EXHAUSTED). Please check your quota or select a paid API key in Settings > Secrets.";
  }
  if (raw.includes("NOT_FOUND") || raw.includes("404")) {
    return "Configured Gemini speech transcription model was not found (404).";
  }
  return `Gemini speech-to-text error: ${raw.slice(0, 240)}`;
}

async function transcribeAudioWithGemini(
  audioFilePath: string,
  resourceType: "meeting" | "lecture",
  startOffsetSec = 0,
  durationSeconds = 60,
  language = "auto",
): Promise<GeminiTranscriptionOutcome> {
  const ai = getGeminiClient();
  const isMeeting = resourceType === "meeting";

  if (!ai) {
    return {
      segments: [],
      errorMessage:
        "GEMINI_API_KEY is not configured. Please add a valid key in Settings > Secrets.",
    };
  }

  let uploadedFileName: string | undefined;
  try {
    const fileStat = fs.statSync(audioFilePath);
    const mimeType = getAudioMimeType(audioFilePath);
    const langHint =
      language && language !== "auto"
        ? `Spoken language hint: ${language}.`
        : "Detect the spoken language automatically (Arabic, English, or mixed) and transcribe faithfully without translating.";

    // Use Gemini Files API for larger audio files (> 8 MB) so even zero-FFmpeg production
    // containers can transcribe large real recordings directly without base64 payload limits.
    let audioPart:
      | { inlineData: { mimeType: string; data: string } }
      | { fileData: { fileUri: string; mimeType: string } };

    if (fileStat.size > INLINE_AUDIO_LIMIT_BYTES) {
      const uploaded = await ai.files.upload({
        file: audioFilePath,
        config: { mimeType },
      });
      uploadedFileName = uploaded.name;
      audioPart = {
        fileData: {
          fileUri: uploaded.uri!,
          mimeType: uploaded.mimeType || mimeType,
        },
      };
    } else {
      const audioBuffer = fs.readFileSync(audioFilePath);
      audioPart = {
        inlineData: {
          mimeType,
          data: audioBuffer.toString("base64"),
        },
      };
    }

    // Step 1: Dedicated ASR model (Speech -> Verbatim Text) separated from LLM reasoning.
    // Note: gemini-3.5-transcribe returns text inside non-text `part.audioTranscription.text`.
    const transcribePrompt = `Transcribe this audio verbatim word for word in its original spoken language. ${langHint} Do NOT invent any speech. If the recording contains only silence or noise with no human speech, return an empty string.`;

    let verbatimText = "";
    try {
      const transcribeResp = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [audioPart, { text: transcribePrompt }],
        },
      });
      verbatimText = extractGeminiTranscriptText(transcribeResp);
    } catch (asrErr) {
      const msg = asrErr instanceof Error ? asrErr.message : String(asrErr);
      if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED|403|401/i.test(msg)) {
        throw asrErr;
      }
      console.warn("Primary gemini-3.5-transcribe warning, trying multimodal fallback:", msg);
    }

    // Secondary real multimodal ASR pass via gemini-4-hydrogen if dedicated ASR returned empty
    if (!verbatimText) {
      try {
        const fallbackResp = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: {
            parts: [
              audioPart,
              {
                text: `${transcribePrompt} Return ONLY the spoken transcript text with no commentary. If there is strictly no human speech at all, reply with [SILENCE].`,
              },
            ],
          },
          config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
        });
        verbatimText = extractGeminiTranscriptText(fallbackResp);
      } catch (fallbackErr) {
        const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED|403|401/i.test(msg)) {
          throw fallbackErr;
        }
      }
    }

    const isSilentOutput =
      !verbatimText ||
      verbatimText === "[]" ||
      verbatimText.toLowerCase() === "[silence]" ||
      verbatimText === "[صمت]";

    if (isSilentOutput) {
      return { segments: [], silent: true };
    }

    const segments: TranscriptSegment[] = [];
    // Step 2: Optional timestamp & speaker turn segmentation via fast LLM on verbatim transcript text
    try {
      const segPrompt = `Split the following verbatim ASR transcript into chronological speaker segments totaling ${durationSeconds} seconds starting at ${startOffsetSec}s. Preserve EVERY word without altering or inventing content.
Transcript:
"""
${verbatimText}
"""
Return ONLY a JSON array: [{"speaker":"${isMeeting ? "Speaker 1" : "Lecturer"}","startTime":0,"endTime":10,"text":"exact text slice"}]`;

      const structuredResp = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: segPrompt,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawResp = (structuredResp.text || "").trim();
      if (rawResp) {
        const cleanedJson = rawResp
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        const arrayMatch = cleanedJson.match(/\[[\s\S]*\]/);
        const parsed = JSON.parse(arrayMatch ? arrayMatch[0] : cleanedJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((item, idx) => {
            if (item && typeof item.text === "string" && item.text.trim()) {
              const sTime =
                typeof item.startTime === "number" ? Math.round(item.startTime) : idx * 6;
              const eTime =
                typeof item.endTime === "number" && item.endTime > sTime
                  ? Math.round(item.endTime)
                  : sTime + 6;
              segments.push({
                id: `seg_${Date.now()}_${idx + 1}`,
                speaker: item.speaker || (isMeeting ? `Speaker ${(idx % 2) + 1}` : "Lecturer"),
                startTime: sTime >= startOffsetSec ? sTime : startOffsetSec + sTime,
                endTime: eTime >= startOffsetSec ? eTime : startOffsetSec + eTime,
                text: item.text.trim(),
                confidence: 0.92,
                language,
                isPartial: false,
              });
            }
          });
        }
      }
    } catch {
      // Fall back to deterministic splitter on verbatim ASR text
    }

    if (segments.length > 0) return { segments };

    return {
      segments: splitVerbatimTextIntoSegments(
        verbatimText,
        isMeeting,
        startOffsetSec,
        durationSeconds,
        language,
      ),
    };
  } catch (sttErr) {
    const formatted = formatGeminiErrorMessage(sttErr);
    console.warn("Gemini transcription error:", formatted);
    return { segments: [], errorMessage: formatted };
  } finally {
    if (uploadedFileName) {
      await ai.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }
}

function classifyFailureCategory(errMessage: string): { category: string; transient: boolean } {
  const lower = errMessage.toLowerCase();
  if (lower.includes("cancelled")) return { category: "CancelledByUser", transient: false };
  if (
    lower.includes("api_key_invalid") ||
    lower.includes("api key") ||
    lower.includes("settings > secrets") ||
    lower.includes("permission_denied") ||
    lower.includes("not configured") ||
    lower.includes("not found (404)")
  ) {
    return { category: "ConfigurationError", transient: false };
  }
  if (
    lower.includes("empty") ||
    lower.includes("corrupted") ||
    lower.includes("stream was not found") ||
    lower.includes("too short") ||
    lower.includes("unsupported media")
  ) {
    return { category: "MediaValidationError", transient: false };
  }
  if (lower.includes("no speech") || lower.includes("audible speech")) {
    return { category: "TranscriptionServiceError", transient: false };
  }
  if (lower.includes("timeout") || lower.includes("network") || lower.includes("econn")) {
    return { category: "TimeoutError", transient: true };
  }
  return { category: "TranscriptionServiceError", transient: true };
}

function assertNotCancelled(jobId: string) {
  if (cancelledJobs.has(jobId)) {
    throw new Error("Job cancelled by user.");
  }
}

export async function processRecordingJob(
  jobId: string,
  resourceType: "meeting" | "lecture",
  resourceId: string,
  filePath: string,
  originalFilename: string,
  language = "auto",
) {
  const jobChunkDir = path.join(CHUNKS_BASE_DIR, `job_${jobId}`);
  const normalizedAudioPath = path.join(CHUNKS_BASE_DIR, `norm_${jobId}.wav`);
  const jsonOutputPath = path.join(jobChunkDir, `transcript_${jobId}.json`);

  if (!fs.existsSync(jobChunkDir)) {
    fs.mkdirSync(jobChunkDir, { recursive: true });
  }

  try {
    assertNotCancelled(jobId);
    logPipelineEvent("info", "job_started", {
      jobId,
      resourceId,
      resourceType,
      originalFilename,
      language,
    });
    notifySync({ type: "ProcessingStarted", id: jobId, resourceId, resourceType, progress: 5 });

    // 1. Validating with FFprobe
    updateJob(jobId, {
      status: "Validating",
      stage: "ValidatingMedia",
      progressPercent: 10,
      filePath,
      originalFilename,
      language,
    });

    const probe = await validateMediaFile(filePath, originalFilename);
    if (!probe.valid) {
      throw new Error(probe.error || "Invalid media file.");
    }

    assertNotCancelled(jobId);

    // 2. Extracting / Normalizing 16kHz Mono PCM WAV (preserving original file; gracefully skipped if FFmpeg unavailable)
    updateJob(jobId, { status: "ExtractingAudio", stage: "AudioExtraction", progressPercent: 22 });
    notifySync({ type: "AudioExtractionStarted", id: jobId, resourceId, progress: 22 });

    let durationSeconds = probe.durationSeconds || 10;
    try {
      durationSeconds = await extractAndNormalizeAudio(filePath, normalizedAudioPath);
      logPipelineEvent("info", "audio_normalized", {
        jobId,
        resourceId,
        durationSeconds,
        hasVideo: probe.hasVideo,
      });
    } catch (normErr) {
      if (isBinaryUnavailableError(normErr)) {
        logPipelineEvent("warn", "ffmpeg_unavailable_using_original_media", {
          jobId,
          resourceId,
          detectedMimeType: probe.detectedMimeType,
        });
      } else {
        throw new Error(
          `Audio extraction failed: ${normErr instanceof Error ? normErr.message : "ffmpeg error"}`,
        );
      }
    }

    assertNotCancelled(jobId);

    // 3. Real Speech-to-Text Pipeline (Python FastAPI -> Gemini -> Local transcribe.py)
    updateJob(jobId, { status: "Transcribing", stage: "Transcribing", progressPercent: 35 });
    notifySync({ type: "TranscriptionStarted", id: jobId, resourceId, progress: 35 });

    let segments: TranscriptSegment[] = [];
    const isMeeting = resourceType === "meeting";
    const hasNormalizedWav = fs.existsSync(normalizedAudioPath);
    const activeAudioFile = hasNormalizedWav ? normalizedAudioPath : filePath;
    const activeStat = fs.statSync(activeAudioFile);

    // 3a. Microservice HTTP contract if configured
    if (AI_SERVICE_URL) {
      segments = await transcribeWithPythonAiService(activeAudioFile, resourceType, language);
    }

    let geminiErrorMsg: string | undefined;
    let geminiObservedSilence = false;

    // 3b. Gemini Multimodal ASR (automatically split into compact 120s 48kbps MP3 chunks with bounded concurrency=3)
    if (segments.length === 0) {
      if ((activeStat.size > 3.5 * 1024 * 1024 || durationSeconds > 150) && hasNormalizedWav) {
        const chunks = await splitAudioIntoChunks(normalizedAudioPath, jobChunkDir, 120);
        const chunkResults: Array<TranscriptSegment[]> = new Array(chunks.length);
        let completedChunks = 0;
        let fatalConfigError = false;
        let nextIndex = 0;
        const concurrency = Math.min(3, chunks.length);

        const worker = async () => {
          while (!fatalConfigError) {
            const idx = nextIndex++;
            if (idx >= chunks.length) break;
            assertNotCancelled(jobId);
            const ch = chunks[idx];
            const outcome = await transcribeAudioWithGemini(
              ch.filePath,
              resourceType,
              ch.startSec,
              Math.max(5, ch.endSec - ch.startSec),
              language,
            );
            if (outcome.errorMessage) {
              geminiErrorMsg = outcome.errorMessage;
              if (
                outcome.errorMessage.includes("API_KEY_INVALID") ||
                outcome.errorMessage.includes("Settings > Secrets") ||
                outcome.errorMessage.includes("not configured")
              ) {
                fatalConfigError = true;
                break;
              }
            }
            if (outcome.silent) geminiObservedSilence = true;
            chunkResults[idx] = outcome.segments;
            completedChunks++;
            const chunkPct = 35 + Math.round((completedChunks / chunks.length) * 30);
            updateJob(jobId, {
              status: "Transcribing",
              stage: `Chunk ${completedChunks}/${chunks.length}`,
              progressPercent: chunkPct,
            });
            if (outcome.segments.length > 0) {
              notifySync({
                type: "TranscriptSegmentAvailable",
                id: resourceId,
                jobId,
                progress: chunkPct,
              });
            }
          }
        };

        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        for (const list of chunkResults) {
          if (list && list.length > 0) segments.push(...list);
        }
        segments.sort((a, b) => a.startTime - b.startTime);
      } else {
        const outcome = await transcribeAudioWithGemini(
          activeAudioFile,
          resourceType,
          0,
          durationSeconds,
          language,
        );
        if (outcome.errorMessage) geminiErrorMsg = outcome.errorMessage;
        if (outcome.silent) geminiObservedSilence = true;
        segments = outcome.segments;
      }
    }

    // 3c. Local Python faster-whisper CLI engine
    if (segments.length === 0) {
      try {
        const pyArgs = [
          "services/ai_service/transcribe.py",
          activeAudioFile,
          "--language",
          language || "auto",
          ...(isMeeting ? ["--meeting"] : []),
          "--output",
          jsonOutputPath,
        ];
        await execFileAsync("python3", pyArgs, { maxBuffer: 25 * 1024 * 1024, timeout: 180000 });
        if (fs.existsSync(jsonOutputPath)) {
          const parsed = JSON.parse(fs.readFileSync(jsonOutputPath, "utf-8"));
          if (parsed.success && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
            segments = (
              parsed.segments as Array<{
                speaker?: string;
                startTime?: number;
                endTime?: number;
                text: string;
                confidence?: number;
                language?: string;
              }>
            ).map((s, idx: number) => ({
              id: `seg_${jobId}_${idx + 1}`,
              speaker: s.speaker || (isMeeting ? `Speaker ${(idx % 2) + 1}` : "Lecturer"),
              startTime: typeof s.startTime === "number" ? Math.round(s.startTime * 10) / 10 : 0,
              endTime: typeof s.endTime === "number" ? Math.round(s.endTime * 10) / 10 : 5,
              text: s.text.trim(),
              confidence: typeof s.confidence === "number" ? s.confidence : 0.9,
              language: s.language || language,
              isPartial: false,
            }));
          }
        }
      } catch (whisperErr) {
        console.warn(`[Job ${jobId}] Python Whisper notice:`, whisperErr);
      }
    }

    // Strict No-Fake-Data rule: fail cleanly with the real underlying reason (API key / quota / silence)
    if (segments.length === 0) {
      if (geminiErrorMsg) {
        throw new Error(geminiErrorMsg);
      }
      if (geminiObservedSilence) {
        throw new Error("No audible speech detected in the recording.");
      }
      throw new Error(
        "No audible speech detected or configured ASR engine could not transcribe audio.",
      );
    }

    assertNotCancelled(jobId);

    // 4. Merging & Completion of Transcription Stage
    updateJob(jobId, { status: "Merging", stage: "MergingTranscript", progressPercent: 72 });
    notifySync({ type: "TranscriptionCompleted", id: resourceId, jobId, progress: 72 });

    const fullText = segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");

    // 5-8. Run the Unified Post-Transcription Intelligence Pipeline (shared identically by Upload & Live Recording)
    const jobOwnerId = db.get("jobs").find((j) => j.id === jobId)?.userId || "usr_admin";
    const resourceTitle =
      resourceType === "meeting"
        ? db.get("meetings").find((m) => m.id === resourceId)?.title || originalFilename
        : db.get("lectures").find((l) => l.id === resourceId)?.title || originalFilename;
    const courseCode =
      resourceType === "lecture"
        ? db.get("lectures").find((l) => l.id === resourceId)?.courseCode
        : undefined;

    await runUnifiedPostTranscriptionPipeline({
      resourceType,
      resourceId,
      title: resourceTitle,
      courseCode,
      language,
      durationSeconds,
      segments,
      userId: jobOwnerId,
      jobId,
      checkCancelled: () => assertNotCancelled(jobId),
    });

    updateJob(jobId, { status: "Completed", stage: "Completed", progressPercent: 100 });
    logPipelineEvent("info", "job_completed", {
      jobId,
      resourceId,
      resourceType,
      segmentsCount: segments.length,
      durationSeconds,
    });
    notifySync({
      type: "ProcessingCompleted",
      userId: jobOwnerId,
      id: resourceId,
      resourceId,
      resourceType,
      jobId,
      progress: 100,
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Unknown processing error";
    const { category, transient } = classifyFailureCategory(errMessage);
    logPipelineEvent("error", "job_error", {
      jobId,
      resourceId,
      resourceType,
      category,
      transient,
      error: errMessage,
    });
    const currentJob = db.get("jobs").find((j) => j.id === jobId);
    const retries = currentJob?.retryCount || 0;
    const maxRetries = currentJob?.maxRetries ?? 2;

    if (category === "CancelledByUser") {
      cancelledJobs.delete(jobId);
      updateJob(jobId, {
        status: "Cancelled",
        stage: "Cancelled",
        failureCategory: category,
        failureTimestamp: new Date().toISOString(),
        errorMessage: "Cancelled by user.",
      });
      if (resourceType === "meeting") {
        db.update("meetings", (meetings) =>
          meetings.map((m) => (m.id === resourceId ? { ...m, status: "Failed" } : m)),
        );
      } else {
        db.update("lectures", (lectures) =>
          lectures.map((l) => (l.id === resourceId ? { ...l, status: "Failed" } : l)),
        );
      }
      notifySync({ type: "JobCancelled", id: resourceId, jobId });
      return;
    }

    // Exponential backoff retry for transient failures
    if (transient && retries < maxRetries) {
      const nextRetry = retries + 1;
      const backoffMs = Math.pow(2, nextRetry) * 1000;
      updateJob(jobId, {
        status: "Queued",
        stage: `Retrying (${nextRetry}/${maxRetries})`,
        retryCount: nextRetry,
        failureCategory: category,
        errorMessage: `Temporary error, retrying automatically: ${errMessage}`,
      });
      setTimeout(() => {
        void processRecordingJob(
          jobId,
          resourceType,
          resourceId,
          filePath,
          originalFilename,
          language,
        );
      }, backoffMs);
      return;
    }

    updateJob(jobId, {
      status: "Failed",
      stage: "Failed",
      failureCategory: category,
      failureTimestamp: new Date().toISOString(),
      errorMessage: errMessage,
    });

    if (resourceType === "meeting") {
      db.update("meetings", (meetings) =>
        meetings.map((m) => (m.id === resourceId ? { ...m, status: "Failed" } : m)),
      );
    } else {
      db.update("lectures", (lectures) =>
        lectures.map((l) => (l.id === resourceId ? { ...l, status: "Failed" } : l)),
      );
    }
    notifySync({ type: "ProcessingFailed", id: resourceId, jobId });
  } finally {
    try {
      if (fs.existsSync(jobChunkDir)) fs.rmSync(jobChunkDir, { recursive: true, force: true });
      if (fs.existsSync(normalizedAudioPath)) fs.unlinkSync(normalizedAudioPath);
    } catch {
      /* ignore cleanup */
    }
  }
}

export function updateJob(jobId: string, updates: Partial<JobRecord>) {
  db.update("jobs", (jobs) =>
    jobs.map((j) =>
      j.id === jobId ? { ...j, ...updates, updatedAt: new Date().toISOString() } : j,
    ),
  );
  notifySync({ type: "JOB_UPDATED", id: jobId, progress: updates.progressPercent });
}

export function createJob(
  resourceType: "meeting" | "lecture",
  resourceId: string,
  fileName: string,
  filePath?: string,
  language = "auto",
  options?: { userId?: string; idempotencyKey?: string },
): JobRecord {
  const job: JobRecord = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: options?.userId || "usr_admin",
    correlationId: `corr_${Date.now().toString(36)}`,
    idempotencyKey: options?.idempotencyKey,
    type: "transcription",
    status: "Queued",
    stage: "Queued",
    progressPercent: 5,
    resourceType,
    resourceId,
    fileName,
    filePath,
    originalFilename: fileName,
    language,
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.update("jobs", (jobs) => [job, ...jobs]);
  return job;
}

export function cancelJob(jobId: string): JobRecord {
  const job = db.get("jobs").find((j) => j.id === jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  cancelledJobs.add(jobId);
  updateJob(jobId, {
    status: "Cancelled",
    stage: "Cancelled",
    failureCategory: "CancelledByUser",
    failureTimestamp: new Date().toISOString(),
    errorMessage: "Cancelled by user.",
  });
  return db.get("jobs").find((j) => j.id === jobId)!;
}

export async function retryJob(jobId: string): Promise<JobRecord> {
  const job = db.get("jobs").find((j) => j.id === jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  let filePath = job.filePath;
  if (!filePath) {
    if (job.resourceType === "meeting") {
      filePath = db.get("meetings").find((m) => m.id === job.resourceId)?.recordingPath;
    } else {
      filePath = db.get("lectures").find((l) => l.id === job.resourceId)?.recordingPath;
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Original audio recording file is no longer available on disk for retry.");
  }

  cancelledJobs.delete(jobId);
  updateJob(jobId, {
    status: "Queued",
    stage: "Queued",
    progressPercent: 5,
    retryCount: 0,
    failureCategory: undefined,
    failureTimestamp: undefined,
    errorMessage: undefined,
  });

  if (job.resourceType === "meeting") {
    db.update("meetings", (meetings) =>
      meetings.map((m) => (m.id === job.resourceId ? { ...m, status: "Processing" } : m)),
    );
  } else {
    db.update("lectures", (lectures) =>
      lectures.map((l) => (l.id === job.resourceId ? { ...l, status: "Processing" } : l)),
    );
  }

  setTimeout(() => {
    void processRecordingJob(
      job.id,
      job.resourceType,
      job.resourceId,
      filePath!,
      job.originalFilename || job.fileName,
      job.language || "auto",
    );
  }, 50);

  return db.get("jobs").find((j) => j.id === jobId)!;
}

let recoveryRan = false;
export function recoverInterruptedJobs() {
  if (recoveryRan) return;
  recoveryRan = true;

  const jobs = db.get("jobs") || [];
  const interrupted = jobs.filter(
    (j) => j.status !== "Completed" && j.status !== "Failed" && j.status !== "Cancelled",
  );

  for (const job of interrupted) {
    if (job.filePath && fs.existsSync(job.filePath)) {
      setTimeout(() => {
        void processRecordingJob(
          job.id,
          job.resourceType,
          job.resourceId,
          job.filePath!,
          job.originalFilename || job.fileName,
          job.language || "auto",
        );
      }, 250);
    } else {
      updateJob(job.id, {
        status: "Failed",
        stage: "Failed",
        failureCategory: "StorageError",
        failureTimestamp: new Date().toISOString(),
        errorMessage: "Interrupted job could not resume because source media file is missing.",
      });
    }
  }
}

/**
 * Safely returns the isolated directory where live audio chunks for a session are stored.
 */
export function getLiveSessionChunksDir(sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId || safeId.length < 3 || safeId.length > 80) {
    throw new Error("Invalid sessionId");
  }
  const target = path.resolve(CHUNKS_BASE_DIR, `live_${safeId}`);
  const baseWithSep = path.resolve(CHUNKS_BASE_DIR) + path.sep;
  if (!target.startsWith(baseWithSep)) {
    throw new Error("Invalid live session chunk directory path");
  }
  return target;
}

/**
 * Concatenates all persisted live audio chunks for a session into one canonical
 * playable audio file using ffmpeg (avoiding multi-hour browser base64 uploads).
 */
export async function assembleLiveAudioChunks(
  sessionId: string,
  outputPath: string,
): Promise<{ assembledPath?: string; durationSeconds: number }> {
  const dir = getLiveSessionChunksDir(sessionId);
  if (!fs.existsSync(dir)) {
    return { durationSeconds: 0 };
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => /^chunk_\d+\.(wav|webm|ogg|m4a|mp3)$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/^chunk_(\d+)/)?.[1] || "0", 10);
      const nb = parseInt(b.match(/^chunk_(\d+)/)?.[1] || "0", 10);
      return na - nb;
    });

  if (files.length === 0) {
    return { durationSeconds: 0 };
  }

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Normalize each chunk to 16kHz mono WAV if needed, then concat cleanly
  const normalizedList: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const src = path.join(dir, files[i]);
    if (files[i].endsWith(".wav")) {
      normalizedList.push(src);
    } else {
      const wavOut = path.join(dir, `norm_${String(i).padStart(5, "0")}.wav`);
      try {
        await execFileAsync(
          "ffmpeg",
          [
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-err_detect",
            "ignore_err",
            "-i",
            src,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            wavOut,
          ],
          { timeout: 30000, maxBuffer: 4 * 1024 * 1024 },
        );
        if (fs.existsSync(wavOut) && fs.statSync(wavOut).size > 256) {
          normalizedList.push(wavOut);
        }
      } catch {
        // skip unreadable individual slice without failing the full recording
      }
    }
  }

  if (normalizedList.length === 0) {
    return { durationSeconds: 0 };
  }

  if (normalizedList.length === 1) {
    fs.copyFileSync(normalizedList[0], outputPath);
    const dur = await probeDurationSeconds(outputPath);
    return { assembledPath: outputPath, durationSeconds: Math.max(1, Math.round(dur || 1)) };
  }

  const listPath = path.join(dir, "concat_list.txt");
  const listContent = normalizedList.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listPath, listContent, "utf-8");

  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        outputPath,
      ],
      { timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
    );
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 512) {
      const dur = await probeDurationSeconds(outputPath);
      return { assembledPath: outputPath, durationSeconds: Math.max(1, Math.round(dur || 1)) };
    }
  } catch (err) {
    console.warn("Failed to concat live audio chunks:", err);
  }

  return { durationSeconds: 0 };
}

export interface UnifiedPipelineParams {
  resourceType: "meeting" | "lecture";
  resourceId: string;
  title: string;
  courseCode?: string;
  language: string;
  durationSeconds: number;
  segments: TranscriptSegment[];
  userId: string;
  jobId?: string;
  recordingPath?: string;
  recordingFileName?: string;
  audioUrl?: string;
  checkCancelled?: () => void;
}

export interface UnifiedPipelineResult {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  keywordsCount: number;
  highlightsCount: number;
  tasksCount: number;
  quizQuestionsCount: number;
  flashcardsCount: number;
  hasMindMap: boolean;
}

/**
 * UNIFIED POST-TRANSCRIPTION AI INTELLIGENCE PIPELINE
 * Executed identically for BOTH uploaded audio files (`processRecordingJob`)
 * AND finalized live recordings (`/api/v1/transcripts/live-session/finalize`).
 */
export async function runUnifiedPostTranscriptionPipeline(
  params: UnifiedPipelineParams,
): Promise<UnifiedPipelineResult> {
  const {
    resourceType,
    resourceId,
    title,
    courseCode,
    language,
    durationSeconds,
    segments,
    userId,
    jobId,
    recordingPath,
    recordingFileName,
    audioUrl,
    checkCancelled,
  } = params;

  const fullText = segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");
  const runId = jobId || `live_${resourceId}_${Date.now()}`;

  if (jobId) {
    updateJob(jobId, { status: "Analyzing", stage: "AIAnalysis", progressPercent: 80 });
  }
  notifySync({
    type: "AIAnalysisStarted",
    userId,
    id: resourceId,
    resourceId,
    resourceType,
    jobId,
    progress: 80,
  });

  // 1. Keywords (ranked with frequency, importance, context, timestamps) & Important Sentences
  const keywords = extractKeywordsWithFrequency(segments, 12);
  const cueHighlights = extractHighlightsFromSegments(segments);
  notifySync({
    type: "KeywordsReady",
    userId,
    id: resourceId,
    resourceId,
    resourceType,
    jobId,
    progress: 83,
  });

  // 2. Concurrent Summary + Deep Lecture/Meeting Analysis (strictly transcript-grounded)
  const [analysis, deepAnalysis] = await Promise.all([
    generateAiSummary(title, segments, resourceType, courseCode),
    generateAiLectureAnalysis(title, segments, resourceType, courseCode).catch(() => undefined),
  ]);

  checkCancelled?.();

  // Merge AI-detected important sentences with cue-based highlights (preserving timestamps)
  const highlights = [...cueHighlights];
  if (deepAnalysis?.importantSentences?.length) {
    for (const sentence of deepAnalysis.importantSentences) {
      const cleanSent = String(sentence || "").trim();
      if (!cleanSent) continue;
      const already = highlights.some(
        (h) => h.quote.includes(cleanSent) || cleanSent.includes(h.quote),
      );
      if (!already) {
        const matchedSeg = segments.find(
          (s) => s.text.includes(cleanSent.slice(0, 24)) || cleanSent.includes(s.text.slice(0, 24)),
        );
        const mins = Math.floor((matchedSeg?.startTime || 0) / 60);
        const secs = Math.floor((matchedSeg?.startTime || 0) % 60);
        highlights.push({
          quote: cleanSent,
          context: matchedSeg
            ? `From ${matchedSeg.speaker}`
            : "Identified key sentence from transcript",
          speaker: matchedSeg?.speaker,
          timestamp: `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`,
          category: "ImportantSentence",
          priority: "high",
        });
      }
    }
  }

  notifySync({
    type: "SummaryReady",
    userId,
    id: resourceId,
    resourceId,
    resourceType,
    jobId,
    progress: 87,
  });

  // 3. Verified Grounded Quiz, Flashcards, and Mind Map concurrently
  if (jobId) {
    updateJob(jobId, { status: "Generating Quiz", stage: "QuizGeneration", progressPercent: 90 });
  }

  const [generatedQuiz, generatedCards, generatedMindMap] = await Promise.all([
    generateAiQuiz(title, segments, analysis.summary, courseCode).catch(() => undefined),
    generateAiFlashcards(title, segments, analysis.summary, courseCode).catch(() => []),
    generateAiMindMap(title, segments, analysis.summary, courseCode).catch(() => undefined),
  ]);

  checkCancelled?.();

  if (generatedQuiz && generatedQuiz.questions.length > 0) {
    notifySync({
      type: "QuizReady",
      userId,
      id: resourceId,
      resourceId,
      resourceType,
      jobId,
      progress: 93,
    });
  }

  // Merge tasks from summary + deepAnalysis without fabricating owners/deadlines
  const combinedTasks: Array<{
    title: string;
    ownerName: string;
    dueDate?: string;
    deadlineText: string;
    sourceTimestamp?: string;
    priority: "high" | "medium" | "low";
  }> = [];
  const seenTasks = new Set<string>();

  for (const item of analysis.actionItems || []) {
    const key = item.title.trim().toLowerCase();
    if (!key || seenTasks.has(key)) continue;
    seenTasks.add(key);
    const deadline =
      item.dueDate && item.dueDate !== "Deadline not specified." ? item.dueDate : "Not specified";
    combinedTasks.push({
      title: item.title.trim(),
      ownerName: item.ownerName && item.ownerName.trim() ? item.ownerName.trim() : "Not specified",
      dueDate: deadline === "Not specified" ? undefined : deadline,
      deadlineText: deadline,
      sourceTimestamp: item.sourceTimestamp,
      priority: item.priority || "medium",
    });
  }
  for (const item of deepAnalysis?.actionItems || []) {
    const taskTitle = (item.task || "").trim();
    const key = taskTitle.toLowerCase();
    if (!key || seenTasks.has(key)) continue;
    seenTasks.add(key);
    const deadline =
      item.deadline && item.deadline !== "Deadline not specified." && item.deadline !== "null"
        ? item.deadline
        : "Not specified";
    combinedTasks.push({
      title: taskTitle,
      ownerName: item.owner && item.owner !== "null" ? item.owner.trim() : "Not specified",
      dueDate: deadline === "Not specified" ? undefined : deadline,
      deadlineText: deadline,
      priority: "medium",
    });
  }

  const now = new Date().toISOString();

  // 4. Persist Record + All Derived Intelligence Artifacts Atomically
  if (resourceType === "meeting") {
    const targetMeeting = db.get("meetings").find((m) => m.id === resourceId);
    const ownerId = targetMeeting?.hostId || userId || "usr_admin";

    db.update("meetings", (meetings) =>
      meetings.map((m) => {
        if (m.id !== resourceId) return m;
        return {
          ...m,
          status: "Completed",
          language,
          durationSeconds: Math.max(1, durationSeconds, m.durationSeconds || 1),
          recordingPath: recordingPath || m.recordingPath,
          recordingFileName: recordingFileName || m.recordingFileName,
          audioUrl: audioUrl || m.audioUrl,
          summary: analysis.summary,
          executiveSummary: analysis.executiveSummary || analysis.summary,
          detailedSummary: analysis.detailedSummary || analysis.summary,
          keyPoints: analysis.keyPoints,
          decisions: analysis.decisions,
          topics: deepAnalysis?.topics?.length
            ? deepAnalysis.topics
            : keywords.slice(0, 5).map((k) => k.term),
          keywords,
          highlights,
          analysis: deepAnalysis
            ? {
                topics: deepAnalysis.topics,
                keywords: deepAnalysis.keywords,
                definitions: deepAnalysis.definitions,
                questionsAsked: deepAnalysis.questionsAsked,
                actionItems: deepAnalysis.actionItems,
                emphasizedPoints: deepAnalysis.emphasizedPoints,
                reviewAreas: deepAnalysis.reviewAreas,
              }
            : undefined,
          fullText,
          segments,
          updatedAt: now,
        };
      }),
    );

    if (combinedTasks.length > 0) {
      db.update("actionItems", (items) => [
        ...items.filter((i) => i.meetingId !== resourceId),
        ...combinedTasks.map((t, idx) => ({
          id: `task_${runId}_${idx + 1}`,
          userId: ownerId,
          meetingId: resourceId,
          title: t.title,
          ownerName: t.ownerName,
          deadlineText: t.deadlineText,
          dueDate: t.dueDate,
          sourceTimestamp: t.sourceTimestamp,
          priority: t.priority,
          completed: false,
          createdAt: now,
        })),
      ]);
      notifySync({
        type: "TasksReady",
        userId: ownerId,
        id: resourceId,
        resourceId,
        resourceType,
        jobId,
        progress: 95,
      });
    }

    if (generatedQuiz && generatedQuiz.questions.length > 0) {
      db.update("quizzes", (quizzes) => [
        {
          id: `quiz_${runId}`,
          meetingId: resourceId,
          title: generatedQuiz.title,
          questions: generatedQuiz.questions,
          attemptsCount: 0,
          createdAt: now,
        },
        ...quizzes.filter((q) => q.meetingId !== resourceId),
      ]);
    }

    if (generatedCards && generatedCards.length > 0) {
      db.update("flashcards", (cards) => [
        ...generatedCards.map((c, idx) => ({
          id: `fc_${runId}_${idx + 1}`,
          deckId: `deck_${resourceId}`,
          deckTitle: title.length > 35 ? title.slice(0, 35) + "..." : title,
          meetingId: resourceId,
          front: c.front,
          back: c.back,
          sourceReference: c.sourceReference,
          topic: c.topic,
          difficulty: c.difficulty,
          mastered: false,
          reviewCount: 0,
          createdAt: now,
        })),
        ...cards.filter((c) => c.meetingId !== resourceId),
      ]);
      notifySync({
        type: "FlashcardsReady",
        userId: ownerId,
        id: resourceId,
        resourceId,
        resourceType,
        jobId,
        progress: 97,
      });
    }

    if (generatedMindMap) {
      db.update("mindMaps", (maps) => [
        {
          id: `mm_${runId}`,
          title,
          meetingId: resourceId,
          rootNode: generatedMindMap,
          createdAt: now,
        },
        ...maps.filter((m) => m.meetingId !== resourceId),
      ]);
    }
  } else {
    const targetLecture = db.get("lectures").find((l) => l.id === resourceId);
    const ownerId = targetLecture?.instructorId || userId || "usr_admin";

    db.update("lectures", (lectures) =>
      lectures.map((l) => {
        if (l.id !== resourceId) return l;
        return {
          ...l,
          status: "Completed",
          language,
          durationSeconds: Math.max(1, durationSeconds, l.durationSeconds || 1),
          recordingPath: recordingPath || l.recordingPath,
          recordingFileName: recordingFileName || l.recordingFileName,
          audioUrl: audioUrl || l.audioUrl,
          studyNotes: analysis.summary,
          summary: analysis.summary,
          executiveSummary: analysis.executiveSummary || analysis.summary,
          detailedSummary: analysis.detailedSummary || analysis.summary,
          keyConcepts: deepAnalysis?.definitions?.length
            ? deepAnalysis.definitions.map((d) => ({ term: d.term, definition: d.definition }))
            : [],
          examHighlights: deepAnalysis?.emphasizedPoints?.length
            ? deepAnalysis.emphasizedPoints
            : analysis.keyPoints,
          topics: deepAnalysis?.topics?.length
            ? deepAnalysis.topics
            : keywords.slice(0, 5).map((k) => k.term),
          keywords,
          highlights,
          analysis: deepAnalysis
            ? {
                topics: deepAnalysis.topics,
                keywords: deepAnalysis.keywords,
                definitions: deepAnalysis.definitions,
                questionsAsked: deepAnalysis.questionsAsked,
                actionItems: deepAnalysis.actionItems,
                emphasizedPoints: deepAnalysis.emphasizedPoints,
                reviewAreas: deepAnalysis.reviewAreas,
              }
            : undefined,
          fullText,
          segments,
          updatedAt: now,
        };
      }),
    );

    if (generatedQuiz && generatedQuiz.questions.length > 0) {
      db.update("quizzes", (quizzes) => [
        {
          id: `quiz_${runId}`,
          lectureId: resourceId,
          title: generatedQuiz.title,
          courseCode,
          questions: generatedQuiz.questions,
          attemptsCount: 0,
          createdAt: now,
        },
        ...quizzes.filter((q) => q.lectureId !== resourceId),
      ]);
    }

    if (combinedTasks.length > 0) {
      db.update("actionItems", (items) => [
        ...items.filter((i) => i.lectureId !== resourceId),
        ...combinedTasks.map((t, idx) => ({
          id: `task_${runId}_${idx + 1}`,
          userId: ownerId,
          lectureId: resourceId,
          title: t.title,
          ownerName: t.ownerName,
          deadlineText: t.deadlineText,
          dueDate: t.dueDate,
          sourceTimestamp: t.sourceTimestamp,
          priority: t.priority,
          completed: false,
          createdAt: now,
        })),
      ]);
      notifySync({
        type: "TasksReady",
        userId: ownerId,
        id: resourceId,
        resourceId,
        resourceType,
        jobId,
        progress: 95,
      });
    }

    if (generatedCards && generatedCards.length > 0) {
      db.update("flashcards", (cards) => [
        ...generatedCards.map((c, idx) => ({
          id: `fc_${runId}_${idx + 1}`,
          deckId: `deck_${resourceId}`,
          deckTitle: title.length > 35 ? title.slice(0, 35) + "..." : title,
          lectureId: resourceId,
          front: c.front,
          back: c.back,
          sourceReference: c.sourceReference,
          topic: c.topic,
          difficulty: c.difficulty,
          mastered: false,
          reviewCount: 0,
          createdAt: now,
        })),
        ...cards.filter((c) => c.lectureId !== resourceId),
      ]);
      notifySync({
        type: "FlashcardsReady",
        userId: ownerId,
        id: resourceId,
        resourceId,
        resourceType,
        jobId,
        progress: 97,
      });
    }

    if (generatedMindMap) {
      db.update("mindMaps", (maps) => [
        {
          id: `mm_${runId}`,
          title,
          lectureId: resourceId,
          rootNode: generatedMindMap,
          createdAt: now,
        },
        ...maps.filter((m) => m.lectureId !== resourceId),
      ]);
    }
  }

  db.update("notifications", (notifs) => [
    {
      id: `notif_${Date.now()}`,
      userId: userId || "usr_admin",
      title:
        resourceType === "meeting" ? "Meeting analysis completed" : "Lecture analysis completed",
      body: `Processed "${title}" (${segments.length} transcript segments).`,
      targetUrl: `/transcript?id=${resourceId}`,
      read: false,
      type: "summary",
      createdAt: now,
    },
    ...notifs,
  ]);

  notifySync({
    type: "AnalysisCompleted",
    userId,
    id: resourceId,
    resourceId,
    resourceType,
    jobId,
    progress: 100,
  });

  return {
    summary: analysis.summary,
    keyPoints: analysis.keyPoints,
    decisions: analysis.decisions,
    keywordsCount: keywords.length,
    highlightsCount: highlights.length,
    tasksCount: combinedTasks.length,
    quizQuestionsCount: generatedQuiz?.questions.length || 0,
    flashcardsCount: generatedCards?.length || 0,
    hasMindMap: Boolean(generatedMindMap),
  };
}
