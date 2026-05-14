import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView, Pressable, RefreshControl, Dimensions, Switch,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

const { width: W } = Dimensions.get("window");

type ServiceDef = {
  key: string; label: string; subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string; gradient: [string, string]; description: string;
};
const SERVICES: ServiceDef[] = [
  { key: "hamasat_itab", label: "همسات عتاب",  subtitle: "رسالة من القلب",     icon: "heart",        color: "#EC4899", gradient: ["#EC4899","#BE185D"], description: "أرسل رسالة شخصية تعبر عن مشاعرك — شوق، عتاب، اعتذار أو تقدير" },
  { key: "nifaj",        label: "نفاج",         subtitle: "النصيحة المهداة",    icon: "bulb",         color: "#F59E0B", gradient: ["#F59E0B","#D97706"], description: "رسالة نصيحة واعية موجهة لشخص تحب أن يتحسن أو يغير سلوكاً معيناً" },
  { key: "shoubash",     label: "شوبش",         subtitle: "مساحة العرسان",      icon: "diamond",      color: "#D4AF37", gradient: ["#D4AF37","#B7950B"], description: "هدايا الزواج مع تقديم صوتي احترافي خلال حفل الزفاف، يمكن مشاركة أكثر من شخص" },
  { key: "tabrikat",     label: "تبريكات",      subtitle: "مناسبات سعيدة",      icon: "sparkles",     color: "#C084FC", gradient: ["#C084FC","#9333EA"], description: "تهانٍ للخطوبة، التخرج، التفوق وكل المناسبات البهيجة" },
  { key: "salamat",      label: "سلامات",        subtitle: "للمرضى والمتعبين",  icon: "heart-half",   color: "#22C55E", gradient: ["#22C55E","#15803D"], description: "رسالة دعم ومؤازرة مصحوبة بهدية لمن يعاني المرض أو الوعكة" },
];

const STATUS_INFO: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending_review:         { label: "في انتظار المراجعة", color: "#F59E0B", icon: "time-outline"              },
  modification_requested: { label: "يحتاج تعديل",        color: "#F97316", icon: "create-outline"            },
  approved:               { label: "مقبول",               color: "#22C55E", icon: "checkmark-circle-outline"  },
  preparing:              { label: "جارٍ التجهيز",        color: "#0EA5E9", icon: "construct-outline"          },
  sending:                { label: "في الطريق",           color: "#C084FC", icon: "bicycle-outline"            },
  completed:              { label: "مكتمل ✓",             color: "#3EFF9C", icon: "checkmark-done-outline"     },
  rejected:               { label: "مرفوض",               color: "#EF4444", icon: "close-circle-outline"       },
  returned:               { label: "مُعادة للمرسل",      color: "#6B7280", icon: "return-down-back-outline"    },
};

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
    if (user?.phone) { base.sender_phone = user.phone; }
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

  const SVC_COLOR = selectedService?.color ?? "#EC4899";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <LinearGradient colors={["#1A0B12","#0D1910"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.logoCircle}>
            <Ionicons name="gift" size={24} color="#EC4899" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>زواجل</Text>
            <Text style={styles.headerSub}>توصيل الهدايا والرسائل الخاصة</Text>
          </View>
        </View>
        {/* Tabs */}
        <View style={styles.tabRow}>
          {(["send","orders"] as const).map(t => (
            <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
              <Ionicons name={t === "send" ? "gift-outline" : "list-outline"} size={14} color={tab === t ? "#EC4899" : Colors.textMuted} />
              <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>{t === "send" ? "إرسال هدية" : "طلباتي"}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ── Order Success Banner ── */}
      {orderSuccess && (
        <Animated.View entering={FadeIn} style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={20} color="#3EFF9C" />
          <Text style={styles.successText}>تم إرسال طلبك بنجاح! رقم الطلب: <Text style={{ color: "#3EFF9C", fontFamily: "Cairo_700Bold" }}>{orderSuccess}</Text></Text>
        </Animated.View>
      )}

      {/* ══ Tab: إرسال هدية ══ */}
      {tab === "send" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>اختر نوع الخدمة</Text>
          {SERVICES.map((svc, i) => (
            <Animated.View key={svc.key} entering={FadeInDown.delay(i * 80).springify()}>
              <TouchableOpacity onPress={() => openForm(svc)} activeOpacity={0.85} style={styles.serviceCard}>
                <LinearGradient colors={["#1A1A2E","#16213E"]} style={StyleSheet.absoluteFill} />
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 14 }}>
                  <View style={[styles.svcIconBox, { backgroundColor: svc.color + "22", borderColor: svc.color + "44" }]}>
                    <LinearGradient colors={svc.gradient} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                    <Ionicons name={svc.icon} size={26} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <Text style={[styles.svcLabel, { color: svc.color }]}>{svc.label}</Text>
                      <Text style={styles.svcSubtitle}>{svc.subtitle}</Text>
                    </View>
                    <Text style={styles.svcDesc} numberOfLines={2}>{svc.description}</Text>
                  </View>
                  <Ionicons name="chevron-back" size={18} color={svc.color + "88"} />
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))}

          {/* Info boxes */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color="#0EA5E9" />
            <Text style={styles.infoText}>الهدايا من متجرنا أرخص لأنها لا تحتاج تكاليف جلب إضافية. الأسعار تُحدَّد بعد المراجعة بناءً على الموقع ونوع الخدمة.</Text>
          </View>
          <View style={[styles.infoBox, { borderColor: "#F59E0B33", backgroundColor: "#F59E0B0A" }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#F59E0B" />
            <Text style={[styles.infoText, { color: "#FCD34D" }]}>في حال رفض المستلم للهدية، تُعاد إليك كاملةً بدون أي تكاليف إضافية.</Text>
          </View>
        </ScrollView>
      )}

      {/* ══ Tab: طلباتي ══ */}
      {tab === "orders" && (
        <View style={{ flex: 1 }}>
          <View style={styles.trackBar}>
            <TextInput
              style={styles.trackInput}
              placeholder="أدخل رقم هاتفك لتتبع طلباتك"
              placeholderTextColor={Colors.textMuted}
              value={trackPhone}
              onChangeText={setTrackPhone}
              keyboardType="phone-pad"
              textAlign="right"
            />
            <TouchableOpacity style={styles.trackBtn} onPress={() => loadMyOrders()}>
              <Ionicons name="search" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMyOrders(); }} tintColor={Colors.primary} />}
          >
            {loadingOrders ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
            ) : myOrders.length === 0 ? (
              <View style={styles.emptyOrders}>
                <Ionicons name="gift-outline" size={52} color={Colors.textMuted} />
                <Text style={styles.emptyText}>أدخل رقم هاتفك لعرض طلباتك</Text>
              </View>
            ) : (
              myOrders.map((order, i) => {
                const st = STATUS_INFO[order.status] ?? STATUS_INFO.pending_review;
                const svc = SERVICES.find(s => s.key === order.service_type);
                return (
                  <Animated.View key={order.id} entering={FadeInDown.delay(i * 60)}>
                    <View style={styles.orderCard}>
                      <View style={[styles.orderSidebar, { backgroundColor: svc?.color ?? "#EC4899" }]} />
                      <View style={{ flex: 1, padding: 14 }}>
                        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <View>
                            <Text style={styles.orderNum}>{order.order_number}</Text>
                            <Text style={styles.orderDate}>{new Date(order.created_at).toLocaleDateString("ar-SA")}</Text>
                          </View>
                          <View style={[styles.statusChip, { backgroundColor: st.color + "18", borderColor: st.color + "44" }]}>
                            <Ionicons name={st.icon} size={12} color={st.color} />
                            <Text style={[styles.statusLabel, { color: st.color }]}>{st.label}</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" }}>
                          <View style={[styles.tagChip, { backgroundColor: (svc?.color ?? "#EC4899") + "15" }]}>
                            <Text style={[styles.tagText, { color: svc?.color ?? "#EC4899" }]}>{svc?.label ?? order.service_type}</Text>
                          </View>
                          <View style={styles.tagChip}>
                            <Ionicons name="person-outline" size={11} color={Colors.textMuted} />
                            <Text style={styles.tagText}>إلى: {order.recipient_name}</Text>
                          </View>
                          {order.delivery_location === "outside_city" && (
                            <View style={[styles.tagChip, { backgroundColor: "#F9731615" }]}>
                              <Text style={[styles.tagText, { color: "#F97316" }]}>خارج المدينة</Text>
                            </View>
                          )}
                        </View>
                        {order.estimated_cost > 0 && (
                          <Text style={styles.costText}>التكلفة المقدرة: <Text style={{ color: Colors.primary, fontFamily: "Cairo_700Bold" }}>{Number(order.estimated_cost).toLocaleString()} SDG</Text></Text>
                        )}
                        {order.modification_request && (
                          <View style={styles.modBox}>
                            <Ionicons name="create-outline" size={13} color="#F97316" />
                            <Text style={styles.modText}>{order.modification_request}</Text>
                          </View>
                        )}
                        {order.rejection_reason && (
                          <View style={[styles.modBox, { backgroundColor: "#EF444415", borderColor: "#EF444430" }]}>
                            <Ionicons name="close-circle-outline" size={13} color="#EF4444" />
                            <Text style={[styles.modText, { color: "#FCA5A5" }]}>{order.rejection_reason}</Text>
                          </View>
                        )}
                        {order.admin_notes && order.status === "approved" && (
                          <View style={[styles.modBox, { backgroundColor: "#22C55E15", borderColor: "#22C55E30" }]}>
                            <Ionicons name="checkmark-circle-outline" size={13} color="#22C55E" />
                            <Text style={[styles.modText, { color: "#86EFAC" }]}>{order.admin_notes}</Text>
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
            <View style={[styles.modalHeader, { paddingTop: insets.top + 10 }]}>
              <TouchableOpacity onPress={() => setShowForm(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{selectedService?.label}</Text>
              {selectedService && <View style={[styles.svcDot, { backgroundColor: selectedService.color }]} />}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* ── بيانات المرسل ── */}
              <SectionHead icon="person-circle-outline" title="بيانات المرسل" color="#6B7280" />
              <Field label="اسمك الكريم *">
                <TextInput style={styles.input} value={form.sender_name} onChangeText={v => setForm(p=>({...p,sender_name:v}))} placeholder="اسم المرسل" placeholderTextColor={Colors.textMuted} textAlign="right" />
              </Field>
              <Field label="رقم هاتفك (للتتبع)">
                <TextInput style={styles.input} value={form.sender_phone} onChangeText={v => setForm(p=>({...p,sender_phone:v}))} keyboardType="phone-pad" placeholder="09X XXX XXXX" placeholderTextColor={Colors.textMuted} textAlign="right" />
              </Field>

              {/* ── بيانات المستلم ── */}
              <SectionHead icon="location-outline" title="بيانات المستلم" color={SVC_COLOR} />
              <Field label="اسم المستلم *">
                <TextInput style={styles.input} value={form.recipient_name} onChangeText={v => setForm(p=>({...p,recipient_name:v}))} placeholder="اسم من يستلم الهدية" placeholderTextColor={Colors.textMuted} textAlign="right" />
              </Field>
              <Field label="رقم هاتف المستلم">
                <TextInput style={styles.input} value={form.recipient_phone} onChangeText={v => setForm(p=>({...p,recipient_phone:v}))} keyboardType="phone-pad" placeholder="09X XXX XXXX" placeholderTextColor={Colors.textMuted} textAlign="right" />
              </Field>
              <Field label="العنوان / الحي">
                <TextInput style={styles.input} value={form.recipient_address} onChangeText={v => setForm(p=>({...p,recipient_address:v}))} placeholder="الحي والمنزل" placeholderTextColor={Colors.textMuted} textAlign="right" />
              </Field>

              {/* ── موقع التوصيل ── */}
              <Field label="موقع التوصيل">
                <View style={styles.btnGroup}>
                  {(["inside_city","outside_city"] as const).map(loc => (
                    <TouchableOpacity key={loc} style={[styles.groupBtn, form.delivery_location === loc && { backgroundColor: SVC_COLOR + "22", borderColor: SVC_COLOR }]} onPress={() => setForm(p=>({...p,delivery_location:loc}))}>
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
                      <TouchableOpacity key={o.key} onPress={() => setForm(p=>({...p,occasion_type:o.key}))}
                        style={[styles.occasionBtn, form.occasion_type === o.key && { backgroundColor: "#C084FC22", borderColor: "#C084FC" }]}>
                        <Text style={[styles.occasionBtnText, form.occasion_type === o.key && { color: "#C084FC" }]}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              {form.service_type === "shoubash" && (
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleTitle}>تقديم صوتي في حفل الزفاف</Text>
                    <Text style={styles.toggleSub}>موظف/ة متمكن/ة يقدم هديتك باحترافية أثناء الحفل</Text>
                  </View>
                  <Switch value={form.voice_presentation} onValueChange={v => setForm(p=>({...p,voice_presentation:v}))} trackColor={{ false: Colors.cardBg, true: "#D4AF3755" }} thumbColor={form.voice_presentation ? "#D4AF37" : Colors.textMuted} />
                </View>
              )}

              {/* ── الرسالة ── */}
              <SectionHead icon="chatbubble-ellipses-outline" title="الرسالة" color={SVC_COLOR} />
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>نصيغ الرسالة بالنيابة عنك</Text>
                  <Text style={styles.toggleSub}>فريقنا يكتب رسالة مناسبة تعبر عن غرضك</Text>
                </View>
                <Switch value={form.message_by_us} onValueChange={v => setForm(p=>({...p,message_by_us:v}))} trackColor={{ false: Colors.cardBg, true: SVC_COLOR+"55" }} thumbColor={form.message_by_us ? SVC_COLOR : Colors.textMuted} />
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.message_text}
                onChangeText={v => setForm(p=>({...p,message_text:v}))}
                placeholder={form.message_by_us ? "أخبرنا بالفكرة العامة وسنصيغها عنك (اختياري)" : "اكتب رسالتك هنا..."}
                placeholderTextColor={Colors.textMuted}
                textAlign="right"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* ── الهدية ── */}
              <SectionHead icon="gift-outline" title="الهدية" color={SVC_COLOR} />
              <View style={{ gap: 8, marginBottom: 14 }}>
                {GIFT_TYPES.map(gt => (
                  <TouchableOpacity key={gt.key} onPress={() => setForm(p=>({...p,gift_type:gt.key,gift_product_id:null,gift_product_name:"",gift_external_desc:"",gift_money_amount:""}))}
                    style={[styles.giftTypeBtn, form.gift_type === gt.key && { backgroundColor: SVC_COLOR + "18", borderColor: SVC_COLOR }]}>
                    <Ionicons name={gt.icon as any} size={18} color={form.gift_type === gt.key ? SVC_COLOR : Colors.textMuted} />
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
                      <Text style={styles.emptySmall}>لا توجد منتجات متاحة حالياً — سيُضاف المتجر قريباً</Text>
                    ) : products.map(p => (
                      <TouchableOpacity key={p.id} onPress={() => setForm(prev=>({...prev,gift_product_id:p.id,gift_product_name:p.name}))}
                        style={[styles.productCard, form.gift_product_id === p.id && { borderColor: SVC_COLOR, backgroundColor: SVC_COLOR + "10" }]}>
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
                  <TextInput style={styles.input} value={form.gift_external_desc} onChangeText={v => setForm(p=>({...p,gift_external_desc:v}))} placeholder="مثال: مروحة ماركة X، غسالة أوتوماتيك..." placeholderTextColor={Colors.textMuted} textAlign="right" />
                </Field>
              )}

              {form.gift_type === "money" && (
                <Field label="المبلغ المُهدى (SDG)">
                  <TextInput style={styles.input} value={form.gift_money_amount} onChangeText={v => setForm(p=>({...p,gift_money_amount:v}))} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textMuted} textAlign="right" />
                </Field>
              )}

              {/* ── التعهد ── */}
              <SectionHead icon="shield-checkmark-outline" title="التعهد والموافقة" color="#F97316" />
              <View style={styles.pledgeBox}>
                <Text style={styles.pledgeText}>{PLEDGE_TEXT}</Text>
                <TouchableOpacity onPress={() => setShowPledge(true)} style={styles.readFullBtn}>
                  <Text style={styles.readFullText}>قراءة التعهد كاملاً</Text>
                  <Ionicons name="open-outline" size={13} color="#0EA5E9" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setForm(p=>({...p,pledge_accepted:!p.pledge_accepted}))} style={styles.pledgeCheckRow}>
                <View style={[styles.checkbox, form.pledge_accepted && styles.checkboxChecked]}>
                  {form.pledge_accepted && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.pledgeCheckText, form.pledge_accepted && { color: "#3EFF9C" }]}>قرأت التعهد وأوافق على جميع شروطه</Text>
              </TouchableOpacity>

              {/* ── تكلفة تقريبية ── */}
              <View style={[styles.infoBox, { marginBottom: 0, marginTop: 8 }]}>
                <Ionicons name="pricetag-outline" size={16} color="#0EA5E9" />
                <Text style={styles.infoText}>سيتم إعلامك بالتكلفة المقدرة بعد مراجعة الطلب، تشمل التوصيل وأتعاب الخدمة حسب موقعك والهدية المختارة.</Text>
              </View>

              {/* ── زر الإرسال ── */}
              <TouchableOpacity
                onPress={submitOrder}
                disabled={submitting || !form.pledge_accepted}
                style={[styles.submitBtn, { backgroundColor: form.pledge_accepted ? SVC_COLOR : Colors.cardBg, opacity: submitting ? 0.7 : 1 }]}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>إرسال الطلب</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Pledge Full Modal ── */}
      <Modal visible={showPledge} animationType="fade" transparent onRequestClose={() => setShowPledge(false)}>
        <View style={styles.pledgeModalBg}>
          <View style={styles.pledgeModalBox}>
            <Text style={styles.pledgeModalTitle}>نص التعهد كاملاً</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <Text style={styles.pledgeModalText}>{PLEDGE_TEXT}</Text>
              <Text style={[styles.pledgeModalText, { marginTop: 12, color: "#FCD34D" }]}>
                ملاحظة: تحتفظ إدارة زواجل بحق رفض أي طلب لا يتوافق مع قيم وأخلاقيات المجتمع.
              </Text>
            </ScrollView>
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: "#F97316", marginTop: 16 }]} onPress={() => { setForm(p=>({...p,pledge_accepted:true})); setShowPledge(false); }}>
              <Text style={styles.submitBtnText}>قرأت وأتعهد</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPledge(false)} style={{ marginTop: 10, alignItems: "center" }}>
              <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", fontSize: 13 }}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Helper Components ──
function SectionHead({ icon, title, color }: { icon: keyof typeof Ionicons.glyphMap; title: string; color: string }) {
  return (
    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 18, marginBottom: 10 }}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={[styles.sectionHeadText, { color }]}>{title}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: color + "25" }} />
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
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingBottom: 0 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 },
  logoCircle: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#EC489920", borderWidth: 1, borderColor: "#EC489944", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  tabRow: { flexDirection: "row-reverse", paddingHorizontal: 18, paddingBottom: 14, gap: 6 },
  tabBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.cardBg },
  tabBtnActive: { backgroundColor: "#EC489918", borderWidth: 1, borderColor: "#EC489944" },
  tabLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  tabLabelActive: { color: "#EC4899" },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, marginBottom: 14, textAlign: "right" },
  serviceCard: { borderRadius: 16, overflow: "hidden", marginBottom: 12, borderWidth: 1, borderColor: Colors.divider, padding: 16 },
  svcIconBox: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, overflow: "hidden" },
  svcLabel: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  svcSubtitle: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  svcDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19, textAlign: "right" },
  infoBox: { flexDirection: "row-reverse", gap: 8, backgroundColor: "#0EA5E90A", borderWidth: 1, borderColor: "#0EA5E933", borderRadius: 12, padding: 12, marginBottom: 12 },
  infoText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: "#7DD3FC", lineHeight: 18, textAlign: "right" },
  trackBar: { flexDirection: "row-reverse", gap: 8, padding: 14, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  trackInput: { flex: 1, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.divider, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14 },
  trackBtn: { width: 42, height: 42, borderRadius: 10, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  emptyOrders: { alignItems: "center", marginTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textMuted, textAlign: "center" },
  orderCard: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderRadius: 14, marginBottom: 12, overflow: "hidden", borderWidth: 1, borderColor: Colors.divider },
  orderSidebar: { width: 4 },
  orderNum: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  orderDate: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  statusChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  statusLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  tagChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: Colors.cardBgElevated },
  tagText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  costText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8, textAlign: "right" },
  modBox: { flexDirection: "row-reverse", gap: 6, backgroundColor: "#F9731615", borderRadius: 8, padding: 8, marginTop: 8, borderWidth: 1, borderColor: "#F9731630" },
  modText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: "#FED7AA", lineHeight: 18, textAlign: "right" },
  // ── Modal ──
  modalRoot: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  svcDot: { width: 10, height: 10, borderRadius: 5 },
  input: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14 },
  textArea: { minHeight: 90, textAlignVertical: "top", paddingTop: 10 },
  fieldLabel: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, marginBottom: 6, textAlign: "right" },
  sectionHeadText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  btnGroup: { flexDirection: "row-reverse", gap: 8 },
  groupBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg, alignItems: "center" },
  groupBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  occasionBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  occasionBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  toggleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.divider },
  toggleTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  toggleSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  giftTypeBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  giftTypeBtnText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  productCard: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  productName: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  productDesc: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  productPrice: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  emptySmall: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", padding: 12 },
  pledgeBox: { backgroundColor: "#F9731608", borderWidth: 1, borderColor: "#F9731630", borderRadius: 12, padding: 14, marginBottom: 12 },
  pledgeText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 20, textAlign: "right" },
  readFullBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 8 },
  readFullText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#0EA5E9" },
  pledgeCheckRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 14 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: Colors.divider, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
  pledgeCheckText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  submitBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 16 },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  successBanner: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: "#22C55E15", borderWidth: 1, borderColor: "#22C55E40", margin: 12, padding: 12, borderRadius: 12 },
  successText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: "#86EFAC", textAlign: "right" },
  pledgeModalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 },
  pledgeModalBox: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 20, width: "100%" },
  pledgeModalTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "center", marginBottom: 14 },
  pledgeModalText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 21, textAlign: "right" },
});
