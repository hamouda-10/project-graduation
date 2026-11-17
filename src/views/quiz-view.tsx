import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  Loader2,
  HelpCircle,
  Clock,
  History,
  PenTool,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, Quiz, QuizAttempt } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

function parseTimestampToSeconds(ts?: string): number {
  if (!ts) return 0;
  const match = ts.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  if (match[3]) {
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
  }
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

export default function QuizView() {
  const queryClient = useQueryClient();
  const { t, language } = useTranslation();
  const isArabic = language.toUpperCase() === "AR";

  const [selectedQuizId, setSelectedQuizId] = useState<string>("");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string | number>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [submittedResults, setSubmittedResults] = useState<{
    scorePercent: number;
    correctCount: number;
    totalQuestions: number;
    results: {
      questionId: string;
      type: string;
      userAnswer: string | number;
      chosenOptionIndex?: number;
      correctOptionIndex: number;
      correctAnswerText?: string;
      isCorrect: boolean;
      explanation: string;
    }[];
  } | null>(null);

  const { data: quizzes = [], isLoading } = useQuery<Quiz[]>({
    queryKey: ["quizzes"],
    queryFn: () => api.getQuizzes(),
  });

  const activeQuiz = quizzes.find((q) => q.id === selectedQuizId) || quizzes[0] || null;

  const { data: attempts = [] } = useQuery<QuizAttempt[]>({
    queryKey: ["quizAttempts", activeQuiz?.id],
    queryFn: () => (activeQuiz ? api.getQuizAttempts(activeQuiz.id) : Promise.resolve([])),
    enabled: !!activeQuiz,
  });

  const submitMutation = useMutation({
    mutationFn: (answers: Record<string, string | number>) =>
      api.submitQuizAttempt(activeQuiz!.id, answers),
    onSuccess: (data) => {
      setSubmittedResults(data);
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["quizAttempts", activeQuiz?.id] });
      toast.success(
        isArabic
          ? `اكتمل الاختبار! النتيجة: ${data.scorePercent}% (${data.correctCount}/${data.totalQuestions})`
          : `Quiz completed! Score: ${data.scorePercent}%`,
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "فشل تسليم الإجابات");
    },
  });

  const generateNewQuizMutation = useMutation({
    mutationFn: async () => {
      if (!activeQuiz?.lectureId) {
        throw new Error("لا توجد محاضرة مرتبطة بهذا الاختبار لتوليد نموذج جديد");
      }
      const avoidTitles = activeQuiz.questions.map((q) => q.question);
      return api.generateNewQuiz(activeQuiz.lectureId, {
        avoidQuestionTitles: avoidTitles,
        variant: (activeQuiz.attemptsCount || 0) + 2,
      });
    },
    onSuccess: (newQuiz) => {
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      setSelectedQuizId(newQuiz.id);
      handleReset();
      toast.success(
        isArabic
          ? "تم توليد نموذج اختبار جديد بأسئلة مختلفة!"
          : "Generated new quiz with fresh questions!",
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "تعذر توليد الاختبار الجديد");
    },
  });

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    if (submittedResults) return;
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleTextAnswer = (questionId: string, text: string) => {
    if (submittedResults) return;
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: text }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuiz) return;
    submitMutation.mutate(selectedAnswers);
  };

  const handleReset = () => {
    setSelectedAnswers({});
    setSubmittedResults(null);
  };

  const getDifficultyBadge = (difficulty?: string) => {
    switch (difficulty) {
      case "easy":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
            سهل · Easy
          </Badge>
        );
      case "hard":
        return (
          <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px]">
            متقدم · Hard
          </Badge>
        );
      default:
        return (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
            متوسط · Medium
          </Badge>
        );
    }
  };

  const getTypeLabel = (type?: string) => {
    switch (type) {
      case "true_false":
        return "صح / خطأ";
      case "fill_in_the_blank":
        return "أكمل الفراغ";
      case "short_answer":
        return "سؤال مقالي واستنتاجي";
      default:
        return "اختيار من متعدد (MCQ)";
    }
  };

  return (
    <div className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <PageHeader
        eyebrow="التقييم الأكاديمي الذكي · Assessment"
        title={isArabic ? "مولد الاختبارات والتقييم الذكي" : "AI Quiz & Self-Assessment"}
        description={
          isArabic
            ? "اختبارات استنتاجية وتقييمية شاملة تغطي كامل محاور المحاضرة (MCQ، صح وخطأ، أكمل الفراغ، وأسئلة مقالية) مع تصحيح تلقائي وتوثيق استدلالي."
            : "Comprehensive AI quizzes covering the entire lecture (MCQ, True/False, Fill in blanks, Short answers) with automatic grading and source explanations."
        }
        actions={
          activeQuiz ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHistoryOpen(true)}
                className="cursor-pointer gap-1.5"
              >
                <History className="h-4 w-4 text-muted-foreground" />
                <span>سجل المحاولات ({attempts.length})</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => generateNewQuizMutation.mutate()}
                disabled={generateNewQuizMutation.isPending}
                className="border-primary/40 text-primary hover:bg-primary/10 gap-1.5 cursor-pointer shadow-glow"
              >
                {generateNewQuizMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>توليد أسئلة جديدة مختلفة</span>
              </Button>
            </div>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : quizzes.length === 0 ? (
        <EmptyState
          icon={BrainCircuit}
          title={isArabic ? "لا توجد اختبارات منشأة بعد" : "No quizzes generated yet"}
          description={
            isArabic
              ? "قم بتسجيل أو رفع محاضرة أو اجتماع لإنشاء اختبار تقييمي شامل تلقائياً."
              : "Record or upload a lecture to automatically generate practice quizzes."
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Quiz Selector */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground ml-1">اختر المحاضرة:</span>
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
                    : "border-border/60"
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
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {activeQuiz.courseCode && (
                        <Badge
                          variant="outline"
                          className="font-mono text-xs border-primary/40 text-primary bg-primary/10"
                        >
                          {activeQuiz.courseCode}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {activeQuiz.questions.length} أسئلة متنوعة · {activeQuiz.attemptsCount || 0}{" "}
                        محاولات مسجلة
                      </span>
                    </div>
                    <h2 className="font-display text-xl font-semibold tracking-tight">
                      {activeQuiz.title}
                    </h2>
                  </div>

                  {submittedResults ? (
                    <div className="flex items-center gap-3 bg-secondary/50 px-4 py-2 rounded-xl border border-border">
                      <Trophy className="h-6 w-6 text-primary" />
                      <div>
                        <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                          {isArabic ? "النتيجة النهائية" : "Final Score"}
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
                        className="mr-2 cursor-pointer gap-1.5"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />{" "}
                        {isArabic ? "إعادة الاختبار" : "Retake Quiz"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      disabled={submitMutation.isPending}
                      className="gradient-primary text-primary-foreground shadow-glow cursor-pointer"
                    >
                      {submitMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin ml-1.5" />
                      ) : (
                        <Check className="h-4 w-4 ml-1.5" />
                      )}
                      {isArabic ? "تسليم وحساب النتيجة" : "Submit Quiz"}
                    </Button>
                  )}
                </div>
              </GlassCard>

              {/* Questions List */}
              <div className="space-y-5">
                {activeQuiz.questions.map((q, qIndex) => {
                  const resultItem = submittedResults?.results.find((r) => r.questionId === q.id);
                  const qType = q.type || "multiple_choice";
                  const chosenOption = selectedAnswers[q.id];

                  return (
                    <GlassCard key={q.id} className="p-5 sm:p-6 space-y-4">
                      {/* Question Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="font-medium text-sm sm:text-base text-foreground flex items-start gap-3">
                          <span className="grid h-7 w-7 place-items-center rounded-xl bg-primary/15 text-primary text-xs font-bold shrink-0 mt-0.5 border border-primary/30">
                            {qIndex + 1}
                          </span>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-[10px] bg-secondary/60">
                                {getTypeLabel(qType)}
                              </Badge>
                              {getDifficultyBadge(q.difficulty)}
                              {(q.timestampRef || q.sectionRef) && (
                                <a
                                  href={`/transcript?id=${encodeURIComponent(activeQuiz.lectureId || "")}&time=${encodeURIComponent(parseTimestampToSeconds(q.timestampRef || q.sectionRef))}`}
                                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-mono bg-primary/10 px-2 py-0.5 rounded border border-primary/25 cursor-pointer"
                                  title={
                                    isArabic
                                      ? "الاستماع للمقطع الصوتي الذي استند إليه السؤال في التفريغ"
                                      : "Listen to audio segment for this question"
                                  }
                                >
                                  <Clock className="h-3 w-3" />
                                  <span>{q.timestampRef || q.sectionRef}</span>
                                </a>
                              )}
                            </div>
                            <span className="leading-relaxed font-semibold">{q.question}</span>
                          </div>
                        </div>

                        {resultItem && (
                          <div className="shrink-0">
                            {resultItem.isCorrect ? (
                              <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400 gap-1 px-2.5 py-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> صحيح · Correct
                              </Badge>
                            ) : (
                              <Badge className="border-destructive/30 bg-destructive/15 text-destructive gap-1 px-2.5 py-1">
                                <XCircle className="h-3.5 w-3.5" /> إجابة تحتاج مراجعة
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Question Interaction Based on Type */}
                      {qType === "multiple_choice" && (
                        <div className="space-y-2 pt-1">
                          {q.options.map((opt, optIdx) => {
                            const isSelected = chosenOption === optIdx;
                            let optionClass = "border-border/60 hover:bg-secondary/40";

                            if (submittedResults) {
                              if (optIdx === q.correctOptionIndex) {
                                optionClass =
                                  "border-emerald-500 bg-emerald-500/10 text-emerald-400 font-medium";
                              } else if (isSelected && !resultItem?.isCorrect) {
                                optionClass =
                                  "border-destructive bg-destructive/10 text-destructive line-through";
                              }
                            } else if (isSelected) {
                              optionClass =
                                "border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary/40";
                            }

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                onClick={() => handleSelectOption(q.id, optIdx)}
                                className={`w-full text-right p-3 rounded-xl border text-xs sm:text-sm transition-all flex items-center gap-3 cursor-pointer ${optionClass}`}
                              >
                                <span className="h-5 w-5 rounded-full border border-current flex items-center justify-center text-[10px] shrink-0">
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <span className="flex-1">{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {qType === "true_false" && (
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          {q.options.slice(0, 2).map((opt, optIdx) => {
                            const isSelected = chosenOption === optIdx;
                            let btnVariant = "border-border/60 hover:bg-secondary/40";

                            if (submittedResults) {
                              if (optIdx === q.correctOptionIndex) {
                                btnVariant =
                                  "border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold";
                              } else if (isSelected && !resultItem?.isCorrect) {
                                btnVariant =
                                  "border-destructive bg-destructive/10 text-destructive line-through";
                              }
                            } else if (isSelected) {
                              btnVariant =
                                "border-primary bg-primary/15 text-foreground font-bold ring-1 ring-primary";
                            }

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                onClick={() => handleSelectOption(q.id, optIdx)}
                                className={`p-3.5 rounded-xl border text-center text-sm font-semibold transition-all cursor-pointer ${btnVariant}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {qType === "fill_in_the_blank" && (
                        <div className="space-y-2 pt-1">
                          <Input
                            placeholder="اكتب الإجابة أو المصطلح الناقص هنا..."
                            value={selectedAnswers[q.id] || ""}
                            onChange={(e) => handleTextAnswer(q.id, e.target.value)}
                            disabled={!!submittedResults}
                            className="bg-secondary/40 border-border/80 focus:border-primary text-sm"
                          />
                          {submittedResults && (
                            <div className="text-xs text-muted-foreground flex items-center gap-2 pt-1">
                              <span className="font-semibold text-primary">الإجابة المعتمدة:</span>
                              <span className="font-mono bg-secondary px-2 py-0.5 rounded border border-border">
                                {q.correctAnswerText || q.options[q.correctOptionIndex || 0]}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {qType === "short_answer" && (
                        <div className="space-y-2 pt-1">
                          <Textarea
                            placeholder="اكتب استنتاجك أو إجابتك التحليلية استناداً إلى شرح المحاضر..."
                            value={selectedAnswers[q.id] || ""}
                            onChange={(e) => handleTextAnswer(q.id, e.target.value)}
                            disabled={!!submittedResults}
                            rows={3}
                            className="bg-secondary/40 border-border/80 focus:border-primary text-sm"
                          />
                          {submittedResults && (
                            <div className="p-3 rounded-xl bg-secondary/30 border border-border/60 text-xs space-y-1">
                              <div className="font-semibold text-primary flex items-center gap-1.5">
                                <PenTool className="h-3.5 w-3.5" /> نموذج الإجابة الأكاديمي:
                              </div>
                              <p className="text-foreground leading-relaxed">
                                {q.correctAnswerText || q.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Explanation (Revealed upon submission) */}
                      {resultItem && (
                        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs space-y-1">
                          <div className="font-semibold text-primary flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" /> التوثيق الاستدلالي من نص المحاضرة:
                          </div>
                          <div className="text-foreground/90 leading-relaxed">
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
                    className="gradient-primary text-primary-foreground shadow-glow cursor-pointer px-8"
                  >
                    {submitMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin ml-2" />
                    ) : (
                      <Check className="h-5 w-5 ml-2" />
                    )}
                    {isArabic ? "تسليم الاختبار وحساب الدرجة" : "Submit Quiz"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Attempts History Modal */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md" dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              سجل محاولات الاختبار السابق
            </DialogTitle>
            <DialogDescription>
              جميع درجات المحاولات المحفوظة بصورة دائمة في قاعدة البيانات.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-3 max-h-[60vh] overflow-y-auto">
            {attempts.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-6">
                لا توجد محاولات سابقة مسجلة لهذا الاختبار بعد.
              </p>
            ) : (
              attempts.map((att, idx) => (
                <div
                  key={att.id || idx}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-secondary/30 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-foreground">
                      المحاولة {attempts.length - idx}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(att.submittedAt).toLocaleString("ar-EG")}
                    </div>
                  </div>
                  <div className="text-left font-mono">
                    <span
                      className={`text-sm font-bold ${
                        att.scorePercent >= 70 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {att.scorePercent}%
                    </span>
                    <span className="text-[11px] text-muted-foreground mr-1.5">
                      ({att.correctCount}/{att.totalQuestions})
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
