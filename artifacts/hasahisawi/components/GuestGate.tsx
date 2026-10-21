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
      {/* علامة مائية بنمط الشعار */}

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
            <Ionicons name="lock-closed-outline" size={26} color={Colors.primaryDeep} />
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
                  <Ionicons name={f.icon} size={16} color={Colors.primaryDeep} />
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
            <View style={styles.registerGradient}>
              <Ionicons name="person-add-outline" size={19} color="#fff" />
              <Text style={styles.registerText}>
                {tr("إنشاء حساب مجاني", "Create Free Account")}
              </Text>
            </View>
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
    borderRadius: Colors.radius.xl,
    padding: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignItems: "center",
  },

  /* أيقونة */
  lockIconWrap: {
    width: 56, height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
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
    borderRadius: 16,
    backgroundColor: Colors.primarySoft,
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
    borderRadius: 14,
    height: 52,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primaryDeep,
  },
  registerText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#fff",
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
    color: Colors.primaryDeep,
  },
});
