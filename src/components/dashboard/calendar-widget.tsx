import { GlassCard } from "@/components/common/glass-card";
import { SectionHeader } from "@/components/common/section-header";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";

export function CalendarWidget() {
  const [mounted, setMounted] = useState(false);
  const [date, setDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    setDate(new Date());
  }, []);

  return (
    <GlassCard className="p-5">
      <SectionHeader title="Calendar" description="Jump to a day" />
      <div className="flex justify-center min-h-[295px]" suppressHydrationWarning>
        {mounted ? (
          <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-xl" />
        ) : (
          <div className="flex h-[295px] w-full flex-col items-center justify-center p-4">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="grid grid-cols-7 gap-2.5">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-7 rounded-md" />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" /> Meetings
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-cyan" /> Lectures
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-pink" /> AI events
        </span>
      </div>
    </GlassCard>
  );
}
