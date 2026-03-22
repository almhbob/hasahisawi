import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, FlatList, Alert, Platform, ActivityIndicator,
  KeyboardAvoidingView, Pressable,
} from "react-native";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import AnimatedPress from "@/components/AnimatedPress";

// ─── Types ────────────────────────────────────────────────────────────────────
type EntityType = "institution" | "employee" | "service_seeker";

type RatedEntity = {
  id: number;
  type: EntityType;
  name: string;
  subtitle: string | null;
  category: string;
  phone: string | null;
  district: string | null;
  notes: string | null;
  is_verified: boolean;
  avg_rating: number;
  review_count: number;
};

type Review = {
  id: number;
  rating: number;
  comment: string | null;
  user_name: string | null;
  created_at: string;
};

// ─── Config ───────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<EntityType, { label: string; icon: string; color: string; emoji: string }> = {
  institution:    { label: "مؤسسة",         icon: "domain",           color: Colors.cyber,   emoji: "🏛️" },
  employee:       { label: "موظف",           icon: "account-tie",      color: Colors.primary, emoji: "👤" },
  service_seeker: { label: "مزود خدمة",     icon: "hammer-wrench",    color: Colors.accent,  emoji: "🔧" },
};

const TABS: { key: EntityType; label: string; sub: string }[] = [
  { key: "institution",    label: "المؤسسات",      sub: "مدارس · مستشفيات · جهات حكومية" },
  { key: "employee",       label: "الموظفون",      sub: "موظفو المؤسسات العامة"           },
  { key: "service_seeker", label: "مزودو الخدمة",  sub: "نجارون · كهربائيون · مقاولون"   },
];

const INST_CATEGORIES  = ["محاكم","صحة","تعليم","بريد وخدمات","بنوك","تجارة","ديوان حكومي","شرطة","أوقاف","أخرى"];
const EMP_CATEGORIES   = ["إدارة","طب","تعليم","أمن","مالية","قانون","هندسة","أخرى"];
const SERV_CATEGORIES  = ["بناء","كهرباء","سباكة","نجارة","سيارات","حدادة","دهان","تنظيف","حاسوب","أخرى"];

function categoryList(type: EntityType) {
  if (type === "institution") return INST_CATEGORIES;
  if (type === "employee")    return EMP_CATEGORIES;
  return SERV_CATEGORIES;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function apiBase() { return getApiUrl(); }

async function apiFetch(path: string, opts?: Parameters<typeof fetch>[1]) {
  const url = new URL(path, apiBase()).toString();
  const res = await fetch(url, opts);
  return res;
}

async function getDeviceId(): Promise<string> {
  let did = await AsyncStorage.getItem("device_id_v1");
  if (!did) {
    did = `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem("device_id_v1", did);
  }
  return did;
}

// ─── Star Row ─────────────────────────────────────────────────────────────────
function StarRow({ rating, size = 14, color = Colors.accent }: { rating: number; size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons
          key={s}
          name={s <= Math.round(rating) ? "star" : "star-outline"}
          size={size}
          color={s <= Math.round(rating) ? color : Colors.textMuted}
        />
      ))}
    </View>
  );
}

// ─── Interactive Stars ────────────────────────────────────────────────────────
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Pressable key={s} onPress={() => { onChange(s); if (Platform.OS !== "web") Haptics.selectionAsync(); }}>
          <Ionicons
            name={s <= value ? "star" : "star-outline"}
            size={40}
            color={s <= value ? Colors.accent : Colors.textMuted}
          />
        </Pressable>
      ))}
    </View>
  );
}

const STAR_LABELS = ["", "ضعيف جداً", "ضعيف", "مقبول", "جيد", "ممتاز"];

// ─── Rating Distribution Bar ──────────────────────────────────────────────────
function RatingBars({ reviews }: { reviews: Review[] }) {
  const total = reviews.length || 1;
  const counts = [5, 4, 3, 2, 1].map((s) => ({
    s, count: reviews.filter((r) => r.rating === s).length,
  }));
  return (
    <View style={{ gap: 5 }}>
      {counts.map(({ s, count }) => (
        <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, width: 14, textAlign: "right" }}>{s}</Text>
          <Ionicons name="star" size={11} color={Colors.accent} />
          <View style={{ flex: 1, height: 7, backgroundColor: Colors.cardBg, borderRadius: 4, overflow: "hidden" }}>
            <View style={{ width: `${(count / total) * 100}%`, height: "100%", backgroundColor: Colors.accent, borderRadius: 4 }} />
          </View>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, width: 22, textAlign: "left" }}>{count}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Entity Card ──────────────────────────────────────────────────────────────
function EntityCard({ entity, onPress, index }: { entity: RatedEntity; onPress: () => void; index: number }) {
  const cfg = TYPE_CONFIG[entity.type];
  const avg = parseFloat(String(entity.avg_rating));
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
      <AnimatedPress onPress={onPress}>
        <View style={[s.card, { borderColor: cfg.color + "28" }]}>
          <LinearGradient colors={[cfg.color + "0C", "transparent"]} style={StyleSheet.absoluteFill} />

          {/* Rank badge */}
          {index < 3 && entity.review_count > 0 && (
            <View style={[s.rankBadge, { backgroundColor: ["#FFD700", "#C0C0C0", "#CD7F32"][index] + "22", borderColor: ["#FFD700","#C0C0C0","#CD7F32"][index] + "55" }]}>
              <Text style={[s.rankBadgeText, { color: ["#FFD700","#C0C0C0","#CD7F32"][index] }]}>#{index + 1}</Text>
            </View>
          )}

          <View style={s.cardBody}>
            {/* Icon */}
            <View style={[s.cardIcon, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
              <MaterialCommunityIcons name={cfg.icon as any} size={26} color={cfg.color} />
            </View>

            {/* Info */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={s.cardName} numberOfLines={1}>{entity.name}</Text>
                {entity.is_verified && <Ionicons name="checkmark-circle" size={15} color={Colors.primary} />}
              </View>
              {entity.subtitle && (
                <Text style={s.cardSub} numberOfLines={1}>{entity.subtitle}</Text>
              )}
              <View style={s.cardMeta}>
                <View style={[s.catBadge, { backgroundColor: cfg.color + "18" }]}>
                  <Text style={[s.catBadgeText, { color: cfg.color }]}>{entity.category}</Text>
                </View>
                {entity.district && (
                  <View style={s.distRow}>
                    <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                    <Text style={s.distText}>{entity.district}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Rating */}
            <View style={s.cardRating}>
              <Text style={[s.cardAvg, { color: entity.review_count > 0 ? Colors.accent : Colors.textMuted }]}>
                {entity.review_count > 0 ? avg.toFixed(1) : "—"}
              </Text>
              <StarRow rating={avg} size={11} />
              <Text style={s.cardReviews}>{entity.review_count} تقييم</Text>
            </View>
          </View>
        </View>
      </AnimatedPress>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function RatingsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user, isGuest, token } = useAuth();

  const [activeTab, setActiveTab]       = useState<EntityType>("institution");
  const [entities, setEntities]         = useState<RatedEntity[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [catFilter, setCatFilter]       = useState("الكل");

  const [detailEntity, setDetailEntity] = useState<RatedEntity | null>(null);
  const [detailReviews, setDetailReviews] = useState<Review[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetail, setShowDetail]     = useState(false);

  const [showRate, setShowRate]         = useState(false);
  const [rateStars, setRateStars]       = useState(0);
  const [rateComment, setRateComment]   = useState("");
  const [rateSubmitting, setRateSubmitting] = useState(false);

  const [showAddEntity, setShowAddEntity] = useState(false);
  const [addForm, setAddForm]           = useState({ name: "", subtitle: "", category: "", phone: "", district: "", notes: "" });
  const [addSubmitting, setAddSubmitting] = useState(false);

  const fetchEntities = useCallback(async (type: EntityType, q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type });
      if (q) params.set("search", q);
      const res = await apiFetch(`/api/ratings/entities?${params}`);
      if (res.ok) setEntities(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchEntities(activeTab, search || undefined); }, [activeTab, fetchEntities]));

  useEffect(() => {
    const t = setTimeout(() => fetchEntities(activeTab, search || undefined), 320);
    return () => clearTimeout(t);
  }, [search, activeTab, fetchEntities]);

  const openDetail = async (entity: RatedEntity) => {
    setDetailEntity(entity);
    setShowDetail(true);
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/ratings/entities/${entity.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailEntity(data.entity);
        setDetailReviews(data.ratings);
      }
    } catch {}
    setDetailLoading(false);
  };

  const submitRating = async () => {
    if (!detailEntity) return;
    if (rateStars < 1) { Alert.alert("تنبيه", "يرجى اختيار عدد النجوم"); return; }
    setRateSubmitting(true);
    try {
      const deviceId = await getDeviceId();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await apiFetch(`/api/ratings/entities/${detailEntity.id}/rate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ rating: rateStars, comment: rateComment.trim() || null, device_id: deviceId }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ شكراً!", "تم إرسال تقييمك بنجاح");
        setShowRate(false);
        setRateStars(0);
        setRateComment("");
        await openDetail(detailEntity);
        await fetchEntities(activeTab, search || undefined);
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("خطأ", err.error || "حدث خطأ");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    setRateSubmitting(false);
  };

  const submitAddEntity = async () => {
    if (!addForm.name.trim() || !addForm.category) {
      Alert.alert("تنبيه", "الاسم والتصنيف مطلوبان"); return;
    }
    setAddSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await apiFetch(`/api/ratings/entities`, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: activeTab, ...addForm }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ تمت الإضافة", "تمت إضافة العنصر بنجاح");
        setShowAddEntity(false);
        setAddForm({ name: "", subtitle: "", category: "", phone: "", district: "", notes: "" });
        await fetchEntities(activeTab, search || undefined);
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("خطأ", err.error || "حدث خطأ");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    setAddSubmitting(false);
  };

  const currentTab     = TABS.find((t) => t.key === activeTab)!;
  const cfg            = TYPE_CONFIG[activeTab];
  const cats           = ["الكل", ...categoryList(activeTab)];
  const filtered       = catFilter === "الكل" ? entities : entities.filter((e) => e.category === catFilter);

  const avgScore = entities.length
    ? (entities.reduce((s, e) => s + parseFloat(String(e.avg_rating)), 0) / entities.length).toFixed(1)
    : "—";

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <LinearGradient colors={[Colors.cardBg, Colors.bg]} style={[s.header, { paddingTop: topPad + 12 }]}>
        <View style={s.headerRow}>
          <View style={[s.headerIcon, { backgroundColor: cfg.color + "20" }]}>
            <Ionicons name="star" size={24} color={cfg.color} />
          </View>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={s.headerTitle}>التقييمات</Text>
            <Text style={s.headerSub}>{currentTab.sub}</Text>
          </View>
          <AnimatedPress onPress={() => {
            if (isGuest) { Alert.alert("تسجيل مطلوب", "يجب إنشاء حساب لإضافة جهة جديدة."); return; }
            setShowAddEntity(true);
          }}>
            <View style={[s.addBtn, { borderColor: cfg.color + "60", backgroundColor: cfg.color + "14" }]}>
              <Ionicons name="add" size={22} color={cfg.color} />
            </View>
          </AnimatedPress>
        </View>

        {/* Quick stats */}
        <View style={s.statsRow}>
          {[
            { num: `${entities.length}`,           label: "إجمالي",    color: Colors.textSecondary },
            { num: `${entities.filter(e => e.review_count > 0).length}`, label: "تقييمات",  color: cfg.color },
            { num: avgScore,                        label: "متوسط",     color: Colors.accent },
            { num: `${entities.filter(e => parseFloat(String(e.avg_rating)) >= 4).length}`, label: "ممتاز",  color: Colors.primary },
          ].map((st, i) => (
            <View key={i} style={s.statItem}>
              <Text style={[s.statNum, { color: st.color }]}>{st.num}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Type tabs */}
        <View style={s.tabRow}>
          {TABS.map((tab) => {
            const tc = TYPE_CONFIG[tab.key];
            return (
              <TouchableOpacity
                key={tab.key}
                style={[s.tabBtn, activeTab === tab.key && { borderColor: tc.color, backgroundColor: tc.color + "18" }]}
                onPress={() => { setActiveTab(tab.key); setCatFilter("الكل"); setSearch(""); }}
              >
                <MaterialCommunityIcons name={tc.icon as any} size={14} color={activeTab === tab.key ? tc.color : Colors.textMuted} />
                <Text style={[s.tabBtnText, activeTab === tab.key && { color: tc.color }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      {/* ── Search + Filter ── */}
      <View style={s.filterSection}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={17} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder={`ابحث في ${currentTab.label}...`}
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
          {cats.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[s.catChip, catFilter === cat && { backgroundColor: cfg.color, borderColor: cfg.color }]}
              onPress={() => setCatFilter(cat)}
            >
              <Text style={[s.catChipText, catFilter === cat && { color: "#000" }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={cfg.color} size="large" />
          <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", marginTop: 10 }}>جاري التحميل…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <MaterialCommunityIcons name={cfg.icon as any} size={52} color={Colors.textMuted} />
          <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_500Medium", fontSize: 15 }}>لا توجد نتائج</Text>
          <TouchableOpacity onPress={() => {
            if (isGuest) { Alert.alert("تسجيل مطلوب", "يجب إنشاء حساب لإضافة جهة جديدة."); return; }
            setShowAddEntity(true);
          }} style={[s.emptyAddBtn, { borderColor: cfg.color }]}>
            <Ionicons name="add-circle-outline" size={18} color={cfg.color} />
            <Text style={[s.emptyAddText, { color: cfg.color }]}>أضف {currentTab.label.slice(0, -1)}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <EntityCard entity={item} index={index} onPress={() => openDetail(item)} />
          )}
        />
      )}

      {/* ════════════════════════════════════════
           DETAIL MODAL
      ════════════════════════════════════════ */}
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDetail(false)}>
        <View style={s.modalRoot}>
          <LinearGradient colors={[Colors.cardBg, Colors.bg]} style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetail(false)} style={s.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            {detailEntity && (
              <View style={{ alignItems: "center", paddingHorizontal: 20, paddingBottom: 20 }}>
                <View style={[s.detailIcon, { backgroundColor: TYPE_CONFIG[detailEntity.type].color + "20", borderColor: TYPE_CONFIG[detailEntity.type].color + "40" }]}>
                  <MaterialCommunityIcons name={TYPE_CONFIG[detailEntity.type].icon as any} size={36} color={TYPE_CONFIG[detailEntity.type].color} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                  <Text style={s.detailName}>{detailEntity.name}</Text>
                  {detailEntity.is_verified && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                </View>
                {detailEntity.subtitle && <Text style={s.detailSub}>{detailEntity.subtitle}</Text>}
                <View style={[s.catBadge, { backgroundColor: TYPE_CONFIG[detailEntity.type].color + "20", marginTop: 8 }]}>
                  <Text style={[s.catBadgeText, { color: TYPE_CONFIG[detailEntity.type].color }]}>{detailEntity.category}</Text>
                </View>

                <View style={s.detailRatingBlock}>
                  <Text style={s.detailAvg}>
                    {detailEntity.review_count > 0 ? parseFloat(String(detailEntity.avg_rating)).toFixed(1) : "—"}
                  </Text>
                  <StarRow rating={parseFloat(String(detailEntity.avg_rating))} size={22} />
                  <Text style={s.detailReviewCount}>{detailEntity.review_count} تقييم</Text>
                </View>

                {detailLoading ? null : <RatingBars reviews={detailReviews} />}
              </View>
            )}
          </LinearGradient>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
            {detailEntity?.district && (
              <View style={s.detailInfoRow}>
                <Ionicons name="location-outline" size={16} color={Colors.textMuted} />
                <Text style={s.detailInfoText}>{detailEntity.district}</Text>
              </View>
            )}
            {detailEntity?.phone && (
              <View style={s.detailInfoRow}>
                <Ionicons name="call-outline" size={16} color={Colors.textMuted} />
                <Text style={s.detailInfoText}>{detailEntity.phone}</Text>
              </View>
            )}
            {detailEntity?.notes && (
              <Text style={s.detailNotes}>{detailEntity.notes}</Text>
            )}

            {/* Reviews */}
            <Text style={s.reviewsTitle}>آراء المجتمع</Text>
            {detailLoading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : detailReviews.length === 0 ? (
              <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", textAlign: "center", marginVertical: 12 }}>
                لا توجد تقييمات بعد — كن أول من يقيّم!
              </Text>
            ) : (
              detailReviews.map((rv, i) => (
                <Animated.View key={rv.id} entering={FadeInDown.delay(i * 40).springify()} style={s.reviewCard}>
                  <LinearGradient colors={[Colors.cardBg, Colors.bgDeep]} style={StyleSheet.absoluteFill} />
                  <View style={s.reviewTop}>
                    <View style={s.reviewerIcon}>
                      <Ionicons name="person" size={16} color={Colors.textMuted} />
                    </View>
                    <Text style={s.reviewerName}>{rv.user_name || "مجتمعي"}</Text>
                    <View style={{ flex: 1 }} />
                    <StarRow rating={rv.rating} size={13} />
                  </View>
                  {rv.comment && <Text style={s.reviewComment}>{rv.comment}</Text>}
                  <Text style={s.reviewDate}>{new Date(rv.created_at).toLocaleDateString("ar-SD")}</Text>
                </Animated.View>
              ))
            )}
          </ScrollView>

          <View style={[s.detailFooter, { paddingBottom: insets.bottom + 12 }]}>
            <AnimatedPress style={{ flex: 1 }} onPress={() => {
              if (isGuest) { Alert.alert("تسجيل مطلوب", "يجب إنشاء حساب لتقييم الخدمات."); return; }
              setRateStars(0); setRateComment(""); setShowRate(true);
            }}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={s.rateBtn}>
                <Ionicons name="star-outline" size={18} color="#fff" />
                <Text style={s.rateBtnText}>قيّم الآن</Text>
              </LinearGradient>
            </AnimatedPress>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════
           RATE MODAL
      ════════════════════════════════════════ */}
      <Modal visible={showRate} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowRate(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.modalRoot}>
            <LinearGradient colors={[Colors.cardBg, Colors.bg]} style={{ paddingTop: 20, paddingBottom: 8 }}>
              <TouchableOpacity onPress={() => setShowRate(false)} style={s.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={[s.reviewsTitle, { textAlign: "center", fontSize: 20, marginTop: 8 }]}>تقييم {detailEntity?.name}</Text>
            </LinearGradient>

            <ScrollView contentContainerStyle={{ padding: 24, gap: 20, alignItems: "center" }}>
              <Animated.View entering={ZoomIn.springify()}>
                <StarPicker value={rateStars} onChange={setRateStars} />
              </Animated.View>

              {rateStars > 0 && (
                <Animated.Text entering={FadeIn.duration(300)} style={s.starLabel}>
                  {STAR_LABELS[rateStars]}
                </Animated.Text>
              )}

              <View style={[s.commentBox]}>
                <TextInput
                  style={s.commentInput}
                  placeholder="اكتب تعليقك هنا (اختياري)..."
                  placeholderTextColor={Colors.textMuted}
                  value={rateComment}
                  onChangeText={setRateComment}
                  multiline
                  numberOfLines={4}
                  textAlign="right"
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            <View style={[s.detailFooter, { paddingBottom: insets.bottom + 12 }]}>
              <AnimatedPress style={{ flex: 1 }} onPress={submitRating}>
                <LinearGradient
                  colors={rateStars > 0 ? [Colors.primary, Colors.primaryDim] : [Colors.cardBg, Colors.cardBg]}
                  style={s.rateBtn}
                >
                  {rateSubmitting
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="checkmark-circle" size={18} color={rateStars > 0 ? "#fff" : Colors.textMuted} />
                        <Text style={[s.rateBtnText, { color: rateStars > 0 ? "#fff" : Colors.textMuted }]}>إرسال التقييم</Text>
                      </>
                  }
                </LinearGradient>
              </AnimatedPress>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════
           ADD ENTITY MODAL
      ════════════════════════════════════════ */}
      <Modal visible={showAddEntity} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddEntity(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.modalRoot}>
            <LinearGradient colors={[Colors.cardBg, Colors.bg]} style={{ paddingTop: 20, paddingBottom: 8 }}>
              <TouchableOpacity onPress={() => setShowAddEntity(false)} style={s.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={[s.reviewsTitle, { textAlign: "center", fontSize: 20, marginTop: 8 }]}>
                إضافة {currentTab.label.slice(0, -1)} جديد
              </Text>
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", marginBottom: 8 }}>
                يُضاف للقائمة بعد المراجعة
              </Text>
            </LinearGradient>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 100 }}>
              {/* Type info */}
              <View style={[s.addTypeRow, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
                <MaterialCommunityIcons name={cfg.icon as any} size={20} color={cfg.color} />
                <Text style={[s.addTypeText, { color: cfg.color }]}>{currentTab.label}</Text>
              </View>

              {[
                { key: "name",     label: activeTab === "institution" ? "اسم المؤسسة" : activeTab === "employee" ? "اسم الموظف" : "اسم مزود الخدمة", required: true  },
                { key: "subtitle", label: activeTab === "employee" ? "المؤسسة التابع لها" : "وصف مختصر", required: false },
                { key: "phone",    label: "رقم الهاتف (اختياري)",   required: false },
                { key: "district", label: "الحي / المنطقة",          required: false },
                { key: "notes",    label: "ملاحظات إضافية",          required: false },
              ].map((f) => (
                <View key={f.key}>
                  <Text style={s.addLabel}>{f.label}{f.required && <Text style={{ color: Colors.danger }}> *</Text>}</Text>
                  <TextInput
                    style={s.addInput}
                    value={(addForm as any)[f.key]}
                    onChangeText={(v) => setAddForm((p) => ({ ...p, [f.key]: v }))}
                    placeholder={f.label}
                    placeholderTextColor={Colors.textMuted}
                    textAlign="right"
                  />
                </View>
              ))}

              {/* Category */}
              <Text style={s.addLabel}>التصنيف <Text style={{ color: Colors.danger }}>*</Text></Text>
              <View style={s.catsGrid}>
                {categoryList(activeTab).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.catChip, addForm.category === cat && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                    onPress={() => setAddForm((p) => ({ ...p, category: cat }))}
                  >
                    <Text style={[s.catChipText, addForm.category === cat && { color: "#000" }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={[s.detailFooter, { paddingBottom: insets.bottom + 12 }]}>
              <AnimatedPress style={{ flex: 1 }} onPress={submitAddEntity}>
                <LinearGradient colors={[cfg.color, cfg.color + "CC"]} style={s.rateBtn}>
                  {addSubmitting
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="add-circle" size={18} color="#fff" />
                        <Text style={s.rateBtnText}>إضافة</Text>
                      </>
                  }
                </LinearGradient>
              </AnimatedPress>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  header: { paddingHorizontal: 16, paddingBottom: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  headerIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  addBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  statsRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 14 },
  statItem: { alignItems: "center" },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 20 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  tabRow: { flexDirection: "row", gap: 8, paddingBottom: 12 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  tabBtnText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },

  filterSection: { backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary },

  catChip: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  catChipText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },

  card: { borderRadius: 16, borderWidth: 1, padding: 14, overflow: "hidden", backgroundColor: Colors.cardBg },
  rankBadge: { position: "absolute", top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  rankBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  cardBody: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  cardName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  cardSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2, textAlign: "right" },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" },
  catBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  catBadgeText: { fontFamily: "Cairo_500Medium", fontSize: 11 },
  distRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  distText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  cardRating: { alignItems: "center", gap: 3, minWidth: 56 },
  cardAvg: { fontFamily: "Cairo_700Bold", fontSize: 20 },
  cardReviews: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  emptyAddBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 8 },
  emptyAddText: { fontFamily: "Cairo_600SemiBold", fontSize: 14 },

  // Modal
  modalRoot: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { paddingHorizontal: 16 },
  closeBtn: { alignSelf: "flex-end", marginRight: 16, marginTop: 12, width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center" },

  detailIcon: { width: 70, height: 70, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 4 },
  detailName: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, textAlign: "center" },
  detailSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4, textAlign: "center" },
  detailRatingBlock: { alignItems: "center", marginVertical: 14, gap: 6 },
  detailAvg: { fontFamily: "Cairo_700Bold", fontSize: 42, color: Colors.accent, lineHeight: 50 },
  detailReviewCount: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },

  detailInfoRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, padding: 12, borderRadius: 12 },
  detailInfoText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  detailNotes: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },

  reviewsTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  reviewCard: { borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, padding: 14, overflow: "hidden", gap: 6 },
  reviewTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  reviewerIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center" },
  reviewerName: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  reviewComment: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, lineHeight: 21, textAlign: "right" },
  reviewDate: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "left" },

  detailFooter: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.cardBg },
  rateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16 },
  rateBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  starLabel: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.accent },
  commentBox: { width: "100%", borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg, overflow: "hidden" },
  commentInput: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, padding: 16, minHeight: 110 },

  addTypeRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  addTypeText: { fontFamily: "Cairo_600SemiBold", fontSize: 14 },
  addLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 6, textAlign: "right" },
  addInput: { backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 16, paddingVertical: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary },
  catsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
