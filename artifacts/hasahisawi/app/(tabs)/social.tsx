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
  Image,
  Linking,
  Dimensions,
} from "react-native";
import GuestGate from "@/components/GuestGate";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import { useFocusEffect } from "expo-router";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import Colors from "@/constants/colors";
import { useFsPosts, FsPost } from "@/lib/firebase/hooks";
import { isFirestoreEnabled } from "@/lib/firebase/index";
import { fsUpdateDoc, fsAddDoc, fsGetCollection, fsGetDoc, fsDeleteDoc, COLLECTIONS, orderBy as fsOrderBy } from "@/lib/firebase/firestore";
import { isFirebaseAvailable } from "@/lib/firebase/auth";
import { uploadPostImage, uploadPostVideo } from "@/lib/firebase/storage";
import { requireNetwork } from "@/lib/network";
import UserAvatar from "@/components/UserAvatar";

const { width: SCREEN_W } = Dimensions.get("window");
const IMG_MAX_W = SCREEN_W - 28;
const IMG_MAX_H = SCREEN_W * 1.25;

// ─── Types ────────────────────────────────────────────────────────────────────

type Post = {
  id: string | number;
  author_name: string;
  author_avatar?: string | null;
  content: string;
  category: string;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
  created_at: string;
  image_url?: string | null;
  video_url?: string | null;
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
    image_url: (fp as any).image_url ?? null,
    video_url: (fp as any).video_url ?? null,
  };
}

type Comment = {
  id: number;
  post_id: number;
  author_name: string;
  content: string;
  created_at: string;
};

type MediaAsset = {
  uri: string;
  type: "image" | "video";
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_ID_KEY = "social_device_id";
const USER_NAME_KEY = "social_user_name";

const CATEGORIES = ["عام", "سؤال", "خبر", "إعلان", "نقاش", "شكر"];

const CATEGORY_KEYS: Record<string, string> = {
  عام: "general",
  سؤال: "question",
  خبر: "news",
  إعلان: "announcement",
  نقاش: "general",
  شكر: "general",
};

const CATEGORY_COLORS: Record<string, string> = {
  عام: Colors.primary,
  سؤال: "#2980B9",
  خبر: "#8E44AD",
  إعلان: "#E67E22",
  نقاش: "#C0392B",
  شكر: "#27AE60",
};

const CATEGORY_ICONS: Record<string, string> = {
  عام: "globe-outline",
  سؤال: "help-circle-outline",
  خبر: "newspaper-outline",
  إعلان: "megaphone-outline",
  نقاش: "chatbubbles-outline",
  شكر: "heart-outline",
};

const AVATAR_COLORS = [
  "#E74C3C", "#3498DB", "#9B59B6", "#1ABC9C",
  "#E67E22", "#27AE60", "#2980B9", "#D35400",
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function timeAgo(iso: string, t: any) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 1) return `${t("social", "ago")} ${d} ${t("social", "daysAgo")}`;
  if (h >= 1) return `${t("social", "ago")} ${h} ${t("social", "hoursAgo")}`;
  if (m >= 1) return `${t("social", "ago")} ${m} ${t("social", "minutesAgo")}`;
  return t("social", "justNow");
}

async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function apiUrl(path: string) {
  const base = getApiUrl();
  if (!base) throw new Error("API not configured");
  return new URL(path, base).toString();
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function apiFetchPosts(deviceId: string): Promise<Post[]> {
  const res = await fetch(apiUrl(`/api/posts?device_id=${encodeURIComponent(deviceId)}`));
  if (!res.ok) throw new Error("Failed to fetch posts");
  return res.json();
}

async function apiCreatePost(data: {
  author_name: string;
  content: string;
  category: string;
  image_url?: string | null;
  video_url?: string | null;
}): Promise<Post> {
  const res = await fetch(apiUrl("/api/posts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    if (json.blocked) throw new Error(`🚫 ${json.reason ?? "تم رفض المنشور من نظام المراقبة"}`);
    throw new Error(json.error || "Failed to post");
  }
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

function isFsPost(post: Post): boolean {
  return typeof post.id === "string" && isNaN(Number(post.id));
}

async function fsFetchComments(postId: string): Promise<Comment[]> {
  const items = await fsGetCollection<{ postId: string; author_name: string; content: string; created_at: string }>(
    COLLECTIONS.COMMENTS,
    fsOrderBy("created_at", "asc"),
  );
  const filtered = items.filter((c) => c.postId === postId);
  return filtered.map((c, i) => ({
    id: i + 1,
    post_id: 0,
    author_name: c.author_name,
    content: c.content,
    created_at: c.created_at,
    _fsId: (c as any).id,
  })) as any[];
}

async function fsCreateComment(postId: string, data: { author_name: string; content: string }): Promise<void> {
  await fsAddDoc(COLLECTIONS.COMMENTS, {
    postId,
    author_name: data.author_name,
    content: data.content,
    created_at: new Date().toISOString(),
  });
  try {
    const post = await fsGetDoc<{ comments: number }>(COLLECTIONS.POSTS, postId);
    if (post) {
      await fsUpdateDoc(COLLECTIONS.POSTS, postId, { comments: (post.comments ?? 0) + 1 });
    }
  } catch { }
}

async function fsDeleteFsComment(fsId: string): Promise<void> {
  await fsDeleteDoc(COLLECTIONS.COMMENTS, fsId);
}

async function apiFetchComments(postId: number): Promise<Comment[]> {
  const res = await fetch(apiUrl(`/api/posts/${postId}/comments`));
  if (!res.ok) throw new Error("Failed to fetch comments");
  return res.json();
}

async function apiCreateComment(
  postId: number,
  data: { author_name: string; content: string }
): Promise<Comment> {
  const res = await fetch(apiUrl(`/api/posts/${postId}/comments`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(res.ok ? "خطأ في معالجة البيانات" : `خطأ في الخادم (${res.status})`);
  }
  if (!res.ok) {
    if (json.blocked) throw new Error(`🚫 ${json.reason ?? "تم رفض التعليق من نظام المراقبة"}`);
    throw new Error(json.error || "Failed to comment");
  }
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

async function apiToggleLike(
  postId: number,
  deviceId: string
): Promise<{ liked: boolean }> {
  const res = await fetch(apiUrl(`/api/posts/${postId}/like`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId }),
  });
  return res.json();
}

// ─── Media Picker ─────────────────────────────────────────────────────────────

async function pickMedia(type: "image" | "video"): Promise<MediaAsset | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("الإذن مطلوب", "يرجى السماح للتطبيق بالوصول إلى مكتبة الصور");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: type === "image"
      ? ImagePicker.MediaTypeOptions.Images
      : ImagePicker.MediaTypeOptions.Videos,
    allowsEditing: false,
    quality: 1.0,
    videoMaxDuration: 60,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  return { uri: result.assets[0].uri, type };
}

// ─── Media Upload ─────────────────────────────────────────────────────────────

async function uploadMedia(
  media: MediaAsset,
  userId: string,
  onProgress?: (p: number) => void
): Promise<{ image_url?: string; video_url?: string } | null> {
  if (!isFirebaseAvailable()) return null;
  try {
    if (media.type === "image") {
      const url = await uploadPostImage(userId, media.uri, (p) => onProgress?.(p.percent));
      return { image_url: url };
    } else {
      const url = await uploadPostVideo(userId, media.uri, (p) => onProgress?.(p.percent));
      return { video_url: url };
    }
  } catch {
    return null;
  }
}

// ─── Media Preview Component ───────────────────────────────────────────────────

function MediaPreview({ uri, type, onRemove }: { uri: string; type: "image" | "video"; onRemove: () => void }) {
  return (
    <View style={mp.wrap}>
      <Image source={{ uri }} style={mp.img} resizeMode="cover" />
      {type === "video" && (
        <View style={mp.videoOverlay}>
          <View style={mp.playBtn}>
            <Ionicons name="play" size={24} color="#fff" />
          </View>
          <Text style={mp.videoLabel}>فيديو</Text>
        </View>
      )}
      <TouchableOpacity style={mp.removeBtn} onPress={onRemove}>
        <Ionicons name="close-circle" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const mp = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: "hidden", height: 260, marginTop: 8, backgroundColor: "#000" },
  img: { width: "100%", height: "100%" },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  videoLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
  removeBtn: { position: "absolute", top: 8, right: 8 },
});

// ─── Post Media Display ────────────────────────────────────────────────────────

function PostMediaDisplay({ image_url, video_url }: { image_url?: string | null; video_url?: string | null }) {
  const url = image_url || video_url;
  const isVideo = !!video_url && !image_url;
  const [imgH, setImgH] = useState(IMG_MAX_W * 0.75);

  useEffect(() => {
    if (image_url) {
      Image.getSize(
        image_url,
        (w, h) => {
          const ratio = h / w;
          setImgH(Math.min(IMG_MAX_W * ratio, IMG_MAX_H));
        },
        () => {},
      );
    }
  }, [image_url]);

  if (!url) return null;

  return (
    <View style={[pmd.wrap, { height: isVideo ? IMG_MAX_W * 0.65 : imgH }]}>
      <Image source={{ uri: url }} style={pmd.img} resizeMode={isVideo ? "cover" : "contain"} />
      {isVideo && (
        <TouchableOpacity style={pmd.videoOverlay} onPress={() => Linking.openURL(url)} activeOpacity={0.8}>
          <View style={pmd.playCircle}>
            <Ionicons name="play" size={32} color="#fff" />
          </View>
          <Text style={pmd.playLabel}>اضغط لتشغيل الفيديو</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const pmd = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    overflow: "hidden",
    marginVertical: 10,
    width: IMG_MAX_W,
    alignSelf: "center",
    backgroundColor: Colors.divider,
  },
  img: { width: "100%", height: "100%" },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  playCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  playLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: "rgba(255,255,255,0.85)" },
});

// ─── Add Post Modal ────────────────────────────────────────────────────────────

function AddPostModal({
  visible,
  onClose,
  onPost,
  defaultName,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  onPost: (
    content: string,
    category: string,
    name: string,
    image_url?: string | null,
    video_url?: string | null
  ) => Promise<void>;
  defaultName: string;
  userId: string;
}) {
  const insets = useSafeAreaInsets();
  const { t, isRTL, tr } = useLang();
  const [name, setName] = useState(defaultName);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("عام");
  const [media, setMedia] = useState<MediaAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  const resetForm = () => {
    setContent("");
    setCategory("عام");
    setMedia(null);
    setUploading(false);
    setUploadProgress(0);
  };

  const handlePickImage = async () => {
    const asset = await pickMedia("image");
    if (asset) setMedia(asset);
  };

  const handlePickVideo = async () => {
    const asset = await pickMedia("video");
    if (asset) setMedia(asset);
  };

  const handlePost = async () => {
    if (!content.trim() && !media) {
      Alert.alert(t("common", "error"), "اكتب شيئاً أو أضف صورة/فيديو");
      return;
    }
    setLoading(true);
    try {
      let image_url: string | null = null;
      let video_url: string | null = null;

      if (media) {
        setUploading(true);
        const result = await uploadMedia(media, userId, setUploadProgress);
        setUploading(false);
        if (result) {
          image_url = result.image_url || null;
          video_url = result.video_url || null;
        } else if (!content.trim()) {
          Alert.alert(
            "تنبيه",
            "تعذّر رفع الوسائط (Firebase غير مُعدٍّ). سيُنشر المنشور بدون صورة/فيديو.",
            [{ text: "حسناً" }]
          );
        }
      }

      await onPost(
        content.trim(),
        category,
        name.trim() || tr("مجهول", "Anonymous"),
        image_url,
        video_url
      );
      resetForm();
      onClose();
    } catch (e: any) {
      Alert.alert(t("common", "error"), e.message);
    } finally {
      setLoading(false);
    }
  };

  const textStyle = { textAlign: isRTL ? ("right" as const) : ("left" as const) };
  const catColor = CATEGORY_COLORS[category] || Colors.primary;
  const canPost = content.trim().length > 0 || !!media;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={ms.overlay} onPress={onClose}>
          <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Animated.View entering={FadeIn.duration(250)}>
              {/* Handle & Header */}
              <View style={ms.handle} />
              <View style={[ms.sheetHead, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
                <Text style={ms.sheetTitle}>{t("social", "newPost")}</Text>
                <TouchableOpacity
                  style={[ms.publishBtn, !canPost && { opacity: 0.4 }, { backgroundColor: catColor }]}
                  onPress={handlePost}
                  disabled={!canPost || loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={ms.publishBtnText}>نشر</Text>
                  )}
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ flexGrow: 1 }}
              >
                <View style={ms.form}>
                  {/* Author row */}
                  <View style={[ms.authorRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <View style={[ms.authorAvatar, { backgroundColor: avatarColor(name || "م") }]}>
                      <Text style={ms.authorAvatarLetter}>{(name || "م").charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={[ms.nameInput, textStyle]}
                        value={name}
                        onChangeText={setName}
                        placeholder={tr("اسمك (اختياري)", "Your name (optional)")}
                        placeholderTextColor={Colors.textMuted}
                        maxLength={50}
                      />
                      {/* Category selector inline */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={[ms.catRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                      >
                        {CATEGORIES.map((c) => (
                          <TouchableOpacity
                            key={c}
                            style={[
                              ms.catChip,
                              category === c && {
                                backgroundColor: CATEGORY_COLORS[c],
                                borderColor: CATEGORY_COLORS[c],
                              },
                            ]}
                            onPress={() => setCategory(c)}
                          >
                            <Ionicons
                              name={CATEGORY_ICONS[c] as any}
                              size={11}
                              color={category === c ? "#fff" : Colors.textMuted}
                            />
                            <Text
                              style={[
                                ms.catChipText,
                                category === c && { color: "#fff" },
                              ]}
                            >
                              {c}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>

                  {/* Content input */}
                  <TextInput
                    style={[ms.contentInput, textStyle]}
                    value={content}
                    onChangeText={setContent}
                    placeholder={tr(
                      "شارك خبراً، سؤالاً، أو فكرة مع مجتمع الحصاحيصا...",
                      "Share news, a question, or an idea with the community..."
                    )}
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    maxLength={1000}
                  />
                  <View style={[ms.charRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Text style={ms.charCount}>{content.length}/1000</Text>
                  </View>

                  {/* Media preview */}
                  {media && (
                    <MediaPreview
                      uri={media.uri}
                      type={media.type}
                      onRemove={() => setMedia(null)}
                    />
                  )}

                  {/* Upload progress */}
                  {uploading && (
                    <View style={ms.progressWrap}>
                      <View style={ms.progressBar}>
                        <View style={[ms.progressFill, { width: `${uploadProgress}%` }]} />
                      </View>
                      <Text style={ms.progressText}>جارٍ رفع الوسائط... {uploadProgress}%</Text>
                    </View>
                  )}

                  {/* Media actions */}
                  <View style={[ms.mediaBar, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <TouchableOpacity style={ms.mediaBtn} onPress={handlePickImage} disabled={loading}>
                      <Ionicons name="image-outline" size={22} color={Colors.primary} />
                      <Text style={ms.mediaBtnText}>صورة</Text>
                    </TouchableOpacity>
                    <View style={ms.mediaDivider} />
                    <TouchableOpacity style={ms.mediaBtn} onPress={handlePickVideo} disabled={loading}>
                      <Ionicons name="videocam-outline" size={22} color="#8E44AD" />
                      <Text style={[ms.mediaBtnText, { color: "#8E44AD" }]}>فيديو</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </Animated.View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Comments Sheet ────────────────────────────────────────────────────────────

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

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  const load = useCallback(async () => {
    if (!post) return;
    setLoading(true);
    try {
      const data = isFsPost(post)
        ? await fsFetchComments(String(post.id))
        : await apiFetchComments(Number(post.id));
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [post?.id]);

  useEffect(() => {
    if (visible && post) load();
  }, [visible, post?.id]);

  const sendComment = async () => {
    if (!text.trim() || !post) return;
    if (isGuest) {
      Alert.alert(
        tr("تسجيل مطلوب", "Login Required"),
        tr("يجب إنشاء حساب للتعليق.", "You need an account to comment."),
        [{ text: tr("حسناً", "OK") }]
      );
      return;
    }
    setSending(true);
    try {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const commentData = {
        author_name: name.trim() || tr("مجهول", "Anonymous"),
        content: text.trim(),
      };
      if (isFsPost(post)) {
        await fsCreateComment(String(post.id), commentData);
      } else {
        await apiCreateComment(Number(post.id), commentData);
      }
      setText("");
      await load();
    } catch (e: any) {
      Alert.alert(t("common", "error"), e.message);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = (id: number, fsId?: string) => {
    Alert.alert(t("common", "delete"), t("social", "deleteComment"), [
      { text: t("common", "cancel"), style: "cancel" },
      {
        text: t("common", "delete"),
        style: "destructive",
        onPress: async () => {
          try {
            if (post && isFsPost(post) && fsId) {
              await fsDeleteFsComment(fsId);
            } else {
              await apiDeleteComment(id, adminToken);
            }
            setComments((prev) => prev.filter((c) => c.id !== id));
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (e: any) {
            Alert.alert(t("common", "error"), e.message);
          }
        },
      },
    ]);
  };

  const textStyle = { textAlign: isRTL ? ("right" as const) : ("left" as const) };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={[ms.overlay, { justifyContent: "flex-end" }]} onPress={onClose}>
          <Pressable style={[cs.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <Animated.View entering={FadeIn.duration(250)}>
              <View style={ms.handle} />
              <View style={[ms.sheetHead, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
                <Text style={ms.sheetTitle}>
                  {t("social", "comments")} ({comments.length})
                </Text>
                <View style={{ width: 36 }} />
              </View>

              {post && (
                <View style={cs.postSnippet}>
                  {post.image_url && (
                    <Image source={{ uri: post.image_url }} style={cs.snippetImg} />
                  )}
                  {post.content ? (
                    <Text style={[cs.snippetText, textStyle]} numberOfLines={2}>
                      {post.content}
                    </Text>
                  ) : null}
                </View>
              )}

              {loading ? (
                <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
              ) : (
                <FlatList
                  data={comments}
                  keyExtractor={(c) => c.id.toString()}
                  style={{ flexGrow: 0, maxHeight: 320 }}
                  contentContainerStyle={{ gap: 10, padding: 14 }}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={
                    <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                      <Ionicons name="chatbubble-outline" size={40} color={Colors.textMuted} />
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted }}>
                        {t("social", "writeComment")}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <View style={cs.commentCard}>
                      <View style={[cs.commentHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <View style={[cs.commentLeft, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                          <View style={[cs.commentAvatar, { backgroundColor: avatarColor(item.author_name) }]}>
                            <Text style={cs.commentAvatarLetter}>{item.author_name.charAt(0) || "م"}</Text>
                          </View>
                          <View>
                            <Text style={cs.commentAuthor}>{item.author_name}</Text>
                            <Text style={cs.commentTime}>{timeAgo(item.created_at, t)}</Text>
                          </View>
                        </View>
                        {isAdmin && (
                          <TouchableOpacity onPress={() => handleDeleteComment(item.id, (item as any)._fsId)} style={{ padding: 4 }}>
                            <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={[cs.commentText, textStyle]}>{item.content}</Text>
                    </View>
                  )}
                />
              )}

              {/* Reply input */}
              <View style={[cs.replyBar, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={[cs.commentAvatar, { backgroundColor: avatarColor(name || "م"), flexShrink: 0 }]}>
                  <Text style={cs.commentAvatarLetter}>{(name || "م").charAt(0)}</Text>
                </View>
                <View style={cs.replyInputWrap}>
                  <TextInput
                    style={[cs.replyInput, textStyle]}
                    value={text}
                    onChangeText={setText}
                    placeholder={tr("اكتب تعليقاً...", "Write a comment...")}
                    placeholderTextColor={Colors.textMuted}
                    maxLength={500}
                    multiline
                  />
                </View>
                <TouchableOpacity
                  style={[cs.sendBtn, (!text.trim() || sending) && { opacity: 0.45 }]}
                  onPress={sendComment}
                  disabled={!text.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name={isRTL ? "send" : "send-outline"} size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

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
  const catIcon = (CATEGORY_ICONS[post.category] || "globe-outline") as any;
  const textStyle = { textAlign: isRTL ? ("right" as const) : ("left" as const) };
  const hasMedia = !!(post.image_url || post.video_url);

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(20)}>
      <View style={styles.card}>
        {/* Top row: avatar + author + category + time + delete */}
        <View style={[styles.cardHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <UserAvatar
            name={post.author_name}
            avatarUrl={post.author_avatar}
            size={44}
            borderRadius={14}
          />

          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={[styles.authorName, textStyle]}>{post.author_name}</Text>
            <Text style={styles.cardTime}>{timeAgo(post.created_at, t)}</Text>
          </View>

          <View style={[styles.cardRight, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={[styles.catBadge, { backgroundColor: catColor + "18", borderColor: catColor + "40" }]}>
              <Ionicons name={catIcon} size={10} color={catColor} />
              <Text style={[styles.catText, { color: catColor }]}>{post.category}</Text>
            </View>
            {isAdmin && (
              <AnimatedPress onPress={() => onDelete(post.id)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={15} color={Colors.danger} />
              </AnimatedPress>
            )}
          </View>
        </View>

        {/* Content */}
        {post.content ? (
          <Text style={[styles.cardContent, textStyle]}>{post.content}</Text>
        ) : null}

        {/* Media */}
        {hasMedia && (
          <PostMediaDisplay image_url={post.image_url} video_url={post.video_url} />
        )}

        {/* Divider */}
        <View style={styles.cardDivider} />

        {/* Actions */}
        <View style={[styles.cardActions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <AnimatedPress
            style={[styles.actionBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => onComment(post)}
          >
            <Ionicons name="chatbubble-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.actionCount}>{post.comments_count}</Text>
          </AnimatedPress>

          <AnimatedPress
            style={[styles.actionBtn, post.liked_by_me && styles.actionBtnLiked, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => onLike(post.id)}
          >
            <Ionicons
              name={post.liked_by_me ? "heart" : "heart-outline"}
              size={17}
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

// ─── Compose Bar (top of feed) ─────────────────────────────────────────────────

function ComposeBar({
  name,
  onPress,
  isRTL,
}: {
  name: string;
  onPress: () => void;
  isRTL: boolean;
}) {
  const ac = avatarColor(name || "م");
  return (
    <TouchableOpacity
      style={[cb.wrap, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[cb.avatar, { backgroundColor: ac + "22", borderColor: ac + "55" }]}>
        <Text style={[cb.avatarLetter, { color: ac }]}>{(name || "م").charAt(0)}</Text>
      </View>
      <View style={cb.inputFake}>
        <Text style={cb.inputFakePlaceholder}>
          {isRTL ? "شارك شيئاً مع الحصاحيصا..." : "Share something with Hasahisa..."}
        </Text>
      </View>
      <View style={cb.mediaIcons}>
        <Ionicons name="image-outline" size={20} color={Colors.primary} />
        <Ionicons name="videocam-outline" size={20} color="#8E44AD" />
      </View>
    </TouchableOpacity>
  );
}

const cb = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.cardBg,
    marginHorizontal: 14,
    marginBottom: 10,
    marginTop: 4,
    borderRadius: 20,
    padding: 12,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  avatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  inputFake: {
    flex: 1,
    height: 38,
    backgroundColor: Colors.bg,
    borderRadius: 12,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  inputFakePlaceholder: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted },
  mediaIcons: { flexDirection: "row", gap: 10, paddingHorizontal: 4 },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL, tr } = useLang();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const userId = String(auth.user?.id ?? "anonymous");

  const { posts: fsPosts, loading: fsLoading, addPost: fsAddPost, deletePost: fsDeletePost } = useFsPosts();
  const [apiPosts, setApiPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(!isFirestoreEnabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [userName, setUserName] = useState(auth.user?.name || tr("مجهول", "Anonymous"));
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [catFilter, setCatFilter] = useState("الكل");

  const posts: Post[] = isFirestoreEnabled ? fsPosts.map(fsPostToPost) : apiPosts;

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

  const loadFromApi = useCallback(
    async (quiet = false) => {
      if (isFirestoreEnabled) return;
      if (!quiet) setLoading(true);
      setError("");
      try {
        const id = await getDeviceId();
        const data = await apiFetchPosts(id);
        setApiPosts(data);
      } catch {
        setError(t("common", "error"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t]
  );

  useEffect(() => {
    init();
  }, []);

  useFocusEffect(
    useCallback(() => {
      init();
      loadFromApi(true);
    }, [init, loadFromApi])
  );

  useEffect(() => {
    if (isFirestoreEnabled) setLoading(fsLoading);
  }, [fsLoading]);

  const handlePost = async (
    content: string,
    category: string,
    name: string,
    image_url?: string | null,
    video_url?: string | null
  ) => {
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
        authorId: userId,
        authorName: name,
        content,
        category,
        likes: 0,
        comments: 0,
        ...(image_url ? { image_url } : {}),
        ...(video_url ? { video_url } : {}),
      });
    } else {
      await apiCreatePost({ author_name: name, content, category, image_url, video_url });
      await loadFromApi(true);
    }
  };

  const handleLike = async (postId: string | number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isFirestoreEnabled) {
      const post = fsPosts.find((p) => p.id === postId);
      if (post) await fsUpdateDoc(COLLECTIONS.POSTS, String(postId), { likes: post.likes + 1 });
      return;
    }
    if (!deviceId) return;
    setApiPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              liked_by_me: !p.liked_by_me,
              likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1,
            }
          : p
      )
    );
    try {
      await apiToggleLike(postId as number, deviceId);
    } catch {}
  };

  const handleDelete = (postId: string | number) => {
    Alert.alert(t("common", "delete"), t("social", "deletePost"), [
      { text: t("common", "cancel"), style: "cancel" },
      {
        text: t("common", "delete"),
        style: "destructive",
        onPress: async () => {
          try {
            if (isFirestoreEnabled) {
              await fsDeletePost(String(postId));
            } else {
              await apiDeletePost(postId, auth.token);
              setApiPosts((prev) => prev.filter((p) => p.id !== postId));
            }
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (e: any) {
            Alert.alert(t("common", "error"), e.message);
          }
        },
      },
    ]);
  };

  const openComments = (post: Post) => {
    setSelectedPost(post);
    setShowComments(true);
  };

  const FILTERS = ["الكل", ...CATEGORIES];
  const getCatLabel = (c: string) => {
    if (c === "الكل") return t("common", "all");
    const key = CATEGORY_KEYS[c];
    const categoriesT = t("social", "categories");
    return key ? categoriesT[key] : c;
  };

  const filtered = catFilter === "الكل" ? posts : posts.filter((p) => p.category === catFilter);

  const handleComposePress = () => {
    if (auth.isGuest) {
      Alert.alert(
        tr("تسجيل مطلوب", "Login Required"),
        tr("يجب إنشاء حساب للنشر في المجتمع.", "You need an account to post."),
        [{ text: tr("حسناً", "OK") }]
      );
      return;
    }
    setShowAdd(true);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={[styles.headerInner, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.headerLeft, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {isAdmin && (
              <View style={[styles.adminBadge, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Ionicons name="shield-checkmark" size={12} color={Colors.accent} />
                <Text style={styles.adminBadgeText}>{t("home", "adminBadge")}</Text>
              </View>
            )}
            <Text style={styles.headerTitle}>{t("social", "title")}</Text>
          </View>
          <TouchableOpacity style={styles.newPostFab} onPress={handleComposePress}>
            <Ionicons name="create-outline" size={19} color="#fff" />
            <Text style={styles.newPostFabText}>{t("social", "post")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filters, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        {FILTERS.map((f) => {
          const active = catFilter === f;
          const color = f !== "الكل" ? (CATEGORY_COLORS[f] || Colors.primary) : Colors.primary;
          return (
            <AnimatedPress
              key={f}
              style={[
                styles.filterBtn,
                active && { backgroundColor: color, borderColor: color },
              ]}
              onPress={() => setCatFilter(f)}
              scaleDown={0.92}
            >
              {f !== "الكل" && (
                <Ionicons
                  name={CATEGORY_ICONS[f] as any || "globe-outline"}
                  size={12}
                  color={active ? "#fff" : Colors.textMuted}
                />
              )}
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {getCatLabel(f)}
              </Text>
            </AnimatedPress>
          );
        })}
      </ScrollView>

      <GuestGate
        title={tr("ساحة المجتمع", "Community Feed")}
        preview={
          <View style={{ padding: 16, gap: 12 }}>
            {[
              { author: "أحمد محمد", time: "منذ ٣ دقائق", cat: "خبر", text: "تم افتتاح مركز الصحة الجديد في حي السلام..." },
              { author: "فاطمة علي", time: "منذ ١٢ دقيقة", cat: "سؤال", text: "هل توجد وظائف شاغرة في مجال التعليم؟..." },
              { author: "المجتمع الحصاحيصاوي", time: "منذ ساعة", cat: "إعلان", text: "إعلان هام: اجتماع مجلس الحي يوم الخميس..." },
            ].map((item, i) => (
              <View key={i} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.primary + "25", alignItems: "center", justifyContent: "center" }}>
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
          { icon: "newspaper-outline", text: tr("اطّلع على أخبار الحصاحيصا لحظةً بلحظة", "Follow Hasahisa news in real time") },
          { icon: "image-outline", text: tr("شارك صوراً وفيديوهات مع المجتمع", "Share photos and videos with the community") },
          { icon: "heart-outline", text: tr("أعجب بالمنشورات وعلّق عليها", "Like and comment on posts") },
          { icon: "chatbubbles-outline", text: tr("شارك في نقاشات المجتمع الحية", "Join live community discussions") },
        ]}
      >
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadFromApi(true); }}
              colors={[Colors.primary]}
            />
          }
          ListHeaderComponent={
            !auth.isGuest ? (
              <ComposeBar name={userName} onPress={handleComposePress} isRTL={isRTL} />
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 50 }} />
            ) : (
              <View style={styles.empty}>
                <Ionicons name="newspaper-outline" size={62} color={Colors.divider} />
                <Text style={styles.emptyText}>{t("social", "noPostsYet")}</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => loadFromApi()}>
                  <Text style={styles.emptyBtnText}>{t("common", "refresh")}</Text>
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
        userId={userId}
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

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  headerInner: { alignItems: "center", justifyContent: "space-between" },
  headerLeft: { alignItems: "center", gap: 8 },
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
  newPostFab: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  newPostFabText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  filters: { paddingHorizontal: 14, paddingVertical: 10, gap: 7 },
  filterBtn: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.divider,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  filterText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterTextActive: { color: "#fff", fontFamily: "Cairo_700Bold" },

  list: { paddingTop: 8, paddingHorizontal: 14, gap: 12 },

  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.divider,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: { alignItems: "flex-start", gap: 0, marginBottom: 12 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  avatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  authorName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  cardTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  cardRight: { alignItems: "center", gap: 8, marginLeft: "auto" },
  catBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  catText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  deleteBtn: { padding: 5 },

  cardContent: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    lineHeight: 25,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: 12 },
  cardActions: { gap: 10 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  actionBtnLiked: {
    backgroundColor: "#E74C3C10",
    borderColor: "#E74C3C40",
  },
  actionCount: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 16, color: Colors.textMuted },
  emptyBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  emptyBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary },
});

// ─── Modal Styles ──────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "92%",
    overflow: "hidden",
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    alignSelf: "center",
    marginTop: 12,
  },
  sheetHead: {
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  publishBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  publishBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  form: { padding: 16, gap: 12 },
  authorRow: { alignItems: "flex-start", gap: 12 },
  authorAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    flexShrink: 0,
  },
  authorAvatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 19, color: "#fff" },
  nameInput: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    marginBottom: 8,
  },
  catRow: { gap: 6, paddingBottom: 4 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  catChipText: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textSecondary },

  contentInput: {
    fontFamily: "Cairo_400Regular",
    fontSize: 16,
    color: Colors.textPrimary,
    minHeight: 110,
    paddingVertical: 8,
    lineHeight: 26,
    textAlignVertical: "top",
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  charRow: { justifyContent: "flex-start" },
  charCount: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  progressWrap: { gap: 6 },
  progressBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: Colors.primary, borderRadius: 2 },
  progressText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },

  mediaBar: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: 12,
    gap: 0,
    marginTop: 4,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
  },
  mediaBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary },
  mediaDivider: { width: 1, backgroundColor: Colors.divider, marginVertical: 6 },
});

// ─── Comments Styles ───────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  sheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
    overflow: "hidden",
  },
  postSnippet: {
    flexDirection: "row-reverse",
    gap: 10,
    padding: 14,
    backgroundColor: Colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    alignItems: "center",
  },
  snippetImg: { width: 48, height: 48, borderRadius: 10 },
  snippetText: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  commentCard: {
    gap: 6,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  commentHeader: { justifyContent: "space-between", alignItems: "center" },
  commentLeft: { alignItems: "center", gap: 8 },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  commentAuthor: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  commentTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  commentText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 22,
    paddingLeft: 40,
  },
  replyBar: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    alignItems: "center",
    gap: 10,
  },
  replyInputWrap: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  replyInput: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
});
