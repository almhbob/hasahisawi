import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import Svg, { Circle, Path, G, Defs, RadialGradient, Stop } from "react-native-svg";

interface Props {
  style?: ViewStyle;
  opacity?: number;
  variant?: "diagonal" | "corner" | "header";
}

const GREEN  = "#27AE68";
const AMBER  = "#F0A500";

function PersonMark({ x, y, scale = 1, color = GREEN }: {
  x: number; y: number; scale?: number; color?: string;
}) {
  const s = scale;
  return (
    <G transform={`translate(${x}, ${y}) scale(${s})`}>
      <Circle cx={0} cy={-18} r={8} fill={color} />
      <Path
        d="M -10 0 Q -14 12 -8 22 Q 0 30 8 22 Q 14 12 10 0 Z"
        fill={color}
      />
    </G>
  );
}

function HandshakeMark({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const s = scale;
  return (
    <G transform={`translate(${x}, ${y}) scale(${s})`}>
      <Circle cx={-14} cy={-22} r={9} fill={GREEN} />
      <Circle cx={14}  cy={-22} r={9} fill={AMBER} />
      <Path
        d="M -20 0 Q -22 14 -6 18 Q 0 20 6 18 Q 22 14 20 0 Q 14 -8 8 -6 Q 0 -2 -8 -6 Q -14 -8 -20 0 Z"
        fill={GREEN}
        opacity={0.7}
      />
      <Path
        d="M 20 0 Q 22 14 6 18 Q 0 20 -6 18 Q -22 14 -20 0 Q -14 -8 -8 -6 Q 0 -2 8 -6 Q 14 -8 20 0 Z"
        fill={AMBER}
        opacity={0.7}
      />
    </G>
  );
}

export default function BrandPattern({ style, opacity = 0.045, variant = "diagonal" }: Props) {
  if (variant === "corner") {
    return (
      <View style={[StyleSheet.absoluteFill, { opacity }, style]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
          <HandshakeMark x={-10} y={60} scale={3.2} />
          <HandshakeMark x={420} y={750} scale={3.2} />
          <PersonMark x={380} y={80} scale={1.8} color={AMBER} />
          <PersonMark x={20} y={720} scale={1.8} color={GREEN} />
          {[0, 1, 2, 3, 4].map(i => (
            <Circle key={i} cx={40 + i * 80} cy={400} r={4} fill={i % 2 === 0 ? GREEN : AMBER} />
          ))}
        </Svg>
      </View>
    );
  }

  if (variant === "header") {
    return (
      <View style={[StyleSheet.absoluteFill, { opacity: opacity * 1.8 }, style]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice">
          <HandshakeMark x={360} y={60} scale={2} />
          <HandshakeMark x={40}  y={60} scale={1.4} />
          <Circle cx={200} cy={10} r={5} fill={GREEN} />
          <Circle cx={220} cy={10} r={5} fill={AMBER} />
          <Circle cx={240} cy={10} r={5} fill={GREEN} />
          <Path
            d="M 0 100 Q 100 70 200 90 Q 300 110 400 80"
            stroke={GREEN} strokeWidth={1.5} fill="none"
          />
          <Path
            d="M 0 110 Q 100 85 200 100 Q 300 115 400 95"
            stroke={AMBER} strokeWidth={1} fill="none"
          />
        </Svg>
      </View>
    );
  }

  const tiles: { x: number; y: number; isHandshake: boolean; color?: string }[] = [];
  const cols = 5;
  const rows = 12;
  const tileW = 80;
  const tileH = 80;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isHandshake = (r + c) % 3 === 0;
      const color = (r + c) % 2 === 0 ? GREEN : AMBER;
      tiles.push({ x: c * tileW + 20, y: r * tileH + 20, isHandshake, color });
    }
  }

  const vW = cols * tileW;
  const vH = rows * tileH;

  return (
    <View style={[StyleSheet.absoluteFill, { opacity }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${vW} ${vH}`} preserveAspectRatio="xMidYMid slice">
        {tiles.map((t, i) =>
          t.isHandshake ? (
            <HandshakeMark key={i} x={t.x} y={t.y} scale={0.55} />
          ) : (
            <Circle key={i} cx={t.x} cy={t.y} r={3} fill={t.color} />
          )
        )}
      </Svg>
    </View>
  );
}
