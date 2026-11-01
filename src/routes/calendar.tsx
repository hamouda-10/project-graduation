import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/page-header";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import { UpcomingList } from "@/components/dashboard/upcoming-list";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar · MeetMind AI" }] }),
  component: () => (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Calendar"
        description="Meetings, lectures and AI events."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <CalendarWidget />
        <UpcomingList />
      </div>
    </div>
  ),
});
