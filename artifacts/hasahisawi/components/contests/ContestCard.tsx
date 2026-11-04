// بطاقة مسابقة في القائمة: غلاف (صورة أو تدرج المناسبة)، الحالة والتصنيف، الجائزة، الوقت، والمشاركون.
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import ViewCount from "@/components/ViewCount";
import { themeOf, shortWhen, qCount, elapsedRatio, prizeTiers, type Contest } from "@/lib/contests";
import { AvatarStack, CategoryChip, SponsorChip, StatusPill, TimeBar } from "./ContestUI";

export default function ContestCard({ c, now, onPress }: { c: Contest; now: number; onPress: () => void }) {
  const t = themeOf(c);
  const tiers = prizeTiers(c);
  const winners = c.top_winners ?? [];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.wrap, pressed && { transform: [{ scale: 0.985 }], opacity: 0.95 }]}
      accessibilityRole="button"
      accessibilityLabel={`${c.title}، ${c.state === "active" ? "جارية" : c.state === "upcoming" ? "قادمة" : "منتهية"}`}
    >
      <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {c.cover_image ? (
        <>
          <Image source={{ uri: c.cover_image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
          {/* تظليل يضمن قراءة النص الأبيض فوق أي صورة */}
          <LinearGradient colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0.82)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        </>
      ) : (
        <>
          <View style={[s.ring, { borderColor: t.accent, width: 200, height: 200, top: -70, left: -60 }]} />
          <Ionicons name={t.icon as any} size={120} color={t.accent} style={s.bgIcon} />
        </>
      )}

      <View style={s.body}>
        <View style={s.chips}>
          <StatusPill state={c.state} />
          <CategoryChip category={c.category} onDark />
          <View style={s.typeChip}>
            <Ionicons name={c.type === "quiz" ? "help-circle-outline" : "images-outline"} size={13} color="#FFFFFF" />
            <Text style={s.typeText}>{c.type === "quiz" ? (c.questions_count ? qCount(c.questions_count) : "أسئلة") : "مشاركة"}</Text>
          </View>
          {c.featured ? (
            <View style={[s.typeChip, { backgroundColor: t.accent, borderColor: t.accent }]}>
              <Ionicons name="flash" size={12} color="#1F1300" />
              <Text style={[s.typeText, { color: "#1F1300" }]}>مميّزة</Text>
            </View>
          ) : null}
        </View>

        <Text style={s.title} numberOfLines={2}>{c.title}</Text>

        {c.sponsor_name ? <SponsorChip name={c.sponsor_name} logo={c.sponsor_logo} onDark /> : !c.cover_image ? (
          <Text style={[s.kind, { color: t.accent }]} numberOfLines={1}>{t.label}</Text>
        ) : null}

        {tiers.length > 0 && (
          <View style={[s.prize, { backgroundColor: t.accent }]}>
            <Ionicons name="gift" size={14} color="#1F1300" />
            <Text style={s.prizeText} numberOfLines={1}>{tiers[0]}</Text>
            {tiers.length > 1 ? <Text style={s.prizeMore}>{tiers.length === 2 ? "+ جائزة أخرى" : `+${tiers.length - 1} جوائز`}</Text> : null}
          </View>
        )}

        {c.state === "ended" && winners.length > 0 ? (
          <View style={s.winners}>
            <Ionicons name="trophy" size={15} color={t.accent} />
            <Text style={s.winnersText} numberOfLines={1}>{winners.map((w) => w.name).join("، ")}</Text>
          </View>
        ) : c.state === "ended" ? (
          <Text style={s.meta}>بانتظار إعلان الفائزين</Text>
        ) : (
          <View style={{ gap: 6 }}>
            <View style={s.row}>
              <Ionicons name="time-outline" size={14} color="#FFFFFF" />
              <Text style={s.meta}>{shortWhen(c, now)}</Text>
            </View>
            {c.state === "active" ? <TimeBar ratio={elapsedRatio(c, now)} onDark color={t.accent} /> : null}
          </View>
        )}

        <View style={[s.row, { justifyContent: "space-between" }]}>
          <AvatarStack people={c.participants ?? []} total={c.entries_count} onDark size={26} />
          <View style={[s.row, { gap: 10 }]}>
            {c.entered ? (
              <View style={s.joined}><Ionicons name="checkmark-circle" size={14} color="#14532D" /><Text style={s.joinedText}>شاركت</Text></View>
            ) : null}
            <ViewCount kind="contest" id={String(c.id)} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 24, overflow: "hidden", minHeight: 210 },
  ring: { position: "absolute", borderRadius: 999, borderWidth: 18, opacity: 0.1 },
  bgIcon: { position: "absolute", left: 12, bottom: 8, opacity: 0.12 },
  body: { padding: 16, gap: 10 },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  typeChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, minHeight: 26, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.30)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  typeText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#FFFFFF" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, lineHeight: 32, color: "#FFFFFF", textAlign: "right" },
  kind: { fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "right" },
  prize: { flexDirection: "row-reverse", alignItems: "center", gap: 6, alignSelf: "flex-end", paddingHorizontal: 12, minHeight: 30, borderRadius: 999, maxWidth: "100%" },
  prizeText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#1F1300", flexShrink: 1, textAlign: "right" },
  prizeMore: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#3B2A00" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  meta: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#FFFFFF", textAlign: "right" },
  winners: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 32, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.28)" },
  winnersText: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: "#FFFFFF", textAlign: "right" },
  joined: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, minHeight: 24, borderRadius: 999, backgroundColor: "#DCFCE7" },
  joinedText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#14532D" },
});
