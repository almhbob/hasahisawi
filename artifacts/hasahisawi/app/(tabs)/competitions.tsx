import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal, Platform,
  KeyboardAvoidingView, RefreshControl, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

// ── الألوان والثوابت ─────────────────────────────────────────────
const CC = "#7C3AED";
const CC2 = "#5B21B6";
const GOLD = "#F59E0B";
const SILVER = "#9CA3AF";
const BRONZE = "#D97706";

type Competition = {
  id: number;
  title: string;
  description: string;
  category: string;
  prize: string;
  deadline: string;
  status: "open" | "closed" | "upcoming";
  participants_count: number;
  created_by: string;
  image_url?: string;
  created_at: string;
};

type Submission = {
  id: number;
  competition_id: number;
  competition_title: string;
  user_name: string;
  content: string;
  score?: number;
  rank?: number;
  status: "pending" | "reviewed" | "winner";
  created_at: string;
};

const CATEGORIES = [
  { key: "all",        label: "الكل",         icon: "apps-outline",          color: Colors.primary },
  { key: "academic",   label: "أكاديمي",      icon: "school-outline",        color: "#3B82F6" },
  { key: "creative",   label: "إبداعي",       icon: "color-palette-outline", color: "#EC4899" },
  { key: "sports",     label: "رياضي",        icon: "football-outline",      color: "#10B981" },
  { key: "technology", label: "تقني",         icon: "hardware-chip-outline", color: "#6366F1" },
  { key: "cultural",   label: "ثقافي",        icon: "book-outline",          color: GOLD },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open:     { label: "مفتوح",  color: "#10B981" },
  closed:   { label: "منتهي", color: SILVER },
  upcoming: { label: "قادم",  color: GOLD },
};

// ── بطاقة مسابقة ────────────────────────────────────────────────
function CompCard({ item, onJoin, idx }: { item: Competition; onJoin: (c: Competition) => void; idx: number }) {
  const st = STATUS_LABELS[item.status] ?? STATUS_LABELS.open;
  const cat = CATEGORIES.find(c => c.key === item.category);
  const deadline = item.deadline ? new Date(item.deadline).toLocaleDateString("ar-SA") : "—";

  return (
    <Animated.View entering={FadeInDown.delay(idx * 60).springify()}>
      <TouchableOpacity
        style={[s.card, item.status === "closed" && { opacity: 0.65 }]}
        activeOpacity={0.88}
        onPress={() => onJoin(item)}
      >
        <LinearGradient colors={[CC + "14", CC + "05"]} style={s.cardInner}>
          {/* الرأس */}
          <View style={s.cardHead}>
            <View style={[s.catBadge, { backgroundColor: (cat?.color ?? CC) + "22" }]}>
              <Ionicons name={cat?.icon as any ?? "trophy-outline"} size={13} color={cat?.color ?? CC} />
              <Text style={[s.catText, { color: cat?.color ?? CC }]}>{cat?.label ?? item.category}</Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: st.color + "22" }]}>
              <View style={[s.statusDot, { backgroundColor: st.color }]} />
              <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>

          {/* العنوان */}
          <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>

          {/* الجائزة والموعد */}
          <View style={s.cardMeta}>
            <View style={s.metaItem}>
              <Ionicons name="trophy-outline" size={14} color={GOLD} />
              <Text style={[s.metaText, { color: GOLD }]}>{item.prize}</Text>
            </View>
            <View style={s.metaItem}>
              <Ionicons name="time-outline" size={14} color={SILVER} />
              <Text style={s.metaText}>{deadline}</Text>
            </View>
            <View style={s.metaItem}>
              <Ionicons name="people-outline" size={14} color={Colors.textMuted} />
              <Text style={s.metaText}>{item.participants_count}</Text>
            </View>
          </View>

          {item.status === "open" && (
            <TouchableOpacity onPress={() => onJoin(item)} style={s.joinBtn} activeOpacity={0.85}>
              <LinearGradient colors={[CC, CC2]} style={s.joinBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={s.joinBtnText}>شارك الآن</Text>
                <Ionicons name="arrow-back" size={16} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── النافذة المنبثقة للمشاركة ─────────────────────────────────
function JoinModal({ comp, token, onClose }: { comp: Competition; token: string | null; onClose: () => void }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!content.trim()) { Alert.alert("خطأ", "يرجى كتابة مشاركتك"); return; }
    if (!token) { Alert.alert("خطأ", "يجب تسجيل الدخول للمشاركة"); return; }
    setLoading(true);
    try {
      const r = await fetchWithTimeout(`${getApiUrl()}/api/competitions/${comp.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error(await r.text());
      Alert.alert("تم", "تم إرسال مشاركتك بنجاح");
      onClose();
    } catch (e: any) {
      Alert.alert("خطأ", e.message || "فشل الإرسال");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.modal}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>{comp.title}</Text>
          <Text style={s.modalSub}>الجائزة: {comp.prize}</Text>

          <Text style={s.inputLabel}>مشاركتك / عملك</Text>
          <TextInput
            style={s.textArea}
            multiline
            numberOfLines={6}
            placeholder="اكتب مشاركتك هنا…"
            placeholderTextColor={Colors.textMuted}
            value={content}
            onChangeText={setContent}
            textAlign="right"
          />

          <View style={s.modalBtns}>
            <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
              <Text style={s.cancelBtnText}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={submit} style={s.submitBtn} disabled={loading}>
              <LinearGradient colors={[CC, CC2]} style={s.submitBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>إرسال</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── لوحة المتصدرين ────────────────────────────────────────────
function LeaderboardTab({ token }: { token: string | null }) {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetchWithTimeout(`${getApiUrl()}/api/competitions/leaderboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setSubs)
      .catch(() => [])
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <ActivityIndicator color={CC} style={{ marginTop: 60 }} />;
  if (!subs.length) return (
    <View style={s.empty}>
      <MaterialCommunityIcons name="trophy-outline" size={54} color={CC + "50"} />
      <Text style={s.emptyText}>لا توجد نتائج بعد</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      {subs.map((sub, i) => {
        const rankColor = i === 0 ? GOLD : i === 1 ? SILVER : i === 2 ? BRONZE : Colors.textMuted;
        return (
          <Animated.View key={sub.id} entering={FadeInDown.delay(i * 50).springify()}>
            <LinearGradient colors={[rankColor + "18", rankColor + "06"]} style={[s.card, { borderColor: rankColor + "30", borderWidth: 1 }]}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
                <View style={[s.rankBadge, { backgroundColor: rankColor }]}>
                  <Text style={s.rankNum}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{sub.competition_title}</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" }}>
                    {sub.user_name}
                  </Text>
                </View>
                {sub.score != null && (
                  <View style={[s.scoreBadge, { backgroundColor: rankColor + "22" }]}>
                    <Text style={[s.scoreText, { color: rankColor }]}>{sub.score}</Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}

// ── مشاركاتي ─────────────────────────────────────────────────
function MySubmissionsTab({ token }: { token: string | null }) {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetchWithTimeout(`${getApiUrl()}/api/competitions/my-submissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setSubs)
      .catch(() => [])
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <ActivityIndicator color={CC} style={{ marginTop: 60 }} />;
  if (!token) return (
    <View style={s.empty}>
      <Ionicons name="lock-closed-outline" size={54} color={CC + "50"} />
      <Text style={s.emptyText}>سجّل دخولك للاطلاع على مشاركاتك</Text>
    </View>
  );
  if (!subs.length) return (
    <View style={s.empty}>
      <MaterialCommunityIcons name="file-outline" size={54} color={CC + "50"} />
      <Text style={s.emptyText}>لم تشارك في أي مسابقة بعد</Text>
    </View>
  );

  const statusColors: Record<string, string> = { pending: SILVER, reviewed: Colors.primary, winner: GOLD };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      {subs.map((sub, i) => (
        <Animated.View key={sub.id} entering={FadeInDown.delay(i * 50).springify()}>
          <LinearGradient colors={[CC + "14", CC + "05"]} style={s.card}>
            <Text style={s.cardTitle} numberOfLines={1}>{sub.competition_title}</Text>
            <Text style={s.cardDesc} numberOfLines={2}>{sub.content}</Text>
            <View style={s.cardMeta}>
              <View style={[s.statusBadge, { backgroundColor: (statusColors[sub.status] ?? SILVER) + "22" }]}>
                <Text style={[s.statusText, { color: statusColors[sub.status] ?? SILVER }]}>
                  {sub.status === "pending" ? "قيد المراجعة" : sub.status === "reviewed" ? "تمت المراجعة" : "فائز 🏆"}
                </Text>
              </View>
              {sub.score != null && (
                <View style={s.metaItem}>
                  <Ionicons name="star" size={13} color={GOLD} />
                  <Text style={[s.metaText, { color: GOLD }]}>{sub.score} نقطة</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

// ── الشاشة الرئيسية ──────────────────────────────────────────
type CompTab = "list" | "leaderboard" | "mine";

export default function CompetitionsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<CompTab>("list");
  const [selected, setSelected] = useState<Competition | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const r = await fetchWithTimeout(`${getApiUrl()}/api/competitions`);
      if (r.ok) setCompetitions(await r.json());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, []);

  const filtered = competitions.filter(c => {
    const matchesCat = catFilter === "all" || c.category === catFilter;
    const matchesSrch = !search.trim() || c.title.includes(search) || c.description.includes(search);
    return matchesCat && matchesSrch;
  });

  const open  = filtered.filter(c => c.status === "open").length;
  const total = competitions.length;

  return (
    <View style={[s.screen, { paddingTop: topPad }]}>
      {/* الرأس */}
      <LinearGradient colors={[CC + "CC", CC2 + "AA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
        <View style={s.headerRow}>
          <Ionicons name="trophy" size={28} color={GOLD} />
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={s.headerTitle}>المسابقات والتحديات</Text>
            <Text style={s.headerSub}>{open} مسابقة مفتوحة · {total} إجمالي</Text>
          </View>
        </View>
        {/* شريط البحث */}
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={17} color={Colors.textMuted} style={{ marginLeft: 8 }} />
          <TextInput
            style={s.searchInput}
            placeholder="ابحث عن مسابقة…"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>
      </LinearGradient>

      {/* تبويبات رئيسية */}
      <View style={s.tabs}>
        {([
          { key: "list",        label: "المسابقات", icon: "trophy-outline" },
          { key: "leaderboard", label: "المتصدرون",  icon: "podium-outline" },
          { key: "mine",        label: "مشاركاتي",   icon: "document-text-outline" },
        ] as { key: CompTab; label: string; icon: string }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => { setActiveTab(tab.key); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
          >
            <Ionicons name={tab.icon as any} size={15} color={activeTab === tab.key ? "#fff" : Colors.textMuted} />
            <Text style={[s.tabLabel, activeTab === tab.key && s.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* المحتوى */}
      {activeTab === "leaderboard" && <LeaderboardTab token={token ?? null} />}
      {activeTab === "mine"        && <MySubmissionsTab token={token ?? null} />}

      {activeTab === "list" && (
        <>
          {/* فلتر الفئات */}
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 10, flexDirection: "row-reverse" }}
          >
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.key}
                onPress={() => setCatFilter(cat.key)}
                style={[s.catChip, catFilter === cat.key && { backgroundColor: cat.color, borderColor: cat.color }]}
              >
                <Ionicons name={cat.icon as any} size={13} color={catFilter === cat.key ? "#fff" : cat.color} />
                <Text style={[s.catChipText, catFilter === cat.key && { color: "#fff" }]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <ActivityIndicator color={CC} style={{ marginTop: 60 }} />
          ) : filtered.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name="trophy-broken" size={64} color={CC + "40"} />
              <Text style={s.emptyText}>لا توجد مسابقات في هذه الفئة</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CC} />}
            >
              {filtered.map((item, idx) => (
                <CompCard key={item.id} item={item} onJoin={setSelected} idx={idx} />
              ))}
            </ScrollView>
          )}
        </>
      )}

      {selected && (
        <JoinModal comp={selected} token={token ?? null} onClose={() => setSelected(null)} />
      )}
    </View>
  );
}

// ── الأنماط ─────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },

  header: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12, gap: 12 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff", textAlign: "right" },
  headerSub:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)", textAlign: "right" },

  searchWrap: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14,
    paddingHorizontal: 14, height: 42, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: "#fff" },

  tabs: {
    flexDirection: "row-reverse", paddingHorizontal: 12, paddingTop: 10, gap: 8,
  },
  tab: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 8, borderRadius: 10,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  tabActive: { backgroundColor: CC, borderColor: CC },
  tabLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  tabLabelActive: { color: "#fff" },

  catChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.surface2,
  },
  catChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },

  card: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: CC + "25" },
  cardInner: { padding: 16, gap: 8 },

  cardHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },

  catBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  catText:  { fontFamily: "Cairo_600SemiBold", fontSize: 11 },

  statusBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusDot:   { width: 6, height: 6, borderRadius: 3 },
  statusText:  { fontFamily: "Cairo_600SemiBold", fontSize: 11 },

  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  cardDesc:  { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },

  cardMeta:  { flexDirection: "row-reverse", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 },
  metaItem:  { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  metaText:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },

  joinBtn:     { marginTop: 6 },
  joinBtnGrad: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 12 },
  joinBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  rankBadge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  rankNum:   { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  scoreBadge:{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  scoreText: { fontFamily: "Cairo_700Bold", fontSize: 14 },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: Colors.surface2, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, gap: 14, paddingBottom: 40,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderSubtle, alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  modalSub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: GOLD, textAlign: "right" },
  inputLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary, textAlign: "right" },
  textArea: {
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderSubtle,
    borderRadius: 14, padding: 14, fontFamily: "Cairo_400Regular", fontSize: 14,
    color: Colors.textPrimary, minHeight: 120, textAlignVertical: "top",
  },
  modalBtns:   { flexDirection: "row-reverse", gap: 10 },
  cancelBtn:   { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "center" },
  cancelBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted },
  submitBtn:   { flex: 2 },
  submitBtnGrad: { paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textMuted, textAlign: "center" },
});
