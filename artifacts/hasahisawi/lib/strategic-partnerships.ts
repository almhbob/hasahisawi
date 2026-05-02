export type PartnershipStatus = "active" | "hidden" | "draft" | "coming_soon";
export type PartnershipType = "government" | "telecom";

export type StrategicPartnership = {
  id: string;
  type: PartnershipType;
  name: string;
  title: string;
  description: string;
  services: string[];
  contact?: string;
  website?: string;
  status: PartnershipStatus;
  featured?: boolean;
  agreementNote?: string;
  ctaLabel?: string;
  commercialModel?: string;
  placement?: "home_banner" | "offers_hub" | "notifications" | "category_sponsor" | "all";
};

export const GOVERNMENT_POLICY_NOTICE =
  "التطبيق منصة مستقلة ولا يمثل أي جهة حكومية. لا تظهر أي خدمة حكومية إلا بعد اتفاق واعتماد رسمي من الإدارة.";

export const TELECOM_POLICY_NOTICE =
  "تظهر عروض وخدمات شركات الاتصالات بعد اتفاق تجاري واعتماد من إدارة المنصة، ولا يتم وصف أي شركة كشريك رسمي قبل توقيع عقد التوأمة أو تأجير المساحة الإعلانية.";

export const TELECOM_TWINNING_PITCH =
  "ندعو شركات الاتصالات إلى توأمة تسويقية ذكية مع حصاحيصاوي: مساحة إعلانية محلية عالية الصلة، عروض موجهة للمستخدمين، إشعارات للحملات، وباقات حصرية داخل التطبيق. نروّج لكم داخل المنصة، وترويجكم لنا يرفع الانتشار المحلي ويزيد استخدام الخدمات الرقمية والبيانات.";

export const STRATEGIC_PARTNERSHIPS_COLLECTION = "strategic_partnerships";
export const STRATEGIC_PARTNERSHIPS_STORE_KEY = "strategic_partnerships_v1";

export const DEFAULT_STRATEGIC_PARTNERSHIPS: StrategicPartnership[] = [
  {
    id: "government-gateway",
    type: "government",
    name: "بوابة الجهات الحكومية",
    title: "قريباً: خدمات حكومية بعد الاعتماد الرسمي",
    description: "هذه المساحة مهيأة للتكامل مع الجهات الحكومية بعد الاتفاق، وتظل مخفية أو تعريفية فقط إلى حين الاعتماد.",
    services: ["عرض الخدمات بعد الاعتماد", "تنبيهات رسمية", "قنوات تواصل موثقة"],
    status: "hidden",
    featured: true,
    agreementNote: GOVERNMENT_POLICY_NOTICE,
  },
  {
    id: "telecom-gateway",
    type: "telecom",
    name: "مساحة شركات الاتصالات",
    title: "قريباً: عروض وباقات حصرية داخل حصاحيصاوي",
    description: "مساحة تجارية مخصصة لشركات الاتصالات، تُفعّل بعد الاتفاق وتوقيع عقد التوأمة أو تأجير المساحة الإعلانية.",
    services: ["بانر رئيسي ممول", "صفحة عروض خاصة", "إشعارات حملات", "رعاية أقسام", "باقات حصرية لمستخدمي التطبيق"],
    status: "coming_soon",
    featured: true,
    ctaLabel: "هل تمثل شركة اتصالات؟ احجز المساحة الآن",
    commercialModel: "توأمة تسويقية أو تأجير مساحة إعلانية شهرية/ربع سنوية مع تقارير ظهور وتفاعل.",
    placement: "all",
    agreementNote: TELECOM_POLICY_NOTICE,
  },
];

export function splitPartnershipServices(value: string) {
  return value.split(/[,،\n]/).map(v => v.trim()).filter(Boolean);
}

export function getPartnershipInvite(type: PartnershipType) {
  return type === "government"
    ? "ندعو الجهات الحكومية للانضمام إلى منصة حصاحيصاوي بعد اتفاق رسمي يضمن دقة المعلومات وجودة الخدمة، مع تحكم كامل في إظهار أو إخفاء الخدمات."
    : TELECOM_TWINNING_PITCH;
}

export function shouldShowPartnership(item: StrategicPartnership, isAdmin: boolean) {
  if (isAdmin) return true;
  if (item.type === "government") return item.status === "active";
  if (item.type === "telecom" && item.status === "coming_soon") return true;
  return item.status === "active";
}

export function partnershipStatusLabel(status: PartnershipStatus) {
  if (status === "active") return "متاح";
  if (status === "coming_soon") return "قريباً";
  if (status === "hidden") return "مخفي";
  return "مسودة";
}
