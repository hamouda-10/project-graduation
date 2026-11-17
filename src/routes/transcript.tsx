import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const TranscriptView = lazy(() => import("@/views/transcript-view"));

export const Route = createFileRoute("/transcript")({
  head: () => ({ meta: [{ title: "التفريغ الصوتي الذكي · MeetMind AI" }] }),
  component: TranscriptRouteComponent,
});

function TranscriptRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="AI Intelligence"
          title="التفريغ الصوتي الذكي"
          description="تفريغ دقيق فائق السرعة مع المزامنة الصوتية الكاملة وتحديد المتحدثين"
          cardsCount={4}
        />
      }
    >
      <TranscriptView />
    </Suspense>
  );
}
