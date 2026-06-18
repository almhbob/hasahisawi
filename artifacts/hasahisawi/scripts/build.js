const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      EXPO_PUBLIC_DISABLE_OTP: process.env.EXPO_PUBLIC_DISABLE_OTP || "false",
      ...env,
    },
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function cleanDist() {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
}

console.log("Building Hasahisawi web bundle with Expo export...");
cleanDist();
run("pnpm", ["exec", "expo", "export", "--platform", "web"]);

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error("Build completed but dist/index.html was not created.");
  process.exit(1);
}

console.log("Web build completed successfully: dist/");
