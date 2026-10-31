import pg from "pg";
import { randomBytes } from "node:crypto";

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/postgres",
});
const API = process.env.E2E_API_URL || "http://127.0.0.1:8080";
let passed = 0;
let failed = 0;

const check = (name, ok, detail = "") => {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL  ${name}${detail ? `  [${String(detail).slice(0, 180)}]` : ""}`);
  }
  if (ok) console.log(`PASS  ${name}`);
};

const call = async (method, path, token, body) => {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, json, text };
};

async function makeUser(name) {
  const suffix = randomBytes(6).toString("hex");
  const phoneSuffix = String(parseInt(suffix.slice(0, 7), 16) % 10000000).padStart(7, "0");
  const result = await db.query(
    `INSERT INTO users (name, email, phone, national_id, password_hash, role, neighborhood)
     VALUES ($1,$2,$3,$4,'test-hash','user','الشرقي') RETURNING id`,
    [name, `certificate-e2e-${suffix}@test.local`, `091${phoneSuffix}`, `CERT-${suffix}`],
  );
  const token = randomBytes(24).toString("hex");
  await db.query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [result.rows[0].id, token]);
  return { id: result.rows[0].id, token };
}

let connected = false;
try {
  await db.connect();
  connected = true;
  const owner = await makeUser("E2E certificate owner");
  const other = await makeUser("E2E other user");

  let response = await call("POST", "/profile/me/certificates/import", null, {
    records: [{ title: "Unauthenticated certificate" }],
  });
  check("certificate import requires login", response.status === 401);

  const tooMany = Array.from({ length: 101 }, (_, i) => ({ title: `Certificate ${i}`, issuer: "E2E" }));
  response = await call("POST", "/profile/me/certificates/import", owner.token, { records: tooMany });
  check("certificate import caps each batch at 100", response.status === 400);

  const records = Array.from({ length: 75 }, (_, i) => ({
    title: `Bulk Import E2E Certificate ${i + 1}`,
    issuer: "E2E",
    issued_on: new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10),
    ...(i === 0 ? { expires_on: "2028-01-01" } : {}),
  }));
  response = await call("POST", "/profile/me/certificates/import", owner.token, { records });
  check(
    "all 75 certificates import",
    response.status === 200 && response.json?.inserted === 75 && response.json?.total === 75,
    response.text,
  );

  const saved = await db.query(
    `SELECT title, expires_on, is_public FROM user_certificates WHERE user_id=$1 ORDER BY title`,
    [owner.id],
  );
  check(
    "expiry is stored and imports remain private",
    saved.rows.length === 75 &&
      saved.rows.some((cert) => cert.expires_on === "2028-01-01") &&
      saved.rows.every((cert) => cert.is_public === false),
  );

  response = await call("GET", `/profile/${owner.id}/full`, owner.token);
  check("owner can see private imports", response.status === 200 && response.json?.certificates?.length === 75);

  response = await call("GET", `/profile/${owner.id}/full`, other.token);
  check("other users cannot see private imports", response.status === 200 && response.json?.certificates?.length === 0);

  response = await call("POST", "/profile/me/certificates/import", owner.token, { records });
  check(
    "re-import skips all duplicates",
    response.status === 200 && response.json?.inserted === 0 && response.json?.skipped === 75,
    response.text,
  );

  const overLimit = Array.from({ length: 26 }, (_, i) => ({ title: `Extra Certificate ${i}`, issuer: "E2E" }));
  response = await call("POST", "/profile/me/certificates/import", owner.token, { records: overLimit });
  const count = await db.query(`SELECT COUNT(*)::int AS n FROM user_certificates WHERE user_id=$1`, [owner.id]);
  check(
    "total limit rejects the whole batch",
    response.status === 409 && count.rows[0].n === 75,
    response.text,
  );
} catch (error) {
  failed++;
  console.error("Certificate E2E setup or request failed:", error instanceof Error ? error.message : String(error));
} finally {
  if (connected) await db.end();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
