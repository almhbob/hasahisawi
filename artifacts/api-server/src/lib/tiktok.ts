// TikTok Content Posting API (v2) — نشر فيديوهات الحملة على حساب تيك توك صاحب التطبيق.
// الإعداد (متغيرات البيئة في Vercel):
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET  من تطبيقك في developers.tiktok.com
//   TIKTOK_REDIRECT_URI  (اختياري) الافتراضي https://api-server-gilt-ten.vercel.app/api/tiktok/callback
//   TIKTOK_PRIVACY       (اختياري) PUBLIC_TO_EVERYONE افتراضياً. التطبيقات غير المُراجَعة من TikTok
//                        لا تسمح إلا بـ SELF_ONLY، فنستخدمه تلقائياً ونذكر ذلك في النتيجة.
//   TIKTOK_MODE          (اختياري) direct (نشر مباشر، افتراضي) أو inbox (يصل كمسودة في تطبيق تيك توك
//                        لتضيف الموسيقى وتنشر بلمسة).
// الربط مرة واحدة: شغّل workflow «TikTok connect link» (أو /api/tiktok/connect?key=CAMPAIGN_PUSH_KEY)
// وسجّل الدخول بحساب تيك توك. قبل مراجعة التطبيق استخدم مفاتيح Sandbox (تبدأ بـ sb، وليس aw)
// وأضف الحساب في Target users، وإلا يرفض تيك توك الطلب بخطأ unauthorized_client.
// يُحفظ refresh_token (صالح سنة) في قاعدة البيانات ويُجدَّد access_token تلقائياً.
import { randomBytes } from "node:crypto";
import { query } from "./shared-db";

const API = "https://open.tiktokapis.com/v2";
export const TIKTOK_REDIRECT =
  process.env.TIKTOK_REDIRECT_URI || "https://api-server-gilt-ten.vercel.app/api/tiktok/callback";
const SCOPES = "user.info.basic,video.publish,video.upload";

export const tiktokConfigured = () => !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);

let ready: Promise<void> | null = null;
const ensure = () =>
  (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS tiktok_auth (
      id INT PRIMARY KEY DEFAULT 1, open_id TEXT, scope TEXT,
      access_token TEXT, access_expires TIMESTAMPTZ, refresh_token TEXT, refresh_expires TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (id = 1))`);
    await query(`CREATE TABLE IF NOT EXISTS tiktok_oauth_state (
      state TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  })());

export async function tiktokAuthUrl(): Promise<string> {
  await ensure();
  const state = randomBytes(24).toString("hex");
  await query(`DELETE FROM tiktok_oauth_state WHERE created_at < NOW() - INTERVAL '15 minutes'`);
  await query(`INSERT INTO tiktok_oauth_state (state) VALUES ($1)`, [state]);
  const p = new URLSearchParams({
    client_key: (process.env.TIKTOK_CLIENT_KEY || "").trim(),
    scope: SCOPES,
    response_type: "code",
    redirect_uri: TIKTOK_REDIRECT,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
}

async function tokenRequest(params: Record<string, string>) {
  const r = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: (process.env.TIKTOK_CLIENT_KEY || "").trim(),
      client_secret: (process.env.TIKTOK_CLIENT_SECRET || "").trim(),
      ...params,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error || !j.access_token) throw new Error(j.error_description || j.error || `oauth ${r.status}`);
  await query(
    `INSERT INTO tiktok_auth (id, open_id, scope, access_token, access_expires, refresh_token, refresh_expires, updated_at)
     VALUES (1, $1, $2, $3, NOW() + make_interval(secs => $4), $5, NOW() + make_interval(secs => $6), NOW())
     ON CONFLICT (id) DO UPDATE SET open_id=EXCLUDED.open_id, scope=EXCLUDED.scope, access_token=EXCLUDED.access_token,
       access_expires=EXCLUDED.access_expires, refresh_token=EXCLUDED.refresh_token,
       refresh_expires=EXCLUDED.refresh_expires, updated_at=NOW()`,
    [j.open_id, j.scope, j.access_token, Number(j.expires_in) || 86400, j.refresh_token, Number(j.refresh_expires_in) || 31536000],
  );
  return j;
}

export async function tiktokHandleCallback(code: string, state: string) {
  await ensure();
  const s = await query(
    `DELETE FROM tiktok_oauth_state WHERE state=$1 AND created_at > NOW() - INTERVAL '15 minutes' RETURNING state`,
    [state],
  );
  if (!s.rows[0]) throw new Error("invalid or expired state");
  const j = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: TIKTOK_REDIRECT });
  return { open_id: j.open_id, scope: j.scope };
}

async function accessToken(): Promise<string> {
  await ensure();
  const row = (await query(`SELECT * FROM tiktok_auth WHERE id=1`)).rows[0];
  if (!row?.refresh_token) throw new Error("tiktok not connected: open /api/tiktok/connect");
  if (row.access_token && new Date(row.access_expires).getTime() > Date.now() + 10 * 60_000) return row.access_token;
  const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.refresh_token });
  return j.access_token;
}

async function api(path: string, body: unknown) {
  const tok = await accessToken();
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || (j.error && j.error.code && j.error.code !== "ok")) {
    throw new Error(`${j.error?.code || r.status}: ${j.error?.message || "tiktok api"}`);
  }
  return j.data;
}

export async function tiktokStatus() {
  await ensure();
  const row = (await query(`SELECT open_id, scope, access_expires, refresh_expires, updated_at FROM tiktok_auth WHERE id=1`)).rows[0];
  if (!row) return { configured: tiktokConfigured(), connected: false };
  let creator: any = null;
  try { creator = await api("/post/publish/creator_info/query/", {}); } catch (e: any) { creator = { error: e.message }; }
  return { configured: tiktokConfigured(), connected: true, ...row, creator };
}

/** يرفع الفيديو من رابط عام (يُنزَّل في الخادم ثم يُرفع لتيك توك بطريقة FILE_UPLOAD). يعيد publish_id. */
export async function tiktokPostVideo(videoUrl: string, caption: string) {
  const vr = await fetch(videoUrl, { signal: AbortSignal.timeout(30000) });
  if (!vr.ok) throw new Error(`video download ${vr.status}`);
  const buf = Buffer.from(await vr.arrayBuffer());
  const size = buf.length;
  if (size > 60 * 1024 * 1024) throw new Error("video too large for single-chunk upload");
  const source_info = { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 };

  const mode = (process.env.TIKTOK_MODE || "direct").trim().toLowerCase();
  let note: string | undefined;
  let init: any;
  if (mode === "inbox") {
    init = await api("/post/publish/inbox/video/init/", { source_info });
    note = "sent to TikTok inbox as a draft";
  } else {
    const creator = await api("/post/publish/creator_info/query/", {});
    const opts: string[] = creator?.privacy_level_options || [];
    const want = process.env.TIKTOK_PRIVACY || "PUBLIC_TO_EVERYONE";
    const privacy = opts.includes(want) ? want : opts.includes("SELF_ONLY") ? "SELF_ONLY" : opts[0];
    if (!privacy) throw new Error("no privacy options returned by TikTok");
    if (privacy !== want) note = `posted as ${privacy} (TikTok app not audited yet)`;
    init = await api("/post/publish/video/init/", {
      post_info: {
        title: caption.slice(0, 2200),
        privacy_level: privacy,
        disable_duet: false,
        disable_stitch: false,
        disable_comment: !!creator?.comment_disabled,
        video_cover_timestamp_ms: 3000,
      },
      source_info,
    });
  }
  const put = await fetch(init.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: buf,
    signal: AbortSignal.timeout(60000),
  });
  if (!put.ok) throw new Error(`upload ${put.status}: ${(await put.text().catch(() => "")).slice(0, 200)}`);
  return { publish_id: init.publish_id as string, note };
}

/** حالة منشور سابق: PROCESSING_UPLOAD | PROCESSING_DOWNLOAD | SEND_TO_USER_INBOX | PUBLISH_COMPLETE | FAILED */
export async function tiktokPublishStatus(publish_id: string) {
  const d = await api("/post/publish/status/fetch/", { publish_id });
  return { status: d?.status as string, fail_reason: d?.fail_reason as string | undefined };
}
