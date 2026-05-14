import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

const router = Router();

// ── Cloudinary config ────────────────────────────────────────────────────────
// يدعم 3 طرق إعداد:
// 1. CLOUDINARY_URL=cloudinary://key:secret@cloud_name  (رابط كامل)
// 2. CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET (منفصلة)
// 3. CLOUDINARY_CLOUD_NAME يحتوي على رابط CLOUDINARY_URL= كامل (خطأ شائع)

function parseCloudinaryConfig(): { cloudName: string; apiKey: string; apiSecret: string } | null {
  const apiKey    = process.env["CLOUDINARY_API_KEY"]    ?? "";
  const apiSecret = process.env["CLOUDINARY_API_SECRET"] ?? "";
  const rawName   = process.env["CLOUDINARY_CLOUD_NAME"] ?? "";

  // استخراج اسم الـ cloud من أي شكل ممكن
  function extractCloudName(s: string): string {
    // إذا يحتوي على cloudinary://...@cloud_name
    const m = s.match(/cloudinary:\/\/[^@]*@([^/\s]+)/);
    if (m) return m[1].trim();
    // إذا يحتوي على CLOUDINARY_URL= في البداية، احذفه
    return s.replace(/^CLOUDINARY_URL\s*=\s*/i, "").trim();
  }

  // الأولوية 1: إذا توفرت API Key + Secret منفصلة (الأكثر موثوقية)
  if (apiKey && apiSecret && rawName) {
    const cloudName = extractCloudName(rawName);
    if (cloudName && !cloudName.startsWith("cloudinary://")) {
      return { cloudName, apiKey, apiSecret };
    }
  }

  // الأولوية 2: CLOUDINARY_URL بيانات حقيقية (ليس placeholders)
  const url = process.env["CLOUDINARY_URL"] ?? "";
  if (url.startsWith("cloudinary://")) {
    try {
      const u = new URL(url);
      const key = decodeURIComponent(u.username);
      const sec = decodeURIComponent(u.password);
      if (key && sec && !key.includes("<") && !sec.includes("<")) {
        return { cloudName: u.hostname, apiKey: key, apiSecret: sec };
      }
    } catch {}
  }

  // الأولوية 3: استخراج cloud name فقط من الـ URL، مع API key/secret من متغيرات منفصلة
  if (apiKey && apiSecret && rawName) {
    const cloudName = extractCloudName(rawName);
    if (cloudName) return { cloudName, apiKey, apiSecret };
  }

  return null;
}

const _cfg = parseCloudinaryConfig();
const CLOUDINARY_OK = !!_cfg;

if (_cfg) {
  cloudinary.config({ cloud_name: _cfg.cloudName, api_key: _cfg.apiKey, api_secret: _cfg.apiSecret });
  console.log(`✅ Cloudinary configured — cloud: ${_cfg.cloudName}`);
} else {
  console.warn("⚠️  Cloudinary not configured — uploads will use local fallback");
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
      destination: "/tmp/uploads",
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
        console.error("upload middleware error:", e?.message ?? err);
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
        console.error("Cloudinary upload error:", msg);
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
    } else if (process.env["REPLIT_DEV_DOMAIN"]) {
      host = `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
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
  const { public_id, resource_type } = req.body as { public_id?: string; resource_type?: string };
  if (!public_id) {
    res.status(400).json({ error: "public_id مطلوب" });
    return;
  }
  if (!CLOUDINARY_OK) {
    res.status(503).json({ error: "Cloudinary غير مهيّأ" });
    return;
  }
  try {
    const result = await cloudinary.uploader.destroy(public_id, {
      resource_type: (resource_type as "image" | "video" | "raw") ?? "image",
    });
    res.json({ ok: result.result === "ok", result: result.result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
