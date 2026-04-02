import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, Image,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import UserAvatar from "@/components/UserAvatar";
import AnimatedPress from "@/components/AnimatedPress";

type UserProfile = {
  id: number;
  name: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
  bio: string;
  posts_count: number;
  reports_count: number;
};

type Post = {
  id: number;
  content: string;
  image_url?: string | null;
  created_at: string;
  likes_count: number;
};

const ROLE_MAP: Record<string, { label: string; color: string; icon: string }> = {
  admin:     { label: "مشرف",    color: "#E05567", icon: "shield-checkmark" },
  moderator: { label: "مشرف",    color: "#E05567", icon: "shield-checkmark" },
  org:       { label: "مؤسسة",   color: Colors.accent, icon: "business" },
  user:      { label: "مواطن",   color: Colors.primary, icon: "person-circle" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "الآن";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} د`;
  if (diff < 86_400_000) return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ar", { day: "numeric", month: "short" });
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user, token } = useAuth();

  const profileId = id ? Number(id) : user?.id;
  const isOwn = !id || Number(id) === user?.id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState("");
  const [savingBio, setSavingBio] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!profileId) return;
    try {
      setLoading(true);
      const base = getApiUrl();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [profRes, postsRes] = await Promise.all([
        fetch(`${base}/api/users/${profileId}/profile`, { headers }),
        fetch(`${base}/api/posts?user_id=${profileId}&limit=10`, { headers }),
      ]);

      if (profRes.ok) {
        const data = await profRes.json();
        setProfile(data);
        setBioText(data.bio || "");
      }
      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(Array.isArray(data) ? data.slice(0, 10) : (data.posts ?? []).slice(0, 10));
      }
    } catch (e) {
      console.error("Profile fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [profileId, token]);

  useFocusEffect(useCallback(() => { fetchProfile(); }, [fetchProfile]));

  const saveBio = async () => {
    if (!token) return;
    setSavingBio(true);
    try {
      const base = getApiUrl();
      const res = await fetch(`${base}/api/users/me/bio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ bio: bioText }),
      });
      if (res.ok) {
        setProfile((p) => p ? { ...p, bio: bioText } : p);
        setEditingBio(false);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert("خطأ", "تعذّر حفظ السيرة الذاتية");
    } finally {
      setSavingBio(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-forward" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>الملف الشخصي</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-forward" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>الملف الشخصي</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Ionicons name="person-circle-outline" size={64} color={Colors.textMuted} />
          <Text style={{ fontFamily: "Cairo_600SemiBold", color: Colors.textMuted, fontSize: 16 }}>المستخدم غير موجود</Text>
        </View>
      </View>
    );
  }

  const roleInfo = ROLE_MAP[profile.role] ?? ROLE_MAP.user;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isOwn ? "ملفي الشخصي" : "الملف الشخصي"}</Text>
        {isOwn ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.push("/(tabs)/settings" as any)}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.push({ pathname: "/conversation" as any, params: { userId: String(profile.id), otherName: profile.name } })}
          >
            <Ionicons name="chatbubble-outline" size={22} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Hero Card */}
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.heroCard}>
          <LinearGradient
            colors={[Colors.primary + "18", Colors.cardBg]}
            style={StyleSheet.absoluteFill}
          />

          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <UserAvatar
              name={profile.name}
              avatarUrl={profile.avatar_url}
              size={90}
              borderRadius={28}
            />
            <View style={[styles.rolePill, { backgroundColor: roleInfo.color + "20", borderColor: roleInfo.color + "40" }]}>
              <Ionicons name={roleInfo.icon as any} size={12} color={roleInfo.color} />
              <Text style={[styles.rolePillText, { color: roleInfo.color }]}>{roleInfo.label}</Text>
            </View>
          </View>

          {/* Name */}
          <Text style={styles.profileName}>{profile.name}</Text>
          <Text style={styles.joinDate}>عضو منذ {formatDate(profile.created_at)}</Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{profile.posts_count}</Text>
              <Text style={styles.statLabel}>منشور</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{profile.reports_count}</Text>
              <Text style={styles.statLabel}>بلاغ</Text>
            </View>
          </View>
        </Animated.View>

        {/* Bio Section */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.section}>
          <View style={styles.sectionHeader}>
            <TouchableOpacity
              onPress={() => {
                if (isOwn) {
                  setEditingBio(!editingBio);
                  if (!editingBio) setBioText(profile.bio || "");
                }
              }}
              style={styles.sectionAction}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isOwn && (
                <Ionicons
                  name={editingBio ? "close-circle-outline" : "pencil-outline"}
                  size={18}
                  color={Colors.textMuted}
                />
              )}
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>نبذة تعريفية</Text>
          </View>

          {editingBio ? (
            <View style={styles.bioEditWrap}>
              <TextInput
                style={styles.bioInput}
                value={bioText}
                onChangeText={setBioText}
                placeholder="اكتب نبذة قصيرة عن نفسك..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                textAlign="right"
                maxLength={200}
              />
              <View style={styles.bioEditActions}>
                <Text style={styles.bioCharCount}>{bioText.length}/200</Text>
                <TouchableOpacity
                  onPress={saveBio}
                  disabled={savingBio}
                  style={[styles.bioSaveBtn, { backgroundColor: Colors.primary }]}
                >
                  {savingBio
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.bioSaveBtnText}>حفظ</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={styles.bioText}>
              {profile.bio?.trim()
                ? profile.bio
                : isOwn
                  ? "اضغط على ✏️ لإضافة نبذة تعريفية عنك"
                  : "لم يُضف هذا المستخدم نبذة تعريفية بعد"}
            </Text>
          )}
        </Animated.View>

        {/* Posts Section */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View />
            <Text style={styles.sectionTitle}>المنشورات الأخيرة</Text>
          </View>

          {posts.length === 0 ? (
            <View style={styles.emptyPosts}>
              <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyPostsText}>لا توجد منشورات بعد</Text>
            </View>
          ) : (
            <View style={styles.postsList}>
              {posts.map((post, i) => (
                <Animated.View key={post.id} entering={FadeInDown.delay(120 + i * 40).springify()}>
                  <AnimatedPress onPress={() => router.push("/(tabs)/social" as any)}>
                    <View style={styles.postCard}>
                      {post.image_url && (
                        <Image
                          source={{ uri: post.image_url }}
                          style={styles.postImage}
                          resizeMode="cover"
                        />
                      )}
                      <Text style={styles.postContent} numberOfLines={3}>{post.content}</Text>
                      <View style={styles.postMeta}>
                        <View style={styles.postLikes}>
                          <Ionicons name="heart" size={12} color={Colors.danger} />
                          <Text style={styles.postMetaText}>{post.likes_count}</Text>
                        </View>
                        <Text style={styles.postTime}>{formatTime(post.created_at)}</Text>
                      </View>
                    </View>
                  </AnimatedPress>
                </Animated.View>
              ))}
              {profile.posts_count > 10 && (
                <TouchableOpacity
                  style={styles.viewAllBtn}
                  onPress={() => router.push("/(tabs)/social" as any)}
                >
                  <Text style={styles.viewAllText}>عرض كل المنشورات ({profile.posts_count})</Text>
                  <Ionicons name="chevron-back" size={14} color={Colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </Animated.View>

        {/* Chat Button (for others) */}
        {!isOwn && (
          <Animated.View entering={FadeInUp.delay(150).springify()} style={{ marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/conversation" as any, params: { userId: String(profile.id), otherName: profile.name } })}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDim]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.chatBtn}
              >
                <Ionicons name="chatbubble" size={18} color="#fff" />
                <Text style={styles.chatBtnText}>مراسلة {profile.name.split(" ")[0]}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  scroll: { padding: 16, gap: 16 },

  heroCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 24,
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
  },
  avatarContainer: { alignItems: "center", marginBottom: 4 },
  rolePill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  rolePillText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  profileName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: Colors.textPrimary,
    textAlign: "center",
    marginTop: 4,
  },
  joinDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 24,
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    width: "100%",
    justifyContent: "center",
  },
  statItem: { alignItems: "center", gap: 2 },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.divider },

  section: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 18,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  sectionAction: { padding: 4 },
  bioText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "right",
    lineHeight: 24,
  },
  bioEditWrap: { gap: 8 },
  bioInput: {
    backgroundColor: Colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 12,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
    minHeight: 90,
    textAlignVertical: "top",
  },
  bioEditActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bioCharCount: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  bioSaveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  bioSaveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },

  emptyPosts: { alignItems: "center", gap: 8, paddingVertical: 20 },
  emptyPostsText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted },
  postsList: { gap: 10 },
  postCard: {
    backgroundColor: Colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 14,
    gap: 8,
  },
  postImage: {
    width: "100%",
    height: 140,
    borderRadius: 10,
  },
  postContent: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "right",
    lineHeight: 22,
  },
  postMeta: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  postLikes: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  postMetaText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  postTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  viewAllBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    marginTop: 4,
  },
  viewAllText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },
  chatBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
  },
  chatBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
});
