import { chromium } from "playwright";
const base = "http://127.0.0.1:3000";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 1 });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
async function shot(path, name, act) {
  await p.goto(base + path, { waitUntil: "networkidle" }).catch(() => {});
  await p.waitForTimeout(3500);
  if (act) await act();
  await p.screenshot({ path: `/tmp/shots/${name}.jpg`, type: "jpeg", quality: 55 });
}
await shot("/edu-hub", "edu-student");
await shot("/edu-hub?role=teacher", "edu-teacher");
await shot("/edu-hub?tool=shahada", "shahada", async () => {
  const inputs = await p.locator("input[inputmode=decimal]").all();
  const vals = ["95", "88", "91", "76", "84", "90", "67", "99"];
  for (let i = 0; i < Math.min(inputs.length, vals.length); i++) await inputs[i].fill(vals[i]);
  await p.waitForTimeout(800);
  await p.mouse.wheel(0, 700); await p.waitForTimeout(600);
});
await shot("/edu-hub?role=teacher&tool=exams", "exams");
await shot("/lawyers", "lawyers");
console.log("pageerrors:", JSON.stringify(errs.slice(0, 5)));
await b.close();
