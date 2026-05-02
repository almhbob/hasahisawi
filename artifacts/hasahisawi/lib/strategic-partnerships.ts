export type PartnershipStatus = "active" | "hidden" | "draft";
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
};

export const GOVERNMENT_POLICY_NOTICE =
  "التطبيق منصة مستقلة ولا يمثل أي جهة حكومية. لا تظهر أي خدمة حكومية إلا بعد اتفاق واعتماد رسمي من الإدارة.";

export const TELECOM_POLICY_NOTICE =
  "تظهر عروض وخدمات شركات الاتصالات بعد اتفاق تجاري واعتماد من إدارة المنصة.";

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
    title: "شراكات عروض وباقات رقمية لمستخدمي التطبيق",
    description: "مساحة مخصصة لشركات الاتصالات لعرض العروض والخدمات الرقمية والتوأمة التسويقية بما يخدم المستخدمين ويرفع انتشار المنصة.",
    services: ["عروض إنترنت واتصال", "إشعارات موجهة", "باقات خاصة", "رعاية أقسام داخل التطبيق"],
    status: "active",
    featured: true,
    agreementNote: TELECOM_POLICY_NOTICE,
  },
];

export function splitPartnershipServices(value: string) {
  return value.split(/[,،\n]/).map(v => v.trim()).filter(Boolean);
}

export function getPartnershipInvite(type: PartnershipType) {
  return type === "government"
    ? "ندعو الجهات الحكومية للانضمام إلى منصة حصاحيصاوي بعد اتفاق رسمي يضمن دقة المعلومات وجودة الخدمة، مع تحكم كامل في إظهار أو إخفاء الخدمات."
    : "ندعو شركات الاتصالات إلى توأمة ذكية مع حصاحيصاوي عبر عروض وباقات وتجارب رقمية موجهة للمستخدمين؛ ترويجكم داخل التطبيق يرفع وصولكم، وترويجكم لنا يوسع أثرنا المحلي.";
}

export function shouldShowPartnership(item: StrategicPartnership, isAdmin: boolean) {
  if (isAdmin) return true;
  if (item.type === "government") return item.status === "active";
  return item.status === "active";
}
