/**
 * لوحات المفاتيح العربية في كثير من أجهزة أندرويد تكتب الأرقام هكذا: ٠١٢٣٤٥٦٧٨٩ (أو الفارسية ۰۱۲…).
 * الخادم والتحقق يعتمدان الأرقام اللاتينية، فنحوّلها قبل أي تصفية مثل replace(/\D/g, "")
 * التي كانت تحذفها بصمت فيبدو للمستخدم أن الأرقام «لا تُكتب».
 */
export function toLatinDigits(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** يحوّل ثم يُبقي الأرقام فقط. */
export function onlyDigits(value: string | null | undefined, max?: number): string {
  const d = toLatinDigits(value).replace(/\D/g, "");
  return max ? d.slice(0, max) : d;
}
