import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const BASE_URL = process.env.MEETMIND_TEST_URL || "http://127.0.0.1:3000";
const DB_PATH = path.resolve(process.cwd(), "data/meetmind_db.json");

const createdUserIds = new Set();
const createdEmails = new Set();
const createdGuestIds = new Set();

function extractCookiePair(setCookieHeader, cookieName) {
  if (!setCookieHeader) return null;
  const regex = new RegExp(`(?:^|,\\s*)${cookieName}=([^;]+)`);
  const match = setCookieHeader.match(regex);
  return match ? `${cookieName}=${match[1]}` : null;
}

function requestWithHostHeader(hostname, urlPath = "/login") {
  return new Promise((resolve, reject) => {
    const target = new URL(BASE_URL);
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port || 3000,
        path: urlPath,
        method: "GET",
        headers: {
          Host: hostname,
          Accept: "text/html",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("MeetMind AI — Production Host, Auth, Autofill, Remember Me & Security Suite", () => {
  after(() => {
    if (!fs.existsSync(DB_PATH)) return;
    try {
      const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
      if (Array.isArray(db.users)) {
        db.users = db.users.filter((u) => !createdUserIds.has(u.id) && !createdEmails.has(u.email));
      }
      if (Array.isArray(db.authSessions)) {
        db.authSessions = db.authSessions.filter(
          (s) => !createdUserIds.has(s.userId) && !createdGuestIds.has(s.userId),
        );
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch {
      // ignore cleanup errors if DB file is not present
    }
  });

  it("allows meetmind-atlas.ai.studio, project-graduation.ai.studio, and localhost while blocking untrusted hosts", async () => {
    for (const host of [
      "meetmind-atlas.ai.studio",
      "project-graduation.ai.studio",
      "localhost:3000",
    ]) {
      const res = await requestWithHostHeader(host, "/login");
      assert.equal(res.status, 200, `Host "${host}" must be allowed (got ${res.status})`);
      assert.ok(
        !res.body.includes("Blocked request"),
        `Host "${host}" must not trigger Vite Blocked request error`,
      );
    }

    const blocked = await requestWithHostHeader("untrusted-attacker.example.com", "/login");
    assert.equal(
      blocked.status,
      403,
      "Untrusted arbitrary host must remain blocked (proving allowedHosts is NOT unsafely set to true)",
    );
  });

  it("serves Login & Register with official logo assets, semantic browser autofill, and ZERO Forgot Password UI", async () => {
    const loginRes = await fetch(`${BASE_URL}/login`);
    assert.equal(loginRes.status, 200);
    const loginHtml = await loginRes.text();
    assert.ok(loginHtml.includes("MeetMind"), "Login HTML should render MeetMind shell");
    assert.ok(
      !loginHtml.includes("Forgot password?") && !loginHtml.includes("/forgot-password"),
      "Forgot password link must be completely removed from login page",
    );

    // Inspect login & register TSX source for strict password-manager autofill compliance
    const loginSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/routes/login.tsx"),
      "utf-8",
    );
    assert.ok(
      loginSource.includes('autoComplete="username"'),
      'Login email must use autoComplete="username"',
    );
    assert.ok(
      loginSource.includes('autoComplete="current-password"'),
      'Login password must use autoComplete="current-password"',
    );
    assert.ok(
      !loginSource.includes('autoComplete="off"'),
      "Login must not disable browser autofill",
    );
    assert.ok(!loginSource.includes("forgot-password"), "Login must not reference forgot-password");

    const registerSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/routes/register.tsx"),
      "utf-8",
    );
    assert.ok(
      registerSource.includes('autoComplete="email"'),
      'Register email must use autoComplete="email"',
    );
    assert.ok(
      registerSource.includes('autoComplete="new-password"'),
      'Register passwords must use autoComplete="new-password"',
    );

    // Verify forgot-password route file is deleted and API endpoints are removed
    assert.equal(
      fs.existsSync(path.resolve(process.cwd(), "src/routes/forgot-password.tsx")),
      false,
      "src/routes/forgot-password.tsx must be deleted",
    );
    const forgotApi = await fetch(`${BASE_URL}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@meetmind.local" }),
    });
    assert.ok(
      forgotApi.status === 401 || forgotApi.status === 404,
      `Removed forgot-password endpoint must not succeed (got ${forgotApi.status})`,
    );

    const webp = await fetch(`${BASE_URL}/assets/meetmind_logo.webp`);
    assert.equal(webp.status, 200);
    assert.ok((await webp.arrayBuffer()).byteLength > 1000);
  });

  it("blocks unauthenticated access to protected API routes", async () => {
    const protectedEndpoints = [
      "/api/v1/auth/me",
      "/api/v1/profile",
      "/api/v1/meetings",
      "/api/v1/lectures",
      "/api/v1/tasks",
      "/api/v1/dashboard/metrics",
    ];
    for (const endpoint of protectedEndpoints) {
      const res = await fetch(`${BASE_URL}${endpoint}`);
      assert.equal(res.status, 401, `${endpoint} must require authentication`);
      const body = await res.json();
      assert.equal(typeof body.error, "string");
      assert.ok(!body.error.includes("at "), "Must not expose stack traces");
    }
  });

  it("exposes real Google OAuth configuration and rejects forged Google tokens", async () => {
    const cfgRes = await fetch(`${BASE_URL}/api/v1/auth/config`);
    assert.equal(cfgRes.status, 200);
    const cfg = await cfgRes.json();
    assert.equal(cfg.googleEnabled, true);
    assert.equal(typeof cfg.googleClientId, "string");
    assert.ok(cfg.googleClientId.endsWith(".apps.googleusercontent.com"));

    const emptyRes = await fetch(`${BASE_URL}/api/v1/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(emptyRes.status, 400);

    const forgedRes = await fetch(`${BASE_URL}/api/v1/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: "eyJhbGciOiJub25lIn0.eyJlbWFpbCI6ImZha2VAZXhhbXBsZS5jb20ifQ.",
      }),
    });
    assert.equal(forgedRes.status, 401, "Forged Google ID token must be rejected with 401");
  });

  it("enforces server-side validation for email, password rules, and confirm password on Register", async () => {
    const cases = [
      {
        label: "invalid email",
        body: {
          name: "Test User",
          email: "invalid-email",
          password: "ValidPass!123",
          confirmPassword: "ValidPass!123",
        },
      },
      {
        label: "short password",
        body: {
          name: "Test User",
          email: "short@meetmind.local",
          password: "Aa1!",
          confirmPassword: "Aa1!",
        },
      },
      {
        label: "missing uppercase",
        body: {
          name: "Test User",
          email: "noupper@meetmind.local",
          password: "lowercase1!",
          confirmPassword: "lowercase1!",
        },
      },
      {
        label: "missing lowercase",
        body: {
          name: "Test User",
          email: "nolower@meetmind.local",
          password: "UPPERCASE1!",
          confirmPassword: "UPPERCASE1!",
        },
      },
      {
        label: "missing number",
        body: {
          name: "Test User",
          email: "nonum@meetmind.local",
          password: "NoNumbersHere!",
          confirmPassword: "NoNumbersHere!",
        },
      },
      {
        label: "missing special character",
        body: {
          name: "Test User",
          email: "nospec@meetmind.local",
          password: "NoSpecial123",
          confirmPassword: "NoSpecial123",
        },
      },
      {
        label: "confirm password mismatch",
        body: {
          name: "Test User",
          email: "mismatch@meetmind.local",
          password: "ValidPass!123",
          confirmPassword: "DifferentPass!123",
        },
      },
    ];

    for (const testCase of cases) {
      const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testCase.body),
      });
      assert.equal(res.status, 400, `Register should reject ${testCase.label}`);
      const payload = await res.json();
      assert.equal(typeof payload.error, "string");
    }
  });

  it("verifies Register, scrypt hashing, Remember Me ON vs OFF cookies, Refresh, Profile persistence across Logout/Login, and Revocation", async () => {
    const email = `autotest_${Date.now()}@meetmind.local`;
    const password = "StrongPassword!2026";
    createdEmails.add(email);

    // 1. Register
    const regRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "AutoTest Engineer",
        email,
        password,
        confirmPassword: password,
      }),
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    assert.equal(regData.user.email, email);
    assert.equal(regData.user.passwordHash, undefined, "Never expose passwordHash");
    createdUserIds.add(regData.user.id);

    // Verify password is stored hashed with scrypt, never plaintext
    if (fs.existsSync(DB_PATH)) {
      const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
      const stored = (db.users || []).find((u) => u.id === regData.user.id);
      assert.ok(stored, "Registered user should be persisted");
      assert.ok(stored.passwordHash.startsWith("scrypt$"), "Password must be hashed with scrypt");
      assert.notEqual(stored.passwordHash, password, "Password must never be stored in plaintext");
    }

    // 2. Duplicate account rejected
    const dupRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Duplicate", email, password, confirmPassword: password }),
    });
    assert.equal(dupRes.status, 409);

    // 3. Invalid credentials & nonexistent account return identical generic 401 error
    const wrongPass = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "WrongPassword!999" }),
    });
    assert.equal(wrongPass.status, 401);
    const wrongPassBody = await wrongPass.json();

    const nonexistent = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "does_not_exist@meetmind.local",
        password: "WrongPassword!999",
      }),
    });
    assert.equal(nonexistent.status, 401);
    const nonexistentBody = await nonexistent.json();
    assert.equal(
      wrongPassBody.error,
      nonexistentBody.error,
      "Login errors must not leak whether an email exists",
    );

    // 4. Remember Me = FALSE -> session-only HttpOnly cookies (no Max-Age)
    const sessionLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: false }),
    });
    assert.equal(sessionLogin.status, 200);
    const sessionCookieHeader = sessionLogin.headers.get("set-cookie") || "";
    assert.ok(sessionCookieHeader.includes("HttpOnly"));
    assert.ok(
      !sessionCookieHeader.includes("Max-Age="),
      "Remember Me OFF must issue session cookies without Max-Age",
    );
    const sessionLoginData = await sessionLogin.json();
    assert.equal(sessionLoginData.rememberMe, false);

    // 5. Remember Me = TRUE -> persistent HttpOnly cookies WITH Max-Age
    const persistLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: true }),
    });
    assert.equal(persistLogin.status, 200);
    const persistCookieHeader = persistLogin.headers.get("set-cookie") || "";
    assert.ok(
      persistCookieHeader.includes("Max-Age="),
      "Remember Me ON must issue persistent cookies with Max-Age",
    );
    const accessCookie = extractCookiePair(persistCookieHeader, "meetmind_token");
    const refreshCookie = extractCookiePair(persistCookieHeader, "meetmind_refresh_token");
    assert.ok(accessCookie && refreshCookie);
    const persistLoginData = await persistLogin.json();
    assert.equal(persistLoginData.rememberMe, true);

    // 6. Session persistence via Bearer & Cookie
    assert.equal(
      (await fetch(`${BASE_URL}/api/v1/auth/me`, { headers: { Cookie: accessCookie } })).status,
      200,
    );

    // 7. Silent refresh preserves rememberMe: true
    const refreshRes = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { Cookie: refreshCookie },
    });
    assert.equal(refreshRes.status, 200);
    const refreshData = await refreshRes.json();
    assert.equal(refreshData.rememberMe, true);

    // 8. Update profile -> Logout -> Re-login -> Verify profile persisted!
    const profPut = await fetch(`${BASE_URL}/api/v1/profile`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${refreshData.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Persisted Profile Name", jobTitle: "Principal Engineer" }),
    });
    assert.equal(profPut.status, 200);
    const profData = await profPut.json();
    assert.equal(profData.success, true);
    assert.equal(profData.user.name, "Persisted Profile Name");

    // Logout revokes token
    const logoutRes = await fetch(`${BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${refreshData.token}` },
    });
    assert.equal(logoutRes.status, 200);
    assert.equal(
      (
        await fetch(`${BASE_URL}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${refreshData.token}` },
        })
      ).status,
      401,
    );

    // Re-login and confirm updated profile still appears
    const relogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: true }),
    });
    assert.equal(relogin.status, 200);
    const reloginData = await relogin.json();
    assert.equal(reloginData.user.name, "Persisted Profile Name");
    assert.equal(reloginData.user.jobTitle, "Principal Engineer");
  });

  it("isolates Guest sessions and blocks persistent profile writes", async () => {
    const guestRes = await fetch(`${BASE_URL}/api/v1/auth/guest`, { method: "POST" });
    assert.equal(guestRes.status, 200);
    const guestData = await guestRes.json();
    assert.equal(guestData.user.isGuest, true);
    createdGuestIds.add(guestData.user.id);

    const guestHeaders = { Authorization: `Bearer ${guestData.token}` };

    const meetingsRes = await fetch(`${BASE_URL}/api/v1/meetings`, { headers: guestHeaders });
    assert.equal(meetingsRes.status, 200);
    const meetings = await meetingsRes.json();
    assert.ok(Array.isArray(meetings));
    assert.equal(
      meetings.length,
      0,
      "Fresh guest session must not see other users' private meetings",
    );

    const mutateProfile = await fetch(`${BASE_URL}/api/v1/profile`, {
      method: "PUT",
      headers: { ...guestHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unauthorized Guest Edit" }),
    });
    assert.equal(mutateProfile.status, 403, "Guest must be blocked from persistent profile edits");

    assert.equal(
      (await fetch(`${BASE_URL}/api/v1/auth/logout`, { method: "POST", headers: guestHeaders }))
        .status,
      200,
    );
    assert.equal(
      (await fetch(`${BASE_URL}/api/v1/auth/me`, { headers: guestHeaders })).status,
      401,
    );
  });
});
