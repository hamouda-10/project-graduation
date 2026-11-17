import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const QuizView = lazy(() => import("@/views/quiz-view"));

export const Route = createFileRoute("/quiz")({
  head: () => ({ meta: [{ title: "الاختبارات الذكية والتقييم الأكاديمي · MeetMind AI" }] }),
  component: QuizRouteComponent,
});

function QuizRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Evaluation & Testing"
          title="الاختبارات الذكية والتقييم الأكاديمي"
          description="توليد تلقائي للاختبارات التفاعلية مع التصحيح الفوري وتتبع التقدم"
          cardsCount={3}
        />
      }
    >
      <QuizView />
    </Suspense>
  );
}
