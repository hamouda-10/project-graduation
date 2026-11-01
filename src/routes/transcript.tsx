import { useState, useRef, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Search,
  Play,
  Pause,
  Clock,
  User,
  Edit2,
  Check,
  X,
  Download,
  Copy,
  Mic,
  Sparkles,
  Volume2,
  VolumeX,
  RotateCcw,
  Trash2,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Brain,
  ListOrdered,
  UploadCloud,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Quote,
  CheckSquare,
  FileDown,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LiveArabicRecorder } from "@/components/recording/live-arabic-recorder";
import { UploadRecordingDialog } from "@/components/common/upload-recording-dialog";
import { api, Meeting, Lecture, Quiz } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transcript")({
  head: () => ({ meta: [{ title: "التفريغ الصوتي الذكي · MeetMind AI" }] }),
  component: TranscriptPage,
});

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function TranscriptPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("transcript");
  const [viewMode, setViewMode] = useState<"continuous" | "segments">("continuous");
  const [searchQuery, setSearchQuery] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState<string>("ALL");
  const [editingSegId, setEditingSegId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");

  // Modals
  const [liveRecorderOpen, setLiveRecorderOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Audio Player State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(true);

  // AI Generation States
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [quizQuestionCount, setQuizQuestionCount] = useState<number>(5);

  // Quiz Interaction State
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Fetch meetings and lectures
  const { data: meetings = [], isLoading: loadingMeetings } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api.getMeetings(),
  });

  const { data: lectures = [], isLoading: loadingLectures } = useQuery<Lecture[]>({
    queryKey: ["lectures"],
    queryFn: () => api.getLectures(),
  });

  const { data: allQuizzes = [] } = useQuery<Quiz[]>({
    queryKey: ["quizzes"],
    queryFn: () => api.getQuizzes(),
  });

  // Combine items
  const allItems = useMemo<
    Array<{
      id: string;
      title: string;
      rawTitle: string;
      item: Meeting | Lecture;
      type: "meeting" | "lecture";
      courseCode?: string;
    }>
  >(
    () => [
      ...meetings.map((m) => ({
        id: m.id,
        title: `اجتماع: ${m.title}`,
        rawTitle: m.title,
        item: m,
        type: "meeting" as const,
      })),
      ...lectures.map((l) => ({
        id: l.id,
        title: `محاضرة: ${l.courseCode} — ${l.title}`,
        rawTitle: l.title,
        item: l,
        type: "lecture" as const,
        courseCode: l.courseCode,
      })),
    ],
    [meetings, lectures],
  );

  // Selected item
  const currentSelection = allItems.find((a) => a.id === selectedId) || allItems[0] || null;

  // Sync selectedId if invalid
  useEffect(() => {
    if (allItems.length > 0 && (!selectedId || !allItems.some((a) => a.id === selectedId))) {
      setSelectedId(allItems[0].id);
    }
  }, [allItems, selectedId]);

  // Audio source URL
  const audioSrc = currentSelection ? `/api/v1/recordings/audio/${currentSelection.id}` : "";

  // Reset audio playback on item change
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioAvailable(true);
    setUserAnswers({});
    setQuizSubmitted(false);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [currentSelection?.id]);

  // Audio element listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      const dur = audio.duration;
      if (Number.isFinite(dur) && dur > 0) {
        setAudioDuration(dur);
      } else if (currentSelection?.item.durationSeconds) {
        setAudioDuration(currentSelection.item.durationSeconds);
      } else if (currentSelection?.item.segments && currentSelection.item.segments.length > 0) {
        const maxEnd = Math.max(...currentSelection.item.segments.map((s) => s.endTime));
        setAudioDuration(maxEnd || 60);
      } else {
        setAudioDuration(60);
      }
      setAudioAvailable(true);
    };
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      // Audio file might not exist yet for this item
      setAudioAvailable(false);
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [currentSelection]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
          toast.error("تعذر تشغيل الملف الصوتي. قد لا يتوفر ملف مسجل لهذه الجلسة.");
        });
    }
  };

  // Handle Seek
  const handleSeek = (newSec: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = newSec;
    setCurrentTime(newSec);
  };

  // Handle Jump to Timestamp
  const jumpToTimestamp = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
    audioRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {});
    toast.success(`تم الانتقال في التسجيل إلى ${formatTime(seconds)}`);
  };

  // Handle Speed Change
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  // Handle Volume Change
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  // Segments & Speakers
  const segments = currentSelection?.item.segments || [];
  const speakers = Array.from(new Set(segments.map((s) => s.speaker)));

  // Filtered segments
  const filteredSegments = segments.filter((seg) => {
    const textToCheck = seg.text;
    const matchesSearch =
      searchQuery === "" ||
      textToCheck.toLowerCase().includes(searchQuery.toLowerCase()) ||
      seg.speaker.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSpeaker = speakerFilter === "ALL" || seg.speaker === speakerFilter;
    return matchesSearch && matchesSpeaker;
  });

  // Edit segment mutation
  const updateMutation = useMutation({
    mutationFn: (newSegments: typeof segments) =>
      api.updateTranscript(currentSelection!.id, newSegments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      toast.success("تم حفظ التعديل النصي بنجاح");
      setEditingSegId(null);
    },
    onError: () => {
      toast.error("فشل في حفظ التعديل");
    },
  });

  const handleSaveEdit = (segId: string) => {
    if (!editedText.trim() || !currentSelection) return;
    const updated = segments.map((s) => (s.id === segId ? { ...s, text: editedText.trim() } : s));
    updateMutation.mutate(updated);
  };

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!currentSelection) return;
      if (currentSelection.type === "meeting") {
        await api.deleteMeeting(currentSelection.id);
      } else {
        await api.deleteLecture(currentSelection.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success("تم حذف التسجيل والملف الصوتي المرتبط بنجاح");
      setDeleteConfirmOpen(false);
      setSelectedId("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "فشل حذف التسجيل");
    },
  });

  // AI Summary Generation
  const handleGenerateSummary = async () => {
    if (!currentSelection) return;
    setIsGeneratingSummary(true);
    toast.loading("جاري توليد التلخيص الشامل الموثق باللغة العربية...", {
      id: "summary-gen",
    });

    try {
      const res = await api.generateSummary(currentSelection.id, currentSelection.type);
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      toast.success("تم توليد وحفظ التلخيص الذكي بنجاح!", { id: "summary-gen" });
      setActiveTab("summary");
    } catch (e) {
      toast.error("تعذر توليد التلخيص بواسطة الذكاء الاصطناعي", { id: "summary-gen" });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // AI Quiz Generation
  const handleGenerateQuiz = async () => {
    if (!currentSelection) return;
    setIsGeneratingQuiz(true);
    toast.loading("جاري بناء وتنسيق أسئلة الكويز التفاعلي من المحاضرة...", {
      id: "quiz-gen",
    });

    try {
      await api.generateQuiz(currentSelection.id, currentSelection.type, quizQuestionCount);
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      setUserAnswers({});
      setQuizSubmitted(false);
      toast.success("تم إنشاء الكويز التقييمي بنجاح!", { id: "quiz-gen" });
      setActiveTab("quiz");
    } catch (e) {
      toast.error("تعذر إنشاء الكويز بواسطة الذكاء الاصطناعي", { id: "quiz-gen" });
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // AI Lecture Analysis
  const handleGenerateAnalysis = async () => {
    if (!currentSelection) return;
    setIsGeneratingAnalysis(true);
    toast.loading("جاري تحليل المحتوى واستخراج المصطلحات والأسئلة...", {
      id: "analysis-gen",
    });

    try {
      await api.generateAnalysis(currentSelection.id, currentSelection.type);
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      toast.success("تم تحديث التحليل الذكي للمحاضرة بنجاح!", { id: "analysis-gen" });
      setActiveTab("analysis");
    } catch (e) {
      toast.error("تعذر تحليل المحاضرة", { id: "analysis-gen" });
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  const handleExtractKeywords = async () => {
    await handleGenerateAnalysis();
    setActiveTab("analysis");
  };

  const handleExtractImportantSentences = async () => {
    await handleGenerateAnalysis();
    setActiveTab("analysis");
  };

  const handleExtractTasks = async () => {
    await handleGenerateAnalysis();
    setActiveTab("analysis");
  };

  // Find linked quiz
  const currentQuiz = allQuizzes.find(
    (q) => q.lectureId === currentSelection?.id || q.meetingId === currentSelection?.id,
  );

  // Copy transcript text
  const handleCopyTranscript = () => {
    if (segments.length === 0) {
      toast.info("لا توجد نصوص للنسخ");
      return;
    }
    const textContent = segments
      .map(
        (s) => `[${formatTime(s.startTime)} - ${formatTime(s.endTime)}] ${s.speaker}:\n${s.text}\n`,
      )
      .join("\n");
    navigator.clipboard.writeText(textContent);
    toast.success("تم نسخ النص العربي بالكامل إلى الحافظة");
  };

  // Export TXT
  const handleExportText = () => {
    if (segments.length === 0) {
      toast.info("لا توجد نصوص للتصدير");
      return;
    }
    const textContent =
      `# تفريغ جلسة MeetMind AI: ${currentSelection?.rawTitle || "تفريغ صوتي"}\n` +
      `التاريخ: ${new Date().toLocaleDateString("ar-EG")}\n` +
      `اللغة: العربية (تفريغ مباشر وترجمة فورية)\n\n` +
      segments
        .map(
          (s) =>
            `[${formatTime(s.startTime)} - ${formatTime(s.endTime)}] ${s.speaker}:\n${s.text}\n`,
        )
        .join("\n");

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(currentSelection?.rawTitle || "transcript").replace(/[^a-zA-Z0-9ء-ي_]/g, "_")}_arabic.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير ملف النص العربي (.txt)");
  };

  // Export PDF
  const handleExportPDF = () => {
    if (segments.length === 0) {
      toast.info("لا توجد نصوص للتصدير");
      return;
    }
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const title = currentSelection?.rawTitle || "التفريغ الصوتي";
      doc.setFontSize(16);
      doc.text("MeetMind AI - التفريغ الصوتي الذكي", 105, 20, { align: "center" });
      doc.setFontSize(12);
      doc.text(title, 105, 30, { align: "center" });

      doc.setFontSize(10);
      doc.text(`تاريخ الجلسة: ${new Date().toLocaleDateString("ar-EG")}`, 105, 38, {
        align: "center",
      });
      doc.text(`المدة: ${formatTime(effectiveDuration)}`, 105, 44, { align: "center" });

      let y = 55;
      segments.forEach((seg) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const timeHeader = `[${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}] ${seg.speaker}:`;
        doc.setFontSize(9);
        doc.text(timeHeader, 195, y, { align: "right" });
        y += 6;

        const splitLines = doc.splitTextToSize(seg.text, 180);
        splitLines.forEach((line: string) => {
          if (y > 275) {
            doc.addPage();
            y = 20;
          }
          doc.text(line, 195, y, { align: "right" });
          y += 5;
        });
        y += 4;
      });

      doc.save(`${title.replace(/[^a-zA-Z0-9ء-ي_]/g, "_")}_transcript.pdf`);
      toast.success("تم تصدير ملف PDF بنجاح!");
    } catch {
      window.print();
    }
  };

  // Copy Summary
  const handleCopySummary = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم نسخ التلخيص إلى الحافظة");
  };

  // Calculate Quiz Score
  const calculateQuizScore = () => {
    if (!currentQuiz) return { score: 0, total: 0, percent: 0 };
    let correct = 0;
    currentQuiz.questions.forEach((q) => {
      if (userAnswers[q.id] === q.correctOptionIndex) {
        correct++;
      }
    });
    const total = currentQuiz.questions.length;
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { score: correct, total, percent };
  };

  const effectiveDuration = audioDuration || currentSelection?.item.durationSeconds || 180;

  // Active item's summary text
  const currentSummary =
    currentSelection?.type === "meeting"
      ? (currentSelection.item as Meeting).summary
      : (currentSelection?.item as Lecture).studyNotes;

  // Active item's analysis
  const currentAnalysis = currentSelection?.item.analysis;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Hidden native HTML audio element */}
      {audioSrc && <audio ref={audioRef} src={audioSrc} preload="metadata" className="hidden" />}

      <PageHeader
        eyebrow="استوديو الذكاء الاصطناعي العربي"
        title="التفريغ والتلخيص والاختبارات الذكية"
        description="تسجيل صوتي عالي الدقة، تفريغ وترجمة فورية كاملة إلى اللغة العربية، تلخيص فوري مقسم لثمانية محاور، وتوليد كويزات تفاعلية مستندة كلياً إلى المحتوى."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setLiveRecorderOpen(true)}
              className="gradient-primary text-primary-foreground shadow-glow h-9 px-4 gap-2 text-xs font-semibold cursor-pointer"
            >
              <Mic className="h-4 w-4" />
              بدء تسجيل مباشر (بالعربية)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUploadModalOpen(true)}
              className="cursor-pointer text-xs gap-1.5"
            >
              <UploadCloud className="h-4 w-4" /> رفع ملف صوتي
            </Button>
          </div>
        }
      />

      {/* When no recordings exist at all: Genuine Clean Empty State */}
      {allItems.length === 0 && !loadingMeetings && !loadingLectures ? (
        <EmptyState
          icon={Mic}
          title="لا توجد أي تسجيلات أو محاضرات بعد"
          description="النظام في حالة نظيفة وجاهز لاستقبال أول جلسة. يمكنك الضغط على 'بدء تسجيل صوتي مباشر' للتحدث أو تشغيل محاضرة ليتم تفريغها وترجمتها فورياً إلى العربية وحفظها بشكل دائم."
          className="my-8"
        >
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => setLiveRecorderOpen(true)}
              className="gradient-primary text-primary-foreground shadow-glow px-6 py-2.5 text-sm font-semibold cursor-pointer gap-2"
            >
              <Mic className="h-4 w-4" />
              ابدأ أول تسجيل صوتي مباشر الآن
            </Button>
            <Button
              variant="outline"
              onClick={() => setUploadModalOpen(true)}
              className="px-5 py-2.5 text-sm cursor-pointer gap-2"
            >
              <UploadCloud className="h-4 w-4" />
              رفع ملف صوتي مسجل
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          {/* Top Session Bar & Selector */}
          <GlassCard className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto flex-1">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                الجلسة المحددة:
              </span>
              <Select
                value={selectedId || (allItems[0]?.id ?? "")}
                onValueChange={(val) => setSelectedId(val)}
              >
                <SelectTrigger className="w-full md:w-96 bg-background/60 text-right">
                  <SelectValue placeholder="اختر جلسة أو محاضرة..." />
                </SelectTrigger>
                <SelectContent>
                  {allItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {currentSelection && (
                <Badge
                  variant={currentSelection.type === "meeting" ? "secondary" : "outline"}
                  className="text-xs font-mono shrink-0"
                >
                  {currentSelection.type === "meeting" ? "اجتماع عمل" : "محاضرة جامعية"}
                </Badge>
              )}
            </div>

            {/* Quick Session Actions */}
            {currentSelection && (
              <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyTranscript}
                  className="cursor-pointer text-xs gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" /> نسخ النص
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportText}
                  className="cursor-pointer text-xs gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" /> تصدير TXT
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPDF}
                  className="cursor-pointer text-xs gap-1.5"
                >
                  <FileDown className="h-3.5 w-3.5" /> تصدير PDF
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="cursor-pointer text-xs text-destructive hover:bg-destructive/10 gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" /> حذف التسجيل
                </Button>
              </div>
            )}
          </GlassCard>

          {/* Full Audio Player with Timeline Seeking, Speeds, and Download */}
          {currentSelection && (
            <GlassCard className="p-4 bg-secondary/30 space-y-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Track Info */}
                <div className="text-right w-full sm:w-auto">
                  <div className="text-sm font-semibold truncate max-w-md">
                    {currentSelection.rawTitle}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    {audioAvailable ? (
                      <span className="text-emerald-500 font-medium flex items-center gap-1 text-[11px]">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        الملف الصوتي جاهز للبث والمزامنة
                      </span>
                    ) : (
                      <span className="text-amber-500 font-medium text-[11px]">
                        الملف الصوتي غير متاح (تفريغ نصي فقط)
                      </span>
                    )}
                    <span>•</span>
                    <span className="font-mono text-[11px]">
                      المدة الإجمالية: {formatTime(effectiveDuration)}
                    </span>
                  </div>
                </div>

                {/* Primary Playback & Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Download Audio */}
                  <a
                    href={`/api/v1/recordings/download/${currentSelection.id}`}
                    download={`${currentSelection.rawTitle}.webm`}
                    className="inline-flex items-center justify-center h-8 px-2.5 rounded-lg border border-border/60 bg-background/50 hover:bg-background text-xs font-medium transition cursor-pointer gap-1"
                    title="تنزيل الملف الصوتي الأصلي"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">تنزيل الصوت</span>
                  </a>

                  {/* Playback Speed */}
                  <Select
                    value={String(playbackSpeed)}
                    onValueChange={(val) => handleSpeedChange(parseFloat(val))}
                  >
                    <SelectTrigger className="h-8 w-20 bg-background/50 text-xs font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.75">0.75x</SelectItem>
                      <SelectItem value="1">1.0x</SelectItem>
                      <SelectItem value="1.25">1.25x</SelectItem>
                      <SelectItem value="1.5">1.5x</SelectItem>
                      <SelectItem value="2">2.0x</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Volume Control */}
                  <div className="hidden lg:flex items-center gap-1.5 bg-background/40 px-2 py-1 rounded-lg">
                    <button
                      onClick={toggleMute}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {isMuted ? (
                        <VolumeX className="h-3.5 w-3.5" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-16 h-1 accent-primary cursor-pointer"
                    />
                  </div>

                  {/* Play/Pause Button */}
                  <Button
                    size="icon"
                    className="h-10 w-10 rounded-full gradient-primary text-primary-foreground shadow-glow cursor-pointer shrink-0"
                    onClick={togglePlay}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4 ml-0.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Seeker Bar with Timers */}
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs font-mono text-muted-foreground shrink-0 w-11 text-left">
                  {formatTime(currentTime)}
                </span>

                <input
                  type="range"
                  min={0}
                  max={effectiveDuration || 100}
                  step={0.5}
                  value={currentTime}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />

                <span className="text-xs font-mono text-muted-foreground shrink-0 w-11 text-right">
                  {formatTime(effectiveDuration)}
                </span>
              </div>
            </GlassCard>
          )}

          {/* Direct Manual Actions on Recording & Transcript */}
          {currentSelection && (
            <GlassCard className="p-3.5 bg-card/70 border border-primary/20 space-y-2.5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-xs font-semibold px-1">
                <span className="flex items-center gap-1.5 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  العمليات والإجراءات الفورية على التسجيل والنص
                </span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  عمليات ذكاء اصطناعي ومعالجة حقيقية متصلة بقاعدة البيانات
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* 1. تلخيص النص */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateSummary}
                  disabled={isGeneratingSummary}
                  className="cursor-pointer text-xs gap-1.5 border-primary/30 hover:border-primary hover:bg-primary/10"
                >
                  <Sparkles
                    className={`h-3.5 w-3.5 text-primary ${isGeneratingSummary ? "animate-spin" : ""}`}
                  />
                  تلخيص النص
                </Button>

                {/* 2. استخراج الكلمات المهمة */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExtractKeywords}
                  disabled={isGeneratingAnalysis}
                  className="cursor-pointer text-xs gap-1.5 border-cyan-500/30 hover:border-cyan-500 hover:bg-cyan-500/10"
                >
                  <BookOpen className="h-3.5 w-3.5 text-cyan-500" />
                  استخراج الكلمات المهمة
                </Button>

                {/* 3. استخراج الجمل المهمة */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExtractImportantSentences}
                  disabled={isGeneratingAnalysis}
                  className="cursor-pointer text-xs gap-1.5 border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/10"
                >
                  <Quote className="h-3.5 w-3.5 text-amber-500" />
                  استخراج الجمل المهمة
                </Button>

                {/* 4. استخراج المهام */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExtractTasks}
                  disabled={isGeneratingAnalysis}
                  className="cursor-pointer text-xs gap-1.5 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/10"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-emerald-500" />
                  استخراج المهام
                </Button>

                {/* 5. إنشاء كويز */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateQuiz}
                  disabled={isGeneratingQuiz}
                  className="cursor-pointer text-xs gap-1.5 border-pink-500/30 hover:border-pink-500 hover:bg-pink-500/10"
                >
                  <Brain
                    className={`h-3.5 w-3.5 text-pink-500 ${isGeneratingQuiz ? "animate-pulse" : ""}`}
                  />
                  إنشاء كويز
                </Button>

                {/* 6. نسخ النص بالكامل */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCopyTranscript}
                  className="cursor-pointer text-xs gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  نسخ النص بالكامل
                </Button>

                {/* 7. تحميل النص TXT */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleExportText}
                  className="cursor-pointer text-xs gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  تحميل النص TXT
                </Button>

                {/* تحميل PDF */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleExportPDF}
                  className="cursor-pointer text-xs gap-1.5"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  تحميل PDF
                </Button>

                {/* 8. تشغيل الصوت */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={togglePlay}
                  className="cursor-pointer text-xs gap-1.5"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {isPlaying ? "إيقاف مؤقت" : "تشغيل الصوت"}
                </Button>

                {/* 9. تحميل الملف الصوتي */}
                <a
                  href={`/api/v1/recordings/download/${currentSelection.id}`}
                  download={`${currentSelection.rawTitle}.webm`}
                  className="inline-flex items-center justify-center h-8 px-3 rounded-lg border border-border/60 bg-secondary/80 hover:bg-secondary text-xs font-medium transition cursor-pointer gap-1.5"
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  تحميل الملف الصوتي
                </a>
              </div>
            </GlassCard>
          )}

          {/* Main Workspace Navigation: 4 Core Capabilities */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid grid-cols-2 md:grid-cols-4 bg-card/60 p-1 border border-border/60 rounded-xl">
              <TabsTrigger
                value="transcript"
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                النص المفرغ الكامل (بالعربية)
              </TabsTrigger>
              <TabsTrigger value="summary" className="gap-1.5 text-xs font-semibold cursor-pointer">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                تلخيص المحاضرة
              </TabsTrigger>
              <TabsTrigger value="quiz" className="gap-1.5 text-xs font-semibold cursor-pointer">
                <Brain className="h-3.5 w-3.5 text-pink-500" />
                كويز تفاعلي من المحاضرة
              </TabsTrigger>
              <TabsTrigger
                value="analysis"
                className="gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <ListOrdered className="h-3.5 w-3.5 text-cyan-500" />
                تحليل المحاضرة والبيانات
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: TRANSCRIPT */}
            <TabsContent value="transcript" className="space-y-4">
              {/* Toolbar: Search, Speaker Filter, and View Mode Toggle */}
              <GlassCard className="p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="ابحث داخل النص العربي المفرغ بالكلمة أو العبارة..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-9 pl-3 bg-background/50 text-right text-sm"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <Select value={speakerFilter} onValueChange={setSpeakerFilter}>
                    <SelectTrigger className="w-36 bg-background/50 text-right text-xs">
                      <SelectValue placeholder="المتحدث" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">جميع المتحدثين</SelectItem>
                      {speakers.map((spk) => (
                        <SelectItem key={spk} value={spk}>
                          {spk}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex bg-secondary/50 p-1 rounded-xl border border-border/40 shrink-0">
                    <button
                      onClick={() => setViewMode("continuous")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        viewMode === "continuous"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      النص المتصل الموحد
                    </button>
                    <button
                      onClick={() => setViewMode("segments")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        viewMode === "segments"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      المقاطع والمتحدثون
                    </button>
                  </div>
                </div>
              </GlassCard>

              {/* View 1: ONE Main Continuous Transcript Block (Default) */}
              {viewMode === "continuous" ? (
                <GlassCard className="p-6 md:p-8 space-y-4 text-right">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyTranscript}
                        className="text-xs cursor-pointer gap-1.5"
                      >
                        <Copy className="h-3.5 w-3.5" /> نسخ النص الكامل
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-semibold text-base text-foreground flex items-center gap-2">
                        النص المتكامل الموحد للمحاضرة
                        <FileText className="h-4 w-4 text-primary" />
                      </h3>
                      <Badge variant="outline" className="text-xs font-mono">
                        تفريغ وترجمة باللغة العربية
                      </Badge>
                    </div>
                  </div>

                  {filteredSegments.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      لم يتم العثور على أي نصوص مفرغة تطابق بحثك.
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-right font-sans leading-relaxed text-foreground/90 space-y-4 text-base selection:bg-primary/20">
                      <p className="inline leading-loose">
                        {filteredSegments.map((seg, idx) => {
                          const isActive =
                            currentTime >= seg.startTime && currentTime <= seg.endTime;
                          return (
                            <span key={seg.id} className="inline">
                              <button
                                onClick={() => jumpToTimestamp(seg.startTime)}
                                className={`inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded text-xs font-mono font-medium border transition cursor-pointer select-none align-baseline ${
                                  isActive
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-secondary/60 text-primary border-border/50 hover:bg-primary/20"
                                }`}
                                title={`انقر للاستماع فورياً بدءاً من ${formatTime(seg.startTime)}`}
                              >
                                <Clock className="h-3 w-3 inline" />
                                {formatTime(seg.startTime)}
                              </button>
                              <span
                                className={`transition-colors font-medium ${
                                  isActive
                                    ? "bg-primary/15 text-foreground font-bold rounded px-1"
                                    : ""
                                }`}
                              >
                                {searchQuery ? highlightQuery(seg.text, searchQuery) : seg.text}
                              </span>
                              {idx < filteredSegments.length - 1 ? " " : ""}
                            </span>
                          );
                        })}
                      </p>
                    </div>
                  )}
                </GlassCard>
              ) : (
                /* View 2: Detailed Speaker Segments List */
                <div className="space-y-3">
                  {filteredSegments.length === 0 ? (
                    <GlassCard className="p-8 text-center text-muted-foreground text-sm space-y-3">
                      <p>لم يتم العثور على أي مقاطع نصية تطابق بحثك في هذا التسجيل.</p>
                    </GlassCard>
                  ) : (
                    filteredSegments.map((seg) => {
                      const isEditing = editingSegId === seg.id;
                      const isActive = currentTime >= seg.startTime && currentTime <= seg.endTime;

                      return (
                        <GlassCard
                          key={seg.id}
                          className={`p-4 transition-all relative group text-right ${
                            isActive
                              ? "border-primary/60 bg-primary/5 shadow-sm"
                              : "hover:border-primary/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            {!isEditing && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                onClick={() => {
                                  setEditingSegId(seg.id);
                                  setEditedText(seg.text);
                                }}
                              >
                                <Edit2 className="h-3 w-3 mr-1" /> تعديل النص
                              </Button>
                            )}

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => jumpToTimestamp(seg.startTime)}
                                className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-background/60 px-2 py-0.5 rounded border border-border/40"
                                title="انقر للاستماع فورياً من هذه اللحظة"
                              >
                                <span>
                                  [{formatTime(seg.startTime)} - {formatTime(seg.endTime)}]
                                </span>
                                <Clock className="h-3 w-3" />
                              </button>
                              <Badge
                                variant="outline"
                                className="font-mono text-xs flex items-center gap-1 font-semibold text-primary"
                              >
                                <span>{seg.speaker}</span>
                                <User className="h-3 w-3 ml-1" />
                              </Badge>
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="space-y-2 mt-2">
                              <Input
                                value={editedText}
                                onChange={(e) => setEditedText(e.target.value)}
                                className="bg-background/80 text-right text-sm"
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingSegId(null)}
                                  className="cursor-pointer text-xs"
                                >
                                  <X className="h-3.5 w-3.5 mr-1" /> إلغاء
                                </Button>
                                <Button
                                  size="sm"
                                  className="gradient-primary text-primary-foreground cursor-pointer text-xs"
                                  onClick={() => handleSaveEdit(seg.id)}
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" /> حفظ التعديل
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-foreground/90 leading-relaxed font-sans text-right select-text font-medium">
                              {searchQuery ? highlightQuery(seg.text, searchQuery) : seg.text}
                            </p>
                          )}
                        </GlassCard>
                      );
                    })
                  )}
                </div>
              )}
            </TabsContent>

            {/* TAB 2: AI SUMMARY (8 SECTIONS) */}
            <TabsContent value="summary" className="space-y-4">
              <GlassCard className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-base font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    التلخيص الشامل الموثق للمحاضرة باللغة العربية
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    يولد ملخصاً هيكلياً دقيقاً من ثمانية أقسام مستنداً كلياً إلى نص التسجيل
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {currentSummary && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopySummary(currentSummary)}
                      className="cursor-pointer text-xs gap-1.5"
                    >
                      <Copy className="h-3.5 w-3.5" /> نسخ التلخيص
                    </Button>
                  )}
                  <Button
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingSummary}
                    className="gradient-primary text-primary-foreground shadow-glow h-9 px-4 text-xs font-semibold cursor-pointer gap-2"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isGeneratingSummary ? "animate-spin" : ""}`}
                    />
                    {currentSummary ? "إعادة توليد التلخيص" : "تلخيص المحاضرة بالذكاء الاصطناعي"}
                  </Button>
                </div>
              </GlassCard>

              {isGeneratingSummary ? (
                <GlassCard className="p-12 text-center space-y-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary mx-auto">
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  </div>
                  <h4 className="font-semibold text-base">
                    جاري صياغة التلخيص الهيكلي باللغة العربية...
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    يقوم النموذج بفحص النص المفرغ بالكامل، واستخراج المحاور، والقرارات، والمهام
                    المسندة، والمفاهيم، ومجالات المراجعة بدقة تامة.
                  </p>
                </GlassCard>
              ) : currentSummary ? (
                <div className="space-y-4">{renderSummarySections(currentSummary)}</div>
              ) : (
                <GlassCard className="p-12 text-center space-y-3">
                  <BookOpen className="h-10 w-10 text-muted-foreground mx-auto" />
                  <h4 className="font-semibold text-base">لم يتم إنشاء تلخيص لهذه الجلسة بعد</h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    انقر على زر "تلخيص المحاضرة بالذكاء الاصطناعي" بالأعلى لتوليد التلخيص المكون من
                    8 أقسام وحفظه دائماً في قاعدة البيانات.
                  </p>
                  <Button
                    onClick={handleGenerateSummary}
                    className="gradient-primary text-primary-foreground mt-2 cursor-pointer text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    توليد التلخيص الآن
                  </Button>
                </GlassCard>
              )}
            </TabsContent>

            {/* TAB 3: INTERACTIVE QUIZ */}
            <TabsContent value="quiz" className="space-y-4">
              <GlassCard className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-base font-semibold flex items-center gap-2">
                    <Brain className="h-4 w-4 text-pink-500" />
                    كويز تقييمي تفاعلي من المحاضرة
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    أسئلة اختيار من متعدد، صواب وخطأ، وتفكير مفاهيمي مصاغة مباشرة من مضمون الشرح
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">عدد الأسئلة:</span>
                    <Select
                      value={String(quizQuestionCount)}
                      onValueChange={(val) => setQuizQuestionCount(parseInt(val, 10))}
                    >
                      <SelectTrigger className="h-8 w-16 bg-background/50 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="8">8</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleGenerateQuiz}
                    disabled={isGeneratingQuiz}
                    className="gradient-primary text-primary-foreground shadow-glow h-9 px-4 text-xs font-semibold cursor-pointer gap-2"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isGeneratingQuiz ? "animate-spin" : ""}`}
                    />
                    {currentQuiz ? "إنشاء كويز جديد" : "إنشاء كويز من المحاضرة"}
                  </Button>
                </div>
              </GlassCard>

              {isGeneratingQuiz ? (
                <GlassCard className="p-12 text-center space-y-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-pink-500/10 text-pink-500 mx-auto">
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  </div>
                  <h4 className="font-semibold text-base">جاري إنشاء أسئلة الكويز التقييمي...</h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    يقوم الذكاء الاصطناعي بصياغة خيارات ذكية وتوضيحات تفصيلية لكل سؤال مستندة إلى
                    الشرح الوارد في الجلسة.
                  </p>
                </GlassCard>
              ) : currentQuiz && currentQuiz.questions.length > 0 ? (
                <div className="space-y-4">
                  {/* Score summary banner if submitted */}
                  {quizSubmitted && (
                    <GlassCard className="p-4 border-primary/40 bg-primary/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setUserAnswers({});
                            setQuizSubmitted(false);
                            toast.info("تمت إعادة تعيين إجابات الكويز للمحاولة مرة أخرى");
                          }}
                          className="cursor-pointer text-xs gap-1"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> إعادة المحاولة
                        </Button>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-bold text-foreground">
                          النتيجة المحققة: {calculateQuizScore().percent}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          أجبت بشكل صحيح على {calculateQuizScore().score} من أصل{" "}
                          {calculateQuizScore().total} أسئلة
                        </div>
                      </div>
                    </GlassCard>
                  )}

                  {/* Question cards */}
                  {currentQuiz.questions.map((q, idx) => {
                    const chosen = userAnswers[q.id];
                    const isAnswered = chosen !== undefined;
                    const isCorrect = chosen === q.correctOptionIndex;

                    return (
                      <GlassCard
                        key={q.id}
                        className={`p-5 space-y-4 text-right transition-all ${
                          quizSubmitted
                            ? isCorrect
                              ? "border-emerald-500/50 bg-emerald-500/5"
                              : "border-destructive/50 bg-destructive/5"
                            : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            {quizSubmitted && (
                              <Badge
                                variant={isCorrect ? "default" : "destructive"}
                                className="text-xs gap-1 font-semibold"
                              >
                                {isCorrect ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" /> إجابة صحيحة
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3 w-3" /> إجابة خاطئة
                                  </>
                                )}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">
                              السؤال {idx + 1}:
                            </span>
                            <span className="text-sm font-medium text-foreground leading-relaxed">
                              {q.question}
                            </span>
                          </div>
                        </div>

                        {/* Options */}
                        <div className="space-y-2 pt-1">
                          {q.options.map((opt, optIdx) => {
                            const isSelected = chosen === optIdx;
                            const isThisCorrect = q.correctOptionIndex === optIdx;

                            let optClasses =
                              "flex items-center justify-between p-3 rounded-xl border text-sm transition cursor-pointer ";
                            if (quizSubmitted) {
                              if (isThisCorrect) {
                                optClasses +=
                                  "border-emerald-500 bg-emerald-500/15 text-emerald-600 font-semibold dark:text-emerald-400";
                              } else if (isSelected && !isThisCorrect) {
                                optClasses +=
                                  "border-destructive bg-destructive/15 text-destructive font-semibold";
                              } else {
                                optClasses += "border-border/40 opacity-60";
                              }
                            } else {
                              if (isSelected) {
                                optClasses +=
                                  "border-primary bg-primary/10 text-primary font-medium";
                              } else {
                                optClasses += "border-border/60 hover:bg-secondary/40";
                              }
                            }

                            return (
                              <div
                                key={optIdx}
                                onClick={() => {
                                  if (!quizSubmitted) {
                                    setUserAnswers((prev) => ({ ...prev, [q.id]: optIdx }));
                                  }
                                }}
                                className={optClasses}
                              >
                                <div className="flex items-center gap-2">
                                  {quizSubmitted && isThisCorrect && (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  )}
                                  {quizSubmitted && isSelected && !isThisCorrect && (
                                    <XCircle className="h-4 w-4 text-destructive" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span>{opt}</span>
                                  <span className="h-5 w-5 rounded-full border border-border/70 grid place-items-center text-xs font-mono">
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Explanation box on submit */}
                        {quizSubmitted && q.explanation && (
                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                            <span className="font-semibold text-primary flex items-center gap-1 justify-end">
                              الشرح والتوثيق من المحاضرة:
                              <HelpCircle className="h-3.5 w-3.5" />
                            </span>
                            <p className="text-muted-foreground leading-relaxed">{q.explanation}</p>
                          </div>
                        )}
                      </GlassCard>
                    );
                  })}

                  {/* Submit Quiz Action */}
                  {!quizSubmitted && (
                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={() => {
                          const answeredCount = Object.keys(userAnswers).length;
                          if (answeredCount === 0) {
                            toast.warning("يرجى الإجابة على الأسئلة أولاً قبل تسليم الكويز");
                            return;
                          }
                          setQuizSubmitted(true);
                          const { percent } = calculateQuizScore();
                          toast.success(`تم تقييم الكويز بنجاح! النتيجة: ${percent}%`);
                        }}
                        className="gradient-primary text-primary-foreground shadow-glow px-6 py-2 text-sm font-semibold cursor-pointer"
                      >
                        تصحيح الإجابات وتقييم النتيجة
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <GlassCard className="p-12 text-center space-y-3">
                  <Brain className="h-10 w-10 text-muted-foreground mx-auto" />
                  <h4 className="font-semibold text-base">لا يوجد كويز متاح لهذه المحاضرة بعد</h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    اضغط على "إنشاء كويز من المحاضرة" ليقوم الذكاء الاصطناعي بصياغة أسئلة تفاعلية
                    ذكية تقيس مدى استيعابك للمفاهيم المشروحة.
                  </p>
                  <Button
                    onClick={handleGenerateQuiz}
                    className="gradient-primary text-primary-foreground mt-2 cursor-pointer text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    إنشاء الكويز الآن
                  </Button>
                </GlassCard>
              )}
            </TabsContent>

            {/* TAB 4: LECTURE ANALYSIS */}
            <TabsContent value="analysis" className="space-y-4">
              <GlassCard className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-base font-semibold flex items-center gap-2">
                    <ListOrdered className="h-4 w-4 text-cyan-500" />
                    التحليل الذكي المتعمق للمحاضرة
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    استخراج المصطلحات التقنية، الأسئلة المطروحة، النقاط المؤكد عليها، ومجالات
                    المراجعة مع روابط زمنية
                  </p>
                </div>

                <Button
                  onClick={handleGenerateAnalysis}
                  disabled={isGeneratingAnalysis}
                  className="gradient-primary text-primary-foreground shadow-glow h-9 px-4 text-xs font-semibold cursor-pointer gap-2"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isGeneratingAnalysis ? "animate-spin" : ""}`}
                  />
                  {currentAnalysis ? "تحديث التحليل" : "استخراج تحليل المحاضرة"}
                </Button>
              </GlassCard>

              {isGeneratingAnalysis ? (
                <GlassCard className="p-12 text-center space-y-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-500 mx-auto">
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  </div>
                  <h4 className="font-semibold text-base">جاري تحليل البيانات ومحاور الشرح...</h4>
                </GlassCard>
              ) : currentAnalysis ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Important Quotes / Sentences */}
                  {currentAnalysis.importantSentences &&
                    currentAnalysis.importantSentences.length > 0 && (
                      <GlassCard className="p-4 space-y-3 text-right md:col-span-2">
                        <h4 className="font-semibold text-sm text-primary flex items-center gap-1.5 justify-end">
                          أهم الجمل والاقتباسات الحاسمة من المحاضر
                          <Quote className="h-4 w-4 text-primary" />
                          <Badge variant="outline" className="text-[10px]">
                            {currentAnalysis.importantSentences.length}
                          </Badge>
                        </h4>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {currentAnalysis.importantSentences.map(
                            (
                              item: { quote: string; context?: string; timestamp?: string },
                              i: number,
                            ) => (
                              <div
                                key={i}
                                className="p-3 rounded-xl bg-background/50 border border-primary/20 text-xs space-y-1.5 relative overflow-hidden"
                              >
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  {item.timestamp && (
                                    <Badge variant="secondary" className="text-[10px] font-mono">
                                      {item.timestamp}
                                    </Badge>
                                  )}
                                  <span className="font-medium text-primary">
                                    اقتباس محوري #{i + 1}
                                  </span>
                                </div>
                                <p className="font-semibold text-foreground leading-relaxed">
                                  "{item.quote}"
                                </p>
                                {item.context && (
                                  <p className="text-[11px] text-muted-foreground/90">
                                    السياق: {item.context}
                                  </p>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </GlassCard>
                    )}

                  {/* Action Items / Assigned Tasks */}
                  {currentAnalysis.actionItems && currentAnalysis.actionItems.length > 0 && (
                    <GlassCard className="p-4 space-y-3 text-right md:col-span-2">
                      <h4 className="font-semibold text-sm text-primary flex items-center gap-1.5 justify-end">
                        المهام والتكليفات والتعليمات المستخرجة
                        <CheckSquare className="h-4 w-4 text-emerald-500" />
                        <Badge variant="outline" className="text-[10px]">
                          {currentAnalysis.actionItems.length}
                        </Badge>
                      </h4>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {currentAnalysis.actionItems.map(
                          (
                            item: {
                              task: string;
                              owner?: string;
                              deadline?: string;
                              priority?: "high" | "medium" | "low";
                            },
                            i: number,
                          ) => (
                            <div
                              key={i}
                              className="p-3 rounded-xl bg-background/50 border border-border/50 text-xs space-y-1.5 flex flex-col justify-between"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-1">
                                  {item.priority && (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[10px] px-1.5",
                                        item.priority === "high" &&
                                          "border-destructive/40 text-destructive bg-destructive/10",
                                        item.priority === "medium" &&
                                          "border-amber-500/40 text-amber-500 bg-amber-500/10",
                                        item.priority === "low" &&
                                          "border-muted-foreground/40 text-muted-foreground bg-muted/10",
                                      )}
                                    >
                                      {item.priority === "high"
                                        ? "أولوية عالية"
                                        : item.priority === "medium"
                                          ? "أولوية متوسطة"
                                          : "عادية"}
                                    </Badge>
                                  )}
                                  <span className="font-bold text-foreground text-xs leading-snug">
                                    {item.task}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[10.5px] text-muted-foreground">
                                <span>
                                  {item.deadline ? `الموعد: ${item.deadline}` : "غير محدد"}
                                </span>
                                <span>{item.owner ? `المسؤول: ${item.owner}` : "الجميع"}</span>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </GlassCard>
                  )}

                  {/* Key Concepts / Definitions */}
                  {currentAnalysis.definitions && currentAnalysis.definitions.length > 0 && (
                    <GlassCard className="p-4 space-y-3 text-right">
                      <h4 className="font-semibold text-sm text-primary flex items-center gap-1.5 justify-end">
                        المصطلحات والمفاهيم الأساسية
                        <Badge variant="outline" className="text-[10px]">
                          {currentAnalysis.definitions.length}
                        </Badge>
                      </h4>
                      <div className="space-y-2">
                        {currentAnalysis.definitions.map(
                          (d: { term: string; definition: string }, i: number) => (
                            <div
                              key={i}
                              className="p-2.5 rounded-xl bg-background/50 border border-border/50 text-xs space-y-1"
                            >
                              <div className="font-bold text-foreground">{d.term}</div>
                              <div className="text-muted-foreground leading-relaxed">
                                {d.definition}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </GlassCard>
                  )}

                  {/* Questions Raised */}
                  {currentAnalysis.questionsAsked && currentAnalysis.questionsAsked.length > 0 && (
                    <GlassCard className="p-4 space-y-3 text-right">
                      <h4 className="font-semibold text-sm text-primary flex items-center gap-1.5 justify-end">
                        الأسئلة والنقاشات المطروحة
                        <Badge variant="outline" className="text-[10px]">
                          {currentAnalysis.questionsAsked.length}
                        </Badge>
                      </h4>
                      <ul className="space-y-2">
                        {currentAnalysis.questionsAsked.map(
                          (q: { question: string; answer?: string }, i: number) => (
                            <li
                              key={i}
                              className="p-2.5 rounded-xl bg-background/50 border border-border/50 text-xs space-y-1"
                            >
                              <div className="font-semibold text-foreground">؟ {q.question}</div>
                              {q.answer && (
                                <div className="text-muted-foreground text-[11px] leading-relaxed">
                                  الإجابة: {q.answer}
                                </div>
                              )}
                            </li>
                          ),
                        )}
                      </ul>
                    </GlassCard>
                  )}

                  {/* Emphasized Points */}
                  {currentAnalysis.emphasizedPoints &&
                    currentAnalysis.emphasizedPoints.length > 0 && (
                      <GlassCard className="p-4 space-y-3 text-right">
                        <h4 className="font-semibold text-sm text-primary flex items-center gap-1.5 justify-end">
                          النقاط التي تم التأكيد عليها بشدة
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </h4>
                        <ul className="space-y-1.5 text-xs">
                          {currentAnalysis.emphasizedPoints.map((pt: string, i: number) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 justify-end text-muted-foreground"
                            >
                              <span>{pt}</span>
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                            </li>
                          ))}
                        </ul>
                      </GlassCard>
                    )}

                  {/* Review Areas / Exam Prep */}
                  {currentAnalysis.reviewAreas && currentAnalysis.reviewAreas.length > 0 && (
                    <GlassCard className="p-4 space-y-3 text-right">
                      <h4 className="font-semibold text-sm text-primary flex items-center gap-1.5 justify-end">
                        مجالات المراجعة الموصى بها
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      </h4>
                      <ul className="space-y-1.5 text-xs">
                        {currentAnalysis.reviewAreas.map((area: string, i: number) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 justify-end text-muted-foreground"
                          >
                            <span>{area}</span>
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  )}
                </div>
              ) : (
                <GlassCard className="p-12 text-center space-y-3">
                  <ListOrdered className="h-10 w-10 text-muted-foreground mx-auto" />
                  <h4 className="font-semibold text-base">لا يوجد تحليل تفصيلي حتى الآن</h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    انقر على "استخراج تحليل المحاضرة" لاستخراج المصطلحات والمحاور والأسئلة تلقائياً.
                  </p>
                  <Button
                    onClick={handleGenerateAnalysis}
                    className="gradient-primary text-primary-foreground mt-2 cursor-pointer text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    استخراج التحليل الآن
                  </Button>
                </GlassCard>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 justify-end text-destructive">
              تأكيد حذف التسجيل بالكامل
              <AlertTriangle className="h-5 w-5" />
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
              هل أنت متأكد من رغبتك في حذف تسجيل "<b>{currentSelection?.rawTitle}</b>"؟ سيتم حذف
              الملف الصوتي من القرص الصلب نهائياً، وإزالة النص المفرغ والتلخيص والكويز المرتبط فوراً
              دون إمكانية الاسترجاع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 justify-start mt-4">
            <AlertDialogCancel className="cursor-pointer">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              نعم، حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Live Arabic Recorder Modal */}
      <LiveArabicRecorder
        open={liveRecorderOpen}
        onOpenChange={setLiveRecorderOpen}
        defaultType="meeting"
        onCompleted={(resourceId) => {
          queryClient.invalidateQueries({ queryKey: ["meetings"] });
          queryClient.invalidateQueries({ queryKey: ["lectures"] });
          setSelectedId(resourceId);
        }}
      />

      {/* Upload Recording Dialog */}
      <UploadRecordingDialog
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUploaded={(resourceId) => {
          queryClient.invalidateQueries({ queryKey: ["meetings"] });
          queryClient.invalidateQueries({ queryKey: ["lectures"] });
          setSelectedId(resourceId);
        }}
      />
    </div>
  );
}

// Helper to highlight queries in text
function highlightQuery(text: string, query: string) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-primary/25 text-primary font-bold rounded px-1">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

// Helper to render the 8 structured Arabic sections
function renderSummarySections(markdown: string) {
  if (!markdown) return null;

  // Split by markdown h2 headers (## )
  const sections = markdown.split(/(?=^## )/gm).filter((s) => s.trim().length > 0);

  if (sections.length <= 1) {
    // Single block fallback
    return (
      <GlassCard className="p-6 text-right space-y-3">
        <div className="prose prose-sm dark:prose-invert max-w-none text-right leading-relaxed font-sans whitespace-pre-wrap">
          {markdown}
        </div>
      </GlassCard>
    );
  }

  return sections.map((sec, idx) => {
    const lines = sec.trim().split("\n");
    const rawHeader = lines[0].replace(/^##\s*/, "").trim();
    const content = lines.slice(1).join("\n").trim();

    return (
      <GlassCard key={idx} className="p-5 text-right space-y-3">
        <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
          <Badge variant="outline" className="text-xs font-mono font-semibold">
            القسم {idx + 1} من {sections.length}
          </Badge>
          <h4 className="font-display font-semibold text-base text-foreground flex items-center gap-2">
            {rawHeader}
            <Sparkles className="h-4 w-4 text-primary" />
          </h4>
        </div>
        <div className="text-sm text-foreground/90 leading-relaxed font-sans whitespace-pre-wrap select-text">
          {content}
        </div>
      </GlassCard>
    );
  });
}
