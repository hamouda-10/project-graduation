import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  Download,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Video,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports & Exports · MeetMind AI" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { t } = useTranslation();
  const [filterType, setFilterType] = useState<"ALL" | "MEETINGS" | "LECTURES">("ALL");

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.getReports(),
  });

  const handleDownloadCsv = () => {
    window.location.href = "/api/v1/reports/export";
    toast.success("Downloading CSV report...");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence Reports"
        title={t("reportsTitle")}
        description={t("reportsSubtitle")}
        actions={
          <Button
            onClick={handleDownloadCsv}
            className="gradient-primary text-primary-foreground shadow-glow cursor-pointer"
          >
            <Download className="h-4 w-4" /> {t("exportCsv")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !reports ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No reporting data available.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Key Metrics Overview */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <GlassCard className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Recordings
              </div>
              <div className="mt-2 text-2xl font-bold font-display text-foreground">
                {reports.totalRecordings}
              </div>
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <Video className="h-3 w-3 text-primary" /> Verified sessions
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Audio Processed
              </div>
              <div className="mt-2 text-2xl font-bold font-display text-foreground">
                {reports.totalAudioHours} hrs
              </div>
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 text-primary" /> Normalized via FFmpeg
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Decisions Documented
              </div>
              <div className="mt-2 text-2xl font-bold font-display text-foreground">
                {reports.totalDecisions}
              </div>
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-success" /> Extracted by AI
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Task Completion Rate
              </div>
              <div className="mt-2 text-2xl font-bold font-display text-foreground">
                {reports.taskCompletionRate}%
              </div>
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <BarChart3 className="h-3 w-3 text-primary" /> Verified follow-through
              </div>
            </GlassCard>
          </div>

          {/* Breakdown Filter */}
          <div className="flex gap-2">
            <Button
              variant={filterType === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType("ALL")}
              className={
                filterType === "ALL" ? "gradient-primary text-primary-foreground shadow-glow" : ""
              }
            >
              All Records
            </Button>
            <Button
              variant={filterType === "MEETINGS" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType("MEETINGS")}
              className={
                filterType === "MEETINGS"
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : ""
              }
            >
              Meetings Only
            </Button>
            <Button
              variant={filterType === "LECTURES" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType("LECTURES")}
              className={
                filterType === "LECTURES"
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : ""
              }
            >
              Lectures Only
            </Button>
          </div>

          {/* Sessions Table */}
          <GlassCard className="p-5">
            <div className="font-display text-base font-semibold mb-4">
              Detailed Recording Audit Log
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="pb-3 font-medium">Session Title</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Duration</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {(filterType === "ALL" || filterType === "MEETINGS") &&
                    reports.meetingsBreakdown.map((m, idx) => (
                      <tr key={`m_${idx}`} className="hover:bg-secondary/30">
                        <td className="py-3 font-medium text-foreground">{m.title}</td>
                        <td className="py-3">
                          <Badge variant="outline" className="text-[10px]">
                            Meeting
                          </Badge>
                        </td>
                        <td className="py-3 text-muted-foreground">{m.date}</td>
                        <td className="py-3 text-muted-foreground">{m.duration}</td>
                        <td className="py-3">
                          <Badge
                            variant="secondary"
                            className="border-success/30 bg-success/15 text-success text-[10px]"
                          >
                            {m.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}

                  {(filterType === "ALL" || filterType === "LECTURES") &&
                    reports.lecturesBreakdown.map((l, idx) => (
                      <tr key={`l_${idx}`} className="hover:bg-secondary/30">
                        <td className="py-3 font-medium text-foreground">
                          {l.course} — {l.title}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant="outline"
                            className="text-[10px] border-primary/30 text-primary"
                          >
                            Lecture
                          </Badge>
                        </td>
                        <td className="py-3 text-muted-foreground">{l.date}</td>
                        <td className="py-3 text-muted-foreground">{l.duration}</td>
                        <td className="py-3">
                          <Badge
                            variant="secondary"
                            className="border-success/30 bg-success/15 text-success text-[10px]"
                          >
                            {l.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
