import { useState, useRef, useEffect } from "react";
import {
  Mic,
  Upload,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RotateCw,
  Copy,
  Check,
  FileText,
  ExternalLink,
  MessageSquare,
  Pause,
  Play,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { LiveArabicRecorder } from "@/components/recording/live-arabic-recorder";
import { useTranslation } from "@/lib/i18n";
import {
  liveAudioTelemetry,
  resetLiveAudioTelemetry,
  useUIStore,
  type AudioSystemMode,
} from "@/stores/ui-store";
import {
  processMedia,
  cancelMediaProcessing,
  validateClientMediaFile,
  getSavedActiveUploadJob,
  clearSavedActiveUploadJob,
} from "@/lib/media-processor";

interface UploadRecordingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: "meeting" | "lecture";
  onSuccess?: () => void;
  onUploaded?: (resourceId: string) => void;
}

interface CompletedTranscriptData {
  resourceId: string;
  resourceType: "meeting" | "lecture";
  title: string;
  fullText: string;
  durationSeconds: number;
  segments: {
    id: string;
    speaker: string;
    startTime: number;
    endTime: number;
    text: string;
  }[];
}

const STAGE_LABELS_AR: Record<string, string> = {
  Uploaded: "تم رفع الملف بنجاح",
  Validating: "جاري التحقق من سلامة الملف عبر FFprobe...",
  Queued: "في قائمة انتظار المعالجة الذكية...",
  ExtractingAudio: "جاري استخراج وتجهيز الصوت بتردد 16kHz...",
  Transcribing: "جاري استخراج النص الكامل من الصوت بالذكاء الاصطناعي...",
  Translating: "جاري تنسيق النص المستخرج والمصطلحات...",
  Merging: "جاري تجميع ودمج النص المفرغ المستمر...",
  Analyzing: "جاري التحليل الذكي واستخراج المحاور والمهام...",
  "Generating Quiz": "جاري إعداد الاختبار التقييمي والأسئلة الذكية...",
  Completed: "اكتمل استخراج النص والتحليل بنجاح!",
  Failed: "تعذرت المعالجة.",
  Cancelled: "تم إلغاء المعالجة من قبل المستخدم.",
};

const STAGE_LABELS_EN: Record<string, string> = {
  Uploaded: "Media uploaded successfully",
  Validating: "Validating media streams via FFprobe...",
  Queued: "Queued for processing...",
  ExtractingAudio: "Extracting 16kHz PCM audio stream...",
  Transcribing: "Extracting full speech transcript via AI...",
  Translating: "Formatting transcript & terminology...",
  Merging: "Merging continuous flowing transcript...",
  Analyzing: "Analyzing content & extracting action items...",
  "Generating Quiz": "Generating assessment quiz...",
  Completed: "Processing completed!",
  Failed: "Processing failed.",
  Cancelled: "Processing cancelled.",
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function UploadRecordingDialog({
  open,
  onOpenChange,
  defaultType = "meeting",
  onSuccess,
  onUploaded,
}: UploadRecordingDialogProps) {
  const { language } = useTranslation();
  const isArabic = language.toUpperCase() === "AR";
  const navigate = useNavigate();

  const [type, setType] = useState<"meeting" | "lecture">(defaultType);
  const [title, setTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto");
  const [file, setFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isMicPaused, setIsMicPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const micAnim = isRecording && !isMicPaused ? "animate-pulse" : "";
  const isMicPausedRef = useRef(false);

  // Job processing state
  const [isUploading, setIsUploading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("Queued");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Completed extracted transcript display state
  const [completedTranscript, setCompletedTranscript] = useState<CompletedTranscriptData | null>(
    null,
  );
  const [transcriptViewMode, setTranscriptViewMode] = useState<"continuous" | "segments">(
    "continuous",
  );
  const [copiedFullText, setCopiedFullText] = useState(false);

  const [liveRecorderOpen, setLiveRecorderOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number | null>(null);
  const fileEnvelopeRef = useRef<Float32Array | null>(null);

  // Extract real waveform envelope from uploaded audio file when selected
  const extractFileWaveformPreview = async (selectedFile: File) => {
    try {
      const arrayBuffer = await selectedFile.slice(0, 6 * 1024 * 1024).arrayBuffer();
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const rawData = audioBuffer.getChannelData(0);
      const numFrames = 256;
      const blockSize = Math.max(1, Math.floor(rawData.length / numFrames));
      const envelope = new Float32Array(numFrames);

      for (let i = 0; i < numFrames; i++) {
        let sum = 0;
        const offset = i * blockSize;
        const step = Math.max(1, Math.floor(blockSize / 32));
        let count = 0;
        for (let j = 0; j < blockSize; j += step) {
          const val = rawData[offset + j] || 0;
          sum += val * val;
          count++;
        }
        envelope[i] = Math.min(1, Math.sqrt(sum / Math.max(1, count)) * 3.5);
      }
      fileEnvelopeRef.current = envelope;
      await ctx.close();
    } catch {
      fileEnvelopeRef.current = null;
    }
  };

  useEffect(() => {
    if (file) {
      extractFileWaveformPreview(file);
    } else {
      fileEnvelopeRef.current = null;
    }
  }, [file]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const mapJobStatusToSystemMode = (status: string): AudioSystemMode => {
    if (status === "Uploaded") return "Uploading";
    if (status === "Validating" || status === "Queued" || status === "ExtractingAudio") {
      return "Processing";
    }
    if (status === "Transcribing" || status === "Translating" || status === "Merging") {
      return "Transcribing";
    }
    if (status === "Analyzing" || status === "Generating Quiz") return "Analyzing";
    if (status === "Completed") return "Completed";
    return "Processing";
  };

  const startMicrophoneRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      // Connect real Web Audio API AnalyserNode
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.82;
        source.connect(analyser);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const timeData = new Uint8Array(analyser.frequencyBinCount);

        const updateMicTelemetry = () => {
          analyser.getByteFrequencyData(freqData);
          analyser.getByteTimeDomainData(timeData);
          let sumSq = 0;
          let peak = 0;
          for (let i = 0; i < 32; i++) {
            const v = (freqData[i] || 0) / 255;
            liveAudioTelemetry.bands[i] = v;
            if (v > peak) peak = v;
          }
          for (let i = 0; i < 64; i++) {
            const s = ((timeData[i] || 128) - 128) / 128;
            liveAudioTelemetry.waveform[i] = s;
            sumSq += s * s;
          }
          liveAudioTelemetry.active = true;
          liveAudioTelemetry.rms = Math.min(1, Math.sqrt(sumSq / 64) * 3.2);
          liveAudioTelemetry.peak = peak;
          liveAudioTelemetry.updatedAt = performance.now();
          micRafRef.current = requestAnimationFrame(updateMicTelemetry);
        };
        updateMicTelemetry();
      } catch {
        // ignore if AudioContext unavailable
      }

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
        resetLiveAudioTelemetry();
        useUIStore.getState().setAudioSystemState("Ready", 0);
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        const audioBlob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        const recordedFile = new File([audioBlob], `mic_recording_${Date.now()}.webm`, {
          type: "audio/webm",
        });
        setFile(recordedFile);
        stream.getTracks().forEach((track) => track.stop());
      };

      mr.start(500);
      isMicPausedRef.current = false;
      setIsMicPaused(false);
      setIsRecording(true);
      setRecordingSeconds(0);
      useUIStore.getState().setAudioSystemState("Recording");
      timerRef.current = setInterval(() => {
        if (!isMicPausedRef.current) {
          setRecordingSeconds((prev) => prev + 1);
        }
      }, 1000);
      toast.info(isArabic ? "بدأ تسجيل الميكروفون" : "Microphone recording active");
    } catch {
      toast.error(
        isArabic
          ? "تعذر الوصول للميكروفون. يرجى منح الإذن من المتصفح."
          : "Unable to access microphone. Please grant permission.",
      );
    }
  };

  const toggleMicPause = () => {
    const mr = mediaRecorderRef.current;
    if (!mr || !isRecording) return;
    if (isMicPaused) {
      mr.resume?.();
      isMicPausedRef.current = false;
      setIsMicPaused(false);
    } else {
      mr.pause?.();
      isMicPausedRef.current = true;
      setIsMicPaused(true);
    }
  };

  const stopMicrophoneRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      isMicPausedRef.current = false;
      setIsMicPaused(false);
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      toast.success(isArabic ? "تم حفظ التسجيل بنجاح!" : "Recording captured successfully!");
    }
  };

  const startPolling = (jobId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    let tickIdx = 0;
    pollTimerRef.current = setInterval(async () => {
      try {
        const job = await api.getJob(jobId);
        setJobStatus(job.status);
        const pct = job.progressPercent || 15;
        setProgressPercent(pct);

        const mappedMode = mapJobStatusToSystemMode(job.status);
        useUIStore.getState().setAudioSystemState(mappedMode, pct);

        // Feed real decoded file waveform envelope slices into telemetry while processing
        const env = fileEnvelopeRef.current;
        if (env && env.length > 0 && job.status !== "Completed" && job.status !== "Failed") {
          const offset = (tickIdx * 16) % env.length;
          let sum = 0;
          for (let i = 0; i < 32; i++) {
            const val = env[(offset + i) % env.length] || 0.2;
            liveAudioTelemetry.bands[i] = val;
            sum += val;
          }
          liveAudioTelemetry.active = true;
          liveAudioTelemetry.rms = sum / 32;
          liveAudioTelemetry.updatedAt = performance.now();
          tickIdx++;
        }

        if (job.status === "Completed") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          clearSavedActiveUploadJob();
          resetLiveAudioTelemetry();
          useUIStore.getState().setAudioSystemState("Completed", 100);
          setTimeout(() => {
            useUIStore.getState().setAudioSystemState("Ready", 0);
          }, 5000);

          // Fetch the newly extracted transcript immediately so we can display it right here!
          try {
            const sessionData = await api.getRecordingSessionTranscript(job.resourceId);
            const extractedFullText =
              (sessionData.segments || []).map((s) => s.text).join(" ") ||
              sessionData.fullText ||
              "";
            setCompletedTranscript({
              resourceId: job.resourceId,
              resourceType: (job.resourceType as "meeting" | "lecture") || type,
              title: sessionData.title || title || "تسجيل صوتي",
              fullText: extractedFullText,
              durationSeconds: sessionData.durationSeconds || 60,
              segments: sessionData.segments || [],
            });
          } catch {
            // Fallback to getTranscript
            try {
              const tr = await api.getTranscript(job.resourceId);
              setCompletedTranscript({
                resourceId: job.resourceId,
                resourceType: (job.resourceType as "meeting" | "lecture") || type,
                title: tr.title || title || "تسجيل صوتي",
                fullText: (tr.segments || []).map((s) => s.text).join(" "),
                durationSeconds: 60,
                segments: tr.segments || [],
              });
            } catch {
              // ignore
            }
          }

          setIsUploading(false);
          toast.success(
            isArabic
              ? `تم استخراج النص الكامل من الصوت وتحليله بنجاح!`
              : `Full speech transcript extracted and analyzed!`,
          );
          if (onSuccess) onSuccess();
          if (onUploaded) onUploaded(job.resourceId);
        } else if (job.status === "Failed") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          clearSavedActiveUploadJob();
          resetLiveAudioTelemetry();
          useUIStore.getState().setAudioSystemState("Ready", 0);
          setJobError(
            job.errorMessage ||
              (isArabic ? "فشلت عملية التفريغ والتحليل" : "Processing pipeline failed"),
          );
          setIsUploading(false);
          toast.error(isArabic ? "فشلت معالجة التسجيل" : "Transcription pipeline failed");
        } else if (job.status === "Cancelled") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          clearSavedActiveUploadJob();
          resetLiveAudioTelemetry();
          useUIStore.getState().setAudioSystemState("Ready", 0);
          setIsUploading(false);
          setActiveJobId(null);
          toast.info(isArabic ? "تم إلغاء معالجة التسجيل" : "Processing cancelled");
        }
      } catch {
        // Continue polling until job finishes or fails
      }
    }, 1000);
  };

  // Recover any active background upload job across modal close or reload
  useEffect(() => {
    if (!open) return;
    const saved = getSavedActiveUploadJob();
    if (saved && !isUploading && !completedTranscript) {
      setActiveJobId(saved.jobId);
      setTitle(saved.title || title);
      setType(saved.resourceType || defaultType);
      setIsUploading(true);
      setJobStatus("Queued");
      setProgressPercent(15);
      startPolling(saved.jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCancelActiveJob = async () => {
    if (!activeJobId) {
      setIsUploading(false);
      return;
    }
    try {
      await cancelMediaProcessing(activeJobId);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      resetLiveAudioTelemetry();
      useUIStore.getState().setAudioSystemState("Ready", 0);
      setIsUploading(false);
      setActiveJobId(null);
      toast.info(isArabic ? "تم إلغاء المعالجة بنجاح" : "Processing cancelled");
    } catch {
      toast.error(isArabic ? "تعذر إلغاء المهمة" : "Failed to cancel processing");
    }
  };

  const handleRetry = async () => {
    if (!activeJobId) return;
    try {
      setIsRetrying(true);
      setJobError(null);
      setCompletedTranscript(null);
      setIsUploading(true);
      setJobStatus("Queued");
      setProgressPercent(15);

      await api.retryJob(activeJobId);
      toast.info(isArabic ? "جاري إعادة معالجة التسجيل..." : "Retrying recording job...");
      startPolling(activeJobId);
    } catch {
      toast.error(isArabic ? "تعذرت إعادة المحاولة" : "Failed to retry job");
      setIsUploading(false);
    } finally {
      setIsRetrying(false);
    }
  };

  // No synthetic/sample audio — all processing operates strictly on user-provided media or mic capture.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(isArabic ? "يرجى إدخال العنوان" : "Please enter a title");
      return;
    }
    if (type === "lecture" && !courseCode.trim()) {
      toast.error(isArabic ? "يرجى إدخال كود المادة (مثل CS 6410)" : "Please enter a course code");
      return;
    }
    if (!file) {
      toast.error(
        isArabic
          ? "يرجى اختيار ملف صوتي أو تسجيل صوتي من الميكروفون أولاً للمتابعة"
          : "Please select an audio file or record via microphone first to proceed",
      );
      return;
    }

    const check = validateClientMediaFile(file);
    if (!check.valid) {
      toast.error(check.error || (isArabic ? "ملف وسائط غير صالح" : "Invalid media file"));
      return;
    }

    try {
      setIsUploading(true);
      setJobError(null);
      setCompletedTranscript(null);
      setJobStatus("Uploaded");
      setProgressPercent(8);
      useUIStore.getState().setAudioSystemState("Uploading", 8);

      const res = await processMedia({
        file,
        type,
        title,
        courseCode,
        language: selectedLanguage,
      });
      setActiveJobId(res.jobId);
      useUIStore.getState().setAudioSystemState("Processing", 15);
      startPolling(res.jobId);
    } catch (err) {
      clearSavedActiveUploadJob();
      setIsUploading(false);
      useUIStore.getState().setAudioSystemState("Ready", 0);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleCopyExtractedText = () => {
    if (!completedTranscript) return;
    navigator.clipboard.writeText(completedTranscript.fullText);
    setCopiedFullText(true);
    toast.success(isArabic ? "تم نسخ النص المستخرج بالكامل!" : "Copied full transcript!");
    setTimeout(() => setCopiedFullText(false), 2000);
  };

  const handleResetForNewUpload = () => {
    setCompletedTranscript(null);
    setFile(null);
    setTitle("");
    setJobError(null);
  };

  const statusLabel = isArabic
    ? STAGE_LABELS_AR[jobStatus] || jobStatus
    : STAGE_LABELS_EN[jobStatus] || jobStatus;

  const wordCount = completedTranscript
    ? completedTranscript.fullText.split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (isUploading && !v && pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
          }
          onOpenChange(v);
        }}
      >
        <DialogContent
          className={completedTranscript ? "max-w-2xl" : "max-w-md"}
          dir={isArabic ? "rtl" : "ltr"}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              <span>
                {completedTranscript
                  ? isArabic
                    ? "النص المستخرج من الملف الصوتي"
                    : "Extracted Audio Transcript"
                  : isArabic
                    ? "رفع أو تسجيل صوتي ذكي"
                    : "Upload or Record Audio"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {completedTranscript
                ? isArabic
                  ? "تم استخراج الكلام المنطوق من الملف الصوتي بالكامل وحفظه في الموقع مع الملخص والأسئلة."
                  : "All spoken words have been extracted from your audio file and saved to your workspace."
                : isArabic
                  ? "تقوم منصة MeetMind تلقائياً باستخراج النص الكامل من الصوت، وتوليد الملخص، واستخراج المهام، وإنشاء كويز تقييمي."
                  : "MeetMind automatically extracts the full transcript from your audio, generates summaries, quizzes, and action items."}
            </DialogDescription>
          </DialogHeader>

          {isUploading ? (
            <div className="py-8 text-center space-y-5">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <span className="absolute text-xs font-mono font-bold text-foreground">
                  {progressPercent}%
                </span>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-sm text-foreground">{statusLabel}</div>
                <div className="mx-auto w-full max-w-xs h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full gradient-primary transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(8, progressPercent)}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed px-4">
                {isArabic
                  ? "يجري الآن استخراج كل كلمة من الملف الصوتي بدقة فائقة وتحليل المحاور بالذكاء الاصطناعي..."
                  : "Extracting full speech verbatim and running AI intelligence pipeline..."}
              </p>

              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="text-xs cursor-pointer"
                >
                  {isArabic ? "المتابعة في الخلفية" : "Continue in Background"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelActiveJob}
                  className="text-xs cursor-pointer"
                >
                  {isArabic ? "إلغاء المعالجة" : "Cancel Processing"}
                </Button>
              </div>
            </div>
          ) : completedTranscript ? (
            <div className="space-y-4 pt-1">
              {/* Success Banner & Stats */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs sm:text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="truncate max-w-[260px]">{completedTranscript.title}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-300"
                  >
                    {wordCount} {isArabic ? "كلمة" : "words"}
                  </Badge>
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                    {completedTranscript.segments.length} {isArabic ? "مقطع" : "segments"}
                  </Badge>
                </div>
              </div>

              {/* View Mode Switcher + Copy Button */}
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border border-border/70 bg-secondary/50 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setTranscriptViewMode("continuous")}
                    className={`rounded-md px-2.5 py-1 font-semibold transition cursor-pointer ${
                      transcriptViewMode === "continuous"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isArabic ? "النص الكامل المستمر" : "Full Continuous Text"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTranscriptViewMode("segments")}
                    className={`rounded-md px-2.5 py-1 font-semibold transition cursor-pointer ${
                      transcriptViewMode === "segments"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {isArabic ? "مقاطع المتحدثين بالتوقيت" : "Timestamped Segments"}
                  </button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyExtractedText}
                  className="h-7 gap-1.5 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/15 cursor-pointer"
                >
                  {copiedFullText ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span>{isArabic ? "نسخ النص بالكامل" : "Copy Full Text"}</span>
                </Button>
              </div>

              {/* Extracted Transcript Reading Box */}
              <div className="max-h-[290px] overflow-y-auto rounded-xl border border-[#D4AF37]/35 bg-zinc-950/90 p-4 shadow-inner">
                {transcriptViewMode === "continuous" ? (
                  <div className="text-sm leading-relaxed text-zinc-100 whitespace-pre-line select-text font-medium">
                    {completedTranscript.fullText}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {completedTranscript.segments.map((seg, idx) => (
                      <div
                        key={seg.id || idx}
                        className="rounded-lg border border-zinc-800/80 bg-zinc-900/70 p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-[10.5px] font-mono text-amber-400/90 mb-1">
                          <span className="font-bold">{seg.speaker}</span>
                          <span>
                            {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
                          </span>
                        </div>
                        <p className="text-zinc-100 leading-relaxed">{seg.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetForNewUpload}
                  className="text-xs cursor-pointer"
                >
                  {isArabic ? "رفع ملف آخر" : "Upload Another"}
                </Button>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      useUIStore.getState().setAiDockOpen(true);
                    }}
                    className="gap-1.5 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/15 cursor-pointer"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
                    <span>{isArabic ? "اسأل الذكاء الاصطناعي" : "Ask AI Assistant"}</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const targetId = completedTranscript.resourceId;
                      onOpenChange(false);
                      navigate({
                        to: "/transcript",
                        search: { id: targetId } as unknown as Record<string, never>,
                      });
                    }}
                    className="gradient-primary text-primary-foreground shadow-glow gap-1.5 text-xs cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>
                      {isArabic
                        ? "فتح في صفحة التفريغ الكامل والتحليل"
                        : "Open Full Transcript Page"}
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ) : jobError ? (
            <div className="py-6 space-y-4">
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{isArabic ? "تعذرت معالجة التسجيل" : "Transcription Pipeline Failed"}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{jobError}</p>
                <div className="text-[11px] text-amber-400/90 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                  {jobError.includes("Secrets") ||
                  jobError.includes("API_KEY") ||
                  jobError.includes("API key") ||
                  jobError.includes("quota") ||
                  jobError.includes("429") ||
                  jobError.includes("403")
                    ? isArabic
                      ? "مفتاح Gemini API غير صالح أو منتهي الصلاحية. افتح Settings > Secrets في منصة AI Studio واختر أو أضف مفتاح Gemini API صحيحاً ثم أعد المحاولة."
                      : "Your GEMINI_API_KEY is missing, invalid, or over quota. Open Settings > Secrets in AI Studio to configure a valid API key, then click Retry Pipeline."
                    : isArabic
                      ? "تأكد من أن الملف الصوتي أو الفيديو يحتوي على كلام بشري واضح وليس صمتاً، واختر اللغة المطابقة أو الكشف التلقائي."
                      : "Ensure the uploaded audio/video file contains audible speech (not silence) and try matching the spoken language or Auto-Detect."}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setJobError(null)}>
                  {isArabic ? "إلغاء والعودة" : "Back"}
                </Button>
                <Button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="gradient-primary text-primary-foreground shadow-glow gap-2"
                >
                  <RotateCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
                  <span>{isArabic ? "إعادة المحاولة الآن" : "Retry Pipeline"}</span>
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>{isArabic ? "نوع الجلسة" : "Type"}</Label>
                <Select value={type} onValueChange={(v: "meeting" | "lecture") => setType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meeting">
                      {isArabic ? "اجتماع عمل ومتابعة مهام" : "Business Meeting"}
                    </SelectItem>
                    <SelectItem value="lecture">
                      {isArabic ? "محاضرة تعليمية وأكاديمية" : "Educational Lecture"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{isArabic ? "عنوان الجلسة أو المحاضرة" : "Title"}</Label>
                <Input
                  placeholder={
                    type === "meeting"
                      ? isArabic
                        ? "مثال: مراجعة خطة التسليم الربع سنوية"
                        : "e.g. Q4 Strategy Review"
                      : isArabic
                        ? "مثال: مقدمة في نظم التشغيل الموزعة"
                        : "e.g. Distributed Operating Systems"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {type === "lecture" && (
                <div className="space-y-1.5">
                  <Label>{isArabic ? "كود المادة" : "Course Code"}</Label>
                  <Input
                    placeholder="e.g. CS 6410"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="flex items-center justify-between">
                  <span>
                    {isArabic ? "لغة التسجيل واللهجة المسموعة" : "Spoken Language / Dialect"}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono border-primary/30 text-primary"
                  >
                    Gemini + Whisper ASR
                  </Badge>
                </Label>
                <Select value={selectedLanguage} onValueChange={(v) => setSelectedLanguage(v)}>
                  <SelectTrigger className="bg-background/80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      {isArabic
                        ? "🌐 كشف تلقائي ذكي (عربي / إنجليزي / هجين)"
                        : "🌐 Auto-Detect (Arabic / English / Mixed)"}
                    </SelectItem>
                    <SelectItem value="ar-EG">
                      {isArabic ? "🇪🇬 لهجة مصرية وعامية (Egyptian Arabic)" : "🇪🇬 Egyptian Arabic"}
                    </SelectItem>
                    <SelectItem value="ar-SA">
                      {isArabic
                        ? "🇸🇦 لغة عربية فصحى (Modern Standard Arabic)"
                        : "🇸🇦 Modern Standard Arabic"}
                    </SelectItem>
                    <SelectItem value="en">
                      {isArabic ? "🇺🇸 لغة إنجليزية (English)" : "🇺🇸 English"}
                    </SelectItem>
                    <SelectItem value="mixed">
                      {isArabic
                        ? "⚡ مزيج عربي وإنجليزي تقني (Code-Switching)"
                        : "⚡ Mixed Technical (Code-Switching)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Direct Live Stream Option */}
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-primary/20 text-primary text-[10px]"
                  >
                    مباشر · Real-Time Stream
                  </Badge>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    {isArabic ? "التفريغ الصوتي الحي المباشر" : "Live Arabic Transcription"}
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {isArabic
                    ? "تفريغ وترجمة فورية متزامنة أثناء التحدث، تظهر الكلمات تباعاً بالعربية الفصحى مع الحفظ التلقائي في قاعدة البيانات."
                    : "Real-time progressive transcription with live auto-saving and full persistence."}
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    setLiveRecorderOpen(true);
                  }}
                  className="w-full gradient-primary text-primary-foreground shadow-glow h-8 text-xs font-semibold gap-2 cursor-pointer"
                >
                  <Mic className="h-3.5 w-3.5" />
                  <span>
                    {isArabic ? "بدء جلسة التفريغ المباشر الآن" : "Start Live Recording Now"}
                  </span>
                </Button>
              </div>

              {/* Upload Recorded Audio File Option */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    {isArabic ? "رفع ملف صوتي أو تسجيل مباشر" : "Upload Audio or Record"}
                  </Label>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {isArabic ? "حد أقصى 500MB" : "Max 500MB"}
                  </span>
                </div>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.webm,.mp4,.mov,.avi,.mkv,.wma,.aiff,audio/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const selected = e.target.files[0];
                      const check = validateClientMediaFile(selected);
                      if (!check.valid) {
                        toast.error(
                          check.error || (isArabic ? "ملف وسائط غير صالح" : "Invalid media file"),
                        );
                        e.target.value = "";
                        return;
                      }
                      setFile(selected);
                      if (!title) setTitle(selected.name.replace(/\.[^/.]+$/, ""));
                      toast.success(
                        isArabic
                          ? `تم اختيار الملف: ${selected.name}`
                          : `Selected: ${selected.name}`,
                      );
                    }
                  }}
                />

                {/* Interactive Drag & Click Upload Box */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                    file
                      ? "border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/15"
                      : "border-amber-500/40 bg-zinc-950/70 hover:border-amber-400 hover:bg-zinc-900/80 shadow-inner"
                  }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 mb-2">
                    <Upload className="h-5 w-5" />
                  </div>

                  <div className="text-sm font-bold text-foreground text-center">
                    {file
                      ? file.name
                      : isArabic
                        ? "اضغط هنا لاختيار ملف صوتي أو فيديو من جهازك"
                        : "Click here to choose an audio or video file"}
                  </div>

                  <p className="text-[11.5px] text-muted-foreground mt-1 text-center">
                    {file
                      ? isArabic
                        ? "اضغط لتغيير الملف المحدد"
                        : "Click to change selected file"
                      : isArabic
                        ? "يدعم MP3, WAV, M4A, AAC, WEBM, OGG, MP4"
                        : "Supports MP3, WAV, M4A, AAC, WEBM, OGG, MP4"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    type="button"
                    variant={isRecording ? "destructive" : "outline"}
                    className="flex items-center gap-2 cursor-pointer border-amber-500/30"
                    onClick={isRecording ? stopMicrophoneRecording : startMicrophoneRecording}
                  >
                    <Mic className={`h-4 w-4 text-amber-400 ${micAnim}`} />
                    <span>
                      {isRecording
                        ? `${isArabic ? "إيقاف" : "Stop"} (${recordingSeconds}s)`
                        : isArabic
                          ? "تسجيل من الميكروفون"
                          : "Record Mic"}
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 cursor-pointer border-amber-500/30 text-amber-300 font-semibold"
                  >
                    <Upload className="h-4 w-4 text-amber-400" />
                    <span className="truncate">
                      {file
                        ? isArabic
                          ? "تغيير الملف"
                          : "Change File"
                        : isArabic
                          ? "تصفح الملفات"
                          : "Browse File"}
                    </span>
                  </Button>
                </div>

                {isRecording && (
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 mt-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full bg-destructive ${isMicPaused ? "" : "animate-ping"}`}
                      />
                      <span className="text-xs font-semibold text-destructive">
                        {isMicPaused
                          ? isArabic
                            ? "التسجيل متوقف مؤقتاً"
                            : "Recording paused"
                          : isArabic
                            ? "جاري التسجيل من الميكروفون..."
                            : "Recording live audio..."}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-destructive">
                        {Math.floor(recordingSeconds / 60)}:
                        {(recordingSeconds % 60).toString().padStart(2, "0")}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={toggleMicPause}
                        className="h-7 w-7 border-destructive/30 cursor-pointer"
                        title={isMicPaused ? "Resume" : "Pause"}
                      >
                        {isMicPaused ? (
                          <Play className="h-3.5 w-3.5" />
                        ) : (
                          <Pause className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {file && !isRecording && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/30 mt-2">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                      {file.size > 1024 * 1024
                        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                        : `${Math.round(file.size / 1024)} KB`}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                {!file && !isRecording && (
                  <span className="text-[11px] text-amber-400/85">
                    {isArabic
                      ? "اختر ملفاً صوتياً/فيديو أو ابدأ التسجيل من الميكروفون"
                      : "Select an audio/video file or record via microphone"}
                  </span>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                    {isArabic ? "إلغاء" : "Cancel"}
                  </Button>
                  <Button
                    type="submit"
                    disabled={!file && !isRecording}
                    className="gradient-primary text-primary-foreground shadow-glow cursor-pointer disabled:opacity-50"
                  >
                    {isArabic ? "حفظ واستخراج النص" : "Save & Extract Text"}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <LiveArabicRecorder
        open={liveRecorderOpen}
        onOpenChange={setLiveRecorderOpen}
        defaultType={type}
        onCompleted={() => {
          if (onSuccess) onSuccess();
        }}
      />
    </>
  );
}
