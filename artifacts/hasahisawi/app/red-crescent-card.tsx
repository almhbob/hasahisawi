// بطاقة المسعف/المتطوع الرقمية — الهلال الأحمر السوداني، فرعية الحصاحيصا
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Share, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, openExternal } from "@/lib/xplatform";
import { srcsStyles } from "@/components/srcs/styles";
import ZoomViewer from "@/components/srcs/ZoomViewer";
import { SrcsCardFront, SrcsCardBack, CARD_RATIO } from "@/components/srcs/SrcsIdCard";
import { srcsApi, openMusifOrHelp, musifVerifyUrl, SRCS_RED, type SrcsMember } from "@/lib/red-crescent";

export default function SrcsCardScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [m, setM] = useState<SrcsMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [musif, setMusif] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [viewerPage, setViewerPage] = useState(0);
  const { width: sw } = useWindowDimensions();
  const cardW = Math.min(sw - 32, 520);
  const holder = { name: user?.name, avatar_url: user?.avatar_url };

  const load = useCallback(async () => {
    try {
      const o = await srcsApi.overview(token);
      setM(o.membership); setMusif(o.membership?.musif_code || "");
    } catch { /* يظهر حالة «لا توجد بطاقة» */ }
    finally { setLoading(false); }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveMusif = async () => {
    if (!token) return;
    setSaving(true);
    try { const r = await srcsApi.updateMe(token, { musif_code: musif.trim() }); setM({ ...m!, ...r.membership }); notify("تم الربط", "رُبطت بطاقتك ببطاقة المستجيب في «مسعف»"); }
    catch (e: any) { notify("تعذّر الحفظ", e?.message); }
    finally { setSaving(false); }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/red-crescent" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>بطاقة العضوية</Text>
        {m?.card_url ? (
          <TouchableOpacity style={s.iconBtn} onPress={() => Share.share({ message: `بطاقتي في الهلال الأحمر السوداني — فرعية الحصاحيصا\nللتحقق: ${m.card_url}` })} accessibilityLabel="مشاركة">
            <Ionicons name="share-social-outline" size={20} color={Colors.text} />
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}>
        {loading ? <ActivityIndicator color={SRCS_RED} style={{ marginTop: 40 }} /> : !m?.card_no ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>لا توجد بطاقة بعد</Text>
            <Text style={s.hint}>تصدر البطاقة تلقائياً عند قبول طلب انضمامك من إدارة الفرع.</Text>
            <TouchableOpacity style={[s.primary, { flex: 0 }]} onPress={() => router.replace("/red-crescent" as any)}><Text style={s.primaryTxt}>الذهاب إلى مساحة الجمعية</Text></TouchableOpacity>
          </View>
        ) : (
          <>
            {/* البطاقة — اضغط للتكبير */}
            <TouchableOpacity activeOpacity={0.92} onPress={() => { setViewerPage(0); setViewer(true); }} accessibilityRole="imagebutton" accessibilityLabel="عرض البطاقة مكبّرة">
              <SrcsCardFront m={m} holder={holder} width={cardW} />
              <View style={s.zoomTag}><Ionicons name="expand" size={14} color="#fff" /><Text style={s.zoomTagTxt}>اضغط للتكبير</Text></View>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.92} onPress={() => { setViewerPage(1); setViewer(true); }} accessibilityRole="imagebutton" accessibilityLabel="عرض ظهر البطاقة ورمز التحقق مكبّراً">
              <SrcsCardBack m={m} holder={holder} width={cardW} />
            </TouchableOpacity>
            <View style={s.notice}>
              <Ionicons name="information-circle" size={18} color={SRCS_RED} />
              <Text style={[s.hint, { flex: 1 }]}>اعرض البطاقة مكبّرة عند بوابات المستشفيات ونقاط التفتيش؛ يمكن لأي جهة مسح رمز التحقق للتأكد من صلاحيتها فوراً.</Text>
            </View>
            {m.card_url ? (
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TouchableOpacity style={s.primary} onPress={() => { setViewerPage(0); setViewer(true); }}><Ionicons name="expand" size={18} color="#fff" /><Text style={s.primaryTxt}>عرض بملء الشاشة</Text></TouchableOpacity>
                <TouchableOpacity style={s.ghost} onPress={() => openExternal(m.card_url!)}><Ionicons name="shield-checkmark-outline" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>صفحة التحقق</Text></TouchableOpacity>
              </View>
            ) : null}
            <ZoomViewer visible={viewer} onClose={() => setViewer(false)} initial={viewerPage} pages={[
              { label: "الوجه", ratio: CARD_RATIO, render: (w) => <SrcsCardFront m={m} holder={holder} width={w} /> },
              { label: "الظهر والتحقق", ratio: CARD_RATIO, render: (w) => <SrcsCardBack m={m} holder={holder} width={w} /> },
            ]} />

            {/* الربط مع مسعف */}
            <View style={s.card}>
              <View style={s.row}>
                <Ionicons name="pulse" size={20} color={SRCS_RED} />
                <Text style={[s.cardTitle, { flex: 1 }]}>الربط مع تطبيق «مسعف»</Text>
              </View>
              <Text style={s.hint}>«مسعف» لاستقبال نداءات الاستغاثة القريبة والعمل الميداني، و«حصاحيصاوي» لتنظيم الجمعية. أدخل رمز بطاقة المستجيب في مسعف ليظهر في صفحة التحقق.</Text>
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TextInput value={musif} onChangeText={setMusif} placeholder="رمز بطاقة مسعف" placeholderTextColor={Colors.textMuted} style={[s.input, { flex: 1, textAlign: "center" }]} autoCapitalize="characters" />
                <TouchableOpacity style={[s.primary, { flex: 0, paddingHorizontal: 18 }]} onPress={saveMusif} disabled={saving}><Text style={s.primaryTxt}>{saving ? "…" : "ربط"}</Text></TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TouchableOpacity style={s.ghost} onPress={() => openMusifOrHelp("responder")}><Text style={s.ghostTxt}>فتح مسعف</Text></TouchableOpacity>
                {m.musif_code ? <TouchableOpacity style={s.ghost} onPress={() => openExternal(musifVerifyUrl(m.musif_code!))}><Text style={s.ghostTxt}>بطاقتي في مسعف</Text></TouchableOpacity> : null}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  ...srcsStyles,
  zoomTag: { position: "absolute", top: 10, left: 10, flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.35)" },
  zoomTagTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#fff" },
  notice: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 14, backgroundColor: SRCS_RED + "0D", borderWidth: 1, borderColor: SRCS_RED + "30" },
});
