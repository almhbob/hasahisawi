// عارض ملء الشاشة قابل للتكبير: قرص بإصبعين، نقر مزدوج، أزرار +/−، وسحب عند التكبير.
// يُستخدم لبطاقة المسعف (وجه/ظهر) ولمستندات طلب الانضمام في لوحة الإدارة.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";

const MIN_ZOOM = 1, MAX_ZOOM = 5;

export type ZoomPage = { label: string; ratio: number; render: (width: number) => React.ReactNode };

export default function ZoomViewer({ visible, onClose, pages, initial = 0, title, actions }: {
  visible: boolean; onClose: () => void; pages: ZoomPage[]; initial?: number; title?: string;
  /** أزرار إضافية في الشريط السفلي (مثل مشاركة/حفظ) */
  actions?: React.ReactNode;
}) {
  const { width: sw, height: sh } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(initial);
  const [zoomLabel, setZoomLabel] = useState(100);
  const page = pages[Math.min(idx, pages.length - 1)];
  const ratio = page?.ratio ?? 1;
  // أكبر عرض يتسع في الشاشة مع ترك مساحة للأشرطة العلوية والسفلية
  const w = Math.min(sw - 24, 620, (sh - insets.top - insets.bottom - 190) / ratio);
  const h = w * ratio;

  const scale = useSharedValue(1), saved = useSharedValue(1);
  const tx = useSharedValue(0), ty = useSharedValue(0), sx = useSharedValue(0), sy = useSharedValue(0);
  const clampPan = (v: number, sc: number, size: number) => { "worklet"; const lim = Math.max(0, (size * sc - size) / 2); return Math.min(lim, Math.max(-lim, v)); };
  const report = (v: number) => setZoomLabel(Math.round(v * 100));
  const setZoom = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    scale.value = withTiming(next, { duration: 180 }); saved.value = next;
    if (next === 1) { tx.value = withTiming(0); ty.value = withTiming(0); }
    else { tx.value = clampPan(tx.value, next, w); ty.value = clampPan(ty.value, next, h); }
    report(next);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, saved.value * e.scale)); })
    .onEnd(() => { saved.value = scale.value; if (scale.value <= 1.01) { tx.value = withTiming(0); ty.value = withTiming(0); } runOnJS(report)(scale.value); });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => { sx.value = tx.value; sy.value = ty.value; })
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      tx.value = clampPan(sx.value + e.translationX, scale.value, w);
      ty.value = clampPan(sy.value + e.translationY, scale.value, h);
    });
  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    const next = scale.value > 1.2 ? 1 : 2.5;
    scale.value = withTiming(next, { duration: 200 }); saved.value = next;
    if (next === 1) { tx.value = withTiming(0); ty.value = withTiming(0); }
    runOnJS(report)(next);
  });
  const gestures = Gesture.Simultaneous(pinch, pan, doubleTap);
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));

  useEffect(() => { if (visible) { setIdx(initial); setZoom(1); } }, [visible, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setZoom(1); setIdx(initial); onClose(); };
  const go = (i: number) => { setIdx(i); setZoom(1); };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0E0F0E" }}>
        <View style={[st.bar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={close} style={st.icon} accessibilityRole="button" accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color="#F1EEE6" /></TouchableOpacity>
          {pages.length > 1 ? (
            <View style={st.seg}>
              {pages.map((p, i) => (
                <TouchableOpacity key={p.label} onPress={() => go(i)} style={[st.segBtn, idx === i && st.segOn]} accessibilityRole="tab" accessibilityState={{ selected: idx === i }}>
                  <Text style={[st.segTxt, idx === i && { color: "#0E0F0E" }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : <Text style={st.title} numberOfLines={1}>{title || page?.label}</Text>}
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <GestureDetector gesture={gestures}>
            <Animated.View style={[{ width: w, height: h }, zoomStyle]} collapsable={false}>
              {page?.render(w)}
            </Animated.View>
          </GestureDetector>
          <Text style={st.hint}>{Platform.OS === "web" ? "استخدم الأزرار للتكبير · انقر مرتين للتكبير السريع" : "باعد بإصبعين للتكبير · انقر مرتين للتكبير السريع"}</Text>
        </View>

        <View style={[st.tools, { paddingBottom: insets.bottom + 14 }]}>
          <TouchableOpacity onPress={() => setZoom(saved.value - 0.5)} style={st.icon} accessibilityRole="button" accessibilityLabel="تصغير"><Ionicons name="remove" size={22} color="#F1EEE6" /></TouchableOpacity>
          <TouchableOpacity onPress={() => setZoom(1)} style={st.zoom} accessibilityRole="button" accessibilityLabel="الحجم الأصلي"><Text style={st.zoomTxt}>{zoomLabel}%</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setZoom(saved.value + 0.5)} style={st.icon} accessibilityRole="button" accessibilityLabel="تكبير"><Ionicons name="add" size={22} color="#F1EEE6" /></TouchableOpacity>
          {actions}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 8 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: "#F1EEE6", textAlign: "center" },
  seg: { flexDirection: "row-reverse", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 20, padding: 3 },
  segBtn: { paddingHorizontal: 16, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: "#F1EEE6" },
  segTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#F1EEE6" },
  hint: { position: "absolute", bottom: 8, fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(241,238,230,0.6)" },
  tools: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 10 },
  zoom: { minWidth: 72, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  zoomTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#F1EEE6" },
});
