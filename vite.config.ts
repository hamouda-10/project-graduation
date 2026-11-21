// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

function parseEnvHosts(): string[] {
  const hosts: string[] = [];
  const rawList = process.env.VITE_ALLOWED_HOSTS || "";
  for (const entry of rawList.split(",")) {
    const trimmed = entry.trim().toLowerCase();
    if (trimmed && /^[a-z0-9.-]+$/.test(trimmed)) {
      hosts.push(trimmed);
    }
  }
  for (const urlVar of [process.env.PUBLIC_APP_URL, process.env.APP_URL]) {
    if (!urlVar) continue;
    try {
      const hostname = new URL(urlVar).hostname.toLowerCase();
      if (hostname) hosts.push(hostname);
    } catch {
      // ignore malformed URL env values
    }
  }
  return hosts;
}

const allowedPreviewHosts = Array.from(
  new Set([
    "localhost",
    "127.0.0.1",
    "meetmind-atlas.ai.studio",
    "project-graduation.ai.studio",
    ".ai.studio",
    "ais-dev-ylbfqaeognwr3zaimsleqn-422352775581.europe-west1.run.app",
    "ais-pre-ylbfqaeognwr3zaimsleqn-422352775581.europe-west1.run.app",
    ...parseEnvHosts(),
  ]),
);

export default defineConfig({
  vite: {
    server: {
      host: "0.0.0.0",
      port: 3000,
      strictPort: true,
      allowedHosts: allowedPreviewHosts,
    },
    preview: {
      allowedHosts: allowedPreviewHosts,
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        onwarn(warning, warn) {
          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" ||
            warning.message.includes('"use client"')
          ) {
            return;
          }
          warn(warning);
        },
      },
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "lucide-react",
        "framer-motion",
        "clsx",
        "tailwind-merge",
        "zustand",
        "sonner",
        "cmdk",
        "@radix-ui/react-tooltip",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-separator",
        "@radix-ui/react-tabs",
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
