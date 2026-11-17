import { useState } from "react";
import { Video, Users, FileText, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/common/glass-card";
import { SectionHeader } from "@/components/common/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, Meeting } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

export function RecentMeetings() {
  const { language } = useTranslation();
  const isArabic = language.toUpperCase() === "AR";
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: meetings = [], isLoading } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api.getMeetings(),
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(isArabic ? "تم نسخ النص المستخرج" : "Copied transcript text");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <GlassCard className="p-5">
      <SectionHeader
        title={isArabic ? "أحدث الاجتماعات والتسجيلات الصوتية" : "Recent meetings"}
        description={
          isArabic
            ? "مسجلة ومفرغة نصياً بالكامل بواسطة MeetMind AI"
            : "Recorded, transcribed and summarized by MeetMind AI"
        }
        action={
          <Link to="/meetings">
            <Button variant="ghost" size="sm" className="text-xs">
              {isArabic ? "عرض الكل" : "View all"}
            </Button>
          </Link>
        }
      />
      {isLoading ? (
        <div className="space-y-3 py-1">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-primary/10" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-44 animate-pulse rounded bg-foreground/10" />
                <div className="h-3 w-28 animate-pulse rounded bg-muted-foreground/10" />
              </div>
            </div>
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          {isArabic
            ? "لا توجد اجتماعات مسجلة بعد. اضغط «رفع ملف» لرفع أي ملف صوتي واستخراج النص منه."
            : 'No meetings recorded yet. Click "Upload File" to record or upload.'}
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {meetings.slice(0, 4).map((m, idx) => {
            const fullTranscript = (m.segments || []).map((s) => s.text).join(" ");
            const isExpanded = expandedId === m.id || (idx === 0 && expandedId === null);

            return (
              <li key={m.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                <div className="group flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/60 bg-background/60 text-primary">
                    <Video className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.title}</div>
                    <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>{m.hostName}</span>
                      <span>·</span>
                      <span>{m.date}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {m.participantsCount}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      m.status === "Completed"
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-warning/30 bg-warning/10 text-warning"
                    }
                  >
                    {m.status}
                  </Badge>
                  <div className="hidden text-xs text-muted-foreground md:block">
                    {Math.max(1, Math.round(m.durationSeconds / 60))}m
                  </div>
                  {fullTranscript && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(isExpanded ? "__NONE__" : m.id)}
                      className="h-7 px-2 text-[11px] gap-1 border-[#D4AF37]/35 text-[#F5D77F] hover:bg-[#D4AF37]/15 cursor-pointer"
                    >
                      <FileText className="h-3 w-3 text-[#D4AF37]" />
                      <span>{isArabic ? "النص المستخرج" : "Transcript"}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>

                {fullTranscript && isExpanded && (
                  <div className="rounded-xl border border-[#D4AF37]/30 bg-zinc-950/85 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#F5D77F] flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-[#D4AF37]" />
                        {isArabic
                          ? "النص الكامل المستخرج من الملف الصوتي:"
                          : "Extracted Audio Transcript:"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopy(m.id, fullTranscript)}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10.5px] text-zinc-300 hover:text-white cursor-pointer"
                        >
                          {copiedId === m.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-[#D4AF37]" />
                          )}
                          <span>{isArabic ? "نسخ النص" : "Copy"}</span>
                        </button>
                        <Link
                          to="/transcript"
                          search={{ id: m.id } as unknown as Record<string, never>}
                          className="inline-flex items-center gap-1 rounded-md border border-[#D4AF37]/40 bg-[#D4AF37]/15 px-2 py-0.5 text-[10.5px] font-semibold text-[#FFF3B0] hover:bg-[#D4AF37]/25"
                        >
                          <span>{isArabic ? "صفحة التفريغ الكامل" : "Full Page"}</span>
                        </Link>
                      </div>
                    </div>
                    <p className="max-h-36 overflow-y-auto text-xs leading-relaxed text-zinc-200 whitespace-pre-line select-text">
                      {fullTranscript}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
