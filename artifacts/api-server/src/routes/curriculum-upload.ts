// رفع الكتب الكبيرة: الملفات الكبيرة تُرفع مباشرةً من الجهاز إلى Vercel Blob
// عبر رابط موقّع قصير الأجل (لا تمرّ عبر الخادم، فلا يوجد حدّ 4.5MB).
// الملفات الصغيرة تبقى على Cloudinary كما كانت.
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { logger } from "../lib/logger";
import { sessionUser } from "../lib/shared-db";
import { r2Configured, r2PresignPut, r2DeleteByUrl } from "../lib/r2";

export const BOOK_MAX_MB = 500;
export const CLOUDINARY_RAW_LIMIT_MB = 9.5;

const ALLOWED_TYPES = [
  "application/pdf", "application/epub+zip", "application/zip", "application/x-zip-compressed",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg", "image/png", "audio/mpeg", "audio/mp4", "video/mp4", "application/octet-stream",
];

const EXT_TYPE: Record<string, string> = {
  pdf: "application/pdf", epub: "application/epub+zip", zip: "application/zip", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "video/mp4",
};

export function blobConfigured() { return !!process.env.BLOB_READ_WRITE_TOKEN || r2Configured(); }

export function curriculumMaxFileMb() {
  return blobConfigured() ? BOOK_MAX_MB : CLOUDINARY_RAW_LIMIT_MB;
}

const router = Router();

// POST /api/curriculum/upload-target { file_name, size, content_type }
// → { provider: "blob", upload_url, headers, max_file_mb } أو { provider: "cloudinary" }
router.post("/curriculum/upload-target", async (req, res) => {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: "سجّل الدخول لرفع الملفات" });
    if (user.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    const size = Number(req.body?.size) || 0;
    const maxFileMb = curriculumMaxFileMb();
    if (size > maxFileMb * 1024 * 1024) return res.status(413).json({ error: "الحد الأقصى لحجم الملف " + maxFileMb + " ميجابايت" });
    const rawName = String(req.body?.file_name || "book.pdf");
    const ext = (rawName.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "pdf";
    const contentType = EXT_TYPE[ext] || (ALLOWED_TYPES.includes(String(req.body?.content_type)) ? String(req.body.content_type) : "application/octet-stream");

    // كل الكتب تذهب إلى التخزين الكبير متى كان متاحاً — Cloudinary المجاني يرفض كثيراً من ملفات PDF
    // (حد 10MB للملفات الخام) فكان المستخدم يرى «الحجم أكبر من المسموح» حتى لملفات متوسطة.
    if (!blobConfigured() || (!process.env.BLOB_READ_WRITE_TOKEN && !(Array.isArray(req.body?.supports) && req.body.supports.includes("r2")))) {
      return res.json({ provider: "cloudinary", max_file_mb: process.env.BLOB_READ_WRITE_TOKEN ? maxFileMb : CLOUDINARY_RAW_LIMIT_MB });
    }

    const safeName = rawName.replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").slice(0, 60) || "book";
    // Cloudflare R2 أولاً (بلا رسوم تحميل) للتطبيقات التي تدعمه
    const supportsR2 = Array.isArray(req.body?.supports) && req.body.supports.includes("r2");
    if (r2Configured() && supportsR2) {
      const key = `curriculum/${user.id}/${Date.now()}-${randomBytes(4).toString("hex")}-${safeName}.${ext}`;
      const { url, public_url } = r2PresignPut(key, 3600);
      return res.json({ provider: "r2", upload_url: url, method: "PUT", headers: { "Content-Type": contentType }, content_type: contentType, public_url, max_file_mb: BOOK_MAX_MB });
    }

    const { issueSignedToken, presignUrl } = await import("@vercel/blob");
    const safeBase = rawName.replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").slice(0, 60) || "book";
    const pathname = `curriculum/${user.id}/${Date.now()}-${randomBytes(4).toString("hex")}-${safeBase}.${ext}`;
    const validUntil = Date.now() + 60 * 60 * 1000; // ساعة كاملة للشبكات البطيئة
    const maximumSizeInBytes = BOOK_MAX_MB * 1024 * 1024;
    const signed = await issueSignedToken({ pathname, operations: ["put"] as any, validUntil, maximumSizeInBytes, allowedContentTypes: [contentType] } as any);
    const { presignedUrl } = await presignUrl(signed as any, {
      operation: "put", pathname, access: "public", validUntil, maximumSizeInBytes, allowedContentTypes: [contentType],
    } as any);
    return res.json({
      provider: "blob",
      upload_url: presignedUrl,
      method: "PUT",
      headers: { "x-content-type": contentType, "x-api-version": "13", "x-vercel-blob-access": "public" },
      content_type: contentType,
      pathname,
      max_file_mb: BOOK_MAX_MB,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "curriculum/upload-target");
    return res.status(500).json({ error: "تعذّر تجهيز الرفع — حاول لاحقاً" });
  }
});

// حذف ملف من التخزين الكبير عند حذف الكتاب (يوفّر المساحة)
export async function deleteBookBlob(url: string | null | undefined) {
  try {
    await r2DeleteByUrl(url).catch((e) => logger.warn({ err: e?.message }, "curriculum r2 delete"));
    if (!url || !process.env.BLOB_READ_WRITE_TOKEN || !/\.blob\.vercel-storage\.com\//.test(url)) return;
    const { del } = await import("@vercel/blob");
    await del(url);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "curriculum blob delete");
  }
}

export default router;
