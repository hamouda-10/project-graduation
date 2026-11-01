import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clock, Users, Sparkles, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  WeeklyAnalytics,
  MeetingAnalytics,
  LectureAnalytics,
} from "@/components/dashboard/analytics-charts";
import { api } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics · MeetMind AI" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { t } = useTranslation();
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => api.getDashboardMetrics(),
  });

  const { data: reports } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.getReports(),
  });

  const totalRecordings =
    reports?.totalRecordings ?? (metrics ? metrics.totalMeetings + metrics.totalLectures : 52);
  const audioHours = reports?.totalAudioHours ?? 38;
  const taskCompletionRate = reports?.taskCompletionRate ?? 78;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title={t("analyticsTitle")}
        description={t("analyticsSubtitle")}
      />
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total Recordings"
            value={String(totalRecordings)}
            delta={{ value: "+18%", direction: "up" }}
            icon={BarChart3}
            tone="primary"
          />
          <StatCard
            label="Audio Processed"
            value={`${audioHours}h`}
            delta={{ value: "+6h", direction: "up" }}
            icon={Clock}
            tone="cyan"
          />
          <StatCard
            label="Task Completion"
            value={`${taskCompletionRate}%`}
            delta={{ value: "+9%", direction: "up" }}
            icon={Users}
            tone="pink"
          />
          <StatCard
            label="AI Outputs"
            value="1,204"
            delta={{ value: "+22%", direction: "up" }}
            icon={Sparkles}
            tone="amber"
          />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <WeeklyAnalytics />
        <MeetingAnalytics />
      </div>
      <LectureAnalytics />
    </div>
  );
}
