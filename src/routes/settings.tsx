import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const SettingsView = lazy(() => import("@/views/settings-view"));

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "الإعدادات والتفضيلات · MeetMind AI" }] }),
  component: SettingsRouteComponent,
});

function SettingsRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Preferences & Configuration"
          title="الإعدادات والتفضيلات الشخصية"
          description="تخصيص المظهر، التنبيهات، نماذج الذكاء الاصطناعي وإدارة البيانات"
          cardsCount={2}
        />
      }
    >
      <SettingsView />
    </Suspense>
  );
}
