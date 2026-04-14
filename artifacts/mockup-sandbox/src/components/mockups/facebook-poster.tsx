import React, { useRef, useEffect, useState } from "react";
import logoSrc from "../../assets/hasahisawi-logo.png";
import mapSrc  from "../../assets/images/sudan-map-glow.png";

const W = 1200;
const H = 630;

// ── Load an image via Promise ──────────────────────────────────────────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

// ── Round-rect helper (works on all browsers) ──────────────────────────────────
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── Google Play triangle icon ──────────────────────────────────────────────────
function drawGPlayIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 48;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  // Cyan left edge
  ctx.fillStyle = "#00D4FF";
  ctx.beginPath();
  ctx.moveTo(4.5, 3.5); ctx.lineTo(26.5, 24); ctx.lineTo(4.5, 44.5);
  ctx.closePath(); ctx.fill();

  // Yellow right arrow
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  ctx.moveTo(36, 16.5); ctx.lineTo(26.5, 24); ctx.lineTo(36, 31.5); ctx.lineTo(43.5, 27.5);
  ctx.arcTo(45.5, 26.4, 45.5, 21.6, 2);
  ctx.lineTo(43.5, 20.5); ctx.closePath(); ctx.fill();

  // Green top
  ctx.fillStyle = "#4CAF50";
  ctx.beginPath();
  ctx.moveTo(4.5, 3.5); ctx.lineTo(26.5, 24); ctx.lineTo(36, 16.5); ctx.lineTo(12, 2);
  ctx.closePath(); ctx.fill();

  // Red bottom
  ctx.fillStyle = "#F44336";
  ctx.beginPath();
  ctx.moveTo(4.5, 44.5); ctx.lineTo(26.5, 24); ctx.lineTo(36, 31.5); ctx.lineTo(12, 46);
  ctx.closePath(); ctx.fill();

  ctx.restore();
}

// ── Main canvas drawing function ───────────────────────────────────────────────
async function drawPoster(
  canvas: HTMLCanvasElement,
  logoImg: HTMLImageElement,
  mapImg: HTMLImageElement
) {
  const ctx = canvas.getContext("2d")!;
  canvas.width  = W;
  canvas.height = H;

  // Ensure Cairo font is available in canvas
  await document.fonts.load("900 60px Cairo");
  await document.fonts.load("700 24px Cairo");
  await document.fonts.load("400 20px Cairo");

  // ── 1. Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = "#0D1A12";
  ctx.fillRect(0, 0, W, H);

  // ── 2. Map glow background ────────────────────────────────────────────────────
  ctx.globalAlpha = 0.22;
  ctx.drawImage(mapImg, 0, 0, W, H);
  ctx.globalAlpha = 1;

  // ── 3. Radial glows ───────────────────────────────────────────────────────────
  const glow1 = ctx.createRadialGradient(300, H / 2, 0, 300, H / 2, 380);
  glow1.addColorStop(0, "rgba(39,174,104,0.22)");
  glow1.addColorStop(1, "transparent");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(950, H / 2, 0, 950, H / 2, 320);
  glow2.addColorStop(0, "rgba(240,165,0,0.12)");
  glow2.addColorStop(1, "transparent");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // ── 4. Vignette ───────────────────────────────────────────────────────────────
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
  vig.addColorStop(0, "transparent");
  vig.addColorStop(1, "rgba(13,26,18,0.65)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // ── 5. Decorative rings (left center) ────────────────────────────────────────
  [120, 200, 290].forEach((r, i) => {
    ctx.strokeStyle = `rgba(39,174,104,${0.10 - i * 0.025})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(200, H / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // ── 6. Logo box ───────────────────────────────────────────────────────────────
  const lx = 85, ly = H / 2 - 155;
  const lw = 220, lh = 220;

  // White card with shadow
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur  = 30;
  roundRect(ctx, lx, ly, lw, lh, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.shadowBlur = 0;

  // Logo image centered in card
  const pad = 20;
  ctx.drawImage(logoImg, lx + pad, ly + pad, lw - pad * 2, lh - pad * 2);

  // ── 7. App name "حصاحيصاوي" ──────────────────────────────────────────────────
  ctx.direction = "rtl";
  ctx.textAlign = "center";

  ctx.font      = "900 44px Cairo, Arial";
  ctx.fillStyle = "#27AE68";
  ctx.shadowColor = "rgba(39,174,104,0.5)";
  ctx.shadowBlur  = 20;
  ctx.fillText("حصاحيصاوي", 195, ly + lh + 52);
  ctx.shadowBlur = 0;

  // Subtitle
  ctx.direction  = "ltr";
  ctx.textAlign  = "center";
  ctx.font       = "600 13px Cairo, Arial";
  ctx.fillStyle  = "rgba(255,255,255,0.45)";
  ctx.letterSpacing = "0.15em";
  ctx.fillText("HASAHISAWI APP", 195, ly + lh + 80);
  (ctx as any).letterSpacing = "0";

  // 5 stars
  ctx.font      = "600 22px Arial";
  ctx.fillStyle = "#F0A500";
  ctx.fillText("★★★★★", 195, ly + lh + 110);

  // ── 8. Vertical divider ───────────────────────────────────────────────────────
  const divX = 370;
  const divGrad = ctx.createLinearGradient(divX, H * 0.1, divX, H * 0.9);
  divGrad.addColorStop(0,   "transparent");
  divGrad.addColorStop(0.3, "rgba(240,165,0,0.55)");
  divGrad.addColorStop(0.7, "rgba(240,165,0,0.55)");
  divGrad.addColorStop(1,   "transparent");
  ctx.strokeStyle = divGrad;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(divX, H * 0.1);
  ctx.lineTo(divX, H * 0.9);
  ctx.stroke();

  // ── 9. "★ متاح الآن ★" badge ─────────────────────────────────────────────────
  const badgeX = W - 60, badgeY = 72;
  const badgeText = "★ متاح الآن ★";

  ctx.direction = "rtl";
  ctx.font      = "900 15px Cairo, Arial";
  const bw = ctx.measureText(badgeText).width + 52;
  const bh = 38;

  // Badge bg gradient
  const badgeGrad = ctx.createLinearGradient(badgeX - bw, badgeY - bh / 2, badgeX, badgeY + bh / 2);
  badgeGrad.addColorStop(0, "#F0A500");
  badgeGrad.addColorStop(1, "#FFD700");
  roundRect(ctx, badgeX - bw, badgeY - bh / 2, bw, bh, bh / 2);
  ctx.fillStyle = badgeGrad;
  ctx.shadowColor = "rgba(240,165,0,0.45)";
  ctx.shadowBlur  = 18;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.textAlign  = "right";
  ctx.fillStyle  = "#0D1A12";
  ctx.fillText(badgeText, badgeX - 18, badgeY + 5);

  // ── 10. Main headline ─────────────────────────────────────────────────────────
  const tx = W - 65;

  ctx.direction = "rtl";
  ctx.textAlign = "right";

  // "تطبيق"
  ctx.font      = "900 58px Cairo, Arial";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur  = 12;
  ctx.fillText("تطبيق", tx, 178);

  // "الحصاحيصا"
  ctx.fillStyle = "#27AE68";
  ctx.shadowColor = "rgba(39,174,104,0.4)";
  ctx.fillText("الحصاحيصا", tx, 248);

  // "الأول والأميز"
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.fillText("الأول والأميز", tx, 318);
  ctx.shadowBlur = 0;

  // ── 11. Tagline ───────────────────────────────────────────────────────────────
  ctx.font      = "400 20px Cairo, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.fillText("أخبار المدينة · خدمات محلية · سوق الحصاحيصا · مجتمع متصل", tx, 362);

  // ── 12. Thin separator line ───────────────────────────────────────────────────
  const lineGrad = ctx.createLinearGradient(tx - 530, 385, tx, 385);
  lineGrad.addColorStop(0, "transparent");
  lineGrad.addColorStop(0.5, "#27AE68");
  lineGrad.addColorStop(1, "transparent");
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx - 530, 388);
  ctx.lineTo(tx, 388);
  ctx.stroke();

  // ── 13. Google Play badge ─────────────────────────────────────────────────────
  const gpX = tx - 280, gpY = 415;
  const gpW = 265, gpH = 74;

  roundRect(ctx, gpX, gpY, gpW, gpH, 14);
  ctx.fillStyle = "#000000";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur  = 25;
  ctx.fill();
  ctx.shadowBlur = 0;

  roundRect(ctx, gpX, gpY, gpW, gpH, 14);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth   = 1;
  ctx.stroke();

  // Google Play icon
  drawGPlayIcon(ctx, gpX + 22, gpY + (gpH - 38) / 2, 38);

  // "GET IT ON" + "Google Play"
  ctx.direction  = "ltr";
  ctx.textAlign  = "left";
  ctx.font       = "400 12px Cairo, Arial";
  ctx.fillStyle  = "rgba(255,255,255,0.5)";
  ctx.fillText("GET IT ON", gpX + 74, gpY + 26);

  ctx.font      = "700 24px Cairo, Arial";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Google Play", gpX + 72, gpY + 52);

  // ── 14. City tag ──────────────────────────────────────────────────────────────
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.font      = "400 14px Cairo, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.letterSpacing = "0.15em";
  ctx.fillText("الحصاحيصا · ولاية الجزيرة · السودان", tx, 518);

  // ── Developer credit ──────────────────────────────────────────────────────────
  ctx.direction = "ltr";
  ctx.textAlign = "right";
  ctx.font      = "400 12px Cairo, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillText("Dev: Asim Abdulrahman Mohammed  |  Almhbob.iii@gmail.com", tx, 546);
  (ctx as any).letterSpacing = "0";

  // ── 15. Bottom gradient bar ───────────────────────────────────────────────────
  const barGrad = ctx.createLinearGradient(0, 0, W, 0);
  barGrad.addColorStop(0,   "#27AE68");
  barGrad.addColorStop(0.5, "#F0A500");
  barGrad.addColorStop(1,   "#27AE68");
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, H - 5, W, 5);

  // ── 16. Corner accents ────────────────────────────────────────────────────────
  const cSize = 50, cW = 3;
  const corners = [
    { x: 0,     y: 0,     dx:  1, dy:  1, color: "rgba(240,165,0,0.6)"  },
    { x: W,     y: 0,     dx: -1, dy:  1, color: "rgba(240,165,0,0.6)"  },
    { x: 0,     y: H,     dx:  1, dy: -1, color: "rgba(39,174,104,0.6)" },
    { x: W,     y: H,     dx: -1, dy: -1, color: "rgba(39,174,104,0.6)" },
  ];
  corners.forEach(({ x, y, dx, dy, color }) => {
    ctx.strokeStyle = color;
    ctx.lineWidth   = cW;
    ctx.beginPath();
    // Horizontal
    ctx.moveTo(x, y + dy * cW / 2);
    ctx.lineTo(x + dx * cSize, y + dy * cW / 2);
    ctx.stroke();
    // Vertical
    ctx.beginPath();
    ctx.moveTo(x + dx * cW / 2, y);
    ctx.lineTo(x + dx * cW / 2, y + dy * cSize);
    ctx.stroke();
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FacebookPoster() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [ready,    setReady]    = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [dlLoading, setDlLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [logo, map] = await Promise.all([
          loadImage(logoSrc),
          loadImage(mapSrc),
        ]);
        if (!mounted || !canvasRef.current) return;
        await drawPoster(canvasRef.current, logo, map);
        setReady(true);
      } catch (e) {
        console.error("Poster render error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const download = () => {
    if (!canvasRef.current || !ready) return;
    setDlLoading(true);
    setTimeout(() => {
      const url = canvasRef.current!.toDataURL("image/png");
      const a   = document.createElement("a");
      a.href     = url;
      a.download = "hasahisawi-facebook-poster.png";
      a.click();
      setDlLoading(false);
    }, 100);
  };

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex flex-col items-center justify-center gap-6 p-8 font-sans">

      {/* Canvas preview — scales down for display */}
      <div className="relative shadow-2xl" style={{ borderRadius: 12, overflow: "hidden" }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0D1A12] z-10"
            style={{ width: W / 1.5, height: H / 1.5 }}>
            <div className="font-arabic text-[#27AE68] text-lg animate-pulse">جاري رسم البوستر…</div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{
            width:  W / 1.5,   // display at 800×420
            height: H / 1.5,
            display: "block",
            opacity: loading ? 0 : 1,
            transition: "opacity 0.4s",
          }}
        />
      </div>

      {/* Info & download */}
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-white/40 font-arabic text-sm" dir="rtl">
          البوستر مرسوم مباشرة على Canvas — النص العربي صحيح 100٪
        </p>
        <button
          onClick={download}
          disabled={!ready || dlLoading}
          className="flex items-center gap-2 bg-[#27AE68] hover:bg-[#2ecc71] disabled:opacity-40 text-white font-arabic font-bold px-8 py-3 rounded-full text-base shadow-xl cursor-pointer transition-all"
          dir="rtl">
          {dlLoading ? "⏳ جاري التحميل..." : "⬇️ تحميل البوستر PNG — 1200×630"}
        </button>
        <p className="text-white/25 text-xs font-arabic" dir="rtl">
          جودة عالية · بدون تشويه في الحروف العربية
        </p>
      </div>
    </div>
  );
}
