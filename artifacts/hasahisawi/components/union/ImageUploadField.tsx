// رفع صورة (أو عدة صور) من الجهاز بدل لصق رابط — يُرجع روابط https من خادم الرفع.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { uploadFile } from "@/lib/firebase/storage";
import { notify } from "@/lib/xplatform";

const ACCENT = "#1F5C8A";

async function pickAndUpload(folder: string, multiple: boolean, max: number, onProgress?: (p: number) => void): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { notify("الصور", "اسمح بالوصول إلى الصور لاختيار صورة."); return []; }
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"] as any, quality: 0.8, exif: false,
    allowsMultipleSelection: multiple, selectionLimit: multiple ? max : 1,
  });
  if (r.canceled || !r.assets?.length) return [];
  const out: string[] = [];
  for (const [i, a] of r.assets.slice(0, max).entries()) {
    const ext = (a.mimeType || "image/jpeg").includes("png") ? "png" : "jpg";
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await uploadFile(`${folder}/${name}`, a.uri, {
      fileName: name, mimeType: a.mimeType || "image/jpeg",
      onProgress: (p) => onProgress?.(Math.round(((i + p.percent / 100) / r.assets.length) * 100)),
    });
    if (/^https:\/\//i.test(url)) out.push(url);
  }
  return out;
}

/** صورة واحدة: معاينة + تغيير + حذف */
export function ImageUploadField({ label, value, onChange, folder = "union", aspect = 16 / 9 }: {
  label: string; value: string; onChange: (url: string) => void; folder?: string; aspect?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const pick = async () => {
    setBusy(true); setPct(0);
    try { const [u] = await pickAndUpload(folder, false, 1, setPct); if (u) onChange(u); }
    catch (e: any) { notify("تعذّر رفع الصورة", e?.message || "حاول مجدداً"); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      {value ? (
        <View style={[s.preview, { aspectRatio: aspect }]}>
          <Image source={{ uri: value }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={s.previewBar}>
            <TouchableOpacity onPress={pick} style={s.smallBtn} disabled={busy}><Ionicons name="swap-horizontal" size={14} color="#fff" /><Text style={s.smallT}>تغيير</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => onChange("")} style={[s.smallBtn, { backgroundColor: "rgba(239,68,68,0.85)" }]}><Ionicons name="trash-outline" size={14} color="#fff" /><Text style={s.smallT}>حذف</Text></TouchableOpacity>
          </View>
          {busy && <View style={s.overlay}><ActivityIndicator color="#fff" /><Text style={s.smallT}>{pct}%</Text></View>}
        </View>
      ) : (
        <TouchableOpacity onPress={pick} disabled={busy} style={s.drop} accessibilityRole="button" accessibilityLabel={label}>
          {busy ? <><ActivityIndicator color={ACCENT} /><Text style={s.dropT}>جارٍ الرفع… {pct}%</Text></> : (
            <><Ionicons name="image-outline" size={26} color={ACCENT} /><Text style={s.dropT}>اختر صورة من جهازك</Text></>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

/** عدة صور: شريط مصغّرات + إضافة + حذف */
export function ImagesUploadField({ label, value, onChange, folder = "union", max = 20 }: {
  label: string; value: string[]; onChange: (urls: string[]) => void; folder?: string; max?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const add = async () => {
    if (value.length >= max) { notify("الصور", `الحد ${max} صورة`); return; }
    setBusy(true); setPct(0);
    try { const urls = await pickAndUpload(folder, true, max - value.length, setPct); if (urls.length) onChange([...value, ...urls]); }
    catch (e: any) { notify("تعذّر رفع الصور", e?.message || "حاول مجدداً"); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label} <Text style={{ color: Colors.textMuted }}>({value.length}/{max})</Text></Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 8 }}>
        <TouchableOpacity onPress={add} disabled={busy} style={s.addTile} accessibilityLabel="إضافة صور">
          {busy ? <><ActivityIndicator color={ACCENT} /><Text style={s.tileT}>{pct}%</Text></> : <><Ionicons name="add" size={26} color={ACCENT} /><Text style={s.tileT}>إضافة صور</Text></>}
        </TouchableOpacity>
        {value.map((u, i) => (
          <View key={u + i} style={s.thumb}>
            <Image source={{ uri: u }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {i === 0 && <View style={s.coverTag}><Text style={s.coverT}>الغلاف</Text></View>}
            <TouchableOpacity onPress={() => onChange(value.filter((_, j) => j !== i))} style={s.remove} hitSlop={8} accessibilityLabel="حذف الصورة">
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  drop: { height: 110, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: ACCENT + "80", backgroundColor: ACCENT + "10", alignItems: "center", justifyContent: "center", gap: 6 },
  dropT: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: ACCENT },
  preview: { width: "100%", borderRadius: 14, overflow: "hidden", backgroundColor: Colors.cardBg },
  previewBar: { position: "absolute", bottom: 8, left: 8, flexDirection: "row", gap: 6 },
  smallBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)" },
  smallT: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", gap: 4 },
  addTile: { width: 92, height: 92, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: ACCENT + "80", backgroundColor: ACCENT + "10", alignItems: "center", justifyContent: "center", gap: 2 },
  tileT: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: ACCENT },
  thumb: { width: 92, height: 92, borderRadius: 12, overflow: "hidden", backgroundColor: Colors.cardBg },
  remove: { position: "absolute", top: 4, left: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" },
  coverTag: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(31,92,138,0.85)", paddingVertical: 1 },
  coverT: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: "#fff", textAlign: "center" },
});
