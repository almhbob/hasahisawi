import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import crypto from "node:crypto";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In production (Render), use /tmp which is always writable.
// When bundled by esbuild, __dirname points to dist/ not src/routes/,
// so relative path navigation to public/ breaks; /tmp/uploads is the safe choice.
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
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const name = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /api/upload — يستقبل ملفاً واحداً بحقل اسمه "file"
router.post("/upload", upload.single("file"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "لم يتم إرسال أي ملف أو نوع الملف غير مدعوم" });
    return;
  }

  // بناء الـ URL الكامل
  const host = process.env["REPLIT_DEV_DOMAIN"]
    ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
    : `http://localhost:${process.env["PORT"] ?? 8080}`;

  const url = `${host}/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});

export default router;
