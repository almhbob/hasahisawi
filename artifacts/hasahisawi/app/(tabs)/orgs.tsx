import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Linking, Platform, Alert, Modal, FlatList,
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

// ══════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════
type OrgType = "charity" | "initiative" | "cooperative" | "volunteer";

type Organization = {
  id: string;
  name: string;
  type: OrgType;
  description: string;
  fullDescription: string;
  contact: string;
  email?: string;
  members: number;
  founded: string;
  goals: string[];
  needs: string[];
  rating: number;
  isVerified: boolean;
};

type Event = {
  id: string;
  orgId: string;
  orgName: string;
  title: string;
  date: string;
  location: string;
  description: string;
  color: string;
};

type Campaign = {
  id: string;
  orgId: string;
  orgName: string;
  title: string;
  target: string;
  description: string;
  icon: string;
  color: string;
};

// ══════════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════════
const ORGS_KEY = "orgs_v2";
const ORGS_INIT_KEY = "orgs_v2_initialized";

const SEED_ORGS: Organization[] = [
  {
    id: "o1", name: "مبادرة شباب الحصاحيصا", type: "initiative",
    description: "مبادرة شبابية تهدف لتطوير الخدمات المجتمعية",
    fullDescription: "مبادرة شبابية تطوعية تهدف إلى تطوير الخدمات في مدينة الحصاحيصا ومناطقها القريبة، تتبنى مشاريع البنية التحتية والتوعية الاجتماعية وتنظيم الفعاليات الثقافية والرياضية.",
    contact: "+249912345611", members: 120, founded: "2019",
    goals: ["تطوير الخدمات المجتمعية", "توعية الشباب", "دعم المحتاجين"],
    needs: ["متطوعون", "تمويل مشاريع", "معدات وأدوات"],
    rating: 4.9, isVerified: true,
  },
  {
    id: "o2", name: "جمعية البر الخيرية", type: "charity",
    description: "جمعية مسجلة تكفل الأيتام وتساعد الأسر المتعففة",
    fullDescription: "جمعية خيرية مسجلة رسمياً تعنى بكفالة الأيتام ومساعدة الأسر المتعففة والمحتاجين في مدينة الحصاحيصا وقراها. توفر المساعدات الغذائية والملابس والرسوم الدراسية.",
    contact: "+249912345612", members: 45, founded: "2015",
    goals: ["كفالة الأيتام", "دعم الأسر المحتاجة", "التعليم للجميع"],
    needs: ["تبرعات مالية", "ملابس وأغذية", "متطوعون"],
    rating: 4.7, isVerified: true,
  },
  {
    id: "o3", name: "مبادرة شارع الحوادث الطارئة", type: "volunteer",
    description: "مبادرة طوعية لتوفير الأدوية والمستلزمات للحالات الطارئة",
    fullDescription: "فريق متطوع يقدم خدمات الإسعاف الأولي والأدوية الطارئة للحوادث والطوارئ في الحصاحيصا، ويدعم مستشفى المدينة بالمستلزمات الطبية عند الحاجة.",
    contact: "+249912345613", members: 80, founded: "2021",
    goals: ["خدمات طارئة فورية", "دعم الكوارث", "التوعية الطبية"],
    needs: ["أدوية ومستلزمات طبية", "سيارة إسعاف", "متطوعون مؤهلون"],
    rating: 5.0, isVerified: true,
  },
  {
    id: "o4", name: "جمعية المزارعين التعاونية", type: "cooperative",
    description: "تعاونية زراعية تدعم مزارعي حصاحيصا والمناطق المجاورة",
    fullDescription: "جمعية تعاونية تجمع المزارعين في الحصاحيصا والمناطق المجاورة لتبادل الخبرات والموارد وتسويق المنتجات الزراعية المحلية. توفر بذوراً ومدخلات زراعية بأسعار مخفضة.",
    contact: "+249912345614", members: 200, founded: "2010",
    goals: ["دعم المزارعين", "تسويق المنتجات", "تطوير الزراعة المحلية"],
    needs: ["بذور ومدخلات", "تمويل موسم الزراعة", "أسواق تسويق"],
    rating: 4.6, isVerified: true,
  },
  {
    id: "o5", name: "مبادرة بنات حصاحيصا", type: "initiative",
    description: "مبادرة نسائية لتمكين المرأة وتعليم المهارات",
    fullDescription: "مبادرة نسائية شاملة تهدف إلى تمكين المرأة في مدينة الحصاحيصا عبر التدريب المهني وتعليم الحرف اليدوية والخياطة والطبخ المهني وتوفير فرص دخل للأسر.",
    contact: "+249912345615", members: 95, founded: "2020",
    goals: ["تمكين المرأة", "التدريب المهني", "توفير الدخل للأسر"],
    needs: ["ماكينات خياطة", "مواد تدريب", "قاعة للتدريب"],
    rating: 4.8, isVerified: false,
  },
  {
    id: "o6", name: "فريق النظافة والتشجير", type: "volunteer",
    description: "مبادرة بيئية لتنظيف المدينة وزرع الأشجار",
    fullDescription: "فريق متطوع يعمل على تنظيف شوارع وأحياء حصاحيصا وزرع الأشجار والحفاظ على البيئة. ينظم حملات دورية أسبوعية وحملات كبرى في المناسبات الوطنية.",
    contact: "+249912345616", members: 60, founded: "2022",
    goals: ["تنظيف الشوارع", "التشجير", "التوعية البيئية"],
    needs: ["أدوات نظافة", "شتلات أشجار", "متطوعون"],
    rating: 4.5, isVerified: false,
  },
];

const EVENTS: Event[] = [
  { id: "e1", orgId: "o1", orgName: "مبادرة شباب الحصاحيصا", title: "يوم خدمة مجتمعية", date: "الجمعة 21 مارس 2026", location: "ميدان المدينة", description: "يوم خدمة مجتمعية شامل: تنظيف، صيانة، مساعدات", color: Colors.primary },
  { id: "e2", orgId: "o2", orgName: "جمعية البر الخيرية", title: "توزيع وجبات رمضان", date: "يومياً خلال رمضان", location: "مقر الجمعية", description: "توزيع وجبات إفطار يومياً للأسر المحتاجة", color: "#FF4FA3" },
  { id: "e3", orgId: "o6", orgName: "فريق النظافة والتشجير", title: "حملة تشجير الأحياء", date: "السبت 28 مارس 2026", location: "حي السلام وحي الضحى", description: "زراعة 200 شجرة في أحياء المدينة مع المتطوعين", color: Colors.primary },
  { id: "e4", orgId: "o5", orgName: "مبادرة بنات حصاحيصا", title: "معرض الحرف اليدوية", date: "الجمعة 4 أبريل 2026", location: "قاعة المدينة الثقافية", description: "معرض لعرض منتجات المرأة الحصاحيصاوية للبيع", color: "#A855F7" },
];

const CAMPAIGNS: Campaign[] = [
  { id: "c1", orgId: "o2", orgName: "جمعية البر الخيرية", title: "كفالة 50 يتيم", target: "50,000 جنيه", description: "حملة لكفالة 50 طفل يتيم لمدة سنة كاملة شاملاً التعليم والصحة والغذاء", icon: "heart", color: "#FF4FA3" },
  { id: "c2", orgId: "o3", orgName: "مبادرة شارع الحوادث", title: "مستلزمات طبية طارئة", target: "20,000 جنيه", description: "تأمين مستلزمات إسعاف أولي وأدوية طارئة لمدة 6 أشهر للفريق الطوعي", icon: "medical-bag", color: "#3E9CBF" },
  { id: "c3", orgId: "o5", orgName: "مبادرة بنات حصاحيصا", title: "ماكينات خياطة للأسر", target: "30,000 جنيه", description: "شراء 10 ماكينات خياطة لتوزيعها على الأسر الفقيرة لتوليد دخل", icon: "needle", color: "#A855F7" },
];

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
const TYPE_CONFIG: Record<OrgType, { label: string; icon: string; color: string }> = {
  charity:     { label: "جمعية خيرية",     icon: "hand-heart",     color: "#FF4FA3" },
  initiative:  { label: "مبادرة شبابية",  icon: "lightning-bolt", color: Colors.primary },
  cooperative: { label: "تعاونية",          icon: "account-group",  color: Colors.accent },
  volunteer:   { label: "فريق تطوعي",      icon: "hand-okay",      color: "#3E9CBF" },
};

function SectionHeader({ title, sub, color }: { title: string; sub?: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <LinearGradient colors={[color, color + "60"]} style={{ width: 4, height: 28, borderRadius: 2 }} />
      <View>
        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary }}>{title}</Text>
        {sub && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary }}>{sub}</Text>}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// SCREEN
// ══════════════════════════════════════════════════════
type SubTab = "orgs" | "events" | "campaigns";

export default function OrgsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OrgType | "all">("all");
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [subTab, setSubTab] = useState<SubTab>("orgs");
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [volunteerModal, setVolunteerModal] = useState<Organization | null>(null);
  const [volName, setVolName] = useState("");
  const [volPhone, setVolPhone] = useState("");

  const load = async () => {
    const init = await AsyncStorage.getItem(ORGS_INIT_KEY);
    if (!init) {
      await AsyncStorage.setItem(ORGS_KEY, JSON.stringify(SEED_ORGS));
      await AsyncStorage.setItem(ORGS_INIT_KEY, "1");
      setOrgs(SEED_ORGS);
    } else {
      const raw = await AsyncStorage.getItem(ORGS_KEY);
      setOrgs(raw ? JSON.parse(raw) : []);
    }
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = orgs.filter(o => {
    const matchSearch = search === "" || o.name.includes(search) || o.description.includes(search);
    const matchFilter = filter === "all" || o.type === filter;
    return matchSearch && matchFilter;
  });

  const handleContact = (phone: string, name: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(`تواصل مع ${name}`, "", [
      { text: "إلغاء", style: "cancel" },
      { text: "واتساب", onPress: () => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, "")}`) },
      { text: "اتصال", onPress: () => Linking.openURL(`tel:${phone}`) },
    ]);
  };

  const submitVolunteer = async () => {
    if (!volName.trim() || !volPhone.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال الاسم ورقم الهاتف"); return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("✅ تم إرسال طلبك", `شكراً ${volName}! سيتواصل معك فريق ${volunteerModal?.name} قريباً`);
    setVolName(""); setVolPhone("");
    setVolunteerModal(null);
  };

  const totalMembers = orgs.reduce((acc, o) => acc + o.members, 0);

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <LinearGradient colors={[Colors.cardBg, Colors.bg]} style={[s.header, { paddingTop: topPad + 12 }]}>
        <View style={s.headerTop}>
          <View style={s.headerIcon}>
            <MaterialCommunityIcons name="hand-heart" size={24} color="#FF4FA3" />
          </View>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={s.headerTitle}>المبادرات والمنظمات</Text>
            <Text style={s.headerSub}>خيرية · تطوعية · تعاونية</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { num: `${orgs.filter(o => o.type === "charity").length}`, label: "جمعيات", color: "#FF4FA3" },
            { num: `${orgs.filter(o => o.type === "initiative").length}`, label: "مبادرات", color: Colors.primary },
            { num: `${orgs.filter(o => o.type === "volunteer").length}`, label: "فرق تطوع", color: "#3E9CBF" },
            { num: `${totalMembers}+`, label: "متطوع", color: Colors.accent },
          ].map((st, i) => (
            <View key={i} style={s.statItem}>
              <Text style={[s.statNum, { color: st.color }]}>{st.num}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Sub tabs */}
        <View style={s.subTabRow}>
          {([["orgs", "المنظمات", "business-outline"], ["events", "الفعاليات", "calendar-outline"], ["campaigns", "حملات التبرع", "heart-outline"]] as [SubTab, string, string][]).map(([k, label, icon]) => (
            <TouchableOpacity key={k} style={[s.subTab, subTab === k && s.subTabActive]} onPress={() => setSubTab(k)}>
              {subTab === k && <LinearGradient colors={[Colors.primary + "25", Colors.accent + "18"]} style={StyleSheet.absoluteFill} />}
              <Ionicons name={icon as any} size={14} color={subTab === k ? Colors.primary : Colors.textMuted} />
              <Text style={[s.subTabText, subTab === k && { color: Colors.primary }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ══ ORGS TAB ══ */}
      {subTab === "orgs" && (
        <>
          <View style={s.searchSection}>
            <View style={s.searchRow}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="ابحث عن منظمة..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                textAlign="right"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
              {([["all", "الكل"], ["charity", "جمعيات خيرية"], ["initiative", "مبادرات"], ["volunteer", "تطوع"], ["cooperative", "تعاونيات"]] as [OrgType | "all", string][]).map(([k, label]) => (
                <TouchableOpacity key={k} style={[s.filterChip, filter === k && { backgroundColor: Colors.primary, borderColor: Colors.primary }]} onPress={() => setFilter(k)}>
                  <Text style={[s.filterChipText, filter === k && { color: "#000" }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            {filtered.map((org, i) => {
              const cfg = TYPE_CONFIG[org.type];
              const isExpanded = expandedOrg === org.id;
              return (
                <Animated.View key={org.id} entering={FadeInDown.delay(i * 70).springify()}>
                  <View style={[s.card, { borderColor: cfg.color + "30" }]}>
                    <LinearGradient colors={[cfg.color + "08", "transparent"]} style={StyleSheet.absoluteFill} />

                    {/* Header */}
                    <View style={s.cardHeader}>
                      <View style={[s.iconCircle, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
                        <MaterialCommunityIcons name={cfg.icon as any} size={28} color={cfg.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={s.nameRow}>
                          <Text style={s.cardName}>{org.name}</Text>
                          {org.isVerified && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                        </View>
                        <View style={s.cardMeta}>
                          <View style={[s.typeBadge, { backgroundColor: cfg.color + "20" }]}>
                            <Text style={[s.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                          </View>
                          <Text style={s.memberCount}>👥 {org.members} عضو</Text>
                          <View style={s.ratingRow}>
                            <Ionicons name="star" size={12} color={Colors.accent} />
                            <Text style={s.ratingText}>{org.rating}</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    <Text style={s.cardDesc}>{isExpanded ? org.fullDescription : org.description}</Text>

                    {/* Expanded */}
                    {isExpanded && (
                      <Animated.View entering={FadeIn.duration(250)} style={s.expandedSection}>
                        <View style={s.goalsSection}>
                          <Text style={s.goalsSectionTitle}>🎯 أهداف المنظمة</Text>
                          {org.goals.map((g, gi) => (
                            <View key={gi} style={s.goalRow}>
                              <View style={[s.goalDot, { backgroundColor: cfg.color }]} />
                              <Text style={s.goalText}>{g}</Text>
                            </View>
                          ))}
                        </View>
                        <View style={[s.goalsSection, { marginTop: 12 }]}>
                          <Text style={[s.goalsSectionTitle, { color: Colors.accent }]}>🤝 ما نحتاجه من دعم</Text>
                          {org.needs.map((n, ni) => (
                            <View key={ni} style={s.goalRow}>
                              <View style={[s.goalDot, { backgroundColor: Colors.accent }]} />
                              <Text style={s.goalText}>{n}</Text>
                            </View>
                          ))}
                        </View>
                        <Text style={s.foundedText}>تأسست عام {org.founded}</Text>
                      </Animated.View>
                    )}

                    <TouchableOpacity onPress={() => setExpandedOrg(isExpanded ? null : org.id)} style={s.expandBtn}>
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
                      <Text style={s.expandBtnText}>{isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}</Text>
                    </TouchableOpacity>

                    {/* Actions */}
                    <View style={s.cardActions}>
                      <AnimatedPress style={{ flex: 1 }} onPress={() => handleContact(org.contact, org.name)}>
                        <LinearGradient colors={[cfg.color, cfg.color + "CC"]} style={s.actionBtn}>
                          <Ionicons name="call-outline" size={16} color="#fff" />
                          <Text style={s.actionBtnText}>تواصل</Text>
                        </LinearGradient>
                      </AnimatedPress>
                      <AnimatedPress style={{ flex: 1 }} onPress={() => { setVolunteerModal(org); setVolName(""); setVolPhone(""); }}>
                        <View style={[s.actionBtn, { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: cfg.color + "60" }]}>
                          <Ionicons name="person-add-outline" size={16} color={cfg.color} />
                          <Text style={[s.actionBtnText, { color: cfg.color }]}>انضم / تطوع</Text>
                        </View>
                      </AnimatedPress>
                    </View>
                  </View>
                </Animated.View>
              );
            })}
          </ScrollView>
        </>
      )}

      {/* ══ EVENTS TAB ══ */}
      {subTab === "events" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <SectionHeader title="الفعاليات القادمة" sub="مبادرات ومشاريع مجتمعية" color={Colors.primary} />
          {EVENTS.map((ev, i) => (
            <Animated.View key={ev.id} entering={FadeInDown.delay(i * 80).springify()}>
              <View style={[s.eventCard, { borderColor: ev.color + "40" }]}>
                <LinearGradient colors={[ev.color + "12", "transparent"]} style={StyleSheet.absoluteFill} />
                <View style={s.eventHeader}>
                  <View style={[s.eventDateBox, { backgroundColor: ev.color + "20", borderColor: ev.color + "40" }]}>
                    <Ionicons name="calendar" size={18} color={ev.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.eventTitle}>{ev.title}</Text>
                    <Text style={[s.eventOrg, { color: ev.color }]}>{ev.orgName}</Text>
                  </View>
                </View>
                <View style={s.eventInfo}>
                  <View style={s.eventInfoRow}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.eventInfoText}>{ev.date}</Text>
                  </View>
                  <View style={s.eventInfoRow}>
                    <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.eventInfoText}>{ev.location}</Text>
                  </View>
                </View>
                <Text style={s.eventDesc}>{ev.description}</Text>
                <AnimatedPress onPress={() => {
                  const org = orgs.find(o => o.id === ev.orgId);
                  if (org) handleContact(org.contact, org.name);
                }}>
                  <View style={[s.eventBtn, { borderColor: ev.color + "50" }]}>
                    <Text style={[s.eventBtnText, { color: ev.color }]}>شارك في الفعالية</Text>
                    <Ionicons name="arrow-forward" size={16} color={ev.color} />
                  </View>
                </AnimatedPress>
              </View>
            </Animated.View>
          ))}
        </ScrollView>
      )}

      {/* ══ CAMPAIGNS TAB ══ */}
      {subTab === "campaigns" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <SectionHeader title="حملات التبرع" sub="ادعم المجتمع الحصاحيصاوي" color="#FF4FA3" />

          <View style={s.donateNote}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
            <Text style={s.donateNoteText}>جميع الحملات موثقة ومدارة من منظمات مسجلة. للتبرع تواصل مع المنظمة مباشرة</Text>
          </View>

          {CAMPAIGNS.map((camp, i) => (
            <Animated.View key={camp.id} entering={FadeInDown.delay(i * 80).springify()}>
              <View style={[s.campCard, { borderColor: camp.color + "40" }]}>
                <LinearGradient colors={[camp.color + "12", "transparent"]} style={StyleSheet.absoluteFill} />
                <View style={s.campHeader}>
                  <View style={[s.campIcon, { backgroundColor: camp.color + "20" }]}>
                    <MaterialCommunityIcons name={camp.icon as any} size={28} color={camp.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.campTitle}>{camp.title}</Text>
                    <Text style={[s.campOrg, { color: camp.color }]}>{camp.orgName}</Text>
                    <View style={[s.campTarget, { backgroundColor: camp.color + "15" }]}>
                      <Text style={[s.campTargetText, { color: camp.color }]}>الهدف: {camp.target}</Text>
                    </View>
                  </View>
                </View>
                <Text style={s.campDesc}>{camp.description}</Text>
                <AnimatedPress onPress={() => {
                  const org = orgs.find(o => o.id === camp.orgId);
                  if (org) handleContact(org.contact, org.name);
                }}>
                  <LinearGradient colors={[camp.color, camp.color + "CC"]} style={s.campBtn}>
                    <MaterialCommunityIcons name="hand-heart" size={18} color="#fff" />
                    <Text style={s.campBtnText}>تبرع الآن</Text>
                  </LinearGradient>
                </AnimatedPress>
              </View>
            </Animated.View>
          ))}
        </ScrollView>
      )}

      {/* ══ VOLUNTEER MODAL ══ */}
      <Modal visible={!!volunteerModal} animationType="slide" transparent statusBarTranslucent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            {volunteerModal && (
              <>
                <LinearGradient
                  colors={[Colors.primary + "18", Colors.accent + "10", "transparent"]}
                  style={s.modalHeader}
                >
                  <TouchableOpacity onPress={() => setVolunteerModal(null)} style={s.modalClose}>
                    <Ionicons name="close" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <View style={s.modalIconWrap}>
                    <MaterialCommunityIcons name={TYPE_CONFIG[volunteerModal.type].icon as any} size={32} color={TYPE_CONFIG[volunteerModal.type].color} />
                  </View>
                  <Text style={s.modalTitle}>انضم / تطوع</Text>
                  <Text style={s.modalSubtitle}>{volunteerModal.name}</Text>
                </LinearGradient>

                <View style={s.modalBody}>
                  <Text style={s.modalNeeds}>ما تحتاجه المنظمة: {volunteerModal.needs.join(" · ")}</Text>

                  {[
                    { label: "اسمك الكامل *", ph: "أدخل اسمك", val: volName, set: setVolName, kb: "default" as const },
                    { label: "رقم الهاتف *", ph: "09xxxxxxxx", val: volPhone, set: setVolPhone, kb: "phone-pad" as const },
                  ].map(f => (
                    <View key={f.label} style={s.fieldBlock}>
                      <Text style={s.fieldLabel}>{f.label}</Text>
                      <TextInput
                        style={s.fieldInput}
                        placeholder={f.ph}
                        placeholderTextColor={Colors.textMuted}
                        value={f.val}
                        onChangeText={f.set}
                        keyboardType={f.kb}
                        textAlign="right"
                      />
                    </View>
                  ))}

                  <TouchableOpacity onPress={submitVolunteer}>
                    <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={s.modalSubmit}>
                      <Ionicons name="person-add-outline" size={18} color="#000" />
                      <Text style={s.modalSubmitText}>إرسال طلب الانضمام</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
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
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 20 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary },

  subTabRow: { flexDirection: "row", gap: 8, paddingBottom: 14 },
  subTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden" },
  subTabActive: { borderColor: Colors.primary + "60" },
  subTabText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted },

  searchSection: { backgroundColor: Colors.cardBg },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bg, borderRadius: 12, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, gap: 8 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 11 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  card: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconCircle: { width: 54, height: 54, borderRadius: 15, justifyContent: "center", alignItems: "center", borderWidth: 1, flexShrink: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", flex: 1 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  memberCount: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },

  expandedSection: { backgroundColor: Colors.bg, borderRadius: 14, padding: 14, gap: 0 },
  goalsSection: {},
  goalsSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary, textAlign: "right", marginBottom: 8 },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  goalDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  goalText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  foundedText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 10 },

  expandBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  expandBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },

  cardActions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 12 },
  actionBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  // Events
  eventCard: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, overflow: "hidden" },
  eventHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  eventDateBox: { width: 46, height: 46, borderRadius: 13, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  eventTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  eventOrg: { fontFamily: "Cairo_500Medium", fontSize: 12 },
  eventInfo: { gap: 6 },
  eventInfoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eventInfoText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary },
  eventDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },
  eventBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 11, borderWidth: 1 },
  eventBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14 },

  // Campaigns
  donateNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.primary + "10", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.primary + "30" },
  donateNoteText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 22 },
  campCard: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, overflow: "hidden" },
  campHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  campIcon: { width: 56, height: 56, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  campTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  campOrg: { fontFamily: "Cairo_500Medium", fontSize: 12 },
  campTarget: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-end" },
  campTargetText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  campDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },
  campBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 13 },
  campBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "80%", borderTopWidth: 1, borderColor: Colors.primary + "30" },
  modalHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: Colors.primary + "40", alignSelf: "center", marginTop: 12 },
  modalHeader: { padding: 20, paddingTop: 12, alignItems: "center", gap: 8 },
  modalClose: { position: "absolute", top: 12, left: 16, width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" },
  modalIconWrap: { width: 64, height: 64, borderRadius: 18, backgroundColor: Colors.primary + "20", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: Colors.primary + "40" },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  modalSubtitle: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary },
  modalBody: { padding: 20, gap: 16 },
  modalNeeds: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", backgroundColor: Colors.bg, borderRadius: 12, padding: 12, lineHeight: 22 },
  fieldBlock: { gap: 6 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  fieldInput: { borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 14, backgroundColor: Colors.bg, paddingHorizontal: 14, paddingVertical: 13, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary },
  modalSubmit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 15 },
  modalSubmitText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#000" },
});
