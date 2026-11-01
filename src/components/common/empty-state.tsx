import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick?: () => void };
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-border/60 bg-background/60 shadow-elegant">
        <div className="absolute inset-0 rounded-2xl gradient-primary opacity-15" />
        <Icon className="relative h-7 w-7 text-primary" />
      </div>
      <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button className="mt-5" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
