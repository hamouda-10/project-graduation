import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Send,
  Sparkles,
  X,
  Loader2,
  Quote,
  Trash2,
  Copy,
  Check,
  Bot,
  User,
  FileAudio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/stores/ui-store";
import { api, GroundedAnswer, Lecture, Meeting } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  citations?: { speaker: string; timestamp: string; quote: string }[];
}

interface LaserEvent {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  direction: "fab-to-ask" | "ask-to-fab";
  phase: "travel" | "burst";
}

interface ScatteredParticle {
  id: number;
  dx: number;
  dy: number;
  gravityDrop: number;
  r: number;
  kind: "star" | "diamond" | "orb" | "streak";
  colorSlot: 0 | 1 | 2;
  rotDeg: number;
}

interface GenieStreamParticle {
  id: number;
  offsetX: number;
  offsetY: number;
  ctrlX: number;
  ctrlY: number;
  size: number;
  delay: number;
  color: string;
}

// Pre-computed 32 scattered firework shrapnel, stars, diamonds, streaks & embers with gravity arc
const SCATTERED_PARTICLES: ScatteredParticle[] = Array.from({ length: 32 }, (_, i) => {
  const ringTier = i % 3; // 0 = outer, 1 = mid, 2 = inner
  const baseDist = ringTier === 0 ? 64 : ringTier === 1 ? 45 : 28;
  const jitter = ((i * 7) % 13) - 6;
  const dist = baseDist + jitter;
  const angle = (i / 32) * Math.PI * 2 + (i % 2 === 0 ? 0.06 : -0.06);
  const kinds: ScatteredParticle["kind"][] = ["star", "diamond", "orb", "streak"];
  return {
    id: i,
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist,
    gravityDrop: 10 + (i % 4) * 5,
    r: ringTier === 0 ? 3.2 : ringTier === 1 ? 2.5 : 2.0,
    kind: kinds[i % 4],
    colorSlot: (i % 3) as 0 | 1 | 2,
    rotDeg: ((i * 53) % 360) + 120,
  };
});

// Pre-computed 18 genie vortex particles that erupt out of the button on open and get sucked back in on close
const GENIE_STREAM_PARTICLES: GenieStreamParticle[] = Array.from({ length: 18 }, (_, i) => {
  const col = i % 4;
  const row = Math.floor(i / 4);
  const offsetX = -30 - col * 95 - ((i * 19) % 45);
  const offsetY = -75 - row * 105 - ((i * 23) % 50);
  const ctrlX = offsetX * 0.35 + (i % 2 === 0 ? 28 : -28);
  const ctrlY = offsetY * 0.65;
  const colors = ["#FFF8DC", "#FFD700", "#F59E0B", "#38BDF8"];
  return {
    id: i,
    offsetX,
    offsetY,
    ctrlX,
    ctrlY,
    size: 2.5 + (i % 3) * 1.4,
    delay: (i % 6) * 0.022,
    color: colors[i % colors.length],
  };
});

// Shared Web Audio API Context for synthesizing Laser, Firework Pop, and Genie Release/Suction sounds
let sharedLaserAudioCtx: AudioContext | null = null;

function getUnlockedAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedLaserAudioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      sharedLaserAudioCtx = new AudioCtx();
    }
    if (sharedLaserAudioCtx.state === "suspended") {
      sharedLaserAudioCtx.resume().catch(() => {});
    }
    return sharedLaserAudioCtx;
  } catch {
    return null;
  }
}

function playGenieUnfoldSound() {
  const ctx = getUnlockedAudioCtx();
  if (!ctx || ctx.state !== "running") return;
  try {
    const now = ctx.currentTime;

    // 1. Liquid Genie Release Sweep (Low-to-High Silky Harmonic Whoosh)
    const sweepOsc = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweepOsc.type = "sine";
    sweepOsc.frequency.setValueAtTime(190, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(880, now + 0.36);

    sweepGain.gain.setValueAtTime(0.001, now);
    sweepGain.gain.linearRampToValueAtTime(0.055, now + 0.09);
    sweepGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.42);

    sweepOsc.connect(sweepGain);
    sweepGain.connect(ctx.destination);
    sweepOsc.start(now);
    sweepOsc.stop(now + 0.44);

    // 2. Crystalline Shimmer Chime on Unfold Completion
    const chimeFreqs = [587.33, 880, 1174.66];
    chimeFreqs.forEach((freq, idx) => {
      const tStart = now + 0.1 + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, tStart);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.02, tStart + 0.22);

      gain.gain.setValueAtTime(0.028, tStart);
      gain.gain.exponentialRampToValueAtTime(0.0008, tStart + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(tStart);
      osc.stop(tStart + 0.25);
    });
  } catch {
    // Ignore audio errors
  }
}

function playGenieSuctionSound() {
  const ctx = getUnlockedAudioCtx();
  if (!ctx || ctx.state !== "running") return;
  try {
    const now = ctx.currentTime;

    // 1. Vacuum Suction Vortex Sweep (High-to-Low Accelerating Pull)
    const suckOsc = ctx.createOscillator();
    const suckGain = ctx.createGain();
    suckOsc.type = "sine";
    suckOsc.frequency.setValueAtTime(960, now);
    suckOsc.frequency.exponentialRampToValueAtTime(135, now + 0.34);

    suckGain.gain.setValueAtTime(0.002, now);
    suckGain.gain.linearRampToValueAtTime(0.06, now + 0.18);
    suckGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    suckOsc.connect(suckGain);
    suckGain.connect(ctx.destination);
    suckOsc.start(now);
    suckOsc.stop(now + 0.4);

    // 2. Soft Implosion Pop when Absorbed into the FAB Button
    const popStart = now + 0.3;
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    popOsc.type = "triangle";
    popOsc.frequency.setValueAtTime(320, popStart);
    popOsc.frequency.exponentialRampToValueAtTime(68, popStart + 0.09);

    popGain.gain.setValueAtTime(0.075, popStart);
    popGain.gain.exponentialRampToValueAtTime(0.001, popStart + 0.1);

    popOsc.connect(popGain);
    popGain.connect(ctx.destination);
    popOsc.start(popStart);
    popOsc.stop(popStart + 0.11);
  } catch {
    // Ignore audio errors
  }
}

function playLaserWhooshSound(isUpwardGold: boolean) {
  const ctx = getUnlockedAudioCtx();
  if (!ctx || ctx.state !== "running") return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(isUpwardGold ? 480 : 920, now);
    osc.frequency.exponentialRampToValueAtTime(isUpwardGold ? 1120 : 420, now + 0.38);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.42);
  } catch {
    // Ignore audio errors
  }
}

function playFireworkPopAndCrackleSound(isGoldHit: boolean) {
  const ctx = getUnlockedAudioCtx();
  if (!ctx || ctx.state !== "running") return;
  try {
    const now = ctx.currentTime;

    // 1. Main Firework Pop (Punchy Low-Mid Thump + Crisp Noise Pop)
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    popOsc.type = "triangle";
    popOsc.frequency.setValueAtTime(isGoldHit ? 260 : 310, now);
    popOsc.frequency.exponentialRampToValueAtTime(48, now + 0.11);

    popGain.gain.setValueAtTime(0.14, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    popOsc.connect(popGain);
    popGain.connect(ctx.destination);
    popOsc.start(now);
    popOsc.stop(now + 0.13);

    // Filtered Noise Burst for Authentic Firework Snap ("فرقعة")
    const bufferSize = Math.floor(ctx.sampleRate * 0.09);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }
    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(isGoldHit ? 1450 : 1850, now);
    filter.Q.setValueAtTime(1.4, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.16, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.002, now + 0.09);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    whiteNoise.start(now);

    // 2. Staggered Sparkle Crackle Pops as Shards Scatter Outward
    const crackleDelays = [0.055, 0.11, 0.165, 0.23, 0.3];
    crackleDelays.forEach((delay, idx) => {
      const tStart = now + delay;
      const sparkOsc = ctx.createOscillator();
      const sparkGain = ctx.createGain();
      sparkOsc.type = "sine";
      const baseFreq = isGoldHit ? 1550 + idx * 240 : 1850 + idx * 280;
      sparkOsc.frequency.setValueAtTime(baseFreq, tStart);
      sparkOsc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, tStart + 0.045);

      sparkGain.gain.setValueAtTime(0.04, tStart);
      sparkGain.gain.exponentialRampToValueAtTime(0.0008, tStart + 0.05);

      sparkOsc.connect(sparkGain);
      sparkGain.connect(ctx.destination);
      sparkOsc.start(tStart);
      sparkOsc.stop(tStart + 0.055);
    });
  } catch {
    // Ignore audio errors
  }
}

export function FloatingAIAssistant() {
  const open = useUIStore((s) => s.aiDockOpen);
  const setOpen = useUIStore((s) => s.setAiDockOpen);
  const { language } = useTranslation();
  const isArabic = language.toUpperCase() === "AR";

  const defaultGreeting: ChatMessage = {
    role: "assistant",
    text: isArabic
      ? "مرحباً بك! أنا مساعد MeetMind AI الذكي الفائق. اسألني أي سؤال في أي مجال علمي أو برمجي أو أكاديمي، أو اطلب تلخيص المحاضرات والاجتماعات واستخراج المهام والاختبارات من ملفاتك الصوتية."
      : "Hello! I am your Super-Intelligent MeetMind AI Assistant. Ask me any question on any academic, technical, or general topic, or request summaries, tasks, and quizzes from your recordings.",
  };

  const defaultSuggestions = isArabic
    ? [
        "لخص لي آخر ملف صوتي أو محاضرة",
        "اعمل لي 10 أسئلة مراجعة مع الإجابات",
        "إيه المهام والتكليفات المطلوبة؟",
        "اشرح لي الذكاء الاصطناعي التوليدي ببساطة",
        "كيف أستعد للامتحان بأفضل طريقة؟",
      ]
    : [
        "Summarize the latest audio or lecture",
        "Create 10 quiz questions with answers",
        "What action items were assigned?",
        "Explain Generative AI simply",
        "How should I prepare for the exam?",
      ];

  const [input, setInput] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([defaultGreeting]);
  const [suggestions, setSuggestions] = useState<string[]>(defaultSuggestions);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [laserEvent, setLaserEvent] = useState<LaserEvent | null>(null);
  const [geniePhase, setGeniePhase] = useState<"idle" | "opening" | "closing">("idle");
  const [fabCoords, setFabCoords] = useState<{ x: number; y: number } | null>(null);

  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api.getMeetings(),
    enabled: open,
  });

  const { data: lectures = [] } = useQuery<Lecture[]>({
    queryKey: ["lectures"],
    queryFn: () => api.getLectures(),
    enabled: open,
  });

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const urlId = new URLSearchParams(window.location.search).get("id");
    if (urlId) {
      setSelectedResourceId(urlId);
    }
  }, [open]);

  const prevOpenRef = useRef<boolean>(open);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat body when messages or loading state changes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isLoading, open]);

  // Trigger Genie Release / Vacuum Suction sound & particle vortex whenever `open` changes
  useEffect(() => {
    if (prevOpenRef.current === open) return;
    prevOpenRef.current = open;

    const fabEl = document.getElementById("floating-ai-fab-btn");
    if (fabEl) {
      const rect = fabEl.getBoundingClientRect();
      if (rect.width > 0) {
        setFabCoords({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
    }

    if (open) {
      playGenieUnfoldSound();
      setGeniePhase("opening");
      if (fabEl) {
        fabEl.setAttribute("data-laser-hit", "gold");
        setTimeout(() => fabEl.removeAttribute("data-laser-hit"), 600);
      }
      const t = window.setTimeout(() => setGeniePhase("idle"), 620);
      return () => clearTimeout(t);
    } else {
      playGenieSuctionSound();
      setGeniePhase("closing");
      const hitTimer = window.setTimeout(() => {
        if (fabEl) {
          fabEl.setAttribute("data-laser-hit", "cyan");
          setTimeout(() => fabEl.removeAttribute("data-laser-hit"), 650);
        }
      }, 310);
      const t = window.setTimeout(() => setGeniePhase("idle"), 560);
      return () => {
        clearTimeout(hitTimer);
        clearTimeout(t);
      };
    }
  }, [open]);

  // Unlock Web Audio API on first user gesture so the 7s firework pop & crackle plays audibly
  useEffect(() => {
    const unlock = () => {
      getUnlockedAudioCtx();
    };
    window.addEventListener("pointerdown", unlock, { passive: true, once: true });
    window.addEventListener("keydown", unlock, { passive: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Every 7 seconds, alternate firing a laser beam between Bottom-Right AI FAB and Topbar Ask AI button,
  // producing a firework pop sound + 32 scattered stars/shards/sparks around the button that was hit (and vice versa).
  useEffect(() => {
    if (open) {
      setLaserEvent(null);
      return;
    }

    let nextDirection: "fab-to-ask" | "ask-to-fab" = "fab-to-ask";
    let burstTimer: number | undefined;
    let clearTimer: number | undefined;
    let hitCleanupTimer: number | undefined;
    let seqId = 0;

    const fireAlternatingLaser = () => {
      if (document.hidden) return;
      const fabEl = document.getElementById("floating-ai-fab-btn");
      const askEl = document.getElementById("topbar-ask-ai-btn");
      const askWrapperEl = document.getElementById("topbar-ask-ai-wrapper") || askEl;
      if (!fabEl || !askEl) return;

      const fabRect = fabEl.getBoundingClientRect();
      const askRect = askEl.getBoundingClientRect();
      if (fabRect.width === 0 || askRect.width === 0) return;

      const fabX = fabRect.left + fabRect.width / 2;
      const fabY = fabRect.top + fabRect.height / 2;
      const askX = askRect.left + askRect.width / 2;
      const askY = askRect.top + askRect.height / 2;

      const dir = nextDirection;
      nextDirection = dir === "fab-to-ask" ? "ask-to-fab" : "fab-to-ask";
      seqId += 1;

      const startX = dir === "fab-to-ask" ? fabX : askX;
      const startY = dir === "fab-to-ask" ? fabY : askY;
      const endX = dir === "fab-to-ask" ? askX : fabX;
      const endY = dir === "fab-to-ask" ? askY : fabY;

      // Phase 1: Laser Launch + Whoosh Sound
      playLaserWhooshSound(dir === "fab-to-ask");
      setLaserEvent({
        id: seqId,
        startX,
        startY,
        endX,
        endY,
        direction: dir,
        phase: "travel",
      });

      // Phase 2: Laser Hits Target Button -> Firework Pop Sound + 32 Scattered Shards/Stars + Button Glow
      burstTimer = window.setTimeout(() => {
        playFireworkPopAndCrackleSound(dir === "fab-to-ask");
        setLaserEvent({
          id: seqId,
          startX,
          startY,
          endX,
          endY,
          direction: dir,
          phase: "burst",
        });

        const targetEl = dir === "fab-to-ask" ? askWrapperEl : fabEl;
        const hitColor = dir === "fab-to-ask" ? "gold" : "cyan";
        if (targetEl) {
          targetEl.setAttribute("data-laser-hit", hitColor);
          hitCleanupTimer = window.setTimeout(() => {
            targetEl.removeAttribute("data-laser-hit");
          }, 980);
        }
      }, 480);

      // Phase 3: Cleanly fade out after scattered particles finish falling
      clearTimer = window.setTimeout(() => {
        setLaserEvent(null);
      }, 1450);
    };

    const initialTimer = window.setTimeout(fireAlternatingLaser, 2400);
    const interval = window.setInterval(fireAlternatingLaser, 7000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      if (burstTimer) clearTimeout(burstTimer);
      if (clearTimer) clearTimeout(clearTimer);
      if (hitCleanupTimer) clearTimeout(hitCleanupTimer);
    };
  }, [open]);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success(isArabic ? "تم نسخ الرد" : "Copied to clipboard");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleClear = () => {
    setMessages([defaultGreeting]);
    setSuggestions(defaultSuggestions);
    toast.info(isArabic ? "تم مسح المحادثة" : "Chat cleared");
  };

  const handleSend = async (questionText?: string) => {
    const q = (questionText || input).trim();
    if (!q || isLoading) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", text: q }];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const historyPayload = newMessages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("model" as const),
        text: m.text,
      }));

      const res: GroundedAnswer = await api.askQuestion(
        q,
        selectedResourceId || undefined,
        historyPayload,
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.answer,
          citations: res.citations,
        },
      ]);
      if (res.suggestedFollowUps && res.suggestedFollowUps.length > 0) {
        setSuggestions(res.suggestedFollowUps);
      }
    } catch {
      toast.error(isArabic ? "تعذر استرجاع الإجابة" : "Failed to retrieve response");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: isArabic
            ? "حدث خطأ أثناء التواصل مع محرك الذكاء الاصطناعي. يرجى المحاولة مرة أخرى."
            : "An error occurred while communicating with the AI engine. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const isGoldDirection = laserEvent?.direction === "fab-to-ask";
  const palette = isGoldDirection
    ? (["#FFF8DC", "#FFD700", "#F59E0B"] as const)
    : (["#E0F2FE", "#38BDF8", "#34D399"] as const);
  const primaryColor = palette[1];
  const brightColor = palette[0];

  return (
    <>
      {/* Alternating 7s Laser Stream & Scattered Firework Shrapnel/Stars Overlay */}
      <AnimatePresence>
        {laserEvent && !open && (
          <motion.svg
            key={`${laserEvent.id}-${laserEvent.phase}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="pointer-events-none fixed inset-0 z-50 h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient
                id="aiLaserStreamGrad"
                x1={laserEvent.startX}
                y1={laserEvent.startY}
                x2={laserEvent.endX}
                y2={laserEvent.endY}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={primaryColor} stopOpacity="0.05" />
                <stop offset="45%" stopColor={primaryColor} stopOpacity="0.75" />
                <stop offset="100%" stopColor={brightColor} stopOpacity="1" />
              </linearGradient>
            </defs>

            {laserEvent.phase === "travel" && (
              <>
                {/* Laser Energy Beam */}
                <motion.line
                  x1={laserEvent.startX}
                  y1={laserEvent.startY}
                  x2={laserEvent.endX}
                  y2={laserEvent.endY}
                  stroke="url(#aiLaserStreamGrad)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0.35 }}
                  animate={{ pathLength: 1, opacity: [0.4, 0.95, 0.25] }}
                  transition={{ duration: 0.46, ease: "easeInOut" }}
                />

                {/* Traveling Laser Photon Head */}
                <motion.circle
                  r="4.5"
                  fill={brightColor}
                  initial={{ cx: laserEvent.startX, cy: laserEvent.startY, opacity: 1 }}
                  animate={{ cx: laserEvent.endX, cy: laserEvent.endY, opacity: 1 }}
                  transition={{ duration: 0.46, ease: "easeInOut" }}
                  style={{ filter: `drop-shadow(0 0 10px ${primaryColor})` }}
                />
              </>
            )}

            {laserEvent.phase === "burst" && (
              <g>
                {/* Core Impact Flash on the Hit Button */}
                <motion.circle
                  cx={laserEvent.endX}
                  cy={laserEvent.endY}
                  r="14"
                  fill={brightColor}
                  initial={{ scale: 0.3, opacity: 0.9 }}
                  animate={{ scale: 2.1, opacity: 0 }}
                  transition={{ duration: 0.42, ease: "easeOut" }}
                  style={{
                    transformOrigin: `${laserEvent.endX}px ${laserEvent.endY}px`,
                    filter: `drop-shadow(0 0 14px ${primaryColor})`,
                  }}
                />

                {/* Dual Expanding Shockwave Rings */}
                <motion.circle
                  cx={laserEvent.endX}
                  cy={laserEvent.endY}
                  r="24"
                  fill="none"
                  stroke={brightColor}
                  strokeWidth="2.2"
                  initial={{ scale: 0.35, opacity: 1 }}
                  animate={{ scale: 2.15, opacity: 0 }}
                  transition={{ duration: 0.78, ease: "easeOut" }}
                  style={{
                    transformOrigin: `${laserEvent.endX}px ${laserEvent.endY}px`,
                    filter: `drop-shadow(0 0 10px ${primaryColor})`,
                  }}
                />
                <motion.circle
                  cx={laserEvent.endX}
                  cy={laserEvent.endY}
                  r="18"
                  fill="none"
                  stroke={palette[2]}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  initial={{ scale: 0.4, opacity: 0.9 }}
                  animate={{ scale: 2.45, opacity: 0 }}
                  transition={{ duration: 0.88, ease: "easeOut" }}
                  style={{
                    transformOrigin: `${laserEvent.endX}px ${laserEvent.endY}px`,
                  }}
                />

                {/* 32 Scattered Stars, Diamond Shards, Streaks & Glowing Embers Around the Hit Button */}
                {SCATTERED_PARTICLES.map((sp) => {
                  const pColor = palette[sp.colorSlot];
                  const targetX = laserEvent.endX + sp.dx;
                  const targetY = laserEvent.endY + sp.dy + sp.gravityDrop;

                  return (
                    <g key={sp.id}>
                      {/* Flying Spark Streak Trail */}
                      <motion.line
                        initial={{
                          x1: laserEvent.endX,
                          y1: laserEvent.endY,
                          x2: laserEvent.endX,
                          y2: laserEvent.endY,
                          opacity: 1,
                        }}
                        animate={{
                          x1: laserEvent.endX + sp.dx * 0.58,
                          y1: laserEvent.endY + sp.dy * 0.58 + sp.gravityDrop * 0.4,
                          x2: targetX,
                          y2: targetY,
                          opacity: 0,
                        }}
                        transition={{ duration: 0.78, ease: [0.16, 1, 0.3, 1] }}
                        stroke={pColor}
                        strokeWidth={sp.kind === "streak" ? "2.1" : "1.3"}
                        strokeLinecap="round"
                      />

                      {/* Scattered Shrapnel Shape (Star, Diamond Shard, or Glowing Orb) */}
                      {sp.kind === "star" ? (
                        <motion.polygon
                          points="0,-5 1.4,-1.4 5,0 1.4,1.4 0,5 -1.4,1.4 -5,0 -1.4,-1.4"
                          fill={brightColor}
                          initial={{
                            x: laserEvent.endX,
                            y: laserEvent.endY,
                            scale: 0.4,
                            rotate: 0,
                            opacity: 1,
                          }}
                          animate={{
                            x: targetX,
                            y: targetY,
                            scale: [1.15, 0.85, 0.1],
                            rotate: sp.rotDeg,
                            opacity: [1, 0.95, 0],
                          }}
                          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                          style={{ filter: `drop-shadow(0 0 6px ${pColor})` }}
                        />
                      ) : sp.kind === "diamond" ? (
                        <motion.polygon
                          points="0,-4.2 3.2,0 0,4.2 -3.2,0"
                          fill={pColor}
                          initial={{
                            x: laserEvent.endX,
                            y: laserEvent.endY,
                            scale: 0.5,
                            rotate: 0,
                            opacity: 1,
                          }}
                          animate={{
                            x: targetX,
                            y: targetY,
                            scale: [1.1, 0.75, 0.1],
                            rotate: -sp.rotDeg,
                            opacity: [1, 0.9, 0],
                          }}
                          transition={{ duration: 0.82, ease: [0.16, 1, 0.3, 1] }}
                          style={{ filter: `drop-shadow(0 0 5px ${pColor})` }}
                        />
                      ) : (
                        <motion.circle
                          r={sp.r}
                          fill={pColor}
                          initial={{
                            cx: laserEvent.endX,
                            cy: laserEvent.endY,
                            opacity: 1,
                            scale: 1,
                          }}
                          animate={{
                            cx: targetX,
                            cy: targetY,
                            opacity: [1, 0.9, 0],
                            scale: [1.2, 0.8, 0.15],
                          }}
                          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                          style={{ filter: `drop-shadow(0 0 6px ${pColor})` }}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            )}
          </motion.svg>
        )}
      </AnimatePresence>

      {/* Genie Release & Vacuum Suction Energy Vortex Overlay Connecting FAB Button to Chat Window */}
      <AnimatePresence>
        {geniePhase !== "idle" && fabCoords && (
          <motion.svg
            key={`genie-vortex-${geniePhase}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none fixed inset-0 z-50 h-full w-full overflow-visible"
          >
            <defs>
              <radialGradient id="geniePortalGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFF8DC" stopOpacity="0.95" />
                <stop offset="45%" stopColor="#FFD700" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Portal Vortex Ring at the FAB Button */}
            <motion.circle
              cx={fabCoords.x}
              cy={fabCoords.y}
              r="34"
              fill="url(#geniePortalGlow)"
              initial={{ scale: geniePhase === "opening" ? 0.2 : 1.6, opacity: 0.9 }}
              animate={{
                scale: geniePhase === "opening" ? [0.25, 1.85, 0.5] : [1.7, 0.9, 0.15],
                opacity: [0.9, 0.85, 0],
              }}
              transition={{ duration: 0.52, ease: "easeInOut" }}
              style={{ transformOrigin: `${fabCoords.x}px ${fabCoords.y}px` }}
            />

            {/* 18 Genie Stream Particles Erupting Out on Open OR Getting Vacuumed Into the Button on Close */}
            {GENIE_STREAM_PARTICLES.map((p) => {
              const targetX = fabCoords.x + p.offsetX;
              const targetY = fabCoords.y + p.offsetY;
              const midX = fabCoords.x + p.ctrlX;
              const midY = fabCoords.y + p.ctrlY;
              const isOpening = geniePhase === "opening";

              return (
                <g key={p.id}>
                  <motion.path
                    d={`M ${fabCoords.x} ${fabCoords.y} Q ${midX} ${midY} ${targetX} ${targetY}`}
                    fill="none"
                    stroke={p.color}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    initial={{
                      pathLength: isOpening ? 0 : 1,
                      opacity: isOpening ? 0.85 : 0.75,
                    }}
                    animate={{
                      pathLength: isOpening ? [0, 1, 0.2] : [1, 0],
                      opacity: [0.85, 0.65, 0],
                    }}
                    transition={{
                      duration: isOpening ? 0.48 : 0.42,
                      delay: p.delay,
                      ease: isOpening ? [0.16, 1, 0.3, 1] : [0.55, 0.05, 0.67, 0.19],
                    }}
                  />
                  <motion.circle
                    r={p.size}
                    fill={p.color}
                    initial={{
                      cx: isOpening ? fabCoords.x : targetX,
                      cy: isOpening ? fabCoords.y : targetY,
                      scale: isOpening ? 0.3 : 1.15,
                      opacity: 1,
                    }}
                    animate={{
                      cx: isOpening ? [fabCoords.x, midX, targetX] : [targetX, midX, fabCoords.x],
                      cy: isOpening ? [fabCoords.y, midY, targetY] : [targetY, midY, fabCoords.y],
                      scale: isOpening ? [0.4, 1.3, 0.1] : [1.2, 0.9, 0.05],
                      opacity: [1, 0.95, 0],
                    }}
                    transition={{
                      duration: isOpening ? 0.5 : 0.42,
                      delay: p.delay,
                      ease: isOpening ? [0.16, 1, 0.3, 1] : [0.55, 0.05, 0.67, 0.19],
                    }}
                    style={{ filter: `drop-shadow(0 0 8px ${p.color})` }}
                  />
                </g>
              );
            })}
          </motion.svg>
        )}
      </AnimatePresence>

      {/* Bottom-Right Floating AI Button with Elastic Pulse on Open/Close */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-40 md:bottom-6 md:right-6">
        <div className="pointer-events-auto relative flex items-center justify-center">
          <motion.button
            id="floating-ai-fab-btn"
            aria-label="Ask MeetMind AI"
            onClick={() => setOpen(!open)}
            animate={
              geniePhase === "opening"
                ? { scale: [1, 1.26, 0.9, 1.05, 1], rotate: [0, -14, 12, 0] }
                : geniePhase === "closing"
                  ? { scale: [1, 0.84, 1.28, 0.94, 1], rotate: [0, 12, -10, 0] }
                  : { scale: 1, rotate: 0 }
            }
            transition={{ duration: 0.52, ease: "easeOut" }}
            className="ai-fab-gold-animated-border cursor-pointer select-none"
          >
            <div className="ai-fab-gold-animated-border-inner">
              <Sparkles className="h-6 w-6 text-zinc-950 fill-zinc-950" />
            </div>
          </motion.button>
        </div>
      </div>

      {/* Genie / Liquid Release & Vacuum Suction AI Chat Window */}
      <AnimatePresence mode="wait">
        {open && (
          <motion.div
            key="genie-ai-chat-window"
            style={{
              transformOrigin: "calc(100% - 26px) calc(100% + 44px)",
              willChange: "transform, opacity, filter, border-radius",
            }}
            initial={{
              opacity: 0,
              scaleX: 0.03,
              scaleY: 0.015,
              x: 16,
              y: 56,
              skewX: -18,
              skewY: 11,
              rotate: 8,
              borderRadius: "140px",
              filter: "blur(14px) brightness(1.9)",
            }}
            animate={{
              opacity: [0, 0.82, 1, 1, 1],
              scaleX: [0.03, 0.44, 1.045, 0.988, 1],
              scaleY: [0.015, 0.88, 1.03, 0.992, 1],
              x: [16, 5, -3, 1, 0],
              y: [56, 14, -7, 1.5, 0],
              skewX: [-18, -6, 2, -0.4, 0],
              skewY: [11, 3.5, -1, 0.2, 0],
              rotate: [8, 2.2, -0.7, 0.15, 0],
              borderRadius: ["140px", "64px", "22px", "16px", "16px"],
              filter: [
                "blur(14px) brightness(1.9)",
                "blur(4px) brightness(1.3)",
                "blur(0px) brightness(1.06)",
                "blur(0px) brightness(1)",
                "blur(0px) brightness(1)",
              ],
            }}
            exit={{
              opacity: [1, 0.95, 0.55, 0],
              scaleX: [1, 1.03, 0.24, 0.015],
              scaleY: [1, 0.93, 0.44, 0.01],
              x: [0, -3, 9, 18],
              y: [0, -5, 24, 58],
              skewX: [0, 2.5, -14, -22],
              skewY: [0, -1.5, 8, 15],
              rotate: [0, -1, 5, 10],
              borderRadius: ["16px", "28px", "88px", "150px"],
              filter: [
                "blur(0px) brightness(1)",
                "blur(1px) brightness(1.15)",
                "blur(6px) brightness(1.5)",
                "blur(16px) brightness(2)",
              ],
              transition: {
                duration: 0.46,
                ease: [0.32, 0, 0.67, 0],
              },
            }}
            transition={{
              duration: 0.58,
              ease: [0.16, 1, 0.3, 1],
            }}
            dir={isArabic ? "rtl" : "ltr"}
            className="fixed bottom-24 right-5 z-40 w-[min(460px,calc(100vw-2rem))] max-h-[610px] flex flex-col overflow-hidden rounded-2xl border border-[#D4AF37]/45 bg-card/95 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.85),0_0_35px_rgba(212,175,55,0.22)] backdrop-blur-2xl md:right-6"
          >
            {/* Header */}
            <div className="relative flex items-center justify-between border-b border-border/60 p-3 bg-secondary/40">
              <div className="flex items-center gap-2.5">
                <div className="relative grid h-9 w-9 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-sm">
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold flex items-center gap-1.5">
                    <span>{isArabic ? "مساعد MeetMind الذكي الفائق" : "MeetMind Super AI"}</span>
                    <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[9px] font-mono text-primary font-semibold">
                      MeetMind AI
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {isArabic
                      ? "يجيب على أي سؤال في أي مجال ويحلل تسجيلاتك ومحاضراتك"
                      : "Answers any question on any topic & analyzes your recordings"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={handleClear}
                  title={isArabic ? "مسح المحادثة" : "Clear conversation"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Recording Scope Selector */}
            <div className="flex items-center gap-2 border-b border-border/50 bg-background/60 px-3 py-1.5 text-[11px]">
              <FileAudio className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="shrink-0 text-muted-foreground">
                {isArabic ? "النطاق:" : "Scope:"}
              </span>
              <select
                aria-label={isArabic ? "اختر التسجيل" : "Select recording scope"}
                value={selectedResourceId}
                onChange={(e) => setSelectedResourceId(e.target.value)}
                className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-secondary/50 px-2 py-1 text-[11px] text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">
                  {isArabic
                    ? "مساعد ذكي شامل (أي سؤال + جميع التسجيلات)"
                    : "General AI + All Recordings (Ask anything)"}
                </option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {isArabic ? "اجتماع: " : "Meeting: "}
                    {m.title}
                  </option>
                ))}
                {lectures.map((l) => (
                  <option key={l.id} value={l.id}>
                    {isArabic ? "محاضرة: " : "Lecture: "}
                    {l.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Chat Body */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[380px]">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`group relative rounded-xl p-3 text-xs leading-relaxed transition-all ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground ml-6 shadow-sm"
                      : "bg-secondary/70 border border-border/60 mr-4 text-foreground"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground mb-1">
                      {m.role === "user" ? (
                        <>
                          <User className="h-3 w-3" />
                          <span>{isArabic ? "أنت" : "You"}</span>
                        </>
                      ) : (
                        <>
                          <Bot className="h-3 w-3 text-primary" />
                          <span className="text-primary">
                            {isArabic ? "MeetMind AI" : "Assistant"}
                          </span>
                        </>
                      )}
                    </div>

                    {m.role === "assistant" && (
                      <button
                        onClick={() => handleCopy(m.text, idx)}
                        className="opacity-60 hover:opacity-100 transition p-1 text-muted-foreground rounded hover:bg-background/60"
                        title={isArabic ? "نسخ الرد" : "Copy text"}
                      >
                        {copiedIdx === idx ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  <div className="whitespace-pre-line">{m.text}</div>

                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-border/40 space-y-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
                        <Quote className="h-2.5 w-2.5" />
                        <span>
                          {isArabic ? "استشهادات موثقة من التسجيل:" : "Verified Citations:"}
                        </span>
                      </div>
                      {m.citations.map((c, cIdx) => (
                        <div
                          key={cIdx}
                          className="rounded-lg bg-background/70 border border-border/40 p-2 text-[11px]"
                        >
                          <div className="flex items-center justify-between text-muted-foreground font-mono text-[10px] mb-0.5">
                            <span className="font-semibold text-foreground">{c.speaker}</span>
                            <span>{c.timestamp}</span>
                          </div>
                          <div className="italic text-muted-foreground">"{c.quote}"</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground p-3 rounded-xl bg-secondary/40 border border-border/40">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>
                    {isArabic
                      ? "جاري التفكير العميق وصياغة الإجابة الشاملة..."
                      : "Synthesizing comprehensive answer..."}
                  </span>
                </div>
              )}
            </div>

            {/* Dynamic Quick Suggestions */}
            <div className="px-3 pb-2 pt-1 border-t border-border/40 flex flex-wrap gap-1.5 bg-background/40">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary hover:text-foreground hover:bg-card cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="border-t border-border/60 p-2.5 bg-background/70"
            >
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-2.5 py-1.5 focus-within:border-primary/50 transition">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isArabic
                      ? "اسأل أي سؤال علمي أو تقني أو عن محاضراتك وملفاتك الصوتية..."
                      : "Ask any question about your recordings or any topic..."
                  }
                  className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 text-xs"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isLoading || !input.trim()}
                  className="h-8 w-8 gradient-primary text-primary-foreground shrink-0 rounded-lg cursor-pointer shadow-sm"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
