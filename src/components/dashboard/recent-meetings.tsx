import { Video, MoreHorizontal, Users, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/common/glass-card";
import { SectionHeader } from "@/components/common/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, Meeting } from "@/lib/api-client";

export function RecentMeetings() {
  const { data: meetings = [], isLoading } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api.getMeetings(),
  });

  return (
    <GlassCard className="p-5">
      <SectionHeader
        title="Recent meetings"
        description="Recorded and summarized by MeetMind AI"
        action={
          <Link to="/meetings">
            <Button variant="ghost" size="sm" className="text-xs">
              View all
            </Button>
          </Link>
        }
      />
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No meetings recorded yet. Click "New meeting" to record or upload.
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {meetings.slice(0, 4).map((m) => (
            <li key={m.id} className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/60 bg-background/60 text-primary">
                <Video className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.title}</div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{m.hostName}</span>
                  <span>·</span>
                  <span>{m.date}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {m.participantsCount}
                  </span>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={
                  m.status === "Completed"
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-warning/30 bg-warning/10 text-warning"
                }
              >
                {m.status}
              </Badge>
              <div className="hidden text-xs text-muted-foreground md:block">
                {Math.round(m.durationSeconds / 60)}m
              </div>
              <Link to="/meetings">
                <Button size="icon" variant="ghost" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
