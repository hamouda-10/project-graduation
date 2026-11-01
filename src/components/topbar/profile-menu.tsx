import { Link } from "@tanstack/react-router";
import { LogOut, Settings, User, Sparkles, HelpCircle, Building2, Keyboard } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export function ProfileMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 gap-2 rounded-full px-1 pr-3">
          <Avatar className="h-7 w-7 ring-2 ring-border/60">
            <AvatarFallback className="gradient-primary text-[11px] font-semibold text-primary-foreground">
              AK
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline">Alex Kim</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2.5">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="gradient-primary text-sm font-semibold text-primary-foreground">
              AK
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Alex Kim</div>
            <div className="truncate text-xs text-muted-foreground">alex@acme.edu</div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          Account
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User className="h-4 w-4" /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="h-4 w-4" /> Settings{" "}
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Building2 className="h-4 w-4" /> Workspaces
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Sparkles className="h-4 w-4" /> Upgrade to Pro
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Keyboard className="h-4 w-4" /> Keyboard shortcuts{" "}
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <HelpCircle className="h-4 w-4" /> Help & Support
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
