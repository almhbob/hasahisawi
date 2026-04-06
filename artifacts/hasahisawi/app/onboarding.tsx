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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";

const { width, height } = Dimensions.get("window");

export const ONBOARDING_KEY = "@hasahisawi_onboarding_done";

type Slide = {
  id: string;
  icon: string;
  iconLib: "ionicons" | "mci";
  color: string;
  bg: string;
  title: string;
  subtitle: string;
};

const SLIDES: Slide[] = [
  {
    id: "welcome",
    icon: "home-city",
    iconLib: "mci",
    color: Colors.primary,
    bg: Colors.primary + "18",
    title: "مرحباً بك في حصاحيصاوي",
    subtitle: "بوابتك الذكية لمدينة الحصاحيصا — ربط المجتمع بخدماته في مكان واحد",
  },
  {
    id: "services",
    icon: "grid",
    iconLib: "ionicons",
    color: Colors.accent,
    bg: Colors.accent + "18",
    title: "خدمات متكاملة بين يديك",
    subtitle: "دليل طبي، مواعيد، وظائف، سوق، تعليم، رياضة، ثقافة — كل ما تحتاجه في تطبيق واحد",
  },
  {
    id: "community",
    icon: "people",
    iconLib: "ionicons",
    color: "#8B72BE",
    bg: "#8B72BE18",
    title: "مجتمع نابض بالتواصل",
    subtitle: "تواصل مع أبناء مدينتك، شارك المنشورات، تراسل في الخاص، وكن جزءاً من المجتمع",
  },
  {
    id: "reports",
    icon: "megaphone",
    iconLib: "ionicons",
    color: Colors.danger,
    bg: Colors.danger + "18",
    title: "صوتك يُغيّر المدينة",
    subtitle: "بلّغ عن مشاكل الكهرباء والمياه والطرق، وقدّم مقترحاتك لتطوير مدينتك",
  },
  {
    id: "disclaimer",
    icon: "information-circle",
    iconLib: "ionicons",
    color: "#6B7280",
    bg: "#6B728018",
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
      <StatusBar style="light" />

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
        {/* Icon Circle */}
        <View style={[styles.iconCircleOuter, { backgroundColor: slide.bg }]}>
          <LinearGradient
            colors={[slide.color + "20", slide.color + "08"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          />
          <View style={[styles.iconCircleInner, { backgroundColor: slide.color + "22", borderColor: slide.color + "40" }]}>
            {slide.iconLib === "ionicons" ? (
              <Ionicons name={slide.icon as any} size={56} color={slide.color} />
            ) : (
              <MaterialCommunityIcons name={slide.icon as any} size={56} color={slide.color} />
            )}
          </View>
        </View>

        {/* Decorative ring */}
        <View style={[styles.ring, { borderColor: slide.color + "20" }]} />
        <View style={[styles.ring2, { borderColor: slide.color + "10" }]} />

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
                i === current && { backgroundColor: slide.color },
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
            <LinearGradient
              colors={isLast ? [Colors.primary, Colors.primaryDim] : [slide.color, slide.color + "CC"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.nextBtn}
            >
              <Text style={styles.nextText}>{isLast ? "ابدأ الآن" : "التالي"}</Text>
              <Ionicons name={isLast ? "checkmark" : "chevron-back"} size={20} color="#fff" />
            </LinearGradient>
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
    backgroundColor: Colors.primary,
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
  iconCircleOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 48,
    overflow: "hidden",
  },
  iconCircleInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
    top: height * 0.12,
  },
  ring2: {
    position: "absolute",
    width: 290,
    height: 290,
    borderRadius: 145,
    borderWidth: 1,
    top: height * 0.095,
  },
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
    paddingVertical: 14,
    borderRadius: 16,
  },
  nextText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#fff",
  },
});
