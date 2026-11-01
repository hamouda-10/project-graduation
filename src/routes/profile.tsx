import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Check, Share2, Edit2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile · MeetMind AI" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("Alex Kim");
  const [role, setRole] = useState("Meeting Owner / Lead");
  const [department, setDepartment] = useState("Engineering & Computer Science");
  const [email] = useState("alex.kim@acme.edu");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditing(false);
    toast.success("Profile updated successfully!");
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Profile URL copied to clipboard!");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title={t("profile")}
        description="Your personal credentials, organizational role, and activity overview."
      />
      <GlassCard className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 gradient-primary opacity-30" />
        <div className="relative flex flex-col items-center gap-4 pt-10 text-center">
          <Avatar className="h-24 w-24 ring-4 ring-background">
            <AvatarFallback className="gradient-primary text-2xl font-semibold text-primary-foreground">
              {name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>

          {!isEditing ? (
            <>
              <div>
                <div className="font-display text-2xl font-semibold tracking-tight">{name}</div>
                <div className="text-sm text-muted-foreground">
                  {role} · {department}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{email}</div>
              </div>
              <div className="grid grid-cols-3 gap-6 rounded-xl border border-border/60 bg-background/60 px-6 py-3">
                <div>
                  <div className="font-display text-lg font-semibold">128</div>
                  <div className="text-[11px] text-muted-foreground">Meetings</div>
                </div>
                <div>
                  <div className="font-display text-lg font-semibold">42</div>
                  <div className="text-[11px] text-muted-foreground">Lectures</div>
                </div>
                <div>
                  <div className="font-display text-lg font-semibold">1.2k</div>
                  <div className="text-[11px] text-muted-foreground">AI outputs</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="cursor-pointer"
                >
                  <Edit2 className="h-4 w-4 mr-1.5" /> Edit profile
                </Button>
                <Button
                  onClick={handleShare}
                  className="gradient-primary text-primary-foreground cursor-pointer shadow-glow"
                >
                  <Share2 className="h-4 w-4 mr-1.5" /> Share profile
                </Button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSave} className="w-full max-w-md space-y-4 text-left pt-2">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Student">Student</SelectItem>
                    <SelectItem value="Professor / Instructor">Professor / Instructor</SelectItem>
                    <SelectItem value="Meeting Owner / Lead">Meeting Owner / Lead</SelectItem>
                    <SelectItem value="Administrator">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Department / Organization</Label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                  className="gradient-primary text-primary-foreground cursor-pointer shadow-glow"
                >
                  <Check className="h-4 w-4 mr-1.5" /> Save Changes
                </Button>
              </div>
            </form>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
