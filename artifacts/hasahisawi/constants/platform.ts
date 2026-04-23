// ── بيانات التواصل الرسمية لمنصة حصاحيصاوي ────────────────────────────────
export const PLATFORM = {
  name:      "حصاحيصاوي",
  nameEn:    "Hasahisawi",

  // أرقام الدعم الرسمية
  whatsapp:     "+966597083352",   // الرقم السعودي (واتساب رئيسي)
  phoneSudan:   "+249916897578",   // الرقم السوداني

  email:     "Hasahisawi@hotmail.com",
  city:      "الحصاحيصا",
  state:     "ولاية الجزيرة",
  country:   "السودان",

  // روابط واتساب جاهزة (الرقم السعودي)
  waLink: (msg = "السلام عليكم، أود الاستفسار عن تطبيق حصاحيصاوي") =>
    `https://wa.me/966597083352?text=${encodeURIComponent(msg)}`,

  // رابط الإيميل
  mailLink: (subject = "استفسار — حصاحيصاوي") =>
    `mailto:Hasahisawi@hotmail.com?subject=${encodeURIComponent(subject)}`,
} as const;
