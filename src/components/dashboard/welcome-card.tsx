import { useState } from "react";
import {
  ArrowRight,
  Mic,
  Upload,
  BrainCircuit,
  FileText,
  GraduationCap,
  Waves,
  Sparkles,
  Layers,
  Users,
  BookOpen,
  CheckSquare,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/common/glass-card";
import { UploadRecordingDialog } from "@/components/common/upload-recording-dialog";
import { LiveArabicRecorder } from "@/components/recording/live-arabic-recorder";
import { AudioCenterCard } from "@/components/dashboard/audio-center-card";
import { AIRadar3DCard } from "@/components/dashboard/ai-radar-3d-card";
import { CentralMicCore } from "@/components/dashboard/central-mic-core";
import { useTranslation } from "@/lib/i18n";
import { useUIStore } from "@/stores/ui-store";

export function WelcomeCard() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [liveRecorderOpen, setLiveRecorderOpen] = useState(false);
  const setAudioSystemState = useUIStore((s) => s.setAudioSystemState);

  const queryClient = useQueryClient();
  const { language } = useTranslation();
  const isArabic = language.toUpperCase() === "AR";

  const refreshDashboard = () => {
    setAudioSystemState("Completed", 100);
    queryClient.invalidateQueries({ queryKey: ["meetings"] });
    queryClient.invalidateQueries({ queryKey: ["lectures"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
    setTimeout(() => setAudioSystemState("Ready", 0), 5000);
  };

  const capabilities = isArabic
    ? [
        { icon: Mic, title: "تفريغ Whisper ASR الفائق" },
        { icon: Waves, title: "ترجمة فورية وتفريغ حي" },
        { icon: BrainCircuit, title: "استخراج مفاهيم المحاضرات" },
        { icon: FileText, title: "تحديد المهام والمسؤولين" },
        { icon: GraduationCap, title: "كويزات واختبارات تفاعلية" },
        { icon: Layers, title: "بطاقات استذكار ذكية" },
        { icon: Sparkles, title: "خرائط ذهنية مفاهيمية" },
        { icon: Users, title: "تمييز وتحديد المتحدثين" },
        { icon: BookOpen, title: "نقاط التركيز للامتحانات" },
        { icon: CheckSquare, title: "فهم العامية والمصطلحات" },
      ]
    : [
        { icon: Mic, title: "Whisper ASR Speech" },
        { icon: Waves, title: "Live Arabic Subtitles" },
        { icon: BrainCircuit, title: "Lecture Key Concepts" },
        { icon: FileText, title: "Action Items & Owners" },
        { icon: GraduationCap, title: "Interactive AI Quizzes" },
        { icon: Layers, title: "Smart Revision Flashcards" },
        { icon: Sparkles, title: "Automated Mind Maps" },
        { icon: Users, title: "Speaker Diarization" },
        { icon: BookOpen, title: "Exam Focus Highlights" },
        { icon: CheckSquare, title: "Mixed Terminology & Dialects" },
      ];

  return (
    <>
      <GlassCard className="relative overflow-hidden p-5 sm:p-6 border border-[#D4AF37]/25 bg-gradient-to-br from-zinc-950 via-zinc-900/95 to-zinc-950 shadow-xl">
        {/* Subtle matte gold ambient accent */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(212,175,55,0.07),transparent_55%)]" />

        {/* MAIN HERO GRID: Left Brand/Actions + Central AI Microphone Core + Right Simultaneous Panels */}
        <div className="relative grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-5 lg:gap-6">
          {/* LEFT COLUMN: Ruq'ah Title + Subtitle + Action Buttons */}
          <div className="min-w-0 space-y-3.5 pe-1">
            {/* Top Status Tag */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-0.5 text-[10.5px] font-bold text-[#F5D77F]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
              <span className="font-mono uppercase tracking-wider">
                {isArabic
                  ? "منظومة معالجة الصوت بالذكاء الاصطناعي"
                  : "AI Speech Intelligence Platform"}
              </span>
              <span className="text-[#D4AF37]/60">•</span>
              <span className="text-[10px] text-zinc-300 font-medium">Whisper ASR</span>
            </div>

            {/* Main Ruq'ah Headline */}
            <h1 className="font-ruqaa text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white leading-snug">
              {isArabic ? (
                <>
                  مرحباً بك في{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFF3B0] via-[#D4AF37] to-[#B8860B] drop-shadow-sm">
                    MeetMind AI
                  </span>
                </>
              ) : (
                <>
                  Welcome to{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFF3B0] via-[#D4AF37] to-[#B8860B] drop-shadow-sm">
                    MeetMind AI
                  </span>
                </>
              )}
            </h1>

            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-xl">
              {isArabic
                ? "تحويل التسجيلات والمحاضرات الصوتية إلى تفريغ عربي حقيقي دقيق، ملخصات تنفيذية، استخراج القرارات، وتوليد الاختبارات التقييمية تلقائياً."
                : "Real speech-to-text intelligence for meetings and lectures with automated summaries, action items, and quizzes."}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="btn-gold-animated-border">
                <Button
                  onClick={() => {
                    setAudioSystemState("Listening", 0);
                    setLiveRecorderOpen(true);
                  }}
                  className="btn-gold-animated-border-inner px-4 py-1.5 text-xs sm:text-sm font-bold text-amber-300 hover:text-white cursor-pointer gap-1.5 h-8 sm:h-9"
                >
                  <Mic className="h-4 w-4 text-[#D4AF37]" />
                  <span>{isArabic ? "تفريغ حي" : "Live Stream"}</span>
                </Button>
              </div>

              {/* Continuous Animated Gold Glow Around Upload File Button */}
              <div className="upload-btn-gold-glow">
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="upload-btn-gold-glow-inner px-4 py-1.5 text-xs sm:text-sm font-bold text-[#FFF3B0] hover:text-white cursor-pointer gap-1.5 h-8 sm:h-9 border-0"
                >
                  <Upload className="h-4 w-4 text-[#D4AF37] animate-bounce" />
                  <span>{isArabic ? "رفع ملف" : "Upload File"}</span>
                </Button>
              </div>

              <Link to="/ai-workspace">
                <Button
                  variant="ghost"
                  className="text-zinc-300 hover:text-white hover:bg-zinc-800/60 text-xs sm:text-sm font-medium gap-1 cursor-pointer h-8 sm:h-9 px-2.5"
                >
                  <span>{isArabic ? "المساحة" : "Workspace"}</span>
                  <ArrowRight className="h-4 w-4 text-[#D4AF37]" />
                </Button>
              </Link>
            </div>
          </div>

          {/* CENTRAL HERO ANIMATION: Animated AI Speech-Processing Microphone Core (7 Orbital Rings + Orbiting Particle System) */}
          <div className="flex items-center justify-center shrink-0">
            <CentralMicCore
              isArabic={isArabic}
              onActivateMic={() => {
                setAudioSystemState("Listening", 0);
                setLiveRecorderOpen(true);
              }}
              className="w-full sm:w-52 lg:w-56 h-52 shadow-[0_10px_30px_-10px_rgba(212,175,55,0.2)]"
            />
          </div>

          {/* TOP-RIGHT TWO SIMULTANEOUS PANELS: AI STUDIO HUB + 3D AI RADAR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 items-stretch justify-center gap-4 shrink-0 w-full xl:w-auto">
            {/* PANEL 1: AI Studio Hub — Core AI Tools & Live Pipeline Status */}
            <AudioCenterCard
              isArabic={isArabic}
              onStartLiveRecorder={() => {
                setAudioSystemState("Listening", 0);
                setLiveRecorderOpen(true);
              }}
              onOpenUpload={() => setDialogOpen(true)}
              className="w-full sm:w-64 lg:w-68 h-52 shrink-0"
            />

            {/* PANEL 2: 3D AI Radar — Rotating Circular Frames, Glow & Live Tasks/Analytics/Quiz Mastery */}
            <AIRadar3DCard isArabic={isArabic} className="w-full sm:w-64 lg:w-68 h-52 shrink-0" />
          </div>
        </div>

        {/* BOTTOM SECTION: EXPANDED CAPABILITY BADGES ROW */}
        <div className="pt-3.5 mt-4 border-t border-zinc-800/60 flex flex-wrap items-center gap-2">
          {capabilities.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="flex items-center gap-1.5 p-1.5 px-2.5 rounded-full bg-zinc-950/80 border border-[#D4AF37]/20 text-zinc-200 text-xs font-semibold hover:border-[#D4AF37]/60 hover:bg-zinc-900 transition-colors shadow-sm cursor-default"
              >
                <Icon className="h-3.5 w-3.5 text-[#D4AF37] shrink-0" />
                <span>{item.title}</span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <UploadRecordingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={refreshDashboard}
      />

      <LiveArabicRecorder
        open={liveRecorderOpen}
        onOpenChange={(open) => {
          setLiveRecorderOpen(open);
          if (!open) {
            const current = useUIStore.getState().audioSystemMode;
            if (current === "Listening" || current === "Recording") {
              setAudioSystemState("Ready", 0);
            }
          }
        }}
        defaultType="meeting"
        onCompleted={refreshDashboard}
      />
    </>
  );
}
