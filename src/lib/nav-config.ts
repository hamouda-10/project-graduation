import {
  LayoutDashboard,
  Video,
  GraduationCap,
  Sparkles,
  FileText,
  Network,
  Layers,
  BrainCircuit,
  BarChart3,
  LineChart,
  Calendar,
  Bell,
  Search,
  Users,
  Settings,
  User,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
  group: "workspace" | "ai" | "insights" | "system";
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, group: "workspace" },
  { to: "/meetings", label: "Meetings", icon: Video, group: "workspace" },
  { to: "/lectures", label: "Lectures", icon: GraduationCap, group: "workspace" },
  { to: "/calendar", label: "Calendar", icon: Calendar, group: "workspace" },

  { to: "/ai-workspace", label: "AI Workspace", icon: Sparkles, group: "ai" },
  { to: "/transcript", label: "Transcripts", icon: FileText, group: "ai" },
  { to: "/mind-maps", label: "Mind Maps", icon: Network, group: "ai" },
  { to: "/flashcards", label: "Flashcards", icon: Layers, group: "ai" },
  { to: "/quiz", label: "Quiz Generator", icon: BrainCircuit, group: "ai" },

  { to: "/reports", label: "Reports", icon: FileText, group: "insights" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, group: "insights" },

  { to: "/notifications", label: "Notifications", icon: Bell, group: "system" },
  { to: "/search", label: "Search", icon: Search, group: "system" },
  { to: "/users", label: "Users", icon: Users, group: "system" },
  { to: "/settings", label: "Settings", icon: Settings, group: "system" },
  { to: "/profile", label: "Profile", icon: User, group: "system" },
  { to: "/admin", label: "Admin", icon: ShieldCheck, group: "system" },
];

export const NAV_GROUPS: { key: NavItem["group"]; label: string }[] = [
  { key: "workspace", label: "Workspace" },
  { key: "ai", label: "AI Studio" },
  { key: "insights", label: "Insights" },
  { key: "system", label: "System" },
];

export { LineChart };
