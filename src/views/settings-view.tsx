import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Palette,
  Lock,
  Sparkles,
  Check,
  ShieldCheck,
  Database,
  AlertTriangle,
  Download,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
const SECTIONS = [
  { key: "appearance", icon: Palette, title: "Appearance", desc: "Theme, density, motion" },
  { key: "notifications", icon: Bell, title: "Notifications", desc: "Email, in-app, digest" },
  { key: "ai", icon: Sparkles, title: "AI Preferences", desc: "Language, tone, models" },
  { key: "security", icon: Lock, title: "Security & Sessions", desc: "2FA, passwords, audit" },
  { key: "data", icon: Database, title: "Data & Reset", desc: "Backup & complete reset" },
];

export default function SettingsView() {
  const queryClient = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const setAuthUser = useAuthStore((s) => s.setUser);
  const isGuest = Boolean(authUser?.isGuest);

  const [activeTab, setActiveTab] = useState("appearance");
  const [displayName, setDisplayName] = useState(authUser?.name || "");
  const [savingSettings, setSavingSettings] = useState(false);
  const [emailDigest, setEmailDigest] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compactDensity, setCompactDensity] = useState(false);
  const [aiLanguage, setAiLanguage] = useState("en");
  const [summaryTone, setSummaryTone] = useState("concise");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [deleteRecordingsOpen, setDeleteRecordingsOpen] = useState(false);
  const [isDeletingRecordings, setIsDeletingRecordings] = useState(false);

  useEffect(() => {
    if (authUser?.name) {
      setDisplayName(authUser.name);
    }
  }, [authUser?.name]);

  const handleDeleteAllRecordings = async () => {
    setIsDeletingRecordings(true);
    toast.loading("Deleting all recordings, transcripts, and AI outputs...", { id: "del-rec" });
    try {
      const res = await api.deleteAllRecordings();
      queryClient.invalidateQueries();
      toast.success(`Deleted ${res.deletedCount} recordings cleanly.`, { id: "del-rec" });
      setDeleteRecordingsOpen(false);
    } catch {
      toast.error("Failed to delete recordings", { id: "del-rec" });
    } finally {
      setIsDeletingRecordings(false);
    }
  };

  const handleSystemReset = async () => {
    setIsResetting(true);
    toast.loading("جاري مسح البيانات التجريبية وإعادة ضبط النظام...", { id: "reset-sys" });
    try {
      const res = await api.resetSystem(true);
      queryClient.invalidateQueries();
      toast.success(res.message || "تمت إعادة ضبط النظام بنجاح!", { id: "reset-sys" });
      setResetDialogOpen(false);
    } catch {
      toast.error("فشل في إعادة ضبط النظام", { id: "reset-sys" });
    } finally {
      setIsResetting(false);
    }
  };

  const handleSave = async () => {
    setSavingSettings(true);
    try {
      const trimmed = displayName.trim();
      if (!isGuest && authUser && trimmed.length >= 2 && trimmed !== authUser.name) {
        const res = await api.updateProfile({ name: trimmed });
        setAuthUser(res.user);
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      }
      toast.success("Settings saved successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Configure your intelligence workspace, notification rules, and security preferences."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="p-2 lg:col-span-1">
          <ul className="space-y-0.5 p-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = activeTab === s.key;
              return (
                <li key={s.key}>
                  <button
                    onClick={() => setActiveTab(s.key)}
                    className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-sm transition cursor-pointer ${
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "hover:bg-accent/60"
                    }`}
                  >
                    <div className="grid h-8 w-8 place-items-center rounded-lg border border-border/60 bg-background/60">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">{s.title}</div>
                      <div className="text-xs text-muted-foreground">{s.desc}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </GlassCard>

        <GlassCard className="p-6 lg:col-span-2">
          {activeTab === "appearance" && (
            <div className="space-y-5">
              <div className="font-display text-lg font-semibold">Appearance & Layout</div>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Reduced motion</Label>
                    <p className="text-xs text-muted-foreground">
                      Minimize non-essential animations
                    </p>
                  </div>
                  <Switch checked={reducedMotion} onCheckedChange={setReducedMotion} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Compact density</Label>
                    <p className="text-xs text-muted-foreground">
                      Tighter spacing across tables and widgets
                    </p>
                  </div>
                  <Switch checked={compactDensity} onCheckedChange={setCompactDensity} />
                </div>
                <div className="space-y-1.5">
                  <Label>Display Name</Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isGuest}
                    placeholder={isGuest ? "Guest User (sign in to edit)" : "Your full name"}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-5">
              <div className="font-display text-lg font-semibold">Notification Preferences</div>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Daily Executive Digest</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive daily summaries of your recordings
                    </p>
                  </div>
                  <Switch checked={emailDigest} onCheckedChange={setEmailDigest} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Task & Action Item Alerts</Label>
                    <p className="text-xs text-muted-foreground">
                      Notify when AI extracts high-priority action items
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>
          )}

          {activeTab === "ai" && (
            <div className="space-y-5">
              <div className="font-display text-lg font-semibold">AI Intelligence Settings</div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Default Transcription Language</Label>
                  <Select value={aiLanguage} onValueChange={setAiLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English (US / UK)</SelectItem>
                      <SelectItem value="ar">Arabic (Standard / Dialectal)</SelectItem>
                      <SelectItem value="auto">Auto-detect from audio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Summary Tone</Label>
                  <Select value={summaryTone} onValueChange={setSummaryTone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="concise">Concise & Bulleted</SelectItem>
                      <SelectItem value="detailed">In-depth Technical Notes</SelectItem>
                      <SelectItem value="executive">Board-Ready Executive Brief</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-5">
              <div className="font-display text-lg font-semibold">Security & Access Control</div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Authenticated Session Isolation Active
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {isGuest ? (
                    <>
                      You are currently browsing in an isolated <b>Guest Session</b>. Sign in or
                      create an account to save your profile, change passwords, and manage devices.
                    </>
                  ) : (
                    <>
                      Your session is authenticated as{" "}
                      <b className="text-foreground">{authUser?.email || "Authenticated User"}</b> (
                      <span className="capitalize">{authUser?.role || "member"}</span> ·{" "}
                      {authUser?.authProvider === "google" ? "Google OAuth" : "Email & Password"}).
                      Your recordings, transcripts, and AI outputs are strictly isolated to your
                      account.
                    </>
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Password & Active Session Management</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Update your password, inspect active login sessions, revoke other devices, or
                    export your personal data from your Profile security hub.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <Link to="/profile">Manage in Profile</Link>
                </Button>
              </div>
            </div>
          )}

          {activeTab === "data" && (
            <div className="space-y-6">
              <div>
                <div className="font-display text-lg font-semibold">
                  Data Governance & System Reset
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Manage persistent data storage, export complete database backups, or reset the
                  workspace to clean zero state.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-1.5">
                      <Database className="h-4 w-4 text-primary" /> Full Workspace Backup
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Download a JSON dump containing all your meetings, lectures, quizzes, and
                      tasks
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.location.href = "/api/v1/system/backup";
                      toast.success("Downloading backup JSON...");
                    }}
                    className="cursor-pointer gap-1.5 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" /> Download Backup
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> Delete All Recordings
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Deletes all audio/video files, meetings, lectures, transcripts, summaries,
                      quizzes, flashcards, and extracted tasks scoped to your account.
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteRecordingsOpen(true)}
                    className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 cursor-pointer gap-1.5 text-xs font-semibold shrink-0"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Delete All Recordings
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> Reset Workspace to Zero
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Permanently wipes all recordings, transcripts, quizzes, flashcards, and
                      analytics so you can start fresh.
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setResetDialogOpen(true)}
                    className="cursor-pointer gap-1.5 text-xs font-semibold shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset System
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="pt-6 flex justify-end gap-2 border-t border-border/40 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setDisplayName(authUser?.name || "");
                toast.info("Changes reverted");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={savingSettings}
              className="gradient-primary text-primary-foreground shadow-glow cursor-pointer"
            >
              <Check className="h-4 w-4 mr-1.5" /> {savingSettings ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </GlassCard>
      </div>

      {/* Delete All Recordings Confirmation Dialog */}
      <AlertDialog open={deleteRecordingsOpen} onOpenChange={setDeleteRecordingsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Delete all recordings and transcripts?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
              All meetings, lectures, uploaded audio/video files, transcripts, summaries, quizzes,
              flashcards, mind maps, and extracted tasks for your account will be permanently
              deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAllRecordings}
              disabled={isDeletingRecordings}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {isDeletingRecordings ? "Deleting..." : "Confirm Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* System Reset Confirmation Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 justify-end text-destructive">
              تأكيد إعادة ضبط النظام وحذف كافة البيانات
              <AlertTriangle className="h-5 w-5" />
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
              هل أنت متأكد من رغبتك في إعادة ضبط النظام إلى حالة الصفر؟ سيتم حذف جميع التسجيلات
              الصوتية، المحاضرات، الاجتماعات، الاختبارات، والمهام بشكل نهائي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 justify-start mt-4">
            <AlertDialogCancel className="cursor-pointer">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSystemReset}
              disabled={isResetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {isResetting ? "جاري المسح..." : "نعم، تأكيد إعادة الضبط"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
