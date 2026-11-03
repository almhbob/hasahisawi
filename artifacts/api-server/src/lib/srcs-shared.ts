// أدوات مشتركة لمساحة الهلال الأحمر: الملفات الخاصة (هوية/إشعارات دفع) بروابط موقّعة قصيرة العمر،
// سجل التدقيق، وروابط التصدير الموقّعة.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { query } from "./shared-db";
import { logger } from "./logger";

const API_BASE = (process.env.PUBLIC_API_BASE || "https://api-server-gilt-ten.vercel.app").replace(/\/$/, "");
const SECRET = process.env.SRCS_FILE_SECRET
  || createHash("sha256").update(`srcs-files:${process.env.DATABASE_URL || "dev"}`).digest("hex");

export const PRIV_PREFIX = "priv:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const privId = (ref: unknown): string | null => {
  const s = String(ref ?? "");
  if (!s.startsWith(PRIV_PREFIX)) return null;
  const id = s.slice(PRIV_PREFIX.length).toLowerCase();
  return UUID.test(id) ? id : null;
};

export function sign(payload: string, ttlSec: number): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return { exp, sig: createHmac("sha256", SECRET).update(`${payload}|${exp}`).digest("hex").slice(0, 40) };
}
export function verifySig(payload: string, exp: unknown, sig: unknown): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Math.floor(Date.now() / 1000)) return false;
  const want = createHmac("sha256", SECRET).update(`${payload}|${e}`).digest("hex").slice(0, 40);
  const got = String(sig ?? "");
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** يحوّل مرجع ملف خاص إلى رابط موقّع صالح 30 دقيقة؛ والروابط العادية تبقى كما هي */
export function exposeUrl(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const id = privId(v);
  if (!id) return String(v);
  const { exp, sig } = sign(`file:${id}`, 30 * 60);
  return `${API_BASE}/api/public/srcs/pfile/${id}?exp=${exp}&sig=${sig}`;
}
const PRIV_FIELDS = ["id_doc_url", "cert_doc_url", "payment_proof_url", "url"];
export function exposeRow<T extends Record<string, any>>(row: T | null | undefined): T | null {
  if (!row) return row ?? null;
  const o: any = { ...row };
  for (const f of PRIV_FIELDS) if (f in o) { o[`${f}_private`] = !!privId(o[f]); o[f] = exposeUrl(o[f]); }
  return o;
}
export const exposeRows = <T extends Record<string, any>>(rows: T[]) => rows.map((r) => exposeRow(r) as T);

/** يقبل رابط https عادياً، أو مرجعاً خاصاً يملكه المستخدم نفسه */
export async function acceptDocRef(v: unknown, ownerId: number): Promise<string | null> {
  const s = String(v ?? "").trim();
  const id = privId(s);
  if (id) {
    const r = await query(`SELECT 1 FROM srcs_private_files WHERE id=$1 AND owner_id=$2`, [id, ownerId]).catch(() => ({ rows: [] as any[] }));
    return r.rows[0] ? `${PRIV_PREFIX}${id}` : null;
  }
  return /^https:\/\//.test(s) ? s.slice(0, 600) : null;
}

/** سجل التدقيق: من فعل ماذا ولمن ومتى */
export async function audit(actorId: number | null, action: string, target: string, detail: Record<string, unknown> = {}, unitId: number | null = null) {
  try {
    await query(`INSERT INTO srcs_audit (actor_id, action, target, detail, unit_id) VALUES ($1,$2,$3,$4,$5)`,
      [actorId, action.slice(0, 60), target.slice(0, 200), JSON.stringify(detail), unitId ? Number(unitId) : null]);
  } catch (err) { logger.warn({ err }, "[srcs] audit"); }
}

/** نطاق التصدير موقّع داخل الرابط: "all" أو وحدات "3.7" (0 = العام للفرع) — فلا يمكن توسيعه بتعديل الرابط */
export function exportUrl(kind: string, id: number | null, format: "csv" | "html", scope = "all") {
  const payload = `export:${kind}:${id ?? 0}:${scope}`;
  const { exp, sig } = sign(payload, 15 * 60);
  return `${API_BASE}/api/public/srcs/export?kind=${encodeURIComponent(kind)}&id=${id ?? 0}&scope=${encodeURIComponent(scope)}&format=${format}&exp=${exp}&sig=${sig}`;
}
