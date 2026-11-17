import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useUIStore } from "@/stores/ui-store";

export function NotificationsButton() {
  const setOpen = useUIStore((s) => s.setNotificationsOpen);
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
  });
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <button
      type="button"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/25 bg-zinc-950/80 text-amber-400 transition-all hover:border-amber-500/50 hover:bg-zinc-900 hover:text-amber-300 cursor-pointer shadow-sm"
      aria-label="Notifications"
      onClick={() => setOpen(true)}
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-zinc-950" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-ping rounded-full bg-amber-400/70" />
        </>
      )}
    </button>
  );
}
