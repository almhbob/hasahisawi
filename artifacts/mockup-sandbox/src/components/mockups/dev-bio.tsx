import React, { useRef, useEffect, useState } from "react";
import logoSrc  from "../../assets/hasahisawi-logo.png";
import photoSrc from "../../assets/asim-photo.jpg";

/* ─── Tokens ─────────────────────────────────────────────────────────────────── */
const W = 1080, H = 1980;
const CX = W / 2;
const sp = (n: number) => n * 8;
const C = {
  bg:      "#04080A",
  surface: "rgba(255,255,255,0.045)",
  border:  "rgba(255,255,255,0.09)",
  green:   "#00E676", greenDim: "#00A854",
  gold:    "#FFB300", cyan: "#00BCD4",
  w1: "rgba(255,255,255,0.92)",
  w2: "rgba(255,255,255,0.55)",
  w3: "rgba(255,255,255,0.25)",
};
const F = (wt: number, sz: number) => `${wt} ${sz}px Cairo, Arial`;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error(src));
    img.src = src;
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

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  borderColor = C.border, fillColor = C.surface) {
  rr(ctx, x, y, w, h, 20);
  ctx.fillStyle = fillColor; ctx.fill();
  rr(ctx, x, y, w, h, 20);
  ctx.strokeStyle = borderColor; ctx.lineWidth = 1.5; ctx.stroke();
}

function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number,
  bg: string, fg: string, fSize = 24) {
  ctx.direction = "ltr"; ctx.textAlign = "center";
  ctx.font = F(700, fSize);
  const tw = ctx.measureText(text).width;
  const ph = fSize * 1.9, pw = tw + sp(5);
  rr(ctx, cx - pw/2, cy - ph/2, pw, ph, ph/2);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg; ctx.fillText(text, cx, cy + fSize * 0.37);
}

function gplay(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const k = s/48; ctx.save(); ctx.translate(x,y); ctx.scale(k,k);
  ctx.fillStyle="#00D4FF"; ctx.beginPath(); ctx.moveTo(4.5,3.5); ctx.lineTo(26.5,24); ctx.lineTo(4.5,44.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#FFD700"; ctx.beginPath(); ctx.moveTo(36,16.5); ctx.lineTo(26.5,24); ctx.lineTo(36,31.5); ctx.lineTo(43.5,27.5); ctx.lineTo(43.5,20.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#4CAF50"; ctx.beginPath(); ctx.moveTo(4.5,3.5); ctx.lineTo(26.5,24); ctx.lineTo(36,16.5); ctx.lineTo(12,2); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#F44336"; ctx.beginPath(); ctx.moveTo(4.5,44.5); ctx.lineTo(26.5,24); ctx.lineTo(36,31.5); ctx.lineTo(12,46); ctx.closePath(); ctx.fill();
  ctx.restore();
}

const CERTS = [
  { color:"#4285F4", icon:"G", label:"Advanced Data Analytics",        org:"Google · Coursera · 2026"     },
  { color:"#1565C0", icon:"I", label:"Cybersecurity Specialist",        org:"IBM · Coursera · 2026"        },
  { color:"#1565C0", icon:"I", label:"Cybersecurity Fundamentals",      org:"IBM SkillsBuild · 2024"       },
  { color:"#00BCEB", icon:"C", label:"Introduction to Data Science",    org:"Cisco · 2025"                 },
  { color:"#0071C5", icon:"⚡", label:"Cloud DevOps",                   org:"Intel · 2025"                 },
  { color:"#EE3124", icon:"F", label:"Threat Landscape 2.0",           org:"Fortinet · 2025"              },
  { color:"#7B1FA2", icon:"V", label:"Design Thinking",                 org:"Virginia Commonwealth · 2025" },
  { color:"#00A854", icon:"A", label:"Agile Explorer",                  org:"IBM SkillsBuild · 2025"       },
];

async function draw(canvas: HTMLCanvasElement, logo: HTMLImageElement, photo: HTMLImageElement) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = W; canvas.height = H;
  await Promise.all([
    document.fonts.load(F(900,80)), document.fonts.load(F(700,36)),
    document.fonts.load(F(400,28)), document.fonts.load(F(900,48)),
  ]);

  // ── BACKGROUND ───────────────────────────────────────────────────────────────
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const bg1 = ctx.createLinearGradient(0,0,W,H*0.5);
  bg1.addColorStop(0,"rgba(0,70,35,0.50)"); bg1.addColorStop(1,"transparent");
  ctx.fillStyle = bg1; ctx.fillRect(0,0,W,H);
  const bg2 = ctx.createRadialGradient(W*0.85,H*0.80,0,W*0.85,H*0.80,550);
  bg2.addColorStop(0,"rgba(255,180,0,0.10)"); bg2.addColorStop(1,"transparent");
  ctx.fillStyle = bg2; ctx.fillRect(0,0,W,H);

  // Dot grid
  ctx.fillStyle = "rgba(0,230,118,0.035)";
  for (let y=sp(7); y<H; y+=sp(7)) for (let x=sp(7); x<W; x+=sp(7)) {
    ctx.beginPath(); ctx.arc(x,y,1.6,0,Math.PI*2); ctx.fill();
  }

  // ── TOP BAR ──────────────────────────────────────────────────────────────────
  const topG = ctx.createLinearGradient(0,0,W,0);
  topG.addColorStop(0,"transparent"); topG.addColorStop(0.35,C.green);
  topG.addColorStop(0.65,C.gold); topG.addColorStop(1,"transparent");
  ctx.fillStyle = topG; ctx.shadowColor=C.green; ctx.shadowBlur=18;
  ctx.fillRect(0,0,W,5); ctx.shadowBlur=0;

  // ── HERO PHOTO (0 → 600) ─────────────────────────────────────────────────────
  const PHOTO_H = 600;
  ctx.save();
  ctx.beginPath(); ctx.rect(0,0,W,PHOTO_H); ctx.clip();
  const pr = photo.width/photo.height;
  let pw = W, ph = pw/pr;
  if (ph < PHOTO_H) { ph = PHOTO_H; pw = ph * pr; }
  ctx.drawImage(photo, (W-pw)/2, 0, pw, ph);

  // Gradient overlays
  const ov1 = ctx.createLinearGradient(0, PHOTO_H*0.30, 0, PHOTO_H);
  ov1.addColorStop(0,"transparent"); ov1.addColorStop(1,C.bg);
  ctx.fillStyle=ov1; ctx.fillRect(0,0,W,PHOTO_H);
  const ov2 = ctx.createLinearGradient(0,0,W*0.30,0);
  ov2.addColorStop(0,"rgba(4,8,10,0.60)"); ov2.addColorStop(1,"transparent");
  ctx.fillStyle=ov2; ctx.fillRect(0,0,W,PHOTO_H);
  const ov3 = ctx.createLinearGradient(W*0.70,0,W,0);
  ov3.addColorStop(0,"transparent"); ov3.addColorStop(1,"rgba(4,8,10,0.60)");
  ctx.fillStyle=ov3; ctx.fillRect(0,0,W,PHOTO_H);
  ctx.restore();

  // Logo badge (top-left)
  const LS=90, LX=sp(4), LY=sp(4);
  ctx.save(); ctx.beginPath(); ctx.arc(LX+LS/2,LY+LS/2,LS/2,0,Math.PI*2); ctx.clip();
  ctx.fillStyle="#fff"; ctx.fillRect(LX,LY,LS,LS);
  ctx.drawImage(logo,LX,LY,LS,LS); ctx.restore();
  ctx.beginPath(); ctx.arc(LX+LS/2,LY+LS/2,LS/2,0,Math.PI*2);
  ctx.strokeStyle=C.green; ctx.lineWidth=3; ctx.shadowColor=C.green; ctx.shadowBlur=14; ctx.stroke(); ctx.shadowBlur=0;

  // Verified badge (top-right)
  pill(ctx,"✦  VERIFIED DEVELOPER  ✦", W - sp(18), sp(5)+22, "rgba(0,230,118,0.14)", C.green, 20);

  // ── NAME BLOCK (Y: 540 → 720) ─────────────────────────────────────────────────
  const NX = sp(5);
  ctx.direction="ltr"; ctx.textAlign="left";
  ctx.font=F(900,72); ctx.fillStyle=C.w1; ctx.shadowColor="rgba(0,0,0,0.7)"; ctx.shadowBlur=15;
  ctx.fillText("Asim", NX, 560);
  ctx.fillStyle=C.green; ctx.shadowColor="rgba(0,230,118,0.5)"; ctx.shadowBlur=22;
  ctx.fillText("Abdulrahman", NX, 642);
  ctx.fillStyle=C.w1; ctx.shadowColor="rgba(0,0,0,0.7)"; ctx.shadowBlur=15;
  ctx.fillText("Mohammed", NX, 724); ctx.shadowBlur=0;

  // ── TITLE + ORIGIN (Y: 745 → 810) ────────────────────────────────────────────
  pill(ctx,"Full-Stack Mobile Developer", NX+230, 756, "rgba(0,230,118,0.13)", C.green, 26);

  ctx.direction="rtl"; ctx.textAlign="right";
  ctx.font=F(400,26); ctx.fillStyle=C.w2;
  ctx.fillText("📍  ولاية الجزيرة · محلية حي فور · السودان", W-NX, 808);

  // Divider line
  const dl1 = ctx.createLinearGradient(sp(5),825,W-sp(5),825);
  dl1.addColorStop(0,"transparent"); dl1.addColorStop(0.5,C.border); dl1.addColorStop(1,"transparent");
  ctx.strokeStyle=dl1; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(sp(5),825); ctx.lineTo(W-sp(5),825); ctx.stroke();

  // ── APP CARD (Y: 845 → 1005) ──────────────────────────────────────────────────
  const CX2=sp(5), CW=W-sp(10), CY=845, CH=148;
  card(ctx, CX2, CY, CW, CH, "rgba(0,230,118,0.22)");
  // left green strip
  rr(ctx,CX2,CY,5,CH,3); ctx.fillStyle=C.green; ctx.fill();

  // Right: app name
  ctx.direction="rtl"; ctx.textAlign="right";
  ctx.font=F(400,26); ctx.fillStyle=C.w2;
  ctx.fillText("مطوّر تطبيق", W-sp(6), CY+46);
  const aG=ctx.createLinearGradient(CX-200,0,W-sp(6),0);
  aG.addColorStop(0,C.green); aG.addColorStop(1,"#80FFB8");
  ctx.font=F(900,72); ctx.fillStyle=aG;
  ctx.shadowColor="rgba(0,230,118,0.45)"; ctx.shadowBlur=22;
  ctx.fillText("حصاحيصاوي", W-sp(6), CY+126); ctx.shadowBlur=0;

  // Left: Google Play
  gplay(ctx, CX2+sp(3), CY+(CH-46)/2, 46);
  ctx.direction="ltr"; ctx.textAlign="left";
  ctx.font=F(700,28); ctx.fillStyle=C.w1;
  ctx.fillText("Google Play", CX2+sp(3)+58, CY+74);
  ctx.font=F(400,22); ctx.fillStyle=C.w3;
  ctx.fillText("Published App", CX2+sp(3)+58, CY+104);

  // ── CONTACT CHIPS (Y: 1013 → 1085) ────────────────────────────────────────────
  const CCY=1013, CCH=68, GAP=sp(2), CCW=(CW-GAP)/2;
  [
    { icon:"✉", text:"almhbob.iii@gmail.com",             color:C.gold  },
    { icon:"🏅", text:"credly.com/users/asim-abdulrahman", color:C.cyan  },
  ].forEach((c,i) => {
    const cx3 = CX2 + i*(CCW+GAP);
    card(ctx, cx3, CCY, CCW, CCH);
    ctx.direction="ltr"; ctx.textAlign="left";
    ctx.font=F(400,20); ctx.fillStyle=C.w2;
    ctx.fillText(c.icon+"  "+c.text, cx3+sp(2), CCY+CCH/2+8);
  });

  // ── STATS (Y: 1093 → 1213) ────────────────────────────────────────────────────
  const STY=1093, STH=112, STW=(CW-sp(4))/3;
  [
    { val:"16+", label:"Certificates", color:C.green },
    { val:"4",   label:"Apps on Store", color:C.gold },
    { val:"34",  label:"Years Old",     color:C.cyan },
  ].forEach((s,i) => {
    const sx = CX2 + i*(STW+sp(2));
    card(ctx, sx, STY, STW, STH, s.color+"44");
    rr(ctx, sx+20, STY, STW-40, 4, 2); ctx.fillStyle=s.color; ctx.fill();
    ctx.direction="ltr"; ctx.textAlign="center";
    ctx.font=F(900,52); ctx.fillStyle=s.color;
    ctx.shadowColor=s.color+"66"; ctx.shadowBlur=16;
    ctx.fillText(s.val, sx+STW/2, STY+68); ctx.shadowBlur=0;
    ctx.font=F(400,22); ctx.fillStyle=C.w2;
    ctx.fillText(s.label, sx+STW/2, STY+98);
  });

  // ── SECTION LABEL: Certifications (Y: 1230) ───────────────────────────────────
  const SLABEL_Y = 1230;
  ctx.direction="ltr"; ctx.textAlign="left";
  ctx.font=F(700,24); ctx.fillStyle=C.gold;
  ctx.fillText("CERTIFICATIONS  ("+CERTS.length+")", CX2, SLABEL_Y);
  const lw2 = ctx.measureText("CERTIFICATIONS  ("+CERTS.length+")").width+sp(2);
  const divG2=ctx.createLinearGradient(CX2+lw2,SLABEL_Y,CX2+CW,SLABEL_Y);
  divG2.addColorStop(0,C.gold+"88"); divG2.addColorStop(1,"transparent");
  ctx.strokeStyle=divG2; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(CX2+lw2,SLABEL_Y); ctx.lineTo(CX2+CW,SLABEL_Y); ctx.stroke();

  // ── CERT CARDS 2-col grid (Y: 1250+) ──────────────────────────────────────────
  const CCols=2, CGap=sp(2), CCardW=(CW-CGap)/CCols, CCardH=96, CRowH=CCardH+sp(2);
  const CERT_START = 1250;

  CERTS.forEach((cert,i) => {
    const col=i%CCols, row=Math.floor(i/CCols);
    const cx4=CX2+col*(CCardW+CGap), cy4=CERT_START+row*CRowH;
    rr(ctx,cx4,cy4,CCardW,CCardH,18);
    const cg=ctx.createLinearGradient(cx4,cy4,cx4+CCardW,cy4);
    cg.addColorStop(0,cert.color+"18"); cg.addColorStop(1,"rgba(4,8,10,0.6)");
    ctx.fillStyle=cg; ctx.fill();
    rr(ctx,cx4,cy4,CCardW,CCardH,18);
    ctx.strokeStyle=cert.color+"35"; ctx.lineWidth=1; ctx.stroke();
    rr(ctx,cx4,cy4,5,CCardH,3); ctx.fillStyle=cert.color; ctx.fill();

    // Icon
    const ic_cx=cx4+sp(5), ic_cy=cy4+CCardH/2;
    ctx.beginPath(); ctx.arc(ic_cx,ic_cy,22,0,Math.PI*2);
    ctx.fillStyle=cert.color+"20"; ctx.fill();
    ctx.beginPath(); ctx.arc(ic_cx,ic_cy,22,0,Math.PI*2);
    ctx.strokeStyle=cert.color+"55"; ctx.lineWidth=1; ctx.stroke();
    ctx.direction="ltr"; ctx.textAlign="center";
    ctx.font=F(700,20); ctx.fillStyle=cert.color;
    ctx.fillText(cert.icon,ic_cx,ic_cy+7);

    ctx.textAlign="left";
    ctx.font=F(700,24); ctx.fillStyle=C.w1;
    ctx.fillText(cert.label.length>24?cert.label.slice(0,22)+"…":cert.label, cx4+sp(8), cy4+36);
    ctx.font=F(400,19); ctx.fillStyle=C.w3;
    ctx.fillText(cert.org, cx4+sp(8), cy4+62);
  });

  // ── DEDICATION 1 — Family (Y: after certs) ────────────────────────────────────
  const CERT_END = CERT_START + Math.ceil(CERTS.length/CCols)*CRowH;
  const D1Y=CERT_END+sp(3), D1W=CW, D1H=124;

  rr(ctx,CX2,D1Y,D1W,D1H,22);
  const d1g=ctx.createLinearGradient(CX2,D1Y,CX2+D1W,D1Y+D1H);
  d1g.addColorStop(0,"rgba(255,179,0,0.10)"); d1g.addColorStop(1,"rgba(255,100,150,0.06)");
  ctx.fillStyle=d1g; ctx.fill();
  rr(ctx,CX2,D1Y,D1W,D1H,22);
  ctx.strokeStyle="rgba(255,179,0,0.28)"; ctx.lineWidth=1.5; ctx.stroke();

  ctx.font="46px Arial"; ctx.textAlign="left"; ctx.direction="ltr";
  ctx.fillText("❤️", CX2+sp(3), D1Y+D1H/2+16);

  ctx.direction="rtl"; ctx.textAlign="right";
  ctx.font=F(400,22); ctx.fillStyle="rgba(255,179,0,0.55)";
  ctx.fillText("إهداء خاص", W-sp(6), D1Y+34);
  ctx.font=F(700,29); ctx.fillStyle=C.w1;
  ctx.fillText("إلى زوجتي العزيزة وابنتي", W-sp(6), D1Y+70);
  const jg=ctx.createLinearGradient(CX,0,W-sp(6),0);
  jg.addColorStop(0,"#FFB300"); jg.addColorStop(1,"#FF8A80");
  ctx.font=F(900,34); ctx.fillStyle=jg;
  ctx.shadowColor="rgba(255,179,0,0.45)"; ctx.shadowBlur=16;
  ctx.fillText("✨ جمان ✨", W-sp(6), D1Y+108); ctx.shadowBlur=0;

  // ── DEDICATION 2 — General (Y: after D1) ──────────────────────────────────────
  const D2Y=D1Y+D1H+sp(2), D2W=CW, D2H=130;

  rr(ctx,CX2,D2Y,D2W,D2H,22);
  const d2g=ctx.createLinearGradient(CX2,D2Y,CX2+D2W,D2Y+D2H);
  d2g.addColorStop(0,"rgba(0,230,118,0.09)"); d2g.addColorStop(1,"rgba(0,100,255,0.05)");
  ctx.fillStyle=d2g; ctx.fill();
  rr(ctx,CX2,D2Y,D2W,D2H,22);
  ctx.strokeStyle="rgba(0,230,118,0.28)"; ctx.lineWidth=1.5; ctx.stroke();

  ctx.font="46px Arial"; ctx.textAlign="left"; ctx.direction="ltr";
  ctx.fillText("🌍", CX2+sp(3), D2Y+D2H/2+16);

  ctx.direction="rtl"; ctx.textAlign="right";
  ctx.font=F(400,22); ctx.fillStyle="rgba(0,230,118,0.55)";
  ctx.fillText("إهداء عام", W-sp(6), D2Y+36);
  ctx.font=F(700,29); ctx.fillStyle=C.w1;
  ctx.fillText("إلى جميع مواطني", W-sp(6), D2Y+74);
  const cg2=ctx.createLinearGradient(CX-80,0,W-sp(6),0);
  cg2.addColorStop(0,C.green); cg2.addColorStop(1,"#80FFB8");
  ctx.font=F(900,34); ctx.fillStyle=cg2;
  ctx.shadowColor="rgba(0,230,118,0.45)"; ctx.shadowBlur=16;
  ctx.fillText("الحصاحيصا وضواحيها 🏘️", W-sp(6), D2Y+114); ctx.shadowBlur=0;

  // ── FOOTER ────────────────────────────────────────────────────────────────────
  const FY = D2Y+D2H+sp(3);
  const fdiv=ctx.createLinearGradient(sp(5),FY,W-sp(5),FY);
  fdiv.addColorStop(0,"transparent"); fdiv.addColorStop(0.5,C.border); fdiv.addColorStop(1,"transparent");
  ctx.strokeStyle=fdiv; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(sp(5),FY); ctx.lineTo(W-sp(5),FY); ctx.stroke();

  ctx.direction="ltr"; ctx.textAlign="center";
  ctx.font=F(400,20); ctx.fillStyle=C.w3;
  ctx.fillText("almhbob.iii@gmail.com  ·  credly.com/users/asim-abdulrahman", CX, FY+42);
  ctx.font=F(400,18); ctx.fillStyle=C.w3;
  ctx.fillText("© 2026 Asim Abdulrahman Mohammed — All rights reserved", CX, FY+74);

  // ── BOTTOM BAR & CORNERS ──────────────────────────────────────────────────────
  const botG=ctx.createLinearGradient(0,0,W,0);
  botG.addColorStop(0,"transparent"); botG.addColorStop(0.35,C.gold);
  botG.addColorStop(0.65,C.green); botG.addColorStop(1,"transparent");
  ctx.fillStyle=botG; ctx.shadowColor=C.gold; ctx.shadowBlur=18;
  ctx.fillRect(0,H-5,W,5); ctx.shadowBlur=0;

  const CS=72, CW2=4;
  [
    {x:0,y:0,dx:1,dy:1,c:C.green},{x:W,y:0,dx:-1,dy:1,c:C.green},
    {x:0,y:H,dx:1,dy:-1,c:C.gold},{x:W,y:H,dx:-1,dy:-1,c:C.gold},
  ].forEach(({x,y,dx,dy,c})=>{
    ctx.strokeStyle=c; ctx.lineWidth=CW2; ctx.shadowColor=c; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.moveTo(x,y+dy*CW2/2); ctx.lineTo(x+dx*CS,y+dy*CW2/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+dx*CW2/2,y); ctx.lineTo(x+dx*CW2/2,y+dy*CS); ctx.stroke();
    ctx.shadowBlur=0;
  });
}

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
    return () => { alive=false; };
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

  const DW=360, DH=640;

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",gap:24,padding:32}}>

      <div style={{position:"relative",width:DW+28,borderRadius:46,
        background:"linear-gradient(160deg,#1c1c1e,#0a0a0a)",padding:"46px 14px 38px",
        boxShadow:"0 0 0 1.5px #1e1e1e,0 0 70px rgba(0,230,118,0.08),0 50px 120px rgba(0,0,0,0.95)"}}>
        <div style={{position:"absolute",top:15,left:"50%",transform:"translateX(-50%)",
          width:105,height:22,borderRadius:11,background:"#111"}}/>
        <div style={{position:"absolute",bottom:11,left:"50%",transform:"translateX(-50%)",
          width:82,height:5,borderRadius:3,background:"#222"}}/>
        <div style={{width:DW,height:DH,borderRadius:28,overflow:"hidden",position:"relative"}}>
          {loading && (
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
              justifyContent:"center",background:C.bg,zIndex:10}}>
              <span style={{color:C.green,fontSize:16,fontFamily:"Cairo,sans-serif"}}>جاري الرسم…</span>
            </div>
          )}
          <canvas ref={ref} style={{width:DW,height:DH,display:"block",
            opacity:loading?0:1,transition:"opacity .5s"}}/>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
        <button onClick={download} disabled={!ready||dl}
          style={{background:ready&&!dl?"linear-gradient(135deg,#00A854,#00E676)":"#1a2e20",
            color:"#040A07",fontFamily:"Cairo,sans-serif",fontWeight:900,fontSize:16,
            padding:"14px 40px",borderRadius:50,border:"none",cursor:ready?"pointer":"default",
            opacity:ready&&!dl?1:0.45,boxShadow:ready?"0 0 32px rgba(0,230,118,.35)":"none",
            transition:"all .25s"}} dir="rtl">
          {dl?"⏳ جاري التحميل...":"⬇️ تحميل PNG — 1080×1980"}
        </button>
        <p style={{color:"rgba(255,255,255,0.18)",fontSize:12,fontFamily:"Cairo,sans-serif"}} dir="rtl">
          بطاقة المطور · جودة عالية · بدون تشويه
        </p>
      </div>
    </div>
  );
}
