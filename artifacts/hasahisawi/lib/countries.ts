// قائمة الدول لعضوية ديوان الكُتّاب والانتساب الدولي (رمز ISO-3166 ثنائي، الاسم بالعربية والإنجليزية).
// الترتيب: السودان أولاً، ثم الدول العربية، ثم دول الإقامة الشائعة للسودانيين وبقية العالم.
export type Country = { code: string; ar: string; en: string };

export const COUNTRIES: Country[] = [
  { code: "SD", ar: "السودان", en: "Sudan" },
  { code: "EG", ar: "مصر", en: "Egypt" },
  { code: "SA", ar: "السعودية", en: "Saudi Arabia" },
  { code: "AE", ar: "الإمارات", en: "United Arab Emirates" },
  { code: "QA", ar: "قطر", en: "Qatar" },
  { code: "KW", ar: "الكويت", en: "Kuwait" },
  { code: "BH", ar: "البحرين", en: "Bahrain" },
  { code: "OM", ar: "عُمان", en: "Oman" },
  { code: "YE", ar: "اليمن", en: "Yemen" },
  { code: "JO", ar: "الأردن", en: "Jordan" },
  { code: "PS", ar: "فلسطين", en: "Palestine" },
  { code: "LB", ar: "لبنان", en: "Lebanon" },
  { code: "SY", ar: "سوريا", en: "Syria" },
  { code: "IQ", ar: "العراق", en: "Iraq" },
  { code: "LY", ar: "ليبيا", en: "Libya" },
  { code: "TN", ar: "تونس", en: "Tunisia" },
  { code: "DZ", ar: "الجزائر", en: "Algeria" },
  { code: "MA", ar: "المغرب", en: "Morocco" },
  { code: "MR", ar: "موريتانيا", en: "Mauritania" },
  { code: "SO", ar: "الصومال", en: "Somalia" },
  { code: "DJ", ar: "جيبوتي", en: "Djibouti" },
  { code: "KM", ar: "جزر القمر", en: "Comoros" },
  { code: "SS", ar: "جنوب السودان", en: "South Sudan" },
  { code: "TD", ar: "تشاد", en: "Chad" },
  { code: "ER", ar: "إريتريا", en: "Eritrea" },
  { code: "ET", ar: "إثيوبيا", en: "Ethiopia" },
  { code: "KE", ar: "كينيا", en: "Kenya" },
  { code: "UG", ar: "أوغندا", en: "Uganda" },
  { code: "NG", ar: "نيجيريا", en: "Nigeria" },
  { code: "TR", ar: "تركيا", en: "Türkiye" },
  { code: "MY", ar: "ماليزيا", en: "Malaysia" },
  { code: "GB", ar: "المملكة المتحدة", en: "United Kingdom" },
  { code: "IE", ar: "أيرلندا", en: "Ireland" },
  { code: "DE", ar: "ألمانيا", en: "Germany" },
  { code: "FR", ar: "فرنسا", en: "France" },
  { code: "NL", ar: "هولندا", en: "Netherlands" },
  { code: "BE", ar: "بلجيكا", en: "Belgium" },
  { code: "SE", ar: "السويد", en: "Sweden" },
  { code: "NO", ar: "النرويج", en: "Norway" },
  { code: "DK", ar: "الدنمارك", en: "Denmark" },
  { code: "IT", ar: "إيطاليا", en: "Italy" },
  { code: "ES", ar: "إسبانيا", en: "Spain" },
  { code: "CH", ar: "سويسرا", en: "Switzerland" },
  { code: "AT", ar: "النمسا", en: "Austria" },
  { code: "US", ar: "الولايات المتحدة", en: "United States" },
  { code: "CA", ar: "كندا", en: "Canada" },
  { code: "AU", ar: "أستراليا", en: "Australia" },
  { code: "NZ", ar: "نيوزيلندا", en: "New Zealand" },
  { code: "CN", ar: "الصين", en: "China" },
  { code: "IN", ar: "الهند", en: "India" },
  { code: "PK", ar: "باكستان", en: "Pakistan" },
  { code: "ID", ar: "إندونيسيا", en: "Indonesia" },
  { code: "ZA", ar: "جنوب أفريقيا", en: "South Africa" },
  { code: "OT", ar: "دولة أخرى", en: "Other" },
];

const BY = new Map(COUNTRIES.map((c) => [c.code, c]));
export const countryOf = (code?: string | null): Country => BY.get(String(code || "SD").toUpperCase()) || BY.get("SD")!;

/** علم الدولة كرمز تعبيري من رمز ISO (OT → 🌐). */
export function flagOf(code?: string | null): string {
  const c = String(code || "SD").toUpperCase();
  if (c === "OT" || !/^[A-Z]{2}$/.test(c)) return "🌐";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
