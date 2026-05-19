import type { AppRole } from "./roles";
import { normalizeRole } from "./roles";

export type WorkspaceConfig = {
  key: string;
  title: string;
  roles: AppRole[];
  route: string;
};

export const WORKSPACES: WorkspaceConfig[] = [
  { key: "personal", title: "الحساب الشخصي", roles: ["user", "patient", "admin", "moderator"], route: "/(tabs)" },
  { key: "medical_patient", title: "رحلة المريض", roles: ["patient", "user"], route: "/(tabs)/appointments" },
  { key: "medical_doctor", title: "مساحة الطبيب", roles: ["doctor"], route: "/workspaces/doctor" },
  { key: "medical_lab", title: "المعمل", roles: ["lab"], route: "/workspaces/lab" },
  { key: "medical_pharmacy", title: "الصيدلية", roles: ["pharmacy"], route: "/workspaces/pharmacy" },
  { key: "travel_partner", title: "شريك السفريات", roles: ["travel_agent"], route: "/(tabs)/travel" },
  { key: "zawajel_admin", title: "إدارة زواجل", roles: ["zawajel_admin", "platform_admin", "admin"], route: "/workspaces/zawajel-admin" },
  { key: "platform_admin", title: "إدارة المنصة", roles: ["platform_admin", "admin"], route: "/admin" },
];

export function getWorkspacesForRole(role?: string | null): WorkspaceConfig[] {
  const normalized = normalizeRole(role);
  return WORKSPACES.filter((workspace) => workspace.roles.includes(normalized));
}

export function getDefaultWorkspaceRoute(role?: string | null): string {
  return getWorkspacesForRole(role)[0]?.route ?? "/(tabs)";
}
