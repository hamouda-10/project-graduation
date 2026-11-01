import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/common/glass-card";
import { SectionHeader } from "@/components/common/section-header";
import { api, DashboardTrends } from "@/lib/api-client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 12,
  boxShadow: "var(--shadow-elegant)",
};

const DEFAULT_WEEKLY = [
  { day: "Mon", meetings: 4, lectures: 2 },
  { day: "Tue", meetings: 6, lectures: 3 },
  { day: "Wed", meetings: 5, lectures: 4 },
  { day: "Thu", meetings: 8, lectures: 3 },
  { day: "Fri", meetings: 7, lectures: 5 },
  { day: "Sat", meetings: 2, lectures: 1 },
  { day: "Sun", meetings: 1, lectures: 0 },
];

const DEFAULT_MEETING_TREND = [
  { m: "W1", value: 24 },
  { m: "W2", value: 32 },
  { m: "W3", value: 28 },
  { m: "W4", value: 41 },
  { m: "W5", value: 46 },
  { m: "W6", value: 52 },
  { m: "W7", value: 49 },
  { m: "W8", value: 58 },
];

const DEFAULT_LECTURE_TREND = [
  { m: "W1", value: 10 },
  { m: "W2", value: 14 },
  { m: "W3", value: 18 },
  { m: "W4", value: 16 },
  { m: "W5", value: 22 },
  { m: "W6", value: 28 },
  { m: "W7", value: 26 },
  { m: "W8", value: 33 },
];

export function WeeklyAnalytics() {
  const { data: trends } = useQuery<DashboardTrends>({
    queryKey: ["dashboard-trends"],
    queryFn: () => api.getDashboardTrends(),
  });

  const weeklyData = trends?.weekly || DEFAULT_WEEKLY;

  return (
    <GlassCard className="p-5">
      <SectionHeader title="Weekly analytics" description="Meetings & lectures this week" />
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyData} barGap={4} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={26}
            />
            <Tooltip
              cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
              contentStyle={tooltipStyle}
            />
            <Bar dataKey="meetings" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="lectures" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

export function MeetingAnalytics() {
  const { data: trends } = useQuery<DashboardTrends>({
    queryKey: ["dashboard-trends"],
    queryFn: () => api.getDashboardTrends(),
  });

  const trendData = trends?.meetingTrend || DEFAULT_MEETING_TREND;

  return (
    <GlassCard className="p-5">
      <SectionHeader title="Meeting trend" description="Last 8 weeks" />
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="m1" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="m"
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={26}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-chart-1)"
              strokeWidth={2.4}
              fill="url(#m1)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

export function LectureAnalytics() {
  return (
    <GlassCard className="p-5">
      <SectionHeader title="Lecture trend" description="Last 8 weeks" />
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={DEFAULT_LECTURE_TREND}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="m"
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="var(--color-muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={26}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-chart-2)"
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
