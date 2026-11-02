// اختبار شامل لمساحة الهلال الأحمر: الصلاحيات، طلب المسعف بالمستندات، الوحدة/الجهة، الاجتماعات،
// الدورات والنتائج، الشهادة المدفوعة (السعر لمدير حصاحيصاوي فقط)، الدفعات، الملف، الحظر وإلغاء البطاقة.
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
  const u = await db.query(`INSERT INTO users (name, email, phone, national_id, password_hash, role) VALUES ($1,$2,$3,$4,'x',$5) RETURNING id`,
    [name, `srcs${tag}@t.local`, `09${tag.slice(-8)}`, `NID-S-${tag}`, role]);
  const token = randomBytes(16).toString("hex");
  await db.query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [u.rows[0].id, token]);
  return { id: u.rows[0].id, token };
}
const DOC = (k) => `https://example.com/${k}-${Date.now()}.jpg`;

const boss = await makeUser("مدير حصاحيصاوي", "admin");
const leaderU = await makeUser("قائد الفريق");
const medic = await makeUser("المسعف");
await call("GET", "/profile/me", medic.token); // يهيئ جداول الملف الشخصي

// ── الانضمام ──
let r = await call("POST", "/srcs/join", medic.token, { desired_role: "paramedic", phone: "0912345678" });
check("paramedic join without docs → 400", r.status === 400, r.text);
const idDoc = DOC("id"), certDoc = DOC("cert");
r = await call("POST", "/srcs/join", medic.token, { desired_role: "paramedic", national_id_no: "1234 5678 90", id_doc_url: idDoc, cert_doc_url: certDoc });
check("paramedic join with docs", r.status === 200 && r.json?.membership?.national_id_no === "1234567890", r.text);
const docs = await db.query(`SELECT kind FROM srcs_member_docs WHERE user_id=$1`, [medic.id]);
check("join docs filed in dossier", docs.rows.length === 2, JSON.stringify(docs.rows));
const pc = await db.query(`SELECT is_public FROM user_certificates WHERE user_id=$1`, [medic.id]).catch(() => ({ rows: [] }));
check("certificate copied privately to Hasahisawi profile", pc.rows.length === 1 && pc.rows[0].is_public === false, JSON.stringify(pc.rows));
r = await call("POST", "/srcs/join", leaderU.token, { desired_role: "volunteer" });
check("volunteer join without docs ok", r.status === 200, r.text);

// ── الصلاحيات ──
r = await call("GET", "/srcs/admin/dashboard", leaderU.token);
check("pending member has no panel → 403", r.status === 403, r.status);
const members = (await call("GET", "/srcs/admin/members", boss.token)).json?.members || [];
const mMedic = members.find((m) => m.user_id === medic.id), mLeader = members.find((m) => m.user_id === leaderU.id);
check("app admin lists members", !!mMedic && !!mLeader, members.length);
r = await call("PATCH", `/srcs/admin/members/${mLeader.id}`, boss.token, { status: "active", role: "leader", perms: ["courses", "results"] });
check("accept leader + grant perms", r.status === 200 && r.json?.member?.perms?.includes("courses"), r.text);
r = await call("GET", "/srcs/admin/dashboard", leaderU.token);
check("leader panel shows role+granted perms", r.status === 200 && ["meetings", "courses", "results"].every((p) => r.json?.perms?.includes(p)) && !r.json?.perms?.includes("certificates"), JSON.stringify(r.json?.perms));
r = await call("PATCH", `/srcs/admin/members/${mMedic.id}`, leaderU.token, { status: "active" });
check("leader without 'requests' cannot accept", r.status === 403, r.status);
r = await call("PATCH", `/srcs/admin/members/${mMedic.id}`, boss.token, { status: "active", role: "paramedic", unit: "فريق الاستجابة السريعة", affiliation: "مستشفى الحصاحيصا" });
check("accept medic with unit + affiliation", r.json?.member?.status === "active" && r.json?.member?.affiliation === "مستشفى الحصاحيصا" && !!r.json?.member?.card_no, r.text);
const verified = await db.query(`SELECT bool_and(verified) v FROM srcs_member_docs WHERE user_id=$1`, [medic.id]);
check("join docs verified on acceptance", verified.rows[0].v === true);
r = await call("PATCH", `/srcs/admin/members/${mMedic.id}`, leaderU.token, { perms: ["certificates"] });
check("only app admin grants perms", r.status === 403, r.status);

// ── الاجتماعات ──
r = await call("POST", "/srcs/admin/meetings", leaderU.token, { title: "اجتماع دوري", starts_at: new Date(Date.now() + 86400000).toISOString() });
check("meeting without place → 400", r.status === 400, r.text);
const st = new Date(Date.now() + 86400000), en = new Date(Date.now() + 90000000);
r = await call("POST", "/srcs/admin/meetings", leaderU.token, { title: "اجتماع دوري", place: "مقر الفرعية", starts_at: st.toISOString(), ends_at: en.toISOString(), audience: "members" });
check("meeting with date/time/place/end", r.status === 200 && r.json?.meeting?.place === "مقر الفرعية" && !!r.json?.meeting?.ends_at, r.text);

// ── الدفعات ──
r = await call("POST", "/srcs/admin/cohorts", boss.token, { name: "دفعة 2026" });
const cohortId = r.json?.cohort?.id;
check("create cohort", !!cohortId, r.text);
r = await call("PATCH", `/srcs/admin/cohorts/${cohortId}`, boss.token, { member_ids: [mMedic.id] });
const co = (await call("GET", "/srcs/admin/cohorts", boss.token)).json?.cohorts?.find((c) => c.id === cohortId);
check("assign member to cohort", co?.members === 1, JSON.stringify(co));

// ── الدورات ──
r = await call("POST", "/srcs/admin/courses", leaderU.token, { title: "الإسعافات الأولية", place: "قاعة التدريب", starts_at: new Date().toISOString(), max_score: 100, pass_mark: 60,
  files: [{ name: "الحقيبة.pdf", url: "https://example.com/kit.pdf", type: "application/pdf" }] });
const courseId = r.json?.course?.id;
check("leader (granted) creates course with file", r.status === 200 && !!courseId, r.text);
r = await call("GET", "/srcs/courses", medic.token);
let c = r.json?.courses?.find((x) => x.id === courseId);
check("files hidden before enrolling", c && c.files.length === 0 && c.files_count === 1, JSON.stringify(c));
r = await call("POST", `/srcs/admin/courses/${courseId}/enroll`, leaderU.token, { cohort_id: cohortId });
check("enroll whole cohort", r.json?.added === 1, r.text);
c = (await call("GET", "/srcs/courses", medic.token)).json?.courses?.find((x) => x.id === courseId);
check("files visible after enrolling", c?.files?.length === 1, JSON.stringify(c?.files));
const enr = (await call("GET", `/srcs/admin/courses/${courseId}/enrollments`, leaderU.token)).json?.enrollments || [];
r = await call("POST", `/srcs/admin/courses/${courseId}/results`, leaderU.token, { rows: [{ id: enr[0].id, score: 85, attended: true }] });
check("save results", r.json?.saved === 1, r.text);
c = (await call("GET", "/srcs/courses", medic.token)).json?.courses?.find((x) => x.id === courseId);
check("score hidden until published", c?.my_score === null, JSON.stringify(c?.my_score));
await call("PATCH", `/srcs/admin/courses/${courseId}`, leaderU.token, { results_published: true });
c = (await call("GET", "/srcs/courses", medic.token)).json?.courses?.find((x) => x.id === courseId);
check("result visible + passed after publishing", Number(c?.my_score) === 85 && c?.my_passed === true, JSON.stringify(c));

// ── الشهادة المدفوعة ──
r = await call("PATCH", "/srcs/admin/settings", leaderU.token, { cert_price: 1 });
check("non app-admin cannot set price", r.status === 403, r.status);
r = await call("PATCH", "/srcs/admin/settings", boss.token, { cert_price: 5000, cert_currency: "SDG", cert_payment_info: "بنكك 123" });
check("app admin sets price", r.json?.cert_price === 5000, r.text);
r = await call("POST", `/srcs/courses/${courseId}/certificate`, medic.token, {});
check("paid cert needs payment proof", r.status === 400, r.text);
r = await call("POST", `/srcs/courses/${courseId}/certificate`, medic.token, { payment_ref: "TX-998877" });
check("cert request pending", r.json?.enrollment?.cert_status === "pending" && Number(r.json?.enrollment?.cert_amount) === 5000, r.text);
r = await call("PATCH", `/srcs/admin/enrollments/${enr[0].id}/certificate`, leaderU.token, { action: "approve" });
check("leader without 'certificates' cannot approve", r.status === 403, r.status);
r = await call("PATCH", `/srcs/admin/enrollments/${enr[0].id}/certificate`, boss.token, { action: "approve" });
check("approve → certificate issued", r.json?.enrollment?.cert_status === "issued" && !!r.json?.enrollment?.cert_token, r.text);
const token = r.json?.enrollment?.cert_token;
const page = await fetch(`${API}/api/public/srcs/cert/${token}`).then((x) => x.text());
check("public certificate page shows holder", page.includes("المسعف") && page.includes("الإسعافات الأولية"));
const prof = await db.query(`SELECT is_public, reviewed, credential_id FROM user_certificates WHERE user_id=$1 AND credential_id IS NOT NULL`, [medic.id]);
check("issued cert published+verified on Hasahisawi profile", prof.rows[0]?.is_public === true && prof.rows[0]?.reviewed === true, JSON.stringify(prof.rows));

// ── الملف ──
r = await call("GET", "/srcs/me/dossier", medic.token);
check("my dossier: docs + certificate", r.json?.docs?.length === 3 && r.json?.enrollments?.[0]?.cert_url, JSON.stringify({ d: r.json?.docs?.length, e: r.json?.enrollments?.length }));
r = await call("GET", `/srcs/admin/members/${mMedic.id}/dossier`, boss.token);
check("admin dossier includes cohort + national id", r.json?.member?.cohort_name === "دفعة 2026" && r.json?.member?.national_id_no === "1234567890", JSON.stringify(r.json?.member));

// ── الحظر وإلغاء البطاقة ──
const cardTok = (await db.query(`SELECT card_token FROM srcs_members WHERE id=$1`, [mMedic.id])).rows[0].card_token;
let v = await fetch(`${API}/api/public/srcs/verify/${cardTok}`).then((x) => x.text());
check("verify page shows unit + affiliation", v.includes("مستشفى الحصاحيصا") && v.includes("بطاقة سارية"));
r = await call("PATCH", `/srcs/admin/members/${mMedic.id}`, leaderU.token, { status: "banned" });
check("leader cannot ban", r.status === 403, r.status);
r = await call("PATCH", `/srcs/admin/members/${mMedic.id}`, boss.token, { status: "banned", revoke_reason: "مخالفة" });
check("app admin bans + revokes card", r.json?.member?.status === "banned" && !!r.json?.member?.revoked_at, r.text);
v = await fetch(`${API}/api/public/srcs/verify/${cardTok}`).then((x) => x.text());
check("verify page shows revoked", v.includes("بطاقة ملغاة"));
r = await call("POST", "/srcs/join", medic.token, { desired_role: "volunteer" });
check("banned cannot rejoin", r.status === 403, r.status);

// ── مسعف ──
r = await call("GET", "/srcs/musif/profile?code=X", null);
check("musif sync requires key", r.status === 401, r.status);

await db.end();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
