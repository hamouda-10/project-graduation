import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const AdminView = lazy(() => import("@/views/admin-view"));

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "لوحة التحكم الإدارية · MeetMind AI" }] }),
  component: AdminRouteComponent,
});

function AdminRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="System Administration"
          title="لوحة التحكم الإدارية والتهيئة"
          description="إدارة الخوادم، قاعدة البيانات، تراخيص المستخدمين وإعدادات الأمان المؤسسية"
          cardsCount={3}
        />
      }
    >
      <AdminView />
    </Suspense>
  );
}
