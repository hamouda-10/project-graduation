import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Sparkles, Loader2, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, NotificationItem } from "@/lib/api-client";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications · MeetMind AI" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read");
    },
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Notifications"
        description="Every intelligence update, action item alert, and study reminder from MeetMind AI."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending || notifications.every((n) => n.read)}
          >
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all as read
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex h-36 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : notifications.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">
          No notifications in your inbox.
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <GlassCard
              key={n.id}
              className={`flex items-start gap-3 p-4 transition-all ${
                !n.read ? "border-primary/40 bg-secondary/40" : "bg-background/40"
              }`}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg gradient-primary text-primary-foreground">
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span>{n.title}</span>
                    {!n.read && (
                      <Badge className="gradient-primary text-[10px] text-primary-foreground h-5 px-1.5">
                        New
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(n.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>

                <div className="mt-2 flex items-center gap-3">
                  {n.targetUrl && (
                    <Link to={n.targetUrl}>
                      <span className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1">
                        Open details <ArrowRight className="h-3 w-3" />
                      </span>
                    </Link>
                  )}
                  {!n.read && (
                    <button
                      onClick={() => markOneMutation.mutate(n.id)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
