// حواجز الوصول المركزية:
//  1) ركن المرأة: معزول تماماً — لا يصل إليه إلا حساب أنثى مسجّل أو الإدارة.
//  2) قفل الجنس: يُحدَّد مرة واحدة فقط، ولا يغيّره بعد ذلك إلا الإدارة،
//     حتى لا يتمكن أحد من تغيير جنسه للدخول إلى ركن المرأة.
import { Router, type Request, type Response, type NextFunction } from "express";
import { query, sessionUser, normalizeGender } from "../lib/shared-db";

const WOMEN_PATH = /^\/(women|women-services)(\/|$)/;

export function isWomenOnlyRequest(req: Request): boolean {
  if (WOMEN_PATH.test(req.path)) return true;
  // /stores?women_only=true و /stores/:id لمتجر نسائي يُفحصان في وحدة المتاجر.
  return req.path === "/stores" && String(req.query.women_only || "") === "true";
}

export async function womenCornerGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS" || !isWomenOnlyRequest(req)) return next();
  try {
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "ركن المرأة متاح للعضوات المسجّلات فقط — سجّلي الدخول أولاً", code: "WOMEN_LOGIN_REQUIRED" });
    if (u.is_banned) return res.status(403).json({ error: "الحساب موقوف", code: "BANNED" });
    if (u.role === "admin") return next();
    const g = normalizeGender(u.gender);
    if (g === "female") return next();
    if (g === null) return res.status(403).json({ error: "حدّدي الجنس في حسابك أولاً للدخول إلى ركن المرأة", code: "WOMEN_GENDER_REQUIRED" });
    return res.status(403).json({ error: "ركن المرأة خاص بالنساء فقط", code: "WOMEN_ONLY" });
  } catch {
    return res.status(503).json({ error: "تعذّر التحقق من صلاحية الدخول" });
  }
}

// PUT /auth/profile, PUT /users/me, PATCH /auth/me/gender, PATCH /auth/me/complete-profile
const GENDER_WRITE = /^\/(auth\/profile|users\/me|auth\/me\/gender|auth\/me\/complete-profile)\/?$/;

export async function genderLockGuard(req: Request, res: Response, next: NextFunction) {
  if (!["PUT", "PATCH", "POST"].includes(req.method) || !GENDER_WRITE.test(req.path)) return next();
  const wanted = req.body?.gender;
  if (wanted === undefined || wanted === null || wanted === "") return next();
  try {
    const u = await sessionUser(req);
    if (!u) return next(); // the handler answers 401 itself
    const current = normalizeGender(u.gender);
    const next_ = normalizeGender(wanted);
    if (current === null || current === next_ || u.role === "admin") return next();
    return res.status(403).json({
      error: "لا يمكن تغيير الجنس بعد تحديده. تواصل مع الإدارة إذا كان هناك خطأ.",
      code: "GENDER_LOCKED",
    });
  } catch {
    return next();
  }
}

const router = Router();

// PATCH /api/admin/users/:id/gender — الإدارة فقط تصحّح الجنس
router.patch("/admin/users/:id/gender", async (req, res) => {
  try {
    const u = await sessionUser(req);
    if (u?.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const g = normalizeGender(req.body?.gender);
    if (!g) return res.status(400).json({ error: "قيمة الجنس غير صحيحة" });
    const r = await query(`UPDATE users SET gender=$1 WHERE id=$2 RETURNING id,gender`, [g, Number(req.params.id)]);
    if (!r.rows[0]) return res.status(404).json({ error: "المستخدم غير موجود" });
    return res.json({ ok: true, user: r.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

// مراجعة طلبات انضمام مقدّمات خدمات ركن المرأة (الإدارة فقط)
router.get("/admin/women/join-requests", async (req, res) => {
  try {
    const u = await sessionUser(req);
    if (u?.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM women_join_requests ORDER BY (status IN ('new','pending')) DESC, created_at DESC LIMIT 300`);
    return res.json(r.rows);
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.patch("/admin/women/join-requests/:id", async (req, res) => {
  try {
    const u = await sessionUser(req);
    if (u?.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const status = String(req.body?.status || "");
    if (!["new", "contacted", "approved", "rejected"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const r = await query(`UPDATE women_join_requests SET status=$1 WHERE id=$2 RETURNING *`, [status, Number(req.params.id)]);
    if (!r.rows[0]) return res.status(404).json({ error: "الطلب غير موجود" });
    const { onWomenRequestReviewed } = await import("./provider-listings");
    const published = await onWomenRequestReviewed(r.rows[0], status);
    return res.json({ ...r.rows[0], published });
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

export default router;
