// ════════════════════════════════════════════════════════════════
// ☁️ Cloudflare R2 — تخزين الملفات الكبيرة بلا رسوم تحميل (توقيع AWS SigV4 بدون مكتبات إضافية)
// المتغيرات: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
// ════════════════════════════════════════════════════════════════
import { createHash, createHmac } from "node:crypto";

const env = (k: string) => (process.env[k] || "").trim();

export function r2Configured(): boolean {
  return !!(env("R2_ACCOUNT_ID") && env("R2_ACCESS_KEY_ID") && env("R2_SECRET_ACCESS_KEY") && env("R2_BUCKET") && env("R2_PUBLIC_URL"));
}

const sha256hex = (d: string | Buffer) => createHash("sha256").update(d).digest("hex");
const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
// ترميز المسار حسب S3: كل الأحرف ما عدا الحروف والأرقام و - _ . ~ و /
const encPath = (p: string) => p.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/");
const encQ = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function signingKey(date: string) {
  const k1 = hmac("AWS4" + env("R2_SECRET_ACCESS_KEY"), date);
  const k2 = hmac(k1, "auto");
  const k3 = hmac(k2, "s3");
  return hmac(k3, "aws4_request");
}

function host() { return `${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`; }

export function r2PublicUrl(key: string) {
  return `${env("R2_PUBLIC_URL").replace(/\/$/, "")}/${encPath(key)}`;
}

/** رابط PUT موقّع يرفع إليه الجهاز مباشرةً (لا يمر الملف عبر الخادم) */
export function r2PresignPut(key: string, expiresSec = 3600): { url: string; public_url: string } {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const path = `/${env("R2_BUCKET")}/${encPath(key)}`;
  const q: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${env("R2_ACCESS_KEY_ID")}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": "host",
  };
  const qs = Object.keys(q).sort().map((k) => `${encQ(k)}=${encQ(q[k])}`).join("&");
  const canonical = ["PUT", path, qs, `host:${host()}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
  const sig = createHmac("sha256", signingKey(date)).update(toSign).digest("hex");
  return { url: `https://${host()}${path}?${qs}&X-Amz-Signature=${sig}`, public_url: r2PublicUrl(key) };
}

async function signedFetch(method: "PUT" | "DELETE", key: string, body?: Buffer, contentType?: string) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const path = `/${env("R2_BUCKET")}/${encPath(key)}`;
  const payloadHash = body ? sha256hex(body) : sha256hex("");
  const headers: Record<string, string> = { host: host(), "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (contentType) headers["content-type"] = contentType;
  const names = Object.keys(headers).sort();
  const canonical = [method, path, "", names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
  const sig = createHmac("sha256", signingKey(date)).update(toSign).digest("hex");
  const auth = `AWS4-HMAC-SHA256 Credential=${env("R2_ACCESS_KEY_ID")}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}`;
  const { host: _h, ...send } = headers;
  const r = await fetch(`https://${host()}${path}`, { method, headers: { ...send, Authorization: auth }, body: body ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(60000) });
  if (!r.ok && !(method === "DELETE" && r.status === 404)) throw new Error(`R2 ${method} ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export async function r2Put(key: string, body: Buffer, contentType: string): Promise<string> {
  await signedFetch("PUT", key, body, contentType);
  return r2PublicUrl(key);
}

/** حذف ملف إن كان رابطه من R2 */
export async function r2DeleteByUrl(url: string | null | undefined) {
  if (!url || !r2Configured()) return;
  const base = env("R2_PUBLIC_URL").replace(/\/$/, "") + "/";
  if (!url.startsWith(base)) return;
  await signedFetch("DELETE", decodeURIComponent(url.slice(base.length).split("?")[0]));
}
