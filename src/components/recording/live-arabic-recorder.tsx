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
  FileCheck,
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
import { GlassCard } from "@/components/common/glass-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveTranscription, LiveTranscriptSegment } from "@/hooks/use-live-transcription";
import { toast } from "sonner";

interface LiveArabicRecorderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: "meeting" | "lecture";
  onCompleted?: (resourceId: string, type: "meeting" | "lecture") => void;
}

function formatTimer(seconds: number): string {
  if (!Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function LiveArabicRecorder({
  open,
  onOpenChange,
  defaultType = "meeting",
  onCompleted,
}: LiveArabicRecorderProps) {
  const [type, setType] = useState<"meeting" | "lecture">(defaultType);
  const [title, setTitle] = useState(
    defaultType === "meeting" ? "جلسة عمل ومزامنة الأولويات" : "محاضرة الأنظمة الموزعة والتوافق",
  );
  const [courseCode, setCourseCode] = useState("CS 6410");
  const [speakerName, setSpeakerName] = useState("المتحدث 1");
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"continuous" | "cards">("continuous");
  const [editingSegId, setEditingSegId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isFinishing, setIsFinishing] = useState(false);

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const {
    isRecording,
    isPaused,
    elapsedSeconds,
    segments,
    interimText,
    detectedLanguage,
    isProcessingChunk,
    audioLevels,
    error,
    startRecording,
    togglePause,
    stopRecording,
    setSegments,
  } = useLiveTranscription({
    type,
    title,
    courseCode,
    speakerName,
    chunkDurationMs: 3500,
    onError: (err) => toast.error(err),
  });

  // Auto-scroll when new segment arrives
  useEffect(() => {
    if (autoScroll && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments, interimText, autoScroll]);

  const queryClient = useQueryClient();

  // Handle Save Session
  const handleStopAndSave = async () => {
    setIsFinishing(true);
    toast.loading("جاري تجميع وحفظ النص العربي المفرغ والتحليل الذكي...", { id: "save-session" });

    const result = await stopRecording();
    setIsFinishing(false);

    if (result.success && result.resourceId) {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      toast.success("تم حفظ وتوثيق الجلسة بنجاح في قاعدة البيانات!", { id: "save-session" });
      onOpenChange(false);
      if (onCompleted) {
        onCompleted(result.resourceId, type);
      }
    } else {
      toast.error("تم إيقاف التسجيل ولكن تعذر إنشاء السجل تلقائياً", { id: "save-session" });
    }
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

  // Save manual inline edit
  const handleSaveEdit = (segId: string) => {
    if (!editingText.trim()) return;
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, text: editingText.trim() } : s)),
    );
    setEditingSegId(null);
    toast.success("تم تحديث النص");
  };

  const filteredSegments = segments.filter((seg) => {
    if (!searchQuery.trim()) return true;
    return (
      seg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      seg.speaker.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <Dialog open={open} onOpenChange={(val) => !isRecording && onOpenChange(val)}>
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
                  تسجيل مباشر نشط
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
            </div>

            <DialogTitle className="text-lg font-display font-semibold flex items-center gap-2">
              التفريغ والترجمة الصوتية الفورية إلى العربية
            </DialogTitle>
          </div>

          <DialogDescription className="text-xs text-muted-foreground text-right leading-relaxed">
            يتحدث المشاركون بالإنجليزية أو العربية أو اللهجة المصرية، وتقوم المنصة فورياً بتحويل
            الكلام إلى نص عربي معتمد بالكامل وبشكل متزامن أثناء التحدث.
          </DialogDescription>
        </DialogHeader>

        {/* Configuration Bar (When not recording) */}
        {!isRecording && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2 text-right">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">نوع الجلسة</label>
              <Select value={type} onValueChange={(v: "meeting" | "lecture") => setType(v)}>
                <SelectTrigger className="h-8 text-xs bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">اجتماع عمل (Business Meeting)</SelectItem>
                  <SelectItem value="lecture">محاضرة تعليمية (Lecture)</SelectItem>
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
          </div>
        )}

        {/* Live Status and Audio Waveform Bar */}
        <div className="rounded-xl border border-border/60 bg-secondary/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <Button
                onClick={startRecording}
                className="gradient-primary text-primary-foreground shadow-glow h-9 px-4 gap-2 text-xs font-semibold cursor-pointer"
              >
                <Mic className="h-4 w-4" />
                بدء التسجيل المباشر
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={handleStopAndSave}
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

        {/* Scrollable Live Transcript View (100% Arabic Only) */}
        <div className="flex-1 overflow-y-auto space-y-3 p-4 rounded-xl border border-border/50 bg-background/40 min-h-[260px] text-right">
          {filteredSegments.length === 0 && !interimText && (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-center space-y-2">
              <Mic className="h-8 w-8 text-primary/40 animate-pulse" />
              <p className="text-sm font-medium">
                {isRecording
                  ? "جاري الاستماع وتفريغ الكلام باللغة العربية فور تحدثك..."
                  : "انقر على زر 'بدء التسجيل المباشر' للبدء في التحدث"}
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                تحدث بالإنجليزية أو العربية الفصحى أو اللهجة المصرية، وسيظهر النص هنا مباشرة باللغة
                العربية بدون أي كلمات إنجليزية.
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
        <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            <span>نظام الحفظ المستمر ومقاومة انقطاع الشبكة مفعّل</span>
          </div>

          <div className="flex items-center gap-2">
            <span>إجمالي المقاطع المعتمدة: {segments.length}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isRecording}
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
