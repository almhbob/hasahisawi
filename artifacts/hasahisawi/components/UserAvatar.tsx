import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

const AVATAR_COLORS = [
  "#27AE68", "#E74C3C", "#3498DB", "#9B59B6", "#F39C12",
  "#1ABC9C", "#E67E22", "#2ECC71", "#E91E63", "#00BCD4",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type Props = {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  borderRadius?: number;
  style?: object;
};

export default function UserAvatar({ name, avatarUrl, size = 44, borderRadius, style }: Props) {
  const r = borderRadius ?? size * 0.35;
  const color = getAvatarColor(name || "م");
  const initial = (name || "م").charAt(0);

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[
          { width: size, height: size, borderRadius: r },
          styles.img,
          style,
        ]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: color + "22",
          borderWidth: 1.5,
          borderColor: color + "55",
        },
        styles.fallback,
        style,
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.4, color }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: {
    borderWidth: 1.5,
    borderColor: Colors.divider,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontFamily: "Cairo_700Bold",
    includeFontPadding: false,
  },
});
