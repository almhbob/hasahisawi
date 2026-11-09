// دعوة الانضمام لديوان الكُتّاب: خطابات جاهزة لكل جمهور — الأفراد، المؤسسات الأدبية، النقابات، اتحادات الإعلام والصحافة —
// مع رابط إحالة باسم الداعي، ومشاركة عبر واتساب أو أي تطبيق، أو نسخ الخطاب.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Share, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, copyText } from "@/lib/xplatform";
import { membersApi } from "@/lib/lit-members";
import { WINE, GOLD, INK } from "@/lib/lit";
import { ithraaStyles as u } from "@/components/ithraa/ui";

const WEB = "https://almhbob.github.io/hasahisawi";
type Aud = "individual" | "institution" | "union" | "media";
const AUD: { key: Aud; label: string; sub: string; icon: string; color: string }[] = [
  { key: "individual", label: "الأفراد", sub: "كاتب، شاعر، قاص، صديق مبدع", icon: "person", color: "#7A2E3A" },
  { key: "institution", label: "المؤسسات الأدبية", sub: "منتديات، روابط، صالونات، دور نشر", icon: "library", color: "#1B4D6B" },
  { key: "union", label: "النقابات والاتحادات", sub: "اتحاد الكتّاب، النقابات المهنية", icon: "people", color: "#1F5F4A" },
  { key: "media", label: "الإعلام والصحافة", sub: "نقابة الصحفيين، اتحادات الإعلام، الصحف", icon: "newspaper", color: "#111827" },
];

function letter(aud: Aud, name: string, link: string): string {
  const sig = `\n\nمع التقدير،\n${name}\nعضو ديوان الكُتّاب — منصة حصاحيصاوي`;
  switch (aud) {
    case "individual":
      return `مرحباً 🌿\nأدعوك للانضمام إلى «ديوان الكُتّاب» على تطبيق حصاحيصاوي: مساحة لأبناء الحصاحيصا والجزيرة لنشر القصة والشعر والخاطرة.\n\n✒️ كل نص تكتبه يُوثَّق برقم خاص يحفظ حقك وأسبقيتك\n🪪 بطاقة عضوية احترافية بحسب فئتك\n🏆 مسابقة حصاحيصاوي الأدبية وجوائز وأوسمة\n\nانضم من هنا: ${link}${sig}`;
    case "institution":
      return `السادة/ إدارة المؤسسة الأدبية الموقّرة\nالسلام عليكم ورحمة الله وبركاته،\n\nيسرّنا دعوتكم وأعضاءكم للانضمام إلى «ديوان الكُتّاب» في تطبيق حصاحيصاوي، وهو منصة رقمية لنشر الإبداع الأدبي وتوثيقه، تتيح:\n• توثيق النصوص برقم وبصمة رقمية وشهادة قابلة للتحقق العلني.\n• عضوية احترافية للكتّاب ببطاقة عصرية تتجدد سنوياً.\n• تنظيم المسابقات الأدبية بلجان تحكيم سرية.\n• فحص الأصالة ورفض النصوص المنقولة والمولّدة آلياً.\n\nنرحب بالتعاون في الأمسيات والإصدارات والمسابقات المشتركة.\nرابط الانضمام: ${link}${sig}`;
    case "union":
      return `السادة/ المكتب التنفيذي الموقّر\nالسلام عليكم ورحمة الله وبركاته،\n\nإيماناً بدوركم في رعاية المبدعين وحماية حقوقهم، ندعوكم لتعريف أعضائكم بـ«ديوان الكُتّاب» في تطبيق حصاحيصاوي، حيث يحصل كل عضو على:\n• بطاقة عضوية احترافية برقم ورمز تحقق.\n• توثيق رقمي لأعماله يثبت أسبقيتها.\n• فرص النشر والمشاركة في مسابقة حصاحيصاوي الأدبية.\n\nكما نرحب ببحث شراكة تتيح اعتماد عضوياتكم داخل المنصة.\nرابط الانضمام: ${link}${sig}`;
    case "media":
      return `السادة/ الأمانة العامة ومكتب الإعلام الموقّر\nالسلام عليكم ورحمة الله وبركاته،\n\nيسعدنا دعوة الصحفيين والإعلاميين للانضمام إلى «ديوان الكُتّاب» عبر العضوية الصحفية الخاصة في تطبيق حصاحيصاوي:\n• بطاقة عضوية صحفية رقمية برمز تحقق علني.\n• إدراج في دليل الإعلاميين المعتمد بالمنطقة.\n• توثيق المقالات والتقارير برقم وبصمة رقمية.\n• منبر لنشر الكتابات والمقالات للجمهور المحلي.\n\nونرحب ببحث آليات التوأمة والتكامل بما يخدم الصحافة والمجتمع.\nرابط الانضمام: ${link}${sig}`;
  }
}

export default function InviteScreen() {
  const insets = useSafeAreaInsets();
  const { token, user, isGuest } = useAuth();
  const [aud, setAud] = useState<Aud>("individual");
  const [stats, setStats] = useState<{ sent: number; joined: number } | null>(null);
  const uid = (user as any)?.id;
  const name = (user as any)?.name || "عضو الديوان";
  const link = `${WEB}/writers-membership?${uid ? `ref=${uid}&` : ""}aud=${aud}`;
  const text = useMemo(() => letter(aud, name, link), [aud, name, link]);
  const a = AUD.find((x) => x.key === aud)!;

  useEffect(() => { if (token && !isGuest) membersApi.me(token).then((m) => setStats(m.invites)).catch(() => {}); }, [token, isGuest]);
  const log = (channel: string) => { if (token && !isGuest) membersApi.logInvite(token, aud, channel).then(() => setStats((s) => (s ? { ...s, sent: s.sent + 1 } : s))).catch(() => {}); };
  const share = async () => { log("share"); await Share.share({ message: text }).catch(() => {}); };
  const whatsapp = async () => { log("whatsapp"); await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => notify("تعذّر", "واتساب غير متاح")); };
  const copy = async () => { log("copy"); if ((await copyText(text)) === "copied") notify("نُسخ الخطاب", "الصقه في رسالة أو بريد رسمي"); };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={["#1E0F0C", WINE]} style={[st.hero, { paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/writers-membership" as any))} style={st.iconBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
          <Text style={st.title}>ادعُ للانضمام</Text>
          <Text style={st.sub}>خطابات دعوة جاهزة وأنيقة للأفراد والمؤسسات الأدبية والنقابات واتحادات الإعلام والصحافة — برابط يُنسب إليك.</Text>
          {stats && <View style={[u.rowR, { gap: 8, marginTop: 12 }]}><Chip n={stats.sent} l="دعوة أرسلتها" /><Chip n={stats.joined} l="انضموا بدعوتك" /></View>}
        </LinearGradient>

        <View style={{ paddingHorizontal: 16 }}>
          <View style={[u.wrap, { marginTop: 16 }]}>
            {AUD.map((x) => (
              <Pressable key={x.key} onPress={() => setAud(x.key)} style={[st.aud, aud === x.key && { borderColor: x.color, backgroundColor: x.color + "0D" }]}>
                <View style={[st.audI, { backgroundColor: x.color }]}><Ionicons name={x.icon as any} size={18} color="#fff" /></View>
                <Text style={st.audT}>{x.label}</Text>
                <Text style={st.audS}>{x.sub}</Text>
              </Pressable>
            ))}
          </View>

          <View style={st.paper}>
            <View style={[st.paperHead, { borderBottomColor: a.color }]}>
              <Ionicons name="mail-open" size={18} color={a.color} />
              <Text style={[st.paperT, { color: a.color }]}>خطاب الدعوة · {a.label}</Text>
            </View>
            <Text style={st.letter} selectable>{text}</Text>
            <View style={[u.rowR, { gap: 12, marginTop: 12, alignItems: "center" }]}>
              <View style={st.qr}><QRCode value={link} size={84} color={INK} backgroundColor="#fff" /></View>
              <Text style={[u.hint, { flex: 1 }]}>رمز QR لرابط الانضمام — مناسب للطباعة على الخطابات الرسمية والملصقات في الأمسيات.</Text>
            </View>
          </View>

          <View style={{ gap: 8, marginTop: 14 }}>
            <Pressable onPress={whatsapp} style={[u.primaryBtn, { backgroundColor: "#128C7E" }]}><Ionicons name="logo-whatsapp" size={19} color="#fff" /><Text style={u.primaryText}>إرسال عبر واتساب</Text></Pressable>
            <View style={[u.rowR, { gap: 8 }]}>
              <Pressable onPress={share} style={[u.primaryBtn, { flex: 1, backgroundColor: a.color }]}><Ionicons name="share-social" size={18} color="#fff" /><Text style={u.primaryText}>مشاركة</Text></Pressable>
              <Pressable onPress={copy} style={[u.ghostBtn, { flex: 1 }]}><Ionicons name="copy-outline" size={17} color={INK} /><Text style={u.ghostText}>نسخ الخطاب</Text></Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Chip({ n, l }: { n: number; l: string }) {
  return <View style={st.chip}><Text style={st.chipN}>{n}</Text><Text style={st.chipL}>{l}</Text></View>;
}

const st = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 20, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 26, color: "#fff", textAlign: "right", marginTop: 8 },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)", textAlign: "right", lineHeight: 22 },
  chip: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingVertical: 8, alignItems: "center" },
  chipN: { fontFamily: "Cairo_700Bold", fontSize: 18, color: GOLD },
  chipL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  aud: { width: "48%", flexGrow: 1, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg, padding: 12, alignItems: "flex-end", gap: 4 },
  audI: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  audT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary },
  audS: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  paper: { marginTop: 16, backgroundColor: "#FFFDF8", borderRadius: 16, borderWidth: 1, borderColor: "#EFE5D2", padding: 16 },
  paperHead: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingBottom: 8, borderBottomWidth: 2, marginBottom: 10 },
  paperT: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  letter: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: INK, textAlign: "right", lineHeight: 24 },
  qr: { padding: 6, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#EFE5D2" },
});
