import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteSkeleton } from "@/components/common/route-skeleton";

const SearchView = lazy(() => import("@/views/search-view"));

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "البحث الشامل الذكي · MeetMind AI" }] }),
  component: SearchRouteComponent,
});

function SearchRouteComponent() {
  return (
    <Suspense
      fallback={
        <RouteSkeleton
          eyebrow="Global Search"
          title="البحث الذكي الموحد"
          description="بحث فوري في نصوص التفريغ والاجتماعات والمحاضرات والمهام"
          cardsCount={3}
        />
      }
    >
      <SearchView />
    </Suspense>
  );
}
