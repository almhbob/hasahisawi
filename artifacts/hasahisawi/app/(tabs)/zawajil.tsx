import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView, Pressable, RefreshControl, Dimensions, Switch,
} from "react-native";
import Animated, { FadeInDown, FadeIn, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

const { width: W } = Dimensions.get("window");

const PINK   = "#EC4899";
const PINK2  = "#F472B6";
const GOLD   = "#D4AF37";

type ServiceDef = {
  key: string; label: string; subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string; gradient: [string, string]; description: string;
  emoji: string;
};
const SERVICES: ServiceDef[] = [
  { key: "hamasat_itab", label: "همسات عتاب",  subtitle: "رسالة من القلب",     icon: "heart",        color: "#EC4899", gradient: ["#EC4899","#BE185D"], description: "أرسل رسالة شخصية تعبر عن مشاعرك — شوق، عتاب، اعتذار أو تقدير", emoji: "💌" },
  { key: "nifaj",        label: "نفاج",         subtitle: "النصيحة المهداة",    icon: "bulb",         color: "#F59E0B", gradient: ["#F59E0B","#D97706"], description: "رسالة نصيحة واعية موجهة لشخص تحب أن يتحسن أو يغير سلوكاً معيناً", emoji: "💡" },
  { key: "shoubash",     label: "شوبش",         subtitle: "مساحة العرسان",      icon: "diamond",      color: "#D4AF37", gradient: ["#D4AF37","#B7950B"], description: "هدايا الزواج مع تقديم صوتي احترافي خلال حفل الزفاف، يمكن مشاركة أكثر من شخص", emoji: "💍" },
  { key: "tabrikat",     label: "تبريكات",      subtitle: "مناسبات سعيدة",      icon: "sparkles",     color: "#C084FC", gradient: ["#C084FC","#9333EA"], description: "تهانٍ للخطوبة، التخرج، التفوق وكل المناسبات البهيجة", emoji: "🎉" },
  { key: "salamat",      label: "سلامات",        subtitle: "للمرضى والمتعبين",  icon: "heart-half",   color: "#22C55E", gradient: ["#22C55E","#15803D"], description: "رسالة دعم ومؤازرة مصحوبة بهدية لمن يعاني المرض أو الوعكة", emoji: "🌿" },
];

const STATUS_INFO: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap; step: number }> = {
  pending_review:         { label: "في انتظار المراجعة", color: "#F59E0B", icon: "time-outline",              step: 1 },
  modification_requested: { label: "يحتاج تعديل",        color: "#F97316", icon: "create-outline",            step: 2 },
  approved:               { label: "مقبول",               color: "#22C55E", icon: "checkmark-circle-outline",  step: 3 },
  preparing:              { label: "جارٍ التجهيز",        color: "#0EA5E9", icon: "construct-outline",          step: 4 },
  sending:                { label: "في الطريق",           color: "#C084FC", icon: "bicycle-outline",            step: 5 },
  completed:              { label: "مكتمل ✓",             color: "#3EFF9C", icon: "checkmark-done-outline",     step: 6 },
  rejected:               { label: "مرفوض",               color: "#EF4444", icon: "close-circle-outline",       step: 0 },
  returned:               { label: "مُعادة للمرسل",      color: "#6B7280", icon: "return-down-back-outline",    step: 0 },
};

const PIPELINE = ["pending_review","approved","preparing","sending","completed"];

const OCCASION_TYPES = [
  { key: "engagement", label: "خطوبة 💍" },
  { key: "graduation",  label: "تخرج 🎓" },
  { key: "excellence",  label: "تفوق / نجاح 🏆" },
  { key: "newborn",     label: "مولود جديد 👶" },
  { key: "other",       label: "أخرى" },
];

const GIFT_TYPES = [
  { key: "none",      label: "بدون هدية",           icon: "ban-outline"           },
  { key: "from_store",label: "من متجرنا (أرخص)",    icon: "storefront-outline"    },
  { key: "money",     label: "مبلغ مادي",            icon: "cash-outline"          },
  { key: "external",  label: "هدية خارجية",          icon: "gift-outline"          },
];

type Product = { id: number; name: string; description?: string; price: string; category: string };
type OrderForm = {
  sender_name: string; sender_phone: string;
  recipient_name: string; recipient_phone: string; recipient_address: string;
  delivery_location: "inside_city" | "outside_city";
  service_type: string; occasion_type: string;
  message_text: string; message_by_us: boolean; voice_presentation: boolean;
  gift_type: string; gift_product_id: number | null; gift_product_name: string;
  gift_external_desc: string; gift_money_amount: string;
  pledge_accepted: boolean;
};

const EMPTY_FORM: OrderForm = {
  sender_name: "", sender_phone: "",
  recipient_name: "", recipient_phone: "", recipient_address: "",
  delivery_location: "inside_city",
  service_type: "", occasion_type: "engagement",
  message_text: "", message_by_us: false, voice_presentation: false,
  gift_type: "none", gift_product_id: null, gift_product_name: "",
  gift_external_desc: "", gift_money_amount: "",
  pledge_accepted: false,
};

const PLEDGE_TEXT = `أتعهد بأنني سأستخدم خدمة زواجل فيما يرضي الله ويتفق مع الأعراف والتقاليد والقيم المجتمعية لمدينة الحصاحيصا. أتعهد بعدم استخدام الخدمة في إرسال محتوى مسيء أو غير لائق أو مخالف للآداب العامة. أتحمل كامل المسؤولية القانونية والأخلاقية عن محتوى الرسالة والهدية المرسلة، وفي حال نشوب أي مشكلة تتعلق بطلبي.`;

export default function ZawajilScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [tab, setTab] = useState<"send" | "orders">("send");
  const [selectedService, setSelectedService] = useState<ServiceDef | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPledge, setShowPledge] = useState(false);
  const [form, setForm] = useState<OrderForm>({ ...EMPTY_FORM });
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [trackPhone, setTrackPhone] = useState("");

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const r = await fetchWithTimeout(`${getApiUrl()}/zawajil/products`, {});
      if (r.ok) { const d = await r.json(); setProducts(Array.isArray(d) ? d : []); }
    } catch { /* ignore */ }
    finally { setLoadingProducts(false); }
  }, []);

  const loadMyOrders = useCallback(async (phone?: string) => {
    const p = phone ?? trackPhone;
    if (!p) return;
    setLoadingOrders(true);
    try {
      const r = await fetchWithTimeout(`${getApiUrl()}/zawajil/orders/mine?phone=${encodeURIComponent(p)}`, {});
      if (r.ok) { const d = await r.json(); setMyOrders(Array.isArray(d) ? d : []); }
    } catch { /* ignore */ }
    finally { setLoadingOrders(false); setRefreshing(false); }
  }, [trackPhone]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function openForm(service: ServiceDef) {
    setSelectedService(service);
    const base = { ...EMPTY_FORM, service_type: service.key };
    if (user?.name) base.sender_name = user.name;
    if (user?.phone) base.sender_phone = user.phone;
    setForm(base);
    setShowForm(true);
  }

  async function submitOrder() {
    if (!form.recipient_name.trim()) { Alert.alert("تنبيه", "اسم المستلم مطلوب"); return; }
    if (!form.pledge_accepted) { Alert.alert("تنبيه", "يجب قبول التعهد أولاً — اضغط على 'قرأت وأتعهد'"); return; }
    setSubmitting(true);
    try {
      const headers: Record<string,string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const r = await fetchWithTimeout(`${getApiUrl()}/zawajil/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...form, gift_money_amount: Number(form.gift_money_amount) || 0 }),
      });
      const d = await r.json();
      if (!r.ok) { Alert.alert("خطأ", d.error || "فشل إرسال الطلب"); return; }
      setShowForm(false);
      setOrderSuccess(d.order_number);
      if (form.sender_phone) { setTrackPhone(form.sender_phone); loadMyOrders(form.sender_phone); }
      setTimeout(() => { setOrderSuccess(null); setTab("orders"); }, 3500);
    } catch { Alert.alert("خطأ", "تعذر الاتصال بالخادم، حاول مرة أخرى"); }
    finally { setSubmitting(false); }
  }

  const SVC_COLOR = selectedService?.color ?? PINK;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <LinearGradient
        colors={["#1F0D18", "#160B21", Colors.bg]}
        style={styles.header}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <LinearGradient colors={[PINK, "#BE185D"]} style={styles.logoCircle}>
            <Text style={{ fontSize: 22 }}>🎁</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>زواجل</Text>
            <Text style={styles.headerSub}>هدايا ورسائل توصيل بلمسة خاصة</Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>جديد</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(["send","orders"] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
            >
              {tab === t && (
                <LinearGradient colors={[PINK, "#BE185D"]} style={StyleSheet.absoluteFill} start={{ x:0,y:0 }} end={{ x:1,y:0 }} />
              )}
              <Ionicons
                name={t === "send" ? "gift-outline" : "list-outline"}
                size={15}
                color={tab === t ? "#fff" : Colors.textSecondary}
              />
              <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                {t === "send" ? "إرسال هدية" : "طلباتي"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ── Order Success Banner ── */}
      {orderSuccess && (
        <Animated.View entering={FadeInUp} style={styles.successBanner}>
          <LinearGradient colors={["#14532D","#166534"]} style={StyleSheet.absoluteFill} />
          <Ionicons name="checkmark-circle" size={22} color="#3EFF9C" />
          <View style={{ flex: 1 }}>
            <Text style={styles.successTitle}>تم إرسال طلبك بنجاح! 🎉</Text>
            <Text style={styles.successNum}>رقم الطلب: <Text style={{ color: "#3EFF9C", fontFamily: "Cairo_700Bold" }}>{orderSuccess}</Text></Text>
          </View>
        </Animated.View>
      )}

      {/* ══ Tab: إرسال هدية ══ */}
      {tab === "send" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Section label */}
          <View style={styles.sectionLabelRow}>
            <View style={styles.sectionAccentBar} />
            <Text style={styles.sectionTitle}>اختر نوع الخدمة</Text>
          </View>

          {SERVICES.map((svc, i) => (
            <Animated.View key={svc.key} entering={FadeInDown.delay(i * 70).springify()}>
              <TouchableOpacity
                onPress={() => openForm(svc)}
                activeOpacity={0.82}
                style={styles.serviceCard}
              >
                {/* Left color accent */}
                <View style={[styles.serviceAccent, { backgroundColor: svc.color }]} />

                <View style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 14 }}>
                  {/* Icon */}
                  <LinearGradient
                    colors={svc.gradient}
                    style={styles.svcIconBox}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  >
                    <Text style={{ fontSize: 22 }}>{svc.emoji}</Text>
                  </LinearGradient>

                  {/* Text */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <Text style={[styles.svcLabel, { color: svc.color }]}>{svc.label}</Text>
                      <View style={[styles.subtitleBadge, { backgroundColor: svc.color + "18", borderColor: svc.color + "33" }]}>
                        <Text style={[styles.svcSubtitle, { color: svc.color + "CC" }]}>{svc.subtitle}</Text>
                      </View>
                    </View>
                    <Text style={styles.svcDesc} numberOfLines={2}>{svc.description}</Text>
                  </View>

                  <Ionicons name="chevron-back" size={16} color={svc.color + "99"} />
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))}

          {/* Info boxes */}
          <View style={styles.infoBox}>
            <View style={styles.infoIconBg}>
              <Ionicons name="information-circle-outline" size={16} color="#38BDF8" />
            </View>
            <Text style={styles.infoText}>
              الهدايا من متجرنا أرخص لأنها لا تحتاج تكاليف جلب إضافية. الأسعار تُحدَّد بعد المراجعة بناءً على الموقع ونوع الخدمة.
            </Text>
          </View>

          <View style={[styles.infoBox, { borderColor: "#F59E0B33", backgroundColor: "#F59E0B09" }]}>
            <View style={[styles.infoIconBg, { backgroundColor: "#F59E0B18" }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#FCD34D" />
            </View>
            <Text style={[styles.infoText, { color: "#FDE68A" }]}>
              في حال رفض المستلم للهدية، تُعاد إليك كاملةً بدون أي تكاليف إضافية.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* ══ Tab: طلباتي ══ */}
      {tab === "orders" && (
        <View style={{ flex: 1 }}>
          {/* Search bar */}
          <View style={styles.trackBar}>
            <View style={styles.trackInputWrap}>
              <Ionicons name="phone-portrait-outline" size={16} color={Colors.textSecondary} style={{ marginLeft: 8 }} />
              <TextInput
                style={styles.trackInput}
                placeholder="أدخل رقم هاتفك لتتبع طلباتك"
                placeholderTextColor={Colors.textDisabled}
                value={trackPhone}
                onChangeText={setTrackPhone}
                keyboardType="phone-pad"
                textAlign="right"
              />
            </View>
            <TouchableOpacity style={styles.trackBtn} onPress={() => loadMyOrders()}>
              <LinearGradient colors={[PINK, "#BE185D"]} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />
              <Ionicons name="search" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMyOrders(); }} tintColor={PINK} />}
          >
            {loadingOrders ? (
              <ActivityIndicator color={PINK} style={{ marginTop: 40 }} />
            ) : myOrders.length === 0 ? (
              <Animated.View entering={FadeIn} style={styles.emptyOrders}>
                <Text style={{ fontSize: 52, marginBottom: 8 }}>🎁</Text>
                <Text style={styles.emptyTitle}>لا توجد طلبات</Text>
                <Text style={styles.emptyText}>أدخل رقم هاتفك لعرض طلباتك</Text>
              </Animated.View>
            ) : (
              myOrders.map((order, i) => {
                const st = STATUS_INFO[order.status] ?? STATUS_INFO.pending_review;
                const svc = SERVICES.find(s => s.key === order.service_type);
                const currentStep = st.step;
                return (
                  <Animated.View key={order.id} entering={FadeInDown.delay(i * 60)}>
                    <View style={[styles.orderCard, { borderColor: st.color + "33" }]}>
                      {/* Top color bar */}
                      <LinearGradient
                        colors={[st.color, st.color + "44"]}
                        style={styles.orderTopBar}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      />
                      <View style={{ padding: 14 }}>
                        {/* Header row */}
                        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <View>
                            <Text style={styles.orderNum}>{order.order_number}</Text>
                            <Text style={styles.orderDate}>{new Date(order.created_at).toLocaleDateString("ar-SA")}</Text>
                          </View>
                          <View style={[styles.statusChip, { backgroundColor: st.color + "1A", borderColor: st.color + "55" }]}>
                            <Ionicons name={st.icon} size={13} color={st.color} />
                            <Text style={[styles.statusLabel, { color: st.color }]}>{st.label}</Text>
                          </View>
                        </View>

                        {/* Progress pipeline (for active orders) */}
                        {currentStep > 0 && currentStep < 6 && (
                          <View style={styles.pipelineRow}>
                            {PIPELINE.map((pKey, pi) => {
                              const pInfo = STATUS_INFO[pKey];
                              const isDone = pi < PIPELINE.indexOf(order.status);
                              const isCurrent = pKey === order.status;
                              return (
                                <View key={pKey} style={styles.pipelineStep}>
                                  <View style={[
                                    styles.pipelineDot,
                                    isDone && { backgroundColor: "#22C55E", borderColor: "#22C55E" },
                                    isCurrent && { backgroundColor: st.color, borderColor: st.color, transform: [{ scale: 1.2 }] },
                                  ]}>
                                    {isDone && <Ionicons name="checkmark" size={8} color="#fff" />}
                                  </View>
                                  {pi < PIPELINE.length - 1 && (
                                    <View style={[styles.pipelineLine, isDone && { backgroundColor: "#22C55E44" }]} />
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}

                        {/* Tags */}
                        <View style={{ flexDirection: "row-reverse", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                          {svc && (
                            <View style={[styles.tagChip, { backgroundColor: svc.color + "18", borderColor: svc.color + "33" }]}>
                              <Text style={{ fontSize: 12 }}>{svc.emoji}</Text>
                              <Text style={[styles.tagText, { color: svc.color }]}>{svc.label}</Text>
                            </View>
                          )}
                          <View style={styles.tagChip}>
                            <Ionicons name="person-outline" size={11} color={Colors.textSecondary} />
                            <Text style={[styles.tagText, { color: Colors.textSecondary }]}>إلى: {order.recipient_name}</Text>
                          </View>
                          {order.delivery_location === "outside_city" && (
                            <View style={[styles.tagChip, { backgroundColor: "#F9731618", borderColor: "#F9731633" }]}>
                              <Ionicons name="location-outline" size={11} color="#F97316" />
                              <Text style={[styles.tagText, { color: "#F97316" }]}>خارج المدينة</Text>
                            </View>
                          )}
                        </View>

                        {order.estimated_cost > 0 && (
                          <View style={styles.costRow}>
                            <Ionicons name="pricetag-outline" size={13} color={GOLD} />
                            <Text style={styles.costText}>التكلفة: <Text style={{ color: GOLD, fontFamily: "Cairo_700Bold" }}>{Number(order.estimated_cost).toLocaleString()} SDG</Text></Text>
                          </View>
                        )}

                        {order.modification_request && (
                          <View style={styles.alertBox}>
                            <Ionicons name="create-outline" size={13} color="#F97316" />
                            <Text style={[styles.alertText, { color: "#FED7AA" }]}>{order.modification_request}</Text>
                          </View>
                        )}
                        {order.rejection_reason && (
                          <View style={[styles.alertBox, { backgroundColor: "#EF444415", borderColor: "#EF444430" }]}>
                            <Ionicons name="close-circle-outline" size={13} color="#EF4444" />
                            <Text style={[styles.alertText, { color: "#FCA5A5" }]}>{order.rejection_reason}</Text>
                          </View>
                        )}
                        {order.admin_notes && order.status === "approved" && (
                          <View style={[styles.alertBox, { backgroundColor: "#22C55E15", borderColor: "#22C55E30" }]}>
                            <Ionicons name="checkmark-circle-outline" size={13} color="#22C55E" />
                            <Text style={[styles.alertText, { color: "#86EFAC" }]}>{order.admin_notes}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* ══ Form Modal ══ */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalRoot}>
            {/* Modal Header */}
            <LinearGradient
              colors={selectedService ? [selectedService.gradient[0] + "22", Colors.bg] : [Colors.surface1, Colors.bg]}
              style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}
            >
              <TouchableOpacity onPress={() => setShowForm(false)} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
              <View style={{ alignItems: "center" }}>
                {selectedService && <Text style={{ fontSize: 28, marginBottom: 4 }}>{selectedService.emoji}</Text>}
                <Text style={styles.modalTitle}>{selectedService?.label}</Text>
                <Text style={styles.modalSub}>{selectedService?.subtitle}</Text>
              </View>
              <View style={{ width: 36 }} />
            </LinearGradient>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 18, paddingBottom: 60 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >

              {/* ── بيانات المرسل ── */}
              <SectionHead icon="person-circle-outline" title="بيانات المرسل" color="#94A3B8" />
              <Field label="اسمك الكريم *">
                <TextInput style={styles.input} value={form.sender_name} onChangeText={v => setForm(p=>({...p,sender_name:v}))} placeholder="اسم المرسل" placeholderTextColor={Colors.textDisabled} textAlign="right" />
              </Field>
              <Field label="رقم هاتفك (للتتبع)">
                <TextInput style={styles.input} value={form.sender_phone} onChangeText={v => setForm(p=>({...p,sender_phone:v}))} keyboardType="phone-pad" placeholder="09X XXX XXXX" placeholderTextColor={Colors.textDisabled} textAlign="right" />
              </Field>

              {/* ── بيانات المستلم ── */}
              <SectionHead icon="location-outline" title="بيانات المستلم" color={SVC_COLOR} />
              <Field label="اسم المستلم *">
                <TextInput style={styles.input} value={form.recipient_name} onChangeText={v => setForm(p=>({...p,recipient_name:v}))} placeholder="اسم من يستلم الهدية" placeholderTextColor={Colors.textDisabled} textAlign="right" />
              </Field>
              <Field label="رقم هاتف المستلم">
                <TextInput style={styles.input} value={form.recipient_phone} onChangeText={v => setForm(p=>({...p,recipient_phone:v}))} keyboardType="phone-pad" placeholder="09X XXX XXXX" placeholderTextColor={Colors.textDisabled} textAlign="right" />
              </Field>
              <Field label="العنوان / الحي">
                <TextInput style={styles.input} value={form.recipient_address} onChangeText={v => setForm(p=>({...p,recipient_address:v}))} placeholder="الحي والمنزل" placeholderTextColor={Colors.textDisabled} textAlign="right" />
              </Field>

              {/* ── موقع التوصيل ── */}
              <Field label="موقع التوصيل">
                <View style={styles.btnGroup}>
                  {(["inside_city","outside_city"] as const).map(loc => (
                    <TouchableOpacity
                      key={loc}
                      style={[styles.groupBtn, form.delivery_location === loc && { backgroundColor: SVC_COLOR + "22", borderColor: SVC_COLOR }]}
                      onPress={() => setForm(p=>({...p,delivery_location:loc}))}
                    >
                      <Ionicons
                        name={loc === "inside_city" ? "home-outline" : "map-outline"}
                        size={14}
                        color={form.delivery_location === loc ? SVC_COLOR : Colors.textSecondary}
                      />
                      <Text style={[styles.groupBtnText, form.delivery_location === loc && { color: SVC_COLOR }]}>
                        {loc === "inside_city" ? "داخل المدينة" : "خارج المدينة"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>

              {/* ── تفاصيل خاصة بالخدمة ── */}
              {form.service_type === "tabrikat" && (
                <>
                  <SectionHead icon="sparkles-outline" title="نوع المناسبة" color="#C084FC" />
                  <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                    {OCCASION_TYPES.map(o => (
                      <TouchableOpacity
                        key={o.key}
                        onPress={() => setForm(p=>({...p,occasion_type:o.key}))}
                        style={[styles.occasionBtn, form.occasion_type === o.key && { backgroundColor: "#C084FC22", borderColor: "#C084FC" }]}
                      >
                        <Text style={[styles.occasionBtnText, form.occasion_type === o.key && { color: "#C084FC" }]}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              {form.service_type === "shoubash" && (
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleTitle}>تقديم صوتي في حفل الزفاف 🎤</Text>
                    <Text style={styles.toggleSub}>موظف/ة متمكن/ة يقدم هديتك باحترافية أثناء الحفل</Text>
                  </View>
                  <Switch
                    value={form.voice_presentation}
                    onValueChange={v => setForm(p=>({...p,voice_presentation:v}))}
                    trackColor={{ false: Colors.surface2, true: GOLD + "66" }}
                    thumbColor={form.voice_presentation ? GOLD : Colors.textDisabled}
                  />
                </View>
              )}

              {/* ── الرسالة ── */}
              <SectionHead icon="chatbubble-ellipses-outline" title="الرسالة" color={SVC_COLOR} />
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>نصيغ الرسالة بالنيابة عنك ✍️</Text>
                  <Text style={styles.toggleSub}>فريقنا يكتب رسالة مناسبة تعبر عن غرضك</Text>
                </View>
                <Switch
                  value={form.message_by_us}
                  onValueChange={v => setForm(p=>({...p,message_by_us:v}))}
                  trackColor={{ false: Colors.surface2, true: SVC_COLOR+"66" }}
                  thumbColor={form.message_by_us ? SVC_COLOR : Colors.textDisabled}
                />
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.message_text}
                onChangeText={v => setForm(p=>({...p,message_text:v}))}
                placeholder={form.message_by_us ? "أخبرنا بالفكرة العامة وسنصيغها عنك (اختياري)" : "اكتب رسالتك هنا..."}
                placeholderTextColor={Colors.textDisabled}
                textAlign="right"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* ── الهدية ── */}
              <SectionHead icon="gift-outline" title="الهدية" color={SVC_COLOR} />
              <View style={{ gap: 8, marginBottom: 14 }}>
                {GIFT_TYPES.map(gt => (
                  <TouchableOpacity
                    key={gt.key}
                    onPress={() => setForm(p=>({...p,gift_type:gt.key,gift_product_id:null,gift_product_name:"",gift_external_desc:"",gift_money_amount:""}))}
                    style={[styles.giftTypeBtn, form.gift_type === gt.key && { backgroundColor: SVC_COLOR + "18", borderColor: SVC_COLOR }]}
                  >
                    <Ionicons name={gt.icon as any} size={18} color={form.gift_type === gt.key ? SVC_COLOR : Colors.textSecondary} />
                    <Text style={[styles.giftTypeBtnText, form.gift_type === gt.key && { color: SVC_COLOR }]}>{gt.label}</Text>
                    {form.gift_type === gt.key && <Ionicons name="checkmark-circle" size={16} color={SVC_COLOR} style={{ marginRight: "auto" }} />}
                  </TouchableOpacity>
                ))}
              </View>

              {form.gift_type === "from_store" && (
                loadingProducts ? <ActivityIndicator color={Colors.primary} /> : (
                  <View style={{ gap: 8, marginBottom: 14 }}>
                    <Text style={styles.fieldLabel}>اختر من المتجر</Text>
                    {products.length === 0 ? (
                      <View style={[styles.infoBox, { borderColor: Colors.divider }]}>
                        <Ionicons name="storefront-outline" size={16} color={Colors.textSecondary} />
                        <Text style={[styles.infoText, { color: Colors.textSecondary }]}>لا توجد منتجات متاحة حالياً — سيُضاف المتجر قريباً</Text>
                      </View>
                    ) : products.map(p => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => setForm(prev=>({...prev,gift_product_id:p.id,gift_product_name:p.name}))}
                        style={[styles.productCard, form.gift_product_id === p.id && { borderColor: SVC_COLOR, backgroundColor: SVC_COLOR + "10" }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.productName}>{p.name}</Text>
                          {p.description && <Text style={styles.productDesc} numberOfLines={1}>{p.description}</Text>}
                        </View>
                        <Text style={[styles.productPrice, { color: SVC_COLOR }]}>{Number(p.price).toLocaleString()} SDG</Text>
                        {form.gift_product_id === p.id && <Ionicons name="checkmark-circle" size={18} color={SVC_COLOR} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              )}

              {form.gift_type === "external" && (
                <Field label="وصف الهدية الخارجية">
                  <TextInput style={styles.input} value={form.gift_external_desc} onChangeText={v => setForm(p=>({...p,gift_external_desc:v}))} placeholder="مثال: مروحة ماركة X، غسالة أوتوماتيك..." placeholderTextColor={Colors.textDisabled} textAlign="right" />
                </Field>
              )}

              {form.gift_type === "money" && (
                <Field label="المبلغ المُهدى (SDG)">
                  <TextInput style={styles.input} value={form.gift_money_amount} onChangeText={v => setForm(p=>({...p,gift_money_amount:v}))} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textDisabled} textAlign="right" />
                </Field>
              )}

              {/* ── التعهد ── */}
              <SectionHead icon="shield-checkmark-outline" title="التعهد والموافقة" color="#F97316" />
              <View style={styles.pledgeBox}>
                <Text style={styles.pledgeText} numberOfLines={3}>{PLEDGE_TEXT}</Text>
                <TouchableOpacity onPress={() => setShowPledge(true)} style={styles.readFullBtn}>
                  <Ionicons name="open-outline" size={13} color="#38BDF8" />
                  <Text style={styles.readFullText}>قراءة التعهد كاملاً</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => setForm(p=>({...p,pledge_accepted:!p.pledge_accepted}))}
                style={styles.pledgeCheckRow}
              >
                <View style={[styles.checkbox, form.pledge_accepted && styles.checkboxChecked]}>
                  {form.pledge_accepted && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.pledgeCheckText, form.pledge_accepted && { color: "#3EFF9C" }]}>
                  قرأت التعهد وأوافق على جميع شروطه
                </Text>
              </TouchableOpacity>

              {/* ── تكلفة تقريبية ── */}
              <View style={[styles.infoBox, { marginBottom: 0, marginTop: 8, borderColor: "#0EA5E933", backgroundColor: "#0EA5E909" }]}>
                <View style={[styles.infoIconBg]}>
                  <Ionicons name="pricetag-outline" size={14} color="#38BDF8" />
                </View>
                <Text style={styles.infoText}>
                  سيتم إعلامك بالتكلفة المقدرة بعد مراجعة الطلب، تشمل التوصيل وأتعاب الخدمة حسب موقعك والهدية المختارة.
                </Text>
              </View>

              {/* ── زر الإرسال ── */}
              <TouchableOpacity
                onPress={submitOrder}
                disabled={submitting || !form.pledge_accepted}
                style={[styles.submitBtn, { opacity: !form.pledge_accepted ? 0.4 : submitting ? 0.7 : 1 }]}
              >
                {form.pledge_accepted && (
                  <LinearGradient
                    colors={[SVC_COLOR, SVC_COLOR + "BB"]}
                    style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  />
                )}
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color={form.pledge_accepted ? "#fff" : Colors.textDisabled} />
                    <Text style={[styles.submitBtnText, { color: form.pledge_accepted ? "#fff" : Colors.textDisabled }]}>إرسال الطلب</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Pledge Full Modal ── */}
      <Modal visible={showPledge} animationType="fade" transparent onRequestClose={() => setShowPledge(false)}>
        <Pressable style={styles.pledgeModalBg} onPress={() => setShowPledge(false)}>
          <Pressable style={styles.pledgeModalBox} onPress={e => e.stopPropagation()}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Ionicons name="shield-checkmark" size={20} color="#F97316" />
              <Text style={styles.pledgeModalTitle}>نص التعهد كاملاً</Text>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              <Text style={styles.pledgeModalText}>{PLEDGE_TEXT}</Text>
              <Text style={[styles.pledgeModalText, { marginTop: 12, color: "#FDE68A" }]}>
                ملاحظة: تحتفظ إدارة زواجل بحق رفض أي طلب لا يتوافق مع قيم وأخلاقيات المجتمع.
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.pledgeAcceptBtn}
              onPress={() => { setForm(p=>({...p,pledge_accepted:true})); setShowPledge(false); }}
            >
              <LinearGradient colors={["#F97316","#EA580C"]} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
              <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>قرأت وأتعهد</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPledge(false)} style={{ marginTop: 10, alignItems: "center" }}>
              <Text style={{ color: Colors.textSecondary, fontFamily: "Cairo_400Regular", fontSize: 13 }}>إغلاق</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Helper Components ──
function SectionHead({ icon, title, color }: { icon: keyof typeof Ionicons.glyphMap; title: string; color: string }) {
  return (
    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 10 }}>
      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: color + "18", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={[styles.sectionHeadText, { color }]}>{title}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: color + "20" }} />
    </View>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: { paddingBottom: 0 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12 },
  logoCircle: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  headerBadge: { backgroundColor: PINK + "22", borderWidth: 1, borderColor: PINK + "44", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  headerBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: PINK2 },

  // Tabs
  tabRow: { flexDirection: "row-reverse", paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  tabBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, overflow: "hidden", backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.divider },
  tabBtnActive: { borderColor: PINK + "55" },
  tabLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  tabLabelActive: { color: "#fff" },

  // Success banner
  successBanner: { flexDirection: "row-reverse", alignItems: "center", gap: 10, margin: 12, borderRadius: 14, padding: 14, overflow: "hidden", borderWidth: 1, borderColor: "#22C55E33" },
  successTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  successNum: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },

  // Services
  sectionLabelRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 14 },
  sectionAccentBar: { width: 4, height: 18, borderRadius: 2, backgroundColor: PINK },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },

  serviceCard: {
    borderRadius: 16, overflow: "hidden", marginBottom: 10,
    borderWidth: 1, borderColor: Colors.divider,
    backgroundColor: Colors.surface2,
    flexDirection: "row-reverse",
  },
  serviceAccent: { width: 4 },
  svcIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  svcLabel: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  subtitleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  svcSubtitle: { fontFamily: "Cairo_400Regular", fontSize: 11 },
  svcDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 18, textAlign: "right" },

  // Info boxes
  infoBox: { flexDirection: "row-reverse", gap: 10, backgroundColor: "#0EA5E909", borderWidth: 1, borderColor: "#0EA5E922", borderRadius: 12, padding: 12, marginBottom: 10, alignItems: "flex-start" },
  infoIconBg: { width: 26, height: 26, borderRadius: 8, backgroundColor: "#0EA5E918", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  infoText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: "#7DD3FC", lineHeight: 18, textAlign: "right" },

  // Track / Orders
  trackBar: { flexDirection: "row-reverse", gap: 8, padding: 14, backgroundColor: Colors.surface1, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  trackInputWrap: { flex: 1, flexDirection: "row-reverse", alignItems: "center", backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 10 },
  trackInput: { flex: 1, paddingVertical: 9, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14 },
  trackBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },

  emptyOrders: { alignItems: "center", marginTop: 60, gap: 6 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center" },

  // Order cards
  orderCard: { backgroundColor: Colors.surface2, borderRadius: 16, marginBottom: 12, overflow: "hidden", borderWidth: 1 },
  orderTopBar: { height: 3 },
  orderNum: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  orderDate: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right", marginTop: 1 },
  statusChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  statusLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },

  // Pipeline
  pipelineRow: { flexDirection: "row-reverse", alignItems: "center", marginVertical: 10 },
  pipelineStep: { flexDirection: "row-reverse", alignItems: "center", flex: 1 },
  pipelineDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: Colors.divider, backgroundColor: Colors.surface3, alignItems: "center", justifyContent: "center" },
  pipelineLine: { flex: 1, height: 2, backgroundColor: Colors.divider, marginHorizontal: 2 },

  tagChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: Colors.surface3, borderWidth: 1, borderColor: Colors.divider },
  tagText: { fontFamily: "Cairo_400Regular", fontSize: 11 },
  costRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 8 },
  costText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
  alertBox: { flexDirection: "row-reverse", gap: 6, backgroundColor: "#F9731615", borderRadius: 8, padding: 8, marginTop: 8, borderWidth: 1, borderColor: "#F9731630" },
  alertText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 18, textAlign: "right" },

  // Modal
  modalRoot: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { alignItems: "center", justifyContent: "space-between", flexDirection: "row-reverse", paddingHorizontal: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  closeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.surface2, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  modalSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  input: { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14 },
  textArea: { minHeight: 90, textAlignVertical: "top", paddingTop: 10 },
  fieldLabel: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary, marginBottom: 6, textAlign: "right" },
  sectionHeadText: { fontFamily: "Cairo_700Bold", fontSize: 13 },

  btnGroup: { flexDirection: "row-reverse", gap: 8 },
  groupBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface2 },
  groupBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  occasionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface2 },
  occasionBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  toggleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.surface2, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.divider },
  toggleTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  toggleSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right", marginTop: 2 },

  giftTypeBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface2 },
  giftTypeBtnText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  productCard: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface2 },
  productName: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  productDesc: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right" },
  productPrice: { fontFamily: "Cairo_700Bold", fontSize: 13 },

  pledgeBox: { backgroundColor: Colors.surface2, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#F9731622" },
  pledgeText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 20, textAlign: "right" },
  readFullBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 8 },
  readFullText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "#38BDF8" },

  pledgeCheckRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 18 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.divider, backgroundColor: Colors.surface2, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
  pledgeCheckText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },

  submitBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 14, marginTop: 16, overflow: "hidden", backgroundColor: Colors.surface3 },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  pledgeModalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 20 },
  pledgeModalBox: { backgroundColor: Colors.surface3, borderRadius: 20, padding: 22, width: "100%", borderWidth: 1, borderColor: Colors.divider },
  pledgeModalTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  pledgeModalText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },
  pledgeAcceptBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 16, overflow: "hidden" },
});
