import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, {
  FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle,
  withTiming, interpolate, Extrapolation,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";

const { width, height } = Dimensions.get("window");

export const ONBOARDING_KEY = "@hasahisawi_onboarding_done";

type Tile = { icon: keyof typeof Ionicons.glyphMap; ink: string; tint: string };
type Slide = {
  id: string;
  tiles: Tile[];
  title: string;
  subtitle: string;
};

// Same four service families as the home screen, so onboarding previews the real app.
const HEALTH    = { ink: "#B42318", tint: "#FCEBE9" };
const COMMUNITY = { ink: "#00664A", tint: "#E3F2EC" };
const MARKET    = { ink: "#8A6400", tint: "#FAF1D8" };
const MOVE      = { ink: "#1D5C8C", tint: "#E5EFF7" };
const NEUTRAL   = { ink: "#3D4F48", tint: "#E9EEEC" };

const SLIDES: Slide[] = [
  {
    id: "welcome",
    tiles: [
      { icon: "medkit-outline", ...HEALTH }, { icon: "people-outline", ...COMMUNITY },
      { icon: "storefront-outline", ...MARKET }, { icon: "bus-outline", ...MOVE },
    ],
    title: "مرحباً بك في حصاحيصاوي",
    subtitle: "بوابتك الذكية لمدينة الحصاحيصا — ربط المجتمع بخدماته في مكان واحد",
  },
  {
    id: "services",
    tiles: [
      { icon: "calendar-outline", ...HEALTH }, { icon: "school-outline", ...COMMUNITY },
      { icon: "briefcase-outline", ...MARKET }, { icon: "airplane-outline", ...MOVE },
    ],
    title: "خدمات متكاملة بين يديك",
    subtitle: "دليل طبي، مواعيد، وظائف، سوق، تعليم، رياضة، ثقافة — كل ما تحتاجه في تطبيق واحد",
  },
  {
    id: "community",
    tiles: [
      { icon: "chatbubbles-outline", ...COMMUNITY }, { icon: "newspaper-outline", ...COMMUNITY },
      { icon: "heart-outline", ...COMMUNITY }, { icon: "people-circle-outline", ...COMMUNITY },
    ],
    title: "مجتمع نابض بالتواصل",
    subtitle: "تواصل مع أبناء مدينتك، شارك المنشورات، تراسل في الخاص، وكن جزءاً من المجتمع",
  },
  {
    id: "reports",
    tiles: [
      { icon: "flash-outline", ...MARKET }, { icon: "water-outline", ...MOVE },
      { icon: "construct-outline", ...NEUTRAL }, { icon: "megaphone-outline", ...HEALTH },
    ],
    title: "صوتك يُغيّر المدينة",
    subtitle: "بلّغ عن مشاكل الكهرباء والمياه والطرق، وقدّم مقترحاتك لتطوير مدينتك",
  },
  {
    id: "disclaimer",
    tiles: [{ icon: "information-circle-outline", ...NEUTRAL }],
    title: "منصة مجتمعية مستقلة",
    subtitle: "حصاحيصاوي منصة أهلية مستقلة من أبناء المدينة، وليست تابعة لأي جهة حكومية أو رسمية. المعلومات المتوفرة للإرشاد فقط.",
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(0);
  const progress = useSharedValue(0);
  const { lang, setLanguage } = useLang();

  const goNext = () => {
    if (current < SLIDES.length - 1) {
      const next = current + 1;
      setCurrent(next);
      progress.value = withTiming(next, { duration: 350 });
    } else {
      handleFinish();
    }
  };

  const goBack = () => {
    if (current > 0) {
      const prev = current - 1;
      setCurrent(prev);
      progress.value = withTiming(prev, { duration: 350 });
    }
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/login" as any);
  };

  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <StatusBar style="dark" />

      {/* شريط أعلى الشاشة: زر تخطّ + محدد اللغة */}
      <View style={styles.topBar}>
        {/* محدد اللغة */}
        <View style={styles.langToggle}>
          <TouchableOpacity
            style={[styles.langOption, lang === "ar" && styles.langOptionActive]}
            onPress={() => lang !== "ar" && setLanguage("ar")}
          >
            <Text style={[styles.langOptionText, lang === "ar" && styles.langOptionTextActive]}>ع</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langOption, lang === "en" && styles.langOptionActive]}
            onPress={() => lang !== "en" && setLanguage("en")}
          >
            <Text style={[styles.langOptionText, lang === "en" && styles.langOptionTextActive]}>EN</Text>
          </TouchableOpacity>
        </View>

        {/* Skip */}
        {!isLast ? (
          <TouchableOpacity style={styles.skipBtn} onPress={handleFinish}>
            <Text style={styles.skipText}>{lang === "ar" ? "تخطّ" : "Skip"}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Content */}
      <Animated.View key={slide.id} entering={FadeInDown.springify().damping(18)} style={styles.slideContent}>
        <View style={styles.tileGrid}>
          {slide.tiles.map((t, i) => (
            <View
              key={i}
              style={[styles.tile, slide.tiles.length === 1 && styles.tileSolo, { backgroundColor: t.tint }]}
            >
              <Ionicons name={t.icon} size={slide.tiles.length === 1 ? 56 : 40} color={t.ink} />
            </View>
          ))}
        </View>

        {/* Text */}
        <Animated.View entering={FadeInUp.delay(80).springify()} style={styles.textBlock}>
          <Text style={styles.slideTitle}>{slide.title}</Text>
          <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>
        </Animated.View>
      </Animated.View>

      {/* Bottom */}
      <View style={styles.bottom}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => { setCurrent(i); progress.value = withTiming(i, { duration: 300 }); }}>
              <View style={[
                styles.dot,
                i === current && styles.dotActive,
              ]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Nav Buttons */}
        <View style={styles.navRow}>
          {current > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              <Text style={styles.backText}>السابق</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <TouchableOpacity onPress={goNext} activeOpacity={0.85}>
            <View style={styles.nextBtn}>
              <Text style={styles.nextText}>{isLast ? "ابدأ الآن" : "التالي"}</Text>
              <Ionicons name={isLast ? "checkmark" : "chevron-back"} size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: "center",
  },
  topBar: {
    width: "100%",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    marginBottom: 4,
  },
  langToggle: {
    flexDirection: "row",
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: "hidden",
  },
  langOption: {
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  langOptionActive: {
    backgroundColor: Colors.primaryDeep,
  },
  langOptionText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
  },
  langOptionTextActive: {
    color: "#fff",
  },
  skipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skipText: {
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    color: Colors.textMuted,
  },
  slideContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width,
    paddingHorizontal: 32,
    position: "relative",
  },
  tileGrid: {
    width: 216,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 44,
  },
  tile: {
    width: 102,
    height: 102,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  tileSolo: { width: 140, height: 140, borderRadius: 40 },
  textBlock: {
    alignItems: "center",
    gap: 14,
  },
  slideTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    color: Colors.textPrimary,
    textAlign: "center",
    lineHeight: 36,
  },
  slideSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 26,
    maxWidth: 300,
  },
  bottom: {
    width: "100%",
    paddingHorizontal: 24,
    gap: 24,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.divider,
  },
  dotActive: {
    width: 24,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primaryDeep,
  },
  navRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    flex: 1,
  },
  backText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 15,
    color: Colors.textMuted,
  },
  nextBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primaryDeep,
  },
  nextText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#fff",
  },
});
