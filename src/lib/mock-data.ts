export const RECENT_MEETINGS = [
  {
    id: "m1",
    title: "Q3 Product Roadmap Sync",
    host: "Ava Chen",
    time: "Today · 09:30",
    duration: "48m",
    participants: 12,
    status: "Summarized",
  },
  {
    id: "m2",
    title: "Design Critique — Onboarding v4",
    host: "Marcus Lee",
    time: "Today · 08:15",
    duration: "1h 12m",
    participants: 6,
    status: "Processing",
  },
  {
    id: "m3",
    title: "Weekly Engineering Standup",
    host: "Priya Patel",
    time: "Yesterday",
    duration: "32m",
    participants: 18,
    status: "Summarized",
  },
  {
    id: "m4",
    title: "Customer Discovery — Acme Corp",
    host: "Diego Alvarez",
    time: "Yesterday",
    duration: "54m",
    participants: 4,
    status: "Summarized",
  },
];

export const RECENT_LECTURES = [
  {
    id: "l1",
    title: "Distributed Systems — Consensus",
    instructor: "Prof. K. Nakamura",
    course: "CS 6410",
    time: "Today · 11:00",
    duration: "1h 30m",
  },
  {
    id: "l2",
    title: "Organic Chemistry — Reaction Mechanisms",
    instructor: "Dr. E. Fournier",
    course: "CHEM 210",
    time: "Yesterday",
    duration: "1h 15m",
  },
  {
    id: "l3",
    title: "Macroeconomics — Monetary Policy",
    instructor: "Prof. R. Al-Sayed",
    course: "ECON 305",
    time: "Mon",
    duration: "1h",
  },
];

export const UPCOMING = [
  { id: "u1", title: "Board Review", when: "Tomorrow · 10:00", kind: "meeting" as const },
  {
    id: "u2",
    title: "Linear Algebra — Eigenvectors",
    when: "Tomorrow · 14:00",
    kind: "lecture" as const,
  },
  { id: "u3", title: "Design System Handoff", when: "Thu · 09:00", kind: "meeting" as const },
];

export const TASKS = [
  {
    id: "t1",
    title: "Send Q3 summary to leadership",
    due: "Today",
    priority: "high" as const,
    done: false,
  },
  {
    id: "t2",
    title: "Review onboarding transcript",
    due: "Tomorrow",
    priority: "medium" as const,
    done: false,
  },
  {
    id: "t3",
    title: "Publish flashcards for CHEM 210",
    due: "Fri",
    priority: "low" as const,
    done: true,
  },
  {
    id: "t4",
    title: "Schedule sync with Acme Corp",
    due: "Next week",
    priority: "medium" as const,
    done: false,
  },
];

export const AI_INSIGHTS = [
  { id: "i1", title: "3 action items detected in today's meetings", tone: "action" as const },
  { id: "i2", title: "Frequent keyword this week: “latency budget”", tone: "trend" as const },
  { id: "i3", title: "Study note ready for Consensus lecture", tone: "note" as const },
];

export const ACTIVITY = [
  { id: "a1", who: "Ava", what: "shared a summary", where: "Q3 Roadmap", when: "2m ago" },
  { id: "a2", who: "AI", what: "generated 12 flashcards", where: "CS 6410", when: "18m ago" },
  {
    id: "a3",
    who: "Marcus",
    what: "commented on transcript",
    where: "Onboarding v4",
    when: "1h ago",
  },
  { id: "a4", who: "AI", what: "extracted 5 tasks", where: "Board Review", when: "3h ago" },
];

export const WEEKLY_SERIES = [
  { day: "Mon", meetings: 4, lectures: 2 },
  { day: "Tue", meetings: 6, lectures: 3 },
  { day: "Wed", meetings: 5, lectures: 4 },
  { day: "Thu", meetings: 8, lectures: 3 },
  { day: "Fri", meetings: 7, lectures: 5 },
  { day: "Sat", meetings: 2, lectures: 1 },
  { day: "Sun", meetings: 1, lectures: 0 },
];

export const MEETING_TREND = [
  { m: "W1", value: 24 },
  { m: "W2", value: 32 },
  { m: "W3", value: 28 },
  { m: "W4", value: 41 },
  { m: "W5", value: 46 },
  { m: "W6", value: 52 },
  { m: "W7", value: 49 },
  { m: "W8", value: 58 },
];

export const LECTURE_TREND = [
  { m: "W1", value: 10 },
  { m: "W2", value: 14 },
  { m: "W3", value: 18 },
  { m: "W4", value: 16 },
  { m: "W5", value: 22 },
  { m: "W6", value: 28 },
  { m: "W7", value: 26 },
  { m: "W8", value: 33 },
];

export const NOTIFICATIONS_GROUPED = [
  {
    label: "Today",
    items: [
      {
        id: "n1",
        title: "Summary ready",
        body: "Q3 Product Roadmap Sync summary is available.",
        time: "2m",
        unread: true,
      },
      {
        id: "n2",
        title: "New action items",
        body: "AI extracted 3 tasks from Board Review.",
        time: "22m",
        unread: true,
      },
      {
        id: "n3",
        title: "Mention",
        body: "Marcus mentioned you in Onboarding v4 transcript.",
        time: "1h",
        unread: true,
      },
    ],
  },
  {
    label: "Earlier",
    items: [
      {
        id: "n4",
        title: "Flashcards published",
        body: "12 flashcards for CHEM 210 are ready to study.",
        time: "Yesterday",
        unread: false,
      },
      {
        id: "n5",
        title: "Weekly report",
        body: "Your weekly analytics report is ready.",
        time: "2d",
        unread: false,
      },
    ],
  },
];
