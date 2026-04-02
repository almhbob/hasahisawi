import React, { useRef, useEffect, useState } from "react";
import logoSrc from "../../assets/hasahisawi-logo.png";

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

// Draw a regular hexagon
function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawGPlayIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 48;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = "#00D4FF"; ctx.beginPath(); ctx.moveTo(4.5,3.5); ctx.lineTo(26.5,24); ctx.lineTo(4.5,44.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#FFD700"; ctx.beginPath(); ctx.moveTo(36,16.5); ctx.lineTo(26.5,24); ctx.lineTo(36,31.5); ctx.lineTo(43.5,27.5); ctx.lineTo(43.5,20.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#4CAF50"; ctx.beginPath(); ctx.moveTo(4.5,3.5); ctx.lineTo(26.5,24); ctx.lineTo(36,16.5); ctx.lineTo(12,2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#F44336"; ctx.beginPath(); ctx.moveTo(4.5,44.5); ctx.lineTo(26.5,24); ctx.lineTo(36,31.5); ctx.lineTo(12,46); ctx.closePath(); ctx.fill();
  ctx.restore();
}

async function drawPoster(canvas: HTMLCanvasElement, logo: HTMLImageElement) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = W; canvas.height = H;

  await document.fonts.load("900 120px Cairo");
  await document.fonts.load("900 90px Cairo");
  await document.fonts.load("700 36px Cairo");
  await document.fonts.load("400 26px Cairo");

  const CX = W / 2;

  // ── 1. Deep black background ────────────────────────────────────────────────
  ctx.fillStyle = "#040A06";
  ctx.fillRect(0, 0, W, H);

  // ── 2. Diagonal colour wash (top-left green / bottom-right deep) ────────────
  const diagGrad = ctx.createLinearGradient(0, 0, W, H);
  diagGrad.addColorStop(0,    "rgba(10,60,30,0.70)");
  diagGrad.addColorStop(0.45, "rgba(5,20,12,0.0)");
  diagGrad.addColorStop(1,    "rgba(30,15,0,0.55)");
  ctx.fillStyle = diagGrad; ctx.fillRect(0, 0, W, H);

  // ── 3. Diagonal slash accent ─────────────────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#00FF88";
  ctx.lineWidth   = 320;
  ctx.beginPath();
  ctx.moveTo(-200, H * 0.55);
  ctx.lineTo(W + 200, H * 0.35);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── 4. Dot grid texture ───────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(39,174,104,0.045)";
  const dot = 3, gap = 54;
  for (let y = gap; y < H; y += gap)
    for (let x = gap; x < W; x += gap) {
      ctx.beginPath(); ctx.arc(x, y, dot/2, 0, Math.PI*2); ctx.fill();
    }

  // ── 5. Big ambient orb behind logo ───────────────────────────────────────────
  const ORB_Y = 580;
  const orb = ctx.createRadialGradient(CX, ORB_Y, 0, CX, ORB_Y, 460);
  orb.addColorStop(0,    "rgba(0,255,100,0.18)");
  orb.addColorStop(0.45, "rgba(39,174,104,0.08)");
  orb.addColorStop(1,    "transparent");
  ctx.fillStyle = orb; ctx.fillRect(0, 0, W, H);

  // ── 6. Hexagonal logo frame ───────────────────────────────────────────────────
  const HEX_R = 220;
  const HEX_CY = ORB_Y;

  // Outer ring glow
  ctx.shadowColor = "#00FF88"; ctx.shadowBlur = 60;
  hexPath(ctx, CX, HEX_CY, HEX_R + 18);
  ctx.strokeStyle = "rgba(0,255,136,0.6)"; ctx.lineWidth = 3; ctx.stroke();
  ctx.shadowBlur = 0;

  // Middle ring
  hexPath(ctx, CX, HEX_CY, HEX_R + 6);
  ctx.strokeStyle = "rgba(0,255,136,0.15)"; ctx.lineWidth = 12; ctx.stroke();

  // Hex fill (dark glass)
  hexPath(ctx, CX, HEX_CY, HEX_R);
  const hexFill = ctx.createRadialGradient(CX, HEX_CY - 60, 0, CX, HEX_CY, HEX_R);
  hexFill.addColorStop(0, "rgba(255,255,255,0.12)");
  hexFill.addColorStop(1, "rgba(10,35,18,0.92)");
  ctx.fillStyle = hexFill; ctx.fill();

  // Clip logo to hex
  ctx.save();
  hexPath(ctx, CX, HEX_CY, HEX_R - 8);
  ctx.clip();
  const logoSize = (HEX_R - 30) * 2;
  ctx.drawImage(logo, CX - logoSize/2, HEX_CY - logoSize/2, logoSize, logoSize);
  ctx.restore();

  // Hex shine highlight
  hexPath(ctx, CX, HEX_CY, HEX_R);
  const shine = ctx.createLinearGradient(CX - HEX_R, HEX_CY - HEX_R, CX, HEX_CY);
  shine.addColorStop(0, "rgba(255,255,255,0.10)");
  shine.addColorStop(1, "transparent");
  ctx.fillStyle = shine; ctx.fill();

  // ── 7. Rotating tick marks around hex ─────────────────────────────────────────
  ctx.strokeStyle = "rgba(0,255,136,0.35)"; ctx.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const angle = (Math.PI * 2 / 24) * i;
    const r1 = HEX_R + 28, r2 = HEX_R + 42;
    ctx.beginPath();
    ctx.moveTo(CX + r1 * Math.cos(angle), HEX_CY + r1 * Math.sin(angle));
    ctx.lineTo(CX + r2 * Math.cos(angle), HEX_CY + r2 * Math.sin(angle));
    ctx.stroke();
  }

  // ── 8. App name — HUGE gradient text ─────────────────────────────────────────
  const NAME_Y = HEX_CY + HEX_R + 110;

  ctx.save();
  const nameGrad = ctx.createLinearGradient(CX - 380, 0, CX + 380, 0);
  nameGrad.addColorStop(0,   "#00FF88");
  nameGrad.addColorStop(0.5, "#A8FFD0");
  nameGrad.addColorStop(1,   "#00CC6A");
  ctx.direction  = "rtl"; ctx.textAlign = "center";
  ctx.font       = "900 118px Cairo, Arial";
  ctx.fillStyle  = nameGrad;
  ctx.shadowColor = "rgba(0,255,136,0.5)"; ctx.shadowBlur = 35;
  ctx.fillText("حصاحيصاوي", CX, NAME_Y);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Subtitle line
  ctx.direction = "ltr"; ctx.textAlign = "center";
  ctx.font       = "300 22px Cairo, Arial";
  ctx.fillStyle  = "rgba(255,255,255,0.30)";
  ctx.letterSpacing = "0.35em";
  ctx.fillText("H A S A H I S A W I", CX, NAME_Y + 48);
  (ctx as any).letterSpacing = "0";

  // ── 9. Thin gold divider ──────────────────────────────────────────────────────
  const DIV1_Y = NAME_Y + 90;
  const d1 = ctx.createLinearGradient(80, DIV1_Y, W - 80, DIV1_Y);
  d1.addColorStop(0, "transparent"); d1.addColorStop(0.3, "#F0A500");
  d1.addColorStop(0.7, "#F0A500"); d1.addColorStop(1, "transparent");
  ctx.strokeStyle = d1; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(80, DIV1_Y); ctx.lineTo(W-80, DIV1_Y); ctx.stroke();

  // ── 10. Bold headline ─────────────────────────────────────────────────────────
  const HL_Y = DIV1_Y + 88;
  ctx.direction = "rtl"; ctx.textAlign = "center";

  ctx.font      = "900 96px Cairo, Arial";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 20;
  ctx.fillText("تطبيق المدينة", CX, HL_Y);

  const hl2Grad = ctx.createLinearGradient(CX - 320, 0, CX + 320, 0);
  hl2Grad.addColorStop(0, "#F0A500"); hl2Grad.addColorStop(1, "#FFD966");
  ctx.fillStyle = hl2Grad;
  ctx.shadowColor = "rgba(240,165,0,0.45)"; ctx.shadowBlur = 28;
  ctx.fillText("الأول والأميز", CX, HL_Y + 106);
  ctx.shadowBlur = 0;

  // ── 11. Tagline ───────────────────────────────────────────────────────────────
  ctx.font      = "300 30px Cairo, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.50)";
  ctx.fillText("أخبار · خدمات · سوق · مجتمع", CX, HL_Y + 178);

  // ── 12. Feature cards row ─────────────────────────────────────────────────────
  const FEAT_Y = HL_Y + 240;
  const feats = [
    { icon: "📰", label: "أخبار" },
    { icon: "🛒", label: "سوق"   },
    { icon: "🔧", label: "خدمات" },
    { icon: "🤝", label: "مجتمع" },
  ];
  const cardW = 190, cardH = 110, cardGap = 32;
  const totalW = feats.length * cardW + (feats.length - 1) * cardGap;
  const startX = CX - totalW / 2;

  feats.forEach((f, i) => {
    const fx = startX + i * (cardW + cardGap);

    // Glassmorphism card
    roundRect(ctx, fx, FEAT_Y, cardW, cardH, 22);
    const cg = ctx.createLinearGradient(fx, FEAT_Y, fx, FEAT_Y + cardH);
    cg.addColorStop(0, "rgba(0,255,100,0.10)"); cg.addColorStop(1, "rgba(0,40,20,0.35)");
    ctx.fillStyle = cg; ctx.fill();
    roundRect(ctx, fx, FEAT_Y, cardW, cardH, 22);
    ctx.strokeStyle = "rgba(0,255,100,0.22)"; ctx.lineWidth = 1.5; ctx.stroke();

    // Icon
    ctx.textAlign = "center"; ctx.direction = "ltr";
    ctx.font = "36px Arial"; ctx.fillStyle = "#fff";
    ctx.fillText(f.icon, fx + cardW / 2, FEAT_Y + 50);

    // Label
    ctx.font = "700 26px Cairo, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.direction = "rtl";
    ctx.fillText(f.label, fx + cardW / 2, FEAT_Y + 88);
  });

  // ── 13. Second divider ────────────────────────────────────────────────────────
  const DIV2_Y = FEAT_Y + cardH + 70;
  const d2 = ctx.createLinearGradient(160, DIV2_Y, W-160, DIV2_Y);
  d2.addColorStop(0, "transparent"); d2.addColorStop(0.5, "rgba(255,255,255,0.12)"); d2.addColorStop(1, "transparent");
  ctx.strokeStyle = d2; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(160, DIV2_Y); ctx.lineTo(W-160, DIV2_Y); ctx.stroke();

  // ── 14. Google Play badge ─────────────────────────────────────────────────────
  const GP_Y  = DIV2_Y + 56;
  const gpW2  = 400, gpH2 = 110;
  const gpX   = CX - gpW2 / 2;

  roundRect(ctx, gpX, GP_Y, gpW2, gpH2, 55);
  const gpGrad = ctx.createLinearGradient(gpX, GP_Y, gpX + gpW2, GP_Y);
  gpGrad.addColorStop(0, "rgba(0,255,100,0.15)"); gpGrad.addColorStop(1, "rgba(0,180,70,0.08)");
  ctx.fillStyle = gpGrad; ctx.fill();
  roundRect(ctx, gpX, GP_Y, gpW2, gpH2, 55);
  ctx.strokeStyle = "rgba(0,255,100,0.50)"; ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(0,255,100,0.3)"; ctx.shadowBlur = 20;
  ctx.stroke(); ctx.shadowBlur = 0;

  drawGPlayIcon(ctx, gpX + 38, GP_Y + (gpH2 - 58) / 2, 58);

  ctx.direction = "ltr"; ctx.textAlign = "left";
  ctx.font      = "400 18px Cairo, Arial"; ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText("GET IT ON", gpX + 116, GP_Y + 38);
  ctx.font      = "700 36px Cairo, Arial"; ctx.fillStyle = "#ffffff";
  ctx.fillText("Google Play", gpX + 114, GP_Y + 78);

  // ── 15. "متاح الآن" pill ──────────────────────────────────────────────────────
  const pill  = "★  متاح الآن  ★";
  ctx.direction = "rtl"; ctx.font = "700 26px Cairo, Arial";
  const pillW = ctx.measureText(pill).width + 56;
  const pillH = 52, pillX = CX - pillW / 2;
  const pillY = GP_Y + gpH2 + 60;

  roundRect(ctx, pillX, pillY, pillW, pillH, pillH/2);
  const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY);
  pillGrad.addColorStop(0, "#F0A500"); pillGrad.addColorStop(1, "#FFD966");
  ctx.fillStyle = pillGrad;
  ctx.shadowColor = "rgba(240,165,0,0.5)"; ctx.shadowBlur = 22; ctx.fill(); ctx.shadowBlur = 0;
  ctx.textAlign = "center"; ctx.fillStyle = "#0D1A12";
  ctx.fillText(pill, CX, pillY + 34);

  // ── 16. Footer ────────────────────────────────────────────────────────────────
  ctx.direction = "rtl"; ctx.textAlign = "center";
  ctx.font = "400 22px Cairo, Arial"; ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillText("الحصاحيصا · ولاية الجزيرة · السودان", CX, pillY + pillH + 58);

  ctx.direction = "ltr";
  ctx.font = "400 17px Cairo, Arial"; ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillText("Dev: Asim Abdulrahman Mohammed  |  Almhbob.iii@gmail.com", CX, pillY + pillH + 96);

  // ── 17. Bottom neon bar ───────────────────────────────────────────────────────
  const botGrad = ctx.createLinearGradient(0, 0, W, 0);
  botGrad.addColorStop(0, "transparent"); botGrad.addColorStop(0.3, "#00FF88");
  botGrad.addColorStop(0.5, "#F0A500");   botGrad.addColorStop(0.7, "#00FF88");
  botGrad.addColorStop(1, "transparent");
  ctx.fillStyle = botGrad;
  ctx.shadowColor = "#00FF88"; ctx.shadowBlur = 18;
  ctx.fillRect(0, H - 6, W, 6); ctx.shadowBlur = 0;

  // ── 18. Top scan line ─────────────────────────────────────────────────────────
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, "transparent"); topBar.addColorStop(0.5, "rgba(0,255,136,0.6)"); topBar.addColorStop(1, "transparent");
  ctx.fillStyle = topBar; ctx.fillRect(0, 0, W, 3);

  // ── 19. Corner brackets ───────────────────────────────────────────────────────
  const cs = 80, cw = 4;
  [
    { x: 0, y: 0,   dx:  1, dy:  1, c: "rgba(0,255,100,0.7)"  },
    { x: W, y: 0,   dx: -1, dy:  1, c: "rgba(0,255,100,0.7)"  },
    { x: 0, y: H,   dx:  1, dy: -1, c: "rgba(240,165,0,0.7)"  },
    { x: W, y: H,   dx: -1, dy: -1, c: "rgba(240,165,0,0.7)"  },
  ].forEach(({ x, y, dx, dy, c }) => {
    ctx.strokeStyle = c; ctx.lineWidth = cw;
    ctx.shadowColor = c; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(x, y + dy*cw/2); ctx.lineTo(x + dx*cs, y + dy*cw/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + dx*cw/2, y); ctx.lineTo(x + dx*cw/2, y + dy*cs); ctx.stroke();
    ctx.shadowBlur = 0;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function StatusPoster() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [ready,     setReady]    = useState(false);
  const [loading,   setLoading]  = useState(true);
  const [dlLoading, setDlLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const logo = await loadImage(logoSrc);
        if (!mounted || !canvasRef.current) return;
        await drawPoster(canvasRef.current, logo);
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
      const a = document.createElement("a");
      a.href = url; a.download = "hasahisawi-status.png"; a.click();
      setDlLoading(false);
    }, 100);
  };

  const dispW = 360, dispH = 640;

  return (
    <div className="min-h-screen bg-[#040A06] flex flex-col items-center justify-center gap-6 p-8">

      {/* Phone frame */}
      <div style={{
        position: "relative", width: dispW + 28, borderRadius: 44,
        background: "linear-gradient(145deg,#1f1f1f,#0e0e0e)",
        padding: "44px 14px 36px",
        boxShadow: "0 0 0 1.5px #2a2a2a, 0 0 60px rgba(0,255,100,0.08), 0 40px 100px rgba(0,0,0,0.9)",
      }}>
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
          width: 100, height: 20, borderRadius: 10, background: "#111" }} />
        <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
          width: 80, height: 5, borderRadius: 3, background: "#2a2a2a" }} />

        <div style={{ width: dispW, height: dispH, borderRadius: 26, overflow: "hidden", position: "relative" }}>
          {loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", background: "#040A06", zIndex: 10 }}>
              <span style={{ color: "#00FF88", fontSize: 16, fontFamily: "Cairo, sans-serif",
                animation: "pulse 1.2s infinite" }}>جاري الرسم…</span>
            </div>
          )}
          <canvas ref={canvasRef}
            style={{ width: dispW, height: dispH, display: "block",
              opacity: loading ? 0 : 1, transition: "opacity 0.5s" }} />
        </div>
      </div>

      {/* Download button */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
        <button onClick={download} disabled={!ready || dlLoading}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: dlLoading ? "#1a3d28" : "linear-gradient(135deg,#00CC6A,#00FF88)",
            color: "#040A06", fontFamily: "Cairo, sans-serif", fontWeight: 900,
            fontSize: 16, padding: "14px 36px", borderRadius: 50,
            border: "none", cursor: ready ? "pointer" : "default",
            opacity: ready && !dlLoading ? 1 : 0.5,
            boxShadow: ready ? "0 0 30px rgba(0,255,100,0.35)" : "none",
            transition: "all 0.2s",
          }}
          dir="rtl">
          {dlLoading ? "⏳ جاري التحميل..." : "⬇️ تحميل PNG — 1080×1920"}
        </button>
        <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, fontFamily: "Cairo, sans-serif" }} dir="rtl">
          حالة واتساب · ستوري انستقرام · تيك توك
        </p>
      </div>
    </div>
  );
}
