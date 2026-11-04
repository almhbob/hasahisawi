// ════════════════════════════════════════════════════════════════
// أدوات الإدارة (role = admin فقط):
//  • بحث المستخدمين بالاسم أو الهاتف (لربط المالكين والمسؤولين).
//  • اعتماد طلب انضمام مؤسسة (/org-join): ينشئ صفحة منظمة مجتمع مدني ويربط
//    مقدّم الطلب مسؤولاً عنها — idempotent عبر institution_applications.created_org_id.
//  • إدارة الاستمارات القانونية الجاهزة (legal_forms): إنشاء/تعديل/حذف/نشر.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { writeLimiter } from "../lib/rate-limiters";
import { query, sessionUser, type SessionUser } from "../lib/shared-db";
import { ensureOrgActivitiesDb } from "./org-activities";

const router = Router();

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const idParam = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const fail = (res: Response, err: unknown, tag: string) => {
  logger.error({ err }, `[admin-ops] ${tag}`);
  return res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقاً" });
};

async function requireAdmin(req: Request, res: Response): Promise<SessionUser | null> {
  const u = await sessionUser(req);
  if (!u || u.role !== "admin" || u.is_banned) { res.status(403).json({ error: "غير مصرح" }); return null; }
  return u;
}

async function notifyUser(userId: number, type: string, title: string, body: string, data: Record<string, unknown>) {
  await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(data)]).catch((e) => logger.warn({ err: e?.message }, "[admin-ops] notify insert"));
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id=$1 AND token LIKE 'ExponentPushToken[%'`, [userId]);
    if (!rows.length) return;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
      body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title, body, sound: "default", data: { ...data, type } }))),
    }).catch(() => {});
  } catch (e: any) { logger.warn({ err: e?.message }, "[admin-ops] push"); }
}

let ready: Promise<void> | null = null;
function ensureAdminOpsDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS created_org_id INTEGER`).catch(() => {});
    for (const def of [
      "body_text TEXT NOT NULL DEFAULT ''",
      "file_url TEXT",
      "is_published BOOLEAN NOT NULL DEFAULT TRUE",
      "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    ]) await query(`ALTER TABLE legal_forms ADD COLUMN IF NOT EXISTS ${def}`).catch(() => {});
  })().catch((e) => { ready = null; throw e; }));
}

// ════════════════ بحث المستخدمين ════════════════
router.get("/admin/users/search", async (req: Request, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const q = str(req.query.q, 60);
    if (q.length < 2) return res.json({ users: [] });
    const digits = q.replace(/\D/g, "");
    const { rows } = await query(
      `SELECT id, name, phone, avatar_url FROM users
        WHERE COALESCE(is_banned,false)=false
          AND (name ILIKE $1 OR id::text=$2
               OR ($3 <> '' AND regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%' || $3 || '%'))
        ORDER BY (id::text=$2) DESC, name LIMIT 20`,
      [`%${q.replace(/[%_\\]/g, "")}%`, q, digits.length >= 4 ? digits : ""]);
    return res.json({ users: rows });
  } catch (err) { return fail(res, err, "user search"); }
});

// ════════════════ اعتماد طلب انضمام مؤسسة → منظمة ════════════════
type OrgType = "charity" | "initiative" | "cooperative" | "volunteer";
const ORG_TYPES: OrgType[] = ["charity", "initiative", "cooperative", "volunteer"];
const ORG_TYPE_LABEL: Record<OrgType, string> = { charity: "جمعية خيرية", initiative: "مبادرة", cooperative: "جمعية تعاونية", volunteer: "فريق تطوعي" };
// فئات الطلب التي تُعدّ مجتمعاً مدنياً حين يكون النوع «أخرى»
const CIVIL_CATEGORIES = ["العمل الخيري والاجتماعي", "الخدمات المجتمعية"];

/** يحدّد نوع المنظمة من بيانات الطلب، أو null إن لم تكن منظمة مجتمع مدني (مستشفى، متجر، مدرسة…). */
export function mapApplicationToOrgType(app: { inst_type?: string | null; inst_category?: string | null; inst_name?: string | null }): OrgType | null {
  const type = String(app.inst_type || "");
  const cat = String(app.inst_category || "");
  const name = String(app.inst_name || "");
  const byName: OrgType | null =
    /تعاوني/.test(name) ? "cooperative"
    : /فريق|تطوع/.test(name) ? "volunteer"
    : /مبادر/.test(name) ? "initiative"
    : /خيري|البر|كفالة|أيتام/.test(name) ? "charity"
    : null;
  if (type === "cooperative") return "cooperative";
  if (type === "ngo") return byName ?? (cat === "العمل الخيري والاجتماعي" ? "charity" : "initiative");
  if (type === "other") {
    if (byName) return byName;
    if (CIVIL_CATEGORIES.includes(cat)) return cat === "العمل الخيري والاجتماعي" ? "charity" : "initiative";
  }
  return null;
}

const lastDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-9);

router.post("/admin/institution-applications/:id/approve", writeLimiter, async (req: Request, res: Response) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    await ensureOrgActivitiesDb();
    await ensureAdminOpsDb();
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ error: "معرّف الطلب غير صحيح" });
    const app = (await query(`SELECT * FROM institution_applications WHERE id=$1`, [id])).rows[0];
    if (!app) return res.status(404).json({ error: "الطلب غير موجود" });
    const verify = req.body?.verify === true;
    const note = str(req.body?.admin_note, 800) || null;
    const forced = ORG_TYPES.includes(req.body?.org_type) ? (req.body.org_type as OrgType) : null;
    const orgType = forced ?? mapApplicationToOrgType(app);

    await query(`UPDATE institution_applications SET status='approved', admin_note=COALESCE($2, admin_note), reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [id, note, admin.id]);

    if (!orgType) {
      return res.json({ ok: true, org: null, org_eligible: false,
        message: "تم قبول الطلب. هذه الفئة ليست منظمة مجتمع مدني، لذلك لم تُنشأ لها صفحة منظمة." });
    }

    // 1) المنظمة: المرتبطة بالطلب سابقاً ← منظمة بنفس الاسم ← إنشاء جديدة
    let org: any = null; let created = false; let linkedExisting = false;
    if (app.created_org_id) org = (await query(`SELECT * FROM organizations WHERE id=$1`, [app.created_org_id])).rows[0] ?? null;
    if (!org) {
      org = (await query(`SELECT * FROM organizations WHERE lower(btrim(name)) = lower(btrim($1)) ORDER BY id LIMIT 1`, [app.inst_name])).rows[0] ?? null;
      if (org) linkedExisting = true;
    }
    if (!org) {
      const description = str(app.inst_description, 300) || str(app.inst_name, 200);
      const full = [str(app.inst_description, 4000), app.inst_address ? `العنوان: ${app.inst_address}${app.inst_neighborhood ? ` — ${app.inst_neighborhood}` : ""}` : "",
        app.inst_website ? `الموقع: ${app.inst_website}` : "", app.inst_registration_no ? `رقم التسجيل: ${app.inst_registration_no}` : ""].filter(Boolean).join("\n");
      const contactInfo = [app.inst_phone, app.inst_email, app.inst_address].filter(Boolean).join(" · ");
      org = (await query(
        `INSERT INTO organizations (name, type, description, full_description, contact_phone, contact_info, email, founded_year, is_verified, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING *`,
        [str(app.inst_name, 200), orgType, description, full, str(app.inst_phone, 50), contactInfo || null, app.inst_email || null,
         str(app.inst_founded_year, 20), verify])).rows[0];
      created = true;
    }
    // ربط ذرّي: إن سبقنا اعتماد متزامن نستخدم منظمته ونحذف ما أنشأناه
    const claim = await query(`UPDATE institution_applications SET created_org_id=$2 WHERE id=$1 AND (created_org_id IS NULL OR created_org_id=$2) RETURNING id`, [id, org.id]);
    if (!claim.rows[0]) {
      const winner = (await query(`SELECT created_org_id FROM institution_applications WHERE id=$1`, [id])).rows[0]?.created_org_id;
      if (created) await query(`DELETE FROM organizations WHERE id=$1`, [org.id]).catch(() => {});
      org = (await query(`SELECT * FROM organizations WHERE id=$1`, [winner])).rows[0];
      created = false;
    }
    // التفعيل دائماً، والتوثيق فقط عند «اعتماد وتوثيق» (لا نُلغي توثيقاً سابقاً)
    org = (await query(`UPDATE organizations SET is_active=TRUE, is_verified = (is_verified OR $2) WHERE id=$1 RETURNING *`, [org.id, verify])).rows[0];

    // 2) المسؤول: حساب مقدّم الطلب ← تطابق هاتف وحيد
    let managerId: number | null = null; let matchedBy: "user_id" | "phone" | null = null;
    if (app.user_id) {
      const u = await query(`SELECT id FROM users WHERE id=$1 AND COALESCE(is_banned,false)=false`, [app.user_id]);
      if (u.rows[0]) { managerId = u.rows[0].id; matchedBy = "user_id"; }
    }
    if (!managerId) {
      for (const p of [lastDigits(app.rep_phone), lastDigits(app.inst_phone)]) {
        if (p.length < 9) continue;
        const r = await query(`SELECT id FROM users WHERE COALESCE(is_banned,false)=false AND right(regexp_replace(COALESCE(phone,''),'\\D','','g'), 9) = $1 LIMIT 2`, [p]);
        if (r.rows.length === 1) { managerId = r.rows[0].id; matchedBy = "phone"; break; }
      }
    }
    let manager: any = null; let managerAdded = false; let existingTeam = false;
    // منظمة قائمة لها فريق: لا نمنح صلاحية الإدارة تلقائياً (تطابق اسم، أو مسؤول أزالته الإدارة)
    if (managerId && !created) {
      const team = await query(`SELECT 1 FROM org_managers WHERE org_id=$1 AND user_id<>$2 LIMIT 1`, [org.id, managerId]);
      const already = await query(`SELECT 1 FROM org_managers WHERE org_id=$1 AND user_id=$2`, [org.id, managerId]);
      if (team.rows.length && !already.rows.length) { existingTeam = true; managerId = null; }
    }
    if (managerId) {
      const hasOwner = (await query(`SELECT 1 FROM org_managers WHERE org_id=$1 AND role='owner' AND user_id<>$2`, [org.id, managerId])).rows.length > 0;
      const ins = await query(`INSERT INTO org_managers (org_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (org_id, user_id) DO NOTHING RETURNING role`,
        [org.id, managerId, hasOwner ? "manager" : "owner"]);
      managerAdded = ins.rows.length > 0;
      manager = (await query(`SELECT m.user_id, m.role, u.name, u.phone FROM org_managers m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.user_id=$2`, [org.id, managerId])).rows[0];
      if (managerAdded) {
        await notifyUser(managerId, "org_manager", "تم اعتماد منظمتك",
          `«${org.name}» أصبحت ${org.is_verified ? "موثّقة و" : ""}مفعّلة على المنصة، وأنت مسؤول صفحتها — انشر الفعاليات وحملات التبرع.`,
          { screen: "organization", org_id: org.id, route: `/organization?id=${org.id}` });
      }
    }

    const parts = [
      created ? `أُنشئت صفحة «${org.name}» (${ORG_TYPE_LABEL[orgType]})`
        : app.created_org_id === org.id ? `الطلب معتمد مسبقاً ومرتبط بـ«${org.name}» (لم تُنشأ نسخة جديدة)`
        : `رُبط الطلب بالمنظمة الموجودة «${org.name}»`,
      org.is_verified ? "وهي موثّقة" : "مفعّلة دون توثيق",
      manager ? (managerAdded ? `وعُيّن ${manager.name} مسؤولاً عنها` : `و${manager.name} مسؤول عنها مسبقاً`)
        : existingTeam ? "— للمنظمة مسؤولون مسبقاً، لذلك لم يُضف مقدّم الطلب تلقائياً: أضفه يدوياً من صفحة المنظمة إن كان مخوّلاً"
        : "— لم يُعثر على حساب مقدّم الطلب: عيّن المسؤول يدوياً من صفحة المنظمة",
    ];
    return res.json({
      ok: true, org_eligible: true, created, linked_existing: linkedExisting, already_approved: !created && app.created_org_id === org.id,
      org: { id: org.id, name: org.name, type: org.type, is_verified: org.is_verified, is_active: org.is_active },
      manager, manager_added: managerAdded, manager_matched_by: matchedBy, needs_manual_manager: !manager,
      message: parts.join(" "),
    });
  } catch (err) { return fail(res, err, "institution approve"); }
});

// ════════════════ الاستمارات القانونية ════════════════
const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** نص القالب → HTML للطباعة: «# عنوان»، فقرات بسطر فارغ، و{{الحقل}} يصبح خانة للتعبئة. */
export function legalBodyToHtml(body: string): string {
  return body.replace(/\r/g, "").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).map((block) => {
    const fill = (t: string) => escHtml(t).replace(/\{\{\s*([^{}]{1,60}?)\s*\}\}/g,
      (_m, label) => `<span style="white-space:nowrap"><b>${label}:</b> ____________________</span>`);
    const h = /^#{1,2}\s+(.+)$/.exec(block);
    if (h && !block.includes("\n")) return `<h2>${fill(h[1])}</h2>`;
    return `<p>${block.split("\n").map(fill).join("<br/>")}</p>`;
  }).join("\n");
}

const FORM_COLS = `id, title, category, description, body_text, file_url, is_official, is_published, sort_order, created_at, updated_at`;

function parseForm(b: any, partial: boolean): { ok: true; v: Record<string, unknown> } | { ok: false; error: string } {
  const v: Record<string, unknown> = {};
  if (!partial || b.title !== undefined) {
    const t = str(b.title, 200);
    if (t.length < 3) return { ok: false, error: "العنوان مطلوب (3 أحرف على الأقل)" };
    v.title = t;
  }
  if (!partial || b.category !== undefined) v.category = str(b.category, 80) || "عام";
  if (!partial || b.description !== undefined) v.description = str(b.description, 1000);
  if (!partial || b.body !== undefined) {
    const body = typeof b.body === "string" ? b.body.replace(/\r/g, "").slice(0, 20000).trim() : "";
    v.body_text = body;
    v.content_html = legalBodyToHtml(body);
  }
  if (!partial || b.file_url !== undefined) {
    const f = str(b.file_url, 1000);
    if (f && !/^https:\/\/[^\s]+$/i.test(f)) return { ok: false, error: "رابط الملف يجب أن يبدأ بـ https://" };
    v.file_url = f || null;
  }
  if (!partial || b.is_published !== undefined) v.is_published = b.is_published !== false;
  if (!partial || b.is_official !== undefined) v.is_official = b.is_official === true;
  if (!partial || b.sort_order !== undefined) {
    const n = Number(b.sort_order ?? 99);
    if (!Number.isInteger(n) || n < 0 || n > 9999) return { ok: false, error: "الترتيب رقم صحيح بين 0 و 9999" };
    v.sort_order = n;
  }
  return { ok: true, v };
}

router.get("/admin/legal-forms", async (req: Request, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureAdminOpsDb();
    const { rows } = await query(`SELECT ${FORM_COLS}, (body_text = '' AND content_html <> '') AS legacy_html FROM legal_forms ORDER BY sort_order, id`);
    return res.json({ forms: rows });
  } catch (err) { return fail(res, err, "forms list"); }
});

router.get("/admin/legal-forms/:id", async (req: Request, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureAdminOpsDb();
    const { rows } = await query(`SELECT ${FORM_COLS}, content_html FROM legal_forms WHERE id=$1`, [idParam(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: "الاستمارة غير موجودة" });
    return res.json({ form: rows[0] });
  } catch (err) { return fail(res, err, "forms get"); }
});

router.post("/admin/legal-forms", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureAdminOpsDb();
    const p = parseForm(req.body || {}, false);
    if (!p.ok) return res.status(400).json({ error: p.error });
    if (!p.v.body_text && !p.v.file_url) return res.status(400).json({ error: "أضف نص الاستمارة أو رابط ملفها" });
    const keys = Object.keys(p.v);
    const { rows } = await query(
      `INSERT INTO legal_forms (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING ${FORM_COLS}`,
      keys.map((k) => p.v[k]));
    return res.status(201).json({ form: rows[0] });
  } catch (err) { return fail(res, err, "forms create"); }
});

router.put("/admin/legal-forms/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    await ensureAdminOpsDb();
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ error: "معرّف غير صحيح" });
    const p = parseForm(req.body || {}, true);
    if (!p.ok) return res.status(400).json({ error: p.error });
    const keys = Object.keys(p.v);
    if (!keys.length) return res.status(400).json({ error: "لا توجد تعديلات" });
    const { rows } = await query(
      `UPDATE legal_forms SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(", ")}, updated_at=NOW() WHERE id=$1 RETURNING ${FORM_COLS}, content_html`,
      [id, ...keys.map((k) => p.v[k])]);
    if (!rows[0]) return res.status(404).json({ error: "الاستمارة غير موجودة" });
    if (!rows[0].content_html && !rows[0].file_url) {
      // لا نترك استمارة منشورة فارغة
      await query(`UPDATE legal_forms SET is_published=FALSE WHERE id=$1`, [id]);
      rows[0].is_published = false;
    }
    delete rows[0].content_html;
    return res.json({ form: rows[0] });
  } catch (err) { return fail(res, err, "forms update"); }
});

router.delete("/admin/legal-forms/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const r = await query(`DELETE FROM legal_forms WHERE id=$1 RETURNING id`, [idParam(req.params.id)]);
    if (!r.rows[0]) return res.status(404).json({ error: "الاستمارة غير موجودة" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "forms delete"); }
});

export { ensureAdminOpsDb };
export default router;
