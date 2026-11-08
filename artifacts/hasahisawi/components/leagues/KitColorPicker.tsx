/**
 * اختيار ألوان الأندية: 30 لوناً شائعاً في أطقم الكرة + لون مخصص بالرمز (Hex)،
 * ولون ثانٍ اختياري للطقم ذي اللونين، مع معاينة حيّة للشارة.
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export const KIT_COLORS: { c: string; n: string }[] = [
  { c: "#D71920", n: "أحمر" }, { c: "#A50021", n: "عنابي" }, { c: "#6E1423", n: "خمري" }, { c: "#E85D04", n: "برتقالي" },
  { c: "#F48C06", n: "برتقالي فاتح" }, { c: "#FFD100", n: "أصفر" }, { c: "#C9A227", n: "ذهبي" }, { c: "#9ACD32", n: "ليموني" },
  { c: "#2E9E44", n: "أخضر" }, { c: "#00966A", n: "أخضر زمردي" }, { c: "#0B5D1E", n: "أخضر داكن" }, { c: "#20B2AA", n: "فيروزي" },
  { c: "#008080", n: "تركوازي" }, { c: "#6CACE4", n: "سماوي" }, { c: "#1E88E5", n: "أزرق" }, { c: "#0033A0", n: "أزرق ملكي" },
  { c: "#0A1F44", n: "كحلي" }, { c: "#5B2C83", n: "بنفسجي" }, { c: "#8E44AD", n: "أرجواني" }, { c: "#E91E63", n: "وردي" },
  { c: "#F7A1C4", n: "زهري فاتح" }, { c: "#8B4513", n: "بني" }, { c: "#D2B48C", n: "بيج" }, { c: "#FFFFFF", n: "أبيض" },
  { c: "#C0C0C0", n: "فضي" }, { c: "#808080", n: "رمادي" }, { c: "#36454F", n: "فحمي" }, { c: "#000000", n: "أسود" },
  { c: "#00B4D8", n: "أزرق فاتح" }, { c: "#FF6F61", n: "مرجاني" },
];

/** هل اللون فاتح؟ (لاختيار لون نص مقروء فوقه) */
export function isLight(hex?: string | null) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return false;
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}
const nameOf = (hex?: string | null) => KIT_COLORS.find(k => k.c.toLowerCase() === (hex || "").toLowerCase())?.n;

function Row({ label, value, onChange, optional }: { label: string; value: string | null; onChange: (v: string | null) => void; optional?: boolean }) {
  const [custom, setCustom] = useState(value && !nameOf(value) ? value : "");
  useEffect(() => { if (value && !nameOf(value)) setCustom(value); }, [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(custom);
  return (
    <View style={{ gap: 6 }}>
      <View style={st.rowHead}>
        <Text style={st.label}>{label}{value ? ` · ${nameOf(value) || value.toUpperCase()}` : optional ? " · بلا" : ""}</Text>
        {optional && value ? <TouchableOpacity onPress={() => onChange(null)}><Text style={st.clear}>إزالة</Text></TouchableOpacity> : null}
      </View>
      <View style={st.grid}>
        {KIT_COLORS.map(k => {
          const on = (value || "").toLowerCase() === k.c.toLowerCase();
          return (
            <TouchableOpacity key={k.c} onPress={() => onChange(k.c)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={k.n}
              style={[st.swatch, { backgroundColor: k.c }, k.c === "#FFFFFF" && { borderWidth: 1, borderColor: Colors.divider }, on && st.swatchOn]}>
              {on ? <Ionicons name="checkmark" size={16} color={isLight(k.c) ? "#1A2C25" : "#fff"} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={st.customRow}>
        <View style={[st.customPreview, { backgroundColor: valid ? custom : "transparent", borderColor: Colors.divider }]} />
        <TextInput value={custom} onChangeText={v => { const t = ("#" + v.replace(/[^0-9a-f]/gi, "")).slice(0, 7); setCustom(t); if (/^#[0-9a-f]{6}$/i.test(t)) onChange(t.toUpperCase()); }}
          placeholder={"لون مخصص — مثال: \u200E#7A1F3D"} placeholderTextColor={Colors.textMuted} autoCapitalize="characters" style={st.customInput} maxLength={7} />
      </View>
    </View>
  );
}

export default function KitColorPicker({ color, color2, onChange, single }: {
  color: string | null; color2?: string | null; onChange: (c: { color: string | null; color2: string | null }) => void; single?: boolean;
}) {
  return (
    <View style={{ gap: 12 }}>
      {!single && (
        <View style={st.previewRow}>
          <KitPreview color={color} color2={color2 || null} />
          <Text style={st.previewText}>معاينة الطقم والشارة</Text>
        </View>
      )}
      <Row label={single ? "اللون" : "اللون الأساسي"} value={color} onChange={v => onChange({ color: v, color2: color2 || null })} />
      {!single && <Row label="اللون الثاني (اختياري)" optional value={color2 || null} onChange={v => onChange({ color, color2: v })} />}
    </View>
  );
}

/** قميص بسيط بلونين (أساسي + أكمام/خطوط بالثاني) */
export function KitPreview({ color, color2, size = 54 }: { color: string | null; color2: string | null; size?: number }) {
  const c1 = color || "#00966A", c2 = color2 || c1;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="shirt" size={size} color={c1} style={isLight(c1) ? { textShadowColor: "#0005", textShadowRadius: 2 } as any : undefined} />
      {color2 ? (
        <View style={{ position: "absolute", top: size * 0.28, width: size * 0.14, height: size * 0.56, backgroundColor: c2, borderRadius: 3 }} />
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  rowHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  label: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  clear: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#D93636" },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 },
  swatch: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 3, borderColor: "#E8A900", transform: [{ scale: 1.08 }] },
  customRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  customPreview: { width: 34, height: 34, borderRadius: 10, borderWidth: 1 },
  customInput: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right", borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.cardBg },
  previewRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 10, borderRadius: 14, backgroundColor: Colors.primary + "0D" },
  previewText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textMuted },
});
