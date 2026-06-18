import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnceIn(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    console.warn(`[patch-home-services-ui] skipped ${label}: source block not found`);
    return source;
  }
  return source.replace(from, to);
}

function replaceEveryIn(source, from, to) {
  return source.split(from).join(to);
}

function patchHomeCards() {
  const file = new URL('../app/(tabs)/index.tsx', import.meta.url);
  let src = readFileSync(file, 'utf8');
  const before = src;

  src = replaceOnceIn(
    src,
    '<Text style={styles.gridLabel} numberOfLines={1}>{item.label}</Text>',
    '<Text style={styles.gridLabel} numberOfLines={2}>{item.label}</Text>',
    'grid label lines',
  );
  src = replaceOnceIn(
    src,
    '<Text style={styles.gridSub} numberOfLines={1}>{item.sub}</Text>',
    '<Text style={styles.gridSub} numberOfLines={2}>{item.sub}</Text>',
    'grid sub lines',
  );

  src = replaceOnceIn(
    src,
`          <View style={[styles.gridIconWrap, { backgroundColor: item.color + "18", borderColor: item.color + "40" }]}>\n             {item.iconType === "ionicons"\n               ? <Ionicons name={item.icon} size={22} color={item.color} />\n               : <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />}\n           </View>`,
`          <View style={[styles.gridIconWrap, { backgroundColor: item.color + "14", borderColor: item.color + "30" }]}>\n             {item.iconType === "ionicons"\n               ? <Ionicons name={item.icon} size={19} color={item.color} />\n               : <MaterialCommunityIcons name={item.icon} size={19} color={item.color} />}\n           </View>`,
    'icon visual weight',
  );

  const labelReplacements = new Map([
    ['label: t(\'home\',\'calendarService\').label', 'label: "التقويم"'],
    ['label: t(\'home\',\'orgsService\').label', 'label: "المنظمات"'],
    ['label: "حجز المواعيد"', 'label: "المواعيد"'],
    ['label: "مشاويرك علينا وخدمات التوصيل"', 'label: "مشاويرك علينا"'],
    ['sub: "سيارات · ركشات · طلبات"', 'sub: "توصيل · ركشات · طلبات"'],
    ['label: "شركات الاتصالات"', 'label: "الاتصالات"'],
    ['label: "النقابات المهنية"', 'label: "النقابات"'],
  ]);
  for (const [from, to] of labelReplacements) src = replaceEveryIn(src, from, to);

  // Keep the home screen calm: only green, gold, neutral, and red for alerts.
  const minimalPaletteReplacements = new Map([
    ['color: "#3E9CBF", bg: "#3E9CBF20"', 'color: Colors.primary, bg: Colors.primary+"20"'],
    ['color: "#A855F7", bg: "#A855F720"', 'color: Colors.primary, bg: Colors.primary+"20"'],
    ['color: "#FF6B35", bg: "#FF6B3520"', 'color: Colors.accent, bg: Colors.accent+"20"'],
    ['color: "#27AE68", bg: "#27AE6820"', 'color: Colors.primary, bg: Colors.primary+"20"'],
    ['color: "#FF4FA3", bg: "#FF4FA320"', 'color: Colors.primary, bg: Colors.primary+"20"'],
    ['color: "#FBBF24", bg: "#FBBF2420"', 'color: Colors.accent, bg: Colors.accent+"20"'],
    ['color: "#F87171", bg: "#F8717120"', 'color: Colors.danger, bg: Colors.danger+"20"'],
    ['color: "#3EFF9C", bg: "#3EFF9C20"', 'color: Colors.primary, bg: Colors.primary+"20"'],
    ['color: Colors.cyber, bg: Colors.cyber+"20"', 'color: Colors.primary, bg: Colors.primary+"20"'],
  ]);
  for (const [from, to] of minimalPaletteReplacements) src = replaceEveryIn(src, from, to);

  src = replaceEveryIn(src, 'color="#FBBF24"', 'color={Colors.accent}');
  src = replaceEveryIn(src, 'color: "#FBBF24"', 'color: Colors.accent');

  src = replaceOnceIn(
    src,
`  gridItem: {\n     backgroundColor: "rgba(255,255,255,0.04)",\n     borderRadius: 20, padding: 14,\n     alignItems: "center", height: 128,\n     justifyContent: "center",\n     borderWidth: 0.5, borderColor: "rgba(255,255,255,0.09)",\n     overflow: "hidden",\n   },`,
`  gridItem: {\n     backgroundColor: "rgba(255,255,255,0.04)",\n     borderRadius: 20,\n     paddingHorizontal: 10,\n     paddingVertical: 12,\n     alignItems: "center",\n     minHeight: 134,\n     justifyContent: "center",\n     borderWidth: 0.5,\n     borderColor: "rgba(255,255,255,0.09)",\n     overflow: "hidden",\n   },`,
    'grid item layout',
  );

  src = replaceOnceIn(
    src,
`  gridGlow: {\n     position: "absolute", bottom: 0, left: 0, right: 0, height: 55, borderRadius: 20,\n   },`,
`  gridGlow: {\n     position: "absolute",\n     bottom: 0,\n     left: 0,\n     right: 0,\n     height: 42,\n     borderRadius: 20,\n   },`,
    'grid glow',
  );

  src = replaceOnceIn(
    src,
`  gridIconWrap: {\n     width: 48, height: 48, borderRadius: 15,\n     justifyContent: "center", alignItems: "center",\n     marginBottom: 9, borderWidth: 0.5,\n   },`,
`  gridIconWrap: {\n     width: 40,\n     height: 40,\n     borderRadius: 13,\n     justifyContent: "center",\n     alignItems: "center",\n     marginBottom: 7,\n     borderWidth: 0.5,\n   },`,
    'icon box style',
  );

  src = replaceOnceIn(
    src,
`  gridLabel: {\n     fontFamily: "Cairo_700Bold", fontSize: 12,\n     color: "rgba(240,253,244,0.92)", textAlign: "center",\n     letterSpacing: 0.1,\n   },`,
`  gridLabel: {\n     fontFamily: "Cairo_700Bold",\n     fontSize: 12,\n     color: "rgba(240,253,244,0.94)",\n     textAlign: "center",\n     letterSpacing: 0.1,\n     lineHeight: 18,\n     minHeight: 36,\n   },`,
    'grid label style',
  );

  src = replaceOnceIn(
    src,
`  gridSub: {\n     fontFamily: "Cairo_400Regular", fontSize: 9,\n     color: "rgba(167,243,208,0.60)", textAlign: "center", marginTop: 2,\n     lineHeight: 13,\n   },`,
`  gridSub: {\n     fontFamily: "Cairo_400Regular",\n     fontSize: 9,\n     color: "rgba(167,243,208,0.62)",\n     textAlign: "center",\n     marginTop: 2,\n     lineHeight: 13,\n     minHeight: 26,\n   },`,
    'grid sub style',
  );

  if (src !== before) {
    writeFileSync(file, src);
    console.log('[patch-home-services-ui] Home screen simplified and patched.');
  } else {
    console.log('[patch-home-services-ui] Home screen already clean.');
  }
}

function patchSocialScreen() {
  const file = new URL('../app/(tabs)/social.tsx', import.meta.url);
  let src = readFileSync(file, 'utf8');
  const before = src;

  const replacements = new Map([
    ['سؤال: "#2980B9"', 'سؤال: Colors.primary'],
    ['خبر: "#8E44AD"', 'خبر: Colors.primary'],
    ['إعلان: "#E67E22"', 'إعلان: Colors.accent'],
    ['نقاش: "#C0392B"', 'نقاش: Colors.danger'],
    ['شكر: "#27AE60"', 'شكر: Colors.primary'],
    ['color: "#2980B9"', 'color: Colors.primary'],
    ['color: "#9B59B6"', 'color: Colors.primary'],
    ['color: "#F39C12"', 'color: Colors.accent'],
    ['color: "#3498DB"', 'color: Colors.neutral'],
    ['"#E74C3C", "#3498DB", "#9B59B6", "#1ABC9C",\n  "#E67E22", "#27AE60", "#2980B9", "#D35400",', 'Colors.danger, Colors.neutral, Colors.primary, Colors.accent,\n  Colors.primary, Colors.accent, Colors.neutral, Colors.danger,'],
  ]);
  for (const [from, to] of replacements) src = replaceEveryIn(src, from, to);

  src = replaceOnceIn(
    src,
`async function apiFetchPosts(deviceId: string, category?: string, page = 1): Promise<Post[]> {\n  const params = new URLSearchParams({ device_id: deviceId, page: String(page), limit: "30" });\n  if (category && category !== "الكل") params.set("category", category);\n  const res = await fetchWithTimeout(apiUrl(\`/api/posts?\${params}\`));\n  if (!res.ok) throw new Error("Failed to fetch posts");\n  return res.json();\n}`,
`function normalizePost(row: any): Post {\n  return {\n    id: Number(row.id),\n    author_name: row.author_name ?? row.display_name ?? row.user_name ?? "مجهول",\n    author_avatar: row.author_avatar ?? row.avatar_url ?? null,\n    content: row.content ?? "",\n    category: row.category ?? "عام",\n    likes_count: Number(row.likes_count ?? row.likes ?? 0),\n    comments_count: Number(row.comments_count ?? 0),\n    views_count: Number(row.views_count ?? 0),\n    liked_by_me: Boolean(row.liked_by_me),\n    my_reaction: row.my_reaction ?? (row.liked_by_me ? "like" : null),\n    created_at: row.created_at ?? new Date().toISOString(),\n    image_url: row.image_url ?? null,\n    video_url: row.video_url ?? null,\n    is_pinned: Boolean(row.is_pinned),\n  };\n}\n\nasync function readPosts(url: string): Promise<Post[]> {\n  const res = await fetchWithTimeout(url);\n  if (!res.ok) throw new Error("Failed to fetch posts");\n  const json = await res.json();\n  return Array.isArray(json) ? json.map(normalizePost) : [];\n}\n\nasync function apiFetchPosts(deviceId: string, category?: string, page = 1): Promise<Post[]> {\n  const params = new URLSearchParams({ device_id: deviceId, page: String(page), limit: "30" });\n  if (category && category !== "الكل") params.set("category", category);\n  try {\n    const modern = await readPosts(apiUrl(\`/api/posts?\${params}\`));\n    if (modern.length > 0 || page > 1) return modern;\n  } catch {}\n\n  const legacyParams = new URLSearchParams({ limit: "30", offset: String((page - 1) * 30) });\n  if (category && category !== "الكل") legacyParams.set("category", category);\n  return readPosts(apiUrl(\`/api/social/posts?\${legacyParams}\`));\n}`,
    'social legacy posts fallback',
  );

  if (src !== before) {
    writeFileSync(file, src);
    console.log('[patch-home-services-ui] Social screen simplified and legacy posts fallback enabled.');
  } else {
    console.log('[patch-home-services-ui] Social screen already clean.');
  }
}

patchHomeCards();
patchSocialScreen();
