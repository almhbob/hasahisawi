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
import * as Haptics from "expo-haptics";
import { fsGetCollection, COLLECTIONS, orderBy, isFirebaseAvailable } from "@/lib/firebase/firestore";
import { useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CulturalCenter = {
  id: string;
  name: string;
  type: "library" | "cultural_center" | "art_center" | "theater" | "museum" | "heritage" | "other";
  address: string;
  phone: string;
  description?: string;
  hours?: string;
};

export type CulturalEvent = {
  id: string;
  title: string;
  type: "exhibition" | "workshop" | "lecture" | "festival" | "book_fair" | "theater" | "other";
  date: string;
  location: string;
  description?: string;
  contactPhone?: string;
};

export const CULTURAL_CENTERS_KEY = "cultural_centers_v1"; // kept for search.tsx compat
export const CULTURAL_EVENTS_KEY = "cultural_events_v1";

export async function loadCulturalCenters(): Promise<CulturalCenter[]> {
  try {
    if (isFirebaseAvailable()) {
      return await fsGetCollection<CulturalCenter>(COLLECTIONS.CULTURAL, orderBy("name"));
    }
    return [];
  } catch { return []; }
}

export async function loadCulturalEvents(): Promise<CulturalEvent[]> {
  try {
    if (isFirebaseAvailable()) {
      return await fsGetCollection<CulturalEvent>("cultural_events", orderBy("date", "desc"));
    }
    return [];
  } catch { return []; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCenterTypeLabel(type: CulturalCenter["type"]) {
  switch (type) {
    case "library":        return "مكتبة";
    case "cultural_center":return "مركز ثقافي";
    case "art_center":     return "مركز فنون";
    case "theater":        return "مسرح";
    case "museum":         return "متحف";
    case "heritage":       return "موروث وتراث";
    case "other":          return "أخرى";
  }
}

export function getCenterTypeColor(type: CulturalCenter["type"]) {
  switch (type) {
    case "library":        return "#2980B9";
    case "cultural_center":return "#8E44AD";
    case "art_center":     return "#D35400";
    case "theater":        return "#C0392B";
    case "museum":         return "#16A085";
    case "heritage":       return Colors.accent;
    case "other":          return Colors.textSecondary;
  }
}

export function getCenterTypeIcon(type: CulturalCenter["type"]) {
  switch (type) {
    case "library":        return "library-outline";
    case "cultural_center":return "globe-outline";
    case "art_center":     return "color-palette-outline";
    case "theater":        return "mic-outline";
    case "museum":         return "business-outline";
    case "heritage":       return "leaf-outline";
    case "other":          return "star-outline";
  }
}

export function getEventTypeLabel(type: CulturalEvent["type"]) {
  switch (type) {
    case "exhibition": return "معرض";
    case "workshop":   return "ورشة عمل";
    case "lecture":    return "محاضرة";
    case "festival":   return "مهرجان";
    case "book_fair":  return "معرض كتاب";
    case "theater":    return "عرض مسرحي";
    case "other":      return "نشاط آخر";
  }
}

export function getEventTypeColor(type: CulturalEvent["type"]) {
  switch (type) {
    case "exhibition": return "#D35400";
    case "workshop":   return "#27AE60";
    case "lecture":    return "#2980B9";
    case "festival":   return "#8E44AD";
    case "book_fair":  return Colors.accent;
    case "theater":    return "#C0392B";
    case "other":      return Colors.textSecondary;
  }
}

export function getEventTypeIcon(type: CulturalEvent["type"]) {
  switch (type) {
    case "exhibition": return "image-outline";
    case "workshop":   return "construct-outline";
    case "lecture":    return "mic-outline";
    case "festival":   return "sparkles-outline";
    case "book_fair":  return "book-outline";
    case "theater":    return "film-outline";
    case "other":      return "star-outline";
  }
}

// ─── Center Card ──────────────────────────────────────────────────────────────

function CenterCard({ center, onCall }: { center: CulturalCenter; onCall: (p: string) => void }) {
  const { t, isRTL } = useLang();
  const color = getCenterTypeColor(center.type);
  const centerLabels = t("culture", "centerTypes");
  const getCenterLabel = (type: CulturalCenter["type"]) => centerLabels[type === "cultural_center" ? "community" : type === "art_center" ? "gallery" : type] ?? type;

  return (
    <View style={styles.card}>
      <View style={[styles.cardTop, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <AnimatedPress style={styles.callBtn} onPress={() => onCall(center.phone)}>
          <Ionicons name="call" size={18} color={Colors.cardBg} />
        </AnimatedPress>
        <View style={[styles.cardInfo, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
          <Text style={[styles.cardName, { textAlign: isRTL ? "right" : "left" }]}>{center.name}</Text>
          <View style={[styles.typeRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Ionicons name={getCenterTypeIcon(center.type) as any} size={13} color={color} />
            <Text style={[styles.typeLabel, { color }]}>{getCenterLabel(center.type)}</Text>
          </View>
          {center.description ? (
            <Text style={[styles.cardDesc, { textAlign: isRTL ? "right" : "left" }]} numberOfLines={2}>{center.description}</Text>
          ) : null}
        </View>
        <View style={[styles.cardIconCircle, { backgroundColor: color + "18" }]}>
          <Ionicons name={getCenterTypeIcon(center.type) as any} size={26} color={color} />
        </View>
      </View>
      <View style={styles.cardDivider} />
      <View style={styles.cardDetails}>
        <View style={[styles.detailRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={[styles.detailValue, { textAlign: isRTL ? "right" : "left" }]}>{center.address}</Text>
          <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
        </View>
        {center.hours ? (
          <View style={[styles.detailRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text style={[styles.detailValue, { textAlign: isRTL ? "right" : "left" }]}>{center.hours}</Text>
            <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event, onCall }: { event: CulturalEvent; onCall: (p: string) => void }) {
  const { t, isRTL } = useLang();
  const color = getEventTypeColor(event.type);
  const eventLabels = t("culture", "eventTypes");
  const getEventLabel = (type: CulturalEvent["type"]) => eventLabels[type === "workshop" ? "other" : type === "festival" ? "concert" : type === "book_fair" ? "exhibition" : type] ?? type;

  return (
    <View style={[styles.eventCard, { borderRightColor: isRTL ? color : "transparent", borderRightWidth: isRTL ? 4 : 0, borderLeftColor: !isRTL ? color : "transparent", borderLeftWidth: !isRTL ? 4 : 0 }]}>
      <View style={[styles.eventHeader, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
        <View style={[styles.eventBadge, { backgroundColor: color + "18", flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Ionicons name={getEventTypeIcon(event.type) as any} size={12} color={color} />
          <Text style={[styles.eventBadgeText, { color }]}>{getEventLabel(event.type)}</Text>
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
        <AnimatedPress style={[styles.contactBtn, { flexDirection: isRTL ? "row-reverse" : "row", alignSelf: isRTL ? "flex-start" : "flex-end" }]} onPress={() => onCall(event.contactPhone!)}>
          <Ionicons name="call-outline" size={14} color={Colors.primary} />
          <Text style={styles.contactBtnText}>{t("common", "contact")}</Text>
        </AnimatedPress>
      ) : null}
    </View>
  );
}

// ─── Filter Data ──────────────────────────────────────────────────────────────

const CENTER_FILTERS: { key: "all" | CulturalCenter["type"]; label: string }[] = [
  { key: "all",            label: "الكل" },
  { key: "library",        label: "مكتبة" },
  { key: "cultural_center",label: "ثقافي" },
  { key: "art_center",     label: "فنون" },
  { key: "theater",        label: "مسرح" },
  { key: "museum",         label: "متحف" },
  { key: "heritage",       label: "تراث" },
];

const EVENT_FILTERS: { key: "all" | CulturalEvent["type"]; label: string }[] = [
  { key: "all",       label: "الكل" },
  { key: "exhibition",label: "معرض" },
  { key: "workshop",  label: "ورشة" },
  { key: "lecture",   label: "محاضرة" },
  { key: "festival",  label: "مهرجان" },
  { key: "book_fair", label: "كتاب" },
  { key: "theater",   label: "مسرحية" },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

type ActiveTab = "centers" | "events";

export default function CultureScreen() {
  const { t, isRTL, tr } = useLang();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [activeTab, setActiveTab] = useState<ActiveTab>("centers");
  const [centerFilter, setCenterFilter] = useState<"all" | CulturalCenter["type"]>("all");
  const [eventFilter, setEventFilter] = useState<"all" | CulturalEvent["type"]>("all");
  const [centers, setCenters] = useState<CulturalCenter[]>([]);
  const [events, setEvents] = useState<CulturalEvent[]>([]);
  const [search, setSearch] = useState("");

  const centerLabels = t("culture", "centerTypes");
  const eventLabels = t("culture", "eventTypes");

  const CENTER_FILTERS = useMemo(() => [
    { key: "all",            label: t("common", "all") },
    { key: "library",        label: centerLabels.library },
    { key: "cultural_center",label: centerLabels.community },
    { key: "art_center",     label: centerLabels.gallery },
    { key: "theater",        label: centerLabels.theater },
    { key: "museum",         label: tr("متحف", "Museum") },
    { key: "heritage",       label: centerLabels.youth },
  ], [t, centerLabels, tr]);

  const EVENT_FILTERS = useMemo(() => [
    { key: "all",       label: t("common", "all") },
    { key: "exhibition",label: eventLabels.exhibition },
    { key: "workshop",  label: eventLabels.other },
    { key: "lecture",   label: eventLabels.lecture },
    { key: "festival",  label: eventLabels.concert },
    { key: "book_fair", label: eventLabels.exhibition },
    { key: "theater",   label: t("culture", "eventTypes").concert },
  ], [t, eventLabels]);

  const load = async () => {
    const [c, e] = await Promise.all([loadCulturalCenters(), loadCulturalEvents()]);
    setCenters(c);
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

  const filteredCenters = centers.filter(c =>
    (centerFilter === "all" || c.type === centerFilter) &&
    (search === "" || c.name.toLowerCase().includes(search.toLowerCase()) || c.address.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredEvents  = events.filter(e =>
    (eventFilter === "all" || e.type === eventFilter) &&
    (search === "" || e.title.toLowerCase().includes(search.toLowerCase()) || e.location.toLowerCase().includes(search.toLowerCase()))
  );
  const bottomPad = Platform.OS === "web" ? 100 : 120;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.headerTitle, { textAlign: isRTL ? "right" : "left" }]}>{t("culture", "title")}</Text>
        <View style={[styles.searchRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t("culture", "search")}
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign={isRTL ? "right" : "left"}
          />
          {search.length > 0 && (
            <AnimatedPress onPress={() => setSearch("")} scaleDown={0.92}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </AnimatedPress>
          )}
        </View>
        <View style={[styles.tabSwitch, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <AnimatedPress
            style={[styles.switchBtn, activeTab === "centers" && styles.switchBtnActive, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => setActiveTab("centers")}
            scaleDown={0.92}
          >
            <Ionicons name="library-outline" size={14} color={activeTab === "centers" ? Colors.textPrimary : Colors.textMuted} />
            <Text style={[styles.switchBtnText, activeTab === "centers" && styles.switchBtnTextActive]}>{t("culture", "centers")}</Text>
          </AnimatedPress>
          <AnimatedPress
            style={[styles.switchBtn, activeTab === "events" && styles.switchBtnActive, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => setActiveTab("events")}
            scaleDown={0.92}
          >
            <Ionicons name="sparkles-outline" size={14} color={activeTab === "events" ? Colors.textPrimary : Colors.textMuted} />
            <Text style={[styles.switchBtnText, activeTab === "events" && styles.switchBtnTextActive]}>{t("culture", "events")}</Text>
          </AnimatedPress>
        </View>
      </View>

      {/* Filter Bar */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.filtersRow} contentContainerStyle={[styles.filtersContent, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        {(activeTab === "centers" ? CENTER_FILTERS : EVENT_FILTERS).map(f => (
          <AnimatedPress
            key={f.key}
            style={[
              styles.filterChip,
              (activeTab === "centers" ? centerFilter : eventFilter) === f.key && styles.filterChipActive,
            ]}
            onPress={() =>
              activeTab === "centers"
                ? setCenterFilter(f.key as any)
                : setEventFilter(f.key as any)
            }
            scaleDown={0.92}
          >
            <Text style={[
              styles.filterChipText,
              (activeTab === "centers" ? centerFilter : eventFilter) === f.key && styles.filterChipTextActive,
            ]}>{f.label}</Text>
          </AnimatedPress>
        ))}
      </ScrollView>

      {/* Centers Tab */}
      {activeTab === "centers" && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          {filteredCenters.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="globe-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>{t("culture", "noCenters")}</Text>
              <Text style={styles.emptySubText}>{tr("تُضاف المراكز من لوحة الإدارة", "Centers are added from the admin panel")}</Text>
            </View>
          )}
          {filteredCenters.map((center, index) => (
            <Animated.View key={center.id} entering={FadeInDown.delay(index * 60).springify().damping(18)}>
              <CenterCard center={center} onCall={handleCall} />
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
              <Ionicons name="sparkles-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>{t("culture", "noEvents")}</Text>
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
  switchBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 5,
  },
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
  typeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  typeLabel: { fontFamily: "Cairo_500Medium", fontSize: 12 },
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
  eventBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  eventBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  eventDetails: { paddingHorizontal: 14, paddingBottom: 10, gap: 6 },
  eventDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 19, marginTop: 4 },
  contactBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    margin: 14, marginTop: 4, alignSelf: "flex-start",
    backgroundColor: Colors.primary + "12", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  contactBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.primary },
});
