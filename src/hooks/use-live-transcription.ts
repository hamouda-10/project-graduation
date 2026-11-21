import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { api, TranscriptSegmentItem } from "@/lib/api-client";
import { liveAudioTelemetry, resetLiveAudioTelemetry, useUIStore } from "@/stores/ui-store";

export interface LiveTranscriptSegment {
  id: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
  isFinal: boolean;
  sequenceNumber?: number;
  chunkId?: string;
  language?: string;
  confidence?: number;
}

export type LiveConnectionStatus = "connected" | "reconnecting" | "offline" | "recovering";

export type LiveRecordingStateMachine =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "READY"
  | "RECORDING"
  | "PAUSED"
  | "STOPPING"
  | "UPLOADING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface AudioInputDeviceItem {
  deviceId: string;
  label: string;
}

export interface RecordedAudioReview {
  recordingId: string;
  resourceType: "meeting" | "lecture";
  title: string;
  audioUrl: string;
  audioBlob: Blob | null;
  fileSizeBytes: number;
  durationSeconds: number;
  mimeType: string;
  fileName: string;
}

export interface RecoverableLiveSession {
  recordingId: string;
  type: "meeting" | "lecture";
  title: string;
  courseCode?: string;
  speakerName?: string;
  language: string;
  status: "Recording" | "Paused" | "Interrupted" | "Recovering";
  durationSeconds: number;
  lastSequenceNumber: number;
  segments: LiveTranscriptSegment[];
  pendingOfflineChunks: number;
  updatedAt: string;
}

export interface UseLiveTranscriptionOptions {
  type?: "meeting" | "lecture";
  title?: string;
  courseCode?: string;
  speakerName?: string;
  language?: string; // "auto" | "ar-EG" | "ar-SA" | "en" | "mixed"
  selectedDeviceId?: string;
  chunkDurationMs?: number; // default: 3500ms
  checkRecovery?: boolean;
  onSegmentFinalized?: (segment: LiveTranscriptSegment) => void;
  onError?: (error: string) => void;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string; confidence?: number };
    };
  };
}

interface QueuedAudioChunk {
  chunkId: string;
  recordingId: string;
  sequenceNumber: number;
  startTime: number;
  endTime: number;
  duration: number;
  speaker: string;
  language: string;
  isMeeting: boolean;
  mimeType: "audio/wav";
  audioBase64: string;
  createdAt: number;
  attempts: number;
}

const TARGET_SAMPLE_RATE = 16000;
const SILENCE_RMS_THRESHOLD = 0.0035;
const FINAL_FLUSH_MIN_RMS = 0.0012;
const MIN_CHUNK_DURATION_SEC = 0.35;
const ACTIVE_SESSION_STORAGE_KEY = "meetmind_active_session";
const IDB_NAME = "meetmind_live_audio_queue_v1";
const IDB_STORE = "chunks";

function formatLanguageLabel(language: string): string {
  switch (language) {
    case "en":
      return "English (US)";
    case "ar-SA":
      return "العربية الفصحى";
    case "ar-EG":
      return "العربية (مصر)";
    case "mixed":
      return "عربي / إنجليزي (Mixed AR/EN)";
    default:
      return "الكشف التلقائي (Multi-Language)";
  }
}

function getSpeechRecognitionLang(language: string): string {
  if (language === "en") return "en-US";
  if (language === "ar-SA") return "ar-SA";
  return "ar-EG";
}

function detectSupportedMediaRecorderMime(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore
    }
  }
  return "";
}

/**
 * Downsample Float32 mono PCM frames to 16kHz 16-bit PCM RIFF/WAV and encode to base64 + raw Int16Array.
 * Guarantees every single chunk is 100% self-contained and container-valid for multi-hour sessions.
 */
function encodePcmFramesToWav(
  chunks: Float32Array[],
  inputSampleRate: number,
): { base64: string; pcmInt16: Int16Array; durationSec: number; rms: number } {
  let totalLength = 0;
  for (const arr of chunks) totalLength += arr.length;
  if (totalLength === 0 || inputSampleRate <= 0) {
    return { base64: "", pcmInt16: new Int16Array(0), durationSec: 0, rms: 0 };
  }

  const merged = new Float32Array(totalLength);
  let offset = 0;
  let energySum = 0;
  for (const arr of chunks) {
    merged.set(arr, offset);
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      energySum += s * s;
    }
    offset += arr.length;
  }

  const rms = Math.sqrt(energySum / totalLength);
  const durationSec = totalLength / inputSampleRate;

  let resampled: Float32Array;
  if (inputSampleRate === TARGET_SAMPLE_RATE) {
    resampled = merged;
  } else {
    const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
    const newLength = Math.max(1, Math.round(totalLength / ratio));
    resampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = merged[idx] ?? 0;
      const s1 = merged[Math.min(idx + 1, totalLength - 1)] ?? s0;
      resampled[i] = s0 + (s1 - s0) * frac;
    }
  }

  const pcmInt16 = new Int16Array(resampled.length);
  const dataByteLength = resampled.length * 2;
  const wavBuffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(wavBuffer);

  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(pos + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataByteLength, true);

  let writeOffset = 44;
  for (let i = 0; i < resampled.length; i++) {
    const clamped = Math.max(-1, Math.min(1, resampled[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    pcmInt16[i] = int16;
    view.setInt16(writeOffset, int16, true);
    writeOffset += 2;
  }

  const bytes = new Uint8Array(wavBuffer);
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }

  return {
    base64: btoa(binary),
    pcmInt16,
    durationSec,
    rms,
  };
}

function buildWavBlobFromInt16Chunks(chunks: Int16Array[], sampleRate = TARGET_SAMPLE_RATE): Blob | null {
  let totalSamples = 0;
  for (const c of chunks) totalSamples += c.length;
  if (totalSamples === 0) return null;

  const dataByteLength = totalSamples * 2;
  const wavBuffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(wavBuffer);
  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(pos + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataByteLength, true);

  let writeOffset = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      view.setInt16(writeOffset, c[i], true);
      writeOffset += 2;
    }
  }

  return new Blob([wavBuffer], { type: "audio/wav" });
}

// Lightweight IndexedDB helper for offline audio chunk persistence (with safe no-op fallback)
function openChunkQueueDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: "chunkId" });
          store.createIndex("recordingId", "recordingId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPutChunk(chunk: QueuedAudioChunk): Promise<void> {
  const db = await openChunkQueueDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(chunk);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function idbDeleteChunk(chunkId: string): Promise<void> {
  const db = await openChunkQueueDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(chunkId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function idbGetChunksForSession(recordingId: string): Promise<QueuedAudioChunk[]> {
  const db = await openChunkQueueDb();
  if (!db) return [];
  const items = await new Promise<QueuedAudioChunk[]>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const idx = tx.objectStore(IDB_STORE).index("recordingId");
      const req = idx.getAll(IDBKeyRange.only(recordingId));
      req.onsuccess = () => resolve((req.result as QueuedAudioChunk[]) || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  db.close();
  return items.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

async function idbClearSessionChunks(recordingId: string): Promise<void> {
  const chunks = await idbGetChunksForSession(recordingId);
  if (chunks.length === 0) return;
  const db = await openChunkQueueDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      for (const c of chunks) store.delete(c.chunkId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

function sortAndMergeSegments(
  existing: LiveTranscriptSegment[],
  incoming: LiveTranscriptSegment,
): LiveTranscriptSegment[] {
  const trimmed = incoming.text.trim();
  if (!trimmed) return existing;

  const isDuplicate = existing.some(
    (s) =>
      (incoming.chunkId && s.chunkId === incoming.chunkId) ||
      (typeof incoming.sequenceNumber === "number" &&
        typeof s.sequenceNumber === "number" &&
        s.sequenceNumber === incoming.sequenceNumber) ||
      s.text.trim() === trimmed ||
      (Math.abs(s.startTime - incoming.startTime) < 2.5 &&
        (s.text.includes(trimmed) || trimmed.includes(s.text))),
  );
  if (isDuplicate) return existing;

  const next = [...existing, { ...incoming, text: trimmed, isFinal: true }];
  next.sort((a, b) => {
    if (typeof a.sequenceNumber === "number" && typeof b.sequenceNumber === "number") {
      return a.sequenceNumber - b.sequenceNumber;
    }
    return (a.startTime || 0) - (b.startTime || 0);
  });
  return next;
}

function mapServerSegments(raw: TranscriptSegmentItem[] = []): LiveTranscriptSegment[] {
  return raw
    .filter((s) => typeof s.text === "string" && s.text.trim().length > 0)
    .map((s) => ({
      id: s.id,
      speaker: s.speaker || "المتحدث 1",
      startTime: Number(s.startTime) || 0,
      endTime: Math.max(Number(s.endTime) || 0, (Number(s.startTime) || 0) + 1),
      text: s.text.trim(),
      isFinal: true,
      sequenceNumber: typeof s.sequenceNumber === "number" ? s.sequenceNumber : undefined,
      chunkId: s.chunkId,
      language: s.language,
      confidence: s.confidence,
    }))
    .sort((a, b) => {
      if (typeof a.sequenceNumber === "number" && typeof b.sequenceNumber === "number") {
        return a.sequenceNumber - b.sequenceNumber;
      }
      return a.startTime - b.startTime;
    });
}

function isTransientNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (!(err instanceof Error)) return true;
  const typed = err as Error & { status?: number };
  if (typed.status && [408, 429, 500, 502, 503, 504].includes(typed.status)) return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("abort") ||
    msg.includes("timeout") ||
    msg.includes("temporarily") ||
    msg.includes("rate")
  );
}

export function useLiveTranscription(options: UseLiveTranscriptionOptions = {}) {
  const {
    type = "meeting",
    title = "تسجيل مباشر جديد",
    courseCode = "GEN 101",
    speakerName = "المتحدث 1",
    language = "auto",
    selectedDeviceId = "default",
    chunkDurationMs = 3500,
    checkRecovery = false,
    onSegmentFinalized,
    onError,
  } = options;

  const [stateMachine, setStateMachine] = useState<LiveRecordingStateMachine>("IDLE");
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [segments, setSegments] = useState<LiveTranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string>("");
  const [detectedLanguage, setDetectedLanguage] = useState<string>(formatLanguageLabel(language));
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>([
    0.1, 0.2, 0.15, 0.3, 0.2, 0.1, 0.25, 0.15,
  ]);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<LiveConnectionStatus>(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "connected",
  );
  const [pendingChunksCount, setPendingChunksCount] = useState(0);
  const [recoverableSession, setRecoverableSession] = useState<RecoverableLiveSession | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [canRetryFinalize, setCanRetryFinalize] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioInputDeviceItem[]>([]);
  const [recordedAudioReview, setRecordedAudioReview] = useState<RecordedAudioReview | null>(null);

  // Audio & browser capture refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaRecorderMimeRef = useRef<string>("");
  const mediaRecorderBlobsRef = useRef<Blob[]>([]);
  const sessionInt16ChunksRef = useRef<Int16Array[]>([]);
  const sessionInt16SamplesCountRef = useRef<number>(0);
  const objectUrlRef = useRef<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Continuous PCM accumulator (cleared every chunk so memory stays flat over 2+ hours)
  const pcmBuffersRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(48000);
  const hangoverChunksRef = useRef<number>(0);

  // Live session & queue refs
  const recordingIdRef = useRef<string | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const segmentsRef = useRef<LiveTranscriptSegment[]>([]);
  const elapsedSecondsRef = useRef<number>(0);
  const sequenceNumberRef = useRef<number>(0);
  const lastChunkEndSecRef = useRef<number>(0);
  const lastSpeechEndSecRef = useRef<number>(0);
  const queueRef = useRef<QueuedAudioChunk[]>([]);
  const isDrainingRef = useRef<boolean>(false);
  const activeMetaRef = useRef<{
    type: "meeting" | "lecture";
    title: string;
    courseCode: string;
    speakerName: string;
    language: string;
    selectedDeviceId: string;
  }>({ type, title, courseCode, speakerName, language, selectedDeviceId });

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  useEffect(() => {
    activeMetaRef.current = {
      type,
      title,
      courseCode,
      speakerName,
      language,
      selectedDeviceId,
    };
  }, [type, title, courseCode, speakerName, language, selectedDeviceId]);

  useEffect(() => {
    setDetectedLanguage(formatLanguageLabel(language));
  }, [language]);

  // Enumerate available microphone input devices
  const refreshAudioDevices = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== "function"
    ) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((d) => d.kind === "audioinput")
        .map((d, idx) => ({
          deviceId: d.deviceId || `mic_${idx}`,
          label: d.label || `ميكروفون ${idx + 1} (Microphone ${idx + 1})`,
        }));
      setAudioDevices(inputs);
    } catch {
      // ignore enumeration restrictions prior to permission
    }
  }, []);

  useEffect(() => {
    if (checkRecovery) {
      void refreshAudioDevices();
    }
  }, [checkRecovery, refreshAudioDevices]);

  const wordCount = useMemo(() => {
    const joined = segments.map((s) => s.text).join(" ").trim();
    if (!joined) return 0;
    return joined.split(/\s+/).filter(Boolean).length;
  }, [segments]);

  // Helper: persist browser-recognized final phrase immediately to backend DB so words are never lost
  const persistBrowserFinalSegment = useCallback(
    async (phrase: string, confidence?: number) => {
      const recId = recordingIdRef.current;
      const trimmed = phrase.trim();
      if (!trimmed) return;

      const meta = activeMetaRef.current;
      const nowSec = Math.max(elapsedSecondsRef.current, lastSpeechEndSecRef.current + 1);
      const startSec = Math.max(0, Math.round(lastSpeechEndSecRef.current));
      const endSec = Math.max(Math.round(nowSec), startSec + 1);
      lastSpeechEndSecRef.current = endSec;

      const seq = sequenceNumberRef.current++;
      const chunkId = `${recId || "local"}_speech_${seq}`;

      const seg: LiveTranscriptSegment = {
        id: `seg_${recId || "live"}_${seq}`,
        speaker: meta.speakerName,
        startTime: startSec,
        endTime: endSec,
        text: trimmed,
        isFinal: true,
        sequenceNumber: seq,
        chunkId,
        language: meta.language,
        confidence: typeof confidence === "number" && confidence > 0 ? Number(confidence.toFixed(2)) : undefined,
      };

      const merged = sortAndMergeSegments(segmentsRef.current, seg);
      if (merged.length !== segmentsRef.current.length) {
        segmentsRef.current = merged;
        setSegments(merged);
        if (onSegmentFinalized) onSegmentFinalized(seg);

        if (recId) {
          try {
            await api.appendTranscriptSegment({
              recordingId: recId,
              segment: {
                id: seg.id,
                speaker: seg.speaker,
                startTime: seg.startTime,
                endTime: seg.endTime,
                text: seg.text,
                isFinal: true,
                sequenceNumber: seg.sequenceNumber,
                chunkId: seg.chunkId,
              },
            });
          } catch {
            // Will be merged automatically on reconnect or finalize
          }
        }
      }
    },
    [onSegmentFinalized],
  );

  // Drain queued audio chunks sequentially with exponential backoff and idempotency
  const drainQueue = useCallback(async (): Promise<boolean> => {
    if (isDrainingRef.current) return false;
    if (queueRef.current.length === 0) {
      setPendingChunksCount(0);
      setIsProcessingChunk(false);
      return true;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setConnectionStatus("offline");
      setPendingChunksCount(queueRef.current.length);
      return false;
    }

    isDrainingRef.current = true;
    setIsProcessingChunk(true);

    try {
      while (queueRef.current.length > 0) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setConnectionStatus("offline");
          return false;
        }

        const item = queueRef.current[0];
        const recentContext = segmentsRef.current
          .slice(-3)
          .map((s) => s.text)
          .join(" ")
          .slice(-400);

        try {
          const data = await api.sendLiveChunk({
            recordingId: item.recordingId,
            sessionId: item.recordingId,
            chunkId: item.chunkId,
            sequenceNumber: item.sequenceNumber,
            chunkIndex: item.sequenceNumber,
            audioBase64: item.audioBase64,
            mimeType: item.mimeType,
            startTime: item.startTime,
            endTime: item.endTime,
            duration: item.duration,
            speaker: item.speaker,
            language: item.language,
            isMeeting: item.isMeeting,
            recentContext,
          });

          // Chunk confirmed by backend (whether speech, silence, or duplicate) -> remove from queue & IDB
          queueRef.current.shift();
          await idbDeleteChunk(item.chunkId);
          setPendingChunksCount(queueRef.current.length);
          setConnectionStatus("connected");
          setError((prev) => (prev && prev.includes("الشبكة") ? null : prev));

          const rawTranscript = (data.text || data.arabicText || "").trim();
          const isPlaceholder =
            !rawTranscript ||
            Boolean(data.isSilence) ||
            rawTranscript === "[صمت]" ||
            rawTranscript.toLowerCase().includes("[silence]") ||
            rawTranscript.includes("جاري الاستماع") ||
            rawTranscript.includes("جاري تفريغ") ||
            rawTranscript.includes("جاري المعالجة");

          if (!isPlaceholder) {
            const newSeg: LiveTranscriptSegment = {
              id: data.segmentId || `seg_${item.recordingId}_${item.sequenceNumber}`,
              speaker: data.speaker || item.speaker,
              startTime: data.startTime ?? item.startTime,
              endTime: data.endTime ?? item.endTime,
              text: rawTranscript,
              isFinal: true,
              sequenceNumber: item.sequenceNumber,
              chunkId: item.chunkId,
              language: data.detectedLanguage || item.language,
            };

            const merged = sortAndMergeSegments(segmentsRef.current, newSeg);
            if (merged.length !== segmentsRef.current.length) {
              segmentsRef.current = merged;
              setSegments(merged);
              lastSpeechEndSecRef.current = Math.max(lastSpeechEndSecRef.current, newSeg.endTime);
              if (onSegmentFinalized) onSegmentFinalized(newSeg);
            }

            if (data.detectedLanguage) {
              setDetectedLanguage(data.detectedLanguage);
            }

            setInterimText("");
          }
        } catch (err) {
          item.attempts += 1;
          await idbPutChunk(item);

          if (isTransientNetworkError(err)) {
            const offline = typeof navigator !== "undefined" && !navigator.onLine;
            setConnectionStatus(offline ? "offline" : "reconnecting");
            const backoffMs = Math.min(10000, 1000 * Math.pow(2, Math.min(item.attempts - 1, 3)));
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              void drainQueue();
            }, backoffMs);
            return false;
          }

          // Non-retryable ASR error (e.g. 422 / 402 billing): audio chunk was already persisted on disk by server!
          const status = (err as Error & { status?: number })?.status;
          if (status === 422 || status === 403 || status === 404 || item.attempts >= 3) {
            queueRef.current.shift();
            await idbDeleteChunk(item.chunkId);
            setPendingChunksCount(queueRef.current.length);
            // If browser SpeechRecognition already captured segments, don't alarm user with redundant toast on every chunk
            if (segmentsRef.current.length === 0) {
              const message =
                err instanceof Error
                  ? err.message
                  : "تعذر تفريغ المقطع الصوتي عبر الخادم. تم حفظ الصوت بأمان.";
              setError(message);
            }
            continue;
          }
          return false;
        }
      }

      return true;
    } finally {
      isDrainingRef.current = false;
      setPendingChunksCount(queueRef.current.length);
      setIsProcessingChunk(queueRef.current.length > 0 && isDrainingRef.current);
    }
  }, [onSegmentFinalized]);

  // Flush accumulated PCM frames into a self-contained 16kHz mono WAV chunk & enqueue
  const flushPcmBufferToQueue = useCallback(
    async (forceFlush = false) => {
      const recId = recordingIdRef.current;
      if (!recId || pcmBuffersRef.current.length === 0) return;

      const frames = pcmBuffersRef.current;
      pcmBuffersRef.current = [];

      const { base64, pcmInt16, durationSec, rms } = encodePcmFramesToWav(
        frames,
        sampleRateRef.current,
      );
      if (!base64 || durationSec < MIN_CHUNK_DURATION_SEC) return;

      // Always keep local 16kHz PCM archive up to 45 mins (~86MB) for immediate local WAV playback after Stop
      if (pcmInt16.length > 0 && sessionInt16SamplesCountRef.current < TARGET_SAMPLE_RATE * 2700) {
        sessionInt16ChunksRef.current.push(pcmInt16);
        sessionInt16SamplesCountRef.current += pcmInt16.length;
      }

      const hasSpeech = rms >= SILENCE_RMS_THRESHOLD;
      if (hasSpeech) {
        hangoverChunksRef.current = 1;
      } else if (hangoverChunksRef.current > 0) {
        hangoverChunksRef.current -= 1;
      } else if (forceFlush && rms >= FINAL_FLUSH_MIN_RMS) {
        // allow quiet final flush so no trailing speech is lost
      } else {
        lastChunkEndSecRef.current += durationSec;
        return;
      }

      const seq = sequenceNumberRef.current++;
      const startSec = Math.max(0, Math.round(lastChunkEndSecRef.current));
      const nextEnd = lastChunkEndSecRef.current + durationSec;
      lastChunkEndSecRef.current = nextEnd;
      const endSec = Math.max(Math.round(nextEnd), startSec + 1);
      const meta = activeMetaRef.current;

      const queued: QueuedAudioChunk = {
        chunkId: `${recId}_seq_${seq}`,
        recordingId: recId,
        sequenceNumber: seq,
        startTime: startSec,
        endTime: endSec,
        duration: Number(durationSec.toFixed(2)),
        speaker: meta.speakerName,
        language: meta.language,
        isMeeting: meta.type === "meeting",
        mimeType: "audio/wav",
        audioBase64: base64,
        createdAt: Date.now(),
        attempts: 0,
      };

      queueRef.current.push(queued);
      setPendingChunksCount(queueRef.current.length);
      await idbPutChunk(queued);
      void drainQueue();
    },
    [drainQueue],
  );

  // Release all mic/audio/timer/speech resources cleanly
  const releaseCaptureResources = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.stop();
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;

    if (processorNodeRef.current) {
      try {
        processorNodeRef.current.onaudioprocess = null;
        processorNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      processorNodeRef.current = null;
    }
    if (muteGainRef.current) {
      try {
        muteGainRef.current.disconnect();
      } catch {
        // ignore
      }
      muteGainRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    pcmBuffersRef.current = [];
    resetLiveAudioTelemetry();
  }, []);

  // Start Web Speech API for instantaneous zero-latency PARTIAL preview + resilient FINAL segment capture
  const startSpeechRecognitionPreview = useCallback(
    (langCode: string) => {
      const SpeechRecognitionClass =
        (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
          .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
          .webkitSpeechRecognition;
      if (!SpeechRecognitionClass) return;

      try {
        const recognizer = new SpeechRecognitionClass();
        recognizer.continuous = true;
        recognizer.interimResults = true;
        recognizer.lang = getSpeechRecognitionLang(langCode);

        recognizer.onresult = (event: SpeechRecognitionEvent) => {
          if (!isRecordingRef.current || isPausedRef.current) return;
          let partial = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const item = event.results[i];
            const transcript = item[0]?.transcript || "";
            const confidence = item[0]?.confidence;
            if (item.isFinal) {
              const finalPhrase = transcript.trim();
              if (finalPhrase) {
                void persistBrowserFinalSegment(finalPhrase, confidence);
              }
            } else if (transcript) {
              partial += (partial ? " " : "") + transcript;
            }
          }
          setInterimText(partial.trim());
        };

        recognizer.onerror = () => {
          // Silent — continuous WAV chunk pipeline + auto-restart handle interruptions seamlessly
        };

        recognizer.onend = () => {
          if (
            isRecordingRef.current &&
            !isPausedRef.current &&
            speechRecognitionRef.current === recognizer
          ) {
            setTimeout(() => {
              if (
                isRecordingRef.current &&
                !isPausedRef.current &&
                speechRecognitionRef.current === recognizer
              ) {
                try {
                  recognizer.start();
                } catch {
                  // ignore rapid restart collision
                }
              }
            }, 150);
          }
        };

        recognizer.start();
        speechRecognitionRef.current = recognizer;
      } catch {
        // Browser does not support SpeechRecognition — backend WAV ASR handles 100% of transcription
      }
    },
    [persistBrowserFinalSegment],
  );

  // Attach microphone stream to Web Audio API (Visualizer + continuous 16kHz PCM chunk capture) + MediaRecorder archive
  const startMicrophoneAudioGraph = useCallback(
    async (langCode: string, deviceId?: string) => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("المتصفح الحالي لا يدعم الوصول إلى الميكروفون (getUserMedia).");
      }

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      };
      if (deviceId && deviceId !== "default") {
        audioConstraints.deviceId = { exact: deviceId };
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch {
        // Fallback to default audio constraint if specific deviceId or constraint was rejected
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      mediaStreamRef.current = stream;
      void refreshAudioDevices();

      // Start parallel MediaRecorder with dynamically detected browser MIME type for local archival
      try {
        const supportedMime = detectSupportedMediaRecorderMime();
        mediaRecorderMimeRef.current = supportedMime || "audio/webm";
        mediaRecorderBlobsRef.current = [];
        const recorder = new MediaRecorder(
          stream,
          supportedMime ? { mimeType: supportedMime } : undefined,
        );
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            mediaRecorderBlobsRef.current.push(ev.data);
          }
        };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      } catch {
        // Web Audio PCM WAV builder serves as universal primary audio container
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume().catch(() => {});
      }
      audioContextRef.current = audioCtx;
      sampleRateRef.current = audioCtx.sampleRate || 48000;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // 1. Live spectrum & waveform visualizer
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyserRef.current = analyser;

      // 2. Continuous lossless PCM capture processor (connected to zero-gain mute node so no speaker echo)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;

      processor.onaudioprocess = (event) => {
        if (!isRecordingRef.current || isPausedRef.current) return;
        const inputData = event.inputBuffer.getChannelData(0);
        if (inputData && inputData.length > 0) {
          pcmBuffersRef.current.push(new Float32Array(inputData));
        }
      };

      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioCtx.destination);
      processorNodeRef.current = processor;
      muteGainRef.current = muteGain;

      // Start meter animation loop
      const bufferLength = analyser.frequencyBinCount;
      const freqArray = new Uint8Array(bufferLength);
      const timeArray = new Uint8Array(bufferLength);
      let lastReactUpdate = 0;

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(freqArray);
        analyserRef.current.getByteTimeDomainData(timeArray);

        let sumSq = 0;
        let peakVal = 0;
        for (let i = 0; i < 32; i++) {
          const v = (freqArray[i] || 0) / 255;
          liveAudioTelemetry.bands[i] = v;
          if (v > peakVal) peakVal = v;
        }
        for (let i = 0; i < bufferLength; i++) {
          const sample = ((timeArray[i] || 128) - 128) / 128;
          liveAudioTelemetry.waveform[i] = sample;
          sumSq += sample * sample;
        }

        const rms = Math.min(1, Math.sqrt(sumSq / bufferLength) * 3.2);
        liveAudioTelemetry.active = !isPausedRef.current;
        liveAudioTelemetry.rms = isPausedRef.current ? 0 : rms;
        liveAudioTelemetry.peak = isPausedRef.current ? 0 : peakVal;
        liveAudioTelemetry.updatedAt = performance.now();

        const now = performance.now();
        if (now - lastReactUpdate > 85) {
          lastReactUpdate = now;
          const step = Math.floor(bufferLength / 8);
          const bars: number[] = [];
          for (let i = 0; i < 8; i++) {
            const val = freqArray[i * step] || 0;
            bars.push(Math.max(0.12, Math.min(1.0, val / 255)));
          }
          setAudioLevels(bars);
        }

        animationFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();

      // Start instant partial preview
      startSpeechRecognitionPreview(langCode);

      // Listen for unexpected mic hardware disconnection
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (isRecordingRef.current) {
            const msg = "تم فصل الميكروفون بشكل غير متوقع. تم حفظ المقاطع السابقة بأمان.";
            setError(msg);
            if (onError) onError(msg);
          }
        };
      });

      // Start 1s elapsed timer
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        if (isRecordingRef.current && !isPausedRef.current) {
          setElapsedSeconds((prev) => prev + 1);
        }
      }, 1000);

      // Start periodic self-contained WAV chunk dispatcher
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = setInterval(() => {
        if (isRecordingRef.current && !isPausedRef.current) {
          void flushPcmBufferToQueue(false);
        }
      }, chunkDurationMs);
    },
    [
      chunkDurationMs,
      flushPcmBufferToQueue,
      onError,
      refreshAudioDevices,
      startSpeechRecognitionPreview,
    ],
  );

  // Check for recoverable active/interrupted session on open
  useEffect(() => {
    if (!checkRecovery || isRecordingRef.current) return;
    let cancelled = false;

    const inspectRecovery = async () => {
      try {
        const res = await api.getActiveRecordingSession();
        if (cancelled || !res?.session) return;
        const s = res.session;
        const pendingChunks = await idbGetChunksForSession(s.recordingId);
        if (cancelled) return;
        setRecoverableSession({
          recordingId: s.recordingId,
          type: s.type,
          title: s.title,
          courseCode: s.courseCode,
          speakerName: s.speakerName,
          language: s.language || "auto",
          status: s.status,
          durationSeconds: s.durationSeconds || 0,
          lastSequenceNumber: typeof s.lastSequenceNumber === "number" ? s.lastSequenceNumber : -1,
          segments: mapServerSegments(s.segments),
          pendingOfflineChunks: pendingChunks.length,
          updatedAt: s.updatedAt,
        });
      } catch {
        // non-fatal when offline or unauthenticated
      }
    };

    void inspectRecovery();
    return () => {
      cancelled = true;
    };
  }, [checkRecovery]);

  // Network online / offline monitoring & automatic reconnect resync
  useEffect(() => {
    const handleOnline = () => {
      setConnectionStatus("reconnecting");
      void drainQueue().then((drained) => {
        if (drained) {
          setConnectionStatus("connected");
        }
      });
      const activeId = recordingIdRef.current;
      if (activeId) {
        void api
          .getRecordingSessionTranscript(activeId)
          .then((res) => {
            if (res?.segments?.length) {
              let merged = [...segmentsRef.current];
              for (const seg of mapServerSegments(res.segments)) {
                merged = sortAndMergeSegments(merged, seg);
              }
              segmentsRef.current = merged;
              setSegments(merged);
            }
          })
          .catch(() => {});
      }
    };

    const handleOffline = () => {
      setConnectionStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [drainQueue]);

  // Mark session Interrupted on unexpected tab close / refresh while preserving IndexedDB chunks
  useEffect(() => {
    const handleBeforeUnload = () => {
      const recId = recordingIdRef.current;
      if (!isRecordingRef.current || !recId) return;
      try {
        const token =
          localStorage.getItem("meetmind_token") || sessionStorage.getItem("meetmind_token");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        void fetch(`/api/v1/recordings/session/${encodeURIComponent(recId)}/status`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            status: "Interrupted",
            durationSeconds: elapsedSecondsRef.current,
          }),
          keepalive: true,
        });
      } catch {
        // best-effort
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Revoke previous object URL safely
  const clearRecordedAudioReview = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setRecordedAudioReview(null);
  }, []);

  // Start a brand-new live recording session
  const startRecording = async () => {
    setError(null);
    setCanRetryFinalize(false);
    clearRecordedAudioReview();
    setStateMachine("REQUESTING_PERMISSION");

    try {
      // 1. Create persistent recording session in backend DB first
      const session = await api.startRecordingSession({
        type,
        title,
        courseCode,
        speakerName,
        language,
      });

      const recId = session.recordingId;
      setRecordingId(recId);
      recordingIdRef.current = recId;
      setRecoverableSession(null);
      segmentsRef.current = [];
      setSegments([]);
      setInterimText("");
      sequenceNumberRef.current = 0;
      lastChunkEndSecRef.current = 0;
      lastSpeechEndSecRef.current = 0;
      hangoverChunksRef.current = 0;
      queueRef.current = [];
      sessionInt16ChunksRef.current = [];
      sessionInt16SamplesCountRef.current = 0;
      mediaRecorderBlobsRef.current = [];
      setPendingChunksCount(0);

      try {
        sessionStorage.setItem(
          ACTIVE_SESSION_STORAGE_KEY,
          JSON.stringify({
            recordingId: recId,
            type,
            title,
            courseCode,
            language,
            startedAt: Date.now(),
          }),
        );
      } catch {
        // ignore storage restrictions
      }

      // 2. Request microphone & initialize continuous 16kHz PCM WAV pipeline
      setStateMachine("READY");
      setIsRecording(true);
      isRecordingRef.current = true;
      setIsPaused(false);
      isPausedRef.current = false;
      setElapsedSeconds(0);
      setConnectionStatus(navigator.onLine ? "connected" : "offline");

      await startMicrophoneAudioGraph(language, selectedDeviceId);
      setStateMachine("RECORDING");
      useUIStore.getState().setAudioSystemState("Recording");
    } catch (err: unknown) {
      isRecordingRef.current = false;
      isPausedRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      setStateMachine("IDLE");
      releaseCaptureResources();
      useUIStore.getState().setAudioSystemState("Ready", 0);

      const createdId = recordingIdRef.current;
      if (createdId && segmentsRef.current.length === 0) {
        recordingIdRef.current = null;
        setRecordingId(null);
        try {
          sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
          if (type === "meeting") await api.deleteMeeting(createdId);
          else await api.deleteLecture(createdId);
        } catch {
          // ignore
        }
      }

      const rawMsg = err instanceof Error ? err.message : "";
      const errMsg =
        rawMsg.toLowerCase().includes("permission") || rawMsg.toLowerCase().includes("denied")
          ? "تم رفض صلاحية الوصول إلى الميكروفون. يرجى تفعيل الميكروفون من إعدادات المتصفح ثم المحاولة مجدداً."
          : rawMsg || "تعذر الوصول إلى الميكروفون. يرجى السماح بصلاحيات الصوت في المتصفح.";
      setError(errMsg);
      if (onError) onError(errMsg);
    }
  };

  // Resume an interrupted/recovered session seamlessly
  const resumeRecoverableSession = async (): Promise<boolean> => {
    if (!recoverableSession) return false;
    setIsRecovering(true);
    setConnectionStatus("recovering");
    setStateMachine("REQUESTING_PERMISSION");
    setError(null);
    setCanRetryFinalize(false);
    clearRecordedAudioReview();

    try {
      const recId = recoverableSession.recordingId;
      const latest = await api.getRecordingSessionTranscript(recId);
      const restoredSegments = mapServerSegments(latest.segments);
      const pendingOffline = await idbGetChunksForSession(recId);

      const maxSeqFromSegs = restoredSegments.reduce(
        (acc, s) => (typeof s.sequenceNumber === "number" ? Math.max(acc, s.sequenceNumber) : acc),
        -1,
      );
      const maxSeqFromQueue = pendingOffline.reduce(
        (acc, c) => Math.max(acc, c.sequenceNumber),
        -1,
      );
      const nextSeq =
        Math.max(latest.lastSequenceNumber ?? -1, maxSeqFromSegs, maxSeqFromQueue) + 1;

      recordingIdRef.current = recId;
      setRecordingId(recId);
      segmentsRef.current = restoredSegments;
      setSegments(restoredSegments);
      const restoredDuration = Math.max(
        recoverableSession.durationSeconds,
        latest.durationSeconds || 0,
      );
      setElapsedSeconds(restoredDuration);
      lastChunkEndSecRef.current = restoredDuration;
      lastSpeechEndSecRef.current = restoredDuration;
      sequenceNumberRef.current = nextSeq;
      queueRef.current = pendingOffline;
      setPendingChunksCount(pendingOffline.length);
      setRecoverableSession(null);

      await api.updateRecordingSessionStatus(recId, "Recording", restoredDuration).catch(() => {});

      isRecordingRef.current = true;
      setIsRecording(true);
      isPausedRef.current = false;
      setIsPaused(false);

      await startMicrophoneAudioGraph(recoverableSession.language || language, selectedDeviceId);
      setStateMachine("RECORDING");
      useUIStore.getState().setAudioSystemState("Recording");
      setConnectionStatus(navigator.onLine ? "connected" : "offline");

      if (pendingOffline.length > 0) {
        void drainQueue();
      }
      return true;
    } catch (err) {
      setStateMachine("IDLE");
      const msg =
        err instanceof Error ? err.message : "تعذر استئناف الجلسة السابقة. يرجى المحاولة مجدداً.";
      setError(msg);
      if (onError) onError(msg);
      setConnectionStatus(navigator.onLine ? "connected" : "offline");
      return false;
    } finally {
      setIsRecovering(false);
    }
  };

  // Finalize an interrupted/recovered session directly without recording more
  const finalizeRecoverableSession = async (): Promise<{
    success: boolean;
    resourceId?: string;
    type?: "meeting" | "lecture";
    error?: string;
  }> => {
    if (!recoverableSession) return { success: false };
    setIsRecovering(true);
    setConnectionStatus("recovering");
    setStateMachine("PROCESSING");
    setError(null);

    try {
      const recId = recoverableSession.recordingId;
      const pendingOffline = await idbGetChunksForSession(recId);
      if (pendingOffline.length > 0) {
        queueRef.current = pendingOffline;
        setPendingChunksCount(pendingOffline.length);
        await drainQueue();
      }

      const res = await api.finalizeLiveSession({
        recordingId: recId,
        type: recoverableSession.type,
        title: recoverableSession.title,
        courseCode: recoverableSession.courseCode,
        language: recoverableSession.language,
        segments: recoverableSession.segments,
        durationSeconds: Math.max(1, recoverableSession.durationSeconds),
      });

      await idbClearSessionChunks(recId);
      try {
        sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      } catch {
        // ignore
      }
      setRecoverableSession(null);
      setConnectionStatus("connected");
      setStateMachine(res.success ? "COMPLETED" : "FAILED");
      return {
        success: Boolean(res.success && res.resourceId),
        resourceId: res.resourceId,
        type: recoverableSession.type,
      };
    } catch (err) {
      setStateMachine("FAILED");
      const msg = err instanceof Error ? err.message : "تعذر إنهاء ومعالجة الجلسة المستردة.";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsRecovering(false);
    }
  };

  // Discard recoverable draft session cleanly
  const dismissRecoverableSession = async () => {
    if (!recoverableSession) return;
    const target = recoverableSession;
    setRecoverableSession(null);
    await idbClearSessionChunks(target.recordingId);
    try {
      sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      if (target.type === "meeting") await api.deleteMeeting(target.recordingId);
      else await api.deleteLecture(target.recordingId);
    } catch {
      // ignore if already removed
    }
  };

  // Pause / Resume Recording
  const togglePause = () => {
    if (!isRecordingRef.current) return;

    if (isPausedRef.current) {
      isPausedRef.current = false;
      setIsPaused(false);
      setStateMachine("RECORDING");
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
        try {
          mediaRecorderRef.current.resume();
        } catch {
          // ignore
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume().catch(() => {});
      }
      startSpeechRecognitionPreview(activeMetaRef.current.language);
      if (recordingIdRef.current) {
        void api
          .updateRecordingSessionStatus(
            recordingIdRef.current,
            "Recording",
            elapsedSecondsRef.current,
          )
          .catch(() => {});
      }
    } else {
      void flushPcmBufferToQueue(true);
      isPausedRef.current = true;
      setIsPaused(true);
      setStateMachine("PAUSED");
      setInterimText("");
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        try {
          mediaRecorderRef.current.pause();
        } catch {
          // ignore
        }
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.onend = null;
          speechRecognitionRef.current.stop();
        } catch {
          // ignore
        }
        speechRecognitionRef.current = null;
      }
      if (recordingIdRef.current) {
        void api
          .updateRecordingSessionStatus(
            recordingIdRef.current,
            "Paused",
            elapsedSecondsRef.current,
          )
          .catch(() => {});
      }
    }
  };

  // Cancel & Discard Live Recording Session cleanly
  const cancelRecording = async () => {
    isRecordingRef.current = false;
    isPausedRef.current = false;
    setIsRecording(false);
    setIsPaused(false);
    setStateMachine("IDLE");
    setCanRetryFinalize(false);
    clearRecordedAudioReview();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    releaseCaptureResources();
    useUIStore.getState().setAudioSystemState("Ready", 0);

    const activeId = recordingIdRef.current;
    recordingIdRef.current = null;
    setRecordingId(null);
    queueRef.current = [];
    sessionInt16ChunksRef.current = [];
    sessionInt16SamplesCountRef.current = 0;
    mediaRecorderBlobsRef.current = [];
    setPendingChunksCount(0);
    segmentsRef.current = [];
    setSegments([]);
    setInterimText("");
    setElapsedSeconds(0);
    setError(null);

    try {
      sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }

    if (activeId) {
      await idbClearSessionChunks(activeId);
      try {
        if (type === "meeting") {
          await api.deleteMeeting(activeId);
        } else {
          await api.deleteLecture(activeId);
        }
      } catch {
        // ignore if already removed
      }
    }
  };

  // Helper to run server finalization (used both by Stop and Retry Finalize)
  const executeFinalize = useCallback(async (): Promise<{
    success: boolean;
    resourceId?: string;
    error?: string;
  }> => {
    const recId = recordingIdRef.current;
    const meta = activeMetaRef.current;

    if (queueRef.current.length > 0) {
      setStateMachine("UPLOADING");
      const drained = await drainQueue();
      let waitSteps = 0;
      while ((isDrainingRef.current || queueRef.current.length > 0) && waitSteps < 60) {
        if (typeof navigator !== "undefined" && !navigator.onLine) break;
        await new Promise((r) => setTimeout(r, 350));
        waitSteps++;
      }
      if (!drained && queueRef.current.length > 0) {
        const offlineMsg = `لا يزال هناك ${queueRef.current.length} مقطع صوتي بانتظار رفعها بسبب ضعف أو انقطاع الاتصال. أعد الاتصال ثم اضغط إعادة المحاولة دون فقدان التسجيل.`;
        setError(offlineMsg);
        setCanRetryFinalize(true);
        setStateMachine("FAILED");
        useUIStore.getState().setAudioSystemState("Ready", 0);
        return { success: false, error: offlineMsg };
      }
    }

    try {
      setStateMachine("PROCESSING");
      setIsProcessingChunk(true);
      const res = await api.finalizeLiveSession({
        recordingId: recId || undefined,
        type: meta.type,
        title: meta.title,
        courseCode: meta.courseCode,
        language: meta.language,
        segments: segmentsRef.current,
        durationSeconds: Math.max(1, elapsedSecondsRef.current),
      });

      if (recId) {
        await idbClearSessionChunks(recId);
      }
      try {
        sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      } catch {
        // ignore
      }

      if (res.success && res.resourceId) {
        setCanRetryFinalize(false);
        setError(null);
        setStateMachine("COMPLETED");
        useUIStore.getState().setAudioSystemState("Completed", 100);
        setTimeout(() => {
          useUIStore.getState().setAudioSystemState("Ready", 0);
        }, 5000);
        return { success: true, resourceId: res.resourceId };
      }

      const failMsg = res.error || "تعذر إتمام معالجة الجلسة.";
      setError(failMsg);
      setCanRetryFinalize(true);
      setStateMachine("FAILED");
      useUIStore.getState().setAudioSystemState("Ready", 0);
      return { success: false, error: failMsg };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "حدث خطأ أثناء تحليل وحفظ الجلسة. لم يتم فقدان التسجيل — يمكنك إعادة المحاولة.";
      setError(msg);
      setCanRetryFinalize(true);
      setStateMachine("FAILED");
      useUIStore.getState().setAudioSystemState("Ready", 0);
      return { success: false, error: msg };
    } finally {
      setIsProcessingChunk(false);
    }
  }, [drainQueue]);

  // Stop Recording, flush trailing audio, build local playable WAV review, drain queue, and run unified post-recording AI pipeline
  const stopRecording = async (): Promise<{
    success: boolean;
    resourceId?: string;
    error?: string;
  }> => {
    setStateMachine("STOPPING");
    isRecordingRef.current = false;
    isPausedRef.current = false;
    setIsRecording(false);
    setIsPaused(false);

    // 1. If any trailing partial phrase was visible, commit it before clearing
    if (interimText.trim()) {
      await persistBrowserFinalSegment(interimText.trim());
    }
    setInterimText("");
    useUIStore.getState().setAudioSystemState("Processing", 35);

    // 2. Flush any remaining PCM frames before tearing down audio graph
    await flushPcmBufferToQueue(true);

    // 3. Build immediate playable local WAV Blob + Object URL for audio playback & download review
    const recId = recordingIdRef.current || `live_${Date.now()}`;
    const meta = activeMetaRef.current;
    const durationSec = Math.max(1, elapsedSecondsRef.current);
    const wavBlob = buildWavBlobFromInt16Chunks(sessionInt16ChunksRef.current, TARGET_SAMPLE_RATE);
    const fallbackBlob =
      !wavBlob && mediaRecorderBlobsRef.current.length > 0
        ? new Blob(mediaRecorderBlobsRef.current, {
            type: mediaRecorderMimeRef.current || "audio/webm",
          })
        : null;
    const finalLocalBlob = wavBlob || fallbackBlob;

    if (finalLocalBlob && finalLocalBlob.size > 44) {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const localUrl = URL.createObjectURL(finalLocalBlob);
      objectUrlRef.current = localUrl;
      const ext = wavBlob ? "wav" : "webm";
      setRecordedAudioReview({
        recordingId: recId,
        resourceType: meta.type,
        title: meta.title,
        audioUrl: localUrl,
        audioBlob: finalLocalBlob,
        fileSizeBytes: finalLocalBlob.size,
        durationSeconds: durationSec,
        mimeType: finalLocalBlob.type || "audio/wav",
        fileName: `${meta.title.replace(/[^a-zA-Z0-9ء-ي_]/g, "_")}_${recId}.${ext}`,
      });
    }

    // 4. Release mic, AudioContext, MediaRecorder, SpeechRecognition, timers immediately
    releaseCaptureResources();

    // 5. Drain remaining queued chunks & trigger unified backend post-processing
    return executeFinalize();
  };

  // Manual retry triggers (when network or AI transiently fails)
  const retryFailedChunks = useCallback(async () => {
    setError(null);
    await drainQueue();
  }, [drainQueue]);

  const retryFinalize = useCallback(async () => {
    setError(null);
    return executeFinalize();
  }, [executeFinalize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      releaseCaptureResources();
    };
  }, [releaseCaptureResources]);

  return {
    stateMachine,
    isRecording,
    isPaused,
    elapsedSeconds,
    segments,
    interimText,
    detectedLanguage,
    isProcessingChunk,
    recordingId,
    audioLevels,
    error,
    connectionStatus,
    pendingChunksCount,
    wordCount,
    recoverableSession,
    isRecovering,
    canRetryFinalize,
    audioDevices,
    recordedAudioReview,
    startRecording,
    togglePause,
    stopRecording,
    cancelRecording,
    setSegments,
    retryFailedChunks,
    retryFinalize,
    resumeRecoverableSession,
    finalizeRecoverableSession,
    dismissRecoverableSession,
    clearRecordedAudioReview,
  };
}
