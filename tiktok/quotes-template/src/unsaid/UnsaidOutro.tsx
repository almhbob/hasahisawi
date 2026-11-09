import {
  AbsoluteFill,
  Img,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { cairo } from "../theme";
import { B } from "./theme";

export const UnsaidOutro: React.FC<{
  author: string;
  authorNote: string;
  cta: string;
  sponsorName?: string;
  sponsorLogo?: string;
}> = ({ author, authorNote, cta, sponsorName, sponsorLogo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame, fps, config: { damping: 200 } });
  const b = spring({ frame: frame - 20, fps, config: { damping: 200 } });
  const c = spring({ frame: frame - 45, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill
      dir="rtl"
      lang="ar"
      style={{
        fontFamily: cairo,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 48, color: B.muted, opacity: a }}>من كتاب</div>
      <div
        style={{
          fontSize: 116,
          fontWeight: 900,
          color: B.cream,
          lineHeight: 1.25,
          opacity: a,
          transform: `scale(${0.9 + a * 0.1})`,
        }}
      >
        «أشياء لا تقال»
      </div>
      <div
        style={{ height: 8, width: 260, background: B.gold, margin: "30px 0" }}
      />
      <div
        style={{ fontSize: 64, color: B.beige, fontWeight: 700, opacity: b }}
      >
        {author}
      </div>
      <div style={{ fontSize: 44, color: B.muted, marginTop: 10, opacity: b }}>
        {authorNote}
      </div>
      <div style={{ fontSize: 52, color: B.cream, marginTop: 70, opacity: b }}>
        {cta}
      </div>

      {sponsorName ? (
        <div
          style={{
            marginTop: 50,
            display: "flex",
            alignItems: "center",
            gap: 20,
            opacity: b,
            background: "rgba(217,196,154,0.12)",
            border: `2px solid ${B.beige}`,
            borderRadius: 24,
            padding: "14px 30px",
          }}
        >
          <div style={{ fontSize: 40, color: B.muted }}>برعاية</div>
          {sponsorLogo ? (
            <Img
              src={staticFile(sponsorLogo)}
              style={{
                height: 80,
                maxWidth: 200,
                objectFit: "contain",
                borderRadius: 12,
              }}
            />
          ) : null}
          <div style={{ fontSize: 50, fontWeight: 700, color: B.cream }}>
            {sponsorName}
          </div>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          bottom: 150,
          display: "flex",
          alignItems: "center",
          gap: 22,
          background: "rgba(244,239,230,0.08)",
          border: `2px solid ${B.gold}`,
          borderRadius: 999,
          padding: "16px 40px 16px 20px",
          transform: `scale(${c})`,
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{ width: 84, height: 84, borderRadius: 22 }}
        />
        <div style={{ fontSize: 42, color: B.cream }}>
          حمّل تطبيق <b style={{ color: B.beige }}>حصاحيصاوي</b> · الرابط في
          البايو
        </div>
      </div>
    </AbsoluteFill>
  );
};
