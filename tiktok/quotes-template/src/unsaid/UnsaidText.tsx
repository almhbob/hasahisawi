import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { cairo } from "../theme";
import { B, lineStart } from "./theme";

export const UnsaidText: React.FC<{ title: string; lines: string[] }> = ({
  title,
  lines,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 200 } });
  const bar = interpolate(frame, [5, 30], [0, 1], {
    extrapolateRight: "clamp",
  });
  const longest = Math.max(...lines.map((l) => l.length));
  const fontSize = longest > 30 ? 62 : longest > 22 ? 70 : 80;

  return (
    <AbsoluteFill
      dir="rtl"
      lang="ar"
      style={{
        fontFamily: cairo,
        justifyContent: "center",
        padding: "160px 110px 160px 130px",
      }}
    >
      <div
        style={{
          fontSize: 120,
          fontWeight: 900,
          color: B.cream,
          opacity: t,
          transform: `translateX(${(1 - t) * -60}px)`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          height: 10,
          width: 200 * bar,
          background: B.gold,
          borderRadius: 5,
          margin: "10px 0 70px",
        }}
      />
      {lines.map((line, i) => {
        const s = spring({
          frame: frame - lineStart(i),
          fps,
          config: { damping: 200 },
        });
        return (
          <div
            key={i}
            style={{
              fontSize,
              lineHeight: 1.55,
              color: i === lines.length - 1 ? B.beige : B.cream,
              fontWeight: i === lines.length - 1 ? 700 : 600,
              textWrap: "balance",
              marginBottom: 46,
              opacity: s,
              transform: `translateY(${(1 - s) * 30}px)`,
              filter: `blur(${(1 - s) * 6}px)`,
            }}
          >
            {line}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
