import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Linking, Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeInUp, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const { width: SW } = Dimensions.get("window");

// ── Brand ────────────────────────────────────────────────────────────────────
const GOLD     = "#EAB308";
const GREEN    = "#22C55E";
const GOLD_DIM = "#CA8A04";
const DARK_BG  = "#040C07";

// ── Contact ──────────────────────────────────────────────────────────────────
const CONTACT = [
  { icon: "logo-whatsapp", color: "#25D366", label: "واتساب",   url: "https://wa.me/966597083352",                   value: "+966 59 708 3352" },
  { icon: "mail-outline",  color: "#EA4335", label: "البريد",   url: "mailto:Hasahisawi@hotmail.com",                value: "Hasahisawi@hotmail.com" },
  { icon: "ribbon-outline",color: "#FF6900", label: "Credly",   url: "https://www.credly.com/users/asim-abdulrahman", value: "credly.com/users/asim-abdulrahman" },
];

// ── Skills ───────────────────────────────────────────────────────────────────
const SKILLS = [
  { label: "تحليل البيانات",    icon: "analytics-outline",      color: "#4285F4", level: 92 },
  { label: "الأمن السيبراني",   icon: "shield-checkmark-outline",color: "#EF4444", level: 88 },
  { label: "Cloud & DevOps",    icon: "cloud-outline",           color: "#0071C5", level: 85 },
  { label: "تطوير التطبيقات",   icon: "phone-portrait-outline",  color: GREEN,     level: 95 },
  { label: "ذكاء اصطناعي",      icon: "hardware-chip-outline",   color: "#06B6D4", level: 82 },
  { label: "UI/UX Design",      icon: "color-palette-outline",   color: GOLD,      level: 90 },
  { label: "إدارة المشاريع",    icon: "briefcase-outline",       color: "#10B981", level: 87 },
  { label: "تطوير المجتمع",     icon: "people-outline",          color: "#8B5CF6", level: 93 },
];

// ── Certifications ───────────────────────────────────────────────────────────
const CERTS = [
  { title: "Google Data Analytics Professional",      issuer: "Google / Coursera",            date: "أبريل 2026",   icon: "stats-chart-outline",       color: "#4285F4" },
  { title: "Google Advanced Data Analytics",          issuer: "Google / Coursera",            date: "يناير 2026",   icon: "analytics-outline",         color: "#34A853" },
  { title: "IBM Cybersecurity Specialist",            issuer: "IBM / Coursera",               date: "فبراير 2026",  icon: "shield-checkmark-outline",  color: "#052FAD" },
  { title: "McKinsey Forward Program",                issuer: "McKinsey & Company",           date: "يوليو 2025",   icon: "trending-up-outline",       color: "#051C2C" },
  { title: "Build an AI Agent",                       issuer: "IBM SkillsBuild",              date: "سبتمبر 2025",  icon: "hardware-chip-outline",     color: "#0F62FE" },
  { title: "Enterprise Design Thinking Practitioner", issuer: "IBM SkillsBuild",              date: "سبتمبر 2025",  icon: "bulb-outline",              color: "#8E44AD" },
  { title: "UI/UX Design Capstone Project",           issuer: "IBM / Coursera",               date: "ديسمبر 2025",  icon: "color-palette-outline",     color: "#FF6900" },
  { title: "Cloud Security",                          issuer: "Intel",                        date: "أبريل 2025",   icon: "shield-outline",            color: "#0071C5" },
  { title: "Cloud DevOps",                            issuer: "Intel",                        date: "مارس 2025",    icon: "cloud-outline",             color: "#0071C5" },
  { title: "AI for Networking",                       issuer: "Cisco",                        date: "يناير 2026",   icon: "git-network-outline",       color: "#1BA0D7" },
  { title: "Cisco Network Automation Essentials",     issuer: "Cisco",                        date: "ديسمبر 2025",  icon: "code-working-outline",      color: "#049FD9" },
  { title: "Python Essentials 1",                     issuer: "Cisco / OpenEDG",              date: "ديسمبر 2025",  icon: "logo-python",               color: "#3776AB" },
  { title: "Introduction to Design Thinking",         issuer: "Virginia Commonwealth Univ.",  date: "مارس 2025",    icon: "school-outline",            color: "#8E44AD" },
  { title: "IBM SkillsBuild Faculty",                 issuer: "IBM",                          date: "ديسمبر 2025",  icon: "ribbon-outline",            color: "#1F70C1" },
  { title: "Threat Landscape 2.0",                    issuer: "Fortinet",                     date: "يناير 2025",   icon: "warning-outline",           color: "#EE2222" },
];

// ── Issuers showcase (logos as colored badges) ───────────────────────────────
const ISSUERS = [
  { name: "Google",    color: "#4285F4" },
  { name: "IBM",       color: "#0F62FE" },
  { name: "Cisco",     color: "#1BA0D7" },
  { name: "Intel",     color: "#0071C5" },
  { name: "McKinsey",  color: "#051C2C" },
  { name: "Fortinet",  color: "#EE2222" },
  { name: "VCU",       color: "#8E44AD" },
];

function openLink(url: string) {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  Linking.openURL(url);
}

// ─── Section Header ──────────────────────────────────────────────────────────
function SecHeader({ icon, color, title, sub }: { icon: string; color: string; title: string; sub?: string }) {
  return (
    <View style={sh.wrap}>
      <LinearGradient colors={[color + "30", color + "08"]} style={sh.iconBox}>
        <Ionicons name={icon as any} size={18} color={color} />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={sh.title}>{title}</Text>
        {sub ? <Text style={sh.sub}>{sub}</Text> : null}
      </View>
      <View style={[sh.accent, { backgroundColor: color }]} />
    </View>
  );
}
const sh = StyleSheet.create({
  wrap:    { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 16 },
  iconBox: { width: 42, height: 42, borderRadius: 13, justifyContent: "center", alignItems: "center" },
  title:   { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  sub:     { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 1 },
  accent:  { width: 4, height: 36, borderRadius: 2 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DesignerScreen() {
  const insets     = useSafeAreaInsets();
  const topPad     = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad  = Platform.OS === "web" ? 34 : insets.bottom;
  const [showAllCerts, setShowAllCerts] = useState(false);
  const visibleCerts = showAllCerts ? CERTS : CERTS.slice(0, 6);

  return (
    <View style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad + 50 }}>

        {/* ══ HERO ══════════════════════════════════════════════════════════ */}
        <LinearGradient
          colors={["#071A10", "#040C07", "#030805"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[s.hero, { paddingTop: topPad + 12 }]}
        >
          {/* Decorative glow */}
          <View style={s.heroGlowGreen} pointerEvents="none" />
          <View style={s.heroGlowGold}  pointerEvents="none" />

          {/* Back */}
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <View style={s.backBtnInner}>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
            </View>
          </TouchableOpacity>

          {/* Avatar ring */}
          <Animated.View entering={FadeInUp.delay(80).springify()} style={s.avatarWrap}>
            <LinearGradient colors={[GOLD, GOLD_DIM, GREEN]} style={s.avatarRing} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={s.avatarInner}>
                <LinearGradient colors={["#0D2212", "#071810"]} style={s.avatarBg}>
                  <Text style={s.avatarInitials}>عا</Text>
                </LinearGradient>
              </View>
            </LinearGradient>
            <Animated.View entering={FadeIn.delay(400)} style={s.verifiedBadge}>
              <Ionicons name="checkmark" size={11} color="#fff" />
            </Animated.View>
          </Animated.View>

          {/* Name */}
          <Animated.View entering={FadeInUp.delay(160).springify()} style={{ alignItems: "center", gap: 4 }}>
            <Text style={s.heroName}>عاصم عبد الرحمن محمد عمر</Text>
            <Text style={s.heroLatin}>Asim Abdulrahman Mohammed Omer</Text>
          </Animated.View>

          {/* Title chip */}
          <Animated.View entering={FadeInUp.delay(220).springify()} style={s.titleChip}>
            <Ionicons name="code-slash-outline" size={14} color={GOLD} />
            <Text style={s.titleChipText}>مصمم ومطور تطبيق حصاحيصاوي</Text>
          </Animated.View>

          {/* Location */}
          <Animated.View entering={FadeInUp.delay(260).springify()} style={s.locationRow}>
            <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.45)" />
            <Text style={s.locationText}>الحصاحيصا · ولاية الجزيرة · السودان</Text>
          </Animated.View>

          {/* Stats bar */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={s.statsBar}>
            {[
              { num: "+٤٠", lbl: "شهادة دولية" },
              { num: "+١٢", lbl: "جهة معتمِدة" },
              { num: "+٩",  lbl: "تخصص تقني" },
              { num: "٢٠٢٥", lbl: "بدأ المشروع" },
            ].map((st, i, arr) => (
              <React.Fragment key={i}>
                <View style={s.statItem}>
                  <Text style={s.statNum}>{st.num}</Text>
                  <Text style={s.statLbl}>{st.lbl}</Text>
                </View>
                {i < arr.length - 1 && <View style={s.statSep} />}
              </React.Fragment>
            ))}
          </Animated.View>

          {/* Issuer badges */}
          <Animated.View entering={FadeInDown.delay(360).springify()} style={s.issuersRow}>
            {ISSUERS.map((is, i) => (
              <View key={i} style={[s.issuerBadge, { borderColor: is.color + "50", backgroundColor: is.color + "10" }]}>
                <Text style={[s.issuerText, { color: is.color }]}>{is.name}</Text>
              </View>
            ))}
          </Animated.View>
        </LinearGradient>

        {/* ══ BODY ══════════════════════════════════════════════════════════ */}
        <View style={s.body}>

          {/* ── Contact Buttons ── */}
          <Animated.View entering={FadeInDown.delay(60).springify()} style={s.contactBtns}>
            {CONTACT.map((c, i) => (
              <TouchableOpacity key={i} onPress={() => openLink(c.url)} activeOpacity={0.82}
                style={[s.contactBtn, { backgroundColor: c.color }]}>
                <Ionicons name={c.icon as any} size={18} color="#fff" />
                <Text style={s.contactBtnTxt}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>

          {/* ── Contact Details ── */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={s.glassCard}>
            {CONTACT.map((c, i) => (
              <View key={i}>
                {i > 0 && <View style={s.cardDivider} />}
                <TouchableOpacity style={s.contactRow} onPress={() => openLink(c.url)} activeOpacity={0.7}>
                  <Ionicons name="open-outline" size={13} color={Colors.textMuted} />
                  <Text style={s.contactVal} selectable>{c.value}</Text>
                  <View style={[s.contactIcon, { backgroundColor: c.color + "18" }]}>
                    <Ionicons name={c.icon as any} size={18} color={c.color} />
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </Animated.View>

          {/* ── About ── */}
          <Animated.View entering={FadeInDown.delay(140).springify()}>
            <SecHeader icon="person-circle-outline" color={GREEN} title="نبذة شخصية" sub="مهندس برمجيات | محلّل بيانات | مطوّر مجتمعي" />
            <View style={s.aboutCard}>
              <View style={s.quoteDeco}>
                <Ionicons name="quote" size={22} color={GOLD} />
              </View>
              <Text style={s.aboutLead}>
                مهندس برمجيات ومحلّل بيانات سوداني، شغوف بتسخير التقنية الحديثة لخدمة الإنسان وبناء حلول رقمية تترك أثراً حقيقياً في المجتمع.
              </Text>
              <View style={s.aboutSep} />
              <Text style={s.aboutBody}>
                أحمل أكثر من{" "}<Text style={s.hi}>أربعين شهادة دولية معتمدة</Text>{" "}من كبرى المؤسسات التقنية والأكاديمية حول العالم، من بينها{" "}
                <Text style={s.hi}>Google</Text> و<Text style={s.hi}>IBM</Text> و<Text style={s.hi}>Cisco</Text> و<Text style={s.hi}>Intel</Text> و<Text style={s.hi}>McKinsey</Text> و<Text style={s.hi}>Fortinet</Text>{" "}
                وجامعة <Text style={s.hi}>Virginia Commonwealth</Text>. تمتد خبرتي عبر تخصصات متعددة تشمل تحليل البيانات، والأمن السيبراني، والحوسبة السحابية، وذكاء الأعمال، وتطوير تطبيقات الذكاء الاصطناعي، وتصميم تجربة المستخدم.
              </Text>
              <View style={s.aboutSep} />
              <Text style={s.aboutBody}>
                من رحم هذه الرؤية وُلد{" "}<Text style={s.hi}>«حصاحيصاوي»</Text>{" "}— مشروع تقنيّ متكامل صمّمتُه وطوّرتُه بنفسي ليكون{" "}
                <Text style={s.hi}>أوّل بوّابة رقمية ذكية</Text>{" "}تخدم أبناء مدينة الحصاحيصا والقرى المجاورة.
              </Text>
              <View style={s.sig}>
                <View style={s.sigLine} />
                <Text style={s.sigName}>عاصم عبد الرحمن محمد عمر</Text>
                <Ionicons name="checkmark-circle" size={16} color={GREEN} />
              </View>
            </View>
          </Animated.View>

          {/* ── Skills ── */}
          <Animated.View entering={FadeInDown.delay(180).springify()}>
            <SecHeader icon="flash-outline" color={GOLD} title="المهارات والتخصصات" sub="مستوى الإتقان" />
            <View style={s.skillsList}>
              {SKILLS.map((sk, i) => (
                <View key={i} style={s.skillRow}>
                  <Text style={[s.skillPct, { color: sk.color }]}>{sk.level}%</Text>
                  <View style={s.skillBar}>
                    <View style={[s.skillFill, { width: `${sk.level}%` as any, backgroundColor: sk.color }]} />
                  </View>
                  <View style={[s.skillIcon, { backgroundColor: sk.color + "15" }]}>
                    <Ionicons name={sk.icon as any} size={15} color={sk.color} />
                  </View>
                  <Text style={s.skillLabel}>{sk.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ── Certifications ── */}
          <Animated.View entering={FadeInDown.delay(220).springify()}>
            <SecHeader icon="ribbon-outline" color="#FF6900" title="الشهادات الدولية" sub={`${CERTS.length} شهادة معتمدة`} />
            <View style={s.certsList}>
              {visibleCerts.map((cert, i) => (
                <View key={i} style={[s.certCard, { borderRightColor: cert.color }]}>
                  <View style={s.certBody}>
                    <Text style={s.certTitle}>{cert.title}</Text>
                    <View style={s.certMeta}>
                      <View style={s.certDateRow}>
                        <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                        <Text style={s.certDate}>{cert.date}</Text>
                      </View>
                      <View style={[s.certIssuerBadge, { backgroundColor: cert.color + "15" }]}>
                        <Text style={[s.certIssuerTxt, { color: cert.color }]}>{cert.issuer}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={[s.certIconBox, { backgroundColor: cert.color + "12" }]}>
                    <Ionicons name={cert.icon as any} size={24} color={cert.color} />
                  </View>
                </View>
              ))}
            </View>
            {!showAllCerts && (
              <TouchableOpacity style={s.showMore} onPress={() => setShowAllCerts(true)} activeOpacity={0.8}>
                <Ionicons name="chevron-down-circle-outline" size={18} color={GREEN} />
                <Text style={s.showMoreTxt}>عرض جميع الشهادات ({CERTS.length})</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* ── Principles ── */}
          <Animated.View entering={FadeInDown.delay(260).springify()}>
            <SecHeader icon="diamond-outline" color="#8B5CF6" title="مبادئ العمل" />
            <View style={s.principlesList}>
              {[
                { icon: "rocket-outline",  color: "#4285F4", title: "الابتكار",      text: "تصميم حلول رقمية عصرية تواكب المعايير العالمية." },
                { icon: "heart-outline",   color: "#EF4444", title: "الانتماء",      text: "تسخير المعرفة في خدمة المجتمع المحلي والارتقاء بأبنائه." },
                { icon: "shield-outline",  color: GREEN,     title: "الأمان والثقة", text: "حماية بيانات المستخدمين بأعلى معايير الأمن المعتمدة دولياً." },
              ].map((p, i) => (
                <View key={i} style={[s.principleCard, { borderTopColor: p.color }]}>
                  <View style={[s.principleIcon, { backgroundColor: p.color + "15" }]}>
                    <Ionicons name={p.icon as any} size={22} color={p.color} />
                  </View>
                  <Text style={s.principleTitle}>{p.title}</Text>
                  <Text style={s.principleText}>{p.text}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ── Footer ── */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={s.footer}>
            <LinearGradient colors={["#071A10", "#040C07"]} style={s.footerGrad}>
              <View style={s.footerIconRow}>
                <LinearGradient colors={[GOLD, GOLD_DIM]} style={s.footerIconBg}>
                  <Ionicons name="code-slash-outline" size={26} color="#fff" />
                </LinearGradient>
              </View>
              <Text style={s.footerTitle}>تطبيق حصاحيصاوي</Text>
              <Text style={s.footerSub}>بُني بشغف وإخلاص لأبناء الحصاحيصا</Text>
              <View style={s.footerDivider} />
              <Text style={s.footerCopy}>© 2025 عاصم عبد الرحمن — جميع الحقوق محفوظة</Text>
            </LinearGradient>
          </Animated.View>

        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  // Hero
  hero:           { paddingHorizontal: 20, paddingBottom: 28, alignItems: "center", gap: 10, overflow: "hidden" },
  heroGlowGreen:  { position: "absolute", top: -60, left: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: "#22C55E08" },
  heroGlowGold:   { position: "absolute", top: 40, right: -80, width: 280, height: 280, borderRadius: 140, backgroundColor: "#EAB30806" },
  backBtn:        { position: "absolute", top: 0, right: 12 },
  backBtnInner:   { marginTop: 4, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.10)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },

  avatarWrap:     { position: "relative", marginTop: 14, marginBottom: 4 },
  avatarRing:     { width: 104, height: 104, borderRadius: 52, padding: 3, justifyContent: "center", alignItems: "center" },
  avatarInner:    { width: 98, height: 98, borderRadius: 49, overflow: "hidden" },
  avatarBg:       { flex: 1, justifyContent: "center", alignItems: "center" },
  avatarInitials: { fontFamily: "Cairo_700Bold", fontSize: 38, color: GOLD },
  verifiedBadge:  { position: "absolute", bottom: 3, right: 3, width: 26, height: 26, borderRadius: 13, backgroundColor: GREEN, justifyContent: "center", alignItems: "center", borderWidth: 2.5, borderColor: "#040C07" },

  heroName:    { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#FFFFFF", textAlign: "center" },
  heroLatin:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.40)", textAlign: "center", letterSpacing: 0.5 },
  titleChip:   { flexDirection: "row-reverse", alignItems: "center", gap: 7, backgroundColor: GOLD + "15", borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: GOLD + "40" },
  titleChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: GOLD },
  locationRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  locationText:{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.42)" },

  statsBar:    { flexDirection: "row-reverse", width: "100%", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", overflow: "hidden", marginTop: 4 },
  statItem:    { flex: 1, alignItems: "center", paddingVertical: 14 },
  statSep:     { width: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  statNum:     { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#FFFFFF" },
  statLbl:     { fontFamily: "Cairo_400Regular", fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 },

  issuersRow:  { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "center", gap: 7, marginTop: 6 },
  issuerBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  issuerText:  { fontFamily: "Cairo_700Bold", fontSize: 11 },

  // Body
  body: { paddingHorizontal: 16, paddingTop: 22, gap: 24 },

  // Contact
  contactBtns: { flexDirection: "row-reverse", gap: 10 },
  contactBtn:  { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  contactBtnTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },

  glassCard:   { backgroundColor: Colors.surface2, borderRadius: 20, borderWidth: 1, borderColor: Colors.borderSubtle, overflow: "hidden" },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 14 },
  contactRow:  { flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 12 },
  contactIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  contactVal:  { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },

  // About
  aboutCard:   { backgroundColor: Colors.surface2, borderRadius: 22, padding: 22, paddingTop: 28, borderWidth: 1, borderColor: Colors.borderSubtle, borderRightWidth: 4, borderRightColor: GREEN, gap: 14, position: "relative" },
  quoteDeco:   { position: "absolute", top: -16, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: GOLD + "18", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: GOLD + "35" },
  aboutLead:   { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", lineHeight: 30 },
  aboutBody:   { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 28 },
  hi:          { fontFamily: "Cairo_700Bold", color: GOLD },
  aboutSep:    { height: 1, backgroundColor: Colors.divider, opacity: 0.5 },
  sig:         { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.divider, marginTop: 2 },
  sigLine:     { width: 22, height: 2.5, backgroundColor: GREEN, borderRadius: 2 },
  sigName:     { fontFamily: "Cairo_700Bold", fontSize: 13, color: GREEN, flex: 1, textAlign: "right" },

  // Skills
  skillsList:  { gap: 10 },
  skillRow:    { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  skillLabel:  { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, width: 120, textAlign: "right" },
  skillIcon:   { width: 32, height: 32, borderRadius: 9, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  skillBar:    { flex: 1, height: 6, backgroundColor: Colors.surface3, borderRadius: 3, overflow: "hidden" },
  skillFill:   { height: "100%", borderRadius: 3 },
  skillPct:    { fontFamily: "Cairo_700Bold", fontSize: 11, width: 36, textAlign: "left" },

  // Certs
  certsList:      { gap: 10 },
  certCard:       { backgroundColor: Colors.surface2, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, borderRightWidth: 4, flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 12 },
  certIconBox:    { width: 52, height: 52, borderRadius: 14, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  certBody:       { flex: 1, gap: 6, alignItems: "flex-end" },
  certTitle:      { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  certMeta:       { flexDirection: "row-reverse", gap: 8, alignItems: "center", flexWrap: "wrap" },
  certDateRow:    { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  certDate:       { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  certIssuerBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  certIssuerTxt:  { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  showMore:       { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, backgroundColor: GREEN + "0C", borderRadius: 14, borderWidth: 1, borderColor: GREEN + "25", marginTop: 4 },
  showMoreTxt:    { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: GREEN },

  // Principles
  principlesList: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" },
  principleCard:  { backgroundColor: Colors.surface2, borderRadius: 16, padding: 16, borderTopWidth: 3, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "flex-end", gap: 8, width: (SW - 32 - 10) / 2, flexGrow: 1 },
  principleIcon:  { width: 46, height: 46, borderRadius: 13, justifyContent: "center", alignItems: "center" },
  principleTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  principleText:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },

  // Footer
  footer:       { borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: Colors.borderSubtle },
  footerGrad:   { padding: 28, alignItems: "center", gap: 10 },
  footerIconRow:{ marginBottom: 4 },
  footerIconBg: { width: 56, height: 56, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  footerTitle:  { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#FFFFFF", textAlign: "center" },
  footerSub:    { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.55)", textAlign: "center" },
  footerDivider:{ width: 50, height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginVertical: 4 },
  footerCopy:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.30)", textAlign: "center" },
});
