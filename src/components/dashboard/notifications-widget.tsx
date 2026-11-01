import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/common/glass-card";
import { SectionHeader } from "@/components/common/section-header";
import { Button } from "@/components/ui/button";
import { Sparkles, Bell } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { api, NotificationItem } from "@/lib/api-client";

export function NotificationsWidget() {
  const openPanel = useUIStore((s) => s.setNotificationsOpen);
  const { data: notifications = [] } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
  });

  const recent = notifications.slice(0, 3);

  return (
    <GlassCard className="p-5">
      <SectionHeader
        title="الإشعارات والتنبيهات"
        action={
          <Button
            variant="ghost"
            size="sm"
            className="text-xs cursor-pointer"
            onClick={() => openPanel(true)}
          >
            عرض الكل
          </Button>
        }
      />
      {recent.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
          <Bell className="h-5 w-5 text-muted-foreground/60" />
          <span>لا توجد إشعارات جديدة.</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {recent.map((n) => (
            <li
              key={n.id}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5 text-right"
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/60 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium text-foreground">{n.title}</div>
                  <div className="shrink-0 text-[10px] font-mono text-muted-foreground">
                    {n.createdAt
                      ? new Date(n.createdAt).toLocaleTimeString("ar-EG", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </div>
                </div>
                <p className="line-clamp-1 text-[11px] text-muted-foreground mt-0.5">{n.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
