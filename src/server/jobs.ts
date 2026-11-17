import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
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
import { getGeminiClient } from "./gemini";
import { notifySync } from "./sync";

const execAsync = promisify(exec);
const CHUNKS_BASE_DIR = path.resolve(process.cwd(), "data", "chunks");
const AI_SERVICE_URL = process.env.AI_SERVICE_URL?.replace(/\/$/, "");
const MAX_SIZE_BYTES = Number(process.env.MAX_RECORDING_SIZE_MB || 500) * 1024 * 1024;

if (!fs.existsSync(CHUNKS_BASE_DIR)) {
  fs.mkdirSync(CHUNKS_BASE_DIR, { recursive: true });
}

const cancelledJobs = new Set<string>();
const ALLOWED_MEDIA_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".flac",
  ".webm",
  ".mp4",
  ".mov",
  ".mkv",
  ".avi",
  ".wma",
  ".aiff",
]);

export interface MediaProbeResult {
  valid: boolean;
  error?: string;
  category?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  durationSeconds: number;
}

export async function validateMediaFile(
  filePath: string,
  originalFilename?: string,
): Promise<MediaProbeResult> {
  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      error: "Media file not found on disk.",
      category: "StorageError",
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
    };
  }

  const stat = fs.statSync(filePath);
  if (stat.size <= 0) {
    return {
      valid: false,
      error: "Uploaded file is empty.",
      category: "MediaValidationError",
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
    };
  }
  if (stat.size > MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `File exceeds maximum allowed size of ${Math.round(MAX_SIZE_BYTES / (1024 * 1024))} MB.`,
      category: "MediaValidationError",
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
    };
  }

  const ext = path.extname(originalFilename || filePath).toLowerCase();
  if (ext && !ALLOWED_MEDIA_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported media format (${ext}).`,
      category: "MediaValidationError",
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
    };
  }

  try {
    const cmd = `ffprobe -v error -show_entries stream=codec_type -show_entries format=duration -of json "${filePath}"`;
    const { stdout } = await execAsync(cmd, { timeout: 15000 });
    const parsed = JSON.parse(stdout || "{}");
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const hasAudio = streams.some((s: { codec_type?: string }) => s.codec_type === "audio");
    const hasVideo = streams.some((s: { codec_type?: string }) => s.codec_type === "video");
    const rawDuration = parseFloat(parsed.format?.duration || "0");
    const durationSeconds = isNaN(rawDuration) ? 0 : rawDuration;

    if (!hasAudio) {
      return {
        valid: false,
        error: "Audio stream was not found in this file.",
        category: "MediaValidationError",
        hasAudio: false,
        hasVideo,
        durationSeconds,
      };
    }
    if (durationSeconds > 0 && durationSeconds < 0.5) {
      return {
        valid: false,
        error: "Recording is too short (minimum 0.5 seconds).",
        category: "MediaValidationError",
        hasAudio,
        hasVideo,
        durationSeconds,
      };
    }

    return {
      valid: true,
      hasAudio,
      hasVideo,
      durationSeconds: Math.max(1, Math.round(durationSeconds)),
    };
  } catch {
    return {
      valid: false,
      error: "File is corrupted or unreadable media container.",
      category: "MediaValidationError",
      hasAudio: false,
      hasVideo: false,
      durationSeconds: 0,
    };
  }
}

async function extractAndNormalizeAudio(inputPath: string, outputPath: string): Promise<number> {
  const cmd = `ffmpeg -y -i "${inputPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}"`;
  await execAsync(cmd, { timeout: 180000 });

  const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
  const { stdout } = await execAsync(probeCmd);
  const dur = parseFloat(stdout.trim());
  return isNaN(dur) || dur <= 0 ? 1 : Math.round(dur);
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
  const splitCmd = `ffmpeg -y -i "${audioPath}" -f segment -segment_time ${chunkDurationSec} -reset_timestamps 1 -vn -acodec libmp3lame -b:a 48k -ar 16000 -ac 1 "${chunkPattern}"`;
  await execAsync(splitCmd, { timeout: 180000 });

  const files = fs
    .readdirSync(outputDir)
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
    .sort();

  const chunks: Array<{ chunkIndex: number; filePath: string; startSec: number; endSec: number }> =
    [];
  for (let i = 0; i < files.length; i++) {
    const chunkFile = path.join(outputDir, files[i]);
    const startSec = i * chunkDurationSec;
    let dur = chunkDurationSec;
    try {
      const probe = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${chunkFile}"`;
      const { stdout } = await execAsync(probe);
      const parsed = parseFloat(stdout.trim());
      if (!isNaN(parsed) && parsed > 0) dur = Math.round(parsed);
    } catch {
      // use default chunk window
    }
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

  try {
    const audioBuffer = fs.readFileSync(audioFilePath);
    const base64Audio = audioBuffer.toString("base64");
    const mimeType = getAudioMimeType(audioFilePath);
    const langHint =
      language && language !== "auto"
        ? `Spoken language hint: ${language}.`
        : "Detect the spoken language automatically (Arabic, English, or mixed) and transcribe faithfully without translating.";

    // Step 1: Dedicated ASR model (Speech -> Verbatim Text) separated from LLM reasoning
    const transcribeResp = await ai.models.generateContent({
      model: "gemini-3.5-transcribe",
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          {
            text: `Transcribe this audio verbatim word for word in its original spoken language. ${langHint} Do NOT invent any speech. If the recording contains only silence or noise with no human speech, return an empty string.`,
          },
        ],
      },
    });

    const verbatimText = (transcribeResp.text || "").trim();
    const isSilentOutput =
      !verbatimText ||
      verbatimText === "[]" ||
      verbatimText.toLowerCase() === "[silence]" ||
      verbatimText === "[صمت]";

    if (isSilentOutput) {
      return { segments: [], silent: true };
    }

    const segments: TranscriptSegment[] = [];
    // Step 2: Optional timestamp & speaker turn segmentation via LLM on verbatim transcript text
    try {
      const segPrompt = `Split the following verbatim ASR transcript into chronological speaker segments totaling ${durationSeconds} seconds starting at ${startOffsetSec}s. Preserve EVERY word without altering or inventing content.
Transcript:
"""
${verbatimText}
"""
Return ONLY a JSON array: [{"speaker":"${isMeeting ? "Speaker 1" : "Lecturer"}","startTime":0,"endTime":10,"text":"exact text slice"}]`;

      const structuredResp = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: segPrompt,
        config: { responseMimeType: "application/json" },
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

    // 2. Extracting / Normalizing 16kHz Mono PCM WAV
    updateJob(jobId, { status: "ExtractingAudio", stage: "AudioExtraction", progressPercent: 22 });
    notifySync({ type: "AudioExtractionStarted", id: jobId, resourceId, progress: 22 });

    let durationSeconds = probe.durationSeconds || 10;
    try {
      durationSeconds = await extractAndNormalizeAudio(filePath, normalizedAudioPath);
    } catch (normErr) {
      throw new Error(
        `Audio extraction failed: ${normErr instanceof Error ? normErr.message : "ffmpeg error"}`,
      );
    }

    assertNotCancelled(jobId);

    // 3. Real Speech-to-Text Pipeline (Python FastAPI -> Gemini -> Local transcribe.py)
    updateJob(jobId, { status: "Transcribing", stage: "Transcribing", progressPercent: 35 });
    notifySync({ type: "TranscriptionStarted", id: jobId, resourceId, progress: 35 });

    let segments: TranscriptSegment[] = [];
    const isMeeting = resourceType === "meeting";
    const activeAudioFile = fs.existsSync(normalizedAudioPath) ? normalizedAudioPath : filePath;
    const activeStat = fs.statSync(activeAudioFile);

    // 3a. Microservice HTTP contract if configured
    if (AI_SERVICE_URL) {
      segments = await transcribeWithPythonAiService(activeAudioFile, resourceType, language);
    }

    let geminiErrorMsg: string | undefined;
    let geminiObservedSilence = false;

    // 3b. Gemini Multimodal ASR (automatically split into compact 120s 48kbps MP3 chunks for long/large recordings)
    if (segments.length === 0) {
      if (
        (activeStat.size > 3.5 * 1024 * 1024 || durationSeconds > 150) &&
        fs.existsSync(normalizedAudioPath)
      ) {
        const chunks = await splitAudioIntoChunks(normalizedAudioPath, jobChunkDir, 120);
        for (let i = 0; i < chunks.length; i++) {
          assertNotCancelled(jobId);
          const ch = chunks[i];
          const chunkPct = 35 + Math.round(((i + 1) / chunks.length) * 30);
          updateJob(jobId, {
            status: "Transcribing",
            stage: `Chunk ${i + 1}/${chunks.length}`,
            progressPercent: chunkPct,
          });
          const outcome = await transcribeAudioWithGemini(
            ch.filePath,
            resourceType,
            ch.startSec,
            Math.max(5, ch.endSec - ch.startSec),
            language,
          );
          if (outcome.errorMessage) {
            geminiErrorMsg = outcome.errorMessage;
            // Fail fast on non-transient configuration/API key errors instead of looping every chunk
            if (
              outcome.errorMessage.includes("API_KEY_INVALID") ||
              outcome.errorMessage.includes("Settings > Secrets") ||
              outcome.errorMessage.includes("not configured")
            ) {
              break;
            }
          }
          if (outcome.silent) geminiObservedSilence = true;
          segments.push(...outcome.segments);
          if (outcome.segments.length > 0) {
            notifySync({
              type: "TranscriptSegmentAvailable",
              id: resourceId,
              jobId,
              progress: chunkPct,
            });
          }
        }
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
        const transcribeCmd = `python3 services/ai_service/transcribe.py "${activeAudioFile}" --language "${language || "auto"}" ${isMeeting ? "--meeting" : ""} --output "${jsonOutputPath}"`;
        await execAsync(transcribeCmd, { maxBuffer: 25 * 1024 * 1024, timeout: 180000 });
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

    // 5. AI Intelligence Extraction
    updateJob(jobId, { status: "Analyzing", stage: "AIAnalysis", progressPercent: 82 });
    notifySync({ type: "AIAnalysisStarted", id: resourceId, jobId, progress: 82 });

    const resourceTitle =
      resourceType === "meeting"
        ? db.get("meetings").find((m) => m.id === resourceId)?.title || originalFilename
        : db.get("lectures").find((l) => l.id === resourceId)?.title || originalFilename;
    const courseCode =
      resourceType === "lecture"
        ? db.get("lectures").find((l) => l.id === resourceId)?.courseCode
        : undefined;

    const analysis = await generateAiSummary(resourceTitle, segments, resourceType, courseCode);
    notifySync({ type: "SummaryReady", id: resourceId, jobId, progress: 86 });

    const keywords = extractKeywordsWithFrequency(segments, 10);
    const highlights = extractHighlightsFromSegments(segments);
    notifySync({ type: "KeywordsReady", id: resourceId, jobId, progress: 88 });

    let deepAnalysis = undefined;
    try {
      deepAnalysis = await generateAiLectureAnalysis(
        resourceTitle,
        segments,
        resourceType,
        courseCode,
      );
    } catch {
      // non-blocking enrichment
    }

    // 6. Quiz / Flashcards / Mindmap Generation
    let generatedQuiz = undefined;
    if (resourceType === "lecture") {
      updateJob(jobId, { status: "Generating Quiz", stage: "QuizGeneration", progressPercent: 92 });
      try {
        generatedQuiz = await generateAiQuiz(resourceTitle, segments, analysis.summary, courseCode);
        notifySync({ type: "QuizReady", id: resourceId, jobId, progress: 94 });
      } catch {
        // non-blocking
      }
    }

    assertNotCancelled(jobId);

    // 7. Persist Real Extracted Data
    const now = new Date().toISOString();
    if (resourceType === "meeting") {
      const targetMeeting = db.get("meetings").find((m) => m.id === resourceId);
      db.update("meetings", (meetings) =>
        meetings.map((m) => {
          if (m.id === resourceId) {
            return {
              ...m,
              status: "Completed",
              language,
              durationSeconds,
              summary: analysis.summary,
              executiveSummary: analysis.summary,
              detailedSummary: analysis.summary,
              keyPoints: analysis.keyPoints,
              decisions: analysis.decisions,
              topics: deepAnalysis?.topics || keywords.slice(0, 4).map((k) => k.term),
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
          }
          return m;
        }),
      );

      if (analysis.actionItems.length > 0) {
        db.update("actionItems", (items) => [
          ...items.filter((i) => i.meetingId !== resourceId),
          ...analysis.actionItems.map((aiItem, idx) => ({
            id: `task_${jobId}_${idx + 1}`,
            userId: targetMeeting?.hostId || "usr_admin",
            meetingId: resourceId,
            title: aiItem.title,
            ownerName: aiItem.ownerName,
            deadlineText: aiItem.dueDate || "Deadline not specified.",
            dueDate: aiItem.dueDate === "Deadline not specified." ? undefined : aiItem.dueDate,
            priority: aiItem.priority,
            completed: false,
            createdAt: now,
          })),
        ]);
        notifySync({ type: "TasksReady", id: resourceId, jobId, progress: 95 });
      }
    } else {
      const targetLecture = db.get("lectures").find((l) => l.id === resourceId);
      db.update("lectures", (lectures) =>
        lectures.map((l) => {
          if (l.id === resourceId) {
            return {
              ...l,
              status: "Completed",
              language,
              durationSeconds,
              studyNotes: analysis.summary,
              summary: analysis.summary,
              executiveSummary: analysis.summary,
              detailedSummary: analysis.summary,
              keyConcepts: deepAnalysis?.definitions?.length
                ? deepAnalysis.definitions.map((d) => ({ term: d.term, definition: d.definition }))
                : [],
              examHighlights: deepAnalysis?.emphasizedPoints?.length
                ? deepAnalysis.emphasizedPoints
                : analysis.keyPoints,
              topics: deepAnalysis?.topics || keywords.slice(0, 4).map((k) => k.term),
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
          }
          return l;
        }),
      );

      if (generatedQuiz) {
        db.update("quizzes", (quizzes) => [
          {
            id: `quiz_${jobId}`,
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

      if (analysis.actionItems.length > 0) {
        db.update("actionItems", (items) => [
          ...items.filter((i) => i.lectureId !== resourceId),
          ...analysis.actionItems.map((aiItem, idx) => ({
            id: `task_${jobId}_${idx + 1}`,
            userId: targetLecture?.instructorId || "usr_admin",
            lectureId: resourceId,
            title: aiItem.title,
            ownerName: aiItem.ownerName,
            deadlineText: aiItem.dueDate || "Deadline not specified.",
            dueDate: aiItem.dueDate === "Deadline not specified." ? undefined : aiItem.dueDate,
            priority: aiItem.priority,
            completed: false,
            createdAt: now,
          })),
        ]);
      }

      try {
        const generatedCards = await generateAiFlashcards(
          resourceTitle,
          segments,
          analysis.summary,
          courseCode,
        );
        if (generatedCards && generatedCards.length > 0) {
          db.update("flashcards", (cards) => [
            ...generatedCards.map((c, idx) => ({
              id: `fc_${jobId}_${idx + 1}`,
              deckId: `deck_${resourceId}`,
              deckTitle:
                resourceTitle.length > 35 ? resourceTitle.slice(0, 35) + "..." : resourceTitle,
              lectureId: resourceId,
              front: c.front,
              back: c.back,
              mastered: false,
              reviewCount: 0,
              createdAt: now,
            })),
            ...cards.filter((c) => c.lectureId !== resourceId),
          ]);
          notifySync({ type: "FlashcardsReady", id: resourceId, jobId, progress: 97 });
        }

        const generatedMindMap = await generateAiMindMap(
          resourceTitle,
          segments,
          analysis.summary,
          courseCode,
        );
        if (generatedMindMap) {
          db.update("mindMaps", (maps) => [
            {
              id: `mm_${jobId}`,
              title: resourceTitle,
              lectureId: resourceId,
              rootNode: generatedMindMap,
              createdAt: now,
            },
            ...maps.filter((m) => m.lectureId !== resourceId),
          ]);
        }
      } catch {
        // non-blocking
      }
    }

    // 8. Completed
    updateJob(jobId, { status: "Completed", stage: "Completed", progressPercent: 100 });
    db.update("notifications", (notifs) => [
      {
        id: `notif_${Date.now()}`,
        userId: db.get("jobs").find((j) => j.id === jobId)?.userId || "usr_admin",
        title:
          resourceType === "meeting" ? "Meeting analysis completed" : "Lecture analysis completed",
        body: `Processed "${resourceTitle}" (${segments.length} transcript segments).`,
        targetUrl: `/transcript?id=${resourceId}`,
        read: false,
        type: "summary",
        createdAt: now,
      },
      ...notifs,
    ]);

    notifySync({ type: "ProcessingCompleted", id: resourceId, jobId, progress: 100 });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Unknown processing error";
    const { category, transient } = classifyFailureCategory(errMessage);
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
