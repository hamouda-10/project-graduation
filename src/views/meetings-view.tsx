import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Video,
  Plus,
  FileText,
  Trash2,
  Clock,
  Users,
  Search,
  Sparkles,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UploadRecordingDialog } from "@/components/common/upload-recording-dialog";
import { api, Meeting } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 6;

export default function MeetingsView() {
  const queryClient = useQueryClient();
  const { t, language } = useTranslation();
  const isArabic = language.toUpperCase() === "AR";

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "duration">("newest");
  const [currentPage, setCurrentPage] = useState(1);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);

  const { data: meetings = [], isLoading } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: () => api.getMeetings(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMeeting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
      toast.success(
        isArabic ? "تم حذف الاجتماع وجميع سجلاته نهائياً" : "Meeting deleted permanently",
      );
      setMeetingToDelete(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "فشل حذف الاجتماع");
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => api.deleteAllMeetings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["actionItems"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
      queryClient.invalidateQueries({ queryKey: ["mindmaps"] });
      queryClient.invalidateQueries({ queryKey: ["mindMaps"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["transcript"] });
      toast.success(
        isArabic
          ? "تم حذف كافة الاجتماعات وجميع السجلات والملفات الصوتية بنجاح"
          : "All meetings and associated recordings deleted",
      );
      setDeleteAllDialogOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "فشل حذف الاجتماعات");
    },
  });

  // Filtering & Sorting
  const filteredMeetings = useMemo(() => {
    let result = meetings.filter((m) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        m.title.toLowerCase().includes(q) ||
        (m.hostName && m.hostName.toLowerCase().includes(q)) ||
        (m.summary && m.summary.toLowerCase().includes(q));

      const matchesStatus = statusFilter === "ALL" || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === "duration") return (b.durationSeconds || 0) - (a.durationSeconds || 0);
      if (sortBy === "oldest") return new Date(a.date).getTime() - new Date(b.date).getTime();
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return result;
  }, [meetings, searchQuery, statusFilter, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredMeetings.length / ITEMS_PER_PAGE) || 1;
  const paginatedMeetings = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredMeetings.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredMeetings, currentPage]);

  return (
    <div className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <PageHeader
        eyebrow="مساحة العمل والاجتماعات · Workspace"
        title={isArabic ? "اجتماعات العمل والمتابعة" : "Business Meetings"}
        description={
          isArabic
            ? "تسجيل وتفريغ اجتماعات العمل واستخراج التوصيات والقرارات والمهام ومسؤولي التنفيذ تلقائياً."
            : "Every recorded meeting with AI summaries, action items and searchable transcripts."
        }
        actions={
          <div className="flex items-center gap-2">
            {meetings.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setDeleteAllDialogOpen(true)}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive cursor-pointer gap-1.5 text-xs h-9"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isArabic ? "حذف كافة الاجتماعات" : "Delete All Meetings"}</span>
              </Button>
            )}
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="gradient-primary text-primary-foreground shadow-glow cursor-pointer gap-2 h-9 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" /> {isArabic ? "تسجيل أو رفع اجتماع" : t("newRecording")}
            </Button>
          </div>
        }
      />

      {/* Search, Filter & Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={
              isArabic ? "ابحث بالعنوان، المنسق، أو موضوعات الاجتماع..." : "Search meetings..."
            }
            className="pr-9 bg-secondary/30 border-border/70"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setCurrentPage(1);
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[140px] bg-secondary/30 text-xs">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">جميع الحالات</SelectItem>
              <SelectItem value="Completed">مكتمل</SelectItem>
              <SelectItem value="Processing">قيد المعالجة</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sortBy}
            onValueChange={(val: "newest" | "oldest" | "duration") => setSortBy(val)}
          >
            <SelectTrigger className="w-[130px] bg-secondary/30 text-xs gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">الأحدث</SelectItem>
              <SelectItem value="oldest">الأقدم</SelectItem>
              <SelectItem value="duration">المدة الأطول</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredMeetings.length === 0 ? (
        <EmptyState
          icon={Video}
          title={searchQuery ? "لم يتم العثور على اجتماعات مطابقة" : "لا توجد اجتماعات مسجلة بعد"}
          description={
            isArabic
              ? "ابدأ بتسجيل أو رفع اجتماع عمل لاستخراج الملخص التنفيذي والمهام والتفريغ الصوتي."
              : "Record or upload your first meeting to extract summary and action items."
          }
          action={{
            label: isArabic ? "تسجيل اجتماع جديد" : "Record meeting",
            onClick: () => setCreateDialogOpen(true),
          }}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {paginatedMeetings.map((m) => (
              <GlassCard key={m.id} className="flex flex-col justify-between p-5 space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                      <Video className="h-5 w-5" />
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        m.status === "Completed"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-xs"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs"
                      }
                    >
                      {m.status === "Completed" ? "مكتمل" : "قيد المعالجة"}
                    </Badge>
                  </div>

                  <h3 className="mt-3 font-display text-base font-semibold tracking-tight text-foreground line-clamp-2">
                    {m.title}
                  </h3>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{m.hostName || "المضيف"}</span>
                    <span>·</span>
                    <span>{m.date}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="h-3 w-3" />
                      {Math.round((m.durationSeconds || 0) / 60)}د
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {m.participantsCount || 1}
                    </span>
                  </div>

                  {m.summary && (
                    <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {m.summary}
                    </p>
                  )}

                  {m.topics && m.topics.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {m.topics.slice(0, 3).map((topic, idx) => (
                        <span
                          key={idx}
                          className="rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 border border-border/50"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs cursor-pointer"
                    onClick={() => setSelectedMeeting(m)}
                  >
                    <FileText className="h-3.5 w-3.5 ml-1" /> الملخص التنفيذي
                  </Button>
                  <Link to="/transcript" className="flex-1">
                    <Button size="sm" variant="secondary" className="w-full text-xs cursor-pointer">
                      التفريغ الصوتي
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2.5 text-destructive hover:bg-destructive/10 cursor-pointer"
                    onClick={() => setMeetingToDelete(m)}
                    aria-label="حذف الاجتماع نهائياً"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
              <span className="text-muted-foreground">
                عرض {paginatedMeetings.length} من أصل {filteredMeetings.length} اجتماع
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="cursor-pointer gap-1"
                >
                  <ChevronRight className="h-4 w-4" /> السابق
                </Button>
                <span className="px-2 font-mono font-medium">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="cursor-pointer gap-1"
                >
                  التالي <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Meeting Summary Dialog */}
      <Dialog open={!!selectedMeeting} onOpenChange={(open) => !open && setSelectedMeeting(null)}>
        {selectedMeeting && (
          <DialogContent
            className="max-w-2xl max-h-[85vh] overflow-y-auto"
            dir={isArabic ? "rtl" : "ltr"}
          >
            <DialogHeader>
              <div className="flex items-center gap-2 text-xs text-primary font-semibold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" /> الملخص التنفيذي وقرارات الجلسة
              </div>
              <DialogTitle className="font-display text-xl">{selectedMeeting.title}</DialogTitle>
              <DialogDescription>
                المضيف: {selectedMeeting.hostName} · التاريخ: {selectedMeeting.date}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 pt-3">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  الملخص الذكي
                </h4>
                <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 text-sm leading-relaxed whitespace-pre-line text-foreground">
                  {selectedMeeting.summary || "جاري إعداد الملخص..."}
                </div>
              </div>

              {selectedMeeting.keyPoints && selectedMeeting.keyPoints.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    أبرز النقاط والمحاور
                  </h4>
                  <ul className="space-y-1.5 text-xs text-foreground bg-secondary/20 border border-border/50 p-3.5 rounded-xl">
                    {selectedMeeting.keyPoints.map((kp, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>{kp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedMeeting.decisions && selectedMeeting.decisions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    القرارات المعتمدة
                  </h4>
                  <ul className="space-y-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-xl">
                    {selectedMeeting.decisions.map((dec, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-bold mt-0.5">✓</span>
                        <span>{dec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Permanent Deletion Confirmation Dialog */}
      <AlertDialog
        open={!!meetingToDelete}
        onOpenChange={(open) => !open && setMeetingToDelete(null)}
      >
        <AlertDialogContent dir={isArabic ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle className="font-display">
                تأكيد الحذف النهائي للاجتماع
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="leading-relaxed pt-2">
              هل أنت متأكد من رغبتك في حذف اجتماع <strong>"{meetingToDelete?.title}"</strong>{" "}
              نهائياً؟
              <br />
              <span className="text-destructive font-medium mt-1 block">
                سيتم مسح الملف الصوتي والتفريغ والملخص والقرارات والمهام المرتبطة بالكامل من الخادم
                وقاعدة البيانات دون إمكانية استرجاعها.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deleteMutation.isPending} className="cursor-pointer">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => meetingToDelete && deleteMutation.mutate(meetingToDelete.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-1.5" />
              ) : null}
              نعم، حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Meetings Confirmation Dialog */}
      <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <AlertDialogContent dir={isArabic ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle className="font-display">
                {isArabic ? "تأكيد حذف كافة الاجتماعات نهائياً؟" : "Delete all meetings?"}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="leading-relaxed pt-2">
              {isArabic ? (
                <>
                  هل أنت متأكد من رغبتك في حذف{" "}
                  <strong>جميع اجتماعات العمل ({meetings.length})</strong> نهائياً؟
                  <br />
                  <span className="text-destructive font-medium mt-1 block">
                    سيتم مسح كافة التسجيلات الصوتية والتفريغات وملخصات الذكاء الاصطناعي والمهام
                    المرتبطة بالكامل من الخادم وقاعدة البيانات دون إمكانية استرجاعها.
                  </span>
                </>
              ) : (
                <>
                  Are you sure you want to permanently delete{" "}
                  <strong>all ({meetings.length}) meetings</strong>?
                  <br />
                  <span className="text-destructive font-medium mt-1 block">
                    All audio files, transcripts, AI summaries, decisions, and action items will be
                    irreversibly erased from storage and database.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deleteAllMutation.isPending} className="cursor-pointer">
              {isArabic ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {deleteAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-1.5" />
              ) : (
                <Trash2 className="h-4 w-4 ml-1.5" />
              )}
              {isArabic ? "نعم، حذف الكل نهائياً" : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload Dialog */}
      <UploadRecordingDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultType="meeting"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["meetings"] });
          queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
        }}
      />
    </div>
  );
}
