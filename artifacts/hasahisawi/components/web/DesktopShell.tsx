/**
 * تخطيط الموقع على شاشات الكمبيوتر: شريط جانبي ثابت (يمين) بكل الأقسام، عمود محتوى بعرض مريح،
 * ولوحة وصول سريع (يسار) على الشاشات العريضة. على الهاتف والتابلت يمرّر المحتوى كما هو.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { useIsRouteHidden } from "@/lib/section-visibility";
import { GROUPS } from "@/components/DrawerMenu";
import { ASIDE_MIN, ASIDE_W, contentWidthFor, isDesktopWidth, realWindowWidth, SIDEBAR_W } from "@/lib/desktop-web";

const LOGO = require("@/assets/images/logo.png");

function useRealWidth() {
  const [w, setW] = useState(realWindowWidth());
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const on = () => setW(realWindowWidth());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

/** هل نعرض تخطيط سطح المكتب الآن؟ (للمكونات التي تخفي عناصر الهاتف مثل شريط التبويب) */
export function useIsDesktopWeb() {
  const w = useRealWidth();
  return isDesktopWidth(w);
}

const norm = (r: string) => (r.replace("/(tabs)", "").replace(/\/$/, "") || "/");

const QUICK = [
  { title: "محطات الوقود", sub: "أين يتوفر الوقود الآن", icon: "speedometer", color: "#F97316", route: "/fuel-stations" },
  { title: "طلبات شي إن", sub: "نشتري من السعودية ونوصّل لك", icon: "bag-handle", color: "#111827", route: "/shein" },
  { title: "مواقيت الأذان", sub: "الصلاة القادمة والأذكار", icon: "moon", color: "#5B8DB8", route: "/(tabs)/prayer" },
  { title: "المطاعم والكافتريات", sub: "منيو مصوّر واطلب الآن", icon: "restaurant", color: "#E05567", route: "/(tabs)/restaurants" },
  { title: "مشاويرك علينا", sub: "اطلب سائقاً مباشرة", icon: "car", color: "#0EA5E9", route: "/(tabs)/transport" },
  { title: "الدليل الطبي", sub: "صيدليات ومستشفيات", icon: "medkit", color: "#10B981", route: "/(tabs)/medical" },
] as const;

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const w = useRealWidth();
  const pathname = usePathname() || "/";
  const desktop = isDesktopWidth(w);
  // شاشات بلا إطار الموقع: الدخول والترحيب والمكالمة
  const bare = /^\/(login|onboarding|call|auth-callback|complete-profile)/.test(pathname);
  if (!desktop || bare) return <>{children}</>;

  const contentW = contentWidthFor(w);
  const showAside = w >= ASIDE_MIN;
  return (
    <View style={s.root}>
      <Sidebar pathname={pathname} />
      <View style={s.main}>
        <View style={[s.content, { width: contentW }]}>{children}</View>
      </View>
      {showAside ? <Aside /> : null}
    </View>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const { user, isGuest } = useAuth();
  const isHidden = useIsRouteHidden();
  const [q, setQ] = useState("");
  const current = norm(pathname);
  const gender = (user as any)?.gender;

  const groups = useMemo(() => GROUPS.map(g => ({
    ...g,
    items: g.items.filter(it => !it.soon && !isHidden(it.route)
      && (!it.femaleOnly || gender === "female") && (!it.maleOnly || gender === "male")
      && (!q.trim() || it.title.includes(q.trim()))),
  })).filter(g => g.items.length), [isHidden, gender, q]);

  return (
    <View style={s.sidebar}>
      <Pressable onPress={() => router.push("/(tabs)/" as any)} style={s.brand} accessibilityRole="link" accessibilityLabel="الرئيسية">
        <Image source={LOGO} style={s.logo} />
        <View style={{ flex: 1 }}>
          <Text style={s.brandName}>حصاحيصاوي</Text>
          <Text style={s.brandSub}>بوابتك الذكية لمدينة الحصاحيصا</Text>
        </View>
      </Pressable>

      <View style={s.search}>
        <Ionicons name="search" size={16} color={Colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="ابحث عن قسم…"
          placeholderTextColor={Colors.textMuted}
          style={s.searchInput}
          onSubmitEditing={() => { if (q.trim()) router.push({ pathname: "/(tabs)/search", params: { q } } as any); }}
        />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        {groups.map(g => (
          <View key={g.label} style={{ marginBottom: 10 }}>
            <Text style={s.groupLabel}>{g.label}</Text>
            {g.items.map(it => {
              const active = norm(it.route) === current;
              return (
                <Pressable
                  key={it.route + it.title}
                  onPress={() => router.push(it.route as any)}
                  style={(state: any) => [s.item, state.hovered && s.itemHover, active && s.itemActive]}
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                >
                  <View style={[s.itemIcon, { backgroundColor: (it.color || Colors.primary) + (active ? "26" : "14") }]}>
                    <Ionicons name={it.icon} size={16} color={it.color || Colors.primary} />
                  </View>
                  <Text style={[s.itemText, active && s.itemTextActive]} numberOfLines={1}>{it.title}</Text>
                  {active ? <View style={s.activeBar} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Pressable
        onPress={() => router.push((user && !isGuest ? "/profile" : "/login") as any)}
        style={(state: any) => [s.account, state.hovered && s.itemHover]}
        accessibilityRole="link"
      >
        <View style={s.avatar}><Text style={s.avatarText}>{user && !isGuest ? (user.name || "؟").charAt(0) : "؟"}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.accountName} numberOfLines={1}>{user && !isGuest ? user.name : "زائر"}</Text>
          <Text style={s.accountSub}>{user && !isGuest ? "ملفي الشخصي" : "سجّل الدخول أو أنشئ حساباً"}</Text>
        </View>
        <Ionicons name={user && !isGuest ? "person-circle-outline" : "log-in-outline"} size={20} color={Colors.primary} />
      </Pressable>
    </View>
  );
}

function Aside() {
  return (
    <View style={s.aside}>
      <Text style={s.asideTitle}>وصول سريع</Text>
      {QUICK.map(x => (
        <Pressable key={x.route} onPress={() => router.push(x.route as any)} style={(state: any) => [s.quick, state.hovered && s.quickHover]} accessibilityRole="link">
          <View style={[s.quickIcon, { backgroundColor: x.color + "1A" }]}>
            <Ionicons name={x.icon as any} size={20} color={x.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.quickTitle}>{x.title}</Text>
            <Text style={s.quickSub}>{x.sub}</Text>
          </View>
          <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
        </Pressable>
      ))}
      <View style={s.appCard}>
        <Ionicons name="phone-portrait" size={22} color="#fff" />
        <Text style={s.appTitle}>حصاحيصاوي على هاتفك</Text>
        <Text style={s.appSub}>إشعارات فورية، مكالمات، وبطاقة العضوية في جيبك.</Text>
        <Pressable onPress={() => { if (typeof window !== "undefined") window.open("https://play.google.com/store/apps/details?id=com.almhbob.hasahisawi", "_blank"); }} style={s.appBtn} accessibilityRole="link">
          <Ionicons name="logo-google-playstore" size={16} color={Colors.primary} />
          <Text style={s.appBtnText}>حمّل من Google Play</Text>
        </Pressable>
      </View>
      <Text style={s.footer}>© {new Date().getFullYear()} حصاحيصاوي · الحصاحيصا، السودان</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: "row-reverse", backgroundColor: Colors.bg, height: "100%" as any },
  main: { flex: 1, alignItems: "center", paddingHorizontal: 24 },
  content: {
    flex: 1, overflow: "hidden", backgroundColor: Colors.bg,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.divider,
  },

  sidebar: {
    width: SIDEBAR_W, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 14,
    backgroundColor: Colors.cardBg, borderLeftWidth: 1, borderLeftColor: Colors.divider,
  },
  brand: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 6, marginBottom: 16 },
  logo: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#fff" },
  brandName: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right" },
  brandSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 10, marginBottom: 14 },
  searchInput: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13.5, color: Colors.textPrimary, paddingVertical: 9, textAlign: "right", outlineStyle: "none" } as any,
  groupLabel: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: Colors.textMuted, textAlign: "right", paddingHorizontal: 8, marginBottom: 4, marginTop: 4 },
  item: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 12, cursor: "pointer" } as any,
  itemHover: { backgroundColor: Colors.bg },
  itemActive: { backgroundColor: Colors.primary + "12" },
  itemIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  itemText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textSecondary, textAlign: "right" },
  itemTextActive: { color: Colors.primary, fontFamily: "Cairo_700Bold" },
  activeBar: { position: "absolute", right: -14, top: 8, bottom: 8, width: 4, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, backgroundColor: Colors.primary },
  account: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, cursor: "pointer" } as any,
  avatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  accountName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  accountSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },

  aside: { width: ASIDE_W, paddingTop: 22, paddingLeft: 22, paddingRight: 6, gap: 10 },
  asideTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", marginBottom: 2 },
  quick: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, cursor: "pointer", ...Colors.shadow.card } as any,
  quickHover: { borderColor: Colors.primary + "55", transform: [{ translateY: -1 }] },
  quickIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickTitle: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  quickSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  appCard: { marginTop: 8, padding: 16, borderRadius: 20, backgroundColor: Colors.primary, gap: 6, alignItems: "flex-end" },
  appTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff", textAlign: "right" },
  appSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.88)", textAlign: "right" },
  appBtn: { marginTop: 6, flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, cursor: "pointer" } as any,
  appBtnText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.primary },
  footer: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 8 },
});
