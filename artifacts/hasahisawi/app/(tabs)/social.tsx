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
  Share,
} from "react-native";
import GuestGate from "@/components/GuestGate";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ModernHeader from "@/components/ui/ModernHeader";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  FadeInDown,
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import { useFocusEffect } from "expo-router";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import Colors from "@/constants/colors";
import { uploadPostImage, uploadPostVideo } from "@/lib/firebase/storage";
import { requireNetwork, checkConnected } from "@/lib/network";
import { cacheGet, cacheSet, cacheAge } from "@/lib/offline-cache";
import UserAvatar from "@/components/UserAvatar";
import OrgInviteCard from "@/components/OrgInviteCard";


const { width: SCREEN_W } = Dimensions.get("window");
const IMG_MAX_W = SCREEN_W - 28;
const IMG_MAX_H = SCREEN_W * 1.25;

// ─── Types ────────────────────────────────────────────────────────────────────

type Post = {
  id: number;
  author_name: string;
  author_avatar?: string | null;
  content: string;
  category: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  liked_by_me: boolean;
  my_reaction?: string | null;
  created_at: string;
  image_url?: string | null;
  video_url?: string | null;
  is_pinned?: boolean;
};

type Comment = {
  id: number;
  post_id: number;
  author_name: string;
  content: string;
  created_at: string;
  parent_id?: number | null;
  replies?: Comment[];
};

type MediaAsset = {
  uri: string;
  type: "image" | "video";
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_ID_KEY = "social_device_id";
const USER_NAME_KEY = "social_user_name";
const POSTS_CACHE_KEY = "social_posts";

const CATEGORIES = ["عام", "سؤال", "خبر", "إعلان", "نقاش", "شكر"];

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

const REACTIONS: { key: string; emoji: string; label: string; color: string }[] = [
  { key: "like",  emoji: "👍", label: "أعجبني",   color: "#2980B9" },
  { key: "love",  emoji: "❤️", label: "أحببته",   color: "#E74C3C" },
  { key: "haha",  emoji: "😂", label: "مضحك",     color: "#F39C12" },
  { key: "wow",   emoji: "😮", label: "مدهش",     color: "#9B59B6" },
  { key: "sad",   emoji: "😢", label: "محزن",     color: "#3498DB" },
  { key: "angry", emoji: "😡", label: "مستاء",    color: "#E74C3C" },
];

const AVATAR_COLORS = [
  "#E74C3C", "#3498DB", "#9B59B6", "#1ABC9C",
  "#E67E22", "#27AE60", "#2980B9", "#D35400",
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 7) return new Date(iso).toLocaleDateString("ar-SA");
  if (d >= 1) return `منذ ${d} يوم`;
  if (h >= 1) return `منذ ${h} ساعة`;
  if (m >= 1) return `منذ ${m} دقيقة`;
  return "الآن";
}

function decodePostImages(raw?: string | null): string[] {
  if (!raw) return [];
  const value = String(raw).trim();
  if (!value) return [];
  try {
    if (value.startsWith("[")) {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    }
  } catch {}
  if (value.includes("||")) return value.split("||").map(s => s.trim()).filter(Boolean);
  return [value];
}

function encodePostImages(urls: string[]): string | null {
  const clean = urls.filter(Boolean);
  if (clean.length === 0) return null;
  return clean.length === 1 ? clean[0] : JSON.stringify(clean);
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

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiFetchPosts(deviceId: string, category?: string, page = 1): Promise<Post[]> {
  const params = new URLSearchParams({ device_id: deviceId, page: String(page), limit: "30" });
  if (category && category !== "الكل") params.set("category", category);
  const res = await fetchWithTimeout(apiUrl(`/api/posts?${params}`));
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
  const res = await fetchWithTimeout(apiUrl("/api/posts"), {
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

async function apiDeletePost(id: number, token?: string | null): Promise<void> {
  if (!token) throw new Error("غير مصرح");
  const res = await fetchWithTimeout(apiUrl(`/api/posts/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to delete");
}

async function apiFetchComments(postId: number): Promise<Comment[]> {
  const res = await fetchWithTimeout(apiUrl(`/api/posts/${postId}/comments`));
  if (!res.ok) throw new Error("Failed to fetch comments");
  return res.json();
}

async function apiCreateComment(
  postId: number,
  data: { author_name: string; content: string; parent_id?: number | null }
): Promise<Comment> {
  const res = await fetchWithTimeout(apiUrl(`/api/posts/${postId}/comments`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch {
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
  await fetchWithTimeout(apiUrl(`/api/comments/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function apiReact(postId: number, deviceId: string, reaction: string): Promise<{ reacted: boolean; reaction: string | null }> {
  const res = await fetchWithTimeout(apiUrl(`/api/posts/${postId}/react`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, reaction }),
  });
  if (!res.ok) return { reacted: false, reaction: null };
  return res.json();
}

async function apiTrackView(postId: number): Promise<void> {
  try {
    await fetch(apiUrl(`/api/posts/${postId}/view`), { method: "POST" });
  } catch {}
}

// ─── Media Upload ─────────────────────────────────────────────────────────────

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
    allowsEditing: type === "image",
    quality: 0.85,
    videoMaxDuration: 120,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  return { uri: result.assets[0].uri, type };
}

async function pickImages(currentCount = 0): Promise<MediaAsset[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("الإذن مطلوب", "يرجى السماح للتطبيق بالوصول إلى مكتبة الصور");
    return [];
  }
  const remaining = Math.max(1, 10 - currentCount);
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 0.85,
    exif: false,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, remaining).map(asset => ({ uri: asset.uri, type: "image" as const }));
}

async function uploadMedia(
  media: MediaAsset,
  userId: string,
  onProgress?: (p: number) => void
): Promise<{ image_url?: string; video_url?: string } | null> {
  try {
    if (media.type === "image") {
      const url = await uploadPostImage(userId, media.uri, (p) => onProgress?.(p.percent));
      return { image_url: url };
    } else {
      const url = await uploadPostVideo(userId, media.uri, (p) => onProgress?.(p.percent));
      return { video_url: url };
    }
  } catch (e) {
    console.warn("Media upload failed:", e);
    return null;
  }
}

async function uploadImageList(
  images: MediaAsset[],
  userId: string,
  onProgress?: (p: number) => void
): Promise<string[]> {
  const urls: string[] = [];
  if (!images.length) return urls;
  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    const url = await uploadPostImage(userId, item.uri, (p) => {
      const base = (i / images.length) * 100;
      const part = p.percent / images.length;
      onProgress?.(Math.round(base + part));
    });
    urls.push(url);
  }
  onProgress?.(100);
  return urls;
}

// ─── Reaction Button ──────────────────────────────────────────────────────────

function ReactionPicker({ onPick, onClose }: { onPick: (r: string) => void; onClose: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(150)} style={rp.wrap}>
      {REACTIONS.map((r) => (
        <TouchableOpacity key={r.key} style={rp.item} onPress={() => onPick(r.key)} activeOpacity={0.7}>
          <Text style={rp.emoji}>{r.emoji}</Text>
          <Text style={rp.label}>{r.label}</Text>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
}

const rp = StyleSheet.create({
  wrap: {
    flexDirection: "row-reverse",
    backgroundColor: Colors.cardBg,
    borderRadius: Colors.radius.pill,
    padding: 8,
    gap: 4,
    ...Colors.shadow.raised,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  item: { alignItems: "center", paddingHorizontal: 6, paddingVertical: 4 },
  emoji: { fontSize: 24 },
  label: { fontFamily: "Cairo_400Regular", fontSize: 9, color: Colors.textMuted, marginTop: 2 },
});

// ─── Media Preview ────────────────────────────────────────────────────────────

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

function MultiMediaPreview({ items, onRemove, onAddMore }: { items: MediaAsset[]; onRemove: (index: number) => void; onAddMore: () => void }) {
  if (!items.length) return null;
  return (
    <View style={mp.multiWrap}>
      <View style={mp.multiHead}>
        <Text style={mp.multiTitle}>الصور المختارة ({items.length}/10)</Text>
        {items.length < 10 && (
          <TouchableOpacity onPress={onAddMore} style={mp.addMoreBtn}>
            <Ionicons name="add" size={15} color={Colors.primary} />
            <Text style={mp.addMoreText}>إضافة صور</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mp.multiList}>
        {items.map((item, index) => (
          <View key={item.uri + index} style={mp.thumbWrap}>
            <Image source={{ uri: item.uri }} style={mp.thumbImg} resizeMode="cover" />
            <TouchableOpacity style={mp.thumbRemove} onPress={() => onRemove(index)}>
              <Ionicons name="close-circle" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const mp = StyleSheet.create({
  wrap: { borderRadius: Colors.radius.lg, overflow: "hidden", height: 240, marginTop: 8, backgroundColor: "#000" },
  img: { width: "100%", height: "100%" },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  playBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.5)",
  },
  videoLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
  removeBtn: { position: "absolute", top: 8, right: 8 },
  multiWrap: { marginTop: 8, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface1, padding: 10 },
  multiHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  multiTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  addMoreBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: Colors.radius.pill, backgroundColor: Colors.primary + "15" },
  addMoreText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.primary },
  multiList: { gap: 8, paddingVertical: 2 },
  thumbWrap: { width: 104, height: 104, borderRadius: Colors.radius.md, overflow: "hidden", backgroundColor: "#000" },
  thumbImg: { width: "100%", height: "100%" },
  thumbRemove: { position: "absolute", top: 5, right: 5, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 20 },
});

// ─── Post Media Display ────────────────────────────────────────────────────────

function PostMediaDisplay({ image_url, video_url }: { image_url?: string | null; video_url?: string | null }) {
  const images = decodePostImages(image_url);
  const url = video_url || images[0];
  const isVideo = !!video_url && images.length === 0;
  const [imgH, setImgH] = useState(IMG_MAX_W * 0.65);
  const [loaded, setLoaded] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  useEffect(() => {
    if (images[0]) {
      Image.getSize(images[0], (w, h) => {
        const ratio = h / w;
        setImgH(Math.min(IMG_MAX_W * ratio, IMG_MAX_H));
      }, () => {});
    }
  }, [image_url]);

  if (!url) return null;

  if (images.length > 1) {
    return (
      <View style={pmd.multiBlock}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => setViewer(images[0])} style={pmd.multiHero}>
          <Image source={{ uri: images[0] }} style={pmd.img} resizeMode="cover" />
          <View style={pmd.countBadge}>
            <Ionicons name="images" size={13} color="#fff" />
            <Text style={pmd.countText}>{images.length}</Text>
          </View>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pmd.multiThumbs}>
          {images.map((img, index) => (
            <TouchableOpacity key={img + index} activeOpacity={0.85} onPress={() => setViewer(img)} style={pmd.postThumb}>
              <Image source={{ uri: img }} style={pmd.img} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
          <View style={pmd.viewerOverlay}>
            <TouchableOpacity style={pmd.viewerClose} onPress={() => setViewer(null)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {viewer ? <Image source={{ uri: viewer }} style={pmd.viewerImage} resizeMode="contain" /> : null}
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[pmd.wrap, { height: isVideo ? IMG_MAX_W * 0.6 : imgH }]}>
      {!loaded && <View style={pmd.skeleton} />}
      <TouchableOpacity activeOpacity={image_url ? 0.9 : 1} onPress={() => images[0] && setViewer(images[0])} style={{ flex: 1 }}>
        <Image
          source={{ uri: url }}
          style={pmd.img}
          resizeMode={isVideo ? "cover" : "contain"}
          onLoad={() => setLoaded(true)}
        />
      </TouchableOpacity>
      {isVideo && (
        <TouchableOpacity style={pmd.videoOverlay} onPress={() => Linking.openURL(url)} activeOpacity={0.8}>
          <View style={pmd.playCircle}>
            <Ionicons name="play" size={32} color="#fff" />
          </View>
          <Text style={pmd.playLabel}>اضغط لتشغيل الفيديو</Text>
        </TouchableOpacity>
      )}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={pmd.viewerOverlay}>
          <TouchableOpacity style={pmd.viewerClose} onPress={() => setViewer(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {viewer ? <Image source={{ uri: viewer }} style={pmd.viewerImage} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </View>
  );
}

const pmd = StyleSheet.create({
  wrap: {
    borderRadius: Colors.radius.xl, overflow: "hidden", marginVertical: 10,
    width: IMG_MAX_W, alignSelf: "center", backgroundColor: Colors.surface1,
  },
  skeleton: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.divider },
  img: { width: "100%", height: "100%" },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  playCircle: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 2.5, borderColor: "rgba(255,255,255,0.6)",
    alignItems: "center", justifyContent: "center",
  },
  playLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: "rgba(255,255,255,0.85)" },
  multiBlock: { width: IMG_MAX_W, alignSelf: "center", marginVertical: 10, gap: 8 },
  multiHero: { height: IMG_MAX_W * 0.72, borderRadius: Colors.radius.xl, overflow: "hidden", backgroundColor: Colors.surface1 },
  multiThumbs: { gap: 8, paddingHorizontal: 2 },
  postThumb: { width: 86, height: 86, borderRadius: Colors.radius.md, overflow: "hidden", backgroundColor: Colors.surface1 },
  countBadge: { position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: Colors.radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(0,0,0,0.55)" },
  countText: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 12 },
  viewerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerClose: { position: "absolute", top: 48, right: 22, zIndex: 2, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "84%" },
});

// ─── Add Post Modal ────────────────────────────────────────────────────────────

function AddPostModal({
  visible, onClose, onPost, defaultName, userId,
}: {
  visible: boolean;
  onClose: () => void;
  onPost: (content: string, category: string, name: string, image_url?: string | null, video_url?: string | null) => Promise<void>;
  defaultName: string;
  userId: string;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(defaultName);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("عام");
  const [media, setMedia] = useState<MediaAsset | null>(null);
  const [imageItems, setImageItems] = useState<MediaAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (visible) setName(defaultName); }, [visible, defaultName]);

  const resetForm = () => {
    setContent(""); setCategory("عام"); setMedia(null); setImageItems([]);
    setUploading(false); setUploadProgress(0);
  };

  const handlePost = async () => {
    if (!content.trim() && !media && imageItems.length === 0) {
      Alert.alert("تنبيه", "اكتب شيئاً أو أضف صورة/فيديو");
      return;
    }
    setLoading(true);
    try {
      let image_url: string | null = null;
      let video_url: string | null = null;

      if (imageItems.length > 0) {
        setUploading(true);
        try {
          const urls = await uploadImageList(imageItems, userId, (p) => setUploadProgress(p));
          image_url = encodePostImages(urls);
        } catch {
          Alert.alert("تنبيه", "تعذّر رفع بعض الصور. سيُنشر المنشور بدون الصور.", [{ text: "حسناً" }]);
        } finally { setUploading(false); }
      } else if (media) {
        setUploading(true);
        const result = await uploadMedia(media, userId, (p) => setUploadProgress(p));
        setUploading(false);
        if (result) {
          image_url = result.image_url || null;
          video_url = result.video_url || null;
        } else {
          Alert.alert("تنبيه", "تعذّر رفع الوسائط. سيُنشر المنشور بدون صورة/فيديو.", [{ text: "حسناً" }]);
        }
      }

      await onPost(content.trim(), category, name.trim() || "مجهول", image_url, video_url);
      resetForm();
      onClose();
    } catch (e: any) {
      Alert.alert("خطأ", e.message);
    } finally {
      setLoading(false);
    }
  };

  const catColor = CATEGORY_COLORS[category] || Colors.primary;
  const canPost = content.trim().length > 0 || !!media || imageItems.length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={ms.overlay} onPress={onClose}>
          <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={ms.handle} />
            <View style={ms.sheetHead}>
              <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={ms.sheetTitle}>منشور جديد</Text>
              <TouchableOpacity
                style={[ms.publishBtn, !canPost && { opacity: 0.4 }, { backgroundColor: catColor }]}
                onPress={handlePost}
                disabled={!canPost || loading}
              >
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={ms.publishBtnText}>نشر</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={ms.form}>
                {/* Author */}
                <View style={ms.authorRow}>
                  <View style={[ms.authorAvatar, { backgroundColor: avatarColor(name || "م") }]}>
                    <Text style={ms.authorAvatarLetter}>{(name || "م").charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={ms.nameInput}
                      value={name}
                      onChangeText={setName}
                      placeholder="اسمك (اختياري)"
                      placeholderTextColor={Colors.textMuted}
                      maxLength={50}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ms.catRow}>
                      {CATEGORIES.map((c) => (
                        <TouchableOpacity
                          key={c}
                          style={[ms.catChip, category === c && { backgroundColor: CATEGORY_COLORS[c], borderColor: CATEGORY_COLORS[c] }]}
                          onPress={() => setCategory(c)}
                        >
                          <Ionicons name={CATEGORY_ICONS[c] as any} size={11} color={category === c ? "#fff" : Colors.textMuted} />
                          <Text style={[ms.catChipText, category === c && { color: "#fff" }]}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>

                {/* Content */}
                <TextInput
                  style={ms.contentInput}
                  value={content}
                  onChangeText={setContent}
                  placeholder="شارك خبراً، سؤالاً، أو فكرة مع مجتمع الحصاحيصا..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                  maxLength={1000}
                  textAlign="right"
                />
                <View style={{ alignItems: "flex-start" }}>
                  <Text style={ms.charCount}>{content.length}/1000</Text>
                </View>

                {imageItems.length > 0 && (
                  <MultiMediaPreview
                    items={imageItems}
                    onRemove={(idx) => setImageItems(prev => prev.filter((_, i) => i !== idx))}
                    onAddMore={() => pickImages(imageItems.length).then(items => {
                      if (items.length) { setMedia(null); setImageItems(prev => [...prev, ...items].slice(0, 10)); }
                    })}
                  />
                )}
                {media && <MediaPreview uri={media.uri} type={media.type} onRemove={() => setMedia(null)} />}

                {uploading && (
                  <View style={ms.progressWrap}>
                    <View style={ms.progressBar}>
                      <View style={[ms.progressFill, { width: `${uploadProgress}%` }]} />
                    </View>
                    <Text style={ms.progressText}>جارٍ رفع الوسائط... {uploadProgress}%</Text>
                  </View>
                )}

                {/* Media actions */}
                <View style={ms.mediaBar}>
                  <TouchableOpacity style={ms.mediaBtn} onPress={() => pickImages(imageItems.length).then(items => { if (items.length) { setMedia(null); setImageItems(prev => [...prev, ...items].slice(0, 10)); } })} disabled={loading}>
                    <Ionicons name="images-outline" size={22} color={Colors.primary} />
                    <Text style={ms.mediaBtnText}>صور متعددة</Text>
                  </TouchableOpacity>
                  <View style={ms.mediaDivider} />
                  <TouchableOpacity style={ms.mediaBtn} onPress={() => pickMedia("video").then(a => { if (a) { setImageItems([]); setMedia(a); } })} disabled={loading}>
                    <Ionicons name="videocam-outline" size={22} color="#8E44AD" />
                    <Text style={[ms.mediaBtnText, { color: "#8E44AD" }]}>فيديو</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Comments Modal ────────────────────────────────────────────────────────────

function CommentsModal({
  post, visible, onClose, isAdmin, isGuest, defaultName, adminToken, onCommentsLoaded,
}: {
  post: Post | null;
  visible: boolean;
  onClose: () => void;
  isAdmin: boolean;
  isGuest: boolean;
  defaultName: string;
  adminToken?: string | null;
  onCommentsLoaded?: (count: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(defaultName);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => { setName(defaultName); }, [defaultName]);

  const load = useCallback(async () => {
    if (!post) return;
    setLoading(true);
    try {
      const data = await apiFetchComments(post.id);
      // Build thread structure
      const roots: Comment[] = [];
      const map: Record<number, Comment> = {};
      data.forEach(c => { map[c.id] = { ...c, replies: [] }; });
      data.forEach(c => {
        if (c.parent_id && map[c.parent_id]) {
          map[c.parent_id].replies!.push(map[c.id]);
        } else {
          roots.push(map[c.id]);
        }
      });
      setComments(roots);
      onCommentsLoaded?.(data.length);
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
      Alert.alert("تسجيل مطلوب", "يجب إنشاء حساب للتعليق.", [{ text: "حسناً" }]);
      return;
    }
    setSending(true);
    try {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await apiCreateComment(post.id, {
        author_name: name.trim() || "مجهول",
        content: text.trim(),
        parent_id: replyTo?.id || null,
      });
      setText("");
      setReplyTo(null);
      await load();
    } catch (e: any) {
      Alert.alert("خطأ", e.message);
    } finally {
      setSending(false);
    }
  };

  const handleReply = (comment: Comment) => {
    setReplyTo(comment);
    inputRef.current?.focus();
  };

  const handleDeleteComment = (id: number) => {
    Alert.alert("حذف التعليق", "هل تريد حذف هذا التعليق؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
        onPress: async () => {
          try {
            await apiDeleteComment(id, adminToken);
            await load();
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (e: any) {
            Alert.alert("خطأ", e.message);
          }
        },
      },
    ]);
  };

  const CommentItem = ({ item, depth = 0 }: { item: Comment; depth?: number }) => (
    <View style={[cs.commentCard, depth > 0 && cs.replyCard]}>
      <View style={cs.commentHeader}>
        <View style={[cs.commentAvatar, { backgroundColor: avatarColor(item.author_name) }]}>
          <Text style={cs.commentAvatarLetter}>{(item.author_name || "م").charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cs.commentAuthor}>{item.author_name}</Text>
          <Text style={cs.commentTime}>{timeAgo(item.created_at)}</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity onPress={() => handleDeleteComment(item.id)} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={14} color={Colors.danger} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={cs.commentText}>{item.content}</Text>
      {depth === 0 && (
        <TouchableOpacity style={cs.replyBtn} onPress={() => handleReply(item)}>
          <Ionicons name="return-down-back-outline" size={13} color={Colors.textMuted} />
          <Text style={cs.replyBtnText}>رد</Text>
        </TouchableOpacity>
      )}
      {item.replies?.map(r => <CommentItem key={r.id} item={r} depth={depth + 1} />)}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "padding"} keyboardVerticalOffset={0}>
        <Pressable style={[ms.overlay, { justifyContent: "flex-end" }]} onPress={onClose}>
          <Pressable style={[cs.sheet, { paddingBottom: insets.bottom + 8 }]} onPress={(e) => e.stopPropagation()}>
            <View style={ms.handle} />
            <View style={ms.sheetHead}>
              <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={ms.sheetTitle}>التعليقات ({comments.reduce((a, c) => a + 1 + (c.replies?.length || 0), 0)})</Text>
              <View style={{ width: 36 }} />
            </View>

            {post?.content ? (
              <View style={cs.postSnippet}>
                {decodePostImages(post.image_url)[0] && <Image source={{ uri: decodePostImages(post.image_url)[0] }} style={cs.snippetImg} />}
                <Text style={cs.snippetText} numberOfLines={2}>{post.content}</Text>
              </View>
            ) : null}

            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 24, marginBottom: 24 }} />
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(c) => c.id.toString()}
                style={{ flexGrow: 0, maxHeight: 340 }}
                contentContainerStyle={{ gap: 4, padding: 14 }}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={{ alignItems: "center", paddingVertical: 36, gap: 8 }}>
                    <Ionicons name="chatbubble-outline" size={44} color={Colors.textMuted} />
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted }}>كن أول من يعلق!</Text>
                  </View>
                }
                renderItem={({ item }) => <CommentItem item={item} />}
              />
            )}

            {replyTo && (
              <View style={cs.replyingTo}>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
                <Text style={cs.replyingToText}>رد على: {replyTo.author_name}</Text>
              </View>
            )}

            <View style={cs.replyBar}>
              <View style={[cs.commentAvatar, { backgroundColor: avatarColor(name || "م"), flexShrink: 0 }]}>
                <Text style={cs.commentAvatarLetter}>{(name || "م").charAt(0)}</Text>
              </View>
              <View style={cs.replyInputWrap}>
                <TextInput
                  ref={inputRef}
                  style={cs.replyInput}
                  value={text}
                  onChangeText={setText}
                  placeholder="اكتب تعليقاً..."
                  placeholderTextColor={Colors.textMuted}
                  maxLength={500}
                  multiline
                  textAlign="right"
                />
              </View>
              <TouchableOpacity
                style={[cs.sendBtn, (!text.trim() || sending) && { opacity: 0.45 }]}
                onPress={sendComment}
                disabled={!text.trim() || sending}
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({
  post, index, isAdmin, deviceId, onReact, onComment, onDelete, onShare,
}: {
  post: Post;
  index: number;
  isAdmin: boolean;
  deviceId: string;
  onReact: (id: number, reaction: string) => void;
  onComment: (post: Post) => void;
  onDelete: (id: number) => void;
  onShare: (post: Post) => void;
}) {
  const catColor = CATEGORY_COLORS[post.category] || Colors.primary;
  const catIcon = (CATEGORY_ICONS[post.category] || "globe-outline") as any;
  const hasMedia = !!(post.image_url || post.video_url);
  const [showReactions, setShowReactions] = useState(false);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myReaction = REACTIONS.find(r => r.key === post.my_reaction);
  const reactionEmoji = myReaction?.emoji || null;
  const reactionColor = myReaction?.color || Colors.textMuted;

  const handleLikeTap = () => {
    if (post.my_reaction) {
      onReact(post.id, post.my_reaction); // toggle off
    } else {
      onReact(post.id, "like");
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLikeLongPress = () => {
    setShowReactions(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handlePickReaction = (r: string) => {
    setShowReactions(false);
    onReact(post.id, r);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Auto-close reaction picker
  useEffect(() => {
    if (showReactions) {
      reactionTimer.current = setTimeout(() => setShowReactions(false), 4000);
    } else {
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
    }
    return () => { if (reactionTimer.current) clearTimeout(reactionTimer.current); };
  }, [showReactions]);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 50, 400)).springify().damping(20)}>
      <View style={[styles.card, post.is_pinned && styles.pinnedCard]}>
        {post.is_pinned && (
          <View style={styles.pinnedBadge}>
            <Ionicons name="pin" size={11} color={Colors.accent} />
            <Text style={styles.pinnedText}>مثبّت</Text>
          </View>
        )}

        {/* Header */}
        <View style={styles.cardHeader}>
          <UserAvatar name={post.author_name} avatarUrl={post.author_avatar} size={44} borderRadius={14} />
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={styles.authorName}>{post.author_name}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.cardTime}>{timeAgo(post.created_at)}</Text>
              {post.views_count > 0 && (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Ionicons name="eye-outline" size={12} color={Colors.textMuted} />
                  <Text style={styles.cardTime}>{post.views_count}</Text>
                </>
              )}
            </View>
          </View>
          <View style={styles.cardRight}>
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

        {post.content ? (
          <Text style={styles.cardContent}>{post.content}</Text>
        ) : null}

        {hasMedia && <PostMediaDisplay image_url={post.image_url} video_url={post.video_url} />}

        <View style={styles.cardDivider} />

        {/* Actions */}
        <View style={styles.cardActions}>
          {/* Like/React */}
          <View style={{ position: "relative" }}>
            {showReactions && (
              <View style={styles.reactionPickerWrap}>
                <ReactionPicker onPick={handlePickReaction} onClose={() => setShowReactions(false)} />
              </View>
            )}
            <AnimatedPress
              style={[styles.actionBtn, post.my_reaction && styles.actionBtnActive]}
              onPress={handleLikeTap}
              onLongPress={handleLikeLongPress}
            >
              <Text style={{ fontSize: 16 }}>{reactionEmoji || "👍"}</Text>
              <Text style={[styles.actionCount, post.my_reaction && { color: reactionColor }]}>
                {post.likes_count}
              </Text>
            </AnimatedPress>
          </View>

          {/* Comments */}
          <AnimatedPress style={styles.actionBtn} onPress={() => onComment(post)}>
            <Ionicons name="chatbubble-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.actionCount}>{post.comments_count}</Text>
          </AnimatedPress>

          {/* Share */}
          <AnimatedPress style={styles.actionBtn} onPress={() => onShare(post)}>
            <Ionicons name="share-social-outline" size={16} color={Colors.textMuted} />
          </AnimatedPress>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const userId = String(auth.user?.id ?? "anonymous");

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState(0);
  const [userName, setUserName] = useState(auth.user?.name || "مجهول");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [catFilter, setCatFilter] = useState("الكل");

  const init = useCallback(async () => {
    const id = await getDeviceId();
    setDeviceId(id);
    if (auth.user?.name) {
      setUserName(auth.user.name);
      return;
    }
    const saved = await AsyncStorage.getItem(USER_NAME_KEY);
    if (saved) setUserName(saved);
  }, [auth.user]);

  const loadPosts = useCallback(async (opts?: { quiet?: boolean; reset?: boolean; cat?: string }) => {
    const cat = opts?.cat ?? catFilter;
    const p = opts?.reset ? 1 : page;
    if (!opts?.quiet) setLoading(true);
    setError("");

    const online = await checkConnected();

    // أوفلاين — اعرض بيانات الـ cache مباشرةً
    if (!online && (opts?.reset || p === 1)) {
      const cached = await cacheGet<Post[]>(`${POSTS_CACHE_KEY}_${cat}`);
      if (cached) {
        setPosts(cached.data);
        setFromCache(true);
        setCachedAt(Date.now());
        setPage(2);
        setHasMore(false);
      } else {
        setError("لا يوجد اتصال · لا توجد بيانات محفوظة لهذا القسم");
      }
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      return;
    }

    try {
      const id = deviceId || await getDeviceId();
      const data = await apiFetchPosts(id, cat, p);
      if (opts?.reset || p === 1) {
        setPosts(data);
        setPage(2);
        setFromCache(false);
        // خزّن الصفحة الأولى فقط (الأحدث) للاستخدام أوفلاين
        if (data.length > 0) cacheSet(`${POSTS_CACHE_KEY}_${cat}`, data).catch(() => {});
      } else {
        setPosts(prev => [...prev, ...data]);
        setPage(p + 1);
      }
      setHasMore(data.length >= 30);
    } catch {
      // عند الفشل جرّب الـ cache كبديل
      if (p === 1) {
        const cached = await cacheGet<Post[]>(`${POSTS_CACHE_KEY}_${cat}`);
        if (cached) {
          setPosts(cached.data);
          setFromCache(true);
          setCachedAt(Date.now());
          setHasMore(false);
        } else {
          setError("تعذّر تحميل المنشورات");
        }
      } else {
        setError("تعذّر تحميل المزيد");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [deviceId, catFilter, page]);

  useEffect(() => { init(); }, []);

  useFocusEffect(useCallback(() => {
    init();
    if (deviceId) loadPosts({ quiet: true, reset: true });
  }, [deviceId]));

  useEffect(() => {
    if (deviceId) loadPosts({ reset: true, cat: catFilter });
  }, [catFilter, deviceId]);

  // Auto-poll every 60s
  useEffect(() => {
    const iv = setInterval(() => {
      if (deviceId) loadPosts({ quiet: true, reset: true });
    }, 60000);
    return () => clearInterval(iv);
  }, [deviceId, catFilter]);

  const handlePost = async (
    content: string, category: string, name: string,
    image_url?: string | null, video_url?: string | null
  ) => {
    try { await requireNetwork(); } catch (e: any) {
      Alert.alert("لا اتصال", e.message);
      return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await AsyncStorage.setItem(USER_NAME_KEY, name);
    setUserName(name);

    const newPost = await apiCreatePost({ author_name: name, content, category, image_url, video_url });
    // Optimistically prepend
    setPosts(prev => [newPost, ...prev]);
  };

  const handleReact = async (postId: number, reaction: string) => {
    if (!deviceId) return;
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const wasReacted = p.my_reaction === reaction;
      return {
        ...p,
        my_reaction: wasReacted ? null : reaction,
        liked_by_me: !wasReacted,
        likes_count: wasReacted ? Math.max(0, p.likes_count - 1) : (p.my_reaction ? p.likes_count : p.likes_count + 1),
      };
    }));
    try {
      await apiReact(postId, deviceId, reaction);
    } catch {}
  };

  const handleDelete = (postId: number) => {
    Alert.alert("حذف المنشور", "هل تريد حذف هذا المنشور نهائياً؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
        onPress: async () => {
          try {
            await apiDeletePost(postId, auth.token);
            setPosts(prev => prev.filter(p => p.id !== postId));
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (e: any) {
            Alert.alert("خطأ", e.message);
          }
        },
      },
    ]);
  };

  const handleShare = async (post: Post) => {
    try {
      await Share.share({
        message: `${post.content}\n\n— من تطبيق حصاحيصاوي`,
      });
    } catch {}
  };

  const openComments = (post: Post) => {
    setSelectedPost(post);
    setShowComments(true);
    apiTrackView(post.id);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views_count: p.views_count + 1 } : p));
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    loadPosts();
  };

  const handleComposePress = () => {
    if (auth.isGuest) {
      Alert.alert("تسجيل مطلوب", "يجب إنشاء حساب للنشر في المجتمع.", [{ text: "حسناً" }]);
      return;
    }
    setShowAdd(true);
  };

  const FILTERS = ["الكل", ...CATEGORIES];

  return (
    <View style={styles.container}>
      {/* Header */}
      <ModernHeader
        title="المجتمع"
        icon="people-outline"
        rightSlot={
          <TouchableOpacity style={styles.newPostFab} onPress={handleComposePress}>
            <Ionicons name="create-outline" size={19} color="#fff" />
            <Text style={styles.newPostFabText}>نشر</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.headerMeta}>
          {isAdmin && (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color={Colors.accentLight} />
              <Text style={styles.adminBadgeText}>مدير</Text>
            </View>
          )}
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>مباشر</Text>
          </View>
        </View>
      </ModernHeader>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((f) => {
          const active = catFilter === f;
          const color = f !== "الكل" ? (CATEGORY_COLORS[f] || Colors.primary) : Colors.primary;
          return (
            <AnimatedPress
              key={f}
              style={[styles.filterBtn, active && { backgroundColor: color, borderColor: color }]}
              onPress={() => setCatFilter(f)}
              scaleDown={0.92}
            >
              {f !== "الكل" && (
                <Ionicons name={CATEGORY_ICONS[f] as any || "globe-outline"} size={12} color={active ? "#fff" : Colors.textMuted} />
              )}
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f}</Text>
            </AnimatedPress>
          );
        })}
      </ScrollView>

      <GuestGate
        title="ساحة المجتمع"
        preview={
          <View style={{ padding: 16, gap: 12 }}>
            {[
              { author: "أحمد محمد", time: "منذ ٣ دقائق", cat: "خبر", text: "تم افتتاح مركز الصحة الجديد في حي السلام..." },
              { author: "فاطمة علي", time: "منذ ١٢ دقيقة", cat: "سؤال", text: "هل توجد وظائف شاغرة في مجال التعليم؟..." },
              { author: "المجتمع الحصاحيصاوي", time: "منذ ساعة", cat: "إعلان", text: "إعلان هام: اجتماع مجلس الحي يوم الخميس..." },
            ].map((item, i) => (
              <View key={i} style={{ backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 14, borderWidth: 1, borderColor: Colors.divider, ...Colors.shadow.card }}>
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
          { icon: "newspaper-outline", text: "اطّلع على أخبار الحصاحيصا لحظةً بلحظة" },
          { icon: "image-outline", text: "شارك صوراً وفيديوهات مع المجتمع" },
          { icon: "heart-outline", text: "تفاعل مع ردود الفعل المتعددة" },
          { icon: "chatbubbles-outline", text: "شارك في نقاشات المجتمع الحية" },
        ]}
      >
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadPosts({ quiet: true, reset: true }); }}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          ListHeaderComponent={
            <>
              {fromCache && (
                <View style={styles.cacheBanner}>
                  <Ionicons name="cloud-offline-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.cacheBannerText}>بيانات محفوظة · تحديث عند عودة الاتصال</Text>
                </View>
              )}
              {!auth.isGuest ? (
                <ComposeBar name={userName} onPress={handleComposePress} />
              ) : null}
            </>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.loadingText}>جارٍ تحميل المنشورات...</Text>
              </View>
            ) : error ? (
              <View style={styles.empty}>
                <Ionicons name="cloud-offline-outline" size={62} color={Colors.divider} />
                <Text style={styles.emptyText}>{error}</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => loadPosts({ reset: true })}>
                  <Text style={styles.emptyBtnText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="newspaper-outline" size={62} color={Colors.divider} />
                <Text style={styles.emptyText}>لا توجد منشورات بعد</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={handleComposePress}>
                  <Text style={styles.emptyBtnText}>كن أول من ينشر!</Text>
                </TouchableOpacity>
              </View>
            )
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            <>{loadingMore ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} /> : null}<OrgInviteCard /></>
          }
          renderItem={({ item, index }) => (
            <PostCard
              post={item}
              index={index}
              isAdmin={isAdmin}
              deviceId={deviceId}
              onReact={handleReact}
              onComment={openComments}
              onDelete={handleDelete}
              onShare={handleShare}
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
        onCommentsLoaded={(count) => {
          if (selectedPost) {
            setPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comments_count: count } : p));
          }
        }}
      />
    </View>
  );
}

// ─── Compose Bar ──────────────────────────────────────────────────────────────

function ComposeBar({ name, onPress }: { name: string; onPress: () => void }) {
  const ac = avatarColor(name || "م");
  return (
    <TouchableOpacity style={cb.wrap} onPress={onPress} activeOpacity={0.75}>
      <View style={[cb.avatar, { backgroundColor: ac + "22", borderColor: ac + "55" }]}>
        <Text style={[cb.avatarLetter, { color: ac }]}>{(name || "م").charAt(0)}</Text>
      </View>
      <View style={cb.inputFake}>
        <Text style={cb.inputFakePlaceholder}>شارك شيئاً مع الحصاحيصا...</Text>
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
    backgroundColor: Colors.cardBg, marginHorizontal: 14, marginBottom: 10, marginTop: 4,
    borderRadius: Colors.radius.xl, padding: 12, alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: Colors.divider, flexDirection: "row-reverse",
    ...Colors.shadow.card,
  },
  avatar: { width: 38, height: 38, borderRadius: Colors.radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  avatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  inputFake: {
    flex: 1, height: 38, backgroundColor: Colors.bg, borderRadius: Colors.radius.md,
    justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.divider,
  },
  inputFakePlaceholder: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted, textAlign: "right" },
  mediaIcons: { flexDirection: "row", gap: 10, paddingHorizontal: 4 },
});

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  headerMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  adminBadge: {
    backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Colors.radius.sm, alignItems: "center", gap: 4, flexDirection: "row-reverse",
  },
  adminBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.accentLight },
  newPostFab: {
    backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Colors.radius.pill, flexDirection: "row-reverse", alignItems: "center", gap: 5,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.35)",
  },
  newPostFabText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  liveBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Colors.radius.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.30)",
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#fff" },
  liveText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#fff" },

  filters: { paddingHorizontal: 14, paddingVertical: 10, gap: 7, flexDirection: "row-reverse" },
  filterBtn: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: Colors.radius.pill,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
  },
  filterText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterTextActive: { color: "#fff", fontFamily: "Cairo_700Bold" },

  list: { paddingTop: 8, paddingHorizontal: 14, gap: 12 },

  card: {
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 16,
    borderWidth: 1, borderColor: Colors.divider,
    ...Colors.shadow.card,
  },
  pinnedCard: { borderColor: Colors.accent + "50", borderWidth: 1.5 },
  pinnedBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: Colors.accent + "15", paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 8, alignSelf: "flex-end", marginBottom: 8,
  },
  pinnedText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.accent },

  cardHeader: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 0, marginBottom: 12 },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 2 },
  metaDot: { color: Colors.textMuted, fontSize: 10 },
  authorName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  cardTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  cardRight: { alignItems: "center", gap: 8 },
  catBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  catText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  deleteBtn: { padding: 5 },

  cardContent: {
    fontFamily: "Cairo_400Regular", fontSize: 15, lineHeight: 26,
    color: Colors.textPrimary, marginBottom: 4, textAlign: "right",
  },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: 12 },
  cardActions: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  actionBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Colors.radius.pill,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider,
  },
  actionBtnActive: { backgroundColor: Colors.primary + "12", borderColor: Colors.primary + "40" },
  actionCount: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },

  reactionPickerWrap: {
    position: "absolute", bottom: 48, right: 0, zIndex: 100,
  },

  loadingWrap: { alignItems: "center", paddingTop: 60, gap: 12 },
  loadingText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 16, color: Colors.textMuted },
  emptyBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: Colors.radius.md,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider,
  },
  emptyBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary },
});

// ─── Modal Styles ──────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "92%", overflow: "hidden",
  },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginTop: 12 },
  sheetHead: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  closeBtn: {
    width: 36, height: 36, borderRadius: Colors.radius.pill, backgroundColor: Colors.bg,
    alignItems: "center", justifyContent: "center",
  },
  publishBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: Colors.radius.pill, alignItems: "center", justifyContent: "center", minWidth: 60 },
  publishBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  form: { padding: 16, gap: 12 },
  authorRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  authorAvatar: {
    width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.15)", flexShrink: 0,
  },
  authorAvatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 19, color: "#fff" },
  nameInput: {
    fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary,
    paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.divider, marginBottom: 8,
    textAlign: "right",
  },
  catRow: { gap: 6, paddingBottom: 4, flexDirection: "row-reverse" },
  catChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Colors.radius.sm, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg,
  },
  catChipText: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textSecondary },
  contentInput: {
    fontFamily: "Cairo_400Regular", fontSize: 16, color: Colors.textPrimary,
    minHeight: 110, paddingVertical: 8, lineHeight: 26, textAlignVertical: "top",
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  charCount: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  progressWrap: { gap: 6 },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: Colors.divider, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Colors.primary, borderRadius: 2 },
  progressText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  mediaBar: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 12, gap: 0, marginTop: 4, flexDirection: "row-reverse" },
  mediaBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 10 },
  mediaBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary },
  mediaDivider: { width: 1, backgroundColor: Colors.divider, marginVertical: 6 },
});

const cs = StyleSheet.create({
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "88%", overflow: "hidden" },
  postSnippet: {
    flexDirection: "row-reverse", gap: 10, padding: 14, backgroundColor: Colors.bg,
    borderBottomWidth: 1, borderBottomColor: Colors.divider, alignItems: "center",
  },
  snippetImg: { width: 48, height: 48, borderRadius: Colors.radius.sm },
  snippetText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, fontStyle: "italic", textAlign: "right" },

  commentCard: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider + "66" },
  replyCard: { marginRight: 40, backgroundColor: Colors.bg, borderRadius: Colors.radius.md, padding: 10, borderWidth: 1, borderColor: Colors.divider },
  commentHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  commentAvatar: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  commentAvatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  commentAuthor: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  commentTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  commentText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, lineHeight: 22, textAlign: "right", paddingRight: 40 },
  replyBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingRight: 40, marginTop: 2 },
  replyBtnText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },

  replyingTo: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: Colors.primary + "12", paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  replyingToText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.primary, flex: 1, textAlign: "right" },

  replyBar: {
    padding: 12, borderTopWidth: 1, borderTopColor: Colors.divider,
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
  },
  replyInputWrap: {
    flex: 1, backgroundColor: Colors.bg, borderRadius: Colors.radius.xl, borderWidth: 1,
    borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 8,
  },
  replyInput: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, maxHeight: 100, textAlign: "right" },
  sendBtn: {
    width: 42, height: 42, borderRadius: Colors.radius.pill, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
    ...Colors.shadow.raised,
  },
  cacheBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.divider,
    borderRadius: Colors.radius.md, marginHorizontal: 14, marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  cacheBannerText: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, flex: 1, textAlign: "right",
  },
});
