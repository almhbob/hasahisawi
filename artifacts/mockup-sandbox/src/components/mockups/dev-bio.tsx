import React, { useRef, useEffect, useState } from "react";
import logoSrc  from "../../assets/hasahisawi-logo.png";
import photoSrc from "../../assets/asim-photo.jpg";

/* ─── Design Tokens (8px grid) ──────────────────────────────────────────────── */
const T = {
  W: 1080, H: 1920,
  // Spacing (multiples of 8)
  sp: (n: number) => n * 8,
  // Color palette
  c: {
    bg:       "#04080A",
    surface:  "rgba(255,255,255,0.04)",
    border:   "rgba(255,255,255,0.08)",
    primary:  "#00E676",
    pDim:     "#00A854",
    gold:     "#FFB300",
    goldDim:  "#CC8F00",
    accent:   "#00BCD4",
    white:    "#FFFFFF",
    text1:    "rgba(255,255,255,0.92)",
    text2:    "rgba(255,255,255,0.55)",
    text3:    "rgba(255,255,255,0.28)",
  },
  // Typography
  fnt: (w: number, s: number) => `${w} ${s}px Cairo, Arial`,
};

const CX = T.W / 2;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error(`Failed: ${src}`));
    img.src = src;
  });
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
  ctx.arcTo(x+w, y, x+w, y+r, r); ctx.lineTo(x+w, y+h-r);
  ctx.arcTo(x+w, y+h, x+w-r, y+h, r); ctx.lineTo(x+r, y+h);
  ctx.arcTo(x, y+h, x, y+h-r, r); ctx.lineTo(x, y+r);
  ctx.arcTo(x, y, x+r, y, r); ctx.closePath();
}

/* ─── SECTION: Badge pill ────────────────────────────────────────────────────── */
function drawPill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number,
  bg: string, fg: string, fontSize = 24) {
  ctx.direction = "ltr"; ctx.textAlign = "center";
  ctx.font = T.fnt(700, fontSize);
  const tw = ctx.measureText(text).width;
  const ph = fontSize * 1.8, pw = tw + T.sp(4);
  rrect(ctx, cx - pw/2, cy - ph/2, pw, ph, ph/2);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(text, cx, cy + fontSize * 0.36);
}

/* ─── Google Play mini icon ──────────────────────────────────────────────────── */
function gplay(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const k = s / 48;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle="#00D4FF"; ctx.beginPath(); ctx.moveTo(4.5,3.5); ctx.lineTo(26.5,24); ctx.lineTo(4.5,44.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#FFD700"; ctx.beginPath(); ctx.moveTo(36,16.5); ctx.lineTo(26.5,24); ctx.lineTo(36,31.5); ctx.lineTo(43.5,27.5); ctx.lineTo(43.5,20.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#4CAF50"; ctx.beginPath(); ctx.moveTo(4.5,3.5); ctx.lineTo(26.5,24); ctx.lineTo(36,16.5); ctx.lineTo(12,2); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#F44336"; ctx.beginPath(); ctx.moveTo(4.5,44.5); ctx.lineTo(26.5,24); ctx.lineTo(36,31.5); ctx.lineTo(12,46); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ─── Cert row data ──────────────────────────────────────────────────────────── */
const CERTS = [
  { color: "#4285F4", icon: "G", label: "Advanced Data Analytics",         org: "Google / Coursera · 2026"      },
  { color: "#1565C0", icon: "I", label: "Cybersecurity Specialist",         org: "IBM / Coursera · 2026"         },
  { color: "#1565C0", icon: "I", label: "Cybersecurity Fundamentals",       org: "IBM SkillsBuild · 2024"        },
  { color: "#00BCEB", icon: "C", label: "Introduction to Data Science",      org: "Cisco · 2025"                  },
  { color: "#0071C5", icon: "⚡", label: "Cloud DevOps",                     org: "Intel · 2025"                  },
  { color: "#EE3124", icon: "F", label: "Threat Landscape 2.0",             org: "Fortinet · 2025"               },
  { color: "#7B1FA2", icon: "V", label: "Introduction to Design Thinking",  org: "Virginia Commonwealth · 2025"  },
  { color: "#00A854", icon: "A", label: "Agile Explorer",                   org: "IBM SkillsBuild · 2025"        },
];

/* ─── Main draw ──────────────────────────────────────────────────────────────── */
async function drawCard(
  canvas: HTMLCanvasElement,
  logo: HTMLImageElement,
  photo: HTMLImageElement
) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = T.W; canvas.height = T.H;

  // Preload fonts
  await Promise.all([
    document.fonts.load(T.fnt(900, 110)),
    document.fonts.load(T.fnt(900,  72)),
    document.fonts.load(T.fnt(700,  36)),
    document.fonts.load(T.fnt(400,  28)),
  ]);

  // ═══════════════════════════════════════════════════════════════
  // LAYER 1 — Background
  // ═══════════════════════════════════════════════════════════════
  ctx.fillStyle = T.c.bg;
  ctx.fillRect(0, 0, T.W, T.H);

  // Mesh gradient (4-stop)
  const mesh = ctx.createRadialGradient(T.W * 0.15, T.H * 0.08, 0, T.W * 0.15, T.H * 0.08, T.W * 0.85);
  mesh.addColorStop(0, "rgba(0,80,40,0.55)");
  mesh.addColorStop(0.4, "rgba(0,30,20,0.15)");
  mesh.addColorStop(1, "transparent");
  ctx.fillStyle = mesh; ctx.fillRect(0, 0, T.W, T.H);

  const mesh2 = ctx.createRadialGradient(T.W * 0.88, T.H * 0.72, 0, T.W * 0.88, T.H * 0.72, T.W * 0.6);
  mesh2.addColorStop(0, "rgba(255,179,0,0.12)");
  mesh2.addColorStop(1, "transparent");
  ctx.fillStyle = mesh2; ctx.fillRect(0, 0, T.W, T.H);

  // ═══════════════════════════════════════════════════════════════
  // LAYER 2 — Dot-grid texture
  // ═══════════════════════════════════════════════════════════════
  ctx.fillStyle = "rgba(0,230,118,0.035)";
  for (let y = T.sp(6); y < T.H; y += T.sp(7))
    for (let x = T.sp(6); x < T.W; x += T.sp(7)) {
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI*2); ctx.fill();
    }

  // ═══════════════════════════════════════════════════════════════
  // LAYER 3 — TOP PHOTO SECTION (full-width hero, 780px tall)
  // ═══════════════════════════════════════════════════════════════
  const HERO_H = 780;

  // Clip to top area
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, T.W, HERO_H); ctx.clip();

  // Draw photo — cover-fit
  const pr = photo.width / photo.height;
  let pw2 = T.W, ph2 = pw2 / pr;
  if (ph2 < HERO_H) { ph2 = HERO_H; pw2 = ph2 * pr; }
  const pox = (T.W - pw2) / 2, poy = 0;
  ctx.drawImage(photo, pox, poy, pw2, ph2);

  // Dark gradient fade — bottom of hero
  const heroFade = ctx.createLinearGradient(0, HERO_H * 0.35, 0, HERO_H);
  heroFade.addColorStop(0, "transparent");
  heroFade.addColorStop(0.6, "rgba(4,8,10,0.82)");
  heroFade.addColorStop(1, T.c.bg);
  ctx.fillStyle = heroFade; ctx.fillRect(0, 0, T.W, HERO_H);

  // Right-side dark overlay (leaves face visible)
  const heroRight = ctx.createLinearGradient(T.W * 0.55, 0, T.W, 0);
  heroRight.addColorStop(0, "transparent");
  heroRight.addColorStop(1, "rgba(4,8,10,0.75)");
  ctx.fillStyle = heroRight; ctx.fillRect(0, 0, T.W, HERO_H);

  // Left-side dark overlay
  const heroLeft = ctx.createLinearGradient(0, 0, T.W * 0.28, 0);
  heroLeft.addColorStop(0, "rgba(4,8,10,0.65)");
  heroLeft.addColorStop(1, "transparent");
  ctx.fillStyle = heroLeft; ctx.fillRect(0, 0, T.W, HERO_H);

  // Top vignette
  const heroTop = ctx.createLinearGradient(0, 0, 0, HERO_H * 0.3);
  heroTop.addColorStop(0, "rgba(4,8,10,0.55)");
  heroTop.addColorStop(1, "transparent");
  ctx.fillStyle = heroTop; ctx.fillRect(0, 0, T.W, HERO_H);

  ctx.restore();

  // ── App logo badge (top-left, floating over photo) ────────────────────────────
  const LGX = T.sp(4), LGY = T.sp(4), LGS = 96;
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.arc(LGX + LGS/2, LGY + LGS/2, LGS/2, 0, Math.PI*2);
  ctx.fillStyle = "#fff"; ctx.fill(); ctx.shadowBlur = 0;
  ctx.save();
  ctx.beginPath(); ctx.arc(LGX + LGS/2, LGY + LGS/2, LGS/2, 0, Math.PI*2); ctx.clip();
  ctx.drawImage(logo, LGX, LGY, LGS, LGS);
  ctx.restore();
  ctx.beginPath(); ctx.arc(LGX + LGS/2, LGY + LGS/2, LGS/2, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(0,230,118,0.7)"; ctx.lineWidth = 3;
  ctx.shadowColor = T.c.primary; ctx.shadowBlur = 15; ctx.stroke(); ctx.shadowBlur = 0;

  // ── "VERIFIED DEVELOPER" badge (top-right) ────────────────────────────────────
  drawPill(ctx, "✦  VERIFIED DEVELOPER  ✦",
    T.W - T.sp(17), T.sp(5) + 20,
    "rgba(0,230,118,0.15)", T.c.primary, 20);
  ctx.strokeStyle = "rgba(0,230,118,0.35)"; ctx.lineWidth = 1;
  ctx.direction = "ltr"; ctx.font = T.fnt(700, 20);
  const vw = ctx.measureText("✦  VERIFIED DEVELOPER  ✦").width + T.sp(4);
  rrect(ctx, T.W - T.sp(17) - vw/2, T.sp(5) + 20 - 20, vw, 36, 18);
  ctx.stroke();

  // ═══════════════════════════════════════════════════════════════
  // LAYER 4 — Name + identity block (overlapping hero bottom)
  // ═══════════════════════════════════════════════════════════════
  const ID_Y = HERO_H - 190;

  // Name
  ctx.direction = "ltr"; ctx.textAlign = "left";
  ctx.font = T.fnt(900, 68); ctx.fillStyle = T.c.white;
  ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 20;
  ctx.fillText("Asim", T.sp(5), ID_Y);
  ctx.fillStyle = T.c.primary;
  ctx.shadowColor = "rgba(0,230,118,0.4)"; ctx.shadowBlur = 25;
  ctx.fillText("Abdulrahman", T.sp(5), ID_Y + 78);
  ctx.fillStyle = T.c.white;
  ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 20;
  ctx.fillText("Mohammed", T.sp(5), ID_Y + 156);
  ctx.shadowBlur = 0;

  // Title tag
  drawPill(ctx, "Full-Stack Mobile Developer",
    T.sp(5) + 230, ID_Y + 200,
    "rgba(0,230,118,0.12)", T.c.primary, 26);

  // Birthplace + origin row
  const originY = ID_Y + 244;
  ctx.direction = "rtl"; ctx.textAlign = "right";
  ctx.font = T.fnt(400, 27); ctx.fillStyle = T.c.text2;
  ctx.fillText("📍  ولاية الجزيرة · محلية حي فور · السودان", T.W - T.sp(5), originY);

  // ═══════════════════════════════════════════════════════════════
  // LAYER 5 — App card (Figma: card with auto-layout)
  // ═══════════════════════════════════════════════════════════════
  const CARD1_Y = HERO_H + T.sp(2);
  const CARD1_X = T.sp(4), CARD1_W = T.W - T.sp(8), CARD1_H = 170;

  // Figma-style card: subtle border + blur-bg
  rrect(ctx, CARD1_X, CARD1_Y, CARD1_W, CARD1_H, 28);
  ctx.fillStyle = T.c.surface; ctx.fill();
  rrect(ctx, CARD1_X, CARD1_Y, CARD1_W, CARD1_H, 28);
  ctx.strokeStyle = T.c.border; ctx.lineWidth = 1.5; ctx.stroke();

  // Left green accent strip
  rrect(ctx, CARD1_X, CARD1_Y, 6, CARD1_H, 3);
  const stripGrad = ctx.createLinearGradient(0, CARD1_Y, 0, CARD1_Y + CARD1_H);
  stripGrad.addColorStop(0, T.c.primary); stripGrad.addColorStop(1, T.c.pDim);
  ctx.fillStyle = stripGrad; ctx.fill();

  // "مطوّر تطبيق" label
  ctx.direction = "rtl"; ctx.textAlign = "right";
  ctx.font = T.fnt(400, 26); ctx.fillStyle = T.c.text2;
  ctx.fillText("مطوّر تطبيق", T.W - T.sp(6), CARD1_Y + 48);

  // App name big
  const appGrad = ctx.createLinearGradient(CX - 300, 0, CX + 300, 0);
  appGrad.addColorStop(0, T.c.primary); appGrad.addColorStop(1, "#80FFB8");
  ctx.direction = "rtl"; ctx.textAlign = "right";
  ctx.font = T.fnt(900, 76); ctx.fillStyle = appGrad;
  ctx.shadowColor = "rgba(0,230,118,0.4)"; ctx.shadowBlur = 22;
  ctx.fillText("حصاحيصاوي", T.W - T.sp(6), CARD1_Y + 128);
  ctx.shadowBlur = 0;

  // Google Play mini badge
  const gp_x = CARD1_X + T.sp(3);
  gplay(ctx, gp_x, CARD1_Y + CARD1_H/2 - 22, 44);
  ctx.direction = "ltr"; ctx.textAlign = "left";
  ctx.font = T.fnt(700, 28); ctx.fillStyle = T.c.text1;
  ctx.fillText("Google Play", gp_x + 54, CARD1_Y + CARD1_H/2 + 10);
  ctx.font = T.fnt(400, 22); ctx.fillStyle = T.c.text3;
  ctx.fillText("Published App", gp_x + 54, CARD1_Y + CARD1_H/2 + 38);

  // ═══════════════════════════════════════════════════════════════
  // LAYER 6 — Contact row (Figma: horizontal chips)
  // ═══════════════════════════════════════════════════════════════
  const CON_Y = CARD1_Y + CARD1_H + T.sp(3);
  const contacts = [
    { icon: "✉", text: "almhbob.iii@gmail.com",              color: T.c.gold },
    { icon: "🏅", text: "credly.com/users/asim-abdulrahman", color: T.c.accent },
  ];
  const chipH = 72, chipGap = T.sp(2);
  const chipW = (CARD1_W - chipGap) / 2;

  contacts.forEach((c, i) => {
    const cx2 = CARD1_X + i * (chipW + chipGap);
    rrect(ctx, cx2, CON_Y, chipW, chipH, 16);
    ctx.fillStyle = T.c.surface; ctx.fill();
    rrect(ctx, cx2, CON_Y, chipW, chipH, 16);
    ctx.strokeStyle = T.c.border; ctx.lineWidth = 1; ctx.stroke();

    ctx.direction = "ltr"; ctx.textAlign = "left";
    ctx.font = T.fnt(400, 18); ctx.fillStyle = T.c.text3;
    ctx.fillText(c.icon + "  " + c.text, cx2 + T.sp(2), CON_Y + chipH/2 + 7);
  });

  // ═══════════════════════════════════════════════════════════════
  // LAYER 7 — Stats row (Figma: 3-column component)
  // ═══════════════════════════════════════════════════════════════
  const STAT_Y = CON_Y + chipH + T.sp(3);
  const stats = [
    { val: "16+", label: "Certificates", color: T.c.primary },
    { val: "1",   label: "App on Store",  color: T.c.gold    },
    { val: "34",  label: "Years Old",     color: T.c.accent  },
  ];
  const statW2 = (CARD1_W - T.sp(4)) / 3;
  const statH  = 120;

  stats.forEach((s, i) => {
    const sx = CARD1_X + i * (statW2 + T.sp(2));
    rrect(ctx, sx, STAT_Y, statW2, statH, 20);
    ctx.fillStyle = T.c.surface; ctx.fill();
    rrect(ctx, sx, STAT_Y, statW2, statH, 20);
    ctx.strokeStyle = s.color + "44"; ctx.lineWidth = 1.5; ctx.stroke();

    // Top accent line
    rrect(ctx, sx + 20, STAT_Y, statW2 - 40, 3, 2);
    ctx.fillStyle = s.color; ctx.fill();

    ctx.direction = "ltr"; ctx.textAlign = "center";
    ctx.font = T.fnt(900, 52); ctx.fillStyle = s.color;
    ctx.shadowColor = s.color + "55"; ctx.shadowBlur = 18;
    ctx.fillText(s.val, sx + statW2/2, STAT_Y + 68); ctx.shadowBlur = 0;
    ctx.font = T.fnt(400, 22); ctx.fillStyle = T.c.text2;
    ctx.fillText(s.label, sx + statW2/2, STAT_Y + 98);
  });

  // ═══════════════════════════════════════════════════════════════
  // LAYER 8 — Certifications section
  // ═══════════════════════════════════════════════════════════════
  const CERT_SEC_Y = STAT_Y + statH + T.sp(4);

  // Section header (Figma: label with divider)
  const LABEL_X = CARD1_X;
  ctx.direction = "ltr"; ctx.textAlign = "left";
  ctx.font = T.fnt(700, 24); ctx.fillStyle = T.c.gold;
  ctx.fillText("CERTIFICATIONS  (" + CERTS.length + ")", LABEL_X, CERT_SEC_Y + 2);

  const divSY = CERT_SEC_Y + 10;
  const labelW = ctx.measureText("CERTIFICATIONS  (" + CERTS.length + ")").width + T.sp(2);
  const divL = ctx.createLinearGradient(LABEL_X + labelW, divSY, CARD1_X + CARD1_W, divSY);
  divL.addColorStop(0, T.c.gold + "88"); divL.addColorStop(1, "transparent");
  ctx.strokeStyle = divL; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(LABEL_X + labelW, divSY); ctx.lineTo(CARD1_X + CARD1_W, divSY); ctx.stroke();

  // Cert cards — 2-column grid (Figma auto-layout)
  const CERTS_Y = CERT_SEC_Y + T.sp(3);
  const certCols = 2;
  const certGap  = T.sp(2);
  const certW    = (CARD1_W - certGap) / certCols;
  const certH2   = 98;
  const certRowH = certH2 + T.sp(2);

  CERTS.forEach((cert, i) => {
    const col = i % certCols, row = Math.floor(i / certCols);
    const cx3 = CARD1_X + col * (certW + certGap);
    const cy3 = CERTS_Y + row * certRowH;

    rrect(ctx, cx3, cy3, certW, certH2, 16);
    const cgr = ctx.createLinearGradient(cx3, cy3, cx3 + certW, cy3 + certH2);
    cgr.addColorStop(0, cert.color + "12"); cgr.addColorStop(1, "rgba(4,8,10,0.4)");
    ctx.fillStyle = cgr; ctx.fill();
    rrect(ctx, cx3, cy3, certW, certH2, 16);
    ctx.strokeStyle = cert.color + "30"; ctx.lineWidth = 1; ctx.stroke();

    // Left accent
    rrect(ctx, cx3, cy3, 4, certH2, 2);
    ctx.fillStyle = cert.color; ctx.fill();

    // Icon circle
    const ic_cx = cx3 + T.sp(4), ic_cy = cy3 + certH2/2;
    ctx.beginPath(); ctx.arc(ic_cx, ic_cy, 24, 0, Math.PI*2);
    ctx.fillStyle = cert.color + "20"; ctx.fill();
    ctx.beginPath(); ctx.arc(ic_cx, ic_cy, 24, 0, Math.PI*2);
    ctx.strokeStyle = cert.color + "60"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.direction = "ltr"; ctx.textAlign = "center";
    ctx.font = T.fnt(700, 22); ctx.fillStyle = cert.color;
    ctx.fillText(cert.icon, ic_cx, ic_cy + 8);

    // Text
    ctx.textAlign = "left";
    ctx.font = T.fnt(700, 24); ctx.fillStyle = T.c.text1;
    ctx.fillText(cert.label.length > 22 ? cert.label.slice(0, 20) + "…" : cert.label,
      cx3 + T.sp(8), cy3 + 38);
    ctx.font = T.fnt(400, 19); ctx.fillStyle = T.c.text3;
    ctx.fillText(cert.org, cx3 + T.sp(8), cy3 + 65);
  });

  // ═══════════════════════════════════════════════════════════════
  // LAYER 9 — Footer
  // ═══════════════════════════════════════════════════════════════
  const CERTS_ROWS = Math.ceil(CERTS.length / certCols);
  const FOOT_Y = CERTS_Y + CERTS_ROWS * certRowH + T.sp(3);

  // Thin divider
  const footDiv = ctx.createLinearGradient(T.sp(5), FOOT_Y, T.W - T.sp(5), FOOT_Y);
  footDiv.addColorStop(0, "transparent");
  footDiv.addColorStop(0.3, T.c.border);
  footDiv.addColorStop(0.7, T.c.border);
  footDiv.addColorStop(1, "transparent");
  ctx.strokeStyle = footDiv; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(T.sp(5), FOOT_Y); ctx.lineTo(T.W - T.sp(5), FOOT_Y); ctx.stroke();

  ctx.direction = "ltr"; ctx.textAlign = "center";
  ctx.font = T.fnt(400, 21); ctx.fillStyle = T.c.text3;
  ctx.fillText("almhbob.iii@gmail.com  ·  credly.com/users/asim-abdulrahman", CX, FOOT_Y + 42);
  ctx.font = T.fnt(400, 19); ctx.fillStyle = T.c.text3;
  ctx.fillText("© 2026 Asim Abdulrahman Mohammed — All rights reserved", CX, FOOT_Y + 72);

  // ═══════════════════════════════════════════════════════════════
  // FRAME — Neon border system (Figma: stroke layers)
  // ═══════════════════════════════════════════════════════════════
  // Top bar
  const topG = ctx.createLinearGradient(0, 0, T.W, 0);
  topG.addColorStop(0, "transparent"); topG.addColorStop(0.3, T.c.primary);
  topG.addColorStop(0.7, T.c.gold);   topG.addColorStop(1, "transparent");
  ctx.fillStyle = topG;
  ctx.shadowColor = T.c.primary; ctx.shadowBlur = 20;
  ctx.fillRect(0, 0, T.W, 5); ctx.shadowBlur = 0;

  // Bottom bar
  const botG = ctx.createLinearGradient(0, 0, T.W, 0);
  botG.addColorStop(0, "transparent"); botG.addColorStop(0.3, T.c.gold);
  botG.addColorStop(0.7, T.c.primary); botG.addColorStop(1, "transparent");
  ctx.fillStyle = botG;
  ctx.shadowColor = T.c.gold; ctx.shadowBlur = 20;
  ctx.fillRect(0, T.H - 5, T.W, 5); ctx.shadowBlur = 0;

  // Corner marks (Figma: frame corners)
  const CM = 72, CW = 4;
  [
    { x: 0,   y: 0,   dx:  1, dy:  1, c: T.c.primary },
    { x: T.W, y: 0,   dx: -1, dy:  1, c: T.c.primary },
    { x: 0,   y: T.H, dx:  1, dy: -1, c: T.c.gold    },
    { x: T.W, y: T.H, dx: -1, dy: -1, c: T.c.gold    },
  ].forEach(({ x, y, dx, dy, c }) => {
    ctx.strokeStyle = c; ctx.lineWidth = CW;
    ctx.shadowColor = c; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(x, y + dy*CW/2); ctx.lineTo(x + dx*CM, y + dy*CW/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + dx*CW/2, y); ctx.lineTo(x + dx*CW/2, y + dy*CM); ctx.stroke();
    ctx.shadowBlur = 0;
  });
}

/* ─── React Component ────────────────────────────────────────────────────────── */
export default function DevBio() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [ready,     setReady]    = useState(false);
  const [loading,   setLoading]  = useState(true);
  const [dlLoading, setDlLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [logo, photo] = await Promise.all([loadImage(logoSrc), loadImage(photoSrc)]);
        if (!alive || !canvasRef.current) return;
        await drawCard(canvasRef.current, logo, photo);
        setReady(true);
      } catch (e) { console.error(e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
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

  const DW = 360, DH = 640;

  return (
    <div style={{ minHeight: "100vh", background: T.c.bg, display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 32 }}>

      {/* Phone shell */}
      <div style={{
        position: "relative", width: DW + 28, borderRadius: 46,
        background: "linear-gradient(160deg,#1c1c1e,#0a0a0a)",
        padding: "46px 14px 38px",
        boxShadow: "0 0 0 1.5px #1e1e1e, 0 0 70px rgba(0,230,118,0.08), 0 50px 120px rgba(0,0,0,0.95)",
      }}>
        <div style={{ position:"absolute", top:15, left:"50%", transform:"translateX(-50%)",
          width:105, height:22, borderRadius:11, background:"#111" }} />
        <div style={{ position:"absolute", bottom:11, left:"50%", transform:"translateX(-50%)",
          width:82, height:5, borderRadius:3, background:"#222" }} />
        <div style={{ width:DW, height:DH, borderRadius:28, overflow:"hidden", position:"relative" }}>
          {loading && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
              justifyContent:"center", background:T.c.bg, zIndex:10 }}>
              <span style={{ color:T.c.primary, fontSize:16, fontFamily:"Cairo,sans-serif",
                animation:"pulse 1s infinite" }}>جاري الرسم…</span>
            </div>
          )}
          <canvas ref={canvasRef}
            style={{ width:DW, height:DH, display:"block",
              opacity: loading ? 0 : 1, transition:"opacity 0.5s" }} />
        </div>
      </div>

      {/* CTA */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
        <button onClick={download} disabled={!ready || dlLoading}
          style={{
            background: ready && !dlLoading
              ? "linear-gradient(135deg,#00A854,#00E676)"
              : "#1a2e20",
            color: "#040A07", fontFamily:"Cairo,sans-serif", fontWeight:900,
            fontSize:16, padding:"14px 40px", borderRadius:50, border:"none",
            cursor: ready ? "pointer" : "default",
            opacity: ready && !dlLoading ? 1 : 0.45,
            boxShadow: ready ? "0 0 32px rgba(0,230,118,0.35)" : "none",
            transition:"all .25s",
          }} dir="rtl">
          {dlLoading ? "⏳ جاري التحميل..." : "⬇️ تحميل PNG — 1080×1920"}
        </button>
        <p style={{ color:"rgba(255,255,255,0.18)", fontSize:12, fontFamily:"Cairo,sans-serif" }} dir="rtl">
          بطاقة المطور · جودة عالية · بدون تشويه
        </p>
      </div>
    </div>
  );
}
