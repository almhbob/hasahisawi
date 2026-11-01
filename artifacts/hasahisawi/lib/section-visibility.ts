// ربط مسارات التطبيق بمفاتيح «أقسام التطبيق» في لوحة الإدارة (جدول section_configurations).
// القسم الذي تخفيه الإدارة يختفي من الرئيسية والقائمة الجانبية، ويبقى ظاهراً للطاقم ليديره.
import { useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/feature-flags-context";

/** مفاتيح الأقسام التي لها شاشة بنفس الاسم في التطبيق. */
const ROUTE_SECTIONS = new Set([
  "medical", "lawyers", "transport", "orgs", "women", "farmers", "factories", "telecom",
  "jobs", "market", "sports", "culture", "social", "communities", "student", "unions",
  "occasions", "zawajil", "rental", "map", "missing", "reports", "honored", "greetings",
  "events", "ads", "contests", "volunteer",
]);

/** "/(tabs)/market" أو "/market" → "market" إن كان قسماً تديره الإدارة. */
export function sectionKeyForRoute(route?: string | null): string | null {
  if (!route) return null;
  const key = route.replace(/^\/\(tabs\)/, "").replace(/^\//, "").split(/[/?#]/)[0];
  return ROUTE_SECTIONS.has(key) ? key : null;
}

/** يُرجع دالة: هل هذا المسار مخفي عن المستخدم الحالي؟ (الطاقم لا يُخفى عنه شيء) */
export function useIsRouteHidden(): (route?: string | null) => boolean {
  const { sections } = useFeatureFlags();
  const { user } = useAuth();
  const staff = user?.role === "admin" || user?.role === "moderator";
  return useCallback((route?: string | null) => {
    if (staff) return false;
    const key = sectionKeyForRoute(route);
    return !!key && sections[key]?.visible === false;
  }, [sections, staff]);
}
