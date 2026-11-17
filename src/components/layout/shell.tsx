import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AmbientBackground } from "@/components/common/ambient-background";
import { PerformanceMonitor } from "@/components/common/performance-monitor";
import { useUIStore } from "@/stores/ui-store";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Shell({ children }: { children: ReactNode }) {
  const mobileOpen = useUIStore((s) => s.mobileSidebarOpen);
  const setMobileOpen = useUIStore((s) => s.setMobileSidebarOpen);
  const { isRtl } = useTranslation();

  return (
    <div className="relative flex min-h-screen w-full bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* High-performance pure SVG/CSS ambient background */}
      <AmbientBackground />

      {/* Real-time speed & TTFB/FCP/LCP HUD */}
      <PerformanceMonitor />

      <div className="relative z-10 hidden lg:block">
        <div className="sticky top-0 h-screen">
          <AppSidebar />
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side={isRtl ? "right" : "left"}
          className={cn(
            "w-[220px] bg-sidebar/95 p-0 backdrop-blur-xl border-border/70",
            isRtl ? "border-l border-sidebar-border" : "border-r border-sidebar-border",
          )}
        >
          <AppSidebar variant="mobile" />
        </SheetContent>
      </Sheet>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
