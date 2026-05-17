import { readFileSync, writeFileSync } from 'node:fs';

const file = 'artifacts/api-server/src/routes/hasahisawi.ts';
let src = readFileSync(file, 'utf8');

const helper = `
function isValidBcryptHashForLogin(value: unknown): value is string {
  return typeof value === "string" && /^\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}$/.test(value);
}
`;

if (!src.includes('function isValidBcryptHashForLogin')) {
  src = src.replace('function safeCompare(a: string, b: string): boolean {', helper + '\nfunction safeCompare(a: string, b: string): boolean {');
}

const oldBlock = `    // مستخدم سجّل عبر Google/Firebase فقط — لا كلمة مرور مستقلة
    if (user.firebase_uid && !user.password_hash) {
      return res.status(401).json({ error: "هذا الحساب مرتبط بـ Google. يرجى تسجيل الدخول عبر زر Google." });
    }
    const valid = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) {
      // لا توجد كلمة مرور مطلقاً — الحساب Firebase/Google فقط
      if (!user.password_hash) {
        return res.status(401).json({ error: "هذا الحساب مرتبط بـ Google. يرجى تسجيل الدخول عبر زر Google." });
      }
      return res.status(401).json({ error: "بيانات غير صحيحة" });
    }`;

const newBlock = `    // مستخدم تم إنشاؤه/استيراده من Firebase أو Google بلا hash صالح لـ bcrypt.
    // لا نمرر قيماً مثل firebase_only_account إلى bcrypt.compare حتى لا يرمي Server error.
    if (!isValidBcryptHashForLogin(user.password_hash)) {
      return res.status(401).json({
        error: user.firebase_uid
          ? "هذا الحساب مرتبط بـ Google/Firebase. استخدم زر Google أو أعد تعيين كلمة المرور."
          : "هذا الحساب يحتاج إعادة تعيين كلمة المرور قبل الدخول."
      });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "بيانات غير صحيحة" });
    }`;

if (!src.includes(newBlock)) {
  if (!src.includes(oldBlock)) {
    throw new Error('Expected login bcrypt block was not found');
  }
  src = src.replace(oldBlock, newBlock);
}

writeFileSync(file, src);
console.log('Patched auth login to avoid Server error for Firebase-only accounts.');
