#!/usr/bin/env node
// نظام إرسال الدعوات — حصاحيصاوي
// التشغيل: node send.js

const https = require("https");
const fs = require("fs");
const path = require("path");

const RESEND_API_KEY = "re_7vXGNa9g_26LuYYjtVsbyTkjD5VtiNcxM";
const FROM = "حصاحيصاوي <onboarding@resend.dev>";
const TEMPLATE = fs.readFileSync(path.join(__dirname, "email-template.html"), "utf8");

// ─── قائمة المؤسسات المستهدفة ──────────────────────────────────────────────
const ORGANIZATIONS = [
  // ── جامعات ومعاهد ──────────────────────────────────────────────────────
  { name: "جامعة الجزيرة",                    email: "info@uofg.edu.sd",           type: "university" },
  { name: "أكاديمية العلوم الصحية - الحصاحيصا", email: "info@ahshs.org",             type: "university" },
  { name: "جامعة المناقل للعلوم والتكنولوجيا", email: "info@must.edu.sd",           type: "university" },
  { name: "جامعة البطانة",                    email: "info@albutana.edu.sd",       type: "university" },
  { name: "كلية الجزيرة للعلوم الطبية",       email: "info@geziracollegesudan.com",type: "university" },

  // ── الأرقام الموجودة (تُرسَل عبر واتساب) ──────────────────────────────
  // كلية الجزيرة: 00249912349947
  // جامعة البطانة: +249129532662
  // بنك الخرطوم ود مدني: 00249511841261
];

// دالة إرسال إيميل واحد
function sendEmail(org) {
  return new Promise((resolve) => {
    const subject =
      org.type === "university"
        ? `دعوة للانضمام إلى حصاحيصاوي — منصة رقمية لأبناء الجزيرة`
        : `دعوة شراكة رقمية — منصة حصاحيصاوي`;

    const html = TEMPLATE
      .replace(/للمؤسسة/g, `لـ ${org.name}`);

    const payload = JSON.stringify({
      from: FROM,
      to: [org.email],
      subject,
      html,
      reply_to: "almhbob.2024@gmail.com",
    });

    const req = https.request(
      {
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const ok = res.statusCode === 200 || res.statusCode === 201;
          console.log(
            ok ? "✅" : "❌",
            `[${res.statusCode}]`,
            org.name.padEnd(40),
            "→",
            org.email
          );
          if (!ok) console.log("   ↳", data);
          resolve({ org, ok, status: res.statusCode });
        });
      }
    );
    req.on("error", (e) => {
      console.log("❌", org.name, "→", e.message);
      resolve({ org, ok: false, error: e.message });
    });
    req.write(payload);
    req.end();
  });
}

// ─── الإرسال مع تأخير بين كل إيميل ─────────────────────────────────────────
async function main() {
  console.log("━".repeat(60));
  console.log("🌿 نظام إرسال دعوات حصاحيصاوي");
  console.log(`📧 إجمالي المؤسسات: ${ORGANIZATIONS.length}`);
  console.log("━".repeat(60));

  const results = [];
  for (const org of ORGANIZATIONS) {
    const result = await sendEmail(org);
    results.push(result);
    await new Promise((r) => setTimeout(r, 800)); // تأخير 0.8 ثانية بين الإرسال
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log("\n" + "━".repeat(60));
  console.log(`✅ نجح: ${succeeded} | ❌ فشل: ${failed}`);
  console.log("━".repeat(60));

  // حفظ النتائج
  fs.writeFileSync(
    path.join(__dirname, "results.json"),
    JSON.stringify({ sentAt: new Date().toISOString(), results }, null, 2)
  );
  console.log("📄 النتائج حُفظت في results.json");
}

main().catch(console.error);
