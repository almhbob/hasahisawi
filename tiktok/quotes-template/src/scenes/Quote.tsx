import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, amiri, cairo } from "../theme";

export const Quote: React.FC<{ quote: string; author: string }> = ({
  quote,
  author,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = quote.trim().split(/\s+/);
  const authorStart = 20 + words.length * 6;
  const fontSize = words.length > 22 ? 78 : words.length > 14 ? 92 : 108;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "140px 90px",
      }}
    >
      <div
        style={{
          fontFamily: amiri,
          fontSize: 260,
          lineHeight: 1,
          color: C.gold,
          opacity: interpolate(frame, [0, 15], [0, 0.9], {
            extrapolateRight: "clamp",
          }),
          marginBottom: -40,
        }}
      >
        ”
      </div>
      <div
        dir="rtl"
        lang="ar"
        style={{
          fontFamily: amiri,
          fontSize,
          lineHeight: 1.6,
          color: C.ink,
          textAlign: "center",
          fontWeight: 700,
        }}
      >
        {words.map((w, i) => {
          const s = spring({
            frame: frame - 20 - i * 6,
            fps,
            config: { damping: 200 },
          });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                opacity: s,
                transform: `translateY(${(1 - s) * 40}px)`,
                filter: `blur(${(1 - s) * 8}px)`,
                marginInline: fontSize * 0.13,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      {author ? (
        <div
          dir="rtl"
          style={{
            fontFamily: cairo,
            fontSize: 52,
            color: C.goldLight,
            marginTop: 60,
            opacity: interpolate(frame - authorStart, [0, 15], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          — {author}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
