/**
 * ⛽ محطات الوقود — للمواطن: أي محطة يتوفر بها الوقود الآن، السعر، الزحام، والخدمات.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Image, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, openExternal } from "@/lib/xplatform";
import { neu, NeuInset, NeuRaised } from "@/components/auth/neu";
import {
  ago, effectiveFuel, FUEL_META, fuelApi, fuelsFor, KIND_META, QUEUE_LABEL, SERVICE_ICONS,
  type FuelKey, type FuelStation, type StationKind,
} from "@/lib/fuel-api";

const FUEL_KEYS: FuelKey[] = ["gasoline", "diesel", "gas"];
const ACCENT = "#F97316";

export default function FuelStationsScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [services, setServices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fuel, setFuel] = useState<FuelKey | "all">("all");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [kind, setKind] = useState<StationKind | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<FuelStation | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await fuelApi.list();
      setStations(d.stations || []);
      setServices(d.services || {});
    } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const t = q.trim();
    const list = stations.filter(s => {
      if (kind !== "all" && (s.kind || "station") !== kind) return false;
      if (fuel !== "all" && !fuelsFor(s.kind).includes(fuel)) return false;
      if (t && ![s.name, s.area, s.address, s.brand].some(v => String(v || "").includes(t))) return false;
      if (onlyAvailable) {
        const keys = fuel === "all" ? FUEL_KEYS : [fuel];
        if (!keys.some(k => effectiveFuel(s, k).available)) return false;
      }
      return true;
    });
    // المتوفر أولاً، ثم الأحدث تحديثاً
    const score = (s: FuelStation) => (fuel === "all" ? FUEL_KEYS : [fuel]).some(k => effectiveFuel(s, k).available) ? 1 : 0;
    return list.sort((a, b) => score(b) - score(a) || +new Date(b.updated_at) - +new Date(a.updated_at));
  }, [stations, q, fuel, onlyAvailable, kind]);

  const availableCount = (k: FuelKey) => stations.filter(s => effectiveFuel(s, k).available).length;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ACCENT} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* الرأس */}
        <LinearGradient colors={["#F97316", "#EA580C", "#9A3412"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={st.hero}>
          <View style={st.heroTop}>
            <TouchableOpacity onPress={() => router.back()} style={st.heroBtn} accessibilityLabel="رجوع">
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/fuel-station-portal" as any)} style={st.heroPill} accessibilityLabel="لوحة المحطة">
              <Ionicons name="business" size={14} color="#fff" />
              <Text style={st.heroPillText}>لأصحاب المحطات</Text>
            </TouchableOpacity>
          </View>
          <Text style={st.heroTitle}>محطات الوقود ومحلات الغاز</Text>
          <Text style={st.heroSub}>أين يتوفر الوقود والغاز الآن؟ الأسعار والزحام وخدمات السائقين</Text>
          <View style={st.heroStats}>
            {FUEL_KEYS.map(k => (
              <View key={k} style={st.heroStat}>
                <Text style={st.heroStatNum}>{availableCount(k)}</Text>
                <Text style={st.heroStatLabel}>{FUEL_META[k].label} متوفر</Text>
              </View>
            ))}
          </View>
          <View pointerEvents="none" style={st.heroCircle} />
        </LinearGradient>

        <View style={{ paddingHorizontal: 16, gap: 14, marginTop: -22 }}>
          <NeuRaised radius={18} depth={8} style={{ padding: 6 }}>
            <View style={st.searchRow}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput value={q} onChangeText={setQ} placeholder="ابحث باسم المحطة أو الحي" placeholderTextColor={Colors.textMuted} style={st.searchInput} />
              {!!q && <Ionicons name="close-circle" size={18} color={Colors.textMuted} onPress={() => setQ("")} />}
            </View>
          </NeuRaised>

          {/* نوع النشاط */}
          <View style={st.kindRow}>
            {(["all", "station", "gas_shop"] as const).map(k => {
              const on = kind === k;
              const label = k === "all" ? "الكل" : k === "station" ? "المحطات" : "محلات الغاز";
              const count = k === "all" ? stations.length : stations.filter(s => (s.kind || "station") === k).length;
              return (
                <TouchableOpacity key={k} onPress={() => { setKind(k); if (k === "gas_shop") setFuel("all"); }} style={[st.kindChip, on && { backgroundColor: ACCENT, borderColor: ACCENT }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <Ionicons name={(k === "all" ? "apps" : KIND_META[k].icon) as any} size={14} color={on ? "#fff" : ACCENT} />
                  <Text style={[st.kindText, on && { color: "#fff" }]}>{label} · {count}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* فلاتر الوقود */}
          <View style={st.fuelRow}>
            {(["all", ...FUEL_KEYS] as const).map(k => {
              const on = fuel === k;
              const meta = k === "all" ? { label: "الكل", icon: "apps", color: ACCENT } : FUEL_META[k];
              return (
                <Pressable key={k} onPress={() => setFuel(k)} style={{ flex: 1 }} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  {on ? (
                    <NeuInset radius={14} tint={meta.color} style={st.fuelChip}>
                      <Ionicons name={meta.icon as any} size={17} color={meta.color} />
                      <Text style={[st.fuelChipText, { color: meta.color }]}>{meta.label}</Text>
                    </NeuInset>
                  ) : (
                    <NeuRaised radius={14} depth={4} style={st.fuelChip}>
                      <Ionicons name={meta.icon as any} size={17} color={Colors.textMuted} />
                      <Text style={st.fuelChipText}>{meta.label}</Text>
                    </NeuRaised>
                  )}
                </Pressable>
              );
            })}
          </View>

          <TouchableOpacity onPress={() => setOnlyAvailable(v => !v)} style={st.toggleRow} activeOpacity={0.8}>
            <View style={[st.check, onlyAvailable && { backgroundColor: "#10B981", borderColor: "#10B981" }]}>
              {onlyAvailable && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={st.toggleText}>المتوفر به الوقود الآن فقط</Text>
          </TouchableOpacity>

          {loading ? <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} /> : error ? (
            <View style={st.empty}>
              <Ionicons name="cloud-offline-outline" size={42} color={Colors.textMuted} />
              <Text style={st.emptyText}>{error}</Text>
              <TouchableOpacity onPress={load}><Text style={st.link}>إعادة المحاولة</Text></TouchableOpacity>
            </View>
          ) : shown.length === 0 ? (
            <View style={st.empty}>
              <Ionicons name="speedometer-outline" size={46} color={Colors.textMuted} />
              <Text style={st.emptyText}>{stations.length ? "لا توجد محطة مطابقة الآن" : "لم تُسجَّل محطات بعد"}</Text>
              <TouchableOpacity onPress={() => router.push("/fuel-station-portal" as any)}><Text style={st.link}>هل تملك محطة؟ سجّلها مجاناً</Text></TouchableOpacity>
            </View>
          ) : shown.map((s, i) => (
            <Animated.View key={s.id} entering={FadeInDown.delay(Math.min(i, 8) * 45)}>
              <StationCard s={s} services={services} onPress={() => setOpen(s)} />
            </Animated.View>
          ))}
        </View>
      </ScrollView>

      <StationSheet station={open} services={services} onClose={() => setOpen(null)} token={token} loggedIn={!!user && !(user as any).isGuest} onReported={load} />
    </View>
  );
}

function Logo({ s, size = 54 }: { s: FuelStation; size?: number }) {
  return s.logo_url ? (
    <Image source={{ uri: s.logo_url }} style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: "#fff" }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: ACCENT + "18", alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={(s.kind === "gas_shop" ? "flame" : "speedometer") as any} size={size * 0.5} color={ACCENT} />
    </View>
  );
}

function FuelPill({ s, k }: { s: FuelStation; k: FuelKey }) {
  const e = effectiveFuel(s, k);
  const meta = FUEL_META[k];
  const color = e.available === true ? "#10B981" : e.available === false ? "#EF4444" : Colors.textMuted;
  return (
    <View style={[st.pill, { borderColor: color + "55", backgroundColor: color + "12" }]}>
      <View style={[st.pillDot, { backgroundColor: color }]} />
      <Text style={[st.pillLabel, { color }]}>{meta.label}</Text>
      {e.available && e.price ? <Text style={st.pillPrice}>{Number(e.price).toLocaleString("en")}</Text> : null}
    </View>
  );
}

function StationCard({ s, services, onPress }: { s: FuelStation; services: Record<string, string>; onPress: () => void }) {
  const last = s.fuels.reduce((m, f) => Math.max(m, +new Date(f.updated_at)), 0);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={s.name}>
      <NeuRaised radius={22} depth={8} style={st.card}>
        <View style={st.cardTop}>
          <Logo s={s} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={st.name} numberOfLines={1}>{s.name}</Text>
            <View style={st.metaRow}>
              <Ionicons name="location" size={12} color={Colors.textMuted} />
              <Text style={st.meta} numberOfLines={1}>{s.area || s.address || "الحصاحيصا"}</Text>
              {s.is_24h && <View style={st.tag24}><Text style={st.tag24Text}>24 ساعة</Text></View>}
            </View>
          </View>
          <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
        </View>
        <View style={st.pillsRow}>
          {s.kind === "gas_shop" ? <View style={st.kindTag}><Ionicons name="flame" size={11} color="#C2410C" /><Text style={st.kindTagText}>محل غاز</Text></View> : null}
          {fuelsFor(s.kind).map(k => <FuelPill key={k} s={s} k={k} />)}
        </View>
        <View style={st.cardFoot}>
          <View style={st.svcRow}>
            {s.services.slice(0, 6).map(k => (
              <View key={k} style={st.svcIcon} accessibilityLabel={services[k]}>
                <Ionicons name={(SERVICE_ICONS[k] || "ellipse") as any} size={13} color={Colors.textSecondary} />
              </View>
            ))}
            {s.services.length > 6 && <Text style={st.meta}>+{s.services.length - 6}</Text>}
          </View>
          <Text style={st.updated}>{last ? `حُدّث ${ago(new Date(last).toISOString())}` : ""}</Text>
        </View>
      </NeuRaised>
    </Pressable>
  );
}

function StationSheet({ station: s, services, onClose, token, loggedIn, onReported }: {
  station: FuelStation | null; services: Record<string, string>; onClose: () => void; token: string | null; loggedIn: boolean; onReported: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<string | null>(null);
  if (!s) return null;
  const tel = (p?: string | null) => p && openExternal(`tel:${p}`).catch(() => {});
  const wa = (p?: string | null) => {
    if (!p) return;
    const d = p.replace(/\D/g, "");
    openExternal(`https://wa.me/${d.startsWith("0") ? "249" + d.slice(1) : d}`).catch(() => {});
  };
  const map = () => {
    const url = s.lat && s.lng
      ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.area || ""} الحصاحيصا`)}`;
    openExternal(url).catch(() => {});
  };
  const report = async (k: FuelKey, available: boolean) => {
    if (!loggedIn || !token) { notify("سجّل الدخول", "يلزم حساب للإبلاغ عن حالة الوقود."); return; }
    setBusy(k + available);
    try { const r = await fuelApi.report(token, s.id, k, available); notify("شكراً لك", r.message); onReported(); }
    catch (e: any) { notify("تنبيه", e?.message || "تعذّر الإبلاغ"); }
    setBusy(null);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={st.grabber} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {s.cover_url ? <Image source={{ uri: s.cover_url }} style={st.cover} /> : null}
            <View style={st.cardTop}>
              <Logo s={s} size={64} />
              <View style={{ flex: 1 }}>
                <Text style={[st.name, { fontSize: 19 }]}>{s.name}</Text>
                {!!s.brand && <Text style={st.meta}>{s.brand}</Text>}
                <Text style={st.meta}>{[s.area, s.address].filter(Boolean).join(" · ") || "الحصاحيصا"}</Text>
              </View>
            </View>

            <View style={st.actions}>
              {!!s.phone && <Action icon="call" label="اتصال" color="#10B981" onPress={() => tel(s.phone)} />}
              {!!(s.whatsapp || s.phone) && <Action icon="logo-whatsapp" label="واتساب" color="#16A34A" onPress={() => wa(s.whatsapp || s.phone)} />}
              <Action icon="navigate" label="الاتجاهات" color="#0EA5E9" onPress={map} />
            </View>

            <Text style={st.section}>حالة الوقود</Text>
            {fuelsFor(s.kind).map(k => {
              const e = effectiveFuel(s, k);
              const meta = FUEL_META[k];
              const color = e.available === true ? "#10B981" : e.available === false ? "#EF4444" : Colors.textMuted;
              const q = e.queue ? QUEUE_LABEL[e.queue] : null;
              return (
                <NeuInset key={k} radius={16} style={st.fuelLine}>
                  <View style={[st.fuelIcon, { backgroundColor: meta.color + "1C" }]}>
                    <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.fuelName}>{meta.label}</Text>
                    <Text style={[st.fuelStatus, { color }]}>
                      {e.available === true ? "متوفر" : e.available === false ? "غير متوفر" : "لا توجد معلومة"}
                      {e.at ? ` · ${e.source === "report" ? "بلاغ مواطن" : "المحطة"} ${ago(e.at)}` : ""}
                    </Text>
                    {e.available && q && e.queue !== "none" ? <Text style={[st.queue, { color: q.color }]}>{q.label}</Text> : null}
                  </View>
                  {e.price ? (
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={st.price}>{Number(e.price).toLocaleString("en")}</Text>
                      <Text style={st.priceUnit}>جنيه / {meta.unit}</Text>
                    </View>
                  ) : null}
                </NeuInset>
              );
            })}

            <Text style={st.section}>ساعد السائقين: هل الوقود متوفر الآن؟</Text>
            <View style={{ gap: 8 }}>
              {fuelsFor(s.kind).map(k => (
                <View key={k} style={st.reportRow}>
                  <Text style={st.reportLabel}>{FUEL_META[k].label}</Text>
                  <TouchableOpacity disabled={!!busy} onPress={() => report(k, true)} style={[st.reportBtn, { borderColor: "#10B98155" }]}>
                    {busy === k + true ? <ActivityIndicator size="small" color="#10B981" /> : <Text style={[st.reportBtnText, { color: "#047857" }]}>متوفر</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity disabled={!!busy} onPress={() => report(k, false)} style={[st.reportBtn, { borderColor: "#EF444455" }]}>
                    {busy === k + false ? <ActivityIndicator size="small" color="#EF4444" /> : <Text style={[st.reportBtnText, { color: "#B91C1C" }]}>نفد</Text>}
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {s.services.length > 0 && (
              <>
                <Text style={st.section}>الخدمات</Text>
                <View style={st.svcGrid}>
                  {s.services.map(k => (
                    <NeuRaised key={k} radius={14} depth={4} style={st.svcCard}>
                      <Ionicons name={(SERVICE_ICONS[k] || "ellipse") as any} size={18} color={ACCENT} />
                      <Text style={st.svcText}>{services[k] || k}</Text>
                    </NeuRaised>
                  ))}
                </View>
              </>
            )}

            <View style={st.infoRow}>
              <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
              <Text style={st.infoText}>{s.is_24h ? "مفتوحة 24 ساعة" : s.hours || "مواعيد العمل غير محددة"}</Text>
            </View>
            {!!s.notes && <Text style={st.notes}>{s.notes}</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Action({ icon, label, color, onPress }: { icon: any; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={label}>
      <NeuRaised radius={16} depth={5} style={st.action}>
        <Ionicons name={icon} size={20} color={color} />
        <Text style={st.actionText}>{label}</Text>
      </NeuRaised>
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base },
  hero: { margin: 12, borderRadius: 28, padding: 18, paddingBottom: 38, overflow: "hidden" },
  heroTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  heroBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  heroPill: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.18)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  heroPillText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 26, color: "#fff", textAlign: "right" },
  heroSub: { fontFamily: "Cairo_500Medium", fontSize: 13, color: "rgba(255,255,255,0.88)", textAlign: "right" },
  heroStats: { flexDirection: "row-reverse", gap: 8, marginTop: 14 },
  heroStat: { flex: 1, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 14, paddingVertical: 8, alignItems: "center" },
  heroStatNum: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff" },
  heroStatLabel: { fontFamily: "Cairo_500Medium", fontSize: 11, color: "rgba(255,255,255,0.9)" },
  heroCircle: { position: "absolute", width: 200, height: 200, borderRadius: 100, left: -60, top: -70, backgroundColor: "rgba(255,255,255,0.08)" },

  searchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  searchInput: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  fuelRow: { flexDirection: "row-reverse", gap: 8 },
  kindRow: { flexDirection: "row-reverse", gap: 8 },
  kindChip: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 14, borderWidth: 1.2, borderColor: ACCENT + "50", backgroundColor: Colors.cardBg },
  kindText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: ACCENT },
  kindTag: { flexDirection: "row-reverse", alignItems: "center", gap: 3, backgroundColor: "#F9731618", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  kindTagText: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: "#C2410C" },
  fuelChip: { alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 9 },
  fuelChipText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  toggleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.divider, alignItems: "center", justifyContent: "center" },
  toggleText: { fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textSecondary },

  card: { padding: 14, gap: 12 },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  tag24: { backgroundColor: "#10B98118", borderRadius: 8, paddingHorizontal: 6, marginRight: 4 },
  tag24Text: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: "#047857" },
  pillsRow: { flexDirection: "row-reverse", gap: 6, flexWrap: "wrap" },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillLabel: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  pillPrice: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textSecondary },
  cardFoot: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  svcRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  svcIcon: { width: 24, height: 24, borderRadius: 8, backgroundColor: Colors.textMuted + "14", alignItems: "center", justifyContent: "center" },
  updated: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted },

  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: ACCENT },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { maxHeight: "90%", backgroundColor: neu.base, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10, width: "100%", maxWidth: 620, alignSelf: "center" },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, marginBottom: 12 },
  cover: { width: "100%", height: 140, borderRadius: 18 },
  actions: { flexDirection: "row-reverse", gap: 10 },
  action: { alignItems: "center", gap: 2, paddingVertical: 10 },
  actionText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textPrimary },
  section: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", marginTop: 4 },
  fuelLine: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12 },
  fuelIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  fuelName: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  fuelStatus: { fontFamily: "Cairo_600SemiBold", fontSize: 12, textAlign: "right" },
  queue: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, textAlign: "right" },
  price: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  priceUnit: { fontFamily: "Cairo_400Regular", fontSize: 10.5, color: Colors.textMuted },
  reportRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  reportLabel: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  reportBtn: { minWidth: 72, alignItems: "center", paddingVertical: 7, borderRadius: 12, borderWidth: 1.2 },
  reportBtnText: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
  svcGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  svcCard: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  svcText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textPrimary },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  infoText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  notes: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 21 },
});
