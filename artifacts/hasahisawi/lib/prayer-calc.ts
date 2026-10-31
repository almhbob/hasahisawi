// حساب مواقيت الصلاة داخل الجهاز (بدون إنترنت) بمكتبة adhan الفلكية.
//
// الأوقات تُعرض بتوقيت المدينة المختارة (منطقتها الزمنية)، وتُجدول الإشعارات
// بتوقيت الجهاز نفسه: إذا اختار مستخدم في الخرطوم مواقيت مكة يرى أوقات مكة،
// ويصله الأذان في اللحظة الصحيحة على ساعة هاتفه.
import {
  CalculationMethod, CalculationParameters, Coordinates, HighLatitudeRule, Madhab, PrayerTimes,
} from "adhan";

export type MethodKey =
  | "egyptian" | "mwl" | "umm_al_qura" | "karachi" | "isna" | "dubai" | "kuwait"
  | "qatar" | "turkey" | "singapore" | "moonsighting" | "morocco";

export const METHOD_OPTIONS: { key: MethodKey; name: string; hint: string }[] = [
  { key: "egyptian", name: "الهيئة المصرية العامة للمساحة", hint: "الفجر 19.5° · العشاء 17.5° — المعتمد في السودان" },
  { key: "umm_al_qura", name: "أم القرى، مكة المكرمة", hint: "الفجر 18.5° · العشاء بعد المغرب بـ 90 دقيقة" },
  { key: "mwl", name: "رابطة العالم الإسلامي", hint: "الفجر 18° · العشاء 17°" },
  { key: "karachi", name: "جامعة العلوم الإسلامية، كراتشي", hint: "الفجر 18° · العشاء 18°" },
  { key: "isna", name: "الجمعية الإسلامية لأمريكا الشمالية", hint: "الفجر 15° · العشاء 15°" },
  { key: "dubai", name: "دبي", hint: "الفجر 18.2° · العشاء 18.2°" },
  { key: "kuwait", name: "الكويت", hint: "الفجر 18° · العشاء 17.5°" },
  { key: "qatar", name: "قطر", hint: "الفجر 18° · العشاء بعد المغرب بـ 90 دقيقة" },
  { key: "turkey", name: "رئاسة الشؤون الدينية التركية", hint: "الفجر 18° · العشاء 17°" },
  { key: "singapore", name: "سنغافورة / ماليزيا / إندونيسيا", hint: "الفجر 20° · العشاء 18°" },
  { key: "moonsighting", name: "لجنة رؤية الهلال (أوروبا)", hint: "مناسب للبلاد ذات خطوط العرض العالية" },
  { key: "morocco", name: "وزارة الأوقاف المغربية", hint: "الفجر 19° · العشاء 17°" },
];

/** الأرقام القديمة المحفوظة في الإعدادات → الطريقة التي كان المستخدم يقصدها.
 *  (كانت القائمة القديمة تعرض «الهيئة المصرية» برقم 3 الذي يعني في الحقيقة رابطة
 *  العالم الإسلامي، فنحترم ما رآه المستخدم واختاره، لا الرقم.) */
export function legacyMethodKey(n: unknown): MethodKey {
  switch (Number(n)) {
    case 3: return "egyptian";
    case 1: return "mwl";
    case 4: return "umm_al_qura";
    case 5: return "karachi";
    case 2: return "isna";
    case 12: return "moonsighting";
    default: return "egyptian";
  }
}

export function isMethodKey(v: unknown): v is MethodKey {
  return METHOD_OPTIONS.some((m) => m.key === v);
}

function params(method: MethodKey): CalculationParameters {
  switch (method) {
    case "egyptian": return CalculationMethod.Egyptian();
    case "mwl": return CalculationMethod.MuslimWorldLeague();
    case "umm_al_qura": return CalculationMethod.UmmAlQura();
    case "karachi": return CalculationMethod.Karachi();
    case "isna": return CalculationMethod.NorthAmerica();
    case "dubai": return CalculationMethod.Dubai();
    case "kuwait": return CalculationMethod.Kuwait();
    case "qatar": return CalculationMethod.Qatar();
    case "turkey": return CalculationMethod.Turkey();
    case "singapore": return CalculationMethod.Singapore();
    case "moonsighting": return CalculationMethod.MoonsightingCommittee();
    case "morocco": {
      const p = CalculationMethod.Other();
      p.fajrAngle = 19;
      p.ishaAngle = 17;
      return p;
    }
  }
}

export const PRAYER_KEYS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
export type PrayerKey = typeof PRAYER_KEYS[number];
export type Timings = Record<PrayerKey, string>;

export type PrayerInput = {
  lat: number;
  lng: number;
  method: MethodKey;
  /** 0 = الجمهور (شافعي/مالكي/حنبلي)، 1 = حنفي */
  school: number;
  /** تعديل يدوي بالدقائق لكل صلاة */
  offsets?: Partial<Record<"Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha", number>>;
  /** المنطقة الزمنية للمدينة (IANA)، مثل Africa/Khartoum */
  tz: string;
  /** احتياطي إذا لم يدعم الجهاز المناطق الزمنية */
  utcOffset?: number;
  date?: Date;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:mm" بتوقيت منطقة زمنية معيّنة. */
export function formatInZone(d: Date, tz: string, fallbackOffsetHours?: number): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).formatToParts(d);
    const h = parts.find((p) => p.type === "hour")?.value;
    const m = parts.find((p) => p.type === "minute")?.value;
    if (h && m) return `${h === "24" ? "00" : h}:${m}`;
  } catch { /* الجهاز لا يدعم المناطق الزمنية */ }
  if (typeof fallbackOffsetHours === "number") {
    const t = new Date(d.getTime() + fallbackOffsetHours * 3600_000);
    return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
  }
  return formatLocal(d);
}

/** "HH:mm" بتوقيت الجهاز. */
export function formatLocal(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** تاريخ اليوم في المدينة (السنة/الشهر/اليوم) — مهم إذا اختلف اليوم بين الجهاز والمدينة. */
function cityCalendarDate(now: Date, tz: string, fallbackOffsetHours?: number): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).formatToParts(now);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    if (y && m && d) return new Date(y, m - 1, d);
  } catch {}
  if (typeof fallbackOffsetHours === "number") {
    const t = new Date(now.getTime() + fallbackOffsetHours * 3600_000);
    return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export type PrayerResult = {
  /** للعرض: بتوقيت المدينة */
  timings: Timings;
  /** للعدّاد والإشعارات: بتوقيت الجهاز */
  deviceTimings: Timings;
  instants: Record<PrayerKey, Date>;
};

export function computePrayerTimes(input: PrayerInput): PrayerResult {
  const coords = new Coordinates(input.lat, input.lng);
  const p = params(input.method);
  p.madhab = input.school === 1 ? Madhab.Hanafi : Madhab.Shafi;
  // خطوط العرض العالية (بريطانيا، كندا…) يغيب فيها الشفق صيفاً
  p.highLatitudeRule = HighLatitudeRule.recommended(coords);
  const o = input.offsets ?? {};
  p.adjustments = {
    fajr: o.Fajr ?? 0, sunrise: 0, dhuhr: o.Dhuhr ?? 0, asr: o.Asr ?? 0, maghrib: o.Maghrib ?? 0, isha: o.Isha ?? 0,
  };
  const day = cityCalendarDate(input.date ?? new Date(), input.tz, input.utcOffset);
  const pt = new PrayerTimes(coords, day, p);
  const instants: Record<PrayerKey, Date> = {
    Fajr: pt.fajr, Sunrise: pt.sunrise, Dhuhr: pt.dhuhr, Asr: pt.asr, Maghrib: pt.maghrib, Isha: pt.isha,
  };
  const timings = {} as Timings;
  const deviceTimings = {} as Timings;
  for (const k of PRAYER_KEYS) {
    timings[k] = formatInZone(instants[k], input.tz, input.utcOffset);
    deviceTimings[k] = formatLocal(instants[k]);
  }
  return { timings, deviceTimings, instants };
}

/** المنطقة الزمنية للجهاز (لخيار «موقعي الحالي»). */
export function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Khartoum"; } catch { return "Africa/Khartoum"; }
}

// ── التاريخ الهجري (التقويم الحسابي، احتياطي إذا لم يتوفر الإنترنت) ─────────
const HIJRI_MONTHS_AR = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
  "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];
const WEEKDAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const GREG_MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function hijriFromDate(date: Date) {
  // تحويل جوليان ← هجري (التقويم الهجري الحسابي)
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const jd = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hm = Math.floor((24 * l) / 709);
  const hd = l - Math.floor((709 * hm) / 24);
  const hy = 30 * n + j - 30;
  return {
    day: String(hd), month: hm, monthName: HIJRI_MONTHS_AR[hm - 1], year: String(hy),
    weekday: WEEKDAYS_AR[date.getDay()],
  };
}

export function gregorianReadable(date: Date) {
  return `${date.getDate()} ${GREG_MONTHS_AR[date.getMonth()]} ${date.getFullYear()}`;
}
