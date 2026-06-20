import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../app/(tabs)/cv-builder.tsx', import.meta.url);
let src = readFileSync(file, 'utf8');
const before = src;

const start = src.indexOf('// ── القوالب المتاحة');
const end = src.indexOf('// ── الخطوات', start);

if (start >= 0 && end > start) {
  const templates = `// ── القوالب المتاحة ───────────────────────────────────────────────
const TEMPLATES = [
  { id: "executive-gold", name: "تنفيذي ذهبي", desc: "فاخر بعمود جانبي داكن ولمسة ذهبية — مجاني الآن", primaryColor: "#111827", accentColor: "#D4A017", icon: "ribbon-outline" as const, gradient: ["#111827", "#D4A017"] as [string, string], free: true, futurePaid: true },
  { id: "navy-professional", name: "احترافي أزرق", desc: "أزرق رسمي للمديرين والتسويق والمبيعات — مجاني الآن", primaryColor: "#1E3A5F", accentColor: "#2563EB", icon: "briefcase-outline" as const, gradient: ["#1E3A5F", "#2563EB"] as [string, string], free: true, futurePaid: true },
  { id: "charcoal-timeline", name: "تايملاين رمادي", desc: "يعرض الخبرات والتعليم بتسلسل زمني أنيق — مجاني الآن", primaryColor: "#374151", accentColor: "#9CA3AF", icon: "git-branch-outline" as const, gradient: ["#374151", "#9CA3AF"] as [string, string], free: true, futurePaid: true },
  { id: "olive-sidebar", name: "جانبي هادئ", desc: "عمود جانبي هادئ مناسب للإدارة والمحاسبة — مجاني الآن", primaryColor: "#4B5563", accentColor: "#B7D8BE", icon: "reader-outline" as const, gradient: ["#4B5563", "#B7D8BE"] as [string, string], free: true, futurePaid: true },
  { id: "clean-ats", name: "ATS نظيف", desc: "قالب أبيض متوافق مع أنظمة فرز السير الذاتية — مجاني", primaryColor: "#000000", accentColor: "#333333", icon: "checkmark-done-outline" as const, gradient: ["#000000", "#333333"] as [string, string], free: true, futurePaid: false },
  { id: "modern-cyan", name: "عصري سماوي", desc: "حديث وواضح للوظائف التقنية والخدمات الرقمية — مجاني الآن", primaryColor: "#0891B2", accentColor: "#06B6D4", icon: "layers-outline" as const, gradient: ["#0891B2", "#06B6D4"] as [string, string], free: true, futurePaid: true },
  { id: "minimal-gray", name: "مينيمال رمادي", desc: "تصميم بسيط يركز على النص والوضوح — مجاني الآن", primaryColor: "#52525B", accentColor: "#A1A1AA", icon: "square-outline" as const, gradient: ["#52525B", "#A1A1AA"] as [string, string], free: true, futurePaid: true },
  { id: "creative-orange", name: "إبداعي برتقالي", desc: "للمجالات الإبداعية والتصميم والتسويق — مجاني الآن", primaryColor: "#292524", accentColor: "#D97706", icon: "color-palette-outline" as const, gradient: ["#292524", "#D97706"] as [string, string], free: true, futurePaid: true },
];

`;
  src = src.slice(0, start) + templates + src.slice(end);
}

src = src.replace('  { icon: "layers-outline",         label: "4 قوالب احترافية مميزة" },', '  { icon: "layers-outline",         label: "8 قوالب احترافية مجانية الآن" },');
src = src.replace('const isPremiumTemplate = !tmpl.free;', 'const isPremiumTemplate = Boolean((tmpl as any).futurePaid);');
src = src.replace('const isLocked = isPremiumTemplate && !unlockedPremium;', 'const isLocked = false;');
src = src.replace('مجاناً: كلاسيكي، بسيط', 'كل القوالب مجانية الآن');
src = src.replace('مدفوع: عصري، إبداعي', 'تتحول لمدفوعة لاحقاً من الإدارة');
src = src.replace('مميز</Text>', 'احترافي</Text>');

if (src !== before) {
  writeFileSync(file, src);
  console.log('[cv-free-templates] professional free CV templates enabled.');
} else {
  console.log('[cv-free-templates] already applied.');
}
