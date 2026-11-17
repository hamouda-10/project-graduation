import { useEffect, useRef } from "react";
import {
  Sparkles,
  GraduationCap,
  Layers,
  GitBranch,
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, type DashboardMetrics } from "@/lib/api-client";
import { useUIStore, type AudioSystemMode } from "@/stores/ui-store";

interface AudioCenterCardProps {
  isArabic: boolean;
  onStartLiveRecorder: () => void;
  onOpenUpload?: () => void;
  className?: string;
}

const PIPELINE_STEPS: AudioSystemMode[] = [
  "Uploading",
  "Processing",
  "Transcribing",
  "Analyzing",
  "Completed",
];

export function AudioCenterCard({ isArabic, onOpenUpload, className = "" }: AudioCenterCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const audioSystemMode = useUIStore((s) => s.audioSystemMode);
  const audioJobProgress = useUIStore((s) => s.audioJobProgress);

  const { data: metrics } = useQuery<DashboardMetrics>({
    queryKey: ["dashboardMetrics"],
    queryFn: () => api.getDashboardMetrics(),
  });

  const totalSessions = (metrics?.totalMeetings ?? 0) + (metrics?.totalLectures ?? 0);
  const totalActions = (metrics?.completedTasks ?? 0) + (metrics?.pendingTasks ?? 0);

  // Subtle ambient gold neural-constellation background canvas (60fps, zero React re-renders)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = Math.max(200, container.clientWidth || 260);
    let height = Math.max(120, container.clientHeight || 150);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const updateSize = () => {
      if (!container || !canvas) return;
      width = Math.max(200, container.clientWidth || 260);
      height = Math.max(120, container.clientHeight || 150);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    updateSize();

    const nodes = Array.from({ length: 12 }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: 1.0 + (i % 3) * 0.45,
      phase: i * 0.7,
    }));

    let isVisible = true;
    let isTabVisible = !document.hidden;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]) isVisible = entries[0].isIntersecting;
      },
      { threshold: 0.05 },
    );
    io.observe(container);

    const handleVis = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVis);

    const ro = new ResizeObserver(updateSize);
    ro.observe(container);

    let rafId = 0;
    let disposed = false;

    const render = (now: number) => {
      if (disposed) return;
      if (!isVisible || !isTabVisible) {
        rafId = window.setTimeout(() => {
          rafId = requestAnimationFrame(render);
        }, 250) as unknown as number;
        return;
      }

      const t = now * 0.001;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 8) n.x = width - 8;
        if (n.x > width - 8) n.x = 8;
        if (n.y < 8) n.y = height - 8;
        if (n.y > height - 8) n.y = 8;

        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j];
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 78) {
            const alpha = (1 - dist / 78) * 0.12;
            ctx.strokeStyle = `rgba(212, 175, 55, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
        }

        const pulse = 0.25 + 0.2 * Math.sin(t * 2 + n.phase);
        ctx.fillStyle = `rgba(245, 215, 127, ${pulse.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(rafId);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, []);

  const getPrimaryStatusDisplay = () => {
    if (audioSystemMode === "Recording") {
      return {
        label: "Recording",
        dotColor: "bg-red-400",
        badgeStyle: "border-red-500/45 bg-red-500/15 text-red-300",
      };
    }
    if (audioSystemMode === "Listening") {
      return {
        label: "Listening",
        dotColor: "bg-[#D4AF37]",
        badgeStyle: "border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#F5D77F]",
      };
    }
    if (
      audioSystemMode === "Uploading" ||
      audioSystemMode === "Processing" ||
      audioSystemMode === "Transcribing" ||
      audioSystemMode === "Analyzing"
    ) {
      return {
        label: audioSystemMode,
        dotColor: "bg-amber-400",
        badgeStyle: "border-amber-500/50 bg-amber-500/15 text-amber-300",
      };
    }
    if (audioSystemMode === "Completed") {
      return {
        label: "Completed",
        dotColor: "bg-emerald-400",
        badgeStyle: "border-emerald-500/45 bg-emerald-500/15 text-emerald-300",
      };
    }
    return {
      label: "AI Ready",
      dotColor: "bg-emerald-400",
      badgeStyle: "border-zinc-700/80 bg-zinc-900/90 text-zinc-300",
    };
  };

  const statusInfo = getPrimaryStatusDisplay();
  const isPipelineRunning =
    audioSystemMode === "Uploading" ||
    audioSystemMode === "Processing" ||
    audioSystemMode === "Transcribing" ||
    audioSystemMode === "Analyzing";

  const quickTools = [
    {
      to: "/ai-workspace",
      icon: Sparkles,
      title: isArabic ? "مساحة الذكاء" : "AI Workspace",
      subtitle: isArabic ? "تلخيص وتحليل" : "Summarize & Ask",
    },
    {
      to: "/quiz",
      icon: GraduationCap,
      title: isArabic ? "مولد الكويزات" : "Quiz Generator",
      subtitle: isArabic ? "اختبارات ذكية" : "Auto-Quizzes",
    },
    {
      to: "/flashcards",
      icon: Layers,
      title: isArabic ? "بطاقات المراجعة" : "Flashcards",
      subtitle: isArabic ? "استذكار سريع" : "Study Decks",
    },
    {
      to: "/mind-maps",
      icon: GitBranch,
      title: isArabic ? "الخرائط الذهنية" : "Mind Maps",
      subtitle: isArabic ? "ربط المفاهيم" : "Concept Nodes",
    },
  ];

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col justify-between rounded-2xl border border-[#D4AF37]/30 bg-[#0A0A0C] shadow-[0_10px_30px_-10px_rgba(212,175,55,0.22)] overflow-hidden select-none ${className}`}
    >
      {/* Top Header Bar */}
      <div className="relative z-10 flex items-center justify-between px-3.5 pt-2.5 pb-1.5 border-b border-zinc-800/70 bg-[#0D0D10]">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-3.5 w-3.5 text-[#D4AF37] shrink-0" />
          <span className="text-xs font-bold text-zinc-100 tracking-wide truncate">
            {isArabic ? "مركز أدوات الذكاء" : "AI Studio Hub"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenUpload && (
            <button
              type="button"
              onClick={onOpenUpload}
              className="inline-flex items-center gap-1 h-6 px-2 text-[10px] font-medium rounded-md border border-[#D4AF37]/35 bg-[#D4AF37]/10 text-[#F5D77F] hover:bg-[#D4AF37]/20 transition-colors cursor-pointer"
              title={isArabic ? "رفع ملف صوتي للتحليل" : "Upload audio file for AI analysis"}
            >
              <Upload className="h-2.5 w-2.5 text-[#D4AF37]" />
              <span>{isArabic ? "رفع" : "Upload"}</span>
            </button>
          )}

          <div
            className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border ${statusInfo.badgeStyle}`}
          >
            {isPipelineRunning ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-[#D4AF37]" />
            ) : audioSystemMode === "Completed" ? (
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
            ) : (
              <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dotColor}`} />
            )}
            <span>{statusInfo.label}</span>
          </div>
        </div>
      </div>

      {/* Central Interactive 2x2 AI Studio Launchpad */}
      <div className="relative flex-1 p-2.5 flex flex-col justify-center">
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 w-full h-full" />

        <div className="relative z-10 grid grid-cols-2 gap-2">
          {quickTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.to}
                to={tool.to}
                className="group flex items-center justify-between gap-2 rounded-xl border border-zinc-800/90 bg-zinc-950/85 hover:border-[#D4AF37]/55 hover:bg-[#D4AF37]/10 px-2.5 py-2 transition-all duration-150 shadow-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-zinc-950 transition-colors">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-zinc-100 group-hover:text-[#FFF3B0] truncate">
                      {tool.title}
                    </div>
                    <div className="text-[9.5px] text-zinc-400 truncate">{tool.subtitle}</div>
                  </div>
                </div>
                <ArrowUpRight className="h-3 w-3 text-zinc-500 group-hover:text-[#D4AF37] shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom Telemetry & Quick Transcripts Footer */}
      <div className="relative z-10 px-3.5 py-1.5 bg-[#0D0D10] border-t border-zinc-800/70 flex items-center justify-between text-[10px] text-zinc-400">
        {isPipelineRunning ? (
          <div className="flex items-center justify-between w-full gap-1 overflow-hidden">
            <div className="flex items-center gap-1 truncate font-mono text-[9.5px]">
              {PIPELINE_STEPS.slice(0, 4).map((step, idx) => {
                const isCurrent = audioSystemMode === step;
                return (
                  <span key={step} className="inline-flex items-center gap-1">
                    <span className={isCurrent ? "text-[#D4AF37] font-bold" : "text-zinc-500"}>
                      {step}
                    </span>
                    {idx < 3 && <span className="text-zinc-700">→</span>}
                  </span>
                );
              })}
            </div>
            <span className="font-mono text-[#D4AF37] font-bold tabular-nums shrink-0">
              {audioJobProgress}%
            </span>
          </div>
        ) : (
          <>
            <Link
              to="/transcript"
              className="inline-flex items-center gap-1 font-medium text-zinc-300 hover:text-[#F5D77F] transition-colors truncate"
            >
              <FileText className="h-3 w-3 text-[#D4AF37] shrink-0" />
              <span>{isArabic ? "سجل التفريغ الصوتي" : "All Transcripts"}</span>
            </Link>
            <span className="font-mono text-[#D4AF37] tabular-nums shrink-0">
              {isArabic
                ? `${totalSessions} جلسة · ${totalActions} مهمة`
                : `${totalSessions} Sessions · ${totalActions} Tasks`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
