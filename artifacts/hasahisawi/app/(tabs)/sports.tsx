import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  Alert,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SportClub = {
  id: string;
  name: string;
  sport: "football" | "basketball" | "volleyball" | "athletics" | "swimming" | "boxing" | "other";
  address: string;
  phone: string;
  description?: string;
  founded?: string;
};

export type SportEvent = {
  id: string;
  title: string;
  sport: SportClub["sport"];
  date: string;
  location: string;
  description?: string;
  contactPhone?: string;
};

export const SPORT_CLUBS_KEY = "sport_clubs_v1";
export const SPORT_EVENTS_KEY = "sport_events_v1";

export async function loadSportClubs(): Promise<SportClub[]> {
  const raw = await AsyncStorage.getItem(SPORT_CLUBS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function loadSportEvents(): Promise<SportEvent[]> {
  const raw = await AsyncStorage.getItem(SPORT_EVENTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getSportLabel(sport: SportClub["sport"]) {
  switch (sport) {
    case "football":   return "كرة قدم";
    case "basketball": return "كرة سلة";
    case "volleyball": return "كرة طائرة";
    case "athletics":  return "ألعاب قوى";
    case "swimming":   return "سباحة";
    case "boxing":     return "ملاكمة";
    case "other":      return "رياضة أخرى";
  }
}

export function getSportColor(sport: SportClub["sport"]) {
  switch (sport) {
    case "football":   return "#27AE60";
    case "basketball": return "#E67E22";
    case "volleyball": return "#2980B9";
    case "athletics":  return "#8E44AD";
    case "swimming":   return "#16A085";
    case "boxing":     return "#C0392B";
    case "other":      return Colors.textSecondary;
  }
}

export function getSportIcon(sport: SportClub["sport"]) {
  switch (sport) {
    case "football":   return "football-outline";
    case "basketball": return "basketball-outline";
    case "volleyball": return "tennisball-outline";
    case "athletics":  return "walk-outline";
    case "swimming":   return "water-outline";
    case "boxing":     return "fitness-outline";
    case "other":      return "trophy-outline";
  }
}

// ─── Club Card ────────────────────────────────────────────────────────────────

function ClubCard({ club, onCall }: { club: SportClub; onCall: (p: string) => void }) {
  const { t, isRTL } = useLang();
  const color = getSportColor(club.sport);
  const sportLabels = t("sports", "sportTypes");
  const getSportLabel = (s: SportClub["sport"]) => sportLabels[s] ?? s;

  return (
    <View style={styles.card}>
      <View style={[styles.cardTop, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <TouchableOpacity style={styles.callBtn} onPress={() => onCall(club.phone)}>
          <Ionicons name="call" size={18} color={Colors.cardBg} />
        </TouchableOpacity>
        <View style={[styles.cardInfo, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
          <Text style={[styles.cardName, { textAlign: isRTL ? "right" : "left" }]}>{club.name}</Text>
          <View style={[styles.sportRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Ionicons name={getSportIcon(club.sport) as any} size={13} color={color} />
            <Text style={[styles.sportLabel, { color }]}>{getSportLabel(club.sport)}</Text>
          </View>
          {club.description ? (
            <Text style={[styles.cardDesc, { textAlign: isRTL ? "right" : "left" }]} numberOfLines={2}>{club.description}</Text>
          ) : null}
        </View>
        <View style={[styles.cardIconCircle, { backgroundColor: color + "18" }]}>
          <Ionicons name={getSportIcon(club.sport) as any} size={26} color={color} />
        </View>
      </View>
      <View style={styles.cardDivider} />
      <View style={styles.cardDetails}>
        <View style={[styles.detailRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={[styles.detailValue, { textAlign: isRTL ? "right" : "left" }]}>{club.address}</Text>
          <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
        </View>
        {club.founded ? (
          <View style={[styles.detailRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text style={[styles.detailValue, { textAlign: isRTL ? "right" : "left" }]}>{t("sports", "founded")} {club.founded}</Text>
            <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event, onCall }: { event: SportEvent; onCall: (p: string) => void }) {
  const { t, isRTL, tr } = useLang();
  const color = getSportColor(event.sport);
  const sportLabels = t("sports", "sportTypes");
  const getSportLabel = (s: SportClub["sport"]) => sportLabels[s] ?? s;

  return (
    <View style={[styles.eventCard, { borderRightColor: isRTL ? color : "transparent", borderRightWidth: isRTL ? 4 : 0, borderLeftColor: !isRTL ? color : "transparent", borderLeftWidth: !isRTL ? 4 : 0 }]}>
      <View style={[styles.eventHeader, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
        <View style={[styles.eventSportBadge, { backgroundColor: color + "18", flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Ionicons name={getSportIcon(event.sport) as any} size={12} color={color} />
          <Text style={[styles.eventSportText, { color }]}>{getSportLabel(event.sport)}</Text>
        </View>
        <Text style={[styles.eventTitle, { textAlign: isRTL ? "right" : "left" }]}>{event.title}</Text>
      </View>
      <View style={styles.eventDetails}>
        <View style={[styles.detailRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={[styles.detailValue, { textAlign: isRTL ? "right" : "left" }]}>{event.date}</Text>
          <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
        </View>
        <View style={[styles.detailRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={[styles.detailValue, { textAlign: isRTL ? "right" : "left" }]}>{event.location}</Text>
          <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
        </View>
        {event.description ? (
          <Text style={[styles.eventDesc, { textAlign: isRTL ? "right" : "left" }]}>{event.description}</Text>
        ) : null}
      </View>
      {event.contactPhone ? (
        <TouchableOpacity style={[styles.eventCallBtn, { flexDirection: isRTL ? "row-reverse" : "row", alignSelf: isRTL ? "flex-start" : "flex-end" }]} onPress={() => onCall(event.contactPhone!)}>
          <Ionicons name="call-outline" size={14} color={Colors.primary} />
          <Text style={styles.eventCallText}>{t("common", "contact")}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

const SPORT_FILTERS: { key: "all" | SportClub["sport"]; label: string }[] = [
  { key: "all",        label: "الكل" },
  { key: "football",   label: "قدم" },
  { key: "basketball", label: "سلة" },
  { key: "volleyball", label: "طائرة" },
  { key: "athletics",  label: "قوى" },
  { key: "swimming",   label: "سباحة" },
  { key: "boxing",     label: "ملاكمة" },
  { key: "other",      label: "أخرى" },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

type ActiveTab = "clubs" | "events";

export default function SportsScreen() {
  const { t, isRTL, tr } = useLang();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [activeTab, setActiveTab] = useState<ActiveTab>("clubs");
  const [sportFilter, setSportFilter] = useState<"all" | SportClub["sport"]>("all");
  const [clubs, setClubs] = useState<SportClub[]>([]);
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [search, setSearch] = useState("");

  const sportLabels = t("sports", "sportTypes");
  const SPORT_FILTERS: { key: "all" | SportClub["sport"]; label: string }[] = useMemo(() => [
    { key: "all",        label: t("common", "all") },
    { key: "football",   label: sportLabels.football },
    { key: "basketball", label: sportLabels.basketball },
    { key: "volleyball", label: sportLabels.volleyball },
    { key: "athletics",  label: sportLabels.athletics },
    { key: "swimming",   label: tr("سباحة", "Swim") },
    { key: "boxing",     label: tr("ملاكمة", "Box") },
    { key: "other",      label: sportLabels.other },
  ], [t, sportLabels, tr]);

  const load = async () => {
    const [c, e] = await Promise.all([loadSportClubs(), loadSportEvents()]);
    setClubs(c);
    setEvents(e);
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const handleCall = (phone: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const clean = phone.replace(/[^0-9]/g, "");
    Alert.alert(t("common", "contact"), tr("اختر طريقة التواصل", "Choose contact method"), [
      { text: t("common", "cancel"), style: "cancel" },
      { text: "WhatsApp", onPress: () => Linking.openURL(`https://wa.me/${clean}`) },
      { text: tr("اتصال هاتفي", "Phone Call"), onPress: () => Linking.openURL(`tel:${phone}`) },
    ]);
  };

  const filteredClubs = clubs.filter(c =>
    (sportFilter === "all" || c.sport === sportFilter) &&
    (search === "" || c.name.toLowerCase().includes(search.toLowerCase()) || c.address.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredEvents = events.filter(e =>
    (sportFilter === "all" || e.sport === sportFilter) &&
    (search === "" || e.title.toLowerCase().includes(search.toLowerCase()) || e.location.toLowerCase().includes(search.toLowerCase()))
  );

  const bottomPad = Platform.OS === "web" ? 100 : 120;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.headerTitle, { textAlign: isRTL ? "right" : "left" }]}>{t("sports", "title")}</Text>
        <View style={[styles.searchRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t("sports", "search")}
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign={isRTL ? "right" : "left"}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.tabSwitch, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <AnimatedPress
            style={[styles.switchBtn, activeTab === "clubs" && styles.switchBtnActive, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => setActiveTab("clubs")}
            scaleDown={0.92}
          >
            <Ionicons name="people-outline" size={14} color={activeTab === "clubs" ? Colors.textPrimary : Colors.textMuted} />
            <Text style={[styles.switchBtnText, activeTab === "clubs" && styles.switchBtnTextActive]}>{t("sports", "clubs")}</Text>
          </AnimatedPress>
          <AnimatedPress
            style={[styles.switchBtn, activeTab === "events" && styles.switchBtnActive, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => setActiveTab("events")}
            scaleDown={0.92}
          >
            <Ionicons name="trophy-outline" size={14} color={activeTab === "events" ? Colors.textPrimary : Colors.textMuted} />
            <Text style={[styles.switchBtnText, activeTab === "events" && styles.switchBtnTextActive]}>{t("sports", "events")}</Text>
          </AnimatedPress>
        </View>
      </View>

      {/* Filter Bar */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.filtersRow} contentContainerStyle={[styles.filtersContent, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        {SPORT_FILTERS.map(f => (
          <AnimatedPress
            key={f.key}
            style={[styles.filterChip, sportFilter === f.key && styles.filterChipActive]}
            onPress={() => setSportFilter(f.key as any)}
            scaleDown={0.92}
          >
            <Text style={[styles.filterChipText, sportFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
          </AnimatedPress>
        ))}
      </ScrollView>

      {/* Clubs Tab */}
      {activeTab === "clubs" && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          {filteredClubs.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="football-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>{t("sports", "noClubs")}</Text>
              <Text style={styles.emptySubText}>{tr("تُضاف الأندية من لوحة الإدارة", "Clubs are added from the admin panel")}</Text>
            </View>
          )}
          {filteredClubs.map((club, index) => (
            <Animated.View key={club.id} entering={FadeInDown.delay(index * 60).springify().damping(18)}>
              <ClubCard club={club} onCall={handleCall} />
            </Animated.View>
          ))}
        </ScrollView>
      )}

      {/* Events Tab */}
      {activeTab === "events" && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          {filteredEvents.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="trophy-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>{t("sports", "noEvents")}</Text>
              <Text style={styles.emptySubText}>{tr("تُضاف الفعاليات من لوحة الإدارة", "Events are added from the admin panel")}</Text>
            </View>
          )}
          {filteredEvents.map((event, index) => (
            <Animated.View key={event.id} entering={FadeInDown.delay(index * 60).springify().damping(18)}>
              <EventCard event={event} onCall={handleCall} />
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.cardBg, paddingHorizontal: 16, paddingBottom: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary, textAlign: "right", marginBottom: 10 },
  searchRow: {
    flexDirection: "row-reverse", alignItems: "center", backgroundColor: Colors.bg,
    borderRadius: 12, paddingHorizontal: 12, gap: 8, marginBottom: 10,
  },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, paddingVertical: 9 },
  tabSwitch: { flexDirection: "row-reverse", backgroundColor: Colors.bg, borderRadius: 12, padding: 3, gap: 2 },
  switchBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 5 },
  switchBtnActive: {
    backgroundColor: Colors.cardBg,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  switchBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  switchBtnTextActive: { color: Colors.textPrimary, fontFamily: "Cairo_600SemiBold" },
  filtersRow: { backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  filtersContent: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterChipTextActive: { color: "#FFFFFF" },
  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 12 },
  emptyState: { alignItems: "center", paddingTop: 70, gap: 10 },
  emptyTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textSecondary },
  emptySubText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", padding: 14, gap: 12 },
  cardIconCircle: { width: 52, height: 52, borderRadius: 14, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  cardInfo: { flex: 1, alignItems: "flex-end", gap: 5 },
  cardName: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  sportRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  sportLabel: { fontFamily: "Cairo_500Medium", fontSize: 12 },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 18 },
  callBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center" },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 14 },
  cardDetails: { padding: 14, gap: 7 },
  detailRow: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  detailValue: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", flex: 1 },
  eventCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    overflow: "hidden",
  },
  eventHeader: { padding: 14, gap: 8, alignItems: "flex-end" },
  eventTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  eventSportBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  eventSportText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  eventDetails: { paddingHorizontal: 14, paddingBottom: 10, gap: 6 },
  eventDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 19, marginTop: 4 },
  eventCallBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    margin: 14, marginTop: 4,
    backgroundColor: Colors.primary + "12", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start",
  },
  eventCallText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.primary },
});
