// نموذج انضمام وكالة سفر (3 خطوات). يُرسل رمز الجلسة إن وُجد ليُربط صاحب الطلب بالوكالة عند اعتمادها.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import { TRV, TRV_SOFT, TRV_GRADIENT, SAND, SAND_INK } from "@/lib/travel";
import { Field, tv } from "@/components/travel/ui";

type AgencyType = "local" | "international" | "hajj_umrah" | "tourism" | "corporate";
const TYPES: { key: AgencyType; label: string; desc: string; icon: string }[] = [
  { key: "local", label: "محلية", desc: "رحلات داخل السودان", icon: "map-marker-radius" },
  { key: "international", label: "دولية", desc: "تذاكر ووجهات عالمية", icon: "earth" },
  { key: "hajj_umrah", label: "حج وعمرة", desc: "مكاتب الحج والعمرة", icon: "star-crescent" },
  { key: "tourism", label: "سياحة", desc: "برامج ورحلات استجمام", icon: "image-filter-hdr" },
  { key: "corporate", label: "سفر الأعمال", desc: "حجوزات المؤسسات", icon: "briefcase-variant" },
];
const PRODUCTS = ["تذاكر طيران", "فنادق", "تأشيرات", "باقات سياحية", "حج وعمرة", "تذاكر داخلية"];
const STEPS = ["بيانات الوكالة", "جهة الاتصال", "الخدمات والمسارات"];
const split = (t: string) => t.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);

export default function AgencyJoinForm({ visible, onClose, onSuccess, prefill, inviteToken }: {
  visible: boolean; onClose: () => void; onSuccess: () => void; prefill?: any; inviteToken?: string;
}) {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    agency_name: "", agency_name_en: "", agency_type: "local" as AgencyType, city: "", country: "السودان", license_number: "", founded_year: "", website: "",
    contact_name: "", contact_role: "", phone: "", whatsapp: "", email: "",
    description: "", specialties: "", destinations: "", target_routes: "", services_offered: "",
  });
  const [products, setProducts] = useState<string[]>(["تذاكر طيران"]);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!visible) return;
    setF((p) => ({
      ...p,
      contact_name: p.contact_name || prefill?.contact_name || (user as any)?.name || "",
      phone: p.phone || prefill?.phone || (user as any)?.phone || "",
      agency_name: p.agency_name || prefill?.agency_name || "",
      whatsapp: p.whatsapp || prefill?.whatsapp || "",
      email: p.email || prefill?.email || "",
      city: p.city || prefill?.city || "",
      agency_type: TYPES.some((t) => t.key === prefill?.agency_type) ? prefill.agency_type : p.agency_type,
    }));
  }, [visible, prefill, user]);

  const validate = (n: number) => {
    if (n === 1 && !f.agency_name.trim()) { notify("بيانات ناقصة", "اسم الوكالة مطلوب"); return false; }
    if (n === 2) {
      if (!f.contact_name.trim()) { notify("بيانات ناقصة", "اسم المسؤول مطلوب"); return false; }
      if (!f.phone.trim() && !f.whatsapp.trim() && !f.email.trim()) { notify("بيانات ناقصة", "أدخل وسيلة تواصل واحدة على الأقل"); return false; }
    }
    return true;
  };
  const close = () => { setStep(1); onClose(); };

  const submit = async () => {
    if (!validate(1) || !validate(2)) return;
    setBusy(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/travel-agencies/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          ...f, founded_year: f.founded_year ? parseInt(f.founded_year, 10) : undefined,
          specialties: split(f.specialties), destinations: split(f.destinations), booking_products: products,
          ...(inviteToken ? { invite_token: inviteToken } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "تعذّر إرسال الطلب");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify("تم استلام طلبكم", `${j.message || "سنراجع الطلب خلال 48 ساعة"}${token ? "\nبعد الاعتماد تظهر «لوحة الوكالة» في حسابك لنشر العروض." : "\nسجّل الدخول بنفس رقم الهاتف لتصلك لوحة الوكالة بعد الاعتماد."}`);
      setStep(1);
      onSuccess();
    } catch (e: any) { notify("خطأ في الإرسال", e?.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: Colors.bg }}>
        <LinearGradient colors={TRV_GRADIENT as unknown as [string, string]} style={[m.header, { paddingTop: insets.top + 10 }]}>
          {!!inviteToken && (
            <View style={m.invite}>
              <Ionicons name="mail-open-outline" size={16} color={SAND_INK} />
              <Text style={m.inviteT}>دعوة رسمية — {prefill?.agency_name || "وكالتكم"}</Text>
            </View>
          )}
          <View style={[tv.rowR, { justifyContent: "space-between" }]}>
            <Pressable onPress={close} style={m.close} hitSlop={8} accessibilityRole="button" accessibilityLabel="إغلاق النموذج">
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={m.title}>تسجيل وكالة سفر</Text>
              <Text style={m.sub}>الخطوة {step} من 3 — {STEPS[step - 1]}</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
          <View style={[tv.rowR, { gap: 6, marginTop: 12 }]}>
            {[1, 2, 3].map((n) => <View key={n} style={[m.bar, { backgroundColor: n <= step ? SAND : "rgba(255,255,255,0.22)" }]} />)}
          </View>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <>
              <Field label="اسم الوكالة (عربي) *" value={f.agency_name} onChange={set("agency_name")} placeholder="مثال: وكالة النيل للسفر" />
              <Field label="اسم الوكالة (إنجليزي)" value={f.agency_name_en} onChange={set("agency_name_en")} placeholder="Nile Travel Agency" />
              <Text style={tv.label}>نوع الوكالة *</Text>
              <View style={m.grid}>
                {TYPES.map((t) => {
                  const on = f.agency_type === t.key;
                  return (
                    <Pressable key={t.key} onPress={() => setF((p) => ({ ...p, agency_type: t.key }))} style={[m.type, on && { borderColor: TRV, backgroundColor: TRV_SOFT }]}
                      accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t.label}>
                      <MaterialCommunityIcons name={t.icon as any} size={22} color={TRV} />
                      <Text style={[m.typeT, on && { color: TRV }]}>{t.label}</Text>
                      <Text style={m.typeD}>{t.desc}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={[tv.rowR, { gap: 10, alignItems: "flex-start" }]}>
                <View style={{ flex: 1 }}><Field label="المدينة" value={f.city} onChange={set("city")} placeholder="الحصاحيصا" /></View>
                <View style={{ flex: 1 }}><Field label="الدولة" value={f.country} onChange={set("country")} /></View>
              </View>
              <Field label="رقم الترخيص" value={f.license_number} onChange={set("license_number")} placeholder="اختياري" />
              <View style={[tv.rowR, { gap: 10, alignItems: "flex-start" }]}>
                <View style={{ flex: 1 }}><Field label="سنة التأسيس" value={f.founded_year} onChange={set("founded_year")} keyboard="numeric" placeholder="2010" /></View>
                <View style={{ flex: 1 }}><Field label="الموقع الإلكتروني" value={f.website} onChange={set("website")} placeholder="example.com" /></View>
              </View>
            </>
          )}
          {step === 2 && (
            <>
              <Field label="اسم المسؤول *" value={f.contact_name} onChange={set("contact_name")} />
              <Field label="المسمى الوظيفي" value={f.contact_role} onChange={set("contact_role")} placeholder="مثال: مدير الحجوزات" />
              <Field label="رقم الهاتف" value={f.phone} onChange={set("phone")} keyboard="phone-pad" placeholder="+2499xxxxxxxx" hint="استخدم رقم حسابك في التطبيق ليُربط بلوحة الوكالة" />
              <Field label="رقم الواتساب" value={f.whatsapp} onChange={set("whatsapp")} keyboard="phone-pad" />
              <Field label="البريد الإلكتروني" value={f.email} onChange={set("email")} keyboard="email-address" />
            </>
          )}
          {step === 3 && (
            <>
              <Field label="نبذة عن الوكالة" value={f.description} onChange={set("description")} multiline placeholder="خبرة الوكالة وما يميزها" />
              <Field label="التخصصات (افصل بفاصلة)" value={f.specialties} onChange={set("specialties")} placeholder="حج وعمرة، رحلات عائلية" />
              <Field label="الوجهات (افصل بفاصلة)" value={f.destinations} onChange={set("destinations")} placeholder="القاهرة، دبي، مكة المكرمة" />
              <Field label="خطوط السفر" value={f.target_routes} onChange={set("target_routes")} placeholder="الحصاحيصا — الخرطوم — الرياض" />
              <Field label="الخدمات المقدمة" value={f.services_offered} onChange={set("services_offered")} placeholder="طيران، تأشيرات، فنادق" />
              <Text style={tv.label}>الخدمات التي تستقبلون طلبات حجز لها</Text>
              <View style={[tv.rowR, { flexWrap: "wrap", gap: 8, marginBottom: 12 }]}>
                {PRODUCTS.map((p) => {
                  const on = products.includes(p);
                  return (
                    <Pressable key={p} onPress={() => setProducts((l) => (on ? l.filter((x) => x !== p) : [...l, p]))} style={[tv.chip, on && { backgroundColor: TRV, borderColor: TRV }]}
                      accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={p}>
                      <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={16} color={on ? "#fff" : Colors.textMuted} />
                      <Text style={[tv.chipT, on && { color: "#fff" }]}>{p}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={m.notice}>
                <Ionicons name="shield-checkmark-outline" size={18} color={TRV} />
                <Text style={m.noticeT}>تُراجع الإدارة الطلب خلال 48 ساعة، وبعد الاعتماد تنشر وكالتكم عروضها وتستقبل طلبات الحجز من لوحة الوكالة.</Text>
              </View>
            </>
          )}
        </ScrollView>

        <View style={[m.footer, { paddingBottom: insets.bottom + 12 }]}>
          {step > 1 && (
            <Pressable style={[tv.ghost, { flex: 1 }]} onPress={() => setStep((s) => s - 1)} accessibilityRole="button">
              <Ionicons name="chevron-forward" size={18} color={TRV} /><Text style={tv.ghostT}>السابق</Text>
            </Pressable>
          )}
          {step < 3 ? (
            <Pressable style={[tv.primary, { flex: 2 }]} onPress={() => validate(step) && setStep((s) => s + 1)} accessibilityRole="button">
              <Text style={tv.primaryT}>التالي</Text><Ionicons name="chevron-back" size={18} color="#fff" />
            </Pressable>
          ) : (
            <Pressable style={[tv.primary, { flex: 2 }, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#fff" /> : <><Text style={tv.primaryT}>إرسال الطلب</Text><Ionicons name="send" size={16} color="#fff" /></>}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const m = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)" },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  invite: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: SAND, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  inviteT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: SAND_INK, flex: 1, textAlign: "right" },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  type: { width: "48%", backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 10, alignItems: "flex-end", gap: 2, minHeight: 44 },
  typeT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.text, textAlign: "right" },
  typeD: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  notice: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, backgroundColor: TRV_SOFT, borderRadius: Colors.radius.md, padding: 12 },
  noticeT: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 20 },
  footer: { flexDirection: "row-reverse", padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, backgroundColor: Colors.bg },
});
