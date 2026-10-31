import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import ModernHeader from "@/components/ui/ModernHeader";
import AnimatedPress from "@/components/AnimatedPress";
import { useAuth } from "@/lib/auth-context";
import BusinessFormModal from "@/components/food/BusinessFormModal";
import BizLogo from "@/components/food/BizLogo";
import { foodApi, TYPE_META, bizColor, fmtMoney, type BizType, type FoodBusiness } from "@/lib/food-api";

export default function RestaurantsScreen() {
  const { token } = useAuth();
  const [type, setType] = useState<BizType | "">("");
  const [q, setQ] = useState("");
  const [list, setList] = useState<FoodBusiness[]>([]);
  const [mine, setMine] = useState<FoodBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, m] = await Promise.all([
        foodApi.businesses(token),
        token ? foodApi.businesses(token, { mine: true }).catch(() => ({ businesses: [] as FoodBusiness[] })) : Promise.resolve({ businesses: [] as FoodBusiness[] }),
      ]);
      setList(a.businesses); setMine(m.businesses);
    } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const t = q.trim();
    return list.filter((b) => (!type || b.business_type === type) && (!t || b.name.includes(t) || (b.description || "").includes(t) || (b.district || "").includes(t)));
  }, [list, type, q]);

  const openRegister = () => { if (!token) return router.push("/login" as any); setForm(true); };

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        <ModernHeader title="المطاعم والكافتريات" subtitle="اطلب من مطاعم الحصاحيصا مباشرة" icon="restaurant-outline">
          <View style={s.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن مطعم أو حي…" placeholderTextColor={Colors.textMuted} style={s.searchInput} textAlign="right" />
          </View>
        </ModernHeader>

        <View style={s.body}>
          <View style={s.quickRow}>
            <TouchableOpacity style={s.quickBtn} onPress={() => token ? router.push("/my-food-orders" as any) : router.push("/login" as any)}>
              <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
              <Text style={s.quickTxt}>طلباتي</Text>
            </TouchableOpacity>
            {mine.length ? (
              <TouchableOpacity style={[s.quickBtn, { backgroundColor: Colors.primary }]} onPress={() => router.push({ pathname: "/restaurant-manage", params: { id: String(mine[0].id) } } as any)}>
                <Ionicons name="speedometer-outline" size={18} color="#fff" />
                <Text style={[s.quickTxt, { color: "#fff" }]} numberOfLines={1}>لوحة {mine.length > 1 ? "مطاعمي" : mine[0].name}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.quickBtn} onPress={openRegister}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={s.quickTxt}>سجّل مطعمك</Text>
              </TouchableOpacity>
            )}
          </View>

          {flash ? <View style={s.flash}><Ionicons name="checkmark-circle" size={16} color="#0B7A4E" /><Text style={s.flashTxt}>{flash}</Text></View> : null}

          {mine.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 8 }}>
              {mine.map((b) => (
                <TouchableOpacity key={b.id} style={s.mineChip} onPress={() => router.push({ pathname: "/restaurant-manage", params: { id: String(b.id) } } as any)}>
                  <Text style={s.mineChipTxt}>{b.name}{b.status === "pending" ? " · قيد المراجعة" : ""}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            <TouchableOpacity onPress={() => setType("")} style={[s.chip, type === "" && s.chipOn]}><Text style={[s.chipTxt, type === "" && { color: "#fff" }]}>الكل</Text></TouchableOpacity>
            {(Object.keys(TYPE_META) as BizType[]).map((k) => (
              <TouchableOpacity key={k} onPress={() => setType(k)} style={[s.chip, type === k && s.chipOn]}>
                <MaterialCommunityIcons name={TYPE_META[k].icon as any} size={14} color={type === k ? "#fff" : TYPE_META[k].color} />
                <Text style={[s.chipTxt, type === k && { color: "#fff" }]}>{TYPE_META[k].label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : error ? (
            <TouchableOpacity onPress={load} style={s.empty}><Ionicons name="refresh" size={30} color={Colors.textMuted} /><Text style={s.emptyTxt}>{error} — اضغط لإعادة المحاولة</Text></TouchableOpacity>
          ) : shown.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name="silverware-fork-knife" size={40} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>{list.length ? "لا نتائج مطابقة" : "لا توجد مطاعم مسجّلة بعد"}</Text>
              <Text style={s.emptyTxt}>{list.length ? "جرّب نوعاً آخر أو كلمة بحث مختلفة" : "إن كنت صاحب مطعم أو كافتيريا، سجّل محلك واستقبل الطلبات من التطبيق"}</Text>
              {!list.length ? <TouchableOpacity onPress={openRegister} style={s.cta}><Text style={s.ctaTxt}>سجّل مطعمك مجاناً</Text></TouchableOpacity> : null}
            </View>
          ) : shown.map((b) => {
            const c = bizColor(b);
            const modes = [b.delivery_enabled && "توصيل", b.takeaway_enabled && "استلام", b.dine_in_enabled && "داخل المحل"].filter(Boolean).join(" · ");
            return (
              <AnimatedPress key={b.id} onPress={() => router.push({ pathname: "/restaurant", params: { id: String(b.id) } } as any)}>
                <View style={s.card}>
                  <View style={[s.cover, { backgroundColor: c + "22" }]}>
                    {b.cover_url ? <Image source={{ uri: b.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                    <View style={[s.openPill, { backgroundColor: b.accepting_orders ? "#0E9C64" : "#6B6B6B" }]}>
                      <Text style={s.openTxt}>{b.accepting_orders ? "يستقبل الطلبات" : "مغلق الآن"}</Text>
                    </View>
                  </View>
                  <View style={s.cardBody}>
                    <View style={{ marginTop: -34 }}><View style={s.logoRing}><BizLogo b={b} size={58} /></View></View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.name} numberOfLines={1}>{b.name}</Text>
                      <Text style={s.meta} numberOfLines={1}>{TYPE_META[b.business_type]?.label}{b.district ? ` · ${b.district}` : ""}{b.product_count ? ` · ${b.product_count} صنف` : ""}</Text>
                      {modes ? <Text style={s.modes} numberOfLines={1}>{modes}{b.delivery_enabled && b.delivery_fee ? ` · رسوم التوصيل ${fmtMoney(b.delivery_fee)}` : ""}</Text> : null}
                    </View>
                    <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
                  </View>
                </View>
              </AnimatedPress>
            );
          })}
        </View>
      </ScrollView>

      <BusinessFormModal visible={form} token={token} onClose={() => setForm(false)}
        onSaved={(b, msg) => { setFlash(msg || null); setTimeout(() => setFlash(null), 6000); load(); router.push({ pathname: "/restaurant-manage", params: { id: String(b.id) } } as any); }} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 16, gap: 12 },
  searchBox: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)", backgroundColor: Colors.cardBg, paddingHorizontal: 14, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14 },
  quickRow: { flexDirection: "row-reverse", gap: 10 },
  quickBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.primary + "33" },
  quickTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary, flexShrink: 1 },
  flash: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: Colors.primarySoft, borderRadius: 12, padding: 10 },
  flashTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#0B7A4E", textAlign: "right" },
  mineChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.primarySoft },
  mineChipTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primaryDeep },
  chips: { flexDirection: "row-reverse", gap: 8 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary },
  card: { backgroundColor: Colors.cardBg, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  cover: { height: 110 },
  openPill: { position: "absolute", top: 10, left: 10, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3 },
  openTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  cardBody: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12 },
  logoRing: { padding: 3, backgroundColor: Colors.cardBg, borderRadius: 20 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  modes: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.primaryDeep, textAlign: "right" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  emptyTxt: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", lineHeight: 21 },
  cta: { marginTop: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 11 },
  ctaTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
});
