import fs from "node:fs";
import { db, type UserRecord } from "./db";
import { sanitizePublicUser } from "./auth";

export interface ProfileRecordingItem {
  id: string;
  title: string;
  type: "meeting" | "lecture";
  courseCode?: string;
  date: string;
  durationSeconds: number;
  status: string;
  audioAvailable: boolean;
  audioStatus: "ready" | "missing";
  transcriptionStatus: "completed" | "processing" | "failed" | "none";
  segmentsCount: number;
  aiStatus: "completed" | "processing" | "failed" | "queued";
  hasSummary: boolean;
  hasQuiz: boolean;
  quizCount: number;
  tasksCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileOverviewResponse {
  user: ReturnType<typeof sanitizePublicUser>;
  profileCompletion: {
    percent: number;
    completedCount: number;
    totalCount: number;
    missingFields: string[];
  };
  analytics: {
    totalMeetings: number;
    totalLectures: number;
    totalRecordings: number;
    totalAudioDurationSeconds: number;
    totalAudioHours: number;
    totalTranscriptions: number;
    totalTranscriptSegments: number;
    totalSummaries: number;
    totalQuizzes: number;
    totalQuizAttempts: number;
    averageQuizScore: number;
    totalFlashcards: number;
    masteredFlashcards: number;
    totalMindMaps: number;
    totalChatMessages: number;
    totalAiOutputs: number;
    completedJobs: number;
    pendingJobs: number;
    failedJobs: number;
    tasksGenerated: number;
    tasksCompleted: number;
    tasksPending: number;
    taskCompletionRate: number;
    studySessions: number;
    mostActiveDays: Array<{ day: string; count: number }>;
    mostUsedAiFeatures: Array<{ feature: string; key: string; count: number }>;
    milestones: Array<{
      id: string;
      title: string;
      description: string;
      unlocked: boolean;
      current: number;
      target: number;
    }>;
  };
  recordings: ProfileRecordingItem[];
  recentMeetings: Array<{
    id: string;
    title: string;
    date: string;
    durationSeconds: number;
    status: string;
    hasSummary: boolean;
    segmentsCount: number;
  }>;
  recentLectures: Array<{
    id: string;
    title: string;
    courseCode: string;
    date: string;
    durationSeconds: number;
    status: string;
    hasSummary: boolean;
    segmentsCount: number;
  }>;
  recentJobs: Array<{
    id: string;
    resourceId: string;
    resourceType: "meeting" | "lecture";
    fileName: string;
    status: string;
    progressPercent: number;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  recentQuizAttempts: Array<{
    id: string;
    quizId: string;
    quizTitle: string;
    scorePercent: number;
    correctCount: number;
    totalQuestions: number;
    submittedAt: string;
  }>;
  sessions: Array<{
    id: string;
    isCurrent: boolean;
    isGuest: boolean;
    rememberMe: boolean;
    deviceLabel: string;
    createdAt: string;
    lastUsedAt: string;
    expiresAt: string;
  }>;
}

function summarizeUserAgent(ua?: string): string {
  if (!ua) return "Web Browser";
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Chrome/")
      ? "Chrome"
      : ua.includes("Firefox/")
        ? "Firefox"
        : ua.includes("Safari/")
          ? "Safari"
          : "Web Browser";
  const os = ua.includes("Windows")
    ? "Windows"
    : ua.includes("Mac OS X")
      ? "macOS"
      : ua.includes("Android")
        ? "Android"
        : ua.includes("iPhone") || ua.includes("iPad")
          ? "iOS"
          : ua.includes("Linux")
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

function hasAudioFileOnDisk(recordingPath?: string): boolean {
  if (!recordingPath) return false;
  try {
    return fs.existsSync(recordingPath);
  } catch {
    return false;
  }
}

export function buildUserProfileOverview(
  user: UserRecord,
  currentSessionId?: string,
): ProfileOverviewResponse {
  const sanitizedUser = sanitizePublicUser(user);

  // Strict per-user scoping: profile ALWAYS shows ONLY the authenticated user's own real records
  const meetings = (db.get("meetings") || []).filter((m) => m.hostId === user.id);
  const lectures = (db.get("lectures") || []).filter((l) => l.instructorId === user.id);
  const ownedResourceIds = new Set([...meetings.map((m) => m.id), ...lectures.map((l) => l.id)]);

  const tasks = (db.get("actionItems") || []).filter(
    (t) => t.userId === user.id || ownedResourceIds.has(t.meetingId || t.lectureId || ""),
  );
  const quizzes = (db.get("quizzes") || []).filter((q) =>
    ownedResourceIds.has(q.lectureId || q.meetingId || ""),
  );
  const quizIds = new Set(quizzes.map((q) => q.id));
  const quizTitleMap = new Map(quizzes.map((q) => [q.id, q.title]));

  const quizAttempts = (db.get("quizAttempts") || []).filter(
    (a) => a.userId === user.id || quizIds.has(a.quizId),
  );
  const flashcards = (db.get("flashcards") || []).filter((f) =>
    ownedResourceIds.has(f.lectureId || f.meetingId || ""),
  );
  const mindMaps = (db.get("mindMaps") || []).filter((m) =>
    ownedResourceIds.has(m.lectureId || m.meetingId || ""),
  );
  const chatMessages = (db.get("chatMessages") || []).filter((c) => c.userId === user.id);
  const jobs = (db.get("jobs") || []).filter(
    (j) => j.userId === user.id || ownedResourceIds.has(j.resourceId),
  );

  // Unified real recordings list sorted newest first
  const recordings: ProfileRecordingItem[] = [
    ...meetings.map((m) => {
      const mQuizzes = quizzes.filter((q) => q.meetingId === m.id);
      const mTasks = tasks.filter((t) => t.meetingId === m.id);
      const segmentsCount = m.segments?.length || 0;
      const audioAvailable = hasAudioFileOnDisk(m.recordingPath);
      const hasSummary = Boolean(m.summary || m.executiveSummary || m.detailedSummary);
      return {
        id: m.id,
        title: m.title,
        type: "meeting" as const,
        date: m.date,
        durationSeconds: m.durationSeconds || 0,
        status: m.status,
        audioAvailable,
        audioStatus: (audioAvailable ? "ready" : "missing") as "ready" | "missing",
        transcriptionStatus: (segmentsCount > 0
          ? "completed"
          : m.status === "Failed"
            ? "failed"
            : m.status === "Processing" || m.status === "Queued"
              ? "processing"
              : "none") as "completed" | "processing" | "failed" | "none",
        segmentsCount,
        aiStatus: (m.status === "Completed"
          ? "completed"
          : m.status === "Failed"
            ? "failed"
            : m.status === "Queued"
              ? "queued"
              : "processing") as "completed" | "processing" | "failed" | "queued",
        hasSummary,
        hasQuiz: mQuizzes.length > 0,
        quizCount: mQuizzes.length,
        tasksCount: mTasks.length,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      };
    }),
    ...lectures.map((l) => {
      const lQuizzes = quizzes.filter((q) => q.lectureId === l.id);
      const lTasks = tasks.filter((t) => t.lectureId === l.id);
      const segmentsCount = l.segments?.length || 0;
      const audioAvailable = hasAudioFileOnDisk(l.recordingPath);
      const hasSummary = Boolean(
        l.summary || l.executiveSummary || l.detailedSummary || l.studyNotes,
      );
      return {
        id: l.id,
        title: l.title,
        type: "lecture" as const,
        courseCode: l.courseCode,
        date: l.date,
        durationSeconds: l.durationSeconds || 0,
        status: l.status,
        audioAvailable,
        audioStatus: (audioAvailable ? "ready" : "missing") as "ready" | "missing",
        transcriptionStatus: (segmentsCount > 0
          ? "completed"
          : l.status === "Failed"
            ? "failed"
            : l.status === "Processing" || l.status === "Queued"
              ? "processing"
              : "none") as "completed" | "processing" | "failed" | "none",
        segmentsCount,
        aiStatus: (l.status === "Completed"
          ? "completed"
          : l.status === "Failed"
            ? "failed"
            : l.status === "Queued"
              ? "queued"
              : "processing") as "completed" | "processing" | "failed" | "queued",
        hasSummary,
        hasQuiz: lQuizzes.length > 0,
        quizCount: lQuizzes.length,
        tasksCount: lTasks.length,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      };
    }),
  ].sort(
    (a, b) =>
      new Date(b.createdAt || b.date || 0).getTime() -
      new Date(a.createdAt || a.date || 0).getTime(),
  );

  // Real profile completion calculation
  const completionChecks = [
    { key: "Full name", ok: Boolean(user.name && user.name.trim().length >= 2) },
    { key: "Email address", ok: Boolean(user.email && !user.isGuest) },
    { key: "Profile photo", ok: Boolean(user.avatarUrl) },
    { key: "Bio", ok: Boolean(user.bio && user.bio.trim().length > 0) },
    { key: "Job title", ok: Boolean(user.jobTitle && user.jobTitle.trim().length > 0) },
    { key: "Department", ok: Boolean(user.department && user.department.trim().length > 0) },
    { key: "Organization", ok: Boolean(user.organization && user.organization.trim().length > 0) },
  ];
  const completedCount = completionChecks.filter((c) => c.ok).length;
  const profileCompletion = {
    percent: Math.round((completedCount / completionChecks.length) * 100),
    completedCount,
    totalCount: completionChecks.length,
    missingFields: completionChecks.filter((c) => !c.ok).map((c) => c.key),
  };

  // Real dynamically calculated analytics (zero hardcoded values)
  const totalAudioDurationSeconds =
    meetings.reduce((acc, m) => acc + (m.durationSeconds || 0), 0) +
    lectures.reduce((acc, l) => acc + (l.durationSeconds || 0), 0);
  const totalAudioHours = Number((totalAudioDurationSeconds / 3600).toFixed(1));

  const totalTranscriptions = recordings.filter((r) => r.segmentsCount > 0).length;
  const totalTranscriptSegments = recordings.reduce((acc, r) => acc + r.segmentsCount, 0);
  const totalSummaries = recordings.filter((r) => r.hasSummary).length;
  const totalQuizzes = quizzes.length;
  const totalQuizAttempts = quizAttempts.length;
  const averageQuizScore =
    totalQuizAttempts > 0
      ? Math.round(
          quizAttempts.reduce((acc, a) => acc + (a.scorePercent || 0), 0) / totalQuizAttempts,
        )
      : 0;
  const totalFlashcards = flashcards.length;
  const masteredFlashcards = flashcards.filter((f) => f.mastered).length;
  const totalMindMaps = mindMaps.length;
  const totalChatMessages = chatMessages.filter((c) => c.role === "user").length;
  const totalAiOutputs =
    totalTranscriptions + totalSummaries + totalQuizzes + totalFlashcards + totalMindMaps;

  const completedJobs = jobs.filter((j) => j.status === "Completed").length;
  const failedJobs = jobs.filter((j) => j.status === "Failed" || j.status === "Cancelled").length;
  const pendingJobs = jobs.filter(
    (j) => j.status !== "Completed" && j.status !== "Failed" && j.status !== "Cancelled",
  ).length;

  const tasksGenerated = tasks.length;
  const tasksCompleted = tasks.filter((t) => t.completed).length;
  const tasksPending = tasksGenerated - tasksCompleted;
  const taskCompletionRate =
    tasksGenerated > 0 ? Math.round((tasksCompleted / tasksGenerated) * 100) : 0;

  const flashcardReviews = flashcards.reduce((acc, f) => acc + (f.reviewCount || 0), 0);
  const studySessions =
    lectures.filter((l) => l.status === "Completed").length +
    totalQuizAttempts +
    (flashcardReviews > 0 ? Math.ceil(flashcardReviews / 5) : 0);

  // Most active days calculated strictly from user's real timestamps
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayCounts: Record<string, number> = {
    Mon: 0,
    Tue: 0,
    Wed: 0,
    Thu: 0,
    Fri: 0,
    Sat: 0,
    Sun: 0,
  };
  for (const r of recordings) {
    const d = new Date(r.createdAt || r.date);
    if (!Number.isNaN(d.getTime())) {
      const name = dayNames[d.getDay()];
      if (name && dayCounts[name] !== undefined) dayCounts[name]++;
    }
  }
  const mostActiveDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({
    day,
    count: dayCounts[day],
  }));

  const mostUsedAiFeatures = [
    { key: "transcriptions", feature: "AI Transcriptions", count: totalTranscriptions },
    { key: "summaries", feature: "Smart Summaries", count: totalSummaries },
    { key: "quizzes", feature: "Quiz Generator", count: totalQuizzes },
    { key: "flashcards", feature: "Flashcards", count: totalFlashcards },
    { key: "mindmaps", feature: "Mind Maps", count: totalMindMaps },
    { key: "qa", feature: "AI Q&A Assistant", count: totalChatMessages },
  ].sort((a, b) => b.count - a.count);

  const milestones = [
    {
      id: "first_recording",
      title: "First Recording",
      description: "Upload or record your first meeting or lecture.",
      unlocked: recordings.length >= 1,
      current: Math.min(recordings.length, 1),
      target: 1,
    },
    {
      id: "five_recordings",
      title: "Active Documenter",
      description: "Process 5 meetings or lectures with MeetMind AI.",
      unlocked: recordings.length >= 5,
      current: Math.min(recordings.length, 5),
      target: 5,
    },
    {
      id: "ai_insights",
      title: "AI Power User",
      description: "Generate 10 real AI outputs (transcripts, summaries, quizzes, decks).",
      unlocked: totalAiOutputs >= 10,
      current: Math.min(totalAiOutputs, 10),
      target: 10,
    },
    {
      id: "quiz_taker",
      title: "Knowledge Verified",
      description: "Complete at least 1 generated quiz.",
      unlocked: totalQuizAttempts >= 1,
      current: Math.min(totalQuizAttempts, 1),
      target: 1,
    },
    {
      id: "task_finisher",
      title: "Action Finisher",
      description: "Complete 3 extracted or created action items.",
      unlocked: tasksCompleted >= 3,
      current: Math.min(tasksCompleted, 3),
      target: 3,
    },
    {
      id: "complete_profile",
      title: "Profile Complete",
      description: "Complete 100% of your MeetMind AI profile details.",
      unlocked: profileCompletion.percent === 100,
      current: completedCount,
      target: completionChecks.length,
    },
  ];

  // Active sessions strictly scoped to current user
  const now = Date.now();
  const sessions = (db.get("authSessions") || [])
    .filter((s) => s.userId === user.id && !s.revokedAt && new Date(s.expiresAt).getTime() > now)
    .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
    .map((s) => ({
      id: s.id,
      isCurrent: Boolean(currentSessionId && s.id === currentSessionId),
      isGuest: s.isGuest,
      rememberMe: s.rememberMe,
      deviceLabel: summarizeUserAgent(s.userAgent),
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
    }));

  return {
    user: sanitizedUser,
    profileCompletion,
    analytics: {
      totalMeetings: meetings.length,
      totalLectures: lectures.length,
      totalRecordings: recordings.length,
      totalAudioDurationSeconds,
      totalAudioHours,
      totalTranscriptions,
      totalTranscriptSegments,
      totalSummaries,
      totalQuizzes,
      totalQuizAttempts,
      averageQuizScore,
      totalFlashcards,
      masteredFlashcards,
      totalMindMaps,
      totalChatMessages,
      totalAiOutputs,
      completedJobs,
      pendingJobs,
      failedJobs,
      tasksGenerated,
      tasksCompleted,
      tasksPending,
      taskCompletionRate,
      studySessions,
      mostActiveDays,
      mostUsedAiFeatures,
      milestones,
    },
    recordings: recordings.slice(0, 50),
    recentMeetings: meetings.slice(0, 6).map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      durationSeconds: m.durationSeconds || 0,
      status: m.status,
      hasSummary: Boolean(m.summary || m.executiveSummary || m.detailedSummary),
      segmentsCount: m.segments?.length || 0,
    })),
    recentLectures: lectures.slice(0, 6).map((l) => ({
      id: l.id,
      title: l.title,
      courseCode: l.courseCode,
      date: l.date,
      durationSeconds: l.durationSeconds || 0,
      status: l.status,
      hasSummary: Boolean(l.summary || l.executiveSummary || l.detailedSummary || l.studyNotes),
      segmentsCount: l.segments?.length || 0,
    })),
    recentJobs: [...jobs]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 12)
      .map((j) => ({
        id: j.id,
        resourceId: j.resourceId,
        resourceType: j.resourceType,
        fileName: j.originalFilename || j.fileName,
        status: j.status,
        progressPercent: j.progressPercent,
        errorMessage: j.errorMessage,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      })),
    recentQuizAttempts: [...quizAttempts]
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        quizId: a.quizId,
        quizTitle: quizTitleMap.get(a.quizId) || "Generated Quiz",
        scorePercent: a.scorePercent,
        correctCount: a.correctCount,
        totalQuestions: a.totalQuestions,
        submittedAt: a.submittedAt,
      })),
    sessions,
  };
}

export function buildUserDataExport(user: UserRecord) {
  const meetings = (db.get("meetings") || []).filter((m) => m.hostId === user.id);
  const lectures = (db.get("lectures") || []).filter((l) => l.instructorId === user.id);
  const ownedResourceIds = new Set([...meetings.map((m) => m.id), ...lectures.map((l) => l.id)]);

  return {
    exportedAt: new Date().toISOString(),
    application: "MeetMind AI",
    profile: sanitizePublicUser(user),
    meetings: meetings.map(({ recordingPath: _rp, ...rest }) => rest),
    lectures: lectures.map(({ recordingPath: _rp, ...rest }) => rest),
    tasks: (db.get("actionItems") || []).filter(
      (t) => t.userId === user.id || ownedResourceIds.has(t.meetingId || t.lectureId || ""),
    ),
    quizzes: (db.get("quizzes") || []).filter((q) =>
      ownedResourceIds.has(q.lectureId || q.meetingId || ""),
    ),
    quizAttempts: (db.get("quizAttempts") || []).filter((a) => a.userId === user.id),
    flashcards: (db.get("flashcards") || []).filter((f) =>
      ownedResourceIds.has(f.lectureId || f.meetingId || ""),
    ),
    mindMaps: (db.get("mindMaps") || []).filter((m) =>
      ownedResourceIds.has(m.lectureId || m.meetingId || ""),
    ),
    chatHistory: (db.get("chatMessages") || []).filter((c) => c.userId === user.id),
  };
}
