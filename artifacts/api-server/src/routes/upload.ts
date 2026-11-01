import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { v2 as cloudinary } from "cloudinary";
import { logger } from "../lib/logger";
import { pinMatches } from "../lib/admin-pin";
import { sessionUser } from "../lib/shared-db";
import { limiter } from "../lib/rate-limiters";

const router = Router();
const TMP_UPLOAD_DIR = "/tmp/uploads";


function isAdminPinRequest(req: Request): boolean {
  return pinMatches(req.headers["x-admin-pin"]);
}

try {
  mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
} catch (err) {
  logger.warn({ err }, "failed to create temporary upload directory");
}

// ── Cloudinary config ────────────────────────────────────────────────────────
{
  const urlEnv = process.env["CLOUDINARY_URL"] ?? "";
  if (urlEnv && !urlEnv.includes("<your_") && urlEnv.startsWith("cloudinary://")) {
    // SDK auto-configures from CLOUDINARY_URL.
  } else {
    const apiKey    = process.env["CLOUDINARY_API_KEY"]    ?? "";
    const apiSecret = process.env["CLOUDINARY_API_SECRET"] ?? "";
    const cloudName = (process.env["CLOUDINARY_CLOUD_NAME"] ?? "").replace(/^CLOUDINARY_URL\s*=\s*/i, "").replace(/cloudinary:\/\/[^@]*@/i, "").trim();
    if (apiKey && !apiKey.includes("<") && apiSecret && !apiSecret.includes("<") && cloudName) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    }
  }
}

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

// حدود الحجم حسب النوع (قابلة للتعديل من متغيرات البيئة)
const MB = 1024 * 1024;
const MAX_IMAGE_BYTES = Number(process.env["MAX_IMAGE_UPLOAD_MB"] ?? 25) * MB;
const MAX_DOC_BYTES   = Number(process.env["MAX_DOC_UPLOAD_MB"] ?? 50) * MB;
const MAX_VIDEO_BYTES = Number(process.env["MAX_VIDEO_UPLOAD_MB"] ?? 500) * MB;

// رفع الملفات: 40 ملفاً كل 10 دقائق لكل عنوان — يكفي لمنشور بعدة صور ويمنع الإغراق
const uploadLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "رفعت ملفات كثيرة، يرجى الانتظار قليلاً" },
});

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp",
  "image/gif",  "image/heic", "image/heif", "image/bmp", "image/tiff",
  "application/pdf",
  "video/mp4",  "video/quicktime", "video/x-matroska", "video/webm",
  "video/3gpp", "video/3gpp2", "video/x-msvideo", "video/avi",
  "application/octet-stream",
]);

const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".bmp", ".tiff",
  ".pdf",
  ".mp4", ".mov", ".m4v", ".mkv", ".webm", ".3gp", ".3g2", ".avi",
]);

const VIDEO_EXT = [".mp4", ".mov", ".mkv", ".webm", ".3gp", ".3g2", ".avi", ".m4v"];

function maxBytesFor(filename: string, mimetype: string): number {
  const ext = path.extname(filename || "").toLowerCase();
  if (mimetype.startsWith("video/") || VIDEO_EXT.includes(ext)) return MAX_VIDEO_BYTES;
  if (mimetype === "application/pdf" || ext === ".pdf") return MAX_DOC_BYTES;
  return MAX_IMAGE_BYTES;
}

function resolveFolder(filename: string, mimetype: string): string {
  const ext = path.extname(filename || "").toLowerCase();
  const isVideo = mimetype.startsWith("video/") || [".mp4", ".mov", ".mkv", ".webm", ".3gp", ".avi", ".m4v"].includes(ext);
  const isDocument = mimetype === "application/pdf" || ext === ".pdf";
  if (isVideo) return "hasahisawi/videos";
  if (isDocument) return "hasahisawi/documents";
  return "hasahisawi/images";
}

function resolveResourceType(mimetype: string, ext: string): "image" | "video" | "raw" {
  if (mimetype.startsWith("video/") || [".mp4", ".mov", ".mkv", ".webm", ".3gp", ".avi", ".m4v"].includes(ext)) return "video";
  if (mimetype === "application/pdf" || ext === ".pdf") return "raw";
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
    const mime = (file.mimetype || "").toLowerCase();
    // الامتداد شرط دائماً؛ والنوع يجب أن يكون معروفاً (أو عاماً كما ترسله بعض أجهزة أندرويد).
    // سابقاً كان يكفي أحدهما، فيمرّ ملف ‎.html‎ بنوع octet-stream ويُخدَم من نطاق الخادم.
    const ok  = ALLOWED_EXT.has(ext) && (ALLOWED_MIME.has(mime) || mime === "");
    cb(null, ok);
  },
});

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
        ...(resourceType === "image" ? { transformation: [{ quality: "auto", fetch_format: "auto" }] } : {}),
        ...(resourceType === "video" ? { transformation: [{ quality: "auto" }] } : {}),
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

// لا رفع بلا هوية: يُتحقق قبل استقبال أي بايت حتى لا يُستهلك الخادم ولا حصة Cloudinary
async function requireUploader(req: Request, res: Response, next: NextFunction) {
  if (isAdminPinRequest(req)) { next(); return; }
  try {
    const user = await sessionUser(req);
    if (!user) { res.status(401).json({ error: "سجّل الدخول لرفع الملفات" }); return; }
    if (user.is_banned) { res.status(403).json({ error: "الحساب موقوف" }); return; }
    (req as Request & { uploaderId?: number }).uploaderId = user.id;
    next();
  } catch (err) {
    logger.error({ err }, "upload auth failed");
    res.status(500).json({ error: "تعذّر التحقق من الحساب" });
  }
}

router.post(
  "/upload",
  uploadLimiter,
  requireUploader,
  (req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(15 * 60 * 1000);
    res.setTimeout(15 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upload.single("file")(req as any, res as any, (err: unknown) => {
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

    const maxBytes = maxBytesFor(req.file.originalname, req.file.mimetype);
    if (req.file.size > maxBytes) {
      if (req.file.path) { import("node:fs").then((fs) => fs.promises.unlink(req.file!.path).catch(() => {})); }
      res.status(413).json({ error: `حجم الملف كبير جداً (الحد الأقصى لهذا النوع ${Math.round(maxBytes / MB)}MB)` });
      return;
    }
    logger.info({ user: (req as Request & { uploaderId?: number }).uploaderId ?? "admin-pin", size: req.file.size, type: req.file.mimetype }, "upload");

    if (CLOUDINARY_OK && req.file.buffer) {
      try {
        const ext          = path.extname(req.file.originalname || "").toLowerCase();
        const resourceType = resolveResourceType(req.file.mimetype, ext);
        const folder       = resolveFolder(req.file.originalname, req.file.mimetype);
        const publicId     = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await uploadBufferToCloudinary((req as any).file.buffer, folder, resourceType, publicId);

        res.json({
          url:       result.secure_url,
          public_id: result.public_id,
          size:      result.bytes,
          format:    result.format,
          provider:  "cloudinary",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ msg }, "Cloudinary upload error");
        res.status(500).json({ error: `فشل رفع الملف إلى Cloudinary: ${msg}` });
      }
      return;
    }

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
