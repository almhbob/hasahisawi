import app from "./app";
import { logger } from "./lib/logger";

process.on("uncaughtException", (err) => {
  console.error("⚠️  uncaughtException:", err.message, err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("⚠️  unhandledRejection:", reason);
});

process.on("SIGTERM", () => {
  console.log("🛑  Received SIGTERM — exiting gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑  Received SIGINT — exiting gracefully");
  process.exit(0);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  console.error("❌  PORT env var is not set — defaulting to 3000");
}

const port = Number(rawPort ?? "3000");

if (Number.isNaN(port) || port <= 0) {
  console.error(`❌  Invalid PORT value: "${rawPort}" — defaulting to 3000`);
}

const listenPort = (Number.isNaN(port) || port <= 0) ? 3000 : port;

console.log(`🚀  Starting server on port ${listenPort} (NODE_ENV=${process.env.NODE_ENV})`);

const server = app.listen(listenPort, () => {
  logger.info({ port: listenPort }, "Server listening");
});

server.on("error", (err) => {
  console.error("❌  Server error:", err);
});
