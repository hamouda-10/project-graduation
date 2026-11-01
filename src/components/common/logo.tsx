import { cn } from "@/lib/utils";

export function Logo({
  className,
  compact = false,
  variant = "gold",
}: {
  className?: string;
  compact?: boolean;
  variant?: "gold" | "white";
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Custom Stylized M + Microphone Gold Emblem */}
      <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-950 border border-amber-500/40 shadow-lg shadow-amber-500/10 transition-transform hover:scale-105">
        <svg viewBox="0 0 64 64" className="h-6 w-6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="logoGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="45%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>
          {/* M Left Pillar */}
          <path
            d="M16 44 L16 22 L24 33"
            stroke="url(#logoGold)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* M Right Pillar */}
          <path
            d="M48 44 L48 22 L40 33"
            stroke="url(#logoGold)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Central Microphone Capsule */}
          <rect x="27.5" y="16" width="9" height="15" rx="4.5" fill="url(#logoGold)" />
          {/* Microphone Cradle Arc */}
          <path
            d="M24 25 C24 33.5 40 33.5 40 25"
            stroke="url(#logoGold)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path d="M32 33 L32 38" stroke="url(#logoGold)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M27 38 L37 38" stroke="url(#logoGold)" strokeWidth="2.5" strokeLinecap="round" />
          {/* Intelligent Sparkle Dot */}
          <circle cx="32" cy="45" r="2" fill="#FDE68A" />
        </svg>
        <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-amber-400/20" />
      </div>

      {!compact && (
        <div className="min-w-0 leading-tight text-right">
          <div className="truncate font-display text-base font-bold tracking-tight text-foreground flex items-center gap-1">
            <span>MeetMind</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 font-black">
              AI
            </span>
          </div>
          <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            ذكاء الاجتماعات والمحاضرات
          </div>
        </div>
      )}
    </div>
  );
}
