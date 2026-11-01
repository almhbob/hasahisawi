// تعبئة السيرة الذاتية من ملف العضو في حصاحيصاوي.
// القاعدة: نملأ الفارغ فقط ونضيف الناقص من القوائم — لا نكتب فوق ما كتبه العضو.
import type { CVData } from "./cv-templates";
import type { FullProfile, Cert } from "./profile-api";
import type { AuthUser } from "./auth-context";
import type { VolunteerSummary } from "./volunteer";

const yearOf = (d?: string | null) => (d ? String(d).slice(0, 4) : "");
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function period(c: Cert) {
  const a = yearOf(c.issued_on), b = yearOf(c.expires_on);
  if (a && b && a !== b) return `${a} – ${b}`;
  if (a && !c.expires_on) return `${a} – الآن`;
  return a || b;
}

/** يضيف العناصر غير الموجودة إلى القائمة، ويتخلّص من الخانات الفارغة التي كانت تنتظر الكتابة. */
function mergeList<T>(current: T[], incoming: T[], key: (x: T) => string, isEmpty: (x: T) => boolean): { list: T[]; added: number } {
  const kept = current.filter((x) => !isEmpty(x));
  const seen = new Set(kept.map((x) => norm(key(x))));
  const add = incoming.filter((x) => { const k = norm(key(x)); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  const list = [...kept, ...add];
  return { list: list.length ? list : current, added: add.length };
}

export type CVFillResult = { cv: CVData; filled: number };

export function cvFromProfile(base: CVData, p: FullProfile | null, user: AuthUser | null, vol?: VolunteerSummary | null): CVFillResult {
  const cv: CVData = { ...base };
  let filled = 0;
  const set = <K extends keyof CVData>(k: K, v: CVData[K] | null | undefined) => {
    const cur = cv[k];
    if (v && typeof v === "string" && v.trim() && !(typeof cur === "string" && cur.trim())) { cv[k] = v.trim() as CVData[K]; filled++; }
  };

  set("name", p?.name || user?.name);
  set("title", p?.headline || p?.profession);
  set("phone", user?.phone);
  set("email", user?.email);
  const hood = p?.neighborhood || user?.neighborhood;
  set("address", hood ? `${hood}، الحصاحيصا، السودان` : "");
  set("website", p?.social_links?.website || p?.social_links?.linkedin);
  set("summary", p?.bio);

  if (p?.avatar_url && !cv.photoUri) { cv.photoUri = p.avatar_url; cv.showPhoto = true; filled++; }

  const certs = (p?.certificates || []).slice().sort((a, b) => String(b.issued_on || "").localeCompare(String(a.issued_on || "")));

  const edu = mergeList(cv.education,
    certs.filter((c) => c.kind === "degree").map((c) => ({ degree: c.title, institution: c.issuer || "", year: yearOf(c.issued_on) })),
    (x) => `${x.degree}|${x.institution}`, (x) => !x.degree.trim() && !x.institution.trim());
  cv.education = edu.list; filled += edu.added;

  const exp = mergeList(cv.experience,
    certs.filter((c) => c.kind === "experience").map((c) => ({ position: c.title, company: c.issuer || "", period: period(c), desc: "" })),
    (x) => `${x.position}|${x.company}`, (x) => !x.position.trim() && !x.company.trim());
  cv.experience = exp.list; filled += exp.added;

  const courseLines = certs
    .filter((c) => c.kind === "course" || c.kind === "license" || c.kind === "award" || c.kind === "other")
    .map((c) => [c.title, c.issuer, yearOf(c.issued_on)].filter(Boolean).join(" — "));
  if (vol && vol.points > 0) {
    courseLines.push(`عمل تطوعي عبر حصاحيصاوي — ${vol.level.name} (${vol.points} نقطة${vol.tasks ? `، ${vol.tasks} مهمة` : ""}${vol.hours ? `، ${vol.hours} ساعة` : ""})`);
  }
  const courses = mergeList(cv.courses, courseLines, (x) => x, (x) => !x.trim());
  cv.courses = courses.list; filled += courses.added;

  const skills = mergeList(cv.skills, (p?.skills || []).map((s) => s.name), (x) => x, (x) => !x.trim());
  cv.skills = skills.list; filled += skills.added;

  return { cv, filled };
}
