import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useUIStore } from "@/stores/ui-store";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Shell({ children }: { children: ReactNode }) {
  const mobileOpen = useUIStore((s) => s.mobileSidebarOpen);
  const setMobileOpen = useUIStore((s) => s.setMobileSidebarOpen);
  const { isRtl } = useTranslation();

  return (
    <div className="relative flex min-h-screen w-full bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 mesh-bg opacity-60" aria-hidden />
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,transparent_60%,var(--color-background)_100%)]"
        aria-hidden
      />

      <div className="relative z-10 hidden lg:block">
        <div className="sticky top-0 h-screen">
          <AppSidebar />
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side={isRtl ? "right" : "left"}
          className={cn(
            "w-[280px] bg-sidebar/95 p-0",
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
