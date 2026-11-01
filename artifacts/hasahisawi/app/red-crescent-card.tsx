// بطاقة المسعف/المتطوع الرقمية — الهلال الأحمر السوداني، فرعية الحصاحيصا
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Share, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { StarPattern } from "@/components/ui/Ornament";
import { notify, openExternal } from "@/lib/xplatform";
import { srcsStyles } from "@/components/srcs/styles";
import RedCrescentMark from "@/components/srcs/RedCrescentMark";
import { srcsApi, openMusifOrHelp, musifVerifyUrl, ROLE_LABEL, SRCS_RED, SRCS_RED_DEEP, type SrcsMember } from "@/lib/red-crescent";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "long" }) : "—");

export default function SrcsCardScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [m, setM] = useState<SrcsMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [musif, setMusif] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const o = await srcsApi.overview(token);
      setM(o.membership); setMusif(o.membership?.musif_code || "");
    } catch { /* يظهر حالة «لا توجد بطاقة» */ }
    finally { setLoading(false); }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const valid = !!m && m.status === "active" && !!m.card_expires_at && new Date(m.card_expires_at) > new Date();
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
            {/* الوجه الأمامي */}
            <LinearGradient colors={[SRCS_RED_DEEP, SRCS_RED, "#DC2626"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.idCard}>
              <StarPattern color="#FFFFFF" opacity={0.08} size={36} />
              <View style={s.idTop}>
                <View style={s.idLogo}><RedCrescentMark size={30} background={null} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.idOrg}>جمعية الهلال الأحمر السوداني</Text>
                  <Text style={s.idBranch}>فرعية الحصاحيصا</Text>
                </View>
                <View style={[s.state, { backgroundColor: valid ? "#16A34A" : "#B45309" }]}><Text style={s.stateTxt}>{valid ? "سارية" : "غير سارية"}</Text></View>
              </View>
              <View style={s.idBody}>
                <View style={s.photo}>
                  {user?.avatar_url ? <Image source={{ uri: user.avatar_url }} style={{ width: "100%", height: "100%" }} /> :
                    <Text style={s.photoTxt}>{(user?.name || "؟").trim().charAt(0)}</Text>}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.idName} numberOfLines={2}>{user?.name}</Text>
                  <View style={s.rolePill}><Text style={s.roleTxt}>{ROLE_LABEL[m.role]}</Text></View>
                  {m.unit ? <Text style={s.idLine} numberOfLines={1}>{m.unit}</Text> : null}
                </View>
              </View>
              <View style={s.idGrid}>
                <Field k="رقم البطاقة" v={m.card_no} ltr />
                <Field k="فصيلة الدم" v={m.blood_type || "—"} ltr />
                <Field k="صادرة" v={fmt(m.card_issued_at)} />
                <Field k="صالحة حتى" v={fmt(m.card_expires_at)} />
              </View>
            </LinearGradient>

            {/* التحقق */}
            <View style={[s.card, { alignItems: "center" }]}>
              <Text style={s.cardTitle}>رمز التحقق</Text>
              <Text style={[s.hint, { textAlign: "center" }]}>يمسحه أي شخص بكاميرا هاتفه للتأكد من صلاحية بطاقتك.</Text>
              {m.card_url ? <View style={s.qrBox}><QRCode value={m.card_url} size={190} color={SRCS_RED_DEEP} backgroundColor="#fff" /></View> : null}
              {m.card_url ? <TouchableOpacity onPress={() => openExternal(m.card_url!)}><Text style={s.link}>فتح صفحة التحقق</Text></TouchableOpacity> : null}
            </View>

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

function Field({ k, v, ltr }: { k: string; v: string; ltr?: boolean }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldK}>{k}</Text>
      <Text style={[s.fieldV, ltr && { writingDirection: "ltr" }]} numberOfLines={1}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  ...srcsStyles,
  idCard: { borderRadius: 24, padding: 16, gap: 14, overflow: "hidden", minHeight: 230 },
  idTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  idLogo: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  idOrg: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", textAlign: "right" },
  idBranch: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  state: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  stateTxt: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  idBody: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  photo: { width: 74, height: 88, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 2, borderColor: "#fff", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  photoTxt: { fontFamily: "Cairo_700Bold", fontSize: 32, color: "#fff" },
  idName: { fontFamily: "Cairo_700Bold", fontSize: 19, color: "#fff", textAlign: "right" },
  rolePill: { alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, backgroundColor: "#fff" },
  roleTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: SRCS_RED_DEEP },
  idLine: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.9)", textAlign: "right" },
  idGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  field: { width: "48%", padding: 8, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.18)" },
  fieldK: { fontFamily: "Cairo_400Regular", fontSize: 10.5, color: "rgba(255,255,255,0.8)", textAlign: "right" },
  fieldV: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff", textAlign: "right" },
  qrBox: { padding: 12, borderRadius: 18, backgroundColor: "#fff", borderWidth: 3, borderColor: SRCS_RED },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13, color: SRCS_RED },
});
