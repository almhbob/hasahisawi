export type LawyerVisibility = "active" | "hidden" | "pending";
export type LawyerSubscription = "trial" | "basic" | "pro" | "office" | "suspended";

export type LawOffice = {
  id: string;
  officeName: string;
  lawyerName: string;
  specialty: string;
  city: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  bio: string;
  services: string[];
  consultationFee?: string;
  workingHours?: string;
  visibility: LawyerVisibility;
  subscription: LawyerSubscription;
  verified: boolean;
  documentsChecked: boolean;
  allowAppointments: boolean;
  allowChat: boolean;
  featured: boolean;
  createdAt: string;
};

export const LAW_OFFICES_STORE_KEY = "law_offices_v1";
export const LAW_OFFICES_COLLECTION = "law_offices";

export const LAWYER_POLICY_NOTICE =
  "المنصة تعرض مكاتب المحامين كمساحة مهنية منظمة ولا تقدم استشارة قانونية مباشرة باسم التطبيق. يتحمل المكتب مسؤولية بياناته وخدماته بعد اعتماد الإدارة.";

export const LAW_OFFICE_TOOLS = [
  "صفحة مكتب احترافية",
  "إظهار أو إخفاء من الإدارة",
  "نظام اشتراك وتجديد",
  "طلب استشارة أولية",
  "حجز موعد",
  "محادثة مع العميل",
  "إدارة ملفات وقضايا العملاء",
  "شارة توثيق بعد مراجعة المستندات",
  "عرض التخصصات والخدمات",
  "تقارير طلبات وتواصل",
];

export const DEFAULT_LAW_OFFICES: LawOffice[] = [
  {
    id: "law-office-template",
    officeName: "مساحة مكاتب المحامين",
    lawyerName: "مكتب قانوني معتمد لاحقاً",
    specialty: "استشارات قانونية وخدمات توثيق",
    city: "الحصاحيصا",
    phone: "",
    bio: "مساحة مهنية مهيأة للمحامين ومكاتب القانون داخل حصاحيصاوي. لا تظهر المكاتب للمستخدمين إلا بعد اعتماد الإدارة وتفعيل الاشتراك.",
    services: ["استشارة أولية", "مراجعة مستندات", "إعداد مذكرات", "حجز موعد"],
    visibility: "pending",
    subscription: "trial",
    verified: false,
    documentsChecked: false,
    allowAppointments: true,
    allowChat: true,
    featured: true,
    createdAt: new Date(0).toISOString(),
  },
];

export function canShowLawOffice(office: LawOffice, isAdmin: boolean) {
  if (isAdmin) return true;
  return office.visibility === "active" && office.subscription !== "suspended" && office.verified;
}

export function subscriptionLabel(value: LawyerSubscription) {
  if (value === "trial") return "تجريبي";
  if (value === "basic") return "أساسي";
  if (value === "pro") return "احترافي";
  if (value === "office") return "مكتب كامل";
  return "موقوف";
}

export function visibilityLabel(value: LawyerVisibility) {
  if (value === "active") return "ظاهر";
  if (value === "hidden") return "مخفي";
  return "بانتظار الاعتماد";
}

export function splitLawServices(value: string) {
  return value.split(/[,،\n]/).map(v => v.trim()).filter(Boolean);
}
