import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const MindMapsView = lazy(() => import("@/views/mind-maps-view"));

export const Route = createFileRoute("/mind-maps")({
  head: () => ({ meta: [{ title: "الخرائط الذهنية · MeetMind AI" }] }),
  component: MindMapsRouteComponent,
});

function MindMapsRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Knowledge Graphs"
          title="الخرائط الذهنية الذكية"
          description="عرض شجري تفاعلي للمفاهيم والموضوعات الرئيسية المستخلصة من التسجيلات"
          cardsCount={2}
        />
      }
    >
      <MindMapsView />
    </Suspense>
  );
}
