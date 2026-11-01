import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api, Flashcard } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/flashcards")({
  head: () => ({ meta: [{ title: "Flashcards · MeetMind AI" }] }),
  component: FlashcardsPage,
});

function FlashcardsPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [selectedDeckId, setSelectedDeckId] = useState<string>("ALL");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const { data: flashcards = [], isLoading } = useQuery<Flashcard[]>({
    queryKey: ["flashcards"],
    queryFn: () => api.getFlashcards(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Flashcard> }) =>
      api.updateFlashcard(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    },
  });

  const decks = Array.from(
    new Map(flashcards.map((f) => [f.deckId, { id: f.deckId, title: f.deckTitle }])).values(),
  );

  const currentDeckCards =
    selectedDeckId === "ALL" ? flashcards : flashcards.filter((f) => f.deckId === selectedDeckId);

  const activeCard = currentDeckCards[currentIndex] || null;

  const masteredCount = currentDeckCards.filter((c) => c.mastered).length;
  const progressPercent =
    currentDeckCards.length > 0 ? Math.round((masteredCount / currentDeckCards.length) * 100) : 0;

  const handleNext = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % currentDeckCards.length);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + currentDeckCards.length) % currentDeckCards.length);
  };

  const handleToggleMastered = (mastered: boolean) => {
    if (!activeCard) return;
    updateMutation.mutate({
      id: activeCard.id,
      updates: { mastered, reviewCount: activeCard.reviewCount + 1 },
    });
    toast.success(mastered ? "Marked as Mastered!" : "Marked for Review");
    handleNext();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Spaced Repetition"
        title={t("flashcardsTitle")}
        description={t("flashcardsSubtitle")}
      />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : flashcards.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No flashcards generated yet"
          description="Record or upload a lecture to automatically extract spaced-repetition flashcards."
        />
      ) : (
        <div className="space-y-6">
          {/* Deck Filters */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedDeckId === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedDeckId("ALL");
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
              className={
                selectedDeckId === "ALL"
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : ""
              }
            >
              All Decks ({flashcards.length})
            </Button>
            {decks.map((deck) => (
              <Button
                key={deck.id}
                variant={selectedDeckId === deck.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectedDeckId(deck.id);
                  setCurrentIndex(0);
                  setIsFlipped(false);
                }}
                className={
                  selectedDeckId === deck.id
                    ? "gradient-primary text-primary-foreground shadow-glow"
                    : ""
                }
              >
                {deck.title}
              </Button>
            ))}
          </div>

          {/* Deck Progress Bar */}
          <GlassCard className="p-4 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Card {currentIndex + 1} of {currentDeckCards.length}
              </span>
              <span>
                Mastery: {masteredCount} / {currentDeckCards.length} ({progressPercent}%)
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </GlassCard>

          {/* Interactive 3D Flip Card */}
          {activeCard && (
            <div className="flex flex-col items-center">
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className="w-full max-w-xl h-72 sm:h-80 cursor-pointer perspective-1000 select-none"
              >
                <div
                  className={`relative w-full h-full rounded-2xl border border-border/80 p-8 shadow-elegant transition-transform duration-500 transform-style-3d ${
                    isFlipped ? "rotate-y-180 bg-secondary/80" : "bg-card/90"
                  }`}
                  style={{
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  }}
                >
                  {/* Front View */}
                  {!isFlipped && (
                    <div className="flex flex-col justify-between h-full backface-hidden">
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[11px] font-mono">
                          {activeCard.deckTitle}
                        </Badge>
                        <span className="flex items-center gap-1 text-[11px]">
                          <RotateCw className="h-3 w-3" /> Click to flip
                        </span>
                      </div>

                      <div className="text-center font-display text-lg sm:text-xl font-medium text-foreground px-4">
                        {activeCard.front}
                      </div>

                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span className="text-[11px]">Reviews: {activeCard.reviewCount}</span>
                        {activeCard.mastered && (
                          <Badge
                            variant="secondary"
                            className="border-success/30 bg-success/15 text-success"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Mastered
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Back View */}
                  {isFlipped && (
                    <div
                      className="flex flex-col justify-between h-full backface-hidden"
                      style={{ transform: "rotateY(180deg)" }}
                    >
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 text-primary font-semibold">
                          <Sparkles className="h-3.5 w-3.5" /> Concept Answer
                        </div>
                        <span className="text-[11px]">Click to flip back</span>
                      </div>

                      <div className="text-center text-sm sm:text-base text-foreground/90 leading-relaxed px-4">
                        {activeCard.back}
                      </div>

                      <div className="text-center text-xs text-muted-foreground">
                        How well did you know this?
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Study Action Buttons */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button variant="outline" size="icon" onClick={handlePrev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  onClick={() => handleToggleMastered(false)}
                  className="text-warning hover:border-warning"
                >
                  <Clock className="h-4 w-4 mr-1.5" /> Review Later
                </Button>

                <Button
                  onClick={() => handleToggleMastered(true)}
                  className="gradient-primary text-primary-foreground shadow-glow"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mastered
                </Button>

                <Button variant="outline" size="icon" onClick={handleNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
