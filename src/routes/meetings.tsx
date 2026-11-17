import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const MeetingsView = lazy(() => import("@/views/meetings-view"));

export const Route = createFileRoute("/meetings")({
  head: () => ({ meta: [{ title: "اجتماعات العمل · MeetMind AI" }] }),
  component: MeetingsRouteComponent,
});

function MeetingsRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Workspace Meetings"
          title="اجتماعات العمل الذكية"
          description="تسجيل وإدارة وتلخيص الاجتماعات واستخراج المهام ومتابعة الحضور"
          cardsCount={4}
        />
      }
    >
      <MeetingsView />
    </Suspense>
  );
}
