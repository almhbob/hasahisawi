// لوحة ألوان السيرة الذاتية: لوحات جاهزة + اختيار مخصص لكل دور (سداسي عشري أو شبكة ألوان).
// تباين النص يُضبط تلقائياً داخل القالب، لذا لا يمكن للمستخدم أن ينتج سيرة غير مقروءة.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import {
  CV_PALETTES, CV_COLOR_GRID, ROLE_LABELS, normHex, sameTheme, onColor,
  type CVTheme, type CVThemeRole, type CVPalette,
} from "@/lib/cv-theme";

type Props = {
  theme: CVTheme;
  defaults: CVTheme;
  roles: CVThemeRole[];
  onChange: (t: CVTheme) => void;
};

/** تطبيق لوحة على قالب: يُبقي ورق القالب المميّز إن كانت اللوحة بورق أبيض */
export function applyPalette(p: CVPalette, defaults: CVTheme): CVTheme {
  const paper = p.theme.paper.toUpperCase() === "#FFFFFF" ? defaults.paper : p.theme.paper;
  return { ...p.theme, paper };
}

function Swatch({ colors, on, label, onPress }: { colors: string[]; on: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={`لوحة ${label}`} accessibilityState={{ selected: on }} style={st.swWrap}>
      <View style={[st.sw, on && st.swOn]}>
        {colors.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
        {on ? <View style={st.swCheck}><Ionicons name="checkmark" size={14} color="#fff" /></View> : null}
      </View>
      <Text style={[st.swLbl, on && { color: Colors.primaryDeep }]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function CVColorPanel({ theme, defaults, roles, onChange }: Props) {
  const editable: CVThemeRole[] = roles.filter((r) => r !== "text");
  const [role, setRole] = useState<CVThemeRole>(editable[0] || "primary");
  const [hex, setHex] = useState(theme[role]);
  const [err, setErr] = useState("");
  useEffect(() => { if (!editable.includes(role)) setRole(editable[0] || "primary"); }, [roles.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setHex(theme[role]); setErr(""); }, [role, theme]);

  const isDefault = sameTheme(theme, defaults);
  const activePal = CV_PALETTES.find((p) => sameTheme(applyPalette(p, defaults), theme));
  const custom = !isDefault && !activePal;

  function setRoleColor(c: string) {
    const h = normHex(c);
    if (!h) { setErr("اكتب لوناً بصيغة #RRGGBB"); return; }
    setErr("");
    onChange({ ...theme, [role]: h });
  }

  return (
    <View style={st.card}>
      <View style={st.head}>
        <Ionicons name="color-palette-outline" size={18} color={Colors.primary} />
        <Text style={st.title}>ألوان السيرة</Text>
        {custom ? <View style={st.tag}><Text style={st.tagTxt}>مخصّص</Text></View> : null}
      </View>

      <View style={st.grid}>
        <Swatch colors={[defaults.primary, defaults.accent, defaults.side]} on={isDefault} label="ألوان القالب" onPress={() => onChange({ ...defaults })} />
        {CV_PALETTES.map((p) => (
          <Swatch key={p.id} colors={[p.theme.primary, p.theme.accent, p.theme.side]} on={!isDefault && activePal?.id === p.id} label={p.name} onPress={() => onChange(applyPalette(p, defaults))} />
        ))}
      </View>

      <Text style={st.sub}>تخصيص الألوان</Text>
      <View style={st.roles}>
        {editable.map((r) => {
          const on = r === role;
          return (
            <TouchableOpacity key={r} onPress={() => setRole(r)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[st.roleBtn, on && st.roleOn]}>
              <View style={[st.roleDot, { backgroundColor: theme[r] }]} />
              <Text style={[st.roleTxt, on && { color: Colors.primaryDeep }]}>{ROLE_LABELS[r]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={st.hexRow}>
        <View style={[st.hexPrev, { backgroundColor: theme[role] }]}><Text style={{ color: onColor(theme[role]), fontFamily: "Cairo_700Bold", fontSize: 12 }}>أ</Text></View>
        <TextInput
          value={hex}
          onChangeText={(v) => { setHex(v); const h = normHex(v); if (h && h.length === 7 && v.replace("#", "").length === 6) setRoleColor(h); }}
          onSubmitEditing={() => setRoleColor(hex)}
          onBlur={() => hex !== theme[role] && setRoleColor(hex)}
          autoCapitalize="characters" autoCorrect={false} maxLength={7}
          placeholder="#1B2B48" placeholderTextColor={Colors.textMuted}
          accessibilityLabel={`رمز لون ${ROLE_LABELS[role]}`}
          style={st.hexInput}
        />
        <TouchableOpacity onPress={() => onChange({ ...theme, [role]: defaults[role] })} style={st.resetBtn} accessibilityRole="button" accessibilityLabel="إرجاع لون القالب لهذا الدور">
          <Ionicons name="refresh" size={16} color={Colors.primaryDeep} />
        </TouchableOpacity>
      </View>
      {err ? <Text style={st.err}>{err}</Text> : null}
      <View style={st.colors}>
        {CV_COLOR_GRID.map((c) => {
          const on = theme[role].toUpperCase() === c.toUpperCase();
          return (
            <TouchableOpacity key={c} onPress={() => setRoleColor(c)} accessibilityRole="button" accessibilityLabel={`لون ${c}`} accessibilityState={{ selected: on }} style={st.cellHit}>
              <View style={[st.cell, { backgroundColor: c }, on && st.cellOn]}>{on ? <Ionicons name="checkmark" size={14} color={onColor(c)} /> : null}</View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={st.note}>لون النص فوق الأشرطة والأعمدة يُختار تلقائياً (أبيض أو داكن) ليبقى مقروءاً، ويُحفظ اختيارك مع المسودة ويظهر في ملف PDF.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { alignSelf: "stretch", gap: 10, padding: 12, borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.cardBg, marginVertical: 10 },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  title: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  tag: { backgroundColor: Colors.accentSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  tagTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.accentDeep },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  swWrap: { width: 74, alignItems: "center", gap: 4 },
  sw: { width: 48, height: 48, borderRadius: 24, overflow: "hidden", flexDirection: "row", borderWidth: 2, borderColor: Colors.border },
  swOn: { borderWidth: 3, borderColor: Colors.primary },
  swCheck: { position: "absolute", top: 13, left: 13, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  swLbl: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "center" },
  sub: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginTop: 4 },
  roles: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  roleBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg },
  roleOn: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  roleDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: "rgba(0,0,0,0.15)" },
  roleTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  hexRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  hexPrev: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  hexInput: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, color: Colors.textPrimary, fontFamily: "Cairo_600SemiBold", fontSize: 14, paddingHorizontal: 12, textAlign: "left" },
  resetBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.danger, textAlign: "right" },
  colors: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 2 },
  cellHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  cell: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" },
  cellOn: { borderWidth: 3, borderColor: Colors.primary },
  note: { fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 19, color: Colors.textMuted, textAlign: "right" },
});
