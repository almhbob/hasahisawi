import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet, type TextInputProps, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export const EDU = { ink: "#12355B", teal: "#2F7D6D", gold: "#B78200", soft: "#EEF5F3", line: "#E1EAE6" };

export function ToolHeader({ title, sub, onBack, right }: { title: string; sub?: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={u.head}>
      <Pressable onPress={onBack} hitSlop={10} style={u.back}><Ionicons name="chevron-forward" size={22} color={EDU.ink} /></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={u.headTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={u.headSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Field({ label, style, ...p }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={u.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={Colors.textMuted} textAlign="right" {...p}
        style={[u.input, p.multiline && { minHeight: 84, textAlignVertical: "top", paddingTop: 10 }, style]} />
    </View>
  );
}

export function Btn({ title, icon, onPress, color = EDU.ink, outline, style, disabled }: {
  title: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; color?: string; outline?: boolean; style?: ViewStyle; disabled?: boolean;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [u.btn, outline ? { borderWidth: 1.2, borderColor: color, backgroundColor: "#fff" } : { backgroundColor: color }, (pressed || disabled) && { opacity: 0.7 }, style]}>
      {icon ? <Ionicons name={icon} size={17} color={outline ? color : "#fff"} /> : null}
      <Text style={[u.btnText, outline && { color }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [u.card, pressed && { opacity: 0.85 }, style]}>{children}</Pressable>;
  return <View style={[u.card, style]}>{children}</View>;
}

export function Empty({ icon, title, sub, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <View style={u.empty}>
      <View style={u.emptyIcon}><Ionicons name={icon} size={30} color={EDU.teal} /></View>
      <Text style={u.emptyTitle}>{title}</Text>
      {sub ? <Text style={u.emptySub}>{sub}</Text> : null}
      {action}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={u.seg}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[u.segItem, value === o.key && u.segOn]}>
          <Text style={[u.segText, value === o.key && { color: "#fff" }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const u = StyleSheet.create({
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: EDU.line },
  back: { width: 36, height: 36, borderRadius: 12, backgroundColor: EDU.soft, alignItems: "center", justifyContent: "center" },
  headTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: EDU.ink, textAlign: "right" },
  headSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: EDU.ink, textAlign: "right" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: EDU.line, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.text },
  btn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  card: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: EDU.line, padding: 14 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 36, paddingHorizontal: 20 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: EDU.soft, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: EDU.ink, textAlign: "center" },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },
  seg: { flexDirection: "row-reverse", backgroundColor: EDU.soft, borderRadius: 12, padding: 4, gap: 4 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  segOn: { backgroundColor: EDU.ink },
  segText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: EDU.ink },
});
