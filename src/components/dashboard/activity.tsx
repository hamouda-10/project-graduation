import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/common/glass-card";
import { SectionHeader } from "@/components/common/section-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { api } from "@/lib/api-client";

export function ActivityWidget() {
  const { data: activity = [] } = useQuery({
    queryKey: ["dashboardActivity"],
    queryFn: () => api.getDashboardActivity(),
  });

  return (
    <GlassCard className="p-5">
      <SectionHeader title="النشاط السجل المباشر" />
      {activity.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          لا يوجد نشاط مسجل حتى الآن.
        </div>
      ) : (
        <ul className="space-y-3">
          {activity.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="gradient-primary text-[10px] font-semibold text-primary-foreground">
                  {a.who.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-sm text-right">
                <span className="font-medium text-foreground">{a.who}</span>{" "}
                <span className="text-muted-foreground">{a.what} في</span>{" "}
                <span className="font-medium text-foreground">{a.where}</span>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{a.when}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
