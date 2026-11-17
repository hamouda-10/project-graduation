import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const AIWorkspaceView = lazy(() => import("@/views/ai-workspace-view"));

export const Route = createFileRoute("/ai-workspace")({
  head: () => ({ meta: [{ title: "مساحة العمل الذكية · MeetMind AI" }] }),
  component: AIWorkspaceRouteComponent,
});

function AIWorkspaceRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Intelligence Hub"
          title="مساحة العمل الذكية"
          description="اسأل الذكاء الاصطناعي واطرح أسئلة موجهة وموثقة بمصادر المحاضرات والاجتماعات"
          cardsCount={3}
        />
      }
    >
      <AIWorkspaceView />
    </Suspense>
  );
}
