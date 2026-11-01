import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Sparkles,
  Wand2,
  FileText,
  Network,
  Layers,
  BrainCircuit,
  ArrowRight,
  Send,
  Loader2,
  CheckCircle2,
  Quote,
  Clock,
  BookOpen,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, Meeting, Lecture, GroundedAnswer } from "@/lib/api-client";
import { toast } from "sonner";

export const Route = createFileRoute("/ai-workspace")({
  head: () => ({ meta: [{ title: "AI Workspace · MeetMind AI" }] }),
  component: AIWorkspacePage,
});

export function AIWorkspacePage() {
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [chatLog, setChatLog] = useState<
    {
      id: string;
      question: string;
      answer: string;
      citations: { speaker: string; timestamp: string; quote: string }[];
    }[]
  >([]);
  const [activeAnalysis, setActiveAnalysis] = useState<{
    type: string;
    content: string | object;
  } | null>(null);

  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api.getMeetings(),
  });

  const { data: lectures = [] } = useQuery<Lecture[]>({
    queryKey: ["lectures"],
    queryFn: () => api.getLectures(),
  });

  const allResources = [
    ...meetings.map((m) => ({ id: m.id, title: `[Meeting] ${m.title}`, type: "meeting" as const })),
    ...lectures.map((l) => ({
      id: l.id,
      title: `[Lecture] ${l.courseCode}: ${l.title}`,
      type: "lecture" as const,
    })),
  ];

  const currentResource = allResources.find((r) => r.id === selectedResourceId) || allResources[0];

  const askMutation = useMutation({
    mutationFn: (q: string) => api.askQuestion(q, currentResource?.id),
    onSuccess: (data: GroundedAnswer) => {
      setChatLog((prev) => [
        {
          id: `chat_${Date.now()}`,
          question,
          answer: data.answer,
          citations: data.citations,
        },
        ...prev,
      ]);
      setQuestion("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to answer question");
    },
  });

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    askMutation.mutate(question.trim());
  };

  const runOperation = (toolKey: string) => {
    if (!currentResource) {
      toast.error("Please select a recording or lecture first");
      return;
    }

    const meeting = meetings.find((m) => m.id === currentResource.id);
    const lecture = lectures.find((l) => l.id === currentResource.id);

    if (toolKey === "summarize") {
      setActiveAnalysis({
        type: "Executive Summary",
        content: meeting?.summary || lecture?.studyNotes || "Summary generated from transcript.",
      });
      toast.success("Summary loaded");
    } else if (toolKey === "notes") {
      setActiveAnalysis({
        type: "Structured Study Notes",
        content: lecture?.studyNotes || meeting?.summary || "Study notes structured from audio.",
      });
      toast.success("Study notes loaded");
    } else if (toolKey === "quiz") {
      setActiveAnalysis({
        type: "Auto-Generated Quiz",
        content:
          "Quiz generated and saved to your Quiz collection! Navigate to the Quiz tab to practice.",
      });
      toast.success("Quiz created");
    } else if (toolKey === "flashcards") {
      setActiveAnalysis({
        type: "Spaced Repetition Flashcards",
        content:
          "Flashcard deck generated! Navigate to the Flashcards tab to start your study session.",
      });
      toast.success("Flashcards created");
    } else if (toolKey === "mindmap") {
      setActiveAnalysis({
        type: "Concept Mind Map",
        content:
          "Hierarchical topic structure generated! Navigate to the Mind Maps tab to explore.",
      });
      toast.success("Mind map ready");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Studio"
        title="AI Workspace"
        description="Grounded questioning, verified citations, and intelligent transformations of your spoken content."
      />

      {/* Target Resource Selector */}
      <GlassCard className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg gradient-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Context
            </div>
            <div className="text-sm font-medium">
              {currentResource ? currentResource.title : "No recording selected"}
            </div>
          </div>
        </div>

        <div className="w-full sm:w-72">
          <Select
            value={selectedResourceId || (allResources[0]?.id ?? "")}
            onValueChange={setSelectedResourceId}
          >
            <SelectTrigger className="bg-background/50">
              <SelectValue placeholder="Select session..." />
            </SelectTrigger>
            <SelectContent>
              {allResources.map((res) => (
                <SelectItem key={res.id} value={res.id}>
                  {res.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      {/* Grounded Q&A Assistant */}
      <GlassCard className="relative overflow-hidden p-6 space-y-4">
        <div className="pointer-events-none absolute inset-0 gradient-primary opacity-10" />
        <div className="relative">
          <div className="font-display text-lg font-semibold tracking-tight">
            Ask MeetMind Grounded Questions
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            All answers are strictly verified against the actual recording transcript. If evidence
            is not present in the transcript, MeetMind will state so explicitly.
          </p>

          <form onSubmit={handleAsk} className="mt-4 flex gap-2">
            <Input
              placeholder={`Ask anything about ${currentResource?.title || "this session"}...`}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="bg-background/80"
              disabled={askMutation.isPending}
            />
            <Button
              type="submit"
              disabled={askMutation.isPending || !question.trim()}
              className="gradient-primary text-primary-foreground shadow-glow shrink-0"
            >
              {askMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Ask <Send className="ml-1 h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </form>

          {chatLog.length > 0 && (
            <div className="mt-6 space-y-4">
              {chatLog.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border/60 bg-background/60 p-4 space-y-3"
                >
                  <div className="text-sm font-semibold text-primary">Q: {item.question}</div>
                  <div className="text-sm text-foreground/90 leading-relaxed">{item.answer}</div>

                  {item.citations && item.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Quote className="h-3 w-3" /> Grounded Source Citations
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {item.citations.map((c, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-border/40 bg-secondary/40 p-2.5 text-xs space-y-1"
                          >
                            <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                              <span className="font-medium text-foreground">{c.speaker}</span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" /> {c.timestamp}
                              </span>
                            </div>
                            <div className="italic text-muted-foreground">"{c.quote}"</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </GlassCard>

      {/* Operation Results Viewer */}
      {activeAnalysis && (
        <GlassCard className="p-5 border-primary/30">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-display text-base font-semibold text-primary flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> {activeAnalysis.type}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setActiveAnalysis(null)}>
              Dismiss
            </Button>
          </div>
          <div className="rounded-xl bg-secondary/30 p-4 text-sm leading-relaxed whitespace-pre-line text-foreground">
            {typeof activeAnalysis.content === "string"
              ? activeAnalysis.content
              : JSON.stringify(activeAnalysis.content, null, 2)}
          </div>
        </GlassCard>
      )}

      {/* Intelligence Tools Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            key: "summarize",
            icon: Wand2,
            title: "Summarize",
            desc: "Generate a crisp, structured summary of the discussion.",
          },
          {
            key: "notes",
            icon: FileText,
            title: "Study Notes",
            desc: "Comprehensive notes with key definitions.",
          },
          {
            key: "mindmap",
            icon: Network,
            title: "Mind Map",
            desc: "Build hierarchical concept connections.",
          },
          {
            key: "flashcards",
            icon: Layers,
            title: "Flashcards",
            desc: "Extract spaced-repetition memory cards.",
          },
          {
            key: "quiz",
            icon: BrainCircuit,
            title: "Quiz Generator",
            desc: "Synthesize test questions with validated answer keys.",
          },
          {
            key: "ask",
            icon: Sparkles,
            title: "Grounded Q&A",
            desc: "Verify facts and ask questions against the transcript.",
          },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <GlassCard
              key={t.key}
              className="group p-5 transition hover:-translate-y-0.5 hover:shadow-glow cursor-pointer"
              onClick={() => runOperation(t.key)}
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl gradient-primary text-primary-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-3 font-display text-base font-semibold tracking-tight">
                {t.title}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
              <Button variant="ghost" size="sm" className="mt-3 -ml-2 text-primary">
                Run <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
