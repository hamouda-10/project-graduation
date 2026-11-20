import { useEffect, useRef, useState } from "react";
import {
  CheckSquare,
  BarChart3,
  GraduationCap,
  ArrowUpRight,
  Cpu,
  Clock,
  Sparkles,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, type DashboardMetrics } from "@/lib/api-client";
import { useUIStore } from "@/stores/ui-store";

interface AIRadar3DCardProps {
  isArabic: boolean;
  className?: string;
}

type RadarTab = "tasks" | "analytics" | "study";

export function AIRadar3DCard({ isArabic, className = "" }: AIRadar3DCardProps) {
  const [activeTab, setActiveTab] = useState<RadarTab>("tasks");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stage3dRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const audioSystemMode = useUIStore((s) => s.audioSystemMode);
  const audioJobProgress = useUIStore((s) => s.audioJobProgress);

  const { data: metrics } = useQuery<DashboardMetrics>({
    queryKey: ["dashboardMetrics"],
    queryFn: () => api.getDashboardMetrics(),
  });

  const totalMeetings = metrics?.totalMeetings ?? 0;
  const totalLectures = metrics?.totalLectures ?? 0;
  const totalSessions = totalMeetings + totalLectures;
  const totalTranscripts = metrics?.totalTranscripts ?? 0;
  const totalQuizzes = metrics?.totalQuizzes ?? 0;
  const completedTasks = metrics?.completedTasks ?? 0;
  const pendingTasks = metrics?.pendingTasks ?? 0;
  const totalTasks = completedTasks + pendingTasks;
  const totalHours = metrics?.totalAudioHours ?? 0;

  const taskRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const transcriptionRate =
    totalSessions > 0 ? Math.min(100, Math.round((totalTranscripts / totalSessions) * 100)) : 0;
  const studyReadinessRate =
    totalQuizzes > 0 && totalSessions > 0
      ? Math.min(
          100,
          Math.round((totalQuizzes / Math.max(1, totalLectures || totalSessions)) * 100),
        )
      : 0;
  const isProcessing =
    audioSystemMode === "Uploading" ||
    audioSystemMode === "Processing" ||
    audioSystemMode === "Transcribing" ||
    audioSystemMode === "Analyzing";

  const tabData = {
    tasks: {
      percent: isProcessing ? Math.max(12, audioJobProgress) : taskRate,
      label: isArabic ? "إنجاز المهام" : "Tasks Mastery",
      subtext: isArabic
        ? `${completedTasks} مكتملة · ${pendingTasks} قيد التنفيذ`
        : `${completedTasks} Done · ${pendingTasks} Pending`,
      route: "/reports" as const,
      cta: isArabic ? "فتح تقارير المهام" : "Open Tasks & Reports",
      metricLeft: isArabic ? `المهام: ${totalTasks}` : `Tasks: ${totalTasks}`,
      metricRight: isArabic ? `الجلسات: ${totalSessions}` : `Sessions: ${totalSessions}`,
    },
    analytics: {
      percent: isProcessing ? Math.max(12, audioJobProgress) : transcriptionRate,
      label: isArabic ? "اكتمال التفريغ" : "Processed Rate",
      subtext: isArabic
        ? `${totalTranscripts}/${totalSessions} جلسة مفرغة · ${totalHours} ساعة`
        : `${totalTranscripts}/${totalSessions} Transcribed · ${totalHours}h`,
      route: "/analytics" as const,
      cta: isArabic ? "عرض لوحة التحليلات" : "View Full Analytics",
      metricLeft: isArabic ? `التفريغات: ${totalTranscripts}` : `Transcripts: ${totalTranscripts}`,
      metricRight: `${totalHours}h`,
    },
    study: {
      percent: studyReadinessRate,
      label: isArabic ? "جاهزية الاختبار" : "Quiz Coverage",
      subtext: isArabic
        ? `${totalQuizzes} اختبار · ${totalLectures} محاضرة`
        : `${totalQuizzes} Quizzes · ${totalLectures} Lectures`,
      route: "/quiz" as const,
      cta: isArabic ? "بدء اختبار ذكي الآن" : "Open AI Quizzes",
      metricLeft: isArabic ? `الاختبارات: ${totalQuizzes}` : `Quizzes: ${totalQuizzes}`,
      metricRight: isArabic ? `المحاضرات: ${totalLectures}` : `Lectures: ${totalLectures}`,
    },
  }[activeTab];

  // 3D Tilt Parallax + Ambient 3D Depth Particles Canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

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

    const particles = Array.from({ length: 22 }, (_, i) => ({
      angle: (i / 22) * Math.PI * 2,
      radius: 34 + (i % 5) * 11,
      speed: (i % 2 === 0 ? 1 : -1) * (0.28 + (i % 4) * 0.12),
      size: 0.9 + (i % 3) * 0.45,
      alpha: 0.25 + (i % 4) * 0.14,
    }));

    let targetRotX = 0;
    let targetRotY = 0;
    let curRotX = 0;
    let curRotY = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetRotY = nx * 12;
      targetRotX = -ny * 10;
    };

    const onPointerLeave = () => {
      targetRotX = 0;
      targetRotY = 0;
    };

    container.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerleave", onPointerLeave, { passive: true });

    let isVisible = true;
    let isTabVisible = !document.hidden;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]) isVisible = entries[0].isIntersecting;
      },
      { threshold: 0.05 },
    );
    io.observe(container);

    const onVis = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);

    const ro = new ResizeObserver(updateSize);
    ro.observe(container);

    let rafId = 0;
    let disposed = false;
    let lastTime = performance.now();

    const tick = (now: number) => {
      if (disposed) return;
      if (!isVisible || !isTabVisible) {
        rafId = window.setTimeout(() => {
          rafId = requestAnimationFrame(tick);
        }, 250) as unknown as number;
        return;
      }

      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const t = now * 0.001;

      const autoX = Math.sin(t * 1.1) * 3.5;
      const autoY = Math.cos(t * 0.85) * 4.2;
      curRotX += (targetRotX + autoX - curRotX) * Math.min(1, dt * 7);
      curRotY += (targetRotY + autoY - curRotY) * Math.min(1, dt * 7);

      if (stage3dRef.current) {
        stage3dRef.current.style.transform = `perspective(700px) rotateX(${curRotX.toFixed(
          2,
        )}deg) rotateY(${curRotY.toFixed(2)}deg)`;
      }

      ctx.clearRect(0, 0, width, height);
      const cx = width * 0.5;
      const cy = height * 0.5;

      // Ambient radial gold glow behind the 3D rotating circular frames
      const glowGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 68);
      glowGrad.addColorStop(0, "rgba(212, 175, 55, 0.22)");
      glowGrad.addColorStop(0.55, "rgba(212, 175, 55, 0.07)");
      glowGrad.addColorStop(1, "rgba(10, 10, 12, 0)");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 68, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.angle += p.speed * dt;
        const px = cx + Math.cos(p.angle) * p.radius * 1.15;
        const py = cy + Math.sin(p.angle) * p.radius * 0.85;
        const twinkle = p.alpha * (0.65 + 0.35 * Math.sin(t * 2.4 + i));
        ctx.fillStyle = `rgba(255, 243, 176, ${twinkle.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(rafId);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (tabData.percent / 100) * circumference;

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col justify-between rounded-2xl border border-[#D4AF37]/30 bg-[#0A0A0C] shadow-[0_10px_30px_-10px_rgba(212,175,55,0.22)] overflow-hidden select-none ${className}`}
    >
      {/* Top Header Bar with Interactive Mode Switcher */}
      <div className="relative z-10 flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-zinc-800/70 bg-[#0D0D10]">
        <div className="flex items-center gap-1.5 min-w-0">
          <Cpu className="h-3.5 w-3.5 text-[#D4AF37] shrink-0" />
          <span className="text-xs font-bold text-zinc-100 tracking-wide truncate">
            {isArabic ? "رادار الإنجاز 3D" : "3D AI Radar"}
          </span>
        </div>

        {/* 3 Functional Mode Pills */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={`inline-flex items-center gap-1 h-5.5 px-1.5 text-[9.5px] font-semibold rounded-md border transition-colors cursor-pointer ${
              activeTab === "tasks"
                ? "border-[#D4AF37] bg-[#D4AF37]/20 text-[#FFF3B0]"
                : "border-zinc-800 bg-zinc-900/90 text-zinc-400 hover:text-zinc-200"
            }`}
            title={isArabic ? "مؤشر إنجاز المهام" : "Tasks Completion Radar"}
          >
            <CheckSquare className="h-2.5 w-2.5 text-[#D4AF37]" />
            <span>{isArabic ? "المهام" : "Tasks"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`inline-flex items-center gap-1 h-5.5 px-1.5 text-[9.5px] font-semibold rounded-md border transition-colors cursor-pointer ${
              activeTab === "analytics"
                ? "border-[#D4AF37] bg-[#D4AF37]/20 text-[#FFF3B0]"
                : "border-zinc-800 bg-zinc-900/90 text-zinc-400 hover:text-zinc-200"
            }`}
            title={isArabic ? "تحليلات الأداء والوقت" : "ASR & Time Analytics"}
          >
            <BarChart3 className="h-2.5 w-2.5 text-[#D4AF37]" />
            <span>{isArabic ? "تحليل" : "Stats"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("study")}
            className={`inline-flex items-center gap-1 h-5.5 px-1.5 text-[9.5px] font-semibold rounded-md border transition-colors cursor-pointer ${
              activeTab === "study"
                ? "border-[#D4AF37] bg-[#D4AF37]/20 text-[#FFF3B0]"
                : "border-zinc-800 bg-zinc-900/90 text-zinc-400 hover:text-zinc-200"
            }`}
            title={isArabic ? "جاهزية الاختبارات الذكية" : "AI Quiz Readiness"}
          >
            <GraduationCap className="h-2.5 w-2.5 text-[#D4AF37]" />
            <span>{isArabic ? "كويز" : "Quiz"}</span>
          </button>
        </div>
      </div>

      {/* Central 3D Rotating Circular Frames & Interactive Core */}
      <div className="relative flex-1 flex items-center justify-between px-3 py-1 overflow-hidden">
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 w-full h-full" />

        {/* Left Floating Telemetry Pill */}
        <div className="relative z-10 hidden sm:flex flex-col gap-1.5 text-[9.5px] font-mono">
          <div className="rounded-lg border border-[#D4AF37]/25 bg-zinc-950/85 px-2 py-1 text-zinc-300 shadow-sm">
            <div className="text-[8.5px] text-zinc-500 uppercase">
              {isArabic ? "المؤشر الأول" : "Primary"}
            </div>
            <div className="font-bold text-[#F5D77F] truncate">{tabData.metricLeft}</div>
          </div>
          <div className="rounded-lg border border-[#D4AF37]/25 bg-zinc-950/85 px-2 py-1 text-zinc-300 shadow-sm">
            <div className="text-[8.5px] text-zinc-500 uppercase">
              {isArabic ? "المؤشر الثاني" : "Secondary"}
            </div>
            <div className="font-bold text-amber-300 truncate">{tabData.metricRight}</div>
          </div>
        </div>

        {/* Center 3D Gyroscopic Rotating Circular Frames + Live Score Core */}
        <Link
          to={tabData.route}
          className="relative z-10 mx-auto flex h-28 w-28 items-center justify-center group cursor-pointer"
          title={tabData.cta}
        >
          <div
            ref={stage3dRef}
            className="relative flex h-full w-full items-center justify-center"
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* Frame 1: Outer Dashed Rotating Circular Frame (CW) */}
            <div className="radar-frame-cw pointer-events-none absolute h-27 w-27 rounded-full border border-dashed border-[#D4AF37]/45 shadow-[0_0_15px_rgba(212,175,55,0.2)]" />

            {/* Frame 2: Segmented Golden Arc Frame (CCW) */}
            <div className="radar-frame-ccw pointer-events-none absolute h-24 w-24 rounded-full border-2 border-transparent border-t-[#FFF3B0]/80 border-b-[#D4AF37]/60 shadow-[0_0_12px_rgba(212,175,55,0.3)]" />

            {/* Frame 3: 3D Gyroscopic Inclined Ring 1 */}
            <div className="radar-frame-gyro-1 pointer-events-none absolute h-26 w-26 rounded-full border border-[#F5D77F]/50">
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-[#FFF8DC] shadow-[0_0_8px_2px_#D4AF37]" />
            </div>

            {/* Frame 4: 3D Gyroscopic Inclined Ring 2 */}
            <div className="radar-frame-gyro-2 pointer-events-none absolute h-25 w-25 rounded-full border border-[#D4AF37]/40">
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_6px_1.5px_#F59E0B]" />
            </div>

            {/* Animated SVG Circular Progress Ring */}
            <svg className="pointer-events-none absolute h-22 w-22 -rotate-90" viewBox="0 0 84 84">
              <circle
                cx="42"
                cy="42"
                r={radius}
                fill="none"
                stroke="rgba(212, 175, 55, 0.15)"
                strokeWidth="3.5"
              />
              <circle
                cx="42"
                cy="42"
                r={radius}
                fill="none"
                stroke="#D4AF37"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-all duration-500 ease-out drop-shadow-[0_0_6px_rgba(212,175,55,0.8)]"
              />
            </svg>

            {/* Central 3D Glowing Score Core */}
            <div className="relative z-10 flex h-16 w-16 flex-col items-center justify-center rounded-full border border-[#FFF3B0]/45 bg-gradient-to-b from-[#1E1808] via-[#0F0C05] to-[#080704] shadow-[0_0_20px_rgba(212,175,55,0.35),inset_0_1px_8px_rgba(255,243,176,0.25)] group-hover:scale-105 group-hover:border-[#FFF3B0] transition-transform">
              <span className="font-mono text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#FFF8DC] via-[#F5D77F] to-[#D4AF37] leading-none">
                {tabData.percent}%
              </span>
              <span className="mt-0.5 text-[8.5px] font-bold text-zinc-300 truncate max-w-[54px]">
                {tabData.label}
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Bottom Interactive Action Bar */}
      <div className="relative z-10 px-3.5 py-1.5 bg-[#0D0D10] border-t border-zinc-800/70 flex items-center justify-between text-[10px]">
        <span className="text-zinc-400 truncate flex items-center gap-1">
          {activeTab === "analytics" ? (
            <Clock className="h-3 w-3 text-[#D4AF37] shrink-0" />
          ) : (
            <Sparkles className="h-3 w-3 text-[#D4AF37] shrink-0" />
          )}
          <span className="truncate">{tabData.subtext}</span>
        </span>

        <Link
          to={tabData.route}
          className="inline-flex items-center gap-1 font-mono font-bold text-[#F5D77F] hover:text-white transition-colors shrink-0"
        >
          <span>{tabData.cta}</span>
          <ArrowUpRight className="h-3 w-3 text-[#D4AF37]" />
        </Link>
      </div>
    </div>
  );
}
