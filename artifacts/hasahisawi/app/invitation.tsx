// ✉️ شاشة الدعوة الرسمية للانضمام إلى قسم (‎/invitation?t=…) — عامة بلا تسجيل دخول
// المدعو يرى بطاقة الدعوة، ويقبلها: إن لم يكن مسجّلاً نحفظ الرمز ونرسله للدخول، ثم تُستكمل تلقائياً.
// (المسار ‎/join محجوز لصفحة ثابتة قائمة على Cloudflare Pages: public/join.html)
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import SectionInviteCard from "@/components/SectionInviteCard";
import { notify, openExternal } from "@/lib/xplatform";
import { PLAY_URL } from "@/lib/invites";
import { sectionInvitesApi, rememberSectionInvite, cleanInviteToken, type PublicInvite } from "@/lib/section-invites";

export default function InvitationScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLocalSearchParams<{ t?: string }>();
  const tok = cleanInviteToken(t);
  const { user, token, isGuest, logout } = useAuth();
  const signedIn = !!user && !!token && !isGuest;
  const [inv, setInv] = useState<PublicInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!tok) { setInv({ valid: false, reason: "رابط الدعوة غير مكتمل", status: "missing" }); setLoading(false); return; }
    sectionInvitesApi.publicGet(tok, signedIn ? token : null)
      .then(setInv)
      .catch((e) => setInv({ valid: false, reason: e?.message || "تعذّر تحميل الدعوة", status: "missing" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tok]);

  const accept = async () => {
    if (!inv?.valid) return;
    setErr("");
    if (!signedIn) {
      await rememberSectionInvite(tok);
      notify("خطوة أخيرة", "سجّل دخولك أو أنشئ حساباً، وستنتقل مباشرةً إلى نموذج الانضمام.");
      if (isGuest) { await logout().catch(() => {}); }
      router.replace("/login");
      return;
    }
    setBusy(true);
    try {
      const r = await sectionInvitesApi.accept(token!, tok);
      notify("مرحباً بك 💚", `قُبلت الدعوة — أكمل الانضمام إلى ${r.section.title}`);
      router.replace({ pathname: r.route, params: r.params } as any);
    } catch (e: any) {
      setErr(e?.message || "تعذّر قبول الدعوة");
      if (e?.status === 410) setInv((p) => (p ? { ...p, valid: false, reason: e.message } : p));
    } finally { setBusy(false); }
  };

  const home = () => router.replace((signedIn ? "/(tabs)" : "/login") as any);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={s.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : home())} style={s.iconBtn} accessibilityLabel="رجوع">
            <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={s.title}>دعوة انضمام</Text>
          <View style={{ width: 44 }} />
        </View>

        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 80 }} /> : inv?.section ? (
          <>
            <SectionInviteCard
              section={inv.section}
              inviteeName={inv.invitee_name || ""}
              inviteeKind={inv.invitee_kind || "person"}
              message={inv.message}
              expiresAt={inv.expires_at}
              inviter={inv.inviter}
              qrValue={Platform.OS === "web" && inv.valid ? inv.app_url : undefined}
              messageLines={12}
            />

            {inv.valid ? (
              <>
                <View style={s.steps}>
                  {[
                    ["checkmark-circle-outline", "اقبل الدعوة"],
                    ["log-in-outline", signedIn ? `مسجّل باسم ${user?.name ?? ""}` : "سجّل دخولك أو أنشئ حساباً"],
                    ["document-text-outline", `أكمل نموذج الانضمام إلى ${inv.section.title}`],
                  ].map(([ic, l], i) => (
                    <View key={i} style={s.step}>
                      <View style={[s.stepN, { backgroundColor: inv.section!.color }]}><Text style={s.stepNT}>{i + 1}</Text></View>
                      <Ionicons name={ic as any} size={17} color={inv.section!.color} />
                      <Text style={s.stepT} numberOfLines={2}>{l}</Text>
                    </View>
                  ))}
                </View>
                {err ? <Text style={s.err}>{err}</Text> : null}
                <Pressable onPress={accept} disabled={busy} style={[s.cta, { backgroundColor: inv.section.color }, busy && { opacity: 0.6 }]} accessibilityRole="button">
                  {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-done" size={20} color="#fff" /><Text style={s.ctaT}>قبول الدعوة والانضمام</Text></>}
                </Pressable>
                {Platform.OS === "web" ? (
                  <Pressable onPress={() => openExternal(PLAY_URL)} style={s.ghost}>
                    <Ionicons name="logo-google-playstore" size={18} color={Colors.textPrimary} /><Text style={s.ghostT}>حمّل التطبيق من Google Play</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <InvalidBox reason={inv.reason} onHome={home} signedIn={signedIn} />
            )}
          </>
        ) : (
          <InvalidBox reason={inv?.reason ?? null} onHome={home} signedIn={signedIn} />
        )}
      </ScrollView>
    </View>
  );
}

function InvalidBox({ reason, onHome, signedIn }: { reason: string | null; onHome: () => void; signedIn: boolean }) {
  return (
    <View style={s.bad}>
      <View style={s.badIcon}><Ionicons name="mail-unread-outline" size={30} color="#B42318" /></View>
      <Text style={s.badT}>الدعوة غير متاحة</Text>
      <Text style={s.badS}>{reason || "الدعوة غير موجودة أو الرابط غير صحيح"}</Text>
      <Text style={s.badS}>يمكنك التواصل مع إدارة حصاحيصاوي لطلب دعوة جديدة.</Text>
      <Pressable onPress={onHome} style={[s.cta, { backgroundColor: Colors.primary, alignSelf: "stretch" }]}>
        <Ionicons name={signedIn ? "home-outline" : "log-in-outline"} size={18} color="#fff" />
        <Text style={s.ctaT}>{signedIn ? "الصفحة الرئيسية" : "الدخول إلى حصاحيصاوي"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, gap: 14, width: "100%", maxWidth: 560, alignSelf: "center" },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  steps: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 12, gap: 10, borderWidth: 1, borderColor: Colors.divider },
  step: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  stepN: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  stepNT: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: "#fff" },
  stepT: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.danger, textAlign: "center" },
  cta: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 18 },
  ctaT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  ghost: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 18, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  ghostT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary },
  bad: { alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 22, padding: 22, borderWidth: 1, borderColor: Colors.divider, marginTop: 30 },
  badIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: "#FDE8E6", alignItems: "center", justifyContent: "center" },
  badT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  badS: { fontFamily: "Cairo_500Medium", fontSize: 13.5, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
});
