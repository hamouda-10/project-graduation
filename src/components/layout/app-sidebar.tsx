import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronsLeft, Plus, Sparkles } from "lucide-react";
import { Logo } from "@/components/common/logo";
import { WorkspaceSwitcher } from "@/components/sidebar/workspace-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, NAV_GROUPS } from "@/lib/nav-config";
import { useUIStore } from "@/stores/ui-store";
import { useTranslation, type Translations } from "@/lib/i18n";
import { api, Meeting, Lecture, NotificationItem } from "@/lib/api-client";

const groupKeyToI18n: Record<string, keyof Translations> = {
  workspace: "nav_workspace",
  ai: "nav_ai",
  insights: "nav_insights",
  system: "nav_system",
};

const routeToI18n: Record<string, keyof Translations> = {
  "/": "nav_dashboard",
  "/meetings": "nav_meetings",
  "/lectures": "nav_lectures",
  "/calendar": "nav_calendar",
  "/ai-workspace": "nav_ai_workspace",
  "/transcript": "nav_transcripts",
  "/mind-maps": "nav_mind_maps",
  "/flashcards": "nav_flashcards",
  "/quiz": "nav_quiz",
  "/reports": "nav_reports",
  "/analytics": "nav_analytics",
  "/notifications": "nav_notifications",
  "/search": "nav_search",
  "/users": "nav_users",
  "/settings": "nav_settings",
  "/profile": "nav_profile",
  "/admin": "nav_admin",
};

export function AppSidebar({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed) && variant === "desktop";
  const toggle = useUIStore((s) => s.toggleSidebar);
  const setRecordingDialogOpen = useUIStore((s) => s.setRecordingDialogOpen);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { t, isRtl } = useTranslation();

  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api.getMeetings(),
  });
  const { data: lectures = [] } = useQuery<Lecture[]>({
    queryKey: ["lectures"],
    queryFn: () => api.getLectures(),
  });
  const { data: notifications = [] } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
  });

  const getDynamicBadge = (to: string): number | string | undefined => {
    if (to === "/meetings") {
      return meetings.length > 0 ? meetings.length : undefined;
    }
    if (to === "/lectures") {
      return lectures.length > 0 ? lectures.length : undefined;
    }
    if (to === "/notifications") {
      const unread = notifications.filter((n) => !n.read).length;
      return unread > 0 ? unread : undefined;
    }
    return undefined;
  };

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          "flex h-full flex-col bg-sidebar/80 backdrop-blur-xl",
          isRtl ? "border-l border-sidebar-border" : "border-r border-sidebar-border",
          variant === "desktop" ? (collapsed ? "w-[64px]" : "w-[220px]") : "w-full",
          "transition-[width] duration-300 ease-out",
        )}
      >
        <div
          className={cn(
            "relative flex flex-col items-center justify-center border-b border-sidebar-border/30 pb-3.5 pt-4",
            collapsed ? "px-2" : "px-3",
          )}
        >
          {variant === "desktop" && !collapsed && (
            <button
              type="button"
              onClick={toggle}
              className={cn(
                "absolute top-3.5 grid h-7.5 w-7.5 place-items-center rounded-lg text-zinc-400 hover:bg-sidebar-accent hover:text-foreground transition cursor-pointer z-10",
                isRtl ? "left-2.5" : "right-2.5",
              )}
              aria-label="Toggle sidebar"
              title="Collapse sidebar"
            >
              <ChevronsLeft className={cn("h-4 w-4", isRtl && "rotate-180")} />
            </button>
          )}
          {variant === "desktop" && collapsed && (
            <button
              type="button"
              onClick={toggle}
              className="mb-1.5 grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-sidebar-accent hover:text-foreground transition cursor-pointer"
              title="Expand sidebar"
            >
              <ChevronsLeft className={cn("h-4 w-4", !isRtl && "rotate-180")} />
            </button>
          )}
          <Logo compact={collapsed} />
        </div>

        <div className="px-3 pt-3">
          <Button
            onClick={() => setRecordingDialogOpen(true)}
            className={cn(
              "w-full h-9 gap-2 gradient-primary text-primary-foreground hover:opacity-95 shadow-glow cursor-pointer text-xs sm:text-sm font-extrabold",
              collapsed && "px-0",
            )}
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            {!collapsed && (
              <span className="text-xs sm:text-sm font-extrabold tracking-wide">
                {t("newRecording")}
              </span>
            )}
          </Button>
        </div>

        <ScrollArea className="mt-3 flex-1 px-2">
          <nav className="space-y-4 pb-5">
            {NAV_GROUPS.map((group) => {
              const items = NAV_ITEMS.filter((i) => i.group === group.key);
              const groupLabel = groupKeyToI18n[group.key]
                ? t(groupKeyToI18n[group.key])
                : group.label;
              return (
                <div key={group.key}>
                  {!collapsed && (
                    <div className="px-2 pb-1.5 pt-0.5 text-[11px] font-black uppercase tracking-wider text-amber-400 drop-shadow-sm">
                      {groupLabel}
                    </div>
                  )}
                  <ul className="space-y-1">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const active =
                        item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                      const itemLabel = routeToI18n[item.to] ? t(routeToI18n[item.to]) : item.label;
                      const badge = getDynamicBadge(item.to);

                      const linkBody = (
                        <Link
                          to={item.to}
                          className={cn(
                            "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.75 text-[13.5px] font-semibold text-zinc-100 outline-none transition-all",
                            "hover:bg-zinc-800/80 hover:text-amber-300",
                            "focus-visible:ring-2 focus-visible:ring-ring/60",
                            active &&
                              "bg-amber-500/15 text-amber-300 font-extrabold border border-amber-500/30 shadow-sm",
                            collapsed && "justify-center px-0",
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId="sidebar-active"
                              className={cn(
                                "absolute inset-y-1 w-[3.5px] rounded-full gradient-primary shadow-[0_0_8px_#f59e0b]",
                                isRtl ? "right-0" : "left-0",
                              )}
                              transition={{ type: "spring", stiffness: 500, damping: 40 }}
                            />
                          )}
                          <Icon
                            className={cn(
                              "h-[19px] w-[19px] shrink-0 transition-colors",
                              active
                                ? "text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                                : "text-zinc-300 group-hover:text-amber-300",
                            )}
                          />
                          {!collapsed && (
                            <>
                              <span className="truncate">{itemLabel}</span>
                              {badge !== undefined && (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "h-5 px-2 rounded-full border border-amber-500/40 bg-zinc-900/90 text-[10.5px] font-black text-amber-300 shadow-sm",
                                    isRtl ? "mr-auto" : "ml-auto",
                                    typeof badge === "string" &&
                                      "gradient-primary text-primary-foreground border-transparent",
                                  )}
                                >
                                  {badge}
                                </Badge>
                              )}
                            </>
                          )}
                        </Link>
                      );
                      return (
                        <li key={item.to}>
                          {collapsed ? (
                            <Tooltip>
                              <TooltipTrigger asChild>{linkBody}</TooltipTrigger>
                              <TooltipContent
                                side={isRtl ? "left" : "right"}
                                className="flex items-center gap-2"
                              >
                                {itemLabel}
                                {badge !== undefined && (
                                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                    {badge}
                                  </Badge>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            linkBody
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  );
}
