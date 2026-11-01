import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users as UsersIcon, Loader2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "Users · MeetMind AI" }] }),
  component: UsersPage,
});

function UsersPage() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [department, setDepartment] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.getUsers(),
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.inviteUser({ name, email, role, department }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`Invitation sent to ${email}`);
      setInviteOpen(false);
      setName("");
      setEmail("");
      setDepartment("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to invite user");
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    inviteMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Users"
        description="Manage teammates, faculty, and students across your workspace."
        actions={
          <Button
            onClick={() => setInviteOpen(true)}
            className="gradient-primary text-primary-foreground shadow-glow"
          >
            <UserPlus className="h-4 w-4" /> Invite user
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex h-36 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <GlassCard className="p-2">
          <ul className="divide-y divide-border/60">
            {users.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="gradient-primary text-xs font-semibold text-primary-foreground">
                    {p.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.email} {p.department ? `· ${p.department}` : ""}
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="border-border/70 bg-background/60 capitalize text-xs"
                >
                  {p.role}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => toast.info(`Managing permissions for ${p.name}`)}
                >
                  Manage
                </Button>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      <div className="text-center text-xs text-muted-foreground">
        <UsersIcon className="mr-1 inline h-3 w-3" /> {users.length} members in Acme University
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <Sparkles className="h-5 w-5 text-primary" /> Invite to Workspace
            </DialogTitle>
            <DialogDescription>
              Grant access to recording intelligence, lecture study decks, and meeting summaries.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInviteSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                placeholder="e.g. Jordan Hayes"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Email Address</Label>
              <Input
                type="email"
                placeholder="jordan@acme.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input
                placeholder="e.g. Computer Science"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="instructor">Instructor</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviteMutation.isPending}
                className="gradient-primary text-primary-foreground shadow-glow"
              >
                {inviteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Send Invite"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
