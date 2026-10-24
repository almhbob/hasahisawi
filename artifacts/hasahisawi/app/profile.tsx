import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Image,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import UserAvatar from "@/components/UserAvatar";
import { notify, confirmAction, uploadProfilePhoto } from "@/lib/xplatform";

type UserProfile = {
  id: number;
  name: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
  bio: string | null;
  posts_count: number;
  reports_count: number;
};

type Post = {
  id: number;
  content: string;
  image_url?: string | null;
  created_at: string;
  likes_count: number;
  comments_count?: number;
};

const ROLE_MAP: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  admin:     { label: "الإدارة",  color: "#B4232F", icon: "shield-checkmark" },
  moderator: { label: "مشرف",     color: "#2A6FA8", icon: "shield-half" },
  org:       { label: "مؤسسة",    color: Colors.accentDeep, icon: "business" },
  user:      { label: "عضو",      color: Colors.primary, icon: "person-circle" },
};

const BIO_MAX = 300;
const NAME_MAX = 60;

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

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", bio: "", neighborhood: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!profileId) { setLoading(false); return; }
    setLoading(true); setFailed(false);
    try {
      const base = getApiUrl();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [profRes, postsRes] = await Promise.all([
        fetch(`${base}/api/users/${profileId}/profile`, { headers }),
        fetch(`${base}/api/posts?user_id=${profileId}&limit=20`, { headers }),
      ]);
      if (profRes.ok) setProfile(await profRes.json());
      else { setProfile(null); setFailed(profRes.status !== 404); }
      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(Array.isArray(data) ? data : data.posts ?? []);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [profileId, token]);

  useFocusEffect(useCallback(() => { fetchProfile(); }, [fetchProfile]));

  const startEdit = () => {
    setForm({
      name: profile?.name || user?.name || "",
      bio: profile?.bio || "",
      neighborhood: user?.neighborhood || "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!token) return;
    const name = form.name.trim();
    if (name.length < 2) { notify("الاسم مطلوب", "اكتب اسمك (حرفان على الأقل)."); return; }
    setSaving(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, bio: form.bio.trim(), neighborhood: form.neighborhood.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "تعذّر حفظ البيانات");
      setProfile((p) => (p ? { ...p, name, bio: form.bio.trim() } : p));
      await refreshUser();
      setEditing(false);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      notify("تعذّر الحفظ", e?.message || "حاول مرة أخرى");
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
    if (!isOwn || !token || uploading) return;
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { notify("الإذن مطلوب", "يرجى السماح للتطبيق بالوصول إلى مكتبة الصور"); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const url = await uploadProfilePhoto(result.assets[0].uri, token);
      setProfile((p) => (p ? { ...p, avatar_url: url } : p));
      await refreshUser();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      notify("تعذّر رفع الصورة", e?.message || "حاول بصورة أصغر حجماً");
    } finally {
      setUploading(false);
    }
  };

  const toggleBiometrics = async () => {
    try {
      if (biometricsEnabled) {
        if (await confirmAction("إيقاف البصمة", "سيُطلب منك كلمة المرور عند الدخول القادم.", "إيقاف", true)) {
          await disableBiometrics();
          notify("تم", "أُوقف الدخول بالبصمة على هذا الجهاز");
        }
      } else {
        await enableBiometrics(String(user?.email || user?.phone || ""));
        notify("تم التفعيل", "يمكنك الآن الدخول ببصمتك من شاشة تسجيل الدخول");
      }
    } catch (e: any) {
      notify("تعذّر", e?.message || "تعذّر تفعيل البصمة");
    }
  };

  const signOut = async () => {
    if (await confirmAction("تسجيل الخروج", "هل تريد تسجيل الخروج من حسابك؟", "خروج", true)) await logout();
  };

  // ── زائر / بلا حساب ──────────────────────────────────────────
  if (!profileId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header title="الملف الشخصي" />
        <View style={styles.centerBox}>
          <View style={styles.emptyIcon}><Ionicons name="person-outline" size={40} color={Colors.primary} /></View>
          <Text style={styles.emptyTitle}>أنشئ ملفك الشخصي</Text>
          <Text style={styles.emptyText}>سجّل الدخول لإضافة صورتك وبياناتك، ونشر المنشورات، والحصول على بطاقة العضوية.</Text>
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        title={isOwn ? "ملفي الشخصي" : "الملف الشخصي"}
        right={isOwn ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/(tabs)/settings" as any)} accessibilityLabel="الإعدادات">
            <Ionicons name="settings-outline" size={21} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push({ pathname: "/conversation" as any, params: { userId: String(profile.id), otherName: profile.name } })}
            accessibilityLabel="مراسلة"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={21} color={Colors.primary} />
          </TouchableOpacity>
        )}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* ── البطاقة الرئيسية ── */}
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.hero}>
          <LinearGradient colors={[Colors.primaryDeep, Colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
            <View style={styles.coverRing} />
            <View style={[styles.coverRing, { width: 120, height: 120, left: -30, top: 40, opacity: 0.08 }]} />
          </LinearGradient>

          <View style={styles.avatarWrap}>
            <TouchableOpacity onPress={isOwn ? pickAvatar : undefined} activeOpacity={isOwn ? 0.8 : 1} disabled={!isOwn || uploading} accessibilityRole={isOwn ? "button" : undefined} accessibilityLabel={isOwn ? "تغيير الصورة الشخصية" : undefined}>
              <View style={styles.avatarFrame}>
                <UserAvatar name={profile.name} avatarUrl={avatarUrl} size={100} borderRadius={32} />
              </View>
              {isOwn && (
                <View style={styles.cameraBadge}>
                  {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={16} color="#fff" />}
                </View>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>{profile.name}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.rolePill, { backgroundColor: roleInfo.color + "14", borderColor: roleInfo.color + "40" }]}>
              <Ionicons name={roleInfo.icon} size={12} color={roleInfo.color} />
              <Text style={[styles.rolePillText, { color: roleInfo.color }]}>{roleInfo.label}</Text>
            </View>
            <Text style={styles.metaText}>عضو منذ {memberSince(profile.created_at)}</Text>
          </View>
          {isOwn && user?.neighborhood ? (
            <View style={styles.locRow}>
              <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.metaText}>{user.neighborhood} · الحصاحيصا</Text>
            </View>
          ) : null}

          {!editing && (
            <Text style={[styles.bio, !profile.bio && styles.bioEmpty]}>
              {profile.bio || (isOwn ? "أضف نبذة قصيرة عنك ليتعرّف عليك الآخرون." : "لا توجد نبذة.")}
            </Text>
          )}

          <View style={styles.stats}>
            <Stat value={profile.posts_count} label="منشور" />
            <View style={styles.statDivider} />
            <Stat value={profile.reports_count} label="بلاغ للمدينة" />
          </View>

          {isOwn && !editing && (
            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.primaryBtn} onPress={startEdit} accessibilityRole="button">
                <Ionicons name="create-outline" size={17} color="#fff" />
                <Text style={styles.primaryBtnText}>تعديل البيانات</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={pickAvatar} disabled={uploading} accessibilityRole="button">
                <Ionicons name="image-outline" size={17} color={Colors.primaryDeep} />
                <Text style={styles.ghostBtnText}>{avatarUrl ? "تغيير الصورة" : "إضافة صورة"}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* ── نموذج التعديل ── */}
        {isOwn && editing && (
          <Animated.View entering={FadeInDown.springify()} style={styles.card}>
            <Text style={styles.cardTitle}>بياناتي</Text>
            <Field label="الاسم" value={form.name} max={NAME_MAX} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="اسمك الكامل" />
            <Field label="الحي" value={form.neighborhood} max={60} onChange={(v) => setForm((f) => ({ ...f, neighborhood: v }))} placeholder="مثال: حي الشرقي" />
            <Field label="نبذة عنك" value={form.bio} max={BIO_MAX} multiline onChange={(v) => setForm((f) => ({ ...f, bio: v }))} placeholder="عملك، اهتماماتك، ما تقدّمه للمجتمع…" />
            {(user?.phone || user?.email) ? (
              <View style={styles.privateBox}>
                <Ionicons name="lock-closed-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.privateText}>
                  {[user?.phone, user?.email].filter(Boolean).join(" · ")} — لا تظهر للآخرين
                </Text>
              </View>
            ) : null}
            <View style={styles.formActions}>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={saveEdit} disabled={saving} accessibilityRole="button">
                {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
                <Text style={styles.primaryBtnText}>حفظ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setEditing(false)} disabled={saving} accessibilityRole="button">
                <Text style={styles.ghostBtnText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* ── اختصارات صاحب الملف ── */}
        {isOwn && !editing && (
          <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.quickGrid}>
            <Quick icon="card" label="بطاقة العضوية" sub="بطاقتك الموثّقة" color="#21423A" onPress={() => router.push("/member-card" as any)} />
            <Quick icon="library" label="المكتبة المنهجية" sub="كتب المنهج السوداني" color="#2A6FA8" onPress={() => router.push("/curriculum" as any)} />
            <Quick icon="create" label="منشور جديد" sub="شارك مجتمعك" color={Colors.accentDeep} onPress={() => router.push("/(tabs)/social" as any)} />
            {Platform.OS !== "web" && biometricsAvailable && (
              <Quick icon="finger-print" label="الدخول بالبصمة" sub={biometricsEnabled ? "مفعّل — اضغط للإيقاف" : "اضغط للتفعيل"} color="#2F8A8A" onPress={toggleBiometrics} />
            )}
            <Quick icon="log-out" label="تسجيل الخروج" sub="من هذا الجهاز" color="#B4232F" onPress={signOut} />
          </Animated.View>
        )}

        {/* ── المنشورات ── */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.card}>
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
        </Animated.View>
      </ScrollView>
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

function Field({ label, value, onChange, placeholder, max, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; max: number; multiline?: boolean }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldCount}>{value.length}/{max}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.slice(0, max))}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSubtle}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 90, textAlignVertical: "top" }]}
        textAlign="right"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  iconBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },

  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyIcon: { width: 84, height: 84, borderRadius: 28, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "center" },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },

  hero: { marginHorizontal: 16, marginTop: 6, backgroundColor: "#fff", borderRadius: 24, borderWidth: 1, borderColor: Colors.border, overflow: "hidden", alignItems: "center", paddingBottom: 18 },
  cover: { alignSelf: "stretch", height: 96, overflow: "hidden" },
  coverRing: { position: "absolute", width: 180, height: 180, borderRadius: 90, borderWidth: 26, borderColor: "#fff", opacity: 0.07, right: -40, top: -60 },
  avatarWrap: { marginTop: -54 },
  avatarFrame: { padding: 4, borderRadius: 36, backgroundColor: "#fff" },
  cameraBadge: { position: "absolute", bottom: 2, left: 2, width: 32, height: 32, borderRadius: 11, backgroundColor: Colors.primary, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  name: { fontFamily: "Cairo_700Bold", fontSize: 21, color: Colors.textPrimary, marginTop: 8, textAlign: "center", paddingHorizontal: 16 },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap", justifyContent: "center" },
  rolePill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  rolePillText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  metaText: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textMuted },
  locRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 2 },
  bio: { fontFamily: "Cairo_400Regular", fontSize: 14, lineHeight: 23, color: Colors.textSecondary, textAlign: "center", marginTop: 10, paddingHorizontal: 22 },
  bioEmpty: { color: Colors.textSubtle, fontStyle: "italic" },
  stats: { flexDirection: "row-reverse", alignItems: "center", marginTop: 14, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 16, backgroundColor: Colors.bg },
  stat: { alignItems: "center", minWidth: 90 },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.primaryDeep },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  heroActions: { flexDirection: "row-reverse", gap: 10, marginTop: 14, paddingHorizontal: 16, alignSelf: "stretch" },

  primaryBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 18, height: 46, borderRadius: 14, flexGrow: 1 },
  primaryBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  ghostBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary + "0F", borderWidth: 1, borderColor: Colors.primary + "30", paddingHorizontal: 16, height: 46, borderRadius: 14 },
  ghostBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primaryDeep },

  card: { marginHorizontal: 16, marginTop: 14, backgroundColor: "#fff", borderRadius: 22, borderWidth: 1, borderColor: Colors.border, padding: 16 },
  cardHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", marginBottom: 8 },
  cardCount: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  fieldHead: { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 5 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  fieldCount: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSubtle },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 13, backgroundColor: Colors.bg, paddingHorizontal: 13, paddingVertical: Platform.OS === "web" ? 11 : 9, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary },
  privateBox: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: Colors.bg, borderRadius: 12, padding: 10, marginBottom: 12 },
  privateText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  formActions: { flexDirection: "row-reverse", gap: 10 },

  quickGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginHorizontal: 16, marginTop: 14 },
  quick: { width: "48%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 14, alignItems: "flex-end", gap: 2 },
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
  postTime: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
});
