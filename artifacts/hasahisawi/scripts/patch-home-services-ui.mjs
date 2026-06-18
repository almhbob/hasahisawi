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
`          <View style={[styles.gridIconWrap, { backgroundColor: item.color + "18", borderColor: item.color + "40" }]}>
             {item.iconType === "ionicons"
               ? <Ionicons name={item.icon} size={22} color={item.color} />
               : <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />}
           </View>`,
`          <View style={[styles.gridIconWrap, { backgroundColor: item.color + "14", borderColor: item.color + "30" }]}>
             {item.iconType === "ionicons"
               ? <Ionicons name={item.icon} size={19} color={item.color} />
               : <MaterialCommunityIcons name={item.icon} size={19} color={item.color} />}
           </View>`,
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

  src = replaceOnceIn(
    src,
`  gridItem: {
     backgroundColor: "rgba(255,255,255,0.04)",
     borderRadius: 20, padding: 14,
     alignItems: "center", height: 128,
     justifyContent: "center",
     borderWidth: 0.5, borderColor: "rgba(255,255,255,0.09)",
     overflow: "hidden",
   },`,
`  gridItem: {
     backgroundColor: "rgba(255,255,255,0.04)",
     borderRadius: 20,
     paddingHorizontal: 10,
     paddingVertical: 12,
     alignItems: "center",
     minHeight: 134,
     justifyContent: "center",
     borderWidth: 0.5,
     borderColor: "rgba(255,255,255,0.09)",
     overflow: "hidden",
   },`,
    'grid item layout',
  );

  src = replaceOnceIn(
    src,
`  gridGlow: {
     position: "absolute", bottom: 0, left: 0, right: 0, height: 55, borderRadius: 20,
   },`,
`  gridGlow: {
     position: "absolute",
     bottom: 0,
     left: 0,
     right: 0,
     height: 42,
     borderRadius: 20,
   },`,
    'grid glow',
  );

  src = replaceOnceIn(
    src,
`  gridIconWrap: {
     width: 48, height: 48, borderRadius: 15,
     justifyContent: "center", alignItems: "center",
     marginBottom: 9, borderWidth: 0.5,
   },`,
`  gridIconWrap: {
     width: 40,
     height: 40,
     borderRadius: 13,
     justifyContent: "center",
     alignItems: "center",
     marginBottom: 7,
     borderWidth: 0.5,
   },`,
    'icon box style',
  );

  src = replaceOnceIn(
    src,
`  gridLabel: {
     fontFamily: "Cairo_700Bold", fontSize: 12,
     color: "rgba(240,253,244,0.92)", textAlign: "center",
     letterSpacing: 0.1,
   },`,
`  gridLabel: {
     fontFamily: "Cairo_700Bold",
     fontSize: 12,
     color: "rgba(240,253,244,0.94)",
     textAlign: "center",
     letterSpacing: 0.1,
     lineHeight: 18,
     minHeight: 36,
   },`,
    'grid label style',
  );

  src = replaceOnceIn(
    src,
`  gridSub: {
     fontFamily: "Cairo_400Regular", fontSize: 9,
     color: "rgba(167,243,208,0.60)", textAlign: "center", marginTop: 2,
     lineHeight: 13,
   },`,
`  gridSub: {
     fontFamily: "Cairo_400Regular",
     fontSize: 9,
     color: "rgba(167,243,208,0.62)",
     textAlign: "center",
     marginTop: 2,
     lineHeight: 13,
     minHeight: 26,
   },`,
    'grid sub style',
  );

  if (src !== before) {
    writeFileSync(file, src);
    console.log('[patch-home-services-ui] Home service cards patched.');
  } else {
    console.log('[patch-home-services-ui] Home service cards already clean.');
  }
}

function patchSocialScreen() {
  const file = new URL('../app/(tabs)/social.tsx', import.meta.url);
  let src = readFileSync(file, 'utf8');
  const before = src;

  const replacements = new Map([
    ['خبر: "#8E44AD"', 'خبر: "#0EA5E9"'],
    ['color: "#9B59B6"', 'color: "#14B8A6"'],
    ['"#E74C3C", "#3498DB", "#9B59B6", "#1ABC9C",', '"#E74C3C", "#3498DB", "#14B8A6", "#1ABC9C",'],
  ]);
  for (const [from, to] of replacements) src = replaceEveryIn(src, from, to);

  src = replaceOnceIn(
    src,
`async function apiFetchPosts(deviceId: string, category?: string, page = 1): Promise<Post[]> {
  const params = new URLSearchParams({ device_id: deviceId, page: String(page), limit: "30" });
  if (category && category !== "الكل") params.set("category", category);
  const res = await fetchWithTimeout(apiUrl(\`/api/posts?\${params}\`));
  if (!res.ok) throw new Error("Failed to fetch posts");
  return res.json();
}`,
`function normalizePost(row: any): Post {
  return {
    id: Number(row.id),
    author_name: row.author_name ?? row.display_name ?? row.user_name ?? "مجهول",
    author_avatar: row.author_avatar ?? row.avatar_url ?? null,
    content: row.content ?? "",
    category: row.category ?? "عام",
    likes_count: Number(row.likes_count ?? row.likes ?? 0),
    comments_count: Number(row.comments_count ?? 0),
    views_count: Number(row.views_count ?? 0),
    liked_by_me: Boolean(row.liked_by_me),
    my_reaction: row.my_reaction ?? (row.liked_by_me ? "like" : null),
    created_at: row.created_at ?? new Date().toISOString(),
    image_url: row.image_url ?? null,
    video_url: row.video_url ?? null,
    is_pinned: Boolean(row.is_pinned),
  };
}

async function readPosts(url: string): Promise<Post[]> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to fetch posts");
  const json = await res.json();
  return Array.isArray(json) ? json.map(normalizePost) : [];
}

async function apiFetchPosts(deviceId: string, category?: string, page = 1): Promise<Post[]> {
  const params = new URLSearchParams({ device_id: deviceId, page: String(page), limit: "30" });
  if (category && category !== "الكل") params.set("category", category);
  try {
    const modern = await readPosts(apiUrl(\`/api/posts?\${params}\`));
    if (modern.length > 0 || page > 1) return modern;
  } catch {}

  const legacyParams = new URLSearchParams({ limit: "30", offset: String((page - 1) * 30) });
  if (category && category !== "الكل") legacyParams.set("category", category);
  return readPosts(apiUrl(\`/api/social/posts?\${legacyParams}\`));
}`,
    'social legacy posts fallback',
  );

  if (src !== before) {
    writeFileSync(file, src);
    console.log('[patch-home-services-ui] Social screen patched: no purple and legacy posts fallback.');
  } else {
    console.log('[patch-home-services-ui] Social screen already patched.');
  }
}

patchHomeCards();
patchSocialScreen();
