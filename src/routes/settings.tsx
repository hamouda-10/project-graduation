import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · MeetMind AI" }] }),
  component: SettingsPage,
});

const SECTIONS = [
  { key: "appearance", icon: Palette, title: "Appearance", desc: "Theme, density, motion" },
  { key: "notifications", icon: Bell, title: "Notifications", desc: "Email, in-app, digest" },
  { key: "ai", icon: Sparkles, title: "AI Preferences", desc: "Language, tone, models" },
  { key: "security", icon: Lock, title: "Security & Sessions", desc: "2FA, passwords, audit" },
  { key: "data", icon: Database, title: "Data & Reset", desc: "Backup & complete reset" },
];

function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("appearance");
  const [displayName, setDisplayName] = useState("Alex Kim");
  const [emailDigest, setEmailDigest] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compactDensity, setCompactDensity] = useState(false);
  const [aiLanguage, setAiLanguage] = useState("en");
  const [summaryTone, setSummaryTone] = useState("concise");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

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

  const handleSave = () => {
    toast.success("Settings updated successfully");
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
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
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
              <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-xs space-y-2">
                <div className="font-semibold text-success flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Role-Based Access Control (RBAC) Active
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Your session is authenticated as <b>alex.kim@acme.edu</b> (Admin). Meeting
                  recordings and student lecture notes are strictly isolated within your
                  organization workspace.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Current Password</Label>
                <Input type="password" placeholder="••••••••••••" />
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

              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> Reset Workspace to Zero
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Permanently wipes all demo and real recordings, transcripts, quizzes, and
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
            <Button variant="outline" onClick={() => toast.info("Changes reverted")}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="gradient-primary text-primary-foreground shadow-glow"
            >
              <Check className="h-4 w-4 mr-1.5" /> Save Changes
            </Button>
          </div>
        </GlassCard>
      </div>

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
