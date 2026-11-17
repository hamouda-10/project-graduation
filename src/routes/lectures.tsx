import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const LecturesView = lazy(() => import("@/views/lectures-view"));

export const Route = createFileRoute("/lectures")({
  head: () => ({ meta: [{ title: "المحاضرات التعليمية · MeetMind AI" }] }),
  component: LecturesRouteComponent,
});

function LecturesRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Academic Courses"
          title="المحاضرات التعليمية الذكية"
          description="تسجيل وتحليل المحاضرات الجامعية وتوليد الملخصات الأكاديمية والبطاقات التعليمية"
          cardsCount={4}
        />
      }
    >
      <LecturesView />
    </Suspense>
  );
}
