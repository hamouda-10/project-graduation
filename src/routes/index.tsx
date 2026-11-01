import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Video, GraduationCap, Sparkles, Clock } from "lucide-react";

import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentMeetings } from "@/components/dashboard/recent-meetings";
import { RecentLectures } from "@/components/dashboard/recent-lectures";
import { UpcomingList } from "@/components/dashboard/upcoming-list";
import { AIInsights } from "@/components/dashboard/ai-insights";
import { ActivityWidget } from "@/components/dashboard/activity";
import { TasksWidget } from "@/components/dashboard/tasks-widget";
import { NotificationsWidget } from "@/components/dashboard/notifications-widget";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import {
  WeeklyAnalytics,
  MeetingAnalytics,
  LectureAnalytics,
} from "@/components/dashboard/analytics-charts";

import { useQuery } from "@tanstack/react-query";
import { api, DashboardMetrics } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

const EASE = [0.22, 1, 0.36, 1] as const;
const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE },
};

function DashboardPage() {
  const { t } = useTranslation();

  const { data: metrics } = useQuery<DashboardMetrics>({
    queryKey: ["dashboardMetrics"],
    queryFn: () => api.getDashboardMetrics(),
  });

  const totalMeetings = metrics?.totalMeetings ?? 0;
  const totalLectures = metrics?.totalLectures ?? 0;
  const totalActions = (metrics?.completedTasks ?? 0) + (metrics?.pendingTasks ?? 0);
  const totalAudioHours = metrics?.totalAudioHours ?? 0;

  return (
    <div className="space-y-6">
      <motion.div {...fade}>
        <WelcomeCard />
      </motion.div>

      <motion.div
        {...fade}
        transition={{ ...fade.transition, delay: 0.05 }}
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <StatCard
          label={t("meetingsThisWeek")}
          value={String(totalMeetings)}
          delta={{ value: totalMeetings > 0 ? `+${totalMeetings}` : "0", direction: "up" }}
          icon={Video}
          tone="primary"
        />
        <StatCard
          label={t("lecturesRecorded")}
          value={String(totalLectures)}
          delta={{ value: totalLectures > 0 ? `+${totalLectures}` : "0", direction: "up" }}
          icon={GraduationCap}
          tone="cyan"
        />
        <StatCard
          label={t("aiActionsExtracted")}
          value={String(totalActions)}
          delta={{ value: totalActions > 0 ? `+${totalActions}` : "0", direction: "up" }}
          icon={Sparkles}
          tone="pink"
        />
        <StatCard
          label={t("hoursSaved")}
          value={`${totalAudioHours}h`}
          delta={{ value: totalAudioHours > 0 ? `+${totalAudioHours}h` : "0h", direction: "up" }}
          icon={Clock}
          tone="amber"
        />
      </motion.div>

      <motion.div
        {...fade}
        transition={{ ...fade.transition, delay: 0.1 }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <div className="lg:col-span-2 space-y-4">
          <RecentMeetings />
          <RecentLectures />
        </div>
        <div className="space-y-4">
          <AIInsights />
          <UpcomingList />
          <NotificationsWidget />
        </div>
      </motion.div>

      <motion.div
        {...fade}
        transition={{ ...fade.transition, delay: 0.15 }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <div className="lg:col-span-2">
          <WeeklyAnalytics />
        </div>
        <TasksWidget />
      </motion.div>

      <motion.div
        {...fade}
        transition={{ ...fade.transition, delay: 0.2 }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <MeetingAnalytics />
        <LectureAnalytics />
        <ActivityWidget />
      </motion.div>

      <motion.div
        {...fade}
        transition={{ ...fade.transition, delay: 0.25 }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
          <CalendarWidget />
          <NotificationsWidget />
        </div>
        <UpcomingList />
      </motion.div>
    </div>
  );
}
