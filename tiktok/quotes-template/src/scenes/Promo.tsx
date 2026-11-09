import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, cairo } from "../theme";

export const Promo: React.FC<{ tagline: string; cta: string; screenshot: string }> = ({ tagline, cta, screenshot }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const phone = spring({ frame, fps, config: { damping: 14 } });
  const logo = spring({ frame: frame - 10, fps, config: { damping: 10 } });
  const text = spring({ frame: frame - 25, fps, config: { damping: 200 } });
  const btn = spring({ frame: frame - 45, fps, config: { damping: 9 } });
  const pulse = 1 + Math.sin(Math.max(0, frame - 60) / 5) * 0.03;
  const arrow = interpolate(Math.sin(frame / 6), [-1, 1], [0, 18]);

  return (
    <AbsoluteFill dir="rtl" lang="ar" style={{ alignItems: "center", fontFamily: cairo, paddingTop: 130 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28, transform: `scale(${logo})` }}>
        <Img src={staticFile("logo.png")} style={{ width: 130, height: 130, borderRadius: 32 }} />
        <div style={{ fontSize: 96, fontWeight: 900, color: C.ink }}>حصاحيصاوي</div>
      </div>
      <div
        style={{
          fontSize: 52,
          color: C.goldLight,
          fontWeight: 700,
          textAlign: "center",
          marginTop: 24,
          paddingInline: 90,
          opacity: text,
          transform: `translateY(${(1 - text) * 30}px)`,
        }}
      >
        {tagline}
      </div>
      <div
        style={{
          marginTop: 50,
          width: 520,
          height: 924,
          borderRadius: 60,
          border: "14px solid #0d0d0d",
          overflow: "hidden",
          boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 0 3px ${C.green}`,
          transform: `translateY(${(1 - phone) * 900}px) rotate(${(1 - phone) * -8}deg)`,
        }}
      >
        <Img src={staticFile(screenshot)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 170,
          transform: `scale(${btn * pulse})`,
          background: `linear-gradient(90deg, ${C.green}, #00B27D)`,
          color: "white",
          fontSize: 58,
          fontWeight: 900,
          padding: "26px 70px",
          borderRadius: 999,
          boxShadow: `0 0 0 6px ${C.gold}`,
          whiteSpace: "nowrap",
        }}
      >
        {cta}
      </div>
      <div style={{ position: "absolute", bottom: 95, fontSize: 44, color: C.ink, opacity: btn, transform: `translateY(${arrow}px)` }}>
        الرابط في البايو ⬇
      </div>
    </AbsoluteFill>
  );
};
