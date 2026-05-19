export const APP_ROLES = [
  "user",
  "admin",
  "moderator",
  "patient",
  "doctor",
  "reception",
  "lab",
  "pharmacy",
  "hospital_admin",
  "companion",
  "travel_agent",
  "ticket_staff",
  "driver_assistant",
  "lawyer",
  "lawyer_supervisor",
  "zawajel_admin",
  "platform_admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  user: "مستخدم",
  admin: "مدير",
  moderator: "مشرف",
  patient: "مريض",
  doctor: "طبيب",
  reception: "استقبال",
  lab: "معمل",
  pharmacy: "صيدلية",
  hospital_admin: "إدارة طبية",
  companion: "مرافق",
  travel_agent: "شريك سفريات",
  ticket_staff: "موظف حجز تذاكر",
  driver_assistant: "مساعد سائق",
  lawyer: "محامٍ",
  lawyer_supervisor: "مشرف المحامين",
  zawajel_admin: "إدارة زواجل",
  platform_admin: "إدارة المنصة",
};

export function isAppRole(role: unknown): role is AppRole {
  return typeof role === "string" && (APP_ROLES as readonly string[]).includes(role);
}

export function normalizeRole(role?: string | null): AppRole {
  return isAppRole(role) ? role : "user";
}

export function getRoleLabel(role?: string | null): string {
  return ROLE_LABELS[normalizeRole(role)];
}
