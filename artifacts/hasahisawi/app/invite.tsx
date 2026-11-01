// ادعُ أصدقاءك: باركود ذكي (أندرويد → Google Play، آيفون → تثبيت تطبيق الويب) + نقاط تلقائية
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import UserAvatar from "@/components/UserAvatar";
import { StarPattern } from "@/components/ui/Ornament";
import { copyText, notify } from "@/lib/xplatform";
import { invitesApi, inviteMessage, cleanCode, type InviteMe, type InviteLeader } from "@/lib/invites";

export default function InviteScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const [me, setMe] = useState<InviteMe | null>(null);
  const [leaders, setLeaders] = useState<InviteLeader[]>([]);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    setError("");
    invitesApi.leaderboard().then((r) => setLeaders(r.leaders)).catch(() => {});
    if (!token || isGuest) return;
    try { setMe(await invitesApi.me(token)); } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
  }, [token, isGuest]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = async () => { if (me) await Share.share({ message: inviteMessage(me.link, me.code) }).catch(() => {}); };
  const copy = async () => {
    if (!me) return;
    const r = await copyText(me.link);
    if (r === "copied") notify("تم النسخ", "انسخ الرابط وأرسله لأصدقائك");
  };
  const claim = async () => {
    if (!token || cleanCode(code).length < 4) return;
    setClaiming(true);
    try {
      const r = await invitesApi.claim(token, cleanCode(code));
      notify("شكراً لانضمامك 💚", `احتُسبت دعوتك لـ ${r.inviter}`);
      setCode(""); load();
    } catch (e: any) { notify("تعذّر احتساب الرمز", e?.message || "حاول مجدداً"); }
    finally { setClaiming(false); }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>ادعُ أصدقاءك</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}>
        {/* البطاقة الرئيسية: الباركود */}
        <LinearGradient colors={["#063B2A", "#0B6B49", "#0E8A5F"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.hero}>
          <StarPattern opacity={0.14} />
          <Text style={s.heroTitle}>امسح الباركود لتثبيت حصاحيصاوي</Text>
          <Text style={s.heroSub}>يعمل مع أندرويد وآيفون — يفتح Google Play على أندرويد، ويرشد مستخدم الآيفون لتثبيت التطبيق على شاشته الرئيسية</Text>
          <View style={s.qrBox}>
            {me ? <QRCode value={me.link} size={196} color="#063B2A" backgroundColor="#FFFFFF" /> :
              !token || isGuest ? <QRCode value="https://hasahisawi.pages.dev/get" size={196} color="#063B2A" backgroundColor="#FFFFFF" /> :
              <ActivityIndicator color="#0B6B49" style={{ margin: 80 }} />}
          </View>
          {me ? (
            <View style={s.codeRow}>
              <Text style={s.codeLbl}>رمز دعوتك</Text>
              <Text style={s.code} selectable>{me.code}</Text>
            </View>
          ) : null}
          <View style={s.devices}>
            <View style={s.device}><Ionicons name="logo-google-playstore" size={16} color="#fff" /><Text style={s.deviceTxt}>أندرويد</Text></View>
            <View style={s.device}><Ionicons name="logo-apple" size={16} color="#fff" /><Text style={s.deviceTxt}>آيفون</Text></View>
          </View>
        </LinearGradient>

        {me ? (
          <View style={s.actions}>
            <TouchableOpacity style={s.primaryBtn} onPress={share} accessibilityRole="button">
              <Ionicons name="share-social" size={18} color="#fff" /><Text style={s.primaryTxt}>مشاركة الدعوة</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={copy} accessibilityRole="button">
              <Ionicons name="copy-outline" size={18} color={Colors.primary} /><Text style={s.ghostTxt}>نسخ الرابط</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* نقاطي */}
        {me ? (
          <View style={s.card}>
            <View style={s.statsRow}>
              <View style={s.stat}><Text style={[s.statNum, { color: Colors.accent }]}>{me.points}</Text><Text style={s.statLbl}>نقطة</Text></View>
              <View style={s.stat}><Text style={s.statNum}>{me.count}</Text><Text style={s.statLbl}>انضموا بدعوتك</Text></View>
              <View style={s.stat}><Text style={s.statNum}>{me.rank ? `#${me.rank}` : "—"}</Text><Text style={s.statLbl}>ترتيبك</Text></View>
            </View>
            <Text style={s.hint}>تحصل على {me.pointsPerInvite} نقاط تلقائياً عن كل شخص ينضم برمزك أو برابطك.</Text>
            {me.recent.length ? (
              <View style={{ gap: 8, marginTop: 6 }}>
                {me.recent.slice(0, 8).map((r) => (
                  <TouchableOpacity key={r.id} style={s.row} onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(r.id) } })}>
                    <UserAvatar name={r.name} avatarUrl={r.avatar_url} size={34} borderRadius={11} />
                    <Text style={s.rowName} numberOfLines={1}>{r.name}</Text>
                    <Text style={[s.rowPts, !r.points && { color: Colors.textMuted }]}>{r.points ? `+${r.points}` : "بلا نقاط"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* عضو جديد: أدخل رمز من دعاك */}
        {me?.canClaim ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>هل دعاك أحد؟</Text>
            <Text style={s.hint}>أدخل رمز دعوته خلال أسبوعك الأول ليحصل على نقاطه.</Text>
            <View style={s.claimRow}>
              <TextInput value={code} onChangeText={(v) => setCode(cleanCode(v))} placeholder="مثال: K7Q2M9" placeholderTextColor={Colors.textMuted}
                style={s.input} autoCapitalize="characters" maxLength={12} />
              <TouchableOpacity style={[s.primaryBtn, { flex: 0, paddingHorizontal: 18 }]} onPress={claim} disabled={claiming || cleanCode(code).length < 4}>
                <Text style={s.primaryTxt}>{claiming ? "…" : "احتساب"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : me?.invitedBy ? (
          <Text style={[s.hint, { textAlign: "center" }]}>انضممت بدعوة من {me.invitedBy.inviter_name} 💚</Text>
        ) : null}

        {(!token || isGuest) ? (
          <TouchableOpacity style={s.primaryBtn} onPress={() => router.push("/login" as any)}>
            <Text style={s.primaryTxt}>سجّل الدخول لتحصل على رمز دعوتك ونقاطك</Text>
          </TouchableOpacity>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* الأكثر دعوة */}
        {leaders.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>الأكثر دعوة</Text>
            {leaders.map((l, i) => (
              <TouchableOpacity key={l.id} style={s.row} onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(l.id) } })}>
                <Text style={[s.rank, i < 3 && { color: Colors.accent }]}>{i + 1}</Text>
                <UserAvatar name={l.name} avatarUrl={l.avatar_url} size={34} borderRadius={11} />
                <Text style={s.rowName} numberOfLines={1}>{l.name}</Text>
                <Text style={s.rowPts}>{l.points} نقطة</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text },
  hero: { borderRadius: 24, padding: 18, alignItems: "center", gap: 8, overflow: "hidden", borderWidth: 1, borderColor: "rgba(232,185,49,0.4)" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff", textAlign: "center" },
  heroSub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, lineHeight: 20, color: "rgba(255,255,255,0.85)", textAlign: "center" },
  qrBox: { marginTop: 6, padding: 14, borderRadius: 20, backgroundColor: "#fff", borderWidth: 3, borderColor: "#E8B931" },
  codeRow: { alignItems: "center", marginTop: 4 },
  codeLbl: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#F3D27A" },
  code: { fontFamily: "Cairo_700Bold", fontSize: 26, letterSpacing: 6, color: "#fff" },
  devices: { flexDirection: "row-reverse", gap: 8 },
  device: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)" },
  deviceTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff" },
  actions: { flexDirection: "row-reverse", gap: 10 },
  primaryBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 48, borderRadius: 14, backgroundColor: Colors.primary },
  primaryTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  ghostBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.primary + "70" },
  ghostTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary },
  card: { padding: 14, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  statsRow: { flexDirection: "row-reverse", justifyContent: "space-around" },
  stat: { alignItems: "center" },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.text },
  statLbl: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 12.5, lineHeight: 20, color: Colors.textSecondary, textAlign: "right" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  rowName: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.text, textAlign: "right" },
  rowPts: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  rank: { width: 22, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textMuted, textAlign: "center" },
  claimRow: { flexDirection: "row-reverse", gap: 8 },
  input: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, paddingHorizontal: 14, fontFamily: "Cairo_700Bold", fontSize: 16, letterSpacing: 3, color: Colors.text, textAlign: "center" },
  error: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.danger, textAlign: "center" },
});
