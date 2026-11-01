import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav-config";

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const segments = pathname.split("/").filter(Boolean);
  const current = NAV_ITEMS.find((n) => n.to !== "/" && pathname.startsWith(n.to));

  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:flex"
    >
      <Link
        to="/"
        className="grid h-6 w-6 place-items-center rounded-md hover:bg-accent hover:text-foreground"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.length === 0 ? (
        <>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate font-medium text-foreground">Dashboard</span>
        </>
      ) : (
        <>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate font-medium text-foreground">
            {current?.label ?? segments[0].replace(/-/g, " ")}
          </span>
        </>
      )}
    </nav>
  );
}
