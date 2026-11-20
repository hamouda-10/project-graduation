import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  db,
  MeetingRecord,
  LectureRecord,
  ActionItemRecord,
  UserRecord,
  TranscriptSegment,
} from "./db";
import {
  answerGroundedQuestion,
  extractHighlightsFromSegments,
  extractKeywordsWithFrequency,
  generateAnalysisFromTranscript,
  transcribeAndTranslateAudioChunk,
  generateAiSummary,
  generateAiQuiz,
  generateAiLectureAnalysis,
  generateAiFlashcards,
  generateAiMindMap,
  askMeetMindAI,
} from "./ai";
import {
  cancelJob,
  checkMediaToolsAvailable,
  createJob,
  processRecordingJob,
  retryJob,
  validateMediaFile,
} from "./jobs";
import { isGeminiConfigured } from "./gemini";
import {
  deleteStoredAvatarFile,
  getAvatarsDir,
  getChunkUploadsDir,
  getRecordingsDir,
  isStorageWritable,
  resolveSafeAvatarPath,
  resolveSafeRecordingPath,
  validateProfileImageBuffer,
  verifySavedFileIntegrity,
} from "./storage";
import { buildUserDataExport, buildUserProfileOverview } from "./profile";
import { subscribeSync, notifySync, getLatestSyncEvent } from "./sync";
import { matchesArabicQuery } from "../lib/arabic";
import {
  appendAuthCookies,
  appendClearAuthCookies,
  authenticateRequest,
  createSessionTokens,
  getConfiguredGoogleClientId,
  hashPasswordSecure,
  hashToken,
  normalizeEmail,
  parseCookies,
  revokeSessionAndToken,
  sanitizePublicUser,
  validateEmailAddress,
  validatePasswordStrength,
  verifyAccessJwt,
  verifyGoogleIdentity,
  verifyPasswordSecure,
} from "./auth";

const escapeHtml = (unsafe: string) =>
  (unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function isUserAdmin(user: UserRecord | null): boolean {
  return Boolean(user && !user.isGuest && user.role === "admin");
}

const RECORDINGS_DIR = getRecordingsDir();
const CHUNK_UPLOADS_DIR = getChunkUploadsDir();

interface ChunkUploadSession {
  uploadId: string;
  userId: string;
  sessionDir: string;
  fileName: string;
  resourceType: "meeting" | "lecture";
  title: string;
  courseCode: string;
  language: string;
  idempotencyKey: string;
  expectedSize: number;
  createdAt: number;
}

function getUploadMetaPath(uploadId: string): string {
  const safeId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(CHUNK_UPLOADS_DIR, `${safeId}.meta.json`);
}

function saveUploadSession(session: ChunkUploadSession): void {
  fs.mkdirSync(CHUNK_UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(session.sessionDir, { recursive: true });
  fs.writeFileSync(getUploadMetaPath(session.uploadId), JSON.stringify(session), "utf-8");
}

function loadUploadSession(uploadId: string): ChunkUploadSession | null {
  const safeId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return null;
  const metaPath = getUploadMetaPath(safeId);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as ChunkUploadSession;
  } catch {
    return null;
  }
}

function cleanupUploadSession(session: ChunkUploadSession): void {
  try {
    const metaPath = getUploadMetaPath(session.uploadId);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    if (fs.existsSync(session.sessionDir)) {
      fs.rmSync(session.sessionDir, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors
  }
}

async function finalizeUploadedRecording(params: {
  savedPath: string;
  originalFilename: string;
  resourceType: "meeting" | "lecture";
  title: string;
  courseCode: string;
  language: string;
  idempotencyKey: string;
  user: UserRecord | null;
}): Promise<Response> {
  const {
    savedPath,
    originalFilename,
    resourceType,
    title,
    courseCode,
    language,
    idempotencyKey,
    user,
  } = params;

  const probe = await validateMediaFile(savedPath, originalFilename);
  if (!probe.valid) {
    try {
      if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
    } catch {
      /* ignore */
    }
    return Response.json(
      {
        error: probe.error || "Invalid media file.",
        category: probe.category || "MediaValidationError",
        correlationId: probe.correlationId,
      },
      { status: 422 },
    );
  }

  let effectivePath = savedPath;
  if (probe.repairedPath && fs.existsSync(probe.repairedPath)) {
    effectivePath = probe.repairedPath;
    try {
      if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
    } catch {
      /* ignore */
    }
  }

  const resourceId = resourceType === "meeting" ? `m_${Date.now()}` : `l_${Date.now()}`;
  const now = new Date().toISOString();

  if (resourceType === "meeting") {
    db.update("meetings", (meetings) => [
      {
        id: resourceId,
        workspaceId: "ws_default",
        title,
        hostName: user?.name || "Organizer",
        hostId: user?.id || "usr_admin",
        date: now.split("T")[0],
        durationSeconds: probe.durationSeconds,
        participantsCount: 1,
        status: "Processing",
        language,
        recordingPath: effectivePath,
        recordingFileName: originalFilename,
        audioUrl: `/api/v1/recordings/audio/${resourceId}`,
        segments: [],
        createdAt: now,
        updatedAt: now,
      },
      ...meetings,
    ]);
  } else {
    db.update("lectures", (lectures) => [
      {
        id: resourceId,
        workspaceId: "ws_default",
        title,
        courseCode: courseCode || "GEN 101",
        instructorName: user?.name || "Lecturer",
        instructorId: user?.id || "usr_admin",
        date: now.split("T")[0],
        durationSeconds: probe.durationSeconds,
        status: "Processing",
        language,
        recordingPath: effectivePath,
        recordingFileName: originalFilename,
        audioUrl: `/api/v1/recordings/audio/${resourceId}`,
        segments: [],
        createdAt: now,
        updatedAt: now,
      },
      ...lectures,
    ]);
  }

  const job = createJob(resourceType, resourceId, originalFilename, effectivePath, language, {
    userId: user?.id || "usr_admin",
    idempotencyKey: idempotencyKey || undefined,
  });

  setTimeout(() => {
    void processRecordingJob(
      job.id,
      resourceType,
      resourceId,
      effectivePath,
      originalFilename,
      language,
    );
  }, 50);

  return Response.json(
    {
      message: "Recording accepted for transcription and analysis",
      jobId: job.id,
      resourceId,
      resourceType,
      durationSeconds: probe.durationSeconds,
      repaired: Boolean(probe.repairedPath),
      status: "Queued",
    },
    { status: 202 },
  );
}

function getMimeTypeFromExt(ext: string): string {
  switch (ext) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
    case ".aac":
      return "audio/mp4";
    case ".ogg":
    case ".opus":
      return "audio/ogg";
    case ".flac":
      return "audio/flac";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}

function formatVttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

function findRecordingFile(
  id: string,
): { filePath: string; fileName: string; mimeType: string } | null {
  const meeting = db.get("meetings").find((m) => m.id === id);
  const lecture = db.get("lectures").find((l) => l.id === id);
  const item = meeting || lecture;

  if (item?.recordingPath && fs.existsSync(item.recordingPath)) {
    const ext = path.extname(item.recordingPath).toLowerCase();
    return {
      filePath: item.recordingPath,
      fileName: item.recordingFileName || path.basename(item.recordingPath),
      mimeType: getMimeTypeFromExt(ext),
    };
  }

  if (fs.existsSync(RECORDINGS_DIR)) {
    const files = fs.readdirSync(RECORDINGS_DIR);
    const matched = files.find((f) => f.includes(id));
    if (matched) {
      const fullPath = path.join(RECORDINGS_DIR, matched);
      const ext = path.extname(matched).toLowerCase();
      return {
        filePath: fullPath,
        fileName: matched,
        mimeType: getMimeTypeFromExt(ext),
      };
    }
  }
  return null;
}

function getAuthUser(req: Request): UserRecord | null {
  const result = authenticateRequest(req);
  return result.ok ? result.user : null;
}

function getScopedResourceIds(user: UserRecord): Set<string> {
  if (isUserAdmin(user)) {
    return new Set([
      ...db.get("meetings").map((m) => m.id),
      ...db.get("lectures").map((l) => l.id),
    ]);
  }
  const meetings = db.get("meetings").filter((m) => m.hostId === user.id);
  const lectures = db.get("lectures").filter((l) => l.instructorId === user.id);
  return new Set([...meetings.map((m) => m.id), ...lectures.map((l) => l.id)]);
}

export async function handleApiRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (!pathname.startsWith("/api/v1")) {
    return null; // Not an API request
  }

  const method = req.method;

  try {
    // ----------------------------------------------------
    // PUBLIC HEALTH & AUTH CONFIGURATION
    // ----------------------------------------------------
    if (pathname === "/api/v1/health" && method === "GET") {
      const mediaTools = await checkMediaToolsAvailable();
      return Response.json({
        status: "healthy",
        service: "meetmind-api",
        timestamp: new Date().toISOString(),
        aiConfigured: isGeminiConfigured(),
        ffmpegAvailable: mediaTools.ffmpeg && mediaTools.ffprobe,
        storageWritable: isStorageWritable(),
      });
    }

    if (pathname === "/api/v1/auth/config" && method === "GET") {
      const googleClientId = getConfiguredGoogleClientId();
      return Response.json({
        googleEnabled: Boolean(googleClientId),
        googleClientId: googleClientId || null,
      });
    }

    // ----------------------------------------------------
    // PUBLIC AUTHENTICATION ENDPOINTS
    // ----------------------------------------------------
    if (pathname === "/api/v1/auth/login" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const email = normalizeEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      const rememberMe = Boolean(body.rememberMe);

      if (!email || !password) {
        return Response.json({ error: "Email and password are required." }, { status: 400 });
      }
      if (!validateEmailAddress(email)) {
        return Response.json({ error: "Invalid email address." }, { status: 400 });
      }

      const users = db.get("users") || [];
      const user = users.find((u) => normalizeEmail(u.email) === email && !u.isGuest);

      if (!user) {
        return Response.json({ error: "Incorrect email or password." }, { status: 401 });
      }

      if (user.authProvider === "google" && !user.passwordHash) {
        return Response.json(
          {
            error:
              "This account uses Google Sign-In. Please click 'Continue with Google' to sign in.",
          },
          { status: 401 },
        );
      }

      if (!verifyPasswordSecure(password, user.passwordHash)) {
        return Response.json({ error: "Incorrect email or password." }, { status: 401 });
      }

      const tokens = createSessionTokens(user, { rememberMe, isGuest: false, req });
      const headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      appendAuthCookies(headers, req, tokens);

      return new Response(
        JSON.stringify({
          token: tokens.accessToken,
          expiresAt: tokens.expiresAt,
          rememberMe: tokens.rememberMe,
          user: sanitizePublicUser(user),
        }),
        { status: 200, headers },
      );
    }

    if (pathname === "/api/v1/auth/register" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const name = String(body.name || body.fullName || "")
        .replace(/[<>]/g, "")
        .trim();
      const email = normalizeEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      const confirmPassword =
        typeof body.confirmPassword === "string" ? body.confirmPassword : undefined;
      const department = String(body.department || "")
        .replace(/[<>]/g, "")
        .trim();

      if (!name || name.length < 2 || name.length > 100) {
        return Response.json(
          { error: "Full name must be between 2 and 100 characters." },
          { status: 400 },
        );
      }
      if (!email || !validateEmailAddress(email)) {
        return Response.json({ error: "Invalid email address." }, { status: 400 });
      }

      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return Response.json({ error: strength.error }, { status: 400 });
      }
      if (confirmPassword !== undefined && password !== confirmPassword) {
        return Response.json({ error: "Passwords do not match." }, { status: 400 });
      }

      const users = db.get("users") || [];
      if (users.some((u) => normalizeEmail(u.email) === email && !u.isGuest)) {
        return Response.json({ error: "Email already registered." }, { status: 409 });
      }

      const nowIso = new Date().toISOString();
      const newUser: UserRecord = {
        id: `usr_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`,
        email,
        name,
        passwordHash: hashPasswordSecure(password),
        role: "member",
        authProvider: "local",
        emailVerified: false,
        isGuest: false,
        department,
        nameCustomized: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      db.update("users", (all) => [...all, newUser]);

      const tokens = createSessionTokens(newUser, { rememberMe: true, isGuest: false, req });
      const headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      appendAuthCookies(headers, req, tokens);

      return new Response(
        JSON.stringify({
          token: tokens.accessToken,
          expiresAt: tokens.expiresAt,
          user: sanitizePublicUser(newUser),
        }),
        { status: 201, headers },
      );
    }

    if (pathname === "/api/v1/auth/google" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const idToken = typeof body.idToken === "string" ? body.idToken : undefined;
      const accessToken = typeof body.accessToken === "string" ? body.accessToken : undefined;

      const verified = await verifyGoogleIdentity({ idToken, accessToken });
      if (!verified.ok) {
        return Response.json({ error: verified.error }, { status: verified.status });
      }

      const { sub, email, name, picture } = verified.identity;
      const users = db.get("users") || [];
      let user = users.find(
        (u) => !u.isGuest && (u.googleSub === sub || normalizeEmail(u.email) === email),
      );

      if (user) {
        // Link Google identity to existing verified-email account without duplicating
        // NEVER overwrite a user's manually edited name or custom/removed profile photo
        const updatedUser: UserRecord = {
          ...user,
          googleSub: sub,
          emailVerified: true,
          name: user.nameCustomized ? user.name : user.name || name,
          avatarUrl: user.avatarCustomized ? user.avatarUrl : user.avatarUrl || picture,
          updatedAt: new Date().toISOString(),
        };
        db.update("users", (all) => all.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
        user = updatedUser;
      } else {
        const nowIso = new Date().toISOString();
        user = {
          id: `usr_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`,
          email,
          name,
          passwordHash: "",
          role: "member",
          authProvider: "google",
          googleSub: sub,
          emailVerified: true,
          isGuest: false,
          avatarUrl: picture,
          nameCustomized: false,
          avatarCustomized: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        db.update("users", (all) => [...all, user!]);
      }

      const tokens = createSessionTokens(user, { rememberMe: true, isGuest: false, req });
      const headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      appendAuthCookies(headers, req, tokens);

      return new Response(
        JSON.stringify({
          token: tokens.accessToken,
          expiresAt: tokens.expiresAt,
          user: sanitizePublicUser(user),
        }),
        { status: 200, headers },
      );
    }

    if (pathname === "/api/v1/auth/guest" && method === "POST") {
      const guestCode = crypto.randomBytes(6).toString("hex");
      const guestUser: UserRecord = {
        id: `guest_${Date.now().toString(36)}_${guestCode}`,
        email: `guest+${guestCode}@session.meetmind.ai`,
        name: "Guest Explorer",
        passwordHash: "",
        role: "guest",
        authProvider: "guest",
        emailVerified: false,
        isGuest: true,
        department: "Guest Session",
        createdAt: new Date().toISOString(),
      };

      const tokens = createSessionTokens(guestUser, { rememberMe: false, isGuest: true, req });
      const headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      appendAuthCookies(headers, req, tokens);

      return new Response(
        JSON.stringify({
          token: tokens.accessToken,
          expiresAt: tokens.expiresAt,
          user: sanitizePublicUser(guestUser),
        }),
        { status: 200, headers },
      );
    }

    if (pathname === "/api/v1/auth/refresh" && method === "POST") {
      const cookies = parseCookies(req);
      const body = await req.json().catch(() => ({}));
      const rawRefresh = (
        cookies.meetmind_refresh_token ||
        (typeof body.refreshToken === "string" ? body.refreshToken : "")
      ).trim();

      if (!rawRefresh) {
        return Response.json(
          { error: "Session expired. Please sign in again.", code: "TOKEN_EXPIRED" },
          { status: 401 },
        );
      }

      const refreshHash = hashToken(rawRefresh);
      const sessions = db.get("authSessions") || [];
      const session = sessions.find((s) => s.refreshTokenHash === refreshHash);
      if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
        const headers = new Headers({ "Content-Type": "application/json" });
        appendClearAuthCookies(headers, req);
        return new Response(
          JSON.stringify({
            error: "Session expired. Please sign in again.",
            code: "TOKEN_EXPIRED",
          }),
          { status: 401, headers },
        );
      }

      const users = db.get("users") || [];
      let user = users.find((u) => u.id === session.userId);
      if (!user && session.isGuest) {
        user = {
          id: session.userId,
          email: `${session.userId}@session.meetmind.ai`,
          name: "Guest Explorer",
          passwordHash: "",
          role: "guest",
          authProvider: "guest",
          isGuest: true,
          department: "Guest Session",
          createdAt: session.createdAt,
        };
      }

      if (!user) {
        revokeSessionAndToken({ sessionId: session.id });
        return Response.json({ error: "Account does not exist." }, { status: 401 });
      }

      // Rotate refresh session securely
      revokeSessionAndToken({ sessionId: session.id });
      const newTokens = createSessionTokens(user, {
        rememberMe: session.rememberMe,
        isGuest: session.isGuest,
        req,
      });

      const headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      appendAuthCookies(headers, req, newTokens);

      return new Response(
        JSON.stringify({
          token: newTokens.accessToken,
          expiresAt: newTokens.expiresAt,
          rememberMe: newTokens.rememberMe,
          user: sanitizePublicUser(user),
        }),
        { status: 200, headers },
      );
    }

    if (pathname === "/api/v1/auth/logout" && method === "POST") {
      const authHeader = req.headers.get("Authorization") || "";
      const cookies = parseCookies(req);
      const rawToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : (cookies.meetmind_token || "").trim();

      if (rawToken) {
        const verified = verifyAccessJwt(rawToken);
        if (verified.valid) {
          revokeSessionAndToken({
            jti: verified.claims.jti,
            exp: verified.claims.exp,
            sessionId: verified.claims.sid,
            refreshToken: cookies.meetmind_refresh_token,
          });
        } else if (cookies.meetmind_refresh_token) {
          revokeSessionAndToken({ refreshToken: cookies.meetmind_refresh_token });
        }
      } else if (cookies.meetmind_refresh_token) {
        revokeSessionAndToken({ refreshToken: cookies.meetmind_refresh_token });
      }

      const headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      appendClearAuthCookies(headers, req);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    // ----------------------------------------------------
    // CENTRAL AUTHENTICATION GATE (ALL ROUTES BELOW REQUIRE VALID SESSION)
    // ----------------------------------------------------
    const auth = authenticateRequest(req);
    if (!auth.ok) {
      return Response.json(
        { error: auth.error, code: auth.code },
        { status: auth.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    const currentUser = auth.user;
    const currentIsGuest = auth.isGuest;
    const currentIsAdmin = isUserAdmin(currentUser);

    if (pathname === "/api/v1/auth/me" && method === "GET") {
      return Response.json(sanitizePublicUser(currentUser), {
        headers: { "Cache-Control": "no-store" },
      });
    }

    // ----------------------------------------------------
    // USER PROFILE, AVATAR STORAGE, ANALYTICS, SESSIONS & EXPORT
    // ----------------------------------------------------
    if (pathname === "/api/v1/profile" && method === "GET") {
      const overview = buildUserProfileOverview(currentUser, auth.claims.sid);
      return Response.json(overview, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (pathname === "/api/v1/profile" && (method === "PUT" || method === "PATCH")) {
      if (currentIsGuest) {
        return Response.json(
          {
            error:
              "Guest sessions are temporary and cannot save permanent profile changes. Sign in or create an account.",
          },
          { status: 403 },
        );
      }

      const body = await req.json().catch(() => ({}));
      const cleanStr = (v: unknown, maxLen: number) => {
        if (typeof v !== "string") return undefined;
        let out = "";
        for (let i = 0; i < v.length; i++) {
          const ch = v[i];
          const code = v.charCodeAt(i);
          if (ch === "<" || ch === ">") continue;
          if (code < 0x20 || code === 0x7f) {
            out += " ";
          } else {
            out += ch;
          }
        }
        return out.trim().slice(0, maxLen);
      };

      const nextName = cleanStr(body.name, 100);
      if (nextName !== undefined && nextName.length < 2) {
        return Response.json(
          { error: "Full name must be at least 2 characters long." },
          { status: 400 },
        );
      }

      const nextBio = cleanStr(body.bio, 500);
      const nextJobTitle = cleanStr(body.jobTitle, 100);
      const nextDepartment = cleanStr(body.department, 100);
      const nextOrganization = cleanStr(body.organization, 120);

      let updatedUser: UserRecord | null = null;
      const nowIso = new Date().toISOString();

      db.update("users", (all) =>
        all.map((u) => {
          if (u.id !== currentUser.id) return u;
          const nameChanged = nextName !== undefined && nextName !== u.name;
          updatedUser = {
            ...u,
            name: nextName !== undefined ? nextName : u.name,
            bio: nextBio !== undefined ? nextBio : u.bio,
            jobTitle: nextJobTitle !== undefined ? nextJobTitle : u.jobTitle,
            department: nextDepartment !== undefined ? nextDepartment : u.department,
            organization: nextOrganization !== undefined ? nextOrganization : u.organization,
            nameCustomized: nameChanged ? true : u.nameCustomized,
            updatedAt: nowIso,
          };
          return updatedUser;
        }),
      );

      if (!updatedUser) {
        return Response.json({ error: "User profile not found." }, { status: 404 });
      }

      // Keep display attribution in sync on user's own meetings/lectures if name changed
      if (nextName && nextName !== currentUser.name) {
        db.update("meetings", (list) =>
          list.map((m) => (m.hostId === currentUser.id ? { ...m, hostName: nextName } : m)),
        );
        db.update("lectures", (list) =>
          list.map((l) =>
            l.instructorId === currentUser.id ? { ...l, instructorName: nextName } : l,
          ),
        );
      }

      notifySync({ type: "profile_updated", id: currentUser.id });
      const profile = buildUserProfileOverview(updatedUser, auth.claims.sid);
      return Response.json(
        { success: true, user: sanitizePublicUser(updatedUser), profile },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (pathname === "/api/v1/profile/avatar" && method === "POST") {
      if (currentIsGuest) {
        return Response.json(
          {
            error:
              "Guest sessions cannot upload persistent profile images. Sign in or create an account.",
          },
          { status: 403 },
        );
      }

      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return Response.json(
          { error: "Invalid multipart upload payload. Please select a JPG, PNG, or WEBP image." },
          { status: 400 },
        );
      }

      const fileEntry = formData.get("avatar") || formData.get("file");
      if (!fileEntry || typeof fileEntry === "string") {
        return Response.json({ error: "No image file provided." }, { status: 400 });
      }

      const arrayBuf = await fileEntry.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const validation = validateProfileImageBuffer(buffer);
      if (!validation.ok) {
        return Response.json({ error: validation.error }, { status: 400 });
      }

      const safeUserSlug = currentUser.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
      const fileName = `av_${safeUserSlug}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${validation.ext}`;
      const avatarsDir = getAvatarsDir();
      fs.mkdirSync(avatarsDir, { recursive: true });
      const targetPath = resolveSafeAvatarPath(fileName);
      fs.writeFileSync(targetPath, buffer);

      const previousFileName = currentUser.avatarFileName;
      const avatarUrl = `/api/v1/profile/avatars/${encodeURIComponent(fileName)}`;
      const nowIso = new Date().toISOString();
      let updatedUser: UserRecord | null = null;

      db.update("users", (all) =>
        all.map((u) => {
          if (u.id !== currentUser.id) return u;
          updatedUser = {
            ...u,
            avatarFileName: fileName,
            avatarUrl,
            avatarCustomized: true,
            updatedAt: nowIso,
          };
          return updatedUser;
        }),
      );

      if (previousFileName && previousFileName !== fileName) {
        deleteStoredAvatarFile(previousFileName);
      }

      if (!updatedUser) {
        deleteStoredAvatarFile(fileName);
        return Response.json({ error: "User profile not found." }, { status: 404 });
      }

      notifySync({ type: "profile_avatar_updated", id: currentUser.id });
      return Response.json(
        {
          success: true,
          user: sanitizePublicUser(updatedUser),
          avatarUrl,
          width: validation.width,
          height: validation.height,
          sizeBytes: validation.sizeBytes,
          mimeType: validation.mimeType,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (pathname === "/api/v1/profile/avatar" && method === "DELETE") {
      if (currentIsGuest) {
        return Response.json(
          { error: "Guest sessions do not have a saved profile image." },
          { status: 403 },
        );
      }

      const previousFileName = currentUser.avatarFileName;
      let updatedUser: UserRecord | null = null;
      const nowIso = new Date().toISOString();

      db.update("users", (all) =>
        all.map((u) => {
          if (u.id !== currentUser.id) return u;
          updatedUser = {
            ...u,
            avatarFileName: undefined,
            avatarUrl: undefined,
            avatarCustomized: true,
            updatedAt: nowIso,
          };
          return updatedUser;
        }),
      );

      if (previousFileName) {
        deleteStoredAvatarFile(previousFileName);
      }

      if (!updatedUser) {
        return Response.json({ error: "User profile not found." }, { status: 404 });
      }

      notifySync({ type: "profile_avatar_removed", id: currentUser.id });
      return Response.json(
        { success: true, user: sanitizePublicUser(updatedUser) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (
      pathname.startsWith("/api/v1/profile/avatars/") &&
      (method === "GET" || method === "HEAD")
    ) {
      const requestedName = decodeURIComponent(
        pathname.slice("/api/v1/profile/avatars/".length),
      ).trim();
      const safeName = path.basename(requestedName);
      if (!safeName || safeName !== requestedName) {
        return Response.json({ error: "Invalid avatar path." }, { status: 400 });
      }

      // Strict per-user authorization: a user can ONLY access their own uploaded avatar (unless admin)
      if (!currentIsAdmin && currentUser.avatarFileName !== safeName) {
        return Response.json(
          { error: "You are not authorized to access this profile image." },
          { status: 403 },
        );
      }

      let filePath: string;
      try {
        filePath = resolveSafeAvatarPath(safeName);
      } catch {
        return Response.json({ error: "Invalid avatar path." }, { status: 400 });
      }

      if (!fs.existsSync(filePath)) {
        return Response.json({ error: "Profile image not found." }, { status: 404 });
      }

      const ext = path.extname(safeName).toLowerCase();
      const contentType =
        ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      const bytes = fs.readFileSync(filePath);
      return new Response(method === "HEAD" ? null : bytes, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(bytes.length),
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    if (pathname === "/api/v1/profile/password" && method === "POST") {
      if (currentIsGuest) {
        return Response.json(
          { error: "Guest sessions cannot set or change account passwords." },
          { status: 403 },
        );
      }

      const body = await req.json().catch(() => ({}));
      const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      const confirmPassword =
        typeof body.confirmPassword === "string" ? body.confirmPassword : undefined;

      const hasExistingPassword = Boolean(
        currentUser.passwordHash && currentUser.passwordHash.startsWith("scrypt$"),
      );
      if (hasExistingPassword) {
        if (!currentPassword) {
          return Response.json({ error: "Current password is required." }, { status: 400 });
        }
        if (!verifyPasswordSecure(currentPassword, currentUser.passwordHash)) {
          return Response.json({ error: "Current password is incorrect." }, { status: 401 });
        }
      }

      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return Response.json({ error: strength.error }, { status: 400 });
      }
      if (confirmPassword !== undefined && newPassword !== confirmPassword) {
        return Response.json({ error: "New passwords do not match." }, { status: 400 });
      }
      if (hasExistingPassword && currentPassword === newPassword) {
        return Response.json(
          { error: "New password must be different from your current password." },
          { status: 400 },
        );
      }

      const newHash = hashPasswordSecure(newPassword);
      const nowIso = new Date().toISOString();
      db.update("users", (all) =>
        all.map((u) =>
          u.id === currentUser.id ? { ...u, passwordHash: newHash, updatedAt: nowIso } : u,
        ),
      );

      // Revoke all other sessions belonging to this user
      db.update("authSessions", (all = []) =>
        all.map((s) =>
          s.userId === currentUser.id && s.id !== auth.claims.sid && !s.revokedAt
            ? { ...s, revokedAt: nowIso }
            : s,
        ),
      );

      return Response.json(
        {
          success: true,
          message: hasExistingPassword
            ? "Password updated successfully. Other active sessions have been signed out."
            : "Account password created successfully.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (pathname === "/api/v1/profile/sessions/revoke-others" && method === "POST") {
      const nowIso = new Date().toISOString();
      let revokedCount = 0;
      db.update("authSessions", (all = []) =>
        all.map((s) => {
          if (s.userId === currentUser.id && s.id !== auth.claims.sid && !s.revokedAt) {
            revokedCount++;
            return { ...s, revokedAt: nowIso };
          }
          return s;
        }),
      );
      return Response.json({ success: true, revokedCount });
    }

    if (pathname.startsWith("/api/v1/profile/sessions/") && method === "DELETE") {
      const sessionId = decodeURIComponent(
        pathname.slice("/api/v1/profile/sessions/".length),
      ).trim();
      const target = (db.get("authSessions") || []).find((s) => s.id === sessionId);
      if (!target || target.userId !== currentUser.id) {
        return Response.json({ error: "Session not found." }, { status: 404 });
      }
      revokeSessionAndToken({ sessionId: target.id });
      return Response.json({
        success: true,
        revokedCurrent: target.id === auth.claims.sid,
      });
    }

    if (pathname === "/api/v1/profile/export" && method === "GET") {
      const payload = buildUserDataExport(currentUser);
      const safeStamp = new Date().toISOString().slice(0, 10);
      return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="meetmind_my_data_${safeStamp}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // ----------------------------------------------------
    // REAL-TIME SYNCHRONIZATION (AUTHENTICATED SSE & POLLING STATUS)
    // ----------------------------------------------------
    if (pathname === "/api/v1/sync/status" && method === "GET") {
      return Response.json(getLatestSyncEvent());
    }

    if (pathname === "/api/v1/sync/events" && method === "GET") {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(getLatestSyncEvent())}\n\n`));

          const unsubscribe = subscribeSync((event) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } catch {
              unsubscribe();
            }
          });

          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": keepalive\n\n"));
            } catch {
              clearInterval(heartbeat);
              unsubscribe();
            }
          }, 20000);

          req.signal.addEventListener("abort", () => {
            clearInterval(heartbeat);
            unsubscribe();
          });
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // ----------------------------------------------------
    // DASHBOARD
    // ----------------------------------------------------
    if (pathname === "/api/v1/dashboard/metrics" && method === "GET") {
      const user = getAuthUser(req);
      const admin = isUserAdmin(user);
      const meetings = admin
        ? db.get("meetings")
        : db.get("meetings").filter((m) => m.hostId === user?.id);
      const lectures = admin
        ? db.get("lectures")
        : db.get("lectures").filter((l) => l.instructorId === user?.id);
      const resourceIds = new Set([...meetings.map((m) => m.id), ...lectures.map((l) => l.id)]);
      const tasks = admin
        ? db.get("actionItems")
        : db
            .get("actionItems")
            .filter(
              (t) => t.userId === user?.id || resourceIds.has(t.meetingId || t.lectureId || ""),
            );
      const jobs = admin ? db.get("jobs") : db.get("jobs").filter((j) => j.userId === user?.id);
      const quizzes = admin
        ? db.get("quizzes")
        : db.get("quizzes").filter((q) => resourceIds.has(q.lectureId || q.meetingId || ""));

      const completedTasks = tasks.filter((t) => t.completed).length;
      const pendingTasks = tasks.filter((t) => !t.completed).length;
      const processingJobs = jobs.filter(
        (j) =>
          j.status === "Queued" ||
          j.status === "Validating" ||
          j.status === "ExtractingAudio" ||
          j.status === "Transcribing" ||
          j.status === "Analyzing",
      ).length;

      const totalAudioDurationSeconds =
        meetings.reduce((acc, m) => acc + (m.durationSeconds || 0), 0) +
        lectures.reduce((acc, l) => acc + (l.durationSeconds || 0), 0);

      const totalTranscripts =
        meetings.filter((m) => m.segments && m.segments.length > 0).length +
        lectures.filter((l) => l.segments && l.segments.length > 0).length;

      const totalSummaries =
        meetings.filter((m) => !!m.summary).length +
        lectures.filter((l) => !!(l.summary || l.studyNotes)).length;

      const totalQuizzes = quizzes.length;
      const totalQuizAttempts = quizzes.reduce((acc, q) => acc + (q.attemptsCount || 0), 0);
      const hoursSaved =
        totalAudioDurationSeconds > 0 ? Math.round((totalAudioDurationSeconds / 3600) * 3) : 0;

      return Response.json(
        {
          totalMeetings: meetings.length,
          totalLectures: lectures.length,
          totalAudioDurationSeconds,
          totalAudioHours: Math.round(totalAudioDurationSeconds / 3600),
          totalTranscripts,
          totalSummaries,
          totalQuizzes,
          totalQuizAttempts,
          completedTasks,
          pendingTasks,
          processingJobs,
          hoursSaved,
          recentMeetings: meetings.slice(0, 4),
          recentLectures: lectures.slice(0, 3),
          tasks: tasks.slice(0, 5),
        },
        {
          headers: {
            "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
          },
        },
      );
    }

    if (pathname === "/api/v1/dashboard/trends" && method === "GET") {
      const user = getAuthUser(req);
      const admin = isUserAdmin(user);
      const meetings = admin
        ? db.get("meetings")
        : db.get("meetings").filter((m) => m.hostId === user?.id);
      const lectures = admin
        ? db.get("lectures")
        : db.get("lectures").filter((l) => l.instructorId === user?.id);

      const dayMap: Record<string, { meetings: number; lectures: number }> = {
        Mon: { meetings: 0, lectures: 0 },
        Tue: { meetings: 0, lectures: 0 },
        Wed: { meetings: 0, lectures: 0 },
        Thu: { meetings: 0, lectures: 0 },
        Fri: { meetings: 0, lectures: 0 },
        Sat: { meetings: 0, lectures: 0 },
        Sun: { meetings: 0, lectures: 0 },
      };

      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      for (const m of meetings) {
        if (m.date) {
          const d = new Date(m.date);
          const day = dayNames[d.getDay()] || "Mon";
          if (dayMap[day]) dayMap[day].meetings++;
        }
      }

      for (const l of lectures) {
        if (l.date) {
          const d = new Date(l.date);
          const day = dayNames[d.getDay()] || "Mon";
          if (dayMap[day]) dayMap[day].lectures++;
        }
      }

      const weekly = [
        { day: "Mon", ...dayMap.Mon },
        { day: "Tue", ...dayMap.Tue },
        { day: "Wed", ...dayMap.Wed },
        { day: "Thu", ...dayMap.Thu },
        { day: "Fri", ...dayMap.Fri },
        { day: "Sat", ...dayMap.Sat },
        { day: "Sun", ...dayMap.Sun },
      ];

      const bucketByWeeks = (items: Array<{ createdAt?: string; date?: string }>) => {
        const nowMs = Date.now();
        const buckets = [0, 0, 0, 0];
        for (const item of items) {
          const ts = new Date(item.createdAt || item.date || nowMs).getTime();
          const weeksAgo = Math.floor(Math.max(0, nowMs - ts) / (7 * 24 * 3600 * 1000));
          const idx = Math.max(0, 3 - Math.min(3, weeksAgo));
          buckets[idx]++;
        }
        return [
          { m: "W1", value: buckets[0] },
          { m: "W2", value: buckets[1] },
          { m: "W3", value: buckets[2] },
          { m: "W4", value: buckets[3] },
        ];
      };

      const meetingTrend = bucketByWeeks(meetings);
      const lectureTrend = bucketByWeeks(lectures);

      return Response.json(
        { weekly, meetingTrend, lectureTrend },
        {
          headers: {
            "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
          },
        },
      );
    }

    if (pathname === "/api/v1/dashboard/activity" && method === "GET") {
      const user = getAuthUser(req);
      const admin = isUserAdmin(user);
      const meetings = admin
        ? db.get("meetings")
        : db.get("meetings").filter((m) => m.hostId === user?.id);
      const lectures = admin
        ? db.get("lectures")
        : db.get("lectures").filter((l) => l.instructorId === user?.id);
      const activities: Array<{
        id: string;
        who: string;
        what: string;
        where: string;
        when: string;
      }> = [];

      for (const m of meetings.slice(0, 3)) {
        activities.push({
          id: `act_${m.id}`,
          who: m.hostName || "المستخدم",
          what: "سجل جلسة وتم حفظ التفريغ الصوتي",
          where: m.title,
          when: m.date || "اليوم",
        });
      }

      for (const l of lectures.slice(0, 3)) {
        activities.push({
          id: `act_${l.id}`,
          who: l.instructorName || "المحاضر",
          what: "أضاف محاضرة تعليمية جديدة",
          where: `${l.courseCode} — ${l.title}`,
          when: l.date || "اليوم",
        });
      }

      return Response.json(activities, {
        headers: {
          "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
        },
      });
    }

    // ----------------------------------------------------
    // MEETINGS
    // ----------------------------------------------------
    if (pathname === "/api/v1/meetings" && method === "GET") {
      const user = getAuthUser(req);
      const allMeetings = db.get("meetings");
      const scoped = isUserAdmin(user)
        ? allMeetings
        : allMeetings.filter((m) => m.hostId === user?.id);
      return Response.json(scoped, {
        headers: {
          "Cache-Control": "private, max-age=5, stale-while-revalidate=15",
        },
      });
    }

    if (pathname === "/api/v1/meetings" && method === "POST") {
      const user = getAuthUser(req);
      const body = await req.json();
      const { title, hostName, date, durationMinutes, participantsCount, segments } = body;

      if (!title || !String(title).trim()) {
        return Response.json({ error: "Meeting title is required" }, { status: 400 });
      }

      const id = `m_${Date.now()}`;
      const now = new Date().toISOString();
      const validSegments: TranscriptSegment[] = Array.isArray(segments) ? segments : [];
      const analysis =
        validSegments.length > 0
          ? generateAnalysisFromTranscript(String(title).trim(), validSegments, "meeting")
          : null;

      const newMeeting: MeetingRecord = {
        id,
        workspaceId: "ws_default",
        title: String(title).trim(),
        hostName: hostName || user?.name || "Organizer",
        hostId: user?.id || "usr_admin",
        date: date || now.split("T")[0],
        durationSeconds: durationMinutes ? durationMinutes * 60 : 0,
        participantsCount: participantsCount || 1,
        status: validSegments.length > 0 ? "Completed" : "Queued",
        summary: analysis?.summary,
        keyPoints: analysis?.keyPoints || [],
        decisions: analysis?.decisions || [],
        topics: analysis?.topics || [],
        segments: validSegments,
        createdAt: now,
        updatedAt: now,
      };

      db.update("meetings", (all) => [newMeeting, ...all]);

      db.update("calendarEvents", (events) => [
        {
          id: `ev_${id}`,
          title: newMeeting.title,
          date: newMeeting.date,
          time: "10:00 AM",
          kind: "meeting",
          referenceId: id,
          attendeesCount: newMeeting.participantsCount,
        },
        ...events,
      ]);

      return Response.json(newMeeting, { status: 201 });
    }

    if (pathname === "/api/v1/meetings/all" && method === "DELETE") {
      const user = getAuthUser(req);
      const admin = isUserAdmin(user);
      const allMeetings = db.get("meetings") || [];
      const targetMeetings = admin ? allMeetings : allMeetings.filter((m) => m.hostId === user?.id);
      const ids = targetMeetings.map((m) => m.id);

      for (const meeting of targetMeetings) {
        if (meeting.recordingPath && fs.existsSync(meeting.recordingPath)) {
          try {
            fs.unlinkSync(meeting.recordingPath);
          } catch {
            /* ignore */
          }
        }
        if (fs.existsSync(RECORDINGS_DIR)) {
          const files = fs.readdirSync(RECORDINGS_DIR);
          for (const f of files) {
            if (f.includes(meeting.id)) {
              try {
                fs.unlinkSync(path.join(RECORDINGS_DIR, f));
              } catch {
                /* ignore */
              }
            }
          }
        }
      }

      db.update("deletedResourceIds", (list = []) => Array.from(new Set([...list, ...ids])));

      const idSet = new Set(ids);
      db.update("meetings", (list) => list.filter((m) => !idSet.has(m.id)));
      db.update("actionItems", (items) => items.filter((t) => !idSet.has(t.meetingId || "")));
      db.update("calendarEvents", (events) =>
        events.filter((e) => !idSet.has(e.referenceId || "")),
      );
      db.update("quizzes", (quizzes) =>
        quizzes.filter((q) => !idSet.has(q.meetingId || "") && !idSet.has(q.lectureId || "")),
      );
      db.update("quizAttempts", (attempts) =>
        attempts.filter((a) => !idSet.has(a.lectureId || "")),
      );
      db.update("flashcards", (cards) => cards.filter((c) => !idSet.has(c.deckId || "")));
      db.update("mindMaps", (maps) => maps.filter((m) => !idSet.has(m.meetingId || "")));
      db.update("jobs", (jobs) => jobs.filter((j) => !idSet.has(j.resourceId || "")));
      db.update("recordingSessions", (sessions) => sessions.filter((s) => !idSet.has(s.id)));

      notifySync({ type: "MEETINGS_ALL_DELETED", count: ids.length });
      return Response.json({ success: true, count: ids.length });
    }

    if (pathname.startsWith("/api/v1/meetings/") && method === "GET") {
      const user = getAuthUser(req);
      const id = pathname.replace("/api/v1/meetings/", "");
      const meeting = db
        .get("meetings")
        .find((m) => m.id === id && (isUserAdmin(user) || m.hostId === user?.id));
      if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 });
      return Response.json(meeting);
    }

    if (pathname.startsWith("/api/v1/meetings/") && method === "DELETE") {
      const id = pathname.replace("/api/v1/meetings/", "");
      const meeting = db.get("meetings").find((m) => m.id === id);
      if (!meeting) {
        return Response.json({ error: "Meeting not found" }, { status: 404 });
      }
      if (!currentIsAdmin && meeting.hostId !== currentUser.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      if (meeting) {
        if (meeting.recordingPath && fs.existsSync(meeting.recordingPath)) {
          try {
            fs.unlinkSync(meeting.recordingPath);
          } catch (e) {
            console.error("Error unlinking audio:", e);
          }
        }
        if (fs.existsSync(RECORDINGS_DIR)) {
          const files = fs.readdirSync(RECORDINGS_DIR);
          for (const f of files) {
            if (f.includes(id)) {
              try {
                fs.unlinkSync(path.join(RECORDINGS_DIR, f));
              } catch {
                /* ignore */
              }
            }
          }
        }
      }
      // Record permanent deletion so it is never resurrected on restart
      db.update("deletedResourceIds", (list = []) => (list.includes(id) ? list : [...list, id]));

      // Cascading deletion
      db.update("meetings", (all) => all.filter((m) => m.id !== id));
      db.update("actionItems", (items) => items.filter((t) => t.meetingId !== id));
      db.update("calendarEvents", (events) => events.filter((e) => e.referenceId !== id));
      db.update("quizzes", (quizzes) =>
        quizzes.filter((q) => q.meetingId !== id && q.lectureId !== id),
      );
      db.update("quizAttempts", (attempts) => attempts.filter((a) => a.lectureId !== id));
      db.update("flashcards", (cards) => cards.filter((c) => c.deckId !== id));
      db.update("mindMaps", (maps) => maps.filter((m) => m.meetingId !== id));
      db.update("jobs", (jobs) => jobs.filter((j) => j.resourceId !== id));
      db.update("recordingSessions", (sessions) => sessions.filter((s) => s.id !== id));

      notifySync({ type: "MEETING_DELETED", id });
      return Response.json({ success: true, id });
    }

    // ----------------------------------------------------
    // LECTURES
    // ----------------------------------------------------
    if (pathname === "/api/v1/lectures" && method === "GET") {
      const user = getAuthUser(req);
      const allLectures = db.get("lectures");
      const scoped = isUserAdmin(user)
        ? allLectures
        : allLectures.filter((l) => l.instructorId === user?.id);
      return Response.json(scoped, {
        headers: {
          "Cache-Control": "private, max-age=5, stale-while-revalidate=15",
        },
      });
    }

    if (pathname === "/api/v1/lectures" && method === "POST") {
      const user = getAuthUser(req);
      const body = await req.json();
      const { title, courseCode, instructorName, date, durationMinutes, segments } = body;

      if (!title || !courseCode) {
        return Response.json({ error: "Title and Course Code are required" }, { status: 400 });
      }

      const id = `l_${Date.now()}`;
      const now = new Date().toISOString();
      const validSegments: TranscriptSegment[] = Array.isArray(segments) ? segments : [];
      const analysis =
        validSegments.length > 0
          ? generateAnalysisFromTranscript(
              String(title).trim(),
              validSegments,
              "lecture",
              courseCode,
            )
          : null;

      const newLecture: LectureRecord = {
        id,
        workspaceId: "ws_default",
        title: String(title).trim(),
        courseCode: String(courseCode).trim(),
        instructorName: instructorName || user?.name || "Lecturer",
        instructorId: user?.id || "usr_admin",
        date: date || now.split("T")[0],
        durationSeconds: durationMinutes ? durationMinutes * 60 : 0,
        status: validSegments.length > 0 ? "Completed" : "Queued",
        studyNotes: analysis?.lectureNotes,
        keyConcepts: analysis?.keyConcepts || [],
        examHighlights: analysis?.examHighlights || [],
        topics: analysis?.topics || [],
        segments: validSegments,
        createdAt: now,
        updatedAt: now,
      };

      db.update("lectures", (all) => [newLecture, ...all]);

      db.update("calendarEvents", (events) => [
        {
          id: `ev_${id}`,
          title: `${courseCode} — ${title}`,
          date: newLecture.date,
          time: "11:00 AM",
          kind: "lecture",
          referenceId: id,
          attendeesCount: 1,
        },
        ...events,
      ]);

      return Response.json(newLecture, { status: 201 });
    }

    if (pathname === "/api/v1/lectures/all" && method === "DELETE") {
      const user = getAuthUser(req);
      const admin = isUserAdmin(user);
      const allLectures = db.get("lectures") || [];
      const targetLectures = admin
        ? allLectures
        : allLectures.filter((l) => l.instructorId === user?.id);
      const ids = targetLectures.map((l) => l.id);

      for (const lecture of targetLectures) {
        if (lecture.recordingPath && fs.existsSync(lecture.recordingPath)) {
          try {
            fs.unlinkSync(lecture.recordingPath);
          } catch {
            /* ignore */
          }
        }
        if (fs.existsSync(RECORDINGS_DIR)) {
          const files = fs.readdirSync(RECORDINGS_DIR);
          for (const f of files) {
            if (f.includes(lecture.id)) {
              try {
                fs.unlinkSync(path.join(RECORDINGS_DIR, f));
              } catch {
                /* ignore */
              }
            }
          }
        }
      }

      db.update("deletedResourceIds", (list = []) => Array.from(new Set([...list, ...ids])));

      const idSet = new Set(ids);
      db.update("lectures", (list) => list.filter((l) => !idSet.has(l.id)));
      db.update("quizzes", (quizzes) => quizzes.filter((q) => !idSet.has(q.lectureId || "")));
      db.update("quizAttempts", (attempts) =>
        attempts.filter((a) => !idSet.has(a.lectureId || "")),
      );
      db.update("actionItems", (items) => items.filter((a) => !idSet.has(a.lectureId || "")));
      db.update("flashcards", (cards) => cards.filter((c) => !idSet.has(c.lectureId || "")));
      db.update("mindMaps", (maps) => maps.filter((m) => !idSet.has(m.lectureId || "")));
      db.update("calendarEvents", (events) =>
        events.filter((e) => !idSet.has(e.referenceId || "")),
      );
      db.update("jobs", (jobs) => jobs.filter((j) => !idSet.has(j.resourceId || "")));
      db.update("recordingSessions", (sessions) => sessions.filter((s) => !idSet.has(s.id)));

      notifySync({ type: "LECTURES_ALL_DELETED", count: ids.length });
      return Response.json({ success: true, count: ids.length });
    }

    if (pathname.startsWith("/api/v1/lectures/") && method === "GET") {
      const user = getAuthUser(req);
      const id = pathname.replace("/api/v1/lectures/", "");
      const lecture = db
        .get("lectures")
        .find((l) => l.id === id && (isUserAdmin(user) || l.instructorId === user?.id));
      if (!lecture) return Response.json({ error: "Lecture not found" }, { status: 404 });
      return Response.json(lecture);
    }

    if (pathname.startsWith("/api/v1/lectures/") && method === "DELETE") {
      const id = pathname.replace("/api/v1/lectures/", "");
      const lecture = db.get("lectures").find((l) => l.id === id);
      if (!lecture) {
        return Response.json({ error: "Lecture not found" }, { status: 404 });
      }
      if (!currentIsAdmin && lecture.instructorId !== currentUser.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      if (lecture) {
        if (lecture.recordingPath && fs.existsSync(lecture.recordingPath)) {
          try {
            fs.unlinkSync(lecture.recordingPath);
          } catch (e) {
            console.error("Error unlinking audio:", e);
          }
        }
        if (fs.existsSync(RECORDINGS_DIR)) {
          const files = fs.readdirSync(RECORDINGS_DIR);
          for (const f of files) {
            if (f.includes(id)) {
              try {
                fs.unlinkSync(path.join(RECORDINGS_DIR, f));
              } catch {
                /* ignore */
              }
            }
          }
        }
      }
      // Record permanent deletion so it is never resurrected on restart
      db.update("deletedResourceIds", (list = []) => (list.includes(id) ? list : [...list, id]));

      // Cascading deletion across all tables
      db.update("lectures", (all) => all.filter((l) => l.id !== id));
      db.update("quizzes", (quizzes) => quizzes.filter((q) => q.lectureId !== id));
      db.update("quizAttempts", (attempts) => attempts.filter((a) => a.lectureId !== id));
      db.update("actionItems", (items) => items.filter((a) => a.lectureId !== id));
      db.update("flashcards", (cards) => cards.filter((c) => c.lectureId !== id));
      db.update("mindMaps", (maps) => maps.filter((m) => m.lectureId !== id));
      db.update("calendarEvents", (events) => events.filter((e) => e.referenceId !== id));
      db.update("jobs", (jobs) => jobs.filter((j) => j.resourceId !== id));
      db.update("recordingSessions", (sessions) => sessions.filter((s) => s.id !== id));

      notifySync({ type: "LECTURE_DELETED", id });
      return Response.json({ success: true, id });
    }

    // ----------------------------------------------------
    // RECORDINGS UPLOAD & TRANSCRIPTION PIPELINE
    // ----------------------------------------------------
    // CHUNKED BINARY RECORDING UPLOAD (For Large Audio/Video Files > 4MB)
    // ----------------------------------------------------
    if (pathname === "/api/v1/recordings/upload/init" && method === "POST") {
      const user = getAuthUser(req);
      const body = await req.json();
      const resourceType: "meeting" | "lecture" = body.type === "lecture" ? "lecture" : "meeting";
      const fileName = String(body.fileName || "recording.m4a");
      const title =
        String(body.title || "").trim() || fileName.replace(/\.[^/.]+$/, "") || "New Recording";
      const courseCode = String(body.courseCode || "").trim();
      const language = String(body.language || "auto");
      const expectedSize = Number(body.fileSize ?? body.totalSize ?? 0);
      const idempotencyKey =
        req.headers.get("Idempotency-Key")?.trim() || String(body.idempotencyKey || "");

      if (expectedSize <= 0) {
        return Response.json({ error: "Uploaded file is empty." }, { status: 400 });
      }
      const maxBytes = Number(process.env.MAX_RECORDING_SIZE_MB || 500) * 1024 * 1024;
      if (expectedSize > maxBytes) {
        return Response.json(
          {
            error: `File exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`,
          },
          { status: 413 },
        );
      }

      if (idempotencyKey) {
        const existingJob = db
          .get("jobs")
          .find(
            (j) =>
              j.idempotencyKey === idempotencyKey &&
              j.status !== "Failed" &&
              j.status !== "Cancelled",
          );
        if (existingJob) {
          return Response.json(
            {
              deduplicated: true,
              jobId: existingJob.id,
              resourceId: existingJob.resourceId,
              resourceType: existingJob.resourceType,
              status: existingJob.status,
            },
            { status: 202 },
          );
        }
      }

      if (!fs.existsSync(CHUNK_UPLOADS_DIR)) {
        fs.mkdirSync(CHUNK_UPLOADS_DIR, { recursive: true });
      }

      const uploadId = `upl_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
      const sessionDir = path.join(CHUNK_UPLOADS_DIR, uploadId);
      saveUploadSession({
        uploadId,
        userId: user?.id || "usr_admin",
        sessionDir,
        fileName,
        resourceType,
        title,
        courseCode,
        language,
        idempotencyKey,
        expectedSize,
        createdAt: Date.now(),
      });

      return Response.json({ uploadId }, { status: 201 });
    }

    if (pathname === "/api/v1/recordings/upload/chunk" && method === "POST") {
      const user = getAuthUser(req);
      const uploadId = url.searchParams.get("uploadId") || "";
      const indexParam = Number(
        url.searchParams.get("index") ?? url.searchParams.get("chunkIndex"),
      );
      if (!Number.isInteger(indexParam) || indexParam < 0 || indexParam > 100_000) {
        return Response.json({ error: "Invalid chunk index." }, { status: 400 });
      }
      const session = loadUploadSession(uploadId);
      if (!session) {
        return Response.json(
          { error: "Upload session not found or expired.", category: "IncompleteUpload" },
          { status: 404 },
        );
      }
      if (!isUserAdmin(user) && session.userId !== user?.id) {
        return Response.json({ error: "Forbidden." }, { status: 403 });
      }

      const chunkBuf = Buffer.from(await req.arrayBuffer());
      if (chunkBuf.length <= 0) {
        return Response.json({ error: "Empty upload chunk." }, { status: 400 });
      }

      // Write each chunk to an indexed file so retries overwrite atomically (zero duplicate-byte corruption)
      fs.mkdirSync(session.sessionDir, { recursive: true });
      const chunkFile = path.join(
        session.sessionDir,
        `chunk_${String(indexParam).padStart(6, "0")}`,
      );
      const tmpChunkFile = `${chunkFile}.tmp`;
      fs.writeFileSync(tmpChunkFile, chunkBuf);
      fs.renameSync(tmpChunkFile, chunkFile);

      let receivedBytes = 0;
      for (const f of fs.readdirSync(session.sessionDir)) {
        if (f.startsWith("chunk_") && !f.endsWith(".tmp")) {
          receivedBytes += fs.statSync(path.join(session.sessionDir, f)).size;
        }
      }

      return Response.json({
        uploadId,
        index: indexParam,
        receivedBytes,
        expectedSize: session.expectedSize,
      });
    }

    if (pathname === "/api/v1/recordings/upload/complete" && method === "POST") {
      const user = getAuthUser(req);
      const body = await req.json();
      const uploadId = String(body.uploadId || "");
      const session = loadUploadSession(uploadId);
      if (!session) {
        return Response.json(
          { error: "Upload session not found or expired.", category: "IncompleteUpload" },
          { status: 404 },
        );
      }
      if (!isUserAdmin(user) && session.userId !== user?.id) {
        return Response.json({ error: "Forbidden." }, { status: 403 });
      }

      if (!fs.existsSync(session.sessionDir)) {
        cleanupUploadSession(session);
        return Response.json(
          { error: "Uploaded temporary chunks are missing.", category: "StorageError" },
          { status: 500 },
        );
      }

      const chunkFiles = fs
        .readdirSync(session.sessionDir)
        .filter((f) => f.startsWith("chunk_") && !f.endsWith(".tmp"))
        .sort();

      if (chunkFiles.length === 0) {
        cleanupUploadSession(session);
        return Response.json(
          { error: "No upload chunks were received.", category: "IncompleteUpload" },
          { status: 400 },
        );
      }

      const savedPath = resolveSafeRecordingPath(session.fileName);
      const fd = fs.openSync(savedPath, "w");
      try {
        for (const chunkName of chunkFiles) {
          const data = fs.readFileSync(path.join(session.sessionDir, chunkName));
          fs.writeSync(fd, data);
        }
      } finally {
        fs.closeSync(fd);
        cleanupUploadSession(session);
      }

      const integrity = verifySavedFileIntegrity(savedPath, session.expectedSize);
      if (!integrity.ok) {
        try {
          if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
        } catch {
          /* ignore */
        }
        return Response.json(
          {
            error: integrity.error || "Upload was incomplete. Please retry.",
            category: "IncompleteUpload",
          },
          { status: 400 },
        );
      }

      return await finalizeUploadedRecording({
        savedPath,
        originalFilename: session.fileName,
        resourceType: session.resourceType,
        title: session.title,
        courseCode: session.courseCode,
        language: session.language,
        idempotencyKey: session.idempotencyKey,
        user,
      });
    }

    if (pathname === "/api/v1/recordings/upload" && method === "POST") {
      const user = getAuthUser(req);
      const headerIdemKey = req.headers.get("Idempotency-Key")?.trim();
      const contentType = req.headers.get("content-type") || "";
      let resourceType: "meeting" | "lecture" = "meeting";
      let title = "Audio Recording";
      let courseCode = "";
      let originalFilename = "recording.wav";
      let language = "auto";
      let idempotencyKey = headerIdemKey || "";
      let expectedBytes = 0;
      let buffer: Buffer;

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        resourceType = (formData.get("type") as "meeting" | "lecture") || "meeting";
        title =
          (formData.get("title") as string) ||
          (file ? file.name.replace(/\.[^/.]+$/, "") : "New Recording");
        courseCode = (formData.get("courseCode") as string) || "";
        language = (formData.get("language") as string) || "auto";
        idempotencyKey = idempotencyKey || (formData.get("idempotencyKey") as string) || "";

        if (!file) {
          return Response.json({ error: "Audio or video file is required." }, { status: 400 });
        }
        originalFilename = file.name;
        expectedBytes = file.size;
        const arrayBuffer = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } else {
        const json = await req.json();
        resourceType = json.type || "meeting";
        title = json.title || "Microphone Recording";
        courseCode = json.courseCode || "";
        originalFilename = json.fileName || "mic_recording.webm";
        language = json.language || "auto";
        idempotencyKey = idempotencyKey || json.idempotencyKey || "";
        if (!json.audioBase64 || typeof json.audioBase64 !== "string") {
          return Response.json(
            { error: "Audio payload (audioBase64) is required." },
            { status: 400 },
          );
        }
        buffer = Buffer.from(json.audioBase64, "base64");
        expectedBytes = buffer.length;
      }

      if (idempotencyKey) {
        const existingJob = db
          .get("jobs")
          .find(
            (j) =>
              j.idempotencyKey === idempotencyKey &&
              j.status !== "Failed" &&
              j.status !== "Cancelled",
          );
        if (existingJob) {
          return Response.json(
            {
              message: "Duplicate request matched existing job.",
              jobId: existingJob.id,
              resourceId: existingJob.resourceId,
              resourceType: existingJob.resourceType,
              status: existingJob.status,
              deduplicated: true,
            },
            { status: 202 },
          );
        }
      }

      if (buffer.length <= 0) {
        return Response.json({ error: "Uploaded file is empty." }, { status: 400 });
      }
      if (expectedBytes > 0 && buffer.length !== expectedBytes) {
        return Response.json(
          {
            error: `Upload was incomplete (${buffer.length} of ${expectedBytes} bytes received). Please retry.`,
            category: "IncompleteUpload",
          },
          { status: 400 },
        );
      }

      const savedPath = resolveSafeRecordingPath(originalFilename);
      fs.writeFileSync(savedPath, buffer);
      const integrity = verifySavedFileIntegrity(savedPath, buffer.length);
      if (!integrity.ok) {
        try {
          if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
        } catch {
          /* ignore */
        }
        return Response.json(
          {
            error: integrity.error || "Storage write verification failed.",
            category: "StorageError",
          },
          { status: 500 },
        );
      }

      return await finalizeUploadedRecording({
        savedPath,
        originalFilename,
        resourceType,
        title,
        courseCode,
        language,
        idempotencyKey,
        user,
      });
    }

    if (pathname === "/api/v1/recordings/all" && method === "DELETE") {
      const user = getAuthUser(req);
      const admin = isUserAdmin(user);

      const allMeetings = db.get("meetings") || [];
      const targetMeetings = admin ? allMeetings : allMeetings.filter((m) => m.hostId === user?.id);
      const allLectures = db.get("lectures") || [];
      const targetLectures = admin
        ? allLectures
        : allLectures.filter((l) => l.instructorId === user?.id);

      const ids = [...targetMeetings.map((m) => m.id), ...targetLectures.map((l) => l.id)];
      const idSet = new Set(ids);

      for (const item of [...targetMeetings, ...targetLectures]) {
        if (item.recordingPath && fs.existsSync(item.recordingPath)) {
          try {
            fs.unlinkSync(item.recordingPath);
          } catch {
            /* ignore */
          }
        }
        if (fs.existsSync(RECORDINGS_DIR)) {
          for (const f of fs.readdirSync(RECORDINGS_DIR)) {
            if (f.includes(item.id)) {
              try {
                fs.unlinkSync(path.join(RECORDINGS_DIR, f));
              } catch {
                /* ignore */
              }
            }
          }
        }
      }

      // Cancel any active background jobs for deleted resources so no orphaned jobs remain
      const activeJobs = (db.get("jobs") || []).filter(
        (j) =>
          idSet.has(j.resourceId) &&
          j.status !== "Completed" &&
          j.status !== "Failed" &&
          j.status !== "Cancelled",
      );
      for (const j of activeJobs) {
        try {
          cancelJob(j.id);
        } catch {
          /* ignore */
        }
      }

      db.update("deletedResourceIds", (list = []) => Array.from(new Set([...list, ...ids])));
      db.update("meetings", (list) => list.filter((m) => !idSet.has(m.id)));
      db.update("lectures", (list) => list.filter((l) => !idSet.has(l.id)));
      db.update("actionItems", (list) =>
        list.filter((t) => !idSet.has(t.meetingId || "") && !idSet.has(t.lectureId || "")),
      );
      db.update("quizzes", (list) =>
        list.filter((q) => !idSet.has(q.meetingId || "") && !idSet.has(q.lectureId || "")),
      );
      db.update("quizAttempts", (list) => list.filter((a) => !idSet.has(a.lectureId || "")));
      db.update("flashcards", (list) =>
        list.filter(
          (c) => !idSet.has(c.lectureId || "") && !idSet.has(c.deckId.replace("deck_", "")),
        ),
      );
      db.update("mindMaps", (list) =>
        list.filter((m) => !idSet.has(m.meetingId || "") && !idSet.has(m.lectureId || "")),
      );
      db.update("chatMessages", (list = []) =>
        list.filter((msg) => !msg.resourceId || !idSet.has(msg.resourceId)),
      );
      db.update("calendarEvents", (list) => list.filter((e) => !idSet.has(e.referenceId || "")));
      db.update("jobs", (list) => list.filter((j) => !idSet.has(j.resourceId)));
      db.update("recordingSessions", (list) => list.filter((s) => !idSet.has(s.id)));

      notifySync({ type: "RECORDINGS_ALL_DELETED", count: ids.length });
      return Response.json({ success: true, deletedCount: ids.length });
    }

    if (
      pathname.startsWith("/api/v1/recordings/") &&
      pathname.endsWith("/reprocess") &&
      method === "POST"
    ) {
      const user = getAuthUser(req);
      const id = pathname.replace("/api/v1/recordings/", "").replace("/reprocess", "");
      const meeting = db
        .get("meetings")
        .find((m) => m.id === id && (isUserAdmin(user) || m.hostId === user?.id));
      const lecture = db
        .get("lectures")
        .find((l) => l.id === id && (isUserAdmin(user) || l.instructorId === user?.id));
      const item = meeting || lecture;
      if (!item || !item.recordingPath || !fs.existsSync(item.recordingPath)) {
        return Response.json(
          { error: "Original recording audio file not found on disk." },
          { status: 404 },
        );
      }

      const rType = meeting ? "meeting" : "lecture";
      const job = createJob(
        rType,
        id,
        item.recordingFileName || path.basename(item.recordingPath),
        item.recordingPath,
        item.language || "auto",
        {
          userId: user?.id || "usr_admin",
        },
      );

      setTimeout(() => {
        void processRecordingJob(
          job.id,
          rType,
          id,
          item.recordingPath!,
          item.recordingFileName || item.title,
          item.language || "auto",
        );
      }, 50);

      return Response.json(
        { success: true, jobId: job.id, resourceId: id, status: "Queued" },
        { status: 202 },
      );
    }

    // ----------------------------------------------------
    // AUDIO STREAMING & DOWNLOAD (With HTTP 206 Range Seeking)
    // ----------------------------------------------------
    if (
      pathname.startsWith("/api/v1/recordings/audio/") &&
      (method === "GET" || method === "HEAD")
    ) {
      const id = pathname.replace("/api/v1/recordings/audio/", "");
      const fileInfo = findRecordingFile(id);

      if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
        return Response.json({ error: "Recording audio file not found" }, { status: 404 });
      }

      const stat = fs.statSync(fileInfo.filePath);
      const fileSize = stat.size;
      const range = req.headers.get("range");

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const nodeStream = fs.createReadStream(fileInfo.filePath, { start, end });
        const webStream = new ReadableStream({
          start(controller) {
            nodeStream.on("data", (chunk) => controller.enqueue(chunk));
            nodeStream.on("end", () => controller.close());
            nodeStream.on("error", (err) => controller.error(err));
          },
          cancel() {
            nodeStream.destroy();
          },
        });

        return new Response(webStream, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunksize),
            "Content-Type": fileInfo.mimeType,
          },
        });
      }

      const nodeStream = fs.createReadStream(fileInfo.filePath);
      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on("data", (chunk) => controller.enqueue(chunk));
          nodeStream.on("end", () => controller.close());
          nodeStream.on("error", (err) => controller.error(err));
        },
        cancel() {
          nodeStream.destroy();
        },
      });

      return new Response(webStream, {
        status: 200,
        headers: {
          "Content-Length": String(fileSize),
          "Accept-Ranges": "bytes",
          "Content-Type": fileInfo.mimeType,
        },
      });
    }

    if (pathname.startsWith("/api/v1/recordings/download/") && method === "GET") {
      const id = pathname.replace("/api/v1/recordings/download/", "");
      const fileInfo = findRecordingFile(id);

      if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
        return Response.json({ error: "Recording audio file not found" }, { status: 404 });
      }

      const stat = fs.statSync(fileInfo.filePath);
      const nodeStream = fs.createReadStream(fileInfo.filePath);
      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on("data", (chunk) => controller.enqueue(chunk));
          nodeStream.on("end", () => controller.close());
          nodeStream.on("error", (err) => controller.error(err));
        },
        cancel() {
          nodeStream.destroy();
        },
      });

      const asciiFallback =
        fileInfo.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || `recording_${id}`;
      const utf8Encoded = encodeURIComponent(fileInfo.fileName);

      return new Response(webStream, {
        status: 200,
        headers: {
          "Content-Length": String(stat.size),
          "Content-Type": fileInfo.mimeType,
          "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`,
        },
      });
    }

    // ----------------------------------------------------
    // JOBS
    // ----------------------------------------------------
    if (pathname === "/api/v1/jobs" && method === "GET") {
      const user = getAuthUser(req);
      const jobs = db.get("jobs");
      const scoped = isUserAdmin(user) ? jobs : jobs.filter((j) => j.userId === user?.id);
      return Response.json(scoped);
    }

    if (pathname.startsWith("/api/v1/jobs/") && pathname.endsWith("/retry") && method === "POST") {
      const id = pathname.replace("/api/v1/jobs/", "").replace("/retry", "");
      try {
        const retried = await retryJob(id);
        return Response.json({ success: true, job: retried });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to retry job";
        return Response.json({ error: message }, { status: 400 });
      }
    }

    if (pathname.startsWith("/api/v1/jobs/") && pathname.endsWith("/cancel") && method === "POST") {
      const id = pathname.replace("/api/v1/jobs/", "").replace("/cancel", "");
      try {
        const cancelled = cancelJob(id);
        return Response.json({ success: true, job: cancelled });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to cancel job";
        return Response.json({ error: message }, { status: 400 });
      }
    }

    if (pathname.startsWith("/api/v1/jobs/") && method === "GET") {
      const user = getAuthUser(req);
      const id = pathname.replace("/api/v1/jobs/", "");
      const job = db
        .get("jobs")
        .find((j) => j.id === id && (isUserAdmin(user) || !j.userId || j.userId === user?.id));
      if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
      return Response.json(job);
    }

    // ----------------------------------------------------
    // TRANSCRIPTS & SESSIONS
    // ----------------------------------------------------
    if (pathname.startsWith("/api/v1/transcripts/session/") && method === "GET") {
      const id = pathname.replace("/api/v1/transcripts/session/", "");
      const meeting = db.get("meetings").find((m) => m.id === id);
      const lecture = db.get("lectures").find((l) => l.id === id);
      const item = meeting || lecture;

      if (!item) {
        return Response.json({ error: "Recording session not found" }, { status: 404 });
      }

      return Response.json({
        success: true,
        recordingId: id,
        title: item.title,
        status: item.status,
        segments: item.segments || [],
        fullText: item.fullText || (item.segments || []).map((s) => s.text).join(" "),
        durationSeconds: item.durationSeconds,
      });
    }

    if (
      pathname.startsWith("/api/v1/transcripts/") &&
      pathname.endsWith("/captions") &&
      method === "GET"
    ) {
      const id = pathname.replace("/api/v1/transcripts/", "").replace("/captions", "");
      const format = url.searchParams.get("format") || "vtt";
      const meeting = db.get("meetings").find((m) => m.id === id);
      const lecture = db.get("lectures").find((l) => l.id === id);
      const item = meeting || lecture;

      if (!item) {
        return Response.json({ error: "Transcript not found" }, { status: 404 });
      }

      const segments = item.segments || [];
      const safeAsciiFilename = `transcript_${item.id}.${format}`;
      const encodedUtf8Filename = encodeURIComponent(`${item.title}.${format}`);

      if (format === "srt") {
        let srtContent = "";
        segments.forEach((seg, idx) => {
          srtContent += `${idx + 1}\n`;
          srtContent += `${formatSrtTime(seg.startTime)} --> ${formatSrtTime(seg.endTime)}\n`;
          srtContent += `${seg.speaker ? `${seg.speaker}: ` : ""}${seg.text}\n\n`;
        });
        return new Response(srtContent, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodedUtf8Filename}`,
          },
        });
      } else {
        let vttContent = "WEBVTT - MeetMind AI Transcript Export\n\n";
        segments.forEach((seg, idx) => {
          vttContent += `${idx + 1}\n`;
          vttContent += `${formatVttTime(seg.startTime)} --> ${formatVttTime(seg.endTime)}\n`;
          vttContent += `${seg.speaker ? `${seg.speaker}: ` : ""}${seg.text}\n\n`;
        });
        return new Response(vttContent, {
          status: 200,
          headers: {
            "Content-Type": "text/vtt; charset=utf-8",
            "Content-Disposition": `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodedUtf8Filename}`,
          },
        });
      }
    }

    if (
      pathname.startsWith("/api/v1/transcripts/") &&
      pathname.endsWith("/speakers") &&
      method === "PUT"
    ) {
      const id = pathname.replace("/api/v1/transcripts/", "").replace("/speakers", "");
      const body = await req.json();
      const rawMap = (body?.speakerMap || {}) as Record<string, string>;
      const speakerMap: Record<string, string> = { ...rawMap };
      if (body?.oldSpeaker && body?.newSpeaker) {
        speakerMap[String(body.oldSpeaker)] = String(body.newSpeaker);
      }

      let updatedCount = 0;
      const remapSegments = (segs: TranscriptSegment[]) =>
        segs.map((s) => {
          const nextName = speakerMap[s.speaker]?.trim();
          if (nextName && nextName !== s.speaker) {
            updatedCount++;
            return { ...s, speaker: nextName };
          }
          return s;
        });

      const meeting = db.get("meetings").find((m) => m.id === id);
      if (meeting) {
        const nextSegs = remapSegments(meeting.segments || []);
        const nextFullText = nextSegs.map((s) => `${s.speaker}: ${s.text}`).join("\n");
        db.update("meetings", (list) =>
          list.map((m) =>
            m.id === id
              ? {
                  ...m,
                  segments: nextSegs,
                  fullText: nextFullText,
                  updatedAt: new Date().toISOString(),
                }
              : m,
          ),
        );
        return Response.json({ success: true, updatedSegments: updatedCount, segments: nextSegs });
      }

      const lecture = db.get("lectures").find((l) => l.id === id);
      if (lecture) {
        const nextSegs = remapSegments(lecture.segments || []);
        const nextFullText = nextSegs.map((s) => `${s.speaker}: ${s.text}`).join("\n");
        db.update("lectures", (list) =>
          list.map((l) =>
            l.id === id
              ? {
                  ...l,
                  segments: nextSegs,
                  fullText: nextFullText,
                  updatedAt: new Date().toISOString(),
                }
              : l,
          ),
        );
        return Response.json({ success: true, updatedSegments: updatedCount, segments: nextSegs });
      }

      return Response.json({ error: "Transcript resource not found" }, { status: 404 });
    }

    if (
      pathname.startsWith("/api/v1/transcripts/") &&
      pathname.endsWith("/export") &&
      method === "GET"
    ) {
      const id = pathname.replace("/api/v1/transcripts/", "").replace("/export", "");
      const format = (url.searchParams.get("format") || "html").toLowerCase();
      const meeting = db.get("meetings").find((m) => m.id === id);
      const lecture = db.get("lectures").find((l) => l.id === id);
      const item = meeting || lecture;
      if (!item) return Response.json({ error: "Transcript resource not found" }, { status: 404 });

      const segments = item.segments || [];
      const summary = item.summary || (lecture ? lecture.studyNotes : "") || "";
      const isArabic = /[\u0600-\u06FF]/.test(
        `${item.title} ${segments.map((s) => s.text).join(" ")}`,
      );
      const fmtTime = (sec: number) =>
        `${Math.floor(sec / 60)
          .toString()
          .padStart(2, "0")}:${Math.floor(sec % 60)
          .toString()
          .padStart(2, "0")}`;

      if (format === "txt") {
        const lines = [
          `# ${item.title}`,
          summary ? `\n${summary}\n` : "",
          ...segments.map(
            (s) => `[${fmtTime(s.startTime)} - ${fmtTime(s.endTime)}] ${s.speaker}: ${s.text}`,
          ),
        ].join("\n");
        return new Response("\uFEFF" + lines, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="transcript_${item.id}.txt"`,
          },
        });
      }

      const html = `<!DOCTYPE html>
<html lang="${isArabic ? "ar" : "en"}" dir="${isArabic ? "rtl" : "ltr"}">
<head><meta charset="utf-8" /><title>${escapeHtml(item.title)}</title>
<style>body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;max-width:820px;margin:32px auto;line-height:1.7;color:#111}h1{color:#7c5a10;border-bottom:2px solid #d4af37;padding-bottom:8px}.seg{margin:10px 0;padding:10px;border-inline-start:3px solid #d4af37;background:#fafafa}.meta{font-size:12px;color:#555;font-weight:bold}@media print{body{margin:12mm}}</style>
</head><body>
<h1>${escapeHtml(item.title)}</h1>
${summary ? `<section><h2>${isArabic ? "الملخص" : "Summary"}</h2><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(summary)}</pre></section>` : ""}
<section><h2>${isArabic ? "النص المفرغ" : "Transcript"}</h2>
${segments.map((s) => `<div class="seg"><div class="meta">[${fmtTime(s.startTime)} - ${fmtTime(s.endTime)}] ${escapeHtml(s.speaker)}</div><div>${escapeHtml(s.text)}</div></div>`).join("\n")}
</section></body></html>`;

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="transcript_${item.id}.html"`,
        },
      });
    }

    if (
      pathname.startsWith("/api/v1/transcripts/") &&
      !pathname.startsWith("/api/v1/transcripts/session") &&
      method === "GET"
    ) {
      const id = pathname.replace("/api/v1/transcripts/", "");
      const meeting = db.get("meetings").find((m) => m.id === id);
      const lecture = db.get("lectures").find((l) => l.id === id);

      if (meeting) {
        return Response.json({
          id: meeting.id,
          title: meeting.title,
          type: "meeting",
          segments: meeting.segments,
          keywords: meeting.keywords || [],
          highlights: meeting.highlights || [],
        });
      }
      if (lecture) {
        return Response.json({
          id: lecture.id,
          title: lecture.title,
          type: "lecture",
          segments: lecture.segments,
          keywords: lecture.keywords || [],
          highlights: lecture.highlights || [],
        });
      }

      return Response.json({ error: "Transcript resource not found" }, { status: 404 });
    }

    if (pathname.startsWith("/api/v1/transcripts/") && method === "PUT") {
      const id = pathname.replace("/api/v1/transcripts/", "");
      const { segments } = await req.json();

      let updated = false;
      db.update("meetings", (meetings) =>
        meetings.map((m) => {
          if (m.id === id) {
            updated = true;
            return { ...m, segments, updatedAt: new Date().toISOString() };
          }
          return m;
        }),
      );

      if (!updated) {
        db.update("lectures", (lectures) =>
          lectures.map((l) => {
            if (l.id === id) {
              updated = true;
              return { ...l, segments, updatedAt: new Date().toISOString() };
            }
            return l;
          }),
        );
      }

      return Response.json({ success: true, segmentsCount: segments?.length || 0 });
    }

    // ----------------------------------------------------
    // LIVE RECORDING LIFECYCLE & PERSISTENT SESSION APIS
    // ----------------------------------------------------

    // 1. START A RECORDING SESSION (Immediate DB Creation & Unique ID)
    if (pathname === "/api/v1/recordings/session/start" && method === "POST") {
      const user = getAuthUser(req);
      const body = await req.json();
      const {
        type = "meeting",
        title = "تسجيل مباشر جديد",
        courseCode = "GEN 101",
        speakerName = "المتحدث 1",
      } = body;

      const now = new Date().toISOString();
      const resourceId = type === "meeting" ? `m_${Date.now()}` : `l_${Date.now()}`;

      // Initialize persistent record immediately in database so it exists from second zero
      if (type === "meeting") {
        const initialMeeting: MeetingRecord = {
          id: resourceId,
          workspaceId: "ws_default",
          title,
          hostName: speakerName || user?.name || "المتحدث 1",
          hostId: user?.id || "usr_admin",
          date: now.split("T")[0],
          durationSeconds: 1,
          participantsCount: 1,
          status: "Processing",
          segments: [],
          fullText: "",
          createdAt: now,
          updatedAt: now,
        };
        db.update("meetings", (meetings) => [initialMeeting, ...meetings]);
      } else {
        const initialLecture: LectureRecord = {
          id: resourceId,
          workspaceId: "ws_default",
          title,
          courseCode: courseCode || "CS 101",
          instructorName: speakerName || user?.name || "المحاضر",
          instructorId: user?.id || "usr_admin",
          date: now.split("T")[0],
          durationSeconds: 1,
          status: "Processing",
          segments: [],
          fullText: "",
          createdAt: now,
          updatedAt: now,
        };
        db.update("lectures", (lectures) => [initialLecture, ...lectures]);
      }

      // Track in active recording sessions
      db.update("recordingSessions", (sessions) => [
        {
          id: resourceId,
          type,
          title,
          courseCode,
          speakerName,
          status: "Recording",
          startedAt: now,
          updatedAt: now,
          segmentsCount: 0,
        },
        ...sessions,
      ]);

      return Response.json({
        success: true,
        recordingId: resourceId,
        resourceId,
        type,
        title,
        status: "Recording",
      });
    }

    // 2. INCREMENTAL AUTOSAVE: APPEND FINALIZED SEGMENT TO ACTIVE SESSION
    if (pathname === "/api/v1/transcripts/session/append-segment" && method === "POST") {
      const body = await req.json();
      const { recordingId, segment } = body;

      if (!recordingId || !segment || !segment.text || !segment.text.trim()) {
        return Response.json(
          { error: "recordingId and a valid segment with text are required" },
          { status: 400 },
        );
      }

      const text = segment.text.trim();
      const now = new Date().toISOString();
      let updated = false;
      let totalSegments = 0;

      // Check meetings
      const meetings = db.get("meetings");
      const meetingIdx = meetings.findIndex((m) => m.id === recordingId);
      if (meetingIdx !== -1) {
        db.update("meetings", (list) => {
          const item = { ...list[meetingIdx] };
          item.segments = item.segments || [];

          // Deduplication: prevent identical phrase or overlapping timestamps with identical content
          const duplicate = item.segments.some(
            (s) =>
              s.text.trim() === text ||
              (Math.abs(s.startTime - segment.startTime) < 2.5 &&
                (s.text.includes(text) || text.includes(s.text))),
          );

          if (!duplicate) {
            item.segments.push({
              id: segment.id || `seg_${Date.now()}_${item.segments.length}`,
              speaker: segment.speaker || "المتحدث 1",
              startTime: Math.round(segment.startTime ?? 0),
              endTime: Math.max(
                Math.round(segment.endTime ?? 2),
                Math.round(segment.startTime ?? 0) + 1,
              ),
              text,
            });
            item.segments.sort((a, b) => a.startTime - b.startTime);
            item.fullText = item.segments.map((s) => s.text).join(" ");
            item.updatedAt = now;
          }
          list[meetingIdx] = item;
          totalSegments = item.segments.length;
          return [...list];
        });
        updated = true;
      }

      // Check lectures
      if (!updated) {
        const lectures = db.get("lectures");
        const lectureIdx = lectures.findIndex((l) => l.id === recordingId);
        if (lectureIdx !== -1) {
          db.update("lectures", (list) => {
            const item = { ...list[lectureIdx] };
            item.segments = item.segments || [];

            const duplicate = item.segments.some(
              (s) =>
                s.text.trim() === text ||
                (Math.abs(s.startTime - segment.startTime) < 2.5 &&
                  (s.text.includes(text) || text.includes(s.text))),
            );

            if (!duplicate) {
              item.segments.push({
                id: segment.id || `seg_${Date.now()}_${item.segments.length}`,
                speaker: segment.speaker || "المحاضر",
                startTime: Math.round(segment.startTime ?? 0),
                endTime: Math.max(
                  Math.round(segment.endTime ?? 2),
                  Math.round(segment.startTime ?? 0) + 1,
                ),
                text,
              });
              item.segments.sort((a, b) => a.startTime - b.startTime);
              item.fullText = item.segments.map((s) => s.text).join(" ");
              item.updatedAt = now;
            }
            list[lectureIdx] = item;
            totalSegments = item.segments.length;
            return [...list];
          });
          updated = true;
        }
      }

      // Sync active session status
      db.update("recordingSessions", (sessions) =>
        sessions.map((s) =>
          s.id === recordingId ? { ...s, updatedAt: now, segmentsCount: totalSegments } : s,
        ),
      );

      return Response.json({
        success: true,
        recordingId,
        totalSegments,
        saved: updated,
      });
    }

    // 4. REAL-TIME AUDIO CHUNK INGESTION & AUTO-APPEND TO DB (Supports both multipart/form-data and JSON)
    if (pathname === "/api/v1/transcripts/live-chunk" && method === "POST") {
      const contentType = (req.headers.get("content-type") || "").toLowerCase();
      let recordingId = "";
      let audioBase64: string | undefined;
      let mimeType: string | undefined;
      let chunkIndex = 0;
      let startTime = 0;
      let endTime = 3;
      let speaker = "Speaker 1";
      let interimText: string | undefined;
      let recentContext: string | undefined;
      let language = "auto";
      let isMeeting = false;

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        recordingId = String(formData.get("recordingId") || "");
        const file = formData.get("file") as File | null;
        if (file && file.size > 0) {
          const buf = Buffer.from(await file.arrayBuffer());
          audioBase64 = buf.toString("base64");
          mimeType = file.type || String(formData.get("mimeType") || "audio/webm");
        } else {
          audioBase64 = formData.get("audioBase64")
            ? String(formData.get("audioBase64"))
            : undefined;
          mimeType = formData.get("mimeType") ? String(formData.get("mimeType")) : "audio/webm";
        }
        chunkIndex = Number(formData.get("chunkIndex") || 0) || 0;
        startTime = Number(formData.get("startTime") ?? formData.get("offsetSeconds") ?? 0) || 0;
        endTime = Number(formData.get("endTime") ?? startTime + 3) || startTime + 3;
        speaker = String(formData.get("speaker") || "Speaker 1");
        interimText = formData.get("interimText") ? String(formData.get("interimText")) : undefined;
        recentContext = formData.get("recentContext")
          ? String(formData.get("recentContext"))
          : undefined;
        language = String(formData.get("language") || "auto");
        isMeeting = String(formData.get("isMeeting") || "false") === "true";
      } else {
        const body = await req.json();
        recordingId = body.recordingId || "";
        audioBase64 = body.audioBase64;
        mimeType = body.mimeType;
        chunkIndex = Number(body.chunkIndex ?? 0) || 0;
        startTime = Number(body.startTime ?? 0) || 0;
        endTime = Number(body.endTime ?? 3) || 3;
        speaker = body.speaker || "Speaker 1";
        interimText = body.interimText;
        recentContext = body.recentContext;
        language = body.language || "auto";
        isMeeting = Boolean(body.isMeeting);
      }

      const result = await transcribeAndTranslateAudioChunk({
        audioBase64,
        mimeType,
        interimText,
        recentContext,
        language,
        offsetSeconds: startTime,
        isMeeting,
      });

      const cleanText = (result.text || result.arabicText || "").trim();
      const isValidPhrase =
        cleanText &&
        cleanText !== "[صمت]" &&
        !cleanText.toLowerCase().includes("[silence]") &&
        !cleanText.includes("جاري الاستماع") &&
        !cleanText.includes("جاري تفريغ") &&
        !cleanText.includes("جاري المعالجة");

      let savedToDb = false;
      if (isValidPhrase && recordingId) {
        const now = new Date().toISOString();
        const segObj = {
          id: `chunk_${Date.now()}_${chunkIndex}`,
          speaker,
          startTime: Math.round(startTime),
          endTime: Math.max(Math.round(endTime), Math.round(startTime) + 1),
          text: cleanText,
          language,
          isPartial: false,
          chunkIndex,
        };

        const meetings = db.get("meetings");
        const meetingIdx = meetings.findIndex((m) => m.id === recordingId);
        if (meetingIdx !== -1) {
          db.update("meetings", (list) => {
            const item = { ...list[meetingIdx] };
            item.segments = item.segments || [];
            const duplicate = item.segments.some(
              (s) =>
                s.text.trim() === cleanText ||
                (Math.abs(s.startTime - startTime) < 2.5 &&
                  (s.text.includes(cleanText) || cleanText.includes(s.text))),
            );
            if (!duplicate) {
              item.segments.push(segObj);
              item.segments.sort((a, b) => a.startTime - b.startTime);
              item.fullText = item.segments.map((s) => s.text).join(" ");
              item.updatedAt = now;
            }
            list[meetingIdx] = item;
            return [...list];
          });
          savedToDb = true;
        } else {
          const lectures = db.get("lectures");
          const lectureIdx = lectures.findIndex((l) => l.id === recordingId);
          if (lectureIdx !== -1) {
            db.update("lectures", (list) => {
              const item = { ...list[lectureIdx] };
              item.segments = item.segments || [];
              const duplicate = item.segments.some(
                (s) =>
                  s.text.trim() === cleanText ||
                  (Math.abs(s.startTime - startTime) < 2.5 &&
                    (s.text.includes(cleanText) || cleanText.includes(s.text))),
              );
              if (!duplicate) {
                item.segments.push(segObj);
                item.segments.sort((a, b) => a.startTime - b.startTime);
                item.fullText = item.segments.map((s) => s.text).join(" ");
                item.updatedAt = now;
              }
              list[lectureIdx] = item;
              return [...list];
            });
            savedToDb = true;
          }
        }
      }

      return Response.json({
        success: true,
        chunkIndex,
        startTime,
        endTime,
        speaker,
        arabicText: cleanText,
        text: cleanText,
        detectedLanguage: result.detectedLanguage,
        isFinal: true,
        savedToDb,
      });
    }

    // 5. FINALIZE LIVE SESSION: WRITE COMPLETE AUDIO FILE, MERGE ALL SEGMENTS, RUN AI ANALYSIS
    if (pathname === "/api/v1/transcripts/live-session/finalize" && method === "POST") {
      const user = getAuthUser(req);
      const body = await req.json();
      const {
        recordingId,
        type = "meeting",
        title = "جلسة تسجيل مباشر",
        courseCode = "GEN 101",
        segments = [],
        durationSeconds = 60,
        audioBase64,
      } = body;

      const now = new Date().toISOString();
      const resourceId =
        recordingId || (type === "meeting" ? `m_${Date.now()}` : `l_${Date.now()}`);

      let recordingPath: string | undefined = undefined;
      let audioUrl: string | undefined = undefined;

      // 1. Physically write complete audio file to disk
      if (audioBase64 && audioBase64.length > 32) {
        if (!fs.existsSync(RECORDINGS_DIR)) {
          fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
        }
        const fileName = `recording_${resourceId}.webm`;
        const filePath = path.join(RECORDINGS_DIR, fileName);
        try {
          const buffer = Buffer.from(audioBase64, "base64");
          fs.writeFileSync(filePath, buffer);
          recordingPath = filePath;
          audioUrl = `/api/v1/recordings/audio/${resourceId}`;
        } catch (e) {
          console.error("Failed to write recording audio file:", e);
        }
      }

      // Check if item already exists from session/start
      const existingMeeting = db.get("meetings").find((m) => m.id === resourceId);
      const existingLecture = db.get("lectures").find((l) => l.id === resourceId);
      const existingItem = existingMeeting || existingLecture;

      // 2. Merge existing segments in DB with any passed segments, deduplicating cleanly
      const initialSegs = existingItem?.segments || [];
      const mergedSegments: TranscriptSegment[] = [...initialSegs];

      for (const seg of segments) {
        if (!seg.text || !seg.text.trim()) continue;
        const trimmed = seg.text.trim();
        const isDuplicate = mergedSegments.some(
          (m) =>
            m.text.trim() === trimmed ||
            (Math.abs(m.startTime - seg.startTime) < 2.5 &&
              (m.text.includes(trimmed) || trimmed.includes(m.text))),
        );
        if (!isDuplicate) {
          mergedSegments.push({
            id: seg.id || `seg_${Date.now()}_${mergedSegments.length}`,
            speaker: seg.speaker || (type === "meeting" ? "المتحدث 1" : "المحاضر"),
            startTime: Math.round(seg.startTime ?? 0),
            endTime: Math.max(Math.round(seg.endTime ?? 2), Math.round(seg.startTime ?? 0) + 1),
            text: trimmed,
          });
        }
      }

      // Chronological sort
      mergedSegments.sort((a, b) => a.startTime - b.startTime);

      const consolidatedFullText = mergedSegments.map((s) => s.text).join(" ");

      // If no live segments were captured yet and we have a real recorded audio file, queue background ASR pipeline
      if (mergedSegments.length === 0 && recordingPath && fs.existsSync(recordingPath)) {
        const probe = await validateMediaFile(recordingPath, `recording_${resourceId}.webm`);
        if (probe.valid) {
          const job = createJob(
            type,
            resourceId,
            `recording_${resourceId}.webm`,
            recordingPath,
            body.language || "auto",
            {
              userId: user?.id || "usr_admin",
            },
          );
          setTimeout(() => {
            void processRecordingJob(
              job.id,
              type,
              resourceId,
              recordingPath!,
              `recording_${resourceId}.webm`,
              body.language || "auto",
            );
          }, 50);

          return Response.json({
            success: true,
            resourceId,
            jobId: job.id,
            segmentsCount: 0,
            hasAudio: true,
            status: "Processing",
          });
        }
      }

      const keywords = extractKeywordsWithFrequency(mergedSegments, 10);
      const highlights = extractHighlightsFromSegments(mergedSegments);
      const analysis =
        mergedSegments.length > 0
          ? await generateAiSummary(title, mergedSegments, type, courseCode)
          : { summary: "", keyPoints: [], decisions: [], actionItems: [] };

      if (type === "meeting") {
        const meetingObj: MeetingRecord = {
          id: resourceId,
          workspaceId: "ws_default",
          title: existingMeeting?.title || title,
          hostName: existingMeeting?.hostName || user?.name || "Organizer",
          hostId: existingMeeting?.hostId || user?.id || "usr_admin",
          date: existingMeeting?.date || now.split("T")[0],
          durationSeconds: Math.max(1, durationSeconds, existingMeeting?.durationSeconds || 1),
          participantsCount: existingMeeting?.participantsCount || 1,
          status: mergedSegments.length > 0 ? "Completed" : "Failed",
          recordingPath: recordingPath || existingMeeting?.recordingPath,
          recordingFileName: recordingPath
            ? `recording_${resourceId}.webm`
            : existingMeeting?.recordingFileName,
          audioUrl: audioUrl || existingMeeting?.audioUrl,
          summary: analysis.summary,
          executiveSummary: analysis.summary,
          detailedSummary: analysis.summary,
          keyPoints: analysis.keyPoints,
          decisions: analysis.decisions,
          topics: keywords.slice(0, 4).map((k) => k.term),
          keywords,
          highlights,
          fullText: consolidatedFullText,
          segments: mergedSegments,
          createdAt: existingMeeting?.createdAt || now,
          updatedAt: now,
        };

        if (existingMeeting) {
          db.update("meetings", (meetings) =>
            meetings.map((m) => (m.id === resourceId ? meetingObj : m)),
          );
        } else {
          db.update("meetings", (meetings) => [meetingObj, ...meetings]);
        }
      } else {
        const lectureObj: LectureRecord = {
          id: resourceId,
          workspaceId: "ws_default",
          title: existingLecture?.title || title,
          courseCode: existingLecture?.courseCode || courseCode || "CS 101",
          instructorName: existingLecture?.instructorName || user?.name || "Lecturer",
          instructorId: existingLecture?.instructorId || user?.id || "usr_admin",
          date: existingLecture?.date || now.split("T")[0],
          durationSeconds: Math.max(1, durationSeconds, existingLecture?.durationSeconds || 1),
          status: mergedSegments.length > 0 ? "Completed" : "Failed",
          recordingPath: recordingPath || existingLecture?.recordingPath,
          recordingFileName: recordingPath
            ? `recording_${resourceId}.webm`
            : existingLecture?.recordingFileName,
          audioUrl: audioUrl || existingLecture?.audioUrl,
          studyNotes: analysis.summary,
          summary: analysis.summary,
          executiveSummary: analysis.summary,
          detailedSummary: analysis.summary,
          topics: keywords.slice(0, 4).map((k) => k.term),
          keywords,
          highlights,
          fullText: consolidatedFullText,
          segments: mergedSegments,
          createdAt: existingLecture?.createdAt || now,
          updatedAt: now,
        };

        if (existingLecture) {
          db.update("lectures", (lectures) =>
            lectures.map((l) => (l.id === resourceId ? lectureObj : l)),
          );
        } else {
          db.update("lectures", (lectures) => [lectureObj, ...lectures]);
        }

        if (mergedSegments.length > 0) {
          const generatedQuiz = await generateAiQuiz(
            title,
            mergedSegments,
            analysis.summary,
            courseCode,
          );
          if (generatedQuiz.questions.length > 0) {
            db.update("quizzes", (quizzes) => [
              {
                id: `quiz_${resourceId}`,
                lectureId: resourceId,
                title: generatedQuiz.title,
                courseCode: courseCode || "CS 101",
                questions: generatedQuiz.questions,
                attemptsCount: 0,
                createdAt: now,
              },
              ...quizzes.filter((q) => q.lectureId !== resourceId),
            ]);
          }
        }
      }

      db.update("recordingSessions", (sessions) =>
        sessions.map((s) =>
          s.id === resourceId
            ? {
                ...s,
                status: mergedSegments.length > 0 ? "Completed" : "Failed",
                completedAt: now,
                segmentsCount: mergedSegments.length,
              }
            : s,
        ),
      );

      db.update("notifications", (notifs) => [
        {
          id: `notif_${Date.now()}`,
          userId: user?.id || "usr_admin",
          title:
            mergedSegments.length > 0
              ? "Recording finalized and analyzed"
              : "Recording had no speech detected",
          body: `Processed "${title}" (${mergedSegments.length} segments).`,
          targetUrl: `/transcript?id=${resourceId}`,
          read: false,
          type: "summary",
          createdAt: now,
        },
        ...notifs,
      ]);

      return Response.json({
        success: mergedSegments.length > 0,
        resourceId,
        segmentsCount: mergedSegments.length,
        hasAudio: !!(recordingPath || existingItem?.recordingPath),
        status: mergedSegments.length > 0 ? "Completed" : "Failed",
      });
    }

    // ----------------------------------------------------
    // AI OPERATIONS & GROUNDED Q&A
    // ----------------------------------------------------
    if (pathname === "/api/v1/ai/generate-summary" && method === "POST") {
      const body = await req.json();
      const { resourceId, type = "meeting" } = body;
      const meeting = db.get("meetings").find((m) => m.id === resourceId);
      const lecture = db.get("lectures").find((l) => l.id === resourceId);
      const target = meeting || lecture;

      if (!target) {
        return Response.json({ error: "Recording or lecture not found" }, { status: 404 });
      }

      const courseCode = lecture?.courseCode || "GEN 101";

      const summaryResult = await generateAiSummary(
        target.title,
        target.segments || [],
        type === "lecture" ? "lecture" : "meeting",
        courseCode,
      );

      const summaryText = summaryResult.summary;

      if (meeting) {
        db.update("meetings", (meetings) =>
          meetings.map((m) =>
            m.id === resourceId
              ? { ...m, summary: summaryText, keyPoints: summaryResult.keyPoints }
              : m,
          ),
        );
      } else if (lecture) {
        db.update("lectures", (lectures) =>
          lectures.map((l) =>
            l.id === resourceId
              ? {
                  ...l,
                  studyNotes: summaryText,
                  keyConcepts: summaryResult.keyPoints.map((kp) => ({
                    term: "نقطة محورية",
                    definition: kp,
                  })),
                }
              : l,
          ),
        );
      }

      return Response.json({ success: true, summary: summaryText, resourceId });
    }

    if (pathname === "/api/v1/ai/generate-quiz" && method === "POST") {
      const body = await req.json();
      const { resourceId, type = "lecture" } = body;
      const meeting = db.get("meetings").find((m) => m.id === resourceId);
      const lecture = db.get("lectures").find((l) => l.id === resourceId);
      const target = meeting || lecture;

      if (!target) {
        return Response.json({ error: "Recording or lecture not found" }, { status: 404 });
      }

      const summaryText = meeting?.summary || lecture?.studyNotes || "";
      const courseCode = lecture?.courseCode || "GEN 101";

      const quizResult = await generateAiQuiz(
        target.title,
        target.segments || [],
        summaryText,
        courseCode,
      );

      const quizId = `quiz_${resourceId}_${Date.now()}`;
      const newQuiz = {
        id: quizId,
        lectureId: resourceId,
        meetingId: type === "meeting" ? resourceId : undefined,
        title: quizResult.title || `اختبار تقييمي شامل: ${target.title}`,
        courseCode,
        questions: quizResult.questions.map((q, idx) => ({
          id: q.id || `q_${resourceId}_${idx + 1}`,
          question: q.question,
          options: q.options,
          correctOptionIndex: q.correctOptionIndex,
          explanation: q.explanation,
        })),
        attemptsCount: 0,
        createdAt: new Date().toISOString(),
      };

      db.update("quizzes", (quizzes) => [
        newQuiz,
        ...quizzes.filter((q) => q.lectureId !== resourceId && q.meetingId !== resourceId),
      ]);

      return Response.json({ success: true, quiz: newQuiz });
    }

    if (pathname === "/api/v1/ai/generate-analysis" && method === "POST") {
      const body = await req.json();
      const { resourceId, type = "lecture" } = body;
      const meeting = db.get("meetings").find((m) => m.id === resourceId);
      const lecture = db.get("lectures").find((l) => l.id === resourceId);
      const target = meeting || lecture;

      if (!target) {
        return Response.json({ error: "Recording or lecture not found" }, { status: 404 });
      }

      const courseCode = lecture?.courseCode || "GEN 101";

      const analysis = await generateAiLectureAnalysis(
        target.title,
        target.segments || [],
        type === "lecture" ? "lecture" : "meeting",
        courseCode,
      );

      if (meeting) {
        db.update("meetings", (meetings) =>
          meetings.map((m) => (m.id === resourceId ? { ...m, analysis } : m)),
        );
      } else if (lecture) {
        db.update("lectures", (lectures) =>
          lectures.map((l) => (l.id === resourceId ? { ...l, analysis } : l)),
        );
      }

      return Response.json({ success: true, analysis });
    }

    if (pathname === "/api/v1/ai/ask" && method === "POST") {
      const user = getAuthUser(req);
      const admin = isUserAdmin(user);
      const body = await req.json();
      const { question, resourceId, recordingId, history } = body;

      if (!question || typeof question !== "string" || !question.trim()) {
        return Response.json({ error: "Question is required" }, { status: 400 });
      }

      const result = await askMeetMindAI({
        question: question.trim(),
        resourceId: resourceId || recordingId,
        history: Array.isArray(history) ? history : [],
        userId: user?.id || "usr_admin",
        isAdmin: admin,
      });

      if (result.forbidden) {
        return Response.json(
          { error: "You do not have permission to query this recording." },
          { status: 403 },
        );
      }

      return Response.json(result);
    }

    if (pathname === "/api/v1/ai/chat-history" && method === "GET") {
      const user = getAuthUser(req);
      const admin = isUserAdmin(user);
      const resourceId = url.searchParams.get("resourceId");
      const messages = (db.get("chatMessages") || []).filter(
        (m) => (admin || m.userId === user?.id) && (!resourceId || m.resourceId === resourceId),
      );
      return Response.json(messages.slice(-50));
    }

    if (pathname === "/api/v1/ai/analyze" && method === "POST") {
      const body = await req.json();
      const { resourceId, type } = body;

      const meeting =
        type === "meeting" ? db.get("meetings").find((m) => m.id === resourceId) : null;
      const lecture =
        type === "lecture" ? db.get("lectures").find((l) => l.id === resourceId) : null;
      const target = meeting || lecture;

      if (!target) {
        return Response.json({ error: "Resource not found for analysis" }, { status: 404 });
      }

      const analysis = generateAnalysisFromTranscript(
        target.title,
        target.segments,
        type || "meeting",
        lecture?.courseCode,
      );

      return Response.json(analysis);
    }

    // ----------------------------------------------------
    // ACTION ITEMS / TASKS
    // ----------------------------------------------------
    if (pathname === "/api/v1/tasks" && method === "GET") {
      const user = getAuthUser(req);
      const tasks = db.get("actionItems");
      return Response.json(
        isUserAdmin(user) ? tasks : tasks.filter((t) => !t.userId || t.userId === user?.id),
      );
    }

    if (pathname === "/api/v1/tasks" && method === "POST") {
      const user = getAuthUser(req);
      const body = await req.json();
      const { title, ownerName, dueDate, priority, meetingId } = body;

      if (!title) {
        return Response.json({ error: "Title is required" }, { status: 400 });
      }

      const newTask: ActionItemRecord = {
        id: `t_${Date.now()}`,
        userId: user?.id || "usr_admin",
        meetingId,
        title,
        ownerName: ownerName || undefined,
        dueDate: dueDate || undefined,
        deadlineText: dueDate || "Deadline not specified.",
        priority: priority || "medium",
        completed: false,
        createdAt: new Date().toISOString(),
      };

      db.update("actionItems", (all) => [newTask, ...all]);
      return Response.json(newTask, { status: 201 });
    }

    if (pathname.startsWith("/api/v1/tasks/") && method === "PUT") {
      const id = pathname.replace("/api/v1/tasks/", "");
      const existingTask = db.get("actionItems").find((item) => item.id === id);
      if (!existingTask) return Response.json({ error: "Task not found" }, { status: 404 });
      const ownedIds = getScopedResourceIds(currentUser);
      const isTaskOwner =
        currentIsAdmin ||
        existingTask.userId === currentUser.id ||
        ownedIds.has(existingTask.meetingId || existingTask.lectureId || "");
      if (!isTaskOwner) return Response.json({ error: "Forbidden" }, { status: 403 });

      const updates = await req.json();
      const updated = db.update("actionItems", (items) =>
        items.map((item) => (item.id === id ? { ...item, ...updates, userId: item.userId } : item)),
      );

      return Response.json(updated.find((t) => t.id === id));
    }

    if (pathname.startsWith("/api/v1/tasks/") && method === "DELETE") {
      const id = pathname.replace("/api/v1/tasks/", "");
      const existingTask = db.get("actionItems").find((item) => item.id === id);
      if (!existingTask) return Response.json({ error: "Task not found" }, { status: 404 });
      const ownedIds = getScopedResourceIds(currentUser);
      const isTaskOwner =
        currentIsAdmin ||
        existingTask.userId === currentUser.id ||
        ownedIds.has(existingTask.meetingId || existingTask.lectureId || "");
      if (!isTaskOwner) return Response.json({ error: "Forbidden" }, { status: 403 });

      db.update("actionItems", (all) => all.filter((t) => t.id !== id));
      return Response.json({ success: true, id });
    }

    // ----------------------------------------------------
    // QUIZZES & ASSESSMENT
    // ----------------------------------------------------
    if (pathname === "/api/v1/quizzes/attempts" && method === "GET") {
      const quizId = url.searchParams.get("quizId");
      const ownedIds = getScopedResourceIds(currentUser);
      const attempts = (db.get("quizAttempts") || []).filter(
        (a) => currentIsAdmin || a.userId === currentUser.id || ownedIds.has(a.lectureId || ""),
      );
      if (quizId) {
        return Response.json(attempts.filter((a) => a.quizId === quizId));
      }
      return Response.json(attempts);
    }

    if (pathname === "/api/v1/quizzes/generate" && method === "POST") {
      const body = await req.json();
      const { lectureId, avoidQuestionTitles = [], variant = 2 } = body;

      const lecture = db
        .get("lectures")
        .find((l) => l.id === lectureId && (currentIsAdmin || l.instructorId === currentUser.id));
      if (!lecture) {
        return Response.json({ error: "Lecture not found" }, { status: 404 });
      }

      const generated = await generateAiQuiz(
        lecture.title,
        lecture.segments,
        lecture.summary || lecture.studyNotes,
        lecture.courseCode,
        {
          avoidQuestionTitles,
          variant,
        },
      );

      const newQuizId = `quiz_${Date.now()}`;
      const newQuiz = {
        id: newQuizId,
        lectureId,
        title: generated.title,
        courseCode: generated.courseCode,
        questions: generated.questions,
        attemptsCount: 0,
        createdAt: new Date().toISOString(),
      };

      db.update("quizzes", (quizzes) => [
        newQuiz,
        ...quizzes.filter((q) => q.lectureId !== lectureId),
      ]);

      notifySync({ type: "QUIZ_GENERATED", id: newQuizId });
      return Response.json(newQuiz, { status: 201 });
    }

    if (pathname === "/api/v1/quizzes" && method === "GET") {
      const ownedIds = getScopedResourceIds(currentUser);
      const scoped = currentIsAdmin
        ? db.get("quizzes")
        : db.get("quizzes").filter((q) => ownedIds.has(q.lectureId || q.meetingId || ""));
      return Response.json(scoped);
    }

    if (
      pathname.startsWith("/api/v1/quizzes/") &&
      !pathname.endsWith("/attempt") &&
      method === "GET"
    ) {
      const id = pathname.replace("/api/v1/quizzes/", "");
      const ownedIds = getScopedResourceIds(currentUser);
      const quiz = db
        .get("quizzes")
        .find(
          (q) =>
            (q.id === id || q.lectureId === id || q.meetingId === id) &&
            (currentIsAdmin || ownedIds.has(q.lectureId || q.meetingId || "")),
        );
      if (!quiz) return Response.json({ error: "Quiz not found" }, { status: 404 });
      return Response.json(quiz);
    }

    if (
      pathname.startsWith("/api/v1/quizzes/") &&
      pathname.endsWith("/attempt") &&
      method === "POST"
    ) {
      const id = pathname.replace("/api/v1/quizzes/", "").replace("/attempt", "");
      const body = await req.json();
      const { answers = {} } = body as {
        answers: Record<string, string | number>;
      };
      // Always derive user identity from the verified JWT — never trust client-supplied userId
      const userId = currentUser.id;
      const ownedIds = getScopedResourceIds(currentUser);

      const quiz = db
        .get("quizzes")
        .find(
          (q) => q.id === id && (currentIsAdmin || ownedIds.has(q.lectureId || q.meetingId || "")),
        );
      if (!quiz) return Response.json({ error: "Quiz not found" }, { status: 404 });

      // Normalization helper for Arabic text (strips diacritics, tatweel, extra spaces)
      const normalizeAr = (str: string) =>
        (str || "")
          .trim()
          .toLowerCase()
          .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
          .replace(/[أإآ]/g, "ا")
          .replace(/[ة]/g, "ه")
          .replace(/[ى]/g, "ي");

      let correctCount = 0;
      const results = quiz.questions.map((q) => {
        const rawAnswer = answers[q.id];
        let isCorrect = false;

        if (q.type === "true_false" || q.type === "multiple_choice" || !q.type) {
          isCorrect = Number(rawAnswer) === q.correctOptionIndex;
        } else if (q.type === "fill_in_the_blank") {
          const userText = normalizeAr(String(rawAnswer || ""));
          const correctText = normalizeAr(q.correctAnswerText || "");
          const accepted = (q.acceptableAnswers || []).map(normalizeAr);
          isCorrect =
            userText.length > 0 &&
            (userText === correctText ||
              accepted.includes(userText) ||
              correctText.includes(userText));
        } else if (q.type === "short_answer") {
          const userText = String(rawAnswer || "").trim();
          // Short answer is considered answered and reviewed if non-empty
          isCorrect = userText.length >= 8;
        }

        if (isCorrect) correctCount++;

        return {
          questionId: q.id,
          type: q.type || "multiple_choice",
          userAnswer: rawAnswer,
          correctOptionIndex: q.correctOptionIndex,
          correctAnswerText: q.correctAnswerText,
          isCorrect,
          explanation: q.explanation,
        };
      });

      const scorePercent = Math.round((correctCount / Math.max(quiz.questions.length, 1)) * 100);

      // Record attempt permanently in database
      const attemptRecord = {
        id: `att_${Date.now()}`,
        quizId: id,
        lectureId: quiz.lectureId,
        userId,
        scorePercent,
        correctCount,
        totalQuestions: quiz.questions.length,
        answers,
        submittedAt: new Date().toISOString(),
      };

      db.update("quizAttempts", (attempts = []) => [attemptRecord, ...(attempts || [])]);

      db.update("quizzes", (quizzes) =>
        quizzes.map((q) =>
          q.id === id
            ? { ...q, attemptsCount: (q.attemptsCount || 0) + 1, lastScore: scorePercent }
            : q,
        ),
      );

      notifySync({ type: "QUIZ_ATTEMPT_SUBMITTED", id });

      return Response.json({
        quizId: id,
        attemptId: attemptRecord.id,
        totalQuestions: quiz.questions.length,
        correctCount,
        scorePercent,
        results,
      });
    }

    // ----------------------------------------------------
    // FLASHCARDS
    // ----------------------------------------------------
    if (pathname === "/api/v1/flashcards" && method === "GET") {
      const ownedIds = getScopedResourceIds(currentUser);
      const scoped = currentIsAdmin
        ? db.get("flashcards")
        : db
            .get("flashcards")
            .filter(
              (c) =>
                ownedIds.has(c.lectureId || c.meetingId || "") ||
                ownedIds.has((c.deckId || "").replace(/^deck_/, "")),
            );
      return Response.json(scoped);
    }

    if (pathname.startsWith("/api/v1/flashcards/") && method === "PUT") {
      const id = pathname.replace("/api/v1/flashcards/", "");
      const ownedIds = getScopedResourceIds(currentUser);
      const existingCard = db.get("flashcards").find((c) => c.id === id);
      if (!existingCard) return Response.json({ error: "Flashcard not found" }, { status: 404 });
      const ownsCard =
        currentIsAdmin ||
        ownedIds.has(existingCard.lectureId || existingCard.meetingId || "") ||
        ownedIds.has((existingCard.deckId || "").replace(/^deck_/, ""));
      if (!ownsCard) return Response.json({ error: "Forbidden" }, { status: 403 });

      const updates = await req.json();
      const updated = db.update("flashcards", (cards) =>
        cards.map((c) =>
          c.id === id
            ? {
                ...c,
                ...updates,
                reviewCount:
                  updates.reviewCount !== undefined ? updates.reviewCount : c.reviewCount + 1,
              }
            : c,
        ),
      );
      return Response.json(updated.find((c) => c.id === id));
    }

    if (pathname === "/api/v1/flashcards/generate" && method === "POST") {
      const body = await req.json();
      const { lectureId, meetingId } = body;
      const targetId = lectureId || meetingId;
      const ownedLectures = currentIsAdmin
        ? db.get("lectures")
        : db.get("lectures").filter((l) => l.instructorId === currentUser.id);
      const ownedMeetings = currentIsAdmin
        ? db.get("meetings")
        : db.get("meetings").filter((m) => m.hostId === currentUser.id);
      const lecture = targetId ? ownedLectures.find((l) => l.id === targetId) : ownedLectures[0];
      const meeting = targetId ? ownedMeetings.find((m) => m.id === targetId) : undefined;
      const resource = lecture || meeting;

      if (!resource) {
        return Response.json(
          { error: "No authorized lecture or meeting found for flashcard generation" },
          { status: 404 },
        );
      }

      const generated = await generateAiFlashcards(
        resource.title,
        resource.segments,
        resource.summary,
        "courseCode" in resource ? resource.courseCode : undefined,
      );

      const now = new Date().toISOString();
      const newCards = generated.map((c, idx) => ({
        id: `fc_${Date.now()}_${idx + 1}`,
        deckId: `deck_${resource.id}`,
        deckTitle:
          resource.title.length > 35 ? resource.title.slice(0, 35) + "..." : resource.title,
        lectureId: "courseCode" in resource ? resource.id : undefined,
        meetingId: !("courseCode" in resource) ? resource.id : undefined,
        front: c.front,
        back: c.back,
        sourceReference: c.sourceReference,
        topic: c.topic,
        difficulty: c.difficulty,
        mastered: false,
        reviewCount: 0,
        createdAt: now,
      }));

      db.update("flashcards", (cards) => [
        ...newCards,
        ...cards.filter((c) => c.deckId !== `deck_${resource.id}`),
      ]);

      return Response.json(newCards, { status: 201 });
    }

    // ----------------------------------------------------
    // MIND MAPS
    // ----------------------------------------------------
    if (pathname === "/api/v1/mindmaps" && method === "GET") {
      const ownedIds = getScopedResourceIds(currentUser);
      const scoped = currentIsAdmin
        ? db.get("mindMaps")
        : db.get("mindMaps").filter((m) => ownedIds.has(m.lectureId || m.meetingId || ""));
      return Response.json(scoped);
    }

    if (pathname === "/api/v1/mindmaps/generate" && method === "POST") {
      const body = await req.json();
      const { lectureId, meetingId } = body;
      const targetId = lectureId || meetingId;
      const ownedLectures = currentIsAdmin
        ? db.get("lectures")
        : db.get("lectures").filter((l) => l.instructorId === currentUser.id);
      const ownedMeetings = currentIsAdmin
        ? db.get("meetings")
        : db.get("meetings").filter((m) => m.hostId === currentUser.id);
      const lecture = targetId ? ownedLectures.find((l) => l.id === targetId) : ownedLectures[0];
      const meeting = targetId ? ownedMeetings.find((m) => m.id === targetId) : undefined;
      const resource = lecture || meeting;

      if (!resource) {
        return Response.json(
          { error: "No authorized lecture or meeting found for mind map generation" },
          { status: 404 },
        );
      }

      const rootNode = await generateAiMindMap(
        resource.title,
        resource.segments,
        resource.summary,
        "courseCode" in resource ? resource.courseCode : undefined,
      );

      const now = new Date().toISOString();
      const newMap = {
        id: `mm_${Date.now()}`,
        title: resource.title,
        lectureId: "courseCode" in resource ? resource.id : undefined,
        meetingId: !("courseCode" in resource) ? resource.id : undefined,
        rootNode,
        createdAt: now,
      };

      db.update("mindMaps", (maps) => [
        newMap,
        ...maps.filter((m) =>
          "courseCode" in resource ? m.lectureId !== resource.id : m.meetingId !== resource.id,
        ),
      ]);

      return Response.json(newMap, { status: 201 });
    }

    // ----------------------------------------------------
    // CALENDAR
    // ----------------------------------------------------
    if (pathname === "/api/v1/calendar" && method === "GET") {
      const ownedIds = getScopedResourceIds(currentUser);
      const scoped = currentIsAdmin
        ? db.get("calendarEvents")
        : db.get("calendarEvents").filter((e) => {
            const ownerId = (e as { userId?: string }).userId;
            return ownerId === currentUser.id || (e.referenceId && ownedIds.has(e.referenceId));
          });
      return Response.json(scoped);
    }

    if (pathname === "/api/v1/calendar" && method === "POST") {
      const body = await req.json();
      const { title, date, time, kind, attendeesCount } = body;
      const newEvent = {
        id: `ev_${Date.now()}`,
        userId: currentUser.id,
        title,
        date,
        time: time || "10:00 AM",
        kind: kind || "meeting",
        attendeesCount: attendeesCount || 1,
      };
      db.update("calendarEvents", (events) => [newEvent, ...events]);
      return Response.json(newEvent, { status: 201 });
    }

    // ----------------------------------------------------
    // NOTIFICATIONS
    // ----------------------------------------------------
    if (pathname === "/api/v1/notifications" && method === "GET") {
      const ownedIds = getScopedResourceIds(currentUser);
      const scoped = currentIsAdmin
        ? db.get("notifications")
        : db.get("notifications").filter((n) => {
            const ownerId = (n as { userId?: string }).userId;
            if (ownerId) return ownerId === currentUser.id;
            if (n.targetUrl) {
              for (const rid of ownedIds) {
                if (n.targetUrl.includes(rid)) return true;
              }
            }
            return false;
          });
      return Response.json(scoped);
    }

    if (
      pathname.startsWith("/api/v1/notifications/") &&
      pathname.endsWith("/read") &&
      method === "PUT"
    ) {
      const id = pathname.replace("/api/v1/notifications/", "").replace("/read", "");
      db.update("notifications", (notifs) =>
        notifs.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return Response.json({ success: true });
    }

    if (pathname === "/api/v1/notifications/read-all" && method === "PUT") {
      db.update("notifications", (notifs) =>
        notifs.map((n) => {
          const ownerId = (n as { userId?: string }).userId;
          if (currentIsAdmin || ownerId === currentUser.id) return { ...n, read: true };
          return n;
        }),
      );
      return Response.json({ success: true });
    }

    // ----------------------------------------------------
    // REPORTS & EXPORT (STRICT USER ISOLATION)
    // ----------------------------------------------------
    if (pathname === "/api/v1/reports" && method === "GET") {
      const meetings = currentIsAdmin
        ? db.get("meetings")
        : db.get("meetings").filter((m) => m.hostId === currentUser.id);
      const lectures = currentIsAdmin
        ? db.get("lectures")
        : db.get("lectures").filter((l) => l.instructorId === currentUser.id);
      const ownedIds = new Set([...meetings.map((m) => m.id), ...lectures.map((l) => l.id)]);
      const tasks = currentIsAdmin
        ? db.get("actionItems")
        : db
            .get("actionItems")
            .filter(
              (t) => t.userId === currentUser.id || ownedIds.has(t.meetingId || t.lectureId || ""),
            );

      return Response.json({
        totalRecordings: meetings.length + lectures.length,
        totalAudioHours: Math.round(
          (meetings.reduce((acc, m) => acc + m.durationSeconds, 0) +
            lectures.reduce((acc, l) => acc + l.durationSeconds, 0)) /
            3600,
        ),
        totalDecisions: meetings.reduce((acc, m) => acc + (m.decisions?.length || 0), 0),
        taskCompletionRate:
          tasks.length > 0
            ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100)
            : 0,
        meetingsBreakdown: meetings.map((m) => ({
          title: m.title,
          date: m.date,
          duration: `${Math.round(m.durationSeconds / 60)}m`,
          status: m.status,
        })),
        lecturesBreakdown: lectures.map((l) => ({
          title: l.title,
          course: l.courseCode,
          date: l.date,
          duration: `${Math.round(l.durationSeconds / 60)}m`,
          status: l.status,
        })),
      });
    }

    if (pathname === "/api/v1/reports/export" && method === "GET") {
      const meetings = currentIsAdmin
        ? db.get("meetings")
        : db.get("meetings").filter((m) => m.hostId === currentUser.id);
      const lectures = currentIsAdmin
        ? db.get("lectures")
        : db.get("lectures").filter((l) => l.instructorId === currentUser.id);

      let csv = "ID,Type,Title,Date,DurationMinutes,Status\n";
      for (const m of meetings) {
        csv += `"${m.id}","Meeting","${m.title.replace(/"/g, '""')}","${m.date}",${Math.round(m.durationSeconds / 60)},"${m.status}"\n`;
      }
      for (const l of lectures) {
        csv += `"${l.id}","Lecture","${l.title.replace(/"/g, '""')}","${l.date}",${Math.round(l.durationSeconds / 60)},"${l.status}"\n`;
      }
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="meetmind_report.csv"',
        },
      });
    }

    // ----------------------------------------------------
    // SEARCH (STRICT USER ISOLATION)
    // ----------------------------------------------------
    if (pathname === "/api/v1/search" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return Response.json({ meetings: [], lectures: [], tasks: [], transcripts: [] });
      }

      const ownedMeetings = currentIsAdmin
        ? db.get("meetings")
        : db.get("meetings").filter((m) => m.hostId === currentUser.id);
      const ownedLectures = currentIsAdmin
        ? db.get("lectures")
        : db.get("lectures").filter((l) => l.instructorId === currentUser.id);
      const ownedIds = new Set([
        ...ownedMeetings.map((m) => m.id),
        ...ownedLectures.map((l) => l.id),
      ]);
      const ownedTasks = currentIsAdmin
        ? db.get("actionItems")
        : db
            .get("actionItems")
            .filter(
              (t) => t.userId === currentUser.id || ownedIds.has(t.meetingId || t.lectureId || ""),
            );

      const meetings = ownedMeetings.filter(
        (m) => matchesArabicQuery(m.title, q) || matchesArabicQuery(m.summary, q),
      );

      const lectures = ownedLectures.filter(
        (l) =>
          matchesArabicQuery(l.title, q) ||
          matchesArabicQuery(l.courseCode, q) ||
          matchesArabicQuery(l.summary, q) ||
          matchesArabicQuery(l.studyNotes, q),
      );

      const tasks = ownedTasks.filter((t) => matchesArabicQuery(t.title, q));

      const transcripts: {
        id: string;
        title: string;
        type: "meeting" | "lecture";
        courseCode?: string;
        quote: string;
        time: number;
      }[] = [];

      for (const m of ownedMeetings) {
        for (const seg of m.segments || []) {
          if (matchesArabicQuery(seg.text, q)) {
            transcripts.push({
              id: m.id,
              title: m.title,
              type: "meeting",
              quote: seg.text,
              time: seg.startTime,
            });
            if (transcripts.length >= 40) break;
          }
        }
        if (transcripts.length >= 40) break;
      }

      for (const l of ownedLectures) {
        for (const seg of l.segments || []) {
          if (matchesArabicQuery(seg.text, q)) {
            transcripts.push({
              id: l.id,
              title: `${l.courseCode} — ${l.title}`,
              type: "lecture",
              courseCode: l.courseCode,
              quote: seg.text,
              time: seg.startTime,
            });
            if (transcripts.length >= 40) break;
          }
        }
        if (transcripts.length >= 40) break;
      }

      return Response.json({
        query: q,
        meetings,
        lectures,
        tasks,
        transcripts,
      });
    }

    // ----------------------------------------------------
    // USERS & WORKSPACE (STRICT ROLE & GUEST PERMISSIONS)
    // ----------------------------------------------------
    if (pathname === "/api/v1/users" && method === "GET") {
      if (currentIsGuest) {
        return Response.json(
          { error: "Guest sessions cannot access workspace user directories." },
          { status: 403 },
        );
      }
      const list = currentIsAdmin
        ? (db.get("users") || []).filter((u) => !u.isGuest)
        : [currentUser];
      const users = list.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        department: u.department,
        initials: u.name
          .split(" ")
          .filter(Boolean)
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
      }));
      return Response.json(users);
    }

    if (pathname === "/api/v1/users" && method === "POST") {
      if (!currentIsAdmin || currentIsGuest) {
        return Response.json(
          { error: "Administrator privileges are required to create users." },
          { status: 403 },
        );
      }
      const body = await req.json();
      const email = normalizeEmail(body.email);
      const name = String(body.name || "").trim();
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !validateEmailAddress(email) || !name) {
        return Response.json({ error: "Valid name and email are required." }, { status: 400 });
      }
      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return Response.json({ error: strength.error }, { status: 400 });
      }
      if (db.get("users").some((u) => normalizeEmail(u.email) === email)) {
        return Response.json({ error: "Email already registered." }, { status: 409 });
      }

      const newUser: UserRecord = {
        id: `usr_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`,
        email,
        name,
        passwordHash: hashPasswordSecure(password),
        role: body.role || "member",
        authProvider: "local",
        isGuest: false,
        department: body.department || "Engineering",
        createdAt: new Date().toISOString(),
      };

      db.update("users", (all) => [...all, newUser]);
      return Response.json(sanitizePublicUser(newUser), { status: 201 });
    }

    if (pathname.startsWith("/api/v1/users/") && method === "GET") {
      const requestedId = decodeURIComponent(pathname.slice("/api/v1/users/".length)).trim();
      if (currentIsGuest || (!currentIsAdmin && requestedId !== currentUser.id)) {
        return Response.json(
          { error: "You are not authorized to view another user's profile." },
          { status: 403 },
        );
      }
      const target = (db.get("users") || []).find((u) => u.id === requestedId && !u.isGuest);
      if (!target) {
        return Response.json({ error: "User not found." }, { status: 404 });
      }
      return Response.json(sanitizePublicUser(target));
    }

    // ----------------------------------------------------
    // SYSTEM ADMINISTRATION: RESET & BACKUP (ADMIN ONLY)
    // ----------------------------------------------------
    if (pathname === "/api/v1/system/reset" && method === "POST") {
      if (!currentIsAdmin || currentIsGuest) {
        return Response.json(
          { error: "Administrator privileges are required for system reset." },
          { status: 403 },
        );
      }
      const body = await req.json().catch(() => ({}));
      if (!body.confirm) {
        return Response.json(
          { error: "Confirmation required to reset the system." },
          { status: 400 },
        );
      }

      db.resetData();

      if (fs.existsSync(RECORDINGS_DIR)) {
        try {
          const files = fs.readdirSync(RECORDINGS_DIR);
          for (const file of files) {
            const filePath = path.join(RECORDINGS_DIR, file);
            try {
              if (fs.statSync(filePath).isFile()) {
                fs.unlinkSync(filePath);
              }
            } catch {
              // ignore
            }
          }
        } catch (e) {
          console.error("Error clearing recordings dir:", e);
        }
      }

      return Response.json({
        success: true,
        message:
          "تمت إعادة ضبط النظام بالكامل بنجاح. تم مسح كافة التسجيلات والمحاضرات والاختبارات التجريبية.",
      });
    }

    if (pathname === "/api/v1/system/backup" && (method === "GET" || method === "HEAD")) {
      if (!currentIsAdmin || currentIsGuest) {
        return Response.json(
          { error: "Administrator privileges are required to export backups." },
          { status: 403 },
        );
      }
      const backup = db.backupData();
      return new Response(JSON.stringify(backup, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="meetmind_backup_${Date.now()}.json"`,
        },
      });
    }

    if (pathname === "/api/v1/system/restore" && method === "POST") {
      if (!currentIsAdmin || currentIsGuest) {
        return Response.json(
          { error: "Administrator privileges are required to restore backups." },
          { status: 403 },
        );
      }
      const body = await req.json();
      db.restoreData(body);
      return Response.json({
        success: true,
        message: "تمت استعادة البيانات من النسخة الاحتياطية بنجاح.",
      });
    }

    return Response.json({ error: "Endpoint not found" }, { status: 404 });
  } catch (error) {
    console.error(`[API Error]:`, error);
    return Response.json(
      { error: "An unexpected server error occurred. Please try again." },
      { status: 500 },
    );
  }
}
