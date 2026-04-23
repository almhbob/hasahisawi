// ── بيانات التواصل الرسمية لمنصة حصاحيصاوي ────────────────────────────────
export const PLATFORM = {
  name:      "حصاحيصاوي",
  nameEn:    "Hasahisawi",
  whatsapp:  "+966530658285",
  email:     "Hasahisawi@hotmail.com",
  city:      "الحصاحيصا",
  state:     "ولاية الجزيرة",
  country:   "السودان",

  // روابط واتساب جاهزة
  waLink: (msg = "السلام عليكم، أود الاستفسار عن تطبيق حصاحيصاوي") =>
    `https://wa.me/966530658285?text=${encodeURIComponent(msg)}`,

  // رابط الإيميل
  mailLink: (subject = "استفسار — حصاحيصاوي") =>
    `mailto:Hasahisawi@hotmail.com?subject=${encodeURIComponent(subject)}`,
} as const;
