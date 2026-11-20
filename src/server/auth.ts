import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, type AuthSessionRecord, type UserRecord } from "./db";
import { getDataDir } from "./storage";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

const ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60; // 2 hours
const ACCESS_TOKEN_REMEMBER_TTL_SECONDS = 12 * 60 * 60; // 12 hours
const GUEST_TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 hours
const REFRESH_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 1 day
const REFRESH_TOKEN_REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

let cachedJwtSecret: string | null = null;

function getJwtSecret(): string {
  if (cachedJwtSecret) return cachedJwtSecret;

  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret && envSecret.length >= 24) {
    cachedJwtSecret = envSecret;
    return cachedJwtSecret;
  }

  // Persist a cryptographically random 48-byte server-only signing key on disk so restarts preserve active sessions
  const secretFile = path.join(getDataDir(), ".jwt_secret");
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, "utf-8").trim();
      if (existing.length >= 32) {
        cachedJwtSecret = existing;
        return cachedJwtSecret;
      }
    }
    const generated = crypto.randomBytes(48).toString("hex");
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    cachedJwtSecret = generated;
    return cachedJwtSecret;
  } catch {
    cachedJwtSecret = crypto.randomBytes(48).toString("hex");
    return cachedJwtSecret;
  }
}

let cachedFirebaseOAuthConfig: { clientId: string; projectNumber: string } | null | undefined;

function getFirebaseAppletOAuthConfig(): { clientId: string; projectNumber: string } {
  if (cachedFirebaseOAuthConfig !== undefined) {
    return cachedFirebaseOAuthConfig || { clientId: "", projectNumber: "" };
  }
  try {
    const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
        oAuthClientId?: string;
        messagingSenderId?: string;
      };
      cachedFirebaseOAuthConfig = {
        clientId: (parsed.oAuthClientId || "").trim(),
        projectNumber: (parsed.messagingSenderId || "").trim(),
      };
      return cachedFirebaseOAuthConfig;
    }
  } catch {
    // ignore unreadable config
  }
  cachedFirebaseOAuthConfig = { clientId: "", projectNumber: "" };
  return cachedFirebaseOAuthConfig;
}

export function getAllowedGoogleClientIds(): string[] {
  const fb = getFirebaseAppletOAuthConfig();
  const candidates = [
    process.env.GOOGLE_CLIENT_ID || "",
    process.env.VITE_GOOGLE_CLIENT_ID || "",
    fb.clientId,
  ]
    .map((v) => v.trim())
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

export function isAllowedGoogleAudience(aud?: string, azp?: string): boolean {
  const allowed = getAllowedGoogleClientIds();
  const fb = getFirebaseAppletOAuthConfig();
  if (allowed.length === 0 && !fb.projectNumber) return true;
  const targets = [aud || "", azp || ""].filter(Boolean);
  if (targets.length === 0) return true;

  for (const t of targets) {
    if (allowed.includes(t)) return true;
    if (
      fb.projectNumber &&
      t.startsWith(`${fb.projectNumber}-`) &&
      t.endsWith(".apps.googleusercontent.com")
    ) {
      return true;
    }
  }
  return false;
}

export function getConfiguredGoogleClientId(): string {
  return getAllowedGoogleClientIds()[0] || "";
}

export function normalizeEmail(email: string): string {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function validateEmailAddress(email: string): boolean {
  const clean = normalizeEmail(email);
  if (!clean || clean.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);
}

export interface PasswordStrengthResult {
  valid: boolean;
  checks: {
    minLength: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
  error?: string;
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const pwd = typeof password === "string" ? password : "";
  const checks = {
    minLength: pwd.length >= 8,
    uppercase: /[A-Z]/.test(pwd),
    lowercase: /[a-z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  };
  const valid =
    checks.minLength && checks.uppercase && checks.lowercase && checks.number && checks.special;

  return {
    valid,
    checks,
    error: valid
      ? undefined
      : "Password is too weak. Use at least 8 characters with uppercase, lowercase, number, and special character.",
  };
}

export function hashPasswordSecure(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    })
    .toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPasswordSecure(password: string, storedHash: string): boolean {
  if (!password || !storedHash || typeof storedHash !== "string") return false;
  if (!storedHash.startsWith("scrypt$")) {
    // Reject legacy insecure/placeholder hashes — never accept arbitrary passwords
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;

  try {
    const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
    const expectedBuf = Buffer.from(expectedHex, "hex");
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padLen), "base64");
}

export interface JwtClaims {
  sub: string;
  email: string;
  name: string;
  role: UserRecord["role"];
  isGuest: boolean;
  sid: string;
  jti: string;
  iss: string;
  iat: number;
  exp: number;
}

export function signAccessJwt(
  claims: Omit<JwtClaims, "iss" | "iat" | "exp" | "jti">,
  ttlSeconds: number,
): { token: string; jti: string; exp: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  const jti = `jti_${crypto.randomBytes(12).toString("hex")}`;
  const exp = nowSec + ttlSeconds;
  const fullClaims: JwtClaims = {
    ...claims,
    jti,
    iss: "meetmind-ai",
    iat: nowSec,
    exp,
  };

  const headerSegment = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadSegment = base64UrlEncode(JSON.stringify(fullClaims));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const sig = crypto.createHmac("sha256", getJwtSecret()).update(signingInput).digest();
  const sigSegment = base64UrlEncode(sig);

  return { token: `${signingInput}.${sigSegment}`, jti, exp };
}

export type JwtVerifyResult =
  | { valid: true; claims: JwtClaims }
  | { valid: false; reason: "MALFORMED" | "INVALID_SIGNATURE" | "EXPIRED" | "REVOKED" };

export function verifyAccessJwt(token: string): JwtVerifyResult {
  if (!token || typeof token !== "string") return { valid: false, reason: "MALFORMED" };
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "MALFORMED" };

  const [headerSeg, payloadSeg, sigSeg] = parts;
  if (!headerSeg || !payloadSeg || !sigSeg) return { valid: false, reason: "MALFORMED" };

  try {
    const signingInput = `${headerSeg}.${payloadSeg}`;
    const expectedSig = crypto.createHmac("sha256", getJwtSecret()).update(signingInput).digest();
    const actualSig = base64UrlDecode(sigSeg);

    if (
      expectedSig.length !== actualSig.length ||
      !crypto.timingSafeEqual(expectedSig, actualSig)
    ) {
      return { valid: false, reason: "INVALID_SIGNATURE" };
    }

    const header = JSON.parse(base64UrlDecode(headerSeg).toString("utf-8"));
    if (header?.alg !== "HS256") return { valid: false, reason: "INVALID_SIGNATURE" };

    const claims = JSON.parse(base64UrlDecode(payloadSeg).toString("utf-8")) as JwtClaims;
    if (!claims?.sub || !claims?.jti || !claims?.exp || claims.iss !== "meetmind-ai") {
      return { valid: false, reason: "MALFORMED" };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (claims.exp <= nowSec) {
      return { valid: false, reason: "EXPIRED" };
    }

    const revokedList = db.get("revokedTokens") || [];
    if (revokedList.some((r) => r.jti === claims.jti)) {
      return { valid: false, reason: "REVOKED" };
    }

    // Also verify parent session has not been revoked
    if (claims.sid) {
      const sessions = db.get("authSessions") || [];
      const session = sessions.find((s) => s.id === claims.sid);
      if (session && session.revokedAt) {
        return { valid: false, reason: "REVOKED" };
      }
    }

    return { valid: true, claims };
  } catch {
    return { valid: false, reason: "MALFORMED" };
  }
}

export function computeUserInitials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "MM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function sanitizePublicUser(user: UserRecord) {
  const isGuest = Boolean(user.isGuest || user.role === "guest");
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isGuest,
    authProvider: user.authProvider || "local",
    emailVerified: Boolean(user.emailVerified),
    hasPassword: Boolean(user.passwordHash && user.passwordHash.startsWith("scrypt$")),
    avatarUrl: user.avatarUrl || undefined,
    bio: user.bio || "",
    jobTitle: user.jobTitle || "",
    department: user.department || (isGuest ? "Guest Session" : ""),
    organization: user.organization || "",
    initials: computeUserInitials(user.name),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || user.createdAt,
  };
}

export function createSessionTokens(
  user: UserRecord,
  options: { rememberMe?: boolean; isGuest?: boolean; req?: Request } = {},
) {
  const isGuest = Boolean(options.isGuest || user.isGuest || user.role === "guest");
  const rememberMe = Boolean(options.rememberMe && !isGuest);
  const sessionId = `ses_${Date.now().toString(36)}_${crypto.randomBytes(10).toString("hex")}`;
  const rawRefreshToken = `mmr_${crypto.randomBytes(36).toString("hex")}`;

  const accessTtl = isGuest
    ? GUEST_TOKEN_TTL_SECONDS
    : rememberMe
      ? ACCESS_TOKEN_REMEMBER_TTL_SECONDS
      : ACCESS_TOKEN_TTL_SECONDS;

  const refreshTtl = isGuest
    ? GUEST_TOKEN_TTL_SECONDS
    : rememberMe
      ? REFRESH_TOKEN_REMEMBER_TTL_SECONDS
      : REFRESH_TOKEN_TTL_SECONDS;

  const userAgent = (options.req?.headers.get("user-agent") || "").slice(0, 200) || undefined;
  const forwardedFor = (options.req?.headers.get("x-forwarded-for") || "").split(",")[0]?.trim();
  const ipAddress = forwardedFor ? forwardedFor.slice(0, 64) : undefined;

  const now = Date.now();
  const sessionRecord: AuthSessionRecord = {
    id: sessionId,
    userId: user.id,
    refreshTokenHash: hashToken(rawRefreshToken),
    isGuest,
    rememberMe,
    userAgent,
    ipAddress,
    expiresAt: new Date(now + refreshTtl * 1000).toISOString(),
    createdAt: new Date(now).toISOString(),
    lastUsedAt: new Date(now).toISOString(),
  };

  // Prune expired sessions while adding the new one
  db.update("authSessions", (existing = []) => {
    const active = existing.filter((s) => new Date(s.expiresAt).getTime() > now && !s.revokedAt);
    return [...active.slice(-200), sessionRecord];
  });

  const signed = signAccessJwt(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isGuest,
      sid: sessionId,
    },
    accessTtl,
  );

  return {
    accessToken: signed.token,
    refreshToken: rawRefreshToken,
    expiresAt: new Date(signed.exp * 1000).toISOString(),
    expiresInSeconds: accessTtl,
    refreshMaxAgeSeconds: refreshTtl,
    sessionId,
    rememberMe,
    isGuest,
  };
}

export function revokeSessionAndToken(options: {
  jti?: string;
  exp?: number;
  sessionId?: string;
  refreshToken?: string;
}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();

  if (options.jti) {
    db.update("revokedTokens", (existing = []) => {
      const pruned = existing.filter((r) => r.exp > nowSec);
      if (pruned.some((r) => r.jti === options.jti)) return pruned;
      return [
        ...pruned.slice(-500),
        { jti: options.jti!, exp: options.exp || nowSec + ACCESS_TOKEN_REMEMBER_TTL_SECONDS },
      ];
    });
  }

  const refreshHash = options.refreshToken ? hashToken(options.refreshToken) : null;
  if (options.sessionId || refreshHash) {
    db.update("authSessions", (existing = []) =>
      existing.map((s) =>
        (options.sessionId && s.id === options.sessionId) ||
        (refreshHash && s.refreshTokenHash === refreshHash)
          ? { ...s, revokedAt: nowIso }
          : s,
      ),
    );
  }
}

export function revokeAllUserSessions(userId: string) {
  const nowIso = new Date().toISOString();
  db.update("authSessions", (existing = []) =>
    existing.map((s) => (s.userId === userId ? { ...s, revokedAt: nowIso } : s)),
  );
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get("Cookie") || "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

export function isHttpsRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto") || "";
  if (proto.toLowerCase().includes("https")) return true;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function appendAuthCookies(
  headers: Headers,
  req: Request,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
    refreshMaxAgeSeconds: number;
    rememberMe: boolean;
  },
) {
  const https = isHttpsRequest(req);
  const sameSiteAndSecure = https ? "; SameSite=None; Secure" : "; SameSite=Lax";
  const accessMaxAge = tokens.rememberMe ? `; Max-Age=${tokens.expiresInSeconds}` : "";
  const refreshMaxAge = tokens.rememberMe ? `; Max-Age=${tokens.refreshMaxAgeSeconds}` : "";

  headers.append(
    "Set-Cookie",
    `meetmind_token=${encodeURIComponent(tokens.accessToken)}; Path=/; HttpOnly${sameSiteAndSecure}${accessMaxAge}`,
  );
  headers.append(
    "Set-Cookie",
    `meetmind_refresh_token=${encodeURIComponent(tokens.refreshToken)}; Path=/api/v1/auth; HttpOnly${sameSiteAndSecure}${refreshMaxAge}`,
  );
}

export function appendClearAuthCookies(headers: Headers, req: Request) {
  const https = isHttpsRequest(req);
  const sameSiteAndSecure = https ? "; SameSite=None; Secure" : "; SameSite=Lax";
  headers.append(
    "Set-Cookie",
    `meetmind_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${sameSiteAndSecure}`,
  );
  headers.append(
    "Set-Cookie",
    `meetmind_refresh_token=; Path=/api/v1/auth; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${sameSiteAndSecure}`,
  );
}

export type AuthRequestResult =
  | { ok: true; user: UserRecord; claims: JwtClaims; isGuest: boolean }
  | {
      ok: false;
      status: 401;
      code: "UNAUTHORIZED" | "TOKEN_EXPIRED" | "SESSION_REVOKED";
      error: string;
    };

export function authenticateRequest(req: Request): AuthRequestResult {
  const authHeader = req.headers.get("Authorization") || "";
  const cookies = parseCookies(req);
  let token = "";

  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (cookies.meetmind_token) {
    token = cookies.meetmind_token.trim();
  }

  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      error: "Authentication required. Please sign in to continue.",
    };
  }

  const verified = verifyAccessJwt(token);
  if (!verified.valid) {
    if (verified.reason === "EXPIRED") {
      return {
        ok: false,
        status: 401,
        code: "TOKEN_EXPIRED",
        error: "Session expired. Please sign in again.",
      };
    }
    if (verified.reason === "REVOKED") {
      return {
        ok: false,
        status: 401,
        code: "SESSION_REVOKED",
        error: "Session has been signed out. Please sign in again.",
      };
    }
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      error: "Invalid authentication token.",
    };
  }

  const users = db.get("users") || [];
  let user = users.find((u) => u.id === verified.claims.sub);

  if (!user && verified.claims.isGuest) {
    // Reconstruct ephemeral guest principal strictly from cryptographically verified JWT claims
    user = {
      id: verified.claims.sub,
      email: verified.claims.email,
      name: verified.claims.name,
      passwordHash: "",
      role: "guest",
      isGuest: true,
      authProvider: "guest",
      department: "Guest Session",
      createdAt: new Date(verified.claims.iat * 1000).toISOString(),
    };
  }

  if (!user) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      error: "Account no longer exists. Please sign in again.",
    };
  }

  return {
    ok: true,
    user,
    claims: verified.claims,
    isGuest: Boolean(verified.claims.isGuest || user.isGuest || user.role === "guest"),
  };
}

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export async function verifyGoogleIdentity(input: {
  idToken?: string;
  accessToken?: string;
}): Promise<
  { ok: true; identity: VerifiedGoogleIdentity } | { ok: false; status: number; error: string }
> {
  try {
    if (input.idToken && input.idToken.trim()) {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(input.idToken.trim())}`,
        { method: "GET" },
      );

      if (!res.ok) {
        return {
          ok: false,
          status: 401,
          error: "Google identity verification failed. Token is invalid or expired.",
        };
      }

      const payload = (await res.json()) as {
        sub?: string;
        email?: string;
        email_verified?: string | boolean;
        name?: string;
        picture?: string;
        aud?: string;
        azp?: string;
        exp?: string;
      };

      const emailVerified = payload.email_verified === true || payload.email_verified === "true";
      if (!payload.sub || !payload.email || !emailVerified) {
        return {
          ok: false,
          status: 401,
          error: "Google account must have a verified email address.",
        };
      }

      if (!isAllowedGoogleAudience(payload.aud, payload.azp)) {
        return {
          ok: false,
          status: 401,
          error: "Google token audience mismatch. Check your Google OAuth Client ID configuration.",
        };
      }

      const expSec = Number(payload.exp || 0);
      if (expSec > 0 && expSec <= Math.floor(Date.now() / 1000)) {
        return {
          ok: false,
          status: 401,
          error: "Google authentication token has expired. Please try again.",
        };
      }

      return {
        ok: true,
        identity: {
          sub: payload.sub,
          email: normalizeEmail(payload.email),
          name: (payload.name || payload.email.split("@")[0] || "Google User").trim(),
          picture: payload.picture,
        },
      };
    }

    if (input.accessToken && input.accessToken.trim()) {
      const accessToken = input.accessToken.trim();
      // Always validate token authenticity & expiry against Google's tokeninfo endpoint
      const tiRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      );
      if (!tiRes.ok) {
        return {
          ok: false,
          status: 401,
          error: "Google access token is invalid or expired.",
        };
      }

      const ti = (await tiRes.json()) as { aud?: string; azp?: string; expires_in?: string };
      if (!isAllowedGoogleAudience(ti.aud, ti.azp)) {
        return {
          ok: false,
          status: 401,
          error: "Google access token was not issued for this application.",
        };
      }

      const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!infoRes.ok) {
        return {
          ok: false,
          status: 401,
          error: "Unable to verify Google profile. Please try signing in again.",
        };
      }

      const profile = (await infoRes.json()) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };

      if (!profile.sub || !profile.email || !profile.email_verified) {
        return {
          ok: false,
          status: 401,
          error: "Google account must have a verified email address.",
        };
      }

      return {
        ok: true,
        identity: {
          sub: profile.sub,
          email: normalizeEmail(profile.email),
          name: (profile.name || profile.email.split("@")[0] || "Google User").trim(),
          picture: profile.picture,
        },
      };
    }

    return {
      ok: false,
      status: 400,
      error: "Google credential token is required.",
    };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Unable to reach Google authentication servers. Please try again later.",
    };
  }
}
