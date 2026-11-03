// عناصر واجهة «إثراء» المشتركة: غلاف الكتاب، بطاقة المقال، رف التصنيف، شارات.
import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { ITHRAA, ITHRAA_DEEP, ITHRAA_GOLD, STATUS_META, type IthraaItem, type IthraaShelf } from "@/lib/ithraa";

/** غلاف كتاب: صورة الغلاف إن وُجدت، وإلا غلاف مولَّد بلون الرف والعنوان. */
export function BookCover({ item, color, width = 112 }: { item: Pick<IthraaItem, "title" | "author_name" | "cover_url" | "kind">; color?: string; width?: number }) {
  const h = Math.round(width * 1.45);
  const c = color || ITHRAA;
  if (item.cover_url) {
    return <Image source={{ uri: item.cover_url }} style={[s.cover, { width, height: h }]} resizeMode="cover" accessibilityLabel={item.title} />;
  }
  return (
    <LinearGradient colors={[c, shade(c)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.cover, { width, height: h, padding: width * 0.09 }]}>
      <View style={s.spine} />
      <Ionicons name={item.kind === "article" ? "document-text" : "book"} size={width * 0.2} color="rgba(255,255,255,0.85)" style={{ alignSelf: "flex-end" }} />
      <Text numberOfLines={4} style={[s.coverTitle, { fontSize: Math.max(11, width * 0.115) }]}>{item.title}</Text>
      {!!item.author_name && <Text numberOfLines={1} style={[s.coverAuthor, { fontSize: Math.max(9, width * 0.085) }]}>{item.author_name}</Text>}
      <View style={[s.coverBand, { backgroundColor: ITHRAA_GOLD }]} />
    </LinearGradient>
  );
}

function shade(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 45), g = Math.max(0, ((n >> 8) & 255) - 45), b = Math.max(0, (n & 255) - 45);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function BookTile({ item, color, onPress, width = 112 }: { item: IthraaItem; color?: string; onPress: () => void; width?: number }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]} accessibilityRole="button" accessibilityLabel={item.title}>
      <View>
        <BookCover item={item} color={color} width={width} />
        {item.featured && <View style={s.star}><Ionicons name="star" size={11} color="#fff" /></View>}
      </View>
      <Text numberOfLines={2} style={s.tileTitle}>{item.title}</Text>
      <Text numberOfLines={1} style={s.tileSub}>{item.author_name || item.category_label}</Text>
    </Pressable>
  );
}

export function ArticleCard({ item, color, onPress, footer }: { item: IthraaItem; color?: string; onPress: () => void; footer?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.article, pressed && { opacity: 0.9 }]} accessibilityRole="button">
      <View style={[s.articleBar, { backgroundColor: color || ITHRAA }]} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={s.rowR}>
          <Text style={[s.chip, { color: color || ITHRAA, backgroundColor: (color || ITHRAA) + "14" }]}>{item.category_label}</Text>
          {item.featured && <Text style={[s.chip, { color: ITHRAA_GOLD, backgroundColor: ITHRAA_GOLD + "1A" }]}>★ مختار</Text>}
          {item.status !== "approved" && <StatusChip status={item.status} />}
        </View>
        <Text numberOfLines={2} style={s.articleTitle}>{item.title}</Text>
        {!!item.excerpt && <Text numberOfLines={2} style={s.articleExcerpt}>{item.excerpt}</Text>}
        <View style={[s.rowR, { gap: 10 }]}>
          <Meta icon="person-outline" text={item.author_name || item.uploader_name} />
          {!!item.read_minutes && <Meta icon="time-outline" text={`${item.read_minutes} د قراءة`} />}
          <Meta icon="eye-outline" text={String(item.views)} />
        </View>
        {footer}
      </View>
    </Pressable>
  );
}

/** صف أفقي لكتاب في القوائم (مساهماتي، المراجعة، البحث) */
export function ItemRow({ item, color, onPress, footer }: { item: IthraaItem; color?: string; onPress: () => void; footer?: React.ReactNode }) {
  if (item.kind === "article") return <ArticleCard item={item} color={color} onPress={onPress} footer={footer} />;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.article, pressed && { opacity: 0.9 }]} accessibilityRole="button">
      <BookCover item={item} color={color} width={66} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={s.rowR}>
          <Text style={[s.chip, { color: color || ITHRAA, backgroundColor: (color || ITHRAA) + "14" }]}>{item.category_label}</Text>
          {item.featured && <Text style={[s.chip, { color: ITHRAA_GOLD, backgroundColor: ITHRAA_GOLD + "1A" }]}>★ مختار</Text>}
          {item.status !== "approved" && <StatusChip status={item.status} />}
        </View>
        <Text numberOfLines={2} style={s.articleTitle}>{item.title}</Text>
        {!!item.author_name && <Text numberOfLines={1} style={s.articleExcerpt}>تأليف: {item.author_name}</Text>}
        <View style={[s.rowR, { gap: 10 }]}>
          {!!item.file_format && <Meta icon="document-outline" text={item.file_format.toUpperCase()} />}
          {!!item.pages && <Meta icon="layers-outline" text={`${item.pages} صفحة`} />}
          <Meta icon="download-outline" text={String(item.downloads)} />
        </View>
        {footer}
      </View>
    </Pressable>
  );
}

export function StatusChip({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <View style={[s.statusChip, { backgroundColor: m.color + "18" }]}>
      <Ionicons name={m.icon as any} size={12} color={m.color} />
      <Text style={[s.statusText, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

export function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={[s.rowR, { gap: 3 }]}>
      <Ionicons name={icon} size={12} color={Colors.textMuted} />
      <Text style={s.meta} numberOfLines={1}>{text}</Text>
    </View>
  );
}

export function ShelfTile({ shelf, onPress, active }: { shelf: IthraaShelf; onPress: () => void; active?: boolean }) {
  const total = shelf.books + shelf.articles;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.shelf, active && { borderColor: shelf.color, backgroundColor: shelf.color + "12" }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={shelf.label}>
      <View style={[s.shelfIcon, { backgroundColor: shelf.color + "18" }]}>
        <Ionicons name={shelf.icon as any} size={20} color={shelf.color} />
      </View>
      <Text numberOfLines={2} style={s.shelfLabel}>{shelf.label}</Text>
      <Text style={s.shelfCount}>{total ? `${total} عنوان` : "جديد"}</Text>
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={[s.rowR, { justifyContent: "space-between", marginTop: 18, marginBottom: 10 }]}>
      <View style={[s.rowR, { gap: 8 }]}>
        <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: ITHRAA_GOLD }} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {!!action && <Pressable onPress={onAction} hitSlop={8}><Text style={s.sectionAction}>{action}</Text></Pressable>}
    </View>
  );
}

export function Pill({ label, on, onPress, color = ITHRAA, icon }: { label: string; on: boolean; onPress: () => void; color?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} style={[s.pill, on && { backgroundColor: color, borderColor: color }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      {!!icon && <Ionicons name={icon} size={14} color={on ? "#fff" : Colors.textSecondary} />}
      <Text style={[s.pillText, on && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ icon = "library-outline", title, sub, action, onAction }: { icon?: keyof typeof Ionicons.glyphMap; title: string; sub?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={40} color={ITHRAA + "88"} />
      <Text style={s.emptyTitle}>{title}</Text>
      {!!sub && <Text style={s.emptySub}>{sub}</Text>}
      {!!action && (
        <Pressable onPress={onAction} style={s.emptyBtn}><Text style={s.emptyBtnText}>{action}</Text></Pressable>
      )}
    </View>
  );
}

export const ithraaStyles = StyleSheet.create({
  input: {
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right",
  },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right", marginTop: 14, marginBottom: 6 },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 19 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  primaryBtn: { backgroundColor: ITHRAA, borderRadius: 14, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 8 },
  primaryText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  ghostBtn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.divider, flexDirection: "row-reverse", gap: 6, alignItems: "center", justifyContent: "center" },
  ghostText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary },
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  rowR: { flexDirection: "row-reverse", alignItems: "center" },
});

const s = StyleSheet.create({
  rowR: { flexDirection: "row-reverse", alignItems: "center", flexWrap: "wrap", gap: 6 },
  cover: { borderRadius: 8, overflow: "hidden", justifyContent: "space-between", backgroundColor: ITHRAA_DEEP,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  spine: { position: "absolute", top: 0, bottom: 0, right: 0, width: 5, backgroundColor: "rgba(0,0,0,0.18)" },
  coverTitle: { fontFamily: "Cairo_700Bold", color: "#fff", textAlign: "right", lineHeight: 20 },
  coverAuthor: { fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.8)", textAlign: "right" },
  coverBand: { height: 3, borderRadius: 2, width: "45%", alignSelf: "flex-end" },
  star: { position: "absolute", top: 6, left: 6, backgroundColor: ITHRAA_GOLD, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  tileTitle: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textPrimary, textAlign: "right", marginTop: 6, lineHeight: 18 },
  tileSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  article: { flexDirection: "row-reverse", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.divider, marginBottom: 10 },
  articleBar: { width: 4, borderRadius: 2 },
  articleTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right", lineHeight: 22 },
  articleExcerpt: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  chip: { fontFamily: "Cairo_600SemiBold", fontSize: 11, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 8, overflow: "hidden" },
  statusChip: { flexDirection: "row-reverse", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8 },
  statusText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, maxWidth: 150 },
  shelf: { width: "31%", flexGrow: 1, minWidth: 96, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: Colors.divider, alignItems: "flex-end", gap: 6 },
  shelfIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  shelfLabel: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textPrimary, textAlign: "right", lineHeight: 18, minHeight: 36 },
  shelfCount: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  sectionAction: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: ITHRAA },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  pillText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  empty: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 24, gap: 6 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "center" },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", lineHeight: 21 },
  emptyBtn: { marginTop: 8, backgroundColor: ITHRAA, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12 },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: "#fff" },
});
