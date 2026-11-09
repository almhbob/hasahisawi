// 🎨 استوديو الترويج — مساحة مدير التطبيق لصناعة بطاقة تعريفية جذابة لكل خدمة ومشاركتها.
// قوالب بهوية حصاحيصاوي (أخضر زمردي وذهبي وكريمي)، بثلاثة مقاسات، ونص قابل للتعديل ورمز QR للتحميل.
import React, { useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Image, Platform, Share, ActivityIndicator, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import SectionGlyph from "@/components/SectionGlyph";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { SECTION_GLYPHS } from "@/lib/section-glyphs";
import { PROMOS, type Promo } from "@/lib/promo-copy";
import { PLAY_URL, WEB_APP_URL } from "@/lib/invites";
import { capturePoster } from "@/lib/poster-capture";

const GREEN = "#00966A";
const DEEP = "#004D36";
const NIGHT = "#00281C";
const GOLD = "#E8A900";
const CREAM = "#F5F0E3";
const LOGO = require("@/assets/images/logo.png");
const TAGLINE = "لخدمة مواطن المنطقة وضواحيها";

type Tpl = "emerald" | "night" | "pure";
type Fmt = "post" | "square" | "story";
const TEMPLATES: [Tpl, string][] = [["emerald", "زمرّدي"], ["night", "ليلي ذهبي"], ["pure", "ناصع"]];
const FORMATS: [Fmt, string, number][] = [["post", "منشور 4:5", 1.25], ["square", "مربع", 1], ["story", "قصة 9:16", 16 / 9]];
// عرض البطاقة على الشاشة (بين 300 و380)، وتُلتقط بدقة 1080 بكسل مهما كان العرض
const cardWidth = (screen: number) => Math.max(300, Math.min(380, screen - 32));

export default function PromoStudio() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const keys = useMemo(() => Object.keys(PROMOS).filter((k) => SECTION_GLYPHS[k]), []);
  const [key, setKey] = useState(keys[0]);
  const [edits, setEdits] = useState<Record<string, Promo>>({});
  const [tpl, setTpl] = useState<Tpl>("emerald");
  const [fmt, setFmt] = useState<Fmt>("post");
  const [qr, setQr] = useState<"play" | "web">("play");
  const [busy, setBusy] = useState<"" | "img" | "txt">("");
  const [note, setNote] = useState("");
  const cardRef = useRef<View>(null);

  if (user?.role !== "admin") {
    return (
      <View style={[st.locked, { paddingTop: insets.top + 40 }]}>
        <Ionicons name="lock-closed-outline" size={42} color={Colors.textMuted} />
        <Text style={st.lockedT}>استوديو الترويج لمدير التطبيق فقط</Text>
        <Pressable onPress={() => router.back()} style={st.lockedBtn}><Text style={st.lockedBtnT}>رجوع</Text></Pressable>
      </View>
    );
  }

  const promo: Promo = edits[key] ?? PROMOS[key];
  const setField = (patch: Partial<Promo>) => setEdits((e) => ({ ...e, [key]: { ...promo, ...patch } }));
  const setPerk = (i: number, v: string) => { const p = [...promo.perks] as Promo["perks"]; p[i] = v; setField({ perks: p }); };
  const ratio = FORMATS.find((f) => f[0] === fmt)![2];
  const link = qr === "play" ? PLAY_URL : WEB_APP_URL;
  const W = cardWidth(width);

  const caption = [
    `${promo.title} — ${promo.hook}`,
    promo.desc,
    ...promo.perks.filter(Boolean).map((p) => `✔️ ${p}`),
    `حمّل تطبيق حصاحيصاوي: ${link}`,
    ["حصاحيصاوي", "الحصاحيصا", ...promo.tags].map((t) => `#${t}`).join(" "),
  ].join("\n");

  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(""), 3500); };

  const shareImage = async () => {
    setBusy("img");
    try {
      const outH = Math.round(1080 * ratio);
      if (Platform.OS === "web") {
        const { blob } = await capturePoster(cardRef as any, 1080);
        const file = new File([blob!], `hasahisawi-${key}.png`, { type: "image/png" });
        const nav: any = typeof navigator !== "undefined" ? navigator : null;
        if (nav?.canShare?.({ files: [file] })) await nav.share({ files: [file], text: caption });
        else {
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob!); a.download = file.name;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          flash("حُفظت الصورة — انسخ النص المرافق وانشرها");
        }
      } else {
        const { uri } = await capturePoster(cardRef as any, 1080, outH);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: `ترويج ${promo.title}` });
        else await Share.share({ url: uri, message: caption });
      }
    } catch (e: any) {
      if (!/cancel|abort/i.test(String(e?.message || ""))) flash("تعذّر تجهيز الصورة، حاول مرة أخرى");
    } finally { setBusy(""); }
  };

  const shareText = async () => {
    setBusy("txt");
    try {
      const nav: any = typeof navigator !== "undefined" ? navigator : null;
      if (Platform.OS === "web" && nav?.clipboard?.writeText) { await nav.clipboard.writeText(caption); flash("نُسخ النص المرافق"); }
      else await Share.share({ message: caption });
    } catch { /* أُلغي */ } finally { setBusy(""); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <LinearGradient colors={[GREEN, DEEP]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[st.head, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} style={st.round} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.headT}>استوديو الترويج</Text>
          <Text style={st.headS}>بطاقة تعريفية لكل خدمة — جاهزة للنشر</Text>
        </View>
        <MaterialCommunityIcons name="palette-swatch-variant" size={26} color={GOLD} />
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {/* اختيار الخدمة */}
        <Text style={st.lbl}>الخدمة</Text>
        <RtlScrollRow contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {keys.map((k) => (
            <Pressable key={k} onPress={() => setKey(k)} style={[st.svc, key === k && st.svcOn]} accessibilityRole="tab" accessibilityState={{ selected: key === k }}>
              <SectionGlyph id={k} size={22} color={key === k ? "#fff" : DEEP} accent={GOLD} />
              <Text style={[st.svcT, key === k && { color: "#fff" }]} numberOfLines={1}>{PROMOS[k].title}</Text>
            </Pressable>
          ))}
        </RtlScrollRow>

        {/* القالب والمقاس */}
        <View style={st.rowOpts}>
          <Seg value={tpl} onChange={setTpl} items={TEMPLATES} />
          <Seg value={fmt} onChange={setFmt} items={FORMATS.map(([k, l]) => [k, l] as [Fmt, string])} />
        </View>

        {/* المعاينة */}
        <View style={{ alignItems: "center", marginTop: 6 }}>
          <View style={{ borderRadius: 18, overflow: "hidden", ...shadow }}>
            <View ref={cardRef} collapsable={false} style={{ width: W, height: Math.round(W * ratio) }}>
              <PromoCard id={key} p={promo} tpl={tpl} ratio={ratio} link={link} W={W} />
            </View>
          </View>
        </View>

        {/* المشاركة */}
        <View style={st.actions}>
          <Pressable onPress={shareImage} disabled={!!busy} style={[st.primary, busy === "img" && { opacity: 0.7 }]} accessibilityRole="button">
            {busy === "img" ? <ActivityIndicator color="#fff" /> : <Ionicons name="share-social" size={18} color="#fff" />}
            <Text style={st.primaryT}>{Platform.OS === "web" ? "حفظ/مشاركة الصورة" : "مشاركة الصورة"}</Text>
          </Pressable>
          <Pressable onPress={shareText} disabled={!!busy} style={st.secondary} accessibilityRole="button">
            <Ionicons name="document-text-outline" size={17} color={DEEP} />
            <Text style={st.secondaryT}>{Platform.OS === "web" ? "نسخ النص" : "مشاركة النص"}</Text>
          </Pressable>
        </View>
        {note ? <Text style={st.note}>{note}</Text> : null}

        {/* تحرير النص */}
        <View style={st.editor}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={st.edT}>نص البطاقة</Text>
            {edits[key] ? <Pressable onPress={() => setEdits((e) => { const n = { ...e }; delete n[key]; return n; })}><Text style={st.reset}>استعادة النص الأصلي</Text></Pressable> : null}
          </View>
          <Field label="العبارة الجاذبة" value={promo.hook} onChange={(v) => setField({ hook: v })} max={40} />
          <Field label="اسم الخدمة" value={promo.title} onChange={(v) => setField({ title: v })} max={36} />
          <Field label="النبذة" value={promo.desc} onChange={(v) => setField({ desc: v })} max={160} multiline />
          {promo.perks.map((pk, i) => <Field key={i} label={`ميزة ${i + 1}`} value={pk} onChange={(v) => setPerk(i, v)} max={34} />)}
          <Text style={st.fl}>رمز QR يفتح</Text>
          <Seg value={qr} onChange={setQr} items={[["play", "Google Play"], ["web", "نسخة الويب"]]} />
        </View>
      </ScrollView>
    </View>
  );
}

/* ─────────────── البطاقة ─────────────── */
function PromoCard({ id, p, tpl, ratio, link, W }: { id: string; p: Promo; tpl: Tpl; ratio: number; link: string; W: number }) {
  const H = W * ratio;
  const tall = ratio > 1.5, compact = ratio <= 1.01;
  const dark = tpl !== "pure";
  const ink = tpl === "emerald" ? "#fff" : tpl === "night" ? "#fff" : DEEP;
  const sub = tpl === "pure" ? "#3F5C52" : "rgba(255,255,255,0.86)";
  const bg = tpl === "emerald" ? CREAM : tpl === "night" ? NIGHT : "#FFFFFF";

  const header = (
    <View style={c.top}>
      <View style={c.brand}>
        <View style={c.logoBox}><Image source={LOGO} style={{ width: 26, height: 26 }} resizeMode="contain" /></View>
        <View>
          <Text style={[c.brandN, { color: tpl === "emerald" ? DEEP : ink }]}>حصاحيصاوي</Text>
          <Text style={[c.brandS, { color: tpl === "emerald" ? "#7A6A3A" : tpl === "night" ? GOLD : "#7A6A3A" }]}>{TAGLINE}</Text>
        </View>
      </View>
      <View style={[c.kicker, { backgroundColor: tpl === "pure" ? GOLD + "26" : GOLD }]}>
        <Text style={[c.kickerT, { color: tpl === "pure" ? "#6B5200" : "#2E2200" }]}>خدمة من خدماتنا</Text>
      </View>
    </View>
  );

  const body = (
    <View style={{ gap: tall ? 14 : compact ? 7 : 10 }}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
        <View style={[c.glyphTile, { width: tall ? 84 : compact ? 50 : 70, height: tall ? 84 : compact ? 50 : 70, backgroundColor: tpl === "pure" ? GREEN + "14" : "rgba(255,255,255,0.1)", borderColor: GOLD }]}>
          <SectionGlyph id={id} size={tall ? 48 : compact ? 28 : 40} color={tpl === "pure" ? DEEP : "#fff"} accent={GOLD} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[c.hook, { color: GOLD, fontSize: compact ? 11.5 : 12.5 }]}>{p.hook}</Text>
          <Text style={[c.title, { color: ink, fontSize: tall ? 27 : compact ? 19 : 23, lineHeight: compact ? 28 : 34 }]} numberOfLines={compact ? 1 : 2}>{p.title}</Text>
        </View>
      </View>
      <Text style={[c.desc, { color: sub, fontSize: compact ? 11.5 : 13.2, lineHeight: compact ? 18.5 : 22.5 }]} numberOfLines={compact ? 2 : 4}>{p.desc}</Text>
      <View style={{ gap: compact ? 3 : 7 }}>
        {p.perks.filter(Boolean).map((pk) => (
          <View key={pk} style={c.perk}>
            <View style={[c.check, { backgroundColor: GOLD }]}><Ionicons name="checkmark" size={11} color="#2E2200" /></View>
            <Text style={[c.perkT, { color: ink, fontSize: compact ? 11.5 : 13 }]} numberOfLines={1}>{pk}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  // في القصة: شريط بخدمات أخرى من التطبيق (العدد الحقيقي للأقسام)
  const others = Object.keys(SECTION_GLYPHS).filter((k) => k !== id);
  const more = tall ? (
    <View style={[c.more, { backgroundColor: tpl === "pure" ? GREEN + "10" : tpl === "emerald" ? "#fff" : "rgba(255,255,255,0.07)", borderColor: tpl === "night" ? "rgba(232,169,0,0.3)" : tpl === "emerald" ? "#E6DDC4" : "transparent" }]}>
      <View style={{ flexDirection: "row-reverse", justifyContent: "center", gap: 8 }}>
        {others.slice(0, 6).map((k) => (
          <View key={k} style={[c.moreIco, { backgroundColor: tpl === "night" ? "rgba(255,255,255,0.08)" : GREEN + "12" }]}>
            <SectionGlyph id={k} size={20} color={tpl === "night" ? "#fff" : DEEP} accent={GOLD} />
          </View>
        ))}
      </View>
      <Text style={[c.moreT, { color: tpl === "night" ? "#fff" : DEEP }]}>و{others.length.toLocaleString("ar-EG")} خدمة أخرى في تطبيق واحد</Text>
    </View>
  ) : null;

  const footer = (
    <View style={[c.foot, compact && { padding: 7, gap: 8 }, { backgroundColor: tpl === "pure" ? DEEP : tpl === "night" ? "rgba(255,255,255,0.06)" : "transparent", borderColor: tpl === "night" ? "rgba(232,169,0,0.35)" : "transparent" }]}>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[c.cta, { backgroundColor: tpl === "emerald" ? DEEP : GOLD }]}>
          <Ionicons name="download-outline" size={14} color={tpl === "emerald" ? "#fff" : "#2E2200"} />
          <Text style={[c.ctaT, { color: tpl === "emerald" ? "#fff" : "#2E2200" }]}>حمّل حصاحيصاوي الآن</Text>
        </View>
        <Text style={[c.store, { color: tpl === "emerald" ? "#5B6B60" : "rgba(255,255,255,0.8)" }]}>{link.includes("play.google") ? "متاح على Google Play" : "hasahisawi.pages.dev"}</Text>
      </View>
      <View style={c.qr}><QRCode value={link} size={compact ? 44 : 60} color={DEEP} backgroundColor="#fff" /></View>
    </View>
  );

  if (tpl === "emerald") {
    return (
      <View style={{ flex: 1, backgroundColor: bg, padding: compact ? 14 : 18, gap: compact ? 8 : 14 }}>
        <NileWaves W={W} color={GREEN} opacity={0.12} style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} />
        <Svg width={140} height={140} style={{ position: "absolute", top: -40, left: -40 }}><Circle cx={70} cy={70} r={60} stroke={GOLD} strokeOpacity={0.5} strokeWidth={10} fill="none" /></Svg>
        {header}
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View style={[c.panel, { backgroundColor: DEEP, padding: tall ? 20 : compact ? 12 : 16 }]}>
            <View style={c.panelNotch} />
            {body}
          </View>
        </View>
        {more}
        {footer}
      </View>
    );
  }
  if (tpl === "night") {
    return (
      <LinearGradient colors={["#005A3F", NIGHT]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1, padding: compact ? 14 : 18, gap: compact ? 8 : 14 }}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill as any}>
          <Circle cx={W * 0.18} cy={H * 0.3} r={W * 0.42} fill={GOLD} fillOpacity={0.08} />
          <Circle cx={W * 0.18} cy={H * 0.3} r={W * 0.26} fill={GOLD} fillOpacity={0.07} />
        </Svg>
        <NileWaves W={W} color={GOLD} opacity={0.14} style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} />
        {header}
        <View style={{ flex: 1, justifyContent: "center" }}>{body}</View>
        {more}
        {footer}
      </LinearGradient>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <LinearGradient colors={[GREEN, DEEP]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={{ height: tall ? 150 : compact ? 84 : 110, padding: compact ? 14 : 18 }}>
        <View style={{ opacity: 1 }}>{headerLight()}</View>
      </LinearGradient>
      <View style={{ flex: 1, paddingHorizontal: compact ? 14 : 18, paddingTop: 0, paddingBottom: compact ? 8 : 12, marginTop: tall ? -40 : compact ? -22 : -30 }}>
        <View style={[c.panel, { backgroundColor: "#fff", padding: tall ? 20 : compact ? 12 : 16, borderWidth: 1, borderColor: "#E7ECE9", flex: 1, justifyContent: "center", overflow: "hidden" }]}>{body}</View>
      </View>
      <View style={{ paddingHorizontal: compact ? 14 : 18, paddingBottom: compact ? 14 : 18, gap: 12 }}>{more}{footer}</View>
    </View>
  );

  function headerLight() {
    return (
      <View style={c.top}>
        <View style={c.brand}>
          <View style={c.logoBox}><Image source={LOGO} style={{ width: 26, height: 26 }} resizeMode="contain" /></View>
          <View>
            <Text style={[c.brandN, { color: "#fff" }]}>حصاحيصاوي</Text>
            <Text style={[c.brandS, { color: "#F3D27A" }]}>{TAGLINE}</Text>
          </View>
        </View>
        <View style={[c.kicker, { backgroundColor: GOLD }]}><Text style={[c.kickerT, { color: "#2E2200" }]}>خدمة من خدماتنا</Text></View>
      </View>
    );
  }
}

/** موجات النيل — زخرفة خاصة بالحصاحيصا مدينة النيل */
function NileWaves({ color, opacity, style, W }: { color: string; opacity: number; style?: any; W: number }) {
  return (
    <Svg width={W} height={90} viewBox="0 0 360 90" preserveAspectRatio="none" style={style} pointerEvents="none">
      {[0, 16, 32].map((dy, i) => (
        <Path key={i} d={`M0 ${40 + dy} C 60 ${20 + dy}, 120 ${60 + dy}, 180 ${40 + dy} S 300 ${20 + dy}, 360 ${40 + dy}`} stroke={color} strokeOpacity={opacity * (1 - i * 0.25) * 4} strokeWidth={3} fill="none" />
      ))}
    </Svg>
  );
}

/* ─────────────── عناصر التحرير ─────────────── */
function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <View style={st.seg}>
      {items.map(([k, l]) => (
        <Pressable key={k} onPress={() => onChange(k)} style={[st.segB, value === k && st.segOn]} accessibilityRole="tab" accessibilityState={{ selected: value === k }}>
          <Text style={[st.segT, value === k && { color: "#fff" }]}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Field({ label, value, onChange, max, multiline }: { label: string; value: string; onChange: (v: string) => void; max: number; multiline?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
        <Text style={st.fl}>{label}</Text>
        <Text style={[st.count, value.length > max * 0.9 && { color: "#8A6A00" }]}>{value.length}/{max}</Text>
      </View>
      <TextInput value={value} onChangeText={(v) => onChange(v.slice(0, max))} multiline={multiline} style={[st.input, multiline && { minHeight: 70, textAlignVertical: "top" }]} textAlign="right" placeholderTextColor={Colors.textMuted} />
    </View>
  );
}

const shadow = Platform.select({ web: { boxShadow: "0 10px 30px rgba(0,77,54,0.18)" } as any, default: { elevation: 6, shadowColor: "#004D36", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } } });

const c = StyleSheet.create({
  top: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  logoBox: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  brandN: { fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right", lineHeight: 20 },
  brandS: { fontFamily: "Cairo_600SemiBold", fontSize: 9.5, textAlign: "right", lineHeight: 14 },
  kicker: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  kickerT: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  panel: { borderRadius: 26 },
  panelNotch: { position: "absolute", top: 18, left: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: CREAM },
  glyphTile: { borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  hook: { fontFamily: "Cairo_700Bold", fontSize: 12.5, textAlign: "right" },
  title: { fontFamily: "Cairo_700Bold", textAlign: "right", lineHeight: 34 },
  desc: { fontFamily: "Cairo_500Medium", textAlign: "right" },
  perk: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  check: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  perkT: { flex: 1, fontFamily: "Cairo_700Bold", textAlign: "right" },
  foot: { flexDirection: "row-reverse", alignItems: "center", gap: 12, borderRadius: 18, borderWidth: 1, padding: 10 },
  cta: { flexDirection: "row-reverse", alignItems: "center", alignSelf: "flex-end", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  ctaT: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
  store: { fontFamily: "Cairo_600SemiBold", fontSize: 10.5, textAlign: "right" },
  qr: { backgroundColor: "#fff", padding: 5, borderRadius: 10 },
  more: { borderRadius: 18, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 10, gap: 8, alignItems: "center" },
  moreIco: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  moreT: { fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "center" },
});

const st = StyleSheet.create({
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  round: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  headT: { fontFamily: "Cairo_700Bold", fontSize: 19, color: "#fff", textAlign: "right" },
  headS: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "rgba(255,255,255,0.88)", textAlign: "right" },
  lbl: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingHorizontal: 16, marginTop: 14, marginBottom: 8 },
  svc: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, maxWidth: 190 },
  svcOn: { backgroundColor: DEEP, borderColor: DEEP },
  svcT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: DEEP },
  rowOpts: { gap: 8, paddingHorizontal: 16, marginVertical: 12 },
  seg: { flexDirection: "row-reverse", gap: 4, padding: 4, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider },
  segB: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10 },
  segOn: { backgroundColor: DEEP },
  segT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: DEEP },
  actions: { flexDirection: "row-reverse", gap: 10, paddingHorizontal: 16, marginTop: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
  primary: { flex: 1.4, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 16, backgroundColor: DEEP },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#fff" },
  secondary: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 50, borderRadius: 16, backgroundColor: GOLD + "26", borderWidth: 1, borderColor: GOLD + "70" },
  secondaryT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: DEEP },
  note: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: GREEN, textAlign: "center", marginTop: 8 },
  editor: { margin: 16, padding: 14, gap: 10, backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, maxWidth: 560, width: "92%", alignSelf: "center" },
  edT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  reset: { fontFamily: "Cairo_700Bold", fontSize: 12, color: GREEN },
  fl: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  count: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted },
  input: { backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 9, fontFamily: "Cairo_500Medium", fontSize: 13.5, color: Colors.textPrimary },
  locked: { flex: 1, alignItems: "center", gap: 12, backgroundColor: Colors.bg },
  lockedT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  lockedBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 14, backgroundColor: DEEP },
  lockedBtnT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
});
