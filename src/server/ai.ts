import { db, TranscriptSegment, MindMapNode } from "./db";
import { getGeminiClient } from "./gemini";

export interface AIAnalysisResult {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  topics: string[];
  actionItems: {
    title: string;
    ownerName?: string;
    dueDate?: string;
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

export function extractKeywordsWithFrequency(
  segments: TranscriptSegment[],
  limit = 10,
): Array<{ term: string; frequency: number; importance: number; segmentIds: string[] }> {
  const stopWords = new Set([
    "في",
    "من",
    "على",
    "إلى",
    "عن",
    "مع",
    "هذا",
    "هذه",
    "ذلك",
    "تم",
    "كان",
    "يكون",
    "كل",
    "هو",
    "هي",
    "نحن",
    "أن",
    "إن",
    "هل",
    "ما",
    "التي",
    "الذي",
    "بين",
    "عند",
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
  ]);
  const counts = new Map<string, { freq: number; segIds: Set<string> }>();
  for (const seg of segments) {
    const tokens = (seg.text || "").split(/\s+/);
    for (const raw of tokens) {
      const clean = raw.replace(/[^ء-يa-zA-Z0-9_-]/g, "");
      const norm = clean.toLowerCase();
      if (clean.length >= 3 && !stopWords.has(norm)) {
        const entry = counts.get(clean) || { freq: 0, segIds: new Set<string>() };
        entry.freq += 1;
        entry.segIds.add(seg.id);
        counts.set(clean, entry);
      }
    }
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1].freq - a[1].freq)
    .slice(0, limit);
  const maxFreq = Math.max(1, sorted[0]?.[1].freq || 1);
  return sorted.map(([term, info]) => ({
    term,
    frequency: info.freq,
    importance: Math.round((info.freq / maxFreq) * 100) / 100,
    segmentIds: Array.from(info.segIds),
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
      regex: /(important|critical|exam|remember|key|note|مهم|امتحان|انتبه|أساسي|تذكر)/i,
      category: "ExamTip",
      priority: "high",
    },
    {
      regex: /(decide|decision|agreed|approved|قرر|اتفق|اعتماد)/i,
      category: "Decision",
      priority: "high",
    },
    {
      regex: /(warning|risk|danger|careful|تحذير|خطر|مشكلة)/i,
      category: "Warning",
      priority: "high",
    },
    {
      regex: /(defined as|means|definition|يعني|تعريف|المقصود)/i,
      category: "Definition",
      priority: "medium",
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
    const mins = Math.floor((seg.startTime || 0) / 60);
    const secs = Math.floor((seg.startTime || 0) % 60);
    const ts = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    for (const cue of cues) {
      if (cue.regex.test(seg.text || "")) {
        results.push({
          quote: seg.text,
          speaker: seg.speaker,
          timestamp: ts,
          category: cue.category,
          priority: cue.priority,
        });
        break;
      }
    }
    if (results.length >= 6) break;
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
        model: "gemini-4-hydrogen",
        contents: `Extract all key facts, definitions, technical terms, decisions, tasks, speakers, and timestamps from part ${idx + 1}/${chunks.length} of "${title}". Be faithful to the transcript and omit nothing important:\n\n${chunks[idx]}`,
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

export async function transcribeAndTranslateAudioChunk(params: {
  audioBase64?: string;
  mimeType?: string;
  interimText?: string;
  recentContext?: string;
  language?: string;
  offsetSeconds?: number;
  isMeeting?: boolean;
}): Promise<{ arabicText: string; text: string; detectedLanguage: string }> {
  const {
    audioBase64,
    mimeType = "audio/webm",
    interimText,
    recentContext,
    language = "auto",
    offsetSeconds = 0,
    isMeeting = false,
  } = params;

  // 1. Prefer Python FastAPI whisper/audio service when configured and audio bytes exist
  if (AI_SERVICE_URL && audioBase64 && audioBase64.length > 64) {
    try {
      const audioBytes = Buffer.from(audioBase64, "base64");
      if (audioBytes.length > 100) {
        const safeMime = mimeType.split(";")[0].trim() || "audio/webm";
        const ext = safeMime.includes("wav")
          ? ".wav"
          : safeMime.includes("mp4") || safeMime.includes("m4a")
            ? ".m4a"
            : safeMime.includes("ogg")
              ? ".ogg"
              : ".webm";
        const form = new FormData();
        form.append("file", new Blob([audioBytes], { type: safeMime }), `live_chunk${ext}`);
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
              detectedLanguage: data.detected_language || language || "auto",
            };
          }
        }
      }
    } catch {
      // Fallback gracefully to Gemini ASR
    }
  }

  const ai = getGeminiClient();

  if (ai && audioBase64 && audioBase64.length > 64) {
    try {
      let safeMime = mimeType.split(";")[0].trim();
      if (!safeMime || safeMime === "audio/webm") {
        safeMime = "audio/webm";
      }

      const forceArabic = language === "ar-forced";
      const langInstruction = forceArabic
        ? "يجب أن يكون الناتج باللغة العربية الفصحى حصراً."
        : language.startsWith("en")
          ? "Transcribe faithfully verbatim in the spoken English language without changing to another language."
          : "Transcribe faithfully verbatim in the original spoken language (Arabic, Egyptian Arabic, English, or mixed technical speech). Do NOT invent words.";

      const promptText = `Transcribe this live audio clip verbatim.
${langInstruction}
Recent context: "${recentContext || "Live session start"}"
Rules:
1. Return ONLY the exact spoken words cleanly without speaker labels, timestamps, or commentary.
2. If the audio clip contains only silence or noise with no speech, reply with exact token: [SILENCE]`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: safeMime,
                data: audioBase64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      });

      const rawOutput = (response.text || "").trim();
      if (
        rawOutput &&
        !rawOutput.includes("[صمت]") &&
        !rawOutput.toLowerCase().includes("[silence]")
      ) {
        const cleaned = rawOutput
          .replace(/\b(English|Translation|Speaker|Arabic|Transcript):\s*/gi, "")
          .trim();
        if (cleaned.length > 0) {
          return {
            arabicText: cleaned,
            text: cleaned,
            detectedLanguage: language === "auto" ? "Auto-detected" : language,
          };
        }
      }
    } catch (geminiError) {
      console.warn("Gemini live transcription warning:", geminiError);
    }
  }

  // Only clean user-spoken WebSpeech interim text if provided; never fabricate text
  if (interimText && interimText.trim()) {
    const trimmed = interimText.trim();
    return {
      arabicText: trimmed,
      text: trimmed,
      detectedLanguage: language || "Browser Speech",
    };
  }

  return {
    arabicText: "",
    text: "",
    detectedLanguage: language || "auto",
  };
}

// Generate Structured Arabic Summary strictly grounded in the transcript
export async function generateAiSummary(
  title: string,
  segments: TranscriptSegment[],
  type: "meeting" | "lecture" = "lecture",
  courseCode?: string,
): Promise<{
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: Array<{
    title: string;
    ownerName?: string;
    dueDate?: string;
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
Summarize "${title}" ${courseCode ? `(Course: ${courseCode})` : ""} strictly based ONLY on the transcript below.
STRICT GROUNDING RULES:
1. Do NOT invent any names, numbers, dates, tasks, or facts not explicitly in the transcript.
2. Respond in clear professional English matching the recording.

Transcript:
"""
${preparedTranscript}
"""

Format your Markdown summary with these headings:
# Executive Summary
## Key Points
## Detailed Topics Discussed
## Definitions & Key Terms
## Decisions & Action Items
## Highlighted Takeaways`
        : `أنت المساعد الذكي الأكاديمي والمهني المتخصص في منصة MeetMind AI.
مهمتك: تلخيص دقيق وشامل واحترافي لجلسة "${title}" ${courseCode ? `(مقرر: ${courseCode})` : ""} بناءً حصراً على النص المفرغ التالي.
القاعدة الصارمة: لا تختلق أو تبتكر أي معلومات لم تذكر في النص المفرغ. يجب أن يكون كل بند مستنداً إلى ما قاله المتحدثون فعلياً.
اكتب التلخيص باللغة العربية مع الحفاظ على المصطلحات التقنية الإنجليزية كما وردت.

النص المفرغ:
"""
${preparedTranscript}
"""

المطلوب إخراج التلخيص بالهيكل المنظم التالي:
# الفكرة العامة
(فقرة مكثفة تلخص الهدف والمحور الأساسي للجلسة)

## أهم النقاط
(قائمة نقطية بأبرز الأفكار المطروحة)

## شرح مختصر للموضوعات
(شرح موجز ومنظم للمفاهيم التي نوقشت)

## التعريفات والمصطلحات المهمة
(أي مصطلحات أو تعريفات علمية أو تقنية وردت)

## الأمثلة التي ذكرها المتحدث
(الأمثلة الواقعية أو التوضيحية التي استشهد بها المتحدث)

## القرارات والمهام إن وجدت
(ما تم الاتفاق عليه أو تكليف المشاركين به)

## النقاط التي أكد المتحدث على أهميتها
(ما شدد عليه المحاضر/المتحدث وركز عليه بشدة)

## الأسئلة والموضوعات المحتمل مراجعتها للامتحان
(إذا كانت محاضرة تعليمية، استخلص النقاط المرشحة للمراجعة أو الأسئلة التي طرحها الطلاب أو المحاضر)`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
      });

      const summaryText = response.text?.trim() || "";
      if (summaryText) {
        const keyPoints: string[] = [];
        const lines = summaryText.split("\n");
        let capturing = false;
        for (const line of lines) {
          if (line.includes("أهم النقاط") || line.includes("Key Points")) {
            capturing = true;
            continue;
          }
          if (capturing && line.startsWith("#")) {
            break;
          }
          if (capturing && (line.trim().startsWith("-") || line.trim().startsWith("*"))) {
            keyPoints.push(line.replace(/^[-*]\s*/, "").trim());
          }
        }

        return {
          summary: summaryText,
          keyPoints:
            keyPoints.length > 0 ? keyPoints.slice(0, 6) : segments.slice(0, 4).map((s) => s.text),
          decisions: [],
          actionItems: [],
        };
      }
    } catch (err) {
      console.warn("Gemini summary error, falling back to grounded extractor:", err);
    }
  }

  // Grounded Extractive Fallback (Strictly derived from actual transcript segments — no generic invented filler)
  const keywords = extractKeywordsWithFrequency(segments, 5).map((k) => k.term);
  const bulletLines = segments.slice(0, 5).map(
    (s) =>
      `- [${Math.floor(s.startTime / 60)
        .toString()
        .padStart(2, "0")}:${Math.floor(s.startTime % 60)
        .toString()
        .padStart(2, "0")}] ${s.speaker}: ${s.text}`,
  );
  const highlights = extractHighlightsFromSegments(segments);
  const extractedTasks: Array<{
    title: string;
    ownerName?: string;
    dueDate?: string;
    priority: "high" | "medium" | "low";
  }> = [];

  for (const s of segments) {
    if (/(action item|todo|must |need to|deadline|assign|يجب|سوف|تكليف|مهمة|تنفيذ)/i.test(s.text)) {
      extractedTasks.push({
        title: s.text.length > 120 ? `${s.text.slice(0, 120)}...` : s.text,
        dueDate: "Deadline not specified.",
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
    keyPoints: segments.slice(0, 4).map((s) => s.text),
    decisions: highlights.filter((h) => h.category === "Decision").map((h) => h.quote),
    actionItems: extractedTasks,
  };
}

// Generate Quiz directly grounded in the transcript and summary
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
      const prompt = `أنت بروفيسور وخبير تقييم أكاديمي في منصة MeetMind AI.
المهمة الصارمة: أنشئ اختباراً شاملاً ومتنوعاً من 6 إلى 8 أسئلة يغطي كامل أجزاء المحاضرة/الاجتماع: "${title}" (البداية، المنتصف، الخاتمة والتطبيقات).
${langDirective}

القواعد الأكاديمية الصارمة:
1. الأسئلة مستندة بنسبة 100% إلى النص المفرغ الفعلي دون أي اختلاق.
2. نوع في أنواع الأسئلة الأربعة لتشمل:
   - "multiple_choice" (اختيار من متعدد بأربعة خيارات دقيقة)
   - "true_false" (صح وخطأ، الخيارات ["True", "False"] أو ["صح (صواب)", "خطأ"])
   - "fill_in_the_blank" (أكمل الفراغ: السؤال يحتوي على فراغ "___" والإجابة الصحيحة كلمة أو مصطلح دقيق)
   - "short_answer" (سؤال مقالي تحليلي قصير مع نموذج إجابة وشرح استدلالي)
3. نوع في مستويات الصعوبة: "easy"، "medium"، "hard".
4. حدد القسم والزمن الفعلي (sectionRef، timestampRef).
5. ${avoidList ? `تجنب تكرار هذه الأسئلة التي طُرحت سابقاً: ${avoidList}` : `هذا الإصدار ${variant} من الاختبار.`}

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
    "question": "...",
    "type": "multiple_choice",
    "options": ["...", "...", "...", "..."],
    "correctOptionIndex": 0,
    "correctAnswerText": "...",
    "acceptableAnswers": [],
    "explanation": "...",
    "difficulty": "medium",
    "sectionRef": "...",
    "timestampRef": "02:15"
  }
]`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const jsonStr = (response.text || "").trim();
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length >= 3) {
        return {
          title:
            detectedLang === "en"
              ? `Comprehension Quiz (${variant > 1 ? `Variant ${variant}` : "Main"}): ${title}`
              : `اختبار الفهم الشامل (${variant > 1 ? `النموذج ${variant}` : "النموذج الرئيسي"}): ${title}`,
          courseCode,
          questions: parsed.map((q, idx) => ({
            id: `q_${Date.now()}_${idx + 1}`,
            question: q.question,
            type:
              q.type ||
              (idx % 4 === 0
                ? "multiple_choice"
                : idx % 4 === 1
                  ? "true_false"
                  : idx % 4 === 2
                    ? "fill_in_the_blank"
                    : "short_answer"),
            options:
              Array.isArray(q.options) && q.options.length > 0
                ? q.options
                : q.type === "true_false"
                  ? detectedLang === "en"
                    ? ["True", "False"]
                    : ["صح (صواب)", "خطأ"]
                  : [],
            correctOptionIndex: typeof q.correctOptionIndex === "number" ? q.correctOptionIndex : 0,
            correctAnswerText:
              q.correctAnswerText || (q.options ? q.options[q.correctOptionIndex || 0] : undefined),
            acceptableAnswers: Array.isArray(q.acceptableAnswers) ? q.acceptableAnswers : [],
            explanation:
              q.explanation ||
              (detectedLang === "en"
                ? "Directly verified from the recorded transcript."
                : "الإجابة مستخلصة وموثقة مباشرة من نص المحاضرة المسجل."),
            difficulty: (["easy", "medium", "hard"].includes(q.difficulty)
              ? q.difficulty
              : "medium") as "easy" | "medium" | "hard",
            sectionRef:
              q.sectionRef || (detectedLang === "en" ? "Transcript Section" : "محاور الجلسة"),
            timestampRef: q.timestampRef || "00:00",
          })),
        };
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
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: { responseMimeType: "application/json" },
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
}: {
  question: string;
  resourceId?: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
}): Promise<{
  answer: string;
  evidenceFound: boolean;
  citations: { speaker: string; timestamp: string; quote: string }[];
  suggestedFollowUps?: string[];
}> {
  const meetings = db.get("meetings");
  const lectures = db.get("lectures");
  const tasks = db.get("actionItems");

  const targetMeeting = resourceId ? meetings.find((m) => m.id === resourceId) : undefined;
  const targetLecture = resourceId ? lectures.find((l) => l.id === resourceId) : undefined;

  if (resourceId && !targetMeeting && !targetLecture) {
    return {
      answer: "Not mentioned in this recording.",
      evidenceFound: false,
      citations: [],
    };
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
        return {
          answer: data.evidenceFound ? data.answer : "Not mentioned in this recording.",
          evidenceFound: data.evidenceFound,
          citations: data.citations || [],
        };
      }
    } catch {
      // Fallback seamlessly to Gemini or deterministic transcript search
    }
  }

  const latestLecture = lectures[0];
  const latestMeeting = meetings[0];

  if (targetItem && targetSegments.length === 0) {
    return {
      answer: "Not mentioned in this recording.",
      evidenceFound: false,
      citations: [],
    };
  }

  // Build grounded transcript context
  let contextDetails = "";
  const lecturesToInclude = targetLecture
    ? [targetLecture]
    : targetMeeting
      ? []
      : lectures.slice(0, 4);
  for (const l of lecturesToInclude) {
    contextDetails += `[Lecture: "${l.title}" (${l.courseCode || "General"}, ${l.date})]:\n`;
    if (l.summary || l.studyNotes) contextDetails += `Summary: ${l.summary || l.studyNotes}\n`;
    if (l.segments && l.segments.length > 0) {
      contextDetails += `Transcript:\n`;
      l.segments.slice(0, 60).forEach((s) => {
        const mins = Math.floor(s.startTime / 60);
        const secs = Math.floor(s.startTime % 60);
        contextDetails += `[${mins}:${secs < 10 ? "0" : ""}${secs}] ${s.speaker}: ${s.text}\n`;
      });
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
    if (m.segments && m.segments.length > 0) {
      contextDetails += `Transcript:\n`;
      m.segments.slice(0, 60).forEach((s) => {
        const mins = Math.floor(s.startTime / 60);
        const secs = Math.floor(s.startTime % 60);
        contextDetails += `[${mins}:${secs < 10 ? "0" : ""}${secs}] ${s.speaker}: ${s.text}\n`;
      });
    }
    contextDetails += `\n`;
  }

  if (!targetItem && tasks.length > 0) {
    contextDetails += `[Extracted Tasks]:\n`;
    tasks.slice(0, 15).forEach((t) => {
      contextDetails += `- ${t.title} (Owner: ${t.ownerName || "Unassigned"}, Deadline: ${t.deadlineText || t.dueDate || "Deadline not specified."})\n`;
    });
  }

  const ai = getGeminiClient();
  if (ai && contextDetails.trim().length > 0) {
    try {
      const strictSystemInstruction = `You are the strict transcript-grounded Q&A assistant for MeetMind AI.
Rules:
1. Answer ONLY using facts explicitly stated in the provided recording transcript(s) and extracted records below.
2. NEVER invent, guess, or use external facts when asked about a recording.
3. If the answer cannot be verified directly from the provided transcript(s), respond EXACTLY with: "Not mentioned in this recording."
4. Cite speaker names and timestamps [MM:SS] when evidence exists.
5. Respond in the same language as the user's question (unless refusing with "Not mentioned in this recording.").`;

      const recentHistory = history
        .slice(-10)
        .filter((h) => h.text && h.text.trim())
        .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`)
        .join("\n\n");

      const prompt = `${contextDetails}\n${recentHistory ? `[History]:\n${recentHistory}\n\n` : ""}[Question]:\n"${question}"`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: { systemInstruction: strictSystemInstruction },
      });

      const replyText = (response.text || "").trim();
      const notMentioned =
        !replyText ||
        replyText.includes("Not mentioned in this recording") ||
        replyText.includes("غير مذكور في هذا التسجيل");

      if (notMentioned) {
        return {
          answer: "Not mentioned in this recording.",
          evidenceFound: false,
          citations: [],
        };
      }

      const activeSegments =
        targetSegments.length > 0
          ? targetSegments
          : [...(latestLecture?.segments || []), ...(latestMeeting?.segments || [])];

      const grounded = answerGroundedQuestion(
        question,
        activeSegments,
        targetItem?.title || "Recordings",
      );

      return {
        answer: replyText,
        evidenceFound: true,
        citations: grounded.citations,
      };
    } catch (err) {
      console.warn("Gemini query warning:", err);
    }
  }

  // Deterministic grounded transcript search fallback (never fabricates answers)
  if (targetItem) {
    return answerGroundedQuestion(question, targetSegments, targetItem.title);
  }

  const allActive = [...(latestLecture?.segments || []), ...(latestMeeting?.segments || [])];
  if (allActive.length > 0) {
    return answerGroundedQuestion(
      question,
      allActive,
      latestLecture?.title || latestMeeting?.title || "Recordings",
    );
  }

  return {
    answer: "Not mentioned in this recording.",
    evidenceFound: false,
    citations: [],
  };
}

// Generate Spaced Repetition Flashcards Grounded in Transcript
export async function generateAiFlashcards(
  title: string,
  segments: TranscriptSegment[],
  summaryText?: string,
  courseCode?: string,
): Promise<Array<{ front: string; back: string }>> {
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
    "back": "..."
  }
]`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const parsed = JSON.parse(response.text || "[]");
      if (Array.isArray(parsed) && parsed.length >= 3) {
        return parsed
          .map((item) => ({
            front: String(item.front || "").trim(),
            back: String(item.back || "").trim(),
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
  return pool.slice(0, 6).map((seg) => ({
    front:
      detectedLang === "en"
        ? `What point was covered at [${Math.floor(seg.startTime / 60)}:${Math.floor(
            seg.startTime % 60,
          )
            .toString()
            .padStart(2, "0")}] in "${title}"?`
        : `ما هو المفهوم الذي تم تناوله في الجزء [${Math.floor(seg.startTime / 60)}:${Math.floor(
            seg.startTime % 60,
          )
            .toString()
            .padStart(2, "0")}] من "${title}"؟`,
    back: seg.text,
  }));
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
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: { responseMimeType: "application/json" },
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
