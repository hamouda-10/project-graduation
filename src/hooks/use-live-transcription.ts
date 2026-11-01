import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

export interface LiveTranscriptSegment {
  id: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
  isFinal: boolean;
}

export interface UseLiveTranscriptionOptions {
  type?: "meeting" | "lecture";
  title?: string;
  courseCode?: string;
  speakerName?: string;
  chunkDurationMs?: number; // default: 3000ms
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
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

export function useLiveTranscription(options: UseLiveTranscriptionOptions = {}) {
  const {
    type = "meeting",
    title = "تسجيل مباشر جديد",
    courseCode = "GEN 101",
    speakerName = "المتحدث 1",
    chunkDurationMs = 3000,
    onSegmentFinalized,
    onError,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [segments, setSegments] = useState<LiveTranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string>("");
  const [detectedLanguage, setDetectedLanguage] = useState<string>(
    "الكشف التلقائي (الترجمة للعربية)",
  );
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>([
    0.1, 0.2, 0.15, 0.3, 0.2, 0.1, 0.25, 0.15,
  ]);
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const recordingIdRef = useRef<string | null>(null);
  const segmentsRef = useRef<LiveTranscriptSegment[]>([]);
  const startTimeRef = useRef<number>(0);
  const chunkIndexRef = useRef<number>(0);
  const lastChunkEndSecRef = useRef<number>(0);
  const lastFinalizedEndSecRef = useRef<number>(0);
  const currentChunkBlobsRef = useRef<Blob[]>([]);
  const allBlobsRef = useRef<Blob[]>([]);

  // Keep segmentsRef in sync
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  // Convert Blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Helper: Persist finalized segment to backend immediately
  const persistSegmentSafely = useCallback(async (seg: LiveTranscriptSegment) => {
    const recId = recordingIdRef.current;
    if (!recId) return;

    try {
      await api.appendTranscriptSegment({
        recordingId: recId,
        segment: seg,
      });
    } catch (e) {
      console.warn("Autosave segment warning, retrying once:", e);
      setTimeout(async () => {
        try {
          await api.appendTranscriptSegment({
            recordingId: recId,
            segment: seg,
          });
        } catch {
          // keep going; finalize will ensure everything is captured
        }
      }, 1200);
    }
  }, []);

  // Process and send an audio chunk to server
  const processAudioChunk = useCallback(
    async (chunkBlob: Blob, startSec: number, endSec: number, interimHint?: string) => {
      if (chunkBlob.size < 100) return;

      setIsProcessingChunk(true);
      try {
        const audioBase64 = await blobToBase64(chunkBlob);
        const recentContext = segmentsRef.current
          .slice(-3)
          .map((s) => s.text)
          .join(" ");

        const sendRequest = async () => {
          const res = await fetch("/api/v1/transcripts/live-chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recordingId: recordingIdRef.current,
              audioBase64,
              mimeType: chunkBlob.type || "audio/webm",
              chunkIndex: chunkIndexRef.current++,
              startTime: Math.round(startSec),
              endTime: Math.max(Math.round(endSec), Math.round(startSec) + 1),
              speaker: speakerName,
              interimText: interimHint || interimText,
              recentContext,
            }),
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          const data = await res.json();
          const rawArabic = (data.arabicText || "").trim();
          const isPlaceholder =
            !rawArabic ||
            rawArabic === "[صمت]" ||
            rawArabic.toLowerCase().includes("[silence]") ||
            rawArabic.includes("جاري الاستماع") ||
            rawArabic.includes("جاري تفريغ") ||
            rawArabic.includes("جاري المعالجة");

          if (!isPlaceholder) {
            const newSeg: LiveTranscriptSegment = {
              id: `chunk_${Date.now()}_${chunkIndexRef.current}`,
              speaker: data.speaker || speakerName,
              startTime: data.startTime,
              endTime: data.endTime,
              text: rawArabic,
              isFinal: true,
            };

            // Deduplicate against current segmentsRef
            const exists = segmentsRef.current.some(
              (p) =>
                p.text.trim() === newSeg.text.trim() ||
                (Math.abs(p.startTime - newSeg.startTime) < 2.5 &&
                  (p.text.includes(newSeg.text) || newSeg.text.includes(p.text))),
            );

            if (!exists) {
              const updated = [...segmentsRef.current, newSeg];
              segmentsRef.current = updated;
              setSegments(updated);
              lastFinalizedEndSecRef.current = newSeg.endTime;

              // Ensure segment is saved in DB if not already saved by backend
              if (!data.savedToDb) {
                persistSegmentSafely(newSeg);
              }

              if (onSegmentFinalized) onSegmentFinalized(newSeg);
            }

            if (data.detectedLanguage) {
              setDetectedLanguage(data.detectedLanguage);
            }

            setInterimText("");
          }
        };

        await sendRequest();
      } catch (err) {
        console.warn("Chunk processing warning:", err);
      } finally {
        setIsProcessingChunk(false);
      }
    },
    [interimText, onSegmentFinalized, persistSegmentSafely, speakerName],
  );

  // Start real-time audio visualization
  const startAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 32;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Normalize 8 frequency bars
        const step = Math.floor(bufferLength / 8);
        const bars: number[] = [];
        for (let i = 0; i < 8; i++) {
          const val = dataArray[i * step] || 0;
          bars.push(Math.max(0.12, Math.min(1.0, val / 255)));
        }
        setAudioLevels(bars);
        animationFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (e) {
      console.warn("Web Audio API visualization not fully available:", e);
    }
  };

  // Start Web Speech API for instantaneous interim & finalized phrases
  const startSpeechRecognition = () => {
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
      recognizer.lang = "ar-EG"; // Arabic / Egyptian colloquial & standard

      recognizer.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          const transcript = item[0]?.transcript || "";

          if (item.isFinal) {
            const finalPhrase = transcript.trim();
            if (finalPhrase) {
              const nowSec = (Date.now() - startTimeRef.current) / 1000;
              const startSec = Math.round(lastFinalizedEndSecRef.current);
              const endSec = Math.max(Math.round(nowSec), startSec + 1);
              lastFinalizedEndSecRef.current = nowSec;

              const newSeg: LiveTranscriptSegment = {
                id: `speech_final_${Date.now()}_${segmentsRef.current.length}`,
                speaker: speakerName,
                startTime: startSec,
                endTime: endSec,
                text: finalPhrase,
                isFinal: true,
              };

              // Deduplicate against segmentsRef
              const isDuplicate = segmentsRef.current.some(
                (p) =>
                  p.text.trim() === finalPhrase ||
                  (Math.abs(p.startTime - startSec) < 2.5 &&
                    (p.text.includes(finalPhrase) || finalPhrase.includes(p.text))),
              );

              if (!isDuplicate) {
                const nextSegs = [...segmentsRef.current, newSeg];
                segmentsRef.current = nextSegs;
                setSegments(nextSegs);

                // AUTOSAVE IMMEDIATELY TO BACKEND DATABASE
                persistSegmentSafely(newSeg);

                if (onSegmentFinalized) onSegmentFinalized(newSeg);
              }
            }
          } else {
            interim += transcript;
          }
        }

        setInterimText(interim.trim());
      };

      recognizer.onerror = () => {
        // Continue silently; server audio chunk pipeline is authoritative
      };

      recognizer.onend = () => {
        // Auto restart if still recording
        if (isRecording && speechRecognitionRef.current) {
          try {
            recognizer.start();
          } catch {
            // ignore
          }
        }
      };

      recognizer.start();
      speechRecognitionRef.current = recognizer;
    } catch {
      // ignore
    }
  };

  // Start Recording Action
  const startRecording = async () => {
    setError(null);
    try {
      // 1. Establish persistent recording session in backend database first
      const session = await api.startRecordingSession({
        type,
        title,
        courseCode,
        speakerName,
      });

      const recId = session.recordingId;
      setRecordingId(recId);
      recordingIdRef.current = recId;
      segmentsRef.current = [];
      setSegments([]);
      setInterimText("");

      // Save active session into browser session storage for recovery
      try {
        sessionStorage.setItem(
          "meetmind_active_session",
          JSON.stringify({ recordingId: recId, type, title, courseCode, startedAt: Date.now() }),
        );
      } catch {
        // ignore
      }

      // 2. Request microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      startTimeRef.current = Date.now();
      lastChunkEndSecRef.current = 0;
      lastFinalizedEndSecRef.current = 0;
      chunkIndexRef.current = 0;
      currentChunkBlobsRef.current = [];
      allBlobsRef.current = [];

      startAudioVisualizer(stream);
      startSpeechRecognition();

      // Setup MediaRecorder
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"];
      let selectedMime = "";
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(
        stream,
        selectedMime ? { mimeType: selectedMime } : undefined,
      );
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          currentChunkBlobsRef.current.push(e.data);
          allBlobsRef.current.push(e.data);
        }
      };

      mediaRecorder.start(1000); // collect in 1s slices

      setIsRecording(true);
      setIsPaused(false);
      setElapsedSeconds(0);

      // Second timer
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Periodic chunk dispatch
      chunkTimerRef.current = setInterval(() => {
        if (currentChunkBlobsRef.current.length > 0) {
          const chunkBlob = new Blob(currentChunkBlobsRef.current, {
            type: selectedMime || "audio/webm",
          });
          currentChunkBlobsRef.current = [];
          const nowSec = (Date.now() - startTimeRef.current) / 1000;
          const startSec = lastChunkEndSecRef.current;
          lastChunkEndSecRef.current = nowSec;
          processAudioChunk(chunkBlob, startSec, nowSec);
        }
      }, chunkDurationMs);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "تعذر الوصول إلى الميكروفون. يرجى السماح بصلاحيات الصوت في المتصفح.";
      setError(errMsg);
      if (onError) onError(errMsg);
    }
  };

  // Pause / Resume Recording
  const togglePause = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  // Stop Recording & Finalize
  const stopRecording = async (): Promise<{
    success: boolean;
    resourceId?: string;
  }> => {
    setIsRecording(false);
    setIsPaused(false);

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      } catch {
        // ignore
      }
    }

    // Stop tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Flush any remaining audio in recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    // If any final speech interim phrase is pending, save it as a finalized segment
    if (interimText.trim()) {
      const remainingPhrase = interimText.trim();
      const nowSec = (Date.now() - startTimeRef.current) / 1000;
      const startSec = Math.round(lastFinalizedEndSecRef.current);
      const endSec = Math.max(Math.round(nowSec), startSec + 1);

      const isDuplicate = segmentsRef.current.some(
        (p) =>
          p.text.trim() === remainingPhrase ||
          p.text.includes(remainingPhrase) ||
          remainingPhrase.includes(p.text),
      );

      if (!isDuplicate) {
        const lastSeg: LiveTranscriptSegment = {
          id: `speech_final_flush_${Date.now()}`,
          speaker: speakerName,
          startTime: startSec,
          endTime: endSec,
          text: remainingPhrase,
          isFinal: true,
        };
        const next = [...segmentsRef.current, lastSeg];
        segmentsRef.current = next;
        setSegments(next);
        if (recordingIdRef.current) {
          persistSegmentSafely(lastSeg);
        }
      }
      setInterimText("");
    }

    if (currentChunkBlobsRef.current.length > 0) {
      const finalBlob = new Blob(currentChunkBlobsRef.current, {
        type: "audio/webm",
      });
      currentChunkBlobsRef.current = [];
      const nowSec = (Date.now() - startTimeRef.current) / 1000;
      await processAudioChunk(finalBlob, lastChunkEndSecRef.current, nowSec);
    }

    // Convert full recording audio to base64 for persistent storage
    let audioBase64 = "";
    if (allBlobsRef.current.length > 0) {
      try {
        const fullBlob = new Blob(allBlobsRef.current, { type: "audio/webm" });
        audioBase64 = await blobToBase64(fullBlob);
      } catch (err) {
        console.error("Failed to convert full recording to base64:", err);
      }
    }

    // Call server finalize session with all saved and flushed segments
    try {
      setIsProcessingChunk(true);
      const res = await api.finalizeLiveSession({
        recordingId: recordingIdRef.current || undefined,
        type,
        title,
        courseCode,
        segments: segmentsRef.current,
        durationSeconds: Math.max(1, elapsedSeconds),
        audioBase64,
      });

      try {
        sessionStorage.removeItem("meetmind_active_session");
      } catch {
        // ignore
      }

      if (res.success && res.resourceId) {
        return { success: true, resourceId: res.resourceId };
      }
      return { success: false };
    } catch (e) {
      console.error("Failed to finalize session:", e);
      return { success: false };
    } finally {
      setIsProcessingChunk(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
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
    startRecording,
    togglePause,
    stopRecording,
    setSegments,
  };
}
