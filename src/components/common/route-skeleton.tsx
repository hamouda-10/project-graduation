import { GlassCard } from "@/components/common/glass-card";

interface RouteSkeletonProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  cardsCount?: number;
}

export function RouteSkeleton({ eyebrow, title, description, cardsCount = 3 }: RouteSkeletonProps) {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading page...">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          {eyebrow ? (
            <div className="h-4 w-28 rounded bg-primary/20" />
          ) : (
            <div className="h-3 w-20 rounded bg-muted/60" />
          )}
          <div className="h-8 w-64 max-w-full rounded-md bg-muted/80" />
          {description && <div className="h-4 w-96 max-w-full rounded bg-muted/40" />}
        </div>
        <div className="flex items-center gap-2 pt-2 md:pt-0">
          <div className="h-9 w-24 rounded-md bg-muted/60" />
          <div className="h-9 w-32 rounded-md bg-primary/30" />
        </div>
      </div>

      {/* Metrics Row Skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <GlassCard key={i} className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-muted/60" />
              <div className="h-8 w-8 rounded-lg bg-primary/10" />
            </div>
            <div className="h-7 w-24 rounded bg-muted/80" />
            <div className="h-2.5 w-16 rounded bg-muted/40" />
          </GlassCard>
        ))}
      </div>

      {/* Content Area Skeleton */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-5 w-40 rounded bg-muted/70" />
              <div className="h-8 w-24 rounded bg-muted/50" />
            </div>
            <div className="space-y-3 pt-2">
              {Array.from({ length: cardsCount }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-border/40 p-4 bg-muted/20"
                >
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-3/5 rounded bg-muted/70" />
                    <div className="h-3 w-2/5 rounded bg-muted/40" />
                  </div>
                  <div className="h-8 w-20 rounded-md bg-muted/50" />
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <div className="space-y-4">
          <GlassCard className="p-6 space-y-4">
            <div className="h-5 w-32 rounded bg-muted/70" />
            <div className="space-y-3 pt-2">
              <div className="h-20 rounded-xl bg-muted/20 border border-border/40 p-3" />
              <div className="h-20 rounded-xl bg-muted/20 border border-border/40 p-3" />
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
