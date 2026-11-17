import { useState } from "react";
import { GraduationCap, FileText, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/common/glass-card";
import { SectionHeader } from "@/components/common/section-header";
import { Button } from "@/components/ui/button";
import { api, Lecture } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

export function RecentLectures() {
  const { language } = useTranslation();
  const isArabic = language.toUpperCase() === "AR";
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: lectures = [], isLoading } = useQuery<Lecture[]>({
    queryKey: ["lectures"],
    queryFn: () => api.getLectures(),
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(isArabic ? "تم نسخ نص المحاضرة المستخرج" : "Copied lecture transcript");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <GlassCard className="p-5">
      <SectionHeader
        title={isArabic ? "أحدث المحاضرات الصوتية المفرغة" : "Recent lectures"}
        description={
          isArabic
            ? "النصوص المستخرجة والملخصات والاختبارات جاهزة"
            : "Transcripts, notes, quizzes and flashcards ready"
        }
        action={
          <Link to="/lectures">
            <Button variant="ghost" size="sm" className="text-xs">
              {isArabic ? "عرض الكل" : "View all"}
            </Button>
          </Link>
        }
      />
      {isLoading ? (
        <div className="space-y-2.5 py-1">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
            >
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-accent-cyan/15" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 animate-pulse rounded bg-foreground/10" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/10" />
              </div>
            </div>
          ))}
        </div>
      ) : lectures.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          {isArabic
            ? "لا توجد محاضرات مسجلة بعد. ارفع ملفاً صوتياً لاستخراج النص الكامل منه."
            : "No lectures recorded yet. Start a recording or upload one."}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {lectures.slice(0, 3).map((l, idx) => {
            const fullTranscript = (l.segments || []).map((s) => s.text).join(" ");
            const isExpanded = expandedId === l.id || (idx === 0 && expandedId === null);

            return (
              <li
                key={l.id}
                className="relative overflow-hidden rounded-xl border border-border/60 bg-background/40 p-3 space-y-2.5"
              >
                <div className="pointer-events-none absolute inset-y-0 left-0 w-1 gradient-primary" />
                <div className="flex items-start gap-3 pl-2">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/60 text-accent-cyan">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="rounded-md bg-accent/40 px-1.5 py-0.5 font-medium text-foreground/80">
                        {l.courseCode}
                      </span>
                      <span>{l.instructorName}</span>
                      <span>·</span>
                      <span>{l.date}</span>
                    </div>
                  </div>
                  <div className="hidden text-xs text-muted-foreground sm:block">
                    {Math.max(1, Math.round(l.durationSeconds / 60))}m
                  </div>
                  {fullTranscript && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(isExpanded ? "__NONE__" : l.id)}
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
                  <div className="ml-2 rounded-xl border border-[#D4AF37]/30 bg-zinc-950/85 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#F5D77F] flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-[#D4AF37]" />
                        {isArabic
                          ? "النص الكامل المستخرج من المحاضرة:"
                          : "Extracted Lecture Transcript:"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopy(l.id, fullTranscript)}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10.5px] text-zinc-300 hover:text-white cursor-pointer"
                        >
                          {copiedId === l.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-[#D4AF37]" />
                          )}
                          <span>{isArabic ? "نسخ النص" : "Copy"}</span>
                        </button>
                        <Link
                          to="/transcript"
                          search={{ id: l.id } as unknown as Record<string, never>}
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
