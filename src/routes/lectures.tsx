import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap,
  Plus,
  BookOpen,
  BrainCircuit,
  Layers,
  Trash2,
  Clock,
  Sparkles,
  Search,
  Loader2,
  AlertTriangle,
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
import { api, Lecture } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/lectures")({
  head: () => ({ meta: [{ title: "Lectures · MeetMind AI" }] }),
  component: LecturesPage,
});

function LecturesPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);

  const { data: lectures = [], isLoading } = useQuery<Lecture[]>({
    queryKey: ["lectures"],
    queryFn: () => api.getLectures(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteLecture(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      toast.success("Lecture deleted successfully");
      setSelectedLecture(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete lecture");
    },
  });

  const filteredLectures = lectures.filter(
    (l) =>
      l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.instructorName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academic"
        title={t("allLectures")}
        description="Recorded lectures with AI-structured study notes, definitions, exam tips, and revision decks."
        actions={
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="gradient-primary text-primary-foreground shadow-glow cursor-pointer"
          >
            <Plus className="h-4 w-4" /> {t("newRecording")}
          </Button>
        }
      />

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchLectures")}
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
      ) : filteredLectures.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={searchQuery ? "No matching lectures found" : "No lectures recorded yet"}
          description="Upload an audio recording or lecture file to automatically generate structured study notes, flashcards, and quizzes."
          action={{
            label: "Record lecture",
            onClick: () => setCreateDialogOpen(true),
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredLectures.map((l) => (
            <GlassCard key={l.id} className="flex flex-col justify-between p-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-border/60 bg-background/60 text-accent-cyan">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-primary/10 text-primary font-mono text-xs"
                  >
                    {l.courseCode}
                  </Badge>
                </div>

                <div className="mt-3 font-display text-base font-semibold tracking-tight">
                  {l.title}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{l.instructorName}</span>
                  <span>·</span>
                  <span>{l.date}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {Math.round(l.durationSeconds / 60)}m
                  </span>
                </div>

                {l.studyNotes && (
                  <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{l.studyNotes}</p>
                )}

                {l.keyConcepts && l.keyConcepts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {l.keyConcepts.slice(0, 2).map((c, idx) => (
                      <span
                        key={idx}
                        className="rounded-md bg-secondary/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80"
                      >
                        {c.term}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-2 pt-2 border-t border-border/40">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setSelectedLecture(l)}
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Study notes
                  </Button>
                  <Link to="/quiz" className="flex-1">
                    <Button size="sm" variant="secondary" className="w-full">
                      <BrainCircuit className="h-3.5 w-3.5" /> Quiz
                    </Button>
                  </Link>
                </div>
                <div className="flex gap-2">
                  <Link to="/flashcards" className="flex-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Layers className="h-3.5 w-3.5" /> Flashcards
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete "${l.title}"?`)) {
                        deleteMutation.mutate(l.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Lecture Study Notes Dialog */}
      <Dialog open={!!selectedLecture} onOpenChange={(open) => !open && setSelectedLecture(null)}>
        {selectedLecture && (
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2 text-xs text-primary font-medium uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" /> AI Lecture Notes & Concepts
              </div>
              <DialogTitle className="font-display text-xl">
                {selectedLecture.courseCode} — {selectedLecture.title}
              </DialogTitle>
              <DialogDescription>
                Instructor: {selectedLecture.instructorName} · {selectedLecture.date}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 pt-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Comprehensive Notes
                </h4>
                <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 text-sm leading-relaxed whitespace-pre-line text-foreground">
                  {selectedLecture.studyNotes || "Notes are being processed..."}
                </div>
              </div>

              {selectedLecture.keyConcepts && selectedLecture.keyConcepts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Key Definitions & Terminology
                  </h4>
                  <div className="space-y-2">
                    {selectedLecture.keyConcepts.map((kc, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-border/60 bg-background/50 p-3 text-xs"
                      >
                        <div className="font-semibold text-primary">{kc.term}</div>
                        <div className="mt-0.5 text-muted-foreground leading-relaxed">
                          {kc.definition}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedLecture.examHighlights && selectedLecture.examHighlights.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-warning mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Exam Focus & Midterm Highlights
                  </h4>
                  <div className="space-y-2">
                    {selectedLecture.examHighlights.map((eh, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning-foreground leading-relaxed"
                      >
                        {eh}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-border/40">
                <div className="flex gap-2">
                  <Link to="/quiz">
                    <Button variant="outline" size="sm">
                      <BrainCircuit className="h-3.5 w-3.5" /> Practice Quiz
                    </Button>
                  </Link>
                  <Link to="/flashcards">
                    <Button variant="outline" size="sm">
                      <Layers className="h-3.5 w-3.5" /> Flashcards
                    </Button>
                  </Link>
                </div>
                <Button size="sm" onClick={() => setSelectedLecture(null)}>
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
        defaultType="lecture"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["lectures"] });
        }}
      />
    </div>
  );
}
