// قوالب السيرة الذاتية — كل قالب يُنتج HTML بمقاس A4 (794×1123) يُطبع PDF ويُعرض في المعاينة الحيّة
export type CVTemplateId = "nile" | "band" | "editorial" | "cards" | "ats" | "bold";

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
};

export const CV_TEMPLATES: CVTemplateMeta[] = [
  { id: "nile", name: "النيل", desc: "خط زمني للخبرات ونقاط واضحة", bestFor: "المحاسبة · الإدارة · الوظائف الحكومية", colors: ["#0E5A80", "#0E9C64", "#C26D3D", "#06325A"], photo: false, font: "IBM Plex Sans Arabic" },
  { id: "band", name: "الشريط", desc: "شريط علوي بالصورة وعمودان مرتّبان", bestFor: "التقنية · الهندسة · الصحة", colors: ["#0B7A4E", "#0E5A80", "#C26D3D", "#06325A"], photo: true, font: "Cairo" },
  { id: "editorial", name: "المحرّر", desc: "خط عربي فاخر على ورق عاجي", bestFor: "التعليم · الكتابة · الأكاديميا", colors: ["#9A4F26", "#0E5A80", "#0B7A4E", "#06325A"], photo: false, font: "Amiri" },
  { id: "cards", name: "البطاقات", desc: "أقسام في بطاقات ووسوم للمهارات", bestFor: "الحِرف · الفنيون · الخدمات", colors: ["#0B7A4E", "#0E5A80", "#C26D3D", "#06325A"], photo: true, font: "Cairo" },
  { id: "ats", name: "ATS", desc: "نص فقط بلا أعمدة — تقرؤه أنظمة الفرز", bestFor: "التقديم الإلكتروني · الشركات الكبيرة", colors: ["#111827", "#0E5A80", "#0B7A4E", "#9A4F26"], photo: false, font: "IBM Plex Sans Arabic" },
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

export function buildCVHtml(cv: CVData, id: CVTemplateId, color: string, photoDataUri?: string): string {
  const photo = cv.showPhoto ? (photoDataUri || cv.photoUri || undefined) : undefined;
  switch (id) {
    case "band": return band(cv, color, photo);
    case "editorial": return editorial(cv, color);
    case "cards": return cards(cv, color, photo);
    case "ats": return ats(cv, color);
    case "bold": return bold(cv, color, photo);
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
