import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Shell } from "@/components/layout/shell";
import { CommandPalette } from "@/components/command/command-palette";
import { FloatingAIAssistant } from "@/components/ai/floating-ai-assistant";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/error/error-state";
import { UploadRecordingDialog } from "@/components/common/upload-recording-dialog";
import { THEME_STORAGE_KEY, useUIStore } from "@/stores/ui-store";

function NotFoundComponent() {
  return (
    <ErrorState
      code="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
    />
  );
}

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){document.documentElement.classList.add("dark");}})();`;

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    try {
      if (import.meta.env.DEV) {
        const loc = router.state.location;
        console.groupCollapsed(
          `[Root ErrorComponent] ${error?.name ?? "Error"}: ${error?.message ?? String(error)}`,
        );
        console.error("name:", error?.name);
        console.error("message:", error?.message);
        console.error("stack:", error?.stack);
        console.error("route:", loc?.pathname, "search:", loc?.searchStr);
        console.error(
          "matches:",
          router.state.matches.map((m) => m.routeId),
        );
        console.error("original error:", error);
        console.groupEnd();
      } else {
        console.error(error);
      }
      reportLovableError(error, { boundary: "tanstack_root_error_component" });
    } catch {
      // diagnostics must never throw
    }
  }, [error, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. Try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MeetMind AI — Intelligent Meeting & Lecture Assistant" },
      {
        name: "description",
        content:
          "MeetMind AI records meetings and lectures, then generates summaries, action items, quizzes, flashcards, mind maps and reports — automatically.",
      },
      { name: "author", content: "MeetMind AI" },
      { name: "theme-color", content: "#050505" },
      { property: "og:title", content: "MeetMind AI — Intelligent Meeting & Lecture Assistant" },
      {
        property: "og:description",
        content:
          "MeetMind AI records meetings and lectures, then generates summaries, action items, quizzes, flashcards, mind maps and reports — automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@MeetMindAI" },
      { name: "twitter:title", content: "MeetMind AI — Intelligent Meeting & Lecture Assistant" },
      {
        name: "twitter:description",
        content:
          "MeetMind AI records meetings and lectures, then generates summaries, action items, quizzes, flashcards, mind maps and reports — automatically.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/aceb3af3-80b6-443f-9379-35855fdcdc46/id-preview-d8378394--38b00574-db81-4aa7-9abb-6747e45279cb.lovable.app-1783989468136.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/aceb3af3-80b6-443f-9379-35855fdcdc46/id-preview-d8378394--38b00574-db81-4aa7-9abb-6747e45279cb.lovable.app-1783989468136.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const hydrateTheme = useUIStore((s) => s.hydrateTheme);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const language = useUIStore((s) => s.language);
  const recordingDialogOpen = useUIStore((s) => s.recordingDialogOpen);
  const setRecordingDialogOpen = useUIStore((s) => s.setRecordingDialogOpen);

  useEffect(() => {
    hydrateTheme();
    if (typeof document !== "undefined") {
      document.documentElement.dir = language === "AR" ? "rtl" : "ltr";
      document.documentElement.lang = language === "AR" ? "ar" : "en";
    }
  }, [hydrateTheme, language]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <Shell>
          <Outlet />
        </Shell>
        <CommandPalette />
        <NotificationCenter />
        <FloatingAIAssistant />
        <Toaster position="top-right" richColors theme={resolvedTheme} />
        <UploadRecordingDialog
          open={recordingDialogOpen}
          onOpenChange={setRecordingDialogOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["meetings"] });
            queryClient.invalidateQueries({ queryKey: ["lectures"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
            queryClient.invalidateQueries({ queryKey: ["transcripts"] });
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
