import { initializeApp, getApps, getApp, type FirebaseApp } from "@firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, type Auth } from "@firebase/auth";
import firebaseAppletConfig from "../../firebase-applet-config.json";

/**
 * Real Google OAuth 2.0 / OIDC Browser Client
 *
 * Primary path: Uses the provisioned Firebase Auth + Google OAuth client in
 * `firebase-applet-config.json` via `signInWithPopup(auth, GoogleAuthProvider)`
 * which handles preview iframes and authorized domains cleanly, returning a real
 * Google OAuth access token verified server-side by `/api/v1/auth/google`.
 *
 * Fallback path: Supports standalone self-hosted deployments configured solely
 * with `VITE_GOOGLE_CLIENT_ID` via Google Identity Services (`gsi/client`).
 */

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GOOGLE_PROFILE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenError {
  type?: "popup_failed_to_open" | "popup_closed" | "unknown";
  message?: string;
}

interface GoogleOAuth2Client {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleIdentityGlobal {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (response: GoogleTokenResponse) => void;
        error_callback?: (error: GoogleTokenError) => void;
      }) => GoogleOAuth2Client;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityGlobal;
  }
}

let cachedFirebaseAuth: Auth | null = null;
let gisLoadPromise: Promise<void> | null = null;

function hasProvisionedFirebaseOAuth(): boolean {
  return Boolean(
    firebaseAppletConfig &&
    typeof firebaseAppletConfig.apiKey === "string" &&
    firebaseAppletConfig.apiKey.trim() &&
    typeof firebaseAppletConfig.authDomain === "string" &&
    firebaseAppletConfig.authDomain.trim(),
  );
}

function getFirebaseAuthInstance(): Auth | null {
  if (typeof window === "undefined" || !hasProvisionedFirebaseOAuth()) return null;
  if (cachedFirebaseAuth) return cachedFirebaseAuth;

  const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseAppletConfig);
  cachedFirebaseAuth = getAuth(app);
  return cachedFirebaseAuth;
}

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Sign-In is only available in the browser."));
  }
  if (window.google?.accounts?.oauth2?.initTokenClient) {
    return Promise.resolve();
  }
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`);
    if (existing) {
      if (window.google?.accounts?.oauth2?.initTokenClient) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => {
          gisLoadPromise = null;
          reject(
            new Error(
              "Could not reach Google Sign-In services. Please check your internet connection.",
            ),
          );
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoadPromise = null;
      reject(
        new Error(
          "Could not load Google Sign-In SDK. Please check your network or disable script blockers.",
        ),
      );
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

export function resolveGoogleClientId(serverClientId?: string | null): string {
  const envClientId =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_GOOGLE_CLIENT_ID
      ? String(import.meta.env.VITE_GOOGLE_CLIENT_ID).trim()
      : "";
  const provisionedClientId =
    typeof firebaseAppletConfig?.oAuthClientId === "string"
      ? firebaseAppletConfig.oAuthClientId.trim()
      : "";
  return (envClientId || (serverClientId ?? "") || provisionedClientId).trim();
}

export function isGoogleAuthAvailable(serverClientId?: string | null): boolean {
  return hasProvisionedFirebaseOAuth() || Boolean(resolveGoogleClientId(serverClientId));
}

export interface GooglePopupResult {
  accessToken?: string;
  idToken?: string;
}

function normalizeFirebaseGoogleError(err: unknown): Error {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: string }).code || "")
      : "";
  const msg = err instanceof Error ? err.message : "";

  if (code === "auth/popup-blocked") {
    return new Error(
      "Google Sign-In popup was blocked by your browser. Please allow popups for this site and try again.",
    );
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return new Error("Google Sign-In was cancelled before completion.");
  }
  if (code === "auth/unauthorized-domain") {
    return new Error(
      "This domain is not authorized for Google Sign-In. Add this hostname to your OAuth authorized domains.",
    );
  }
  if (code === "auth/network-request-failed") {
    return new Error("Network error while contacting Google Sign-In. Check your connection.");
  }
  if (code === "auth/operation-not-allowed" || code === "auth/invalid-api-key") {
    return new Error(
      "Google Sign-In provider configuration is invalid. Verify your OAuth client settings.",
    );
  }
  if (code === "auth/account-exists-with-different-credential") {
    return new Error(
      "An account already exists with this email using a different sign-in method. Sign in with your email and password.",
    );
  }
  if (msg && !msg.startsWith("Firebase:") && !msg.includes("(auth/")) {
    return new Error(msg);
  }
  return new Error("Google authentication could not be completed. Please try again.");
}

async function requestGoogleViaFirebasePopup(): Promise<GooglePopupResult> {
  const auth = getFirebaseAuthInstance();
  if (!auth) {
    throw new Error("Google Sign-In provider is not initialized.");
  }

  const provider = new GoogleAuthProvider();
  for (const scope of GOOGLE_PROFILE_SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken && !credential?.idToken) {
      throw new Error("Google did not return a verifiable sign-in credential. Please try again.");
    }
    return {
      accessToken: credential.accessToken || undefined,
      idToken: credential.idToken || undefined,
    };
  } catch (err) {
    throw normalizeFirebaseGoogleError(err);
  }
}

async function requestGoogleViaGisPopup(clientId: string): Promise<GooglePopupResult> {
  await loadGoogleIdentityScript();

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2?.initTokenClient) {
    throw new Error("Google Identity Services failed to initialize. Please reload and try again.");
  }

  return new Promise<GooglePopupResult>((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    try {
      const tokenClient = oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        prompt: "select_account",
        callback: (response) => {
          if (response.error) {
            const desc = response.error_description || response.error;
            if (response.error === "access_denied") {
              finish(() =>
                reject(
                  new Error("Google sign-in permission was cancelled. You can try again anytime."),
                ),
              );
              return;
            }
            if (response.error === "redirect_uri_mismatch" || desc.includes("origin")) {
              finish(() =>
                reject(
                  new Error(
                    "Google OAuth origin mismatch. Ensure this domain is listed in Authorized JavaScript Origins in Google Cloud Console.",
                  ),
                ),
              );
              return;
            }
            finish(() => reject(new Error(`Google Sign-In failed: ${desc}`)));
            return;
          }

          if (!response.access_token) {
            finish(() =>
              reject(new Error("Google did not return a valid sign-in token. Please try again.")),
            );
            return;
          }

          finish(() => resolve({ accessToken: response.access_token! }));
        },
        error_callback: (err) => {
          if (err?.type === "popup_failed_to_open") {
            finish(() =>
              reject(
                new Error(
                  "Google Sign-In popup was blocked by your browser. Please allow popups for this site and try again.",
                ),
              ),
            );
            return;
          }
          if (err?.type === "popup_closed") {
            finish(() => reject(new Error("Google Sign-In was cancelled before completion.")));
            return;
          }
          finish(() =>
            reject(
              new Error(err?.message || "Google Sign-In could not be completed. Please try again."),
            ),
          );
        },
      });

      tokenClient.requestAccessToken({ prompt: "select_account" });
    } catch (err) {
      finish(() =>
        reject(
          err instanceof Error
            ? err
            : new Error("Failed to open Google Sign-In. Please check OAuth configuration."),
        ),
      );
    }
  });
}

export async function requestGoogleSignInPopup(
  clientId?: string | null,
): Promise<GooglePopupResult> {
  // Prefer the provisioned Firebase OAuth client (works reliably inside preview iframes & production)
  if (hasProvisionedFirebaseOAuth()) {
    return requestGoogleViaFirebasePopup();
  }

  const trimmedId = resolveGoogleClientId(clientId);
  if (!trimmedId) {
    throw new Error(
      "Google Sign-In is not configured for this deployment. Set VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID in your environment configuration.",
    );
  }

  return requestGoogleViaGisPopup(trimmedId);
}

export async function signOutGoogleProvider(): Promise<void> {
  try {
    const auth = getFirebaseAuthInstance();
    if (auth?.currentUser) {
      await signOut(auth);
    }
  } catch {
    // non-fatal cleanup
  }
}
