// زر السلة الموحّدة مع عدّاد — يُوضع في ترويسات المتاجر والمطاعم
import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useCart } from "@/lib/cart";

export default function CartButton({ tint = "#fff", bg = "rgba(255,255,255,0.18)" }: { tint?: string; bg?: string }) {
  const { count } = useCart();
  return (
    <Pressable onPress={() => router.push("/cart" as any)} style={[st.btn, { backgroundColor: bg }]} accessibilityRole="button" accessibilityLabel={count ? `السلة: ${count} صنف` : "السلة"}>
      <MaterialCommunityIcons name="cart-outline" size={21} color={tint} />
      {count ? (
        <Animated.View entering={ZoomIn} style={st.badge}><Text style={st.badgeT}>{count > 99 ? "99+" : count}</Text></Animated.View>
      ) : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -4, left: -4, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: "#E8A900", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#fff" },
  badgeT: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: "#3D2C00" },
});
