import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const AnalyticsView = lazy(() => import("@/views/analytics-view"));

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "التحليلات والإحصاءات · MeetMind AI" }] }),
  component: AnalyticsRouteComponent,
});

function AnalyticsRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Insights & Telemetry"
          title="التحليلات الذكية وإحصاءات الأداء"
          description="رؤى تفصيلية حول الاجتماعات المسجلة والمحاضرات ومعدلات إنجاز المهام وساعات الاستماع"
          cardsCount={3}
        />
      }
    >
      <AnalyticsView />
    </Suspense>
  );
}
