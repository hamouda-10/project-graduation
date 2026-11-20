import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Mic, BookOpen, ShieldCheck, Globe } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useUIStore } from "@/stores/ui-store";
import authBgImage from "@/assets/images/auth_neural_acoustic_bg_1795141085443.jpg";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

const AMBIENT_PARTICLES = [
  { left: "9%", top: "18%", size: 4, variant: "a", delay: "0s" },
  { left: "24%", top: "74%", size: 3, variant: "b", delay: "1.6s" },
  { left: "41%", top: "24%", size: 3.5, variant: "a", delay: "3.1s" },
  { left: "58%", top: "82%", size: 3, variant: "b", delay: "0.9s" },
  { left: "73%", top: "16%", size: 4, variant: "a", delay: "2.4s" },
  { left: "88%", top: "62%", size: 3.5, variant: "b", delay: "4.2s" },
  { left: "16%", top: "48%", size: 2.5, variant: "b", delay: "2.8s" },
  { left: "82%", top: "36%", size: 2.5, variant: "a", delay: "1.2s" },
] as const;

export function GoogleBrandIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.09 3.57-5.16 3.57-8.85Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.88l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.32A7.19 7.19 0 0 1 4.91 12c0-.81.14-1.59.38-2.32v-3.1H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.42l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.73c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.58l4 3.1c.94-2.84 3.59-4.95 6.71-4.95Z"
      />
    </svg>
  );
}

/**
 * Prominent Official MeetMind AI Identity Emblem for Login & Register
 * Responsive sizing:
 * - Mobile: ~128px
 * - Tablet: ~156px
 * - Desktop: ~188px–204px
 * Uses the exact official MeetMind AI logo asset with subtle GPU-only continuous motion.
 */
function AuthHeroLogo({ variant }: { variant: "desktop" | "compact-hero" }) {
  const isDesktop = variant === "desktop";

  return (
    <div
      className={
        isDesktop
          ? "flex flex-col items-start select-none"
          : "flex flex-col items-center text-center select-none"
      }
    >
      <div
        className="relative flex items-center justify-center p-4 sm:p-5"
        style={{ perspective: "900px" }}
      >
        {/* Soft pulsing golden ambient glow */}
        <div
          aria-hidden="true"
          className="auth-hero-logo-aura pointer-events-none absolute -inset-4 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(212, 175, 55, 0.34) 0%, rgba(212, 175, 55, 0.1) 46%, transparent 72%)",
          }}
        />

        {/* Subtle outer orbital halo with golden particle */}
        <div
          aria-hidden="true"
          className="auth-hero-orbit-halo pointer-events-none absolute inset-0 rounded-full border border-dashed border-amber-400/20"
        >
          <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-amber-200 shadow-[0_0_10px_2px_rgba(245,158,11,0.85)]" />
          <span className="absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-amber-400/80 shadow-[0_0_8px_1px_rgba(212,175,55,0.75)]" />
        </div>

        {/* Fine 3D tilted orbital rings with micro AI particles */}
        <div
          aria-hidden="true"
          className="auth-hero-orbit-1 pointer-events-none absolute -inset-2 rounded-full border border-amber-400/35 shadow-[0_0_14px_rgba(212,175,55,0.18)]"
        >
          <span className="absolute right-[10%] top-[8%] h-1.5 w-1.5 rounded-full bg-[#fffbe6] shadow-[0_0_8px_2px_#f59e0b]" />
        </div>
        <div
          aria-hidden="true"
          className="auth-hero-orbit-2 pointer-events-none absolute -inset-4 rounded-full border border-amber-300/20"
        >
          <span className="absolute bottom-[12%] left-[12%] h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_2px_#d4af37]" />
        </div>

        {/* Floating official MeetMind AI logo container */}
        <div className="auth-hero-logo-float relative z-10">
          <div className="auth-hero-gold-frame">
            <div className="auth-hero-gold-frame-inner p-2 sm:p-2.5">
              <div
                className={
                  isDesktop
                    ? "relative h-[184px] w-[184px] xl:h-[204px] xl:w-[204px] overflow-hidden rounded-[26px]"
                    : "relative h-[126px] w-[126px] sm:h-[154px] sm:w-[154px] overflow-hidden rounded-[24px]"
                }
              >
                <picture>
                  <source srcSet="/assets/meetmind_logo.webp" type="image/webp" />
                  <img
                    src="/assets/aistudio/______________________________2c404761.png"
                    alt="MeetMind AI Official Logo"
                    className="h-full w-full aspect-square object-contain select-none"
                    loading="eager"
                    decoding="async"
                  />
                </picture>

                {/* Periodic subtle diagonal golden light sweep */}
                <div
                  aria-hidden="true"
                  className="auth-hero-logo-sweep pointer-events-none absolute -inset-1/2 w-[180%] h-[55%] bg-gradient-to-r from-transparent via-amber-100/35 to-transparent blur-[2px]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={
          isDesktop ? "mt-4 flex items-baseline gap-2" : "mt-3 flex items-baseline gap-1.5"
        }
      >
        <span
          className={
            isDesktop
              ? "font-display text-3xl font-black tracking-tight text-white xl:text-[2.1rem]"
              : "font-display text-2xl font-black tracking-tight text-white sm:text-[1.75rem]"
          }
        >
          MeetMind
        </span>
        <span
          className={
            isDesktop
              ? "font-display text-3xl font-black tracking-tight bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent xl:text-[2.1rem]"
              : "font-display text-2xl font-black tracking-tight bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent sm:text-[1.75rem]"
          }
        >
          AI
        </span>
      </div>
    </div>
  );
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const prefersReducedMotion = useReducedMotion();
  const { language, setLanguage, isRtl } = useTranslation();
  const setUiLanguage = useUIStore((s) => s.setLanguage);

  const toggleLanguage = () => {
    const next = language === "AR" ? "EN" : "AR";
    setLanguage(next);
    setUiLanguage(next);
  };

  const highlights =
    language === "AR"
      ? [
          {
            icon: Mic,
            title: "تفريغ صوتي فوري ودقيق",
            desc: "تحويل الاجتماعات والمحاضرات إلى نصوص منظمة مع تمييز المتحدثين.",
          },
          {
            icon: BookOpen,
            title: "ملخصات واختبارات ذكية",
            desc: "استخراج القرارات والمهام والبطاقات التعليمية وخرائط المفاهيم تلقائياً.",
          },
          {
            icon: ShieldCheck,
            title: "مساحات عمل خاصة ومعزولة",
            desc: "تشفير الجلسات وحماية تسجيلاتك وملاحظاتك الخاصة بالكامل.",
          },
        ]
      : [
          {
            icon: Mic,
            title: "Accurate speech intelligence",
            desc: "Transcribe live and uploaded meetings or lectures with speaker timelines.",
          },
          {
            icon: BookOpen,
            title: "Summaries, quizzes & study decks",
            desc: "Extract decisions, action items, flashcards, and mind maps from real audio.",
          },
          {
            icon: ShieldCheck,
            title: "Private isolated workspaces",
            desc: "Signed session security keeping your recordings and notes strictly yours.",
          },
        ];

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="relative min-h-screen w-full overflow-x-hidden bg-[#050507] text-zinc-100 selection:bg-amber-500/30 selection:text-amber-100"
    >
      {/* Cinematic Dark Obsidian & Gold AI Atmospheric Background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <img
          src={authBgImage}
          alt=""
          className="h-full w-full object-cover object-center opacity-35 scale-[1.03]"
          loading="eager"
          decoding="async"
        />

        {/* Deep obsidian scrim keeping the authentication form crisp and dominant */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#040406]/94 via-[#06060a]/88 to-[#0a0805]/92" />

        {/* Subtle golden atmospheric radial lighting */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 20% 28%, rgba(212, 175, 55, 0.13), transparent 48%), radial-gradient(circle at 82% 76%, rgba(190, 140, 40, 0.08), transparent 46%)",
          }}
        />

        {/* Architectural hairline grid masked smoothly to the center */}
        <div className="auth-bg-grid absolute inset-0 opacity-75" />

        {/* Very subtle drifting golden light ray */}
        <div
          className="auth-bg-ray absolute -top-1/3 left-[12%] h-[135%] w-[36%] blur-3xl"
          style={{
            background:
              "linear-gradient(180deg, rgba(212, 175, 55, 0.14) 0%, rgba(212, 175, 55, 0.03) 55%, transparent 100%)",
          }}
        />

        {/* Fine AI Neural Constellation & Orbital Arcs SVG */}
        <svg
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full opacity-45"
        >
          <defs>
            <linearGradient id="authGoldArc" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d4af37" stopOpacity="0" />
              <stop offset="50%" stopColor="#f5c95c" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="authConstellationLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#d4af37" stopOpacity="0.06" />
              <stop offset="50%" stopColor="#fde68a" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#d4af37" stopOpacity="0.06" />
            </linearGradient>
          </defs>

          {/* Subtle orbital lines */}
          <ellipse
            cx="360"
            cy="390"
            rx="420"
            ry="230"
            fill="none"
            stroke="url(#authGoldArc)"
            strokeWidth="1"
            transform="rotate(-14 360 390)"
          />
          <ellipse
            cx="1120"
            cy="520"
            rx="380"
            ry="210"
            fill="none"
            stroke="url(#authGoldArc)"
            strokeWidth="0.9"
            transform="rotate(18 1120 520)"
          />

          {/* AI Network connections */}
          <g stroke="url(#authConstellationLine)" strokeWidth="0.85">
            <line x1="140" y1="180" x2="310" y2="260" />
            <line x1="310" y1="260" x2="210" y2="490" />
            <line x1="210" y1="490" x2="430" y2="620" />
            <line x1="1140" y1="170" x2="1280" y2="330" />
            <line x1="1280" y1="330" x2="1180" y2="590" />
            <line x1="1180" y1="590" x2="1320" y2="760" />
          </g>

          {/* Subtle glowing network nodes */}
          <g fill="#f5c95c">
            <circle cx="140" cy="180" r="2.2" className="auth-bg-node" />
            <circle
              cx="310"
              cy="260"
              r="2.6"
              className="auth-bg-node"
              style={{ animationDelay: "1.1s" }}
            />
            <circle
              cx="210"
              cy="490"
              r="2"
              className="auth-bg-node"
              style={{ animationDelay: "2.2s" }}
            />
            <circle
              cx="430"
              cy="620"
              r="2.4"
              className="auth-bg-node"
              style={{ animationDelay: "0.7s" }}
            />
            <circle
              cx="1140"
              cy="170"
              r="2.2"
              className="auth-bg-node"
              style={{ animationDelay: "1.8s" }}
            />
            <circle
              cx="1280"
              cy="330"
              r="2.6"
              className="auth-bg-node"
              style={{ animationDelay: "2.9s" }}
            />
            <circle
              cx="1180"
              cy="590"
              r="2.2"
              className="auth-bg-node"
              style={{ animationDelay: "0.4s" }}
            />
            <circle
              cx="1320"
              cy="760"
              r="2"
              className="auth-bg-node"
              style={{ animationDelay: "3.4s" }}
            />
          </g>
        </svg>

        {/* Slow-moving golden micro-particles (CSS transform only, zero JS loop) */}
        {AMBIENT_PARTICLES.map((p, idx) => (
          <span
            key={idx}
            className={`absolute rounded-full bg-amber-300/75 shadow-[0_0_10px_rgba(212,175,55,0.6)] ${
              p.variant === "a" ? "auth-bg-particle-a" : "auth-bg-particle-b"
            }`}
            style={{
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      {/* Top utility bar with language switch */}
      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-end px-5 pt-4 sm:px-8 sm:pt-6">
        <button
          type="button"
          onClick={toggleLanguage}
          aria-label={language === "AR" ? "Switch to English" : "التبديل إلى العربية"}
          className="auth-btn-secondary inline-flex items-center gap-2 rounded-lg border border-amber-500/25 bg-zinc-950/75 px-3 py-1.5 text-xs font-semibold text-zinc-200 backdrop-blur-md hover:border-amber-400/55 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Globe className="h-3.5 w-3.5 text-amber-400" />
          <span>{language === "AR" ? "English" : "العربية"}</span>
        </button>
      </header>

      {/* Main responsive split grid */}
      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-7xl grid-cols-1 items-center gap-6 px-4 pb-10 pt-2 sm:px-8 sm:gap-8 lg:grid-cols-12 lg:gap-12 lg:py-8">
        {/* Left editorial showcase (Desktop: large prominent hero logo + value narrative) */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
          className="hidden lg:col-span-6 lg:flex lg:flex-col lg:items-start lg:pe-6"
        >
          <div className="mb-7">
            <AuthHeroLogo variant="desktop" />
          </div>

          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white text-balance xl:text-[2.65rem] xl:leading-[1.12]">
            {language === "AR" ? (
              <>
                ذكاء الاجتماعات والمحاضرات،{" "}
                <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                  بدقة استثنائية.
                </span>
              </>
            ) : (
              <>
                Meeting & lecture intelligence,{" "}
                <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                  crafted for clarity.
                </span>
              </>
            )}
          </h1>

          <p className="mt-3.5 max-w-lg text-[15px] leading-relaxed text-zinc-300/90">
            {language === "AR"
              ? "سجّل أو ارفع أي اجتماع أو محاضرة لتحصل على تفريغ نصي حقيقي وملخصات منظمة ومهام واختبارات تفاعلية في مساحة عمل آمنة."
              : "Record or upload any meeting or lecture to unlock verified transcripts, structured summaries, action items, and study tools in your private workspace."}
          </p>

          <div className="mt-7 w-full max-w-lg divide-y divide-amber-500/12 border-t border-amber-500/15 pt-2">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-3.5 py-3.5">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">{item.title}</h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* Right glassmorphic authentication card (+ Mobile/Tablet Prominent Hero Logo) */}
        <section className="mx-auto flex w-full max-w-[460px] flex-col items-center lg:col-span-6">
          {/* Mobile & Tablet prominent centered MeetMind AI Hero Logo */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="mb-5 lg:hidden"
          >
            <AuthHeroLogo variant="compact-hero" />
          </motion.div>

          {/* Animated Auth Card */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full overflow-hidden rounded-2xl border border-amber-500/25 bg-[#0a0a0f]/90 p-5 shadow-[0_28px_90px_-20px_rgba(0,0,0,0.9),0_0_40px_-18px_rgba(212,175,55,0.22)] backdrop-blur-xl sm:p-8"
          >
            {/* Subtle top gold hairline highlight */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent"
              aria-hidden="true"
            />

            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold tracking-tight text-white text-balance">
                {title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{subtitle}</p>
            </div>

            {children}

            {footer && (
              <div className="mt-6 border-t border-zinc-800/80 pt-5 text-center text-sm text-zinc-400">
                {footer}
              </div>
            )}
          </motion.div>
        </section>
      </main>
    </div>
  );
}
