/**
 * أدوات الماسح في المتصفح: قص تلقائي لحواف الورقة، تحويل PDF إلى صور (pdf.js)،
 * وإنشاء ملف PDF حقيقي بالمرشحات والعلامة المائية (jsPDF). المكتبات تُحمَّل عند الحاجة فقط.
 * على الهاتف: القص التلقائي عبر ML Kit (react-native-document-scanner-plugin)،
 * وتحويل PDF إلى صور عبر pdf.js داخل WebView (components/scanner/PdfToImages).
 */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
export const PDFJS_URLS = { lib: PDFJS, worker: PDFJS_WORKER };

const loaded: Record<string, Promise<void>> = {};
function loadScript(src: string): Promise<void> {
  return (loaded[src] ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { delete loaded[src]; reject(new Error("تعذّر تحميل أداة المعالجة — تحقق من الاتصال")); };
    document.head.appendChild(s);
  }));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image(); im.crossOrigin = "anonymous";
    im.onload = () => resolve(im); im.onerror = () => reject(new Error("تعذّرت قراءة الصورة"));
    im.src = src;
  });
}

/**
 * قص تلقائي: الورقة عادةً أفتح من الخلفية. نقيس سطوع الحواف (الخلفية) ونبحث عن أكبر مستطيل
 * أفتح منها بوضوح، ثم نقص مع هامش صغير. إن لم يظهر فرق واضح نُرجع الصورة كما هي.
 */
export async function autoCropWeb(src: string): Promise<{ uri: string; cropped: boolean }> {
  const im = await loadImage(src);
  const scale = 320 / Math.max(im.width, im.height);
  const w = Math.max(20, Math.round(im.width * scale)), h = Math.max(20, Math.round(im.height * scale));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!; ctx.drawImage(im, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const lum = (x: number, y: number) => { const i = (y * w + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
  let edge = 0, n = 0;
  for (let x = 0; x < w; x++) { edge += lum(x, 0) + lum(x, h - 1); n += 2; }
  for (let y = 0; y < h; y++) { edge += lum(0, y) + lum(w - 1, y); n += 2; }
  const bg = edge / n;
  const thr = bg + Math.max(18, (255 - bg) * 0.25);
  // صفوف وأعمدة تكون نسبة البكسلات الفاتحة فيها كبيرة = ضمن الورقة
  const rowOk = (y: number) => { let k = 0; for (let x = 0; x < w; x++) if (lum(x, y) > thr) k++; return k / w > 0.35; };
  const colOk = (x: number) => { let k = 0; for (let y = 0; y < h; y++) if (lum(x, y) > thr) k++; return k / h > 0.35; };
  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < h && !rowOk(top)) top++;
  while (bottom > top && !rowOk(bottom)) bottom--;
  while (left < w && !colOk(left)) left++;
  while (right > left && !colOk(right)) right--;
  const area = (right - left) * (bottom - top);
  if (area < w * h * 0.2 || area > w * h * 0.97) return { uri: src, cropped: false };
  const pad = 0.012;
  const sx = Math.max(0, (left / w - pad)) * im.width, sy = Math.max(0, (top / h - pad)) * im.height;
  const sw = Math.min(im.width - sx, ((right - left) / w + pad * 2) * im.width), sh = Math.min(im.height - sy, ((bottom - top) / h + pad * 2) * im.height);
  const out = document.createElement("canvas"); out.width = Math.round(sw); out.height = Math.round(sh);
  out.getContext("2d")!.drawImage(im, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return { uri: out.toDataURL("image/jpeg", 0.9), cropped: true };
}

/** PDF ← صور (كل صفحة صورة JPEG) */
export async function pdfToImagesWeb(file: Blob | string, maxPages = 30): Promise<string[]> {
  await loadScript(PDFJS);
  const pdfjs = (window as any).pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const data = typeof file === "string" ? await (await fetch(file)).arrayBuffer() : await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1.8 });
    const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    out.push(c.toDataURL("image/jpeg", 0.88));
  }
  return out;
}

export type ExportPage = { uri: string; css: string; rotate: number };

/** صفحة مع المرشح والتدوير مرسومة على لوحة (تُستخدم للـPDF والصور) */
export async function renderPageWeb(p: ExportPage, watermark: string | null): Promise<HTMLCanvasElement> {
  const im = await loadImage(p.uri);
  const rot = ((p.rotate % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const c = document.createElement("canvas");
  c.width = swap ? im.height : im.width; c.height = swap ? im.width : im.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2); ctx.rotate((rot * Math.PI) / 180);
  (ctx as any).filter = p.css === "none" ? "none" : p.css;
  ctx.drawImage(im, -im.width / 2, -im.height / 2);
  ctx.restore();
  if (watermark) {
    const fs = Math.max(14, Math.round(c.width * 0.022));
    ctx.font = `700 ${fs}px Cairo, Tahoma, sans-serif`;
    ctx.textAlign = "left"; ctx.direction = "rtl" as any;
    const tw = ctx.measureText(watermark).width;
    const x = fs, y = c.height - fs;
    ctx.fillStyle = "rgba(0,107,74,0.82)";
    const r = fs * 0.5;
    ctx.beginPath(); (ctx as any).roundRect?.(x - r, y - fs - r * 0.4, tw + r * 2, fs + r * 1.4, r); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(watermark, x + tw, y - r * 0.15);
  }
  return c;
}

/** ملف PDF حقيقي A4 من الصفحات */
export async function buildPdfWeb(pages: ExportPage[], watermark: string | null): Promise<Blob> {
  await loadScript(JSPDF);
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 24;
  for (let i = 0; i < pages.length; i++) {
    if (i) doc.addPage();
    const c = await renderPageWeb(pages[i], watermark);
    const k = Math.min((W - M * 2) / c.width, (H - M * 2) / c.height);
    const w = c.width * k, h = c.height * k;
    doc.addImage(c.toDataURL("image/jpeg", 0.88), "JPEG", (W - w) / 2, (H - h) / 2, w, h);
  }
  return doc.output("blob");
}

/** مشاركة ملف (إن دعم المتصفح) أو تنزيله */
export async function shareOrDownload(blob: Blob, name: string, title: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], name, { type: blob.type });
  const nav: any = navigator;
  if (nav?.canShare?.({ files: [file] })) { await nav.share({ files: [file], title }); return "shared"; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "downloaded";
}

export async function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("فشل التحويل"))), "image/jpeg", 0.9));
}
