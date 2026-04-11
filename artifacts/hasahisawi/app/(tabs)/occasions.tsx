import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Linking, Platform,
  KeyboardAvoidingView, Keyboard, RefreshControl,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

// ── ثوابت ───────────────────────────────────────────────────────────────────
const GOLD   = "#D97706";
const GOLD2  = "#F59E0B";
const PURPLE = "#7C3AED";
const BG     = "#0A1A10";
const CARD   = "#0E2318";

// ── أنواع الأصناف ────────────────────────────────────────────────────────────
type Category = {
  key: string;
  label: string;
  icon: string;
  color: string;
};
const CATEGORIES: Category[] = [
  { key: "tent",       label: "صيوانات",    icon: "tent",               color: GOLD   },
  { key: "chairs",     label: "كراسي",      icon: "chair-rolling",      color: "#22C55E" },
  { key: "tables",     label: "ترابيز",     icon: "table-furniture",    color: Colors.cyber },
  { key: "sound",      label: "صوتيات",     icon: "speaker",            color: "#EC4899" },
  { key: "lighting",   label: "إضاءة",      icon: "lightbulb-on",       color: GOLD2  },
  { key: "decoration", label: "ديكور",      icon: "flower",             color: "#A855F7" },
  { key: "catering",   label: "تقديم",      icon: "food-fork-drink",    color: "#F97316" },
  { key: "generator",  label: "مولدات",     icon: "engine",             color: "#6B7280" },
  { key: "coolers",    label: "كولرات",     icon: "air-conditioner",    color: "#38BDF8" },
  { key: "other",      label: "متنوع",      icon: "package-variant",    color: Colors.textMuted },
];

// ── أنواع المواصلات ───────────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  { key: "bus",     label: "باص",          icon: "bus",           color: GOLD   },
  { key: "haisa",   label: "هايسة",        icon: "van-utility",   color: Colors.cyber },
  { key: "minibus", label: "ميني باص",     icon: "bus-side",      color: "#22C55E" },
  { key: "truck",   label: "شاحنة",        icon: "truck",         color: "#F97316" },
  { key: "car",     label: "سيارة خاصة",  icon: "car",           color: PURPLE },
];

function getVehicle(key: string) {
  return VEHICLE_TYPES.find(v => v.key === key) ?? VEHICLE_TYPES[1];
}
function getCat(key: string) {
  return CATEGORIES.find(c => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

// ── أنواع البيانات ────────────────────────────────────────────────────────────
type OccasionItem = {
  id: number;
  shop_id: number;
  name: string;
  category: string;
  icon: string;
  price_hint: string;
  quantity: number;
  is_available: boolean;
};
type OccasionShop = {
  id: number;
  owner_name: string;
  shop_name: string;
  phone: string;
  whatsapp: string;
  city_area: string;
  description: string;
  social_link: string;
  items: OccasionItem[];
};
type OccasionTransport = {
  id: number;
  owner_name: string;
  vehicle_type: string;
  vehicle_desc: string;
  capacity: number;
  phone: string;
  whatsapp: string;
  area: string;
  notes: string;
  is_available: boolean;
};

// ── قسم الرأس ────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <LinearGradient colors={["#1A0E00", "#0A1A10"]} style={h.hero}>
      <View style={h.heroContent}>
        <View style={h.iconCircle}>
          <MaterialCommunityIcons name="party-popper" size={38} color={GOLD} />
        </View>
        <Text style={h.heroTitle}>مناسبتي</Text>
        <Text style={h.heroSub}>
          كل ما تحتاجه لمناسباتك في مكان واحد — صيوانات، كراسي، ترابيز، صوتيات ومواصلات
        </Text>
      </View>

      {/* ── إحصائيات ── */}
      <View style={h.statsRow}>
        {[
          { icon: "storefront-outline" as const,  label: "المحلات",    sub: "مُعتمدة" },
          { icon: "car-outline" as const,          label: "مواصلات",   sub: "جاهزة"   },
          { icon: "checkmark-circle-outline" as const, label: "أصناف",sub: "متوفرة"  },
        ].map((s, i) => (
          <View key={i} style={h.statCard}>
            <Ionicons name={s.icon} size={20} color={GOLD} />
            <Text style={h.statLabel}>{s.label}</Text>
            <Text style={h.statSub}>{s.sub}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

// ── كرت محل ──────────────────────────────────────────────────────────────────
function ShopCard({ shop, index }: { shop: OccasionShop; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const availCount = shop.items.filter(i => i.is_available).length;

  function callShop()      { Linking.openURL(`tel:${shop.phone}`); }
  function whatsappShop()  {
    const msg = encodeURIComponent(`السلام عليكم، أريد الاستفسار عن خدماتكم في مناسبتي`);
    Linking.openURL(`whatsapp://send?phone=${shop.whatsapp}&text=${msg}`).catch(() =>
      Linking.openURL(`https://wa.me/${shop.whatsapp}?text=${msg}`)
    );
  }

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
      <TouchableOpacity
        style={s.shopCard}
        activeOpacity={0.88}
        onPress={() => {
          setExpanded(!expanded);
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
      >
        {/* ── رأس الكرت ── */}
        <LinearGradient colors={["#1C0C00", CARD]} style={s.shopHeader}>
          <View style={s.shopAvatar}>
            <MaterialCommunityIcons name="storefront" size={26} color={GOLD} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.shopName}>{shop.shop_name}</Text>
            <Text style={s.shopOwner}>{shop.owner_name}</Text>
            {shop.city_area ? <Text style={s.shopArea}>{shop.city_area}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <View style={[s.availBadge, { backgroundColor: availCount > 0 ? "#15803D22" : "#7F1D1D22", borderColor: availCount > 0 ? "#15803D55" : "#7F1D1D55" }]}>
              <Text style={[s.availText, { color: availCount > 0 ? "#22C55E" : "#F87171" }]}>
                {availCount}/{shop.items.length} متوفر
              </Text>
            </View>
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
          </View>
        </LinearGradient>

        {/* ── وصف المحل ── */}
        {shop.description ? (
          <Text style={s.shopDesc}>{shop.description}</Text>
        ) : null}

        {/* ── قائمة الأصناف ── */}
        {expanded && (
          <Animated.View entering={FadeIn.duration(200)} style={s.itemsGrid}>
            {shop.items.length === 0 ? (
              <Text style={s.noItems}>لا توجد أصناف مضافة بعد</Text>
            ) : (
              shop.items.map(item => {
                const cat = getCat(item.category);
                return (
                  <View key={item.id} style={[s.itemChip, !item.is_available && s.itemChipOff]}>
                    <MaterialCommunityIcons
                      name={item.icon as any || cat.icon as any}
                      size={16}
                      color={item.is_available ? cat.color : Colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.itemName, !item.is_available && { color: Colors.textMuted }]}>
                        {item.name}
                      </Text>
                      {item.price_hint ? (
                        <Text style={s.itemPrice}>{item.price_hint}</Text>
                      ) : null}
                    </View>
                    <View style={[s.availDot, { backgroundColor: item.is_available ? "#22C55E" : "#6B7280" }]} />
                  </View>
                );
              })
            )}
          </Animated.View>
        )}

        {/* ── أزرار التواصل ── */}
        <View style={s.shopActions}>
          <TouchableOpacity style={[s.actionBtn, { borderColor: "#25D36640" }]} onPress={whatsappShop} activeOpacity={0.8}>
            <Ionicons name="logo-whatsapp" size={17} color="#25D366" />
            <Text style={[s.actionBtnText, { color: "#25D366" }]}>واتساب</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.primary + "40" }]} onPress={callShop} activeOpacity={0.8}>
            <Ionicons name="call-outline" size={17} color={Colors.primary} />
            <Text style={[s.actionBtnText, { color: Colors.primary }]}>اتصال</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── كرت مواصلات ──────────────────────────────────────────────────────────────
function TransportCard({ t, index }: { t: OccasionTransport; index: number }) {
  const vehicle = getVehicle(t.vehicle_type);

  function callOwner() { Linking.openURL(`tel:${t.phone}`); }
  function whatsappOwner() {
    const msg = encodeURIComponent(`السلام عليكم، أريد الاستفسار عن خدمة المواصلات للمناسبات`);
    Linking.openURL(`whatsapp://send?phone=${t.whatsapp || t.phone}&text=${msg}`).catch(() =>
      Linking.openURL(`https://wa.me/${t.whatsapp || t.phone}?text=${msg}`)
    );
  }

  return (
    <Animated.View entering={FadeInDown.delay(index * 70).springify()}>
      <View style={[s.transportCard, !t.is_available && { opacity: 0.65 }]}>
        <LinearGradient colors={[vehicle.color + "18", CARD]} style={s.transportLeft}>
          <View style={[s.transportIcon, { backgroundColor: vehicle.color + "22", borderColor: vehicle.color + "50" }]}>
            <MaterialCommunityIcons name={vehicle.icon as any} size={28} color={vehicle.color} />
          </View>
          <View style={[s.availPill, { backgroundColor: t.is_available ? "#15803D22" : "#7F1D1D22" }]}>
            <View style={[s.availDot, { backgroundColor: t.is_available ? "#22C55E" : "#6B7280", width: 7, height: 7 }]} />
            <Text style={[s.availPillText, { color: t.is_available ? "#22C55E" : "#9CA3AF" }]}>
              {t.is_available ? "متاح" : "مشغول"}
            </Text>
          </View>
        </LinearGradient>

        <View style={s.transportBody}>
          <Text style={s.transportName}>{t.owner_name}</Text>
          <Text style={[s.transportType, { color: vehicle.color }]}>{vehicle.label}</Text>
          {t.vehicle_desc ? <Text style={s.transportDesc}>{t.vehicle_desc}</Text> : null}

          <View style={s.transportMeta}>
            {t.capacity > 0 ? (
              <View style={s.metaTag}>
                <Ionicons name="people-outline" size={12} color={Colors.textMuted} />
                <Text style={s.metaTagText}>{t.capacity} مقعد</Text>
              </View>
            ) : null}
            {t.area ? (
              <View style={s.metaTag}>
                <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                <Text style={s.metaTagText}>{t.area}</Text>
              </View>
            ) : null}
          </View>

          {t.notes ? <Text style={s.transportNotes}>{t.notes}</Text> : null}

          <View style={s.shopActions}>
            <TouchableOpacity style={[s.actionBtn, { borderColor: "#25D36640" }]} onPress={whatsappOwner} activeOpacity={0.8}>
              <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
              <Text style={[s.actionBtnText, { color: "#25D366" }]}>واتساب</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.primary + "40" }]} onPress={callOwner} activeOpacity={0.8}>
              <Ionicons name="call-outline" size={16} color={Colors.primary} />
              <Text style={[s.actionBtnText, { color: Colors.primary }]}>اتصال</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ── نموذج الانضمام ────────────────────────────────────────────────────────────
function JoinTab() {
  const [joinType, setJoinType] = useState<"shop" | "transport">("shop");
  const [sending, setSending] = useState(false);
  const [done, setDone]     = useState(false);

  // حقول المحل
  const [ownerName,  setOwnerName]  = useState("");
  const [shopName,   setShopName]   = useState("");
  const [phone,      setPhone]      = useState("");
  const [whatsapp,   setWhatsapp]   = useState("");
  const [cityArea,   setCityArea]   = useState("");
  const [desc,       setDesc]       = useState("");
  const [social,     setSocial]     = useState("");

  // حقول المواصلات
  const [vOwnerName, setVOwnerName] = useState("");
  const [vType,      setVType]      = useState("haisa");
  const [vDesc,      setVDesc]      = useState("");
  const [vCap,       setVCap]       = useState("");
  const [vPhone,     setVPhone]     = useState("");
  const [vArea,      setVArea]      = useState("");
  const [vNotes,     setVNotes]     = useState("");

  function reset() {
    setOwnerName(""); setShopName(""); setPhone(""); setWhatsapp("");
    setCityArea(""); setDesc(""); setSocial("");
    setVOwnerName(""); setVType("haisa"); setVDesc(""); setVCap("");
    setVPhone(""); setVArea(""); setVNotes("");
  }

  async function submitShop() {
    if (!ownerName.trim() || !shopName.trim() || !phone.trim())
      return Alert.alert("بيانات ناقصة", "الاسم، اسم المحل، ورقم الهاتف مطلوبة");
    Keyboard.dismiss();
    setSending(true);
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const res = await fetch(`${base}/api/occasions/join-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_name: ownerName.trim(),
          shop_name:  shopName.trim(),
          phone:      phone.trim(),
          whatsapp:   whatsapp.trim() || phone.trim(),
          city_area:  cityArea.trim(),
          description: desc.trim(),
          social_link: social.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) return Alert.alert("خطأ", data.error ?? "حدث خطأ");
      reset();
      setDone(true);
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally {
      setSending(false);
    }
  }

  async function submitTransport() {
    if (!vOwnerName.trim() || !vPhone.trim())
      return Alert.alert("بيانات ناقصة", "الاسم ورقم الهاتف مطلوبان");
    Keyboard.dismiss();
    setSending(true);
    try {
      const base2 = getApiUrl().replace(/\/$/, "");
      const res = await fetch(`${base2}/api/occasions/transport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_name:  vOwnerName.trim(),
          vehicle_type: vType,
          vehicle_desc: vDesc.trim(),
          capacity:    parseInt(vCap) || 0,
          phone:       vPhone.trim(),
          whatsapp:    vPhone.trim(),
          area:        vArea.trim(),
          notes:       vNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) return Alert.alert("خطأ", data.error ?? "حدث خطأ");
      reset();
      setDone(true);
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <Animated.View entering={FadeIn} style={j.successBox}>
        <View style={j.successIcon}>
          <Ionicons name="checkmark-circle" size={60} color={GOLD} />
        </View>
        <Text style={j.successTitle}>تم إرسال طلبك بنجاح!</Text>
        <Text style={j.successSub}>سيتم مراجعة طلبك من قِبل الإدارة والتواصل معك قريباً.</Text>
        <TouchableOpacity style={j.successBtn} onPress={() => setDone(false)}>
          <Text style={j.successBtnText}>تقديم طلب آخر</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {/* ── اختيار النوع ── */}
        <View style={j.typeRow}>
          <TouchableOpacity
            style={[j.typeBtn, joinType === "shop" && { borderColor: GOLD, backgroundColor: GOLD + "15" }]}
            onPress={() => setJoinType("shop")}
          >
            <MaterialCommunityIcons name="storefront" size={22} color={joinType === "shop" ? GOLD : Colors.textMuted} />
            <Text style={[j.typeBtnText, joinType === "shop" && { color: GOLD }]}>محل مناسبات</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[j.typeBtn, joinType === "transport" && { borderColor: Colors.cyber, backgroundColor: Colors.cyber + "15" }]}
            onPress={() => setJoinType("transport")}
          >
            <MaterialCommunityIcons name="bus-side" size={22} color={joinType === "transport" ? Colors.cyber : Colors.textMuted} />
            <Text style={[j.typeBtnText, joinType === "transport" && { color: Colors.cyber }]}>مواصلات</Text>
          </TouchableOpacity>
        </View>

        {joinType === "shop" ? (
          <Animated.View entering={FadeIn} style={j.formCard}>
            <Text style={j.formTitle}>انضمام محل المناسبات</Text>
            <Text style={j.formSub}>أضف محلك وعرّف الزبائن بخدماتك</Text>

            {[
              { label: "اسم صاحب المحل *", val: ownerName, set: setOwnerName, placeholder: "محمد أحمد" },
              { label: "اسم المحل *",      val: shopName,  set: setShopName,  placeholder: "محل نجمة للمناسبات" },
              { label: "رقم الهاتف *",     val: phone,     set: setPhone,     placeholder: "0912345678", keyboard: "phone-pad" as const },
              { label: "رقم الواتساب",     val: whatsapp,  set: setWhatsapp,  placeholder: "0912345678 (اختياري)", keyboard: "phone-pad" as const },
              { label: "المنطقة / الحي",   val: cityArea,  set: setCityArea,  placeholder: "حصاحيصا — الحي الشرقي" },
              { label: "رابط السوشيال",    val: social,    set: setSocial,    placeholder: "فيسبوك / تيك توك (اختياري)" },
            ].map(f => (
              <View key={f.label} style={j.fieldBlock}>
                <Text style={j.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={j.input}
                  value={f.val}
                  onChangeText={f.set}
                  placeholder={f.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  keyboardType={f.keyboard ?? "default"}
                  textAlign="right"
                />
              </View>
            ))}

            <View style={j.fieldBlock}>
              <Text style={j.fieldLabel}>وصف المحل</Text>
              <TextInput
                style={[j.input, { minHeight: 90, textAlignVertical: "top" }]}
                value={desc}
                onChangeText={setDesc}
                placeholder="اكتب نبذة عن خدماتك وما يميزك..."
                placeholderTextColor={Colors.textMuted}
                multiline
                textAlign="right"
              />
            </View>

            <TouchableOpacity
              style={[j.submitBtn, { backgroundColor: GOLD }, sending && { opacity: 0.6 }]}
              onPress={submitShop}
              disabled={sending}
            >
              {sending ? <ActivityIndicator color="#fff" /> : (
                <>
                  <MaterialCommunityIcons name="send-outline" size={18} color="#fff" />
                  <Text style={j.submitBtnText}>إرسال طلب الانضمام</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn} style={j.formCard}>
            <Text style={j.formTitle}>إضافة مواصلات المناسبات</Text>
            <Text style={j.formSub}>سجّل مركبتك لتكون ضمن قائمة مواصلات المناسبات</Text>

            {/* نوع المركبة */}
            <View style={j.fieldBlock}>
              <Text style={j.fieldLabel}>نوع المركبة *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {VEHICLE_TYPES.map(v => (
                  <TouchableOpacity
                    key={v.key}
                    style={[j.vTypeBtn, vType === v.key && { borderColor: v.color, backgroundColor: v.color + "18" }]}
                    onPress={() => setVType(v.key)}
                  >
                    <MaterialCommunityIcons name={v.icon as any} size={18} color={vType === v.key ? v.color : Colors.textMuted} />
                    <Text style={[j.vTypeBtnText, vType === v.key && { color: v.color }]}>{v.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {[
              { label: "اسم المالك *",          val: vOwnerName, set: setVOwnerName, placeholder: "أحمد محمد" },
              { label: "رقم الهاتف *",           val: vPhone,     set: setVPhone,     placeholder: "0912345678", keyboard: "phone-pad" as const },
              { label: "وصف المركبة",            val: vDesc,      set: setVDesc,      placeholder: "باص 45 مقعد مكيّف" },
              { label: "عدد المقاعد",            val: vCap,       set: setVCap,       placeholder: "45", keyboard: "number-pad" as const },
              { label: "المنطقة / نطاق الخدمة", val: vArea,      set: setVArea,      placeholder: "حصاحيصا والمناطق المجاورة" },
            ].map(f => (
              <View key={f.label} style={j.fieldBlock}>
                <Text style={j.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={j.input}
                  value={f.val}
                  onChangeText={f.set}
                  placeholder={f.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  keyboardType={f.keyboard ?? "default"}
                  textAlign="right"
                />
              </View>
            ))}

            <View style={j.fieldBlock}>
              <Text style={j.fieldLabel}>ملاحظات إضافية</Text>
              <TextInput
                style={[j.input, { minHeight: 80, textAlignVertical: "top" }]}
                value={vNotes}
                onChangeText={setVNotes}
                placeholder="أي معلومات إضافية تريد إضافتها..."
                placeholderTextColor={Colors.textMuted}
                multiline
                textAlign="right"
              />
            </View>

            <TouchableOpacity
              style={[j.submitBtn, { backgroundColor: Colors.cyber }, sending && { opacity: 0.6 }]}
              onPress={submitTransport}
              disabled={sending}
            >
              {sending ? <ActivityIndicator color="#fff" /> : (
                <>
                  <MaterialCommunityIcons name="send-outline" size={18} color="#fff" />
                  <Text style={j.submitBtnText}>إرسال الطلب</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// الشاشة الرئيسية
// ══════════════════════════════════════════════════════════════════════════════
export default function OccasionsScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"shops" | "transport" | "join">("shops");
  const [shops,      setShops]     = useState<OccasionShop[]>([]);
  const [transport,  setTransport] = useState<OccasionTransport[]>([]);
  const [loadShops,  setLoadShops] = useState(false);
  const [loadTrans,  setLoadTrans] = useState(false);
  const [filterCat,  setFilterCat] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const base = getApiUrl().replace(/\/$/, "");
    setLoadShops(true);
    setLoadTrans(true);
    try {
      const [sr, tr] = await Promise.all([
        fetch(`${base}/api/occasions/shops`),
        fetch(`${base}/api/occasions/transport`),
      ]);
      if (sr.ok) setShops(await sr.json());
      if (tr.ok) setTransport(await tr.json());
    } catch {}
    setLoadShops(false);
    setLoadTrans(false);
  }, []);

  useEffect(() => { loadData(); }, []);

  // فلترة المحلات حسب الصنف
  const filteredShops: OccasionShop[] = filterCat
    ? shops.filter(sh => sh.items.some(i => i.category === filterCat))
    : shops;

  const TABS = [
    { key: "shops",     label: "المحلات",    icon: "storefront-outline" as const, color: GOLD   },
    { key: "transport", label: "المواصلات",  icon: "bus-outline" as const,        color: Colors.cyber },
    { key: "join",      label: "انضم معنا",  icon: "add-circle-outline" as const, color: "#22C55E" },
  ] as const;

  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
      <HeroSection />

      {/* ── أزرار التبويبات ── */}
      <View style={s.tabsRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tabBtn, activeTab === tab.key && { borderBottomColor: tab.color, borderBottomWidth: 2.5 }]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <Ionicons name={tab.icon} size={17} color={activeTab === tab.key ? tab.color : Colors.textMuted} />
            <Text style={[s.tabBtnText, activeTab === tab.key && { color: tab.color }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══ تبويب المحلات ══════════════════════════════════════════════════════ */}
      {activeTab === "shops" && (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={loadShops} onRefresh={loadData} tintColor={GOLD} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ── فلتر الأصناف ── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            <TouchableOpacity
              style={[s.catChip, !filterCat && { borderColor: GOLD, backgroundColor: GOLD + "18" }]}
              onPress={() => setFilterCat(null)}
            >
              <Text style={[s.catChipText, !filterCat && { color: GOLD }]}>الكل</Text>
            </TouchableOpacity>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.key}
                style={[s.catChip, filterCat === c.key && { borderColor: c.color, backgroundColor: c.color + "18" }]}
                onPress={() => setFilterCat(filterCat === c.key ? null : c.key)}
              >
                <MaterialCommunityIcons name={c.icon as any} size={14} color={filterCat === c.key ? c.color : Colors.textMuted} />
                <Text style={[s.catChipText, filterCat === c.key && { color: c.color }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadShops ? (
            <ActivityIndicator color={GOLD} style={{ marginTop: 60 }} />
          ) : filteredShops.length === 0 ? (
            <Animated.View entering={FadeIn} style={s.emptyBox}>
              <MaterialCommunityIcons name="storefront-outline" size={54} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>لا توجد محلات معتمدة حالياً</Text>
              <Text style={s.emptySub}>كن أول من ينضم عبر تبويب "انضم معنا"</Text>
              <TouchableOpacity style={[s.emptyBtn, { backgroundColor: GOLD }]} onPress={() => setActiveTab("join")}>
                <Text style={s.emptyBtnText}>انضم الآن</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            filteredShops.map((shop, i) => <ShopCard key={shop.id} shop={shop} index={i} />)
          )}
        </ScrollView>
      )}

      {/* ══ تبويب المواصلات ════════════════════════════════════════════════════ */}
      {activeTab === "transport" && (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={loadTrans} onRefresh={loadData} tintColor={Colors.cyber} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ── معلومة تمهيدية ── */}
          <Animated.View entering={FadeInDown} style={[s.infoBanner, { borderColor: Colors.cyber + "40" }]}>
            <MaterialCommunityIcons name="information-outline" size={18} color={Colors.cyber} />
            <Text style={[s.infoBannerText, { color: Colors.cyber }]}>
              قائمة أصحاب الحافلات والهايسات والباصات المستعدين لتلبية طلبات المناسبات
            </Text>
          </Animated.View>

          {loadTrans ? (
            <ActivityIndicator color={Colors.cyber} style={{ marginTop: 60 }} />
          ) : transport.length === 0 ? (
            <Animated.View entering={FadeIn} style={s.emptyBox}>
              <MaterialCommunityIcons name="bus-clock" size={54} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>لا توجد مواصلات مُضافة بعد</Text>
              <Text style={s.emptySub}>أضف مركبتك لتكون ضمن هذه القائمة</Text>
              <TouchableOpacity style={[s.emptyBtn, { backgroundColor: Colors.cyber }]} onPress={() => setActiveTab("join")}>
                <Text style={s.emptyBtnText}>أضف مركبتك</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            transport.map((t, i) => <TransportCard key={t.id} t={t} index={i} />)
          )}
        </ScrollView>
      )}

      {/* ══ تبويب الانضمام ═══════════════════════════════════════════════════ */}
      {activeTab === "join" && (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <JoinTab />
        </ScrollView>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// الأنماط
// ══════════════════════════════════════════════════════════════════════════════

// رأس الصفحة
const h = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  heroContent: { alignItems: "center", marginBottom: 16 },
  iconCircle: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: GOLD + "20", borderWidth: 2, borderColor: GOLD + "50",
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  heroTitle: {
    fontFamily: "Cairo_800ExtraBold", fontSize: 28, color: GOLD,
    textAlign: "center", letterSpacing: 0.5,
  },
  heroSub: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary,
    textAlign: "center", marginTop: 4, lineHeight: 22,
  },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1, backgroundColor: CARD, borderRadius: 14,
    borderWidth: 1, borderColor: GOLD + "25",
    alignItems: "center", paddingVertical: 10, gap: 2,
  },
  statLabel: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textPrimary },
  statSub:   { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
});

// شاشة
const s = StyleSheet.create({
  tabsRow: {
    flexDirection: "row", backgroundColor: CARD,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: "transparent",
  },
  tabBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  // كرت محل
  shopCard: {
    backgroundColor: CARD, borderRadius: 18, borderWidth: 1,
    borderColor: Colors.divider, marginBottom: 14, overflow: "hidden",
  },
  shopHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  shopAvatar: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: GOLD + "18", borderWidth: 1.5, borderColor: GOLD + "40",
    alignItems: "center", justifyContent: "center",
  },
  shopName:  { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  shopOwner: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  shopArea:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  availBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  availText:  { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  shopDesc: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary,
    paddingHorizontal: 14, paddingBottom: 8, textAlign: "right", lineHeight: 20,
  },
  itemsGrid: { paddingHorizontal: 14, paddingBottom: 10, gap: 7 },
  noItems:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 12 },
  itemChip: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: BG, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  itemChipOff: { opacity: 0.5 },
  itemName:  { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  itemPrice: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  availDot:  { width: 9, height: 9, borderRadius: 5 },
  shopActions: { flexDirection: "row", gap: 10, padding: 12, paddingTop: 8 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderRadius: 12, paddingVertical: 10,
  },
  actionBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13 },

  // كرت مواصلات
  transportCard: {
    backgroundColor: CARD, borderRadius: 18, borderWidth: 1,
    borderColor: Colors.divider, marginBottom: 14, flexDirection: "row", overflow: "hidden",
  },
  transportLeft: {
    width: 70, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14,
  },
  transportIcon: {
    width: 50, height: 50, borderRadius: 14, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  availPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingHorizontal: 5, paddingVertical: 3,
  },
  availPillText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  transportBody: { flex: 1, padding: 12 },
  transportName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  transportType: { fontFamily: "Cairo_600SemiBold", fontSize: 13, textAlign: "right" },
  transportDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 2 },
  transportMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, justifyContent: "flex-end" },
  metaTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  metaTagText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  transportNotes: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 4 },

  // أخرى
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: CARD,
  },
  catChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  infoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderWidth: 1, borderRadius: 14, padding: 12,
    backgroundColor: Colors.cyber + "08", marginBottom: 12,
  },
  infoBannerText: { fontFamily: "Cairo_400Regular", fontSize: 12, flex: 1, textAlign: "right", lineHeight: 20 },
  emptyBox: { alignItems: "center", paddingVertical: 50, gap: 8 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textSecondary },
  emptySub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  emptyBtn:   { borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12, marginTop: 8 },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
});

// نموذج الانضمام
const j = StyleSheet.create({
  typeRow:    { flexDirection: "row", gap: 12, marginBottom: 16, marginTop: 8 },
  typeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 2, borderColor: Colors.divider, borderRadius: 16,
    paddingVertical: 14, backgroundColor: CARD,
  },
  typeBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textMuted },
  formCard: {
    backgroundColor: CARD, borderRadius: 20, borderWidth: 1,
    borderColor: Colors.divider, padding: 20, gap: 4,
  },
  formTitle: { fontFamily: "Cairo_800ExtraBold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  formSub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 12 },
  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 6, textAlign: "right" },
  input: {
    backgroundColor: BG, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.divider,
    color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  vTypeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: BG,
  },
  vTypeBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 16, paddingVertical: 16, marginTop: 8,
  },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  successBox: { alignItems: "center", paddingVertical: 60, gap: 12 },
  successIcon: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: GOLD + "18", borderWidth: 2, borderColor: GOLD + "40",
    alignItems: "center", justifyContent: "center",
  },
  successTitle: { fontFamily: "Cairo_800ExtraBold", fontSize: 22, color: GOLD },
  successSub:   { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, paddingHorizontal: 20 },
  successBtn:   { backgroundColor: GOLD, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  successBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
