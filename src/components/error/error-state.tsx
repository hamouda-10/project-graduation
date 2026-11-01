import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";

export function ErrorState({
  code,
  title,
  description,
}: {
  code: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0 mesh-bg opacity-70" />
      <div className="relative z-10 max-w-lg text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground backdrop-blur">
          Error · {code}
        </div>
        <h1 className="font-display text-7xl font-semibold tracking-tight sm:text-8xl">
          <span className="text-gradient">{code}</span>
        </h1>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button asChild size="lg">
            <Link to="/">
              <Home className="h-4 w-4" /> Back to Dashboard
            </Link>
          </Button>
          <Button variant="outline" size="lg" onClick={() => history.back()}>
            <ArrowLeft className="h-4 w-4" /> Go back
          </Button>
        </div>
      </div>
    </div>
  );
}
