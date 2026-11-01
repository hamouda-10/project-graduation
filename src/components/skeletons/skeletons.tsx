import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/common/glass-card";

export function SkeletonCard() {
  return (
    <GlassCard className="p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-4 h-2 w-full" />
    </GlassCard>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <GlassCard className="p-5">
      <Skeleton className="h-5 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export function SkeletonChart() {
  return (
    <GlassCard className="p-5">
      <Skeleton className="h-5 w-40" />
      <div className="mt-4 flex h-40 items-end gap-2">
        {[40, 70, 55, 90, 65, 80, 45].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-md" style={{ height: `${h}%` }} />
        ))}
      </div>
    </GlassCard>
  );
}

export function SkeletonSidebar() {
  return (
    <div className="hidden w-64 border-r border-border/60 bg-sidebar/60 p-4 lg:block">
      <Skeleton className="h-10 w-full" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
