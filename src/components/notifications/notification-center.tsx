import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCheck, Sparkles, MessageSquare, FileText, AtSign, BarChart3 } from "lucide-react";
import { NOTIFICATIONS_GROUPED } from "@/lib/mock-data";
import { useUIStore } from "@/stores/ui-store";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  n1: Sparkles,
  n2: FileText,
  n3: AtSign,
  n4: MessageSquare,
  n5: BarChart3,
};

export function NotificationCenter() {
  const open = useUIStore((s) => s.notificationsOpen);
  const setOpen = useUIStore((s) => s.setNotificationsOpen);
  const unread = NOTIFICATIONS_GROUPED.flatMap((g) => g.items).filter((i) => i.unread).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="w-full max-w-md border-l border-border/60 bg-background/90 p-0 backdrop-blur-xl sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle className="font-display text-lg">Notifications</SheetTitle>
              <SheetDescription className="text-xs">
                {unread > 0 ? `${unread} unread updates` : "You're all caught up"}
              </SheetDescription>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-84px)]">
          <div className="space-y-6 p-5">
            {NOTIFICATIONS_GROUPED.map((group) => (
              <section key={group.label}>
                <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {group.label}
                </div>
                <div className="space-y-2">
                  {group.items.map((n) => {
                    const Icon = ICONS[n.id] ?? Sparkles;
                    return (
                      <button
                        key={n.id}
                        className="group relative w-full overflow-hidden rounded-xl border border-border/60 bg-card/70 p-3.5 text-left shadow-elegant transition hover:border-primary/40"
                      >
                        {n.unread && (
                          <span className="absolute right-3 top-3 h-2 w-2 rounded-full gradient-primary" />
                        )}
                        <div className="flex items-start gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/60">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-sm font-medium">{n.title}</div>
                              <div className="shrink-0 text-[11px] text-muted-foreground">
                                {n.time}
                              </div>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {n.body}
                            </p>
                            {n.unread && (
                              <Badge
                                variant="secondary"
                                className="mt-2 h-5 rounded-full border-primary/30 bg-primary/10 px-2 text-[10px] text-primary"
                              >
                                New
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
