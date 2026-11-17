import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, Meeting, Lecture, GroundedAnswer } from "@/lib/api-client";
import { toast } from "sonner";
import { AudioOrb3D } from "@/components/3d/audio-orb-3d";

export default function AIWorkspaceView() {
  const queryClient = useQueryClient();
  const questionInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [runningOp, setRunningOp] = useState<string | null>(null);
  const [chatLog, setChatLog] = useState<
    {
      id: string;
      question: string;
      answer: string;
      evidenceFound?: boolean;
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
    onSuccess: (data: GroundedAnswer, askedQuestion: string) => {
      const notMentioned =
        data.evidenceFound === false || data.answer.trim() === "Not mentioned in this recording.";
      setChatLog((prev) => [
        {
          id: `chat_${Date.now()}`,
          question: askedQuestion,
          answer: data.answer,
          evidenceFound: !notMentioned,
          citations: data.citations || [],
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

  const runOperation = async (toolKey: string) => {
    if (toolKey === "ask") {
      questionInputRef.current?.focus();
      return;
    }

    if (!currentResource) {
      toast.error("Please select a recording or lecture first");
      return;
    }

    setRunningOp(toolKey);
    try {
      if (toolKey === "summarize") {
        const res = await api.generateSummary(currentResource.id, currentResource.type);
        queryClient.invalidateQueries({ queryKey: ["meetings"] });
        queryClient.invalidateQueries({ queryKey: ["lectures"] });
        setActiveAnalysis({
          type: "Executive Summary",
          content: res.summary,
        });
        toast.success("Summary generated and saved");
      } else if (toolKey === "notes") {
        const res = await api.generateAnalysis(currentResource.id, currentResource.type);
        queryClient.invalidateQueries({ queryKey: ["meetings"] });
        queryClient.invalidateQueries({ queryKey: ["lectures"] });
        setActiveAnalysis({
          type: "Structured Analysis & Study Notes",
          content: res.analysis,
        });
        toast.success("Structured analysis generated and saved");
      } else if (toolKey === "quiz") {
        const res = await api.generateQuiz(currentResource.id, currentResource.type, 5);
        queryClient.invalidateQueries({ queryKey: ["quizzes"] });
        setActiveAnalysis({
          type: `Generated Quiz: ${res.quiz.title}`,
          content: res.quiz.questions.map((q, idx) => ({
            number: idx + 1,
            type: q.type,
            question: q.question,
            options: q.options,
            correctAnswerText: q.correctAnswerText,
            explanation: q.explanation,
          })),
        });
        toast.success(`Quiz with ${res.quiz.questions.length} grounded questions saved`);
      } else if (toolKey === "flashcards") {
        const cards = await api.generateFlashcards(
          currentResource.type === "lecture"
            ? { lectureId: currentResource.id }
            : { meetingId: currentResource.id },
        );
        queryClient.invalidateQueries({ queryKey: ["flashcards"] });
        setActiveAnalysis({
          type: `Generated Flashcards (${cards.length})`,
          content: cards.map((c) => ({ front: c.front, back: c.back })),
        });
        toast.success(`Generated ${cards.length} flashcards`);
      } else if (toolKey === "mindmap") {
        const map = await api.generateMindMap(
          currentResource.type === "lecture"
            ? { lectureId: currentResource.id }
            : { meetingId: currentResource.id },
        );
        queryClient.invalidateQueries({ queryKey: ["mindmaps"] });
        queryClient.invalidateQueries({ queryKey: ["mindMaps"] });
        setActiveAnalysis({
          type: `Concept Mind Map: ${map.title}`,
          content: map.rootNode,
        });
        toast.success("Mind map generated and saved");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI operation failed");
    } finally {
      setRunningOp(null);
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

      {/* Grounded Q&A Assistant with 3D Hologram */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
        <GlassCard className="relative overflow-hidden p-6 space-y-4 gold-card-animated-border shadow-2xl">
          <div className="pointer-events-none absolute inset-0 gradient-primary opacity-10" />
          <div className="relative">
            <div className="font-display text-lg font-semibold tracking-tight">
              Ask MeetMind Grounded Questions
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              All answers are strictly verified against the actual recording transcript. If evidence
              is not present in the transcript, MeetMind responds with &quot;Not mentioned in this
              recording.&quot;.
            </p>

            <form onSubmit={handleAsk} className="mt-4 flex gap-2">
              <Input
                ref={questionInputRef}
                placeholder={`Ask anything about ${currentResource?.title || "this session"}...`}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="bg-background/80"
                disabled={askMutation.isPending}
              />
              <Button
                type="submit"
                disabled={askMutation.isPending || !question.trim()}
                className="gradient-primary text-primary-foreground shadow-glow shrink-0 cursor-pointer"
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-primary">Q: {item.question}</div>
                      {item.evidenceFound === false ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] gap-1"
                        >
                          <AlertCircle className="h-3 w-3" /> Not in transcript
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] gap-1"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Grounded
                        </Badge>
                      )}
                    </div>
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
                              <div className="italic text-muted-foreground">
                                &quot;{c.quote}&quot;
                              </div>
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

        {/* 3D Holographic Visualizer */}
        <div className="space-y-4">
          <AudioOrb3D
            isPlaying={askMutation.isPending || runningOp !== null}
            size="md"
            title="المجسم الصوتي 3D · Neural Hologram"
            className="w-full shadow-2xl"
          />
          <div className="p-3.5 rounded-2xl border border-primary/20 bg-secondary/30 text-xs text-muted-foreground space-y-1.5">
            <div className="text-primary font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> محاكاة تفاعلية ثلاثية الأبعاد
            </div>
            <p className="leading-relaxed text-[11px]">
              يتفاعل المجسم الذهبي في الزمن الحقيقي مع حركة المؤشر ويحاكي ترددات الصوت المفرغة عبر
              Three.js وWebGL.
            </p>
          </div>
        </div>
      </div>

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
          <div className="rounded-xl bg-secondary/30 p-4 text-sm leading-relaxed whitespace-pre-line text-foreground overflow-x-auto">
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
          const isBusy = runningOp === t.key;
          return (
            <GlassCard
              key={t.key}
              className="group p-5 transition hover:-translate-y-0.5 hover:shadow-glow cursor-pointer"
              onClick={() => !runningOp && runOperation(t.key)}
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl gradient-primary text-primary-foreground">
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="mt-3 font-display text-base font-semibold tracking-tight">
                {t.title}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
              <Button
                variant="ghost"
                size="sm"
                disabled={isBusy}
                className="mt-3 -ml-2 text-primary"
              >
                {isBusy ? "Running..." : "Run"} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
