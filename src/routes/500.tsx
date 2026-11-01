import { createFileRoute } from "@tanstack/react-router";
import { ErrorState } from "@/components/error/error-state";

export const Route = createFileRoute("/500")({
  head: () => ({
    meta: [{ title: "Server error · MeetMind AI" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ErrorState
      code="500"
      title="Something went wrong"
      description="Our servers hit an unexpected error. Please try again in a moment."
    />
  ),
});
