import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  FlatList, Linking, Modal, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  Dimensions, RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import OrgInviteCard from "@/components/OrgInviteCard";


const { width: W } = Dimensions.get("window");
const BASE = getApiUrl() ?? "";

// ── ألوان القسم ──────────────────────────────────────────────────
const C = {
  bg:       "#080D0A",
  card:     "rgba(18,30,20,0.92)",
  cardBdr:  "rgba(74,222,128,0.12)",
  crops:    "#4ADE80",
  cropsD:   "#16A34A",
  lands:    "#D97706",
  landsD:   "#92400E",
  tools:    "#FB923C",
  toolsD:   "#C2410C",
  workers:  "#60A5FA",
  workersD: "#1D4ED8",
  text:     "#E8F5E9",
  sub:      "rgba(200,240,210,0.6)",
  muted:    "rgba(200,240,210,0.35)",
  divider:  "rgba(74,222,128,0.08)",
};

type TabKey = "crops" | "lands" | "tools" | "workers";
interface Tab { key: TabKey; label: string; icon: string; color: string; dark: string }

const TABS: Tab[] = [
  { key: "crops",   label: "المحاصيل", icon: "leaf",         color: C.crops,   dark: C.cropsD   },
  { key: "lands",   label: "الأراضي",  icon: "map",          color: C.lands,   dark: C.landsD   },
  { key: "tools",   label: "الأدوات",  icon: "construct",    color: C.tools,   dark: C.toolsD   },
  { key: "workers", label: "العمال",   icon: "people",       color: C.workers, dark: C.workersD },
];

const CROP_CATS  = ["كل الفئات","خضروات","فواكه","حبوب","ماشية","دواجن","أخرى"];
const LAND_FEATS = ["مياه نيل","مياه مطر","بئر","ري صناعي"];
const TOOL_CATS  = ["كل الفئات","معدات ثقيلة","ري","زراعة","حصاد","بخاخات","أخرى"];
const WORKER_SP  = ["كل التخصصات","حرث","زراعة","حصاد","ري","رش مبيدات","صيانة","أخرى"];

// ── Helpers ───────────────────────────────────────────────────────
function callPhone(p: string) { if (p) Linking.openURL(`tel:${p}`); }
function openWhatsApp(p: string) {
  const n = p.replace(/\D/g, "");
  Linking.openURL(`https://wa.me/${n.startsWith("0") ? "249"+n.slice(1) : n}`);
}
function fmt(n: number | null) {
  if (!n) return "—";
  return n.toLocaleString("ar-SD") + " ج.س";
}

// ── بطاقة المحصول ────────────────────────────────────────────────
function CropCard({ item }: { item: any }) {
  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.card}>
      <LinearGradient colors={[C.cropsD+"22","transparent"]} style={styles.cardGrad} />
      <View style={styles.cardHead}>
        <View style={[styles.catBadge, { backgroundColor: C.cropsD+"40", borderColor: C.crops+"50" }]}>
          <Ionicons name="leaf" size={12} color={C.crops} />
          <Text style={[styles.catText, { color: C.crops }]}>{item.category}</Text>
        </View>
        {item.with_transport && (
          <View style={[styles.catBadge, { backgroundColor: "#1D4ED840", borderColor: "#60A5FA50" }]}>
            <Ionicons name="car" size={12} color="#60A5FA" />
            <Text style={[styles.catText, { color: "#60A5FA" }]}>شامل النقل</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
      <View style={styles.cardMeta}>
        <View style={styles.metaRow}>
          <Ionicons name="pricetag" size={13} color={C.crops} />
          <Text style={[styles.metaVal, { color: C.crops }]}>
            {fmt(item.price_per_unit)} / {item.unit || "كجم"}
          </Text>
        </View>
        {item.quantity_available ? (
          <View style={styles.metaRow}>
            <Ionicons name="scale" size={13} color={C.sub} />
            <Text style={styles.metaSub}>الكمية: {item.quantity_available} {item.unit}</Text>
          </View>
        ) : null}
        {item.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location" size={13} color={C.sub} />
            <Text style={styles.metaSub}>{item.location}</Text>
          </View>
        ) : null}
        {item.with_transport && item.transport_cost ? (
          <View style={styles.metaRow}>
            <Ionicons name="car-outline" size={13} color="#60A5FA" />
            <Text style={[styles.metaSub, { color: "#60A5FA" }]}>تكلفة النقل: {fmt(item.transport_cost)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardActions}>
        {item.contact_phone ? (
          <Pressable style={[styles.actionBtn, { backgroundColor: C.cropsD+"40", borderColor: C.crops+"40" }]}
            onPress={() => callPhone(item.contact_phone)}>
            <Ionicons name="call" size={14} color={C.crops} />
            <Text style={[styles.actionText, { color: C.crops }]}>اتصال</Text>
          </Pressable>
        ) : null}
        {item.contact_whatsapp ? (
          <Pressable style={[styles.actionBtn, { backgroundColor: "#16A34A40", borderColor: "#4ADE8040" }]}
            onPress={() => openWhatsApp(item.contact_whatsapp)}>
            <Ionicons name="logo-whatsapp" size={14} color="#4ADE80" />
            <Text style={[styles.actionText, { color: "#4ADE80" }]}>واتساب</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ── بطاقة الأرض ──────────────────────────────────────────────────
function LandCard({ item }: { item: any }) {
  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.card}>
      <LinearGradient colors={[C.landsD+"22","transparent"]} style={styles.cardGrad} />
      <View style={styles.cardHead}>
        <View style={[styles.catBadge, { backgroundColor: C.landsD+"40", borderColor: C.lands+"50" }]}>
          <Ionicons name="map" size={12} color={C.lands} />
          <Text style={[styles.catText, { color: C.lands }]}>{item.rent_period === "season" ? "موسمي" : item.rent_period === "month" ? "شهري" : "سنوي"}</Text>
        </View>
        {item.water_source ? (
          <View style={[styles.catBadge, { backgroundColor: "#1D4ED822", borderColor: "#60A5FA33" }]}>
            <Ionicons name="water" size={12} color="#60A5FA" />
            <Text style={[styles.catText, { color: "#60A5FA" }]}>{item.water_source}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
      <View style={styles.cardMeta}>
        <View style={styles.metaRow}>
          <Ionicons name="resize" size={13} color={C.lands} />
          <Text style={[styles.metaVal, { color: C.lands }]}>{item.area_feddan} فدان</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="pricetag" size={13} color={C.lands} />
          <Text style={[styles.metaVal, { color: C.lands }]}>{fmt(item.rent_price)} / {item.rent_period === "season" ? "موسم" : item.rent_period === "month" ? "شهر" : "سنة"}</Text>
        </View>
        {item.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location" size={13} color={C.sub} />
            <Text style={styles.metaSub}>{item.location}</Text>
          </View>
        ) : null}
        {item.soil_type ? (
          <View style={styles.metaRow}>
            <Ionicons name="earth" size={13} color={C.sub} />
            <Text style={styles.metaSub}>التربة: {item.soil_type}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardActions}>
        {item.contact_phone ? (
          <Pressable style={[styles.actionBtn, { backgroundColor: C.landsD+"40", borderColor: C.lands+"40" }]}
            onPress={() => callPhone(item.contact_phone)}>
            <Ionicons name="call" size={14} color={C.lands} />
            <Text style={[styles.actionText, { color: C.lands }]}>اتصال</Text>
          </Pressable>
        ) : null}
        {item.contact_whatsapp ? (
          <Pressable style={[styles.actionBtn, { backgroundColor: "#16A34A40", borderColor: "#4ADE8040" }]}
            onPress={() => openWhatsApp(item.contact_whatsapp)}>
            <Ionicons name="logo-whatsapp" size={14} color="#4ADE80" />
            <Text style={[styles.actionText, { color: "#4ADE80" }]}>واتساب</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ── بطاقة الأداة ─────────────────────────────────────────────────
function ToolCard({ item }: { item: any }) {
  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.card}>
      <LinearGradient colors={[C.toolsD+"22","transparent"]} style={styles.cardGrad} />
      <View style={styles.cardHead}>
        <View style={[styles.catBadge, { backgroundColor: C.toolsD+"40", borderColor: C.tools+"50" }]}>
          <Ionicons name="construct" size={12} color={C.tools} />
          <Text style={[styles.catText, { color: C.tools }]}>{item.category}</Text>
        </View>
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
      <View style={styles.cardMeta}>
        <View style={styles.metaRow}>
          <Ionicons name="pricetag" size={13} color={C.tools} />
          <Text style={[styles.metaVal, { color: C.tools }]}>
            {fmt(item.rent_price)} / {item.rent_period === "hour" ? "ساعة" : item.rent_period === "week" ? "أسبوع" : "يوم"}
          </Text>
        </View>
        {item.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location" size={13} color={C.sub} />
            <Text style={styles.metaSub}>{item.location}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardActions}>
        {item.contact_phone ? (
          <Pressable style={[styles.actionBtn, { backgroundColor: C.toolsD+"40", borderColor: C.tools+"40" }]}
            onPress={() => callPhone(item.contact_phone)}>
            <Ionicons name="call" size={14} color={C.tools} />
            <Text style={[styles.actionText, { color: C.tools }]}>اتصال</Text>
          </Pressable>
        ) : null}
        {item.contact_whatsapp ? (
          <Pressable style={[styles.actionBtn, { backgroundColor: "#16A34A40", borderColor: "#4ADE8040" }]}
            onPress={() => openWhatsApp(item.contact_whatsapp)}>
            <Ionicons name="logo-whatsapp" size={14} color="#4ADE80" />
            <Text style={[styles.actionText, { color: "#4ADE80" }]}>واتساب</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ── بطاقة العامل ─────────────────────────────────────────────────
function WorkerCard({ item }: { item: any }) {
  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.card}>
      <LinearGradient colors={[C.workersD+"22","transparent"]} style={styles.cardGrad} />
      <View style={styles.cardHead}>
        <View style={[styles.catBadge, { backgroundColor: C.workersD+"40", borderColor: C.workers+"50" }]}>
          <Ionicons name="people" size={12} color={C.workers} />
          <Text style={[styles.catText, { color: C.workers }]}>{item.specialty}</Text>
        </View>
        {item.has_equipment && (
          <View style={[styles.catBadge, { backgroundColor: C.toolsD+"30", borderColor: C.tools+"40" }]}>
            <Ionicons name="construct" size={12} color={C.tools} />
            <Text style={[styles.catText, { color: C.tools }]}>لديهم معدات</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
      <View style={styles.cardMeta}>
        <View style={styles.metaRow}>
          <Ionicons name="people" size={13} color={C.workers} />
          <Text style={[styles.metaVal, { color: C.workers }]}>{item.workers_count} عامل</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="pricetag" size={13} color={C.workers} />
          <Text style={[styles.metaVal, { color: C.workers }]}>{fmt(item.daily_rate)} / يوم</Text>
        </View>
        {item.experience_years > 0 ? (
          <View style={styles.metaRow}>
            <Ionicons name="time" size={13} color={C.sub} />
            <Text style={styles.metaSub}>خبرة {item.experience_years} سنة</Text>
          </View>
        ) : null}
        {item.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location" size={13} color={C.sub} />
            <Text style={styles.metaSub}>{item.location}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardActions}>
        {item.contact_phone ? (
          <Pressable style={[styles.actionBtn, { backgroundColor: C.workersD+"40", borderColor: C.workers+"40" }]}
            onPress={() => callPhone(item.contact_phone)}>
            <Ionicons name="call" size={14} color={C.workers} />
            <Text style={[styles.actionText, { color: C.workers }]}>اتصال</Text>
          </Pressable>
        ) : null}
        {item.contact_whatsapp ? (
          <Pressable style={[styles.actionBtn, { backgroundColor: "#16A34A40", borderColor: "#4ADE8040" }]}
            onPress={() => openWhatsApp(item.contact_whatsapp)}>
            <Ionicons name="logo-whatsapp" size={14} color="#4ADE80" />
            <Text style={[styles.actionText, { color: "#4ADE80" }]}>واتساب</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ── نموذج الإضافة ─────────────────────────────────────────────────
function AddModal({ visible, tab, onClose, onSaved, token }: {
  visible: boolean; tab: TabKey; onClose: () => void; onSaved: () => void; token: string | null;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => { if (visible) setForm({}); }, [visible]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const endpoints: Record<TabKey, string> = {
    crops:   "/api/farmers/crops",
    lands:   "/api/farmers/lands",
    tools:   "/api/farmers/tools",
    workers: "/api/farmers/workers",
  };

  const save = async () => {
    if (!form.title?.trim()) { Alert.alert("خطأ", "العنوان مطلوب"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...form };
      if (form.price_per_unit)    body.price_per_unit    = parseFloat(form.price_per_unit);
      if (form.quantity_available) body.quantity_available = parseFloat(form.quantity_available);
      if (form.transport_cost)    body.transport_cost    = parseFloat(form.transport_cost);
      if (form.area_feddan)       body.area_feddan       = parseFloat(form.area_feddan);
      if (form.rent_price)        body.rent_price        = parseFloat(form.rent_price);
      if (form.daily_rate)        body.daily_rate        = parseFloat(form.daily_rate);
      if (form.workers_count)     body.workers_count     = parseInt(form.workers_count, 10);
      if (form.experience_years)  body.experience_years  = parseInt(form.experience_years, 10);
      body.with_transport = form.with_transport === "true";
      body.has_equipment  = form.has_equipment  === "true";

      const res = await fetch(`${BASE}${endpoints[tab]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل الحفظ");
      onSaved();
    } catch (e: any) {
      Alert.alert("خطأ", e.message || "فشل الحفظ");
    } finally { setSaving(false); }
  };

  const accentColor = TABS.find(t => t.key === tab)?.color ?? Colors.primary;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKAV}>
          <View style={styles.modalBox}>
            <LinearGradient colors={["#0F1F12","#080D0A"]} style={StyleSheet.absoluteFill} />
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {tab === "crops" ? "إضافة محصول" : tab === "lands" ? "إضافة أرض" : tab === "tools" ? "إضافة أداة" : "إضافة عمال"}
              </Text>
              <Pressable onPress={onClose} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={C.sub} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>

              {/* حقول مشتركة */}
              <Text style={styles.fieldLabel}>العنوان *</Text>
              <TextInput style={[styles.input, { borderColor: accentColor+"40" }]} value={form.title ?? ""} onChangeText={v => set("title", v)} placeholder="مثال: طماطم طازجة من حقلنا..." placeholderTextColor={C.muted} />

              <Text style={styles.fieldLabel}>الوصف</Text>
              <TextInput style={[styles.input, styles.inputMulti, { borderColor: accentColor+"30" }]} value={form.description ?? ""} onChangeText={v => set("description", v)} multiline placeholder="تفاصيل إضافية..." placeholderTextColor={C.muted} />

              {/* حقول المحاصيل */}
              {tab === "crops" && (<>
                <Text style={styles.fieldLabel}>الفئة</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={styles.chipRow}>
                    {["خضروات","فواكه","حبوب","ماشية","دواجن","أخرى"].map(c => (
                      <Pressable key={c} style={[styles.chip, form.category===c && { backgroundColor: accentColor+"30", borderColor: accentColor }]} onPress={() => set("category", c)}>
                        <Text style={[styles.chipText, form.category===c && { color: accentColor }]}>{c}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>

                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>السعر (ج.س)</Text>
                    <TextInput style={[styles.input, { borderColor: accentColor+"40" }]} value={form.price_per_unit ?? ""} onChangeText={v => set("price_per_unit", v)} keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>الوحدة</Text>
                    <TextInput style={[styles.input, { borderColor: accentColor+"40" }]} value={form.unit ?? ""} onChangeText={v => set("unit", v)} placeholder="كجم / طن / قطعة" placeholderTextColor={C.muted} />
                  </View>
                </View>

                <Text style={styles.fieldLabel}>الكمية المتاحة</Text>
                <TextInput style={[styles.input, { borderColor: accentColor+"30" }]} value={form.quantity_available ?? ""} onChangeText={v => set("quantity_available", v)} keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted} />

                <Text style={styles.fieldLabel}>هل يشمل النقل؟</Text>
                <View style={styles.chipRow}>
                  {[["true","نعم، شامل النقل"],["false","بدون نقل"]].map(([v,l]) => (
                    <Pressable key={v} style={[styles.chip, form.with_transport===v && { backgroundColor: accentColor+"30", borderColor: accentColor }]} onPress={() => set("with_transport", v)}>
                      <Text style={[styles.chipText, form.with_transport===v && { color: accentColor }]}>{l}</Text>
                    </Pressable>
                  ))}
                </View>

                {form.with_transport === "true" && (<>
                  <Text style={styles.fieldLabel}>تكلفة النقل (ج.س)</Text>
                  <TextInput style={[styles.input, { borderColor: "#60A5FA40" }]} value={form.transport_cost ?? ""} onChangeText={v => set("transport_cost", v)} keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted} />
                  <Text style={styles.fieldLabel}>ملاحظات النقل</Text>
                  <TextInput style={[styles.input, { borderColor: "#60A5FA30" }]} value={form.transport_notes ?? ""} onChangeText={v => set("transport_notes", v)} placeholder="مثال: توصيل داخل المدينة فقط" placeholderTextColor={C.muted} />
                </>)}
              </>)}

              {/* حقول الأراضي */}
              {tab === "lands" && (<>
                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>المساحة (فدان)</Text>
                    <TextInput style={[styles.input, { borderColor: accentColor+"40" }]} value={form.area_feddan ?? ""} onChangeText={v => set("area_feddan", v)} keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>الإيجار (ج.س)</Text>
                    <TextInput style={[styles.input, { borderColor: accentColor+"40" }]} value={form.rent_price ?? ""} onChangeText={v => set("rent_price", v)} keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted} />
                  </View>
                </View>

                <Text style={styles.fieldLabel}>فترة الإيجار</Text>
                <View style={styles.chipRow}>
                  {[["season","موسمي"],["month","شهري"],["year","سنوي"]].map(([v,l]) => (
                    <Pressable key={v} style={[styles.chip, form.rent_period===v && { backgroundColor: accentColor+"30", borderColor: accentColor }]} onPress={() => set("rent_period", v)}>
                      <Text style={[styles.chipText, form.rent_period===v && { color: accentColor }]}>{l}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>مصدر المياه</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={styles.chipRow}>
                    {LAND_FEATS.map(f => (
                      <Pressable key={f} style={[styles.chip, form.water_source===f && { backgroundColor: "#60A5FA30", borderColor: "#60A5FA" }]} onPress={() => set("water_source", f)}>
                        <Text style={[styles.chipText, form.water_source===f && { color: "#60A5FA" }]}>{f}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>

                <Text style={styles.fieldLabel}>نوع التربة</Text>
                <TextInput style={[styles.input, { borderColor: accentColor+"30" }]} value={form.soil_type ?? ""} onChangeText={v => set("soil_type", v)} placeholder="طينية / رملية / مختلطة" placeholderTextColor={C.muted} />
              </>)}

              {/* حقول الأدوات */}
              {tab === "tools" && (<>
                <Text style={styles.fieldLabel}>الفئة</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={styles.chipRow}>
                    {["معدات ثقيلة","ري","زراعة","حصاد","بخاخات","أخرى"].map(c => (
                      <Pressable key={c} style={[styles.chip, form.category===c && { backgroundColor: accentColor+"30", borderColor: accentColor }]} onPress={() => set("category", c)}>
                        <Text style={[styles.chipText, form.category===c && { color: accentColor }]}>{c}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>

                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>سعر الإيجار</Text>
                    <TextInput style={[styles.input, { borderColor: accentColor+"40" }]} value={form.rent_price ?? ""} onChangeText={v => set("rent_price", v)} keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>لكل</Text>
                    <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
                      {[["hour","ساعة"],["day","يوم"],["week","أسبوع"]].map(([v,l]) => (
                        <Pressable key={v} style={[styles.chip, form.rent_period===v && { backgroundColor: accentColor+"30", borderColor: accentColor }]} onPress={() => set("rent_period", v)}>
                          <Text style={[styles.chipText, { fontSize: 10 }, form.rent_period===v && { color: accentColor }]}>{l}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              </>)}

              {/* حقول العمال */}
              {tab === "workers" && (<>
                <Text style={styles.fieldLabel}>التخصص</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={styles.chipRow}>
                    {["حرث","زراعة","حصاد","ري","رش مبيدات","صيانة","أخرى"].map(c => (
                      <Pressable key={c} style={[styles.chip, form.specialty===c && { backgroundColor: accentColor+"30", borderColor: accentColor }]} onPress={() => set("specialty", c)}>
                        <Text style={[styles.chipText, form.specialty===c && { color: accentColor }]}>{c}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>

                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>عدد العمال</Text>
                    <TextInput style={[styles.input, { borderColor: accentColor+"40" }]} value={form.workers_count ?? ""} onChangeText={v => set("workers_count", v)} keyboardType="numeric" placeholder="1" placeholderTextColor={C.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>الأجر اليومي</Text>
                    <TextInput style={[styles.input, { borderColor: accentColor+"40" }]} value={form.daily_rate ?? ""} onChangeText={v => set("daily_rate", v)} keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted} />
                  </View>
                </View>

                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>سنوات الخبرة</Text>
                    <TextInput style={[styles.input, { borderColor: accentColor+"40" }]} value={form.experience_years ?? ""} onChangeText={v => set("experience_years", v)} keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>لديهم معدات؟</Text>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                      {[["true","نعم"],["false","لا"]].map(([v,l]) => (
                        <Pressable key={v} style={[styles.chip, form.has_equipment===v && { backgroundColor: accentColor+"30", borderColor: accentColor }]} onPress={() => set("has_equipment", v)}>
                          <Text style={[styles.chipText, form.has_equipment===v && { color: accentColor }]}>{l}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              </>)}

              {/* حقول مشتركة */}
              <Text style={styles.fieldLabel}>الموقع / المنطقة</Text>
              <TextInput style={[styles.input, { borderColor: accentColor+"30" }]} value={form.location ?? ""} onChangeText={v => set("location", v)} placeholder="مثال: المنطقة الزراعية الشمالية" placeholderTextColor={C.muted} />

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>رقم الهاتف</Text>
                  <TextInput style={[styles.input, { borderColor: accentColor+"30" }]} value={form.contact_phone ?? ""} onChangeText={v => set("contact_phone", v)} keyboardType="phone-pad" placeholder="09xxxxxxxx" placeholderTextColor={C.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>واتساب</Text>
                  <TextInput style={[styles.input, { borderColor: "#4ADE8030" }]} value={form.contact_whatsapp ?? ""} onChangeText={v => set("contact_whatsapp", v)} keyboardType="phone-pad" placeholder="09xxxxxxxx" placeholderTextColor={C.muted} />
                </View>
              </View>

              <Pressable style={[styles.saveBtn, { backgroundColor: accentColor }]} onPress={save} disabled={saving}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>حفظ الإعلان</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── الشاشة الرئيسية ──────────────────────────────────────────────
export default function FarmersScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>("crops");
  const [crops,   setCrops]   = useState<any[]>([]);
  const [lands,   setLands]   = useState<any[]>([]);
  const [tools,   setTools]   = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("كل الفئات");

  const tab = TABS.find(t => t.key === activeTab)!;

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [rC, rL, rT, rW] = await Promise.all([
        fetch(`${BASE}/api/farmers/crops`),
        fetch(`${BASE}/api/farmers/lands`),
        fetch(`${BASE}/api/farmers/tools`),
        fetch(`${BASE}/api/farmers/workers`),
      ]);
      if (rC.ok) setCrops(await rC.json());
      if (rL.ok) setLands(await rL.json());
      if (rT.ok) setTools(await rT.json());
      if (rW.ok) setWorkers(await rW.json());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchAll(true); }, [fetchAll]);

  const data = useMemo(() => {
    const raw = activeTab === "crops" ? crops : activeTab === "lands" ? lands : activeTab === "tools" ? tools : workers;
    return raw.filter(i => {
      const q = search.toLowerCase();
      const matchQ = !q || (i.title?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || i.location?.toLowerCase().includes(q));
      const matchF = filter === "كل الفئات" || filter === "كل التخصصات" ||
        i.category === filter || i.specialty === filter;
      return matchQ && matchF;
    });
  }, [activeTab, crops, lands, tools, workers, search, filter]);

  const filterOpts = activeTab === "crops" ? CROP_CATS : activeTab === "tools" ? TOOL_CATS : activeTab === "workers" ? WORKER_SP : [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── رأس القسم ── */}
      <LinearGradient colors={["#0C1A0E","#080D0A"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <LinearGradient colors={[C.cropsD, "#0C3318"]} style={styles.headerIconGrad}>
              <Ionicons name="leaf" size={22} color={C.crops} />
            </LinearGradient>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>السوق الزراعي</Text>
            <Text style={styles.headerSub}>محاصيل · أراضٍ · أدوات · عمال موسميون</Text>
          </View>
          {!isGuest && (
            <Pressable style={styles.addBtn} onPress={() => setShowAdd(true)}>
              <LinearGradient colors={[C.cropsD, C.crops+"CC"]} style={styles.addBtnGrad}>
                <Ionicons name="add" size={20} color="#fff" />
              </LinearGradient>
            </Pressable>
          )}
        </View>

        {/* ── تبويبات ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {TABS.map(t => {
            const active = t.key === activeTab;
            return (
              <Pressable key={t.key} onPress={() => { setActiveTab(t.key); setFilter("كل الفئات"); setSearch(""); }} style={[styles.tabBtn, active && { backgroundColor: t.color+"25", borderColor: t.color+"60" }]}>
                <Ionicons name={t.icon as any} size={15} color={active ? t.color : C.muted} />
                <Text style={[styles.tabLabel, active && { color: t.color, fontFamily: "Cairo_700Bold" }]}>{t.label}</Text>
                {active && <View style={[styles.tabDot, { backgroundColor: t.color }]} />}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── بحث ── */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={C.muted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={`ابحث في ${tab.label}...`}
            placeholderTextColor={C.muted}
          />
          {search ? <Pressable onPress={() => setSearch("")}><Ionicons name="close-circle" size={16} color={C.muted} /></Pressable> : null}
        </View>

        {/* ── فلاتر الفئات ── */}
        {filterOpts.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
            {filterOpts.map(f => (
              <Pressable key={f} onPress={() => setFilter(f)}
                style={[styles.filterChip, filter === f && { backgroundColor: tab.color+"25", borderColor: tab.color+"60" }]}>
                <Text style={[styles.filterText, filter === f && { color: tab.color, fontFamily: "Cairo_600SemiBold" }]}>{f}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </LinearGradient>

      {/* ── المحتوى ── */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={tab.color} size="large" /></View>
      ) : data.length === 0 ? (
        <Animated.View entering={FadeIn} style={styles.empty}>
          <Ionicons name={tab.icon as any} size={56} color={tab.color+"40"} />
          <Text style={[styles.emptyTitle, { color: tab.color }]}>لا توجد إعلانات في {tab.label}</Text>
          <Text style={styles.emptySub}>
            {!isGuest ? `اضغط + لإضافة إعلانك في ${tab.label}` : "سجّل دخولك لإضافة إعلانك"}
          </Text>
          {!isGuest && (
            <Pressable style={[styles.emptyBtn, { borderColor: tab.color+"60" }]} onPress={() => setShowAdd(true)}>
              <Ionicons name="add" size={16} color={tab.color} />
              <Text style={[styles.emptyBtnText, { color: tab.color }]}>أضف الآن</Text>
            </Pressable>
          )}
        </Animated.View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tab.color} />}
          ListFooterComponent={<OrgInviteCard />}
          renderItem={({ item }) =>
            activeTab === "crops"   ? <CropCard   item={item} /> :
            activeTab === "lands"   ? <LandCard   item={item} /> :
            activeTab === "tools"   ? <ToolCard   item={item} /> :
                                      <WorkerCard item={item} />
          }
        />
      )}

      {/* ── زر إضافة عائم ── */}
      {!isGuest && data.length > 0 && (
        <Pressable style={[styles.fab, { backgroundColor: tab.color }]} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      )}

      <AddModal
        visible={showAdd}
        tab={activeTab}
        token={token}
        onClose={() => setShowAdd(false)}
        onSaved={() => { setShowAdd(false); fetchAll(true); }}
      />
    </View>
  );
}

// ── الأنماط ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // ── الرأس ──
  header: { paddingBottom: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerIcon: { },
  headerIconGrad: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: C.text },
  headerSub:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: C.sub, marginTop: 1 },
  addBtn:      { width: 38, height: 38, borderRadius: 12, overflow: "hidden" },
  addBtnGrad:  { flex: 1, alignItems: "center", justifyContent: "center" },

  // ── تبويبات ──
  tabsRow: { paddingHorizontal: 12, gap: 8, paddingBottom: 10 },
  tabBtn:  { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "transparent", backgroundColor: "rgba(255,255,255,0.04)", position: "relative" },
  tabLabel:{ fontFamily: "Cairo_400Regular", fontSize: 13, color: C.muted },
  tabDot:  { position: "absolute", bottom: 2, left: "50%", width: 4, height: 4, borderRadius: 2, marginLeft: -2 },

  // ── بحث ──
  searchWrap:  { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0.5, borderColor: "rgba(74,222,128,0.12)" },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: C.text, padding: 0 },

  // ── فلاتر ──
  filtersRow:  { paddingHorizontal: 12, gap: 6, paddingBottom: 8 },
  filterChip:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)" },
  filterText:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: C.sub },

  // ── بطاقات ──
  list:  { padding: 14, gap: 12, paddingBottom: 100 },
  card:  { borderRadius: 18, borderWidth: 0.8, borderColor: C.cardBdr, backgroundColor: C.card, padding: 14, overflow: "hidden", gap: 8 },
  cardGrad: { ...StyleSheet.absoluteFillObject, borderRadius: 18 },

  cardHead: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  catBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 0.5 },
  catText:  { fontFamily: "Cairo_600SemiBold", fontSize: 10 },

  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: C.text, lineHeight: 22 },
  cardDesc:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: C.sub, lineHeight: 19 },

  cardMeta: { gap: 5 },
  metaRow:  { flexDirection: "row", alignItems: "center", gap: 6 },
  metaVal:  { fontFamily: "Cairo_700Bold", fontSize: 14 },
  metaSub:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: C.sub },

  cardActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 10, borderWidth: 0.5 },
  actionText:  { fontFamily: "Cairo_600SemiBold", fontSize: 12 },

  // ── فارغ ──
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty:  { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 30 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, textAlign: "center" },
  emptySub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: C.sub, textAlign: "center" },
  emptyBtn:   { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 14, borderWidth: 1, marginTop: 6 },
  emptyBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },

  // ── زر عائم ──
  fab: { position: "absolute", bottom: 24, left: 20, width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8 },

  // ── مودال ──
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalKAV:     { },
  modalBox:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", maxHeight: "92%" },
  modalHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 10 },
  modalHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8 },
  modalTitle:   { fontFamily: "Cairo_700Bold", fontSize: 17, color: C.text },
  modalClose:   { padding: 4 },
  modalContent: { padding: 18, gap: 4, paddingBottom: 40 },

  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: C.sub, marginTop: 8, marginBottom: 4 },
  input: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 0.7, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 13, color: C.text },
  inputMulti: { height: 80, textAlignVertical: "top" },
  row2: { flexDirection: "row", gap: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, borderWidth: 0.7, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)" },
  chipText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: C.sub },
  saveBtn: { borderRadius: 14, padding: 14, alignItems: "center", marginTop: 12 },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
