import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Settings, User, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/auth/user-avatar";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";

export function ProfileMenu() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!user) return null;

  const isGuest = status === "guest" || Boolean(user.isGuest);

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    toast.success("Signed out successfully");
    void navigate({ to: "/login" as never, replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 gap-2 rounded-full px-1 pr-3">
          <UserAvatar
            avatarUrl={user.avatarUrl}
            name={user.name}
            initials={user.initials}
            className="h-7 w-7 rounded-full ring-2 ring-border/60 text-[11px]"
          />
          <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2.5">
          <UserAvatar
            avatarUrl={user.avatarUrl}
            name={user.name}
            initials={user.initials}
            className="h-10 w-10 rounded-full text-sm shrink-0"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {isGuest ? "Guest session (temporary)" : user.email}
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          Account
        </DropdownMenuLabel>
        {isGuest ? (
          <DropdownMenuItem asChild>
            <Link to={"/login" as never}>
              <LogIn className="h-4 w-4" /> Sign in or Register
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link to="/profile">
              <User className="h-4 w-4" /> Profile
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="h-4 w-4" /> Settings{" "}
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void handleLogout()}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="h-4 w-4" /> {isGuest ? "Exit Guest Session" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
