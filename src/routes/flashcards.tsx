import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const FlashcardsView = lazy(() => import("@/views/flashcards-view"));

export const Route = createFileRoute("/flashcards")({
  head: () => ({ meta: [{ title: "البطاقات التعليمية الذكية · MeetMind AI" }] }),
  component: FlashcardsRouteComponent,
});

function FlashcardsRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Active Recall"
          title="البطاقات التعليمية التفاعلية"
          description="توليد بطاقات المراجعة الذكية للتدريب على المفاهيم الأساسية وحفظ المصطلحات"
          cardsCount={2}
        />
      }
    >
      <FlashcardsView />
    </Suspense>
  );
}
