// ألوان قسم المنظمات: لكل نوع لون هادئ بنسخة للوضع الفاتح وأخرى للداكن.
// النسب مُتحقق منها: النص بلون النوع ≥ 5:1 على البطاقة وعلى خلفية الشارة في الوضعين.
import Colors from "@/constants/colors";
import type { OrgType } from "@/lib/orgs-api";

const dark = Colors.isDark;

export const TYPE_CONFIG: Record<OrgType, { label: string; plural: string; icon: string; color: string; soft: string }> = {
  charity:     { label: "جمعية خيرية",  plural: "جمعيات خيرية", icon: "hand-heart",     color: dark ? "#F08AAB" : "#A3365A", soft: dark ? "rgba(240,138,171,0.14)" : "rgba(163,54,90,0.10)" },
  initiative:  { label: "مبادرة",       plural: "مبادرات",      icon: "lightbulb-on-outline", color: dark ? "#3DD39F" : "#006B4A", soft: dark ? "rgba(61,211,159,0.14)" : "rgba(0,107,74,0.10)" },
  cooperative: { label: "تعاونية",       plural: "تعاونيات",     icon: "account-group",  color: dark ? "#F2C94C" : "#8A5A00", soft: dark ? "rgba(242,201,76,0.14)" : "rgba(138,90,0,0.10)" },
  volunteer:   { label: "فريق تطوعي",   plural: "فرق تطوع",     icon: "hand-heart-outline", color: dark ? "#7CC4E4" : "#1D6A8A", soft: dark ? "rgba(124,196,228,0.14)" : "rgba(29,106,138,0.10)" },
};

export const typeCfg = (t: string | undefined) => TYPE_CONFIG[(t as OrgType)] || TYPE_CONFIG.initiative;

/** رأس الصفحة: أخضر الشعار بدرجة أعمق ليبقى النص الأبيض الصغير ≥ 4.5:1 */
export const HEADER_GRADIENT = ["#006B4A", "#004D35"] as const;
/** زر ممتلئ بنص أبيض (5.6:1) — ثابت في الوضعين */
export const SOLID = "#006B4A";
/** أحمر للتحذير يقرأ جيداً على البطاقة في الوضعين (الأحمر العام 3.4:1 فقط على البطاقة الداكنة) */
export const DANGER = Colors.isDark ? "#FF8A80" : "#C62828";
