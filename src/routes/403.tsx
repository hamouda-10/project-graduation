import { createFileRoute } from "@tanstack/react-router";
import { ErrorState } from "@/components/error/error-state";

export const Route = createFileRoute("/403")({
  head: () => ({
    meta: [{ title: "Forbidden · MeetMind AI" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ErrorState
      code="403"
      title="Access denied"
      description="You don't have permission to view this page. Ask your workspace admin for access."
    />
  ),
});
