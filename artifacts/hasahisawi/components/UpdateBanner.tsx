import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Platform, AppState, ActivityIndicator, Pressable,
} from "react-native";
import Animated, { FadeIn, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getApiUrl } from "@/lib/query-client";
import { APP_VERSION } from "@/constants/app-version";
import Colors from "@/constants/colors";

type VersionInfo = {
  version: number;
  notes: string;
  force: boolean;
};

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // كل ساعة

export default function UpdateBanner() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastCheck = useRef(0);

  const check = async () => {
    const now = Date.now();
    if (now - lastCheck.current < 30_000) return;
    lastCheck.current = now;
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const res = await fetch(`${base}/api/app/version`, { cache: "no-store" });
      if (!res.ok) return;
      const data: VersionInfo = await res.json();
      if (data.version > APP_VERSION) {
        setInfo(data);
        setDismissed(false);
      } else {
        setInfo(null);
      }
    } catch {}
  };

  // فحص عند الإطلاق
  useEffect(() => {
    check();
    // فحص دوري كل ساعة
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // فحص عند عودة التطبيق للمقدمة
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => sub.remove();
  }, []);

  if (!info || dismissed) return null;

  const isForced = info.force;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => { if (!isForced) setDismissed(true); }}
    >
      <Pressable
        style={s.overlay}
        onPress={() => { if (!isForced) setDismissed(true); }}
      >
        <Animated.View
          entering={SlideInDown.springify().damping(18)}
          exiting={SlideOutDown.duration(250)}
          style={s.sheet}
          onStartShouldSetResponder={() => true}
        >
          <LinearGradient
            colors={[Colors.cardBgElevated, Colors.cardBg]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />

          {/* شريط القبضة */}
          <View style={s.handle} />

          {/* أيقونة */}
          <View style={s.iconWrap}>
            <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={s.iconGrad}>
              <MaterialCommunityIcons name="rocket-launch" size={30} color="#fff" />
            </LinearGradient>
          </View>

          {/* العنوان */}
          <Text style={s.title}>تحديث جديد متاح</Text>
          <Text style={s.sub}>الإصدار {info.version}</Text>

          {/* ملاحظات التحديث */}
          {!!info.notes && (
            <View style={s.notesBox}>
              {info.notes.split("\n").filter(Boolean).map((line, i) => (
                <View key={i} style={s.noteLine}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                  <Text style={s.noteText}>{line.replace(/^[-•]\s*/, "")}</Text>
                </View>
              ))}
            </View>
          )}

          {!info.notes && (
            <Text style={s.defaultNote}>
              يتضمن هذا الإصدار تحسينات جديدة وإصلاحات لضمان تجربة أفضل.
            </Text>
          )}

          {/* أزرار */}
          <View style={s.btnRow}>
            {!isForced && (
              <TouchableOpacity
                style={s.btnSecondary}
                onPress={() => setDismissed(true)}
                activeOpacity={0.75}
              >
                <Text style={s.btnSecText}>لاحقاً</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.btnPrimary, isForced && { flex: 1 }]}
              onPress={async () => {
                setLoading(true);
                // إعادة تحميل (web) أو إشعار بالتحديث
                if (Platform.OS === "web") {
                  window.location.reload();
                } else {
                  setLoading(false);
                  setDismissed(true);
                }
              }}
              activeOpacity={0.85}
              disabled={loading}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDim]}
                style={s.btnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-download-outline" size={18} color="#fff" />
                    <Text style={s.btnPrimText}>تحديث الآن</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {isForced && (
            <Text style={s.forcedNote}>
              هذا التحديث إجباري — يجب التحديث للاستمرار
            </Text>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 16,
    overflow: "hidden",
    alignItems: "center",
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: Colors.divider,
    borderRadius: 2,
    marginBottom: 20,
  },
  iconWrap: {
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  iconGrad: {
    width: 68, height: 68,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  sub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.primary,
    textAlign: "center",
    marginBottom: 20,
  },
  notesBox: {
    width: "100%",
    backgroundColor: Colors.bg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    gap: 8,
  },
  noteLine: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 8,
  },
  noteText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
    textAlign: "right",
  },
  defaultNote: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  btnRow: {
    flexDirection: "row-reverse",
    gap: 10,
    width: "100%",
  },
  btnPrimary: {
    flex: 2,
    borderRadius: 14,
    overflow: "hidden",
  },
  btnGrad: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  btnPrimText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  btnSecondary: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  btnSecText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
  },
  forcedNote: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.danger,
    textAlign: "center",
    marginTop: 14,
  },
});
