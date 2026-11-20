import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;

function isPlaceholderKey(key: string): boolean {
  const upper = key.toUpperCase();
  return (
    key.length < 20 ||
    upper.includes("MY_GEMINI_API_KEY") ||
    upper.includes("YOUR_API_KEY") ||
    upper.includes("PLACEHOLDER") ||
    upper.includes("REPLACE_ME")
  );
}

export function getResolvedGeminiApiKey(): string | null {
  const raw = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  if (!raw || isPlaceholderKey(raw)) {
    return null;
  }
  return raw;
}

export function isGeminiConfigured(): boolean {
  return getResolvedGeminiApiKey() !== null;
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = getResolvedGeminiApiKey();
  if (!apiKey) {
    return null;
  }
  if (!aiInstance || cachedApiKey !== apiKey) {
    cachedApiKey = apiKey;
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

interface TranscriptionPartLike {
  text?: string;
  audioTranscription?: {
    text?: string;
  };
}

interface TranscriptionResponseLike {
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: TranscriptionPartLike[];
    };
  }>;
}

/**
 * Extracts verbatim transcript text from Gemini responses.
 * Dedicated ASR models like `gemini-3.5-transcribe` return speech output inside
 * non-text `part.audioTranscription.text` blocks while `response.text` is empty.
 */
export function extractGeminiTranscriptText(response: unknown): string {
  const resp = response as TranscriptionResponseLike | null | undefined;
  if (!resp) return "";

  const parts = resp.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    const audioPieces = parts
      .map((p) => (p?.audioTranscription?.text || "").trim())
      .filter(Boolean);
    if (audioPieces.length > 0) {
      return audioPieces.join(" ").trim();
    }

    const textPieces = parts.map((p) => (p?.text || "").trim()).filter(Boolean);
    if (textPieces.length > 0) {
      return textPieces.join(" ").trim();
    }
  }

  return typeof resp.text === "string" ? resp.text.trim() : "";
}
