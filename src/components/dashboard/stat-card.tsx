import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { GlassCard } from "@/components/common/glass-card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  delta?: { value: string; direction: "up" | "down" };
  icon: LucideIcon;
  tone?: "primary" | "cyan" | "pink" | "amber";
}) {
  const toneMap = {
    primary: "from-primary/25 to-primary/0 text-primary",
    cyan: "from-accent-cyan/25 to-accent-cyan/0 text-accent-cyan",
    pink: "from-accent-pink/25 to-accent-pink/0 text-accent-pink",
    amber: "from-warning/25 to-warning/0 text-warning",
  } as const;
  return (
    <GlassCard className="relative overflow-hidden p-5">
      <div
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br blur-2xl",
          toneMap[tone],
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-1.5 font-display text-2xl font-semibold tracking-tight">{value}</div>
          {delta && (
            <div
              className={cn(
                "mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                delta.direction === "up"
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {delta.direction === "up" ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {delta.value}
            </div>
          )}
        </div>
        <div
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/60 bg-background/60",
            toneMap[tone].split(" ").pop(),
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </GlassCard>
  );
}
