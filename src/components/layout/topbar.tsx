import { Menu, Search, Sparkles, Settings, Command as CmdIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ThemeToggle } from "@/components/topbar/theme-toggle";
import { LanguageSwitch } from "@/components/topbar/language-switch";
import { NotificationsButton } from "@/components/topbar/notifications-button";
import { useUIStore } from "@/stores/ui-store";
import { useTranslation } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";

export function Topbar() {
  const openCommand = useUIStore((s) => s.setCommandOpen);
  const openMobile = useUIStore((s) => s.setMobileSidebarOpen);
  const openAI = useUIStore((s) => s.setAiDockOpen);
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/70 px-3 backdrop-blur-xl md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => openMobile(true)}
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Breadcrumbs />

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => openCommand(true)}
          className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card md:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span>{t("searchPlaceholder")}</span>
          <kbd className="ml-auto inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/70 px-1.5 py-0.5 text-[10px] font-medium">
            <CmdIcon className="h-3 w-3" />K
          </kbd>
        </button>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Search"
          onClick={() => openCommand(true)}
        >
          <Search className="h-4 w-4" />
        </Button>

        <Button
          onClick={() => openAI(true)}
          className="h-9 gap-2 gradient-primary text-primary-foreground shadow-glow hover:opacity-95 cursor-pointer"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">{t("askAi")}</span>
        </Button>

        <div className="mx-1 hidden h-6 w-px bg-border md:block" />

        <NotificationsButton />
        <LanguageSwitch />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="hidden h-9 w-9 md:inline-flex"
          aria-label="Settings"
        >
          <Link to="/settings">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
