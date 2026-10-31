import pg from "pg";
import { randomBytes } from "node:crypto";
const db = new pg.Client({ connectionString: "postgres://postgres:postgres@127.0.0.1:5432/postgres" }); await db.connect();
const API = "http://127.0.0.1:8080";
let pass = 0, fail = 0; const fails = [];
const check = (name, ok, detail = "") => { ok ? pass++ : (fail++, fails.push(name)); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + String(detail).slice(0, 160) + "]" : ""}`); };
const call = async (method, path, token, body, form) => {
  const headers = token ? { Authorization: "Bearer " + token } : {};
  if (body && !form) headers["Content-Type"] = "application/json";
  const r = await fetch(API + "/api" + path, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
};
let n = 0;
async function makeUser(name, { role = "user", gender = null } = {}) {
  n++;
  const u = await db.query(`INSERT INTO users (name, email, phone, national_id, password_hash, role, gender, neighborhood)
    VALUES ($1,$2,$3,$4,'x',$5,$6,'الشرقي') RETURNING id`, [name, `e2e${n}@t.local`, `0912345${String(n).padStart(3, "0")}`, `NID-${n}-${Date.now()}`, role, gender]);
  const token = randomBytes(16).toString("hex");
  await db.query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [u.rows[0].id, token]);
  return { id: u.rows[0].id, token };
}
const alertCount = async (kind) => Number((await db.query(`SELECT COUNT(*)::int n FROM admin_alerts WHERE kind=$1`, [kind])).rows[0].n);

const male = await makeUser("محمد عثمان", { gender: "male" });
const female = await makeUser("آمنة الطيب", { gender: "female" });
const unset = await makeUser("بدون جنس");
const admin = await makeUser("عاصم", { role: "admin", gender: "male" });
const mod = await makeUser("خالد مشرف", { role: "moderator", gender: "male" });
const merchant = await makeUser("عمر التاجر", { gender: "male" });

// ── 1) every join / request endpoint → 2xx + one admin alert ─────────────────
const P = (i) => `0911${String(100000 + i).slice(-6)}`;
const joins = [
  ["lawyer", "/lawyer-applications", male, { full_name: "أحمد المحامي", phone: P(1), bar_number: "BAR-1", specialties: "عقود", agree_terms: true, device_id: "dev1" }],
  ["institution", "/institution-applications", male, { inst_name: "مخبز النيل", inst_type: "bakery", inst_category: "food", inst_description: "مخبز", inst_address: "السوق", inst_phone: P(2), rep_name: "عمر", rep_title: "مالك", rep_national_id: "123", rep_phone: P(2), selected_services: JSON.stringify(["listing"]), agree_terms: true, contract_accepted: true }],
  ["women_service", "/women/join-request", female, { owner_name: "سلمى", service_type: "salon", phone: P(3), address: "الشرقي", description: "كوفيرة" }],
  ["women_store", "/women/stores/apply", female, { name: "بوتيك سلمى", category: "accessories", owner_name: "سلمى", phone: P(4) }],
  ["men_service", "/men/join-request", male, { owner_name: "حلاق النيل", service_type: "barber", phone: P(5), address: "السوق" }],
  ["occasions", "/occasions/join-request", male, { owner_name: "صالح", shop_name: "صالة الأفراح", phone: P(6) }],
  ["driver", "/transport/drivers/register", male, { name: "سائق", phone: P(7), vehicle_type: "رقشة" }],
  ["partnership", "/external-partnerships/apply", male, { org_name: "منظمة", contact_person: "علي", phone: P(8), agree_terms: true }],
  ["student_reg", "/education/register-student", male, { institution_name: "مدرسة", grade: "الأول", student_name: "طالب", parent_name: "ولي", parent_phone: P(9) }],
  ["student_transfer", "/education/transfer-request", male, { from_institution_name: "أ", to_institution_name: "ب", student_name: "طالب", grade: "الثاني", parent_name: "ولي", parent_phone: P(10), reason: "انتقال إقامة" }],
  ["zawajil", "/zawajil/apply", male, { role: "designer", full_name: "مصمم", phone: P(11) }],
  ["student_union", "/student-union/apply", male, { full_name: "طالب جامعي", national_id: "999", phone: P(12), institution: "جامعة", major: "هندسة", year: "الثالثة", pledge_name: "طالب جامعي" }],
  ["union_partner", "/union-partnership/apply", male, { union_name: "اتحاد", contact_person: "مسؤول", phone: P(13), contract_accepted: true }],
  ["union_manager", "/union-manager/apply", male, { full_name: "مدير", phone: P(14) }],
  ["union_staff", "/union-staff/apply", male, { full_name: "موظف", phone: P(15), role_applied: "سكرتير" }],
  ["community", "/communities/register", male, { name: "جالية", contact_phone: P(16), representative_name: "ممثل" }],
  ["ad", "/ads/request", male, { institution_name: "شركة", title: "إعلان", contact_phone: P(17) }],
  ["travel_agency", "/travel-agencies/apply", male, { agency_name: "وكالة السفر", owner_name: "مالك", contact_name: "مالك", phone: P(18), city: "الحصاحيصا", services: "تذاكر" }],
];
for (const [kind, path, who, body] of joins) {
  const before = await alertCount(kind);
  const r = await call("POST", path, who.token, body);
  const after = await alertCount(kind);
  check(`join ${path} → ${r.status}`, r.status >= 200 && r.status < 300, r.status >= 300 ? r.text : "");
  if (r.status < 300) check(`  alert recorded for ${kind}`, after === before + 1, `${before}→${after}`);
}

// ── 1b) generic join request aliases ────────────────────────────────────────
const aliasCases = [
  ["/join-requests", "general", { request_type: "general", applicant_name: "طلب عام", phone: P(19) }],
  ["/merchants/join-request", "merchant", { applicant_name: "متجر تجريبي", phone: P(20) }],
  ["/merchant/join-request", "merchant", { applicant_name: "متجر بديل", phone: P(21) }],
  ["/transport/driver/join-request", "driver", { name: "سائق تجريبي", phone: P(22) }],
  ["/food/join-request", "food_business", { name: "مشروع طعام", phone: P(23) }],
];
const aliasResults = [];
for (const [path, expectedType, body] of aliasCases) {
  const response = await call("POST", path, male.token, body);
  const stored = (await db.query("SELECT request_type,status,source_endpoint FROM join_requests WHERE phone=$1 ORDER BY id DESC LIMIT 1", [body.phone])).rows[0];
  check("join alias " + path + " stores " + expectedType, response.status === 201 && response.json?.request?.request_type === expectedType && stored?.request_type === expectedType && stored?.status === "pending" && stored?.source_endpoint === path, response.status + " " + stored?.request_type + "/" + stored?.status + "/" + stored?.source_endpoint);
  aliasResults.push(response.json?.request);
}
const duplicatePhone = P(24);
const firstAlias = await call("POST", "/merchants/join-request", male.token, { applicant_name: "طلب متجر مكرر", phone: duplicatePhone });
const secondAlias = await call("POST", "/merchant/join-request", male.token, { applicant_name: "طلب متجر مكرر", phone: duplicatePhone });
const duplicates = (await db.query("SELECT id,status,duplicate_of FROM join_requests WHERE phone=$1 ORDER BY id ASC", [duplicatePhone])).rows;
check("merchant alias marks duplicate safely", firstAlias.status === 201 && secondAlias.status === 201 && secondAlias.json?.duplicate === true && duplicates.length === 2 && duplicates[1].status === "duplicate" && Number(duplicates[1].duplicate_of) === Number(duplicates[0].id));
const contactRequest = aliasResults[1];
const contacted = await call("PATCH", "/admin/join-requests/" + contactRequest?.id, admin.token, { status: "contacted" });
check("valid contacted status accepted", contacted.status === 200 && contacted.json?.status === "contacted", contacted.text.slice(0, 100));

// ── 2) admin alerts feed & access ────────────────────────────────────────────
let r = await call("GET", "/admin/alerts?after=0&limit=100", admin.token);
check("admin sees alerts feed", r.status === 200 && r.json.alerts.length >= 18 && r.json.unread >= 18, `${r.status} ${r.json?.alerts?.length} unread=${r.json?.unread}`);
const latest = r.json?.latest_id;
check("alert has title/body/screen", !!(r.json?.alerts?.[0]?.title && r.json.alerts[0].screen), JSON.stringify(r.json?.alerts?.[0])?.slice(0, 140));
r = await call("GET", "/admin/alerts", male.token); check("normal user blocked from alerts", r.status === 403);
r = await call("GET", "/admin/alerts", mod.token); check("moderator sees alerts", r.status === 200);
r = await call("POST", "/admin/alerts/seen", admin.token, { last_id: latest }); check("mark seen", r.status === 200);
r = await call("GET", "/admin/alerts", admin.token); check("unread reset to 0", r.json?.unread === 0, r.json?.unread);
r = await call("GET", "/admin/alerts", mod.token); check("moderator unread independent", r.json?.unread > 0, r.json?.unread);

// ── 3) admin review: women + generic join requests ──────────────────────────
r = await call("GET", "/admin/women/join-requests", admin.token);
const wj = r.json?.[0];
check("admin lists women join requests (not shadowed)", r.status === 200 && wj?.owner_name === "سلمى", r.text.slice(0, 120));
r = await call("PATCH", `/admin/women/join-requests/${wj?.id}`, admin.token, { status: "approved" }); check("admin approves women join", r.status === 200 && r.json.status === "approved");
r = await call("GET", "/women/join-requests", admin.token); check("legacy admin panel list still works", r.status === 200 && r.json.length >= 1);
r = await call("GET", "/admin/join-requests", admin.token);
const mj = r.json?.requests?.find((x) => x.request_type === "men_service" && x.payload?.service_type === "barber");
check("admin lists men join request", !!mj, r.text.slice(0, 120));
r = await call("PATCH", `/admin/join-requests/${mj?.id}`, admin.token, { status: "approved" }); check("admin approves generic join", r.status === 200 && r.json.status === "approved");
const afterInvalidStatus = await call("PATCH", "/admin/join-requests/" + mj?.id, admin.token, { status: "not_a_status" });
check("invalid join status rejected", afterInvalidStatus.status === 400, afterInvalidStatus.text);
const statusAfterInvalid = (await db.query("SELECT status FROM join_requests WHERE id=$1", [mj?.id])).rows[0]?.status;
check("invalid join status leaves request unchanged", statusAfterInvalid === "approved", statusAfterInvalid);

// ── 4) women corner isolation ───────────────────────────────────────────────
for (const [label, who, expect] of [["guest", null, 401], ["male", male, 403], ["unset gender", unset, 403], ["moderator(male)", mod, 403], ["female", female, 200], ["admin", admin, 200]]) {
  const a = await call("GET", "/women/stores", who?.token);
  const b = await call("GET", "/women-services", who?.token);
  const c = await call("GET", "/stores?women_only=true", who?.token);
  check(`women corner ${label} → ${expect}`, a.status === expect && b.status === expect && c.status === expect, `${a.status}/${b.status}/${c.status} ${a.json?.code || ""}`);
}
r = await call("GET", "/women/stores", male.token); check("male gets WOMEN_ONLY code", r.json?.code === "WOMEN_ONLY");
r = await call("POST", "/women/join-request", male.token, { owner_name: "x", service_type: "salon", phone: "0912" }); check("male cannot submit women join", r.status === 403);

// ── 5) gender lock ──────────────────────────────────────────────────────────
r = await call("PUT", "/auth/profile", male.token, { gender: "female" }); check("male cannot switch to female (profile)", r.status === 403 && r.json?.code === "GENDER_LOCKED");
r = await call("PATCH", "/auth/me/gender", male.token, { gender: "female" }); check("male cannot switch to female (gender route)", r.status === 403);
r = await call("PATCH", "/auth/me/gender", unset.token, { gender: "female" }); check("unset user may set gender once", r.status === 200, r.text);
r = await call("PATCH", "/auth/me/gender", unset.token, { gender: "male" }); check("…but not change it afterwards", r.status === 403);
r = await call("PUT", "/auth/profile", male.token, { name: "محمد عثمان علي" }); check("profile edit without gender still works", r.status === 200, r.text.slice(0, 100));
r = await call("PATCH", `/admin/users/${unset.id}/gender`, admin.token, { gender: "male" }); check("admin can correct gender", r.status === 200);
r = await call("PATCH", `/admin/users/${male.id}/gender`, mod.token, { gender: "female" }); check("moderator cannot change gender", r.status === 403);

// ── 6) stores: register → approve → products → order ───────────────────────
const fd = new FormData(); fd.append("name", "بقالة البركة"); fd.append("type", "grocery"); fd.append("phone", "0912000999"); fd.append("delivery_available", "true"); fd.append("delivery_fee", "500"); fd.append("min_order", "1000");
let before = await alertCount("store");
r = await call("POST", "/store/register", merchant.token, null, fd); check("store register (multipart)", r.status === 201 && r.json.status === "pending", r.text.slice(0, 140));
check("  store alert recorded", (await alertCount("store")) === before + 1);
const storeId = r.json?.id;
r = await call("POST", "/store/register", merchant.token, null, fd); check("duplicate store blocked", r.status === 409);
r = await call("GET", "/store/my", merchant.token); check("merchant sees pending store", r.status === 200 && r.json.status === "pending");
r = await call("GET", "/store/my", male.token); check("no store → 404", r.status === 404);
r = await call("GET", "/stores"); check("pending store hidden publicly", r.status === 200 && !r.json.some((s) => s.id === storeId));
r = await call("GET", "/admin/stores", admin.token); check("admin lists stores", r.status === 200 && r.json.some((s) => s.id === storeId));
r = await call("PATCH", `/admin/stores/${storeId}`, male.token, { status: "active" }); check("non-admin cannot approve", r.status === 403);
r = await call("PATCH", `/admin/stores/${storeId}`, admin.token, { status: "active" }); check("admin approves store", r.status === 200 && r.json.status === "active");
r = await call("POST", "/store/my/categories", merchant.token, { name: "مشروبات" }); check("add category", r.status === 201); const catId = r.json?.id;
const pf = new FormData(); pf.append("name", "عصير"); pf.append("price", "750"); pf.append("category_id", String(catId)); pf.append("is_available", "true");
r = await call("POST", "/store/my/products", merchant.token, null, pf); check("add product (multipart)", r.status === 201 && r.json.price === 750, r.text.slice(0, 120)); const prodId = r.json?.id;
r = await call("GET", "/stores"); check("approved store listed with products", r.json.some((s) => s.id === storeId && s.product_count === 1), JSON.stringify(r.json.find((s) => s.id === storeId))?.slice(0, 120));
r = await call("GET", `/stores/${storeId}`); check("store details", r.status === 200 && r.json.products.length === 1 && r.json.categories.length === 1 && !("owner_id" in r.json.store));
r = await call("POST", `/stores/${storeId}/orders`, male.token, { customer_name: "زبون", customer_phone: "0912777888", customer_address: "الشرقي", items: [{ id: prodId, qty: 2, price: 1 }] });
check("order uses DB price + delivery fee", r.status === 201 && r.json.order.subtotal === 1500 && r.json.order.total === 2000, r.text.slice(0, 160));
const orderId = r.json?.order?.id;
r = await call("POST", `/stores/${storeId}/orders`, male.token, { customer_name: "زبون", customer_phone: "0912777888", items: [{ id: prodId, qty: 1 }] }); check("min order enforced", r.status === 400);
r = await call("GET", "/store/my/orders", merchant.token); check("merchant sees order", r.json?.some((o) => o.id === orderId));
r = await call("PATCH", `/store/my/orders/${orderId}`, merchant.token, { status: "confirmed" }); check("merchant confirms order", r.status === 200 && r.json.status === "confirmed");
r = await call("GET", "/store/my-orders", male.token); check("customer sees order status", r.json?.[0]?.status === "confirmed" && r.json[0].store_name === "بقالة البركة");

// ── 7) travel booking journey (token now sent) ──────────────────────────────
const co = await db.query(`INSERT INTO travel_companies (name, phone, active) VALUES ('شركة الجزيرة','0912',TRUE) RETURNING id`).catch((e) => ({ err: e.message }));
check("travel company seeded", !!co.rows, co.err);
if (co.rows) {
  const rt = await db.query(`INSERT INTO travel_routes (company_id, from_city, to_city, departure_time, price, seats_total, active) VALUES ($1,'الحصاحيصا','الخرطوم','07:30',15000,40,TRUE) RETURNING id`, [co.rows[0].id]).catch((e) => ({ err: e.message }));
  check("travel route seeded", !!rt.rows, rt.err);
  const d = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  before = await alertCount("travel_booking");
  r = await call("POST", "/travel/bookings", male.token, { route_id: rt.rows?.[0]?.id, travel_date: d, passenger_name: "محمد", passenger_phone: "0912", price: 1 });
  check("booking created", r.status === 201 && Number(r.json.price) === 15000 && r.json.user_id === male.id, r.text.slice(0, 140));
  check("  booking alert", (await alertCount("travel_booking")) === before + 1);
  const bid = r.json?.id;
  r = await call("GET", "/travel/bookings", male.token); check("booking appears in my tickets", r.json?.some((b) => b.id === bid));
  r = await call("POST", `/travel/bookings/${bid}/submit-payment`, male.token, { payment_ref: "TXN-1" }); check("payment proof submitted", r.status === 200, r.text);
  check("  payment alert", (await alertCount("travel_payment")) === 1);
  r = await call("GET", `/travel/verify/${(await db.query("SELECT verify_token FROM travel_bookings WHERE id=$1", [bid])).rows[0].verify_token}`); check("ticket QR verify works", r.status === 200, r.text.slice(0, 80));
}

// ── 8) big book upload target ───────────────────────────────────────────────
r = await call("POST", "/curriculum/upload-target", male.token, { file_name: "كتاب.pdf", size: 8 * 1024 * 1024 }); const uploadMaxMb = Number(r.json?.max_file_mb); check("upload-target responds", r.status === 200 && ["blob", "cloudinary"].includes(r.json.provider) && uploadMaxMb > 0, r.text);
r = await call("POST", "/curriculum/upload-target", male.token, { file_name: "x.pdf", size: Math.ceil(uploadMaxMb * 1024 * 1024) + 1 }); check("upload-target rejects above provider limit", r.status === 413, r.status + " " + r.text.slice(0, 100));
r = await call("POST", "/curriculum/upload-signature", male.token, { size: 10 * 1024 * 1024 }); check("Cloudinary signature rejects above raw limit", r.status === 413, r.status + " " + r.text.slice(0, 100));
r = await call("POST", "/curriculum/upload-target", null, { file_name: "x.pdf", size: 1 }); check("upload-target requires login", r.status === 401);
r = await call("GET", "/curriculum/meta"); check("curriculum max matches upload provider", r.status === 200 && Number(r.json?.max_file_mb) === uploadMaxMb, r.status + " " + r.json?.max_file_mb);
r = await call("POST", "/curriculum/books", male.token, { stage: "primary", grade: 1, subject: "الرياضيات", kind: "textbook", title: "كتاب كبير", file_url: "https://abc123.public.blob.vercel-storage.com/curriculum/5/x.pdf", file_size: 50000000, file_format: "pdf" });
check("blob URL accepted as upload", r.status === 201 || r.status === 200, r.text.slice(0, 140));
const src = (await db.query(`SELECT source FROM curriculum_books ORDER BY id DESC LIMIT 1`)).rows[0]?.source; check("  stored as source=upload", src === "upload", src);

console.log(`\n${pass} passed, ${fail} failed`); if (fails.length) console.log("FAILED:", fails.join(" | "));
await db.end();
process.exitCode = fail > 0 ? 1 : 0;
