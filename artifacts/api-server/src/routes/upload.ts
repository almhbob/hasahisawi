import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import crypto from "node:crypto";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UPLOADS_DIR =
  process.env.NODE_ENV === "production"
    ? "/tmp/uploads"
    : path.join(__dirname, "..", "..", "public", "uploads");

try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.warn("⚠️  Could not create uploads dir:", msg);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    const name = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
    cb(null, name);
  },
});

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/tiff",
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
  "video/3gpp",
  "video/3gpp2",
  "video/x-msvideo",
  "video/avi",
  "application/octet-stream",
]);

const ALLOWED_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".bmp", ".tiff",
  ".mp4", ".mov", ".m4v", ".mkv", ".webm", ".3gp", ".3g2", ".avi",
]);

const upload = multer({
  storage,
  // 500 MB — يكفي لفيديوهات طويلة وعالية الجودة
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const ok =
      ALLOWED_MIME.has((file.mimetype || "").toLowerCase()) ||
      ALLOWED_EXT.has(ext);
    cb(null, ok);
  },
});

// POST /api/upload — يستقبل ملفاً واحداً بحقل اسمه "file"
router.post(
  "/upload",
  (req: Request, res: Response, next: NextFunction) => {
    // إطالة مهلة الطلب على الفيديوهات الكبيرة (10 دقائق)
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const e = err as { code?: string; message?: string };
        if (e?.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "حجم الملف كبير جداً (الحد الأقصى 500MB)" });
          return;
        }
        console.error("upload error:", e?.message ?? err);
        res.status(400).json({ error: "فشل رفع الملف" });
        return;
      }
      next();
    });
  },
  (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "لم يتم إرسال أي ملف أو نوع الملف غير مدعوم" });
      return;
    }

    let host: string;
    if (process.env["PUBLIC_BASE_URL"]) {
      host = process.env["PUBLIC_BASE_URL"].replace(/\/$/, "");
    } else if (req.headers.host) {
      const proto = (req.headers["x-forwarded-proto"] as string) || (req.protocol === "https" ? "https" : "https");
      host = `${proto}://${req.headers.host}`;
    } else if (process.env["REPLIT_DEV_DOMAIN"]) {
      host = `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
    } else {
      host = `http://localhost:${process.env["PORT"] ?? 8080}`;
    }

    const url = `${host}/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename, size: req.file.size });
  },
);

export default router;
