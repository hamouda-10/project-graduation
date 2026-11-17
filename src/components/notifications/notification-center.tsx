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
import { CheckCheck, Sparkles, MessageSquare, FileText, Bell, BarChart3 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api, type NotificationItem } from "@/lib/api-client";
import { useUIStore } from "@/stores/ui-store";
import type { LucideIcon } from "lucide-react";

const TYPE_ICONS: Record<string, LucideIcon> = {
  summary: Sparkles,
  transcript: FileText,
  task: MessageSquare,
  report: BarChart3,
};

export function NotificationCenter() {
  const open = useUIStore((s) => s.notificationsOpen);
  const setOpen = useUIStore((s) => s.setNotificationsOpen);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [] } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unread = notifications.filter((n) => !n.read).length;

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
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={unread === 0 || markAllMutation.isPending}
              onClick={() => markAllMutation.mutate()}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-84px)]">
          <div className="space-y-3 p-5">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm font-medium">No notifications yet</p>
                <p className="text-xs mt-1">
                  Updates from real audio processing and analyses will appear here.
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] ?? Sparkles;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (!n.read) markReadMutation.mutate(n.id);
                      if (n.targetUrl) {
                        setOpen(false);
                        navigate({ to: n.targetUrl });
                      }
                    }}
                    className="group relative w-full overflow-hidden rounded-xl border border-border/60 bg-card/70 p-3.5 text-left shadow-elegant transition hover:border-primary/40 cursor-pointer"
                  >
                    {!n.read && (
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
                            {new Date(n.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.body}
                        </p>
                        {!n.read && (
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
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
