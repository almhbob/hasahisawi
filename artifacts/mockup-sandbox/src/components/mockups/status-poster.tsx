import React, { useRef, useEffect, useState } from "react";
import logoSrc from "../../assets/hasahisawi-logo.png";
import mapSrc  from "../../assets/images/sudan-map-glow.png";

const W = 1080;
const H = 1920;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error(`Failed: ${src}`));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,          r);
  ctx.closePath();
}

function drawGPlayIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 48;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "#00D4FF";
  ctx.beginPath(); ctx.moveTo(4.5,3.5); ctx.lineTo(26.5,24); ctx.lineTo(4.5,44.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#FFD700";
  ctx.beginPath(); ctx.moveTo(36,16.5); ctx.lineTo(26.5,24); ctx.lineTo(36,31.5); ctx.lineTo(43.5,27.5); ctx.lineTo(43.5,20.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#4CAF50";
  ctx.beginPath(); ctx.moveTo(4.5,3.5); ctx.lineTo(26.5,24); ctx.lineTo(36,16.5); ctx.lineTo(12,2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#F44336";
  ctx.beginPath(); ctx.moveTo(4.5,44.5); ctx.lineTo(26.5,24); ctx.lineTo(36,31.5); ctx.lineTo(12,46); ctx.closePath(); ctx.fill();
  ctx.restore();
}

async function drawStatus(
  canvas: HTMLCanvasElement,
  logoImg: HTMLImageElement,
  mapImg: HTMLImageElement
) {
  const ctx = canvas.getContext("2d")!;
  canvas.width  = W;
  canvas.height = H;

  await document.fonts.load("900 80px Cairo");
  await document.fonts.load("700 32px Cairo");
  await document.fonts.load("400 28px Cairo");

  const CX = W / 2;

  // ── 1. Background ────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0,    "#071410");
  bgGrad.addColorStop(0.45, "#0D1A12");
  bgGrad.addColorStop(1,    "#091508");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Map background ─────────────────────────────────────────────────────────
  ctx.globalAlpha = 0.20;
  // center map in upper half
  const mapH = H * 0.55, mapW = mapH * (mapImg.width / mapImg.height);
  ctx.drawImage(mapImg, CX - mapW / 2, H * 0.12, mapW, mapH);
  ctx.globalAlpha = 1;

  // ── 3. Radial glows ───────────────────────────────────────────────────────────
  const g1 = ctx.createRadialGradient(CX, H * 0.35, 0, CX, H * 0.35, 600);
  g1.addColorStop(0, "rgba(39,174,104,0.25)");
  g1.addColorStop(1, "transparent");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

  const g2 = ctx.createRadialGradient(CX, H * 0.75, 0, CX, H * 0.75, 500);
  g2.addColorStop(0, "rgba(240,165,0,0.10)");
  g2.addColorStop(1, "transparent");
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

  // Vignette
  const vig = ctx.createRadialGradient(CX, H/2, H*0.2, CX, H/2, H*0.72);
  vig.addColorStop(0, "transparent");
  vig.addColorStop(1, "rgba(7,20,16,0.75)");
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

  // ── 4. Decorative rings (center) ─────────────────────────────────────────────
  [160, 260, 360].forEach((r, i) => {
    ctx.strokeStyle = `rgba(39,174,104,${0.10 - i * 0.025})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CX, H * 0.30, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // ── 5. Top accent bar ─────────────────────────────────────────────────────────
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, "transparent");
  topBar.addColorStop(0.5, "#27AE68");
  topBar.addColorStop(1, "transparent");
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 5);

  // ── 6. Corner accents ─────────────────────────────────────────────────────────
  const cS = 70, cW2 = 3;
  [
    { x: 0, y: 0,     dx:  1, dy:  1, c: "rgba(240,165,0,0.6)"  },
    { x: W, y: 0,     dx: -1, dy:  1, c: "rgba(240,165,0,0.6)"  },
    { x: 0, y: H,     dx:  1, dy: -1, c: "rgba(39,174,104,0.6)" },
    { x: W, y: H,     dx: -1, dy: -1, c: "rgba(39,174,104,0.6)" },
  ].forEach(({ x, y, dx, dy, c }) => {
    ctx.strokeStyle = c; ctx.lineWidth = cW2;
    ctx.beginPath(); ctx.moveTo(x, y + dy * cW2/2); ctx.lineTo(x + dx * cS, y + dy * cW2/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + dx * cW2/2, y); ctx.lineTo(x + dx * cW2/2, y + dy * cS); ctx.stroke();
  });

  // ── 7. "★ متاح الآن على قوقل بلاي ★" badge ───────────────────────────────────
  const badgeText = "★ متاح الآن على قوقل بلاي ★";
  ctx.direction = "rtl";
  ctx.font = "700 26px Cairo, Arial";
  const bw = ctx.measureText(badgeText).width + 60;
  const bh = 52;
  const bx = CX - bw / 2, by = 110;

  const bGrad = ctx.createLinearGradient(bx, by, bx + bw, by);
  bGrad.addColorStop(0, "#F0A500"); bGrad.addColorStop(1, "#FFD700");
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fillStyle = bGrad;
  ctx.shadowColor = "rgba(240,165,0,0.5)"; ctx.shadowBlur = 25;
  ctx.fill(); ctx.shadowBlur = 0;

  ctx.textAlign = "center";
  ctx.fillStyle = "#0D1A12";
  ctx.fillText(badgeText, CX, by + 34);

  // ── 8. Logo ───────────────────────────────────────────────────────────────────
  const logoSize = 240;
  const lx = CX - logoSize / 2;
  const ly = 210;

  // Glow behind logo
  const logoGlow = ctx.createRadialGradient(CX, ly + logoSize/2, 0, CX, ly + logoSize/2, logoSize * 0.9);
  logoGlow.addColorStop(0, "rgba(39,174,104,0.35)");
  logoGlow.addColorStop(1, "transparent");
  ctx.fillStyle = logoGlow; ctx.fillRect(CX - logoSize, ly - 40, logoSize * 2, logoSize + 80);

  // White card
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 40;
  roundRect(ctx, lx, ly, logoSize, logoSize, 28);
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.shadowBlur = 0;

  // Logo image
  const pad = 22;
  ctx.drawImage(logoImg, lx + pad, ly + pad, logoSize - pad*2, logoSize - pad*2);

  // ── 9. App name ───────────────────────────────────────────────────────────────
  ctx.direction = "rtl"; ctx.textAlign = "center";

  ctx.font      = "900 88px Cairo, Arial";
  ctx.fillStyle = "#27AE68";
  ctx.shadowColor = "rgba(39,174,104,0.55)"; ctx.shadowBlur = 30;
  ctx.fillText("حصاحيصاوي", CX, ly + logoSize + 105);
  ctx.shadowBlur = 0;

  ctx.font      = "600 22px Cairo, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.direction = "ltr";
  ctx.fillText("HASAHISAWI APP", CX, ly + logoSize + 143);

  // Stars
  ctx.font = "600 32px Arial";
  ctx.fillStyle = "#F0A500";
  ctx.fillText("★★★★★", CX, ly + logoSize + 192);

  // ── 10. Horizontal divider ────────────────────────────────────────────────────
  const divY = ly + logoSize + 230;
  const divGrad = ctx.createLinearGradient(160, divY, W - 160, divY);
  divGrad.addColorStop(0, "transparent");
  divGrad.addColorStop(0.3, "rgba(240,165,0,0.6)");
  divGrad.addColorStop(0.7, "rgba(240,165,0,0.6)");
  divGrad.addColorStop(1, "transparent");
  ctx.strokeStyle = divGrad; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(160, divY); ctx.lineTo(W - 160, divY); ctx.stroke();

  // ── 11. Main headline ─────────────────────────────────────────────────────────
  ctx.direction = "rtl"; ctx.textAlign = "center";

  ctx.font      = "900 90px Cairo, Arial";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 15;
  ctx.fillText("تطبيق", CX, divY + 110);

  ctx.fillStyle = "#27AE68";
  ctx.shadowColor = "rgba(39,174,104,0.4)";
  ctx.fillText("الحصاحيصا", CX, divY + 215);

  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.fillText("الأول والأميز", CX, divY + 320);
  ctx.shadowBlur = 0;

  // ── 12. Features row ─────────────────────────────────────────────────────────
  const feats = ["📰 أخبار", "🛒 سوق", "🏠 خدمات", "🤝 مجتمع"];
  const featY = divY + 390;
  const featSpacing = W / (feats.length + 1);

  feats.forEach((feat, i) => {
    const fx = featSpacing * (i + 1);
    // Box
    roundRect(ctx, fx - 90, featY - 42, 180, 72, 36);
    ctx.fillStyle = "rgba(39,174,104,0.12)";
    ctx.fill();
    ctx.strokeStyle = "rgba(39,174,104,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Text
    ctx.direction = "rtl"; ctx.textAlign = "center";
    ctx.font      = "600 26px Cairo, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(feat, fx, featY + 10);
  });

  // ── 13. Divider before Google Play ───────────────────────────────────────────
  const div2Y = featY + 80;
  const div2G = ctx.createLinearGradient(200, div2Y, W - 200, div2Y);
  div2G.addColorStop(0, "transparent");
  div2G.addColorStop(0.5, "rgba(39,174,104,0.4)");
  div2G.addColorStop(1, "transparent");
  ctx.strokeStyle = div2G; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(200, div2Y); ctx.lineTo(W - 200, div2Y); ctx.stroke();

  // ── 14. Google Play badge ─────────────────────────────────────────────────────
  const gpW = 360, gpH = 100;
  const gpX = CX - gpW / 2, gpY = div2Y + 50;

  roundRect(ctx, gpX, gpY, gpW, gpH, 20);
  ctx.fillStyle = "#000";
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 30;
  ctx.fill(); ctx.shadowBlur = 0;
  roundRect(ctx, gpX, gpY, gpW, gpH, 20);
  ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1; ctx.stroke();

  drawGPlayIcon(ctx, gpX + 28, gpY + (gpH - 52) / 2, 52);

  ctx.direction = "ltr"; ctx.textAlign = "left";
  ctx.font      = "400 16px Cairo, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("GET IT ON", gpX + 100, gpY + 34);
  ctx.font      = "700 34px Cairo, Arial";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Google Play", gpX + 98, gpY + 72);

  // ── 15. Location + credit ─────────────────────────────────────────────────────
  const footerY = gpY + gpH + 80;

  ctx.direction = "rtl"; ctx.textAlign = "center";
  ctx.font      = "400 22px Cairo, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("الحصاحيصا · ولاية الجزيرة · السودان", CX, footerY);

  ctx.direction = "ltr"; ctx.textAlign = "center";
  ctx.font      = "400 18px Cairo, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillText("Dev: Asim Abdulrahman Mohammed  |  Almhbob.iii@gmail.com", CX, footerY + 40);

  // ── 16. Bottom bar ────────────────────────────────────────────────────────────
  const botBar = ctx.createLinearGradient(0, 0, W, 0);
  botBar.addColorStop(0, "#27AE68"); botBar.addColorStop(0.5, "#F0A500"); botBar.addColorStop(1, "#27AE68");
  ctx.fillStyle = botBar;
  ctx.fillRect(0, H - 6, W, 6);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function StatusPoster() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [ready,    setReady]    = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [dlLoading, setDlLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [logo, map] = await Promise.all([loadImage(logoSrc), loadImage(mapSrc)]);
        if (!mounted || !canvasRef.current) return;
        await drawStatus(canvasRef.current, logo, map);
        setReady(true);
      } catch (e) { console.error(e); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const download = () => {
    if (!canvasRef.current || !ready) return;
    setDlLoading(true);
    setTimeout(() => {
      const url = canvasRef.current!.toDataURL("image/png");
      const a   = document.createElement("a");
      a.href = url; a.download = "hasahisawi-status.png"; a.click();
      setDlLoading(false);
    }, 100);
  };

  // Display at half size (540×960)
  const dispW = 360, dispH = 640;

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex flex-col items-center justify-center gap-6 p-8 font-sans">

      {/* Phone frame */}
      <div className="relative" style={{
        width: dispW + 28, borderRadius: 40,
        background: "#1a1a1a",
        padding: "44px 14px 36px",
        boxShadow: "0 0 0 2px #333, 0 30px 80px rgba(0,0,0,0.8)",
      }}>
        {/* Notch */}
        <div className="absolute top-[14px] left-1/2 -translate-x-1/2 w-24 h-5 rounded-full bg-[#111]" />
        {/* Home indicator */}
        <div className="absolute bottom-[10px] left-1/2 -translate-x-1/2 w-20 h-1.5 rounded-full bg-[#444]" />

        <div style={{ width: dispW, height: dispH, borderRadius: 24, overflow: "hidden", position: "relative" }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0D1A12] z-10">
              <div className="font-arabic text-[#27AE68] text-base animate-pulse">جاري الرسم…</div>
            </div>
          )}
          <canvas ref={canvasRef}
            style={{ width: dispW, height: dispH, display: "block",
              opacity: loading ? 0 : 1, transition: "opacity 0.4s" }} />
        </div>
      </div>

      {/* Download */}
      <div className="flex flex-col items-center gap-2 text-center">
        <button onClick={download} disabled={!ready || dlLoading}
          className="flex items-center gap-2 bg-[#27AE68] hover:bg-[#2ecc71] disabled:opacity-40 text-white font-arabic font-bold px-8 py-3 rounded-full text-base shadow-xl cursor-pointer transition-all"
          dir="rtl">
          {dlLoading ? "⏳ جاري التحميل..." : "⬇️ تحميل حالة واتساب PNG — 1080×1920"}
        </button>
        <p className="text-white/25 text-xs font-arabic" dir="rtl">
          الحجم المثالي للحالة والستوري
        </p>
      </div>
    </div>
  );
}
