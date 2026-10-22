// يمنح GitHub Actions (هذا المستودع فقط، فرع master) رمز وصول قصير العمر لـ Google Play
// باستخدام حساب الخدمة الموجود أصلاً في الخادم — بدون نسخ أي مفتاح سرّي إلى GitHub.
// التحقق يتم عبر رمز OIDC الموقّع من GitHub (لا يمكن تزويره من خارج سير العمل).
import { Router } from "express";
import { createPublicKey, createSign, verify as cryptoVerify } from "node:crypto";
import { logger } from "../lib/logger";

const GH_ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "hasahisawi-play";
const REPO = "almhbob/hasahisawi";
const ALLOWED_REFS = ["refs/heads/master", "refs/heads/main"];
const PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

let jwksCache: { at: number; keys: any[] } | null = null;
async function githubKeys(force = false) {
  if (!force && jwksCache && Date.now() - jwksCache.at < 10 * 60_000) return jwksCache.keys;
  const r = await fetch(`${GH_ISSUER}/.well-known/jwks`);
  if (!r.ok) throw new Error("jwks_fetch_failed");
  const j: any = await r.json();
  jwksCache = { at: Date.now(), keys: j.keys || [] };
  return jwksCache.keys;
}

async function verifyGithubOidc(token: string): Promise<Record<string, any>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed");
  const header = JSON.parse(fromB64url(parts[0]).toString("utf8"));
  if (header.alg !== "RS256") throw new Error("alg");
  let jwk = (await githubKeys()).find((k: any) => k.kid === header.kid);
  if (!jwk) jwk = (await githubKeys(true)).find((k: any) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown_kid");
  const ok = cryptoVerify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), fromB64url(parts[2]));
  if (!ok) throw new Error("bad_signature");
  const claims = JSON.parse(fromB64url(parts[1]).toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== GH_ISSUER) throw new Error("iss");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(AUDIENCE)) throw new Error("aud");
  if (typeof claims.exp !== "number" || claims.exp < now - 30) throw new Error("expired");
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) throw new Error("nbf");
  if (claims.repository !== REPO) throw new Error("repository");
  if (!ALLOWED_REFS.includes(claims.ref)) throw new Error("ref");
  if (claims.event_name === "pull_request" || claims.event_name === "pull_request_target") throw new Error("event");
  return claims;
}

async function playAccessToken(): Promise<{ access_token: string; expires_in: number; client_email: string }> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("service_account_missing");
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: sa.private_key_id }));
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope: PLAY_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${body}`);
  const assertion = `${head}.${body}.${b64url(signer.sign(sa.private_key))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`oauth_failed:${j.error || r.status}`);
  return { access_token: j.access_token, expires_in: j.expires_in || 3600, client_email: sa.client_email };
}

const router = Router();

// POST /api/ci/play-token   Authorization: Bearer <GitHub OIDC token, audience hasahisawi-play>
router.post("/ci/play-token", async (req, res) => {
  const auth = String(req.headers.authorization || "");
  const tok = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!tok) return res.status(401).json({ error: "missing_token" });
  let claims: Record<string, any>;
  try { claims = await verifyGithubOidc(tok); }
  catch (e: any) {
    logger.warn({ reason: e?.message }, "ci/play-token rejected");
    return res.status(403).json({ error: "forbidden", reason: e?.message });
  }
  try {
    const t = await playAccessToken();
    logger.info({ run: claims.run_id, workflow: claims.workflow, sa: t.client_email }, "ci/play-token issued");
    return res.json(t);
  } catch (e: any) {
    logger.error({ err: e?.message }, "ci/play-token failed");
    return res.status(500).json({ error: e?.message || "token_failed" });
  }
});

export default router;
