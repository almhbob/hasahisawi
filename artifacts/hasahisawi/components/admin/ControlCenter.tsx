/**
 * مركز التحكم في لوحة الإدارة: بدل شريط أفقي من 40+ تبويباً يصعب التنقل فيه،
 * تُعرض الأقسام مجمّعة في فئات كبطاقات مع بحث فوري، وشريط علوي مختصر داخل كل قسم.
 */
import React, { useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { neu, NeuRaised, NeuInset } from "@/components/auth/neu";

export type AdminTabItem = {
  key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; badge?: number;
};

/** تصنيف الأقسام — أي قسم غير مذكور يذهب إلى «أخرى» */
const GROUPS: { title: string; icon: keyof typeof Ionicons.glyphMap; keys: string[] }[] = [
  { title: "الحسابات والصلاحيات", icon: "people-circle", keys: ["members", "portal_accounts", "admins", "moderators", "security"] },
  { title: "الطلبات والبلاغات", icon: "file-tray-full", keys: ["join_requests", "social_reports", "reports_admin", "feedback_admin", "missing_admin", "ratings_admin"] },
  { title: "الاتحادات والمؤسسات", icon: "business", keys: ["student_union", "communities", "partners", "section_invites", "libraries"] },
  { title: "الخدمات المهنية", icon: "briefcase", keys: ["lawyers_admin", "designers_admin", "legal_forms", "legal_suggestions", "cv_templates", "jobs_admin"] },
  { title: "الصحة", icon: "medkit", keys: ["sick_leaves", "admissions"] },
  { title: "التجارة والأسواق", icon: "storefront", keys: ["merchants_admin", "phone_shops", "women_stores_admin", "farmers_admin", "factories_admin", "rentals_admin", "zawajil", "ads"] },
  { title: "المدينة والمحتوى", icon: "map", keys: ["landmarks", "neighborhoods", "numbers_admin", "honored", "transport"] },
  { title: "النظام والإعدادات", icon: "settings", keys: ["sections_config", "ai_settings", "updates", "calls_diag"] },
];

function groupTabs(tabs: AdminTabItem[], q: string) {
  const t = q.trim();
  const pool = tabs.filter(x => x.key !== "overview" && (!t || x.label.includes(t)));
  const used = new Set<string>();
  const out = GROUPS.map(g => {
    const items = g.keys.map(k => pool.find(p => p.key === k)).filter(Boolean) as AdminTabItem[];
    items.forEach(i => used.add(i.key));
    return { ...g, items };
  }).filter(g => g.items.length);
  const rest = pool.filter(p => !used.has(p.key));
  if (rest.length) out.push({ title: "أخرى", icon: "apps", keys: [], items: rest });
  return out;
}

export function AdminHero({ name, isAdmin, pending, onBack }: { name?: string; isAdmin: boolean; pending: number; onBack: () => void }) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "صباح الخير" : "مساء الخير";
  return (
    <LinearGradient colors={[Colors.primary, Colors.primaryDim, "#004D36"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={cc.hero}>
      <View style={cc.heroTop}>
        <TouchableOpacity onPress={onBack} style={cc.heroBtn} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={cc.rolePill}>
          <Ionicons name={isAdmin ? "shield-checkmark" : "shield-half"} size={12} color="#fff" />
          <Text style={cc.roleText}>{isAdmin ? "مدير النظام" : "مشرف"}</Text>
        </View>
      </View>
      <Text style={cc.heroGreet}>{greet}، {name?.split(" ")[0] || "المدير"}</Text>
      <Text style={cc.heroTitle}>مركز التحكم</Text>
      <View style={cc.heroStatRow}>
        <Ionicons name={pending > 0 ? "notifications" : "checkmark-done"} size={14} color="#fff" />
        <Text style={cc.heroStat}>{pending > 0 ? `${pending} عنصر بانتظار مراجعتك` : "لا شيء بانتظار المراجعة"}</Text>
      </View>
      <View pointerEvents="none" style={cc.heroCircle} />
    </LinearGradient>
  );
}

export function ControlCenterGrid({ tabs, onOpen }: { tabs: AdminTabItem[]; onOpen: (key: string) => void }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => groupTabs(tabs, q), [tabs, q]);
  return (
    <View style={{ gap: 16 }}>
      <NeuInset radius={16} style={cc.search}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="ابحث عن قسم… (مثال: الاتحاد، البلاغات)"
          placeholderTextColor={Colors.textMuted}
          style={cc.searchInput}
        />
        {!!q && <Ionicons name="close-circle" size={18} color={Colors.textMuted} onPress={() => setQ("")} />}
      </NeuInset>

      {groups.map((g, gi) => (
        <Animated.View key={g.title} entering={FadeInDown.delay(gi * 50).duration(300)} style={{ gap: 10 }}>
          <View style={cc.groupHead}>
            <Ionicons name={g.icon} size={15} color={Colors.primary} />
            <Text style={cc.groupTitle}>{g.title}</Text>
            <View style={cc.groupLine} />
          </View>
          <View style={cc.grid}>
            {g.items.map(t => (
              <Pressable key={t.key} onPress={() => onOpen(t.key)} style={({ pressed }) => [cc.tileWrap, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityRole="button" accessibilityLabel={t.label}>
                <NeuRaised radius={18} depth={6} style={cc.tile}>
                  <View style={[cc.tileIcon, { backgroundColor: t.color + "1C" }]}>
                    <Ionicons name={t.icon} size={20} color={t.color} />
                  </View>
                  <Text style={cc.tileLabel} numberOfLines={2}>{t.label}</Text>
                  {(t.badge ?? 0) > 0 && (
                    <View style={cc.badge}><Text style={cc.badgeText}>{t.badge}</Text></View>
                  )}
                </NeuRaised>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ))}
      {groups.length === 0 && <Text style={cc.empty}>لا يوجد قسم بهذا الاسم</Text>}
    </View>
  );
}

/** شريط مختصر يظهر داخل أي قسم: رجوع لمركز التحكم + اسم القسم + كل الأقسام */
export function SectionBar({ current, tabs, onHome, onOpen }: { current?: AdminTabItem; tabs: AdminTabItem[]; onHome: () => void; onOpen: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <>
      <View style={cc.bar}>
        <TouchableOpacity onPress={onHome} style={cc.barHome} accessibilityLabel="مركز التحكم">
          <Ionicons name="grid" size={16} color={Colors.primary} />
          <Text style={cc.barHomeText}>مركز التحكم</Text>
        </TouchableOpacity>
        <Ionicons name="chevron-back" size={14} color={Colors.textMuted} />
        {current && (
          <View style={cc.barCurrent}>
            <Ionicons name={current.icon} size={15} color={current.color} />
            <Text style={cc.barCurrentText} numberOfLines={1}>{current.label}</Text>
          </View>
        )}
        <TouchableOpacity onPress={() => setOpen(true)} style={cc.barAll} accessibilityLabel="كل الأقسام">
          <Ionicons name="apps" size={16} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={cc.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[cc.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={cc.grabber} />
            <Text style={cc.sheetTitle}>كل الأقسام</Text>
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
              <ControlCenterGrid tabs={tabs} onOpen={k => { setOpen(false); onOpen(k); }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const cc = StyleSheet.create({
  hero: { borderRadius: 26, padding: 18, paddingBottom: 20, overflow: "hidden", gap: 2 },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  heroBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  rolePill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)" },
  roleText: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: "#fff" },
  heroGreet: { fontFamily: "Cairo_500Medium", fontSize: 13.5, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 26, color: "#fff", textAlign: "right" },
  heroStatRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 6, alignSelf: "flex-end", backgroundColor: "rgba(0,0,0,0.16)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  heroStat: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: "#fff" },
  heroCircle: { position: "absolute", width: 180, height: 180, borderRadius: 90, left: -50, top: -60, backgroundColor: "rgba(255,255,255,0.08)" },

  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, minHeight: 50 },
  searchInput: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },

  groupHead: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  groupTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  groupLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  tileWrap: { width: "30.5%", minWidth: 96 },
  tile: { padding: 12, minHeight: 104, alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
  tileIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textPrimary, textAlign: "right", lineHeight: 19, alignSelf: "stretch" },
  badge: { position: "absolute", top: 8, left: 8, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  empty: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 20 },

  bar: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider, backgroundColor: neu.base },
  barHome: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: Colors.primary + "14" },
  barHomeText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.primary },
  barCurrent: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  barCurrentText: { flexShrink: 1, fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  barAll: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { maxHeight: "86%", backgroundColor: neu.base, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 16, paddingTop: 10 },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, marginBottom: 10 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right", marginBottom: 12 },
});
