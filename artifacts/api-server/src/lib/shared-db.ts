// Small shared DB + session helper for the newer route modules
// (admin alerts, stores, access guards). Keeps its own small pool.
import type { Request } from "express";
import { Pool } from "pg";
import { logger } from "./logger";
import { stripSslParams } from "./pg-url";
import { verifyIdToken } from "./firebase-admin";

const dbUrl = process.env.DATABASE_URL ?? "";
const enabled = dbUrl.length > 0 && !dbUrl.includes(".invalid") && !dbUrl.includes("placeholder") && !dbUrl.includes("nodb");

const pool: Pool | null = enabled
  ? new Pool({
      connectionString: stripSslParams(dbUrl),
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
      max: 6,
      ssl: dbUrl.includes("sslmode=require") || dbUrl.includes("ssl=true") ? { rejectUnauthorized: false } : false,
    })
  : null;
pool?.on("error", (err) => logger.error({ err }, "shared-db pool error"));

export const dbEnabled = !!pool;

export async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const c = await pool.connect();
  try { return await c.query(sql, params); } finally { c.release(); }
}

export type SessionUser = {
  id: number; name: string; role: string; gender: string | null;
  phone: string | null; email: string | null; is_banned: boolean | null;
};

/** Resolve the caller from a backend session token (or a Firebase ID token). */
export async function sessionUser(req: Request): Promise<SessionUser | null> {
  if (!pool) return null;
  const auth = String(req.headers.authorization || "");
  const tok = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!tok) return null;
  try {
    const r = await query(
      `SELECT u.id,u.name,u.role,u.gender,u.phone,u.email,u.is_banned FROM users u
       JOIN user_sessions s ON s.user_id=u.id WHERE s.token=$1 AND s.expires_at>NOW() LIMIT 1`, [tok]);
    if (r.rows[0]) return r.rows[0];
    if (tok.split(".").length === 3 && tok.startsWith("eyJ")) {
      const decoded = await verifyIdToken(tok).catch(() => null);
      if (decoded?.uid) {
        const f = await query(`SELECT id,name,role,gender,phone,email,is_banned FROM users WHERE firebase_uid=$1 LIMIT 1`, [decoded.uid]);
        if (f.rows[0]) return f.rows[0];
      }
    }
  } catch (err) { logger.warn({ err }, "sessionUser failed"); }
  return null;
}

export function isStaff(u: SessionUser | null): boolean {
  return !!u && (u.role === "admin" || u.role === "moderator");
}

export function normalizeGender(v: unknown): "male" | "female" | null {
  const g = String(v ?? "").trim().toLowerCase();
  if (["male", "m", "man", "ذكر", "رجل"].includes(g)) return "male";
  if (["female", "f", "woman", "أنثى", "انثى", "امرأة", "امراة"].includes(g)) return "female";
  return null;
}
