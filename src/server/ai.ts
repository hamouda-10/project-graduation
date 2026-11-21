import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ThinkingLevel } from "@google/genai";
import { db, TranscriptSegment, MindMapNode } from "./db";
import { extractGeminiTranscriptText, getGeminiClient } from "./gemini";

const execFileAsync = promisify(execFile);
const TEXT_MODEL = "gemini-4-hydrogen";
const ASR_MODEL = "gemini-3.5-transcribe";

export interface AIAnalysisResult {
  summary: string;
  executiveSummary?: string;
  detailedSummary?: string;
  keyPoints: string[];
  decisions: string[];
  topics: string[];
  actionItems: {
    title: string;
    ownerName?: string;
    dueDate?: string;
    sourceTimestamp?: string;
    priority: "high" | "medium" | "low";
  }[];
  lectureNotes?: string;
  keyConcepts?: { term: string; definition: string }[];
  examHighlights?: string[];
  quiz?: {
    title: string;
    questions: {
      question: string;
      options: string[];
      correctOptionIndex: number;
      explanation: string;
    }[];
  };
  flashcards?: {
    front: string;
    back: string;
  }[];
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL?.replace(/\/$/, "");

function normalizeArabicAndLatin(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // strip Arabic diacritics
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\u0600-\u06FFa-z0-9._\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMmSs(sec: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function extractKeywordsWithFrequency(
  segments: TranscriptSegment[],
  limit = 12,
): Array<{
  term: string;
  frequency: number;
  importance: number;
  segmentIds: string[];
  context: string;
  timestamp: string;
}> {
  const stopWords = new Set([
    "في",
    "من",
    "على",
    "الي",
    "إلى",
    "عن",
    "مع",
    "هذا",
    "هذه",
    "ذلك",
    "تلك",
    "تم",
    "كان",
    "كانت",
    "يكون",
    "تكون",
    "كل",
    "هو",
    "هي",
    "نحن",
    "احنا",
    "انت",
    "ان",
    "أن",
    "إن",
    "هل",
    "ما",
    "التي",
    "الذي",
    "اللي",
    "بين",
    "عند",
    "بعد",
    "قبل",
    "عشان",
    "علشان",
    "يعني",
    "جدا",
    "جداً",
    "كده",
    "ده",
    "دي",
    "النهارده",
    "النهاردة",
    "اليوم",
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "are",
    "was",
    "were",
    "have",
    "has",
    "will",
    "about",
    "into",
    "your",
    "they",
    "their",
    "what",
    "when",
    "then",
    "than",
    "also",
    "just",
    "very",
    "some",
    "more",
    "been",
    "being",
    "here",
    "there",
  ]);
  const counts = new Map<
    string,
    { display: string; freq: number; segIds: Set<string>; context: string; timestamp: string }
  >();
  for (const seg of segments) {
    const tokens = (seg.text || "").split(/\s+/);
    const ts = formatMmSs(seg.startTime || 0);
    for (const raw of tokens) {
      const clean = raw.replace(/^[^ء-يa-zA-Z0-9.#+-]+|[^ء-يa-zA-Z0-9.#+-]+$/g, "");
      const norm = normalizeArabicAndLatin(clean);
      const isShortTech = /^(ai|ml|ui|ux|db|os|ip|ci|cd|c#|js|ts|\.net|api|sql|jwt|sse|rag)$/i.test(
        clean,
      );
      if ((clean.length >= 3 || isShortTech) && norm && !stopWords.has(norm)) {
        const entry = counts.get(norm) || {
          display: clean,
          freq: 0,
          segIds: new Set<string>(),
          context: seg.text.length > 140 ? `${seg.text.slice(0, 140)}...` : seg.text,
          timestamp: ts,
        };
        entry.freq += 1;
        entry.segIds.add(seg.id);
        counts.set(norm, entry);
      }
    }
  }
  const sorted = Array.from(counts.values())
    .sort((a, b) => b.freq - a.freq)
    .slice(0, limit);
  const maxFreq = Math.max(1, sorted[0]?.freq || 1);
  return sorted.map((info) => ({
    term: info.display,
    frequency: info.freq,
    importance: Math.round((info.freq / maxFreq) * 100) / 100,
    segmentIds: Array.from(info.segIds),
    context: info.context,
    timestamp: info.timestamp,
  }));
}

export function extractHighlightsFromSegments(segments: TranscriptSegment[]): Array<{
  quote: string;
  context?: string;
  speaker?: string;
  timestamp: string;
  category: string;
  priority: string;
}> {
  const cues: Array<{ regex: RegExp; category: string; priority: string }> = [
    {
      regex:
        /(important|critical|exam|remember|key takeaway|focus here|مهم|مهمة|دي مهمة|ركزوا|ركز هنا|امتحان|ممكن تيجي|الخلاصة|انتبه|أساسي|تذكر|نقطة جوهرية)/i,
      category: "ExamTip",
      priority: "high",
    },
    {
      regex: /(decide|decision|agreed|approved|finalized|قرر|قررنا|اتفق|اتفقنا|اعتماد|تم الاتفاق)/i,
      category: "Decision",
      priority: "high",
    },
    {
      regex: /(warning|risk|danger|careful|blocker|issue|تحذير|خطر|مشكلة|عائق|انتباه)/i,
      category: "Warning",
      priority: "high",
    },
    {
      regex: /(defined as|means|definition|refers to|يعني|تعريف|المقصود|عبارة عن)/i,
      category: "Definition",
      priority: "medium",
    },
    {
      regex:
        /(action item|todo|deadline|deliver|submit|responsible|assign|مهمة|تسليم|مطلوب|مسؤول|لازم نخلص|موعد)/i,
      category: "ActionItem",
      priority: "high",
    },
  ];
  const results: Array<{
    quote: string;
    context?: string;
    speaker?: string;
    timestamp: string;
    category: string;
    priority: string;
  }> = [];

  for (const seg of segments) {
    const ts = formatMmSs(seg.startTime || 0);
    for (const cue of cues) {
      if (cue.regex.test(seg.text || "")) {
        results.push({
          quote: seg.text,
          context: `Spoken by ${seg.speaker} at [${ts}]`,
          speaker: seg.speaker,
          timestamp: ts,
          category: cue.category,
          priority: cue.priority,
        });
        break;
      }
    }
    if (results.length >= 10) break;
  }
  return results;
}

function detectTranscriptLanguage(
  title: string,
  segments: TranscriptSegment[],
): "ar" | "en" | "mixed" {
  const combined = `${title} ${segments.map((s) => s.text || "").join(" ")}`;
  const arabicChars = (combined.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (combined.match(/[a-zA-Z]/g) || []).length;
  if (arabicChars > 10 && latinChars > 20 && latinChars > arabicChars * 0.4) return "mixed";
  if (arabicChars > 0 && arabicChars >= latinChars * 0.25) return "ar";
  return latinChars > 0 ? "en" : "ar";
}

function chunkTranscriptSegments(
  segments: TranscriptSegment[],
  maxCharsPerChunk = 22000,
  overlapSegments = 2,
): string[] {
  const formatSeg = (s: TranscriptSegment) =>
    `[${Math.floor(s.startTime / 60)}:${Math.floor(s.startTime % 60)
      .toString()
      .padStart(2, "0")}] ${s.speaker}: ${s.text}`;

  const chunks: string[] = [];
  let i = 0;
  while (i < segments.length) {
    let current = "";
    const startIdx = i;
    while (i < segments.length) {
      const line = formatSeg(segments[i]) + "\n";
      if (current.length > 0 && current.length + line.length > maxCharsPerChunk) {
        break;
      }
      current += line;
      i++;
    }
    if (current.trim()) chunks.push(current.trim());
    if (i < segments.length && i > startIdx + overlapSegments) {
      i -= overlapSegments;
    }
  }
  return chunks;
}

async function prepareTranscriptForLlm(
  ai: ReturnType<typeof getGeminiClient>,
  title: string,
  segments: TranscriptSegment[],
  maxDirectChars = 24000,
): Promise<string> {
  const fullText = segments
    .map(
      (s) =>
        `[${Math.floor(s.startTime / 60)}:${Math.floor(s.startTime % 60)
          .toString()
          .padStart(2, "0")}] ${s.speaker}: ${s.text}`,
    )
    .join("\n");

  if (fullText.length <= maxDirectChars || !ai) {
    return fullText.slice(0, maxDirectChars);
  }

  // Long recording: hierarchically synthesize each overlapping chunk before global analysis
  const chunks = chunkTranscriptSegments(segments, 20000, 2);
  const chunkSummaries: string[] = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    try {
      const resp = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: `Extract all key facts, definitions, technical terms, decisions, tasks, speakers, and timestamps from part ${idx + 1}/${chunks.length} of "${title}". Be faithful to the transcript and omit nothing important:\n\n${chunks[idx]}`,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      });
      const text = (resp.text || "").trim();
      if (text) {
        chunkSummaries.push(`--- Section ${idx + 1}/${chunks.length} ---\n${text}`);
      }
    } catch {
      chunkSummaries.push(chunks[idx].slice(0, Math.floor(maxDirectChars / chunks.length)));
    }
  }
  return chunkSummaries.join("\n\n").slice(0, maxDirectChars);
}

/**
 * Normalizes non-WAV live audio chunks (e.g. browser WebM/Opus, OGG, MP4/M4A)
 * into clean 16kHz mono PCM WAV via ffmpeg when available so Gemini ASR receives
 * an unambiguous, container-valid audio clip.
 */
async function normalizeLiveAudioChunkToWav(
  audioBytes: Buffer,
  mimeType: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const safeMime = (mimeType || "audio/webm").split(";")[0].trim().toLowerCase();
  // Already clean WAV or MP3 — pass straight through with zero overhead
  if (
    (safeMime === "audio/wav" || safeMime === "audio/x-wav" || safeMime === "audio/wave") &&
    audioBytes.length > 44 &&
    audioBytes.subarray(0, 4).toString("ascii") === "RIFF"
  ) {
    return { bytes: audioBytes, mimeType: "audio/wav" };
  }
  if (safeMime === "audio/mp3" || safeMime === "audio/mpeg") {
    return { bytes: audioBytes, mimeType: "audio/mp3" };
  }

  const ext = safeMime.includes("ogg")
    ? ".ogg"
    : safeMime.includes("mp4") || safeMime.includes("m4a") || safeMime.includes("aac")
      ? ".m4a"
      : safeMime.includes("flac")
        ? ".flac"
        : ".webm";

  const id = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const inPath = path.join(os.tmpdir(), `mm_live_in_${id}${ext}`);
  const outPath = path.join(os.tmpdir(), `mm_live_out_${id}.wav`);

  try {
    fs.writeFileSync(inPath, audioBytes);
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
        "-i",
        inPath,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        outPath,
      ],
      { timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
    );

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
      return { bytes: fs.readFileSync(outPath), mimeType: "audio/wav" };
    }
  } catch {
    // If ffmpeg is unavailable or chunk is already raw-readable by Gemini, pass original bytes
  } finally {
    try {
      if (fs.existsSync(inPath)) fs.unlinkSync(inPath);
    } catch {
      /* ignore */
    }
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {
      /* ignore */
    }
  }

  return { bytes: audioBytes, mimeType: safeMime || "audio/webm" };
}

function detectLanguageLabelFromText(text: string, hint: string): string {
  const ar = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const en = (text.match(/[a-zA-Z]/g) || []).length;
  if (ar > 4 && en > 4) return "Mixed (AR/EN)";
  if (ar > 0) return hint === "ar-SA" ? "العربية الفصحى" : "العربية (Arabic)";
  if (en > 0) return "English";
  return hint === "auto" ? "Auto-Detect" : hint;
}

export async function transcribeAndTranslateAudioChunk(params: {
  audioBase64?: string;
  mimeType?: string;
  interimText?: string;
  recentContext?: string;
  language?: string;
  offsetSeconds?: number;
  isMeeting?: boolean;
}): Promise<{
  arabicText: string;
  text: string;
  detectedLanguage: string;
  isSilence?: boolean;
  error?: string;
  retryable?: boolean;
}> {
  const {
    audioBase64,
    mimeType = "audio/webm",
    recentContext,
    language = "auto",
    offsetSeconds = 0,
    isMeeting = false,
  } = params;

  const rawAudioBytes =
    audioBase64 && audioBase64.length > 64 ? Buffer.from(audioBase64, "base64") : null;

  // 1. Prefer Python FastAPI whisper/audio service when configured and audio bytes exist
  if (AI_SERVICE_URL && rawAudioBytes && rawAudioBytes.length > 100) {
    try {
      const safeMime = mimeType.split(";")[0].trim() || "audio/webm";
      const ext = safeMime.includes("wav")
        ? ".wav"
        : safeMime.includes("mp4") || safeMime.includes("m4a")
          ? ".m4a"
          : safeMime.includes("ogg")
            ? ".ogg"
            : ".webm";
      const form = new FormData();
      form.append("file", new Blob([rawAudioBytes], { type: safeMime }), `live_chunk${ext}`);
      form.append("language", language || "auto");
      form.append("is_meeting", isMeeting ? "true" : "false");
      form.append("offset_seconds", String(offsetSeconds || 0));
      form.append("is_partial", "true");

      const resp = await fetch(`${AI_SERVICE_URL}/api/v1/transcribe-chunk`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(25000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          detected_language?: string;
          full_text?: string;
          segments?: Array<{ text?: string }>;
        };
        const segmentText = (data.segments || [])
          .map((s) => (s.text || "").trim())
          .filter(Boolean)
          .join(" ")
          .trim();
        const finalTxt = segmentText || (data.full_text || "").trim();
        if (finalTxt) {
          return {
            arabicText: finalTxt,
            text: finalTxt,
            detectedLanguage:
              data.detected_language || detectLanguageLabelFromText(finalTxt, language),
          };
        }
      }
    } catch {
      // Fall through cleanly to Gemini real ASR
    }
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      arabicText: "",
      text: "",
      detectedLanguage: language || "auto",
      error: "GEMINI_API_KEY is not configured for real-time speech transcription.",
      retryable: false,
    };
  }

  if (!rawAudioBytes || rawAudioBytes.length < 100) {
    return {
      arabicText: "",
      text: "",
      detectedLanguage: language || "auto",
      isSilence: true,
    };
  }

  try {
    const normalized = await normalizeLiveAudioChunkToWav(rawAudioBytes, mimeType);
    const normalizedBase64 = normalized.bytes.toString("base64");

    const langInstruction =
      language === "ar-forced"
        ? "Transcribe in Modern Standard Arabic while preserving exact English technical terms (API, Backend, .NET, React, Python, FastAPI, SignalR, SQL Server)."
        : language.startsWith("en")
          ? "Transcribe faithfully verbatim in English without translating to another language."
          : language === "ar-EG"
            ? "Transcribe faithfully verbatim in Arabic (Egyptian Arabic or MSA as spoken) and preserve any embedded English technical terms (API, Backend, .NET, React, Python, FastAPI, SignalR, SQL Server) exactly in English."
            : "Auto-detect the spoken language (Arabic dialects including Egyptian/MSA/Gulf/Levantine, English, or mixed Arabic+English) and transcribe faithfully verbatim. Preserve embedded English technical terms without translating them.";

    const contextHint = recentContext
      ? `Previous spoken context (do NOT repeat this context, transcribe ONLY new speech in this clip): "${recentContext.slice(-220)}"`
      : "Start of live recording session.";

    const promptText = `Transcribe this real live microphone audio clip verbatim.
${langInstruction}
${contextHint}
Strict rules:
1. Return ONLY the exact words spoken in THIS audio clip with proper punctuation. No speaker labels, no timestamps, no explanations.
2. NEVER invent, guess, or hallucinate words.
3. If this audio clip contains only silence, breathing, or background noise with no intelligible human speech, reply with exact token: [SILENCE]`;

    const audioPart = {
      inlineData: {
        mimeType: normalized.mimeType,
        data: normalizedBase64,
      },
    };

    let rawOutput = "";
    let primaryErr: unknown = null;
    try {
      const response = await ai.models.generateContent({
        model: ASR_MODEL,
        contents: {
          parts: [audioPart, { text: promptText }],
        },
      });
      rawOutput = extractGeminiTranscriptText(response);
    } catch (err) {
      primaryErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED|403|401/i.test(msg)) {
        throw err;
      }
    }

    if (!rawOutput && primaryErr) {
      // Secondary real multimodal pass only if dedicated ASR threw a transient/model error
      const fallbackResp = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: {
          parts: [audioPart, { text: promptText }],
        },
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
      });
      rawOutput = extractGeminiTranscriptText(fallbackResp);
    }

    const trimmed = (rawOutput || "").trim();
    const isSilenceToken =
      !trimmed ||
      trimmed === "[صمت]" ||
      trimmed === "[]" ||
      trimmed.toLowerCase() === "[silence]" ||
      trimmed.toLowerCase() === "silence";

    if (isSilenceToken) {
      return {
        arabicText: "",
        text: "",
        detectedLanguage: language === "auto" ? "Auto-Detect" : language,
        isSilence: true,
      };
    }

    const cleaned = trimmed
      .replace(/^```(?:text|txt)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .replace(/^(English|Translation|Speaker|Arabic|Transcript):\s*/i, "")
      .trim();

    if (!cleaned || cleaned.toLowerCase().includes("[silence]") || cleaned === "[صمت]") {
      return {
        arabicText: "",
        text: "",
        detectedLanguage: language === "auto" ? "Auto-Detect" : language,
        isSilence: true,
      };
    }

    return {
      arabicText: cleaned,
      text: cleaned,
      detectedLanguage: detectLanguageLabelFromText(cleaned, language),
      isSilence: false,
    };
  } catch (geminiError) {
    const msg = geminiError instanceof Error ? geminiError.message : String(geminiError);
    console.warn("Gemini live transcription error:", msg);
    const isAuthOrConfig = /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|403|401/i.test(msg);
    const isBillingDepleted =
      /402|prepayment credits|credits are depleted|billing|PAYMENT_REQUIRED/i.test(msg);
    return {
      arabicText: "",
      text: "",
      detectedLanguage: language || "auto",
      error: isBillingDepleted
        ? "رصيد واجهة Gemini API منتهٍ في المشروع الحالي (HTTP 402). يرجى شحن الرصيد في AI Studio ثم إعادة المحاولة."
        : isAuthOrConfig
          ? "مفتاح Gemini API غير صالح أو غير مصرح به. يرجى التحقق من GEMINI_API_KEY في الإعدادات."
          : `تعذر التفريغ الصوتي مؤقتاً: ${msg.slice(0, 180)}`,
      retryable: !isAuthOrConfig && !isBillingDepleted,
    };
  }
}

// Generate Structured Summary + Decisions + Action Items strictly grounded in the transcript
export async function generateAiSummary(
  title: string,
  segments: TranscriptSegment[],
  type: "meeting" | "lecture" = "lecture",
  courseCode?: string,
): Promise<{
  summary: string;
  executiveSummary?: string;
  detailedSummary?: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: Array<{
    title: string;
    ownerName?: string;
    dueDate?: string;
    sourceTimestamp?: string;
    priority: "high" | "medium" | "low";
  }>;
}> {
  if (!segments || segments.length === 0) {
    return {
      summary: "لا يوجد نص مفرغ كافٍ لإنشاء التلخيص بعد. يرجى تسجيل الجلسة أولاً.",
      keyPoints: [],
      decisions: [],
      actionItems: [],
    };
  }

  const detectedLang = detectTranscriptLanguage(title, segments);
  const ai = getGeminiClient();
  if (ai) {
    try {
      const preparedTranscript = await prepareTranscriptForLlm(ai, title, segments, 24000);
      const isEnglish = detectedLang === "en";
      const prompt = isEnglish
        ? `You are the MeetMind AI ${type === "lecture" ? "Academic Study" : "Meeting Intelligence"} analyst.
Analyze "${title}" ${courseCode ? `(Course: ${courseCode})` : ""} strictly based ONLY on the transcript below.
STRICT GROUNDING RULES:
1. NEVER invent names, numbers, dates, tasks, decisions, or facts not explicitly stated in the transcript.
2. For actionItems, if no responsible person is explicitly named in the transcript, set "ownerName" to "Not specified". If no deadline is stated, set "dueDate" to "Not specified".
3. Preserve all English technical terms verbatim.

Transcript:
"""
${preparedTranscript}
"""

Return ONLY a valid JSON object matching this exact schema:
{
  "executiveSummary": "Concise 2-4 sentence executive overview grounded strictly in the transcript",
  "detailedSummary": "Well-structured Markdown summary with headings (# Executive Summary, ## Key Points, ## Detailed Topics, ## Definitions & Terms, ## Decisions & Action Items, ## Highlighted Takeaways)",
  "keyPoints": ["Grounded key point 1", "Grounded key point 2"],
  "decisions": ["Explicit decision stated in transcript (empty array if none)"],
  "actionItems": [
    {
      "title": "Exact task or commitment from transcript",
      "ownerName": "Named person or Not specified",
      "dueDate": "Stated deadline or Not specified",
      "sourceTimestamp": "MM:SS",
      "priority": "high"
    }
  ]
}`
        : `أنت المحلل الذكي المتخصص في منصة MeetMind AI.
حلل ولخّص جلسة "${title}" ${courseCode ? `(مقرر: ${courseCode})` : ""} بناءً حصراً على النص المفرغ الفعلي التالي.
القواعد الصارمة لمنع الاختلاق:
1. لا تختلق أو تخمّن أي أسماء أو أرقام أو قرارات أو مهام أو حقائق لم تُذكر صراحة في النص المفرغ.
2. في قائمة المهام (actionItems): إذا لم يُذكر اسم المسؤول صراحة اكتب "Not specified"، وإذا لم يُذكر موعد تسليم اكتب "Not specified".
3. حافظ على المصطلحات التقنية الإنجليزية (مثل API و .NET و React و Python و FastAPI و SignalR و SQL Server) كما وردت بالضبط.

النص المفرغ:
"""
${preparedTranscript}
"""

أرجع كائن JSON صالحاً فقط بهذا الهيكل الدقيق:
{
  "executiveSummary": "ملخص تنفيذي مكثف من 2 إلى 4 جمل مستند حصراً للنص المفرغ",
  "detailedSummary": "ملخص منسق بصيغة Markdown يحتوي على العناوين: # الفكرة العامة، ## أهم النقاط، ## شرح مختصر للموضوعات، ## التعريفات والمصطلحات المهمة، ## القرارات والمهام إن وجدت، ## النقاط التي أكد المتحدث على أهميتها",
  "keyPoints": ["أهم نقطة مستخلصة من النص 1", "نقطة 2"],
  "decisions": ["قرار صريح تم الاتفاق عليه في النص (أو مصفوفة فارغة إن لم يوجد)"],
  "actionItems": [
    {
      "title": "المهمة أو المطلوب تنفيذه كما ورد في النص",
      "ownerName": "اسم الشخص المذكور أو Not specified",
      "dueDate": "الموعد المذكور أو Not specified",
      "sourceTimestamp": "MM:SS",
      "priority": "high"
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = (response.text || "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      if (rawText) {
        const parsed = JSON.parse(rawText) as {
          executiveSummary?: string;
          detailedSummary?: string;
          keyPoints?: unknown[];
          decisions?: unknown[];
          actionItems?: Array<{
            title?: string;
            ownerName?: string;
            dueDate?: string;
            sourceTimestamp?: string;
            priority?: string;
          }>;
        };

        const detailed = String(parsed.detailedSummary || parsed.executiveSummary || "").trim();
        const executive = String(parsed.executiveSummary || detailed).trim();
        const keyPoints = Array.isArray(parsed.keyPoints)
          ? parsed.keyPoints.map((x) => String(x || "").trim()).filter(Boolean)
          : [];
        const decisions = Array.isArray(parsed.decisions)
          ? parsed.decisions.map((x) => String(x || "").trim()).filter(Boolean)
          : [];
        const actionItems = Array.isArray(parsed.actionItems)
          ? parsed.actionItems
              .filter((a) => a && typeof a.title === "string" && a.title.trim())
              .map((a) => ({
                title: a.title!.trim(),
                ownerName:
                  a.ownerName && String(a.ownerName).trim() && String(a.ownerName).trim() !== "null"
                    ? String(a.ownerName).trim()
                    : "Not specified",
                dueDate:
                  a.dueDate && String(a.dueDate).trim() && String(a.dueDate).trim() !== "null"
                    ? String(a.dueDate).trim()
                    : "Not specified",
                sourceTimestamp: a.sourceTimestamp ? String(a.sourceTimestamp).trim() : undefined,
                priority: (["high", "medium", "low"].includes(
                  String(a.priority || "").toLowerCase(),
                )
                  ? String(a.priority).toLowerCase()
                  : "medium") as "high" | "medium" | "low",
              }))
          : [];

        if (detailed) {
          return {
            summary: detailed,
            executiveSummary: executive,
            detailedSummary: detailed,
            keyPoints:
              keyPoints.length > 0
                ? keyPoints.slice(0, 8)
                : segments.slice(0, 4).map((s) => s.text),
            decisions,
            actionItems,
          };
        }
      }
    } catch (err) {
      console.warn("Gemini summary error, falling back to grounded extractor:", err);
    }
  }

  // Grounded Extractive Fallback (Strictly derived from actual transcript segments — no generic invented filler)
  const keywords = extractKeywordsWithFrequency(segments, 6).map((k) => k.term);
  const bulletLines = segments
    .slice(0, 5)
    .map((s) => `- [${formatMmSs(s.startTime)}] ${s.speaker}: ${s.text}`);
  const highlights = extractHighlightsFromSegments(segments);
  const extractedTasks: Array<{
    title: string;
    ownerName?: string;
    dueDate?: string;
    sourceTimestamp?: string;
    priority: "high" | "medium" | "low";
  }> = [];

  for (const s of segments) {
    if (
      /(action item|todo|must |need to|deadline|assign|deliver|submit|يجب|سوف|لازم|تكليف|مهمة|تسليم|تنفيذ)/i.test(
        s.text,
      )
    ) {
      extractedTasks.push({
        title: s.text.length > 120 ? `${s.text.slice(0, 120)}...` : s.text,
        ownerName: "Not specified",
        dueDate: "Not specified",
        sourceTimestamp: formatMmSs(s.startTime),
        priority: /(urgent|high|critical|فوري|عاجل|مهم)/i.test(s.text) ? "high" : "medium",
      });
      if (extractedTasks.length >= 5) break;
    }
  }

  const summary =
    `# ${title}${courseCode ? ` (${courseCode})` : ""}\n` +
    `${segments[0]?.text || ""}\n\n` +
    `## Key Segments\n` +
    bulletLines.join("\n") +
    (keywords.length > 0 ? `\n\n## Extracted Keywords\n- ${keywords.join("، ")}` : "") +
    (highlights.length > 0
      ? `\n\n## Highlights\n${highlights.map((h) => `- [${h.timestamp}] ${h.quote}`).join("\n")}`
      : "");

  return {
    summary,
    executiveSummary: segments[0]?.text || summary,
    detailedSummary: summary,
    keyPoints: segments.slice(0, 4).map((s) => s.text),
    decisions: highlights.filter((h) => h.category === "Decision").map((h) => h.quote),
    actionItems: extractedTasks,
  };
}

/**
 * Verifies that a generated quiz question is genuinely grounded in the actual
 * transcript text. Rejects hallucinated questions whose evidence/answer terms
 * do not appear in the canonical transcript.
 */
export function verifyQuizQuestionGrounding(
  question: {
    question: string;
    type?: string;
    options?: string[];
    correctOptionIndex?: number;
    correctAnswerText?: string;
    explanation?: string;
    sourceTranscriptSegment?: string;
  },
  segments: TranscriptSegment[],
): { grounded: boolean; matchedSegmentText?: string; matchedTimestamp?: string } {
  if (!segments || segments.length === 0) return { grounded: false };

  const normalizedSegments = segments.map((s) => ({
    raw: s,
    norm: normalizeArabicAndLatin(s.text),
    tokens: new Set(
      normalizeArabicAndLatin(s.text)
        .split(" ")
        .filter((t) => t.length >= 2),
    ),
  }));
  const fullNormTranscript = normalizedSegments.map((s) => s.norm).join(" ");
  const fullTokenSet = new Set<string>();
  for (const s of normalizedSegments) {
    for (const t of s.tokens) fullTokenSet.add(t);
  }

  // 1. Check direct evidence quote (`sourceTranscriptSegment`) if provided
  if (question.sourceTranscriptSegment && question.sourceTranscriptSegment.trim().length >= 6) {
    const quoteNorm = normalizeArabicAndLatin(question.sourceTranscriptSegment);
    if (
      quoteNorm &&
      fullNormTranscript.includes(quoteNorm.slice(0, Math.min(28, quoteNorm.length)))
    ) {
      const hit = normalizedSegments.find(
        (s) => s.norm.includes(quoteNorm.slice(0, 20)) || quoteNorm.includes(s.norm.slice(0, 20)),
      );
      return {
        grounded: true,
        matchedSegmentText: hit?.raw.text || question.sourceTranscriptSegment,
        matchedTimestamp: hit ? formatMmSs(hit.raw.startTime) : undefined,
      };
    }

    const quoteTokens = quoteNorm.split(" ").filter((t) => t.length >= 3);
    if (quoteTokens.length >= 2) {
      const matched = quoteTokens.filter((t) => fullTokenSet.has(t));
      if (matched.length / quoteTokens.length >= 0.45) {
        const bestSeg = normalizedSegments
          .map((s) => ({
            s,
            score: quoteTokens.filter((t) => s.tokens.has(t)).length,
          }))
          .sort((a, b) => b.score - a.score)[0];
        return {
          grounded: true,
          matchedSegmentText: bestSeg?.s.raw.text || question.sourceTranscriptSegment,
          matchedTimestamp: bestSeg ? formatMmSs(bestSeg.s.raw.startTime) : undefined,
        };
      }
    }
  }

  // 2. Fallback verification: verify factual tokens in answer + question + explanation against transcript
  const selectedOption =
    Array.isArray(question.options) &&
    typeof question.correctOptionIndex === "number" &&
    question.options[question.correctOptionIndex]
      ? question.options[question.correctOptionIndex]
      : "";
  const probeText = `${question.correctAnswerText || ""} ${selectedOption} ${question.question || ""} ${question.explanation || ""}`;
  const probeTokens = normalizeArabicAndLatin(probeText)
    .split(" ")
    .filter((t) => t.length >= 3);

  if (probeTokens.length === 0) return { grounded: false };

  let bestSeg = normalizedSegments[0];
  let bestScore = 0;
  let totalMatched = 0;
  const uniqueProbe = Array.from(new Set(probeTokens));
  for (const t of uniqueProbe) {
    if (fullTokenSet.has(t)) totalMatched++;
  }
  for (const seg of normalizedSegments) {
    const score = uniqueProbe.filter((t) => seg.tokens.has(t)).length;
    if (score > bestScore) {
      bestScore = score;
      bestSeg = seg;
    }
  }

  const grounded =
    bestScore >= 2 || (totalMatched >= 2 && totalMatched / uniqueProbe.length >= 0.2);
  return {
    grounded,
    matchedSegmentText: grounded ? bestSeg?.raw.text : undefined,
    matchedTimestamp: grounded && bestSeg ? formatMmSs(bestSeg.raw.startTime) : undefined,
  };
}

// Generate Quiz directly grounded in the transcript and summary (with automated grounding validation)
export async function generateAiQuiz(
  title: string,
  segments: TranscriptSegment[],
  summaryText?: string,
  courseCode?: string,
  options?: {
    avoidQuestionTitles?: string[];
    variant?: number;
    difficulty?: "all" | "easy" | "medium" | "hard";
  },
): Promise<{
  title: string;
  courseCode?: string;
  questions: Array<{
    id: string;
    question: string;
    type: "multiple_choice" | "true_false" | "short_answer" | "fill_in_the_blank";
    options: string[];
    correctOptionIndex: number;
    correctAnswerText?: string;
    acceptableAnswers?: string[];
    explanation: string;
    difficulty: "easy" | "medium" | "hard";
    sectionRef: string;
    timestampRef?: string;
    sourceReference?: string;
    sourceTranscriptSegment?: string;
    groundingVerified?: boolean;
  }>;
}> {
  const detectedLang = detectTranscriptLanguage(title, segments);
  const ai = getGeminiClient();
  const variant = options?.variant || 1;

  if (ai && segments.length > 0) {
    try {
      const preparedTranscript = await prepareTranscriptForLlm(ai, title, segments, 24000);
      const avoidList = (options?.avoidQuestionTitles || []).slice(0, 15).join(" | ");
      const langDirective =
        detectedLang === "en"
          ? "Generate ALL questions, options, and explanations in clear English matching the transcript."
          : "أنشئ الأسئلة والخيارات والشروحات باللغة العربية مع الحفاظ على المصطلحات التقنية كما وردت.";
      const totalWords = segments
        .map((s) => s.text)
        .join(" ")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      const targetQuestionRange = totalWords < 40 ? "2 to 4" : "5 to 8";

      const prompt = `أنت بروفيسور وخبير تقييم أكاديمي في منصة MeetMind AI.
المهمة الصارمة: أنشئ اختباراً موثقاً من ${targetQuestionRange} أسئلة يغطي المحتوى الفعلي فقط لجلسة: "${title}".
${langDirective}

القواعد الصارمة لمنع الاختلاق (ZERO HALLUCINATION):
1. كل سؤال وإجابته الصحيحة يجب أن يستندا بنسبة 100% إلى حقيقة مذكورة صراحةً في النص المفرغ أدناه.
2. إذا كان النص المفرغ قصيراً فلا تخترع أسئلة إضافية من خارج النص — اكتفِ بعدد الأسئلة التي يدعمها النص فعلياً فقط.
3. أدرج لكل سؤال الحقل "sourceTranscriptSegment" بنص حرفي مقتبس مباشرة من النص المفرغ يثبت الإجابة الصحيحة.
4. نوع بين أنواع الأسئلة:
   - "multiple_choice" (أربعة خيارات دقيقة)
   - "true_false" (الخيارات ["True", "False"] أو ["صح (صواب)", "خطأ"])
   - "fill_in_the_blank" (جملة من النص فيها فراغ "___" والإجابة مصطلح ورد في النص)
   - "short_answer" (سؤال قصير إجابته مباشرة من النص)
5. حدد القسم والزمن الفعلي (sectionRef، timestampRef).
6. ${avoidList ? `تجنب تكرار هذه الأسئلة التي طُرحت سابقاً: ${avoidList}` : `هذا الإصدار ${variant} من الاختبار.`}

النص المفرغ:
"""
${preparedTranscript}
"""

الملخص التوجيهي:
"""
${summaryText || ""}
"""

أرجع مصفوفة JSON فقط بالشكل التالي:
[
  {
    "question": "...",
    "type": "multiple_choice",
    "options": ["...", "...", "...", "..."],
    "correctOptionIndex": 0,
    "correctAnswerText": "...",
    "acceptableAnswers": [],
    "explanation": "...",
    "difficulty": "medium",
    "sectionRef": "...",
    "timestampRef": "00:15",
    "sourceTranscriptSegment": "exact verbatim quote from transcript"
  }
]`;

      const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const jsonStr = (response.text || "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const verifiedQuestions = parsed
          .map((q, idx) => {
            const verification = verifyQuizQuestionGrounding(q, segments);
            if (!verification.grounded) return null;
            const resolvedTs = q.timestampRef || verification.matchedTimestamp || "00:00";
            const resolvedQuote =
              q.sourceTranscriptSegment || verification.matchedSegmentText || "";
            return {
              id: `q_${Date.now()}_${idx + 1}`,
              question: String(q.question || "").trim(),
              type: ([
                "multiple_choice",
                "true_false",
                "fill_in_the_blank",
                "short_answer",
              ].includes(q.type)
                ? q.type
                : idx % 4 === 0
                  ? "multiple_choice"
                  : idx % 4 === 1
                    ? "true_false"
                    : idx % 4 === 2
                      ? "fill_in_the_blank"
                      : "short_answer") as
                "multiple_choice" | "true_false" | "short_answer" | "fill_in_the_blank",
              options:
                Array.isArray(q.options) && q.options.length > 0
                  ? q.options.map((o: unknown) => String(o))
                  : q.type === "true_false"
                    ? detectedLang === "en"
                      ? ["True", "False"]
                      : ["صح (صواب)", "خطأ"]
                    : [],
              correctOptionIndex:
                typeof q.correctOptionIndex === "number" ? q.correctOptionIndex : 0,
              correctAnswerText:
                q.correctAnswerText ||
                (q.options ? q.options[q.correctOptionIndex || 0] : undefined),
              acceptableAnswers: Array.isArray(q.acceptableAnswers) ? q.acceptableAnswers : [],
              explanation:
                q.explanation ||
                (detectedLang === "en"
                  ? "Directly verified from the recorded transcript."
                  : "الإجابة مستخلصة وموثقة مباشرة من نص الجلسة المسجل."),
              difficulty: (["easy", "medium", "hard"].includes(q.difficulty)
                ? q.difficulty
                : "medium") as "easy" | "medium" | "hard",
              sectionRef:
                q.sectionRef || (detectedLang === "en" ? "Transcript Section" : "محاور الجلسة"),
              timestampRef: resolvedTs,
              sourceReference: `${q.sectionRef || "Transcript"} [${resolvedTs}]`,
              sourceTranscriptSegment: resolvedQuote,
              groundingVerified: true,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item && item.question));

        if (verifiedQuestions.length > 0) {
          return {
            title:
              detectedLang === "en"
                ? `Comprehension Quiz (${variant > 1 ? `Variant ${variant}` : "Main"}): ${title}`
                : `اختبار الفهم الشامل (${variant > 1 ? `النموذج ${variant}` : "النموذج الرئيسي"}): ${title}`,
            courseCode,
            questions: verifiedQuestions,
          };
        }
      }
    } catch (e) {
      console.warn("Gemini quiz generation error, using grounded generator:", e);
    }
  }

  // Deterministic Grounded Multi-Type Fallback covering the entire actual transcript
  const formatTimeStr = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const validSegs = segments.filter((s) => s.text && s.text.trim().length > 15);
  const targetSegs = validSegs.length >= 3 ? validSegs : segments;

  const seg0 = targetSegs[0] || { text: title, startTime: 0, speaker: "Speaker" };
  const midIdx = Math.floor(targetSegs.length / 2);
  const segMid = targetSegs[midIdx] || seg0;
  const segLast = targetSegs[targetSegs.length - 1] || seg0;
  const segQuarter = targetSegs[Math.floor(targetSegs.length / 4)] || seg0;
  const segThreeQuarter = targetSegs[Math.floor((targetSegs.length * 3) / 4)] || segMid;

  // Extract a factual keyword directly from segQuarter without hardcoded topic guesses
  const kwFromSeg = extractKeywordsWithFrequency([segQuarter as TranscriptSegment], 1)[0]?.term;
  const wordsQuarter = segQuarter.text
    .split(/\s+/)
    .map((w) => w.replace(/[^ء-يa-zA-Z0-9_-]/g, ""))
    .filter((w) => w.length > 3);
  const targetKeyword = kwFromSeg || wordsQuarter[0] || segQuarter.text.split(/\s+/)[0] || title;

  if (detectedLang === "en") {
    return {
      title: `Comprehension Quiz (${variant > 1 ? `Variant ${variant}` : "Comprehensive"}): ${title}`,
      courseCode,
      questions: [
        {
          id: `q_mcq_1`,
          question: `Which statement was made at the opening of "${title}"?`,
          type: "multiple_choice",
          options: [
            seg0.text.length > 90 ? seg0.text.slice(0, 90) + "..." : seg0.text,
            "No agenda topics were covered during this recording.",
            "The recording ended before any concepts were introduced.",
            "None of the recorded statements apply.",
          ],
          correctOptionIndex: 0,
          correctAnswerText: seg0.text,
          explanation: `Verified at [${formatTimeStr(seg0.startTime)}]: "${seg0.text}".`,
          difficulty: "easy",
          sectionRef: "Opening",
          timestampRef: formatTimeStr(seg0.startTime),
          sourceReference: `Opening [${formatTimeStr(seg0.startTime)}]`,
          sourceTranscriptSegment: seg0.text,
          groundingVerified: true,
        },
        {
          id: `q_tf_1`,
          question: `True or False: Around [${formatTimeStr(segMid.startTime)}], ${segMid.speaker} stated: "${segMid.text.length > 80 ? segMid.text.slice(0, 80) + "..." : segMid.text}"`,
          type: "true_false",
          options: ["True", "False"],
          correctOptionIndex: 0,
          correctAnswerText: "True",
          explanation: `Confirmed verbatim at [${formatTimeStr(segMid.startTime)}].`,
          difficulty: "easy",
          sectionRef: "Core Discussion",
          timestampRef: formatTimeStr(segMid.startTime),
          sourceReference: `Core Discussion [${formatTimeStr(segMid.startTime)}]`,
          sourceTranscriptSegment: segMid.text,
          groundingVerified: true,
        },
        {
          id: `q_fill_1`,
          question: `Complete the exact statement recorded at [${formatTimeStr(segQuarter.startTime)}]: "${segQuarter.text.replace(targetKeyword, "___")}"`,
          type: "fill_in_the_blank",
          options: [],
          correctOptionIndex: 0,
          correctAnswerText: targetKeyword,
          acceptableAnswers: [targetKeyword],
          explanation: `Taken verbatim from [${formatTimeStr(segQuarter.startTime)}].`,
          difficulty: "medium",
          sectionRef: "Key Terminology",
          timestampRef: formatTimeStr(segQuarter.startTime),
          sourceReference: `Key Terminology [${formatTimeStr(segQuarter.startTime)}]`,
          sourceTranscriptSegment: segQuarter.text,
          groundingVerified: true,
        },
        {
          id: `q_sa_1`,
          question: `What closing point did ${segLast.speaker} emphasize at [${formatTimeStr(segLast.startTime)}] in "${title}"?`,
          type: "short_answer",
          options: [],
          correctOptionIndex: 0,
          correctAnswerText: segLast.text,
          explanation: `Recorded at [${formatTimeStr(segLast.startTime)}]: "${segLast.text}".`,
          difficulty: "hard",
          sectionRef: "Closing",
          timestampRef: formatTimeStr(segLast.startTime),
          sourceReference: `Closing [${formatTimeStr(segLast.startTime)}]`,
          sourceTranscriptSegment: segLast.text,
          groundingVerified: true,
        },
      ],
    };
  }

  return {
    title: `اختبار الفهم الشامل (${variant > 1 ? `النموذج ${variant}` : "النموذج الشامل"}): ${title}`,
    courseCode,
    questions: [
      {
        id: `q_mcq_1`,
        question: `ما هو المحور الأساسي الذي تحدث عنه المتحدث في مستهل تسجيل "${title}"؟`,
        type: "multiple_choice",
        options: [
          seg0.text.length > 90 ? seg0.text.slice(0, 90) + "..." : seg0.text,
          "تجاوز جميع الأهداف والالتزامات الأكاديمية دون توثيق",
          "إلغاء محاور المحاضرة وتأجيل الاستنتاجات",
          "عدم الاكتراث بالمعايير التشغيلية المطروحة",
        ],
        correctOptionIndex: 0,
        correctAnswerText: seg0.text,
        explanation: `استند المتحدث في المقطع [${formatTimeStr(seg0.startTime)}] إلى القول: "${seg0.text}".`,
        difficulty: "easy",
        sectionRef: "المقدمة والمنطلقات",
        timestampRef: formatTimeStr(seg0.startTime),
        sourceReference: `المقدمة والمنطلقات [${formatTimeStr(seg0.startTime)}]`,
        sourceTranscriptSegment: seg0.text,
        groundingVerified: true,
      },
      {
        id: `q_tf_1`,
        question: `أكد المتحدث في منتصف التسجيل ما نصه: "${segMid.text.length > 80 ? segMid.text.slice(0, 80) + "..." : segMid.text}"؟`,
        type: "true_false",
        options: ["صح (صواب)", "خطأ"],
        correctOptionIndex: 0,
        correctAnswerText: "صح (صواب)",
        explanation: `النص المفرغ الفعلي يثبت صراحة في الدقيقة [${formatTimeStr(segMid.startTime)}] هذا الطرح: "${segMid.text}".`,
        difficulty: "easy",
        sectionRef: "الصلب النظري والمفاهيم",
        timestampRef: formatTimeStr(segMid.startTime),
        sourceReference: `الصلب النظري والمفاهيم [${formatTimeStr(segMid.startTime)}]`,
        sourceTranscriptSegment: segMid.text,
        groundingVerified: true,
      },
      {
        id: `q_fill_1`,
        question: `وفقاً لما ورد في الشرح: "${segQuarter.text.replace(targetKeyword, "___")}"، الكلمة الصحيحة في الفراغ هي:`,
        type: "fill_in_the_blank",
        options: [],
        correctOptionIndex: 0,
        correctAnswerText: targetKeyword,
        acceptableAnswers: [targetKeyword],
        explanation: `استشهد المتحدث في التوقيت [${formatTimeStr(segQuarter.startTime)}] بهذا المصطلح نصاً.`,
        difficulty: "medium",
        sectionRef: "المصطلحات المحورية",
        timestampRef: formatTimeStr(segQuarter.startTime),
        sourceReference: `المصطلحات المحورية [${formatTimeStr(segQuarter.startTime)}]`,
        sourceTranscriptSegment: segQuarter.text,
        groundingVerified: true,
      },
      {
        id: `q_mcq_2`,
        question: `في الجزء المتقدم من الجلسة، ما الذي تم التشديد عليه بخصوص التطبيق العملي؟`,
        type: "multiple_choice",
        options: [
          segThreeQuarter.text.length > 90
            ? segThreeQuarter.text.slice(0, 90) + "..."
            : segThreeQuarter.text,
          "التوقف التام عن مراجعة المفاهيم والنتائج",
          "استبدال جميع مخرجات العمل بنماذج افتراضية غير حقيقية",
          "إهمال الجداول الزمنية المتفق عليها",
        ],
        correctOptionIndex: 0,
        correctAnswerText: segThreeQuarter.text,
        explanation: `ذكر المتحدث في التوقيت [${formatTimeStr(segThreeQuarter.startTime)}] نصاً: "${segThreeQuarter.text}".`,
        difficulty: "medium",
        sectionRef: "التطبيقات المتقدمة",
        timestampRef: formatTimeStr(segThreeQuarter.startTime),
        sourceReference: `التطبيقات المتقدمة [${formatTimeStr(segThreeQuarter.startTime)}]`,
        sourceTranscriptSegment: segThreeQuarter.text,
        groundingVerified: true,
      },
      {
        id: `q_sa_1`,
        question: `ما هي الخلاصة والتوجيه النهائي الذي اختتم به المتحدث جلسة "${title}"؟`,
        type: "short_answer",
        options: [],
        correctOptionIndex: 0,
        correctAnswerText: segLast.text,
        explanation: `أوضح المتحدث في ختام التسجيل عند [${formatTimeStr(segLast.startTime)}]: "${segLast.text}".`,
        difficulty: "hard",
        sectionRef: "الخاتمة والتوصيات",
        timestampRef: formatTimeStr(segLast.startTime),
        sourceReference: `الخاتمة والتوصيات [${formatTimeStr(segLast.startTime)}]`,
        sourceTranscriptSegment: segLast.text,
        groundingVerified: true,
      },
    ],
  };
}

// Generate Detailed Lecture/Meeting Analysis in Arabic
export async function generateAiLectureAnalysis(
  title: string,
  segments: TranscriptSegment[],
  type: "meeting" | "lecture" = "lecture",
  courseCode?: string,
): Promise<{
  topics: string[];
  keywords: string[];
  definitions: Array<{ term: string; definition: string; timestamp?: string }>;
  questionsAsked: Array<{ question: string; answer?: string; timestamp?: string }>;
  actionItems: Array<{ task: string; owner?: string; deadline?: string }>;
  emphasizedPoints: string[];
  importantSentences: string[];
  reviewAreas: string[];
}> {
  const detectedLang = detectTranscriptLanguage(title, segments);
  const ai = getGeminiClient();

  if (ai && segments.length > 0) {
    try {
      const preparedTranscript = await prepareTranscriptForLlm(ai, title, segments, 24000);
      const langDirective =
        detectedLang === "en"
          ? "Return all string values in English matching the transcript."
          : "حلل المحتوى باللغة العربية مع الحفاظ على المصطلحات التقنية كما وردت.";
      const prompt = `أنت محلل المحاضرات والاجتماعات الذكي في MeetMind AI.
حلل النص المفرغ التالي لجلسة "${title}" (${type}${courseCode ? ` - ${courseCode}` : ""}) بدقة فائقة دون أي اختلاق:
${langDirective}
النص المفرغ:
"""
${preparedTranscript}
"""

المطلوب إخراج كائن JSON فقط بالهيكل التالي:
{
  "topics": ["Topic 1"],
  "keywords": ["Keyword 1", "Keyword 2"],
  "definitions": [
    {"term": "Term", "definition": "Definition stated in session", "timestamp": "00:30"}
  ],
  "questionsAsked": [
    {"question": "Question asked", "answer": "Answer if stated", "timestamp": "01:15"}
  ],
  "actionItems": [
    {"task": "Task or deliverable", "owner": "Owner if named else null", "deadline": "Deadline if named else Deadline not specified."}
  ],
  "emphasizedPoints": ["Important points emphasized by the speaker"],
  "importantSentences": ["Key statements from the transcript"],
  "reviewAreas": ["Areas to review"]
}`;

      const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      return {
        topics: parsed.topics || [title],
        keywords: parsed.keywords || [],
        definitions: parsed.definitions || [],
        questionsAsked: parsed.questionsAsked || [],
        actionItems: parsed.actionItems || [],
        emphasizedPoints: parsed.emphasizedPoints || [],
        importantSentences: parsed.importantSentences || [],
        reviewAreas: parsed.reviewAreas || [],
      };
    } catch (e) {
      console.warn("Gemini lecture analysis error, using grounded extractor:", e);
    }
  }

  // Deterministic Grounded Fallback derived strictly from actual transcript segments
  const kwItems = extractKeywordsWithFrequency(segments, 8);
  const hlItems = extractHighlightsFromSegments(segments);
  const extractedTasks = segments
    .filter((s) => /(action|task|todo|submit|deliver|يجب|مهمة|تسليم|تنفيذ)/i.test(s.text))
    .slice(0, 5)
    .map((s) => ({
      task: s.text,
      deadline: "Deadline not specified.",
    }));

  return {
    topics:
      kwItems.slice(0, 4).map((k) => k.term).length > 0
        ? kwItems.slice(0, 4).map((k) => k.term)
        : [title],
    keywords: kwItems.map((k) => k.term),
    definitions: hlItems
      .filter((h) => h.category === "Definition")
      .map((h) => ({ term: title, definition: h.quote, timestamp: h.timestamp })),
    questionsAsked: segments
      .filter((s) => /[?؟]/.test(s.text))
      .slice(0, 5)
      .map((s) => ({
        question: s.text,
        timestamp: `${Math.floor(s.startTime / 60)
          .toString()
          .padStart(2, "0")}:${Math.floor(s.startTime % 60)
          .toString()
          .padStart(2, "0")}`,
      })),
    actionItems: extractedTasks,
    emphasizedPoints: hlItems.map((h) => h.quote),
    importantSentences: segments.slice(0, 4).map((s) => s.text),
    reviewAreas: kwItems.slice(0, 3).map((k) => k.term),
  };
}

export function generateAnalysisFromTranscript(
  title: string,
  segments: TranscriptSegment[],
  _type: "meeting" | "lecture",
  _courseCode?: string,
): AIAnalysisResult {
  if (!segments || segments.length === 0) {
    return {
      summary: "",
      keyPoints: [],
      decisions: [],
      topics: [],
      actionItems: [],
      lectureNotes: "",
    };
  }

  const kwItems = extractKeywordsWithFrequency(segments, 6);
  const hlItems = extractHighlightsFromSegments(segments);
  const keyPoints = segments.slice(0, 4).map((s) => s.text);
  const summary = segments
    .slice(0, 3)
    .map((s) => `${s.speaker}: ${s.text}`)
    .join(" ");

  const actionItems = segments
    .filter((s) => /(action|task|todo|must |need to|deliver|يجب|مهمة|تكليف|تسليم)/i.test(s.text))
    .slice(0, 5)
    .map((s) => ({
      title: s.text.length > 110 ? `${s.text.slice(0, 110)}...` : s.text,
      dueDate: "Deadline not specified.",
      priority: /(urgent|high|critical|عاجل|فوري)/i.test(s.text)
        ? ("high" as const)
        : ("medium" as const),
    }));

  return {
    summary,
    keyPoints,
    decisions: hlItems.filter((h) => h.category === "Decision").map((h) => h.quote),
    topics: kwItems.map((k) => k.term),
    actionItems,
    lectureNotes: summary,
  };
}

export function answerGroundedQuestion(
  question: string,
  segments: TranscriptSegment[],
  title: string,
): {
  answer: string;
  evidenceFound: boolean;
  citations: { speaker: string; timestamp: string; quote: string }[];
} {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "are",
    "but",
    "not",
    "you",
    "all",
    "can",
    "her",
    "was",
    "one",
    "our",
    "out",
    "has",
    "had",
    "how",
    "why",
    "who",
    "its",
    "with",
    "that",
    "this",
    "from",
    "they",
    "will",
    "have",
    "been",
    "were",
    "said",
    "what",
    "when",
    "where",
    "which",
    "about",
    "does",
    "did",
    "في",
    "من",
    "إلى",
    "على",
    "هذا",
    "هذه",
    "ذلك",
    "التي",
    "الذي",
    "مع",
    "كان",
    "ليس",
    "ماذا",
    "كيف",
    "متى",
    "أين",
    "هل",
    "عن",
  ]);
  const queryLower = question.toLowerCase();
  const queryWords = queryLower
    .split(/[\s؟?!.,،:;()"']+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !stopWords.has(w));

  const scoredSegments = segments
    .map((seg) => {
      let score = 0;
      const textLower = seg.text.toLowerCase();
      const textTokens = new Set(textLower.split(/[\s؟?!.,،:;()"']+/).filter(Boolean));
      for (const word of queryWords) {
        if (textTokens.has(word)) {
          score += 3;
        } else if (word.length >= 4 && textLower.includes(word)) {
          score += 1;
        }
      }
      return { seg, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredSegments.length === 0) {
    return {
      answer: "Not mentioned in this recording.",
      evidenceFound: false,
      citations: [],
    };
  }

  const topMatches = scoredSegments.slice(0, 3);
  const citations = topMatches.map((m) => {
    const mins = Math.floor(m.seg.startTime / 60);
    const secs = Math.floor(m.seg.startTime % 60);
    const timeFormatted = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    return {
      speaker: m.seg.speaker,
      timestamp: timeFormatted,
      quote: m.seg.text,
    };
  });

  const quotesText = topMatches.map((m) => `"${m.seg.text}"`).join(" | ");

  return {
    answer: `Based on "${title}", ${topMatches[0].seg.speaker} [${citations[0].timestamp}] stated: ${quotesText}`,
    evidenceFound: true,
    citations,
  };
}

export async function askMeetMindAI({
  question,
  resourceId,
  history = [],
  userId = "usr_admin",
  isAdmin = true,
}: {
  question: string;
  resourceId?: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
  userId?: string;
  isAdmin?: boolean;
}): Promise<{
  answer: string;
  evidenceFound: boolean;
  citations: { speaker: string; timestamp: string; quote: string }[];
  suggestedFollowUps?: string[];
  forbidden?: boolean;
}> {
  const allMeetings = db.get("meetings");
  const allLectures = db.get("lectures");
  const allTasks = db.get("actionItems");
  const allQuizzes = db.get("quizzes");
  const allFlashcards = db.get("flashcards");

  const meetings = isAdmin ? allMeetings : allMeetings.filter((m) => m.hostId === userId);
  const lectures = isAdmin ? allLectures : allLectures.filter((l) => l.instructorId === userId);
  const allowedIds = new Set([...meetings.map((m) => m.id), ...lectures.map((l) => l.id)]);
  const tasks = isAdmin
    ? allTasks
    : allTasks.filter(
        (t) => t.userId === userId || allowedIds.has(t.meetingId || t.lectureId || ""),
      );
  const quizzes = isAdmin
    ? allQuizzes
    : allQuizzes.filter((q) => allowedIds.has(q.lectureId || q.meetingId || ""));
  const flashcards = isAdmin
    ? allFlashcards
    : allFlashcards.filter((f) =>
        allowedIds.has(f.lectureId || f.meetingId || f.deckId.replace("deck_", "")),
      );

  const persistChatTurn = (res: {
    answer: string;
    evidenceFound: boolean;
    citations: { speaker: string; timestamp: string; quote: string }[];
  }) => {
    const now = new Date().toISOString();
    db.update("chatMessages", (msgs = []) => [
      ...msgs.slice(-198),
      {
        id: `msg_u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId,
        resourceId,
        role: "user" as const,
        content: question,
        createdAt: now,
      },
      {
        id: `msg_a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId,
        resourceId,
        role: "assistant" as const,
        content: res.answer,
        evidenceFound: res.evidenceFound,
        citations: res.citations,
        createdAt: now,
      },
    ]);
  };

  if (resourceId) {
    const existsAnywhere =
      allMeetings.some((m) => m.id === resourceId) || allLectures.some((l) => l.id === resourceId);
    if (existsAnywhere && !allowedIds.has(resourceId)) {
      return {
        answer: "Access denied to this recording.",
        evidenceFound: false,
        citations: [],
        forbidden: true,
      };
    }
  }

  const targetMeeting = resourceId ? meetings.find((m) => m.id === resourceId) : undefined;
  const targetLecture = resourceId ? lectures.find((l) => l.id === resourceId) : undefined;

  if (resourceId && !targetMeeting && !targetLecture) {
    const missing = {
      answer: "Not mentioned in this recording.",
      evidenceFound: false,
      citations: [],
    };
    persistChatTurn(missing);
    return missing;
  }

  const targetItem = targetLecture || targetMeeting;
  const targetSegments = targetItem?.segments || [];

  // Optional delegation to Python AI service when configured
  if (AI_SERVICE_URL && targetItem) {
    try {
      const resp = await fetch(`${AI_SERVICE_URL}/api/v1/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: targetItem.title,
          question,
          segments: targetSegments,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          answer: string;
          evidenceFound: boolean;
          citations: { speaker: string; timestamp: string; quote: string }[];
        };
        const out = {
          answer: data.evidenceFound ? data.answer : "Not mentioned in this recording.",
          evidenceFound: data.evidenceFound,
          citations: data.citations || [],
        };
        persistChatTurn(out);
        return out;
      }
    } catch {
      // Fallback seamlessly to Gemini or deterministic transcript search
    }
  }

  const latestLecture = lectures[0];
  const latestMeeting = meetings[0];

  if (targetItem && targetSegments.length === 0) {
    const emptyRes = {
      answer: "Not mentioned in this recording.",
      evidenceFound: false,
      citations: [],
    };
    persistChatTurn(emptyRes);
    return emptyRes;
  }

  // Helper: select all segments for short recordings, or top relevance-scored + boundary segments for long recordings
  const selectTranscriptSegmentsForChat = (segs: TranscriptSegment[], limit = 80) => {
    if (segs.length <= limit) return segs;
    const qTokens = normalizeArabicAndLatin(question)
      .split(" ")
      .filter((t) => t.length >= 2);
    const chosen = new Set<number>();
    // Always include opening and closing context
    for (let i = 0; i < Math.min(10, segs.length); i++) chosen.add(i);
    for (let i = Math.max(0, segs.length - 10); i < segs.length; i++) chosen.add(i);

    const scored = segs
      .map((s, idx) => {
        const norm = normalizeArabicAndLatin(s.text);
        let score = 0;
        for (const t of qTokens) {
          if (norm.includes(t)) score += t.length >= 4 ? 3 : 1;
        }
        return { idx, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    for (const item of scored) {
      if (chosen.size >= limit) break;
      chosen.add(item.idx);
      if (item.idx > 0 && chosen.size < limit) chosen.add(item.idx - 1);
      if (item.idx + 1 < segs.length && chosen.size < limit) chosen.add(item.idx + 1);
    }

    return Array.from(chosen)
      .sort((a, b) => a - b)
      .map((i) => segs[i]);
  };

  // Build grounded transcript + metadata context (strictly scoped to authorized user recordings)
  let contextDetails = "";
  const lecturesToInclude = targetLecture
    ? [targetLecture]
    : targetMeeting
      ? []
      : lectures.slice(0, 4);
  for (const l of lecturesToInclude) {
    contextDetails += `[Lecture: "${l.title}" (${l.courseCode || "General"}, ${l.date})]:\n`;
    if (l.summary || l.studyNotes) contextDetails += `Summary: ${l.summary || l.studyNotes}\n`;
    if (l.topics && l.topics.length > 0) contextDetails += `Topics: ${l.topics.join(", ")}\n`;
    if (l.keywords && l.keywords.length > 0) {
      contextDetails += `Keywords: ${l.keywords.map((k) => k.term).join(", ")}\n`;
    }
    if (l.segments && l.segments.length > 0) {
      const picked = selectTranscriptSegmentsForChat(l.segments, targetLecture ? 120 : 40);
      contextDetails += `Transcript (${picked.length}/${l.segments.length} segments):\n`;
      picked.forEach((s) => {
        contextDetails += `[${formatMmSs(s.startTime)}] ${s.speaker}: ${s.text}\n`;
      });
    }
    const relQuiz = quizzes.find((q) => q.lectureId === l.id);
    if (relQuiz && relQuiz.questions.length > 0) {
      contextDetails += `Generated Quiz Questions: ${relQuiz.questions
        .slice(0, 6)
        .map((q) => q.question)
        .join(" | ")}\n`;
    }
    const relCards = flashcards.filter((f) => f.lectureId === l.id).slice(0, 6);
    if (relCards.length > 0) {
      contextDetails += `Flashcards: ${relCards.map((c) => `${c.front} -> ${c.back}`).join(" | ")}\n`;
    }
    contextDetails += `\n`;
  }

  const meetingsToInclude = targetMeeting
    ? [targetMeeting]
    : targetLecture
      ? []
      : meetings.slice(0, 4);
  for (const m of meetingsToInclude) {
    contextDetails += `[Meeting: "${m.title}" (${m.date})]:\n`;
    if (m.summary) contextDetails += `Summary: ${m.summary}\n`;
    if (m.topics && m.topics.length > 0) contextDetails += `Topics: ${m.topics.join(", ")}\n`;
    if (m.keywords && m.keywords.length > 0) {
      contextDetails += `Keywords: ${m.keywords.map((k) => k.term).join(", ")}\n`;
    }
    if (m.decisions && m.decisions.length > 0) {
      contextDetails += `Decisions: ${m.decisions.join("; ")}\n`;
    }
    if (m.segments && m.segments.length > 0) {
      const picked = selectTranscriptSegmentsForChat(m.segments, targetMeeting ? 120 : 40);
      contextDetails += `Transcript (${picked.length}/${m.segments.length} segments):\n`;
      picked.forEach((s) => {
        contextDetails += `[${formatMmSs(s.startTime)}] ${s.speaker}: ${s.text}\n`;
      });
    }
    const relQuiz = quizzes.find((q) => q.meetingId === m.id);
    if (relQuiz && relQuiz.questions.length > 0) {
      contextDetails += `Generated Quiz Questions: ${relQuiz.questions
        .slice(0, 6)
        .map((q) => q.question)
        .join(" | ")}\n`;
    }
    contextDetails += `\n`;
  }

  const relevantTasks = targetItem
    ? tasks.filter((t) => t.meetingId === targetItem.id || t.lectureId === targetItem.id)
    : tasks;
  if (relevantTasks.length > 0) {
    contextDetails += `[Extracted Tasks]:\n`;
    relevantTasks.slice(0, 15).forEach((t) => {
      contextDetails += `- ${t.title} (Owner: ${t.ownerName || "Unassigned"}, Deadline: ${t.deadlineText || t.dueDate || "Deadline not specified."})\n`;
    });
  }

  const isArabicQuestion = /[\u0600-\u06FF]/.test(question);
  const ai = getGeminiClient();

  if (ai) {
    try {
      const hasWorkspaceContext = contextDetails.trim().length > 0;
      const systemInstruction = targetItem
        ? `You are MeetMind AI, a helpful intelligent assistant for meetings, lectures, and learning.
The user currently has a specific recording selected: "${targetItem.title}".
Rules:
1. If the user asks what was said, decided, assigned, or covered in this recording, answer accurately using ONLY the provided transcript and extracted records, citing speaker names and timestamps [MM:SS]. If that specific detail was NOT mentioned in the recording, state clearly: "Not mentioned in this recording." (or in Arabic: "غير مذكور في هذا التسجيل.").
2. If the user asks a general, conceptual, academic, coding, or study question (e.g., explaining a concept, giving examples, solving a problem, writing code, or preparing for an exam), answer it thoroughly and helpfully in the user's language (Arabic, Egyptian Arabic, or English).
3. Never fabricate quotes or claim something was spoken in the recording if it is not in the transcript.`
        : `You are MeetMind AI, a super-intelligent, helpful AI assistant capable of answering ANY question across all subjects (science, programming, math, engineering, languages, study tips, exam prep, writing, everyday questions, and more), in addition to analyzing the user's uploaded meetings and lectures.
Rules:
1. Answer ANY question the user asks clearly, accurately, and naturally in the same language/dialect they used (Standard Arabic, Egyptian Arabic, English, etc.).
2. If the user asks about their meetings, lectures, recordings, summaries, tasks, quizzes, or flashcards, ground your answer strictly in the provided workspace context below and cite speaker names and timestamps [MM:SS]. Never invent recording content.
3. If the user asks a general question unrelated to their recordings, answer it directly and completely — NEVER refuse with "Not mentioned in this recording.".`;

      const recentHistory = history
        .slice(-10)
        .filter((h) => h.text && h.text.trim())
        .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`)
        .join("\n\n");

      const promptParts: string[] = [];
      if (hasWorkspaceContext) {
        promptParts.push(`[User's Authorized Workspace Recordings & Notes]:\n${contextDetails}`);
      } else {
        promptParts.push(
          `[Workspace Status]: The user currently has no transcribed recordings uploaded.`,
        );
      }
      if (recentHistory) {
        promptParts.push(`[Conversation History]:\n${recentHistory}`);
      }
      promptParts.push(`[User Question]:\n${question}`);

      const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: promptParts.join("\n\n"),
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const replyText = (response.text || "").trim();
      if (replyText) {
        const activeSegments =
          targetSegments.length > 0
            ? targetSegments
            : [...(latestLecture?.segments || []), ...(latestMeeting?.segments || [])];

        const grounded =
          activeSegments.length > 0
            ? answerGroundedQuestion(question, activeSegments, targetItem?.title || "Recordings")
            : { citations: [], evidenceFound: false };

        const notMentioned =
          Boolean(targetItem) &&
          (replyText === "Not mentioned in this recording." ||
            replyText === "غير مذكور في هذا التسجيل.");

        const finalAnswer = {
          answer: replyText,
          evidenceFound: !notMentioned && (grounded.evidenceFound || !targetItem),
          citations: grounded.evidenceFound ? grounded.citations : [],
          suggestedFollowUps: isArabicQuestion
            ? [
                "اشرح هذه النقطة بأمثلة عملية أكثر",
                "لخص الإجابة في نقاط سريعة للمذاكرة",
                "اعمل لي 5 أسئلة اختبار على الموضوع ده",
              ]
            : [
                "Explain this with practical examples",
                "Summarize into concise study bullets",
                "Create 5 practice quiz questions on this topic",
              ],
        };
        persistChatTurn(finalAnswer);
        return finalAnswer;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn("Gemini query warning:", errMsg);
      if (
        !targetItem &&
        /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|403|401/i.test(errMsg)
      ) {
        const cfgAnswer = {
          answer: isArabicQuestion
            ? "تعذر الاتصال بمحرك الذكاء الاصطناعي لأن مفتاح GEMINI_API_KEY غير مضبوط أو غير صالح. يرجى التأكد من تفعيل مفتاح Gemini API الصحيح من لوحة Settings > Secrets."
            : "Unable to reach the AI engine because GEMINI_API_KEY is missing or invalid. Please check your Gemini API key in Settings > Secrets.",
          evidenceFound: false,
          citations: [],
        };
        persistChatTurn(cfgAnswer);
        return cfgAnswer;
      }
    }
  }

  // Deterministic grounded transcript search when querying a recording or when offline/key unconfigured
  if (targetItem) {
    const res = answerGroundedQuestion(question, targetSegments, targetItem.title);
    persistChatTurn(res);
    return res;
  }

  const allActive = [...(latestLecture?.segments || []), ...(latestMeeting?.segments || [])];
  if (allActive.length > 0) {
    const res = answerGroundedQuestion(
      question,
      allActive,
      latestLecture?.title || latestMeeting?.title || "Recordings",
    );
    if (res.evidenceFound) {
      persistChatTurn(res);
      return res;
    }
  }

  const unconfiguredMsg = {
    answer: isArabicQuestion
      ? "محرك الذكاء الاصطناعي للإجابة على الأسئلة العامة يحتاج إلى مفتاح GEMINI_API_KEY صالح في لوحة Settings > Secrets. بمجرد تفعيل المفتاح، سأتمكن من الإجابة على أي سؤال تطرحه في أي مجال بالإضافة لتحليل تسجيلاتك."
      : "The general AI assistant requires a valid GEMINI_API_KEY configured in Settings > Secrets. Once configured, I can answer any question across any topic as well as analyze your recordings.",
    evidenceFound: false,
    citations: [],
  };
  persistChatTurn(unconfiguredMsg);
  return unconfiguredMsg;
}

// Generate Spaced Repetition Flashcards Grounded in Transcript
export async function generateAiFlashcards(
  title: string,
  segments: TranscriptSegment[],
  summaryText?: string,
  courseCode?: string,
): Promise<
  Array<{
    front: string;
    back: string;
    sourceReference?: string;
    topic?: string;
    difficulty?: "easy" | "medium" | "hard";
  }>
> {
  const detectedLang = detectTranscriptLanguage(title, segments);
  const ai = getGeminiClient();

  if (ai && segments.length > 0) {
    try {
      const preparedTranscript = await prepareTranscriptForLlm(ai, title, segments, 24000);
      const langDirective =
        detectedLang === "en"
          ? "Generate all flashcard fronts and backs in clear English matching the transcript."
          : "أنشئ البطاقات باللغة العربية مع الحفاظ على المصطلحات التقنية كما وردت.";
      const prompt = `أنت خبير في تقنيات الاستذكار والتعلم المتباعد (Spaced Repetition) في منصة MeetMind AI.
المهمة الصارمة: أنشئ ما بين 6 إلى 10 بطاقات تعليمية (Flashcards) مستخلصة وموثقة بنسبة 100% من محتوى الجلسة التالية: "${title}".
${langDirective}
القواعد:
1. الوجه الأمامي (front): سؤال واضح أو مصطلح محوري ورد في الجلسة.
2. الوجه الخلفي (back): إجابة دقيقة وموجزة مستندة للنص المفرغ فقط.
3. لا تختلق أي معلومة لم تذكر في النص المفرغ.
4. أرفق sourceReference (التوقيت أو القسم)، topic (الموضوع)، difficulty ("easy" | "medium" | "hard").

النص المفرغ:
"""
${preparedTranscript}
"""

الملخص التوجيهي:
"""
${summaryText || ""}
"""

المطلوب إرجاع مصفوفة JSON فقط بالشكل التالي:
[
  {
    "front": "...",
    "back": "...",
    "sourceReference": "01:20",
    "topic": "...",
    "difficulty": "medium"
  }
]`;

      const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const parsed = JSON.parse(response.text || "[]");
      if (Array.isArray(parsed) && parsed.length >= 3) {
        return parsed
          .map((item) => ({
            front: String(item.front || "").trim(),
            back: String(item.back || "").trim(),
            sourceReference: item.sourceReference ? String(item.sourceReference).trim() : "00:00",
            topic: item.topic ? String(item.topic).trim() : courseCode || title,
            difficulty: (["easy", "medium", "hard"].includes(item.difficulty)
              ? item.difficulty
              : "medium") as "easy" | "medium" | "hard",
          }))
          .filter((c) => c.front && c.back);
      }
    } catch (err) {
      console.warn("Gemini flashcards generation error, using grounded extractor:", err);
    }
  }

  // Deterministic Grounded Fallback
  const valid = segments.filter((s) => s.text && s.text.length > 20);
  const pool = valid.length >= 4 ? valid : segments;
  return pool.slice(0, 6).map((seg, idx) => {
    const ts = `${Math.floor(seg.startTime / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(seg.startTime % 60)
      .toString()
      .padStart(2, "0")}`;
    return {
      front:
        detectedLang === "en"
          ? `What point was covered at [${ts}] in "${title}"?`
          : `ما هو المفهوم الذي تم تناوله في الجزء [${ts}] من "${title}"؟`,
      back: seg.text,
      sourceReference: ts,
      topic: courseCode || title,
      difficulty: idx % 3 === 0 ? "easy" : idx % 3 === 1 ? "medium" : "hard",
    };
  });
}

// Generate Hierarchical Knowledge Graph (Mind Map) Grounded in Transcript
export async function generateAiMindMap(
  title: string,
  segments: TranscriptSegment[],
  summaryText?: string,
  courseCode?: string,
): Promise<MindMapNode> {
  const detectedLang = detectTranscriptLanguage(title, segments);
  const ai = getGeminiClient();

  if (ai && segments.length > 0) {
    try {
      const preparedTranscript = await prepareTranscriptForLlm(ai, title, segments, 24000);
      const langDirective =
        detectedLang === "en"
          ? "Generate all node labels and descriptions in clear English matching the transcript."
          : "اجعل عناوين العقد والأوصاف باللغة العربية مع الإبقاء على المصطلحات التقنية كما وردت.";
      const prompt = `أنت خبير الخرائط الذهنية ورسم العلاقات المعرفية في منصة MeetMind AI.
المهمة الصارمة: أنشئ خريطة ذهنية هرمية شاملة ودقيقة تلخص الجلسة: "${title}" ${courseCode ? `(${courseCode})` : ""} بناءً على النص المفرغ فقط.
${langDirective}
القواعد:
1. العقدة الجذرية (Root): عنوان الجلسة مع وصف موجز.
2. الفروع الرئيسية (Main Branches): من 3 إلى 5 فروع تغطي المحاور الفعلية في النص.
3. الفروع الفرعية (Sub-nodes): كل فرع رئيسي يتفرع منه من 2 إلى 4 عقد فرعية مستفادة من النص المفرغ.
4. كل عقدة تتضمن: "id", "label", "description", "children".

النص المفرغ:
"""
${preparedTranscript}
"""

الملخص:
"""
${summaryText || ""}
"""

المطلوب إرجاع كائن JSON يمثل العقدة الجذرية بالهيكل الموضح.`;

      const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      if (parsed.label && Array.isArray(parsed.children) && parsed.children.length > 0) {
        return parsed as MindMapNode;
      }
    } catch (err) {
      console.warn("Gemini mind map generation error, using grounded extractor:", err);
    }
  }

  // Deterministic Grounded Fallback
  return {
    id: `root_${Date.now()}`,
    label: title,
    description: `خريطة المفاهيم والعلاقات المستخرجة من جلسة ${title}`,
    children: [
      {
        id: `node_intro_${Date.now()}`,
        label: "المقدمة والمنطلقات",
        description: segments[0]?.text?.slice(0, 100) || "مقدمة الجلسة والمحاور المستهدفة",
        children: segments.slice(0, 2).map((s, idx) => ({
          id: `node_intro_sub_${idx}`,
          label: `نقطة ${idx + 1}`,
          description: s.text,
        })),
      },
      {
        id: `node_core_${Date.now()}`,
        label: "الصلب النظري والمفاهيم",
        description: "المفاهيم والنقاط الجوهرية المطروحة في النقاش",
        children: segments.slice(2, 5).map((s, idx) => ({
          id: `node_core_sub_${idx}`,
          label: `مفهوم ${idx + 1}`,
          description: s.text,
        })),
      },
      {
        id: `node_concl_${Date.now()}`,
        label: "التطبيقات والتوصيات",
        description:
          segments[segments.length - 1]?.text?.slice(0, 100) || "خلاصة المخرجات والتوصيات العملية",
        children: segments.slice(-2).map((s, idx) => ({
          id: `node_concl_sub_${idx}`,
          label: `توصية ${idx + 1}`,
          description: s.text,
        })),
      },
    ],
  };
}
