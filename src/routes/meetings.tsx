import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Video,
  Plus,
  Filter,
  FileText,
  Trash2,
  CheckCircle2,
  Clock,
  Users,
  Search,
  Sparkles,
  Loader2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { UploadRecordingDialog } from "@/components/common/upload-recording-dialog";
import { api, Meeting } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/meetings")({
  head: () => ({ meta: [{ title: "Meetings · MeetMind AI" }] }),
  component: MeetingsPage,
});

function MeetingsPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const { data: meetings = [], isLoading } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api.getMeetings(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMeeting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      toast.success("Meeting deleted successfully");
      setSelectedMeeting(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete meeting");
    },
  });

  const filteredMeetings = meetings.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.hostName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.summary?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title={t("allMeetings")}
        description="Every recorded meeting with AI summaries, action items and searchable transcripts."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setStatusFilter((prev) =>
                  prev === "ALL" ? "Completed" : prev === "Completed" ? "Processing" : "ALL",
                )
              }
              className="cursor-pointer"
            >
              <Filter className="h-4 w-4" /> Filter: {statusFilter}
            </Button>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="gradient-primary text-primary-foreground shadow-glow cursor-pointer"
            >
              <Plus className="h-4 w-4" /> {t("newRecording")}
            </Button>
          </div>
        }
      />

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchMeetings")}
          className="pl-9 bg-background/50"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredMeetings.length === 0 ? (
        <EmptyState
          icon={Video}
          title={searchQuery ? "No matching meetings found" : "No meetings recorded yet"}
          description="Start a recording now or upload an audio file to generate an intelligent summary and action items."
          action={{
            label: "Record meeting",
            onClick: () => setCreateDialogOpen(true),
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredMeetings.map((m) => (
            <GlassCard key={m.id} className="flex flex-col justify-between p-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl gradient-primary text-primary-foreground">
                    <Video className="h-4 w-4" />
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      m.status === "Completed"
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-warning/30 bg-warning/10 text-warning"
                    }
                  >
                    {m.status}
                  </Badge>
                </div>

                <div className="mt-3 font-display text-base font-semibold tracking-tight">
                  {m.title}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{m.hostName}</span>
                  <span>·</span>
                  <span>{m.date}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {Math.round(m.durationSeconds / 60)}m
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {m.participantsCount}
                  </span>
                </div>

                {m.summary && (
                  <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{m.summary}</p>
                )}

                {m.topics && m.topics.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {m.topics.slice(0, 3).map((topic) => (
                      <span
                        key={topic}
                        className="rounded-md bg-secondary/70 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 flex gap-2 pt-2 border-t border-border/40">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedMeeting(m)}
                >
                  <FileText className="h-3.5 w-3.5" /> Summary
                </Button>
                <Link to="/transcript" className="flex-1">
                  <Button size="sm" className="w-full">
                    Transcript
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="px-2 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete "${m.title}"?`)) {
                      deleteMutation.mutate(m.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Meeting Detail & Summary Dialog */}
      <Dialog open={!!selectedMeeting} onOpenChange={(open) => !open && setSelectedMeeting(null)}>
        {selectedMeeting && (
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2 text-xs text-primary font-medium uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" /> Meeting Intelligence Summary
              </div>
              <DialogTitle className="font-display text-xl">{selectedMeeting.title}</DialogTitle>
              <DialogDescription>
                Hosted by {selectedMeeting.hostName} · {selectedMeeting.date} ·{" "}
                {Math.round(selectedMeeting.durationSeconds / 60)} minutes
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 pt-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Executive Summary
                </h4>
                <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 text-sm leading-relaxed text-foreground">
                  {selectedMeeting.summary || "No summary available for this meeting."}
                </div>
              </div>

              {selectedMeeting.keyPoints && selectedMeeting.keyPoints.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Key Discussion Points
                  </h4>
                  <ul className="space-y-1.5">
                    {selectedMeeting.keyPoints.map((kp, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-foreground/90">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
                        <span>{kp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedMeeting.decisions && selectedMeeting.decisions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Agreed Decisions
                  </h4>
                  <div className="space-y-2">
                    {selectedMeeting.decisions.map((dec, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 rounded-lg border border-success/20 bg-success/5 p-2.5 text-xs text-foreground/90"
                      >
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        <span>{dec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-border/40">
                <Link to="/transcript">
                  <Button variant="outline" size="sm">
                    View Full Transcript ({selectedMeeting.segments.length} segments)
                  </Button>
                </Link>
                <Button size="sm" onClick={() => setSelectedMeeting(null)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Upload Recording Dialog */}
      <UploadRecordingDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultType="meeting"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["meetings"] });
        }}
      />
    </div>
  );
}
