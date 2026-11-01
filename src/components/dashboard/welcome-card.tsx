import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Play } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/common/glass-card";
import { UploadRecordingDialog } from "@/components/common/upload-recording-dialog";
import { useTranslation } from "@/lib/i18n";

export function WelcomeCard() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return (
    <>
      <GlassCard className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute inset-0 gradient-primary opacity-[0.14]" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full gradient-primary opacity-40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-accent-cyan opacity-20 blur-3xl" />

        <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
              <Sparkles className="h-3 w-3" /> {t("briefingReady")}
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
              {t("welcomeTitle")}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t("welcomeSubtitle")}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                onClick={() => setDialogOpen(true)}
                className="gradient-primary text-primary-foreground shadow-glow hover:opacity-95 cursor-pointer"
              >
                <Play className="h-4 w-4" /> {t("startRecording")}
              </Button>
              <Link to="/ai-workspace">
                <Button variant="outline" className="cursor-pointer">
                  {t("viewAiWorkspace")} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="relative hidden aspect-[4/3] w-64 shrink-0 rounded-2xl border border-border bg-background/40 p-4 shadow-elegant md:block"
          >
            <div className="absolute inset-0 gradient-primary opacity-10 rounded-2xl" />
            <div className="relative flex h-full flex-col justify-between">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-primary">
                  Today's focus
                </div>
                <div className="mt-1 font-display text-lg font-semibold text-foreground">
                  Audio & Speech Intelligence
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  "09:30 · Q3 Roadmap Sync",
                  "11:00 · Distributed Systems (Raft)",
                  "14:00 · Engineering Standup",
                ].map((line) => (
                  <div
                    key={line}
                    className="rounded-lg bg-secondary/70 px-2.5 py-1.5 text-xs text-foreground/90 backdrop-blur"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </GlassCard>

      <UploadRecordingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["meetings"] });
          queryClient.invalidateQueries({ queryKey: ["lectures"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
        }}
      />
    </>
  );
}
