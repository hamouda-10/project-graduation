/**
 * Arabic NLP and Text Normalization Utility
 * Provides native Arabic text processing, search normalization, and code-switching support.
 */

// Arabic Tashkeel (harakat / diacritics) regex
const TASHKEEL_REGEX = /[\u064B-\u0652\u0670\u0640]/g;

/**
 * Normalizes Arabic text for tolerant search and comparison:
 * - Removes diacritics (fatha, damma, kasra, sukun, tanween, dagger alif, tatweel)
 * - Normalizes Alef variants (أ, إ, آ, ٱ) -> ا
 * - Normalizes Ta Marbuta (ة) -> ه
 * - Normalizes Alef Maksura (ى) -> ي
 * - Collapses repeated whitespace
 */
export function normalizeArabic(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(TASHKEEL_REGEX, "") // Strip harakat & tatweel
    .replace(/[أإآٱ]/g, "ا") // Normalize alef variants
    .replace(/ة/g, "ه") // Normalize ta marbuta
    .replace(/ى/g, "ي") // Normalize alef maksura
    .replace(/[\u06CC]/g, "ي") // Persian/Urdu Yeh -> Arabic Yeh
    .replace(/[\u06A9]/g, "ك") // Persian/Urdu Keheh -> Arabic Kaf
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if the query is found within the target text,
 * using normalized Arabic comparison.
 */
export function matchesArabicQuery(
  target: string | null | undefined,
  query: string | null | undefined,
): boolean {
  if (!target || !query) return false;
  const normTarget = normalizeArabic(target);
  const normQuery = normalizeArabic(query);
  if (!normQuery) return false;

  // Direct substring check
  if (normTarget.includes(normQuery)) return true;

  // Multi-term AND match (e.g. "محاضره التسامح" matches "محاضرة عن التسامح")
  const tokens = normQuery.split(" ").filter((t) => t.length > 0);
  if (tokens.length > 1) {
    return tokens.every((token) => normTarget.includes(token));
  }

  return false;
}

/**
 * Formats seconds into MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) return "00:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
