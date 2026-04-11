import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, ActivityIndicator,
  KeyboardAvoidingView, Switch, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const TOKEN_KEY = "inst_portal_token";

// ── الثوابت ──
const DAYS = [
  { day: 0, name: "الأحد" },
  { day: 1, name: "الاثنين" },
  { day: 2, name: "الثلاثاء" },
  { day: 3, name: "الأربعاء" },
  { day: 4, name: "الخميس" },
  { day: 5, name: "الجمعة" },
  { day: 6, name: "السبت" },
];

const SERVICE_ICONS = [
  { id: "stethoscope",           label: "فحص" },
  { id: "heart-pulse",           label: "قلب" },
  { id: "test-tube",             label: "مختبر" },
  { id: "medical-bag",           label: "طب" },
  { id: "tooth-outline",         label: "أسنان" },
  { id: "eye-outline",           label: "عيون" },
  { id: "bone",                  label: "عظام" },
  { id: "baby-face-outline",     label: "أطفال" },
  { id: "needle",                label: "تطعيم" },
  { id: "ambulance",             label: "طوارئ" },
  { id: "pill",                  label: "دواء" },
  { id: "bandage",               label: "جروح" },
  { id: "brain",                 label: "أعصاب" },
  { id: "radiology-box-outline", label: "أشعة" },
  { id: "account-heart-outline", label: "نفسي" },
];

const CATEGORIES = ["عام", "رعاية أولية", "عيادات متخصصة", "مختبرات", "أشعة وتصوير", "تطعيمات", "طوارئ", "جراحة", "طب الأطفال", "نساء وتوليد"];

// ── الأنواع ──
type ClinicService = {
  id: number;
  name: string;
  description?: string | null;
  category: string;
  icon: string;
  price?: number | null;
  price_note?: string | null;
  is_visible: boolean;
  show_price: boolean;
  sort_order: number;
};

type WorkHour = {
  day_of_week: number;
  day_name: string;
  is_open: boolean;
  open_time: string;
  close_time: string;
  break_start?: string;
  break_end?: string;
  notes?: string;
};

function defaultHours(): WorkHour[] {
  return DAYS.map(d => ({
    day_of_week: d.day,
    day_name: d.name,
    is_open: d.day !== 5,
    open_time: "08:00",
    close_time: "16:00",
    break_start: "",
    break_end: "",
    notes: "",
  }));
}

// ── الشاشة الرئيسية ──
export default function ClinicPortalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"services" | "hours">("services");

  // ── الخدمات ──
  const [services, setServices] = useState<ClinicService[]>([]);
  const [svcLoading, setSvcLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editSvc, setEditSvc] = useState<ClinicService | null>(null);

  // ── أوقات العمل ──
  const [hours, setHours] = useState<WorkHour[]>(defaultHours());
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem(TOKEN_KEY);
      if (t) {
        setToken(t);
        loadServices(t);
        loadHours(t);
      }
      setLoading(false);
    })();
  }, []);

  const loadServices = async (tok: string) => {
    const base = getApiUrl();
    if (!base) return;
    setSvcLoading(true);
    try {
      const r = await fetch(`${base}/api/inst/clinic-services`, {
        headers: { Authorization: `InstBearer ${tok}` },
      });
      if (r.ok) {
        const d = await r.json() as any;
        setServices(d.services || []);
      } else if (r.status === 401) {
        Alert.alert("انتهت الجلسة", "يرجى تسجيل الدخول مجدداً", [{ text: "حسناً", onPress: () => router.back() }]);
      }
    } catch {}
    finally { setSvcLoading(false); }
  };

  const loadHours = async (tok: string) => {
    const base = getApiUrl();
    if (!base) return;
    setHoursLoading(true);
    try {
      const r = await fetch(`${base}/api/inst/clinic-hours`, {
        headers: { Authorization: `InstBearer ${tok}` },
      });
      if (r.ok) {
        const d = await r.json() as any;
        if (d.hours?.length > 0) setHours(d.hours);
      }
    } catch {}
    finally { setHoursLoading(false); }
  };

  const toggleVisible = async (svc: ClinicService) => {
    if (!token) return;
    const base = getApiUrl();
    if (!base) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const updated = { ...svc, is_visible: !svc.is_visible };
    setServices(prev => prev.map(s => s.id === svc.id ? updated : s));
    try {
      await fetch(`${base}/api/inst/clinic-services/${svc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `InstBearer ${token}` },
        body: JSON.stringify({ is_visible: !svc.is_visible }),
      });
    } catch {}
  };

  const toggleShowPrice = async (svc: ClinicService) => {
    if (!token) return;
    const base = getApiUrl();
    if (!base) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const updated = { ...svc, show_price: !svc.show_price };
    setServices(prev => prev.map(s => s.id === svc.id ? updated : s));
    try {
      await fetch(`${base}/api/inst/clinic-services/${svc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `InstBearer ${token}` },
        body: JSON.stringify({ show_price: !svc.show_price }),
      });
    } catch {}
  };

  const deleteService = (svc: ClinicService) => {
    Alert.alert("حذف الخدمة", `هل تريد حذف "${svc.name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
        onPress: async () => {
          const base = getApiUrl();
          if (!base || !token) return;
          try {
            await fetch(`${base}/api/inst/clinic-services/${svc.id}`, {
              method: "DELETE",
              headers: { Authorization: `InstBearer ${token}` },
            });
            setServices(prev => prev.filter(s => s.id !== svc.id));
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch { Alert.alert("خطأ", "تعذّر حذف الخدمة"); }
        },
      },
    ]);
  };

  const saveHours = async () => {
    if (!token) return;
    const base = getApiUrl();
    if (!base) return;
    setHoursLoading(true);
    try {
      const r = await fetch(`${base}/api/inst/clinic-hours`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `InstBearer ${token}` },
        body: JSON.stringify({ hours }),
      });
      if (r.ok) {
        setHoursSaved(true);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setHoursSaved(false), 3000);
      } else {
        Alert.alert("خطأ", "تعذّر حفظ أوقات العمل");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setHoursLoading(false); }
  };

  const updateHourField = (dayOfWeek: number, field: keyof WorkHour, value: any) => {
    setHours(prev => prev.map(h => h.day_of_week === dayOfWeek ? { ...h, [field]: value } : h));
    setHoursSaved(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#E74C6F" />
      </View>
    );
  }

  if (!token) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center", padding: 32 }}>
        <MaterialCommunityIcons name="hospital-building" size={64} color={Colors.textMuted} />
        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "center", marginTop: 16 }}>
          يرجى تسجيل الدخول أولاً
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#E74C6F" }}>العودة لبوابة المؤسسة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* الرأس */}
      <LinearGradient
        colors={["#1A0A10", "#1E0C14", Colors.bg]}
        style={[st.header, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 12 }]}
      >
        <View style={st.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={st.headerTitle}>إدارة المستوصف</Text>
            <Text style={st.headerSub}>الخدمات وأوقات العمل</Text>
          </View>
          <View style={st.headerIcon}>
            <MaterialCommunityIcons name="hospital-building" size={26} color="#E74C6F" />
          </View>
        </View>

        {/* تبويبات */}
        <View style={st.tabs}>
          <TouchableOpacity
            style={[st.tab, tab === "hours" && st.tabActive]}
            onPress={() => setTab("hours")}
          >
            <Ionicons name="time-outline" size={15} color={tab === "hours" ? "#E74C6F" : Colors.textMuted} />
            <Text style={[st.tabText, tab === "hours" && st.tabTextActive]}>أوقات العمل</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.tab, tab === "services" && st.tabActive]}
            onPress={() => setTab("services")}
          >
            <MaterialCommunityIcons name="medical-bag" size={15} color={tab === "services" ? "#E74C6F" : Colors.textMuted} />
            <Text style={[st.tabText, tab === "services" && st.tabTextActive]}>الخدمات</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {tab === "services" ? (
        <ServicesTab
          services={services}
          loading={svcLoading}
          token={token}
          onToggleVisible={toggleVisible}
          onToggleShowPrice={toggleShowPrice}
          onDelete={deleteService}
          onEdit={svc => { setEditSvc(svc); setShowAddModal(true); }}
          onAdd={() => { setEditSvc(null); setShowAddModal(true); }}
          onReload={() => loadServices(token)}
        />
      ) : (
        <HoursTab
          hours={hours}
          loading={hoursLoading}
          saved={hoursSaved}
          onUpdate={updateHourField}
          onSave={saveHours}
        />
      )}

      {/* مودال إضافة/تعديل خدمة */}
      <ServiceModal
        visible={showAddModal}
        service={editSvc}
        token={token}
        onClose={() => { setShowAddModal(false); setEditSvc(null); }}
        onSaved={() => { setShowAddModal(false); setEditSvc(null); loadServices(token); }}
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════
// تبويب الخدمات
// ══════════════════════════════════════════════════════
function ServicesTab({
  services, loading, token,
  onToggleVisible, onToggleShowPrice, onDelete, onEdit, onAdd, onReload,
}: {
  services: ClinicService[];
  loading: boolean;
  token: string;
  onToggleVisible: (s: ClinicService) => void;
  onToggleShowPrice: (s: ClinicService) => void;
  onDelete: (s: ClinicService) => void;
  onEdit: (s: ClinicService) => void;
  onAdd: () => void;
  onReload: () => void;
}) {
  const visibleCount = services.filter(s => s.is_visible).length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      {/* بطاقة الإحصاء + زر إضافة */}
      <Animated.View entering={FadeInDown.delay(50).springify()}>
        <View style={sv.statsRow}>
          <TouchableOpacity style={sv.addBtn} onPress={onAdd} activeOpacity={0.85}>
            <LinearGradient colors={["#E74C6F", "#C43057"]} style={sv.addBtnGrad}>
              <MaterialCommunityIcons name="plus" size={18} color="#fff" />
              <Text style={sv.addBtnText}>إضافة خدمة</Text>
            </LinearGradient>
          </TouchableOpacity>
          <View style={sv.statsCells}>
            <View style={sv.statCell}>
              <Text style={[sv.statVal, { color: "#E74C6F" }]}>{services.length}</Text>
              <Text style={sv.statLabel}>إجمالي</Text>
            </View>
            <View style={[sv.statCell, { borderRightWidth: 1, borderRightColor: Colors.divider }]}>
              <Text style={[sv.statVal, { color: Colors.primary }]}>{visibleCount}</Text>
              <Text style={sv.statLabel}>ظاهرة</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {loading ? (
        <ActivityIndicator color="#E74C6F" style={{ marginTop: 40 }} />
      ) : services.length === 0 ? (
        <Animated.View entering={FadeIn.duration(400)} style={sv.empty}>
          <MaterialCommunityIcons name="stethoscope" size={56} color={Colors.textMuted} />
          <Text style={sv.emptyTitle}>لا توجد خدمات بعد</Text>
          <Text style={sv.emptySub}>اضغط "إضافة خدمة" لإضافة أول خدمة للمستوصف</Text>
        </Animated.View>
      ) : (
        services.map((svc, idx) => (
          <Animated.View key={svc.id} entering={FadeInDown.delay(60 + idx * 40).springify()}>
            <ServiceCard
              svc={svc}
              onToggleVisible={() => onToggleVisible(svc)}
              onToggleShowPrice={() => onToggleShowPrice(svc)}
              onEdit={() => onEdit(svc)}
              onDelete={() => onDelete(svc)}
            />
          </Animated.View>
        ))
      )}
    </ScrollView>
  );
}

// ── بطاقة خدمة واحدة ──
function ServiceCard({
  svc, onToggleVisible, onToggleShowPrice, onEdit, onDelete,
}: {
  svc: ClinicService;
  onToggleVisible: () => void;
  onToggleShowPrice: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[sv.card, !svc.is_visible && sv.cardOff]}>
      {/* رأس البطاقة */}
      <View style={sv.cardTop}>
        <View style={sv.cardActions}>
          <TouchableOpacity onPress={onDelete} style={sv.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onEdit} style={sv.editBtn}>
            <Ionicons name="pencil-outline" size={16} color={Colors.cyber} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[sv.cardName, !svc.is_visible && { color: Colors.textMuted }]} numberOfLines={1}>
            {svc.name}
          </Text>
          <View style={sv.catRow}>
            <View style={sv.catBadge}>
              <Text style={sv.catText}>{svc.category}</Text>
            </View>
          </View>
          {svc.description ? (
            <Text style={sv.cardDesc} numberOfLines={2}>{svc.description}</Text>
          ) : null}
        </View>
        <View style={[sv.iconBox, { backgroundColor: svc.is_visible ? "#E74C6F15" : Colors.bg, borderColor: svc.is_visible ? "#E74C6F30" : Colors.divider }]}>
          <MaterialCommunityIcons name={svc.icon as any} size={22} color={svc.is_visible ? "#E74C6F" : Colors.textMuted} />
        </View>
      </View>

      {/* السعر */}
      {svc.price != null && (
        <View style={sv.priceRow}>
          <View style={sv.priceBadge}>
            <MaterialCommunityIcons name="cash" size={14} color={Colors.primary} />
            <Text style={sv.priceVal}>
              {svc.show_price ? `${svc.price} SDG${svc.price_note ? ` · ${svc.price_note}` : ""}` : "السعر مخفي"}
            </Text>
          </View>
        </View>
      )}

      <View style={sv.divider} />

      {/* مفاتيح التحكم */}
      <View style={sv.switches}>
        <View style={sv.switchRow}>
          <Switch
            value={svc.show_price}
            onValueChange={onToggleShowPrice}
            trackColor={{ false: Colors.divider, true: Colors.primary + "60" }}
            thumbColor={svc.show_price ? Colors.primary : Colors.textMuted}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            disabled={svc.price == null}
          />
          <Text style={[sv.switchLabel, svc.price == null && { color: Colors.textMuted }]}>إظهار السعر</Text>
        </View>
        <View style={sv.switchRow}>
          <Switch
            value={svc.is_visible}
            onValueChange={onToggleVisible}
            trackColor={{ false: Colors.divider, true: "#E74C6F60" }}
            thumbColor={svc.is_visible ? "#E74C6F" : Colors.textMuted}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
          <Text style={sv.switchLabel}>إظهار للزوار</Text>
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// تبويب أوقات العمل
// ══════════════════════════════════════════════════════
function HoursTab({
  hours, loading, saved, onUpdate, onSave,
}: {
  hours: WorkHour[];
  loading: boolean;
  saved: boolean;
  onUpdate: (day: number, field: keyof WorkHour, value: any) => void;
  onSave: () => void;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeIn.duration(400)}>
        <View style={hw.infoCard}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.cyber} />
          <Text style={hw.infoText}>
            حدّد أوقات عمل المستوصف لكل يوم. ستظهر هذه الأوقات للزوار مع مؤشر "مفتوح الآن".
          </Text>
        </View>
      </Animated.View>

      {saved && (
        <Animated.View entering={ZoomIn.springify()}>
          <View style={hw.savedBanner}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
            <Text style={hw.savedText}>تم حفظ أوقات العمل بنجاح</Text>
          </View>
        </Animated.View>
      )}

      {hours.map((h, idx) => (
        <Animated.View key={h.day_of_week} entering={FadeInDown.delay(50 + idx * 30).springify()}>
          <DayCard hour={h} onUpdate={(field, val) => onUpdate(h.day_of_week, field, val)} />
        </Animated.View>
      ))}

      <TouchableOpacity onPress={onSave} disabled={loading} activeOpacity={0.85} style={{ marginTop: 4 }}>
        <LinearGradient
          colors={loading ? [Colors.divider, Colors.divider] : ["#E74C6F", "#C43057"]}
          style={hw.saveBtn}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={hw.saveBtnText}>حفظ أوقات العمل</Text>
              </>
          }
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── بطاقة يوم واحد ──
function DayCard({ hour, onUpdate }: { hour: WorkHour; onUpdate: (field: keyof WorkHour, val: any) => void }) {
  return (
    <View style={[hw.dayCard, !hour.is_open && hw.dayCardOff]}>
      <View style={hw.dayTop}>
        <Switch
          value={hour.is_open}
          onValueChange={v => { if (Platform.OS !== "web") Haptics.selectionAsync(); onUpdate("is_open", v); }}
          trackColor={{ false: Colors.divider, true: "#E74C6F60" }}
          thumbColor={hour.is_open ? "#E74C6F" : Colors.textMuted}
          style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
        />
        <View style={{ alignItems: "flex-end", flex: 1 }}>
          <Text style={[hw.dayName, !hour.is_open && { color: Colors.textMuted }]}>{hour.day_name}</Text>
          {!hour.is_open && <Text style={hw.closedLabel}>إجازة / مغلق</Text>}
        </View>
        <View style={[hw.dayDot, { backgroundColor: hour.is_open ? "#E74C6F" : Colors.textMuted }]} />
      </View>

      {hour.is_open && (
        <Animated.View entering={FadeInDown.springify()} style={hw.timeGrid}>
          <View style={hw.timeRow}>
            <View style={hw.timeField}>
              <Text style={hw.timeLabel}>وقت الإغلاق</Text>
              <TextInput
                style={hw.timeInput}
                value={hour.close_time}
                onChangeText={v => onUpdate("close_time", v)}
                placeholder="16:00"
                placeholderTextColor={Colors.textMuted}
                textAlign="center"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={hw.timeSep}>
              <Ionicons name="swap-horizontal-outline" size={18} color={Colors.textMuted} />
            </View>
            <View style={hw.timeField}>
              <Text style={hw.timeLabel}>وقت الفتح</Text>
              <TextInput
                style={hw.timeInput}
                value={hour.open_time}
                onChangeText={v => onUpdate("open_time", v)}
                placeholder="08:00"
                placeholderTextColor={Colors.textMuted}
                textAlign="center"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {/* استراحة */}
          <View style={hw.breakRow}>
            <Text style={hw.breakLabel}>وقت الاستراحة (اختياري)</Text>
            <View style={hw.breakFields}>
              <TextInput
                style={hw.breakInput}
                value={hour.break_end || ""}
                onChangeText={v => onUpdate("break_end", v)}
                placeholder="13:00"
                placeholderTextColor={Colors.textMuted}
                textAlign="center"
                keyboardType="numbers-and-punctuation"
              />
              <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular" }}>–</Text>
              <TextInput
                style={hw.breakInput}
                value={hour.break_start || ""}
                onChangeText={v => onUpdate("break_start", v)}
                placeholder="12:00"
                placeholderTextColor={Colors.textMuted}
                textAlign="center"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {/* ملاحظة */}
          <TextInput
            style={hw.notesInput}
            value={hour.notes || ""}
            onChangeText={v => onUpdate("notes", v)}
            placeholder="ملاحظات اختيارية... مثل: الكشف فقط صباحاً"
            placeholderTextColor={Colors.textMuted}
            textAlign="right"
            multiline
          />
        </Animated.View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════
// مودال إضافة / تعديل خدمة
// ══════════════════════════════════════════════════════
function ServiceModal({
  visible, service, token, onClose, onSaved,
}: {
  visible: boolean;
  service: ClinicService | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!service;

  const [name, setName]             = useState("");
  const [desc, setDesc]             = useState("");
  const [category, setCategory]     = useState(CATEGORIES[0]);
  const [icon, setIcon]             = useState("medical-bag");
  const [price, setPrice]           = useState("");
  const [priceNote, setPriceNote]   = useState("");
  const [showPrice, setShowPrice]   = useState(true);
  const [isVisible, setIsVisible]   = useState(true);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    if (visible) {
      setName(service?.name || "");
      setDesc(service?.description || "");
      setCategory(service?.category || CATEGORIES[0]);
      setIcon(service?.icon || "medical-bag");
      setPrice(service?.price != null ? String(service.price) : "");
      setPriceNote(service?.price_note || "");
      setShowPrice(service?.show_price !== false);
      setIsVisible(service?.is_visible !== false);
    }
  }, [visible, service]);

  const save = async () => {
    if (!name.trim()) { Alert.alert("خطأ", "اسم الخدمة مطلوب"); return; }
    const base = getApiUrl();
    if (!base) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: desc.trim() || null,
        category,
        icon,
        price: price.trim() ? parseFloat(price) : null,
        price_note: priceNote.trim() || null,
        show_price: showPrice,
        is_visible: isVisible,
      };
      const url = isEdit
        ? `${base}/api/inst/clinic-services/${service!.id}`
        : `${base}/api/inst/clinic-services`;
      const r = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `InstBearer ${token}` },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSaved();
      } else {
        const err = await r.json() as any;
        Alert.alert("خطأ", err.error || "تعذّر الحفظ");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* رأس المودال */}
        <LinearGradient colors={["#1A0A10", Colors.cardBg]} style={md.header}>
          <TouchableOpacity onPress={onClose} style={md.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={md.title}>{isEdit ? "تعديل الخدمة" : "إضافة خدمة جديدة"}</Text>
          <MaterialCommunityIcons name="medical-bag" size={22} color="#E74C6F" />
        </LinearGradient>

        <ScrollView contentContainerStyle={md.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* اسم الخدمة */}
          <View style={md.field}>
            <Text style={md.label}>اسم الخدمة <Text style={{ color: Colors.danger }}>*</Text></Text>
            <TextInput
              style={md.input}
              value={name}
              onChangeText={setName}
              placeholder="مثال: فحص عام، كشف أطفال، تحليل دم..."
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
            />
          </View>

          {/* الوصف */}
          <View style={md.field}>
            <Text style={md.label}>وصف الخدمة (اختياري)</Text>
            <TextInput
              style={[md.input, { height: 80, textAlignVertical: "top", paddingTop: 10 }]}
              value={desc}
              onChangeText={setDesc}
              placeholder="وصف مختصر للخدمة..."
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
              multiline
            />
          </View>

          {/* التصنيف */}
          <View style={md.field}>
            <Text style={md.label}>التصنيف</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, flexDirection: "row-reverse" }}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[md.catChip, category === cat && md.catChipActive]}
                >
                  <Text style={[md.catChipText, category === cat && { color: "#E74C6F" }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* الأيقونة */}
          <View style={md.field}>
            <Text style={md.label}>الأيقونة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4, flexDirection: "row-reverse" }}>
              {SERVICE_ICONS.map(ic => (
                <TouchableOpacity
                  key={ic.id}
                  onPress={() => setIcon(ic.id)}
                  style={[md.iconChip, icon === ic.id && md.iconChipActive]}
                >
                  <MaterialCommunityIcons name={ic.id as any} size={22} color={icon === ic.id ? "#E74C6F" : Colors.textMuted} />
                  <Text style={[md.iconLabel, icon === ic.id && { color: "#E74C6F" }]}>{ic.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* السعر */}
          <View style={md.field}>
            <Text style={md.label}>السعر (SDG) — اتركه فارغاً إذا لم يكن له سعر ثابت</Text>
            <TextInput
              style={md.input}
              value={price}
              onChangeText={setPrice}
              placeholder="مثال: 2000"
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
              keyboardType="numeric"
            />
          </View>

          {/* ملاحظة السعر */}
          {!!price.trim() && (
            <View style={md.field}>
              <Text style={md.label}>ملاحظة السعر (اختياري)</Text>
              <TextInput
                style={md.input}
                value={priceNote}
                onChangeText={setPriceNote}
                placeholder="مثال: يبدأ من، لكل جلسة، شامل الدواء..."
                placeholderTextColor={Colors.textMuted}
                textAlign="right"
              />
            </View>
          )}

          {/* مفاتيح التحكم */}
          <View style={md.switchesCard}>
            <View style={md.switchRow}>
              <Switch
                value={showPrice}
                onValueChange={setShowPrice}
                trackColor={{ false: Colors.divider, true: Colors.primary + "60" }}
                thumbColor={showPrice ? Colors.primary : Colors.textMuted}
                disabled={!price.trim()}
              />
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={md.switchLabel}>إظهار السعر للزوار</Text>
                {!price.trim() && <Text style={md.switchSub}>لا يوجد سعر محدد</Text>}
              </View>
              <MaterialCommunityIcons name="cash" size={18} color={Colors.primary} />
            </View>
            <View style={[md.switchRow, { borderTopWidth: 1, borderTopColor: Colors.divider }]}>
              <Switch
                value={isVisible}
                onValueChange={setIsVisible}
                trackColor={{ false: Colors.divider, true: "#E74C6F60" }}
                thumbColor={isVisible ? "#E74C6F" : Colors.textMuted}
              />
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={md.switchLabel}>إظهار الخدمة للزوار</Text>
                <Text style={md.switchSub}>{isVisible ? "ستظهر في قائمة خدمات المستوصف" : "مخفية مؤقتاً"}</Text>
              </View>
              <MaterialCommunityIcons name="eye-outline" size={18} color="#E74C6F" />
            </View>
          </View>

          {/* زر الحفظ */}
          <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85}>
            <LinearGradient
              colors={saving ? [Colors.divider, Colors.divider] : ["#E74C6F", "#C43057"]}
              style={md.saveBtn}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="save-outline" size={20} color="#fff" />
                    <Text style={md.saveBtnText}>{isEdit ? "حفظ التعديلات" : "إضافة الخدمة"}</Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════
// الأنماط
// ══════════════════════════════════════════════════════
const st = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 14 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.cardBg, justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: Colors.divider,
  },
  headerIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: "#E74C6F18", borderWidth: 1, borderColor: "#E74C6F30",
    justifyContent: "center", alignItems: "center",
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  headerSub:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  tabs: {
    flexDirection: "row", gap: 8,
    backgroundColor: Colors.cardBg, borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: Colors.divider,
  },
  tab: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 9, borderRadius: 10,
  },
  tabActive: { backgroundColor: "#E74C6F18" },
  tabText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  tabTextActive: { color: "#E74C6F" },
});

const sv = StyleSheet.create({
  statsRow: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: Colors.cardBg, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.divider, overflow: "hidden",
  },
  statsCells: { flexDirection: "row-reverse", flex: 1 },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 14 },
  statVal: { fontFamily: "Cairo_700Bold", fontSize: 22 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  addBtn: { padding: 8 },
  addBtnGrad: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
  },
  addBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textSecondary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },

  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: "#E74C6F25", gap: 10,
  },
  cardOff: { borderColor: Colors.divider, opacity: 0.8 },
  cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  cardActions: { flexDirection: "column", gap: 6, alignItems: "center" },
  deleteBtn: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: Colors.danger + "12", borderWidth: 1, borderColor: Colors.danger + "25",
    justifyContent: "center", alignItems: "center",
  },
  editBtn: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: Colors.cyber + "12", borderWidth: 1, borderColor: Colors.cyber + "25",
    justifyContent: "center", alignItems: "center",
  },
  iconBox: {
    width: 46, height: 46, borderRadius: 13,
    justifyContent: "center", alignItems: "center", borderWidth: 1,
  },
  cardName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  catRow: { flexDirection: "row-reverse", marginTop: 2 },
  catBadge: {
    backgroundColor: "#E74C6F12", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  catText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#E74C6F" },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 19, marginTop: 2 },
  priceRow: { flexDirection: "row-reverse" },
  priceBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    backgroundColor: Colors.primary + "12", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  priceVal: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },
  divider: { height: 1, backgroundColor: Colors.divider },
  switches: { flexDirection: "row", gap: 6 },
  switchRow: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  switchLabel: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary, flex: 1, textAlign: "right" },
});

const hw = StyleSheet.create({
  infoCard: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.cyber + "10", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.cyber + "25",
  },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 20 },
  savedBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: Colors.primary + "15", borderWidth: 1, borderColor: Colors.primary + "40",
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
  },
  savedText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },
  dayCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "#E74C6F25", gap: 12,
  },
  dayCardOff: { borderColor: Colors.divider, opacity: 0.75 },
  dayTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  dayDot: { width: 10, height: 10, borderRadius: 5 },
  dayName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  closedLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  timeGrid: { gap: 10 },
  timeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  timeField: { flex: 1, gap: 4 },
  timeLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" },
  timeInput: {
    backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider,
    paddingVertical: 10, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary,
  },
  timeSep: { alignItems: "center", paddingTop: 18 },
  breakRow: { gap: 6 },
  breakLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  breakFields: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  breakInput: {
    flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider,
    paddingVertical: 8, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textPrimary,
  },
  notesInput: {
    backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 12, paddingVertical: 9,
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textPrimary, minHeight: 40,
  },
  saveBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 15, borderRadius: 14, marginTop: 4,
  },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
});

const md = StyleSheet.create({
  header: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center",
  },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  body: { padding: 16, paddingBottom: 60, gap: 14 },
  field: { gap: 8 },
  label: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  input: {
    backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary,
  },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
  },
  catChipActive: { borderColor: "#E74C6F60", backgroundColor: "#E74C6F12" },
  catChipText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },
  iconChip: {
    alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg,
  },
  iconChipActive: { borderColor: "#E74C6F60", backgroundColor: "#E74C6F12" },
  iconLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  switchesCard: {
    backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden",
  },
  switchRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14,
  },
  switchLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  switchSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  saveBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 15, borderRadius: 14, marginTop: 8,
  },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
});
