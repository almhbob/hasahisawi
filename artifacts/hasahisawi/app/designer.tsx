import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const ACCENT = "#C9A84C";
const ACCENT_LIGHT = "#F0C96020";
const DARK_HERO_TOP = "#0B1E35";
const DARK_HERO_MID = "#0A3828";
const DARK_HERO_BOT = "#0D4F36";

const CONTACT = [
  { icon: "logo-whatsapp",  color: "#25D366", label: "واتساب",  url: "https://wa.me/966597083352",                         value: "+966 59 708 3352" },
  { icon: "mail-outline",   color: "#EA4335", label: "البريد",  url: "mailto:Hasahisawi@hotmail.com",                      value: "Hasahisawi@hotmail.com" },
  { icon: "ribbon-outline", color: "#FF6900", label: "Credly",  url: "https://www.credly.com/users/asim-abdulrahman",       value: "credly.com/users/asim-abdulrahman" },
];

const SKILLS = [
  { label: "تحليل البيانات",    icon: "analytics-outline",       color: "#4285F4" },
  { label: "الأمن السيبراني",   icon: "shield-outline",           color: "#C0392B" },
  { label: "Cloud & DevOps",    icon: "cloud-outline",             color: "#0071C5" },
  { label: "تطوير التطبيقات",   icon: "phone-portrait-outline",   color: "#8E44AD" },
  { label: "Design Thinking",   icon: "bulb-outline",              color: "#D35400" },
  { label: "التسويق الرقمي",    icon: "megaphone-outline",        color: "#E67E22" },
  { label: "تطوير المجتمع",     icon: "people-outline",           color: Colors.primary },
  { label: "إدارة المشاريع",    icon: "briefcase-outline",        color: "#27AE60" },
];

const CERTS = [
  { title: "Google Data Analytics Professional",     issuer: "Coursera / Google",                   date: "أبريل 2026",   icon: "stats-chart-outline",      color: "#4285F4" },
  { title: "Google Advanced Data Analytics",         issuer: "Coursera / Google",                   date: "يناير 2026",   icon: "analytics-outline",        color: "#34A853" },
  { title: "IBM Cybersecurity Specialist",           issuer: "Coursera / IBM",                      date: "فبراير 2026",  icon: "shield-checkmark-outline", color: "#052FAD" },
  { title: "McKinsey.org Forward Program",           issuer: "McKinsey & Company",                  date: "يوليو 2025",   icon: "trending-up-outline",      color: "#051C2C" },
  { title: "Build an AI Agent",                      issuer: "IBM SkillsBuild",                     date: "سبتمبر 2025", icon: "hardware-chip-outline",    color: "#0F62FE" },
  { title: "Enterprise Design Thinking Practitioner",issuer: "IBM SkillsBuild",                     date: "سبتمبر 2025", icon: "bulb-outline",             color: "#8E44AD" },
  { title: "UI/UX Design Capstone Project",          issuer: "Coursera / IBM",                      date: "ديسمبر 2025", icon: "color-palette-outline",    color: "#FF6900" },
  { title: "Cloud Security",                         issuer: "Intel",                               date: "أبريل 2025",   icon: "shield-outline",           color: "#0071C5" },
  { title: "Cloud DevOps",                           issuer: "Intel",                               date: "مارس 2025",    icon: "cloud-outline",            color: "#0071C5" },
  { title: "AI for Networking",                      issuer: "Cisco",                               date: "يناير 2026",   icon: "git-network-outline",      color: "#1BA0D7" },
  { title: "Cisco Network Automation Essentials",    issuer: "Cisco",                               date: "ديسمبر 2025", icon: "code-working-outline",     color: "#049FD9" },
  { title: "Python Essentials 1",                    issuer: "Cisco / OpenEDG",                     date: "ديسمبر 2025", icon: "logo-python",              color: "#3776AB" },
  { title: "Introduction to Design Thinking",        issuer: "Virginia Commonwealth University",    date: "مارس 2025",    icon: "school-outline",           color: "#8E44AD" },
  { title: "IBM SkillsBuild Faculty",                issuer: "IBM",                                 date: "ديسمبر 2025", icon: "ribbon-outline",           color: "#1F70C1" },
  { title: "Threat Landscape 2.0",                   issuer: "Fortinet",                            date: "يناير 2025",   icon: "warning-outline",          color: "#EE2222" },
];

const VALUES = [
  { icon: "rocket-outline", color: "#4285F4", title: "الابتكار",      text: "تصميم حلول رقمية عصرية تواكب المعايير العالمية وتخدم احتياج الإنسان العربي." },
  { icon: "heart-outline",  color: "#C0392B", title: "الانتماء",      text: "تسخير المعرفة والخبرة في خدمة المجتمع المحلي والارتقاء بأبناء الحصاحيصا." },
  { icon: "shield-outline", color: "#27AE60", title: "الأمان والثقة", text: "حماية بيانات المستخدمين بأعلى معايير الأمن السيبراني المعتمدة دولياً." },
];

function openLink(url: string) {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  Linking.openURL(url);
}

export default function DesignerScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const [showAllCerts, setShowAllCerts] = useState(false);
  const visibleCerts = showAllCerts ? CERTS : CERTS.slice(0, 6);

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad + 40 }}>

        {/* ── Hero ── */}
        <LinearGradient
          colors={[DARK_HERO_TOP, DARK_HERO_MID, DARK_HERO_BOT]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[s.hero, { paddingTop: topPad + 16 }]}
        >
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <View style={s.backBtnInner}>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.85)" />
            </View>
          </TouchableOpacity>

          {/* Avatar */}
          <Animated.View entering={FadeInUp.delay(100).springify()} style={s.avatarWrap}>
            <LinearGradient colors={[ACCENT, "#8B6914"]} style={s.avatarRing}>
              <View style={s.avatar}>
                <Text style={s.avatarInitials}>عا</Text>
              </View>
            </LinearGradient>
            <View style={s.verifiedBadge}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          </Animated.View>

          {/* Name */}
          <Animated.View entering={FadeInUp.delay(180).springify()} style={{ alignItems: "center", gap: 4 }}>
            <Text style={s.heroName}>عاصم عبد الرحمن محمد عمر</Text>
            <Text style={s.heroLatin}>Asim Abdulrahman Mohammed Omer</Text>
          </Animated.View>

          {/* Title Badge */}
          <Animated.View entering={FadeInUp.delay(240).springify()} style={s.heroBadge}>
            <Ionicons name="code-slash-outline" size={13} color={ACCENT} />
            <Text style={s.heroBadgeText}>مصمم ومطور تطبيق حصاحيصاوي</Text>
          </Animated.View>

          {/* Location Badge */}
          <Animated.View entering={FadeInUp.delay(280).springify()} style={s.locationBadge}>
            <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.55)" />
            <Text style={s.locationText}>الحصاحيصا، ولاية الجزيرة، السودان</Text>
          </Animated.View>

          {/* Stats */}
          <Animated.View entering={FadeInDown.delay(320).springify()} style={s.heroStats}>
            <View style={s.heroStat}>
              <Text style={s.heroStatNum}>+٤٠</Text>
              <Text style={s.heroStatLabel}>شهادة دولية</Text>
            </View>
            <View style={s.heroStatSep} />
            <View style={s.heroStat}>
              <Text style={s.heroStatNum}>+١٢</Text>
              <Text style={s.heroStatLabel}>جهة معتمِدة</Text>
            </View>
            <View style={s.heroStatSep} />
            <View style={s.heroStat}>
              <Text style={s.heroStatNum}>+٩</Text>
              <Text style={s.heroStatLabel}>تخصصات تقنية</Text>
            </View>
          </Animated.View>
        </LinearGradient>

        <View style={s.body}>

          {/* ── Contact Buttons ── */}
          <Animated.View entering={FadeInDown.delay(60).springify()} style={s.contactRow}>
            {CONTACT.map((c, i) => (
              <TouchableOpacity
                key={i}
                style={[s.contactBtn, { backgroundColor: c.color }]}
                onPress={() => openLink(c.url)}
                activeOpacity={0.82}
              >
                <Ionicons name={c.icon as any} size={19} color="#fff" />
                <Text style={s.contactBtnText}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>

          {/* ── Contact Details ── */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={s.card}>
            {CONTACT.map((c, i) => (
              <View key={i}>
                {i > 0 && <View style={s.divider} />}
                <TouchableOpacity style={s.infoRow} onPress={() => openLink(c.url)} activeOpacity={0.7}>
                  <Ionicons name="chevron-back" size={14} color={Colors.textMuted} />
                  <Text style={s.infoValue} selectable>{c.value}</Text>
                  <View style={[s.infoIcon, { backgroundColor: c.color + "18" }]}>
                    <Ionicons name={c.icon as any} size={17} color={c.color} />
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </Animated.View>

          {/* ── About ── */}
          <Animated.View entering={FadeInDown.delay(140).springify()}>
            <SectionLabel icon="person-circle-outline" color={ACCENT} title="نبذة شخصية" />
            <View style={s.aboutCard}>
              <View style={s.quoteMark}>
                <Ionicons name="chatbox-ellipses" size={18} color={ACCENT} />
              </View>

              <Text style={s.aboutLead}>
                مهندس برمجيات ومحلّل بيانات سوداني، شغوف بتسخير التقنية الحديثة لخدمة الإنسان وبناء حلول رقمية تترك أثراً حقيقياً في المجتمع.
              </Text>

              <Text style={s.aboutBody}>
                أحمل أكثر من <Text style={s.aboutHighlight}>أربعين شهادة دولية معتمدة</Text> من كبرى المؤسسات التقنية والأكاديمية حول العالم، من بينها <Text style={s.aboutHighlight}>Google</Text> و<Text style={s.aboutHighlight}>IBM</Text> و<Text style={s.aboutHighlight}>Cisco</Text> و<Text style={s.aboutHighlight}>Intel</Text> و<Text style={s.aboutHighlight}>McKinsey</Text> و<Text style={s.aboutHighlight}>Fortinet</Text> وجامعة <Text style={s.aboutHighlight}>Virginia Commonwealth</Text>. تمتد خبرتي عبر تخصصات متعددة تشمل تحليل البيانات، والأمن السيبراني، والحوسبة السحابية، وذكاء الأعمال، وتطوير تطبيقات الذكاء الاصطناعي، وتصميم تجربة المستخدم.
              </Text>

              <View style={s.aboutDivider} />

              <Text style={s.aboutBody}>
                من رحم هذه الرؤية وُلد <Text style={s.aboutHighlight}>«حصاحيصاوي»</Text> — مشروع تقنيّ متكامل صمّمتُه وطوّرتُه بنفسي ليكون <Text style={s.aboutHighlight}>أوّل بوّابة رقمية ذكية</Text> تخدم أبناء مدينة الحصاحيصا والقرى المجاورة. يجمع التطبيق تحت سقف واحد خدمات السوق المحلي، والمواصلات، والدليل الطبي، والمناسبات الاجتماعية، والوظائف، والمفقودات، ومواقيت الصلاة، وصوت الحرفيين والمبدعين — بهندسة عصرية وبمعايير عالمية.
              </Text>

              <View style={s.aboutSignature}>
                <View style={s.signatureLine} />
                <Text style={s.signatureText}>عاصم عبد الرحمن محمد عمر</Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Values ── */}
          <Animated.View entering={FadeInDown.delay(180).springify()}>
            <SectionLabel icon="diamond-outline" color="#8E44AD" title="مبادئ العمل" />
            <View style={s.valuesGrid}>
              {VALUES.map((v, i) => (
                <View key={i} style={[s.valueCard, { borderTopColor: v.color }]}>
                  <View style={[s.valueIconWrap, { backgroundColor: v.color + "15" }]}>
                    <Ionicons name={v.icon as any} size={22} color={v.color} />
                  </View>
                  <Text style={s.valueTitle}>{v.title}</Text>
                  <Text style={s.valueText}>{v.text}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ── Skills ── */}
          <Animated.View entering={FadeInDown.delay(220).springify()}>
            <SectionLabel icon="flash-outline" color="#4285F4" title="المهارات والتخصصات" />
            <View style={s.skillsGrid}>
              {SKILLS.map((sk, i) => (
                <View key={i} style={[s.skillChip, { borderColor: sk.color + "35", backgroundColor: sk.color + "0E" }]}>
                  <Ionicons name={sk.icon as any} size={15} color={sk.color} />
                  <Text style={[s.skillText, { color: sk.color }]}>{sk.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ── Certifications ── */}
          <Animated.View entering={FadeInDown.delay(260).springify()}>
            <SectionLabel icon="ribbon-outline" color="#FF6900" title="الشهادات الدولية المعتمدة" />
            <View style={s.certsList}>
              {visibleCerts.map((cert, i) => (
                <View key={i} style={[s.certCard, { borderRightColor: cert.color }]}>
                  <View style={s.certContent}>
                    <Text style={s.certTitle}>{cert.title}</Text>
                    <Text style={s.certIssuer}>{cert.issuer}</Text>
                    <View style={s.certDateRow}>
                      <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                      <Text style={s.certDate}>{cert.date}</Text>
                    </View>
                  </View>
                  <View style={[s.certIcon, { backgroundColor: cert.color + "15" }]}>
                    <Ionicons name={cert.icon as any} size={22} color={cert.color} />
                  </View>
                </View>
              ))}
            </View>

            {!showAllCerts && (
              <TouchableOpacity style={s.showMoreBtn} onPress={() => setShowAllCerts(true)} activeOpacity={0.8}>
                <Ionicons name="chevron-down-circle-outline" size={18} color={Colors.primary} />
                <Text style={s.showMoreText}>عرض جميع الشهادات ({CERTS.length})</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* ── Footer ── */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={s.footer}>
            <LinearGradient colors={[DARK_HERO_MID, DARK_HERO_BOT]} style={s.footerGrad}>
              <Ionicons name="code-slash-outline" size={28} color={ACCENT} />
              <Text style={s.footerTitle}>تطبيق حصاحيصاوي</Text>
              <Text style={s.footerSub}>بُني بشغف وإخلاص لأبناء الحصاحيصا</Text>
              <Text style={s.footerCopy}>© 2025 عاصم عبد الرحمن — جميع الحقوق محفوظة</Text>
            </LinearGradient>
          </Animated.View>

        </View>
      </ScrollView>
    </View>
  );
}

function SectionLabel({ icon, color, title }: { icon: string; color: string; title: string }) {
  return (
    <View style={s.sectionLabel}>
      <View style={[s.sectionIconWrap, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.bg },
  hero:           { paddingHorizontal: 20, paddingBottom: 32, alignItems: "center", gap: 10 },
  backBtn:        { position: "absolute", top: 0, right: 12, paddingTop: 4 },
  backBtnInner:   { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", justifyContent: "center", alignItems: "center" },

  avatarWrap:     { position: "relative", marginTop: 16, marginBottom: 2 },
  avatarRing:     { width: 96, height: 96, borderRadius: 48, padding: 3, justifyContent: "center", alignItems: "center" },
  avatar:         { width: 90, height: 90, borderRadius: 45, backgroundColor: "#0A2B1E", justifyContent: "center", alignItems: "center" },
  avatarInitials: { fontFamily: "Cairo_700Bold", fontSize: 34, color: ACCENT },
  verifiedBadge:  { position: "absolute", bottom: 2, right: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: "#27AE60", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: DARK_HERO_BOT },

  heroName:       { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#FFFFFF", textAlign: "center" },
  heroLatin:      { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.45)", textAlign: "center", letterSpacing: 0.4 },
  heroBadge:      { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: ACCENT_LIGHT, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: ACCENT + "50" },
  heroBadgeText:  { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: ACCENT },
  locationBadge:  { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  locationText:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.50)" },

  heroStats:      { flexDirection: "row-reverse", marginTop: 6, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", width: "100%" },
  heroStat:       { flex: 1, alignItems: "center", paddingVertical: 14 },
  heroStatSep:    { width: 1, backgroundColor: "rgba(255,255,255,0.10)" },
  heroStatNum:    { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#FFFFFF" },
  heroStatLabel:  { fontFamily: "Cairo_400Regular", fontSize: 10, color: "rgba(255,255,255,0.50)", marginTop: 2 },

  body:           { paddingHorizontal: 16, paddingTop: 20, gap: 20 },

  contactRow:     { flexDirection: "row-reverse", gap: 10 },
  contactBtn:     { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 16, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8 },
  contactBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },

  card:           { backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  infoRow:        { flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 12 },
  infoIcon:       { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  infoValue:      { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  divider:        { height: 1, backgroundColor: Colors.divider, marginHorizontal: 14 },

  aboutCard:      { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 22, paddingTop: 26, borderWidth: 1, borderColor: Colors.divider, borderRightWidth: 4, borderRightColor: ACCENT, gap: 14, elevation: 3, shadowColor: ACCENT, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 12, position: "relative" },
  quoteMark:      { position: "absolute", top: -14, right: 18, width: 32, height: 32, borderRadius: 16, backgroundColor: ACCENT_LIGHT, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: ACCENT + "40" },
  aboutLead:      { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: Colors.textPrimary, textAlign: "right", lineHeight: 30 },
  aboutBody:      { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 28 },
  aboutHighlight: { fontFamily: "Cairo_700Bold", color: ACCENT },
  aboutDivider:   { height: 1, backgroundColor: Colors.divider, marginVertical: 4, opacity: 0.6 },
  aboutSignature: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.divider },
  signatureLine:  { width: 24, height: 2, backgroundColor: ACCENT, borderRadius: 1 },
  signatureText:  { fontFamily: "Cairo_700Bold", fontSize: 13, color: ACCENT, letterSpacing: 0.2 },

  valuesGrid:     { gap: 10 },
  valueCard:      { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16, borderTopWidth: 3, borderWidth: 1, borderColor: Colors.divider, alignItems: "flex-end", gap: 8, elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
  valueIconWrap:  { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  valueTitle:     { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  valueText:      { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },

  sectionLabel:   { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 12 },
  sectionIconWrap:{ width: 34, height: 34, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  sectionTitle:   { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },

  skillsGrid:     { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  skillChip:      { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  skillText:      { fontFamily: "Cairo_600SemiBold", fontSize: 12 },

  certsList:      { gap: 10 },
  certCard:       { backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: Colors.divider, borderRightWidth: 4, flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 12, elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
  certIcon:       { width: 48, height: 48, borderRadius: 13, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  certContent:    { flex: 1, alignItems: "flex-end", gap: 3 },
  certTitle:      { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  certIssuer:     { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  certDateRow:    { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  certDate:       { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  showMoreBtn:    { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, backgroundColor: Colors.primary + "0D", borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + "22" },
  showMoreText:   { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },

  footer:         { borderRadius: 20, overflow: "hidden" },
  footerGrad:     { padding: 24, alignItems: "center", gap: 8 },
  footerTitle:    { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#FFFFFF", textAlign: "center" },
  footerSub:      { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.60)", textAlign: "center" },
  footerCopy:     { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center", marginTop: 8 },
});
