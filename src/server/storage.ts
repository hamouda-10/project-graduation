import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let cachedDataDir: string | null = null;
let cachedRecordingsDir: string | null = null;
let cachedChunksDir: string | null = null;
let cachedAvatarsDir: string | null = null;

function ensureWritableDir(candidate: string): boolean {
  try {
    fs.mkdirSync(candidate, { recursive: true });
    const probeFile = path.join(candidate, `.write_probe_${process.pid}_${Date.now()}`);
    fs.writeFileSync(probeFile, "ok");
    fs.unlinkSync(probeFile);
    return true;
  } catch {
    return false;
  }
}

export function getDataDir(): string {
  if (cachedDataDir) return cachedDataDir;

  const envDir = (process.env.MEETMIND_DATA_DIR || "").trim();
  const candidates = [
    ...(envDir ? [path.resolve(envDir)] : []),
    path.resolve(process.cwd(), "data"),
    path.join(os.tmpdir(), "meetmind-data"),
  ];

  for (const dir of candidates) {
    if (ensureWritableDir(dir)) {
      cachedDataDir = dir;
      return dir;
    }
  }

  // Last resort path
  const fallback = path.join(os.tmpdir(), "meetmind-data");
  cachedDataDir = fallback;
  return fallback;
}

export function getDbFilePath(): string {
  return path.join(getDataDir(), "meetmind_db.json");
}

export function getAvatarsDir(): string {
  if (cachedAvatarsDir) return cachedAvatarsDir;

  const envPath = (process.env.AVATARS_STORAGE_PATH || "").trim();
  const candidates = [
    ...(envPath ? [path.resolve(envPath)] : []),
    path.join(getDataDir(), "avatars"),
    path.join(os.tmpdir(), "meetmind-data", "avatars"),
  ];

  for (const dir of candidates) {
    if (ensureWritableDir(dir)) {
      cachedAvatarsDir = dir;
      return dir;
    }
  }

  const fallback = path.join(os.tmpdir(), "meetmind-data", "avatars");
  cachedAvatarsDir = fallback;
  return fallback;
}

export interface ValidatedProfileImage {
  ok: true;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  ext: ".jpg" | ".png" | ".webp";
  width: number;
  height: number;
  sizeBytes: number;
}

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
const MIN_AVATAR_DIM = 32;
const MAX_AVATAR_DIM = 4096;

function parsePngDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG signature (8 bytes) + IHDR length (4) + "IHDR" (4) + width (4) + height (4)
  if (buf.length < 24) return null;
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function parseJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= buf.length) {
    while (offset < buf.length && buf[offset] !== 0xff) offset++;
    while (offset < buf.length && buf[offset] === 0xff) offset++;
    if (offset >= buf.length) break;
    const marker = buf[offset];
    offset++;

    // Standalone markers without length
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 2 > buf.length) break;
    const segmentLength = buf.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buf.length) break;

    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (offset + 7 > buf.length) return null;
      const height = buf.readUInt16BE(offset + 3);
      const width = buf.readUInt16BE(offset + 5);
      if (!width || !height) return null;
      return { width, height };
    }
    offset += segmentLength;
  }
  return null;
}

function parseWebpDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  if (buf.subarray(0, 4).toString("ascii") !== "RIFF") return null;
  if (buf.subarray(8, 12).toString("ascii") !== "WEBP") return null;
  const chunkHeader = buf.subarray(12, 16).toString("ascii");

  if (chunkHeader === "VP8 " && buf.length >= 30) {
    // Lossy VP8 bitstream frame header
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return width && height ? { width, height } : null;
  }
  if (chunkHeader === "VP8L" && buf.length >= 25) {
    // Lossless VP8L
    if (buf[20] !== 0x2f) return null;
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return width && height ? { width, height } : null;
  }
  if (chunkHeader === "VP8X" && buf.length >= 30) {
    // Extended VP8X
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return width && height ? { width, height } : null;
  }
  return null;
}

export function validateProfileImageBuffer(
  buf: Buffer,
): ValidatedProfileImage | { ok: false; error: string } {
  if (!buf || buf.length === 0) {
    return { ok: false, error: "Uploaded image is empty." };
  }
  if (buf.length > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Profile image must be 5 MB or smaller." };
  }

  let mimeType: "image/jpeg" | "image/png" | "image/webp" | null = null;
  let ext: ".jpg" | ".png" | ".webp" | null = null;
  let dims: { width: number; height: number } | null = null;

  // Check real binary magic bytes (never trust client-declared MIME or extension)
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    mimeType = "image/png";
    ext = ".png";
    dims = parsePngDimensions(buf);
  } else if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    mimeType = "image/jpeg";
    ext = ".jpg";
    dims = parseJpegDimensions(buf);
  } else if (
    buf.length >= 16 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    mimeType = "image/webp";
    ext = ".webp";
    dims = parseWebpDimensions(buf);
  } else {
    return {
      ok: false,
      error: "Unsupported image format. Please upload a valid JPG, PNG, or WEBP image.",
    };
  }

  if (!dims || !Number.isFinite(dims.width) || !Number.isFinite(dims.height)) {
    return {
      ok: false,
      error: "Image file appears corrupted or unreadable. Please choose another image.",
    };
  }

  if (dims.width < MIN_AVATAR_DIM || dims.height < MIN_AVATAR_DIM) {
    return {
      ok: false,
      error: `Image is too small (${dims.width}x${dims.height}). Minimum size is ${MIN_AVATAR_DIM}x${MIN_AVATAR_DIM} pixels.`,
    };
  }

  if (dims.width > MAX_AVATAR_DIM || dims.height > MAX_AVATAR_DIM) {
    return {
      ok: false,
      error: `Image dimensions (${dims.width}x${dims.height}) exceed the ${MAX_AVATAR_DIM}x${MAX_AVATAR_DIM} limit.`,
    };
  }

  return {
    ok: true,
    mimeType,
    ext,
    width: dims.width,
    height: dims.height,
    sizeBytes: buf.length,
  };
}

export function resolveSafeAvatarPath(fileName: string): string {
  const dir = path.resolve(getAvatarsDir());
  const cleanName = path.basename(fileName || "").replace(/[^a-zA-Z0-9._-]/g, "");
  if (!cleanName) throw new Error("Invalid avatar filename.");
  const resolved = path.resolve(dir, cleanName);
  if (!resolved.startsWith(dir + path.sep)) {
    throw new Error("Invalid avatar storage path.");
  }
  return resolved;
}

export function deleteStoredAvatarFile(fileName?: string): void {
  if (!fileName) return;
  try {
    const filePath = resolveSafeAvatarPath(fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore cleanup failures
  }
}

export function getRecordingsDir(): string {
  if (cachedRecordingsDir) return cachedRecordingsDir;

  const envPath = (
    process.env.RECORDINGS_STORAGE_PATH ||
    process.env.STORAGE_RECORDINGS_DIR ||
    ""
  ).trim();
  const candidates = [
    ...(envPath ? [path.resolve(envPath)] : []),
    path.join(getDataDir(), "recordings"),
    path.join(os.tmpdir(), "meetmind-data", "recordings"),
  ];

  for (const dir of candidates) {
    if (ensureWritableDir(dir)) {
      cachedRecordingsDir = dir;
      return dir;
    }
  }

  const fallback = path.join(os.tmpdir(), "meetmind-data", "recordings");
  cachedRecordingsDir = fallback;
  return fallback;
}

export function getChunkUploadsDir(): string {
  const dir = path.join(getRecordingsDir(), ".uploads");
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // ignore
  }
  return dir;
}

export function getChunksDir(): string {
  if (cachedChunksDir) return cachedChunksDir;

  const envPath = (process.env.CHUNKS_STORAGE_PATH || "").trim();
  const candidates = [
    ...(envPath ? [path.resolve(envPath)] : []),
    path.join(getDataDir(), "chunks"),
    path.join(os.tmpdir(), "meetmind-data", "chunks"),
  ];

  for (const dir of candidates) {
    if (ensureWritableDir(dir)) {
      cachedChunksDir = dir;
      return dir;
    }
  }

  const fallback = path.join(os.tmpdir(), "meetmind-data", "chunks");
  cachedChunksDir = fallback;
  return fallback;
}

export function isStorageWritable(): boolean {
  return ensureWritableDir(getRecordingsDir());
}

export function sanitizeSafeFilename(originalName: string): string {
  const base = path.basename(originalName || "recording.bin");
  const ext = path
    .extname(base)
    .replace(/[^a-zA-Z0-9.]/g, "")
    .slice(0, 12);
  const stem = base
    .slice(0, ext ? -ext.length : undefined)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  const safeStem = stem || "recording";
  return `${safeStem}${ext || ".bin"}`;
}

export function resolveSafeRecordingPath(fileName: string): string {
  const dir = getRecordingsDir();
  const safeName = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${sanitizeSafeFilename(fileName)}`;
  const resolved = path.resolve(dir, safeName);
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error("Invalid recording storage path.");
  }
  return resolved;
}

export function verifySavedFileIntegrity(
  filePath: string,
  expectedSize?: number,
): { ok: boolean; actualSize: number; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { ok: false, actualSize: 0, error: "Saved media file not found on storage." };
  }
  const stat = fs.statSync(filePath);
  if (stat.size <= 0) {
    return { ok: false, actualSize: 0, error: "Uploaded file is empty (0 bytes)." };
  }
  if (typeof expectedSize === "number" && expectedSize > 0 && stat.size !== expectedSize) {
    return {
      ok: false,
      actualSize: stat.size,
      error: `Incomplete upload (${stat.size} of ${expectedSize} bytes saved).`,
    };
  }
  return { ok: true, actualSize: stat.size };
}

export interface BinaryContainerSignature {
  recognized: boolean;
  containerName: string;
  mimeType: string;
  isLikelyTextOrNonMedia: boolean;
}

/**
 * Inspects actual binary magic bytes of an uploaded media file.
 * Correctly identifies real containers even when the file extension does not match
 * (for example, a WebM/Opus stream downloaded with a `.m4a` filename).
 */
export function inspectMediaContainerSignature(filePath: string): BinaryContainerSignature {
  let buf: Buffer;
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      buf = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, buf, 0, 64, 0);
      buf = buf.subarray(0, bytesRead);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return {
      recognized: false,
      containerName: "unreadable",
      mimeType: "application/octet-stream",
      isLikelyTextOrNonMedia: false,
    };
  }

  if (buf.length < 4) {
    return {
      recognized: false,
      containerName: "truncated",
      mimeType: "application/octet-stream",
      isLikelyTextOrNonMedia: false,
    };
  }

  // WebM / Matroska (EBML header: 1A 45 DF A3)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return {
      recognized: true,
      containerName: "matroska,webm",
      mimeType: "audio/webm",
      isLikelyTextOrNonMedia: false,
    };
  }

  // ISO Base Media File Format: MP4 / M4A / MOV / 3GP ("ftyp" at offset 4, or "moov"/"mdat"/"wide"/"free")
  if (buf.length >= 8) {
    const boxType = buf.subarray(4, 8).toString("ascii");
    if (
      boxType === "ftyp" ||
      boxType === "moov" ||
      boxType === "mdat" ||
      boxType === "wide" ||
      boxType === "free"
    ) {
      const brand = buf.length >= 12 ? buf.subarray(8, 12).toString("ascii") : "";
      const isQuickTime = brand.startsWith("qt");
      const is3gp = brand.startsWith("3gp");
      return {
        recognized: true,
        containerName: isQuickTime ? "mov" : is3gp ? "3gp" : "mp4,m4a",
        mimeType: isQuickTime ? "video/quicktime" : "audio/mp4",
        isLikelyTextOrNonMedia: false,
      };
    }
  }

  // RIFF: WAV or AVI
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF") {
    const riffType = buf.subarray(8, 12).toString("ascii");
    if (riffType === "WAVE") {
      return {
        recognized: true,
        containerName: "wav",
        mimeType: "audio/wav",
        isLikelyTextOrNonMedia: false,
      };
    }
    if (riffType === "AVI ") {
      return {
        recognized: true,
        containerName: "avi",
        mimeType: "video/x-msvideo",
        isLikelyTextOrNonMedia: false,
      };
    }
  }

  // OGG / OPUS ("OggS")
  if (buf.subarray(0, 4).toString("ascii") === "OggS") {
    return {
      recognized: true,
      containerName: "ogg",
      mimeType: "audio/ogg",
      isLikelyTextOrNonMedia: false,
    };
  }

  // FLAC ("fLaC")
  if (buf.subarray(0, 4).toString("ascii") === "fLaC") {
    return {
      recognized: true,
      containerName: "flac",
      mimeType: "audio/flac",
      isLikelyTextOrNonMedia: false,
    };
  }

  // MP3 with ID3v2 header ("ID3")
  if (buf.subarray(0, 3).toString("ascii") === "ID3") {
    return {
      recognized: true,
      containerName: "mp3",
      mimeType: "audio/mp3",
      isLikelyTextOrNonMedia: false,
    };
  }

  // Raw MPEG / ADTS AAC frame sync (scan first 64 bytes for valid sync word)
  for (let i = 0; i < Math.min(buf.length - 1, 64); i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const layer = (buf[i + 1] >> 1) & 0x03;
      if (layer === 0 && (buf[i + 1] & 0xf6) === 0xf0) {
        return {
          recognized: true,
          containerName: "aac",
          mimeType: "audio/aac",
          isLikelyTextOrNonMedia: false,
        };
      }
      if (layer !== 0) {
        return {
          recognized: true,
          containerName: "mp3",
          mimeType: "audio/mp3",
          isLikelyTextOrNonMedia: false,
        };
      }
    }
  }

  // AIFF / AIFC ("FORM....AIFF")
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "FORM") {
    const formType = buf.subarray(8, 12).toString("ascii");
    if (formType === "AIFF" || formType === "AIFC") {
      return {
        recognized: true,
        containerName: "aiff",
        mimeType: "audio/aiff",
        isLikelyTextOrNonMedia: false,
      };
    }
  }

  // CAF ("caff")
  if (buf.subarray(0, 4).toString("ascii") === "caff") {
    return {
      recognized: true,
      containerName: "caf",
      mimeType: "audio/x-caf",
      isLikelyTextOrNonMedia: false,
    };
  }

  // AMR ("#!AMR")
  if (buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "#!AMR") {
    return {
      recognized: true,
      containerName: "amr",
      mimeType: "audio/amr",
      isLikelyTextOrNonMedia: false,
    };
  }

  // ASF / WMA / WMV (30 26 B2 75 8E 66 CF 11)
  if (
    buf.length >= 8 &&
    buf[0] === 0x30 &&
    buf[1] === 0x26 &&
    buf[2] === 0xb2 &&
    buf[3] === 0x75 &&
    buf[4] === 0x8e &&
    buf[5] === 0x66 &&
    buf[6] === 0xcf &&
    buf[7] === 0x11
  ) {
    return {
      recognized: true,
      containerName: "asf,wma",
      mimeType: "audio/x-ms-wma",
      isLikelyTextOrNonMedia: false,
    };
  }

  // Explicit non-media signatures (PDF, PNG, JPEG, ZIP, GIF, HTML/JSON text)
  const headAscii = buf.subarray(0, Math.min(buf.length, 16)).toString("ascii").trimStart();
  const isKnownNonMedia =
    headAscii.startsWith("%PDF-") ||
    headAscii.startsWith("<!DOCTYPE") ||
    headAscii.startsWith("<html") ||
    headAscii.startsWith("{") ||
    (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) || // PNG
    (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) || // JPEG
    (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04); // ZIP

  return {
    recognized: false,
    containerName: "unknown",
    mimeType: "application/octet-stream",
    isLikelyTextOrNonMedia: isKnownNonMedia,
  };
}
