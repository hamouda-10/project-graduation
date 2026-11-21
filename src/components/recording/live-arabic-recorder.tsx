import { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Pause,
  Play,
  Volume2,
  Sparkles,
  Search,
  Copy,
  Download,
  Check,
  Edit2,
  X,
  Radio,
  ArrowDown,
  Globe,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveTranscription } from "@/hooks/use-live-transcription";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface LiveArabicRecorderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: "meeting" | "lecture";
  onCompleted?: (resourceId: string, type: "meeting" | "lecture") => void;
}

type SessionCategory = "meeting" | "lecture" | "interview" | "general";

function formatTimer(seconds: number): string {
  if (!Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function LiveArabicRecorder({
  open,
  onOpenChange,
  defaultType = "meeting",
  onCompleted,
}: LiveArabicRecorderProps) {
  const [sessionCategory, setSessionCategory] = useState<SessionCategory>(defaultType);
  const type: "meeting" | "lecture" = sessionCategory === "lecture" ? "lecture" : "meeting";

  const [title, setTitle] = useState(
    defaultType === "meeting" ? "جلسة عمل ومزامنة الأولويات" : "محاضرة الأنظمة الموزعة والتوافق",
  );
  const [courseCode, setCourseCode] = useState("CS 6410");
  const [speakerName, setSpeakerName] = useState("المتحدث 1");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"continuous" | "cards">("continuous");
  const [editingSegId, setEditingSegId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isFinishing, setIsFinishing] = useState(false);
  const [showClosePrompt, setShowClosePrompt] = useState(false);
  const [completedResourceId, setCompletedResourceId] = useState<string | null>(null);

  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const {
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
  } = useLiveTranscription({
    type,
    title,
    courseCode,
    speakerName,
    language: selectedLanguage,
    selectedDeviceId,
    chunkDurationMs: 3500,
    checkRecovery: open,
    onError: (err) => toast.error(err),
  });

  // Smart Auto-Scroll: follow new segments unless user intentionally scrolled up
  useEffect(() => {
    if (autoScroll && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments, interimText, autoScroll]);

  const handleTranscriptScroll = () => {
    const el = transcriptContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > 60 && autoScroll) {
      setAutoScroll(false);
    } else if (distanceFromBottom <= 24 && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const queryClient = useQueryClient();

  const invalidateAllWorkspaceQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["meetings"] });
    queryClient.invalidateQueries({ queryKey: ["lectures"] });
    queryClient.invalidateQueries({ queryKey: ["quizzes"] });
    queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    queryClient.invalidateQueries({ queryKey: ["mindmaps"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
    queryClient.invalidateQueries({ queryKey: ["reports"] });
  };

  // Handle Stop & Save Session (displays real Audio Player in modal so user can listen & download immediately)
  const handleStopAndSave = async (closeAfterSave = false) => {
    setShowClosePrompt(false);
    setIsFinishing(true);
    toast.loading("جاري تجميع الصوت وتفريغ المقاطع المتبقية وتشغيل التحليل الذكي الشامل...", {
      id: "save-session",
    });

    const result = await stopRecording();
    setIsFinishing(false);

    if (result.success && result.resourceId) {
      setCompletedResourceId(result.resourceId);
      invalidateAllWorkspaceQueries();
      toast.success(
        "تم حفظ الجلسة وتشغيل جميع مخرجات الذكاء الاصطناعي بنجاح! يمكنك الاستماع للتسجيل الآن.",
        { id: "save-session" },
      );
      if (closeAfterSave) {
        onOpenChange(false);
        if (onCompleted) {
          onCompleted(result.resourceId, type);
        }
      }
    } else {
      toast.error(
        result.error ||
          "تم إيقاف التسجيل ولكن تعذر إتمام التحليل. يمكنك الاستماع للتسجيل وإعادة المحاولة دون فقدانه.",
        { id: "save-session" },
      );
    }
  };

  const handleRetryFinalize = async () => {
    setIsFinishing(true);
    toast.loading("جاري إعادة محاولة الحفظ والتحليل الذكي...", { id: "save-session" });
    const result = await retryFinalize();
    setIsFinishing(false);
    if (result.success && result.resourceId) {
      setCompletedResourceId(result.resourceId);
      invalidateAllWorkspaceQueries();
      toast.success("تم حفظ وتحليل الجلسة بنجاح!", { id: "save-session" });
    } else {
      toast.error(result.error || "تعذرت إعادة المحاولة. تحقق من الاتصال ثم حاول مجدداً.", {
        id: "save-session",
      });
    }
  };

  const handleResumeRecoverable = async () => {
    if (!recoverableSession) return;
    setSessionCategory(recoverableSession.type);
    setTitle(recoverableSession.title);
    if (recoverableSession.courseCode) setCourseCode(recoverableSession.courseCode);
    if (recoverableSession.speakerName) setSpeakerName(recoverableSession.speakerName);
    if (recoverableSession.language) setSelectedLanguage(recoverableSession.language);
    setCompletedResourceId(null);
    const ok = await resumeRecoverableSession();
    if (ok) {
      toast.success("تم استعادة الجلسة السابقة واستئناف التسجيل المباشر بنجاح");
    }
  };

  const handleFinalizeRecoverable = async () => {
    if (!recoverableSession) return;
    setIsFinishing(true);
    toast.loading("جاري إنهاء الجلسة المستردة وتشغيل التحليل الذكي...", { id: "save-session" });
    const result = await finalizeRecoverableSession();
    setIsFinishing(false);
    if (result.success && result.resourceId) {
      setCompletedResourceId(result.resourceId);
      invalidateAllWorkspaceQueries();
      toast.success("تم حفظ وتحليل الجلسة المستردة بنجاح!", { id: "save-session" });
      onOpenChange(false);
      if (onCompleted) {
        onCompleted(result.resourceId, result.type || recoverableSession.type);
      }
    } else {
      toast.error(result.error || "تعذر إنهاء الجلسة المستردة", { id: "save-session" });
    }
  };

  const handleDownloadRecordedAudio = () => {
    const audioUrl =
      recordedAudioReview?.audioUrl ||
      (completedResourceId ? `/api/v1/recordings/audio/${completedResourceId}` : "");
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download =
      recordedAudioReview?.fileName ||
      `${title.replace(/[^a-zA-Z0-9ء-ي_]/g, "_")}_${completedResourceId || "live"}.wav`;
    a.click();
    toast.success("تم بدء تحميل الملف الصوتي المسجل");
  };

  // Copy full Arabic transcript
  const handleCopyTranscript = () => {
    if (segments.length === 0) {
      toast.info("لا يوجد نص مفرغ للنسخ بعد");
      return;
    }
    const textContent = segments
      .map(
        (s) =>
          `[${formatTimer(s.startTime)} - ${formatTimer(s.endTime)}] ${s.speaker}:\n${s.text}\n`,
      )
      .join("\n");
    navigator.clipboard.writeText(textContent);
    toast.success("تم نسخ النص العربي بالكامل إلى الحافظة");
  };

  // Export Arabic transcript as TXT
  const handleExportTxt = () => {
    if (segments.length === 0) {
      toast.info("لا يوجد نص مفرغ للتصدير");
      return;
    }
    const textContent =
      `# تفريغ جلسة MeetMind AI: ${title}\n` +
      `التاريخ: ${new Date().toLocaleDateString("ar-EG")}\n` +
      `النوع: ${type === "meeting" ? "اجتماع عمل" : `محاضرة (${courseCode})`}\n` +
      `المدة: ${formatTimer(elapsedSeconds)}\n\n` +
      `=========================================\n\n` +
      segments
        .map(
          (s) =>
            `[${formatTimer(s.startTime)} - ${formatTimer(s.endTime)}] ${s.speaker}:\n${s.text}\n`,
        )
        .join("\n");

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9ء-ي_]/g, "_")}_arabic_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير ملف النص العربي بنجاح");
  };

  // Save manual inline edit (and persist to active backend session)
  const handleSaveEdit = (segId: string) => {
    if (!editingText.trim()) return;
    const updated = segments.map((s) =>
      s.id === segId ? { ...s, text: editingText.trim() } : s,
    );
    setSegments(updated);
    setEditingSegId(null);
    if (recordingId) {
      void api
        .updateTranscript(
          recordingId,
          updated.map((s) => ({
            id: s.id,
            speaker: s.speaker,
            startTime: s.startTime,
            endTime: s.endTime,
            text: s.text,
            isPartial: false,
            sequenceNumber: s.sequenceNumber,
            chunkId: s.chunkId,
          })),
        )
        .catch(() => {});
    }
    toast.success("تم تحديث النص");
  };

  const filteredSegments = segments.filter((seg) => {
    if (!searchQuery.trim()) return true;
    return (
      seg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      seg.speaker.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (isRecording) {
        setShowClosePrompt(true);
        return;
      }
      if (completedResourceId && onCompleted) {
        onCompleted(completedResourceId, type);
      }
      setShowClosePrompt(false);
      onOpenChange(false);
    } else {
      onOpenChange(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-6 overflow-hidden bg-background/95 backdrop-blur-2xl border-primary/20">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/50 text-right">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isRecording ? (
                <Badge
                  variant="outline"
                  className="bg-destructive/15 text-destructive border-destructive/30 animate-pulse flex items-center gap-1.5 px-2.5 py-1 text-xs"
                >
                  <Radio className="h-3.5 w-3.5" />
                  {isPaused ? "متوقف مؤقتاً · Paused" : "تسجيل مباشر نشط"}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/30 flex items-center gap-1.5 px-2.5 py-1 text-xs"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  محرك التفريغ الصوتي المباشر
                </Badge>
              )}
              <span className="text-xs text-muted-foreground font-mono">
                {formatTimer(elapsedSeconds)}
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-border/50">
                {stateMachine}
              </Badge>
            </div>

            <DialogTitle className="text-lg font-display font-semibold flex items-center gap-2">
              التفريغ والترجمة الصوتية الفورية إلى العربية
            </DialogTitle>
          </div>

          <DialogDescription className="text-xs text-muted-foreground text-right leading-relaxed">
            يدعم التسجيل المباشر اللغة العربية والإنجليزية والمحتوى الهجين، مع تفريغ متزامن وحفظ
            تلقائي فوري للمقاطع المعتمدة.
          </DialogDescription>
        </DialogHeader>

        {/* Close While Recording Safety Prompt */}
        {showClosePrompt && isRecording && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/15 p-3 flex flex-wrap items-center justify-between gap-2 text-right">
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-foreground">
                أنت تقوم بالتسجيل حالياً (You are currently recording)
              </p>
              <p className="text-muted-foreground">
                هل تريد إيقاف التسجيل وحفظ الجلسة وتشغيل التحليل الذكي؟ (Do you want to stop and save
                the recording?)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowClosePrompt(false)}
                className="h-8 text-xs cursor-pointer"
              >
                متابعة التسجيل (Cancel)
              </Button>
              <Button
                size="sm"
                onClick={() => void handleStopAndSave(true)}
                disabled={isFinishing}
                className="gradient-primary text-primary-foreground h-8 text-xs cursor-pointer"
              >
                إيقاف وحفظ (Stop & Save)
              </Button>
            </div>
          </div>
        )}

        {/* Configuration Bar (When not recording) */}
        {!isRecording && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 py-2 text-right">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">نوع الجلسة</label>
              <Select
                value={sessionCategory}
                onValueChange={(v: SessionCategory) => {
                  setSessionCategory(v);
                  if (v === "lecture" && title === "جلسة عمل ومزامنة الأولويات") {
                    setTitle("محاضرة الأنظمة الموزعة والتوافق");
                  } else if (v === "interview" && title.includes("جلسة")) {
                    setTitle("مقابلة تقنية وتقييم مهارات");
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">اجتماع عمل (Meeting)</SelectItem>
                  <SelectItem value="lecture">محاضرة تعليمية (Lecture)</SelectItem>
                  <SelectItem value="interview">مقابلة (Interview)</SelectItem>
                  <SelectItem value="general">جلسة عامة (General)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">لغة التفريغ</label>
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger className="h-8 text-xs bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-Detect</SelectItem>
                  <SelectItem value="ar-EG">العربية (مصر)</SelectItem>
                  <SelectItem value="ar-SA">العربية الفصحى</SelectItem>
                  <SelectItem value="en">English (US)</SelectItem>
                  <SelectItem value="mixed">Mixed (AR/EN)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">عنوان الجلسة</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-8 text-xs bg-background/60 text-right"
                placeholder="عنوان الجلسة..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                اسم المتحدث / المادة
              </label>
              <Input
                value={type === "lecture" ? courseCode : speakerName}
                onChange={(e) =>
                  type === "lecture"
                    ? setCourseCode(e.target.value)
                    : setSpeakerName(e.target.value)
                }
                className="h-8 text-xs bg-background/60 text-right"
                placeholder={type === "lecture" ? "رمز المادة (e.g. CS 6410)" : "اسم المتحدث..."}
              />
            </div>

            {audioDevices.length > 1 && (
              <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                <label className="text-[11px] font-medium text-muted-foreground">
                  جهاز الميكروفون (Microphone Selector)
                </label>
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                  <SelectTrigger className="h-8 text-xs bg-background/60">
                    <SelectValue placeholder="اختر الميكروفون..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">الميكروفون الافتراضي للنظام (Default)</SelectItem>
                    {audioDevices.map((dev) => (
                      <SelectItem key={dev.deviceId} value={dev.deviceId}>
                        {dev.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {/* Recoverable Interrupted Session Banner (Crash / Reload Recovery) */}
        {!isRecording && recoverableSession && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex flex-wrap items-center justify-between gap-2 text-right">
            <div className="flex items-center gap-2 text-xs text-amber-200">
              <RefreshCw
                className={`h-4 w-4 text-amber-400 ${isRecovering ? "animate-spin" : ""}`}
              />
              <div>
                <p className="font-semibold text-foreground">
                  تم العثور على جلسة غير مكتملة: {recoverableSession.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {recoverableSession.segments.length} مقطع محفوظ
                  {recoverableSession.pendingOfflineChunks > 0
                    ? ` · ${recoverableSession.pendingOfflineChunks} مقطع محلي بانتظار المزامنة`
                    : ""}
                  {` · المدة ${formatTimer(recoverableSession.durationSeconds)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={handleResumeRecoverable}
                disabled={isRecovering || isFinishing}
                className="gradient-primary text-primary-foreground h-7 text-[11px] px-2.5 cursor-pointer"
              >
                استئناف التسجيل
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleFinalizeRecoverable}
                disabled={isRecovering || isFinishing}
                className="h-7 text-[11px] px-2.5 cursor-pointer border-amber-500/40"
              >
                إنهاء وتحليل الآن
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void dismissRecoverableSession()}
                disabled={isRecovering || isFinishing}
                className="h-7 text-[11px] px-2 text-muted-foreground hover:text-destructive cursor-pointer"
              >
                تجاهل
              </Button>
            </div>
          </div>
        )}

        {/* Real Error Banner with Retry (never loses recorded audio) */}
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-right">
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {pendingChunksCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void retryFailedChunks()}
                  className="h-7 text-[11px] border-destructive/40 cursor-pointer gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  إعادة مزامنة ({pendingChunksCount})
                </Button>
              )}
              {canRetryFinalize && !isRecording && (
                <Button
                  size="sm"
                  onClick={handleRetryFinalize}
                  disabled={isFinishing}
                  className="gradient-primary text-primary-foreground h-7 text-[11px] cursor-pointer gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  إعادة الحفظ والتحليل
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Post-Stop Real Audio Playback & Download Bar */}
        {!isRecording && (recordedAudioReview || completedResourceId) && (
          <div className="rounded-xl border border-primary/35 bg-primary/10 p-3 space-y-2 text-right">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <Volume2 className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">
                  التسجيل الصوتي الجاهز للاستماع (Audio Playback)
                </span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {formatTimer(recordedAudioReview?.durationSeconds ?? elapsedSeconds)}
                </Badge>
                {recordedAudioReview?.fileSizeBytes ? (
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {formatBytes(recordedAudioReview.fileSizeBytes)}
                  </Badge>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadRecordedAudio}
                  className="h-7 text-[11px] gap-1 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  تحميل الصوت
                </Button>
                {completedResourceId && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const rid = completedResourceId;
                      setCompletedResourceId(null);
                      clearRecordedAudioReview();
                      onOpenChange(false);
                      if (onCompleted) onCompleted(rid, type);
                    }}
                    className="gradient-primary text-primary-foreground h-7 text-[11px] gap-1 cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    عرض التحليل الكامل والاختبار
                  </Button>
                )}
              </div>
            </div>

            <audio
              controls
              preload="metadata"
              src={
                recordedAudioReview?.audioUrl ||
                (completedResourceId ? `/api/v1/recordings/audio/${completedResourceId}` : "")
              }
              className="w-full h-9 rounded-lg"
            />
          </div>
        )}

        {/* Live Status and Audio Waveform Bar */}
        <div className="rounded-xl border border-border/60 bg-secondary/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <Button
                onClick={() => {
                  setCompletedResourceId(null);
                  void startRecording();
                }}
                disabled={isFinishing}
                className="gradient-primary text-primary-foreground shadow-glow h-9 px-4 gap-2 text-xs font-semibold cursor-pointer"
              >
                <Mic className="h-4 w-4" />
                بدء التسجيل المباشر
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={() => void handleStopAndSave(false)}
                  disabled={isFinishing}
                  className="h-9 px-4 gap-2 text-xs font-semibold cursor-pointer shadow-glow"
                >
                  {isFinishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4 fill-current" />
                  )}
                  إنهاء وحفظ الجلسة
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={togglePause}
                  className="h-9 w-9 cursor-pointer"
                  title={isPaused ? "استئناف" : "إيقاف مؤقت"}
                >
                  {isPaused ? <Play className="h-4 w-4 ml-0.5" /> : <Pause className="h-4 w-4" />}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await cancelRecording();
                    toast.info("تم إلغاء الجلسة المباشرة وتجاهل المقطع المؤقت");
                    onOpenChange(false);
                  }}
                  disabled={isFinishing}
                  className="h-9 px-3 text-xs text-muted-foreground hover:text-destructive cursor-pointer gap-1"
                  title="إلغاء وتجاهل التسجيل"
                >
                  <X className="h-4 w-4" />
                  إلغاء
                </Button>
              </div>
            )}

            {/* Live Audio Levels Waveform */}
            <div className="flex items-center gap-1 h-6 px-2 bg-background/50 rounded-lg border border-border/40">
              {audioLevels.map((lvl, idx) => (
                <span
                  key={idx}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    isRecording && !isPaused ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                  style={{
                    height: isRecording && !isPaused ? `${Math.max(4, lvl * 22)}px` : "4px",
                  }}
                />
              ))}
            </div>

            {isProcessingChunk && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                معالجة المقطع الصوتي...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground flex items-center gap-1 font-mono">
              <Globe className="h-3.5 w-3.5 text-primary" />
              {detectedLanguage}
            </span>
          </div>
        </div>

        {/* Toolbar: Search, AutoScroll, Copy, Export */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث في النص العربي المفرغ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-3 pr-8 text-xs bg-background/50 text-right"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex bg-secondary/60 p-0.5 rounded-lg border border-border/50 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("continuous")}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded transition cursor-pointer ${
                  viewMode === "continuous"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                النص المتصل الموحد
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded transition cursor-pointer ${
                  viewMode === "cards"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                المقاطع
              </button>
            </div>

            <Button
              variant={autoScroll ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className="h-8 text-[11px] gap-1 cursor-pointer"
            >
              <ArrowDown className={`h-3.5 w-3.5 ${autoScroll ? "text-primary" : ""}`} />
              التمرير التلقائي
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyTranscript}
              className="h-8 text-[11px] gap-1 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
              نسخ النص
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportTxt}
              className="h-8 text-[11px] gap-1 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              تصدير TXT
            </Button>
          </div>
        </div>

        {/* Scrollable Live Transcript View */}
        <div
          ref={transcriptContainerRef}
          onScroll={handleTranscriptScroll}
          className="flex-1 overflow-y-auto space-y-3 p-4 rounded-xl border border-border/50 bg-background/40 min-h-[240px] text-right"
        >
          {filteredSegments.length === 0 && !interimText && (
            <div className="flex flex-col items-center justify-center h-44 text-muted-foreground text-center space-y-2">
              <Mic className="h-8 w-8 text-primary/40 animate-pulse" />
              <p className="text-sm font-medium">
                {isRecording
                  ? "جاري الاستماع وتفريغ الكلام باللغة العربية فور تحدثك..."
                  : "انقر على زر 'بدء التسجيل المباشر' للبدء في التحدث"}
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                تحدث بلغتك المختارة (عربي، إنجليزي، أو هجين) وسيظهر التفريغ مباشرة هنا مع التمييز
                بين النص المؤقت والنص المعتمد.
              </p>
            </div>
          )}

          {/* Mode 1: Unified Continuous Arabic Text (Default) */}
          {viewMode === "continuous" && (filteredSegments.length > 0 || interimText) && (
            <div className="p-3 bg-secondary/15 rounded-xl border border-border/40 text-right leading-loose select-text text-sm md:text-base font-sans font-medium text-foreground/90">
              {filteredSegments.map((seg, idx) => (
                <span key={seg.id} className="inline">
                  <span className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium border border-border/50 bg-secondary/70 text-primary align-baseline select-none">
                    [{formatTimer(seg.startTime)}]
                  </span>
                  <span>{seg.text}</span>
                  {idx < filteredSegments.length - 1 ? " " : ""}
                </span>
              ))}

              {/* Interim realtime words trailing */}
              {interimText && (
                <span className="inline mr-1 text-primary font-bold italic animate-pulse">
                  {" "}
                  {interimText}...
                </span>
              )}
            </div>
          )}

          {/* Mode 2: Detailed Speaker Segments */}
          {viewMode === "cards" && (
            <div className="space-y-3">
              {filteredSegments.map((seg) => {
                const isEditing = editingSegId === seg.id;
                return (
                  <div
                    key={seg.id}
                    className="group relative rounded-xl border border-border/60 bg-secondary/20 p-3 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isEditing && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 cursor-pointer"
                            onClick={() => {
                              setEditingSegId(seg.id);
                              setEditingText(seg.text);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {typeof seg.confidence === "number" && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {Math.round(seg.confidence * 100)}%
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            seg.isFinal
                              ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                              : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                          }`}
                        >
                          {seg.isFinal ? "معتمد · Final" : "مؤقت · Partial"}
                        </Badge>
                        <span className="font-mono text-[11px] bg-background/60 px-1.5 py-0.5 rounded text-foreground/80">
                          [{formatTimer(seg.startTime)} - {formatTimer(seg.endTime)}]
                        </span>
                        <Badge variant="outline" className="text-[11px] font-semibold text-primary">
                          {seg.speaker}
                        </Badge>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <Input
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="text-sm bg-background/80 text-right"
                          autoFocus
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingSegId(null)}
                            className="h-7 text-xs"
                          >
                            <X className="h-3.5 w-3.5 mr-1" /> إلغاء
                          </Button>
                          <Button
                            size="sm"
                            className="gradient-primary text-primary-foreground h-7 text-xs"
                            onClick={() => handleSaveEdit(seg.id)}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" /> حفظ
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/95 leading-relaxed font-sans font-medium text-right select-text">
                        {seg.text}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* Interim In-Progress Segment */}
              {interimText && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 animate-pulse text-right">
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <span className="text-[10px] text-primary/80 font-medium">
                      جاري المواءمة الفورية...
                    </span>
                    <Badge variant="secondary" className="text-[10px] bg-primary/20 text-primary">
                      {speakerName} (مباشر)
                    </Badge>
                  </div>
                  <p className="text-sm italic text-foreground/80 font-sans leading-relaxed">
                    {interimText}...
                  </p>
                </div>
              )}
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>

        {/* Footer info banner */}
        <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full inline-block ${
                connectionStatus === "offline"
                  ? "bg-destructive"
                  : connectionStatus === "reconnecting" || connectionStatus === "recovering"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-emerald-500"
              }`}
            />
            <span>
              {connectionStatus === "offline"
                ? `وضع عدم الاتصال — تم حفظ ${pendingChunksCount} مقطع محلياً بانتظار عودة الشبكة`
                : connectionStatus === "reconnecting"
                  ? `جاري إعادة الاتصال ومزامنة ${pendingChunksCount} مقطع...`
                  : connectionStatus === "recovering"
                    ? "جاري استعادة الجلسة..."
                    : pendingChunksCount > 0
                      ? `جاري رفع ومزامنة ${pendingChunksCount} مقطع صوتي...`
                      : "نظام الحفظ المستمر ومقاومة انقطاع الشبكة مفعّل"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span>الكلمات: {wordCount}</span>
            <span>إجمالي المقاطع المعتمدة: {segments.length}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDialogOpenChange(false)}
              className="h-7 text-xs cursor-pointer"
            >
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
