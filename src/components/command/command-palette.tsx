import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { NAV_ITEMS } from "@/lib/nav-config";
import { useUIStore } from "@/stores/ui-store";
import { api, Meeting, Lecture, ActionItem } from "@/lib/api-client";
import {
  Sparkles,
  FileText,
  Users as UsersIcon,
  CheckSquare,
  Video,
  GraduationCap,
  Moon,
  Sun,
} from "lucide-react";

export function CommandPalette() {
  const open = useUIStore((s) => s.commandOpen);
  const setOpen = useUIStore((s) => s.setCommandOpen);
  const toggleAI = useUIStore((s) => s.toggleAiDock);
  const setTheme = useUIStore((s) => s.setTheme);
  const theme = useUIStore((s) => s.resolvedTheme);
  const navigate = useNavigate();

  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api.getMeetings(),
    enabled: open,
  });

  const { data: lectures = [] } = useQuery<Lecture[]>({
    queryKey: ["lectures"],
    queryFn: () => api.getLectures(),
    enabled: open,
  });

  const { data: tasks = [] } = useQuery<ActionItem[]>({
    queryKey: ["tasks"],
    queryFn: () => api.getTasks(),
    enabled: open,
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [open, setOpen]);

  const go = (to: string) => {
    setOpen(false);
    navigate({ to: to as never });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command, meeting, lecture or search…" />
      <CommandList className="max-h-[480px]">
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="AI Intelligence">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              toggleAI();
            }}
          >
            <Sparkles className="h-4 w-4" /> Ask MeetMind AI
            <CommandShortcut>⌘J</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/ai-workspace")}>
            <Sparkles className="h-4 w-4" /> Open AI Workspace
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((n) => {
            const Icon = n.icon;
            return (
              <CommandItem key={n.to} onSelect={() => go(n.to)}>
                <Icon className="h-4 w-4" /> {n.label}
              </CommandItem>
            );
          })}
        </CommandGroup>

        {meetings.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Meetings">
              {meetings.slice(0, 5).map((m) => (
                <CommandItem key={m.id} onSelect={() => go("/meetings")}>
                  <Video className="h-4 w-4" /> {m.title}
                  <span className="ml-auto text-xs text-muted-foreground">{m.date}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {lectures.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Lectures">
              {lectures.slice(0, 5).map((l) => (
                <CommandItem key={l.id} onSelect={() => go("/lectures")}>
                  <GraduationCap className="h-4 w-4" /> {l.title}
                  <span className="ml-auto text-xs text-muted-foreground">{l.courseCode}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {tasks.slice(0, 5).map((t) => (
                <CommandItem key={t.id} onSelect={() => go("/meetings")}>
                  <CheckSquare className="h-4 w-4" /> {t.title}
                  <span className="ml-auto text-xs text-muted-foreground">
                    Due {t.dueDate || "Soon"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Reports & Team">
          <CommandItem onSelect={() => go("/reports")}>
            <FileText className="h-4 w-4" /> Export CSV Report
          </CommandItem>
          <CommandItem onSelect={() => go("/users")}>
            <UsersIcon className="h-4 w-4" /> Workspace Members
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Preferences">
          <CommandItem onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
