import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { v2 as cloudinary } from "cloudinary";
import { logger } from "../lib/logger";

const router = Router();
const TMP_UPLOAD_DIR = "/tmp/uploads";
const DEFAULT_ADMIN_PIN = process.env.DEFAULT_ADMIN_PIN ?? "4444";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a.padEnd(64, "\0"));
    const bb = Buffer.from(b.padEnd(64, "\0"));
    return crypto.timingSafeEqual(ba, bb) && a.length === b.length;
  } catch {
    return false;
  }
}

function isAdminPinRequest(req: Request): boolean {
  const submittedPin = req.headers["x-admin-pin"];
  if (typeof submittedPin !== "string") return false;
  if (submittedPin.length < 4 || submittedPin.length > 20) return false;
  return safeCompare(submittedPin, DEFAULT_ADMIN_PIN);
}

// Ensure local fallback uploads never fail because the Render/Railway ephemeral
// temp directory has not been created yet.
try {
  mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
} catch (err) {
  logger.warn({ err }, "failed to create temporary upload directory");
}

// ── Cloudinary config ────────────────────────────────────────────────────────
// الـ SDK يقرأ CLOUDINARY_URL تلقائياً عند التهيئة.
// نتحقق فقط من أن القيمة صالحة بعد أن يُهيِّئ SDK نفسه.
{
  // تأكد من أن CLOUDINARY_URL محمّل (SDK يقرأه من process.env مباشرة)
  const urlEnv = process.env["CLOUDINARY_URL"] ?? "";
  if (urlEnv && !urlEnv.includes("<your_") && urlEnv.startsWith("cloudinary://")) {
    // SDK auto-configures from CLOUDINARY_URL — لا نحتاج cloudinary.config()
  } else {
    // محاولة بديلة: متغيرات منفصلة
    const apiKey    = process.env["CLOUDINARY_API_KEY"]    ?? "";
    const apiSecret = process.env["CLOUDINARY_API_SECRET"] ?? "";
    const cloudName = (process.env["CLOUDINARY_CLOUD_NAME"] ?? "").replace(/^CLOUDINARY_URL\s*=\s*/i, "").replace(/cloudinary:\/\/[^@]*@/i, "").trim();
    if (apiKey && !apiKey.includes("<") && apiSecret && !apiSecret.includes("<") && cloudName) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    }
  }
}

// تحقق من نجاح الإعداد
const _cldCfg = cloudinary.config();
const CLOUDINARY_OK = !!(
  _cldCfg.cloud_name &&
  _cldCfg.api_key &&
  _cldCfg.api_secret &&
  !String(_cldCfg.api_key).includes("<") &&
  !String(_cldCfg.api_secret).includes("<")
);

if (CLOUDINARY_OK) {
  logger.info({ cloud: _cldCfg.cloud_name }, "Cloudinary configured");
} else {
  logger.warn("Cloudinary not configured — uploads will use local fallback");
}

// ── Multer — keep in memory when Cloudinary is on, disk otherwise ─────────────
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp",
  "image/gif",  "image/heic", "image/heif", "image/bmp", "image/tiff",
  "video/mp4",  "video/quicktime", "video/x-matroska", "video/webm",
  "video/3gpp", "video/3gpp2", "video/x-msvideo", "video/avi",
  "application/octet-stream",
]);

const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".bmp", ".tiff",
  ".mp4", ".mov", ".m4v", ".mkv", ".webm", ".3gp", ".3g2", ".avi",
]);

// خريطة الامتداد → folder في Cloudinary (تصنيف تلقائي)
function resolveFolder(filename: string, mimetype: string): string {
  const ext = path.extname(filename || "").toLowerCase();
  const isVideo = mimetype.startsWith("video/") || [".mp4",".mov",".mkv",".webm",".3gp",".avi",".m4v"].includes(ext);
  if (isVideo) return "hasahisawi/videos";
  return "hasahisawi/images";
}

// نوع المورد لـ Cloudinary
function resolveResourceType(mimetype: string, ext: string): "image" | "video" | "raw" {
  if (mimetype.startsWith("video/") || [".mp4",".mov",".mkv",".webm",".3gp",".avi",".m4v"].includes(ext)) return "video";
  if (mimetype.startsWith("image/")) return "image";
  return "raw";
}

const multerStorage = CLOUDINARY_OK
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: TMP_UPLOAD_DIR,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || ".bin";
        cb(null, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
      },
    });

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const ok  = ALLOWED_MIME.has((file.mimetype || "").toLowerCase()) || ALLOWED_EXT.has(ext);
    cb(null, ok);
  },
});

// ── Helper: رفع Buffer إلى Cloudinary ────────────────────────────────────────
function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: string,
  resourceType: "image" | "video" | "raw",
  publicId: string,
): Promise<{ secure_url: string; public_id: string; bytes: number; format: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        // تحسينات تلقائية للصور
        ...(resourceType === "image" ? {
          transformation: [{ quality: "auto", fetch_format: "auto" }],
        } : {}),
        // ضغط تلقائي للفيديو
        ...(resourceType === "video" ? {
          transformation: [{ quality: "auto" }],
        } : {}),
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
        resolve({
          secure_url: result.secure_url,
          public_id:  result.public_id,
          bytes:      result.bytes,
          format:     result.format,
        });
      },
    );
    stream.end(buffer);
  });
}

// ── POST /api/upload ──────────────────────────────────────────────────────────
router.post(
  "/upload",
  (req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(15 * 60 * 1000);
    res.setTimeout(15 * 60 * 1000);
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const e = err as { code?: string; message?: string };
        if (e?.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "حجم الملف كبير جداً (الحد الأقصى 500MB)" });
          return;
        }
        logger.error({ err: e?.message ?? err }, "upload middleware error");
        res.status(400).json({ error: "فشل رفع الملف" });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "لم يتم إرسال أي ملف أو نوع الملف غير مدعوم" });
      return;
    }

    // ── Cloudinary path ──────────────────────────────────────────────────────
    if (CLOUDINARY_OK && req.file.buffer) {
      try {
        const ext          = path.extname(req.file.originalname || "").toLowerCase();
        const resourceType = resolveResourceType(req.file.mimetype, ext);
        const folder       = resolveFolder(req.file.originalname, req.file.mimetype);
        const publicId     = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

        const result = await uploadBufferToCloudinary(req.file.buffer, folder, resourceType, publicId);

        res.json({
          url:       result.secure_url,
          public_id: result.public_id,
          size:      result.bytes,
          format:    result.format,
          provider:  "cloudinary",
        });
      } catch (err: unknown) {
        let msg: string;
        if (err instanceof Error) {
          msg = err.message;
        } else if (err && typeof err === "object") {
          msg = JSON.stringify(err);
        } else {
          msg = String(err);
        }
        logger.error({ msg }, "Cloudinary upload error");
        res.status(500).json({ error: `فشل رفع الملف إلى Cloudinary: ${msg}` });
      }
      return;
    }

    // ── Local fallback (dev بدون Cloudinary) ─────────────────────────────────
    let host: string;
    if (process.env["PUBLIC_BASE_URL"]) {
      host = process.env["PUBLIC_BASE_URL"].replace(/\/$/, "");
    } else if (req.headers.host) {
      const proto = (req.headers["x-forwarded-proto"] as string) || "https";
      host = `${proto}://${req.headers.host}`;
    } else {
      host = `http://localhost:${process.env["PORT"] ?? 8080}`;
    }

    res.json({
      url:      `${host}/uploads/${req.file.filename}`,
      filename: req.file.filename,
      size:     req.file.size,
      provider: "local",
    });
  },
);

// ── DELETE /api/upload — حذف ملف من Cloudinary ───────────────────────────────
router.delete("/upload", async (req: Request, res: Response) => {
  if (!isAdminPinRequest(req)) {
    res.status(403).json({ error: "غير مصرح بحذف الملفات" });
    return;
  }

  const { public_id, resource_type } = req.body as { public_id?: string; resource_type?: string };
  if (!public_id || typeof public_id !== "string" || public_id.length > 255) {
    res.status(400).json({ error: "public_id غير صالح" });
    return;
  }
  if (!CLOUDINARY_OK) {
    res.status(503).json({ error: "Cloudinary غير مهيّأ" });
    return;
  }
  try {
    const validResourceTypes = new Set(["image", "video", "raw"]);
    const rt = validResourceTypes.has(String(resource_type)) ? resource_type as "image" | "video" | "raw" : "image";
    const result = await cloudinary.uploader.destroy(public_id, { resource_type: rt });
    res.json({ ok: result.result === "ok", result: result.result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
