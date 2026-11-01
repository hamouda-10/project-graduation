import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, Quiz } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/quiz")({
  head: () => ({ meta: [{ title: "Quiz Generator · MeetMind AI" }] }),
  component: QuizPage,
});

function QuizPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [selectedQuizId, setSelectedQuizId] = useState<string>("");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [submittedResults, setSubmittedResults] = useState<{
    scorePercent: number;
    correctCount: number;
    totalQuestions: number;
    results: {
      questionId: string;
      chosenOptionIndex: number;
      correctOptionIndex: number;
      isCorrect: boolean;
      explanation: string;
    }[];
  } | null>(null);

  const { data: quizzes = [], isLoading } = useQuery<Quiz[]>({
    queryKey: ["quizzes"],
    queryFn: () => api.getQuizzes(),
  });

  const activeQuiz = quizzes.find((q) => q.id === selectedQuizId) || quizzes[0] || null;

  const submitMutation = useMutation({
    mutationFn: (answers: Record<string, number>) => api.submitQuizAttempt(activeQuiz!.id, answers),
    onSuccess: (data) => {
      setSubmittedResults(data);
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      toast.success(`Quiz completed! Score: ${data.scorePercent}%`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    },
  });

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    if (submittedResults) return; // Locked once submitted
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuiz) return;
    if (Object.keys(selectedAnswers).length < activeQuiz.questions.length) {
      if (!confirm("You have unanswered questions. Are you sure you want to submit?")) {
        return;
      }
    }
    submitMutation.mutate(selectedAnswers);
  };

  const handleReset = () => {
    setSelectedAnswers({});
    setSubmittedResults(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Self-Assessment"
        title={t("quizTitle")}
        description={t("quizSubtitle")}
      />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : quizzes.length === 0 ? (
        <EmptyState
          icon={BrainCircuit}
          title="No quizzes generated yet"
          description="Record or upload a lecture to automatically generate practice quizzes."
        />
      ) : (
        <div className="space-y-6">
          {/* Deck / Quiz Selector */}
          <div className="flex flex-wrap gap-2">
            {quizzes.map((q) => (
              <Button
                key={q.id}
                variant={activeQuiz?.id === q.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectedQuizId(q.id);
                  handleReset();
                }}
                className={`cursor-pointer ${
                  activeQuiz?.id === q.id
                    ? "gradient-primary text-primary-foreground shadow-glow"
                    : ""
                }`}
              >
                {q.courseCode ? `${q.courseCode} · ` : ""}
                {q.title}
              </Button>
            ))}
          </div>

          {activeQuiz && (
            <div className="space-y-6">
              {/* Quiz Header Banner */}
              <GlassCard className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {activeQuiz.courseCode && (
                        <Badge variant="outline" className="font-mono text-xs">
                          {activeQuiz.courseCode}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {activeQuiz.questions.length} questions · {activeQuiz.attemptsCount}{" "}
                        attempts
                      </span>
                    </div>
                    <h2 className="font-display text-xl font-semibold">{activeQuiz.title}</h2>
                  </div>

                  {submittedResults ? (
                    <div className="flex items-center gap-3 bg-secondary/50 px-4 py-2 rounded-xl border border-border">
                      <Trophy className="h-6 w-6 text-primary" />
                      <div>
                        <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                          {t("score")}
                        </div>
                        <div className="text-lg font-bold text-foreground">
                          {submittedResults.scorePercent}% ({submittedResults.correctCount}/
                          {submittedResults.totalQuestions})
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleReset}
                        className="ml-2 cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> {t("retakeQuiz")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      disabled={submitMutation.isPending}
                      className="gradient-primary text-primary-foreground shadow-glow cursor-pointer"
                    >
                      {submitMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t("submitQuiz")
                      )}
                    </Button>
                  )}
                </div>
              </GlassCard>

              {/* Questions List */}
              <div className="space-y-4">
                {activeQuiz.questions.map((q, qIndex) => {
                  const resultItem = submittedResults?.results.find((r) => r.questionId === q.id);
                  const chosenOption = selectedAnswers[q.id];

                  return (
                    <GlassCard key={q.id} className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-medium text-sm text-foreground flex items-center gap-2">
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-xs font-semibold">
                            {qIndex + 1}
                          </span>
                          <span>{q.question}</span>
                        </div>

                        {resultItem &&
                          (resultItem.isCorrect ? (
                            <Badge
                              variant="secondary"
                              className="border-success/30 bg-success/15 text-success"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Correct
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="border-destructive/30 bg-destructive/15 text-destructive"
                            >
                              <XCircle className="h-3 w-3 mr-1" /> Incorrect
                            </Badge>
                          ))}
                      </div>

                      {/* Options */}
                      <div className="space-y-2 pt-1">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = chosenOption === optIdx;
                          let optionClass = "border-border/60 hover:bg-secondary/40";

                          if (submittedResults) {
                            if (optIdx === q.correctOptionIndex) {
                              optionClass = "border-success bg-success/10 text-success font-medium";
                            } else if (isSelected && !resultItem?.isCorrect) {
                              optionClass =
                                "border-destructive bg-destructive/10 text-destructive line-through";
                            }
                          } else if (isSelected) {
                            optionClass =
                              "border-primary bg-primary/10 text-foreground font-medium";
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => handleSelectOption(q.id, optIdx)}
                              className={`w-full text-left p-3 rounded-xl border text-xs sm:text-sm transition-all flex items-center gap-3 cursor-pointer ${optionClass}`}
                            >
                              <span className="h-5 w-5 rounded-full border border-current flex items-center justify-center text-[10px] shrink-0">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span className="flex-1">{opt}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation (Shown only after submission) */}
                      {resultItem && (
                        <div className="mt-3 rounded-lg border border-border/50 bg-secondary/30 p-3 text-xs space-y-1">
                          <div className="font-semibold text-primary flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3" /> Grounded Source Explanation:
                          </div>
                          <div className="text-muted-foreground leading-relaxed">
                            {resultItem.explanation}
                          </div>
                        </div>
                      )}
                    </GlassCard>
                  );
                })}
              </div>

              {!submittedResults && (
                <div className="flex justify-end pt-2">
                  <Button
                    size="lg"
                    onClick={handleSubmit}
                    disabled={submitMutation.isPending}
                    className="gradient-primary text-primary-foreground shadow-glow"
                  >
                    Submit Quiz Answers
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
