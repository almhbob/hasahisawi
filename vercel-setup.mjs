import fs from "fs/promises";
import path from "path";

const DIST_DIR = "artifacts/api-server/dist";

async function setup() {
  // Create api/ directory in project root for Vercel native function detection
  await fs.mkdir("api", { recursive: true });

  // Copy the self-contained Express bundle as the serverless function entry point
  await fs.copyFile(
    path.join(DIST_DIR, "vercel-handler.mjs"),
    "api/index.mjs"
  );

  // Copy pino worker files needed at runtime (they're loaded dynamically)
  const pinoFiles = ["pino-worker.mjs", "pino-file.mjs", "pino-pretty.mjs", "thread-stream-worker.mjs"];
  for (const file of pinoFiles) {
    const src = path.join(DIST_DIR, file);
    try {
      await fs.copyFile(src, path.join("api", file));
    } catch {
      // Not critical if pino workers are missing
    }
  }

  console.log("✅ api/index.mjs created from build output");
  console.log("   Express app ready for Vercel native function runtime");
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
