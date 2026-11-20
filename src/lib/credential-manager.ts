/**
 * Native Browser Password Manager Integration (W3C Credential Management API)
 *
 * Delegates credential saving exclusively to the browser's built-in password
 * manager (Chrome, Edge, etc.) after a verified sign-in or registration.
 * NEVER stores plaintext passwords in localStorage, sessionStorage, cookies,
 * IndexedDB, or application state.
 */

interface PasswordCredentialData {
  id: string;
  password: string;
  name?: string;
}

type PasswordCredentialConstructor = new (data: PasswordCredentialData) => Credential;

export async function storeBrowserPasswordCredential(params: {
  email: string;
  password: string;
  name?: string;
}): Promise<void> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!params.email || !params.password) return;

  try {
    const PasswordCredentialCtor = (
      window as Window & { PasswordCredential?: PasswordCredentialConstructor }
    ).PasswordCredential;

    if (
      typeof PasswordCredentialCtor === "function" &&
      navigator.credentials &&
      typeof navigator.credentials.store === "function"
    ) {
      const credential = new PasswordCredentialCtor({
        id: params.email,
        password: params.password,
        name: params.name || params.email,
      });
      await navigator.credentials.store(credential);
    }
  } catch {
    // Gracefully ignore when browser restricts Credential Management (e.g., sandboxed iframe or unsupported browser)
  }
}
