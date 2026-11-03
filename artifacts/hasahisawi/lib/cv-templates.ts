// قوالب السيرة الذاتية — كل قالب يُنتج HTML بمقاس A4 (794×1123) يُطبع PDF ويُعرض في المعاينة الحيّة
export type CVTemplateId = "nile" | "band" | "editorial" | "cards" | "ats" | "bold" | "hexa" | "diagonal" | "accent" | "arch";

export type CVData = {
  name: string; title: string; phone: string; email: string; address: string; website: string; summary: string;
  education: { degree: string; institution: string; year: string }[];
  experience: { position: string; company: string; period: string; desc: string }[];
  skills: string[]; languages: string[]; courses: string[];
  photoUri?: string; showPhoto: boolean;
};

export type CVTemplateMeta = {
  id: CVTemplateId; name: string; desc: string; bestFor: string;
  colors: string[]; photo: boolean; font: string;
  /** قالب مميز: يُفتح بطلب تعتمده الإدارة؛ يُعرض قبلها بعلامة «معاينة» */
  premium?: boolean;
};

export const CV_TEMPLATES: CVTemplateMeta[] = [
  { id: "nile", name: "النيل", desc: "خط زمني للخبرات ونقاط واضحة", bestFor: "المحاسبة · الإدارة · الوظائف الحكومية", colors: ["#0E5A80", "#0E9C64", "#C26D3D", "#06325A"], photo: false, font: "IBM Plex Sans Arabic" },
  { id: "band", name: "الشريط", desc: "شريط علوي بالصورة وعمودان مرتّبان", bestFor: "التقنية · الهندسة · الصحة", colors: ["#0B7A4E", "#0E5A80", "#C26D3D", "#06325A"], photo: true, font: "Cairo" },
  { id: "editorial", name: "المحرّر", desc: "خط عربي فاخر على ورق عاجي", bestFor: "التعليم · الكتابة · الأكاديميا", colors: ["#9A4F26", "#0E5A80", "#0B7A4E", "#06325A"], photo: false, font: "Amiri" },
  { id: "cards", name: "البطاقات", desc: "أقسام في بطاقات ووسوم للمهارات", bestFor: "الحِرف · الفنيون · الخدمات", colors: ["#0B7A4E", "#0E5A80", "#C26D3D", "#06325A"], photo: true, font: "Cairo" },
  { id: "ats", name: "ATS", desc: "نص فقط بلا أعمدة — تقرؤه أنظمة الفرز", bestFor: "التقديم الإلكتروني · الشركات الكبيرة", colors: ["#111827", "#0E5A80", "#0B7A4E", "#9A4F26"], photo: false, font: "IBM Plex Sans Arabic" },
  { id: "hexa", name: "السداسي", desc: "إطار سداسي للصورة وشريط داكن وعمود رملي بمؤشرات المهارات", bestFor: "التصميم · الهندسة · ريادة الأعمال", colors: ["#2F3342", "#1F3A4D", "#3B2F2A", "#22362B"], photo: true, font: "Cairo", premium: true },
  { id: "diagonal", name: "القطري", desc: "تقسيم قطري أنيق بصورة دائرية وتقييم بالنجوم", bestFor: "الإعلام · التسويق · الإدارة", colors: ["#2B2B2D", "#1F2F3F", "#3A2B2B", "#24332A"], photo: true, font: "Cairo", premium: true },
  { id: "accent", name: "اللمسة الذهبية", desc: "عمود داكن بصورة مقوّسة ولمسات صفراء جريئة", bestFor: "الإبداع · التقنية · المبيعات", colors: ["#F2C230", "#2EC4B6", "#FF7A45", "#9AD94A"], photo: true, font: "Cairo", premium: true },
  { id: "arch", name: "القوس", desc: "عمود مقوّس بأشرطة عناوين وخط زمني منقّط", bestFor: "المحاسبة · التعليم · الخدمات", colors: ["#6E6E6E", "#2F5D62", "#5B4B6E", "#7A5C3E"], photo: true, font: "Cairo", premium: true },
  { id: "bold", name: "الجريء", desc: "شريط جانبي داكن بالصورة ولمسة ذهبية", bestFor: "التسويق · التصميم · المبيعات", colors: ["#06325A", "#0F1C2B", "#0B3D2A", "#3A1F12"], photo: true, font: "Cairo" },
];

const e = (v?: string) => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl = (v?: string) => e(v).replace(/\n/g, "<br>");

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet">`;
const BASE = `*{box-sizing:border-box}html,body{margin:0;padding:0}@page{size:A4;margin:0}body{width:794px;min-height:1123px;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1,h2,h3,p{margin:0}.ltr{direction:ltr;unicode-bidi:embed}.foot{font-size:10px;color:#9AA4AC}`;

function doc(body: string, css: string, font: string) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=794">${FONTS}<style>${BASE}body{font-family:'${font}',Tahoma,Arial,sans-serif}${css}</style></head><body>${body}</body></html>`;
}

function clean(cv: CVData) {
  return {
    exp: cv.experience.filter((x) => x.position || x.company),
    edu: cv.education.filter((x) => x.degree || x.institution),
    skills: cv.skills.map((s) => s.trim()).filter(Boolean),
    langs: cv.languages.map((s) => s.trim()).filter(Boolean),
    courses: cv.courses.map((s) => s.trim()).filter(Boolean),
    contact: [cv.phone && { v: cv.phone, ltr: true }, cv.email && { v: cv.email, ltr: true }, cv.website && { v: cv.website, ltr: true }, cv.address && { v: cv.address, ltr: false }].filter(Boolean) as { v: string; ltr: boolean }[],
    name: cv.name.trim() || "الاسم الكامل",
    title: cv.title.trim(),
  };
}

const initials = (n: string) => n.replace(/^(د\.|أ\.|م\.)\s*/, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join(".");
const PERSON = (fill: string, op = 0.9) => `<svg viewBox="0 0 24 24" width="56%" height="56%" fill="none" stroke="${fill}" stroke-width="1.6" stroke-linecap="round" opacity="${op}"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

// ── 1. النيل ───────────────────────────────────────────────
function nile(cv: CVData, c: string, photo?: string) {
  const d = clean(cv);
  const exp = d.exp.map((x, i) => `<div class="tl"><span class="dot ${i ? "o" : ""}"></span>${x.period ? `<span class="per">${e(x.period)}</span>` : ""}<h3>${e(x.position)}${x.company ? ` — ${e(x.company)}` : ""}</h3>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("");
  const edu = d.edu.map((x) => `<div class="ed"><h3>${e(x.degree)}</h3><span>${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div>`).join("");
  const css = `.pg{padding:64px 68px;display:flex;flex-direction:column;gap:30px;color:#14212B;min-height:1123px}
  .hd{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding-bottom:24px;border-bottom:2px solid #14212B}
  .hd h1{font-size:42px;font-weight:700;line-height:1.15}.hd .role{font-size:18px;font-weight:500;color:${c};margin-top:6px}
  .ct{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:#4A5A66;text-align:left}
  .ph{width:96px;height:96px;border-radius:48px;object-fit:cover;border:3px solid ${c}}
  .sum{font-size:14.5px;line-height:1.9;color:#33424D}
  .grid{display:grid;grid-template-columns:2fr 1fr;gap:40px;flex:1}
  h2{font-size:13px;font-weight:700;letter-spacing:2px;color:${c};margin-bottom:14px}
  .tls{border-right:2px solid #E3E8EC;padding-right:22px;display:flex;flex-direction:column;gap:20px;margin-bottom:26px}
  .tl{position:relative}.dot{position:absolute;right:-29px;top:6px;width:12px;height:12px;border-radius:6px;background:${c}}.dot.o{background:#fff;border:2px solid ${c}}
  .per{font-size:12px;color:#6B7A85;display:block;margin-bottom:2px}.tl h3,.ed h3{font-size:16px;font-weight:700}.tl p{font-size:13.5px;line-height:1.85;color:#3D4C57;margin-top:4px}
  .ed{margin-bottom:10px}.ed span{font-size:13px;color:#4A5A66}
  .side{display:flex;flex-direction:column;gap:26px}.li{font-size:13.5px;line-height:1.7;display:flex;gap:8px;align-items:baseline}.li:before{content:"";width:6px;height:6px;border-radius:3px;background:${c};flex-shrink:0;transform:translateY(-2px)}
  .ft{display:flex;justify-content:space-between;border-top:1px solid #E3E8EC;padding-top:12px}`;
  return doc(`<div class="pg">
    <div class="hd"><div style="display:flex;gap:18px;align-items:center">${photo ? `<img class="ph" src="${photo}">` : ""}<div><h1>${e(d.name)}</h1>${d.title ? `<p class="role">${e(d.title)}</p>` : ""}</div></div>
    <div class="ct">${d.contact.map((x) => `<span class="${x.ltr ? "ltr" : ""}">${e(x.v)}</span>`).join("")}</div></div>
    ${cv.summary ? `<p class="sum">${nl(cv.summary)}</p>` : ""}
    <div class="grid"><div>${d.exp.length ? `<h2>الخبرات العملية</h2><div class="tls">${exp}</div>` : ""}${d.edu.length ? `<h2>التعليم</h2>${edu}` : ""}</div>
    <div class="side">${d.skills.length ? `<div><h2>المهارات</h2>${d.skills.map((s) => `<div class="li">${e(s)}</div>`).join("")}</div>` : ""}
    ${d.langs.length ? `<div><h2>اللغات</h2>${d.langs.map((s) => `<div class="li">${e(s)}</div>`).join("")}</div>` : ""}
    ${d.courses.length ? `<div><h2>الدورات</h2>${d.courses.map((s) => `<div class="li">${e(s)}</div>`).join("")}</div>` : ""}</div></div>
    <div class="ft foot"><span>المراجع تُقدَّم عند الطلب</span><span>أُنشئت عبر حصاحيصاوي</span></div></div>`, css, "IBM Plex Sans Arabic");
}

// ── 2. الشريط ──────────────────────────────────────────────
function band(cv: CVData, c: string, photo?: string) {
  const d = clean(cv);
  const sec = (t: string) => `<h2 class="mh"><span></span>${t}</h2>`;
  const css = `.pg{display:flex;flex-direction:column;min-height:1123px;color:#17251E}
  .top{background:${c};color:#fff;padding:46px 56px 40px;display:flex;align-items:center;gap:28px}
  .av{width:124px;height:124px;border-radius:62px;background:rgba(255,255,255,.18);border:4px solid rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}.av img{width:100%;height:100%;object-fit:cover}
  .top h1{font-size:40px;font-weight:800;line-height:1.2}.top .role{font-size:18px;font-weight:600;opacity:.92}.top .ct{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;opacity:.92}
  .cols{display:flex;flex:1}.sd{width:250px;background:#F3F6F4;padding:34px 28px;display:flex;flex-direction:column;gap:26px}
  .sd h2{font-size:15px;font-weight:800;color:${c};margin-bottom:10px}.sd p{font-size:13px;line-height:1.9;color:#3B4A43}
  .chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font-size:12px;background:#fff;border:1px solid #DCE5E0;border-radius:8px;padding:3px 9px}
  .mn{flex:1;padding:34px 44px;display:flex;flex-direction:column;gap:20px}
  .mh{font-size:19px;font-weight:800;display:flex;align-items:center;gap:10px}.mh span{width:26px;height:4px;border-radius:2px;background:${c}}
  .it .r{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.it h3{font-size:16px;font-weight:700}.it .d{font-size:12px;color:#6A7A72;white-space:nowrap}.it .co{font-size:13.5px;font-weight:600;color:${c}}.it p{font-size:13.5px;line-height:1.85;color:#3B4A43;margin-top:4px}
  .sm{font-size:13px;line-height:1.8}`;
  const avatar = cv.showPhoto ? `<div class="av">${photo ? `<img src="${photo}">` : PERSON("#fff")}</div>` : "";
  return doc(`<div class="pg"><div class="top">${avatar}<div><h1>${e(d.name)}</h1>${d.title ? `<p class="role">${e(d.title)}</p>` : ""}<div class="ct">${d.contact.map((x) => `<span class="${x.ltr ? "ltr" : ""}">${e(x.v)}</span>`).join("")}</div></div></div>
  <div class="cols"><div class="sd">${cv.summary ? `<div><h2>نبذة</h2><p>${nl(cv.summary)}</p></div>` : ""}
  ${d.skills.length ? `<div><h2>المهارات</h2><div class="chips">${d.skills.map((s) => `<span class="chip">${e(s)}</span>`).join("")}</div></div>` : ""}
  ${d.langs.length ? `<div><h2>اللغات</h2><div class="sm">${d.langs.map(e).join(" · ")}</div></div>` : ""}
  ${d.courses.length ? `<div><h2>الدورات</h2>${d.courses.map((s) => `<div class="sm">${e(s)}</div>`).join("")}</div>` : ""}</div>
  <div class="mn">${d.exp.length ? sec("الخبرات") + d.exp.map((x) => `<div class="it"><div class="r"><h3>${e(x.position)}</h3>${x.period ? `<span class="d">${e(x.period)}</span>` : ""}</div>${x.company ? `<div class="co">${e(x.company)}</div>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("") : ""}
  ${d.edu.length ? sec("التعليم") + d.edu.map((x) => `<div class="it"><div class="r"><h3>${e(x.degree)}</h3>${x.year ? `<span class="d">${e(x.year)}</span>` : ""}</div><div class="sm">${e(x.institution)}</div></div>`).join("") : ""}</div></div></div>`, css, "Cairo");
}

// ── 3. المحرّر ─────────────────────────────────────────────
function editorial(cv: CVData, c: string) {
  const d = clean(cv);
  const row = (label: string, content: string) => `<h2>${label}</h2><div class="cell">${content}</div><div class="hr"></div>`;
  const css = `.pg{background:#FAF8F2;padding:72px 76px;min-height:1123px;display:flex;flex-direction:column;gap:24px;color:#1E1B16;font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif}
  .kick{font-size:12px;letter-spacing:3px;color:${c};font-weight:600}.serif{font-family:'Amiri',serif}
  h1{font-family:'Amiri',serif;font-size:62px;font-weight:700;line-height:1.1}.role{font-family:'Amiri',serif;font-size:22px;color:#55503F}
  .ct{display:flex;gap:26px;flex-wrap:wrap;font-size:12.5px;color:#55503F;border-top:1px solid #1E1B16;border-bottom:1px solid #1E1B16;padding:12px 0}
  .q{font-family:'Amiri',serif;font-size:21px;line-height:1.75;color:#2C2820}
  .g{display:grid;grid-template-columns:1fr 3fr;gap:18px 30px}.g h2{font-size:12px;letter-spacing:2px;color:${c};font-weight:600;padding-top:6px}
  .hr{grid-column:1/-1;height:1px;background:#D8D2C2}.cell{display:flex;flex-direction:column;gap:16px}
  .cell h3{font-family:'Amiri',serif;font-size:22px;font-weight:700}.cell .m{font-size:12.5px;color:#75705E}.cell p{font-size:13.5px;line-height:1.85;color:#3A352B;margin-top:4px}
  .flow{font-size:14px;line-height:2;color:#3A352B}.mono{font-family:'Amiri',serif;font-size:26px;color:${c}}`;
  const body = [
    d.exp.length && row("الخبرة", d.exp.map((x) => `<div><h3>${e(x.position)}</h3><span class="m">${e(x.company)}${x.period ? ` · ${e(x.period)}` : ""}</span>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")),
    d.edu.length && row("التعليم", d.edu.map((x) => `<div><h3>${e(x.degree)}</h3><span class="m">${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div>`).join("")),
    d.skills.length && row("المهارات", `<p class="flow">${d.skills.map(e).join(" · ")}</p>`),
    d.langs.length && row("اللغات", `<p class="flow">${d.langs.map(e).join(" · ")}</p>`),
    d.courses.length && row("الدورات", `<p class="flow">${d.courses.map(e).join("<br>")}</p>`),
  ].filter(Boolean).join("");
  return doc(`<div class="pg"><div style="display:flex;flex-direction:column;gap:8px"><span class="kick">السيرة الذاتية</span><h1>${e(d.name)}</h1>${d.title ? `<p class="role">${e(d.title)}</p>` : ""}</div>
  <div class="ct">${d.contact.map((x) => `<span class="${x.ltr ? "ltr" : ""}">${e(x.v)}</span>`).join("")}</div>
  ${cv.summary ? `<p class="q">«${nl(cv.summary)}»</p>` : ""}<div class="g">${body}</div><div style="flex:1"></div>
  <div style="display:flex;justify-content:space-between;align-items:center"><span class="mono">${e(initials(d.name))}</span><span class="foot">المراجع تُقدَّم عند الطلب · حصاحيصاوي</span></div></div>`, css, "IBM Plex Sans Arabic");
}

// ── 4. البطاقات ────────────────────────────────────────────
function cards(cv: CVData, c: string, photo?: string) {
  const d = clean(cv);
  const ICON = `<div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>`;
  const EDU = `<div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg></div>`;
  const css = `.pg{background:#F1F0E6;padding:48px 50px;min-height:1123px;display:flex;flex-direction:column;gap:18px;color:#1B2620}
  .card{background:#fff;border-radius:22px;padding:24px 28px}.card h2{font-size:15px;font-weight:800;margin-bottom:10px}
  .hd{display:flex;align-items:center;gap:22px}.av{width:96px;height:96px;border-radius:26px;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800;flex-shrink:0;overflow:hidden}.av img{width:100%;height:100%;object-fit:cover}
  .hd h1{font-size:32px;font-weight:800;line-height:1.25}.hd .role{font-size:16px;font-weight:600;color:${c}}
  .pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.pill{font-size:12px;background:#F1F0E6;border-radius:20px;padding:4px 12px}
  .stat{display:flex;flex-direction:column;align-items:center;background:#FFF6DA;border-radius:16px;padding:12px 16px}.stat b{font-size:30px;color:#8A6400;line-height:1.1}.stat span{font-size:11.5px;color:#6E5410;font-weight:600}
  .about{font-size:13.5px;line-height:1.9;color:#3D4A43}
  .grid{display:grid;grid-template-columns:3fr 2fr;gap:18px;flex:1}.col{display:flex;flex-direction:column;gap:18px}
  .row{display:flex;gap:14px;margin-bottom:16px}.ic{width:40px;height:40px;border-radius:12px;background:#E6F4EC;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .row h3{font-size:15px;font-weight:700}.row .m{font-size:12px;color:#6A766F}.row p{font-size:13px;line-height:1.8;color:#3D4A43;margin-top:4px}
  .tags{display:flex;flex-wrap:wrap;gap:7px}.tag{font-size:12.5px;font-weight:600;border-radius:10px;padding:5px 11px;background:#E6F4EC;color:#0B5A3A}.tag.on{background:${c};color:#fff}
  .ln{font-size:13px;line-height:1.8}`;
  const avatar = cv.showPhoto && photo ? `<img src="${photo}">` : e(initials(d.name));
  return doc(`<div class="pg"><div class="card hd"><div class="av">${avatar}</div><div style="flex:1"><h1>${e(d.name)}</h1>${d.title ? `<p class="role">${e(d.title)}</p>` : ""}
  <div class="pills">${d.contact.map((x) => `<span class="pill ${x.ltr ? "ltr" : ""}">${e(x.v)}</span>`).join("")}</div></div>
  ${d.exp.length ? `<div class="stat"><b>${d.exp.length}</b><span>${d.exp.length > 2 ? "خبرات" : d.exp.length === 2 ? "خبرتان" : "خبرة"}</span></div>` : ""}</div>
  ${cv.summary ? `<div class="card"><h2>عنّي</h2><p class="about">${nl(cv.summary)}</p></div>` : ""}
  <div class="grid"><div class="card">${d.exp.length || d.edu.length ? `<h2>الخبرات والتعليم</h2>` : ""}
  ${d.exp.map((x) => `<div class="row">${ICON}<div><h3>${e(x.position)}${x.company ? ` — ${e(x.company)}` : ""}</h3>${x.period ? `<span class="m">${e(x.period)}</span>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div></div>`).join("")}
  ${d.edu.map((x) => `<div class="row">${EDU}<div><h3>${e(x.degree)}</h3><span class="m">${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div></div>`).join("")}</div>
  <div class="col">${d.skills.length ? `<div class="card"><h2>المهارات</h2><div class="tags">${d.skills.map((s, i) => `<span class="tag ${i < 2 ? "on" : ""}">${e(s)}</span>`).join("")}</div></div>` : ""}
  ${d.courses.length ? `<div class="card"><h2>الشهادات والدورات</h2>${d.courses.map((s) => `<div class="ln">${e(s)}</div>`).join("")}</div>` : ""}
  ${d.langs.length ? `<div class="card" style="background:${c};color:#fff"><h2>اللغات</h2><div class="ln">${d.langs.map(e).join(" · ")}</div></div>` : ""}</div></div></div>`, css, "Cairo");
}

// ── 5. ATS ─────────────────────────────────────────────────
function ats(cv: CVData, c: string) {
  const d = clean(cv);
  const css = `.pg{padding:60px 70px;color:#111827;display:flex;flex-direction:column;gap:18px}
  .hd{text-align:center}.hd h1{font-size:32px;font-weight:700}.hd .role{font-size:15px;font-weight:500;color:#374151}.hd .ct{font-size:12.5px;color:#4B5563;margin-top:6px}
  h2{font-size:14px;font-weight:700;border-bottom:1.5px solid ${c};color:${c};padding-bottom:4px;margin-bottom:8px}
  .r{display:flex;justify-content:space-between;gap:12px}.r h3{font-size:14.5px;font-weight:700;color:#111827}.r span{font-size:12.5px;color:#4B5563;white-space:nowrap}
  p,li{font-size:13.5px;line-height:1.85;color:#1F2937}ul{margin:2px 0 10px;padding-right:18px}.blk{margin-bottom:10px}`;
  return doc(`<div class="pg"><div class="hd"><h1>${e(d.name)}</h1>${d.title ? `<p class="role">${e(d.title)}</p>` : ""}<p class="ct">${d.contact.map((x) => `<span class="${x.ltr ? "ltr" : ""}">${e(x.v)}</span>`).join(" · ")}</p></div>
  ${cv.summary ? `<div><h2>الملخص المهني</h2><p>${nl(cv.summary)}</p></div>` : ""}
  ${d.exp.length ? `<div><h2>الخبرة العملية</h2>${d.exp.map((x) => `<div class="blk"><div class="r"><h3>${e(x.position)}${x.company ? ` — ${e(x.company)}` : ""}</h3>${x.period ? `<span>${e(x.period)}</span>` : ""}</div>${x.desc ? `<ul>${x.desc.split(/\n+/).filter(Boolean).map((l) => `<li>${e(l.replace(/^[-•·]\s*/, ""))}</li>`).join("")}</ul>` : ""}</div>`).join("")}</div>` : ""}
  ${d.edu.length ? `<div><h2>التعليم</h2>${d.edu.map((x) => `<div class="blk r"><h3>${e(x.degree)}${x.institution ? ` — ${e(x.institution)}` : ""}</h3>${x.year ? `<span>${e(x.year)}</span>` : ""}</div>`).join("")}</div>` : ""}
  ${d.skills.length ? `<div><h2>المهارات</h2><p>${d.skills.map(e).join("، ")}</p></div>` : ""}
  ${d.langs.length ? `<div><h2>اللغات</h2><p>${d.langs.map(e).join("، ")}</p></div>` : ""}
  ${d.courses.length ? `<div><h2>الشهادات والدورات</h2><p>${d.courses.map(e).join("<br>")}</p></div>` : ""}</div>`, css, "IBM Plex Sans Arabic");
}

// ── 6. الجريء ──────────────────────────────────────────────
function bold(cv: CVData, c: string, photo?: string) {
  const d = clean(cv); const gold = "#F0B400";
  const css = `.pg{display:flex;min-height:1123px;color:#0F1C2B}
  .sd{width:280px;background:${c};color:#fff;padding:48px 30px;display:flex;flex-direction:column;gap:28px}
  .av{width:150px;height:150px;border-radius:75px;background:rgba(255,255,255,.08);border:5px solid ${gold};display:flex;align-items:center;justify-content:center;align-self:center;overflow:hidden}.av img{width:100%;height:100%;object-fit:cover}
  .sd h2{font-size:14px;font-weight:800;color:${gold};letter-spacing:1px;margin-bottom:10px}.sd .l{font-size:13px;line-height:1.9}
  .tg{display:flex;flex-wrap:wrap;gap:6px}.tg span{font-size:12px;border:1px solid rgba(255,255,255,.35);border-radius:8px;padding:3px 9px}
  .mn{flex:1;padding:56px 46px;display:flex;flex-direction:column;gap:24px}
  .mn h1{font-size:48px;font-weight:900;line-height:1.1;color:${c}}.role{display:inline-block;background:${gold};color:#2A1F00;font-size:15px;font-weight:800;padding:4px 14px;border-radius:8px;margin-top:10px}
  .sum{font-size:14px;line-height:1.9;color:#33414F}.mn h2{font-size:20px;font-weight:900;color:${c};margin-bottom:12px}
  .it{border-right:4px solid #D5DCE4;padding-right:14px;margin-bottom:14px}.it.f{border-color:${gold}}.it h3{font-size:16px;font-weight:800}.it .m{font-size:12.5px;color:#5B6878}.it p{font-size:13.5px;line-height:1.85;color:#33414F;margin-top:4px}`;
  return doc(`<div class="pg"><div class="sd">${cv.showPhoto ? `<div class="av">${photo ? `<img src="${photo}">` : PERSON("#fff")}</div>` : ""}
  ${d.contact.length ? `<div><h2>التواصل</h2>${d.contact.map((x) => `<div class="l ${x.ltr ? "ltr" : ""}" style="text-align:right">${e(x.v)}</div>`).join("")}</div>` : ""}
  ${d.skills.length ? `<div><h2>المهارات</h2><div class="tg">${d.skills.map((s) => `<span>${e(s)}</span>`).join("")}</div></div>` : ""}
  ${d.langs.length ? `<div><h2>اللغات</h2><div class="l">${d.langs.map(e).join(" · ")}</div></div>` : ""}
  ${d.courses.length ? `<div><h2>الدورات</h2>${d.courses.map((s) => `<div class="l">${e(s)}</div>`).join("")}</div>` : ""}</div>
  <div class="mn"><div><h1>${e(d.name)}</h1>${d.title ? `<span class="role">${e(d.title)}</span>` : ""}</div>${cv.summary ? `<p class="sum">${nl(cv.summary)}</p>` : ""}
  ${d.exp.length ? `<div><h2>الخبرات</h2>${d.exp.map((x, i) => `<div class="it ${i ? "" : "f"}"><h3>${e(x.position)}${x.company ? ` — ${e(x.company)}` : ""}</h3>${x.period ? `<span class="m">${e(x.period)}</span>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div>` : ""}
  ${d.edu.length ? `<div><h2>التعليم</h2>${d.edu.map((x) => `<div class="it"><h3>${e(x.degree)}</h3><span class="m">${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div>`).join("")}</div>` : ""}</div></div>`, css, "Cairo");
}


// ══════════════ القوالب المميزة (Premium) ══════════════
// تصاميم أصلية مستوحاة من أنماط عصرية: إطار سداسي، تقسيم قطري، عمود بلمسة صفراء، عمود مقوّس بأشرطة.
const darken = (hex: string, amt = 34) => {
  const n = parseInt(hex.replace("#", ""), 16); const f = (v: number) => Math.max(0, v - amt);
  return `#${((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`;
};
const levels = (n: number) => Array.from({ length: n }, (_, i) => Math.max(55, 94 - i * 8));

// ── 7. السداسي ────────────────────────────────────────────
function hexa(cv: CVData, c: string, photo?: string) {
  const d = clean(cv); const sand = "#CDBE9C"; const lv = levels(d.skills.length);
  const hex = "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)";
  const css = `.pg{position:relative;min-height:1123px;background:#F4F4F2;color:#2A2E3A}
  .band{position:absolute;top:0;right:0;left:0;height:250px;background:${c}}
  .side{position:absolute;top:0;right:48px;width:260px;bottom:0;background:${sand}}
  .hexw{position:absolute;top:30px;right:58px;width:240px;height:270px;clip-path:${hex};background:${sand};z-index:2;display:flex;align-items:center;justify-content:center}
  .hexi{width:212px;height:240px;clip-path:${hex};background:${c};display:flex;align-items:center;justify-content:center;overflow:hidden}.hexi img{width:100%;height:100%;object-fit:cover}
  .nm{position:absolute;top:70px;left:56px;right:360px;border:2px solid ${sand};padding:18px 22px;text-align:center;z-index:2}
  .nm h1{font-size:34px;font-weight:800;color:#fff;letter-spacing:1px;line-height:1.25}.nm h1 b{color:${sand};font-weight:800}.nm p{color:#E9E3D3;font-size:14px;letter-spacing:2px;margin-top:6px;font-weight:600}
  .sc{position:absolute;top:320px;right:48px;width:260px;padding:0 0 30px;z-index:2;display:flex;flex-direction:column;gap:22px}
  .tab{background:${c};color:#fff;font-size:15px;font-weight:800;letter-spacing:2px;padding:9px 26px 9px 18px;margin-right:-0px;clip-path:polygon(0 0,100% 0,100% 100%,0 100%,12px 50%);text-align:center;width:88%}
  .ci{display:flex;align-items:center;gap:12px;font-size:12.5px;color:#2A2E3A;margin:7px 0}.ci i{width:40px;height:26px;background:${c};clip-path:polygon(0 0,100% 0,82% 100%,0 100%);display:block;flex-shrink:0}
  .pad{padding:0 22px}.sk{display:flex;align-items:center;gap:10px;font-size:12px;margin:7px 0}.sk span{width:96px;flex-shrink:0}.bar{flex:1;height:9px;background:#fff;clip-path:polygon(0 0,100% 0,96% 100%,0 100%)}.bar b{display:block;height:100%;background:${c}}
  .mn{position:absolute;top:290px;right:340px;left:48px;display:flex;flex-direction:column;gap:20px;padding-bottom:40px}
  .mt{background:${c};color:#fff;font-size:16px;font-weight:800;letter-spacing:3px;padding:9px 22px;width:72%;clip-path:polygon(0 0,94% 0,100% 100%,0 100%);margin-right:-24px}
  .it{margin:8px 0 4px}.it .y{font-size:11.5px;font-weight:700;color:#6B6658}.it h3{font-size:15px;font-weight:800}.it p{font-size:12.5px;line-height:1.75;color:#5A5F6B}
  .lg{display:flex;gap:16px;flex-wrap:wrap;margin-top:6px}.ring{width:64px;height:64px;border-radius:32px;background:conic-gradient(${c} var(--p),#DDD8CB 0);display:flex;align-items:center;justify-content:center}.ring span{width:52px;height:52px;border-radius:26px;background:#F4F4F2;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;text-align:center;line-height:1.2}
  .sum{font-size:13.5px;line-height:1.9;color:#454A56}`;
  return doc(`<div class="pg"><div class="band"></div><div class="side"></div>
  ${cv.showPhoto ? `<div class="hexw"><div class="hexi">${photo ? `<img src="${photo}">` : PERSON("#E9E3D3")}</div></div>` : ""}
  <div class="nm"><h1>${e(d.name).replace(/^(\S+)\s/, "$1 <b>")}${/\s/.test(d.name) ? "</b>" : ""}</h1>${d.title ? `<p>${e(d.title)}</p>` : ""}</div>
  <div class="sc" style="${cv.showPhoto ? "" : "top:270px"}">
    ${d.contact.length ? `<div><div class="tab">التواصل</div><div class="pad">${d.contact.map((x) => `<div class="ci"><i></i><span class="${x.ltr ? "ltr" : ""}">${e(x.v)}</span></div>`).join("")}</div></div>` : ""}
    ${d.skills.length ? `<div><div class="tab">المهارات</div><div class="pad">${d.skills.map((s, i) => `<div class="sk"><span>${e(s)}</span><div class="bar"><b style="width:${lv[i]}%"></b></div></div>`).join("")}</div></div>` : ""}
    ${d.courses.length ? `<div><div class="tab">الدورات</div><div class="pad">${d.courses.map((s) => `<div class="ci" style="margin:4px 0">• ${e(s)}</div>`).join("")}</div></div>` : ""}
  </div>
  <div class="mn">
    ${cv.summary ? `<div><div class="mt">نبذة</div><p class="sum" style="margin-top:10px">${nl(cv.summary)}</p></div>` : ""}
    ${d.edu.length ? `<div><div class="mt">التعليم</div>${d.edu.map((x) => `<div class="it">${x.year ? `<div class="y">${e(x.year)}</div>` : ""}<h3>${e(x.degree)}</h3><p>${e(x.institution)}</p></div>`).join("")}</div>` : ""}
    ${d.exp.length ? `<div><div class="mt">الخبرات العملية</div>${d.exp.map((x) => `<div class="it">${x.period ? `<div class="y">${e(x.period)}</div>` : ""}<h3>${e(x.position)}${x.company ? ` — ${e(x.company)}` : ""}</h3>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div>` : ""}
    ${d.langs.length ? `<div><div class="mt">اللغات</div><div class="lg">${d.langs.map((l, i) => `<div class="ring" style="--p:${Math.max(50, 95 - i * 15)}%"><span>${e(l)}</span></div>`).join("")}</div></div>` : ""}
  </div></div>`, css, "Cairo");
}

// ── 8. القطري ─────────────────────────────────────────────
function diagonal(cv: CVData, c: string, photo?: string) {
  const d = clean(cv); const grey = "#5F5B56"; const lv = levels(d.skills.length);
  const star = (n: number) => Array.from({ length: 5 }, (_, i) => `<span style="color:${i < n ? "#fff" : "rgba(255,255,255,.28)"}">★</span>`).join("");
  const css = `.pg{position:relative;min-height:1123px;background:#fff;color:#2B2B2B;overflow:hidden}
  .dk{position:absolute;top:0;right:0;left:0;height:420px;background:${c};clip-path:polygon(0 0,100% 0,100% 100%,0 26%)}
  .gr{position:absolute;top:300px;right:0;width:340px;bottom:0;background:${grey};clip-path:polygon(0 18%,100% 0,100% 100%,0 100%)}
  .ph{position:absolute;top:44px;right:52px;width:230px;height:230px;border-radius:50%;border:7px solid #fff;overflow:hidden;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;z-index:3}.ph img{width:100%;height:100%;object-fit:cover}
  .hd{position:absolute;top:56px;left:56px;right:330px;color:#fff;z-index:3}.hd h1{font-size:46px;font-weight:800;line-height:1.12}.hd p{font-size:16px;letter-spacing:4px;margin-top:8px;opacity:.9;font-weight:600}
  .sd{position:absolute;top:400px;right:0;width:340px;padding:0 44px 40px 34px;color:#fff;display:flex;flex-direction:column;gap:24px;z-index:3}
  .sd h2{font-size:15px;font-weight:800;letter-spacing:3px;padding-bottom:6px;border-bottom:1.5px solid rgba(255,255,255,.75);margin-bottom:10px}.sd p,.sd li{font-size:12.5px;line-height:1.85}.sd ul{margin:0;padding-right:16px}
  .st{display:flex;justify-content:space-between;font-size:12.5px;margin:5px 0}.st b{font-weight:400;letter-spacing:1px}
  .mn{position:absolute;top:300px;right:380px;left:52px;display:flex;flex-direction:column;gap:22px;z-index:3}
  .mn h2{font-size:16px;font-weight:800;letter-spacing:3px;color:#2B2B2B;padding-bottom:6px;border-bottom:1.5px solid #2B2B2B;margin-bottom:10px;width:80%}
  .it{margin-bottom:12px}.it h3{font-size:14px;font-weight:800;letter-spacing:1px}.it .y{font-size:13px;font-weight:800;color:#3B3B3B}.it p{font-size:12.5px;line-height:1.8;color:#555;text-align:justify}
  .sk{margin:6px 0}.sk span{font-size:12.5px}.bar{height:9px;background:${grey};width:85%;margin-top:4px}.bar b{display:block;height:100%;background:${c}}
  .ci{display:flex;gap:10px;align-items:center;font-size:12.5px;margin:6px 0}.ci i{width:20px;height:20px;border-radius:10px;background:${c};flex-shrink:0}`;
  return doc(`<div class="pg"><div class="dk"></div><div class="gr"></div>
  ${cv.showPhoto ? `<div class="ph">${photo ? `<img src="${photo}">` : PERSON("#fff")}</div>` : ""}
  <div class="hd" style="${cv.showPhoto ? "" : "right:56px"}"><h1>${e(d.name)}</h1>${d.title ? `<p>${e(d.title)}</p>` : ""}</div>
  <div class="sd">
    ${cv.summary ? `<div><h2>نبذة عني</h2><p>${nl(cv.summary)}</p></div>` : ""}
    ${d.edu.length ? `<div><h2>التعليم</h2><ul>${d.edu.map((x) => `<li>${e(x.institution || x.degree)}<br>${e(x.degree)}${x.year ? ` (${e(x.year)})` : ""}</li>`).join("")}</ul></div>` : ""}
    ${d.langs.length ? `<div><h2>اللغات</h2>${d.langs.map((l, i) => `<div class="st"><span>${e(l)}</span><b>${star(Math.max(2, 5 - i))}</b></div>`).join("")}</div>` : ""}
    ${d.courses.length ? `<div><h2>الدورات</h2><ul>${d.courses.map((s) => `<li>${e(s)}</li>`).join("")}</ul></div>` : ""}
  </div>
  <div class="mn">
    ${d.exp.length ? `<div><h2>الخبرات العملية</h2>${d.exp.map((x) => `<div class="it"><h3>${e(x.position)}</h3><div class="y">${[x.period, x.company].filter(Boolean).map(e).join(" — ")}</div>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div>` : ""}
    ${d.skills.length ? `<div><h2>المهارات</h2>${d.skills.map((s, i) => `<div class="sk"><span>${e(s)}</span><div class="bar"><b style="width:${lv[i]}%"></b></div></div>`).join("")}</div>` : ""}
    ${d.contact.length ? `<div><h2>التواصل</h2>${d.contact.map((x) => `<div class="ci"><i></i><span class="${x.ltr ? "ltr" : ""}">${e(x.v)}</span></div>`).join("")}</div>` : ""}
  </div></div>`, css, "Cairo");
}

// ── 9. اللمسة الصفراء ─────────────────────────────────────
function accent(cv: CVData, c: string, photo?: string) {
  const d = clean(cv); const ink = "#1F2024"; const lv = levels(d.skills.length);
  const css = `.pg{display:flex;min-height:1123px;background:#fff;color:${ink}}
  .sd{width:290px;background:${ink};color:#fff;margin:40px 40px 40px 0;border-radius:0 0 0 0;display:flex;flex-direction:column}
  .ph{height:300px;background:#2E3036;border-radius:0 0 90px 0;overflow:hidden;display:flex;align-items:center;justify-content:center}.ph img{width:100%;height:100%;object-fit:cover}
  .sb{padding:26px 26px 30px;display:flex;flex-direction:column;gap:22px;flex:1;border-radius:0 70px 0 0;background:${ink};margin-top:-30px;position:relative}
  .yt{display:inline-block;background:${c};color:${ink};font-size:12.5px;font-weight:900;letter-spacing:1px;padding:3px 14px;border-radius:0 10px 10px 0}
  .sb h3{font-size:13.5px;font-weight:800;margin-top:10px}.sb p{font-size:11.5px;line-height:1.7;color:#C9CBD1}
  .cr{border-right:5px solid ${c};padding:4px 10px;margin:6px 0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.06))}.cr b{display:block;font-size:12px;color:${c}}.cr span{font-size:11.5px;color:#E5E6EA}
  .mn{flex:1;padding:70px 44px 40px 30px;display:flex;flex-direction:column;gap:22px}
  .acc{width:40px;height:110px;background:${c};border-radius:0 0 20px 20px;position:absolute;top:0;left:30px}
  .mn h1{font-size:44px;font-weight:900;line-height:1.05}.mn .rl{font-size:15px;letter-spacing:3px;color:#55575E;margin-top:6px;font-weight:600}
  .mn .yt{border-radius:10px}.sum{font-size:13px;line-height:1.85;color:#55575E;margin-top:8px}
  .ex{display:grid;grid-template-columns:96px 1fr;gap:6px 16px;margin-top:10px}.ex .y{font-size:12px;font-weight:700;color:#55575E}.ex h3{font-size:13.5px;font-weight:800}.ex .co{font-size:12px;font-weight:600;color:#55575E}.ex p{font-size:12px;line-height:1.75;color:#6A6C73}
  .sg{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px;margin-top:10px}.sg span{font-size:12px}.ln{height:3px;background:#E3E4E8;margin-top:4px}.ln b{display:block;height:100%;background:${c}}`;
  return doc(`<div class="pg"><div class="sd">
    ${cv.showPhoto ? `<div class="ph">${photo ? `<img src="${photo}">` : PERSON("#9A9CA3")}</div>` : `<div style="height:40px"></div>`}
    <div class="sb">
      ${d.edu.length ? `<div><span class="yt">التعليم</span>${d.edu.map((x) => `<h3>${e(x.degree)}</h3><p>${e(x.institution)}${x.year ? `<br>${e(x.year)}` : ""}</p>`).join("")}</div>` : ""}
      ${d.langs.length ? `<div><span class="yt">اللغات</span><p style="margin-top:8px">${d.langs.map(e).join(" · ")}</p></div>` : ""}
      ${d.courses.length ? `<div><span class="yt">الدورات</span>${d.courses.map((s) => `<p style="margin-top:6px">${e(s)}</p>`).join("")}</div>` : ""}
      <div style="margin-top:auto">${d.contact.map((x, i) => `<div class="cr"><b>${["الهاتف", "البريد", "الموقع", "العنوان"][i] || ""}</b><span class="${x.ltr ? "ltr" : ""}">${e(x.v)}</span></div>`).join("")}</div>
    </div></div>
  <div class="mn" style="position:relative"><div class="acc"></div>
    <div style="padding-top:20px"><h1>${e(d.name)}</h1>${d.title ? `<div class="rl">${e(d.title)}</div>` : ""}</div>
    ${cv.summary ? `<div><span class="yt">نبذة عني</span><p class="sum">${nl(cv.summary)}</p></div>` : ""}
    ${d.exp.length ? `<div><span class="yt">الخبرات العملية</span><div class="ex">${d.exp.map((x) => `<div class="y">${e(x.period)}</div><div><h3>${e(x.position)}</h3>${x.company ? `<div class="co">${e(x.company)}</div>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div></div>` : ""}
    ${d.skills.length ? `<div><span class="yt">المهارات</span><div class="sg">${d.skills.map((s, i) => `<div><span>${e(s)}</span><div class="ln"><b style="width:${lv[i]}%"></b></div></div>`).join("")}</div></div>` : ""}
  </div></div>`, css, "Cairo");
}

// ── 10. المقوّس ───────────────────────────────────────────
function arch(cv: CVData, c: string, photo?: string) {
  const d = clean(cv); const dk = darken(c);
  const css = `.pg{position:relative;min-height:1123px;background:#fff;color:#1E1E1E;display:flex;padding:54px 46px 40px 40px;gap:0}
  .col{width:280px;background:${c};border-radius:140px 140px 0 0;padding:28px 0 30px;display:flex;flex-direction:column;gap:22px;flex-shrink:0;position:relative}
  .av{width:170px;height:170px;border-radius:85px;background:#fff;align-self:center;overflow:hidden;display:flex;align-items:center;justify-content:center;border:6px solid #fff}.av img{width:100%;height:100%;object-fit:cover}
  .rb{position:relative;background:${dk};color:#fff;font-size:16px;font-weight:800;text-align:center;padding:9px 0;margin:0 -18px 0 -18px}
  .rbw{position:relative}.rbw:after{content:"";position:absolute;left:-18px;bottom:-14px;border-top:14px solid #111;border-left:18px solid transparent}
  .cb{padding:0 26px;color:#fff;font-size:12px;line-height:1.85}.cb ul{margin:0;padding-right:16px}
  .mn{flex:1;padding-right:0;display:flex;flex-direction:column;gap:20px}
  .hd{padding:30px 34px 10px}.hd h1{font-size:40px;font-weight:900;line-height:1.15}.hd p{font-size:17px;letter-spacing:2px;margin-top:4px}
  .mr{background:${dk};color:#fff;font-size:18px;font-weight:800;padding:10px 30px;margin-right:-18px;text-align:center}
  .tl{position:relative;padding:4px 34px 4px 30px;border-right:2px solid #1E1E1E;margin:10px 46px 6px 30px}.tl:before{content:"";position:absolute;right:-7px;top:6px;width:12px;height:12px;border-radius:6px;background:#1E1E1E}
  .tl h3{font-size:14px;font-weight:800}.tl .m{font-size:12.5px;color:#333;margin:2px 0}.tl p{font-size:12px;line-height:1.75;color:#555}`;
  return doc(`<div class="pg"><div class="col">
    ${cv.showPhoto ? `<div class="av">${photo ? `<img src="${photo}">` : PERSON(c)}</div>` : `<div style="height:60px"></div>`}
    ${cv.summary ? `<div class="rbw"><div class="rb">نبذة عني</div></div><div class="cb">${nl(cv.summary)}</div>` : ""}
    ${d.skills.length ? `<div class="rbw"><div class="rb">المهارات</div></div><div class="cb"><ul>${d.skills.map((s) => `<li>${e(s)}</li>`).join("")}</ul></div>` : ""}
    ${d.langs.length ? `<div class="rbw"><div class="rb">اللغات</div></div><div class="cb">${d.langs.map(e).join(" · ")}</div>` : ""}
    ${d.contact.length ? `<div class="rbw"><div class="rb">التواصل</div></div><div class="cb">${d.contact.map((x) => `<div class="${x.ltr ? "ltr" : ""}" style="text-align:right">${e(x.v)}</div>`).join("")}</div>` : ""}
  </div>
  <div class="mn"><div class="hd"><h1>${e(d.name)}</h1>${d.title ? `<p>${e(d.title)}</p>` : ""}</div>
    ${d.edu.length ? `<div><div class="mr">التعليم</div>${d.edu.map((x) => `<div class="tl"><h3>${e(x.degree)}</h3><div class="m">${e(x.institution)}${x.year ? ` | ${e(x.year)}` : ""}</div></div>`).join("")}</div>` : ""}
    ${d.exp.length ? `<div><div class="mr">الخبرات العملية</div>${d.exp.map((x) => `<div class="tl"><h3>${e(x.position)}</h3><div class="m">${[x.company, x.period].filter(Boolean).map(e).join(" | ")}</div>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div>` : ""}
    ${d.courses.length ? `<div><div class="mr">الدورات والشهادات</div>${d.courses.map((s) => `<div class="tl"><h3>${e(s)}</h3></div>`).join("")}</div>` : ""}
  </div></div>`, css, "Cairo");
}

/** علامة «معاينة» فوق القوالب المميزة غير المفتوحة */
const WATERMARK = `<div style="position:fixed;inset:0;pointer-events:none;z-index:99;display:flex;flex-wrap:wrap;align-content:space-around;justify-content:space-around;transform:rotate(-24deg) scale(1.4);opacity:.13">${Array.from({ length: 24 }, () => `<span style="font:900 34px Cairo,Tahoma;color:#000;padding:30px">معاينة · حصاحيصاوي</span>`).join("")}</div>`;

export function buildCVHtml(cv: CVData, id: CVTemplateId, color: string, photoDataUri?: string, opts: { watermark?: boolean } = {}): string {
  const html = buildCVHtmlRaw(cv, id, color, photoDataUri);
  return opts.watermark ? html.replace("</body>", `${WATERMARK}</body>`) : html;
}

function buildCVHtmlRaw(cv: CVData, id: CVTemplateId, color: string, photoDataUri?: string): string {
  const photo = cv.showPhoto ? (photoDataUri || cv.photoUri || undefined) : undefined;
  switch (id) {
    case "band": return band(cv, color, photo);
    case "editorial": return editorial(cv, color);
    case "cards": return cards(cv, color, photo);
    case "ats": return ats(cv, color);
    case "bold": return bold(cv, color, photo);
    case "hexa": return hexa(cv, color, photo);
    case "diagonal": return diagonal(cv, color, photo);
    case "accent": return accent(cv, color, photo);
    case "arch": return arch(cv, color, photo);
    default: return nile(cv, color, photo);
  }
}

/** بيانات مثال لمعاينة القوالب قبل تعبئة البيانات */
export const SAMPLE_CV: CVData = {
  name: "سارة عبد الله", title: "محاسبة قانونية", phone: "+249 9X XXX XXXX", email: "name@email.com", address: "الحصاحيصا", website: "",
  summary: "أركّز على دقة التقارير المالية وضبط التكاليف، وأعددت ميزانيات لمؤسسات تجارية متوسطة الحجم.",
  experience: [
    { position: "محاسبة أولى", company: "[اسم الشركة]", period: "2022 — الآن", desc: "إعداد القوائم المالية الشهرية وتسوية الحسابات البنكية." },
    { position: "محاسبة", company: "[اسم المؤسسة]", period: "2019 — 2022", desc: "متابعة المدفوعات وإدارة المخزون وتقارير الضرائب." },
  ],
  education: [{ degree: "بكالوريوس المحاسبة", institution: "[اسم الجامعة]", year: "2018" }],
  skills: ["القوائم المالية", "Excel المتقدّم", "الضرائب", "أنظمة ERP"], languages: ["العربية", "الإنجليزية"], courses: ["[شهادة مهنية]"],
  photoUri: "", showPhoto: true,
};
