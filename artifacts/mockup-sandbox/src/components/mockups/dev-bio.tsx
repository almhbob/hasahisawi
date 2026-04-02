import React, { useRef, useEffect, useState } from "react";
import logoSrc  from "../../assets/hasahisawi-logo.png";
import photoSrc from "../../assets/asim-photo.jpg";

/* ─── Canvas dimensions ─────────────────────────────────────────────────── */
const W = 1080, H = 1920;
const CX = W / 2;

/* ─── Palette ───────────────────────────────────────────────────────────── */
const C = {
  bg:    "#04080A",
  green: "#00E676", greenDim: "#00A854",
  gold:  "#FFB300",
  cyan:  "#00BCD4",
  w1: "rgba(255,255,255,0.95)",
  w2: "rgba(255,255,255,0.60)",
  w3: "rgba(255,255,255,0.28)",
};

/* ─── Typography ────────────────────────────────────────────────────────── */
const F = (w: number, s: number) => `${w} ${s}px/1 Cairo, Arial`;

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const i = new Image(); i.crossOrigin = "anonymous";
    i.onload = () => ok(i); i.onerror = () => fail(new Error(src)); i.src = src;
  });
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

function glow(ctx: CanvasRenderingContext2D, color: string, blur: number, fn: () => void) {
  ctx.shadowColor = color; ctx.shadowBlur = blur; fn(); ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
}

function gplay(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const k = s/48; ctx.save(); ctx.translate(x,y); ctx.scale(k,k);
  ctx.fillStyle="#00D4FF"; ctx.beginPath(); ctx.moveTo(4.5,3.5); ctx.lineTo(26.5,24); ctx.lineTo(4.5,44.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#FFD700"; ctx.beginPath(); ctx.moveTo(36,16.5); ctx.lineTo(26.5,24); ctx.lineTo(36,31.5); ctx.lineTo(43.5,27.5); ctx.lineTo(43.5,20.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#4CAF50"; ctx.beginPath(); ctx.moveTo(4.5,3.5); ctx.lineTo(26.5,24); ctx.lineTo(36,16.5); ctx.lineTo(12,2); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#F44336"; ctx.beginPath(); ctx.moveTo(4.5,44.5); ctx.lineTo(26.5,24); ctx.lineTo(36,31.5); ctx.lineTo(12,46); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ─── Cert data (top 4 = big featured badges; bottom 4 = compact) ──────── */
const BADGES = [
  { color:"#4285F4", label:"Google",    sub:"Advanced Data Analytics",   icon:"G",  ring:"#4285F4" },
  { color:"#1565C0", label:"IBM",       sub:"Cybersecurity Specialist",   icon:"I",  ring:"#0062FF" },
  { color:"#00BCEB", label:"Cisco",     sub:"Introduction to Data Sci.",  icon:"C",  ring:"#00BCEB" },
  { color:"#EE3124", label:"Fortinet",  sub:"Threat Landscape 2.0",       icon:"F",  ring:"#EE3124" },
];

const CERTS_MINI = [
  { color:"#1565C0", label:"Cybersecurity Fundamentals",  org:"IBM SkillsBuild · 2024",        icon:"I" },
  { color:"#0071C5", label:"Cloud DevOps",                org:"Intel · 2025",                  icon:"⚡" },
  { color:"#7B1FA2", label:"Design Thinking",             org:"Virginia Commonwealth · 2025",  icon:"V" },
  { color:"#00A854", label:"Agile Explorer",              org:"IBM SkillsBuild · 2025",         icon:"A" },
];

/* ─── Main draw function ────────────────────────────────────────────────── */
async function draw(canvas: HTMLCanvasElement, logo: HTMLImageElement, photo: HTMLImageElement) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = W; canvas.height = H;

  await Promise.all([
    document.fonts.load(F(900,100)),
    document.fonts.load(F(700,40)),
    document.fonts.load(F(400,30)),
  ]);

  /* ── 1. BACKGROUND ─────────────────────────────────────────────────────── */
  ctx.fillStyle = C.bg; ctx.fillRect(0,0,W,H);

  // Ambient top-left green glow
  const amb1 = ctx.createRadialGradient(0, 0, 0, 0, 0, 800);
  amb1.addColorStop(0,"rgba(0,90,40,0.55)"); amb1.addColorStop(1,"transparent");
  ctx.fillStyle = amb1; ctx.fillRect(0,0,W,H);

  // Ambient bottom-right gold
  const amb2 = ctx.createRadialGradient(W, H, 0, W, H, 700);
  amb2.addColorStop(0,"rgba(100,60,0,0.35)"); amb2.addColorStop(1,"transparent");
  ctx.fillStyle = amb2; ctx.fillRect(0,0,W,H);

  /* ── 2. HERO PHOTO — full bleed, cinematic, tall ───────────────────────── */
  const PH = 820;
  ctx.save();
  ctx.beginPath(); ctx.rect(0,0,W,PH); ctx.clip();

  const pr = photo.width / photo.height;
  let pw = W, ph_px = pw / pr;
  if (ph_px < PH) { ph_px = PH; pw = ph_px * pr; }
  ctx.drawImage(photo, (W-pw)/2, 0, pw, ph_px);

  // Cinematic: very slight darkening on edges only, photo stays bright
  const edgeL = ctx.createLinearGradient(0,0,160,0);
  edgeL.addColorStop(0,"rgba(4,8,10,0.55)"); edgeL.addColorStop(1,"transparent");
  ctx.fillStyle=edgeL; ctx.fillRect(0,0,W,PH);

  const edgeR = ctx.createLinearGradient(W-160,0,W,0);
  edgeR.addColorStop(0,"transparent"); edgeR.addColorStop(1,"rgba(4,8,10,0.55)");
  ctx.fillStyle=edgeR; ctx.fillRect(0,0,W,PH);

  // Bottom fade — name sits inside the photo
  const fadeB = ctx.createLinearGradient(0, PH*0.50, 0, PH);
  fadeB.addColorStop(0,"transparent"); fadeB.addColorStop(1,"rgba(4,8,10,0.98)");
  ctx.fillStyle=fadeB; ctx.fillRect(0,0,W,PH);

  ctx.restore();

  /* ── 3. TOP-LEFT LOGO BADGE ─────────────────────────────────────────────── */
  const LS=80, LX=40, LY=40;
  ctx.save();
  ctx.beginPath(); ctx.arc(LX+LS/2, LY+LS/2, LS/2, 0, Math.PI*2); ctx.clip();
  ctx.fillStyle="#fff"; ctx.fillRect(LX,LY,LS,LS);
  ctx.drawImage(logo, LX, LY, LS, LS); ctx.restore();
  glow(ctx, C.green, 18, () => {
    ctx.beginPath(); ctx.arc(LX+LS/2, LY+LS/2, LS/2, 0, Math.PI*2);
    ctx.strokeStyle=C.green; ctx.lineWidth=2.5; ctx.stroke();
  });

  /* ── 4. VERIFIED PILL (top-right) ─────────────────────────────────────── */
  {
    const tx=W-48, ty=52, fs=19;
    const label = "✦  VERIFIED DEVELOPER  ✦";
    ctx.font = F(700,fs);
    ctx.direction="ltr"; ctx.textAlign="center";
    const tw = ctx.measureText(label).width;
    const ph2 = fs*2, pw2 = tw + 40;
    rr(ctx, tx-pw2/2, ty-ph2/2, pw2, ph2, ph2/2);
    ctx.fillStyle="rgba(0,230,118,0.12)"; ctx.fill();
    rr(ctx, tx-pw2/2, ty-ph2/2, pw2, ph2, ph2/2);
    ctx.strokeStyle="rgba(0,230,118,0.35)"; ctx.lineWidth=1.2; ctx.stroke();
    ctx.fillStyle=C.green; ctx.fillText(label, tx, ty+fs*0.37);
  }

  /* ── 5. NAME — overlaid on photo bottom ─────────────────────────────────── */
  const NX = 60;

  // "Asim" — white, huge
  ctx.direction="ltr"; ctx.textAlign="left";
  ctx.font = F(900,114);
  glow(ctx,"rgba(0,0,0,0.9)",30, () => {
    ctx.fillStyle=C.w1; ctx.fillText("Asim", NX, 658);
  });

  // "Abdulrahman" — green, huge
  glow(ctx, C.green, 40, () => {
    const g = ctx.createLinearGradient(NX,0,NX+700,0);
    g.addColorStop(0,C.green); g.addColorStop(1,"#80FFB8");
    ctx.font = F(900,114);
    ctx.fillStyle=g; ctx.fillText("Abdulrahman", NX, 778);
  });

  // "Mohammed" — white, huge
  glow(ctx,"rgba(0,0,0,0.9)",20, () => {
    ctx.font = F(900,114);
    ctx.fillStyle=C.w1; ctx.fillText("Mohammed", NX, 898);
  });

  /* ── 6. TITLE + LOCATION ───────────────────────────────────────────────── */
  let Y = 940;

  // Title pill
  {
    const label = "Full-Stack Mobile Developer";
    ctx.font = F(700, 30); ctx.direction="ltr"; ctx.textAlign="left";
    const tw = ctx.measureText(label).width;
    const ph3=52, pw3=tw+44;
    rr(ctx, NX, Y, pw3, ph3, ph3/2);
    ctx.fillStyle="rgba(0,230,118,0.15)"; ctx.fill();
    rr(ctx, NX, Y, pw3, ph3, ph3/2);
    ctx.strokeStyle="rgba(0,230,118,0.40)"; ctx.lineWidth=1.5; ctx.stroke();
    glow(ctx,C.green,12,()=>{
      ctx.fillStyle=C.green; ctx.fillText(label, NX+22, Y+ph3/2+11);
    });
  }

  // Location — right aligned
  ctx.direction="rtl"; ctx.textAlign="right";
  ctx.font = F(400,28); ctx.fillStyle=C.w2;
  ctx.fillText("📍  ولاية الجزيرة · محلية حي فور", W-NX, Y+37);

  Y += 88;

  /* ── 7. THIN DIVIDER ───────────────────────────────────────────────────── */
  {
    const dg = ctx.createLinearGradient(NX,Y,W-NX,Y);
    dg.addColorStop(0,"transparent"); dg.addColorStop(0.5,"rgba(255,255,255,0.12)"); dg.addColorStop(1,"transparent");
    ctx.strokeStyle=dg; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(NX,Y); ctx.lineTo(W-NX,Y); ctx.stroke();
  }

  Y += 60;

  /* ── 8. FLOATING STATS ─────────────────────────────────────────────────── */
  const stats = [
    { val:"16+",  label:"Certificates",  color:C.green },
    { val:"4",    label:"Apps on Store", color:C.gold  },
    { val:"34",   label:"Years Old",     color:C.cyan  },
  ];
  const SW = (W - NX*2) / 3;

  stats.forEach((s, i) => {
    const sx = NX + i*SW + SW/2;
    // Subtle glow dot behind number
    const rg = ctx.createRadialGradient(sx, Y+40, 0, sx, Y+40, 90);
    rg.addColorStop(0, s.color+"18"); rg.addColorStop(1,"transparent");
    ctx.fillStyle=rg; ctx.fillRect(sx-100,Y-20,200,160);

    // Big number
    glow(ctx, s.color, 28, () => {
      ctx.direction="ltr"; ctx.textAlign="center";
      ctx.font = F(900, 90); ctx.fillStyle=s.color;
      ctx.fillText(s.val, sx, Y+76);
    });
    // Label
    ctx.font = F(400,26); ctx.fillStyle=C.w3;
    ctx.fillText(s.label, sx, Y+114);

    // Vertical separator (between stats)
    if (i < 2) {
      const sepX = NX + (i+1)*SW;
      ctx.strokeStyle="rgba(255,255,255,0.07)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(sepX, Y+10); ctx.lineTo(sepX, Y+110); ctx.stroke();
    }
  });

  Y += 165;

  /* ── 9. DIVIDER ────────────────────────────────────────────────────────── */
  {
    const dg2 = ctx.createLinearGradient(NX,Y,W-NX,Y);
    dg2.addColorStop(0,"transparent"); dg2.addColorStop(0.5,"rgba(255,255,255,0.09)"); dg2.addColorStop(1,"transparent");
    ctx.strokeStyle=dg2; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(NX,Y); ctx.lineTo(W-NX,Y); ctx.stroke();
  }

  Y += 64;

  /* ── 10. APP SHOWCASE ──────────────────────────────────────────────────── */
  // Centered, big — just the name and a subtle badge
  // App name — Arabic, huge
  ctx.direction="rtl"; ctx.textAlign="center";
  ctx.font = F(400,26); ctx.fillStyle=C.w3;
  ctx.fillText("تطبيق مُطوَّر ومنشور على", CX, Y+32);

  Y += 54;

  glow(ctx, C.green, 55, () => {
    const ag = ctx.createLinearGradient(CX-350,0,CX+350,0);
    ag.addColorStop(0,C.greenDim); ag.addColorStop(0.4,C.green); ag.addColorStop(1,"#80FFB8");
    ctx.font = F(900,120); ctx.fillStyle=ag; ctx.textAlign="center";
    ctx.fillText("حصاحيصاوي", CX, Y+100);
  });

  Y += 126;

  // Google Play row — centered
  const gpW=52;
  const gpRowW = gpW + 20 + 200;
  const gpX = CX - gpRowW/2;
  gplay(ctx, gpX, Y, gpW);
  ctx.direction="ltr"; ctx.textAlign="left";
  ctx.font = F(700,30); ctx.fillStyle=C.w1;
  ctx.fillText("Google Play", gpX+gpW+16, Y+30);
  ctx.font = F(400,22); ctx.fillStyle=C.w3;
  ctx.fillText("Published App  ·  v2.2.7", gpX+gpW+16, Y+58);

  Y += 100;

  /* ── 11. DIVIDER ───────────────────────────────────────────────────────── */
  {
    const dg3 = ctx.createLinearGradient(NX,Y,W-NX,Y);
    dg3.addColorStop(0,"transparent"); dg3.addColorStop(0.5,"rgba(255,255,255,0.09)"); dg3.addColorStop(1,"transparent");
    ctx.strokeStyle=dg3; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(NX,Y); ctx.lineTo(W-NX,Y); ctx.stroke();
  }

  Y += 64;

  /* ── 12. SECTION LABEL: CERTIFICATIONS ────────────────────────────────── */
  ctx.direction="ltr"; ctx.textAlign="center";
  ctx.font = F(700,22); ctx.fillStyle="rgba(255,179,0,0.60)";
  ctx.fillText("● CERTIFICATIONS  ●", CX, Y+18);

  Y += 48;

  /* ── 13. FOUR LARGE CIRCULAR BADGES ────────────────────────────────────── */
  const BR = 92;   // badge radius
  const BGAP = (W - NX*2 - BADGES.length*BR*2) / (BADGES.length - 1);
  const BY = Y + BR;

  BADGES.forEach((b, i) => {
    const bx = NX + BR + i*(BR*2 + BGAP);
    const bcy = BY;

    // Outer glow ring
    glow(ctx, b.ring, 24, () => {
      ctx.beginPath(); ctx.arc(bx,bcy,BR,0,Math.PI*2);
      ctx.strokeStyle=b.color+"80"; ctx.lineWidth=2.5; ctx.stroke();
    });

    // Badge fill
    const bg4 = ctx.createRadialGradient(bx-BR*0.25, bcy-BR*0.25, 4, bx, bcy, BR);
    bg4.addColorStop(0, b.color+"28"); bg4.addColorStop(1,"rgba(4,8,10,0.85)");
    ctx.beginPath(); ctx.arc(bx,bcy,BR,0,Math.PI*2);
    ctx.fillStyle=bg4; ctx.fill();

    // Icon letter
    glow(ctx, b.color, 20, () => {
      ctx.direction="ltr"; ctx.textAlign="center";
      ctx.font = F(900,72); ctx.fillStyle=b.color;
      ctx.fillText(b.icon, bx, bcy+26);
    });

    // Org name below circle
    ctx.font = F(700,22); ctx.fillStyle=b.color;
    ctx.fillText(b.label, bx, bcy+BR+34);
    ctx.font = F(400,19); ctx.fillStyle=C.w3;
    // Wrap sub text
    const sub = b.sub.length > 18 ? b.sub.slice(0,17)+"…" : b.sub;
    ctx.fillText(sub, bx, bcy+BR+60);
  });

  Y += BR*2 + 110;

  /* ── 14. MINI CERTS ROW (4 compact chips) ──────────────────────────────── */
  const MCH = 88, MCW = (W - NX*2 - 3*16) / 4;
  CERTS_MINI.forEach((c, i) => {
    const mx = NX + i*(MCW+16);
    rr(ctx, mx, Y, MCW, MCH, 16);
    const mg = ctx.createLinearGradient(mx,Y,mx+MCW,Y+MCH);
    mg.addColorStop(0, c.color+"16"); mg.addColorStop(1,"rgba(4,8,10,0.55)");
    ctx.fillStyle=mg; ctx.fill();
    rr(ctx, mx, Y, MCW, MCH, 16);
    ctx.strokeStyle=c.color+"30"; ctx.lineWidth=1; ctx.stroke();

    // Left color strip
    rr(ctx, mx, Y, 4, MCH, 2); ctx.fillStyle=c.color; ctx.fill();

    // Icon
    ctx.direction="ltr"; ctx.textAlign="center";
    ctx.font = F(700,22); ctx.fillStyle=c.color;
    ctx.fillText(c.icon, mx+MCW/2, Y+34);

    ctx.font = F(700,18); ctx.fillStyle=C.w2;
    const lab = c.label.length>14?c.label.slice(0,13)+"…":c.label;
    ctx.fillText(lab, mx+MCW/2, Y+56);

    ctx.font = F(400,15); ctx.fillStyle=C.w3;
    const org = c.org.split("·")[0].trim();
    ctx.fillText(org, mx+MCW/2, Y+74);
  });

  Y += MCH + 72;

  /* ── 15. DIVIDER ───────────────────────────────────────────────────────── */
  {
    const dg5 = ctx.createLinearGradient(NX,Y,W-NX,Y);
    dg5.addColorStop(0,"transparent"); dg5.addColorStop(0.5,"rgba(255,255,255,0.09)"); dg5.addColorStop(1,"transparent");
    ctx.strokeStyle=dg5; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(NX,Y); ctx.lineTo(W-NX,Y); ctx.stroke();
  }

  Y += 72;

  /* ── 16. DEDICATIONS — poetic, centered, generous space ─────────────────── */
  // Label
  ctx.direction="ltr"; ctx.textAlign="center";
  ctx.font = F(400,22); ctx.fillStyle="rgba(255,179,0,0.45)";
  ctx.fillText("إِهداء", CX, Y+18);
  Y += 50;

  // Dedication 1
  ctx.direction="rtl"; ctx.textAlign="center";
  ctx.font = F(400,30); ctx.fillStyle=C.w3;
  ctx.fillText("إلى زوجتي العزيزة وابنتي", CX, Y+38);

  Y += 58;
  glow(ctx,"rgba(255,179,0,0.5)",28,()=>{
    const jg = ctx.createLinearGradient(CX-180,0,CX+180,0);
    jg.addColorStop(0,C.gold); jg.addColorStop(1,"#FF8A80");
    ctx.font = F(900,54); ctx.fillStyle=jg; ctx.textAlign="center"; ctx.direction="rtl";
    ctx.fillText("✨ جمان ✨", CX, Y+50);
  });

  Y += 100;

  // Separation dot
  ctx.fillStyle="rgba(255,255,255,0.12)";
  ctx.beginPath(); ctx.arc(CX-40, Y, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(CX,    Y, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(CX+40, Y, 3, 0, Math.PI*2); ctx.fill();

  Y += 40;

  // Dedication 2
  ctx.direction="rtl"; ctx.textAlign="center";
  ctx.font = F(400,30); ctx.fillStyle=C.w3;
  ctx.fillText("وإلى جميع مواطني", CX, Y+38);

  Y += 60;
  glow(ctx, C.green, 28, () => {
    const cg3 = ctx.createLinearGradient(CX-250,0,CX+250,0);
    cg3.addColorStop(0,C.greenDim); cg3.addColorStop(1,"#80FFB8");
    ctx.font = F(900,52); ctx.fillStyle=cg3; ctx.textAlign="center"; ctx.direction="rtl";
    ctx.fillText("الحصاحيصا وضواحيها 🏘️", CX, Y+48);
  });

  Y += 110;

  /* ── 17. FOOTER ─────────────────────────────────────────────────────────── */
  {
    const dg6 = ctx.createLinearGradient(NX,Y,W-NX,Y);
    dg6.addColorStop(0,"transparent"); dg6.addColorStop(0.5,"rgba(255,255,255,0.08)"); dg6.addColorStop(1,"transparent");
    ctx.strokeStyle=dg6; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(NX,Y); ctx.lineTo(W-NX,Y); ctx.stroke();
  }

  Y += 40;
  ctx.direction="ltr"; ctx.textAlign="center";
  ctx.font = F(400,20); ctx.fillStyle=C.w3;
  ctx.fillText("almhbob.iii@gmail.com  ·  credly.com/users/asim-abdulrahman", CX, Y+28);
  ctx.font = F(400,18); ctx.fillStyle="rgba(255,255,255,0.15)";
  ctx.fillText("© 2026 Asim Abdulrahman Mohammed", CX, Y+58);

  /* ── 18. ACCENT BARS (top & bottom) ─────────────────────────────────────── */
  glow(ctx, C.green, 16, () => {
    const tg = ctx.createLinearGradient(0,0,W,0);
    tg.addColorStop(0,"transparent"); tg.addColorStop(0.3,C.green);
    tg.addColorStop(0.7,C.gold); tg.addColorStop(1,"transparent");
    ctx.fillStyle=tg; ctx.fillRect(0,0,W,5);
  });
  glow(ctx, C.gold, 16, () => {
    const bg5 = ctx.createLinearGradient(0,0,W,0);
    bg5.addColorStop(0,"transparent"); bg5.addColorStop(0.3,C.gold);
    bg5.addColorStop(0.7,C.green); bg5.addColorStop(1,"transparent");
    ctx.fillStyle=bg5; ctx.fillRect(0,H-5,W,5);
  });

  /* ── 19. CORNER BRACKETS ─────────────────────────────────────────────────── */
  const CL=64, CLw=4;
  [
    {x:0,  y:0,  dx:1,  dy:1,  c:C.green},
    {x:W,  y:0,  dx:-1, dy:1,  c:C.green},
    {x:0,  y:H,  dx:1,  dy:-1, c:C.gold },
    {x:W,  y:H,  dx:-1, dy:-1, c:C.gold },
  ].forEach(({x,y,dx,dy,c}) => {
    glow(ctx,c,14,()=>{
      ctx.strokeStyle=c; ctx.lineWidth=CLw;
      ctx.beginPath(); ctx.moveTo(x,y+dy*CLw/2); ctx.lineTo(x+dx*CL,y+dy*CLw/2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+dx*CLw/2,y); ctx.lineTo(x+dx*CLw/2,y+dy*CL); ctx.stroke();
    });
  });
}

/* ─── React component ───────────────────────────────────────────────────── */
export default function DevBio() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady]     = useState(false);
  const [loading, setLoading] = useState(true);
  const [dl, setDl]           = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [logo, photo] = await Promise.all([loadImg(logoSrc), loadImg(photoSrc)]);
        if (!alive || !ref.current) return;
        await draw(ref.current, logo, photo);
        setReady(true);
      } catch(e){ console.error(e); }
      finally { if(alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const download = () => {
    if (!ref.current || !ready) return;
    setDl(true);
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = ref.current!.toDataURL("image/png");
      a.download = "asim-dev-bio.png"; a.click();
      setDl(false);
    }, 100);
  };

  const DW = 540, DH = DW * (H/W);

  return (
    <div style={{minHeight:"100vh", background:C.bg, display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center",
      gap:28, padding:32}}>

      <div style={{position:"relative", width:DW, borderRadius:12, overflow:"hidden",
        boxShadow:"0 0 80px rgba(0,230,118,0.12), 0 50px 120px rgba(0,0,0,0.85)"}}>
        {loading && (
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
            justifyContent:"center",background:C.bg,zIndex:10,minHeight:DH}}>
            <span style={{color:C.green,fontSize:17,fontFamily:"Cairo,sans-serif"}}>
              جاري الرسم…
            </span>
          </div>
        )}
        <canvas ref={ref} style={{width:DW, height:DH, display:"block",
          opacity:loading?0:1, transition:"opacity .5s"}}/>
      </div>

      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
        <button onClick={download} disabled={!ready||dl}
          style={{
            background: ready&&!dl
              ? "linear-gradient(135deg,#00A854,#00E676)"
              : "#1a2e20",
            color:"#040A07", fontFamily:"Cairo,sans-serif", fontWeight:900,
            fontSize:16, padding:"14px 44px", borderRadius:50,
            border:"none", cursor:ready?"pointer":"default",
            opacity:ready&&!dl?1:0.45,
            boxShadow:ready?"0 0 36px rgba(0,230,118,.35)":"none",
            transition:"all .25s",
          }} dir="rtl">
          {dl ? "⏳ جاري التحميل..." : "⬇️ تحميل PNG — 1080×1920"}
        </button>
        <p style={{color:"rgba(255,255,255,0.18)",fontSize:12,
          fontFamily:"Cairo,sans-serif"}} dir="rtl">
          بطاقة المطور · جودة عالية
        </p>
      </div>
    </div>
  );
}
