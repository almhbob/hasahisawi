import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ScrollView, Pressable, Alert, Platform, Linking,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { getApiUrl } from "@/lib/query-client";
import AnimatedPress from "@/components/AnimatedPress";

// ─── Types ─────────────────────────────────────────────────────

type CatKey = "wafid" | "foreign" | "displaced" | "expat";

type Community = {
  id: number;
  name: string;
  category: CatKey;
  origin?: string;
  description?: string;
  representative_name?: string;
  contact_phone?: string;
  members_count: number;
  neighborhood?: string;
  services?: string;
  meeting_schedule?: string;
  status: string;
  created_at: string;
};

// ─── Category Config ────────────────────────────────────────────

const CATEGORIES: Record<CatKey, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  wafid:      { label: "وافد سوداني",    icon: "people",             color: Colors.primary, bg: Colors.primary + "18" },
  foreign:    { label: "جالية أجنبية",   icon: "earth",              color: Colors.cyber,   bg: Colors.cyber   + "18" },
  displaced:  { label: "نازحون ولاجئون", icon: "home",               color: Colors.accent,  bg: Colors.accent  + "18" },
  expat:      { label: "مغتربون",        icon: "airplane",           color: "#9B59B6",      bg: "#9B59B618"           },
};

type FilterKey = "all" | CatKey;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",      label: "الكل"            },
  { key: "wafid",    label: "وافدون سودانيون" },
  { key: "foreign",  label: "جاليات أجنبية"   },
  { key: "displaced",label: "نازحون"           },
  { key: "expat",    label: "مغتربون"          },
];

// ─── Helpers ────────────────────────────────────────────────────

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}ألف`;
  return String(n);
}

// ─── Community Card ─────────────────────────────────────────────

function CommunityCard({ c, index, onPress }: { c: Community; index: number; onPress: () => void }) {
  const meta = CATEGORIES[c.category] ?? CATEGORIES.wafid;
  return (
    <Animated.View entering={FadeInDown.delay(index * 65).springify().damping(18)}>
      <TouchableOpacity style={[styles.card, { borderRightColor: meta.color, borderRightWidth: 4 }]} onPress={onPress} activeOpacity={0.85}>
        {/* Top row */}
        <View style={styles.cardTop}>
          <View style={[styles.cardIcon, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={22} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{c.name}</Text>
            {c.origin ? <Text style={styles.cardOrigin}>{c.origin}</Text> : null}
          </View>
          <View style={[styles.catBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.catBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        {/* Description */}
        {c.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{c.description}</Text>
        ) : null}

        {/* Services */}
        {c.services ? (
          <View style={styles.servicesRow}>
            <Ionicons name="checkmark-circle" size={12} color={meta.color} />
            <Text style={styles.servicesText} numberOfLines={1}>{c.services}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.cardFooter}>
          {c.neighborhood ? (
            <View style={styles.metaChip}>
              <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.metaChipText}>{c.neighborhood}</Text>
            </View>
          ) : null}
          {c.members_count > 0 ? (
            <View style={[styles.metaChip, { backgroundColor: meta.bg }]}>
              <Ionicons name="people-outline" size={11} color={meta.color} />
              <Text style={[styles.metaChipText, { color: meta.color }]}>{formatCount(c.members_count)} عضو</Text>
            </View>
          ) : null}
          {c.contact_phone ? (
            <TouchableOpacity
              style={[styles.callBtn, { backgroundColor: meta.color }]}
              onPress={() => Linking.openURL(`tel:${c.contact_phone}`)}
            >
              <Ionicons name="call" size={12} color="#fff" />
              <Text style={styles.callBtnText}>تواصل</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Detail Modal ────────────────────────────────────────────────

function DetailModal({ c, onClose }: { c: Community; onClose: () => void }) {
  const { isRTL } = useLang();
  const meta = CATEGORIES[c.category] ?? CATEGORIES.wafid;
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.detailSheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={[styles.detailHeader, { borderRightColor: meta.color, borderRightWidth: 4 }]}>
            <View style={[styles.detailIcon, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon} size={28} color={meta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailName}>{c.name}</Text>
              {c.origin ? <Text style={styles.detailOrigin}>{c.origin}</Text> : null}
              <View style={[styles.catBadge, { backgroundColor: meta.bg, alignSelf: "flex-end", marginTop: 4 }]}>
                <Text style={[styles.catBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 12 }}>
            {c.description ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>نبذة عن الجالية</Text>
                <Text style={styles.detailSectionText}>{c.description}</Text>
              </View>
            ) : null}

            {[
              { icon: "person-outline" as const, label: "الممثل المسؤول", value: c.representative_name },
              { icon: "call-outline"   as const, label: "رقم التواصل",    value: c.contact_phone      },
              { icon: "location-outline" as const, label: "الحي / المنطقة", value: c.neighborhood     },
              { icon: "time-outline"   as const, label: "مواعيد التجمع",  value: c.meeting_schedule   },
            ].filter(f => f.value).map(f => (
              <View key={f.label} style={styles.detailRow}>
                <Ionicons name={f.icon} size={16} color={meta.color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailRowLabel}>{f.label}</Text>
                  <Text style={styles.detailRowValue}>{f.value}</Text>
                </View>
              </View>
            ))}

            {c.members_count > 0 && (
              <View style={[styles.membersCard, { backgroundColor: meta.bg }]}>
                <Ionicons name="people" size={22} color={meta.color} />
                <Text style={[styles.membersCount, { color: meta.color }]}>{c.members_count.toLocaleString()}</Text>
                <Text style={[styles.membersLabel, { color: meta.color }]}>عضو مسجّل</Text>
              </View>
            )}

            {c.services ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>الخدمات المقدَّمة</Text>
                {c.services.split("·").map((s, i) => s.trim() ? (
                  <View key={i} style={styles.serviceItem}>
                    <Ionicons name="checkmark-circle" size={14} color={meta.color} />
                    <Text style={styles.serviceItemText}>{s.trim()}</Text>
                  </View>
                ) : null)}
              </View>
            ) : null}

            {c.contact_phone ? (
              <TouchableOpacity
                style={[styles.detailCallBtn, { backgroundColor: meta.color }]}
                onPress={() => Linking.openURL(`tel:${c.contact_phone}`)}
              >
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={styles.detailCallBtnText}>اتصل بالممثل المسؤول</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>إغلاق</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Register Modal ──────────────────────────────────────────────

function RegisterModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { isRTL } = useLang();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    name: "", category: "wafid" as CatKey, origin: "", description: "",
    representative_name: "", contact_phone: "", members_count: "",
    neighborhood: "", services: "", meeting_schedule: "",
  });
  const [sending, setSending] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSend = async () => {
    if (!form.name.trim() || !form.contact_phone.trim()) {
      Alert.alert("مطلوب", "اسم الجالية ورقم التواصل إلزاميان");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/communities/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          members_count: parseInt(form.members_count) || 0,
        }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose(); onSuccess();
      } else {
        const err = await res.json();
        Alert.alert("خطأ", err.error || "حاول مرة أخرى");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال"); }
    finally { setSending(false); }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.regSheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.regHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.regTitle}>تسجيل جالية</Text>
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>{step}/2</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.regForm}>
            {step === 1 ? (
              <>
                <Text style={styles.formSectionTitle}>معلومات الجالية</Text>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>اسم الجالية *</Text>
                  <TextInput style={styles.formInput} value={form.name} onChangeText={set("name")}
                    placeholder="مثال: جالية الإثيوبيين" placeholderTextColor={Colors.textMuted} textAlign="right" />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>نوع الجالية</Text>
                  <View style={styles.catGrid}>
                    {(Object.entries(CATEGORIES) as [CatKey, typeof CATEGORIES[CatKey]][]).map(([k, m]) => (
                      <TouchableOpacity
                        key={k}
                        style={[styles.catBtn, form.category === k && { backgroundColor: m.color, borderColor: m.color }]}
                        onPress={() => setForm(f => ({ ...f, category: k }))}
                      >
                        <Ionicons name={m.icon} size={13} color={form.category === k ? "#fff" : Colors.textSecondary} />
                        <Text style={[styles.catBtnText, form.category === k && { color: "#fff" }]}>{m.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>منطقة الأصل</Text>
                  <TextInput style={styles.formInput} value={form.origin} onChangeText={set("origin")}
                    placeholder="ولاية أو دولة المنشأ" placeholderTextColor={Colors.textMuted} textAlign="right" />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>نبذة عن الجالية</Text>
                  <TextInput style={[styles.formInput, styles.formTextArea]} value={form.description} onChangeText={set("description")}
                    placeholder="وصف مختصر عن الجالية وظروفها..." placeholderTextColor={Colors.textMuted}
                    multiline textAlign="right" textAlignVertical="top" />
                </View>

                <TouchableOpacity
                  style={styles.nextBtn}
                  onPress={() => {
                    if (!form.name.trim()) { Alert.alert("مطلوب", "أدخل اسم الجالية"); return; }
                    setStep(2);
                  }}
                >
                  <Text style={styles.nextBtnText}>التالي</Text>
                  <Ionicons name="chevron-back" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.formSectionTitle}>معلومات التواصل والخدمات</Text>

                {[
                  { label: "اسم الممثل المسؤول", key: "representative_name" as const, placeholder: "اسم الشخص المسؤول" },
                  { label: "رقم التواصل *", key: "contact_phone" as const, placeholder: "+249...", numeric: true },
                  { label: "الحي / المنطقة", key: "neighborhood" as const, placeholder: "اسم الحي أو المنطقة" },
                  { label: "عدد الأعضاء التقريبي", key: "members_count" as const, placeholder: "مثال: 150", numeric: true },
                  { label: "مواعيد التجمع", key: "meeting_schedule" as const, placeholder: "مثال: كل جمعة الساعة 4م" },
                ].map(f => (
                  <View key={f.key} style={styles.formField}>
                    <Text style={styles.formLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={form[f.key]}
                      onChangeText={set(f.key)}
                      placeholder={f.placeholder}
                      placeholderTextColor={Colors.textMuted}
                      keyboardType={(f as any).numeric ? "phone-pad" : "default"}
                      textAlign="right"
                    />
                  </View>
                ))}

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>الخدمات المقدَّمة</Text>
                  <TextInput style={[styles.formInput, styles.formTextArea]} value={form.services} onChangeText={set("services")}
                    placeholder="مثال: دروس لغة · مساعدات · خدمات صحية" placeholderTextColor={Colors.textMuted}
                    multiline textAlign="right" textAlignVertical="top" />
                </View>

                <View style={styles.regBtns}>
                  <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                    <Text style={styles.backBtnText}>رجوع</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, { opacity: sending ? 0.7 : 1 }]}
                    onPress={handleSend} disabled={sending}
                  >
                    <Ionicons name="send" size={15} color="#fff" />
                    <Text style={styles.submitBtnText}>{sending ? "جاري الإرسال..." : "إرسال الطلب"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Stats Bar ───────────────────────────────────────────────────

function StatsBar({ communities }: { communities: Community[] }) {
  const total = communities.length;
  const members = communities.reduce((s, c) => s + (c.members_count || 0), 0);
  const foreign = communities.filter(c => c.category === "foreign").length;
  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.statsBar}>
      {[
        { label: "جالية مسجّلة", value: total, icon: "people" as const, color: Colors.primary },
        { label: "إجمالي الأعضاء", value: members.toLocaleString(), icon: "person" as const, color: Colors.cyber },
        { label: "جالية أجنبية", value: foreign, icon: "earth" as const, color: Colors.accent },
      ].map((s, i) => (
        <View key={i} style={styles.statItem}>
          <Ionicons name={s.icon} size={16} color={s.color} />
          <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
          <Text style={styles.statLabel}>{s.label}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────

export default function CommunitiesScreen() {
  const { isRTL } = useLang();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Community | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  const loadCommunities = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("category", filter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${getApiUrl()}/api/communities?${params}`);
      if (res.ok) setCommunities(await res.json());
    } catch {}
    finally { setLoading(false); }
  }, [filter, search]);

  useEffect(() => { loadCommunities(); }, [loadCommunities]);
  useFocusEffect(useCallback(() => { loadCommunities(); }, [loadCommunities]));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14 }]}>
        <View style={[styles.headerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={{ flex: 1, alignItems: isRTL ? "flex-end" : "flex-start" }}>
            <Text style={styles.headerTitle}>الجاليات بالحصاحيصا</Text>
            <Text style={styles.headerSub}>المجتمعات المقيمة بالمنطقة وخدماتها</Text>
          </View>
          <AnimatedPress
            style={[styles.regBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => setShowRegister(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.regBtnText}>سجّل جاليتك</Text>
          </AnimatedPress>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث باسم الجالية أو المنطقة..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign={isRTL ? "right" : "left"}
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Filter Pills */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={[styles.filtersRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        {FILTERS.map(f => {
          const color = f.key === "all" ? Colors.primary : (CATEGORIES[f.key as CatKey]?.color ?? Colors.primary);
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterBtn, filter === f.key && { backgroundColor: color + "20", borderColor: color }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, filter === f.key && { color, fontFamily: "Cairo_700Bold" }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Stats Bar */}
      {communities.length > 0 && <StatsBar communities={communities} />}

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="loading" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>جاري التحميل...</Text>
        </View>
      ) : communities.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {search ? `لا توجد جاليات تطابق "${search}"` : "لا توجد جاليات في هذه الفئة"}
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowRegister(true)}>
            <Text style={styles.emptyBtnText}>سجّل جاليتك الآن</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={communities}
          keyExtractor={c => String(c.id)}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <Animated.View entering={FadeIn.delay(300).duration(400)} style={styles.footerCard}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.textMuted} />
              <Text style={styles.footerText}>
                هل جاليتك غير مسجّلة؟ اضغط "سجّل جاليتك" لإرسال طلب التسجيل وستتم مراجعته من قِبل الإدارة.
              </Text>
            </Animated.View>
          }
          renderItem={({ item, index }) => (
            <CommunityCard c={item} index={index} onPress={() => setSelected(item)} />
          )}
        />
      )}

      {selected && <DetailModal c={selected} onClose={() => setSelected(null)} />}
      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onSuccess={() => {
            Alert.alert(
              "✅ تم الإرسال",
              "شكراً لك! تم استلام طلب تسجيل جاليتك وسيتم مراجعته من قِبل الإدارة خلال 48 ساعة.",
              [{ text: "حسناً" }]
            );
            loadCommunities();
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    backgroundColor: Colors.cardBg, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 12,
  },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 1, textAlign: "right" },
  regBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 9,
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
  },
  regBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#fff" },
  searchBox: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },

  // Filters
  filtersScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  filtersRow: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg,
  },
  filterText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },

  // Stats
  statsBar: {
    flexDirection: "row-reverse", backgroundColor: Colors.cardBg,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    paddingHorizontal: 8,
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 2 },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },

  // Card
  list: { padding: 14, gap: 12 },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.divider,
    padding: 14, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  cardIcon: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  cardName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", lineHeight: 22 },
  cardOrigin: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  catBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  catBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  servicesRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  servicesText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary, textAlign: "right", flex: 1 },
  cardFooter: { flexDirection: "row-reverse", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 4 },
  metaChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: Colors.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.divider,
  },
  metaChipText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  callBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginRight: "auto",
  },
  callBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff" },

  // Empty / center
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyText: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textSecondary, textAlign: "center" },
  emptyBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // Footer
  footerCard: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: Colors.divider,
  },
  footerText: {
    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted,
    textAlign: "right", lineHeight: 18,
  },

  // Overlay & sheets
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheetHandle: { width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },

  // Detail sheet
  detailSheet: {
    backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%",
  },
  detailHeader: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 12,
    margin: 16, padding: 14, borderRadius: 14,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider,
  },
  detailIcon: { width: 52, height: 52, borderRadius: 16, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  detailName: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  detailOrigin: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  detailSection: {
    backgroundColor: Colors.bg, borderRadius: 14, padding: 14, gap: 8,
    borderWidth: 1, borderColor: Colors.divider,
  },
  detailSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  detailSectionText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  detailRow: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.bg, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  detailRowLabel: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  detailRowValue: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", marginTop: 2 },
  membersCard: {
    borderRadius: 14, padding: 16, alignItems: "center", gap: 4,
  },
  membersCount: { fontFamily: "Cairo_700Bold", fontSize: 32 },
  membersLabel: { fontFamily: "Cairo_500Medium", fontSize: 13 },
  serviceItem: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  serviceItemText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  detailCallBtn: {
    borderRadius: 14, paddingVertical: 14,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  detailCallBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  closeBtn: {
    backgroundColor: Colors.divider, borderRadius: 14, paddingVertical: 12, alignItems: "center",
  },
  closeBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary },

  // Register sheet
  regSheet: {
    backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "95%",
  },
  regHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  regTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  stepPill: {
    backgroundColor: Colors.primary + "20", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  stepPillText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.primary },
  regForm: { padding: 16, gap: 12 },
  formSectionTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right",
    borderRightWidth: 3, borderRightColor: Colors.primary, paddingRight: 10, marginBottom: 4,
  },
  formField: { gap: 5 },
  formLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  formInput: {
    backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.divider,
  },
  formTextArea: { minHeight: 80, lineHeight: 22 },
  catGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  catBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg,
  },
  catBtnText: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textSecondary },
  nextBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 4,
  },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  regBtns: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  backBtn: { flex: 0.4, backgroundColor: Colors.divider, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  backBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textSecondary },
  submitBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
});
