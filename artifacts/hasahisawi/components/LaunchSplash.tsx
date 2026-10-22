// شاشة الافتتاح: شعار الحصاحيصا بملء الشاشة لحظة فتح التطبيق، ثم تتلاشى بهدوء.
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";

export const SPLASH_FULL = require("@/assets/images/splash-full.jpg");
export const SPLASH_BG = "#F0F1E9";

export function SplashArt() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_BG }]}>
      <Image source={SPLASH_FULL} resizeMode="cover" style={StyleSheet.absoluteFill} />
    </View>
  );
}

export default function LaunchSplash({ ms = 1800 }: { ms?: number }) {
  const [show, setShow] = useState(true);
  useEffect(() => { const t = setTimeout(() => setShow(false), ms); return () => clearTimeout(t); }, [ms]);
  if (!show) return null;
  return (
    <Animated.View exiting={FadeOut.duration(450)} style={[StyleSheet.absoluteFill, { zIndex: 20000, elevation: 20000 }]} pointerEvents="none">
      <SplashArt />
    </Animated.View>
  );
}
