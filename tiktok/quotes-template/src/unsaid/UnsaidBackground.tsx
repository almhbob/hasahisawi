import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { B } from "./theme";

// خلفية مستوحاة من غلاف الكتاب: هلال بيج يدور ببطء في الزاوية
export const UnsaidBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const rot = interpolate(frame, [0, durationInFrames], [0, 25]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 45%, ${B.bg} 0%, ${B.bgDeep} 100%)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -260,
          right: -260,
          width: 760,
          height: 760,
          borderRadius: "50%",
          border: `170px solid ${B.beige}`,
          borderLeftColor: "transparent",
          opacity: 0.9,
          transform: `rotate(${rot}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -320,
          left: -320,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: B.beige,
          opacity: 0.06,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 260,
          bottom: 260,
          left: 70,
          width: 10,
          background: B.gold,
        }}
      />
    </AbsoluteFill>
  );
};
