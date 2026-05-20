#!/usr/bin/env node
const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "../public/splash");
fs.mkdirSync(OUT, { recursive: true });

const sizes = [
  { w: 1320, h: 2868, name: "splash-1320x2868.png" },
  { w: 1206, h: 2622, name: "splash-1206x2622.png" },
  { w: 1290, h: 2796, name: "splash-1290x2796.png" },
  { w: 1170, h: 2532, name: "splash-1170x2532.png" },
  { w: 750,  h: 1334, name: "splash-750x1334.png"  },
  { w: 2048, h: 2732, name: "splash-2048x2732.png" },
];

for (const { w, h, name } of sizes) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0D1A0D");
  grad.addColorStop(1, "#0D0D0D");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Green circle glow behind icon
  const cx = w / 2, cy = h / 2 - h * 0.05;
  const glowR = Math.min(w, h) * 0.25;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR * 1.6);
  glow.addColorStop(0, "rgba(34,197,94,0.18)");
  glow.addColorStop(1, "rgba(34,197,94,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Icon circle
  const iconR = glowR * 0.55;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, iconR, 0, Math.PI * 2);
  ctx.fillStyle = "#1A2E1A";
  ctx.fill();
  ctx.lineWidth = iconR * 0.06;
  ctx.strokeStyle = "#22C55E";
  ctx.stroke();
  ctx.restore();

  // Arabic letter ح
  ctx.font = `bold ${iconR * 1.1}px serif`;
  ctx.fillStyle = "#22C55E";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ح", cx, cy);

  // App name
  const titleY = cy + iconR * 1.7;
  ctx.font = `bold ${Math.round(h * 0.028)}px serif`;
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText("حصاحيصاوي", cx, titleY);

  // Subtitle
  ctx.font = `${Math.round(h * 0.017)}px serif`;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("بوابتك المجتمعية", cx, titleY + h * 0.038);

  // Bottom dot indicator
  const dotY = h * 0.9;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(cx + i * w * 0.025, dotY, i === 0 ? w * 0.009 : w * 0.005, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? "#22C55E" : "rgba(255,255,255,0.3)";
    ctx.fill();
  }

  const buf = canvas.toBuffer("image/png");
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`✓ ${name} (${w}×${h})`);
}
console.log("All splash screens generated.");
