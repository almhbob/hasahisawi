import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import Svg, { Circle, Line, Path, G, Rect } from "react-native-svg";

interface Props {
  style?: ViewStyle;
  opacity?: number;
  variant?: "diagonal" | "corner" | "header";
}

const BLUE  = "#2563EB";
const GOLD  = "#F0A500";
const CYAN  = "#06B6D4";

// نقطة شبكة علمية مع اتصالات
function NetworkNode({ x, y, r = 3, color = BLUE }: { x: number; y: number; r?: number; color?: string }) {
  return <Circle cx={x} cy={y} r={r} fill={color} />;
}

// شبكة تقنية بنقاط وخطوط
function TechGrid({ offsetX = 0, offsetY = 0, cols = 6, rows = 4, spacing = 60 }: {
  offsetX?: number; offsetY?: number; cols?: number; rows?: number; spacing?: number;
}) {
  const nodes: { x: number; y: number; color: string }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = (r + c) % 3 === 0 ? GOLD : (r + c) % 3 === 1 ? CYAN : BLUE;
      nodes.push({ x: offsetX + c * spacing, y: offsetY + r * spacing, color });
    }
  }
  return (
    <G>
      {/* خطوط الشبكة الأفقية */}
      {Array.from({ length: rows }).map((_, r) => (
        <Line
          key={`h${r}`}
          x1={offsetX} y1={offsetY + r * spacing}
          x2={offsetX + (cols - 1) * spacing} y2={offsetY + r * spacing}
          stroke={BLUE} strokeWidth={0.4} strokeDasharray="4,8" strokeOpacity={0.4}
        />
      ))}
      {/* خطوط الشبكة العمودية */}
      {Array.from({ length: cols }).map((_, c) => (
        <Line
          key={`v${c}`}
          x1={offsetX + c * spacing} y1={offsetY}
          x2={offsetX + c * spacing} y2={offsetY + (rows - 1) * spacing}
          stroke={BLUE} strokeWidth={0.4} strokeDasharray="4,8" strokeOpacity={0.4}
        />
      ))}
      {/* النقاط */}
      {nodes.map((n, i) => (
        <NetworkNode key={i} x={n.x} y={n.y} r={2.5} color={n.color} />
      ))}
    </G>
  );
}

// حلقة جزيئية علمية
function MoleculeRing({ x, y, r = 20 }: { x: number; y: number; r?: number }) {
  const positions = [0, 60, 120, 180, 240, 300].map(deg => ({
    x: x + r * Math.cos((deg * Math.PI) / 180),
    y: y + r * Math.sin((deg * Math.PI) / 180),
  }));
  return (
    <G>
      <Circle cx={x} cy={y} r={4} fill={BLUE} />
      {positions.map((p, i) => (
        <G key={i}>
          <Line x1={x} y1={y} x2={p.x} y2={p.y} stroke={BLUE} strokeWidth={0.8} strokeOpacity={0.5} />
          <Circle cx={p.x} cy={p.y} r={2.5} fill={i % 2 === 0 ? GOLD : CYAN} />
        </G>
      ))}
    </G>
  );
}

export default function BrandPattern({ style, opacity = 0.045, variant = "diagonal" }: Props) {
  if (variant === "corner") {
    return (
      <View style={[StyleSheet.absoluteFill, { opacity }, style]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
          <MoleculeRing x={20}  y={80}  r={28} />
          <MoleculeRing x={380} y={720} r={28} />
          <TechGrid offsetX={80} offsetY={200} cols={4} rows={5} spacing={60} />
          {[0,1,2,3,4].map(i => (
            <Circle key={i} cx={40 + i * 80} cy={400} r={3} fill={i % 2 === 0 ? BLUE : GOLD} />
          ))}
        </Svg>
      </View>
    );
  }

  if (variant === "header") {
    return (
      <View style={[StyleSheet.absoluteFill, { opacity: opacity * 1.8 }, style]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice">
          <MoleculeRing x={360} y={60} r={22} />
          <MoleculeRing x={40}  y={60} r={16} />
          <Circle cx={200} cy={10} r={4} fill={BLUE} />
          <Circle cx={220} cy={10} r={4} fill={GOLD} />
          <Circle cx={240} cy={10} r={4} fill={CYAN} />
          <Path
            d="M 0 100 Q 100 70 200 90 Q 300 110 400 80"
            stroke={BLUE} strokeWidth={1} fill="none" strokeOpacity={0.6}
          />
          <Path
            d="M 0 110 Q 100 85 200 100 Q 300 115 400 95"
            stroke={GOLD} strokeWidth={0.8} fill="none" strokeOpacity={0.5}
          />
        </Svg>
      </View>
    );
  }

  // diagonal variant — شبكة تقنية مائلة
  const cols = 6;
  const rows = 14;
  const spacing = 70;

  return (
    <View style={[StyleSheet.absoluteFill, { opacity }, style]} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${cols * spacing} ${rows * spacing}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <TechGrid offsetX={20} offsetY={20} cols={cols} rows={rows} spacing={spacing} />
        {/* حلقات جزيئية متفرقة */}
        {[
          { x: 70,  y: 140, r: 18 },
          { x: 280, y: 420, r: 22 },
          { x: 140, y: 700, r: 18 },
          { x: 350, y: 210, r: 16 },
        ].map((m, i) => <MoleculeRing key={i} x={m.x} y={m.y} r={m.r} />)}
      </Svg>
    </View>
  );
}
