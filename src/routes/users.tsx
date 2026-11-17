import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const UsersView = lazy(() => import("@/views/users-view"));

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "فريق العمل والأعضاء · MeetMind AI" }] }),
  component: UsersRouteComponent,
});

function UsersRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Team & Permissions"
          title="فريق العمل والمستخدمين"
          description="إدارة حسابات الفريق والصلاحيات والدعوات"
          cardsCount={3}
        />
      }
    >
      <UsersView />
    </Suspense>
  );
}
