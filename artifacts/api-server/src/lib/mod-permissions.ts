// ════════════════════════════════════════════════════════════════
// صلاحيات المشرفين: كل صلاحية تفتح قسماً محدداً من الإدارة.
// المدير يمنح المشرف أقساماً بعينها؛ ومسارات /api/admin/... التابعة لتلك الأقسام تقبله كمدير.
// أقسام حساسة (المديرون، الأمان، الإعدادات المتقدمة، الحسابات) تبقى لمدير التطبيق وحده.
// ════════════════════════════════════════════════════════════════
import type { Request } from "express";

export type ModPermission = { key: string; label: string; group: string; paths: string[] };

export const MOD_PERMISSIONS: ModPermission[] = [
  // المستخدمون والمجتمع
  { key: "members", label: "الأعضاء (عرض وحظر)", group: "المستخدمون والمجتمع", paths: ["users", "users-source-health", "verification-requests"] },
  { key: "social_reports", label: "بلاغات المجتمع والمنشورات", group: "المستخدمون والمجتمع", paths: ["social-reports"] },
  { key: "reports_admin", label: "البلاغات العامة", group: "المستخدمون والمجتمع", paths: ["reports"] },
  { key: "feedback_admin", label: "الشكاوى والمقترحات", group: "المستخدمون والمجتمع", paths: ["feedback", "contact-messages"] },
  { key: "ratings_admin", label: "التقييمات", group: "المستخدمون والمجتمع", paths: ["ratings"] },
  { key: "missing_admin", label: "المفقودات", group: "المستخدمون والمجتمع", paths: ["lost-items"] },
  { key: "memorial", label: "حسابات المتوفين (الصدقة الجارية)", group: "المستخدمون والمجتمع", paths: ["memorials"] },
  // المؤسسات والطلبات
  { key: "communities", label: "المؤسسات والمنظمات", group: "المؤسسات والطلبات", paths: ["communities", "organizations", "gov-entities", "external-partnerships"] },
  { key: "join_requests", label: "طلبات الانضمام", group: "المؤسسات والطلبات", paths: ["join-requests", "join-application-archives", "institution-applications"] },
  { key: "student_union", label: "اتحاد الطلاب والنقابات", group: "المؤسسات والطلبات", paths: ["student-union", "union-manager-apps", "union-members", "union-programs", "union-laws", "union-announcements", "union-partnership", "unions"] },
  { key: "education", label: "التعليم والمدارس والمكتبات (مدير قسم المدارس)", group: "المؤسسات والطلبات", paths: ["education", "edu", "educational-institutions", "student-libraries"] },
  { key: "volunteer", label: "التطوع", group: "المؤسسات والطلبات", paths: ["volunteer"] },
  // التجارة والخدمات
  { key: "merchants_admin", label: "السوق والتجار والمتاجر (حذف المنتجات والمنشورات)", group: "التجارة والخدمات", paths: ["merchants", "merchant-items", "stores", "marketplace-orders", "listings", "market-posts"] },
  { key: "phone_shops", label: "الاتصالات ومحلات الهواتف", group: "التجارة والخدمات", paths: ["phone-shops", "telecom"] },
  { key: "women_stores_admin", label: "ركن المرأة ومتاجره", group: "التجارة والخدمات", paths: ["women", "women-services"] },
  { key: "farmers_admin", label: "السوق الزراعي", group: "التجارة والخدمات", paths: ["farmers"] },
  { key: "factories_admin", label: "المصانع", group: "التجارة والخدمات", paths: ["factories", "factory-plans", "factory-products"] },
  { key: "rentals_admin", label: "الإيجارات والفعاليات", group: "التجارة والخدمات", paths: ["rentals", "events", "event-rentals"] },
  { key: "jobs_admin", label: "الوظائف", group: "التجارة والخدمات", paths: ["jobs"] },
  { key: "fuel_stations", label: "محطات الوقود ومحلات الغاز", group: "التجارة والخدمات", paths: ["fuel-stations"] },
  { key: "zawajil", label: "زواجل للهدايا", group: "التجارة والخدمات", paths: ["zawajil", "zawajil-stats"] },
  { key: "shein", label: "طلبات شي إن", group: "التجارة والخدمات", paths: ["shein"] },
  { key: "ads", label: "الإعلانات", group: "التجارة والخدمات", paths: ["ads", "ads-settings"] },
  // المهن والصحة
  { key: "lawyers_admin", label: "المحامون والاستمارات القانونية", group: "المهن والصحة", paths: ["lawyers", "lawyer-applications", "legal-forms", "legal-form-suggestions", "contract-settings"] },
  { key: "designers_admin", label: "المصممون ومعرض التصاميم", group: "المهن والصحة", paths: ["design-gallery"] },
  { key: "contractors", label: "شركات المقاولات", group: "المهن والصحة", paths: ["contractors"] },
  { key: "medical", label: "الصحة والعيادات والمواعيد", group: "المهن والصحة", paths: ["medical-institutions", "medical-staff", "clinic-supervisors", "clinic-subscriptions", "clinic-subscription-plans", "specialists", "appointments", "sick-leaves", "admissions"] },
  { key: "cv_templates", label: "قوالب السيرة الذاتية", group: "المهن والصحة", paths: ["cv"] },
  // المدينة والتنقل
  { key: "landmarks", label: "المعالم", group: "المدينة والتنقل", paths: ["landmarks"] },
  { key: "numbers_admin", label: "الأرقام الهامة", group: "المدينة والتنقل", paths: ["emergency-numbers"] },
  { key: "honored", label: "قاعة التكريم", group: "المدينة والتنقل", paths: ["honored-figures"] },
  { key: "culture", label: "الثقافة", group: "المدينة والتنقل", paths: ["cultural-centers", "cultural-events"] },
  { key: "transport", label: "مشوارك علينا", group: "المدينة والتنقل", paths: ["transport"] },
  { key: "travel", label: "السفر والوكالات", group: "المدينة والتنقل", paths: ["travel", "travel-agencies"] },
  { key: "leagues", label: "الرياضة والدوريات (القسم الرياضي)", group: "المدينة والتنقل", paths: ["leagues", "sports"] },
];

const BY_SEGMENT = new Map<string, string>();
for (const p of MOD_PERMISSIONS) for (const seg of p.paths) BY_SEGMENT.set(seg, p.key);

/** القسم الذي يتبعه مسار إداري: /api/admin/<segment>/… */
export function permissionForPath(path: string): string | null {
  // مسارات الإدارة /admin/<قسم>، ومسارات القسم الرياضي /api/sports/… (تتبع صلاحية «الرياضة والدوريات»)
  const m = /\/admin\/([a-z0-9_-]+)/i.exec(path || "") || /\/api\/(sports)\//i.exec(path || "");
  return m ? BY_SEGMENT.get(m[1].toLowerCase()) ?? null : null;
}

/** هل يملك المشرف صلاحية مسار هذا الطلب؟ (يُستدعى بقائمة أقسامه) */
export function moderatorCovers(req: Request, sections: string[]): boolean {
  const key = permissionForPath(req.originalUrl || req.path);
  return !!key && sections.includes(key);
}

export const VALID_PERMISSION_KEYS = new Set(MOD_PERMISSIONS.map(p => p.key));
