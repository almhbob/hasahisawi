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
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const CERTS = [
  {
    title: "Google Advanced Data Analytics",
    issuer: "Coursera / Google",
    date: "يناير 2026",
    icon: "analytics-outline",
    color: "#4285F4",
  },
  {
    title: "IBM Cybersecurity Specialist",
    issuer: "Coursera / IBM",
    date: "فبراير 2026",
    icon: "shield-checkmark-outline",
    color: "#052FAD",
  },
  {
    title: "Cloud DevOps",
    issuer: "Intel",
    date: "مارس 2025",
    icon: "cloud-outline",
    color: "#0071C5",
  },
  {
    title: "Introduction to Design Thinking",
    issuer: "Virginia Commonwealth University",
    date: "مارس 2025",
    icon: "bulb-outline",
    color: "#8E44AD",
  },
  {
    title: "IBM Cybersecurity Fundamentals",
    issuer: "IBM SkillsBuild",
    date: "أكتوبر 2024",
    icon: "lock-closed-outline",
    color: "#1F70C1",
  },
  {
    title: "Introduction to Data Science",
    issuer: "Cisco",
    date: "مارس 2025",
    icon: "bar-chart-outline",
    color: "#1BA0D7",
  },
  {
    title: "Introduction to Packet Tracer",
    issuer: "Cisco",
    date: "مارس 2025",
    icon: "git-network-outline",
    color: "#049FD9",
  },
  {
    title: "Agile Explorer",
    issuer: "IBM SkillsBuild",
    date: "مارس 2025",
    icon: "refresh-circle-outline",
    color: "#0F62FE",
  },
  {
    title: "Threat Landscape 2.0",
    issuer: "Fortinet",
    date: "يناير 2025",
    icon: "warning-outline",
    color: "#EE2222",
  },
  {
    title: "Digital Marketing",
    issuer: "Certiprof",
    date: "أبريل 2025",
    icon: "megaphone-outline",
    color: "#E67E22",
  },
];

const SKILLS = [
  { label: "تحليل البيانات", icon: "analytics-outline", color: "#4285F4" },
  { label: "الأمن السيبراني", icon: "shield-outline", color: "#C0392B" },
  { label: "Cloud DevOps", icon: "cloud-outline", color: "#0071C5" },
  { label: "تصميم التطبيقات", icon: "phone-portrait-outline", color: "#8E44AD" },
  { label: "تطوير المجتمع", icon: "people-outline", color: Colors.primary },
  { label: "التسويق الرقمي", icon: "megaphone-outline", color: "#E67E22" },
  { label: "Design Thinking", icon: "bulb-outline", color: "#D35400" },
  { label: "إدارة المشاريع", icon: "briefcase-outline", color: "#27AE60" },
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

  const visibleCerts = showAllCerts ? CERTS : CERTS.slice(0, 4);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad + 40 }}
      >
        {/* Hero Card */}
        <LinearGradient
          colors={["#1A2B4A", "#0D4F36", "#1A6B4A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: topPad + 16 }]}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>عا</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={11} color="#fff" />
            </View>
          </View>

          <Text style={styles.heroName}>عاصم عبد الرحمن محمد عمر</Text>
          <Text style={styles.heroLatin}>Asim Abdulrahman Mohammed Omer</Text>

          <View style={styles.heroBadge}>
            <Ionicons name="phone-portrait-outline" size={13} color={Colors.accent} />
            <Text style={styles.heroBadgeText}>مصمم ومطور تطبيق حصاحيصاوي</Text>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>١٠+</Text>
              <Text style={styles.heroStatLabel}>شهادة دولية</Text>
            </View>
            <View style={styles.heroStatSep} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>١٩٩١</Text>
              <Text style={styles.heroStatLabel}>سنة الميلاد</Text>
            </View>
            <View style={styles.heroStatSep} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>Credly</Text>
              <Text style={styles.heroStatLabel}>الملف الأكاديمي</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Contact Buttons */}
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: "#25D366" }]}
              onPress={() => openLink("https://wa.me/966530658285")}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={styles.contactBtnText}>واتس اب</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: "#EA4335" }]}
              onPress={() => openLink("mailto:almhbob.iii@gmail.com")}
              activeOpacity={0.85}
            >
              <Ionicons name="mail-outline" size={20} color="#fff" />
              <Text style={styles.contactBtnText}>البريد</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: "#FF6900" }]}
              onPress={() => openLink("https://www.credly.com/users/asim-abdulrahman")}
              activeOpacity={0.85}
            >
              <Ionicons name="ribbon-outline" size={20} color="#fff" />
              <Text style={styles.contactBtnText}>Credly</Text>
            </TouchableOpacity>
          </View>

          {/* Contact Details */}
          <View style={styles.infoCard}>
            <TouchableOpacity style={styles.infoRow} onPress={() => openLink("https://wa.me/966530658285")}>
              <Ionicons name="chevron-back" size={14} color={Colors.textMuted} />
              <Text style={styles.infoValue} selectable>+966 530 658 285</Text>
              <View style={[styles.infoIcon, { backgroundColor: "#25D36618" }]}>
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              </View>
            </TouchableOpacity>
            <View style={styles.infoDivider} />
            <TouchableOpacity style={styles.infoRow} onPress={() => openLink("mailto:almhbob.iii@gmail.com")}>
              <Ionicons name="chevron-back" size={14} color={Colors.textMuted} />
              <Text style={styles.infoValue} selectable>almhbob.iii@gmail.com</Text>
              <View style={[styles.infoIcon, { backgroundColor: "#EA433518" }]}>
                <Ionicons name="mail-outline" size={18} color="#EA4335" />
              </View>
            </TouchableOpacity>
            <View style={styles.infoDivider} />
            <TouchableOpacity style={styles.infoRow} onPress={() => openLink("https://www.credly.com/users/asim-abdulrahman")}>
              <Ionicons name="chevron-back" size={14} color={Colors.textMuted} />
              <Text style={styles.infoValue}>credly.com/users/asim-abdulrahman</Text>
              <View style={[styles.infoIcon, { backgroundColor: "#FF690018" }]}>
                <Ionicons name="ribbon-outline" size={18} color="#FF6900" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Skills */}
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: Colors.accent }]} />
            <Text style={styles.sectionTitle}>المهارات والتخصصات</Text>
          </View>
          <View style={styles.skillsGrid}>
            {SKILLS.map((s, i) => (
              <View key={i} style={[styles.skillChip, { borderColor: s.color + "30", backgroundColor: s.color + "0E" }]}>
                <Ionicons name={s.icon as any} size={16} color={s.color} />
                <Text style={[styles.skillText, { color: s.color }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Certifications */}
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <View style={[styles.sectionDot, { backgroundColor: "#4285F4" }]} />
            <Text style={styles.sectionTitle}>الشهادات الدولية المعتمدة</Text>
          </View>

          <View style={styles.certsList}>
            {visibleCerts.map((cert, i) => (
              <View key={i} style={styles.certCard}>
                <View style={styles.certContent}>
                  <Text style={styles.certTitle}>{cert.title}</Text>
                  <Text style={styles.certIssuer}>{cert.issuer}</Text>
                  <View style={styles.certDateRow}>
                    <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                    <Text style={styles.certDate}>{cert.date}</Text>
                  </View>
                </View>
                <View style={[styles.certIcon, { backgroundColor: cert.color + "15" }]}>
                  <Ionicons name={cert.icon as any} size={24} color={cert.color} />
                </View>
              </View>
            ))}
          </View>

          {!showAllCerts && (
            <TouchableOpacity
              style={styles.showMoreBtn}
              onPress={() => setShowAllCerts(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-down" size={16} color={Colors.primary} />
              <Text style={styles.showMoreText}>عرض جميع الشهادات ({CERTS.length})</Text>
            </TouchableOpacity>
          )}

          {/* About */}
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <View style={[styles.sectionDot, { backgroundColor: Colors.primary }]} />
            <Text style={styles.sectionTitle}>نبذة تعريفية</Text>
          </View>
          <View style={styles.aboutCard}>
            <Text style={styles.aboutText}>
              متخصص في تحليل البيانات والأمن السيبراني وتطوير التطبيقات المجتمعية. حاصل على أكثر من عشر شهادات دولية معتمدة من Google وIBM وCisco وIntel وجامعات عالمية. صمّم وطوّر تطبيق حصاحيصاوي خدمةً لأبناء المنطقة والقرى المجاورة، بهدف ربط المجتمع ورقمنة الخدمات المحلية.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    position: "absolute",
    top: 0,
    right: 16,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrap: { position: "relative", marginTop: 12, marginBottom: 4 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.accent + "30",
    borderWidth: 3,
    borderColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: { fontFamily: "Cairo_700Bold", fontSize: 32, color: Colors.accent },
  verifiedBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#27AE60",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0D4F36",
  },
  heroName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: "#FFFFFF",
    textAlign: "center",
  },
  heroLatin: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
  },
  heroBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(201,168,76,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  heroBadgeText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.accent,
  },
  heroStats: {
    flexDirection: "row-reverse",
    gap: 0,
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    width: "100%",
  },
  heroStat: { flex: 1, alignItems: "center", paddingVertical: 14 },
  heroStatSep: { width: 1, backgroundColor: "rgba(255,255,255,0.12)" },
  heroStatNum: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#FFFFFF" },
  heroStatLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.55)",
    marginTop: 3,
  },
  body: { paddingHorizontal: 16, paddingTop: 20, gap: 0 },
  contactRow: { flexDirection: "row-reverse", gap: 10, marginBottom: 14 },
  contactBtn: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  contactBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  infoCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  infoIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  infoValue: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
    textAlign: "right",
  },
  infoDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 14 },
  sectionHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: Colors.textPrimary,
  },
  skillsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  skillChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  skillText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  certsList: { gap: 10, marginBottom: 8 },
  certCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.divider,
    flexDirection: "row-reverse",
    alignItems: "center",
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  certIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  certContent: { flex: 1, alignItems: "flex-end", gap: 4 },
  certTitle: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  certIssuer: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "right",
  },
  certDateRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  certDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  showMoreBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: Colors.primary + "0E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "20",
    marginBottom: 4,
  },
  showMoreText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.primary,
  },
  aboutCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRightWidth: 4,
    borderRightColor: Colors.primary,
  },
  aboutText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "right",
    lineHeight: 26,
  },
});
