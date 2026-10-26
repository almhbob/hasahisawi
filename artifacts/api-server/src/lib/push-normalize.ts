// ════════════════════════════════════════════════════════════════
// 🔔 توحيد إشعارات Expo من نقطة واحدة: كل طلب إلى خدمة Expo Push يمر من هنا
// — أولوية عالية دائماً (لا يؤخّرها Android في وضع توفير الطاقة)
// — قنوات الجيل الثالث (-s3: تنبيه منبثق بصوت) للأجهزة التي حدّثت التطبيق،
//   وقنوات -s2 للنسخ الأقدم
// — المكالمات: قناة نغمة رنين خاصة
// ════════════════════════════════════════════════════════════════
import { query, dbEnabled } from "./shared-db";
import { logger } from "./logger";

const PUSH_URL = "exp.host/--/api/v2/push/send";
let colReady: Promise<void> | null = null;
export function ensurePushCols(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!colReady) colReady = (async () => {
    await query(`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS channel_ver SMALLINT NOT NULL DEFAULT 2`);
    // عدة أجهزة لكل مستخدم: الرمز فريد لكل جهاز بدلاً من رمز واحد لكل مستخدم
    const hasIdx = await query(`SELECT 1 FROM pg_indexes WHERE tablename='push_tokens' AND indexname='push_tokens_token_uq'`);
    if (!hasIdx.rows.length) {
      await query(`DELETE FROM push_tokens a USING push_tokens b WHERE a.token=b.token AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id < b.id))`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_uq ON push_tokens(token)`);
      await query(`ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_user_id_key`);
    }
  })().catch((e) => { colReady = null; throw e; });
  return colReady;
}

const cache = new Map<string, { v: number; at: number }>();
async function versions(tokens: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const missing: string[] = [];
  const now = Date.now();
  for (const t of tokens) {
    const c = cache.get(t);
    if (c && now - c.at < 120_000) out.set(t, c.v); else missing.push(t);
  }
  if (missing.length && dbEnabled) {
    try {
      await ensurePushCols();
      const r = await query(`SELECT token, MAX(channel_ver)::int AS v FROM push_tokens WHERE token = ANY($1::text[]) GROUP BY token`, [missing]);
      const found = new Map(r.rows.map((x: any) => [String(x.token), Number(x.v) || 2]));
      for (const t of missing) { const v = found.get(t) ?? 2; out.set(t, v); cache.set(t, { v, at: now }); }
    } catch (e: any) { logger.warn({ err: e?.message }, "[push] version lookup failed"); for (const t of missing) out.set(t, 2); }
  }
  return out;
}
export function forgetPushToken(token: string) { cache.delete(token); }

function mapChannel(ch: string | undefined, v3: boolean, isCall: boolean): string {
  if (v3 && isCall) return "hasahisawi-call-s3";
  const base = String(ch || "hasahisawi-default").replace(/-s[23]$/, "");
  if (!base.startsWith("hasahisawi-")) return ch || "hasahisawi-default-s2"; // قنوات خاصة (مثل الأذان) كما هي
  const known = ["hasahisawi-default", "hasahisawi-chat", "hasahisawi-urgent", "hasahisawi-transport", "hasahisawi-prayer", "hasahisawi-call"];
  const b = known.includes(base) ? (base === "hasahisawi-call" && !v3 ? "hasahisawi-urgent" : base) : "hasahisawi-default";
  return `${b}-${v3 ? "s3" : "s2"}`;
}
const SOUND: Record<string, string> = {
  "hasahisawi-default": "hasahisawi_notif", "hasahisawi-chat": "hasahisawi_chat", "hasahisawi-urgent": "hasahisawi_urgent",
  "hasahisawi-transport": "hasahisawi_urgent", "hasahisawi-prayer": "hasahisawi_prayer", "hasahisawi-call": "hasahisawi_ring",
};

export async function normalizePushBody(body: string): Promise<string> {
  const parsed = JSON.parse(body);
  const arr: any[] = Array.isArray(parsed) ? parsed : [parsed];
  const tokens = arr.map((m) => m?.to).filter((t) => typeof t === "string");
  const ver = await versions(tokens);
  for (const m of arr) {
    if (!m || typeof m !== "object") continue;
    const v3 = typeof m.to === "string" && (ver.get(m.to) ?? 2) >= 3;
    const isCall = m.data?.type === "call";
    const ch = mapChannel(m.channelId, v3, isCall);
    m.channelId = ch;
    m.data = { ...(m.data || {}), channelId: ch };
    const s = SOUND[ch.replace(/-s[23]$/, "")];
    if (s) m.sound = s;
    m.priority = "high";
    if (m.ttl === undefined) m.ttl = isCall ? 45 : 60 * 60 * 24;
  }
  return JSON.stringify(Array.isArray(parsed) ? arr : arr[0]);
}

let installed = false;
export function installPushNormalizer() {
  if (installed) return; installed = true;
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "";
      if (url.includes(PUSH_URL) && init && typeof init.body === "string") {
        init = { ...init, body: await normalizePushBody(init.body) };
      }
    } catch (e: any) { logger.warn({ err: e?.message }, "[push] normalize failed"); }
    return orig(input, init);
  }) as typeof fetch;
}
