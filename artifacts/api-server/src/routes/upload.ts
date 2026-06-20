import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { v2 as cloudinary } from "cloudinary";
import { logger } from "../lib/logger";

const router = Router();
const TMP_UPLOAD_DIR = "/tmp/uploads";

const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_UPLOAD_MB ?? 15) * 1024 * 1024;
const MAX_VIDEO_BYTES = Number(process.env.MAX_VIDEO_UPLOAD_MB ?? 100) * 1024 * 1024;
const MAX_UPLOAD_BYTES = Math.max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES);

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

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp",
  "image/gif",  "image/heic", "image/heif",
  "video/mp4",  "video/quicktime", "video/webm", "video/3gpp", "video/3gpp2",
]);

const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif",
  ".mp4", ".mov", ".m4v", ".webm", ".3gp", ".3g2",
]);

function isVideo(filename: string, mimetype: string): boolean {
  const ext = path.extname(filename || "").toLowerCase();
  return mimetype.startsWith("video/") || [".mp4", ".mov", ".webm", ".3gp", ".3g2", ".m4v"].includes(ext);
}

function assertAllowedSize(file: Express.Multer.File): string | null {
  const limit = isVideo(file.originalname, file.mimetype) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    const mb = Math.round(limit / 1024 / 1024);
    return `حجم الملف كبير جداً. الحد الأقصى لهذا النوع هو ${mb}MB`;
  }
  return null;
}

function resolveFolder(filename: string, mimetype: string): string {
  return isVideo(filename, mimetype) ? "hasahisawi/videos" : "hasahisawi/images";
}

function resolveResourceType(mimetype: string, ext: string): "image" | "video" {
  if (mimetype.startsWith("video/") || [".mp4", ".mov", ".webm", ".3gp", ".3g2", ".m4v"].includes(ext)) return "video";
  return "image";
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
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const ok = ALLOWED_MIME.has((file.mimetype || "").toLowerCase()) && ALLOWED_EXT.has(ext);
    cb(null, ok);
  },
});

function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: string,
  resourceType: "image" | "video",
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

router.post(
  "/upload",
  (req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(5 * 60 * 1000);
    res.setTimeout(5 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upload.single("file")(req as any, res as any, (err: unknown) => {
      if (err) {
        const e = err as { code?: string; message?: string };
        if (e?.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: `حجم الملف كبير جداً. الحد الأقصى ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` });
          return;
        }
        logger.error({ err: e?.message ?? err }, "upload middleware error");
        res.status(400).json({ error: "فشل رفع الملف أو نوع الملف غير مدعوم" });
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

    const sizeError = assertAllowedSize(req.file);
    if (sizeError) {
      res.status(413).json({ error: sizeError });
      return;
    }

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
        res.status(500).json({ error: "فشل رفع الملف إلى التخزين الدائم" });
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

router.delete("/upload", async (_req: Request, res: Response) => {
  // Authorization is enforced by security-hardening.ts before this router.
  res.status(501).json({ error: "حذف الملفات من هذا المسار معطل. استخدم عملية إدارية موثقة ومخصصة." });
});

export default router;
