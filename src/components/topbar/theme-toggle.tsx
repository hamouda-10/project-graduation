import { Moon, Sun } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";

export function ThemeToggle() {
  const resolved = useUIStore((s) => s.resolvedTheme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <button
      type="button"
      onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="nav-gold-btn relative h-9 w-9"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all text-amber-400 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all text-amber-400 dark:rotate-0 dark:scale-100" />
    </button>
  );
}
