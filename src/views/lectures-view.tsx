import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap,
  Plus,
  BookOpen,
  BrainCircuit,
  Layers,
  Trash2,
  Clock,
  Sparkles,
  Search,
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
import { api, Lecture } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 6;

export default function LecturesView() {
  const queryClient = useQueryClient();
  const { t, language } = useTranslation();
  const isArabic = language.toUpperCase() === "AR";

  const [searchQuery, setSearchQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "duration">("newest");
  const [currentPage, setCurrentPage] = useState(1);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);
  const [lectureToDelete, setLectureToDelete] = useState<Lecture | null>(null);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);

  const { data: lectures = [], isLoading } = useQuery<Lecture[]>({
    queryKey: ["lectures"],
    queryFn: () => api.getLectures(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteLecture(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
      toast.success(
        isArabic ? "تم حذف المحاضرة وجميع سجلاتها نهائياً" : "Lecture deleted permanently",
      );
      setLectureToDelete(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "فشل حذف المحاضرة");
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => api.deleteAllLectures(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
      queryClient.invalidateQueries({ queryKey: ["mindmaps"] });
      queryClient.invalidateQueries({ queryKey: ["mindMaps"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["actionItems"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["transcript"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      toast.success(
        isArabic
          ? "تم حذف كافة المحاضرات وجميع سجلاتها والملفات الصوتية بنجاح"
          : "All lectures and associated recordings deleted",
      );
      setDeleteAllDialogOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "فشل حذف المحاضرات");
    },
  });

  // Extract unique course codes
  const uniqueCourses = useMemo(() => {
    const set = new Set<string>();
    lectures.forEach((l) => {
      if (l.courseCode) set.add(l.courseCode);
    });
    return Array.from(set);
  }, [lectures]);

  // Filtering & Sorting
  const filteredLectures = useMemo(() => {
    let result = lectures.filter((l) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        l.title.toLowerCase().includes(q) ||
        (l.courseCode && l.courseCode.toLowerCase().includes(q)) ||
        (l.instructorName && l.instructorName.toLowerCase().includes(q)) ||
        (l.studyNotes && l.studyNotes.toLowerCase().includes(q));

      const matchesCourse = courseFilter === "ALL" || l.courseCode === courseFilter;
      return matchesSearch && matchesCourse;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === "duration") return (b.durationSeconds || 0) - (a.durationSeconds || 0);
      if (sortBy === "oldest") return new Date(a.date).getTime() - new Date(b.date).getTime();
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return result;
  }, [lectures, searchQuery, courseFilter, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredLectures.length / ITEMS_PER_PAGE) || 1;
  const paginatedLectures = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLectures.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLectures, currentPage]);

  return (
    <div className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <PageHeader
        eyebrow="القطاع الأكاديمي · Academic Hub"
        title={isArabic ? "المحاضرات والمقررات الدراسية" : "Lectures & Courses"}
        description={
          isArabic
            ? "محاضرات مسجلة مع تفريغ صوتي دقيق، وملخصات أكاديمية مستندة للمحتوى، وتوليد اختبارات وبطاقات استذكار."
            : "Recorded lectures with AI-structured study notes, definitions, exam tips, and revision decks."
        }
        actions={
          <div className="flex items-center gap-2">
            {lectures.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setDeleteAllDialogOpen(true)}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive cursor-pointer gap-1.5 text-xs h-9"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isArabic ? "حذف كافة المحاضرات" : "Delete All Lectures"}</span>
              </Button>
            )}
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="gradient-primary text-primary-foreground shadow-glow cursor-pointer gap-2 h-9 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" /> {isArabic ? "تسجيل أو رفع محاضرة" : t("newRecording")}
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
              isArabic
                ? "ابحث بالعنوان، كود المادة، اسم المحاضر أو المفاهيم..."
                : t("searchLectures")
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
          {uniqueCourses.length > 0 && (
            <Select
              value={courseFilter}
              onValueChange={(val) => {
                setCourseFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[140px] bg-secondary/30 text-xs">
                <SelectValue placeholder="المقرر" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">جميع المقررات</SelectItem>
                {uniqueCourses.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

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
      ) : filteredLectures.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={searchQuery ? "لم يتم العثور على محاضرات مطابقة" : "لا توجد محاضرات مسجلة بعد"}
          description={
            isArabic
              ? "قم برفع ملف صوتي أو بدء تسجيل مباشر لتوليد التفريغ الذكي والاختبارات تلقائياً."
              : "Upload an audio recording or lecture file to automatically generate structured study notes, flashcards, and quizzes."
          }
          action={{
            label: isArabic ? "تسجيل محاضرة جديدة" : "Record lecture",
            onClick: () => setCreateDialogOpen(true),
          }}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {paginatedLectures.map((l) => (
              <GlassCard key={l.id} className="flex flex-col justify-between p-5 space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    {l.courseCode && (
                      <Badge
                        variant="outline"
                        className="border-primary/40 bg-primary/10 text-primary font-mono text-xs"
                      >
                        {l.courseCode}
                      </Badge>
                    )}
                  </div>

                  <h3 className="mt-3 font-display text-base font-semibold tracking-tight text-foreground line-clamp-2">
                    {l.title}
                  </h3>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{l.instructorName || "المحاضر"}</span>
                    <span>·</span>
                    <span>{l.date}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="h-3 w-3" />
                      {Math.round((l.durationSeconds || 0) / 60)}د
                    </span>
                  </div>

                  {l.studyNotes && (
                    <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {l.studyNotes}
                    </p>
                  )}

                  {l.keyConcepts && l.keyConcepts.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {l.keyConcepts.slice(0, 3).map((c, idx) => (
                        <span
                          key={idx}
                          className="rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-foreground/80 border border-border/50"
                        >
                          {c.term}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-border/40 space-y-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs cursor-pointer"
                      onClick={() => setSelectedLecture(l)}
                    >
                      <BookOpen className="h-3.5 w-3.5 ml-1" /> ملاحظات المذاكرة
                    </Button>
                    <Link to="/quiz" className="flex-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full text-xs cursor-pointer"
                      >
                        <BrainCircuit className="h-3.5 w-3.5 ml-1" /> الاختبار
                      </Button>
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to="/transcript" className="flex-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Layers className="h-3.5 w-3.5 ml-1" /> عرض التفريغ الكامل
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2.5 text-destructive hover:bg-destructive/10 cursor-pointer"
                      onClick={() => setLectureToDelete(l)}
                      aria-label="حذف المحاضرة نهائياً"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
              <span className="text-muted-foreground">
                عرض {paginatedLectures.length} من أصل {filteredLectures.length} محاضرة
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

      {/* Lecture Study Notes Dialog */}
      <Dialog open={!!selectedLecture} onOpenChange={(open) => !open && setSelectedLecture(null)}>
        {selectedLecture && (
          <DialogContent
            className="max-w-2xl max-h-[85vh] overflow-y-auto"
            dir={isArabic ? "rtl" : "ltr"}
          >
            <DialogHeader>
              <div className="flex items-center gap-2 text-xs text-primary font-semibold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" /> ملاحظات ومفاهيم المحاضرة بالذكاء الاصطناعي
              </div>
              <DialogTitle className="font-display text-xl">
                {selectedLecture.courseCode ? `${selectedLecture.courseCode} — ` : ""}
                {selectedLecture.title}
              </DialogTitle>
              <DialogDescription>
                المحاضر: {selectedLecture.instructorName || "غير محدد"} · التاريخ:{" "}
                {selectedLecture.date}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 pt-3">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  الشرح الأكاديمي والتلخيص الشامل
                </h4>
                <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 text-sm leading-relaxed whitespace-pre-line text-foreground">
                  {selectedLecture.studyNotes ||
                    selectedLecture.summary ||
                    "جاري إعداد الملاحظات..."}
                </div>
              </div>

              {selectedLecture.keyConcepts && selectedLecture.keyConcepts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    المفاهيم والتعريفات المحورية
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedLecture.keyConcepts.map((kc, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl border border-border/60 bg-secondary/20 space-y-1"
                      >
                        <div className="font-bold text-xs text-primary">{kc.term}</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">
                          {kc.definition}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedLecture.examHighlights && selectedLecture.examHighlights.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    النقاط المؤكد عليها وترشيحات الامتحان
                  </h4>
                  <ul className="space-y-1.5 text-xs text-foreground bg-primary/5 border border-primary/20 p-3.5 rounded-xl">
                    {selectedLecture.examHighlights.map((eh, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>{eh}</span>
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
        open={!!lectureToDelete}
        onOpenChange={(open) => !open && setLectureToDelete(null)}
      >
        <AlertDialogContent dir={isArabic ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle className="font-display">
                تأكيد الحذف النهائي للمحاضرة
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="leading-relaxed pt-2">
              هل أنت متأكد من رغبتك في حذف محاضرة <strong>"{lectureToDelete?.title}"</strong>{" "}
              نهائياً؟
              <br />
              <span className="text-destructive font-medium mt-1 block">
                سيتم مسح الملف الصوتي والتفريغ والملخص والكويز والمهام المرتبطة بالكامل من الخادم
                وقاعدة البيانات دون إمكانية استرجاعها.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deleteMutation.isPending} className="cursor-pointer">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => lectureToDelete && deleteMutation.mutate(lectureToDelete.id)}
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

      {/* Delete All Lectures Confirmation Dialog */}
      <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <AlertDialogContent dir={isArabic ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle className="font-display">
                {isArabic ? "تأكيد حذف كافة المحاضرات نهائياً؟" : "Delete all lectures?"}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="leading-relaxed pt-2">
              {isArabic ? (
                <>
                  هل أنت متأكد من رغبتك في حذف{" "}
                  <strong>جميع المحاضرات والأجهزة الدراسية ({lectures.length})</strong> نهائياً؟
                  <br />
                  <span className="text-destructive font-medium mt-1 block">
                    سيتم مسح كافة التسجيلات الصوتية والتفريغات المكتوبة والملخصات والأكواد والكويزات
                    والبطاقات التعليمية المرتبطة بها بالكامل من الخادم وقاعدة البيانات دون إمكانية
                    استرجاعها.
                  </span>
                </>
              ) : (
                <>
                  Are you sure you want to permanently delete{" "}
                  <strong>all ({lectures.length}) lectures</strong>?
                  <br />
                  <span className="text-destructive font-medium mt-1 block">
                    All audio files, transcripts, study notes, quizzes, flashcards, and mind maps
                    will be irreversibly erased from storage and database.
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
        defaultType="lecture"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["lectures"] });
          queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
        }}
      />
    </div>
  );
}
