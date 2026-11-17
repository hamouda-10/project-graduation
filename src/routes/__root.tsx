import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, lazy, Suspense, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Shell } from "@/components/layout/shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/error/error-state";
import { THEME_STORAGE_KEY, useUIStore } from "@/stores/ui-store";
import { useI18nStore } from "@/lib/i18n";

// Lazy-load heavy dialogs, floating tools and command palette to avoid blocking initial paint
const UploadRecordingDialog = lazy(() =>
  import("@/components/common/upload-recording-dialog").then((m) => ({
    default: m.UploadRecordingDialog,
  })),
);
const CommandPalette = lazy(() =>
  import("@/components/command/command-palette").then((m) => ({ default: m.CommandPalette })),
);
const FloatingAIAssistant = lazy(() =>
  import("@/components/ai/floating-ai-assistant").then((m) => ({ default: m.FloatingAIAssistant })),
);
const NotificationCenter = lazy(() =>
  import("@/components/notifications/notification-center").then((m) => ({
    default: m.NotificationCenter,
  })),
);

function NotFoundComponent() {
  return (
    <ErrorState
      code="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
    />
  );
}

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);var l=localStorage.getItem("meetmind-lang");if(l==="AR"){document.documentElement.dir="rtl";document.documentElement.lang="ar";}}catch(e){document.documentElement.classList.add("dark");}})();`;

function ErrorComponent({ error: rawError, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    try {
      const error = rawError instanceof Error ? rawError : new Error(String(rawError));
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
  }, [rawError, router]);

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
          "/assets/aistudio/_________________________________________________-1_a701650f.png",
      },
      {
        name: "twitter:image",
        content:
          "/assets/aistudio/_________________________________________________-1_a701650f.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "preload",
        as: "style",
        href: "https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Inter:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Inter:wght@400;500;600;700&display=swap",
        media: "print",
        onload: "this.media='all'",
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
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { useDataSync } from "@/lib/use-data-sync";

function DataSyncListener() {
  useDataSync();
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const hydrateTheme = useUIStore((s) => s.hydrateTheme);
  const hydrateUiLanguage = useUIStore((s) => s.hydrateLanguage);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const language = useUIStore((s) => s.language);
  const recordingDialogOpen = useUIStore((s) => s.recordingDialogOpen);
  const setRecordingDialogOpen = useUIStore((s) => s.setRecordingDialogOpen);
  const hydrateI18nLanguage = useI18nStore((s) => s.hydrateLanguage);

  useEffect(() => {
    hydrateTheme();
    hydrateUiLanguage();
    hydrateI18nLanguage();
  }, [hydrateTheme, hydrateUiLanguage, hydrateI18nLanguage]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = language === "AR" ? "rtl" : "ltr";
      document.documentElement.lang = language === "AR" ? "ar" : "en";
    }
  }, [language]);

  return (
    <QueryClientProvider client={queryClient}>
      <DataSyncListener />
      <TooltipProvider delayDuration={200}>
        <Shell>
          <Outlet />
        </Shell>
        <Suspense fallback={null}>
          <CommandPalette />
          <NotificationCenter />
          <FloatingAIAssistant />
        </Suspense>
        <Toaster position="top-right" richColors theme={resolvedTheme} />
        {recordingDialogOpen && (
          <Suspense fallback={null}>
            <UploadRecordingDialog
              open={recordingDialogOpen}
              onOpenChange={setRecordingDialogOpen}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["meetings"] });
                queryClient.invalidateQueries({ queryKey: ["lectures"] });
                queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
                queryClient.invalidateQueries({ queryKey: ["transcripts"] });
              }}
            />
          </Suspense>
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}
