import fs from "node:fs";
import path from "node:path";
import { buildAuthenticLectureRecord } from "./lecture-data";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "meetmind_db.json");
const RECORDINGS_DIR = path.join(DATA_DIR, "recordings");

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
  role: "admin" | "member" | "student" | "instructor";
  avatarUrl?: string;
  department?: string;
  createdAt: string;
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
}

export interface ActionItemRecord {
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
  recordingPath?: string;
  recordingFileName?: string;
  audioUrl?: string;
  summary?: string;
  keyPoints?: string[];
  decisions?: string[];
  topics?: string[];
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
  recordingPath?: string;
  recordingFileName?: string;
  audioUrl?: string;
  studyNotes?: string;
  summary?: string;
  keyConcepts?: { term: string; definition: string }[];
  examHighlights?: string[];
  topics?: string[];
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
  type: "meeting" | "lecture";
  title: string;
  courseCode?: string;
  speakerName?: string;
  status: "Recording" | "Processing" | "Completed" | "Failed";
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  segmentsCount: number;
}

export interface QuizQuestionRecord {
  id: string;
  question: string;
  type?: "multiple_choice" | "true_false" | "short_answer";
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  timestampRef?: string;
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
  front: string;
  back: string;
  mastered: boolean;
  reviewCount: number;
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
  | "Queued"
  | "Transcribing"
  | "Translating"
  | "Merging"
  | "Analyzing"
  | "Generating Quiz"
  | "Completed"
  | "Failed";

export interface JobRecord {
  id: string;
  type: "transcription" | "analysis" | "quiz_generation";
  status: JobStatus;
  progressPercent: number;
  resourceType: "meeting" | "lecture";
  resourceId: string;
  fileName: string;
  filePath?: string;
  originalFilename?: string;
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
  workspaces: WorkspaceRecord[];
  meetings: MeetingRecord[];
  lectures: LectureRecord[];
  actionItems: ActionItemRecord[];
  quizzes: QuizRecord[];
  flashcards: FlashcardRecord[];
  mindMaps: MindMapRecord[];
  notifications: NotificationRecord[];
  calendarEvents: CalendarEventRecord[];
  jobs: JobRecord[];
  auditLogs: AuditRecord[];
  recordingSessions: RecordingSessionRecord[];
}

function getInitialData(): DatabaseSchema {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: "usr_admin",
        email: "alex.kim@acme.edu",
        name: "Alex Kim",
        passwordHash: "hash_admin_123456", // Default dev login
        role: "admin",
        department: "Computer Science & Engineering",
        createdAt: now,
      },
      {
        id: "usr_ava",
        email: "ava.chen@acme.edu",
        name: "Ava Chen",
        passwordHash: "hash_user_123456",
        role: "member",
        department: "Product Architecture",
        createdAt: now,
      },
      {
        id: "usr_marcus",
        email: "marcus.lee@acme.edu",
        name: "Marcus Lee",
        passwordHash: "hash_user_123456",
        role: "member",
        department: "Design Systems",
        createdAt: now,
      },
      {
        id: "usr_priya",
        email: "priya.patel@acme.edu",
        name: "Priya Patel",
        passwordHash: "hash_user_123456",
        role: "instructor",
        department: "Distributed Systems",
        createdAt: now,
      },
    ],
    workspaces: [
      {
        id: "ws_default",
        name: "Acme University & Labs",
        slug: "acme-labs",
        ownerId: "usr_admin",
        plan: "enterprise",
        createdAt: now,
      },
    ],
    // Clean initial state as explicitly requested by user
    meetings: [],
    lectures: [buildAuthenticLectureRecord().lecture],
    actionItems: buildAuthenticLectureRecord().tasks,
    quizzes: [buildAuthenticLectureRecord().quiz],
    flashcards: [],
    mindMaps: [],
    notifications: [
      {
        id: `notif_authentic_ready`,
        userId: "usr_admin",
        title: "اكتمل تفريغ المحاضرة بدقة تامة",
        body: 'تم تفريغ وتحليل "محاضرة: فقه التسامح وبناء الذات بين الدنيا والآخرة" (23:36) بنجاح 100% واستخراج الكويز والمهام.',
        targetUrl: "/transcript",
        read: false,
        type: "summary",
        createdAt: now,
      },
    ],
    calendarEvents: [],
    jobs: [],
    recordingSessions: [],
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
    const authentic = buildAuthenticLectureRecord();
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed: DatabaseSchema = JSON.parse(raw);
        if (!parsed.recordingSessions) parsed.recordingSessions = [];
        // Ensure authentic graduation project lecture is present
        if (!parsed.lectures.some((l) => l.id === authentic.lecture.id)) {
          parsed.lectures = [
            authentic.lecture,
            ...parsed.lectures.filter((l) => !l.title.includes("نظم التشغيل")),
          ];
        }
        if (!parsed.quizzes.some((q) => q.lectureId === authentic.lecture.id)) {
          parsed.quizzes = [authentic.quiz, ...parsed.quizzes];
        }
        if (!parsed.actionItems.some((a) => a.lectureId === authentic.lecture.id)) {
          parsed.actionItems = [...authentic.tasks, ...parsed.actionItems];
        }
        this.saveData(parsed);
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
