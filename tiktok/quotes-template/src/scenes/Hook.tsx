import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, cairo } from "../theme";

export const Hook: React.FC<{ label: string; day: number }> = ({
  label,
  day,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12 } });
  const line = interpolate(frame, [8, 30], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      dir="rtl"
      lang="ar"
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily: cairo,
      }}
    >
      <div style={{ transform: `scale(${pop})`, textAlign: "center" }}>
        <div style={{ fontSize: 64, color: C.gold, fontWeight: 700 }}>
          اليوم {day}
        </div>
        <div
          style={{
            fontSize: 120,
            color: C.ink,
            fontWeight: 900,
            marginTop: 10,
          }}
        >
          {label}
        </div>
        <div
          style={{
            height: 8,
            width: 420 * line,
            background: `linear-gradient(90deg, ${C.green}, ${C.gold})`,
            borderRadius: 4,
            margin: "24px auto 0",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
