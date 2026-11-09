import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { cairo } from "../theme";
import { B } from "./theme";

export const UnsaidHook: React.FC<{ n: number }> = ({ n }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const num = interpolate(frame, [10, 30], [0, 1], {
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
      <div
        style={{
          textAlign: "center",
          opacity: s,
          transform: `translateY(${(1 - s) * 40}px)`,
        }}
      >
        <div
          style={{
            fontSize: 150,
            fontWeight: 900,
            color: B.cream,
            lineHeight: 1.2,
          }}
        >
          أشياء
          <br />
          لا تقال
        </div>
        <div
          style={{ fontSize: 56, color: B.beige, marginTop: 30, opacity: num }}
        >
          النص {String(n).padStart(2, "0")} من 50
        </div>
      </div>
    </AbsoluteFill>
  );
};
