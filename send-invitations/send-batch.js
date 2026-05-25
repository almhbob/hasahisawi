#!/usr/bin/env node
const https = require("https");
const fs = require("fs");
const path = require("path");

const KEY  = "re_7vXGNa9g_26LuYYjtVsbyTkjD5VtiNcxM";
const TMPL = fs.readFileSync(path.join(__dirname, "email-template.html"), "utf8");

// ٧ إيميلات حقيقية موثّقة من المواقع الرسمية
const ORGS = [
  { name: "جامعة الجزيرة",                     email: "info@uofg.edu.sd",         fwd: "info@uofg.edu.sd" },
  { name: "كلية الحصاحيصا للعلوم الطبية HCMST", email: "info@el-majd.com",          fwd: "info@el-majd.com" },
  { name: "كلية الجزيرة للعلوم الطبية",         email: "hashimtree@gmail.com",      fwd: "hashimtree@gmail.com" },
  { name: "جامعة البطانة",                      email: "info@albutana.edu.sd",      fwd: "info@albutana.edu.sd" },
  { name: "بنك الخرطوم",                        email: "info@bok.sd",               fwd: "info@bok.sd" },
  { name: "هيئة البحوث الزراعية السودانية",      email: "info@arc.gov.sd",           fwd: "info@arc.gov.sd" },
  { name: "وحدة التمويل الأصغر MFU",             email: "info.mfu@cbos.gov.sd",      fwd: "info.mfu@cbos.gov.sd" },
];

function sendEmail(org) {
  return new Promise((resolve) => {
    const html = `
<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:linear-gradient(135deg,#0B2E1A,#0F4228);padding:36px 32px;text-align:center">
    <div style="font-size:44px">🌿</div>
    <h1 style="color:#2ECC71;margin:8px 0 0;font-size:28px">حصاحيصاوي</h1>
    <p style="color:#a7f3d0;margin:8px 0 0;font-size:14px">المنصة الرقمية الأولى لأبناء ولاية الجزيرة</p>
  </div>

  <!-- ملاحظة الإحالة -->
  <div style="background:#fef9c3;border-bottom:1px solid #fde68a;padding:12px 24px;font-size:13px;color:#92400e;text-align:center">
    📧 هذه الدعوة موجّهة لـ <strong>${org.name}</strong> — يُرجى إعادة إرسالها لـ: <strong>${org.fwd}</strong>
  </div>

  <div style="padding:32px">
    <p style="font-size:17px;color:#1e293b;line-height:1.8">السلام عليكم ورحمة الله وبركاته،</p>
    <p style="font-size:16px;color:#334155;line-height:1.9">
      يسرّنا توجيه هذه الدعوة الخاصة لـ <strong style="color:#16a34a">${org.name}</strong> للانضمام إلى
      <strong>منصة حصاحيصاوي</strong> — المنصة الرقمية المجتمعية الأولى لأبناء ولاية الجزيرة.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:20px 0">
      <h3 style="color:#16a34a;margin:0 0 14px">ما نقدمه لمؤسستكم — مجاناً:</h3>
      <div style="color:#374151;line-height:2.2;font-size:15px">
        ✅ حضور رقمي أمام أكثر من <strong>٥٠٠٠ مستخدم</strong> من أبناء المنطقة<br>
        ✅ نشر الأخبار والفعاليات والإعلانات مباشرة للمجتمع<br>
        ✅ استقبال الطلبات والتسجيلات إلكترونياً<br>
        ✅ دليل المؤسسات وخريطة الخدمات المحلية<br>
        ✅ قناة تواصل مباشرة مع مستخدمي المنطقة
      </div>
    </div>

    <div style="text-align:center;margin:28px 0">
      <a href="https://almhbob.github.io/hasahisawi/"
         style="background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;text-decoration:none;padding:15px 36px;border-radius:12px;font-size:17px;font-weight:bold;display:inline-block">
        سجّل مؤسستك الآن ←
      </a>
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px">
      <p style="margin:0;font-size:14px;color:#92400e;line-height:1.7">
        💡 <strong>التسجيل لا يستغرق سوى دقيقتين</strong> —
        يتواصل فريقنا معكم خلال ٤٨ ساعة لإتمام الإعداد.
      </p>
    </div>
  </div>

  <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:14px;color:#64748b">للاستفسار: <strong style="color:#16a34a">almhbob.2024@gmail.com</strong></p>
    <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">فريق منصة حصاحيصاوي · ولاية الجزيرة، السودان · 2026</p>
  </div>
</div>
</body></html>`;

    const payload = JSON.stringify({
      from: "حصاحيصاوي <onboarding@resend.dev>",
      to:   ["almhbob.iii@gmail.com"],
      subject: `[أعِد الإرسال لـ ${org.fwd}] دعوة انضمام — منصة حصاحيصاوي`,
      html,
      reply_to: "almhbob.2024@gmail.com",
    });

    const req = https.request({
      hostname: "api.resend.com", path: "/emails", method: "POST",
      headers: {
        "Authorization": `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        const ok = res.statusCode === 200;
        console.log(ok ? "✅" : "❌", `[${res.statusCode}]`, org.name.padEnd(38), "→ Gmail (أعِد الإرسال لـ", org.fwd + ")");
        if (!ok) console.log("   ↳", d.slice(0, 120));
        resolve({ org, ok });
      });
    });
    req.on("error", e => { console.log("❌", e.message); resolve({ org, ok: false }); });
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("━".repeat(68));
  console.log("🌿 إرسال دعوات حصاحيصاوي — ٧ مؤسسات");
  console.log("📬 وجهة الإرسال: almhbob.iii@gmail.com (أعِد إرسالها للمؤسسات)");
  console.log("━".repeat(68));
  let ok = 0;
  for (const org of ORGS) {
    const r = await sendEmail(org);
    if (r.ok) ok++;
    await new Promise(r => setTimeout(r, 700));
  }
  console.log("━".repeat(68));
  console.log(`✅ أُرسل: ${ok}/${ORGS.length} إيميل إلى صندوق بريدك جاهزة للإحالة`);
  console.log("━".repeat(68));
}
main().catch(console.error);
