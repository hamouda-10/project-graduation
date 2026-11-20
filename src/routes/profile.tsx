import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Edit2,
  ExternalLink,
  FileAudio,
  FileText,
  HelpCircle,
  KeyRound,
  Laptop,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  Mic,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  User as UserIcon,
  Video,
  X,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { UserAvatar } from "@/components/auth/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type ProfileRecordingItem } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile · MeetMind AI" }] }),
  component: ProfilePage,
});

const ALLOWED_AVATAR_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_AVATAR_MB = 5;

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0m";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs > 0 ? `${secs}s` : ""}`.trim();
  return `${secs}s`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> {status}
      </span>
    );
  }
  if (normalized === "processing" || normalized === "queued") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
        <Loader2 className="h-3 w-3 animate-spin" /> {status}
      </span>
    );
  }
  if (normalized === "failed" || normalized === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300">
        <AlertCircle className="h-3 w-3" /> {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[11px] font-medium text-zinc-300">
      {status}
    </span>
  );
}

function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const setAuthUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const setRecordingOpen = useUIStore((s) => s.setRecordingDialogOpen);

  const isGuest = authStatus === "guest" || Boolean(authUser?.isGuest);

  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["profile", authUser?.id],
    queryFn: () => api.getProfile(),
    enabled: Boolean(authUser),
    staleTime: 15_000,
  });

  // Keep global auth store synchronized with freshest server profile data
  useEffect(() => {
    if (profile?.user) {
      setAuthUser(profile.user);
    }
  }, [profile?.user, setAuthUser]);

  // Edit Profile form state
  const [isEditing, setIsEditing] = useState(false);
  const [formName, setFormName] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formJobTitle, setFormJobTitle] = useState("");
  const [formDepartment, setFormDepartment] = useState("");
  const [formOrganization, setFormOrganization] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Avatar upload / preview state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Recordings filter
  const [recordingFilter, setRecordingFilter] = useState<"all" | "meeting" | "lecture">("all");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Sessions & export state
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const user = profile?.user || authUser;

  useEffect(() => {
    if (user && !isEditing) {
      setFormName(user.name || "");
      setFormBio(user.bio || "");
      setFormJobTitle(user.jobTitle || "");
      setFormDepartment(user.department || "");
      setFormOrganization(user.organization || "");
    }
  }, [user, isEditing]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const handleOpenEdit = () => {
    if (!user || isGuest) return;
    setFormName(user.name || "");
    setFormBio(user.bio || "");
    setFormJobTitle(user.jobTitle || "");
    setFormDepartment(user.department || "");
    setFormOrganization(user.organization || "");
    setIsEditing(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) return;

    const trimmedName = formName.trim();
    if (trimmedName.length < 2) {
      toast.error("Full name must be at least 2 characters.");
      return;
    }

    setSavingProfile(true);
    try {
      const res = await api.updateProfile({
        name: trimmedName,
        bio: formBio.trim(),
        jobTitle: formJobTitle.trim(),
        department: formDepartment.trim(),
        organization: formOrganization.trim(),
      });
      setAuthUser(res.user);
      queryClient.setQueryData(["profile", res.user.id], res.profile);
      setIsEditing(false);
      toast.success("Profile updated and saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile changes.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAvatarError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_AVATAR_MIME.has(file.type.toLowerCase())) {
      const msg = "Unsupported image format. Please choose a JPG, PNG, or WEBP photo.";
      setAvatarError(msg);
      toast.error(msg);
      return;
    }

    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      const msg = `Image exceeds the ${MAX_AVATAR_MB} MB limit. Please select a smaller file.`;
      setAvatarError(msg);
      toast.error(msg);
      return;
    }

    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    const preview = URL.createObjectURL(file);
    setAvatarPreviewUrl(preview);
    setPendingAvatarFile(file);
  };

  const handleCancelAvatarPreview = () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setAvatarPreviewUrl(null);
    setPendingAvatarFile(null);
    setAvatarError(null);
  };

  const handleUploadAvatar = async () => {
    if (!pendingAvatarFile || isGuest) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const res = await api.uploadProfileAvatar(pendingAvatarFile);
      setAuthUser(res.user);
      handleCancelAvatarPreview();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile photo uploaded and saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to upload profile photo.";
      setAvatarError(msg);
      toast.error(msg);
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (isGuest) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const res = await api.removeProfileAvatar();
      setAuthUser(res.user);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile photo removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove profile photo.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Password confirmation does not match.");
      return;
    }

    setPasswordBusy(true);
    try {
      const res = await api.changePassword({
        currentPassword: user?.hasPassword ? currentPassword : undefined,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(res.message || "Password updated successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update password.";
      setPasswordError(msg);
      toast.error(msg);
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      await api.revokeSession(sessionId);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Session revoked.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke session.");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setRevokingOthers(true);
    try {
      const res = await api.revokeOtherSessions();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(
        res.revokedCount > 0
          ? `Signed out ${res.revokedCount} other active session${res.revokedCount === 1 ? "" : "s"}.`
          : "No other active sessions found.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke sessions.");
    } finally {
      setRevokingOthers(false);
    }
  };

  const handleExportMyData = async () => {
    setExportingData(true);
    try {
      const payload = await api.exportMyData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meetmind-profile-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Personal data export downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export data.");
    } finally {
      setExportingData(false);
    }
  };

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      queryClient.clear();
      toast.success("Signed out successfully.");
      void navigate({ to: "/login" as never, replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Account"
          title={t("profile")}
          description="Loading your real account profile, recordings, and activity analytics..."
        />
        <GlassCard className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
          <p className="text-sm">Fetching your profile data...</p>
        </GlassCard>
      </div>
    );
  }

  if (isError && !profile) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Account"
          title={t("profile")}
          description="Your personal MeetMind AI account, recordings, and analytics."
        />
        <GlassCard className="p-8 text-center space-y-4">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
          <div>
            <h3 className="text-base font-semibold">Unable to load profile</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Please try refreshing your profile."}
            </p>
          </div>
          <Button variant="outline" onClick={() => void refetch()} className="cursor-pointer">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Retry
          </Button>
        </GlassCard>
      </div>
    );
  }

  const analytics = profile?.analytics;
  const completion = profile?.profileCompletion;
  const recordings = profile?.recordings || [];
  const filteredRecordings =
    recordingFilter === "all" ? recordings : recordings.filter((r) => r.type === recordingFilter);

  const maxDayCount = Math.max(1, ...(analytics?.mostActiveDays.map((d) => d.count) || [1]));
  const maxFeatureCount = Math.max(
    1,
    ...(analytics?.mostUsedAiFeatures.map((f) => f.count) || [1]),
  );

  const providerLabel =
    user?.authProvider === "google"
      ? "Google Account"
      : user?.authProvider === "guest" || isGuest
        ? "Guest Session"
        : "Email & Password";

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        eyebrow="Account"
        title={t("profile")}
        description="Manage your verified identity, profile photo, recordings, real AI analytics, and account security."
        actions={
          <div className="flex items-center gap-2">
            {!isGuest && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExportMyData()}
                disabled={exportingData}
                className="cursor-pointer border-amber-500/30 hover:border-amber-400/60"
              >
                {exportingData ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1.5 text-amber-400" />
                )}
                Export My Data
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleLogout()}
              disabled={signingOut}
              className="cursor-pointer border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              {isGuest ? "Exit Guest" : "Log out"}
            </Button>
          </div>
        }
      />

      {/* Guest Session Notice */}
      {isGuest && (
        <GlassCard className="border-amber-500/40 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-amber-200">
                Temporary Guest Session Active
              </div>
              <p className="text-xs text-amber-100/80 mt-0.5">
                Guest sessions are isolated and temporary. Sign in with Google or create a MeetMind
                AI account to persist your profile details, upload a profile photo, and keep your
                recordings permanently.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="gradient-primary text-primary-foreground shrink-0">
            <Link to={"/login" as never}>
              <LogIn className="h-4 w-4 mr-1.5" /> Sign in or Register
            </Link>
          </Button>
        </GlassCard>
      )}

      {/* Hero Profile Header Card */}
      <GlassCard className="relative overflow-hidden p-6 md:p-8 border-amber-500/20">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-transparent" />

        <div className="relative flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
          {/* Avatar + Primary Identity */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 w-full lg:w-auto">
            <div className="relative shrink-0">
              {avatarPreviewUrl ? (
                <img
                  src={avatarPreviewUrl}
                  alt="New profile photo preview"
                  className="h-24 w-24 rounded-2xl object-cover ring-4 ring-amber-400/50 shadow-lg"
                />
              ) : (
                <UserAvatar
                  avatarUrl={user?.avatarUrl}
                  name={user?.name}
                  initials={user?.initials}
                  className="h-24 w-24 rounded-2xl ring-4 ring-background shadow-lg text-2xl"
                />
              )}

              {!isGuest && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarFileSelected}
                    className="hidden"
                    aria-label="Upload profile photo"
                  />
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload or replace profile photo"
                    className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/50 bg-zinc-950 text-amber-300 shadow-lg transition hover:bg-amber-500 hover:text-zinc-950 cursor-pointer disabled:opacity-50"
                  >
                    {avatarBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </button>
                </>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl font-bold tracking-tight text-foreground truncate">
                  {user?.name || "MeetMind User"}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                  {isGuest ? "Guest" : user?.role || "Member"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  <ShieldCheck className="h-3 w-3" /> {providerLabel}
                </span>
              </div>

              {(user?.jobTitle || user?.department || user?.organization) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-300">
                  {user?.jobTitle && (
                    <span className="inline-flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5 text-amber-400" /> {user.jobTitle}
                    </span>
                  )}
                  {user?.department && (
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-amber-400" /> {user.department}
                    </span>
                  )}
                  {user?.organization && (
                    <span className="text-muted-foreground">· {user.organization}</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-amber-400/80" />
                  {isGuest ? "Temporary guest account" : user?.email}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-amber-400/80" />
                  Joined {formatDate(user?.createdAt)}
                </span>
              </div>

              {user?.bio && (
                <p className="text-sm text-zinc-300/90 max-w-2xl pt-1 leading-relaxed">
                  {user.bio}
                </p>
              )}

              {/* Avatar Controls & Preview Confirmation */}
              {!isGuest && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {pendingAvatarFile ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => void handleUploadAvatar()}
                        disabled={avatarBusy}
                        className="gradient-primary text-primary-foreground cursor-pointer h-8 text-xs"
                      >
                        {avatarBusy ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Save Photo
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelAvatarPreview}
                        disabled={avatarBusy}
                        className="h-8 text-xs cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                      <span className="text-[11px] text-amber-300/90 truncate max-w-[200px]">
                        {pendingAvatarFile.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={avatarBusy}
                        className="h-8 text-xs border-amber-500/30 hover:border-amber-400/60 cursor-pointer"
                      >
                        <Camera className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
                        {user?.avatarUrl ? "Change Photo" : "Upload Photo"}
                      </Button>
                      {user?.avatarUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleRemoveAvatar()}
                          disabled={avatarBusy}
                          className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove Photo
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}

              {avatarError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5 pt-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {avatarError}
                </p>
              )}
            </div>
          </div>

          {/* Right Side: Profile Completion & Edit Button */}
          <div className="w-full lg:w-72 space-y-3 shrink-0 rounded-xl border border-amber-500/20 bg-zinc-950/60 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">Profile Completion</span>
              <span className="font-mono font-semibold text-amber-300">
                {completion?.percent ?? 0}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-500"
                style={{ width: `${completion?.percent ?? 0}%` }}
              />
            </div>
            {completion && completion.missingFields.length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Add: {completion.missingFields.slice(0, 3).join(", ")}
                {completion.missingFields.length > 3
                  ? ` +${completion.missingFields.length - 3} more`
                  : ""}
              </p>
            ) : (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Profile is 100% complete
              </p>
            )}

            {!isGuest && (
              <Button
                variant={isEditing ? "secondary" : "outline"}
                size="sm"
                onClick={() => (isEditing ? setIsEditing(false) : handleOpenEdit())}
                className="w-full cursor-pointer border-amber-500/35 hover:border-amber-400"
              >
                <Edit2 className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
                {isEditing ? "Close Editor" : "Edit Profile"}
              </Button>
            )}
          </div>
        </div>

        {/* Inline Edit Profile Form */}
        {isEditing && !isGuest && (
          <form
            onSubmit={(e) => void handleSaveProfile(e)}
            className="mt-6 pt-6 border-t border-border/50 grid gap-4 md:grid-cols-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Full Name *</Label>
              <Input
                id="profile-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Your full name"
                required
                minLength={2}
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-job">Job Title / Academic Role</Label>
              <Input
                id="profile-job"
                value={formJobTitle}
                onChange={(e) => setFormJobTitle(e.target.value)}
                placeholder="e.g. Software Engineer, CS Student, Lecturer"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-dept">Department / Field</Label>
              <Input
                id="profile-dept"
                value={formDepartment}
                onChange={(e) => setFormDepartment(e.target.value)}
                placeholder="e.g. Computer Science, Product Engineering"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-org">Organization / University</Label>
              <Input
                id="profile-org"
                value={formOrganization}
                onChange={(e) => setFormOrganization(e.target.value)}
                placeholder="e.g. Cairo University, Acme Corp"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="profile-bio">Bio</Label>
              <Textarea
                id="profile-bio"
                value={formBio}
                onChange={(e) => setFormBio(e.target.value)}
                placeholder="Briefly describe your focus, courses, or role..."
                rows={3}
                maxLength={500}
              />
              <div className="text-[11px] text-muted-foreground text-right">
                {formBio.length} / 500
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsEditing(false)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingProfile}
                className="gradient-primary text-primary-foreground shadow-glow cursor-pointer"
              >
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1.5" />
                )}
                {savingProfile ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </form>
        )}
      </GlassCard>

      {/* Real Dynamically Calculated Statistics Strip */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <GlassCard className="p-4 border-amber-500/15">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Meetings</span>
            <Video className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold">
            {analytics?.totalMeetings ?? 0}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {analytics?.totalLectures ?? 0} lectures · {analytics?.totalRecordings ?? 0} total
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-amber-500/15">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Audio Processed</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold">
            {formatDuration(analytics?.totalAudioDurationSeconds ?? 0)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {analytics?.totalTranscriptions ?? 0} transcribed ·{" "}
            {analytics?.totalTranscriptSegments ?? 0} segments
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-amber-500/15">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>AI Outputs</span>
            <Sparkles className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold">
            {analytics?.totalAiOutputs ?? 0}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {analytics?.totalSummaries ?? 0} summaries · {analytics?.totalQuizzes ?? 0} quizzes
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-amber-500/15">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tasks & Quizzes</span>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold">
            {analytics?.tasksCompleted ?? 0}/{analytics?.tasksGenerated ?? 0}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {analytics?.totalQuizAttempts
              ? `Avg quiz ${analytics.averageQuizScore}% (${analytics.totalQuizAttempts})`
              : `${analytics?.studySessions ?? 0} study sessions`}
          </div>
        </GlassCard>
      </div>

      {/* Main Profile Tabs */}
      <Tabs defaultValue="recordings" className="space-y-4">
        <TabsList className="bg-zinc-950/80 border border-amber-500/20 p-1 flex-wrap h-auto">
          <TabsTrigger value="recordings" className="cursor-pointer gap-1.5">
            <FileAudio className="h-3.5 w-3.5" /> My Recordings ({recordings.length})
          </TabsTrigger>
          <TabsTrigger value="analytics" className="cursor-pointer gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Analytics & Milestones
          </TabsTrigger>
          <TabsTrigger value="history" className="cursor-pointer gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> AI & Study History
          </TabsTrigger>
          <TabsTrigger value="security" className="cursor-pointer gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Security & Sessions
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: REAL RECORDINGS */}
        <TabsContent value="recordings" className="space-y-4">
          <GlassCard className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold">Your Recordings</h3>
                <p className="text-xs text-muted-foreground">
                  Meetings and lectures recorded or uploaded under your account.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-border/60 bg-zinc-950/70 p-0.5 text-xs">
                  {(["all", "meeting", "lecture"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setRecordingFilter(f)}
                      className={`px-2.5 py-1 rounded-md capitalize transition cursor-pointer ${
                        recordingFilter === f
                          ? "bg-amber-500/20 text-amber-300 font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f === "all" ? "All" : f === "meeting" ? "Meetings" : "Lectures"}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => setRecordingOpen(true)}
                  className="gradient-primary text-primary-foreground cursor-pointer h-8 text-xs"
                >
                  <Mic className="h-3.5 w-3.5 mr-1.5" /> Record / Upload
                </Button>
              </div>
            </div>

            {filteredRecordings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-zinc-950/40 p-10 text-center space-y-3">
                <FileAudio className="h-9 w-9 text-amber-400/60 mx-auto" />
                <div>
                  <p className="text-sm font-medium">No recordings yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    Upload an audio/video file or start a live recording to generate real
                    transcripts, summaries, action items, and quizzes.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRecordingOpen(true)}
                  className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 cursor-pointer"
                >
                  <Mic className="h-3.5 w-3.5 mr-1.5" /> Create Your First Recording
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredRecordings.map((item: ProfileRecordingItem) => {
                  const detailPath =
                    item.type === "meeting"
                      ? (`/meetings/${item.id}` as const)
                      : (`/lectures/${item.id}` as const);
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
                            {item.type === "meeting" ? (
                              <Video className="h-3 w-3" />
                            ) : (
                              <BookOpen className="h-3 w-3" />
                            )}
                            {item.type}
                          </span>
                          {item.courseCode && (
                            <span className="text-[11px] font-mono text-zinc-400">
                              {item.courseCode}
                            </span>
                          )}
                          <Link
                            to={detailPath as never}
                            className="font-medium text-sm text-foreground hover:text-amber-300 transition truncate"
                          >
                            {item.title}
                          </Link>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatDate(item.date || item.createdAt)}</span>
                          <span>· {formatDuration(item.durationSeconds)}</span>
                          <span>
                            · Audio:{" "}
                            <b
                              className={item.audioAvailable ? "text-emerald-400" : "text-zinc-400"}
                            >
                              {item.audioAvailable ? "Stored" : "Transcript only"}
                            </b>
                          </span>
                          <span>
                            · Transcript:{" "}
                            <b className="text-zinc-200">
                              {item.segmentsCount > 0
                                ? `${item.segmentsCount} segments`
                                : item.transcriptionStatus}
                            </b>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <StatusBadge status={item.status} />
                        {item.hasSummary && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300">
                            <FileText className="h-3 w-3" /> Summary
                          </span>
                        )}
                        {item.hasQuiz && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] text-purple-300">
                            <HelpCircle className="h-3 w-3" /> {item.quizCount} Quiz
                          </span>
                        )}
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                          <Link to={detailPath as never}>
                            Open <ExternalLink className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </TabsContent>

        {/* TAB 2: REAL ANALYTICS & MILESTONES */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Most Used AI Features */}
            <GlassCard className="p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold">AI Feature Usage</h3>
                <p className="text-xs text-muted-foreground">
                  Calculated directly from your saved transcripts, summaries, quizzes, decks, and
                  Q&A history.
                </p>
              </div>
              <div className="space-y-3">
                {(analytics?.mostUsedAiFeatures || []).map((f) => (
                  <div key={f.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-200">{f.feature}</span>
                      <span className="font-mono font-semibold text-amber-300">{f.count}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-800/90 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all"
                        style={{
                          width:
                            f.count > 0
                              ? `${Math.max(8, (f.count / maxFeatureCount) * 100)}%`
                              : "0%",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Most Active Days */}
            <GlassCard className="p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold">Most Active Days</h3>
                <p className="text-xs text-muted-foreground">
                  Distribution of your real recordings across days of the week.
                </p>
              </div>
              <div className="grid grid-cols-7 gap-2 items-end h-40 pt-4">
                {(analytics?.mostActiveDays || []).map((d) => {
                  const pct =
                    d.count > 0 ? Math.max(14, Math.round((d.count / maxDayCount) * 100)) : 4;
                  return (
                    <div
                      key={d.day}
                      className="flex flex-col items-center gap-1.5 h-full justify-end"
                    >
                      <span className="text-[11px] font-mono text-amber-300">{d.count}</span>
                      <div className="w-full max-w-[34px] flex-1 flex items-end">
                        <div
                          className={`w-full rounded-t-md transition-all ${
                            d.count > 0
                              ? "bg-gradient-to-t from-amber-600/70 to-amber-300"
                              : "bg-zinc-800/80"
                          }`}
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground">{d.day}</span>
                    </div>
                  );
                })}
              </div>

              {/* Job Health Summary */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50 text-center">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
                  <div className="font-mono text-sm font-bold text-emerald-300">
                    {analytics?.completedJobs ?? 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Completed Jobs</div>
                </div>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2">
                  <div className="font-mono text-sm font-bold text-amber-300">
                    {analytics?.pendingJobs ?? 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Pending Jobs</div>
                </div>
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
                  <div className="font-mono text-sm font-bold text-red-300">
                    {analytics?.failedJobs ?? 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Failed Jobs</div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Data-Driven Milestones */}
          <GlassCard className="p-5 space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-400" /> Real Activity Milestones
              </h3>
              <p className="text-xs text-muted-foreground">
                Unlocked automatically as you record, process audio, complete quizzes, and finish
                tasks.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(analytics?.milestones || []).map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl border p-3.5 transition ${
                    m.unlocked
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-border/50 bg-zinc-950/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{m.title}</span>
                    {m.unlocked ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5">
                        Unlocked
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {m.current}/{m.target}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </TabsContent>

        {/* TAB 3: AI & STUDY HISTORY */}
        <TabsContent value="history" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Recent Quiz Attempts */}
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-base font-semibold">Quiz Performance</h3>
                  <p className="text-xs text-muted-foreground">
                    Real attempts recorded on your generated quizzes.
                  </p>
                </div>
                <span className="text-xs font-mono text-amber-300">
                  Avg: {analytics?.averageQuizScore ?? 0}%
                </span>
              </div>

              {(profile?.recentQuizAttempts || []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  No quiz attempts recorded yet. Complete a generated quiz to track your mastery.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {profile?.recentQuizAttempts.map((a) => (
                    <div key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{a.quizTitle}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.correctCount}/{a.totalQuestions} correct ·{" "}
                          {formatDateTime(a.submittedAt)}
                        </div>
                      </div>
                      <span className="font-mono text-sm font-bold text-amber-300 shrink-0">
                        {a.scorePercent}%
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-3 border-t border-border/50 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-zinc-950/60 border border-border/50 p-3">
                  <div className="text-muted-foreground">Flashcards Mastered</div>
                  <div className="font-display text-lg font-bold mt-0.5">
                    {analytics?.masteredFlashcards ?? 0} / {analytics?.totalFlashcards ?? 0}
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-950/60 border border-border/50 p-3">
                  <div className="text-muted-foreground">Mind Maps & Q&A</div>
                  <div className="font-display text-lg font-bold mt-0.5">
                    {analytics?.totalMindMaps ?? 0} maps · {analytics?.totalChatMessages ?? 0} Q&A
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* Recent AI Processing Jobs */}
            <GlassCard className="p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold">AI Processing Jobs</h3>
                <p className="text-xs text-muted-foreground">
                  Recent audio transcription & intelligence pipeline jobs for your account.
                </p>
              </div>
              {(profile?.recentJobs || []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  No AI processing jobs yet. Upload or record audio to inspect pipeline runs here.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {profile?.recentJobs.map((job) => (
                    <div key={job.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {job.fileName || `${job.resourceType} recording`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="capitalize">{job.resourceType}</span> ·{" "}
                          {formatDateTime(job.updatedAt)}
                        </div>
                        {job.errorMessage && (
                          <div className="text-[11px] text-red-400 truncate mt-0.5">
                            {job.errorMessage}
                          </div>
                        )}
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </TabsContent>

        {/* TAB 4: ACCOUNT SECURITY & SESSIONS */}
        <TabsContent value="security" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Account Information & Password Management */}
            <GlassCard className="p-5 space-y-5">
              <div>
                <h3 className="font-display text-base font-semibold flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-amber-400" />
                  {user?.hasPassword ? "Change Password" : "Set Account Password"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isGuest
                    ? "Sign in with a registered account to manage password security."
                    : user?.hasPassword
                      ? "Update your password. Other active sessions will be signed out automatically."
                      : "Your account uses Google Sign-In. You can optionally set a local password as a backup sign-in method."}
                </p>
              </div>

              {!isGuest ? (
                <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
                  {user?.hasPassword && (
                    <div className="space-y-1">
                      <Label htmlFor="current-password">Current Password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="At least 8 characters with letters & numbers"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>

                  {passwordError && (
                    <p className="text-xs text-red-400 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {passwordError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={passwordBusy}
                    className="gradient-primary text-primary-foreground cursor-pointer"
                  >
                    {passwordBusy ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1.5" />
                    )}
                    {user?.hasPassword ? "Update Password" : "Set Password"}
                  </Button>
                </form>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link to={"/login" as never}>Sign in to manage security</Link>
                </Button>
              )}

              <div className="pt-4 border-t border-border/50 space-y-2 text-xs">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <UserIcon className="h-3.5 w-3.5 text-amber-400" /> Account Summary
                </div>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>Provider</div>
                  <div className="text-right text-zinc-200">{providerLabel}</div>
                  <div>Email Verification</div>
                  <div className="text-right text-zinc-200">
                    {user?.emailVerified ? "Verified" : isGuest ? "N/A" : "Standard"}
                  </div>
                  <div>Last Updated</div>
                  <div className="text-right text-zinc-200">
                    {formatDate(user?.updatedAt || user?.createdAt)}
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* Active Sessions Management */}
            <GlassCard className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-semibold flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-amber-400" /> Active Sessions
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Devices currently signed into your MeetMind AI account.
                  </p>
                </div>
                {(profile?.sessions.length || 0) > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={revokingOthers}
                    onClick={() => void handleRevokeOtherSessions()}
                    className="h-8 text-xs border-red-500/30 text-red-300 hover:bg-red-500/10 cursor-pointer"
                  >
                    {revokingOthers ? "Signing out..." : "Sign out other devices"}
                  </Button>
                )}
              </div>

              {(profile?.sessions || []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  No active session records found.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {profile?.sessions.map((s) => (
                    <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{s.deviceLabel}</span>
                          {s.isCurrent && (
                            <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Last active {formatDateTime(s.lastUsedAt)} · Expires{" "}
                          {formatDate(s.expiresAt)}
                        </div>
                      </div>
                      {!s.isCurrent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={revokingId === s.id}
                          onClick={() => void handleRevokeSession(s.id)}
                          className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer shrink-0"
                        >
                          {revokingId === s.id ? "Revoking..." : "Revoke"}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
