import { api, Job } from "@/lib/api-client";

export const ACTIVE_UPLOAD_JOB_STORAGE_KEY = "meetmind_active_upload_job";

export const ALLOWED_MEDIA_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".opus",
  ".webm",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".wma",
  ".aiff",
]);

export const MAX_MEDIA_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

export interface SavedActiveUploadJob {
  jobId: string;
  resourceId: string;
  resourceType: "meeting" | "lecture";
  title: string;
  startedAt: number;
}

export interface ProcessMediaParams {
  file: File;
  type: "meeting" | "lecture";
  title: string;
  courseCode?: string;
  language?: string;
  idempotencyKey?: string;
  onJobCreated?: (meta: { jobId: string; resourceId: string; resourceType: string }) => void;
  onProgress?: (job: Job) => void;
}

export function validateClientMediaFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: "No media file selected." };
  }
  if (file.size <= 0) {
    return { valid: false, error: "Selected media file is empty (0 bytes)." };
  }
  if (file.size > MAX_MEDIA_SIZE_BYTES) {
    return { valid: false, error: "File exceeds maximum supported size of 500 MB." };
  }

  const dotIdx = file.name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? file.name.slice(dotIdx).toLowerCase() : "";
  const isMediaMime =
    file.type.startsWith("audio/") || file.type.startsWith("video/") || file.type === "";

  if (ext && !ALLOWED_MEDIA_EXTENSIONS.has(ext) && !isMediaMime) {
    return {
      valid: false,
      error: `Unsupported file format (${ext}). Supported: MP3, WAV, M4A, AAC, FLAC, OGG, WEBM, MP4, MOV.`,
    };
  }

  return { valid: true };
}

export function saveActiveUploadJob(job: SavedActiveUploadJob): void {
  try {
    sessionStorage.setItem(ACTIVE_UPLOAD_JOB_STORAGE_KEY, JSON.stringify(job));
  } catch {
    // ignore storage quota/privacy errors
  }
}

export function getSavedActiveUploadJob(): SavedActiveUploadJob | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_UPLOAD_JOB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedActiveUploadJob;
    if (!parsed?.jobId) return null;
    // Ignore stale entries older than 6 hours
    if (Date.now() - (parsed.startedAt || 0) > 6 * 3600 * 1000) {
      sessionStorage.removeItem(ACTIVE_UPLOAD_JOB_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedActiveUploadJob(): void {
  try {
    sessionStorage.removeItem(ACTIVE_UPLOAD_JOB_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function hashUtf8Hex(input: string, seed = 0x811c9dc5): string {
  const bytes = new TextEncoder().encode(input);
  let hash = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildIdempotencyKey(file: File, title: string): string {
  const raw = `${file.name}|${file.size}|${file.lastModified}|${title.trim()}`;
  const h1 = hashUtf8Hex(raw, 0x811c9dc5);
  const h2 = hashUtf8Hex(raw.split("").reverse().join(""), 0x9e3779b1);
  return `idem_${h1}${h2}_${file.size}_${file.lastModified}`;
}

export async function processMedia(params: ProcessMediaParams): Promise<{
  jobId: string;
  resourceId: string;
  resourceType: "meeting" | "lecture";
  idempotencyKey: string;
}> {
  const { file, type, title, courseCode = "", language = "auto", onJobCreated } = params;

  const check = validateClientMediaFile(file);
  if (!check.valid) {
    throw new Error(check.error || "Invalid media file");
  }

  const idemKey = params.idempotencyKey || buildIdempotencyKey(file, title);

  const formData = new FormData();
  formData.append("type", type);
  formData.append("title", title.trim());
  formData.append("courseCode", courseCode.trim());
  formData.append("language", language);
  formData.append("idempotencyKey", idemKey);
  formData.append("file", file);

  const res = await api.uploadRecording(formData, idemKey);

  saveActiveUploadJob({
    jobId: res.jobId,
    resourceId: res.resourceId,
    resourceType: (res.resourceType as "meeting" | "lecture") || type,
    title: title.trim(),
    startedAt: Date.now(),
  });

  if (onJobCreated) {
    onJobCreated({
      jobId: res.jobId,
      resourceId: res.resourceId,
      resourceType: res.resourceType,
    });
  }

  return {
    jobId: res.jobId,
    resourceId: res.resourceId,
    resourceType: (res.resourceType as "meeting" | "lecture") || type,
    idempotencyKey: idemKey,
  };
}

export async function cancelMediaProcessing(jobId: string): Promise<Job> {
  const res = await api.cancelJob(jobId);
  clearSavedActiveUploadJob();
  return res.job;
}
