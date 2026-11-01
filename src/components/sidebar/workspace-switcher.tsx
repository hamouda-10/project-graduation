import { Check, ChevronsUpDown, Building2, GraduationCap, School } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const WORKSPACES = [
  { name: "Acme University", plan: "Enterprise", icon: GraduationCap },
  { name: "Nova Labs", plan: "Team", icon: Building2 },
  { name: "Northwind Academy", plan: "Education", icon: School },
];

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const workspace = useUIStore((s) => s.workspace);
  const setWorkspace = useUIStore((s) => s.setWorkspace);
  const current = WORKSPACES.find((w) => w.name === workspace) ?? WORKSPACES[0];
  const Icon = current.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-background/50 p-2 text-left text-sm shadow-elegant transition hover:bg-background/80",
            collapsed && "justify-center",
          )}
        >
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg gradient-primary text-primary-foreground">
            <Icon className="h-3.5 w-3.5" />
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium leading-tight">{current.name}</div>
                <div className="truncate text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  {current.plan}
                </div>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <div className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspaces
        </div>
        {WORKSPACES.map((w) => {
          const Ic = w.icon;
          const active = w.name === current.name;
          return (
            <button
              key={w.name}
              onClick={() => {
                setWorkspace(w.name);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent"
            >
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg gradient-primary text-primary-foreground">
                <Ic className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{w.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{w.plan}</div>
              </div>
              {active && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
