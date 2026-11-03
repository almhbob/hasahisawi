// عناصر مساحة المقاولات: بطاقة الشركة، مقارنة قبل/بعد، نجوم التقييم، شارات الحالة، ورفع الصور.
import React, { useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator, useWindowDimensions } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import { uploadLibraryFile } from "@/lib/ithraa";
import { CON, CON_DEEP, type Company } from "@/lib/contractors";

export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row-reverse", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable accessibilityRole="button" key={i} disabled={!onChange} onPress={() => onChange?.(i)} hitSlop={4} accessibilityLabel={`${i} نجوم`}>
          <Ionicons name={value >= i ? "star" : value >= i - 0.5 ? "star-half" : "star-outline"} size={size} color="#F59E0B" />
        </Pressable>
      ))}
    </View>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return <Text style={[s.badge, { color, backgroundColor: color + "16" }]}>{label}</Text>;
}

export function CompanyCard({ c, onPress }: { c: Company; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel={c.name}>
      <View style={s.cover}>
        {c.cover_url ? <Image source={{ uri: c.cover_url }} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: CON_DEEP }]}><View style={s.stripes} /></View>}
        <View style={s.logo}>{c.logo_url ? <Image source={{ uri: c.logo_url }} style={{ width: "100%", height: "100%" }} /> : <MaterialCommunityIcons name="crane" size={26} color={CON} />}</View>
      </View>
      <View style={{ padding: 12, paddingTop: 30, gap: 4 }}>
        <Text style={s.name} numberOfLines={1}>{c.name}</Text>
        {!!c.tagline && <Text style={s.tag} numberOfLines={1}>{c.tagline}</Text>}
        <View style={[s.rowR, { gap: 8, flexWrap: "wrap" }]}>
          {c.rating != null ? <View style={[s.rowR, { gap: 3 }]}><Stars value={c.rating} size={12} /><Text style={s.meta}>{c.rating} ({c.reviews_count})</Text></View> : <Text style={s.meta}>جديدة</Text>}
          <Text style={s.meta}>· {c.projects_count} مشروع</Text>
          {c.completed_count > 0 && <Text style={s.meta}>· {c.completed_count} عمل منجز</Text>}
        </View>
        <View style={[s.rowR, { gap: 6, flexWrap: "wrap", marginTop: 2 }]}>
          {c.specialty_labels.slice(0, 3).map((l) => <Badge key={l} label={l} color={CON} />)}
          {c.specialty_labels.length > 3 && <Text style={s.meta}>+{c.specialty_labels.length - 3}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

/** مقارنة قبل/بعد: مفتاح تبديل مع شريط سحب لنسبة العرض */
export function BeforeAfter({ before, after, height = 240 }: { before?: string; after?: string; height?: number }) {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<"before" | "after" | "split">(before && after ? "split" : after ? "after" : "before");
  const [split, setSplit] = useState(0.5);
  const w = Math.min(width - 32, 640);
  if (!before && !after) return null;
  return (
    <View>
      <View style={[s.ba, { height, width: w }]}
        onStartShouldSetResponder={() => mode === "split"} onMoveShouldSetResponder={() => mode === "split"}
        onResponderMove={(e) => setSplit(Math.max(0.05, Math.min(0.95, e.nativeEvent.locationX / w)))}
        onResponderGrant={(e) => setSplit(Math.max(0.05, Math.min(0.95, e.nativeEvent.locationX / w)))}>
        {mode !== "before" && after && <Image source={{ uri: after }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
        {mode === "before" && before && <Image source={{ uri: before }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
        {mode === "split" && before && (
          <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: w * split, overflow: "hidden" }}>
            <Image source={{ uri: before }} style={{ width: w, height }} resizeMode="cover" />
          </View>
        )}
        {mode === "split" && (
          <View style={[s.handle, { left: w * split - 1 }]}>
            <View style={s.knob}><Ionicons name="code-outline" size={16} color={CON_DEEP} /></View>
          </View>
        )}
        {mode === "split" && <><Text style={[s.lbl, { left: 8 }]}>قبل</Text><Text style={[s.lbl, { right: 8 }]}>بعد</Text></>}
      </View>
      {before && after && (
        <View style={[s.rowR, { gap: 6, marginTop: 8, justifyContent: "center" }]}>
          {([["before", "قبل"], ["split", "مقارنة"], ["after", "بعد"]] as const).map(([k, l]) => (
            <Pressable key={k} onPress={() => setMode(k)} style={[s.seg, mode === k && { backgroundColor: CON, borderColor: CON }]}>
              <Text style={[s.segT, mode === k && { color: "#fff" }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** منتقي صور متعدد يرفع إلى التخزين السحابي ويعيد الروابط */
export function ImagesField({ value, onChange, max = 8, label }: { value: string[]; onChange: (v: string[]) => void; max?: number; label?: string }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const add = async () => {
    if (!token) return notify("سجّل الدخول", "سجّل الدخول لرفع الصور");
    const r = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png"], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 8 * 1024 * 1024) return notify("الصورة كبيرة", "اختر صورة أقل من 8 م.ب");
    setBusy("0%");
    try { const url = await uploadLibraryFile(token, a, (p) => setBusy(`${p}%`)); onChange([...value, url].slice(0, max)); }
    catch (e: any) { notify("تعذّر الرفع", e?.message); } finally { setBusy(null); }
  };
  return (
    <View>
      {!!label && <Text style={s.fLabel}>{label}</Text>}
      <View style={[s.rowR, { gap: 8, flexWrap: "wrap" }]}>
        {value.map((u, i) => (
          <View key={u + i} style={s.thumb}>
            <Image source={{ uri: u }} style={StyleSheet.absoluteFill} />
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onChange(value.filter((_, j) => j !== i))} style={s.del} accessibilityLabel="حذف الصورة"><Ionicons name="close" size={14} color="#fff" /></Pressable>
          </View>
        ))}
        {value.length < max && (
          <Pressable onPress={add} disabled={!!busy} style={[s.thumb, s.addThumb]} accessibilityLabel="إضافة صورة">
            {busy ? <><ActivityIndicator color={CON} /><Text style={s.meta}>{busy}</Text></> : <><Ionicons name="camera-outline" size={22} color={CON} /><Text style={s.meta}>إضافة</Text></>}
          </Pressable>
        )}
      </View>
    </View>
  );
}

export const conStyles = StyleSheet.create({
  input: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginTop: 12, marginBottom: 6 },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 19 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  primary: { backgroundColor: CON, borderRadius: 14, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 8 },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  ghost: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.divider, flexDirection: "row-reverse", gap: 6, alignItems: "center", justifyContent: "center" },
  ghostT: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary },
  rowR: { flexDirection: "row-reverse", alignItems: "center" },
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  pillT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
});

export function Pill({ label, on, onPress, icon, color = CON }: { label: string; on: boolean; onPress: () => void; icon?: string; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[conStyles.pill, on && { backgroundColor: color, borderColor: color }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      {!!icon && <MaterialCommunityIcons name={icon as any} size={14} color={on ? "#fff" : Colors.textSecondary} />}
      <Text style={[conStyles.pillT, on && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  rowR: { flexDirection: "row-reverse", alignItems: "center" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden", marginBottom: 12 },
  cover: { height: 96, backgroundColor: CON_DEEP },
  stripes: { position: "absolute", bottom: 0, left: 0, right: 0, height: 10, backgroundColor: CON, opacity: 0.9 },
  logo: { position: "absolute", bottom: -24, right: 14, width: 56, height: 56, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 2, borderColor: Colors.cardBg, overflow: "hidden", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  tag: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  badge: { fontFamily: "Cairo_700Bold", fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  ba: { borderRadius: 16, overflow: "hidden", backgroundColor: Colors.divider, alignSelf: "center" },
  handle: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  knob: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 },
  lbl: { position: "absolute", top: 8, fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 8, borderRadius: 8, overflow: "hidden" },
  seg: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider },
  segT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  fLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginTop: 12, marginBottom: 6 },
  thumb: { width: 76, height: 76, borderRadius: 12, overflow: "hidden", backgroundColor: Colors.divider },
  addThumb: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: CON + "88", backgroundColor: CON + "0A", gap: 2 },
  del: { position: "absolute", top: 4, left: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
});
