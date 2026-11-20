import { api, Job } from "@/lib/api-client";

export const ACTIVE_UPLOAD_JOB_STORAGE_KEY = "meetmind_active_upload_job";

export const BLOCKED_NON_MEDIA_EXTENSIONS = new Set([
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

export const MAX_MEDIA_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
const CHUNK_THRESHOLD_BYTES = 4 * 1024 * 1024; // Files > 4MB stream in 4MB binary chunks
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

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
  onUploadProgress?: (percent: number) => void;
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

  if (ext && BLOCKED_NON_MEDIA_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported non-media file format (${ext}). Please upload an audio or video file.`,
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

async function uploadLargeFileInChunks(params: {
  file: File;
  type: "meeting" | "lecture";
  title: string;
  courseCode: string;
  language: string;
  idempotencyKey: string;
  onUploadProgress?: (percent: number) => void;
}): Promise<{
  jobId: string;
  resourceId: string;
  resourceType: string;
}> {
  const { file, type, title, courseCode, language, idempotencyKey, onUploadProgress } = params;

  const initRes = await api.initChunkedUpload(
    {
      type,
      title: title.trim(),
      courseCode: courseCode.trim(),
      language,
      fileName: file.name,
      fileSize: file.size,
      idempotencyKey,
    },
    idempotencyKey,
  );

  if (initRes.deduplicated && initRes.jobId && initRes.resourceId) {
    return {
      jobId: initRes.jobId,
      resourceId: initRes.resourceId,
      resourceType: initRes.resourceType || type,
    };
  }

  if (!initRes.uploadId) {
    throw new Error("Failed to initialize chunked upload session.");
  }

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE_BYTES;
    const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
    const chunkBlob = file.slice(start, end);

    let uploaded = false;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await api.uploadChunk(initRes.uploadId, i, chunkBlob);
        uploaded = true;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    if (!uploaded) {
      throw lastErr instanceof Error ? lastErr : new Error("Failed to upload file chunk.");
    }

    if (onUploadProgress) {
      const pct = Math.min(95, Math.round(((i + 1) / totalChunks) * 90));
      onUploadProgress(pct);
    }
  }

  const doneRes = await api.completeChunkedUpload(initRes.uploadId);
  if (onUploadProgress) onUploadProgress(100);
  return {
    jobId: doneRes.jobId,
    resourceId: doneRes.resourceId,
    resourceType: doneRes.resourceType || type,
  };
}

export async function processMedia(params: ProcessMediaParams): Promise<{
  jobId: string;
  resourceId: string;
  resourceType: "meeting" | "lecture";
  idempotencyKey: string;
}> {
  const {
    file,
    type,
    title,
    courseCode = "",
    language = "auto",
    onJobCreated,
    onUploadProgress,
  } = params;

  const check = validateClientMediaFile(file);
  if (!check.valid) {
    throw new Error(check.error || "Invalid media file");
  }

  const idemKey = params.idempotencyKey || buildIdempotencyKey(file, title);

  let res: { jobId: string; resourceId: string; resourceType: string };
  if (file.size > CHUNK_THRESHOLD_BYTES) {
    res = await uploadLargeFileInChunks({
      file,
      type,
      title,
      courseCode,
      language,
      idempotencyKey: idemKey,
      onUploadProgress,
    });
  } else {
    const formData = new FormData();
    formData.append("type", type);
    formData.append("title", title.trim());
    formData.append("courseCode", courseCode.trim());
    formData.append("language", language);
    formData.append("idempotencyKey", idemKey);
    formData.append("file", file);

    res = await api.uploadRecording(formData, idemKey);
  }

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
