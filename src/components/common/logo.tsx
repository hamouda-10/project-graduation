import { cn } from "@/lib/utils";

/**
 * MeetMind AI Logo
 * Features:
 * - Direct official logo asset
 * - Border Radius 40px
 * - Slightly reduced logo size for refined sidebar balance
 * - Encased in an animated rotating gold highlight frame
 * - Crisp rendering without cropping
 */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center select-none transition-all duration-200",
        compact ? "gap-0" : "gap-2.5",
        className,
      )}
    >
      {/* Multi-Orbital Atomic Gold Rings Behind Official Logo */}
      <div className="logo-orbit-wrapper">
        <div className="logo-orbit-rings-group" aria-hidden="true">
          <div className="logo-orbit-ring logo-orbit-ring-1" />
          <div className="logo-orbit-ring logo-orbit-ring-2" />
          <div className="logo-orbit-ring logo-orbit-ring-3" />
          <div className="logo-orbit-ring logo-orbit-ring-4" />
          <div className="logo-orbit-ring logo-orbit-ring-5" />
        </div>

        {/* Animated Rotating Gold Highlight Frame with Border Radius 40px (z-10) */}
        <div className="gold-animated-border relative z-10 transition-transform duration-200 hover:scale-105">
          <div className="gold-animated-border-inner">
            <div
              className={cn(
                "relative grid place-items-center shrink-0 overflow-hidden rounded-[30px]",
                compact ? "h-8 w-8" : "h-12 w-12 sm:h-13 sm:w-13",
              )}
              style={{ borderRadius: "30px" }}
            >
              <picture>
                <source srcSet="/assets/meetmind_logo.webp" type="image/webp" />
                <img
                  src="/assets/aistudio/______________________________2c404761.png"
                  alt="MeetMind AI Logo"
                  className="h-full w-full object-contain aspect-square select-none rounded-[40px]"
                  style={{ borderRadius: "40px" }}
                  loading="eager"
                  decoding="async"
                />
              </picture>
            </div>
          </div>
        </div>
      </div>

      {!compact && (
        <div className="flex flex-col items-center justify-center text-center leading-none">
          <div className="font-display text-lg sm:text-xl font-black tracking-tight text-foreground flex items-center justify-center gap-1.5">
            <span className="font-extrabold text-white drop-shadow-sm">MeetMind</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 font-black">
              AI
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
