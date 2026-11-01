## MeetMind AI — Application Shell & Design System Foundation

Note: this project is on TanStack Start (not Next.js) per the existing stack. All requested libraries (Tailwind, shadcn/ui, Framer Motion, Lucide, React Query, Zustand) are compatible and will be used. Routing uses TanStack Router's file-based routes.

### Design language

- Dark-first with light mode, `next-themes`-style toggle via a Zustand store + `class="dark"` on `<html>`.
- OKLCH token palette in `src/styles.css`: deep indigo/violet primary with electric cyan accent, glass surfaces (`--glass`, `--glass-border`), gradient tokens (`--gradient-primary`, `--gradient-mesh`), elevation shadows (`--shadow-glow`, `--shadow-elegant`).
- Typography: Space Grotesk (display) + Inter (body) loaded via `<link>` in `__root.tsx`.
- Rounded-2xl cards, soft shadows, subtle noise/mesh background, Framer Motion micro-interactions.

### Routes (TanStack file-based, under `_app` authenticated-style layout)

```
src/routes/
  __root.tsx                (updated: fonts, theme init, providers, toaster, cmdk, AI dock)
  _app.tsx                  (shell: sidebar + topbar + <Outlet/>)
  _app.index.tsx            (Dashboard)
  _app.meetings.tsx
  _app.lectures.tsx
  _app.ai-workspace.tsx
  _app.transcript.tsx
  _app.mind-maps.tsx
  _app.flashcards.tsx
  _app.quiz.tsx
  _app.reports.tsx
  _app.analytics.tsx
  _app.calendar.tsx
  _app.notifications.tsx
  _app.search.tsx
  _app.users.tsx
  _app.settings.tsx
  _app.profile.tsx
  _app.admin.tsx
  index.tsx                 (redirects to /_app root -> dashboard)
  403.tsx, 500.tsx          (root notFoundComponent handles 404)
```

### Components (`src/components/`)

- `layout/` — `AppSidebar`, `Topbar`, `Breadcrumbs`, `MobileNav`, `Shell`.
- `sidebar/` — `WorkspaceSwitcher`, `SidebarNavItem` (icon + label + badge + active gradient).
- `topbar/` — `GlobalSearchTrigger`, `NotificationsButton`, `MessagesButton`, `ThemeToggle`, `LanguageSwitch`, `AIAssistantButton`, `ProfileMenu`.
- `command/` — `CommandPalette` (cmdk, Ctrl/⌘+K, grouped: Meetings/Lectures/Users/Reports/AI/Tasks).
- `ai/` — `FloatingAIAssistant` (bottom-right glass FAB, expandable panel with animated orb).
- `notifications/` — `NotificationCenter` (Sheet slide-over, grouped Today/Earlier, unread badge).
- `dashboard/` — `WelcomeCard`, `StatCard`, `RecentMeetings`, `RecentLectures`, `UpcomingList`, `AIInsights`, `RecentActivity`, `TasksWidget`, `WeeklyAnalyticsChart`, `MeetingAnalyticsChart`, `LectureAnalyticsChart`, `CalendarWidget`, `NotificationsWidget`.
- `common/` — `GlassCard`, `GradientText`, `SectionHeader`, `EmptyState`, `PageHeader`, `Logo`.
- `skeletons/` — `SkeletonCard`, `SkeletonTable`, `SkeletonSidebar`, `SkeletonChart`.
- `error/` — `ErrorState` used by 403/404/500.

### State & infra

- `src/stores/ui-store.ts` (Zustand): sidebar collapsed, command palette open, notifications open, AI dock open, theme, language, current workspace.
- `src/stores/notifications-store.ts`: mock grouped notifications.
- Providers wired in `__root.tsx`: existing `QueryClientProvider`, plus `TooltipProvider`, `Toaster` (sonner), theme bootstrap effect.
- shadcn primitives to add: sidebar, sheet, command, dropdown-menu, tooltip, avatar, badge, button, card, dialog, input, popover, scroll-area, separator, skeleton, sonner, tabs, progress.

### Charts

- Recharts (already common with shadcn) for weekly/meeting/lecture analytics — line, bar, area with gradient fills.

### Responsiveness

- Sidebar: full (`w-64`) → collapsed icon-rail (`w-16`) on desktop; off-canvas Sheet on mobile via `SidebarTrigger`.
- Topbar sticky, backdrop-blur glass.
- Dashboard grid: 12-col desktop → 6-col laptop → 2-col tablet → stacked mobile.

### Content

- All data is mock/placeholder (arrays in components). No backend, no business logic.

### Deliverable

A polished, production-feeling MeetMind AI shell where every nav item routes to a titled page with realistic placeholder content, empty states, or skeletons — matching Linear/Vercel/Notion polish.
