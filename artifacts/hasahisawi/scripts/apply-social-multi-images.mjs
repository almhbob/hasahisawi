import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const socialPath = resolve(__dirname, '../app/(tabs)/social.tsx');
let source = readFileSync(socialPath, 'utf8');
let changed = false;

function replaceOnce(from, to) {
  if (!source.includes(from)) return false;
  source = source.replace(from, to);
  changed = true;
  return true;
}

function replaceRegex(re, to, label) {
  if (!re.test(source)) throw new Error(`Missing patch target: ${label}`);
  source = source.replace(re, to);
  changed = true;
}

if (!source.includes('function decodePostImages')) {
  replaceOnce(`function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 7) return new Date(iso).toLocaleDateString("ar-SA");
  if (d >= 1) return \`منذ ${'${d}'} يوم\`;
  if (h >= 1) return \`منذ ${'${h}'} ساعة\`;
  if (m >= 1) return \`منذ ${'${m}'} دقيقة\`;
  return "الآن";
}
`, `function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d >= 7) return new Date(iso).toLocaleDateString("ar-SA");
  if (d >= 1) return \`منذ ${'${d}'} يوم\`;
  if (h >= 1) return \`منذ ${'${h}'} ساعة\`;
  if (m >= 1) return \`منذ ${'${m}'} دقيقة\`;
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
`);
}

if (!source.includes('async function pickImages')) {
  replaceOnce(`async function pickMedia(type: "image" | "video"): Promise<MediaAsset | null> {
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
`, `async function pickMedia(type: "image" | "video"): Promise<MediaAsset | null> {
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
`);
}

if (!source.includes('async function uploadImageList')) {
  replaceOnce(`async function uploadMedia(
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
`, `async function uploadMedia(
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
`);
}

if (!source.includes('function MultiMediaPreview')) {
  replaceOnce(`function MediaPreview({ uri, type, onRemove }: { uri: string; type: "image" | "video"; onRemove: () => void }) {
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
`, `function MediaPreview({ uri, type, onRemove }: { uri: string; type: "image" | "video"; onRemove: () => void }) {
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
`);
}

replaceRegex(/const mp = StyleSheet\.create\([\s\S]*?\n\}\);\n\n\/\/ ─── Post Media Display/, `const mp = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: "hidden", height: 240, marginTop: 8, backgroundColor: "#000" },
  img: { width: "100%", height: "100%" },
  videoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center", gap: 6 },
  playBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.5)" },
  videoLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
  removeBtn: { position: "absolute", top: 8, right: 8 },
  multiWrap: { marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface1, padding: 10 },
  multiHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  multiTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  addMoreBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: Colors.primary + "15" },
  addMoreText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.primary },
  multiList: { gap: 8, paddingVertical: 2 },
  thumbWrap: { width: 104, height: 104, borderRadius: 14, overflow: "hidden", backgroundColor: "#000" },
  thumbImg: { width: "100%", height: "100%" },
  thumbRemove: { position: "absolute", top: 5, right: 5, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 20 },
});

// ─── Post Media Display`, 'mp styles');

replaceRegex(/function PostMediaDisplay\(\{ image_url, video_url \}: \{ image_url\?: string \| null; video_url\?: string \| null \}\) \{[\s\S]*?\n\}\n\nconst pmd = StyleSheet\.create\([\s\S]*?\n\}\);/, `function PostMediaDisplay({ image_url, video_url }: { image_url?: string | null; video_url?: string | null }) {
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
          <View style={pmd.countBadge}><Ionicons name="images" size={13} color="#fff" /><Text style={pmd.countText}>{images.length}</Text></View>
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
            <TouchableOpacity style={pmd.viewerClose} onPress={() => setViewer(null)}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
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
        <Image source={{ uri: url }} style={pmd.img} resizeMode={isVideo ? "cover" : "contain"} onLoad={() => setLoaded(true)} />
      </TouchableOpacity>
      {isVideo && (
        <TouchableOpacity style={pmd.videoOverlay} onPress={() => Linking.openURL(url)} activeOpacity={0.8}>
          <View style={pmd.playCircle}><Ionicons name="play" size={32} color="#fff" /></View>
          <Text style={pmd.playLabel}>اضغط لتشغيل الفيديو</Text>
        </TouchableOpacity>
      )}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={pmd.viewerOverlay}>
          <TouchableOpacity style={pmd.viewerClose} onPress={() => setViewer(null)}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
          {viewer ? <Image source={{ uri: viewer }} style={pmd.viewerImage} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </View>
  );
}

const pmd = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: "hidden", marginVertical: 10, width: IMG_MAX_W, alignSelf: "center", backgroundColor: Colors.surface1 },
  skeleton: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.divider },
  img: { width: "100%", height: "100%" },
  videoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)", alignItems: "center", justifyContent: "center", gap: 8 },
  playCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: "rgba(255,255,255,0.22)", borderWidth: 2.5, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center" },
  playLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: "rgba(255,255,255,0.85)" },
  multiBlock: { width: IMG_MAX_W, alignSelf: "center", marginVertical: 10, gap: 8 },
  multiHero: { height: IMG_MAX_W * 0.72, borderRadius: 18, overflow: "hidden", backgroundColor: Colors.surface1 },
  multiThumbs: { gap: 8, paddingHorizontal: 2 },
  postThumb: { width: 86, height: 86, borderRadius: 14, overflow: "hidden", backgroundColor: Colors.surface1 },
  countBadge: { position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(0,0,0,0.55)" },
  countText: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 12 },
  viewerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerClose: { position: "absolute", top: 48, right: 22, zIndex: 2, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "84%" },
});`, 'PostMediaDisplay');

replaceOnce('  const [media, setMedia] = useState<MediaAsset | null>(null);', '  const [media, setMedia] = useState<MediaAsset | null>(null);\n  const [imageItems, setImageItems] = useState<MediaAsset[]>([]);');
replaceOnce('    setContent(""); setCategory("عام"); setMedia(null);', '    setContent(""); setCategory("عام"); setMedia(null); setImageItems([]);');
replaceOnce('    if (!content.trim() && !media) {', '    if (!content.trim() && !media && imageItems.length === 0) {');
replaceOnce(`      if (media) {
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
`, `      if (imageItems.length > 0) {
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
`);
replaceOnce('  const canPost = content.trim().length > 0 || !!media;', '  const canPost = content.trim().length > 0 || !!media || imageItems.length > 0;');
replaceOnce('                {media && <MediaPreview uri={media.uri} type={media.type} onRemove={() => setMedia(null)} />}', '                {imageItems.length > 0 && <MultiMediaPreview items={imageItems} onRemove={(idx) => setImageItems(prev => prev.filter((_, i) => i !== idx))} onAddMore={() => pickImages(imageItems.length).then(items => { if (items.length) { setMedia(null); setImageItems(prev => [...prev, ...items].slice(0, 10)); } })} />}\n                {media && <MediaPreview uri={media.uri} type={media.type} onRemove={() => setMedia(null)} />}');
replaceOnce('                  <TouchableOpacity style={ms.mediaBtn} onPress={() => pickMedia("image").then(a => a && setMedia(a))} disabled={loading}>\n                    <Ionicons name="image-outline" size={22} color={Colors.primary} />\n                    <Text style={ms.mediaBtnText}>صورة</Text>\n                  </TouchableOpacity>', '                  <TouchableOpacity style={ms.mediaBtn} onPress={() => pickImages(imageItems.length).then(items => { if (items.length) { setMedia(null); setImageItems(prev => [...prev, ...items].slice(0, 10)); } })} disabled={loading}>\n                    <Ionicons name="images-outline" size={22} color={Colors.primary} />\n                    <Text style={ms.mediaBtnText}>صور متعددة</Text>\n                  </TouchableOpacity>');
replaceOnce('                  <TouchableOpacity style={ms.mediaBtn} onPress={() => pickMedia("video").then(a => a && setMedia(a))} disabled={loading}>', '                  <TouchableOpacity style={ms.mediaBtn} onPress={() => pickMedia("video").then(a => { if (a) { setImageItems([]); setMedia(a); } })} disabled={loading}>');
replaceOnce('{post.image_url && <Image source={{ uri: post.image_url }} style={cs.snippetImg} />}', '{decodePostImages(post.image_url)[0] && <Image source={{ uri: decodePostImages(post.image_url)[0] }} style={cs.snippetImg} />}');

if (changed) {
  writeFileSync(socialPath, source);
  console.log('✅ Social multi-image publishing patch applied.');
} else {
  console.log('✅ Social multi-image publishing already patched.');
}
