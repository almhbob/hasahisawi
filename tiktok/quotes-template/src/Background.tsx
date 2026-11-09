import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "./theme";

// خلفية ثابتة لكل الفيديو: صورة المدينة مكبّرة ببطء تحت طبقة خضراء داكنة
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1.15, 1.35]);
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Img
        src={staticFile("city.jpg")}
        style={{
          position: "absolute",
          height: "100%",
          left: "50%",
          transform: `translateX(-50%) scale(${scale})`,
          filter: "blur(6px) saturate(0.8)",
          opacity: 0.35,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 35%, rgba(0,150,106,0.35) 0%, rgba(4,20,14,0.85) 55%, ${C.bg} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
