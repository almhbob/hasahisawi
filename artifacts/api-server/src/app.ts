import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: (origin, callback) => {
    // السماح بكل الطلبات (موبايل، ويب، Replit، localhost)
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-pin", "x-user-token"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تقديم الملفات المرفوعة كـ static
const publicDir = path.join(__dirname, "..", "public");
const uploadsDir = path.join(publicDir, "uploads");
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(publicDir));

app.use("/api", router);

export default app;
