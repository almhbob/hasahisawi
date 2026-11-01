// اختبار شامل للمكالمة الصوتية: مستخدمان حقيقيان ومحادثة بينهما، المتصل يبدأ، المستقبِل يرد،
// ثم صفحة WebRTC الفعلية (/api/calls/page) تعمل في متصفحين بميكروفون وهمي حتى يتصلا ويتبادلا الصوت.
// يتطلب: API على 127.0.0.1:8080 + Postgres محلي + Playwright (chromium).
import pg from "pg";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";

const API = process.env.API || "http://127.0.0.1:8080";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/postgres" });
await db.connect();
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + String(detail).slice(0, 200) + "]" : ""}`); };
const call = async (method, path, token, body) => {
  const r = await fetch(API + "/api" + path, { method, headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
};
let n = 0;
async function makeUser(name) {
  n++;
  const tag = `${Date.now()}${n}`;
  const u = await db.query(`INSERT INTO users (name, email, phone, national_id, password_hash, role) VALUES ($1,$2,$3,$4,'x','user') RETURNING id`,
    [name, `call${tag}@t.local`, `09${tag.slice(-8)}`, `NID-C-${tag}`]);
  const token = randomBytes(16).toString("hex");
  await db.query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [u.rows[0].id, token]);
  return { id: u.rows[0].id, token };
}

const a = await makeUser("المتصل");
const b = await makeUser("المستقبِل");
const chat = await call("POST", "/chats", a.token, { other_user_id: b.id });
check("create chat", chat.status < 300 && chat.json?.id, chat.text);

const start = await call("POST", "/calls", a.token, { chat_id: chat.json.id });
check("caller starts call → ringing", start.status < 300 && start.json?.call?.status === "ringing", start.text);
const callId = start.json?.call?.id;
check("ICE servers returned", Array.isArray(start.json?.ice) && start.json.ice.length > 0, JSON.stringify(start.json?.ice?.map?.((s) => s.urls)));

const inc = await call("GET", "/calls/incoming", b.token);
check("callee sees incoming call", inc.json?.call?.id === callId, inc.text);
const third = await makeUser("دخيل");
const peek = await call("GET", `/calls/${callId}`, third.token);
check("outsider cannot read the call", peek.status === 403 || peek.status === 404, peek.status);

const acc = await call("POST", `/calls/${callId}/accept`, b.token, {});
check("callee accepts → accepted", acc.json?.call?.status === "accepted", acc.text);

// ── WebRTC حقيقي في متصفحين ──
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
async function peer(user, role) {
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  const msgs = [];
  await page.exposeFunction("__rn", (m) => { try { msgs.push(JSON.parse(m)); } catch { msgs.push(m); } });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (m) => window.__rn(m) }; });
  await page.goto(API + "/api/calls/page");
  // كما يفعل التطبيق: window.__CALL ثم __boot()
  await page.evaluate((cfg) => { window.__CALL = cfg; window.__boot && window.__boot(); }, { api: API, token: user.token, callId, role, ice: [] });
  return { page, msgs };
}
const caller = await peer(a, "caller");
const callee = await peer(b, "callee");
const connected = (p) => p.msgs.some((m) => m?.type === "conn" && m.state === "connected");
const t0 = Date.now();
while (Date.now() - t0 < 30000 && !(connected(caller) && connected(callee))) await new Promise((r) => setTimeout(r, 300));
const brief = (p) => JSON.stringify(p.msgs.filter((m) => m?.type !== "status").slice(-8));
check("caller WebRTC connected", connected(caller), brief(caller));
check("callee WebRTC connected", connected(callee), brief(callee));

// صوت فعلي يصل: نقرأ إحصاءات المستقبِل
await new Promise((r) => setTimeout(r, 2500));
const remotePlaying = await callee.page.evaluate(() => { const el = document.getElementById("remote"); return !!(el && el.srcObject && el.srcObject.getAudioTracks().some((t) => t.readyState === "live")); });
check("callee receives a live remote audio track", remotePlaying);
const remotePlaying2 = await caller.page.evaluate(() => { const el = document.getElementById("remote"); return !!(el && el.srcObject && el.srcObject.getAudioTracks().some((t) => t.readyState === "live")); });
check("caller receives a live remote audio track", remotePlaying2);

// إنهاء
const end = await call("POST", `/calls/${callId}/end`, a.token, {});
check("end call", end.status < 300, end.text);
const after = await call("GET", `/calls/${callId}`, b.token);
check("call marked ended", after.json?.call?.status === "ended", after.text);
const logs = await db.query(`SELECT role, event, detail FROM voice_call_events WHERE call_id=$1 ORDER BY id`, [callId]).catch(() => ({ rows: [] }));
if (logs.rows.length) console.log("call log:", logs.rows.map((r) => `${r.role}:${r.event}${r.detail ? "(" + r.detail + ")" : ""}`).join(" | "));

await browser.close(); await db.end();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
