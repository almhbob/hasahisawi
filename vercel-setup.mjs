import fs from "fs/promises";
import path from "path";

const DIST_DIR = "artifacts/api-server/dist";
const OUT_DIR = ".vercel/output";
const FUNC_DIR = `${OUT_DIR}/functions/server.func`;

async function setup() {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(FUNC_DIR, { recursive: true });

  const files = await fs.readdir(DIST_DIR);
  for (const file of files) {
    const src = path.join(DIST_DIR, file);
    const stat = await fs.stat(src);
    if (stat.isFile()) {
      await fs.copyFile(src, path.join(FUNC_DIR, file));
    }
  }

  await fs.writeFile(
    path.join(FUNC_DIR, ".vc-config.json"),
    JSON.stringify({
      runtime: "nodejs20.x",
      handler: "vercel-handler.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: true,
      maxDuration: 30,
    })
  );

  await fs.writeFile(
    path.join(OUT_DIR, "config.json"),
    JSON.stringify({
      version: 3,
      routes: [
        { src: "^/uploads/(.*)", dest: "/server" },
        { src: "^/api/(.*)", dest: "/server" },
        { src: "^/health$", dest: "/server" },
        { src: "/(.*)", dest: "/server" },
      ],
    })
  );

  console.log("✅ Vercel output structure prepared (functions/server.func)");
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
