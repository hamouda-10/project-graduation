import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { NOTIFICATIONS_GROUPED } from "@/lib/mock-data";

export function NotificationsButton() {
  const setOpen = useUIStore((s) => s.setNotificationsOpen);
  const unread = NOTIFICATIONS_GROUPED.flatMap((g) => g.items).filter((i) => i.unread).length;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9"
      aria-label="Notifications"
      onClick={() => setOpen(true)}
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-ping rounded-full bg-primary/70" />
        </>
      )}
    </Button>
  );
}
