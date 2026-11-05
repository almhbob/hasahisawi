// اختبار شامل لاتحاد الطلاب: دخول البوابة بحساب التطبيق، صلاحيات الموظفين، سجل الأعضاء، الأرشيف،
// ونزاهة الانتخابات (سرية الاقتراع، صوت واحد، التجميد، لا عدّ قبل الإغلاق، الإيصالات، السجل العلني).
// يتطلب: API على 127.0.0.1:8080 + Postgres.
import pg from "pg";
import { randomBytes } from "node:crypto";

const API = process.env.API || "http://127.0.0.1:8080";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/postgres" });
await db.connect();
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? "  [" + String(detail).slice(0, 240) + "]" : ""}`); };
const call = async (method, path, token, body) => {
  const r = await fetch(API + "/api" + path, { method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
};
let n = 0;
async function makeUser(name, role = "user") {
  n++;
  const tag = `${Date.now()}${n}`;
  const phone = `09${tag.slice(-8)}`;
  const u = await db.query(`INSERT INTO users (name, email, phone, national_id, password_hash, role) VALUES ($1,$2,$3,$4,'x',$5) RETURNING id`,
    [name, `union${tag}@t.local`, phone, `NID-U-${tag}`, role]);
  const token = randomBytes(16).toString("hex");
  await db.query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [u.rows[0].id, token]);
  return { id: u.rows[0].id, token, phone };
}
const iso = (h) => new Date(Date.now() + h * 3600_000).toISOString();

const boss = await makeUser("مدير التطبيق", "admin");
const staffU = await makeUser("موظف الاتحاد");
const s1 = await makeUser("طالب أول");
const s2 = await makeUser("طالب ثانٍ");
const outsider = await makeUser("غير عضو");

// يهيئ جداول الاتحاد
await call("GET", "/student-union/me", s1.token);
for (const s of [s1, s2]) {
  await db.query(`INSERT INTO student_union_applications (user_id, full_name, national_id, phone, institution, major, year, status, reviewed_at)
    VALUES ($1,$2,$3,$4,'جامعة الجزيرة','هندسة','الثالثة','approved', NOW() - INTERVAL '2 days')`, [s.id, `عضو ${s.id}`, `N${s.id}${Date.now()}`.slice(0, 20), s.phone]);
}

// ── البوابة: الدخول بحساب التطبيق ──
let r = await call("POST", "/union-manager/sso", boss.token);
check("app admin enters portal with app account", r.status === 200 && !!r.json?.token, r.text);
const AT = r.json?.token;
r = await call("POST", "/union-manager/sso", outsider.token);
check("unlinked user refused", r.status === 403, r.status);

// ── الموظفون والصلاحيات ──
r = await call("POST", "/union-manager/staff", AT, { full_name: "موظف", role: "سكرتير", phone: staffU.phone });
check("add staff", r.status === 201, r.text);
const staffId = r.json?.id;
r = await call("POST", "/union-manager/sso", staffU.token);
check("staff enters with app account", r.status === 200 && r.json?.manager?.staff_id === staffId, r.text);
const ST = r.json?.token;
r = await call("POST", "/union-manager/meetings", ST, { title: "x" });
check("staff without perm cannot create meeting", r.status === 403, r.status);

// ── سجل الأعضاء ──
r = await call("GET", "/union-manager/members", ST);
const mem = (r.json?.members || []).find((m) => m.phone === s2.phone);
check("members list with backfilled card", r.status === 200 && !!mem?.member_no, r.text);
r = await call("PATCH", `/union-manager/members/${mem?.id}`, ST, { action: "suspend" });
check("staff without perm cannot suspend", r.status === 403, r.status);
await call("PATCH", `/union-manager/staff/${staffId}/permissions`, AT, { permissions: { can_manage_requests: true } });
r = await call("PATCH", `/union-manager/members/${mem?.id}`, ST, { action: "suspend", note: "اختبار" });
check("granted perm applies immediately", r.status === 200 && r.json?.member?.status === "suspended", r.text);
r = await call("PATCH", `/union-manager/members/${mem?.id}`, ST, { action: "reactivate" });
check("reactivate", r.json?.member?.status === "approved", r.text);
r = await call("GET", "/union-manager/members/export", ST);
check("export needs reports perm", r.status === 403, r.status);
r = await call("GET", "/union-manager/members/export", AT);
check("admin export CSV", r.status === 200 && r.text.includes("رقم العضوية"), r.status);
await call("PATCH", `/union-manager/staff/${staffId}`, AT, { is_active: false });
r = await call("GET", "/union-manager/me", ST);
check("deactivated staff session ends", r.status === 401, r.status);

// ── الأرشيف ──
r = await call("POST", "/union-manager/activities", AT, { title: "ندوة القيادة", category: "seminar", activity_date: "2026-10-01", images: ["https://example.com/a.jpg"], attendees: 40 });
check("create activity", r.status === 201 && r.json?.activity?.cover_url === "https://example.com/a.jpg", r.text);
r = await call("GET", "/union/activities");
check("public archive lists it", r.status === 200 && r.json?.activities?.some((a) => a.title === "ندوة القيادة"), r.text);

// ── الانتخابات ──
r = await call("POST", "/union-manager/elections", AT, { title: "انتخابات اختبار", nominations_start: iso(1), nominations_end: iso(2), voting_start: iso(3), voting_end: iso(6), positions: [{ title: "الرئيس", seats: 1 }, { title: "المكتب", seats: 2 }] });
check("create election", r.status === 201, r.text);
const E = r.json?.election?.id; const [P1, P2] = (r.json?.election?.positions || []).map((p) => p.id);
r = await call("POST", "/union-manager/elections", AT, { title: "مواعيد خاطئة", nominations_start: iso(3), nominations_end: iso(2), voting_start: iso(4), voting_end: iso(6), positions: [{ title: "x1" }] });
check("bad schedule rejected", r.status === 400, r.status);
await call("PATCH", `/union-manager/elections/${E}`, AT, { action: "publish" });
r = await call("DELETE", `/union-manager/elections/${E}`, AT);
check("published election cannot be deleted", r.status === 409, r.status);
await db.query(`UPDATE union_elections SET nominations_start=NOW()-INTERVAL '1 hour' WHERE id=$1`, [E]);
const prog = "برنامج انتخابي يحقق الحد الأدنى من الطول المطلوب للترشح";
r = await call("POST", `/union/elections/${E}/nominate`, s1.token, { position_id: P1, program: prog });
check("member nominates", r.status === 201, r.text);
r = await call("POST", `/union/elections/${E}/nominate`, s1.token, { position_id: P2, program: prog });
check("one candidacy per member", r.status === 409, r.status);
r = await call("POST", `/union/elections/${E}/nominate`, outsider.token, { position_id: P1, program: prog });
check("non-member cannot nominate", r.status === 403, r.status);
const C1 = (await db.query(`SELECT id FROM union_election_candidates WHERE election_id=$1`, [E])).rows[0]?.id;
r = await call("PATCH", `/union-manager/elections/${E}/candidates/${C1}`, AT, { status: "rejected" });
check("rejection requires public reason", r.status === 400, r.status);
await call("PATCH", `/union-manager/elections/${E}/candidates/${C1}`, AT, { status: "approved" });
const m2no = (await db.query(`SELECT member_no FROM student_union_applications WHERE user_id=$1`, [s2.id])).rows[0]?.member_no;
r = await call("POST", `/union-manager/elections/${E}/candidates`, AT, { member_no: m2no, position_id: P2 });
check("presidency adds candidate by member no", r.status === 201, r.text);
const C2 = r.json?.candidate?.id;
r = await call("POST", `/union/elections/${E}/vote`, s1.token, { choices: {} });
check("no voting before window", r.status === 400, r.status);

await db.query(`UPDATE union_elections SET nominations_end=NOW()-INTERVAL '30 min', voting_start=NOW()-INTERVAL '10 min' WHERE id=$1`, [E]);
r = await call("GET", `/union-manager/elections/${E}/tally`, AT);
check("no tally visible during voting (even admin)", r.status === 403, r.status);
r = await call("PATCH", `/union-manager/elections/${E}/candidates/${C1}`, AT, { status: "pending" });
check("candidates frozen once voting starts", r.status === 409, r.status);
r = await call("PATCH", `/union-manager/elections/${E}`, AT, { action: "schedule", nominations_start: iso(-5), nominations_end: iso(-4), voting_start: iso(-3), voting_end: iso(9) });
check("schedule frozen once voting starts", r.status === 409, r.status);
r = await call("POST", `/union/elections/${E}/vote`, s1.token, { choices: { [P1]: [C1, C2] } });
check("over-selection / cross-position rejected", r.status === 400, r.status);
r = await call("POST", `/union/elections/${E}/vote`, s1.token, { choices: { [P1]: [C1], [P2]: [C2] } });
check("valid vote returns receipt", r.status === 201 && /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(r.json?.receipt || ""), r.text);
const receipt = r.json?.receipt;
r = await call("POST", `/union/elections/${E}/vote`, s1.token, { choices: { [P1]: [C1] } });
check("double vote blocked", r.status === 409, r.status);
r = await call("POST", `/union/elections/${E}/vote`, s2.token, { choices: { [P2]: [C2] } });
check("blank ballot for a position allowed", r.status === 201, r.text);
r = await call("POST", `/union/elections/${E}/vote`, outsider.token, { choices: {} });
check("non-member cannot vote", r.status === 403, r.status);
r = await call("POST", `/union/elections/${E}/verify`, null, { receipt });
check("receipt verifies without revealing choice", r.json?.counted === true && !("candidate" in (r.json || {})), r.text);
r = await call("POST", `/union/elections/${E}/verify`, null, { receipt: "AAAA-BBBB-CCCC" });
check("forged receipt not found", r.json?.counted === false, r.text);
const cols = (await db.query(`SELECT string_agg(column_name, ',') AS c FROM information_schema.columns WHERE table_name='union_election_ballots'`)).rows[0].c;
check("ballots table holds no identity or time", !/member|user|created|voted/.test(cols), cols);
r = await call("GET", "/union/elections", s1.token);
const pub = r.json?.elections?.find((e) => e.id === E);
check("during voting: turnout only, no results", pub?.results === null && pub?.me?.voted === true && pub?.turnout?.voters === 2, JSON.stringify(pub?.turnout));

await db.query(`UPDATE union_elections SET voting_end=NOW()-INTERVAL '1 minute' WHERE id=$1`, [E]);
r = await call("GET", `/union-manager/elections/${E}/tally`, AT);
const t = r.json?.tally;
check("tally consistent (voters = receipts)", t?.consistent === true && t?.voters === 2, r.text);
const pres = t?.positions?.find((p) => p.position_id === P1);
check("blank vote counted separately", pres?.valid_votes === 1 && pres?.blank_votes === 1, JSON.stringify(pres));
r = await call("PATCH", `/union-manager/elections/${E}`, AT, { action: "publish_results" });
check("publish results", r.json?.election?.phase === "results", r.text);
r = await call("PATCH", `/union-manager/elections/${E}`, AT, { action: "publish_results" });
check("results cannot be republished", r.status === 400, r.status);
r = await call("GET", `/union/elections/${E}/receipts`);
check("receipt fingerprints public", r.json?.count === 2, r.text);
r = await call("GET", "/union/elections");
const done = r.json?.elections?.find((e) => e.id === E);
check("public log covers every admin action", ["created", "published", "candidate_approved", "candidate_added", "results"].every((a) => done?.log?.some((l) => l.action === a)), JSON.stringify(done?.log?.map((l) => l.action)));

console.log(`\n${pass} passed, ${fail} failed`);
await db.end();
process.exit(fail ? 1 : 0);
