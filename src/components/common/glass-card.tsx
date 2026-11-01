import { cn } from "@/lib/utils";
import { forwardRef, type HTMLAttributes } from "react";

export const GlassCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-elegant",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-b before:from-foreground/[0.03] before:to-transparent",
        className,
      )}
      {...props}
    />
  ),
);
GlassCard.displayName = "GlassCard";
