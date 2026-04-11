import fs from "fs/promises";
import path from "path";

const DIST_DIR = "artifacts/api-server/dist";
const OUT_DIR = ".vercel/output";

async function setup() {
  // Clean previous output
  await fs.rm(OUT_DIR, { recursive: true, force: true });

  // Create Vercel Build Output API v3 directory structure
  const funcDir = path.join(OUT_DIR, "functions", "api", "index.func");
  await fs.mkdir(funcDir, { recursive: true });

  // Copy the Express bundle as the serverless function
  await fs.copyFile(
    path.join(DIST_DIR, "vercel-handler.mjs"),
    path.join(funcDir, "index.mjs")
  );

  // Copy pino worker files (loaded dynamically at runtime)
  const pinoFiles = ["pino-worker.mjs", "pino-file.mjs", "pino-pretty.mjs", "thread-stream-worker.mjs"];
  for (const file of pinoFiles) {
    try {
      await fs.copyFile(
        path.join(DIST_DIR, file),
        path.join(funcDir, file)
      );
    } catch { /* not critical */ }
  }

  // Vercel function configuration
  await fs.writeFile(
    path.join(funcDir, ".vc-config.json"),
    JSON.stringify({
      runtime: "nodejs20.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: true,
      shouldAddSourcemapSupport: false,
    }, null, 2)
  );

  // Vercel output routing config — catch all requests → serverless function
  await fs.writeFile(
    path.join(OUT_DIR, "config.json"),
    JSON.stringify({
      version: 3,
      routes: [
        {
          src: "/(.*)",
          dest: "/api/index",
        },
      ],
    }, null, 2)
  );

  console.log("✅ .vercel/output/ built via Build Output API v3");
  console.log("   Functions: .vercel/output/functions/api/index.func/");
  console.log("   Routes: /* → /api/index (serverless)");
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
