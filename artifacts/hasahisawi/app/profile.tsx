import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Image, Modal, Pressable,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import QRCode from "react-native-qrcode-svg";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { chatApi, presenceText } from "@/lib/chat-plus";
import { useAuth } from "@/lib/auth-context";
import UserAvatar from "@/components/UserAvatar";
import VerifiedBadge, { VERIFIED_BLUE } from "@/components/VerifiedBadge";
import { EditProfileModal, CertFormModal, VerifyModal } from "@/components/profile/ProfileForms";
import { notify, confirmAction, uploadProfilePhoto, openExternal, copyText, systemShare } from "@/lib/xplatform";
import { CERT_KINDS, Cert, FullProfile, SOCIALS, profileApi, publicCvUrl } from "@/lib/profile-api";
import { blockUser } from "@/lib/social-safety";
import { fetchFollowStats, followUser, unfollowUser, type FollowStats } from "@/lib/social-follow";
import { volunteerApi, TIER_STYLE, type VolunteerSummary } from "@/lib/volunteer";
import RtlScrollRow from "@/components/ui/RtlScrollRow";

type Post = { id: number; content: string; image_url?: string | null; created_at: string; likes_count: number; comments_count?: number };
type Visitor = { id: number; name: string; avatar_url: string | null; headline: string | null; is_verified: boolean; viewed_at: string };

const ROLE_MAP: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  admin:     { label: "الإدارة",  color: "#B4232F", icon: "shield-checkmark" },
  moderator: { label: "مشرف",     color: "#2A6FA8", icon: "shield-half" },
  org:       { label: "مؤسسة",    color: Colors.accentDeep, icon: "business" },
  user:      { label: "عضو",      color: Colors.primary, icon: "person-circle" },
};

function memberSince(iso: string) {
  try { return new Date(iso).toLocaleDateString("ar", { year: "numeric", month: "long" }); } catch { return ""; }
}
function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "الآن";
  if (diff < 3_600_000) return `منذ ${Math.floor(diff / 60_000)} د`;
  if (diff < 86_400_000) return `منذ ${Math.floor(diff / 3_600_000)} س`;
  return d.toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user, token, isGuest, logout, refreshUser, biometricsAvailable, biometricsEnabled, enableBiometrics, disableBiometrics } = useAuth();

  const viewingId = id && /^\d+$/.test(String(id)) ? Number(id) : null;
  const profileId = viewingId ?? (isGuest ? null : user?.id ?? null);
  const isOwn = !!user && !isGuest && (viewingId === null || viewingId === user.id);

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [certEdit, setCertEdit] = useState<{ open: boolean; cert: Cert | null }>({ open: false, cert: null });
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [follow, setFollow] = useState<FollowStats | null>(null);
  const [vol, setVol] = useState<VolunteerSummary | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!profileId) { setLoading(false); return; }
    setLoading(true); setFailed(false);
    try {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [p, postsRes] = await Promise.all([
        profileApi.full(profileId, token).catch((e) => { if (e?.status === 404) return null; throw e; }),
        fetch(`${getApiUrl()}/api/posts?user_id=${profileId}&limit=20`, { headers }).catch(() => null),
      ]);
      setProfile(p);
      if (postsRes?.ok) { const d = await postsRes.json(); setPosts(Array.isArray(d) ? d : d.posts ?? []); }
      if (isOwn && token) profileApi.visitors(token).then((r) => setVisitors(r.visitors)).catch(() => {});
      fetchFollowStats(Number(profileId), token).then(setFollow).catch(() => setFollow(null));
      volunteerApi.summary(Number(profileId)).then(setVol).catch(() => setVol(null));
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, [profileId, token, isOwn]);

  useFocusEffect(useCallback(() => { fetchProfile(); }, [fetchProfile]));

  const toggleFollow = async () => {
    if (!profile || !follow || followBusy) return;
    if (!token || isGuest) { notify("تسجيل مطلوب", "سجّل الدخول لتتابع الأشخاص وترى منشوراتهم في «أتابعهم»."); return; }
    const was = follow.i_follow;
    setFollowBusy(true);
    setFollow({ ...follow, i_follow: !was, followers: Math.max(0, follow.followers + (was ? -1 : 1)) });
    try {
      await (was ? unfollowUser(profile.id, token) : followUser(profile.id, token));
      if (!was) haptic();
    } catch (e: any) {
      setFollow(follow);
      notify("تعذّر التنفيذ", e?.message || "حاول مرة أخرى");
    } finally { setFollowBusy(false); }
  };

  const openFollows = (kind: "followers" | "following") => {
    if (!profile) return;
    router.push({ pathname: "/follows" as any, params: { id: String(profile.id), kind, name: profile.name } });
  };

  const haptic = () => { if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };

  const pickAvatar = async () => {
    if (!isOwn || !token || uploading) return;
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { notify("الإذن مطلوب", "يرجى السماح للتطبيق بالوصول إلى مكتبة الصور"); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const url = await uploadProfilePhoto(result.assets[0].uri, token);
      setProfile((p) => (p ? { ...p, avatar_url: url } : p));
      await refreshUser(); haptic();
    } catch (e: any) { notify("تعذّر رفع الصورة", e?.message || "حاول بصورة أصغر حجماً"); }
    finally { setUploading(false); }
  };

  const [showPresence, setShowPresence] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isOwn || !token) return;
    chatApi.presence(token).then((r) => setShowPresence(r.show_presence)).catch(() => {});
  }, [isOwn, token]);
  const togglePresence = async () => {
    if (!token || showPresence === null) return;
    const v = !showPresence; setShowPresence(v);
    try { await chatApi.setPresence(token, v); notify("تم", v ? "يظهر للآخرين أنك «نشط الآن» وآخر ظهورك" : "أُخفيت حالتك وآخر ظهورك عن الآخرين"); }
    catch (e: any) { setShowPresence(!v); notify("تعذّر", e?.message || "حاول مجدداً"); }
  };

  const toggleLock = async () => {
    if (!token || !profile) return;
    const v = !profile.profile_locked;
    const ok = await confirmAction(
      v ? "🔒 قفل الملف الشخصي" : "فتح الملف الشخصي",
      v ? "لن يرى غيرك إلا اسمك وصورتك وشارة التوثيق. تختفي نبذتك وشهاداتك ومهاراتك وروابطك ومنشوراتك من ملفك، ويُخفى ملفك المهني العام. يمكنك فتحه في أي وقت."
        : "سيظهر ملفك كاملاً للجميع مرة أخرى.",
      v ? "قفل الملف" : "فتح الملف",
    );
    if (!ok) return;
    try {
      const p = await profileApi.update(token, { profile_locked: v });
      setProfile(p); haptic();
      notify("تم", v ? "ملفك الشخصي مقفل الآن 🔒" : "ملفك الشخصي ظاهر للجميع");
    } catch (e: any) { notify("تعذّر", e?.message || "حاول مجدداً"); }
  };

  const toggleBiometrics = async () => {
    try {
      if (biometricsEnabled) {
        if (await confirmAction("إيقاف البصمة", "سيُطلب منك كلمة المرور عند الدخول القادم.", "إيقاف", true)) { await disableBiometrics(); notify("تم", "أُوقف الدخول بالبصمة على هذا الجهاز"); }
      } else { await enableBiometrics(String(user?.email || user?.phone || "")); notify("تم التفعيل", "يمكنك الآن الدخول ببصمتك من شاشة تسجيل الدخول"); }
    } catch (e: any) { notify("تعذّر", e?.message || "تعذّر تفعيل البصمة"); }
  };

  const signOut = async () => { if (await confirmAction("تسجيل الخروج", "هل تريد تسجيل الخروج من حسابك؟", "خروج", true)) await logout(); };

  const endorse = async (skill: string) => {
    if (!profile) return;
    if (!token || isGuest) { notify("سجّل الدخول", "سجّل الدخول لتزكية مهارات الآخرين"); return; }
    try {
      const r = await profileApi.endorse(token, profile.id, skill);
      setProfile((p) => p ? { ...p, skills: p.skills.map((s) => s.name === skill ? { ...s, count: r.count, mine: r.endorsed } : s) } : p);
      if (r.endorsed) haptic();
    } catch (e: any) { notify("تعذّر", e?.message || "حاول مجدداً"); }
  };

  const deleteCert = async (c: Cert) => {
    if (!token) return;
    if (!(await confirmAction("حذف الشهادة", `حذف «${c.title}» من ملفك؟`, "حذف", true))) return;
    try { await profileApi.delCert(token, c.id); setProfile((p) => p ? { ...p, certificates: p.certificates.filter((x) => x.id !== c.id) } : p); }
    catch (e: any) { notify("تعذّر الحذف", e?.message || "حاول مجدداً"); }
  };

  const shareCv = async () => {
    if (!profile) return;
    const url = publicCvUrl(profile.id);
    const ok = await systemShare(`الملف المهني لـ ${profile.name}${profile.headline ? ` — ${profile.headline}` : ""}`, url);
    if (!ok) { const r = await copyText(url); if (r === "copied") notify("تم النسخ", "نُسخ رابط الملف المهني"); }
  };

  // ── زائر / بلا حساب ──────────────────────────────────────────
  if (!profileId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header title="الملف الشخصي" />
        <View style={styles.centerBox}>
          <View style={styles.emptyIcon}><Ionicons name="person-outline" size={40} color={Colors.primary} /></View>
          <Text style={styles.emptyTitle}>أنشئ ملفك الشخصي</Text>
          <Text style={styles.emptyText}>سجّل الدخول لإضافة صورتك وشهاداتك وروابطك، والحصول على ملف مهني تشاركه مع جهات العمل.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => logout()} accessibilityRole="button">
            <Ionicons name="log-in-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>تسجيل الدخول</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading && !profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header title={isOwn ? "ملفي الشخصي" : "الملف الشخصي"} />
        <View style={styles.centerBox}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header title="الملف الشخصي" />
        <View style={styles.centerBox}>
          <Ionicons name={failed ? "cloud-offline-outline" : "person-remove-outline"} size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>{failed ? "تعذّر تحميل الملف" : "المستخدم غير موجود"}</Text>
          {failed && (
            <TouchableOpacity style={styles.primaryBtn} onPress={fetchProfile} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const roleInfo = ROLE_MAP[profile.role] ?? ROLE_MAP.user;
  const avatarUrl = isOwn ? (user?.avatar_url ?? profile.avatar_url) : profile.avatar_url;
  const links = SOCIALS.filter((s) => profile.social_links?.[s.key]);
  const presence = !isOwn ? presenceText(profile.online, profile.last_seen_at) : "";
  const comp = profile.completeness;
  const lockedView = !!profile.locked && !isOwn;
  const verif = profile.verification;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        title={isOwn ? "ملفي الشخصي" : "الملف الشخصي"}
        right={isOwn ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/(tabs)/settings" as any)} accessibilityLabel="الإعدادات">
            <Ionicons name="settings-outline" size={21} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.iconBtn} onPress={shareCv} accessibilityLabel="مشاركة">
            <Ionicons name="share-social-outline" size={21} color={Colors.primary} />
          </TouchableOpacity>
        )}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* ── البطاقة الرئيسية ── */}
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.hero}>
          <LinearGradient colors={profile.is_verified ? ["#0B4F8A", VERIFIED_BLUE] : [Colors.primaryDeep, Colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
            <View style={styles.coverRing} />
            <View style={[styles.coverRing, { width: 120, height: 120, left: -30, top: 40, opacity: 0.08 }]} />
            {profile.open_to_work && (
              <View style={styles.otw}><Ionicons name="briefcase" size={12} color={Colors.primaryDeep} /><Text style={styles.otwText}>متاح للعمل</Text></View>
            )}
          </LinearGradient>

          <View style={styles.avatarWrap}>
            <TouchableOpacity onPress={isOwn ? pickAvatar : avatarUrl ? () => setPreview(avatarUrl) : undefined} activeOpacity={0.85} disabled={uploading} accessibilityLabel={isOwn ? "تغيير الصورة الشخصية" : undefined}>
              <View style={[styles.avatarFrame, profile.is_verified && { backgroundColor: VERIFIED_BLUE }]}>
                <View style={{ borderRadius: 32, overflow: "hidden", borderWidth: profile.is_verified ? 3 : 0, borderColor: "#fff" }}>
                  <UserAvatar name={profile.name} avatarUrl={avatarUrl} size={100} borderRadius={30} />
                </View>
              </View>
              {isOwn ? (
                <View style={styles.cameraBadge}>
                  {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={16} color="#fff" />}
                </View>
              ) : profile.online ? <View style={styles.onlineDot} /> : null}
            </TouchableOpacity>
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile.name}</Text>
            {profile.is_verified && <VerifiedBadge size={20} />}
          </View>
          {profile.headline ? <Text style={styles.headline}>{profile.headline}</Text> : null}
          <View style={styles.metaRow}>
            {profile.is_verified ? <VerifiedBadge compact={false} label={profile.verified_label} /> : (
              <View style={[styles.rolePill, { backgroundColor: roleInfo.color + "14", borderColor: roleInfo.color + "40" }]}>
                <Ionicons name={roleInfo.icon} size={12} color={roleInfo.color} />
                <Text style={[styles.rolePillText, { color: roleInfo.color }]}>{roleInfo.label}</Text>
              </View>
            )}
            {profile.profession ? <Text style={styles.metaText}>{profile.profession}</Text> : null}
            <Text style={styles.metaText}>عضو منذ {memberSince(profile.created_at)}</Text>
          </View>
          <View style={styles.locRow}>
            {profile.neighborhood ? (<><Ionicons name="location-outline" size={13} color={Colors.textMuted} /><Text style={styles.metaText}>{profile.neighborhood} · الحصاحيصا</Text></>) : null}
            {presence ? <Text style={[styles.metaText, profile.online && { color: "#16A34A", fontFamily: "Cairo_700Bold" }]}>{profile.neighborhood ? " · " : ""}{presence}</Text> : null}
          </View>

          {isOwn && profile.profile_locked ? (
            <TouchableOpacity onPress={toggleLock} style={styles.ownLock}><Ionicons name="lock-closed" size={12} color="#7C3AED" /><Text style={styles.ownLockTxt}>ملفك مقفل — لا يراه إلا أنت والإدارة</Text></TouchableOpacity>
          ) : null}
          {!lockedView && (
            <Text style={[styles.bio, !profile.bio && styles.bioEmpty]}>
              {profile.bio || (isOwn ? "أضف نبذة قصيرة عنك ليتعرّف عليك الآخرون وجهات العمل." : "لا توجد نبذة.")}
            </Text>
          )}

          {links.length > 0 && (
            <View style={styles.socialRow}>
              {links.map((s) => (
                <TouchableOpacity key={s.key} style={[styles.socialBtn, { backgroundColor: s.color + "14" }]} onPress={() => openExternal(String(profile.social_links[s.key]))} accessibilityLabel={s.label}>
                  <Ionicons name={s.icon as any} size={19} color={s.color} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!lockedView && <View style={styles.stats}>
            <Stat value={profile.posts_count} label="منشور" />
            {follow && (<>
              <View style={styles.statDivider} />
              <TouchableOpacity onPress={() => openFollows("followers")} accessibilityRole="button"><Stat value={follow.followers} label="متابِع" /></TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity onPress={() => openFollows("following")} accessibilityRole="button"><Stat value={follow.following} label="يتابع" /></TouchableOpacity>
            </>)}
            {!follow && (<><View style={styles.statDivider} /><Stat value={profile.certificates.length} label="شهادة" /></>)}
            <View style={styles.statDivider} />
            <Stat value={profile.endorsers_count} label="زكّاه" />
            {isOwn && (<><View style={styles.statDivider} /><Stat value={profile.views_30d ?? 0} label="زيارة/30 يوم" /></>)}
          </View>}

          <View style={styles.heroActions}>
            {isOwn ? (
              <>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => setEditOpen(true)}>
                  <Ionicons name="create-outline" size={17} color="#fff" />
                  <Text style={styles.primaryBtnText}>تعديل الملف</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setQrOpen(true)}>
                  <Ionicons name="qr-code-outline" size={17} color={Colors.primaryDeep} />
                  <Text style={styles.ghostBtnText}>ملفي المهني</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {follow && (
                  <TouchableOpacity
                    style={[follow.i_follow ? styles.ghostBtn : styles.primaryBtn, { flexGrow: 1 }]}
                    onPress={toggleFollow}
                    disabled={followBusy}
                    accessibilityRole="button"
                    accessibilityState={{ selected: follow.i_follow }}
                  >
                    <Ionicons name={follow.i_follow ? "checkmark" : "person-add-outline"} size={17} color={follow.i_follow ? Colors.primaryDeep : "#fff"} />
                    <Text style={follow.i_follow ? styles.ghostBtnText : styles.primaryBtnText}>
                      {follow.i_follow ? "تتابعه" : follow.follows_me ? "تابِعه أيضاً" : "متابعة"}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={follow ? styles.ghostBtn : styles.primaryBtn} onPress={() => router.push({ pathname: "/conversation" as any, params: { userId: String(profile.id), otherName: profile.name } })}>
                  <Ionicons name="chatbubble-ellipses-outline" size={17} color={follow ? Colors.primaryDeep : "#fff"} />
                  <Text style={follow ? styles.ghostBtnText : styles.primaryBtnText}>مراسلة</Text>
                </TouchableOpacity>
                {!lockedView && <TouchableOpacity style={[styles.iconBtn, { height: 46, width: 46 }]} onPress={() => openExternal(publicCvUrl(profile.id))} accessibilityLabel="السيرة المهنية">
                  <Ionicons name="document-text-outline" size={18} color={Colors.primaryDeep} />
                </TouchableOpacity>}
                {!!user && !isGuest && (
                  <TouchableOpacity
                    style={[styles.iconBtn, { height: 46, width: 46 }]}
                    accessibilityLabel={`حظر ${profile.name}`}
                    onPress={async () => {
                      const ok = await confirmAction(
                        `حظر ${profile.name}؟`,
                        "لن ترى منشوراته وتعليقاته في المجتمع، ولن يرى منشوراتك وتعليقاتك. يمكنك إلغاء الحظر من الإعدادات ← المستخدمون المحظورون.",
                        "حظر", true,
                      );
                      if (!ok) return;
                      try {
                        await blockUser(profile.id, token);
                        notify("تم الحظر", `لن يظهر لك محتوى ${profile.name} بعد الآن.`);
                        router.canGoBack() ? router.back() : router.replace("/(tabs)" as any);
                      } catch (e: any) { notify("تعذّر الحظر", e?.message || "حاول مرة أخرى"); }
                    }}
                  >
                    <Ionicons name="ban-outline" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </Animated.View>

        {/* ── ملف مقفل ── */}
        {lockedView && (
          <Animated.View entering={FadeInDown.delay(40).springify()} style={[styles.card, { alignItems: "center", gap: 6, paddingVertical: 26 }]}>
            <View style={styles.lockBig}><Ionicons name="lock-closed" size={30} color={Colors.primaryDeep} /></View>
            <Text style={styles.cardTitleNoMb}>{profile.name.split(" ")[0]} قفل ملفه الشخصي</Text>
            <Text style={[styles.hint, { textAlign: "center" }]}>لا تظهر تفاصيل هذا الملف إلا لصاحبه. يمكنك مراسلته مباشرة.</Text>
          </Animated.View>
        )}

        {/* ── عرض الإدارة ── */}
        {!isOwn && profile.admin_contact && (
          <Animated.View entering={FadeInDown.delay(40).springify()} style={[styles.card, styles.adminCard]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>عرض الإدارة</Text>
              <View style={styles.adminPill}><Ionicons name="shield-checkmark" size={12} color="#fff" /><Text style={styles.adminPillTxt}>{user?.role === "admin" ? "مدير" : "مشرف"}</Text></View>
            </View>
            {profile.profile_locked ? <Text style={[styles.hint, { color: "#B45309" }]}>🔒 هذا الملف مقفل للعامة — تراه كاملاً بصفتك من الإدارة.</Text> : null}
            {[
              ["call-outline", "الهاتف", profile.admin_contact.phone],
              ["mail-outline", "البريد", profile.admin_contact.email],
              ["location-outline", "الحي", profile.admin_contact.neighborhood],
            ].filter(([, , v]) => v).map(([icon, label, v]) => (
              <TouchableOpacity key={label as string} style={styles.adminRow} activeOpacity={0.8}
                onPress={() => label === "الهاتف" ? openExternal(`tel:${v}`) : label === "البريد" ? openExternal(`mailto:${v}`) : undefined}>
                <Ionicons name={icon as any} size={16} color={Colors.primaryDeep} />
                <Text style={styles.adminLabel}>{label}:</Text>
                <Text style={styles.adminVal} selectable>{v}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}

        {/* ── اكتمال الملف ── */}
        {isOwn && comp && comp.percent < 100 && (
          <Animated.View entering={FadeInDown.delay(40).springify()} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>قوة ملفك</Text>
              <Text style={[styles.cardCount, { color: Colors.primary, fontFamily: "Cairo_700Bold" }]}>{comp.percent}%</Text>
            </View>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${comp.percent}%` }]} /></View>
            <Text style={styles.hint}>الملف المكتمل يظهر أولاً لجهات العمل ويكسب ثقة الناس. أكمل:</Text>
            <View style={styles.chips}>
              {comp.missing.map((m) => (
                <TouchableOpacity key={m} style={styles.missChip} onPress={() => m.includes("توثيق") ? setVerifyOpen(true) : m.includes("شهادة") ? setCertEdit({ open: true, cert: null }) : m.includes("صورة") ? pickAvatar() : setEditOpen(true)}>
                  <Ionicons name="add-circle-outline" size={14} color={Colors.primaryDeep} />
                  <Text style={styles.missText}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── التوثيق ── */}
        {isOwn && !profile.is_verified && (
          <Animated.View entering={FadeInDown.delay(60).springify()} style={[styles.card, styles.verifyCard]}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
              <View style={styles.verifyIcon}><Ionicons name="shield-checkmark" size={24} color={VERIFIED_BLUE} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitleNoMb}>{verif?.status === "pending" ? "طلب التوثيق قيد المراجعة" : "احصل على شارة «موثوق»"}</Text>
                <Text style={styles.hint}>
                  {verif?.status === "pending" ? "ستصلك إشعار فور مراجعة الإدارة لطلبك." :
                    verif?.status === "rejected" ? `لم يُقبل الطلب السابق${verif.admin_note ? `: ${verif.admin_note}` : ""}. يمكنك إعادة المحاولة.` :
                      "شارة زرقاء بجانب اسمك تؤكد أن حسابك حقيقي وتزيد ثقة الناس وجهات العمل بك."}
                </Text>
              </View>
            </View>
            {verif?.status !== "pending" && (
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: VERIFIED_BLUE, marginTop: 12 }]} onPress={() => setVerifyOpen(true)}>
                <Ionicons name="shield-checkmark-outline" size={17} color="#fff" />
                <Text style={styles.primaryBtnText}>طلب التوثيق</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* ── التطوع: يظهر في الملف المهني لمن جمع نقاطاً ── */}
        {!lockedView && vol && (vol.points > 0 || isOwn) && (
          <Animated.View entering={FadeInDown.delay(70).springify()} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>التطوع</Text>
              {isOwn && <TouchableOpacity onPress={() => router.push("/volunteer" as any)}><Text style={styles.link}>{vol.points > 0 ? "التفاصيل" : "ابدأ التطوع"}</Text></TouchableOpacity>}
            </View>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 3, backgroundColor: TIER_STYLE[vol.level.tier].metal[0], borderColor: TIER_STYLE[vol.level.tier].metal[1], alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="ribbon" size={20} color={TIER_STYLE[vol.level.tier].ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitleNoMb, { fontSize: 16 }]}>{vol.level.name}</Text>
                <Text style={styles.hint}>{vol.points} نقطة · {vol.tasks} مهمة · {vol.hours} ساعة تطوع</Text>
              </View>
              {vol.card && (
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 26, borderRadius: 13, backgroundColor: "#0B1F3A" }}>
                  <Ionicons name="card" size={13} color="#D4AF37" />
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: "#D4AF37" }}>بطاقة متطوع</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* ── المهارات والتزكيات ── */}
        {(profile.skills.length > 0 || isOwn) && (
          <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>المهارات</Text>
              {isOwn ? <TouchableOpacity onPress={() => setEditOpen(true)}><Text style={styles.link}>تعديل</Text></TouchableOpacity> : <Text style={styles.cardCount}>اضغط للتزكية 👏</Text>}
            </View>
            {profile.skills.length === 0 ? (
              <Text style={styles.hint}>أضف مهاراتك ليزكّيك من يعرفك — التزكيات تبني سمعتك المهنية في المدينة.</Text>
            ) : (
              <View style={styles.chips}>
                {profile.skills.map((s) => (
                  <TouchableOpacity key={s.name} disabled={isOwn} onPress={() => endorse(s.name)} style={[styles.skill, s.mine && styles.skillMine]} activeOpacity={0.8}>
                    {s.mine && <Ionicons name="checkmark" size={13} color="#fff" />}
                    <Text style={[styles.skillText, s.mine && { color: "#fff" }]}>{s.name}</Text>
                    {s.count > 0 && <View style={[styles.skillCount, s.mine && { backgroundColor: "#ffffff30" }]}><Text style={[styles.skillCountText, s.mine && { color: "#fff" }]}>{s.count}</Text></View>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* ── الشهادات والخبرات ── */}
        {(profile.certificates.length > 0 || isOwn) && (
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>الشهادات والخبرات</Text>
              {isOwn && (
                <TouchableOpacity style={styles.addMini} onPress={() => setCertEdit({ open: true, cert: null })}>
                  <Ionicons name="add" size={16} color="#fff" /><Text style={styles.addMiniText}>إضافة</Text>
                </TouchableOpacity>
              )}
            </View>
            {isOwn && !profile.show_certs && <Text style={[styles.hint, { color: "#B45309" }]}>شهاداتك مخفية عن الآخرين — يمكنك إظهارها من «تعديل الملف».</Text>}
            {profile.certificates.length === 0 ? (
              <TouchableOpacity style={styles.emptyCert} onPress={() => setCertEdit({ open: true, cert: null })}>
                <Ionicons name="ribbon-outline" size={30} color={Colors.primary} />
                <Text style={styles.emptyCertTitle}>أرفق شهاداتك</Text>
                <Text style={styles.hint}>مؤهلاتك، دوراتك، رخصك وخبراتك — تظهر تلقائياً في ملفك المهني لجهات العمل.</Text>
              </TouchableOpacity>
            ) : profile.certificates.map((c) => {
              const k = CERT_KINDS.find((x) => x.key === c.kind) || CERT_KINDS[5];
              return (
                <View key={c.id} style={styles.cert}>
                  <TouchableOpacity onPress={() => c.file_url ? (c.file_type === "image" ? setPreview(c.file_url) : openExternal(c.file_url)) : undefined} activeOpacity={c.file_url ? 0.8 : 1}>
                    {c.file_url && c.file_type === "image" ? (
                      <Image source={{ uri: c.file_url }} style={styles.certThumb} />
                    ) : (
                      <View style={[styles.certThumb, { backgroundColor: k.color + "14", alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name={(c.file_type === "pdf" ? "document-text" : k.icon) as any} size={24} color={c.file_type === "pdf" ? "#C62828" : k.color} />
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.certKind, { color: k.color }]}>{k.label}{!c.is_public && isOwn ? " · مخفية" : ""}</Text>
                    <Text style={styles.certTitle}>{c.title}</Text>
                    {(c.issuer || c.issued_on || c.expires_on) ? <Text style={styles.certMeta}>{[c.issuer, c.issued_on, c.expires_on ? `ينتهي ${c.expires_on}` : null].filter(Boolean).join(" · ")}</Text> : null}
                    <View style={{ flexDirection: "row-reverse", gap: 12, marginTop: 2 }}>
                      {c.file_url ? <Text style={styles.link} onPress={() => c.file_type === "image" ? setPreview(c.file_url!) : openExternal(c.file_url!)}>عرض المرفق</Text> : null}
                      {c.credential_url ? <Text style={styles.link} onPress={() => openExternal(c.credential_url!)}>التحقق</Text> : null}
                    </View>
                  </View>
                  {isOwn && (
                    <View style={{ gap: 10 }}>
                      <TouchableOpacity hitSlop={8} onPress={() => setCertEdit({ open: true, cert: c })}><Ionicons name="create-outline" size={19} color={Colors.textSecondary} /></TouchableOpacity>
                      <TouchableOpacity hitSlop={8} onPress={() => deleteCert(c)}><Ionicons name="trash-outline" size={19} color="#C62828" /></TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </Animated.View>
        )}

        {/* ── الملف المهني لجهات العمل ── */}
        {isOwn && (
          <Animated.View entering={FadeInDown.delay(120).springify()} style={[styles.card, styles.cvCard]}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
              <View style={[styles.verifyIcon, { backgroundColor: "#ffffff20" }]}><Ionicons name="briefcase" size={22} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitleNoMb, { color: "#fff" }]}>ملفك المهني جاهز تلقائياً</Text>
                <Text style={[styles.hint, { color: "#ffffffCC" }]}>رابط واحد يجمع نبذتك ومهاراتك وشهاداتك وروابطك — أرسله لأي جهة عمل أو اعرض رمز QR.</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.cvBtn} onPress={shareCv}><Ionicons name="share-social" size={16} color={Colors.primaryDeep} /><Text style={styles.cvBtnText}>مشاركة</Text></TouchableOpacity>
              <TouchableOpacity style={styles.cvBtn} onPress={() => setQrOpen(true)}><Ionicons name="qr-code" size={16} color={Colors.primaryDeep} /><Text style={styles.cvBtnText}>QR</Text></TouchableOpacity>
              <TouchableOpacity style={styles.cvBtn} onPress={() => openExternal(publicCvUrl(profile.id))}><Ionicons name="eye" size={16} color={Colors.primaryDeep} /><Text style={styles.cvBtnText}>معاينة</Text></TouchableOpacity>
              <TouchableOpacity style={styles.cvBtn} onPress={() => router.push("/(tabs)/cv-builder" as any)}><Ionicons name="document" size={16} color={Colors.primaryDeep} /><Text style={styles.cvBtnText}>سيرة PDF</Text></TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* ── من زار ملفي ── */}
        {isOwn && visitors.length > 0 && (
          <Animated.View entering={FadeInDown.delay(130).springify()} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>زاروا ملفك مؤخراً</Text>
              <Text style={styles.cardCount}>{visitors.length}</Text>
            </View>
            <RtlScrollRow contentContainerStyle={{ gap: 12}}>
              {visitors.map((v) => (
                <TouchableOpacity key={v.id} style={styles.visitor} onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(v.id) } })}>
                  <UserAvatar name={v.name} avatarUrl={v.avatar_url} size={52} borderRadius={18} />
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 3 }}>
                    <Text style={styles.visitorName} numberOfLines={1}>{v.name.split(" ")[0]}</Text>
                    {v.is_verified && <VerifiedBadge size={12} />}
                  </View>
                  <Text style={styles.visitorTime}>{timeAgo(v.viewed_at)}</Text>
                </TouchableOpacity>
              ))}
            </RtlScrollRow>
          </Animated.View>
        )}

        {/* ── اختصارات صاحب الملف ── */}
        {isOwn && (
          <Animated.View entering={FadeInDown.delay(140).springify()} style={styles.quickGrid}>
            <Quick icon="card" label="بطاقة العضوية" sub="بطاقتك الموثّقة" color="#21423A" onPress={() => router.push("/member-card" as any)} />
            <Quick icon="library" label="المكتبة المنهجية" sub="كتب المنهج السوداني" color="#2A6FA8" onPress={() => router.push("/curriculum" as any)} />
            <Quick icon="create" label="منشور جديد" sub="شارك مجتمعك" color={Colors.accentDeep} onPress={() => router.push("/(tabs)/social" as any)} />
            {Platform.OS !== "web" && biometricsAvailable && (
              <Quick icon="finger-print" label="الدخول بالبصمة" sub={biometricsEnabled ? "مفعّل — اضغط للإيقاف" : "اضغط للتفعيل"} color="#2F8A8A" onPress={toggleBiometrics} />
            )}
            <Quick icon={profile.profile_locked ? "lock-closed" : "lock-open-outline"} label="قفل الملف الشخصي" sub={profile.profile_locked ? "مقفل — اضغط للفتح" : "ظاهر للجميع — اضغط للقفل"} color="#7C3AED" onPress={toggleLock} />
            {showPresence !== null && (
              <Quick icon={showPresence ? "eye" : "eye-off"} label="حالة النشاط" sub={showPresence ? "ظاهرة — اضغط للإخفاء" : "مخفية — اضغط للإظهار"} color="#1D66D4" onPress={togglePresence} />
            )}
            <Quick icon="log-out" label="تسجيل الخروج" sub="من هذا الجهاز" color="#B4232F" onPress={signOut} />
          </Animated.View>
        )}

        {/* ── المنشورات ── */}
        {!lockedView && <Animated.View entering={FadeInDown.delay(160).springify()} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{isOwn ? "منشوراتي" : "المنشورات"}</Text>
            <Text style={styles.cardCount}>{profile.posts_count}</Text>
          </View>
          {posts.length === 0 ? (
            <View style={styles.noPosts}>
              <Ionicons name="newspaper-outline" size={30} color={Colors.textSubtle} />
              <Text style={styles.noPostsText}>{isOwn ? "لم تنشر بعد — شارك أول منشور لك." : "لا توجد منشورات بعد."}</Text>
            </View>
          ) : posts.map((post) => (
            <TouchableOpacity key={post.id} style={styles.post} activeOpacity={0.85} onPress={() => router.push("/(tabs)/social" as any)}>
              {post.image_url ? <Image source={{ uri: post.image_url }} style={styles.postImg} resizeMode="cover" /> : null}
              <View style={{ flex: 1 }}>
                {post.content ? <Text style={styles.postText} numberOfLines={3}>{post.content}</Text> : null}
                <View style={styles.postMeta}>
                  <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
                  <View style={styles.postStat}><Ionicons name="heart-outline" size={13} color={Colors.textMuted} /><Text style={styles.postTime}>{post.likes_count ?? 0}</Text></View>
                  {post.comments_count != null && <View style={styles.postStat}><Ionicons name="chatbubble-outline" size={12} color={Colors.textMuted} /><Text style={styles.postTime}>{post.comments_count}</Text></View>}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </Animated.View>}
      </ScrollView>

      {/* ── النوافذ ── */}
      {isOwn && token && (
        <>
          <EditProfileModal visible={editOpen} profile={profile} token={token} onClose={() => setEditOpen(false)}
            onSaved={async (p, name) => { setProfile({ ...p, name }); setEditOpen(false); haptic(); refreshUser().catch(() => {}); }} />
          <CertFormModal visible={certEdit.open} cert={certEdit.cert} token={token} onClose={() => setCertEdit({ open: false, cert: null })}
            onSaved={() => { setCertEdit({ open: false, cert: null }); haptic(); fetchProfile(); }} />
          <VerifyModal visible={verifyOpen} token={token} onClose={() => setVerifyOpen(false)}
            onSent={() => { setVerifyOpen(false); notify("تم إرسال الطلب", "ستراجع الإدارة طلبك ويصلك إشعار بالنتيجة"); fetchProfile(); }} />
        </>
      )}

      <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setQrOpen(false)}>
          <Pressable style={styles.qrCard} onPress={() => {}}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { fontSize: 18, marginTop: 0 }]}>{profile.name}</Text>
              {profile.is_verified && <VerifiedBadge size={18} />}
            </View>
            {profile.headline ? <Text style={styles.headline}>{profile.headline}</Text> : null}
            <View style={{ padding: 14, backgroundColor: Colors.cardBg, borderRadius: 18, marginTop: 12, borderWidth: 1, borderColor: Colors.border }}>
              <QRCode value={publicCvUrl(profile.id)} size={200} color={Colors.primaryDeep} />
            </View>
            <Text style={[styles.hint, { textAlign: "center", marginTop: 10 }]}>امسح الرمز لفتح الملف المهني</Text>
            <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 12, alignSelf: "stretch" }}>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={shareCv}><Ionicons name="share-social" size={16} color="#fff" /><Text style={styles.primaryBtnText}>مشاركة الرابط</Text></TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setQrOpen(false)}><Text style={styles.ghostBtnText}>إغلاق</Text></TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.92)" }]} onPress={() => setPreview(null)}>
          {preview ? <Image source={{ uri: preview }} style={{ width: "94%", height: "80%" }} resizeMode="contain" /> : null}
          <View style={styles.previewClose}><Ionicons name="close" size={24} color="#fff" /></View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Header({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} accessibilityLabel="رجوع">
        <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      {right ?? <View style={{ width: 40 }} />}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNum}>{value ?? 0}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Quick({ icon, label, sub, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quick} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.quickIcon, { backgroundColor: color + "14" }]}><Ionicons name={icon} size={20} color={color} /></View>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  iconBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },

  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyIcon: { width: 84, height: 84, borderRadius: 28, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "center" },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },

  hero: { marginHorizontal: 16, marginTop: 6, backgroundColor: Colors.cardBg, borderRadius: 24, borderWidth: 1, borderColor: Colors.border, overflow: "hidden", alignItems: "center", paddingBottom: 18 },
  cover: { alignSelf: "stretch", height: 104, overflow: "hidden" },
  coverRing: { position: "absolute", width: 180, height: 180, borderRadius: 90, borderWidth: 26, borderColor: "#fff", opacity: 0.07, right: -40, top: -60 },
  otw: { position: "absolute", top: 12, right: 12, flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: Colors.cardBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  otwText: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: Colors.primaryDeep },
  avatarWrap: { marginTop: -54 },
  avatarFrame: { padding: 4, borderRadius: 36, backgroundColor: Colors.cardBg },
  cameraBadge: { position: "absolute", bottom: 2, left: 2, width: 32, height: 32, borderRadius: 11, backgroundColor: Colors.primary, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  onlineDot: { position: "absolute", bottom: 6, left: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: "#22C55E", borderWidth: 3, borderColor: "#fff" },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 8, paddingHorizontal: 16 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 21, color: Colors.textPrimary, textAlign: "center" },
  headline: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primaryDeep, textAlign: "center", paddingHorizontal: 20 },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap", justifyContent: "center", paddingHorizontal: 12 },
  rolePill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  rolePillText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  metaText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  locRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 2 },
  bio: { fontFamily: "Cairo_400Regular", fontSize: 14, lineHeight: 23, color: Colors.textSecondary, textAlign: "center", marginTop: 10, paddingHorizontal: 22 },
  bioEmpty: { color: Colors.textSubtle, fontStyle: "italic" },
  socialRow: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 12, paddingHorizontal: 16 },
  socialBtn: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row-reverse", alignItems: "center", marginTop: 14, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 16, backgroundColor: Colors.bg, alignSelf: "stretch", marginHorizontal: 14, justifyContent: "space-around" },
  stat: { alignItems: "center", minWidth: 56 },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.primaryDeep },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  heroActions: { flexDirection: "row-reverse", gap: 10, marginTop: 14, paddingHorizontal: 16, alignSelf: "stretch" },

  primaryBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 18, height: 46, borderRadius: 14, flexGrow: 1 },
  primaryBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  ghostBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary + "0F", borderWidth: 1, borderColor: Colors.primary + "30", paddingHorizontal: 16, height: 46, borderRadius: 14 },
  ghostBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primaryDeep },

  card: { marginHorizontal: 16, marginTop: 14, backgroundColor: Colors.cardBg, borderRadius: 22, borderWidth: 1, borderColor: Colors.border, padding: 16 },
  cardHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", marginBottom: 4 },
  cardTitleNoMb: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  cardCount: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 20, color: Colors.textMuted, textAlign: "right" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  bar: { height: 8, borderRadius: 4, backgroundColor: Colors.bg, overflow: "hidden", marginVertical: 8, flexDirection: "row-reverse" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 8 },
  missChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "0D", borderWidth: 1, borderColor: Colors.primary + "30", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  missText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primaryDeep },

  ownLock: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#7C3AED12", borderWidth: 1, borderColor: "#7C3AED35", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  ownLockTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: "#7C3AED" },
  lockBig: { width: 64, height: 64, borderRadius: 22, backgroundColor: Colors.primary + "14", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  adminCard: { borderColor: "#F0A50060", backgroundColor: Colors.accentSoft },
  adminPill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: "#D97706", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  adminPillTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  adminRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingVertical: 6 },
  adminLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  adminVal: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  verifyCard: { borderColor: VERIFIED_BLUE + "40", backgroundColor: "#F3F9FE" },
  verifyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: VERIFIED_BLUE + "18", alignItems: "center", justifyContent: "center" },

  skill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  skillMine: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  skillText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary },
  skillCount: { minWidth: 20, paddingHorizontal: 5, height: 20, borderRadius: 10, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  skillCountText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.primaryDeep },

  addMini: { flexDirection: "row-reverse", alignItems: "center", gap: 3, backgroundColor: Colors.primary, paddingHorizontal: 11, height: 30, borderRadius: 10 },
  addMiniText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  emptyCert: { alignItems: "center", gap: 4, paddingVertical: 18, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: Colors.primary + "50", marginTop: 6, paddingHorizontal: 16 },
  emptyCertTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.primaryDeep },
  cert: { flexDirection: "row-reverse", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.divider, alignItems: "flex-start" },
  certThumb: { width: 58, height: 58, borderRadius: 12, backgroundColor: Colors.bg },
  certKind: { fontFamily: "Cairo_700Bold", fontSize: 12, textAlign: "right" },
  certTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  certMeta: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },

  cvCard: { backgroundColor: Colors.primaryDeep, borderColor: Colors.primaryDeep },
  cvBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, height: 40, borderRadius: 12, backgroundColor: Colors.cardBg },
  cvBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primaryDeep },

  visitor: { width: 68, alignItems: "center", gap: 3 },
  visitorName: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, maxWidth: 56 },
  visitorTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  quickGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginHorizontal: 16, marginTop: 14 },
  quick: { width: "48%", flexGrow: 1, backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 14, alignItems: "flex-end", gap: 2 },
  quickIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  quickLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  quickSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted },

  noPosts: { alignItems: "center", gap: 6, paddingVertical: 20 },
  noPostsText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  post: { flexDirection: "row-reverse", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.divider },
  postImg: { width: 64, height: 64, borderRadius: 12, backgroundColor: Colors.bg },
  postText: { fontFamily: "Cairo_400Regular", fontSize: 14, lineHeight: 22, color: Colors.textPrimary, textAlign: "right" },
  postMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginTop: 4 },
  postStat: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  postTime: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },

  overlay: { flex: 1, backgroundColor: "rgba(10,20,16,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  qrCard: { backgroundColor: Colors.cardBg, borderRadius: 24, padding: 20, alignItems: "center", width: "100%", maxWidth: 360 },
  previewClose: { position: "absolute", top: 50, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "#ffffff25", alignItems: "center", justifyContent: "center" },
});
