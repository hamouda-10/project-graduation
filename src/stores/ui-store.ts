import { create } from "zustand";

export type Theme = "light" | "dark" | "system";

type UIState = {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  commandOpen: boolean;
  notificationsOpen: boolean;
  aiDockOpen: boolean;
  theme: Theme;
  resolvedTheme: "light" | "dark";
  hydrateTheme: () => void;
  recordingDialogOpen: boolean;
  setRecordingDialogOpen: (v: boolean) => void;
  language: string;
  workspace: string;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (v: boolean) => void;
  setCommandOpen: (v: boolean) => void;
  toggleCommand: () => void;
  setNotificationsOpen: (v: boolean) => void;
  setAiDockOpen: (v: boolean) => void;
  toggleAiDock: () => void;
  setTheme: (t: Theme) => void;
  setLanguage: (l: string) => void;
  setWorkspace: (w: string) => void;
};

export const THEME_STORAGE_KEY = "meetmind-theme";

function resolve(t: Theme): "light" | "dark" {
  if (t !== "system") return t;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  commandOpen: false,
  notificationsOpen: false,
  aiDockOpen: false,
  theme: "system",
  resolvedTheme: "dark",
  hydrateTheme: () => {
    let stored: Theme = "system";
    try {
      const v = localStorage.getItem(THEME_STORAGE_KEY);
      if (v === "light" || v === "dark") stored = v;
    } catch {
      /* storage unavailable */
    }
    const resolvedTheme = resolve(stored);
    applyTheme(resolvedTheme);
    set({ theme: stored, resolvedTheme });
  },
  recordingDialogOpen: false,
  setRecordingDialogOpen: (v) => set({ recordingDialogOpen: v }),
  language: (typeof window !== "undefined" && localStorage.getItem("meetmind-lang")) || "EN",
  workspace: "Acme University",
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileSidebarOpen: (v) => set({ mobileSidebarOpen: v }),
  setCommandOpen: (v) => set({ commandOpen: v }),
  toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),
  setNotificationsOpen: (v) => set({ notificationsOpen: v }),
  setAiDockOpen: (v) => set({ aiDockOpen: v }),
  toggleAiDock: () => set((s) => ({ aiDockOpen: !s.aiDockOpen })),
  setTheme: (theme) => {
    try {
      if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable */
    }
    const resolvedTheme = resolve(theme);
    applyTheme(resolvedTheme);
    set({ theme, resolvedTheme });
  },
  setLanguage: (language) => {
    try {
      localStorage.setItem("meetmind-lang", language);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.dir = language === "AR" ? "rtl" : "ltr";
      document.documentElement.lang = language === "AR" ? "ar" : "en";
    }
    set({ language });
  },
  setWorkspace: (workspace) => set({ workspace }),
}));
