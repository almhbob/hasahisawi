import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import AnimatedPress from "@/components/AnimatedPress";
import { MEDICAL_KEY } from "./(tabs)/medical";
import { LOST_ITEMS_KEY } from "./(tabs)/missing";
import { SCHOOLS_KEY } from "./(tabs)/student";
import { SPORT_CLUBS_KEY } from "./(tabs)/sports";
import { CULTURAL_CENTERS_KEY } from "./(tabs)/culture";

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  section: string;
  sectionLabel: string;
  icon: string;
  color: string;
  phone?: string;
  route?: string;
};

function contactOptions(phone: string) {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const clean = phone.replace(/[^0-9]/g, "");
  Alert.alert("التواصل", "اختر طريقة التواصل", [
    { text: "إلغاء", style: "cancel" },
    { text: "WhatsApp", onPress: () => Linking.openURL(`https://wa.me/${clean}`) },
    { text: "اتصال", onPress: () => Linking.openURL(`tel:${phone}`) },
  ]);
}

export default function SearchScreen() {
  const { t, isRTL, lang } = useLang();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const lower = q.toLowerCase().trim();
    const found: SearchResult[] = [];

    try {
      // ── Medical ──
      const medRaw = await AsyncStorage.getItem(MEDICAL_KEY);
      const facilities: any[] = medRaw ? JSON.parse(medRaw) : [];
      for (const f of facilities) {
        if (
          f.name?.toLowerCase().includes(lower) ||
          f.address?.toLowerCase().includes(lower) ||
          f.specialties?.some((s: string) => s.toLowerCase().includes(lower))
        ) {
          found.push({
            id: "med_" + f.id,
            title: f.name,
            subtitle: f.address + (f.isOnCall ? " · مناوب" : ""),
            section: "medical",
            sectionLabel: lang === "ar" ? "الدليل الطبي" : "Medical",
            icon: f.type === "pharmacy" ? "medical-bag" : f.type === "hospital" ? "hospital-building" : "stethoscope",
            color: f.type === "pharmacy" ? Colors.primary : f.type === "hospital" ? "#2E7D9A" : "#6A5ACD",
            phone: f.phone,
            route: "/(tabs)/medical",
          });
        }
      }

      // ── Lost & Found ──
      const lostRaw = await AsyncStorage.getItem(LOST_ITEMS_KEY);
      const lostItems: any[] = lostRaw ? JSON.parse(lostRaw) : [];
      for (const item of lostItems) {
        if (
          item.itemName?.toLowerCase().includes(lower) ||
          item.description?.toLowerCase().includes(lower) ||
          item.lastSeen?.toLowerCase().includes(lower)
        ) {
          found.push({
            id: "lost_" + item.id,
            title: item.itemName,
            subtitle: (item.status === "lost" ? (lang === "ar" ? "مفقود" : "Lost") : (lang === "ar" ? "موجود" : "Found")) + " · " + item.lastSeen,
            section: "missing",
            sectionLabel: lang === "ar" ? "المفقودات" : "Lost & Found",
            icon: "search-outline",
            color: item.status === "lost" ? Colors.danger : Colors.success,
            phone: item.contactPhone,
            route: "/(tabs)/missing",
          });
        }
      }

      // ── Schools ──
      const schRaw = await AsyncStorage.getItem(SCHOOLS_KEY);
      const schools: any[] = schRaw ? JSON.parse(schRaw) : [];
      for (const s of schools) {
        if (
          s.name?.toLowerCase().includes(lower) ||
          s.address?.toLowerCase().includes(lower)
        ) {
          found.push({
            id: "sch_" + s.id,
            title: s.name,
            subtitle: s.address,
            section: "student",
            sectionLabel: lang === "ar" ? "التعليم" : "Education",
            icon: "school-outline",
            color: "#4A3F9F",
            phone: s.phone,
            route: "/(tabs)/student",
          });
        }
      }

      // ── Sports ──
      const sportsRaw = await AsyncStorage.getItem(SPORT_CLUBS_KEY);
      const clubs: any[] = sportsRaw ? JSON.parse(sportsRaw) : [];
      for (const c of clubs) {
        if (
          c.name?.toLowerCase().includes(lower) ||
          c.address?.toLowerCase().includes(lower) ||
          c.description?.toLowerCase().includes(lower)
        ) {
          found.push({
            id: "sport_" + c.id,
            title: c.name,
            subtitle: c.address || "",
            section: "sports",
            sectionLabel: lang === "ar" ? "الرياضة" : "Sports",
            icon: "football-outline",
            color: "#27AE60",
            phone: c.phone,
            route: "/(tabs)/sports",
          });
        }
      }

      // ── Culture ──
      const cultRaw = await AsyncStorage.getItem(CULTURAL_CENTERS_KEY);
      const centers: any[] = cultRaw ? JSON.parse(cultRaw) : [];
      for (const c of centers) {
        if (
          c.name?.toLowerCase().includes(lower) ||
          c.address?.toLowerCase().includes(lower) ||
          c.description?.toLowerCase().includes(lower)
        ) {
          found.push({
            id: "cult_" + c.id,
            title: c.name,
            subtitle: c.address || "",
            section: "culture",
            sectionLabel: lang === "ar" ? "الثقافة" : "Culture",
            icon: "color-palette-outline",
            color: "#8E44AD",
            phone: c.phone,
            route: "/(tabs)/culture",
          });
        }
      }

      // ── Jobs ──
      const jobsRaw = await AsyncStorage.getItem("jobs_listings");
      const jobs: any[] = jobsRaw ? JSON.parse(jobsRaw) : [];
      for (const j of jobs) {
        if (
          j.title?.toLowerCase().includes(lower) ||
          j.company?.toLowerCase().includes(lower) ||
          j.description?.toLowerCase().includes(lower) ||
          j.location?.toLowerCase().includes(lower)
        ) {
          found.push({
            id: "job_" + j.id,
            title: j.title,
            subtitle: j.company + " · " + j.location,
            section: "jobs",
            sectionLabel: lang === "ar" ? "الوظائف" : "Jobs",
            icon: "briefcase-outline",
            color: "#1E6E8A",
            phone: j.contactPhone,
            route: "/(tabs)/jobs",
          });
        }
      }

      // ── Market ──
      const famRaw = await AsyncStorage.getItem("family_market_v1");
      const famItems: any[] = famRaw ? JSON.parse(famRaw) : [];
      for (const item of famItems) {
        if (
          item.itemName?.toLowerCase().includes(lower) ||
          item.sellerName?.toLowerCase().includes(lower) ||
          item.description?.toLowerCase().includes(lower)
        ) {
          found.push({
            id: "fam_" + item.id,
            title: item.itemName,
            subtitle: item.sellerName + " · " + item.price,
            section: "market",
            sectionLabel: lang === "ar" ? "السوق" : "Market",
            icon: "storefront-outline",
            color: "#7B3F00",
            phone: item.contactPhone,
            route: "/(tabs)/market",
          });
        }
      }

      const aucRaw = await AsyncStorage.getItem("auction_market_v1");
      const aucItems: any[] = aucRaw ? JSON.parse(aucRaw) : [];
      for (const item of aucItems) {
        if (
          item.itemName?.toLowerCase().includes(lower) ||
          item.description?.toLowerCase().includes(lower)
        ) {
          found.push({
            id: "auc_" + item.id,
            title: item.itemName,
            subtitle: item.price + " · " + (item.condition === "new" ? (lang === "ar" ? "جديد" : "New") : item.condition === "like_new" ? (lang === "ar" ? "شبه جديد" : "Like New") : (lang === "ar" ? "مستعمل" : "Used")),
            section: "market",
            sectionLabel: lang === "ar" ? "السوق" : "Market",
            icon: "hammer-outline",
            color: "#7B3F00",
            phone: item.contactPhone,
            route: "/(tabs)/market",
          });
        }
      }

    } catch (e) {
      console.error("Search error:", e);
    }

    setResults(found);
    setSearching(false);
  }, [lang]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    doSearch(text);
  };

  const renderItem = ({ item, index }: { item: SearchResult; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 40).springify().damping(18)}>
      <AnimatedPress onPress={() => item.route ? router.push(item.route as any) : undefined}>
        <View style={[styles.resultCard, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.resultIcon, { backgroundColor: item.color + "18" }]}>
            <Ionicons name={item.icon as any} size={22} color={item.color} />
          </View>
          <View style={[styles.resultContent, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
            <Text style={[styles.resultTitle, { textAlign: isRTL ? "right" : "left" }]}>{item.title}</Text>
            <Text style={[styles.resultSub, { textAlign: isRTL ? "right" : "left" }]}>{item.subtitle}</Text>
            <View style={[styles.resultBadge, { backgroundColor: item.color + "15", borderColor: item.color + "30" }]}>
              <Text style={[styles.resultBadgeText, { color: item.color }]}>{item.sectionLabel}</Text>
            </View>
          </View>
          {item.phone && (
            <TouchableOpacity
              style={styles.callBtn}
              onPress={() => contactOptions(item.phone!)}
            >
              <Ionicons name="call-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </AnimatedPress>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{lang === "ar" ? "البحث الشامل" : "Global Search"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Input */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Ionicons name="search-outline" size={20} color={Colors.textMuted} style={{ marginHorizontal: 12 }} />
          <TextInput
            style={[styles.searchInput, { textAlign: isRTL ? "right" : "left" }]}
            value={query}
            onChangeText={handleQueryChange}
            placeholder={lang === "ar" ? "ابحث في كل الأقسام..." : "Search all sections..."}
            placeholderTextColor={Colors.textMuted}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(""); setResults([]); }} style={{ marginHorizontal: 8 }}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      {query.trim().length === 0 ? (
        <Animated.View entering={FadeIn} style={styles.emptyState}>
          <Ionicons name="search-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>{lang === "ar" ? "ابحث في كل الأقسام" : "Search All Sections"}</Text>
          <Text style={styles.emptySub}>
            {lang === "ar"
              ? "يمكنك البحث في الدليل الطبي، المفقودات، الوظائف، السوق، التعليم، الرياضة والثقافة"
              : "Search across Medical, Lost & Found, Jobs, Market, Education, Sports and Culture"}
          </Text>
          <View style={styles.sectionChips}>
            {[
              { label: lang === "ar" ? "🏥 طبي" : "🏥 Medical", color: Colors.primary },
              { label: lang === "ar" ? "🔍 مفقودات" : "🔍 Lost & Found", color: Colors.danger },
              { label: lang === "ar" ? "💼 وظائف" : "💼 Jobs", color: "#1E6E8A" },
              { label: lang === "ar" ? "🛒 سوق" : "🛒 Market", color: "#7B3F00" },
              { label: lang === "ar" ? "🎓 تعليم" : "🎓 Education", color: "#4A3F9F" },
              { label: lang === "ar" ? "⚽ رياضة" : "⚽ Sports", color: "#27AE60" },
              { label: lang === "ar" ? "🎨 ثقافة" : "🎨 Culture", color: "#8E44AD" },
            ].map((chip, i) => (
              <View key={i} style={[styles.chip, { borderColor: chip.color + "40", backgroundColor: chip.color + "10" }]}>
                <Text style={[styles.chipText, { color: chip.color }]}>{chip.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : results.length === 0 && !searching ? (
        <Animated.View entering={FadeIn} style={styles.emptyState}>
          <Ionicons name="search-circle-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>{lang === "ar" ? "لا توجد نتائج" : "No Results"}</Text>
          <Text style={styles.emptySub}>{lang === "ar" ? `لم يتم العثور على نتائج لـ "${query}"` : `No results found for "${query}"`}</Text>
        </Animated.View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            results.length > 0 ? (
              <Text style={[styles.resultsCount, { textAlign: isRTL ? "right" : "left" }]}>
                {lang === "ar" ? `${results.length} نتيجة` : `${results.length} result${results.length !== 1 ? "s" : ""}`}
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  searchWrap: { padding: 16 },
  searchBox: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: "center",
    height: 52,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: Colors.textPrimary,
    height: "100%",
  },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  resultsCount: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 12,
    marginTop: 4,
  },
  resultCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  resultIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  resultContent: { flex: 1, gap: 4 },
  resultTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  resultSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
  resultBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 2,
  },
  resultBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
    marginTop: -40,
  },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textSecondary },
  emptySub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  sectionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontFamily: "Cairo_500Medium", fontSize: 12 },
});
