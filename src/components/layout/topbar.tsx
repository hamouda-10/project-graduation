import { Menu, Search, Sparkles, Settings, Command as CmdIcon, Mic, Calendar } from "lucide-react";
import { LanguageSwitch } from "@/components/topbar/language-switch";
import { NotificationsButton } from "@/components/topbar/notifications-button";
import { useUIStore } from "@/stores/ui-store";
import { useTranslation } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";

export function Topbar() {
  const openCommand = useUIStore((s) => s.setCommandOpen);
  const openMobile = useUIStore((s) => s.setMobileSidebarOpen);
  const openAI = useUIStore((s) => s.setAiDockOpen);
  const setRecordingOpen = useUIStore((s) => s.setRecordingDialogOpen);
  const { t, language } = useTranslation();

  let recordTitle = "Start New Recording or Upload";
  if (language === "AR") {
    recordTitle = "بدء تسجيل صوتي جديد أو رفع ملف";
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-sidebar-border/40 bg-background/85 px-3 backdrop-blur-xl md:px-6 gap-2">
      {/* LEFT SECTION: Mobile Menu + Quick Action Buttons + AI Status Pill */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-[130px] md:min-w-[210px]">
        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => openMobile(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/25 bg-zinc-950/80 text-amber-400 transition-all hover:border-amber-500/50 hover:bg-zinc-900 hover:text-amber-300 lg:hidden cursor-pointer shadow-sm"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Quick New Audio Recording / Upload Button */}
        <button
          type="button"
          onClick={() => setRecordingOpen(true)}
          className="hidden sm:flex h-9 items-center gap-2 rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-amber-500/20 px-3 text-xs font-bold text-amber-300 transition-all hover:border-amber-400 hover:bg-amber-500/30 hover:shadow-[0_0_15px_rgba(212,175,55,0.3)] cursor-pointer shadow-sm active:scale-95"
          title={recordTitle}
        >
          <Mic className="h-4 w-4 text-amber-400 animate-pulse" />
          <span>{language === "AR" ? "تسجيل جديد" : "+ Record Audio"}</span>
        </button>

        {/* AI Live Engine Indicator */}
        <div className="hidden lg:flex items-center gap-2 rounded-full border border-amber-500/20 bg-zinc-950/80 px-3 py-1 text-[11px] font-semibold text-zinc-300 shadow-inner">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-amber-300/90 tracking-wide font-mono">AI v3.5 Active</span>
        </div>
      </div>

      {/* CENTER SECTION: Search Bar Perfectly Centered */}
      <div className="flex-1 flex justify-center items-center px-1 max-w-xl mx-auto">
        <div className="search-gold-animated-border w-full">
          <div className="search-gold-animated-border-inner">
            <button
              type="button"
              onClick={() => openCommand(true)}
              className="flex h-10 w-full items-center gap-3 rounded-full bg-zinc-950/90 px-4 text-xs sm:text-sm text-muted-foreground transition-all duration-150 hover:text-foreground cursor-pointer select-none"
            >
              <Search className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="truncate font-medium">{t("searchPlaceholder")}</span>
              <kbd className="ml-auto hidden items-center gap-1 rounded-md border border-amber-500/30 bg-zinc-900/90 px-2 py-0.5 text-[10.5px] font-mono font-medium text-amber-300 md:inline-flex">
                <CmdIcon className="h-3 w-3" />K
              </kbd>
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT SECTION: Quick Action Buttons Side-by-Side */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 justify-end min-w-[130px] md:min-w-[210px]">
        {/* Ask AI Button (Connected to Bottom-Right AI FAB via Alternating 12s Laser & Firework Pop) */}
        <div id="topbar-ask-ai-wrapper" className="btn-gold-animated-border">
          <button
            id="topbar-ask-ai-btn"
            type="button"
            onClick={() => openAI(true)}
            className="btn-gold-animated-border-inner flex h-9 items-center gap-2 px-2.5 sm:px-3.5 text-xs sm:text-sm font-bold text-[#FFF3B0] transition-all hover:text-white cursor-pointer"
            title={t("askAi")}
          >
            <Sparkles className="h-4 w-4 text-[#D4AF37] animate-pulse" />
            <span className="hidden md:inline">{t("askAi")}</span>
          </button>
        </div>

        {/* Quick Calendar Link */}
        <Link
          to="/calendar"
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/25 bg-zinc-950/80 text-amber-400 transition-all hover:border-amber-500/50 hover:bg-zinc-900 hover:text-amber-300 shadow-sm"
          aria-label="Calendar"
          title={language === "AR" ? "الجدول والتقويم" : "Calendar & Schedule"}
        >
          <Calendar className="h-4 w-4" />
        </Link>

        {/* Notifications Button */}
        <NotificationsButton />

        {/* Language Switch */}
        <LanguageSwitch />

        {/* Settings Link */}
        <Link
          to="/settings"
          className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/25 bg-zinc-950/80 text-amber-400 transition-all hover:border-amber-500/50 hover:bg-zinc-900 hover:text-amber-300 shadow-sm"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
