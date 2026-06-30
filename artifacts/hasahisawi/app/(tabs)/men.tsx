import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Linking, Platform, Alert,
  Modal, ActivityIndicator, KeyboardAvoidingView, Keyboard,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import ModernHeader from "@/components/ui/ModernHeader";

// ══════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════
type ServiceType = "barber" | "fashion" | "perfume" | "fitness" | "craft" | "jobs";

type MenService = {
  id: string;
  name: string;
  type: ServiceType;
  address: string;
  phone: string;
  hours: string;
  description: string;
  rating: number;
  tags: string[];
};

// ══════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════
const TYPE_CONFIG: Record<ServiceType, { label: string; icon: string; color: string }> = {
  barber:  { label: "حلاقة",          icon: "content-cut",        color: "#38BDF8" },
  fashion: { label: "أزياء",          icon: "tshirt-crew-outline", color: "#8B5CF6" },
  perfume: { label: "عطور",           icon: "spray-bottle",        color: "#FBBF24" },
  fitness: { label: "رياضة ولياقة",  icon: "dumbbell",             color: "#22C55E" },
  craft:   { label: "حرف وصيانة",    icon: "tools",                color: "#F97316" },
  jobs:    { label: "خدمات وعمل",     icon: "briefcase-outline",    color: "#14B8A6" },
};

const JOIN_TYPES: { key: ServiceType; label: string; icon: string }[] = [
  { key: "barber",  label: "صالون حلاقة",   icon: "content-cut"         },
  { key: "fashion", label: "أزياء رجالية",  icon: "tshirt-crew-outline"  },
  { key: "perfume", label: "عطور",           icon: "spray-bottle"         },
  { key: "fitness", label: "رياضة ولياقة", icon: "dumbbell"              },
  { key: "craft",   label: "حرف وصيانة",   icon: "tools"                 },
  { key: "jobs",    label: "خدمات وعمل",    icon: "briefcase-outline"     },
];

const PRIMARY = "#38BDF8";

// ══════════════════════════════════════════════════════
// SCREEN
// ══════════════════════════════════════════════════════
export default function MenScreen() {
  const { user } = useAuth();

  const [services,   setServices]   = useState<MenService[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState<ServiceType | "all">("all");

  // نموذج الانضمام
  const [joinModal,   setJoinModal]   = useState(false);
  const [joinDone,    setJoinDone]    = useState(false);
  const [joinSending, setJoinSending] = useState(false);
  const [joinName,    setJoinName]    = useState("");
  const [joinType,    setJoinType]    = useState<ServiceType>("barber");
  const [joinPhone,   setJoinPhone]   = useState("");
  const [joinAddress, setJoinAddress] = useState("");
  const [joinDesc,    setJoinDesc]    = useState("");

  function resetJoin() {
    setJoinName(""); setJoinPhone(""); setJoinAddress(""); setJoinDesc(""); setJoinType("barber");
  }

  const load = async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?type=${filter}` : "";
      const res = await fetch(`${getApiUrl()}/api/men-services${params}`);
      if (res.ok) {
        const data = await res.json();
        setServices((data.services || []).map((s: Record<string, unknown>) => ({
          id: String(s.id),
          name: s.name,
          type: s.type as ServiceType,
          address: s.address ?? "",
          phone: s.phone,
          hours: s.hours ?? "٨ص–١٠م",
          description: s.description ?? "",
          rating: parseFloat(String(s.rating ?? 0)),
          tags: Array.isArray(s.tags) ? s.tags : [],
        })));
      }
    } catch { /* offline */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);
  useFocusEffect(useCallback(() => { load(); }, []));

  async function submitJoinRequest() {
    if (!joinName.trim() || !joinPhone.trim())
      return Alert.alert("بيانات ناقصة", "الاسم ورقم الهاتف مطلوبان");
    Keyboard.dismiss();
    setJoinSending(true);
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const res = await fetch(`${base}/api/men/join-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_name:   joinName.trim(),
          service_type: joinType,
          phone:        joinPhone.trim(),
          address:      joinAddress.trim(),
          description:  joinDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) return Alert.alert("خطأ", data.error ?? "حدث خطأ");
      resetJoin();
      setJoinDone(true);
    } catch {
      Alert.alert("خطأ في الاتصال", "تعذّر الاتصال بالخادم، حاول مجدداً");
    } finally {
      setJoinSending(false);
    }
  }

  const handleCall = (phone: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("تواصل", "", [
      { text: "إلغاء", style: "cancel" },
      { text: "واتساب", onPress: () => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, "")}`) },
      { text: "اتصال",  onPress: () => Linking.openURL(`tel:${phone}`) },
    ]);
  };

  const filtered = services.filter(s => {
    const matchSearch = search === "" || s.name.includes(search) || s.address.includes(search) || s.description.includes(search);
    const matchFilter = filter === "all" || s.type === filter;
    return matchSearch && matchFilter;
  });

  const countByType = (t: ServiceType) => services.filter(s => s.type === t).length;

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <ModernHeader title="قسم الرجال" subtitle="حلاقة · أزياء · عطور · رياضة · حرف">

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { num: `${countByType("barber")}`,  label: "حلاقة",   color: "#38BDF8" },
            { num: `${countByType("fashion")}`, label: "أزياء",   color: "#8B5CF6" },
            { num: `${countByType("fitness")}`, label: "رياضة",   color: "#22C55E" },
            { num: `${countByType("craft")}`,   label: "حرف",     color: "#F97316" },
          ].map((st, i) => (
            <View key={i} style={s.statItem}>
              <Text style={[s.statNum, { color: st.color }]}>{st.num}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
          {([["all", "الكل", "apps-outline", "#aaa"], ...Object.entries(TYPE_CONFIG).map(([k, v]) => [k, v.label, v.icon, v.color])] as [string, string, string, string][]).map(([k, label, icon, color]) => (
            <TouchableOpacity
              key={k}
              style={[s.chip, filter === k && { borderColor: color, backgroundColor: color + "20" }]}
              onPress={() => setFilter(k as ServiceType | "all")}
            >
              <MaterialCommunityIcons name={icon as any} size={13} color={filter === k ? color : Colors.textMuted} />
              <Text style={[s.chipText, filter === k && { color }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ModernHeader>

      {/* Search */}
      <View style={s.searchSection}>
        <View style={s.searchRow}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="ابحث عن خدمة..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>
      </View>

      {/* ── بانر الانضمام ── */}
      <Animated.View entering={FadeIn.duration(400)} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <TouchableOpacity
          style={jm.joinBanner}
          activeOpacity={0.88}
          onPress={() => { setJoinDone(false); setJoinModal(true); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <LinearGradient colors={[PRIMARY + "30", "#8B5CF720", "transparent"]} style={StyleSheet.absoluteFill} />
          <View style={jm.joinBannerIcon}>
            <MaterialCommunityIcons name="store-plus-outline" size={26} color={PRIMARY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={jm.joinBannerTitle}>انضم معنا!</Text>
            <Text style={jm.joinBannerSub}>سجّل خدمتك في قسم الرجال وابدأ العمل</Text>
          </View>
          <View style={jm.joinBannerArrow}>
            <Ionicons name="chevron-back" size={18} color={PRIMARY} />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* ── قائمة الخدمات ── */}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

        {loading && services.length === 0 ? (
          <ActivityIndicator color={PRIMARY} size="large" style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <Animated.View entering={FadeIn.duration(500)}>
            <View style={s.emptyState}>
              <MaterialCommunityIcons name="magnify" size={52} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>لا توجد نتائج</Text>
              <Text style={s.emptySub}>كن أول من يسجّل خدمته في قسم الرجال</Text>
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => { setJoinDone(false); setJoinModal(true); }}
              >
                <LinearGradient colors={[PRIMARY, "#0284C7"]} style={s.emptyBtnGrad}>
                  <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#fff" />
                  <Text style={s.emptyBtnText}>سجّل خدمتك الآن</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          filtered.map((item, idx) => {
            const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.craft;
            return (
              <Animated.View key={item.id} entering={FadeInDown.delay(idx * 60).springify()}>
                <View style={[s.card, { borderColor: cfg.color + "30" }]}>
                  <LinearGradient colors={[cfg.color + "08", "transparent"]} style={StyleSheet.absoluteFill} />

                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardName}>{item.name}</Text>
                      <View style={s.cardMeta}>
                        <View style={[s.typeBadge, { backgroundColor: cfg.color + "20" }]}>
                          <MaterialCommunityIcons name={cfg.icon as any} size={12} color={cfg.color} />
                          <Text style={[s.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        {item.rating > 0 && (
                          <View style={s.ratingRow}>
                            <Ionicons name="star" size={13} color={Colors.accent} />
                            <Text style={s.ratingText}>{item.rating.toFixed(1)}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={[s.iconCircle, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
                      <MaterialCommunityIcons name={cfg.icon as any} size={26} color={cfg.color} />
                    </View>
                  </View>

                  {item.description ? (
                    <Text style={s.cardDesc}>{item.description}</Text>
                  ) : null}

                  {item.tags.length > 0 && (
                    <View style={s.tagsRow}>
                      {item.tags.map(tag => (
                        <View key={tag} style={s.tag}>
                          <Text style={s.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={s.cardInfoRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.cardInfoText}>{item.hours}</Text>
                    {item.address ? (
                      <>
                        <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                        <Text style={s.cardInfoText} numberOfLines={1}>{item.address}</Text>
                      </>
                    ) : null}
                  </View>

                  <AnimatedPress onPress={() => handleCall(item.phone)}>
                    <LinearGradient colors={[cfg.color, cfg.color + "CC"]} style={s.actionBtn}>
                      <Ionicons name="call-outline" size={16} color="#fff" />
                      <Text style={s.actionBtnText}>تواصل</Text>
                    </LinearGradient>
                  </AnimatedPress>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* ── زر الانضمام العائم ── */}
      <TouchableOpacity
        style={jm.fab}
        activeOpacity={0.88}
        onPress={() => { setJoinDone(false); setJoinModal(true); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
      >
        <LinearGradient colors={[PRIMARY, "#0284C7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={jm.fabGrad}>
          <MaterialCommunityIcons name="store-plus-outline" size={20} color="#fff" />
          <Text style={jm.fabText}>طلب الانضمام</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* ══ مودال الانضمام ══ */}
      <Modal visible={joinModal} animationType="slide" transparent onRequestClose={() => setJoinModal(false)}>
        <View style={jm.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setJoinModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={jm.sheet}>
            <LinearGradient colors={["#0A1A2A", "#0A1A10"]} style={jm.sheetInner}>

              <View style={jm.sheetHeader}>
                <TouchableOpacity onPress={() => setJoinModal(false)} style={jm.closeBtn}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <View style={jm.sheetTitleWrap}>
                  <MaterialCommunityIcons name="store-plus-outline" size={24} color={PRIMARY} />
                  <Text style={jm.sheetTitle}>طلب الانضمام لقسم الرجال</Text>
                </View>
              </View>

              {joinDone ? (
                <Animated.View entering={FadeIn} style={jm.successBox}>
                  <LinearGradient colors={[PRIMARY + "20", "#8B5CF710"]} style={jm.successIconWrap}>
                    <Ionicons name="checkmark-circle" size={56} color={PRIMARY} />
                  </LinearGradient>
                  <Text style={jm.successTitle}>تم إرسال طلبك بنجاح!</Text>
                  <Text style={jm.successSub}>سيتم مراجعة طلبك من قِبل الإدارة والتواصل معك قريباً.</Text>
                  <TouchableOpacity style={jm.successBtn} onPress={() => { setJoinModal(false); setJoinDone(false); }}>
                    <LinearGradient colors={[PRIMARY, "#0284C7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={jm.successBtnGrad}>
                      <Text style={jm.successBtnText}>حسناً، شكراً!</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  <Text style={jm.fieldLabel}>نوع الخدمة *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {JOIN_TYPES.map(jt => (
                      <TouchableOpacity
                        key={jt.key}
                        style={[jm.typeChip, joinType === jt.key && { borderColor: PRIMARY, backgroundColor: PRIMARY + "18" }]}
                        onPress={() => setJoinType(jt.key)}
                      >
                        <MaterialCommunityIcons name={jt.icon as any} size={16} color={joinType === jt.key ? PRIMARY : Colors.textMuted} />
                        <Text style={[jm.typeChipText, joinType === jt.key && { color: PRIMARY }]}>{jt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {[
                    { label: "الاسم الكامل *",      val: joinName,    set: setJoinName,    placeholder: "أحمد محمد علي"          },
                    { label: "رقم الهاتف *",         val: joinPhone,   set: setJoinPhone,   placeholder: "0912345678", kb: "phone-pad" as const },
                    { label: "الحي / المنطقة",       val: joinAddress, set: setJoinAddress, placeholder: "الحصاحيصا — الحي الغربي" },
                  ].map(f => (
                    <View key={f.label} style={{ marginBottom: 12 }}>
                      <Text style={jm.fieldLabel}>{f.label}</Text>
                      <TextInput
                        style={jm.input}
                        value={f.val}
                        onChangeText={f.set}
                        placeholder={f.placeholder}
                        placeholderTextColor={Colors.textMuted}
                        keyboardType={f.kb ?? "default"}
                        textAlign="right"
                      />
                    </View>
                  ))}

                  <View style={{ marginBottom: 12 }}>
                    <Text style={jm.fieldLabel}>وصف الخدمة</Text>
                    <TextInput
                      style={[jm.input, { minHeight: 80, textAlignVertical: "top" }]}
                      value={joinDesc}
                      onChangeText={setJoinDesc}
                      placeholder="اكتب نبذة عن خدمتك، أوقات العمل، الأسعار..."
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      textAlign="right"
                    />
                  </View>

                  <TouchableOpacity style={[jm.sendBtn, joinSending && { opacity: 0.6 }]} onPress={submitJoinRequest} disabled={joinSending}>
                    <LinearGradient colors={[PRIMARY, "#0284C7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={jm.sendBtnGrad}>
                      {joinSending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="send-outline" size={18} color="#fff" />
                          <Text style={jm.sendBtnText}>إرسال طلب الانضمام</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={{ height: 24 }} />
                </ScrollView>
              )}
            </LinearGradient>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  statsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: Colors.radius.md, padding: 14, marginBottom: 10, gap: 8 },
  statItem: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 22 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.82)" },

  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Colors.radius.pill, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.bg },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },

  searchSection: { backgroundColor: Colors.cardBg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bg, borderRadius: Colors.radius.sm, paddingHorizontal: 14, gap: 8, ...Colors.shadow.card },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 11 },

  card: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 16, gap: 10, borderWidth: 1, overflow: "hidden", ...Colors.shadow.card },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconCircle: { width: 52, height: 52, borderRadius: Colors.radius.md, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  cardName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Colors.radius.sm },
  typeBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Colors.radius.sm, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  tagText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary },
  cardInfoRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardInfoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: Colors.radius.md, paddingVertical: 13 },
  actionBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  emptyState: { alignItems: "center", paddingTop: 40, gap: 12 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  emptyBtn: { borderRadius: Colors.radius.md, overflow: "hidden", marginTop: 8, width: "80%" },
  emptyBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});

// ── أنماط نموذج الانضمام ─────────────────────────────────────────────────────
const jm = StyleSheet.create({
  joinBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg,
    borderWidth: 1.5, borderColor: PRIMARY + "40",
    padding: 14, overflow: "hidden", ...Colors.shadow.card,
  },
  joinBannerIcon: {
    width: 50, height: 50, borderRadius: Colors.radius.md,
    backgroundColor: PRIMARY + "18", borderWidth: 1.5, borderColor: PRIMARY + "40",
    alignItems: "center", justifyContent: "center",
  },
  joinBannerTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: PRIMARY, textAlign: "right" },
  joinBannerSub:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 1 },
  joinBannerArrow: { width: 32, height: 32, borderRadius: Colors.radius.sm, backgroundColor: PRIMARY + "18", alignItems: "center", justifyContent: "center" },

  fab: { position: "absolute", bottom: 24, alignSelf: "center", borderRadius: Colors.radius.pill, overflow: "hidden", ...Colors.shadow.raised, shadowColor: PRIMARY },
  fabGrad: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14 },
  fabText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  overlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: { maxHeight: "92%" },
  sheetInner: { borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl, padding: 20, paddingBottom: 36 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  closeBtn: { width: 36, height: 36, borderRadius: Colors.radius.sm, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center" },
  sheetTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },

  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 6 },
  input: {
    backgroundColor: Colors.bg, borderRadius: Colors.radius.md, borderWidth: 1.5, borderColor: Colors.divider,
    color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: Colors.divider, borderRadius: Colors.radius.md,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg,
  },
  typeChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },

  sendBtn: { borderRadius: Colors.radius.lg, overflow: "hidden", marginTop: 4 },
  sendBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15 },
  sendBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  successBox: { alignItems: "center", paddingVertical: 32, gap: 14 },
  successIconWrap: { width: 100, height: 100, borderRadius: Colors.radius.xl, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: PRIMARY + "40" },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: PRIMARY, textAlign: "center" },
  successSub: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, paddingHorizontal: 16 },
  successBtn: { borderRadius: Colors.radius.lg, overflow: "hidden", marginTop: 8, width: "80%" },
  successBtnGrad: { paddingVertical: 14, alignItems: "center" },
  successBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
