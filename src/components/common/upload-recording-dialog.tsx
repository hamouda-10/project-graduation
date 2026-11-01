import { useState, useRef } from "react";
import { Mic, Upload, Loader2, Sparkles, AlertCircle, CheckCircle2, RotateCw } from "lucide-react";
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

interface UploadRecordingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: "meeting" | "lecture";
  onSuccess?: () => void;
}

const STAGE_LABELS_AR: Record<string, string> = {
  Uploaded: "تم رفع الملف بنجاح",
  Validating: "جاري التحقق من سلامة الملف الصوتي...",
  Queued: "في قائمة انتظار المعالجة الذكية...",
  Transcribing: "جاري التفريغ الصوتي المتقدم بالذكاء الاصطناعي...",
  Translating: "جاري الترجمة والصياغة باللغة العربية الفصحى...",
  Merging: "جاري تجميع ودمج النص المفرغ المستمر...",
  Analyzing: "جاري التحليل الذكي واستخراج المحاور والمهام...",
  "Generating Quiz": "جاري إعداد الاختبار التقييمي والأسئلة الذكية...",
  Completed: "اكتملت المعالجة بنجاح!",
  Failed: "تعذرت المعالجة.",
};

const STAGE_LABELS_EN: Record<string, string> = {
  Uploaded: "Media uploaded successfully",
  Validating: "Validating audio integrity...",
  Queued: "Queued for processing...",
  Transcribing: "Transcribing speech via AI...",
  Translating: "Translating & normalizing to Arabic...",
  Merging: "Merging continuous flowing transcript...",
  Analyzing: "Analyzing content & extracting action items...",
  "Generating Quiz": "Generating assessment quiz...",
  Completed: "Processing completed!",
  Failed: "Processing failed.",
};

export function UploadRecordingDialog({
  open,
  onOpenChange,
  defaultType = "meeting",
  onSuccess,
}: UploadRecordingDialogProps) {
  const { t, language } = useTranslation();
  const isArabic = language === "ar";

  const [type, setType] = useState<"meeting" | "lecture">(defaultType);
  const [title, setTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Job processing state
  const [isUploading, setIsUploading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("Queued");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const [liveRecorderOpen, setLiveRecorderOpen] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startMicrophoneRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const audioBlob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        const recordedFile = new File([audioBlob], `mic_recording_${Date.now()}.webm`, {
          type: "audio/webm",
        });
        setFile(recordedFile);
        stream.getTracks().forEach((track) => track.stop());
      };

      mr.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
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

  const stopMicrophoneRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      toast.success(isArabic ? "تم حفظ التسجيل بنجاح!" : "Recording captured successfully!");
    }
  };

  const startPolling = (jobId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      try {
        const job = await api.getJob(jobId);
        setJobStatus(job.status);
        setProgressPercent(job.progressPercent || 10);

        if (job.status === "Completed") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setIsUploading(false);
          toast.success(
            isArabic
              ? `${type === "meeting" ? "الاجتماع" : "المحاضرة"} تم تفريغها وتحليلها بنجاح!`
              : `${type === "meeting" ? "Meeting" : "Lecture"} created and transcribed!`,
          );
          onOpenChange(false);
          if (onSuccess) onSuccess();
        } else if (job.status === "Failed") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setJobError(
            job.errorMessage ||
              (isArabic ? "فشلت عملية التفريغ والتحليل" : "Processing pipeline failed"),
          );
          setIsUploading(false);
          toast.error(isArabic ? "فشلت معالجة التسجيل" : "Transcription pipeline failed");
        }
      } catch {
        // Continue polling until job finishes or fails
      }
    }, 1200);
  };

  const handleRetry = async () => {
    if (!activeJobId) return;
    try {
      setIsRetrying(true);
      setJobError(null);
      setIsUploading(true);
      setJobStatus("Queued");
      setProgressPercent(15);

      await api.retryJob(activeJobId);
      toast.info(isArabic ? "جاري إعادة معالجة التسجيل..." : "Retrying recording job...");
      startPolling(activeJobId);
    } catch (err) {
      toast.error(isArabic ? "تعذرت إعادة المحاولة" : "Failed to retry job");
      setIsUploading(false);
    } finally {
      setIsRetrying(false);
    }
  };

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

    try {
      setIsUploading(true);
      setJobError(null);
      setJobStatus("Validating");
      setProgressPercent(10);

      const formData = new FormData();
      formData.append("type", type);
      formData.append("title", title);
      formData.append("courseCode", courseCode);

      if (file) {
        formData.append("file", file);
      } else {
        const sampleAudio = new Blob([new Uint8Array(2048)], { type: "audio/wav" });
        formData.append("file", sampleAudio, "recording_sample.wav");
      }

      const res = await api.uploadRecording(formData);
      setActiveJobId(res.jobId);
      startPolling(res.jobId);
    } catch (err) {
      setIsUploading(false);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const statusLabel = isArabic
    ? STAGE_LABELS_AR[jobStatus] || jobStatus
    : STAGE_LABELS_EN[jobStatus] || jobStatus;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!isUploading) onOpenChange(v);
        }}
      >
        <DialogContent className="max-w-md" dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              <span>{isArabic ? "رفع أو تسجيل صوتي ذكي" : "Upload or Record Audio"}</span>
            </DialogTitle>
            <DialogDescription>
              {isArabic
                ? "تقوم منصة MeetMind تلقائياً بتفريغ الصوت باللغة العربية، والترجمة، وتوليد الملخص، واستخراج المهام، وإنشاء كويز تقييمي."
                : "MeetMind will automatically transcribe the audio into Arabic, extract summaries, generate quizzes, and assign action items."}
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
                  ? "يجري معالجة الصوت، الترجمة إلى العربية الفصحى، واستخراج محاور الذكاء الاصطناعي."
                  : "Audio processing and Gemini AI intelligence pipeline are processing your media."}
              </p>
            </div>
          ) : jobError ? (
            <div className="py-6 space-y-4">
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{isArabic ? "تعذرت معالجة التسجيل" : "Transcription Pipeline Failed"}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{jobError}</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                <Label>{isArabic ? "أو رفع ملف صوتي مُسجّل مسبقاً" : "Or Upload Audio File"}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={isRecording ? "destructive" : "outline"}
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={isRecording ? stopMicrophoneRecording : startMicrophoneRecording}
                  >
                    <Mic className={`h-4 w-4 ${isRecording ? "animate-pulse" : ""}`} />
                    <span>
                      {isRecording
                        ? `${isArabic ? "إيقاف" : "Stop"} (${recordingSeconds}s)`
                        : isArabic
                          ? "تسجيل صوتي"
                          : "Record Mic"}
                    </span>
                  </Button>

                  <div className="relative">
                    <input
                      type="file"
                      accept="audio/*,video/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setFile(e.target.files[0]);
                          if (!title) setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ""));
                          toast.success(
                            isArabic
                              ? `تم اختيار الملف: ${e.target.files[0].name}`
                              : `Attached: ${e.target.files[0].name}`,
                          );
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full flex items-center gap-2 cursor-pointer"
                    >
                      <Upload className="h-4 w-4" />
                      <span>
                        {file
                          ? isArabic
                            ? "تغيير الملف"
                            : "Change File"
                          : isArabic
                            ? "اختيار ملف صوتي"
                            : "Choose File"}
                      </span>
                    </Button>
                  </div>
                </div>

                {isRecording && (
                  <div className="flex items-center justify-center gap-1.5 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
                    <span className="h-2 w-2 rounded-full bg-destructive animate-ping mr-1" />
                    <span className="text-xs font-semibold text-destructive mr-2">
                      {isArabic ? "جاري التسجيل من الميكروفون..." : "Recording live audio..."}
                    </span>
                    <span className="text-xs font-mono font-medium text-destructive ml-2">
                      {Math.floor(recordingSeconds / 60)}:
                      {(recordingSeconds % 60).toString().padStart(2, "0")}
                    </span>
                  </div>
                )}

                {file && !isRecording && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/30">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                      {Math.round(file.size / 1024)} KB
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  {isArabic ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  className="gradient-primary text-primary-foreground shadow-glow"
                >
                  {isArabic ? "بدء المعالجة والتفريغ" : "Start Processing"}
                </Button>
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
