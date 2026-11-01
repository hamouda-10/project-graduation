import { useQuery } from "@tanstack/react-query";
import { Sparkles, CheckSquare, GraduationCap, Video } from "lucide-react";
import { GlassCard } from "@/components/common/glass-card";
import { SectionHeader } from "@/components/common/section-header";
import { api, Meeting, Lecture } from "@/lib/api-client";

export function AIInsights() {
  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api.getMeetings(),
  });

  const { data: lectures = [] } = useQuery<Lecture[]>({
    queryKey: ["lectures"],
    queryFn: () => api.getLectures(),
  });

  const insights: { id: string; title: string; icon: typeof Sparkles }[] = [];

  if (meetings.length > 0) {
    const latestMeeting = meetings[0];
    insights.push({
      id: "ins_1",
      title: `تم توثيق وتفريغ اجتماع "${latestMeeting.title}" بنجاح بالعربية.`,
      icon: Video,
    });
  }

  if (lectures.length > 0) {
    const latestLecture = lectures[0];
    insights.push({
      id: "ins_2",
      title: `محاضرة ${latestLecture.courseCode} — ${latestLecture.title} جاهزة للمراجعة والاختبار.`,
      icon: GraduationCap,
    });
  }

  const completedCount =
    meetings.filter((m) => m.status === "Completed").length +
    lectures.filter((l) => l.status === "Completed").length;
  if (completedCount > 0) {
    insights.push({
      id: "ins_3",
      title: `إجمالي الجلسات المكتملة بالتفريغ والترجمة الذكية: ${completedCount} جلسات.`,
      icon: CheckSquare,
    });
  }

  return (
    <GlassCard className="relative overflow-hidden p-5 text-right">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full gradient-primary opacity-25 blur-3xl" />
      <div className="relative space-y-3">
        <SectionHeader
          title="رؤى MeetMind الذكية"
          description="استنتاجات وتنبيهات الأداء المباشرة"
          action={<Sparkles className="h-4 w-4 text-primary" />}
        />
        {insights.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            لا توجد رؤى اصطناعية بعد. قم ببدء أول تسجيل صوتي لاستخلاص الرؤى مباشرة.
          </div>
        ) : (
          <ul className="space-y-2">
            {insights.map((i) => {
              const Icon = i.icon;
              return (
                <li
                  key={i.id}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 text-xs text-foreground leading-relaxed font-medium">
                    {i.title}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}
