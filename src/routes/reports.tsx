import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const ReportsView = lazy(() => import("@/views/reports-view"));

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "التقارير والتصدير الذكي · MeetMind AI" }] }),
  component: ReportsRouteComponent,
});

function ReportsRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Intelligence Reports"
          title="التقارير والتصدير الشامل"
          description="توليد وتصدير تقارير الاجتماعات والمحاضرات بصيغ PDF و Excel و Markdown"
          cardsCount={3}
        />
      }
    >
      <ReportsView />
    </Suspense>
  );
}
