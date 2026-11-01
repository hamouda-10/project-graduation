import { GraduationCap, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/common/glass-card";
import { SectionHeader } from "@/components/common/section-header";
import { Button } from "@/components/ui/button";
import { api, Lecture } from "@/lib/api-client";

export function RecentLectures() {
  const { data: lectures = [], isLoading } = useQuery<Lecture[]>({
    queryKey: ["lectures"],
    queryFn: () => api.getLectures(),
  });

  return (
    <GlassCard className="p-5">
      <SectionHeader
        title="Recent lectures"
        description="Notes, quizzes and flashcards ready"
        action={
          <Link to="/lectures">
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
      ) : lectures.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No lectures recorded yet. Start a recording or upload one.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {lectures.slice(0, 3).map((l) => (
            <li
              key={l.id}
              className="relative overflow-hidden rounded-xl border border-border/60 bg-background/40 p-3"
            >
              <div className="pointer-events-none absolute inset-y-0 left-0 w-1 gradient-primary" />
              <div className="flex items-start gap-3 pl-2">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/60 text-accent-cyan">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{l.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="rounded-md bg-accent/40 px-1.5 py-0.5 font-medium text-foreground/80">
                      {l.courseCode}
                    </span>
                    <span>{l.instructorName}</span>
                    <span>·</span>
                    <span>{l.date}</span>
                  </div>
                </div>
                <div className="hidden text-xs text-muted-foreground sm:block">
                  {Math.round(l.durationSeconds / 60)}m
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
