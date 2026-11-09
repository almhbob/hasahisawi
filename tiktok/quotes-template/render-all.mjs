// يصدّر فيديو لكل حكمة في quotes.json إلى مجلد out/
// الاستخدام: node render-all.mjs            (الكل)
//           node render-all.mjs 5 10        (من اليوم 5 إلى 10)
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync } from "node:fs";

const quotes = JSON.parse(readFileSync("quotes.json", "utf8"));
const screenshots = ["screen-services.png", "screen-home.png"];
const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? quotes.length);
mkdirSync("out", { recursive: true });

const browser = existsSync("/opt/pw-browsers/chromium") ? ["--browser-executable=/opt/pw-browsers/chromium"] : [];

for (let day = from; day <= to; day++) {
  const q = quotes[day - 1];
  if (!q) break;
  const props = {
    day,
    label: "حكمة اليوم",
    quote: q.quote,
    author: q.author ?? "",
    tagline: "كل خدمات الحصاحيصا في تطبيق واحد",
    cta: "حمّله مجاناً من Google Play",
    screenshot: screenshots[day % screenshots.length],
  };
  const file = `out/day-${String(day).padStart(2, "0")}.mp4`;
  console.log(`▶ ${file}: ${q.quote}`);
  execFileSync(
    "npx",
    ["remotion", "render", "QuoteVideo", file, `--props=${JSON.stringify(props)}`, ...browser],
    { stdio: "inherit" },
  );
}
