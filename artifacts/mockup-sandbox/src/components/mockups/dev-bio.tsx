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

const CERTS = [
  { org: "Google",  icon: "G", color: "#4285F4", label: "Advanced Data Analytics",     sub: "Professional Certificate · 2026" },
  { org: "IBM",     icon: "I", color: "#1F70C1", label: "Cybersecurity Specialist",     sub: "Professional Certificate · 2026" },
  { org: "IBM",     icon: "I", color: "#1F70C1", label: "Cybersecurity Fundamentals",   sub: "IBM SkillsBuild · 2024"          },
  { org: "Cisco",   icon: "C", color: "#00BCEB", label: "Introduction to Data Science", sub: "Cisco · 2025"                    },
  { org: "Intel",   icon: "⚡", color: "#0071C5", label: "Cloud DevOps",                 sub: "Intel · 2025"                    },
  { org: "Fortinet",icon: "F", color: "#EE3124", label: "Threat Landscape 2.0",         sub: "Fortinet · 2025"                 },
  { org: "VCU",     icon: "V", color: "#F0A500", label: "Introduction to Design Thinking", sub: "Virginia Commonwealth · 2025" },
  { org: "Agile",   icon: "A", color: "#27AE68", label: "Agile Explorer",               sub: "IBM SkillsBuild · 2025"          },
];

async function drawCard(canvas: HTMLCanvasElement, logo: HTMLImageElement) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = W; canvas.height = H;

  await document.fonts.load("900 100px Cairo");
  await document.fonts.load("700 44px Cairo");
  await document.fonts.load("400 30px Cairo");

  const CX = W / 2;

  // ── 1. Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = "#050A07"; ctx.fillRect(0, 0, W, H);

  // Subtle green-to-black gradient top
  const bgTop = ctx.createLinearGradient(0, 0, 0, H * 0.45);
  bgTop.addColorStop(0, "rgba(0,80,35,0.55)"); bgTop.addColorStop(1, "transparent");
  ctx.fillStyle = bgTop; ctx.fillRect(0, 0, W, H);

  // Gold glow bottom
  const bgBot = ctx.createRadialGradient(CX, H * 0.88, 0, CX, H * 0.88, 600);
  bgBot.addColorStop(0, "rgba(240,165,0,0.12)"); bgBot.addColorStop(1, "transparent");
  ctx.fillStyle = bgBot; ctx.fillRect(0, 0, W, H);

  // ── 2. Dot grid ───────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(39,174,104,0.04)";
  for (let y = 50; y < H; y += 55) for (let x = 50; x < W; x += 55) {
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI*2); ctx.fill();
  }

  // ── 3. Header bar (top green stripe) ─────────────────────────────────────────
  const hdrGrad = ctx.createLinearGradient(0, 0, W, 0);
  hdrGrad.addColorStop(0, "#00FF88"); hdrGrad.addColorStop(0.5, "#00CC6A"); hdrGrad.addColorStop(1, "#F0A500");
  ctx.fillStyle = hdrGrad; ctx.fillRect(0, 0, W, 8);
  ctx.shadowColor = "#00FF88"; ctx.shadowBlur = 18; ctx.fillRect(0, 0, W, 8); ctx.shadowBlur = 0;

  // ── 4. Avatar circle ──────────────────────────────────────────────────────────
  const AV_Y = 200, AV_R = 160;

  // Glow ring
  ctx.beginPath(); ctx.arc(CX, AV_Y, AV_R + 22, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(0,255,136,0.18)"; ctx.lineWidth = 18; ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, AV_Y, AV_R + 8, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(0,255,136,0.55)"; ctx.lineWidth = 3;
  ctx.shadowColor = "#00FF88"; ctx.shadowBlur = 22; ctx.stroke(); ctx.shadowBlur = 0;

  // Avatar fill — gradient
  const avFill = ctx.createRadialGradient(CX - 50, AV_Y - 60, 0, CX, AV_Y, AV_R);
  avFill.addColorStop(0, "#0D3A1F"); avFill.addColorStop(1, "#060E08");
  ctx.beginPath(); ctx.arc(CX, AV_Y, AV_R, 0, Math.PI*2);
  ctx.fillStyle = avFill; ctx.fill();

  // Initials "AA" inside circle
  ctx.direction = "ltr"; ctx.textAlign = "center";
  ctx.font = "900 140px Cairo, Arial"; ctx.fillStyle = "#00FF88";
  ctx.shadowColor = "rgba(0,255,136,0.4)"; ctx.shadowBlur = 25;
  ctx.fillText("AA", CX, AV_Y + 50); ctx.shadowBlur = 0;

  // App logo badge — small circle bottom-right of avatar
  const BX = CX + AV_R * 0.68, BY = AV_Y + AV_R * 0.68;
  ctx.beginPath(); ctx.arc(BX, BY, 50, 0, Math.PI*2);
  ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 15;
  ctx.fill(); ctx.shadowBlur = 0;
  ctx.drawImage(logo, BX - 38, BY - 38, 76, 76);

  // ── 5. Name + title ───────────────────────────────────────────────────────────
  const NAME_Y = AV_Y + AV_R + 80;

  ctx.direction = "ltr"; ctx.textAlign = "center";
  ctx.font = "900 62px Cairo, Arial"; ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 15;
  ctx.fillText("Asim Abdulrahman Mohammed", CX, NAME_Y); ctx.shadowBlur = 0;

  // Title pill
  const title = "Full-Stack Mobile Developer";
  ctx.font = "600 28px Cairo, Arial";
  const tW = ctx.measureText(title).width + 50;
  const tH = 50, tX = CX - tW/2, tY = NAME_Y + 18;
  roundRect(ctx, tX, tY, tW, tH, tH/2);
  const tGrad = ctx.createLinearGradient(tX, tY, tX+tW, tY);
  tGrad.addColorStop(0, "rgba(0,255,100,0.18)"); tGrad.addColorStop(1, "rgba(0,180,70,0.08)");
  ctx.fillStyle = tGrad; ctx.fill();
  roundRect(ctx, tX, tY, tW, tH, tH/2);
  ctx.strokeStyle = "rgba(0,255,100,0.45)"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#00FF88"; ctx.textAlign = "center";
  ctx.fillText(title, CX, tY + 32);

  // ── 6. Project row (حصاحيصاوي) ───────────────────────────────────────────────
  const PROJ_Y = tY + tH + 52;
  ctx.direction = "rtl"; ctx.textAlign = "center";
  ctx.font = "700 30px Cairo, Arial"; ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText("مطوّر تطبيق", CX, PROJ_Y);

  const appGrad = ctx.createLinearGradient(CX-220, 0, CX+220, 0);
  appGrad.addColorStop(0, "#00FF88"); appGrad.addColorStop(1, "#A8FFD0");
  ctx.font = "900 72px Cairo, Arial"; ctx.fillStyle = appGrad;
  ctx.shadowColor = "rgba(0,255,136,0.45)"; ctx.shadowBlur = 22;
  ctx.fillText("حصاحيصاوي", CX, PROJ_Y + 82); ctx.shadowBlur = 0;

  // ── 7. Contact row ────────────────────────────────────────────────────────────
  const CON_Y = PROJ_Y + 82 + 50;
  const contacts = [
    { icon: "✉", val: "almhbob.iii@gmail.com" },
    { icon: "🏅", val: "credly.com/users/asim-abdulrahman" },
  ];
  contacts.forEach((c, i) => {
    const cy = CON_Y + i * 64;
    ctx.direction = "ltr"; ctx.textAlign = "center";
    ctx.font = "400 26px Cairo, Arial"; ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(`${c.icon}  ${c.val}`, CX, cy);
  });

  // ── 8. Section title: Certifications ─────────────────────────────────────────
  const SEC_Y = CON_Y + contacts.length * 64 + 52;

  // Divider with label
  const divMid = SEC_Y - 12;
  const dl = ctx.createLinearGradient(80, divMid, CX - 140, divMid);
  dl.addColorStop(0, "transparent"); dl.addColorStop(1, "rgba(240,165,0,0.5)");
  ctx.strokeStyle = dl; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(80, divMid); ctx.lineTo(CX - 150, divMid); ctx.stroke();

  const dr = ctx.createLinearGradient(CX + 140, divMid, W - 80, divMid);
  dr.addColorStop(0, "rgba(240,165,0,0.5)"); dr.addColorStop(1, "transparent");
  ctx.strokeStyle = dr;
  ctx.beginPath(); ctx.moveTo(CX + 150, divMid); ctx.lineTo(W - 80, divMid); ctx.stroke();

  ctx.direction = "ltr"; ctx.textAlign = "center";
  ctx.font = "700 28px Cairo, Arial"; ctx.fillStyle = "#F0A500";
  ctx.fillText("CERTIFICATIONS", CX, SEC_Y);

  // ── 9. Cert cards ─────────────────────────────────────────────────────────────
  const CARD_W = 920, CARD_H = 88, CARD_X = (W - CARD_W) / 2;
  const CARD_GAP = 20;
  const CARDS_Y = SEC_Y + 36;

  CERTS.forEach((cert, i) => {
    const cy = CARDS_Y + i * (CARD_H + CARD_GAP);

    // Card bg
    roundRect(ctx, CARD_X, cy, CARD_W, CARD_H, 18);
    const cg = ctx.createLinearGradient(CARD_X, cy, CARD_X + CARD_W, cy);
    cg.addColorStop(0, "rgba(255,255,255,0.05)"); cg.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = cg; ctx.fill();
    roundRect(ctx, CARD_X, cy, CARD_W, CARD_H, 18);
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1; ctx.stroke();

    // Left accent stripe
    roundRect(ctx, CARD_X, cy, 6, CARD_H, 3);
    ctx.fillStyle = cert.color; ctx.fill();

    // Org icon circle
    ctx.beginPath(); ctx.arc(CARD_X + 52, cy + CARD_H/2, 28, 0, Math.PI*2);
    ctx.fillStyle = cert.color + "22"; ctx.fill();
    ctx.beginPath(); ctx.arc(CARD_X + 52, cy + CARD_H/2, 28, 0, Math.PI*2);
    ctx.strokeStyle = cert.color + "66"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.direction = "ltr"; ctx.textAlign = "center";
    ctx.font = "700 26px Cairo, Arial"; ctx.fillStyle = cert.color;
    ctx.fillText(cert.icon, CARD_X + 52, cy + CARD_H/2 + 9);

    // Label
    ctx.textAlign = "left";
    ctx.font = "700 28px Cairo, Arial"; ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.fillText(cert.label, CARD_X + 95, cy + 36);

    // Sub
    ctx.font = "400 22px Cairo, Arial"; ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.fillText(cert.sub, CARD_X + 95, cy + 65);
  });

  // ── 10. Stats strip ───────────────────────────────────────────────────────────
  const STAT_Y = CARDS_Y + CERTS.length * (CARD_H + CARD_GAP) + 40;
  const stats = [
    { val: "16+", label: "Certifications" },
    { val: "1",   label: "App Published"  },
    { val: "2026",label: "Active Year"    },
  ];
  const statW = (CARD_W - 40) / stats.length;
  stats.forEach((s, i) => {
    const sx = CARD_X + i * (statW + 20);
    roundRect(ctx, sx, STAT_Y, statW, 110, 20);
    const sg = ctx.createLinearGradient(sx, STAT_Y, sx, STAT_Y + 110);
    sg.addColorStop(0, "rgba(0,255,100,0.10)"); sg.addColorStop(1, "rgba(0,100,40,0.05)");
    ctx.fillStyle = sg; ctx.fill();
    roundRect(ctx, sx, STAT_Y, statW, 110, 20);
    ctx.strokeStyle = "rgba(0,255,100,0.20)"; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.direction = "ltr"; ctx.textAlign = "center";
    ctx.font = "900 52px Cairo, Arial"; ctx.fillStyle = "#00FF88";
    ctx.shadowColor = "rgba(0,255,136,0.4)"; ctx.shadowBlur = 15;
    ctx.fillText(s.val, sx + statW/2, STAT_Y + 62); ctx.shadowBlur = 0;

    ctx.font = "400 22px Cairo, Arial"; ctx.fillStyle = "rgba(255,255,255,0.40)";
    ctx.fillText(s.label, sx + statW/2, STAT_Y + 90);
  });

  // ── 11. Bottom bar ────────────────────────────────────────────────────────────
  const botGrad = ctx.createLinearGradient(0, 0, W, 0);
  botGrad.addColorStop(0, "transparent"); botGrad.addColorStop(0.3, "#00FF88");
  botGrad.addColorStop(0.5, "#F0A500");   botGrad.addColorStop(0.7, "#00FF88");
  botGrad.addColorStop(1, "transparent");
  ctx.fillStyle = botGrad;
  ctx.shadowColor = "#00FF88"; ctx.shadowBlur = 18;
  ctx.fillRect(0, H - 6, W, 6); ctx.shadowBlur = 0;

  // ── 12. Corner brackets ───────────────────────────────────────────────────────
  const cs = 80, cw = 4;
  [
    { x: 0, y: 0, dx:  1, dy:  1, c: "rgba(0,255,100,0.7)"  },
    { x: W, y: 0, dx: -1, dy:  1, c: "rgba(0,255,100,0.7)"  },
    { x: 0, y: H, dx:  1, dy: -1, c: "rgba(240,165,0,0.7)"  },
    { x: W, y: H, dx: -1, dy: -1, c: "rgba(240,165,0,0.7)"  },
  ].forEach(({ x, y, dx, dy, c }) => {
    ctx.strokeStyle = c; ctx.lineWidth = cw;
    ctx.shadowColor = c; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(x, y+dy*cw/2); ctx.lineTo(x+dx*cs, y+dy*cw/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+dx*cw/2, y); ctx.lineTo(x+dx*cw/2, y+dy*cs); ctx.stroke();
    ctx.shadowBlur = 0;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DevBio() {
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
        await drawCard(canvasRef.current, logo);
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
      a.href = url; a.download = "asim-dev-bio.png"; a.click();
      setDlLoading(false);
    }, 100);
  };

  const dispW = 360, dispH = 640;

  return (
    <div style={{ minHeight: "100vh", background: "#050A07", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 32 }}>

      {/* Phone frame */}
      <div style={{
        position: "relative", width: dispW + 28, borderRadius: 44,
        background: "linear-gradient(145deg,#1a1a1a,#0a0a0a)",
        padding: "44px 14px 36px",
        boxShadow: "0 0 0 1.5px #222, 0 0 60px rgba(0,255,100,0.10), 0 40px 100px rgba(0,0,0,0.9)",
      }}>
        <div style={{ position:"absolute", top:14, left:"50%", transform:"translateX(-50%)",
          width:100, height:20, borderRadius:10, background:"#111" }} />
        <div style={{ position:"absolute", bottom:10, left:"50%", transform:"translateX(-50%)",
          width:80, height:5, borderRadius:3, background:"#222" }} />

        <div style={{ width: dispW, height: dispH, borderRadius: 26, overflow: "hidden", position: "relative" }}>
          {loading && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
              justifyContent:"center", background:"#050A07", zIndex:10 }}>
              <span style={{ color:"#00FF88", fontSize:16, fontFamily:"Cairo, sans-serif" }}>جاري الرسم…</span>
            </div>
          )}
          <canvas ref={canvasRef}
            style={{ width: dispW, height: dispH, display: "block",
              opacity: loading ? 0 : 1, transition: "opacity 0.5s" }} />
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
        <button onClick={download} disabled={!ready || dlLoading}
          style={{
            background: "linear-gradient(135deg,#00CC6A,#00FF88)",
            color: "#050A07", fontFamily:"Cairo, sans-serif", fontWeight:900,
            fontSize:16, padding:"14px 36px", borderRadius:50, border:"none",
            cursor: ready ? "pointer" : "default",
            opacity: ready && !dlLoading ? 1 : 0.45,
            boxShadow: ready ? "0 0 30px rgba(0,255,100,0.35)" : "none",
          }} dir="rtl">
          {dlLoading ? "⏳ جاري التحميل..." : "⬇️ تحميل البطاقة PNG — 1080×1920"}
        </button>
        <p style={{ color:"rgba(255,255,255,0.2)", fontSize:12, fontFamily:"Cairo, sans-serif" }} dir="rtl">
          بطاقة تعريف المطور · حالة واتساب · ستوري
        </p>
      </div>
    </div>
  );
}
