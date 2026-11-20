import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, lazy, Suspense, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Shell } from "@/components/layout/shell";
import { Logo } from "@/components/common/logo";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/error/error-state";
import { THEME_STORAGE_KEY, useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useI18nStore } from "@/lib/i18n";
import { useDataSync } from "@/lib/use-data-sync";

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

const AUTH_PUBLIC_PATHS = ["/login", "/register"];
const GUEST_RESTRICTED_PREFIXES = ["/admin", "/users"];

function isSafeRedirectTarget(target: string | null): target is string {
  if (!target) return false;
  if (!target.startsWith("/") || target.startsWith("//")) return false;
  return !AUTH_PUBLIC_PATHS.some((p) => target === p || target.startsWith(`${p}?`));
}

function DataSyncListener() {
  useDataSync();
  return null;
}

function SessionLoadingScreen({ message }: { message: string }) {
  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center bg-[#060608] px-4 text-zinc-100"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-5">
        <Logo />
        <div className="flex items-center gap-2.5 text-xs font-medium tracking-wide text-zinc-400">
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400"
            aria-hidden="true"
          />
          <span>{message}</span>
        </div>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const searchStr = useRouterState({ select: (r) => r.location.searchStr });

  const hydrateTheme = useUIStore((s) => s.hydrateTheme);
  const hydrateUiLanguage = useUIStore((s) => s.hydrateLanguage);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const language = useUIStore((s) => s.language);
  const recordingDialogOpen = useUIStore((s) => s.recordingDialogOpen);
  const setRecordingDialogOpen = useUIStore((s) => s.setRecordingDialogOpen);
  const hydrateI18nLanguage = useI18nStore((s) => s.hydrateLanguage);

  const authStatus = useAuthStore((s) => s.status);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const handleSessionExpired = useAuthStore((s) => s.handleSessionExpired);

  const isAuthPublicPath = AUTH_PUBLIC_PATHS.includes(pathname);
  const isGuestRestrictedPath = GUEST_RESTRICTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  useEffect(() => {
    hydrateTheme();
    hydrateUiLanguage();
    hydrateI18nLanguage();
    void restoreSession();
  }, [hydrateTheme, hydrateUiLanguage, hydrateI18nLanguage, restoreSession]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = language === "AR" ? "rtl" : "ltr";
      document.documentElement.lang = language === "AR" ? "ar" : "en";
    }
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSessionExpired = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      queryClient.clear();
      handleSessionExpired(detail?.message);
    };
    window.addEventListener("meetmind:session-expired", onSessionExpired);
    return () => {
      window.removeEventListener("meetmind:session-expired", onSessionExpired);
    };
  }, [handleSessionExpired, queryClient]);

  useEffect(() => {
    if (authStatus === "loading") return;

    if (isAuthPublicPath) {
      // Redirect fully authenticated (non-guest) users away from /login and /register
      if (authStatus === "authenticated") {
        const params = new URLSearchParams(searchStr || "");
        const redirectTarget = params.get("redirect");
        const destination = isSafeRedirectTarget(redirectTarget) ? redirectTarget : "/";
        void navigate({ to: destination as never, replace: true });
      }
      return;
    }

    if (authStatus === "unauthenticated" || authStatus === "session_expired") {
      const currentFullPath = `${pathname}${searchStr || ""}`;
      const redirectParam =
        currentFullPath && currentFullPath !== "/" && !AUTH_PUBLIC_PATHS.includes(pathname)
          ? `?redirect=${encodeURIComponent(currentFullPath)}`
          : "";
      void navigate({ to: `/login${redirectParam}` as never, replace: true });
      return;
    }

    if (authStatus === "guest" && isGuestRestrictedPath) {
      void navigate({ to: "/403" as never, replace: true });
    }
  }, [authStatus, isAuthPublicPath, isGuestRestrictedPath, pathname, searchStr, navigate]);

  const loadingText = language === "AR" ? "جارٍ التحقق من الجلسة..." : "Restoring session...";

  // Public authentication routes (/login, /register)
  if (isAuthPublicPath) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          {authStatus === "loading" || authStatus === "authenticated" ? (
            <SessionLoadingScreen message={loadingText} />
          ) : (
            <Outlet />
          )}
          <Toaster position="top-right" richColors theme={resolvedTheme} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Protected application routes: zero-flicker guard before session verification completes
  if (
    authStatus === "loading" ||
    authStatus === "unauthenticated" ||
    authStatus === "session_expired" ||
    (authStatus === "guest" && isGuestRestrictedPath)
  ) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <SessionLoadingScreen
            message={
              authStatus === "loading"
                ? loadingText
                : language === "AR"
                  ? "جارٍ التوجيه إلى صفحة تسجيل الدخول..."
                  : "Redirecting to sign in..."
            }
          />
          <Toaster position="top-right" richColors theme={resolvedTheme} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

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
