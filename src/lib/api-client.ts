export interface AnalysisRecord {
  summary?: string;
  definitions?: { term: string; definition: string; timestamp?: string }[];
  questionsAsked?: { question: string; answer?: string; timestamp?: string }[];
  actionItems?: {
    task?: string;
    item?: string;
    owner?: string;
    assignee?: string;
    deadline?: string;
    priority?: string;
  }[];
  emphasizedPoints?: string[];
  importantSentences?: (string | { quote: string; context?: string; timestamp?: string })[];
  reviewAreas?: string[];
  keyPoints?: string[];
  decisions?: string[];
  topics?: string[];
}

export interface KeywordItem {
  term: string;
  frequency: number;
  importance: number;
  segmentIds?: string[];
}

export interface HighlightItem {
  quote: string;
  context?: string;
  speaker?: string;
  timestamp: string;
  category: string;
  priority: string;
}

export interface TranscriptSegmentItem {
  id: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
  language?: string;
  isPartial?: boolean;
  chunkIndex?: number;
}

export interface Meeting {
  id: string;
  workspaceId: string;
  title: string;
  hostName: string;
  hostId: string;
  date: string;
  durationSeconds: number;
  participantsCount: number;
  status: "Completed" | "Processing" | "Queued" | "Failed";
  language?: string;
  recordingPath?: string;
  recordingFileName?: string;
  audioUrl?: string;
  summary?: string;
  executiveSummary?: string;
  detailedSummary?: string;
  keyPoints?: string[];
  decisions?: string[];
  topics?: string[];
  keywords?: KeywordItem[];
  highlights?: HighlightItem[];
  analysis?: AnalysisRecord;
  segments: TranscriptSegmentItem[];
}

export interface Lecture {
  id: string;
  workspaceId: string;
  title: string;
  courseCode: string;
  instructorName: string;
  instructorId: string;
  date: string;
  durationSeconds: number;
  status: "Completed" | "Processing" | "Queued" | "Failed";
  language?: string;
  recordingPath?: string;
  recordingFileName?: string;
  audioUrl?: string;
  summary?: string;
  executiveSummary?: string;
  detailedSummary?: string;
  studyNotes?: string;
  keyConcepts?: { term: string; definition: string }[];
  examHighlights?: string[];
  topics?: string[];
  keywords?: KeywordItem[];
  highlights?: HighlightItem[];
  analysis?: AnalysisRecord;
  segments: TranscriptSegmentItem[];
}

export interface ActionItem {
  id: string;
  meetingId?: string;
  lectureId?: string;
  title: string;
  ownerName?: string;
  dueDate?: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type?: "multiple_choice" | "true_false" | "short_answer" | "fill_in_the_blank";
  options: string[];
  correctOptionIndex: number;
  correctAnswerText?: string;
  acceptableAnswers?: string[];
  explanation: string;
  difficulty?: "easy" | "medium" | "hard";
  sectionRef?: string;
  timestampRef?: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  lectureId?: string;
  userId: string;
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  answers: Record<string, string | number>;
  submittedAt: string;
}

export interface Quiz {
  id: string;
  lectureId?: string;
  meetingId?: string;
  title: string;
  courseCode?: string;
  questions: QuizQuestion[];
  attemptsCount: number;
  lastScore?: number;
}

export interface Flashcard {
  id: string;
  deckId: string;
  deckTitle: string;
  lectureId?: string;
  front: string;
  back: string;
  mastered: boolean;
  reviewCount: number;
}

export interface MindMapNode {
  id: string;
  label: string;
  description?: string;
  children?: MindMapNode[];
}

export interface MindMap {
  id: string;
  title: string;
  lectureId?: string;
  rootNode: MindMapNode;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  targetUrl: string;
  read: boolean;
  type: "summary" | "task" | "mention" | "quiz" | "alert";
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  kind: "meeting" | "lecture" | "task" | "deadline";
  referenceId?: string;
  attendeesCount?: number;
}

export interface DashboardMetrics {
  totalMeetings: number;
  totalLectures: number;
  totalAudioDurationSeconds?: number;
  totalAudioHours?: number;
  totalTranscripts?: number;
  totalSummaries?: number;
  totalQuizzes?: number;
  totalQuizAttempts?: number;
  completedTasks: number;
  pendingTasks: number;
  processingJobs: number;
  hoursSaved?: number;
  recentMeetings: Meeting[];
  recentLectures: Lecture[];
  tasks: ActionItem[];
}

export interface Job {
  id: string;
  status: string;
  progressPercent: number;
  resourceType: string;
  resourceId: string;
  errorMessage?: string;
}

export interface DashboardTrends {
  weekly: { day: string; meetings: number; lectures: number }[];
  meetingTrend: { m: string; value: number }[];
}

export interface GroundedAnswer {
  answer: string;
  evidenceFound?: boolean;
  citations: { speaker: string; timestamp: string; quote: string }[];
  suggestedFollowUps?: string[];
}

function sanitizeAsciiHeaderValue(value: string): string {
  // HTTP fetch headers only permit ISO-8859-1 / ASCII bytes; strip non-ASCII code points defensively
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0x20 && code <= 0x7e) {
      out += value[i];
    }
  }
  return out.trim();
}

function createAsciiRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

class ApiClient {
  private buildHeaders(
    extra?: HeadersInit,
    options?: { isFormData?: boolean },
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Request-ID": createAsciiRequestId(),
    };

    if (!options?.isFormData) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("meetmind_token") || sessionStorage.getItem("meetmind_token")
          : null;
      if (token) {
        const cleanToken = sanitizeAsciiHeaderValue(token);
        if (cleanToken) headers["Authorization"] = `Bearer ${cleanToken}`;
      }
    } catch {
      // ignore storage restrictions
    }

    if (extra) {
      const pairs =
        extra instanceof Headers
          ? Array.from(extra.entries())
          : Array.isArray(extra)
            ? extra
            : Object.entries(extra);
      for (const [key, val] of pairs) {
        if (options?.isFormData && key.toLowerCase() === "content-type") {
          continue;
        }
        const cleanKey = sanitizeAsciiHeaderValue(key);
        const cleanVal = sanitizeAsciiHeaderValue(String(val));
        if (cleanKey && cleanVal) {
          headers[cleanKey] = cleanVal;
        }
      }
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { timeoutMs?: number; retries?: number } = {},
  ): Promise<T> {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const timeoutMs = options.timeoutMs ?? 60000;
    const method = (options.method || "GET").toUpperCase();
    const maxRetries = options.retries ?? (method === "GET" ? 1 : 0);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(endpoint, {
          ...options,
          headers: this.buildHeaders(options.headers, { isFormData }),
          signal: options.signal || controller.signal,
        });

        clearTimeout(timeoutHandle);

        if (!res.ok) {
          let msg = `HTTP error ${res.status}`;
          try {
            const errorJson = await res.json();
            if (errorJson?.error) msg = errorJson.error;
            else if (errorJson?.detail) msg = errorJson.detail;
          } catch {
            // ignore parse errors
          }
          throw new Error(msg);
        }

        return (await res.json()) as Promise<T>;
      } catch (err) {
        clearTimeout(timeoutHandle);
        lastError = err instanceof Error ? err : new Error("Network request failed");
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
          continue;
        }
      }
    }

    throw lastError || new Error("Request failed");
  }

  // Dashboard
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return this.request<DashboardMetrics>("/api/v1/dashboard/metrics");
  }

  async getDashboardTrends(): Promise<DashboardTrends> {
    return this.request<DashboardTrends>("/api/v1/dashboard/trends");
  }

  async getDashboardActivity(): Promise<
    { id: string; who: string; what: string; where: string; when: string }[]
  > {
    return this.request("/api/v1/dashboard/activity");
  }

  // Meetings
  async getMeetings(): Promise<Meeting[]> {
    return this.request<Meeting[]>("/api/v1/meetings");
  }

  async getMeeting(id: string): Promise<Meeting> {
    return this.request<Meeting>(`/api/v1/meetings/${id}`);
  }

  async createMeeting(data: {
    title: string;
    hostName?: string;
    date?: string;
    durationMinutes?: number;
    participantsCount?: number;
  }): Promise<Meeting> {
    return this.request<Meeting>("/api/v1/meetings", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteMeeting(id: string): Promise<{ success: boolean; id: string }> {
    return this.request<{ success: boolean; id: string }>(`/api/v1/meetings/${id}`, {
      method: "DELETE",
    });
  }

  async deleteAllMeetings(): Promise<{ success: boolean; count: number }> {
    return this.request<{ success: boolean; count: number }>("/api/v1/meetings/all", {
      method: "DELETE",
    });
  }

  // Lectures
  async getLectures(): Promise<Lecture[]> {
    return this.request<Lecture[]>("/api/v1/lectures");
  }

  async getLecture(id: string): Promise<Lecture> {
    return this.request<Lecture>(`/api/v1/lectures/${id}`);
  }

  async createLecture(data: {
    title: string;
    courseCode: string;
    instructorName?: string;
    date?: string;
    durationMinutes?: number;
  }): Promise<Lecture> {
    return this.request<Lecture>("/api/v1/lectures", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteLecture(id: string): Promise<{ success: boolean; id: string }> {
    return this.request<{ success: boolean; id: string }>(`/api/v1/lectures/${id}`, {
      method: "DELETE",
    });
  }

  async deleteAllLectures(): Promise<{ success: boolean; count: number }> {
    return this.request<{ success: boolean; count: number }>("/api/v1/lectures/all", {
      method: "DELETE",
    });
  }

  // Upload recording (uses centralized request builder so Content-Type boundary is auto-set & headers are pure ASCII)
  async uploadRecording(
    formData: FormData,
    idempotencyKey?: string,
  ): Promise<{
    message: string;
    jobId: string;
    resourceId: string;
    resourceType: string;
    deduplicated?: boolean;
  }> {
    const extraHeaders: Record<string, string> = {};
    if (idempotencyKey) {
      const safeKey = sanitizeAsciiHeaderValue(idempotencyKey);
      if (safeKey) extraHeaders["Idempotency-Key"] = safeKey;
    }
    return this.request("/api/v1/recordings/upload", {
      method: "POST",
      headers: extraHeaders,
      body: formData,
      timeoutMs: 300000,
    });
  }

  async deleteAllRecordings(): Promise<{ success: boolean; deletedCount: number }> {
    return this.request<{ success: boolean; deletedCount: number }>("/api/v1/recordings/all", {
      method: "DELETE",
    });
  }

  async reprocessRecording(
    id: string,
  ): Promise<{ success: boolean; jobId: string; resourceId: string; status: string }> {
    return this.request(`/api/v1/recordings/${id}/reprocess`, {
      method: "POST",
    });
  }

  // Jobs
  async getJob(id: string): Promise<Job> {
    return this.request(`/api/v1/jobs/${id}`);
  }

  async cancelJob(id: string): Promise<{ success: boolean; job: Job }> {
    return this.request<{ success: boolean; job: Job }>(`/api/v1/jobs/${id}/cancel`, {
      method: "POST",
    });
  }

  // Transcripts
  async getTranscript(id: string): Promise<{
    id: string;
    title: string;
    type: string;
    segments: TranscriptSegmentItem[];
    keywords?: KeywordItem[];
    highlights?: HighlightItem[];
  }> {
    return this.request(`/api/v1/transcripts/${id}`);
  }

  async updateTranscript(
    id: string,
    segments: TranscriptSegmentItem[],
  ): Promise<{ success: boolean }> {
    return this.request(`/api/v1/transcripts/${id}`, {
      method: "PUT",
      body: JSON.stringify({ segments }),
    });
  }

  async renameSpeaker(
    id: string,
    speakerMap: Record<string, string>,
  ): Promise<{ success: boolean; updatedSegments: number; segments: TranscriptSegmentItem[] }> {
    return this.request(`/api/v1/transcripts/${id}/speakers`, {
      method: "PUT",
      body: JSON.stringify({ speakerMap }),
    });
  }

  getTranscriptExportUrl(id: string, format: "html" | "txt" = "html"): string {
    return `/api/v1/transcripts/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`;
  }

  async exportTranscriptHtml(id: string): Promise<string> {
    const res = await fetch(this.getTranscriptExportUrl(id, "html"), {
      headers: this.buildHeaders({ Accept: "text/html" }, { isFormData: true }),
    });
    if (!res.ok) throw new Error("Failed to render export");
    return res.text();
  }

  async getSyncStatus(): Promise<{ type: string; id?: string; timestamp: number }> {
    return this.request("/api/v1/sync/status");
  }

  async sendLiveChunk(data: {
    recordingId: string | null;
    audioBase64: string;
    mimeType: string;
    chunkIndex: number;
    startTime: number;
    endTime: number;
    speaker: string;
    language: string;
    interimText?: string;
    recentContext?: string;
  }): Promise<{
    success: boolean;
    chunkIndex: number;
    startTime: number;
    endTime: number;
    speaker: string;
    arabicText?: string;
    text?: string;
    detectedLanguage?: string;
    savedToDb?: boolean;
  }> {
    return this.request("/api/v1/transcripts/live-chunk", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Live Recording Session & Real-Time Autosave
  async startRecordingSession(data: {
    type: "meeting" | "lecture";
    title: string;
    courseCode?: string;
    speakerName?: string;
  }): Promise<{
    success: boolean;
    recordingId: string;
    resourceId: string;
    type: string;
    title: string;
  }> {
    return this.request("/api/v1/recordings/session/start", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async appendTranscriptSegment(data: {
    recordingId: string;
    segment: {
      id?: string;
      speaker: string;
      startTime: number;
      endTime: number;
      text: string;
      isFinal?: boolean;
    };
  }): Promise<{ success: boolean; recordingId: string; totalSegments: number; saved: boolean }> {
    return this.request("/api/v1/transcripts/session/append-segment", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getRecordingSessionTranscript(recordingId: string): Promise<{
    success: boolean;
    recordingId: string;
    title: string;
    status: string;
    segments: Meeting["segments"];
    fullText: string;
    durationSeconds: number;
  }> {
    return this.request(`/api/v1/transcripts/session/${recordingId}`);
  }

  async finalizeLiveSession(data: {
    recordingId?: string;
    type: "meeting" | "lecture";
    title: string;
    courseCode?: string;
    language?: string;
    segments?: TranscriptSegmentItem[];
    durationSeconds: number;
    audioBase64?: string;
  }): Promise<{
    success: boolean;
    resourceId: string;
    segmentsCount: number;
    hasAudio: boolean;
    status: string;
  }> {
    return this.request("/api/v1/transcripts/live-session/finalize", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // AI & Q&A
  async askQuestion(
    question: string,
    resourceId?: string,
    history?: Array<{ role: "user" | "model"; text: string }>,
  ): Promise<GroundedAnswer> {
    return this.request<GroundedAnswer>("/api/v1/ai/ask", {
      method: "POST",
      body: JSON.stringify({ question, resourceId, history }),
    });
  }

  async retryJob(jobId: string): Promise<{ success: boolean; job: Job }> {
    return this.request<{ success: boolean; job: Job }>(`/api/v1/jobs/${jobId}/retry`, {
      method: "POST",
    });
  }

  // Tasks
  async getTasks(): Promise<ActionItem[]> {
    return this.request<ActionItem[]>("/api/v1/tasks");
  }

  async createTask(data: {
    title: string;
    ownerName?: string;
    dueDate?: string;
    priority?: "high" | "medium" | "low";
    meetingId?: string;
  }): Promise<ActionItem> {
    return this.request<ActionItem>("/api/v1/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTask(id: string, updates: Partial<ActionItem>): Promise<ActionItem> {
    return this.request<ActionItem>(`/api/v1/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteTask(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/v1/tasks/${id}`, {
      method: "DELETE",
    });
  }

  // Quizzes
  async getQuizzes(): Promise<Quiz[]> {
    return this.request<Quiz[]>("/api/v1/quizzes");
  }

  async generateNewQuiz(
    lectureId: string,
    options?: { avoidQuestionTitles?: string[]; variant?: number },
  ): Promise<Quiz> {
    return this.request<Quiz>("/api/v1/quizzes/generate", {
      method: "POST",
      body: JSON.stringify({ lectureId, ...options }),
    });
  }

  async getQuizAttempts(quizId?: string): Promise<QuizAttempt[]> {
    const url = quizId
      ? `/api/v1/quizzes/attempts?quizId=${encodeURIComponent(quizId)}`
      : "/api/v1/quizzes/attempts";
    return this.request<QuizAttempt[]>(url);
  }

  async submitQuizAttempt(
    quizId: string,
    answers: Record<string, string | number>,
  ): Promise<{
    quizId: string;
    attemptId?: string;
    totalQuestions: number;
    correctCount: number;
    scorePercent: number;
    results: {
      questionId: string;
      type: string;
      userAnswer: string | number;
      chosenOptionIndex?: number;
      correctOptionIndex: number;
      correctAnswerText?: string;
      isCorrect: boolean;
      explanation: string;
    }[];
  }> {
    return this.request(`/api/v1/quizzes/${quizId}/attempt`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
  }

  // Flashcards
  async getFlashcards(): Promise<Flashcard[]> {
    return this.request<Flashcard[]>("/api/v1/flashcards");
  }

  async generateFlashcards(params?: {
    lectureId?: string;
    meetingId?: string;
  }): Promise<Flashcard[]> {
    return this.request<Flashcard[]>("/api/v1/flashcards/generate", {
      method: "POST",
      body: JSON.stringify(params || {}),
    });
  }

  async updateFlashcard(id: string, updates: Partial<Flashcard>): Promise<Flashcard> {
    return this.request<Flashcard>(`/api/v1/flashcards/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  // Mind maps
  async getMindMaps(): Promise<MindMap[]> {
    return this.request<MindMap[]>("/api/v1/mindmaps");
  }

  async generateMindMap(params?: { lectureId?: string; meetingId?: string }): Promise<MindMap> {
    return this.request<MindMap>("/api/v1/mindmaps/generate", {
      method: "POST",
      body: JSON.stringify(params || {}),
    });
  }

  // Calendar
  async getCalendarEvents(): Promise<CalendarEvent[]> {
    return this.request<CalendarEvent[]>("/api/v1/calendar");
  }

  async createCalendarEvent(event: Omit<CalendarEvent, "id">): Promise<CalendarEvent> {
    return this.request<CalendarEvent>("/api/v1/calendar", {
      method: "POST",
      body: JSON.stringify(event),
    });
  }

  // Notifications
  async getNotifications(): Promise<NotificationItem[]> {
    return this.request<NotificationItem[]>("/api/v1/notifications");
  }

  async markNotificationRead(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/v1/notifications/${id}/read`, {
      method: "PUT",
    });
  }

  async markAllNotificationsRead(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/api/v1/notifications/read-all", {
      method: "PUT",
    });
  }

  // Reports
  async getReports(): Promise<{
    totalRecordings: number;
    totalAudioHours: number;
    totalDecisions: number;
    taskCompletionRate: number;
    meetingsBreakdown: { title: string; date: string; duration: string; status: string }[];
    lecturesBreakdown: {
      title: string;
      course: string;
      date: string;
      duration: string;
      status: string;
    }[];
  }> {
    return this.request("/api/v1/reports");
  }

  // Search
  async search(query: string): Promise<{
    query: string;
    meetings: Meeting[];
    lectures: Lecture[];
    tasks: ActionItem[];
    transcripts: {
      id: string;
      title: string;
      quote: string;
      time: number;
      type?: "meeting" | "lecture";
      courseCode?: string;
    }[];
  }> {
    return this.request(`/api/v1/search?q=${encodeURIComponent(query)}`);
  }

  // Users
  async getUsers(): Promise<
    {
      id: string;
      name: string;
      email: string;
      role: string;
      department?: string;
      initials: string;
    }[]
  > {
    return this.request("/api/v1/users");
  }

  async inviteUser(data: {
    email: string;
    name: string;
    role: string;
    department?: string;
  }): Promise<{ id: string }> {
    return this.request("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // AI Structured Generation
  async generateSummary(
    resourceId: string,
    type: "meeting" | "lecture",
  ): Promise<{ success: boolean; summary: string }> {
    return this.request<{ success: boolean; summary: string }>("/api/v1/ai/generate-summary", {
      method: "POST",
      body: JSON.stringify({ resourceId, type }),
    });
  }

  async generateQuiz(
    resourceId: string,
    type: "meeting" | "lecture" = "lecture",
    numQuestions: number = 5,
  ): Promise<{ success: boolean; quiz: Quiz }> {
    return this.request<{ success: boolean; quiz: Quiz }>("/api/v1/ai/generate-quiz", {
      method: "POST",
      body: JSON.stringify({ resourceId, type, numQuestions }),
    });
  }

  async generateAnalysis(
    resourceId: string,
    type: "meeting" | "lecture" = "lecture",
  ): Promise<{ success: boolean; analysis: AnalysisRecord }> {
    return this.request<{ success: boolean; analysis: AnalysisRecord }>(
      "/api/v1/ai/generate-analysis",
      {
        method: "POST",
        body: JSON.stringify({ resourceId, type }),
      },
    );
  }

  // System Administration: Reset & Backup
  async resetSystem(confirm: boolean = true): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>("/api/v1/system/reset", {
      method: "POST",
      body: JSON.stringify({ confirm }),
    });
  }

  async getSystemBackup(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/v1/system/backup");
  }

  async restoreSystem(
    data: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>("/api/v1/system/restore", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
