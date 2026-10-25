import React from "react";
import { View, Image } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TYPE_META, bizColor, type FoodBusiness } from "@/lib/food-api";

export default function BizLogo({ b, size = 56 }: { b: Pick<FoodBusiness, "name" | "logo_url" | "business_type">; size?: number }) {
  const c = bizColor(b);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: c, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {b.logo_url ? <Image source={{ uri: b.logo_url }} style={{ width: "100%", height: "100%" }} /> :
        <MaterialCommunityIcons name={(TYPE_META[b.business_type] || TYPE_META.restaurant).icon as any} size={size * 0.48} color="#fff" />}
    </View>
  );
}

