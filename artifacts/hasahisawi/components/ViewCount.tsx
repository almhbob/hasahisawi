// شارة عدد المشاهدات (أيقونة عين + عدد مختصر بالعربية)
// track: المنشور معروض كاملاً في القائمة فظهوره يُحسب فتحاً (مرة لكل جلسة، مجمّعاً).
// استعمالان: <ViewCount count={n} /> لعدد معروف، أو <ViewCount kind="job" id={item.id} /> لبطاقة في قائمة (تحميل مجمّع)
import React from "react";
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { formatViews, useListViewCount, type ViewKind } from "@/lib/views";

type Props = { count?: number | null; kind?: ViewKind; track?: boolean; id?: string | number | null; color?: string; size?: number; style?: StyleProp<ViewStyle>; label?: boolean };

export default function ViewCount(p: Props) {
  if (p.kind) return <Live {...p} kind={p.kind} />;
  return <Badge {...p} n={p.count} />;
}
function Live(p: Props & { kind: ViewKind }) {
  const n = useListViewCount(p.kind, p.id, p.track);
  return <Badge {...p} n={p.count ?? n} />;
}
function Badge({ n, color = Colors.textMuted, size = 12, style, label }: Props & { n: number | null | undefined }) {
  if (n === null || n === undefined) return null;
  return (
    <View style={[s.row, style]} accessibilityLabel={`${n} مشاهدة`}>
      <Ionicons name="eye-outline" size={size + 1} color={color} />
      <Text style={[s.t, { color, fontSize: size }]}>{formatViews(n)}{label ? " مشاهدة" : ""}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  t: { fontFamily: "Cairo_600SemiBold" },
});
