// الدول والمدن لمواقيت الصلاة: الإحداثيات، المنطقة الزمنية، وطريقة الحساب المعتمدة في كل دولة.
// utcOffset احتياطي فقط (بالساعات، دون التوقيت الصيفي) إذا لم يدعم الجهاز المناطق الزمنية.
import type { MethodKey } from "@/lib/prayer-calc";

export type PrayerCity = { id: string; name: string; lat: number; lng: number };
export type PrayerCountry = {
  code: string; name: string; tz: string; utcOffset: number; method: MethodKey; cities: PrayerCity[];
};

export const PRAYER_COUNTRIES: PrayerCountry[] = [
  {
    code: "SD", name: "السودان", tz: "Africa/Khartoum", utcOffset: 2, method: "egyptian",
    cities: [
      { id: "hasahisa", name: "الحصاحيصا", lat: 14.7406, lng: 33.2955 },
      { id: "khartoum", name: "الخرطوم", lat: 15.5007, lng: 32.5599 },
      { id: "omdurman", name: "أم درمان", lat: 15.6445, lng: 32.4777 },
      { id: "bahri", name: "الخرطوم بحري", lat: 15.6406, lng: 32.5339 },
      { id: "rufaa", name: "رفاعة", lat: 14.7735, lng: 33.3507 },
      { id: "madani", name: "ود مدني", lat: 14.4012, lng: 33.5199 },
      { id: "managil", name: "المناقل", lat: 14.2516, lng: 32.9878 },
      { id: "sennar", name: "سنار", lat: 13.5500, lng: 33.6167 },
      { id: "kosti", name: "كوستي", lat: 13.1629, lng: 32.6635 },
      { id: "rabak", name: "ربك", lat: 13.1809, lng: 32.7395 },
      { id: "gedaref", name: "القضارف", lat: 14.0349, lng: 35.3834 },
      { id: "kassala", name: "كسلا", lat: 15.4510, lng: 36.4000 },
      { id: "portsudan", name: "بورتسودان", lat: 19.6158, lng: 37.2164 },
      { id: "atbara", name: "عطبرة", lat: 17.7022, lng: 33.9864 },
      { id: "shendi", name: "شندي", lat: 16.6915, lng: 33.4341 },
      { id: "dongola", name: "دنقلا", lat: 19.1653, lng: 30.4766 },
      { id: "karima", name: "كريمة", lat: 18.5500, lng: 31.8500 },
      { id: "damazin", name: "الدمازين", lat: 11.7891, lng: 34.3592 },
      { id: "obeid", name: "الأبيض", lat: 13.1843, lng: 30.2167 },
      { id: "kadugli", name: "كادقلي", lat: 11.0167, lng: 29.7167 },
      { id: "nyala", name: "نيالا", lat: 12.0489, lng: 24.8807 },
      { id: "fashir", name: "الفاشر", lat: 13.6279, lng: 25.3494 },
      { id: "geneina", name: "الجنينة", lat: 13.4500, lng: 22.4400 },
    ],
  },
  {
    code: "SA", name: "السعودية", tz: "Asia/Riyadh", utcOffset: 3, method: "umm_al_qura",
    cities: [
      { id: "makkah", name: "مكة المكرمة", lat: 21.4225, lng: 39.8262 },
      { id: "madinah", name: "المدينة المنورة", lat: 24.4672, lng: 39.6111 },
      { id: "riyadh", name: "الرياض", lat: 24.7136, lng: 46.6753 },
      { id: "jeddah", name: "جدة", lat: 21.4858, lng: 39.1925 },
      { id: "dammam", name: "الدمام", lat: 26.4207, lng: 50.0888 },
    ],
  },
  {
    code: "EG", name: "مصر", tz: "Africa/Cairo", utcOffset: 2, method: "egyptian",
    cities: [
      { id: "cairo", name: "القاهرة", lat: 30.0444, lng: 31.2357 },
      { id: "alexandria", name: "الإسكندرية", lat: 31.2001, lng: 29.9187 },
      { id: "aswan", name: "أسوان", lat: 24.0889, lng: 32.8998 },
    ],
  },
  {
    code: "AE", name: "الإمارات", tz: "Asia/Dubai", utcOffset: 4, method: "dubai",
    cities: [
      { id: "dubai", name: "دبي", lat: 25.2048, lng: 55.2708 },
      { id: "abudhabi", name: "أبوظبي", lat: 24.4539, lng: 54.3773 },
      { id: "sharjah", name: "الشارقة", lat: 25.3463, lng: 55.4209 },
    ],
  },
  { code: "QA", name: "قطر", tz: "Asia/Qatar", utcOffset: 3, method: "qatar", cities: [{ id: "doha", name: "الدوحة", lat: 25.2854, lng: 51.5310 }] },
  { code: "KW", name: "الكويت", tz: "Asia/Kuwait", utcOffset: 3, method: "kuwait", cities: [{ id: "kuwait", name: "مدينة الكويت", lat: 29.3759, lng: 47.9774 }] },
  { code: "BH", name: "البحرين", tz: "Asia/Bahrain", utcOffset: 3, method: "mwl", cities: [{ id: "manama", name: "المنامة", lat: 26.2285, lng: 50.5860 }] },
  { code: "OM", name: "عُمان", tz: "Asia/Muscat", utcOffset: 4, method: "mwl", cities: [{ id: "muscat", name: "مسقط", lat: 23.5880, lng: 58.3829 }] },
  { code: "JO", name: "الأردن", tz: "Asia/Amman", utcOffset: 3, method: "mwl", cities: [{ id: "amman", name: "عمّان", lat: 31.9454, lng: 35.9284 }] },
  {
    code: "PS", name: "فلسطين", tz: "Asia/Hebron", utcOffset: 2, method: "mwl",
    cities: [
      { id: "quds", name: "القدس", lat: 31.7683, lng: 35.2137 },
      { id: "gaza", name: "غزة", lat: 31.5017, lng: 34.4668 },
    ],
  },
  { code: "LB", name: "لبنان", tz: "Asia/Beirut", utcOffset: 2, method: "mwl", cities: [{ id: "beirut", name: "بيروت", lat: 33.8938, lng: 35.5018 }] },
  { code: "SY", name: "سوريا", tz: "Asia/Damascus", utcOffset: 3, method: "mwl", cities: [{ id: "damascus", name: "دمشق", lat: 33.5138, lng: 36.2765 }] },
  { code: "IQ", name: "العراق", tz: "Asia/Baghdad", utcOffset: 3, method: "mwl", cities: [{ id: "baghdad", name: "بغداد", lat: 33.3152, lng: 44.3661 }] },
  {
    code: "YE", name: "اليمن", tz: "Asia/Aden", utcOffset: 3, method: "mwl",
    cities: [
      { id: "sanaa", name: "صنعاء", lat: 15.3694, lng: 44.1910 },
      { id: "aden", name: "عدن", lat: 12.7855, lng: 45.0187 },
    ],
  },
  {
    code: "LY", name: "ليبيا", tz: "Africa/Tripoli", utcOffset: 2, method: "egyptian",
    cities: [
      { id: "tripoli", name: "طرابلس", lat: 32.8872, lng: 13.1913 },
      { id: "benghazi", name: "بنغازي", lat: 32.1167, lng: 20.0667 },
    ],
  },
  { code: "TN", name: "تونس", tz: "Africa/Tunis", utcOffset: 1, method: "mwl", cities: [{ id: "tunis", name: "تونس العاصمة", lat: 36.8065, lng: 10.1815 }] },
  { code: "DZ", name: "الجزائر", tz: "Africa/Algiers", utcOffset: 1, method: "mwl", cities: [{ id: "algiers", name: "الجزائر العاصمة", lat: 36.7538, lng: 3.0588 }] },
  {
    code: "MA", name: "المغرب", tz: "Africa/Casablanca", utcOffset: 1, method: "morocco",
    cities: [
      { id: "rabat", name: "الرباط", lat: 34.0209, lng: -6.8416 },
      { id: "casablanca", name: "الدار البيضاء", lat: 33.5731, lng: -7.5898 },
    ],
  },
  { code: "TD", name: "تشاد", tz: "Africa/Ndjamena", utcOffset: 1, method: "egyptian", cities: [{ id: "ndjamena", name: "انجامينا", lat: 12.1348, lng: 15.0557 }] },
  { code: "SS", name: "جنوب السودان", tz: "Africa/Juba", utcOffset: 2, method: "egyptian", cities: [{ id: "juba", name: "جوبا", lat: 4.8594, lng: 31.5713 }] },
  { code: "ER", name: "إريتريا", tz: "Africa/Asmara", utcOffset: 3, method: "egyptian", cities: [{ id: "asmara", name: "أسمرا", lat: 15.3229, lng: 38.9251 }] },
  { code: "ET", name: "إثيوبيا", tz: "Africa/Addis_Ababa", utcOffset: 3, method: "mwl", cities: [{ id: "addis", name: "أديس أبابا", lat: 9.0300, lng: 38.7400 }] },
  {
    code: "TR", name: "تركيا", tz: "Europe/Istanbul", utcOffset: 3, method: "turkey",
    cities: [
      { id: "istanbul", name: "إسطنبول", lat: 41.0082, lng: 28.9784 },
      { id: "ankara", name: "أنقرة", lat: 39.9334, lng: 32.8597 },
    ],
  },
  {
    code: "GB", name: "المملكة المتحدة", tz: "Europe/London", utcOffset: 0, method: "moonsighting",
    cities: [
      { id: "london", name: "لندن", lat: 51.5074, lng: -0.1278 },
      { id: "birmingham", name: "برمنغهام", lat: 52.4862, lng: -1.8904 },
      { id: "manchester", name: "مانشستر", lat: 53.4808, lng: -2.2426 },
    ],
  },
  { code: "IE", name: "أيرلندا", tz: "Europe/Dublin", utcOffset: 0, method: "moonsighting", cities: [{ id: "dublin", name: "دبلن", lat: 53.3498, lng: -6.2603 }] },
  { code: "DE", name: "ألمانيا", tz: "Europe/Berlin", utcOffset: 1, method: "mwl", cities: [{ id: "berlin", name: "برلين", lat: 52.5200, lng: 13.4050 }] },
  { code: "FR", name: "فرنسا", tz: "Europe/Paris", utcOffset: 1, method: "mwl", cities: [{ id: "paris", name: "باريس", lat: 48.8566, lng: 2.3522 }] },
  {
    code: "US", name: "الولايات المتحدة", tz: "America/New_York", utcOffset: -5, method: "isna",
    cities: [
      { id: "newyork", name: "نيويورك", lat: 40.7128, lng: -74.0060 },
      { id: "washington", name: "واشنطن", lat: 38.9072, lng: -77.0369 },
    ],
  },
  { code: "US-C", name: "الولايات المتحدة (الوسط)", tz: "America/Chicago", utcOffset: -6, method: "isna", cities: [{ id: "houston", name: "هيوستن", lat: 29.7604, lng: -95.3698 }, { id: "chicago", name: "شيكاغو", lat: 41.8781, lng: -87.6298 }] },
  { code: "CA", name: "كندا", tz: "America/Toronto", utcOffset: -5, method: "isna", cities: [{ id: "toronto", name: "تورنتو", lat: 43.6532, lng: -79.3832 }] },
  { code: "PK", name: "باكستان", tz: "Asia/Karachi", utcOffset: 5, method: "karachi", cities: [{ id: "karachi", name: "كراتشي", lat: 24.8607, lng: 67.0011 }] },
  { code: "MY", name: "ماليزيا", tz: "Asia/Kuala_Lumpur", utcOffset: 8, method: "singapore", cities: [{ id: "kl", name: "كوالالمبور", lat: 3.1390, lng: 101.6869 }] },
  { code: "ID", name: "إندونيسيا", tz: "Asia/Jakarta", utcOffset: 7, method: "singapore", cities: [{ id: "jakarta", name: "جاكرتا", lat: -6.2088, lng: 106.8456 }] },
];

export const DEFAULT_COUNTRY = "SD";
export const DEFAULT_CITY = "hasahisa";

export function findCountry(code?: string | null): PrayerCountry {
  return PRAYER_COUNTRIES.find((c) => c.code === code) ?? PRAYER_COUNTRIES[0];
}

export function findCity(country: PrayerCountry, id?: string | null): PrayerCity {
  return country.cities.find((c) => c.id === id) ?? country.cities[0];
}
