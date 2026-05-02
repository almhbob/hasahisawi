export type ReligiousItem = {
  id: string;
  title: string;
  body: string;
  category: "azkar" | "dua" | "quran" | "hadith" | "ramadan";
  source?: string;
};

export const RELIGIOUS_DAILY_CONTENT: ReligiousItem[] = [
  {
    id: "morning-1",
    category: "azkar",
    title: "ذكر الصباح",
    body: "أصبحنا وأصبح الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له.",
  },
  {
    id: "evening-1",
    category: "azkar",
    title: "ذكر المساء",
    body: "أمسينا وأمسى الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له.",
  },
  {
    id: "dua-1",
    category: "dua",
    title: "دعاء التيسير",
    body: "اللهم لا سهل إلا ما جعلته سهلاً، وأنت تجعل الحزن إذا شئت سهلاً.",
  },
  {
    id: "quran-1",
    category: "quran",
    title: "تدبر اليوم",
    body: "واجعل لك ورداً ثابتاً من القرآن ولو قليلاً؛ فالدوام هو سر الأثر.",
  },
  {
    id: "hadith-1",
    category: "hadith",
    title: "معنى نبوي",
    body: "خير الناس أنفعهم للناس؛ اجعل خدمتك للمدينة باب خير لك ولغيرك.",
  },
];

export const RELIGIOUS_FEATURES = [
  "مواقيت الصلاة والعد التنازلي",
  "تشغيل الأذان أو معاينته",
  "أذكار الصباح والمساء",
  "أدعية مختارة",
  "ورد القرآن اليومي",
  "مناسبات ومواسم دينية",
  "تنبيهات قبل الصلاة",
];

export function getReligiousCategoryLabel(category: ReligiousItem["category"]) {
  if (category === "azkar") return "الأذكار";
  if (category === "dua") return "الأدعية";
  if (category === "quran") return "القرآن";
  if (category === "hadith") return "حديث ومعنى";
  return "مواسم";
}
