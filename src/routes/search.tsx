import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search as SearchIcon,
  Video,
  GraduationCap,
  CheckSquare,
  FileText,
  Clock,
  Sparkles,
  Loader2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api-client";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Global Search · MeetMind AI" }] }),
  component: SearchPage,
});

function SearchPage() {
  const [searchTerm, setSearchTerm] = useState("roadmap");

  const { data: results, isLoading } = useQuery({
    queryKey: ["search", searchTerm],
    queryFn: () => api.search(searchTerm),
    enabled: searchTerm.length > 0,
  });

  const totalResults =
    (results?.meetings.length || 0) +
    (results?.lectures.length || 0) +
    (results?.tasks.length || 0) +
    (results?.transcripts.length || 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Global Search"
        description="Unified search across meetings, lectures, transcripts, and action items."
      />

      <GlassCard className="p-5">
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search meetings, lectures, transcript quotes, or tasks..."
            className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Quick queries / استعلامات سريعة:</span>
          {[
            "التوافق",
            "خارطة طريق",
            "رافت",
            "الكمون",
            "roadmap",
            "consensus",
            "latency",
            "onboarding",
          ].map((s) => (
            <button
              key={s}
              onClick={() => setSearchTerm(s)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                searchTerm === s
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </GlassCard>

      {isLoading ? (
        <div className="flex h-36 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : totalResults === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">
          No records found matching "{searchTerm}". Try another keyword or check another workspace.
        </GlassCard>
      ) : (
        <div className="space-y-6">
          {/* Transcript Matches */}
          {results?.transcripts && results.transcripts.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-sm font-semibold text-primary flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Spoken Transcript Matches (
                {results.transcripts.length})
              </h3>
              <div className="space-y-2">
                {results.transcripts.map((t, idx) => (
                  <GlassCard key={idx} className="p-4 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t.title}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {Math.floor(t.time / 60)}:
                        {(t.time % 60).toString().padStart(2, "0")}
                      </span>
                    </div>
                    <p className="text-sm italic text-foreground/90">"{t.quote}"</p>
                    <div className="pt-1">
                      <Link to="/transcript">
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs text-primary"
                        >
                          View in context →
                        </Button>
                      </Link>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {/* Meeting Matches */}
          {results?.meetings && results.meetings.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Video className="h-4 w-4 text-primary" /> Meetings ({results.meetings.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {results.meetings.map((m) => (
                  <GlassCard key={m.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="font-medium text-sm">{m.title}</div>
                      <Badge variant="outline" className="text-[10px]">
                        {m.date}
                      </Badge>
                    </div>
                    {m.summary && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{m.summary}</p>
                    )}
                    <div className="mt-3">
                      <Link to="/meetings">
                        <Button size="sm" variant="outline" className="w-full text-xs">
                          Open Meeting
                        </Button>
                      </Link>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {/* Lecture Matches */}
          {results?.lectures && results.lectures.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-1.5">
                <GraduationCap className="h-4 w-4 text-accent-cyan" /> Lectures (
                {results.lectures.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {results.lectures.map((l) => (
                  <GlassCard key={l.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="font-medium text-sm">
                        {l.courseCode} — {l.title}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {l.date}
                      </Badge>
                    </div>
                    {l.studyNotes && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                        {l.studyNotes}
                      </p>
                    )}
                    <div className="mt-3">
                      <Link to="/lectures">
                        <Button size="sm" variant="outline" className="w-full text-xs">
                          Open Lecture Notes
                        </Button>
                      </Link>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {/* Task Matches */}
          {results?.tasks && results.tasks.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-1.5">
                <CheckSquare className="h-4 w-4 text-success" /> Action Items (
                {results.tasks.length})
              </h3>
              <div className="space-y-2">
                {results.tasks.map((t) => (
                  <GlassCard key={t.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{t.title}</div>
                    <Badge variant="secondary" className="capitalize text-[10px]">
                      {t.priority}
                    </Badge>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
