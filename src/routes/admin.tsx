import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { GlassCard } from "@/components/common/glass-card";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Building2,
  Users,
  ShieldCheck,
  CreditCard,
  Download,
  Activity,
  AlertTriangle,
  RotateCcw,
  Database,
  FileCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "لوحة التحكم الإدارية · MeetMind AI" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleDownloadAudit = () => {
    window.location.href = "/api/v1/reports/export";
    toast.success("Audit log export started (CSV)...");
  };

  const handleDownloadBackup = () => {
    window.location.href = "/api/v1/system/backup";
    toast.success("بدء تنزيل النسخة الاحتياطية للنظام (JSON)...");
  };

  const handleSystemReset = async () => {
    setIsResetting(true);
    toast.loading("جاري مسح البيانات التجريبية وإعادة ضبط النظام...", { id: "reset-sys" });
    try {
      const res = await api.resetSystem(true);
      queryClient.invalidateQueries();
      toast.success(res.message || "تمت إعادة ضبط النظام بنجاح!", { id: "reset-sys" });
      setResetDialogOpen(false);
    } catch (e) {
      toast.error("فشل في إعادة ضبط النظام", { id: "reset-sys" });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="لوحة التحكم والإدارة"
        title={t("nav_admin")}
        description="إدارة مساحة العمل، الرقابة على البيانات، النسخ الاحتياطي، وإعادة ضبط النظام."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadBackup}
              className="cursor-pointer gap-1.5 text-xs"
            >
              <Database className="h-4 w-4 text-primary" /> تنزيل نسخة احتياطية
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadAudit}
              className="cursor-pointer gap-1.5 text-xs"
            >
              <Download className="h-4 w-4" /> سجل التدقيق (CSV)
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="مساحات العمل" value="1" icon={Building2} tone="primary" />
        <StatCard label="المستخدمين النشطين" value="1" icon={Users} tone="cyan" />
        <StatCard label="معايير الأمان" value="SOC 2 & FERPA" icon={ShieldCheck} tone="pink" />
        <StatCard label="خطة الاشتراك" value="Enterprise AI" icon={CreditCard} tone="amber" />
      </div>

      {/* Usage card */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-display text-lg font-semibold">
              معدل الاستخدام الشهري للذكاء الاصطناعي
            </div>
            <div className="text-xs text-muted-foreground">
              دقائق التفريغ الصوتي والترجمة الفورية وتوليد الملخصات الذكية
            </div>
          </div>
          <div className="text-sm font-semibold text-primary font-mono">100% متوفر</div>
        </div>
        <Progress value={10} className="mt-4 h-2.5" />
      </GlassCard>

      {/* Administrative System Reset Card */}
      <GlassCard className="p-6 border-destructive/30 bg-destructive/5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="font-display text-base font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              إعادة ضبط النظام بالكامل والبدء من الصفر
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              تتيح لك هذه العملية مسح كافة الاجتماعات والمحاضرات والملفات الصوتية والاختبارات
              التجريبية والمهام، لتبدأ باستخدام MeetMind AI من نقطة الصفر ببياناتك الحقيقية فقط.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadBackup}
              className="cursor-pointer gap-1 text-xs"
            >
              <Download className="h-3.5 w-3.5" /> أخذ نسخة احتياطية أولاً
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setResetDialogOpen(true)}
              className="cursor-pointer gap-1 text-xs font-semibold"
            >
              <RotateCcw className="h-3.5 w-3.5" /> إعادة ضبط النظام الآن
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* System Health */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="font-display text-base font-semibold">حالة الأنظمة والمحركات التابعة</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 space-y-1">
            <span className="text-muted-foreground font-medium">محرك التفريغ الصوتي العربي</span>
            <div className="text-success font-semibold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> يعمل بكفاءة كاملة
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 space-y-1">
            <span className="text-muted-foreground font-medium">التخزين المحلي الدائم للملفات</span>
            <div className="text-success font-semibold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> نشط وجاهز
              (data/recordings)
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 space-y-1">
            <span className="text-muted-foreground font-medium">
              محرك التلخيص والكويزات (Gemini)
            </span>
            <div className="text-success font-semibold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> متصل وجاهز
            </div>
          </div>
        </div>
      </GlassCard>

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
              الصوتية، المحاضرات، الاجتماعات، الاختبارات، والمهام بشكل نهائي. ننصحك بتحميل نسخة
              احتياطية أولاً.
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
