import fs from "node:fs";
import { getDataDir, getDbFilePath, getRecordingsDir } from "./storage";

const DATA_DIR = getDataDir();
const DB_FILE = getDbFilePath();
const RECORDINGS_DIR = getRecordingsDir();

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "admin" | "member" | "student" | "instructor" | "guest";
  authProvider?: "local" | "google" | "guest";
  googleSub?: string;
  emailVerified?: boolean;
  isGuest?: boolean;
  avatarUrl?: string;
  avatarFileName?: string;
  bio?: string;
  jobTitle?: string;
  department?: string;
  organization?: string;
  nameCustomized?: boolean;
  avatarCustomized?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  isGuest: boolean;
  rememberMe: boolean;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface RevokedTokenRecord {
  jti: string;
  exp: number;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: "enterprise" | "pro" | "team";
  createdAt: string;
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  startTime: number; // in seconds
  endTime: number;
  text: string;
  confidence?: number;
  language?: string;
  isPartial?: boolean;
  chunkIndex?: number;
  sequenceNumber?: number;
  chunkId?: string;
}

export interface KeywordItem {
  term: string;
  frequency: number;
  importance: number;
  segmentIds?: string[];
  context?: string;
  timestamp?: string;
}

export interface HighlightItem {
  quote: string;
  context?: string;
  speaker?: string;
  timestamp?: string;
  category: string;
  priority: string;
}

export interface ActionItemRecord {
  id: string;
  userId?: string;
  meetingId?: string;
  lectureId?: string;
  title: string;
  ownerName?: string;
  dueDate?: string;
  deadlineText?: string;
  sourceTimestamp?: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
  createdAt: string;
}

export interface MeetingRecord {
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
  analysis?: {
    topics: string[];
    keywords: string[];
    definitions: Array<{ term: string; definition: string; timestamp?: string }>;
    questionsAsked: Array<{ question: string; answer?: string; timestamp?: string }>;
    actionItems: Array<{ task: string; owner?: string; deadline?: string }>;
    emphasizedPoints: string[];
    reviewAreas: string[];
  };
  fullText?: string;
  segments: TranscriptSegment[];
  createdAt: string;
  updatedAt: string;
}

export interface LectureRecord {
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
  studyNotes?: string;
  summary?: string;
  executiveSummary?: string;
  detailedSummary?: string;
  keyConcepts?: { term: string; definition: string }[];
  examHighlights?: string[];
  topics?: string[];
  keywords?: KeywordItem[];
  highlights?: HighlightItem[];
  analysis?: {
    topics: string[];
    keywords: string[];
    definitions: Array<{ term: string; definition: string; timestamp?: string }>;
    questionsAsked: Array<{ question: string; answer?: string; timestamp?: string }>;
    actionItems: Array<{ task: string; owner?: string; deadline?: string }>;
    emphasizedPoints: string[];
    reviewAreas: string[];
  };
  fullText?: string;
  segments: TranscriptSegment[];
  createdAt: string;
  updatedAt: string;
}

export interface RecordingSessionRecord {
  id: string;
  userId?: string;
  type: "meeting" | "lecture";
  title: string;
  courseCode?: string;
  speakerName?: string;
  language?: string;
  status:
    "Recording" | "Paused" | "Interrupted" | "Recovering" | "Processing" | "Completed" | "Failed";
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  segmentsCount: number;
  lastSequenceNumber?: number;
  receivedChunkIds?: string[];
  durationSeconds?: number;
  errorMessage?: string;
}

export interface QuizQuestionRecord {
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
  sourceReference?: string;
  sourceTranscriptSegment?: string;
  groundingVerified?: boolean;
}

export interface QuizAttemptRecord {
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

export interface QuizRecord {
  id: string;
  lectureId?: string;
  meetingId?: string;
  title: string;
  courseCode?: string;
  questions: QuizQuestionRecord[];
  attemptsCount: number;
  lastScore?: number;
  createdAt: string;
}

export interface FlashcardRecord {
  id: string;
  deckId: string;
  deckTitle: string;
  lectureId?: string;
  meetingId?: string;
  front: string;
  back: string;
  sourceReference?: string;
  topic?: string;
  difficulty?: "easy" | "medium" | "hard";
  mastered: boolean;
  reviewCount: number;
  createdAt: string;
}

export interface ChatMessageRecord {
  id: string;
  userId: string;
  resourceId?: string;
  role: "user" | "assistant";
  content: string;
  evidenceFound?: boolean;
  citations?: { speaker: string; timestamp: string; quote: string }[];
  createdAt: string;
}

export interface MindMapNode {
  id: string;
  label: string;
  description?: string;
  children?: MindMapNode[];
}

export interface MindMapRecord {
  id: string;
  title: string;
  lectureId?: string;
  meetingId?: string;
  rootNode: MindMapNode;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  body: string;
  targetUrl: string;
  read: boolean;
  type: "summary" | "task" | "mention" | "quiz" | "alert";
  createdAt: string;
}

export interface CalendarEventRecord {
  id: string;
  title: string;
  date: string; // ISO format or YYYY-MM-DD
  time: string;
  kind: "meeting" | "lecture" | "task" | "deadline";
  referenceId?: string;
  attendeesCount?: number;
}

export type JobStatus =
  | "Uploaded"
  | "Validating"
  | "ExtractingAudio"
  | "Queued"
  | "Transcribing"
  | "Translating"
  | "Merging"
  | "Analyzing"
  | "Generating Quiz"
  | "Completed"
  | "Failed"
  | "Cancelled";

export interface JobRecord {
  id: string;
  userId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  type: "transcription" | "analysis" | "quiz_generation";
  status: JobStatus;
  stage?: string;
  progressPercent: number;
  resourceType: "meeting" | "lecture";
  resourceId: string;
  fileName: string;
  filePath?: string;
  originalFilename?: string;
  language?: string;
  retryCount?: number;
  maxRetries?: number;
  failureCategory?: string;
  failureTimestamp?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditRecord {
  id: string;
  userId: string;
  action: string;
  resource: string;
  timestamp: string;
}

export interface DatabaseSchema {
  users: UserRecord[];
  authSessions: AuthSessionRecord[];
  passwordResetTokens: PasswordResetTokenRecord[];
  revokedTokens: RevokedTokenRecord[];
  workspaces: WorkspaceRecord[];
  meetings: MeetingRecord[];
  lectures: LectureRecord[];
  actionItems: ActionItemRecord[];
  quizzes: QuizRecord[];
  quizAttempts: QuizAttemptRecord[];
  flashcards: FlashcardRecord[];
  mindMaps: MindMapRecord[];
  chatMessages: ChatMessageRecord[];
  notifications: NotificationRecord[];
  calendarEvents: CalendarEventRecord[];
  jobs: JobRecord[];
  auditLogs: AuditRecord[];
  recordingSessions: RecordingSessionRecord[];
  deletedResourceIds: string[];
}

function getInitialData(): DatabaseSchema {
  const now = new Date().toISOString();
  return {
    users: [],
    authSessions: [],
    passwordResetTokens: [],
    revokedTokens: [],
    workspaces: [
      {
        id: "ws_default",
        name: "MeetMind AI Workspace",
        slug: "meetmind-workspace",
        ownerId: "system",
        plan: "enterprise",
        createdAt: now,
      },
    ],
    // Clean initial state with zero pre-baked or fake records
    meetings: [],
    lectures: [],
    actionItems: [],
    quizzes: [],
    quizAttempts: [],
    flashcards: [],
    mindMaps: [],
    chatMessages: [],
    notifications: [],
    calendarEvents: [],
    jobs: [],
    recordingSessions: [],
    deletedResourceIds: [],
    auditLogs: [
      {
        id: `aud_${Date.now()}`,
        userId: "usr_admin",
        action: "SYSTEM_INITIALIZED_CLEAN",
        resource: "System",
        timestamp: now,
      },
    ],
  };
}

class DatabaseManager {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed: DatabaseSchema = JSON.parse(raw);
        if (!parsed.authSessions) parsed.authSessions = [];
        if (!parsed.passwordResetTokens) parsed.passwordResetTokens = [];
        if (!parsed.revokedTokens) parsed.revokedTokens = [];
        if (!parsed.recordingSessions) parsed.recordingSessions = [];
        if (!parsed.quizAttempts) parsed.quizAttempts = [];
        if (!parsed.deletedResourceIds) parsed.deletedResourceIds = [];
        if (!parsed.flashcards) parsed.flashcards = [];
        if (!parsed.mindMaps) parsed.mindMaps = [];
        if (!parsed.chatMessages) parsed.chatMessages = [];
        return parsed;
      }
    } catch (err) {
      console.error("Failed to read database file, reinitializing", err);
    }
    const initial = getInitialData();
    this.saveData(initial);
    return initial;
  }

  private saveData(data: DatabaseSchema) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to persist database file", err);
    }
  }

  public get<K extends keyof DatabaseSchema>(key: K): DatabaseSchema[K] {
    return this.data[key];
  }

  public update<K extends keyof DatabaseSchema>(
    key: K,
    updater: (current: DatabaseSchema[K]) => DatabaseSchema[K],
  ): DatabaseSchema[K] {
    this.data[key] = updater(this.data[key]);
    this.saveData(this.data);
    return this.data[key];
  }

  public full(): DatabaseSchema {
    return this.data;
  }

  public backupData(): DatabaseSchema {
    return JSON.parse(JSON.stringify(this.data));
  }

  public resetData(): DatabaseSchema {
    const clean = getInitialData();
    this.data = clean;
    this.saveData(clean);
    return clean;
  }

  public restoreData(backup: DatabaseSchema): DatabaseSchema {
    this.data = backup;
    this.saveData(backup);
    return backup;
  }
}

export const db = new DatabaseManager();
