import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { firebaseSendPasswordReset, isFirebaseAvailable } from "@/lib/firebase/auth";

function normalizeIdentifierToEmail(value: string) {
  const input = value.trim();
  if (!input) return "";
  if (input.includes("@")) return input.toLowerCase();
  const clean = input.replace(/\s+/g, "").replace(/^\+/, "");
  return `${clean}@hasahisawi.app`;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const resetEmail = useMemo(() => normalizeIdentifierToEmail(identifier), [identifier]);

  const submit = async () => {
    if (!identifier.trim()) {
      Alert.alert("تنبيه", "اكتب رقم الهاتف أو البريد المرتبط بحسابك.");
      return;
    }

    if (!isFirebaseAvailable()) {
      Alert.alert("تعذر الإرسال", "خدمة استعادة كلمة المرور غير متاحة حالياً. حاول لاحقاً أو تواصل مع الدعم.");
      return;
    }

    setLoading(true);
    try {
      await firebaseSendPasswordReset(resetEmail);
      Alert.alert(
        "تم إرسال رابط الاستعادة",
        `أرسلنا رابط إعادة تعيين كلمة المرور إلى: ${resetEmail}\n\nافتح الرابط ثم عيّن كلمة مرور جديدة.`,
        [{ text: "حسناً", onPress: () => router.back() }],
      );
    } catch (error: any) {
      const code = error?.code || "";
      let message = "تعذر إرسال رابط الاستعادة. تحقق من البيانات وحاول مرة أخرى.";
      if (code === "auth/user-not-found") {
        message = "لم نجد حساباً بهذا الرقم/البريد. تأكد من الرقم أو تواصل مع الدعم حتى لا تفقد حسابك القديم.";
      } else if (code === "auth/invalid-email") {
        message = "صيغة الرقم أو البريد غير صحيحة.";
      } else if (code === "auth/network-request-failed") {
        message = "تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى.";
      }
      Alert.alert("تعذر الاستعادة", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#03140d", "#092218", "#03140d"]} style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-forward" size={28} color="#eafff4" />
          </Pressable>

          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Ionicons name="lock-open-outline" size={34} color="#28d96f" />
            </View>

            <Text style={styles.title}>استعادة كلمة المرور</Text>
            <Text style={styles.subtitle}>
              أدخل رقم الهاتف أو البريد المرتبط بحسابك. لن نحذف أو ننشئ حساباً جديداً؛ سنرسل رابطاً آمناً لتعيين كلمة مرور جديدة.
            </Text>

            <Text style={styles.label}>رقم الهاتف أو البريد</Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="مثال: 0117180042"
              placeholderTextColor="#6fbf98"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />

            {!!resetEmail && (
              <Text style={styles.hint}>سيتم استخدام: {resetEmail}</Text>
            )}

            <Pressable disabled={loading} onPress={submit} style={[styles.submit, loading && styles.disabled]}>
              <Text style={styles.submitText}>{loading ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"}</Text>
              <Ionicons name="send" size={19} color="#041108" />
            </Pressable>

            <Text style={styles.note}>
              إذا لم يصلك الرابط أو كان حسابك قديماً جداً، تواصل مع الإدارة وسيتم ربطه يدوياً دون فقد بياناتك.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 32,
    justifyContent: "center",
  },
  backButton: {
    position: "absolute",
    top: 42,
    right: 18,
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(116,255,174,0.18)",
  },
  card: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: "rgba(9, 35, 24, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(83, 245, 151, 0.22)",
    shadowColor: "#0be36d",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "rgba(40,217,111,0.12)",
    borderWidth: 1,
    borderColor: "rgba(40,217,111,0.28)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 18,
  },
  title: {
    color: "#f3fff8",
    fontFamily: "Cairo_700Bold",
    fontSize: 28,
    textAlign: "center",
    marginBottom: 10,
    writingDirection: "rtl",
  },
  subtitle: {
    color: "#aee9c8",
    fontFamily: "Cairo_500Medium",
    fontSize: 15,
    lineHeight: 26,
    textAlign: "center",
    marginBottom: 22,
    writingDirection: "rtl",
  },
  label: {
    color: "#eafff4",
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    marginBottom: 8,
    textAlign: "right",
  },
  input: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(116,255,174,0.24)",
    paddingHorizontal: 16,
    color: "#ffffff",
    fontFamily: "Cairo_600SemiBold",
    fontSize: 17,
    textAlign: "right",
  },
  hint: {
    color: "#8cebb8",
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    marginTop: 8,
    textAlign: "right",
  },
  submit: {
    marginTop: 20,
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: "#28d96f",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  disabled: { opacity: 0.65 },
  submitText: {
    color: "#041108",
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
  },
  note: {
    color: "#8fcfaf",
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    lineHeight: 23,
    textAlign: "center",
    marginTop: 18,
    writingDirection: "rtl",
  },
});
