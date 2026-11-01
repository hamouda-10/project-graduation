import { Calendar, Video, GraduationCap, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/common/glass-card";
import { SectionHeader } from "@/components/common/section-header";
import { api, CalendarEvent } from "@/lib/api-client";

export function UpcomingList() {
  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["calendar-events"],
    queryFn: () => api.getCalendarEvents(),
  });

  return (
    <GlassCard className="p-5">
      <SectionHeader title="Upcoming" description="Scheduled sessions & deadlines" />
      {isLoading ? (
        <div className="flex h-28 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No upcoming events scheduled.
        </div>
      ) : (
        <ul className="space-y-2">
          {events.slice(0, 4).map((u) => {
            const Icon = u.kind === "meeting" ? Video : GraduationCap;
            return (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg gradient-primary text-primary-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {u.date} · {u.time}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
