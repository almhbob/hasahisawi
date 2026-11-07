// قفل مؤقت بعد محاولات دخول خاطئة متتالية — يحمي الحسابات من التخمين ويُبلغ المستخدم بوضوح.
//  • 3 محاولات خاطئة ← انتظار 30 ثانية، ثم يتضاعف مع كل قفل جديد: 1 د، 2 د، 5 د، 15 د (حد أقصى).
//  • الدخول الصحيح يمسح السجل، والسجل الخامل 30 دقيقة يُنسى.
//  • المفتاح هو المعرّف (الهاتف/البريد/اسم المستخدم) بعد توحيده — فلا يفيد تغيير الجهاز أو الشبكة.
import type { Response } from "express";
import { query } from "./shared-db";

export const MAX_ATTEMPTS = 3;
const STEPS = [30, 60, 120, 300, 900];
const IDLE_RESET_MIN = 30;

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  return (ready ??= query(`CREATE TABLE IF NOT EXISTS login_attempts (
      key VARCHAR(200) PRIMARY KEY,
      fails INTEGER NOT NULL DEFAULT 0,
      locks INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).then(() => undefined).catch((e) => { ready = null; throw e; }));
}

export function lockKey(scope: string, identifier: unknown): string {
  const v = String(identifier ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim().toLowerCase();
  const digits = v.replace(/\D/g, "");
  // الهواتف بآخر 9 أرقام حتى يُعدّ 0912… و+249912… حساباً واحداً
  const id = !v.includes("@") && digits.length >= 9 ? digits.slice(-9) : v;
  return `${scope}:${id}`.slice(0, 200);
}

/** إن كان مقفلاً يُرسل 429 ويُرجع true */
export async function rejectIfLocked(res: Response, key: string): Promise<boolean> {
  try {
    await ensure();
    const r = await query(
      `SELECT CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())))::int AS wait FROM login_attempts WHERE key=$1 AND locked_until > NOW()`,
      [key]);
    const wait = r.rows[0]?.wait;
    if (wait > 0) {
      res.status(429).json({ error: lockedMessage(wait), locked: true, retry_after: wait, attempts_left: 0 });
      return true;
    }
  } catch { /* لا نمنع الدخول إن تعذّر جدول القفل */ }
  return false;
}

/** يسجّل محاولة خاطئة ويُرجع ما يُرسل للمستخدم */
export async function registerFailure(key: string): Promise<{ attempts_left: number; retry_after?: number }> {
  try {
    await ensure();
    const r = await query(
      `INSERT INTO login_attempts (key, fails, updated_at) VALUES ($1, 1, NOW())
       ON CONFLICT (key) DO UPDATE SET
         fails = CASE WHEN login_attempts.updated_at < NOW() - ($2 || ' minutes')::interval THEN 1 ELSE login_attempts.fails + 1 END,
         locks = CASE WHEN login_attempts.updated_at < NOW() - ($2 || ' minutes')::interval THEN 0 ELSE login_attempts.locks END,
         updated_at = NOW()
       RETURNING fails, locks`,
      [key, String(IDLE_RESET_MIN)]);
    const { fails, locks } = r.rows[0];
    if (fails >= MAX_ATTEMPTS) {
      const wait = STEPS[Math.min(locks, STEPS.length - 1)];
      await query(`UPDATE login_attempts SET fails=0, locks=locks+1, locked_until=NOW() + ($2 || ' seconds')::interval WHERE key=$1`, [key, String(wait)]);
      return { attempts_left: 0, retry_after: wait };
    }
    return { attempts_left: MAX_ATTEMPTS - fails };
  } catch {
    return { attempts_left: MAX_ATTEMPTS };
  }
}

export async function clearFailures(key: string): Promise<void> {
  try { await query(`DELETE FROM login_attempts WHERE key=$1`, [key]); } catch { /* */ }
}

export function lockedMessage(wait: number): string {
  const m = Math.floor(wait / 60), s = wait % 60;
  const t = m ? `${m} دقيقة${s ? ` و${s} ثانية` : ""}` : `${s} ثانية`;
  return `تم إيقاف المحاولات مؤقتاً لحماية حسابك بعد ${MAX_ATTEMPTS} محاولات خاطئة. أعد المحاولة بعد ${t}.`;
}

/** ردّ موحّد لمحاولة خاطئة */
export async function failResponse(res: Response, key: string, error: string) {
  const f = await registerFailure(key);
  if (f.retry_after) return res.status(429).json({ error: lockedMessage(f.retry_after), locked: true, retry_after: f.retry_after, attempts_left: 0 });
  const hint = f.attempts_left === 1 ? "تبقّت محاولة واحدة قبل الإيقاف المؤقت." : `تبقّت ${f.attempts_left} محاولات.`;
  return res.status(401).json({ error: `${error} ${hint}`, attempts_left: f.attempts_left });
}
