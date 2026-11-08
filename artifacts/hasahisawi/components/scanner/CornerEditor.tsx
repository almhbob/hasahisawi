/**
 * محرّر حواف الورقة: أربع نقاط تُسحب على الصورة الأصلية لتحديد الورقة بدقة،
 * مع «كشف تلقائي» و«الصفحة كاملة»، ثم «تطبيق» يصحّح المنظور ويحسّن الصفحة.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Mask, Polygon, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Corners, detectPage } from "@/lib/scan-engine";

const FULL: Corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
const GOLD = "#E8A900";

export default function CornerEditor({ src, initial, onApply, onClose }: {
  src: string; initial: Corners | null; onApply: (c: Corners | null) => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [img, setImg] = useState({ w: 0, h: 0 });
  const [pts, setPts] = useState<Corners>(initial ?? FULL);
  const [detecting, setDetecting] = useState(false);
  const ptsRef = useRef(pts); ptsRef.current = pts;

  useEffect(() => { Image.getSize(src, (w, h) => setImg({ w, h }), () => setImg({ w: 3, h: 4 })); }, [src]);
  useEffect(() => { if (!initial) autoDetect(true); }, []);

  // مساحة عرض الصورة داخل الإطار مع الحفاظ على نسبتها
  const view = useMemo(() => {
    if (!box.w || !img.w) return null;
    const k = Math.min(box.w / img.w, box.h / img.h);
    const w = img.w * k, h = img.h * k;
    return { w, h, x: (box.w - w) / 2, y: (box.h - h) / 2 };
  }, [box, img]);

  const autoDetect = async (silent = false) => {
    setDetecting(true);
    try {
      const c = await detectPage(src);
      if (c) setPts(c);
      else if (!silent) setPts(FULL);
    } catch { /* يبقى التحديد الحالي */ }
    finally { setDetecting(false); }
  };

  const responders = useMemo(() => [0, 1, 2, 3].map((i) => {
    let start: [number, number] = [0, 0];
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { start = [...ptsRef.current[i]] as [number, number]; },
      onPanResponderMove: (_e, g) => {
        if (!viewRef.current) return;
        const v = viewRef.current;
        const nx = Math.min(1, Math.max(0, start[0] + g.dx / v.w));
        const ny = Math.min(1, Math.max(0, start[1] + g.dy / v.h));
        setPts((p) => p.map((q, j) => (j === i ? [nx, ny] : q)) as Corners);
      },
    });
  }), []);
  const viewRef = useRef(view); viewRef.current = view;

  const P = (q: [number, number]) => (view ? [view.x + q[0] * view.w, view.y + q[1] * view.h] : [0, 0]);
  const poly = pts.map((q) => P(q).join(",")).join(" ");

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[st.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }]}>
        <View style={st.head}>
          <Pressable onPress={onClose} style={st.iconBtn} accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color="#fff" /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>حدّد حواف الورقة</Text>
            <Text style={st.sub}>اسحب النقاط الذهبية إلى زوايا الورقة بالضبط</Text>
          </View>
        </View>

        <View style={st.stage} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {view ? (
            <>
              <Image source={{ uri: src }} style={{ position: "absolute", left: view.x, top: view.y, width: view.w, height: view.h }} resizeMode="stretch" />
              <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <Mask id="m"><Rect x="0" y="0" width={box.w} height={box.h} fill="#fff" /><Polygon points={poly} fill="#000" /></Mask>
                </Defs>
                <Rect x="0" y="0" width={box.w} height={box.h} fill="rgba(0,0,0,0.55)" mask="url(#m)" />
                <Polygon points={poly} fill="rgba(232,169,0,0.10)" stroke={GOLD} strokeWidth={2.5} />
              </Svg>
              {pts.map((q, i) => {
                const [x, y] = P(q);
                return (
                  <View key={i} {...responders[i].panHandlers} style={[st.handleHit, { left: x - 26, top: y - 26 }]}
                    accessibilityLabel={["الزاوية العليا اليسرى", "الزاوية العليا اليمنى", "الزاوية السفلى اليمنى", "الزاوية السفلى اليسرى"][i]}>
                    <View style={st.handle} />
                  </View>
                );
              })}
            </>
          ) : <ActivityIndicator color={GOLD} />}
          {detecting && <View style={st.busy}><ActivityIndicator color="#fff" /><Text style={st.busyText}>جارٍ كشف الورقة…</Text></View>}
        </View>

        <View style={st.tools}>
          <Pressable style={st.tool} onPress={() => autoDetect()} disabled={detecting}>
            <Ionicons name="scan" size={20} color="#fff" /><Text style={st.toolText}>كشف تلقائي</Text>
          </Pressable>
          <Pressable style={st.tool} onPress={() => setPts(FULL)}>
            <Ionicons name="expand" size={20} color="#fff" /><Text style={st.toolText}>الصفحة كاملة</Text>
          </Pressable>
        </View>
        <Pressable style={st.apply} onPress={() => {
          const full = pts.every((q, i) => Math.abs(q[0] - FULL[i][0]) < 0.005 && Math.abs(q[1] - FULL[i][1]) < 0.005);
          onApply(full ? null : pts);
        }} accessibilityRole="button">
          <Ionicons name="checkmark-circle" size={22} color="#fff" /><Text style={st.applyText}>تطبيق القص وتصحيح المنظور</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0D1613", paddingHorizontal: 14, gap: 12 },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.7)", textAlign: "right" },
  stage: { flex: 1, borderRadius: 18, overflow: "hidden", backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  handleHit: { position: "absolute", width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  handle: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(232,169,0,0.35)", borderWidth: 3, borderColor: GOLD },
  busy: { position: "absolute", flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  busyText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
  tools: { flexDirection: "row-reverse", gap: 10 },
  tool: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)" },
  toolText: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: "#fff" },
  apply: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 16, backgroundColor: "#00966A" },
  applyText: { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: "#fff" },
});
