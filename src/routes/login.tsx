import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, AlertCircle, UserRound, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AuthShell, GoogleBrandIcon } from "@/components/auth/auth-shell";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslation } from "@/lib/i18n";
import { storeBrowserPasswordCredential } from "@/lib/credential-manager";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function getSafeRedirect(searchStr: string): string {
  const params = new URLSearchParams(searchStr || "");
  const target = params.get("redirect");
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/";
  if (target === "/login" || target === "/register") return "/";
  return target;
}

function LoginPage() {
  const navigate = useNavigate();
  const searchStr = useRouterState({ select: (r) => r.location.searchStr });
  const { language } = useTranslation();

  const login = useAuthStore((s) => s.login);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest);
  const sessionNotice = useAuthStore((s) => s.sessionNotice);
  const clearSessionNotice = useAuthStore((s) => s.clearSessionNotice);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState<"credentials" | "google" | "guest" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const isAr = language === "AR";
  const isBusy = submitting !== null;

  const validateFields = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = isAr ? "البريد الإلكتروني مطلوب." : "Email address is required.";
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = isAr
        ? "يرجى إدخال بريد إلكتروني صحيح."
        : "Please enter a valid email address.";
    }
    if (!password) {
      errors.password = isAr ? "كلمة المرور مطلوبة." : "Password is required.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isBusy) return;
    setErrorMessage(null);
    clearSessionNotice();

    if (!validateFields()) return;

    setSubmitting("credentials");
    try {
      const normalizedEmail = email.trim();
      const user = await login({ email: normalizedEmail, password, rememberMe });
      void storeBrowserPasswordCredential({
        email: normalizedEmail,
        password,
        name: user.name,
      });
      toast.success(isAr ? `مرحباً بعودتك، ${user.name}` : `Welcome back, ${user.name}`);
      const destination = getSafeRedirect(searchStr);
      void navigate({ to: destination as never, replace: true });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isAr
            ? "تعذر تسجيل الدخول. يرجى المحاولة مرة أخرى."
            : "Unable to sign in. Please try again.";
      setErrorMessage(msg);
    } finally {
      setSubmitting(null);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isBusy) return;
    setErrorMessage(null);
    clearSessionNotice();
    setSubmitting("google");
    try {
      const user = await loginWithGoogle();
      toast.success(
        isAr
          ? `تم تسجيل الدخول عبر Google باسم ${user.name}`
          : `Signed in with Google as ${user.name}`,
      );
      const destination = getSafeRedirect(searchStr);
      void navigate({ to: destination as never, replace: true });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isAr
            ? "فشل تسجيل الدخول عبر Google."
            : "Google Sign-In failed. Please try again.";
      setErrorMessage(msg);
    } finally {
      setSubmitting(null);
    }
  };

  const handleGuestAccess = async () => {
    if (isBusy) return;
    setErrorMessage(null);
    clearSessionNotice();
    setSubmitting("guest");
    try {
      await loginAsGuest();
      toast.success(isAr ? "تم بدء جلسة الضيف المؤقتة بنجاح" : "Started isolated Guest session");
      void navigate({ to: "/" as never, replace: true });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isAr
            ? "تعذر بدء جلسة الضيف."
            : "Unable to start guest session.";
      setErrorMessage(msg);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <AuthShell
      title={isAr ? "تسجيل الدخول إلى MeetMind AI" : "Sign in to MeetMind AI"}
      subtitle={
        isAr
          ? "أدخل بيانات حسابك للوصول إلى اجتماعاتك ومحاضراتك وملخصاتك الذكية."
          : "Enter your credentials to access your meetings, lectures, and AI workspace."
      }
      footer={
        <>
          <span>{isAr ? "ليس لديك حساب بعد؟ " : "Don't have an account? "}</span>
          <Link
            to={"/register" as never}
            className="font-semibold text-amber-300 transition-colors hover:text-amber-200 underline-offset-4 hover:underline"
          >
            {isAr ? "إنشاء حساب جديد" : "Create account"}
          </Link>
        </>
      }
    >
      {/* Session expired notice */}
      {sessionNotice && !errorMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-200 animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>{sessionNotice}</span>
        </div>
      )}

      {/* Real backend or validation error banner */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-950/50 px-3.5 py-3 text-xs leading-relaxed text-red-200 animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form method="post" onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Email / Username (semantic autofill for browser password managers) */}
        <div className="auth-field-group">
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-xs font-semibold tracking-wide text-zinc-200"
          >
            {isAr ? "البريد الإلكتروني" : "Email address"}
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            required
            disabled={isBusy}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
              if (errorMessage) setErrorMessage(null);
            }}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            placeholder="name@company.com"
            className="auth-input h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950/90 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
          />
          {fieldErrors.email && (
            <p id="login-email-error" className="mt-1.5 text-xs text-red-400">
              {fieldErrors.email}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="auth-field-group">
          <label
            htmlFor="login-password"
            className="mb-1.5 block text-xs font-semibold tracking-wide text-zinc-200"
          >
            {isAr ? "كلمة المرور" : "Password"}
          </label>
          <div className="relative">
            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={isBusy}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                if (errorMessage) setErrorMessage(null);
              }}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              placeholder="••••••••"
              className="auth-input h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950/90 px-3.5 pe-11 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowPassword((prev) => !prev)}
              disabled={isBusy}
              aria-pressed={showPassword}
              aria-label={
                showPassword
                  ? isAr
                    ? "إخفاء كلمة المرور"
                    : "Hide password"
                  : isAr
                    ? "إظهار كلمة المرور"
                    : "Show password"
              }
              className="absolute inset-y-0 end-0 flex items-center px-3.5 text-zinc-400 transition-colors hover:text-amber-300 focus-visible:outline-none focus-visible:text-amber-300 cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password && (
            <p id="login-password-error" className="mt-1.5 text-xs text-red-400">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {/* Remember me */}
        <div className="flex items-center justify-between pt-0.5">
          <label className="group inline-flex items-center gap-2.5 text-xs font-medium text-zinc-300 transition-colors hover:text-zinc-100 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              disabled={isBusy}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-amber-400 accent-amber-400 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
            />
            <span>{isAr ? "تذكرني على هذا الجهاز" : "Remember me on this device"}</span>
          </label>
        </div>

        {/* Submit Login */}
        <button
          type="submit"
          disabled={isBusy}
          className="auth-btn-primary mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 text-sm font-bold text-zinc-950 shadow-[0_8px_30px_-8px_rgba(212,175,55,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-65 cursor-pointer"
        >
          {submitting === "credentials" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{isAr ? "جارٍ تسجيل الدخول..." : "Signing in..."}</span>
            </>
          ) : (
            <>
              <span>{isAr ? "تسجيل الدخول" : "Sign in"}</span>
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-5 flex items-center justify-center">
        <div className="h-px w-full bg-zinc-800/90" />
        <span className="shrink-0 bg-[#0a0a0f] px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {isAr ? "أو المتابعة عبر" : "Or continue with"}
        </span>
        <div className="h-px w-full bg-zinc-800/90" />
      </div>

      {/* Google Sign-In & Guest Access */}
      <div className="space-y-2.5">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void handleGoogleSignIn()}
          className="auth-btn-secondary flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-700/90 bg-zinc-900/90 px-4 text-sm font-semibold text-zinc-100 hover:border-amber-400/45 hover:bg-zinc-800/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:cursor-not-allowed disabled:opacity-65 cursor-pointer"
        >
          {submitting === "google" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              <span>{isAr ? "جارٍ الاتصال بـ Google..." : "Connecting to Google..."}</span>
            </>
          ) : (
            <>
              <GoogleBrandIcon className="h-4 w-4" />
              <span>{isAr ? "المتابعة باستخدام Google" : "Continue with Google"}</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => void handleGuestAccess()}
          className="auth-btn-secondary flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 text-sm font-semibold text-amber-200 hover:border-amber-400/55 hover:bg-amber-500/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:cursor-not-allowed disabled:opacity-65 cursor-pointer"
        >
          {submitting === "guest" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              <span>{isAr ? "جارٍ تهيئة جلسة الضيف..." : "Starting guest session..."}</span>
            </>
          ) : (
            <>
              <UserRound className="h-4 w-4 text-amber-400" />
              <span>{isAr ? "المتابعة كضيف" : "Continue as Guest"}</span>
            </>
          )}
        </button>

        <p className="pt-1 text-center text-[11px] leading-relaxed text-zinc-500">
          {isAr
            ? "وضع الضيف يمنحك جلسة مؤقتة ومعزولة تماماً لتجربة المنصة دون مشاركة بيانات الحسابات الخاصة."
            : "Guest mode opens an isolated temporary session with zero access to private member workspaces."}
        </p>
      </div>
    </AuthShell>
  );
}
