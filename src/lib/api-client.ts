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
  importantSentences?: string[];
  reviewAreas?: string[];
  keyPoints?: string[];
  decisions?: string[];
  topics?: string[];
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
  recordingPath?: string;
  recordingFileName?: string;
  audioUrl?: string;
  summary?: string;
  keyPoints?: string[];
  decisions?: string[];
  topics?: string[];
  analysis?: AnalysisRecord;
  segments: {
    id: string;
    speaker: string;
    startTime: number;
    endTime: number;
    text: string;
  }[];
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
  recordingPath?: string;
  recordingFileName?: string;
  audioUrl?: string;
  studyNotes?: string;
  keyConcepts?: { term: string; definition: string }[];
  examHighlights?: string[];
  topics?: string[];
  analysis?: AnalysisRecord;
  segments: {
    id: string;
    speaker: string;
    startTime: number;
    endTime: number;
    text: string;
  }[];
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
  options: string[];
  correctOptionIndex: number;
  explanation: string;
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
  completedTasks: number;
  pendingTasks: number;
  processingJobs: number;
  recentMeetings: Meeting[];
  recentLectures: Lecture[];
  tasks: ActionItem[];
}

export interface DashboardTrends {
  weekly: { day: string; meetings: number; lectures: number }[];
  meetingTrend: { m: string; value: number }[];
}

export interface GroundedAnswer {
  answer: string;
  citations: { speaker: string; timestamp: string; quote: string }[];
  suggestedFollowUps?: string[];
}

class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      let msg = `HTTP error ${res.status}`;
      try {
        const errorJson = await res.json();
        if (errorJson.error) msg = errorJson.error;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }

    return res.json() as Promise<T>;
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

  async deleteMeeting(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/v1/meetings/${id}`, {
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

  async deleteLecture(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/v1/lectures/${id}`, {
      method: "DELETE",
    });
  }

  // Upload recording
  async uploadRecording(formData: FormData): Promise<{
    message: string;
    jobId: string;
    resourceId: string;
    resourceType: string;
  }> {
    const res = await fetch("/api/v1/recordings/upload", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      throw new Error("Failed to upload recording");
    }
    return res.json();
  }

  // Jobs
  async getJob(id: string): Promise<{
    id: string;
    status: string;
    progressPercent: number;
    resourceType: string;
    resourceId: string;
  }> {
    return this.request(`/api/v1/jobs/${id}`);
  }

  // Transcripts
  async getTranscript(id: string): Promise<{
    id: string;
    title: string;
    type: string;
    segments: Meeting["segments"];
  }> {
    return this.request(`/api/v1/transcripts/${id}`);
  }

  async updateTranscript(id: string, segments: Meeting["segments"]): Promise<{ success: boolean }> {
    return this.request(`/api/v1/transcripts/${id}`, {
      method: "PUT",
      body: JSON.stringify({ segments }),
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
    segments?: Meeting["segments"];
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

  async submitQuizAttempt(
    quizId: string,
    answers: Record<string, number>,
  ): Promise<{
    quizId: string;
    totalQuestions: number;
    correctCount: number;
    scorePercent: number;
    results: {
      questionId: string;
      chosenOptionIndex: number;
      correctOptionIndex: number;
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
    transcripts: { id: string; title: string; quote: string; time: number }[];
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

  // Deletion operations with physical file and data cascade
  async deleteMeeting(id: string): Promise<{ success: boolean; id: string }> {
    return this.request<{ success: boolean; id: string }>(`/api/v1/meetings/${id}`, {
      method: "DELETE",
    });
  }

  async deleteLecture(id: string): Promise<{ success: boolean; id: string }> {
    return this.request<{ success: boolean; id: string }>(`/api/v1/lectures/${id}`, {
      method: "DELETE",
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
    const res = await fetch("/api/v1/system/backup");
    if (!res.ok) throw new Error("Failed to download system backup");
    return res.json();
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
