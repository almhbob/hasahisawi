import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";

type Feature = { icon: keyof typeof Ionicons.glyphMap; text: string };

type Props = {
  children?: React.ReactNode;
  /** ما يظهر للزائر فوق الغلاف كمعاينة — عناوين فقط */
  preview?: React.ReactNode;
  /** عنوان المحتوى المقفل */
  title?: string;
  /** وصف المزايا التي سيحصل عليها بعد التسجيل */
  features?: Feature[];
};

const DEFAULT_FEATURES: Feature[] = [
  { icon: "chatbubbles-outline",  text: "تفاعل مع منشورات المجتمع" },
  { icon: "pencil-outline",       text: "أضف منشوراتك وآراءك" },
  { icon: "heart-outline",        text: "أعجب بالمحتوى وعلّق عليه" },
  { icon: "briefcase-outline",    text: "انشر إعلانات الوظائف" },
  { icon: "notifications-outline",text: "استقبل إشعارات فورية" },
];

export default function GuestGate({ children, preview, title, features }: Props) {
  const { isGuest, logout } = useAuth();
  const { isRTL, tr } = useLang();

  if (!isGuest) return children ? <>{children}</> : null;

  const handleRegister = async () => {
    await logout();       // تسجيل الخروج من وضع الزائر → AuthGate يوجه لـ /login تلقائياً
  };

  const featureList = features ?? DEFAULT_FEATURES;
  const lockTitle   = title ?? tr("محتوى حصري للأعضاء", "Members-Only Content");

  return (
    <View style={styles.root}>
      {/* ──── معاينة خافتة للمحتوى ──────────────────────── */}
      {preview ? (
        <View style={styles.previewWrap} pointerEvents="none">
          <View style={styles.previewContent}>{preview}</View>
          {/* تدرج يخفي باقي المحتوى */}
          <LinearGradient
            colors={["transparent", Colors.bg + "CC", Colors.bg]}
            style={styles.previewFade}
          />
        </View>
      ) : null}

      {/* ──── بطاقة القفل الاحترافية ─────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.delay(120).springify().damping(18)} style={styles.card}>

          {/* أيقونة القفل مع توهج */}
          <View style={styles.lockIconWrap}>
            <View style={styles.lockGlow} />
            <Ionicons name="lock-closed" size={32} color={Colors.accent} />
          </View>

          {/* عنوان وتفاصيل */}
          <Text style={styles.cardTitle}>{lockTitle}</Text>
          <Text style={styles.cardSub}>
            {tr(
              "أنشئ حسابك المجاني في ثوانٍ واستمتع بكل مزايا حصاحيصاوي",
              "Create your free account in seconds and enjoy all features",
            )}
          </Text>

          {/* قائمة المزايا */}
          <View style={styles.featureList}>
            {featureList.map((f, i) => (
              <View
                key={i}
                style={[styles.featureRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}
              >
                <View style={styles.featureIconBox}>
                  <Ionicons name={f.icon} size={16} color={Colors.primary} />
                </View>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>

          {/* زر التسجيل الرئيسي */}
          <TouchableOpacity
            style={styles.registerBtn}
            onPress={handleRegister}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.registerGradient}
            >
              <Ionicons name="person-add-outline" size={20} color="#000" />
              <Text style={styles.registerText}>
                {tr("إنشاء حساب مجاني", "Create Free Account")}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* رابط تسجيل الدخول */}
          <TouchableOpacity onPress={handleRegister} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>
              {tr("لديك حساب بالفعل؟ ", "Already have an account? ")}
              <Text style={styles.loginLinkHighlight}>
                {tr("سجّل الدخول", "Sign In")}
              </Text>
            </Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  /* معاينة */
  previewWrap: {
    height: 220,
    overflow: "hidden",
  },
  previewContent: {
    opacity: 0.18,
    transform: [{ scale: 0.97 }],
  },
  previewFade: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: 160,
  },

  /* بطاقة القفل */
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 28,
    padding: 28,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
    alignItems: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },

  /* أيقونة */
  lockIconWrap: {
    width: 72, height: 72,
    borderRadius: 22,
    backgroundColor: Colors.accent + "18",
    borderWidth: 1.5,
    borderColor: Colors.accent + "40",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  lockGlow: {
    position: "absolute",
    width: 72, height: 72,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    opacity: 0.08,
  },

  /* نصوص */
  cardTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  cardSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 8,
  },

  /* مزايا */
  featureList: {
    width: "100%",
    gap: 12,
    marginBottom: 28,
  },
  featureRow: {
    alignItems: "center",
    gap: 12,
  },
  featureIconBox: {
    width: 32, height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    color: Colors.textPrimary,
  },

  /* زر التسجيل */
  registerBtn: { width: "100%", marginBottom: 16 },
  registerGradient: {
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  registerText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#000",
  },

  /* رابط الدخول */
  loginLink: { paddingVertical: 4 },
  loginLinkText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
  },
  loginLinkHighlight: {
    fontFamily: "Cairo_700Bold",
    color: Colors.primary,
  },
});
