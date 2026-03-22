import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import GuestGate from "@/components/GuestGate";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import { useFocusEffect } from "expo-router";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import Colors from "@/constants/colors";
import { useFsPosts, FsPost } from "@/lib/firebase/hooks";
import { isFirestoreEnabled } from "@/lib/firebase/index";
import { fsUpdateDoc, COLLECTIONS } from "@/lib/firebase/firestore";
import { requireNetwork } from "@/lib/network";

// ─── Types ────────────────────────────────────────────────────────────────────

type Post = {
  id: string | number;
  author_name: string;
  content: string;
  category: string;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
  created_at: string;
};

function fsPostToPost(fp: FsPost): Post {
  const ts = fp.createdAt as any;
  const created_at = ts?.seconds
    ? new Date(ts.seconds * 1000).toISOString()
    : new Date().toISOString();
  return {
    id: fp.id,
    author_name: fp.authorName,
    content: fp.content,
    category: fp.category,
    likes_count: fp.likes,
    comments_count: fp.comments,
    liked_by_me: false,
    created_at,
  };
}

type Comment = {
  id: number;
  post_id: number;
  author_name: string;
  content: string;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ADMIN_PIN_KEY = "admin_logged_in";
const DEVICE_ID_KEY = "social_device_id";
const USER_NAME_KEY = "social_user_name";

const CATEGORY_KEYS: Record<string, string> = {
  "عام": "general",
  "سؤال": "question",
  "خبر": "news",
  "إعلان": "announcement",
  "نقاش": "general",
  "شكر": "general",
};

const CATEGORY_COLORS: Record<string, string> = {
  "عام": Colors.primary,
  "سؤال": "#2980B9",
  "خبر": "#8E44AD",
  "إعلان": "#E67E22",
  "نقاش": "#C0392B",
  "شكر": "#27AE60",
};

function timeAgo(iso: string, t: any) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 1) return `${t('social', 'ago')} ${d} ${t('social', 'daysAgo')}`;
  if (h >= 1) return `${t('social', 'ago')} ${h} ${t('social', 'hoursAgo')}`;
  if (m >= 1) return `${t('social', 'ago')} ${m} ${t('social', 'minutesAgo')}`;
  return t('social', 'justNow');
}

async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function apiUrl(path: string) {
  return new URL(path, getApiUrl()).toString();
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function apiFetchPosts(deviceId: string): Promise<Post[]> {
  const res = await fetch(apiUrl(`/api/posts?device_id=${encodeURIComponent(deviceId)}`));
  if (!res.ok) throw new Error("Failed to fetch posts");
  return res.json();
}

async function apiCreatePost(data: { author_name: string; content: string; category: string }): Promise<Post> {
  const res = await fetch(apiUrl("/api/posts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to post");
  return json;
}

async function apiDeletePost(id: string | number, token?: string | null): Promise<void> {
  if (!token) throw new Error("غير مصرح");
  const res = await fetch(apiUrl(`/api/posts/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to delete");
}

async function apiFetchComments(postId: number): Promise<Comment[]> {
  const res = await fetch(apiUrl(`/api/posts/${postId}/comments`));
  if (!res.ok) throw new Error("Failed to fetch comments");
  return res.json();
}

async function apiCreateComment(postId: number, data: { author_name: string; content: string }): Promise<Comment> {
  const res = await fetch(apiUrl(`/api/posts/${postId}/comments`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to comment");
  return json;
}

async function apiDeleteComment(id: number, token?: string | null): Promise<void> {
  if (!token) throw new Error("غير مصرح");
  const res = await fetch(apiUrl(`/api/comments/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to delete");
}

async function apiToggleLike(postId: number, deviceId: string): Promise<{ liked: boolean }> {
  const res = await fetch(apiUrl(`/api/posts/${postId}/like`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId }),
  });
  return res.json();
}

// ─── Add Post Modal ───────────────────────────────────────────────────────────

function AddPostModal({
  visible,
  onClose,
  onPost,
  defaultName,
}: {
  visible: boolean;
  onClose: () => void;
  onPost: (content: string, category: string, name: string) => Promise<void>;
  defaultName: string;
}) {
  const insets = useSafeAreaInsets();
  const { t, isRTL, tr } = useLang();
  const [name, setName] = useState(defaultName);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("عام");
  const [loading, setLoading] = useState(false);

  useEffect(() => { setName(defaultName); }, [defaultName]);

  const handlePost = async () => {
    if (!content.trim()) { Alert.alert(t('common', 'error'), t('social', 'writeSomething')); return; }
    setLoading(true);
    try {
      await onPost(content.trim(), category, name.trim() || tr("مجهول", "Anonymous"));
      setContent("");
      onClose();
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  const CATEGORIES = ["عام", "سؤال", "خبر", "إعلان", "نقاش", "شكر"];
  const categoriesT = t('social', 'categories');
  const getCatLabel = (c: string) => {
    const key = CATEGORY_KEYS[c];
    return key ? categoriesT[key] : c;
  };

  const textStyle = { textAlign: isRTL ? "right" : "left" } as const;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={ms.overlay} onPress={onClose}>
          <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Animated.View entering={FadeIn.duration(300)}>
            <View style={ms.handle} />
            <View style={[ms.sheetHead, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={ms.sheetTitle}>{t('social', 'newPost')}</Text>
              <View style={{ width: 22 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={ms.form}>
                <View style={ms.field}>
                  <Text style={[ms.label, textStyle]}>{t('common', 'name')} ({t('common', 'optional')})</Text>
                  <TextInput
                    style={[ms.input, textStyle]}
                    value={name}
                    onChangeText={setName}
                    placeholder={tr("مجهول", "Anonymous")}
                    placeholderTextColor={Colors.textMuted}
                    maxLength={50}
                  />
                </View>

                <View style={ms.field}>
                  <Text style={[ms.label, textStyle]}>{t('common', 'type')}</Text>
                  <View style={[ms.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    {CATEGORIES.map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[ms.chip, category === c && { backgroundColor: CATEGORY_COLORS[c], borderColor: CATEGORY_COLORS[c] }]}
                        onPress={() => setCategory(c)}
                      >
                        <Text style={[ms.chipText, category === c && { color: "#fff" }]}>{getCatLabel(c)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={ms.field}>
                  <Text style={[ms.label, textStyle]}>{t('common', 'description')} *</Text>
                  <TextInput
                    style={[ms.input, ms.textArea, textStyle]}
                    value={content}
                    onChangeText={setContent}
                    placeholder={t('social', 'writeSomething')}
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    maxLength={1000}
                  />
                  <Text style={[ms.charCount, { textAlign: isRTL ? "left" : "right" }]}>{content.length}/1000</Text>
                </View>

                <TouchableOpacity
                  style={[ms.postBtn, loading && { opacity: 0.6 }, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                  onPress={handlePost}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="send" size={18} color="#fff" /><Text style={ms.postBtnText}>{t('social', 'post')}</Text></>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
            </Animated.View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Comments Sheet ───────────────────────────────────────────────────────────

function CommentsModal({
  post,
  visible,
  onClose,
  isAdmin,
  isGuest,
  defaultName,
  adminToken,
}: {
  post: Post | null;
  visible: boolean;
  onClose: () => void;
  isAdmin: boolean;
  isGuest: boolean;
  defaultName: string;
  adminToken?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const { t, isRTL, tr } = useLang();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(defaultName);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { setName(defaultName); }, [defaultName]);

  const load = useCallback(async () => {
    if (!post) return;
    setLoading(true);
    try {
      const data = await apiFetchComments(Number(post.id));
      setComments(data);
    } catch { setComments([]); }
    finally { setLoading(false); }
  }, [post?.id]);

  useEffect(() => { if (visible && post) load(); }, [visible, post?.id]);

  const sendComment = async () => {
    if (!text.trim() || !post) return;
    if (isGuest) {
      Alert.alert(
        tr("تسجيل مطلوب", "Login Required"),
        tr("يجب إنشاء حساب للتعليق على المنشورات.", "You need an account to comment on posts."),
        [{ text: tr("حسناً", "OK") }]
      );
      return;
    }
    setSending(true);
    try {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await apiCreateComment(Number(post.id), { author_name: name.trim() || tr("مجهول", "Anonymous"), content: text.trim() });
      setText("");
      await load();
    } catch (e: any) {
      Alert.alert(t('common', 'error'), e.message);
    } finally { setSending(false); }
  };

  const handleDeleteComment = (id: number) => {
    Alert.alert(t('common', 'delete'), t('social', 'deleteComment'), [
      { text: t('common', 'cancel'), style: "cancel" },
      {
        text: t('common', 'delete'), style: "destructive",
        onPress: async () => {
          try {
            await apiDeleteComment(id, adminToken);
            setComments(prev => prev.filter(c => c.id !== id));
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (e: any) { Alert.alert(t('common', 'error'), e.message); }
        }
      }
    ]);
  };

  const textStyle = { textAlign: isRTL ? "right" : "left" } as const;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={[ms.overlay, { justifyContent: "flex-end" }]} onPress={onClose}>
          <Pressable style={[ms.commentsSheet, { paddingBottom: insets.bottom + 8 }]}>
            <Animated.View entering={FadeIn.duration(300)}>
            <View style={ms.handle} />
            <View style={[ms.sheetHead, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={ms.sheetTitle}>{t('social', 'comments')} ({comments.length})</Text>
              <View style={{ width: 22 }} />
            </View>

            {post && (
              <View style={ms.postPreview}>
                <Text style={[ms.postPreviewText, textStyle]} numberOfLines={2}>{post.content}</Text>
              </View>
            )}

            {loading
              ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
              : (
                <FlatList
                  data={comments}
                  keyExtractor={c => c.id.toString()}
                  style={{ flexGrow: 0, maxHeight: 340 }}
                  contentContainerStyle={{ gap: 10, padding: 14 }}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={
                    <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                      <Ionicons name="chatbubble-outline" size={40} color={Colors.textMuted} />
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted }}>
                        {t('social', 'writeComment')}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <View style={ms.commentCard}>
                      <View style={[ms.commentHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        {isAdmin && (
                          <TouchableOpacity onPress={() => handleDeleteComment(item.id)}>
                            <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                          </TouchableOpacity>
                        )}
                        <Text style={ms.commentTime}>{timeAgo(item.created_at, t)}</Text>
                        <View style={[ms.commentAuthorWrap, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                          <Ionicons name="person-circle-outline" size={16} color={Colors.textMuted} />
                          <Text style={ms.commentAuthor}>{item.author_name}</Text>
                        </View>
                      </View>
                      <Text style={[ms.commentText, textStyle]}>{item.content}</Text>
                    </View>
                  )}
                />
              )
            }

            <View style={[ms.replyBar, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <TouchableOpacity
                style={[ms.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
                onPress={sendComment}
                disabled={!text.trim() || sending}
              >
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name="send" size={18} color="#fff" />
                }
              </TouchableOpacity>
              <View style={ms.replyInputWrap}>
                <TextInput
                  style={[ms.replyInput, textStyle]}
                  value={text}
                  onChangeText={setText}
                  placeholder={`${name || tr("مجهول", "Anonymous")}: ${t('social', 'writeComment')}`}
                  placeholderTextColor={Colors.textMuted}
                  maxLength={500}
                  multiline
                />
              </View>
            </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  index,
  isAdmin,
  onLike,
  onComment,
  onDelete,
}: {
  post: Post;
  index: number;
  isAdmin: boolean;
  onLike: (id: string | number) => void;
  onComment: (post: Post) => void;
  onDelete: (id: string | number) => void;
}) {
  const { t, isRTL } = useLang();
  const catColor = CATEGORY_COLORS[post.category] || Colors.primary;
  const categoriesT = t('social', 'categories');
  const catLabel = CATEGORY_KEYS[post.category] ? categoriesT[CATEGORY_KEYS[post.category]] : post.category;

  const textStyle = { textAlign: isRTL ? "right" : "left" } as const;

  return (
    <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(18)}>
    <View style={styles.card}>
      <View style={[styles.cardTop, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={[styles.cardMeta, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {isAdmin && (
            <AnimatedPress onPress={() => onDelete(post.id)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={15} color={Colors.danger} />
            </AnimatedPress>
          )}
          <Text style={styles.cardTime}>{timeAgo(post.created_at, t)}</Text>
          <View style={[styles.catBadge, { backgroundColor: catColor + "18" }]}>
            <Text style={[styles.catText, { color: catColor }]}>{catLabel}</Text>
          </View>
        </View>
        <View style={[styles.cardAuthorRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>
              {post.author_name.charAt(0) || "M"}
            </Text>
          </View>
          <Text style={styles.cardAuthor}>{post.author_name}</Text>
        </View>
      </View>

      <Text style={[styles.cardContent, textStyle]}>{post.content}</Text>

      <View style={styles.cardDivider} />

      <View style={[styles.cardActions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <AnimatedPress style={[styles.actionBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]} onPress={() => onComment(post)}>
          <Ionicons name="chatbubble-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.actionCount}>{post.comments_count}</Text>
        </AnimatedPress>
        <AnimatedPress
          style={[styles.actionBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}
          onPress={() => onLike(post.id)}
        >
          <Ionicons
            name={post.liked_by_me ? "heart" : "heart-outline"}
            size={18}
            color={post.liked_by_me ? "#E74C3C" : Colors.textMuted}
          />
          <Text style={[styles.actionCount, post.liked_by_me && { color: "#E74C3C" }]}>
            {post.likes_count}
          </Text>
        </AnimatedPress>
      </View>
    </View>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL, tr } = useLang();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";

  // ── Firestore real-time hook (gracefully empty when Firebase not configured)
  const { posts: fsPosts, loading: fsLoading, addPost: fsAddPost, deletePost: fsDeletePost } = useFsPosts();

  const [apiPosts, setApiPosts] = useState<Post[]>([]);
  const [loading, setLoading]   = useState(!isFirestoreEnabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [userName, setUserName] = useState(auth.user?.name || tr("مجهول", "Anonymous"));
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [catFilter, setCatFilter] = useState("الكل");

  // when Firestore is active, derive posts from it; otherwise use Express API
  const posts: Post[] = isFirestoreEnabled
    ? fsPosts.map(fsPostToPost)
    : apiPosts;

  const init = useCallback(async () => {
    const id = await getDeviceId();
    setDeviceId(id);
    if (auth.user?.name) {
      setUserName(auth.user.name);
    } else {
      const savedName = await AsyncStorage.getItem(USER_NAME_KEY);
      if (savedName) setUserName(savedName);
    }
  }, [auth.user]);

  const loadFromApi = useCallback(async (quiet = false) => {
    if (isFirestoreEnabled) return; // Firestore handles it
    if (!quiet) setLoading(true);
    setError("");
    try {
      const id = await getDeviceId();
      const data = await apiFetchPosts(id);
      setApiPosts(data);
    } catch {
      setError(t('common', 'error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => { init(); }, []);
  useFocusEffect(useCallback(() => {
    init();
    loadFromApi(true);
  }, [init, loadFromApi]));

  // Sync Firestore loading state
  useEffect(() => {
    if (isFirestoreEnabled) setLoading(fsLoading);
  }, [fsLoading]);

  const handlePost = async (content: string, category: string, name: string) => {
    try {
      await requireNetwork();
    } catch (e: any) {
      Alert.alert(tr("لا اتصال", "No Connection"), e.message);
      return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await AsyncStorage.setItem(USER_NAME_KEY, name);
    setUserName(name);
    if (isFirestoreEnabled) {
      await fsAddPost({
        authorId:   String(auth.user?.id ?? "anonymous"),
        authorName: name,
        content,
        category,
        likes:    0,
        comments: 0,
      });
    } else {
      await apiCreatePost({ author_name: name, content, category });
      await loadFromApi(true);
    }
  };

  const handleLike = async (postId: string | number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isFirestoreEnabled) {
      // Optimistic update in Firestore
      const post = fsPosts.find(p => p.id === postId);
      if (post) {
        await fsUpdateDoc(COLLECTIONS.POSTS, String(postId), { likes: post.likes + 1 });
      }
      return;
    }
    if (!deviceId) return;
    setApiPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
        : p
    ));
    try { await apiToggleLike(postId as number, deviceId); } catch {}
  };

  const handleDelete = (postId: string | number) => {
    Alert.alert(t('common', 'delete'), t('social', 'deletePost'), [
      { text: t('common', 'cancel'), style: "cancel" },
      {
        text: t('common', 'delete'), style: "destructive",
        onPress: async () => {
          try {
            if (isFirestoreEnabled) {
              await fsDeletePost(String(postId));
            } else {
              await apiDeletePost(postId, auth.token);
              setApiPosts(prev => prev.filter(p => p.id !== postId));
            }
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (e: any) { Alert.alert(t('common', 'error'), e.message); }
        }
      }
    ]);
  };

  const openComments = (post: Post) => {
    setSelectedPost(post);
    setShowComments(true);
  };

  const CATEGORIES = ["عام", "سؤال", "خبر", "إعلان", "نقاش", "شكر"];
  const FILTERS = ["الكل", ...CATEGORIES];
  const categoriesT = t('social', 'categories');
  const getCatLabel = (c: string) => {
    if (c === "الكل") return t('common', 'all');
    const key = CATEGORY_KEYS[c];
    return key ? categoriesT[key] : c;
  };

  const filtered = catFilter === "الكل" ? posts : posts.filter(p => p.category === catFilter);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <AnimatedPress
          style={[styles.addBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}
          onPress={() => {
            if (auth.isGuest) {
              Alert.alert(
                tr("تسجيل مطلوب", "Login Required"),
                tr("يجب إنشاء حساب للنشر في المجتمع.", "You need an account to post in the community."),
                [{ text: tr("حسناً", "OK") }]
              );
              return;
            }
            setShowAdd(true);
          }}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>{t('social', 'post')}</Text>
        </AnimatedPress>
        <View style={[styles.headerRight, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {isAdmin && (
            <View style={[styles.adminBadge, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Ionicons name="shield-checkmark" size={13} color={Colors.accent} />
              <Text style={styles.adminBadgeText}>{t('home', 'adminBadge')}</Text>
            </View>
          )}
          <Text style={styles.headerTitle}>{t('social', 'title')}</Text>
        </View>
      </View>

      {/* Category Filter */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filters, { flexDirection: isRTL ? "row-reverse" : "row" }]}
        >
          {FILTERS.map(f => (
            <AnimatedPress
              key={f}
              style={[styles.filterBtn, catFilter === f && styles.filterBtnActive]}
              onPress={() => setCatFilter(f)}
              scaleDown={0.92}
            >
              <Text style={[styles.filterText, catFilter === f && styles.filterTextActive]}>
                {getCatLabel(f)}
              </Text>
            </AnimatedPress>
          ))}
        </ScrollView>
      </View>

      <GuestGate
        title={tr("ساحة المجتمع", "Community Feed")}
        preview={
          <View style={{ padding: 16, gap: 12 }}>
            {[
              { author: "أحمد محمد", time: "منذ ٣ دقائق", cat: "خبر", text: "تم افتتاح مركز الصحة الجديد في حي السلام..." },
              { author: "فاطمة علي", time: "منذ ١٢ دقيقة", cat: "سؤال", text: "هل توجد وظائف شاغرة في مجال التعليم حالياً؟..." },
              { author: "المجتمع الحصاحيصاوي", time: "منذ ساعة", cat: "إعلان", text: "إعلان هام: اجتماع مجلس الحي يوم الخميس القادم..." },
            ].map((item, i) => (
              <View key={i} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary + "30", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="person" size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" }}>{item.author}</Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" }}>{item.time}</Text>
                  </View>
                  <View style={{ backgroundColor: Colors.accent + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.accent }}>{item.cat}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 21 }}>{item.text}</Text>
              </View>
            ))}
          </View>
        }
        features={[
          { icon: "newspaper-outline",     text: tr("اطّلع على أخبار حصاحيصا لحظةً بلحظة", "Follow Hasahisa news in real time") },
          { icon: "pencil-outline",        text: tr("شارك برأيك وأخبارك مع المجتمع", "Share your opinions with the community") },
          { icon: "heart-outline",         text: tr("أعجب بالمنشورات وعلّق عليها", "Like and comment on posts") },
          { icon: "chatbubbles-outline",   text: tr("شارك في نقاشات المجتمع الحية", "Join live community discussions") },
        ]}
      >
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFromApi(true); }} colors={[Colors.primary]} />
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.empty}>
                <Ionicons name="newspaper-outline" size={60} color={Colors.divider} />
                <Text style={styles.emptyText}>{t('social', 'noPostsYet')}</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => loadFromApi()}>
                  <Text style={styles.emptyBtnText}>{t('common', 'refresh')}</Text>
                </TouchableOpacity>
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <PostCard
              post={item}
              index={index}
              isAdmin={isAdmin}
              onLike={handleLike}
              onComment={openComments}
              onDelete={handleDelete}
            />
          )}
        />
      </GuestGate>

      <AddPostModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onPost={handlePost}
        defaultName={userName}
      />

      <CommentsModal
        post={selectedPost}
        visible={showComments}
        onClose={() => setShowComments(false)}
        isAdmin={isAdmin}
        isGuest={auth.isGuest}
        defaultName={userName}
        adminToken={auth.token}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  headerRight: { alignItems: "center", gap: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  adminBadge: {
    backgroundColor: Colors.accent + "15",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignItems: "center",
    gap: 4,
  },
  adminBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.accent },
  addBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
    gap: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  addBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },

  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterTextActive: { color: "#fff", fontFamily: "Cairo_700Bold" },

  list: { padding: 16, gap: 16 },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  cardTop: { justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  cardAuthorRow: { alignItems: "center", gap: 10 },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  avatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.primary },
  cardAuthor: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  cardMeta: { alignItems: "center", gap: 8 },
  cardTime: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  catText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  deleteBtn: { padding: 4 },

  cardContent: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginBottom: 12 },
  cardActions: { gap: 20 },
  actionBtn: { alignItems: "center", gap: 6 },
  actionCount: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 16, color: Colors.textMuted },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  emptyBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" },
  sheet: { backgroundColor: Colors.cardBg, marginHorizontal: 16, borderRadius: 28, maxHeight: "85%", overflow: "hidden" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginTop: 12 },
  sheetHead: { alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },

  form: { padding: 20, gap: 20 },
  field: { gap: 8 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: Colors.textPrimary,
  },
  textArea: { height: 120, paddingTop: 12 },
  charCount: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  chips: { flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  chipText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },
  postBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
  },
  postBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  commentsSheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, height: "80%" },
  postPreview: { padding: 16, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  postPreviewText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, fontStyle: "italic" },
  commentCard: { gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  commentHeader: { justifyContent: "space-between", alignItems: "center" },
  commentAuthorWrap: { alignItems: "center", gap: 6 },
  commentAuthor: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  commentTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  commentText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  replyBar: { padding: 12, borderTopWidth: 1, borderTopColor: Colors.divider, alignItems: "flex-end", gap: 10 },
  replyInputWrap: { flex: 1, backgroundColor: Colors.bg, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 16, paddingVertical: 8 },
  replyInput: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
});