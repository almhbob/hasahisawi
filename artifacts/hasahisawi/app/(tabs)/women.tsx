import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Linking, Platform, Alert, Dimensions,
  Modal, ActivityIndicator, KeyboardAvoidingView, Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import { getApiUrl } from "@/lib/query-client";

const { width } = Dimensions.get("window");

// ══════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════
type ServiceType = "salon" | "sewing" | "health" | "cooking" | "childcare" | "tip";

type WomenService = {
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

type HealthTip = {
  id: string;
  title: string;
  body: string;
  icon: string;
  color: string;
};

type Recipe = {
  id: string;
  name: string;
  time: string;
  ingredients: string[];
  steps: string[];
  icon: string;
};

// ══════════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════════
const WOMEN_KEY = "women_services_v2";

const HEALTH_TIPS: HealthTip[] = [
  { id: "ht1", title: "تغذية المرأة الحامل", body: "تناولي الحديد والحمض الفوليك وأوميجا-3 يومياً. تجنبي المأكولات النيئة والكافيين الزائد. شربي 8 أكواب ماء على الأقل يومياً.", icon: "heart-pulse", color: "#FF4FA3" },
  { id: "ht2", title: "فحوصات الصحة الدورية", body: "اعملي فحص صدر سنوياً وفحص دم كل 6 أشهر. ضغط الدم والسكر مهمان. زوري الطبيبة النسائية مرة في السنة.", icon: "clipboard-pulse", color: "#3E9CBF" },
  { id: "ht3", title: "الصحة النفسية للمرأة", body: "خصصي وقتاً يومياً لنفسك. التحدث مع المقربات يخفف التوتر. النوم الكافي 7-8 ساعات يحسن الصحة النفسية والجسدية.", icon: "emoticon-happy", color: "#A855F7" },
  { id: "ht4", title: "نصائح ما بعد الولادة", body: "الرضاعة الطبيعية مفيدة لك وللطفل. لا تترددي في طلب المساعدة. مارسي تمارين المشي بعد أسبوعين من الولادة الطبيعية.", icon: "baby-carriage", color: "#27AE68" },
];

const RECIPES: Recipe[] = [
  {
    id: "r1", name: "ملاح ضاني سوداني", time: "90 دقيقة",
    icon: "pot-steam",
    ingredients: ["لحم ضاني 500 جم", "طماطم 3 حبات", "بصل كبير", "توابل سودانية", "ويكة", "ملح وكسبرة وكمون"],
    steps: ["اقطع اللحم وتبّله بالتوابل وافرم البصل", "سخّن زيت في قدر واقلب البصل حتى يذهب", "أضف اللحم واقلب حتى يتحمر", "أضف الطماطم والماء واتركه 60 دقيقة على نار هادئة", "أضف الويكة في الأخير وأطبخ 10 دقائق"],
  },
  {
    id: "r2", name: "عصيدة بالملاح", time: "30 دقيقة",
    icon: "bowl-mix",
    ingredients: ["دقيق ذرة 2 كوب", "ماء 4 أكواب", "ملح", "للملاح: ملاح ضاني أو دجاج"],
    steps: ["اغلي الماء مع الملح", "أضف الدقيق تدريجياً مع التحريك", "اخفض النار وحرّك باستمرار 15 دقيقة", "شكّلها في وعاء وأضف الملاح في المنتصف"],
  },
  {
    id: "r3", name: "بسبوسة سودانية", time: "45 دقيقة",
    icon: "cake",
    ingredients: ["سميد 2 كوب", "سكر 1 كوب", "زبدة 100 جم", "بيض 2", "لبن رايب 1 كوب", "خميرة ملعقة صغيرة"],
    steps: ["اخلط السميد والسكر والبيض والزبدة", "أضف اللبن الرائب والخميرة", "صب في صينية مدهونة", "اخبز 25 دقيقة على 180 درجة", "اسكب القطر الفاتر فور الإخراج"],
  },
];

// ══════════════════════════════════════════════════════
// HELPER COMPONENTS
// ══════════════════════════════════════════════════════
function SectionHeader({ title, sub, color }: { title: string; sub?: string; color: string }) {
  return (
    <View style={sh.row}>
      <LinearGradient colors={[color, color + "60"]} style={sh.bar} />
      <View>
        <Text style={sh.title}>{title}</Text>
        {sub && <Text style={sh.sub}>{sub}</Text>}
      </View>
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  bar: { width: 4, height: 28, borderRadius: 2 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
});

const TYPE_CONFIG: Record<ServiceType, { label: string; icon: string; color: string }> = {
  salon:     { label: "كوفيرة",      icon: "face-woman",     color: "#FF4FA3" },
  sewing:    { label: "خياطة",       icon: "needle",          color: "#A855F7" },
  health:    { label: "صحة المرأة", icon: "heart-pulse",     color: "#3E9CBF" },
  cooking:   { label: "طبخ ومطبخ",  icon: "pot-steam",       color: Colors.accent },
  childcare: { label: "رعاية أطفال", icon: "baby-face-outline", color: Colors.primary },
  tip:       { label: "نصيحة",      icon: "lightbulb-on",   color: "#F0A500" },
};

// ══════════════════════════════════════════════════════
// SCREEN
// ══════════════════════════════════════════════════════
type SubTab = "services" | "health" | "recipes";

export default function WomenScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ServiceType | "all">("all");
  const [services, setServices] = useState<WomenService[]>([]);
  const [subTab, setSubTab] = useState<SubTab>("services");
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [expandedTip, setExpandedTip]       = useState<string | null>(null);

  // ── نموذج الانضمام ──────────────────────────────────────────────────────
  const [joinModal,    setJoinModal]   = useState(false);
  const [joinDone,     setJoinDone]    = useState(false);
  const [joinSending,  setJoinSending] = useState(false);
  const [joinName,     setJoinName]    = useState("");
  const [joinType,     setJoinType]    = useState<ServiceType>("salon");
  const [joinPhone,    setJoinPhone]   = useState("");
  const [joinAddress,  setJoinAddress] = useState("");
  const [joinDesc,     setJoinDesc]    = useState("");

  const JOIN_TYPES: { key: ServiceType; label: string; icon: string }[] = [
    { key: "salon",     label: "كوفيرة",        icon: "face-woman"       },
    { key: "sewing",    label: "خياطة",          icon: "needle"           },
    { key: "health",    label: "صحة المرأة",    icon: "heart-pulse"      },
    { key: "cooking",   label: "مطبخ منزلي",    icon: "pot-steam"        },
    { key: "childcare", label: "رعاية أطفال",   icon: "baby-face-outline"},
  ];

  function resetJoin() {
    setJoinName(""); setJoinPhone(""); setJoinAddress(""); setJoinDesc(""); setJoinType("salon");
  }

  async function submitJoinRequest() {
    if (!joinName.trim() || !joinPhone.trim())
      return Alert.alert("بيانات ناقصة", "الاسم ورقم الهاتف مطلوبان");
    Keyboard.dismiss();
    setJoinSending(true);
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const res = await fetch(`${base}/api/women/join-request`, {
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
      Alert.alert("خطأ في الاتصال", "تعذّر الاتصال بالخادم، حاولي مجدداً");
    } finally {
      setJoinSending(false);
    }
  }

  const load = async () => {
    const raw = await AsyncStorage.getItem(WOMEN_KEY);
    setServices(raw ? JSON.parse(raw) : []);
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = services.filter(s => {
    const matchSearch = search === "" || s.name.includes(search) || s.address.includes(search) || s.description.includes(search);
    const matchFilter = filter === "all" || s.type === filter;
    return matchSearch && matchFilter;
  });

  const handleCall = (phone: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("تواصل", "", [
      { text: "إلغاء", style: "cancel" },
      { text: "واتساب", onPress: () => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, "")}`) },
      { text: "اتصال", onPress: () => Linking.openURL(`tel:${phone}`) },
    ]);
  };

  const servicesByType = (type: ServiceType) => services.filter(s => s.type === type);

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <LinearGradient colors={[Colors.cardBg, Colors.bg]} style={[s.header, { paddingTop: topPad + 12 }]}>
        <View style={s.headerTop}>
          <View style={s.headerIcon}>
            <MaterialCommunityIcons name="face-woman" size={24} color="#FF4FA3" />
          </View>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={s.headerTitle}>ركن المرأة</Text>
            <Text style={s.headerSub}>خدمات · صحة · مطبخ سوداني</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { num: `${servicesByType("salon").length}`, label: "كوفيرة", color: "#FF4FA3" },
            { num: `${servicesByType("sewing").length}`, label: "خياطة", color: "#A855F7" },
            { num: `${servicesByType("cooking").length}`, label: "مطبخ", color: Colors.accent },
            { num: `${servicesByType("health").length}`, label: "صحة", color: "#3E9CBF" },
          ].map((st, i) => (
            <View key={i} style={s.statItem}>
              <Text style={[s.statNum, { color: st.color }]}>{st.num}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Sub tabs */}
        <View style={s.subTabRow}>
          {([["services", "الخدمات", "storefront-outline"], ["health", "صحة المرأة", "heart-outline"], ["recipes", "مطبخ سوداني", "restaurant-outline"]] as [SubTab, string, string][]).map(([k, label, icon]) => (
            <TouchableOpacity key={k} style={[s.subTab, subTab === k && s.subTabActive]} onPress={() => setSubTab(k)}>
              {subTab === k && <LinearGradient colors={["#FF4FA330", "#A855F720"]} style={StyleSheet.absoluteFill} />}
              <Ionicons name={icon as any} size={14} color={subTab === k ? "#FF4FA3" : Colors.textMuted} />
              <Text style={[s.subTabText, subTab === k && { color: "#FF4FA3" }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ══ TAB: SERVICES ══ */}
      {subTab === "services" && (
        <>
          {/* Search + filters */}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
              {([["all", "الكل"], ["salon", "كوفيرات"], ["sewing", "خياطة"], ["health", "صحة"], ["cooking", "مطبخ"], ["childcare", "أطفال"]] as [ServiceType | "all", string][]).map(([k, label]) => (
                <TouchableOpacity key={k} style={[s.filterChip, filter === k && { backgroundColor: "#FF4FA3", borderColor: "#FF4FA3" }]} onPress={() => setFilter(k)}>
                  <Text style={[s.filterChipText, filter === k && { color: "#000" }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ── بانر طلب الانضمام ── */}
          <Animated.View entering={FadeIn.duration(400)} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <TouchableOpacity
              style={jm.joinBanner}
              activeOpacity={0.88}
              onPress={() => { setJoinDone(false); setJoinModal(true); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <LinearGradient colors={["#FF4FA330", "#A855F720", "transparent"]} style={StyleSheet.absoluteFill} />
              <View style={jm.joinBannerIcon}>
                <MaterialCommunityIcons name="store-plus-outline" size={26} color="#FF4FA3" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={jm.joinBannerTitle}>انضمي معنا!</Text>
                <Text style={jm.joinBannerSub}>سجّلي كوفيرتك أو خدمتك وابدئي العمل</Text>
              </View>
              <View style={jm.joinBannerArrow}>
                <Ionicons name="chevron-back" size={18} color="#FF4FA3" />
              </View>
            </TouchableOpacity>
          </Animated.View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            {filtered.map((item, idx) => {
              const cfg = TYPE_CONFIG[item.type];
              return (
                <Animated.View key={item.id} entering={FadeInDown.delay(idx * 60).springify()}>
                  <View style={[s.card, { borderColor: cfg.color + "30" }]}>
                    <LinearGradient colors={[cfg.color + "08", "transparent"]} style={StyleSheet.absoluteFill} />

                    {/* Card header */}
                    <View style={s.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardName}>{item.name}</Text>
                        <View style={s.cardMeta}>
                          <View style={[s.typeBadge, { backgroundColor: cfg.color + "20" }]}>
                            <MaterialCommunityIcons name={cfg.icon as any} size={12} color={cfg.color} />
                            <Text style={[s.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                          </View>
                          <View style={s.ratingRow}>
                            <Ionicons name="star" size={13} color={Colors.accent} />
                            <Text style={s.ratingText}>{item.rating}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={[s.iconCircle, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
                        <MaterialCommunityIcons name={cfg.icon as any} size={26} color={cfg.color} />
                      </View>
                    </View>

                    {/* Description */}
                    <Text style={s.cardDesc}>{item.description}</Text>

                    {/* Tags */}
                    <View style={s.tagsRow}>
                      {item.tags.map(tag => (
                        <View key={tag} style={s.tag}>
                          <Text style={s.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Info */}
                    <View style={s.cardInfoRow}>
                      <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                      <Text style={s.cardInfoText}>{item.hours}</Text>
                      <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                      <Text style={s.cardInfoText} numberOfLines={1}>{item.address}</Text>
                    </View>

                    {/* Actions */}
                    <View style={s.cardActions}>
                      <AnimatedPress style={{ flex: 1 }} onPress={() => handleCall(item.phone)}>
                        <LinearGradient colors={[cfg.color, cfg.color + "CC"]} style={s.actionBtn}>
                          <Ionicons name="call-outline" size={16} color="#fff" />
                          <Text style={s.actionBtnText}>تواصل</Text>
                        </LinearGradient>
                      </AnimatedPress>
                      {(item.type === "salon" || item.type === "health") && (
                        <AnimatedPress style={{ flex: 1 }} onPress={() => Alert.alert("حجز موعد", `لحجز موعد في ${item.name} اضغط "حجز المواعيد" من الصفحة الرئيسية`)}>
                          <View style={[s.actionBtn, { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: cfg.color + "60" }]}>
                            <Ionicons name="calendar-outline" size={16} color={cfg.color} />
                            <Text style={[s.actionBtnText, { color: cfg.color }]}>حجز موعد</Text>
                          </View>
                        </AnimatedPress>
                      )}
                    </View>
                  </View>
                </Animated.View>
              );
            })}
            {filtered.length === 0 && (
              <View style={s.emptyState}>
                <MaterialCommunityIcons name="magnify" size={48} color={Colors.textMuted} />
                <Text style={s.emptyText}>لا توجد نتائج</Text>
              </View>
            )}
          </ScrollView>
        </>
      )}

      {/* ══ TAB: HEALTH ══ */}
      {subTab === "health" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <SectionHeader title="نصائح صحية للمرأة" sub="معلومات طبية موثوقة" color="#FF4FA3" />

          {HEALTH_TIPS.map((tip, i) => (
            <Animated.View key={tip.id} entering={FadeInDown.delay(i * 80).springify()}>
              <TouchableOpacity
                style={[s.tipCard, { borderColor: tip.color + "30" }]}
                onPress={() => setExpandedTip(expandedTip === tip.id ? null : tip.id)}
                activeOpacity={0.85}
              >
                <LinearGradient colors={[tip.color + "10", "transparent"]} style={StyleSheet.absoluteFill} />
                <View style={s.tipHeader}>
                  <View style={[s.tipIcon, { backgroundColor: tip.color + "20" }]}>
                    <MaterialCommunityIcons name={tip.icon as any} size={22} color={tip.color} />
                  </View>
                  <Text style={s.tipTitle}>{tip.title}</Text>
                  <Ionicons name={expandedTip === tip.id ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
                </View>
                {expandedTip === tip.id && (
                  <Animated.View entering={FadeIn.duration(200)}>
                    <View style={s.tipBody}>
                      <Text style={s.tipBodyText}>{tip.body}</Text>
                    </View>
                  </Animated.View>
                )}
              </TouchableOpacity>
            </Animated.View>
          ))}

          <SectionHeader title="مراكز صحة المرأة" sub="في حصاحيصا" color="#3E9CBF" />
          {services.filter((sv) => sv.type === "health").map((item, i) => {
            const cfg = TYPE_CONFIG[item.type];
            return (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 60)}>
                <View style={[s.card, { borderColor: cfg.color + "30" }]}>
                  <LinearGradient colors={[cfg.color + "08", "transparent"]} style={StyleSheet.absoluteFill} />
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardName}>{item.name}</Text>
                      <Text style={s.cardDesc}>{item.description}</Text>
                    </View>
                    <View style={[s.iconCircle, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
                      <MaterialCommunityIcons name={cfg.icon as any} size={26} color={cfg.color} />
                    </View>
                  </View>
                  <View style={s.cardInfoRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.cardInfoText}>{item.hours}</Text>
                    <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.cardInfoText}>{item.address}</Text>
                  </View>
                  <AnimatedPress onPress={() => handleCall(item.phone)}>
                    <LinearGradient colors={[cfg.color, cfg.color + "CC"]} style={s.wideBtn}>
                      <Ionicons name="call-outline" size={16} color="#fff" />
                      <Text style={s.actionBtnText}>تواصل مع المركز</Text>
                    </LinearGradient>
                  </AnimatedPress>
                </View>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}

      {/* ══ TAB: RECIPES ══ */}
      {subTab === "recipes" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <SectionHeader title="مطبخ سوداني" sub="وصفات تقليدية أصيلة" color={Colors.accent} />

          {RECIPES.map((recipe, i) => (
            <Animated.View key={recipe.id} entering={FadeInDown.delay(i * 80).springify()}>
              <TouchableOpacity
                style={[s.recipeCard, expandedRecipe === recipe.id && { borderColor: Colors.accent + "60" }]}
                onPress={() => setExpandedRecipe(expandedRecipe === recipe.id ? null : recipe.id)}
                activeOpacity={0.85}
              >
                {expandedRecipe === recipe.id && <LinearGradient colors={[Colors.accent + "12", "transparent"]} style={StyleSheet.absoluteFill} />}
                <View style={s.recipeHeader}>
                  <View style={[s.recipeIcon, { backgroundColor: Colors.accent + "20" }]}>
                    <MaterialCommunityIcons name={recipe.icon as any} size={28} color={Colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.recipeName}>{recipe.name}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                      <Text style={s.recipeTime}>{recipe.time}</Text>
                    </View>
                  </View>
                  <Ionicons name={expandedRecipe === recipe.id ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
                </View>

                {expandedRecipe === recipe.id && (
                  <Animated.View entering={FadeIn.duration(250)}>
                    <View style={s.recipeBody}>
                      <Text style={s.recipeSubTitle}>المقادير</Text>
                      {recipe.ingredients.map((ing, j) => (
                        <View key={j} style={s.ingredientRow}>
                          <View style={s.ingredientDot} />
                          <Text style={s.ingredientText}>{ing}</Text>
                        </View>
                      ))}
                      <Text style={[s.recipeSubTitle, { marginTop: 14 }]}>طريقة التحضير</Text>
                      {recipe.steps.map((step, j) => (
                        <View key={j} style={s.stepRow}>
                          <View style={[s.stepNum, { backgroundColor: Colors.accent }]}>
                            <Text style={s.stepNumText}>{j + 1}</Text>
                          </View>
                          <Text style={s.stepText}>{step}</Text>
                        </View>
                      ))}
                    </View>
                  </Animated.View>
                )}
              </TouchableOpacity>
            </Animated.View>
          ))}

          {/* مطابخ منزلية */}
          <SectionHeader title="مطابخ منزلية للطلب" sub="وجبات سودانية يومية" color={Colors.primary} />
          {services.filter((sv) => sv.type === "cooking").map((item, i) => {
            const cfg = TYPE_CONFIG[item.type];
            return (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 60)}>
                <View style={[s.card, { borderColor: cfg.color + "30" }]}>
                  <LinearGradient colors={[cfg.color + "08", "transparent"]} style={StyleSheet.absoluteFill} />
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardName}>{item.name}</Text>
                      <Text style={s.cardDesc}>{item.description}</Text>
                    </View>
                    <View style={[s.iconCircle, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
                      <MaterialCommunityIcons name={cfg.icon as any} size={26} color={cfg.color} />
                    </View>
                  </View>
                  <View style={s.cardInfoRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.cardInfoText}>{item.hours}</Text>
                    <View style={s.ratingRow}>
                      <Ionicons name="star" size={13} color={Colors.accent} />
                      <Text style={s.ratingText}>{item.rating}</Text>
                    </View>
                  </View>
                  <AnimatedPress onPress={() => handleCall(item.phone)}>
                    <LinearGradient colors={[cfg.color, cfg.color + "CC"]} style={s.wideBtn}>
                      <Ionicons name="call-outline" size={16} color="#fff" />
                      <Text style={s.actionBtnText}>اطلب الآن</Text>
                    </LinearGradient>
                  </AnimatedPress>
                </View>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}

      {/* ══ زر الانضمام العائم ══════════════════════════════════════════════ */}
      <TouchableOpacity
        style={jm.fab}
        activeOpacity={0.88}
        onPress={() => { setJoinDone(false); setJoinModal(true); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
      >
        <LinearGradient colors={["#FF4FA3", "#A855F7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={jm.fabGrad}>
          <MaterialCommunityIcons name="store-plus-outline" size={20} color="#fff" />
          <Text style={jm.fabText}>طلب الانضمام</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* ══ مودال الانضمام ══════════════════════════════════════════════════ */}
      <Modal
        visible={joinModal}
        animationType="slide"
        transparent
        onRequestClose={() => setJoinModal(false)}
      >
        <View style={jm.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setJoinModal(false)} />

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={jm.sheet}>
            <LinearGradient colors={["#1A0830", "#0A1A10"]} style={jm.sheetInner}>

              {/* رأس المودال */}
              <View style={jm.sheetHeader}>
                <TouchableOpacity onPress={() => setJoinModal(false)} style={jm.closeBtn}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <View style={jm.sheetTitleWrap}>
                  <MaterialCommunityIcons name="store-plus-outline" size={24} color="#FF4FA3" />
                  <Text style={jm.sheetTitle}>طلب الانضمام لركن المرأة</Text>
                </View>
              </View>

              {joinDone ? (
                /* ── شاشة النجاح ── */
                <Animated.View entering={FadeIn} style={jm.successBox}>
                  <LinearGradient colors={["#FF4FA320", "#A855F710"]} style={jm.successIconWrap}>
                    <Ionicons name="checkmark-circle" size={56} color="#FF4FA3" />
                  </LinearGradient>
                  <Text style={jm.successTitle}>تم إرسال طلبك بنجاح!</Text>
                  <Text style={jm.successSub}>
                    سيتم مراجعة طلبك من قِبل الإدارة والتواصل معكِ قريباً عبر الهاتف.
                  </Text>
                  <TouchableOpacity
                    style={jm.successBtn}
                    onPress={() => { setJoinModal(false); setJoinDone(false); }}
                  >
                    <LinearGradient colors={["#FF4FA3", "#A855F7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={jm.successBtnGrad}>
                      <Text style={jm.successBtnText}>حسناً، شكراً!</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  {/* ── نوع الخدمة ── */}
                  <Text style={jm.fieldLabel}>نوع الخدمة *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {JOIN_TYPES.map(jt => (
                      <TouchableOpacity
                        key={jt.key}
                        style={[jm.typeChip, joinType === jt.key && { borderColor: "#FF4FA3", backgroundColor: "#FF4FA318" }]}
                        onPress={() => setJoinType(jt.key)}
                      >
                        <MaterialCommunityIcons name={jt.icon as any} size={16} color={joinType === jt.key ? "#FF4FA3" : Colors.textMuted} />
                        <Text style={[jm.typeChipText, joinType === jt.key && { color: "#FF4FA3" }]}>{jt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* ── الحقول ── */}
                  {[
                    { label: "الاسم الكامل *",          val: joinName,    set: setJoinName,    placeholder: "فاطمة أحمد"        },
                    { label: "رقم الهاتف *",             val: joinPhone,   set: setJoinPhone,   placeholder: "0912345678", kb: "phone-pad" as const },
                    { label: "الحي / المنطقة",           val: joinAddress, set: setJoinAddress, placeholder: "حصاحيصا — الحي الشرقي" },
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
                      style={[jm.input, { minHeight: 85, textAlignVertical: "top" }]}
                      value={joinDesc}
                      onChangeText={setJoinDesc}
                      placeholder="اكتبي نبذة عن خدمتك، أوقات العمل، الأسعار..."
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      textAlign="right"
                    />
                  </View>

                  {/* ── زر الإرسال ── */}
                  <TouchableOpacity
                    style={[jm.sendBtn, joinSending && { opacity: 0.6 }]}
                    onPress={submitJoinRequest}
                    disabled={joinSending}
                  >
                    <LinearGradient colors={["#FF4FA3", "#A855F7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={jm.sendBtnGrad}>
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
  header: { paddingHorizontal: 16, paddingBottom: 0 },
  headerTop: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  headerIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#FF4FA320", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#FF4FA340" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },

  statsRow: { flexDirection: "row", backgroundColor: Colors.bg, borderRadius: 16, padding: 14, marginBottom: 14, gap: 8 },
  statItem: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 22 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary },

  subTabRow: { flexDirection: "row", gap: 8, paddingBottom: 14 },
  subTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden" },
  subTabActive: { borderColor: "#FF4FA360" },
  subTabText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },

  searchSection: { backgroundColor: Colors.cardBg },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bg, borderRadius: 12, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, gap: 8 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 11 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconCircle: { width: 52, height: 52, borderRadius: 14, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  cardName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  tagText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary },
  cardInfoRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardInfoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  cardActions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 12 },
  actionBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  wideBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 13 },

  emptyState: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 16, color: Colors.textMuted },

  // Health tips
  tipCard: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, overflow: "hidden" },
  tipHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  tipIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  tipTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  tipBody: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.divider },
  tipBodyText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 24, textAlign: "right" },

  // Recipes
  recipeCard: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden" },
  recipeHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  recipeIcon: { width: 54, height: 54, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  recipeName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  recipeTime: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
  recipeBody: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.divider, gap: 8 },
  recipeSubTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary, textAlign: "right" },
  ingredientRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  ingredientDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  ingredientText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
  stepNum: { width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center", flexShrink: 0, marginTop: 2 },
  stepNumText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#000" },
  stepText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 22 },
});

// ── أنماط نموذج الانضمام ─────────────────────────────────────────────────────
const jm = StyleSheet.create({
  // بانر في قائمة الخدمات
  joinBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.cardBg, borderRadius: 18,
    borderWidth: 1.5, borderColor: "#FF4FA340",
    padding: 14, marginBottom: 4, overflow: "hidden",
  },
  joinBannerIcon: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: "#FF4FA318", borderWidth: 1.5, borderColor: "#FF4FA340",
    alignItems: "center", justifyContent: "center",
  },
  joinBannerTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#FF4FA3", textAlign: "right" },
  joinBannerSub:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 1 },
  joinBannerArrow: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: "#FF4FA318", alignItems: "center", justifyContent: "center",
  },

  // زر عائم
  fab: {
    position: "absolute", bottom: 24, alignSelf: "center",
    borderRadius: 28, overflow: "hidden",
    elevation: 8,
    shadowColor: "#FF4FA3", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  fabGrad: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  fabText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // مودال
  overlay: {
    flex: 1, backgroundColor: "#00000088",
    justifyContent: "flex-end",
  },
  sheet: { maxHeight: "92%" },
  sheetInner: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingBottom: 36,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 20,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center",
  },
  sheetTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },

  // حقول
  fieldLabel: {
    fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary,
    textAlign: "right", marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.bg, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider,
    color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg,
  },
  typeChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },

  // زر الإرسال
  sendBtn: { borderRadius: 16, overflow: "hidden", marginTop: 4 },
  sendBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 15,
  },
  sendBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  // نجاح
  successBox: { alignItems: "center", paddingVertical: 32, gap: 14 },
  successIconWrap: {
    width: 100, height: 100, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FF4FA340",
  },
  successTitle: { fontFamily: "Cairo_800ExtraBold", fontSize: 22, color: "#FF4FA3", textAlign: "center" },
  successSub: {
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary,
    textAlign: "center", lineHeight: 22, paddingHorizontal: 16,
  },
  successBtn: { borderRadius: 16, overflow: "hidden", marginTop: 8, width: "80%" },
  successBtnGrad: { paddingVertical: 14, alignItems: "center" },
  successBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
