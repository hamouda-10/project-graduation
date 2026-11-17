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
            "flex w-full items-center gap-2 rounded-xl border border-amber-500/35 bg-zinc-950/70 p-2 text-left text-sm shadow-sm transition-all duration-150 hover:border-amber-400/70 hover:bg-zinc-900/90 cursor-pointer",
            collapsed && "justify-center",
          )}
        >
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold">
            <Icon className="h-3.5 w-3.5 text-amber-400" />
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-bold leading-tight text-foreground">
                  {current.name}
                </div>
                <div className="truncate text-[10px] uppercase tracking-wider font-semibold text-amber-400/90">
                  {current.plan}
                </div>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-amber-400/80" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-52 p-1 bg-zinc-950/95 border-amber-500/40 backdrop-blur-xl"
      >
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
          Workspaces
        </div>
        <div className="my-1 h-px bg-amber-500/20" />
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
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium hover:bg-amber-500/10 hover:text-amber-300 cursor-pointer"
            >
              <div className="grid h-6 w-6 shrink-0 place-items-center rounded bg-amber-500/15 text-amber-300">
                <Ic className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-xs">{w.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">{w.plan}</div>
              </div>
              {active && <Check className="h-3.5 w-3.5 text-amber-400" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
