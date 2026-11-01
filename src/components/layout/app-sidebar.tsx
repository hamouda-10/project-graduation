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
          variant === "desktop" ? (collapsed ? "w-[76px]" : "w-[260px]") : "w-full",
          "transition-[width] duration-300 ease-out",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-3">
          <Logo compact={collapsed} />
          {variant === "desktop" && (
            <button
              type="button"
              onClick={toggle}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition",
                collapsed && (isRtl ? "-rotate-180" : "rotate-180"),
              )}
              aria-label="Toggle sidebar"
            >
              <ChevronsLeft className={cn("h-4 w-4", isRtl && "rotate-180")} />
            </button>
          )}
        </div>

        <div className="px-3">
          <WorkspaceSwitcher collapsed={collapsed} />
        </div>

        <div className="px-3 pt-3">
          <Button
            onClick={() => setRecordingDialogOpen(true)}
            className={cn(
              "w-full gap-2 gradient-primary text-primary-foreground hover:opacity-95 shadow-glow cursor-pointer",
              collapsed && "px-0",
            )}
          >
            <Plus className="h-4 w-4" />
            {!collapsed && <span className="text-sm font-medium">{t("newRecording")}</span>}
          </Button>
        </div>

        <ScrollArea className="mt-4 flex-1 px-2">
          <nav className="space-y-6 pb-6">
            {NAV_GROUPS.map((group) => {
              const items = NAV_ITEMS.filter((i) => i.group === group.key);
              const groupLabel = groupKeyToI18n[group.key]
                ? t(groupKeyToI18n[group.key])
                : group.label;
              return (
                <div key={group.key}>
                  {!collapsed && (
                    <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                      {groupLabel}
                    </div>
                  )}
                  <ul className="space-y-0.5">
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
                            "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/85 outline-none transition",
                            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            "focus-visible:ring-2 focus-visible:ring-ring/60",
                            active && "bg-sidebar-accent text-sidebar-accent-foreground",
                            collapsed && "justify-center px-0",
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId="sidebar-active"
                              className={cn(
                                "absolute inset-y-1 w-[3px] rounded-full gradient-primary",
                                isRtl ? "right-0" : "left-0",
                              )}
                              transition={{ type: "spring", stiffness: 500, damping: 40 }}
                            />
                          )}
                          <Icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0",
                              active
                                ? "text-primary"
                                : "text-muted-foreground group-hover:text-foreground",
                            )}
                          />
                          {!collapsed && (
                            <>
                              <span className="truncate">{itemLabel}</span>
                              {badge !== undefined && (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "h-5 rounded-full border-border/70 bg-background/70 px-2 text-[10.5px] font-medium",
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
