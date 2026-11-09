// يصدّر فيديو لكل نص من كتاب «أشياء لا تقال» (texts-unsaid.json) إلى out/unsaid/
// الاستخدام: node render-unsaid.mjs        (الخمسون كلها)
//           node render-unsaid.mjs 1 7     (النصوص من 1 إلى 7)
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync } from "node:fs";

const texts = JSON.parse(readFileSync("texts-unsaid.json", "utf8"));
const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? texts.length);
const outDir = process.env.OUT_DIR || "out/unsaid";
mkdirSync(outDir, { recursive: true });
const browser = existsSync("/opt/pw-browsers/chromium") ? ["--browser-executable=/opt/pw-browsers/chromium"] : [];

for (const t of texts.filter((x) => x.n >= from && x.n <= to)) {
  const props = {
    n: t.n,
    title: t.title,
    lines: t.lines,
    author: "عاصم عبدالرحمن محمد",
    authorNote: "كاتب سوداني من الحصاحيصا",
    cta: "تابع السلسلة… 50 نصاً لا تقال",
  };
  const file = `${outDir}/${String(t.n).padStart(2, "0")}.mp4`;
  console.log(`▶ ${file}`);
  execFileSync("npx", ["remotion", "render", "UnsaidVideo", file, `--props=${JSON.stringify(props)}`, ...browser], {
    stdio: "inherit",
  });
}
