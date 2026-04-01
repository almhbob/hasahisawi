import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ScrollView, Pressable, Alert, Platform, Linking,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import AnimatedPress from "@/components/AnimatedPress";

// ─── Types ─────────────────────────────────────────────────────

type CatKey = "wafid" | "foreign" | "displaced" | "expat";

type Community = {
  id: number;
  name: string;
  category: CatKey;
  origin?: string;
  description?: string;
  representative_name?: string;
  contact_phone?: string;
  members_count: number;
  neighborhood?: string;
  services?: string;
  meeting_schedule?: string;
  status: string;
  created_at: string;
};

// ─── Category Config ────────────────────────────────────────────

const CATEGORIES: Record<CatKey, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  wafid:      { label: "وافد سوداني",    icon: "people",             color: Colors.primary, bg: Colors.primary + "18" },
  foreign:    { label: "جالية أجنبية",   icon: "earth",              color: Colors.cyber,   bg: Colors.cyber   + "18" },
  displaced:  { label: "نازحون ولاجئون", icon: "home",               color: Colors.accent,  bg: Colors.accent  + "18" },
  expat:      { label: "مغتربون",        icon: "airplane",           color: "#9B59B6",      bg: "#9B59B618"           },
};

type FilterKey = "all" | CatKey;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",      label: "الكل"            },
  { key: "wafid",    label: "وافدون سودانيون" },
  { key: "foreign",  label: "جاليات أجنبية"   },
  { key: "displaced",label: "نازحون"           },
  { key: "expat",    label: "مغتربون"          },
];

// ─── Helpers ────────────────────────────────────────────────────

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}ألف`;
  return String(n);
}

// ─── Community Card ─────────────────────────────────────────────

function CommunityCard({ c, index, onPress }: { c: Community; index: number; onPress: () => void }) {
  const meta = CATEGORIES[c.category] ?? CATEGORIES.wafid;
  return (
    <Animated.View entering={FadeInDown.delay(index * 65).springify().damping(18)}>
      <TouchableOpacity style={[styles.card, { borderRightColor: meta.color, borderRightWidth: 4 }]} onPress={onPress} activeOpacity={0.85}>
        {/* Top row */}
        <View style={styles.cardTop}>
          <View style={[styles.cardIcon, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={22} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{c.name}</Text>
            {c.origin ? <Text style={styles.cardOrigin}>{c.origin}</Text> : null}
          </View>
          <View style={[styles.catBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.catBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        {/* Description */}
        {c.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{c.description}</Text>
        ) : null}

        {/* Services */}
        {c.services ? (
          <View style={styles.servicesRow}>
            <Ionicons name="checkmark-circle" size={12} color={meta.color} />
            <Text style={styles.servicesText} numberOfLines={1}>{c.services}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.cardFooter}>
          {c.neighborhood ? (
            <View style={styles.metaChip}>
              <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.metaChipText}>{c.neighborhood}</Text>
            </View>
          ) : null}
          {c.members_count > 0 ? (
            <View style={[styles.metaChip, { backgroundColor: meta.bg }]}>
              <Ionicons name="people-outline" size={11} color={meta.color} />
              <Text style={[styles.metaChipText, { color: meta.color }]}>{formatCount(c.members_count)} عضو</Text>
            </View>
          ) : null}
          {c.contact_phone ? (
            <TouchableOpacity
              style={[styles.callBtn, { backgroundColor: meta.color }]}
              onPress={() => Linking.openURL(`tel:${c.contact_phone}`)}
            >
              <Ionicons name="call" size={12} color="#fff" />
              <Text style={styles.callBtnText}>تواصل</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Service Management Modal ────────────────────────────────────

type SvcRequest = {
  id: number;
  action: "add" | "hide" | "show";
  service_name: string;
  status: "pending" | "approved" | "rejected";
  submitted_by_name?: string;
  created_at: string;
};

function ServiceManagementModal({
  community,
  token,
  onClose,
}: {
  community: Community;
  token: string;
  onClose: () => void;
}) {
  const meta = CATEGORIES[community.category] ?? CATEGORIES.wafid;
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [requests, setRequests] = useState<SvcRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newSvc, setNewSvc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/communities/${community.id}/services`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setVisible(d.visible || []);
        setHidden(d.hidden || []);
        setRequests(d.requests || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [community.id, token]);

  useEffect(() => { load(); }, [load]);

  const submitRequest = async (action: "add" | "hide" | "show", service_name: string) => {
    if (!service_name.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/communities/${community.id}/service-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, service_name: service_name.trim() }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (action === "add") setNewSvc("");
        await load();
      } else {
        const j = await res.json();
        Alert.alert("تنبيه", j.error || "تعذّرت العملية");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSending(false); }
  };

  const pendingFor = (action: string, name: string) =>
    requests.some(r => r.action === action && r.service_name === name && r.status === "pending");

  const ACTION_LABELS: Record<string, string> = { add: "إضافة", hide: "إخفاء", show: "إظهار" };
  const STATUS_COLORS: Record<string, string> = { pending: Colors.accent, approved: Colors.primary, rejected: "#EF4444" };
  const STATUS_LABELS: Record<string, string> = { pending: "معلّق", approved: "مقبول", rejected: "مرفوض" };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.svcSheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.svcSheetHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.svcSheetTitle}>إدارة الخدمات</Text>
            <View style={{ width: 22 }} />
          </View>
          <Text style={styles.svcSheetSub}>{community.name}</Text>

          {loading ? (
            <ActivityIndicator color={meta.color} style={{ marginTop: 40 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16 }}>

              {/* إضافة خدمة جديدة */}
              <View style={styles.svcSection}>
                <Text style={styles.svcSectionTitle}>إضافة خدمة جديدة</Text>
                <View style={styles.svcAddRow}>
                  <TouchableOpacity
                    style={[styles.svcAddBtn, { backgroundColor: meta.color, opacity: sending || !newSvc.trim() ? 0.5 : 1 }]}
                    onPress={() => submitRequest("add", newSvc)}
                    disabled={sending || !newSvc.trim()}
                  >
                    <Ionicons name="add" size={18} color="#fff" />
                    <Text style={styles.svcAddBtnText}>إرسال طلب</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.svcInput, { flex: 1 }]}
                    placeholder="اسم الخدمة..."
                    placeholderTextColor={Colors.textMuted}
                    value={newSvc}
                    onChangeText={setNewSvc}
                    textAlign="right"
                  />
                </View>
              </View>

              {/* الخدمات المرئية */}
              {visible.length > 0 && (
                <View style={styles.svcSection}>
                  <Text style={styles.svcSectionTitle}>الخدمات الحالية</Text>
                  {visible.map(svc => {
                    const isPending = pendingFor("hide", svc);
                    return (
                      <View key={svc} style={styles.svcRow}>
                        <TouchableOpacity
                          style={[styles.svcActionBtn, { borderColor: isPending ? Colors.textMuted : "#EF4444", opacity: isPending ? 0.5 : 1 }]}
                          onPress={() => submitRequest("hide", svc)}
                          disabled={isPending || sending}
                        >
                          <Ionicons name={isPending ? "time-outline" : "eye-off-outline"} size={14} color={isPending ? Colors.textMuted : "#EF4444"} />
                          <Text style={[styles.svcActionBtnText, { color: isPending ? Colors.textMuted : "#EF4444" }]}>
                            {isPending ? "معلّق" : "إخفاء"}
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.svcItemLeft}>
                          <Ionicons name="checkmark-circle" size={14} color={meta.color} />
                          <Text style={styles.svcItemText}>{svc}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* الخدمات المخفية */}
              {hidden.length > 0 && (
                <View style={styles.svcSection}>
                  <Text style={[styles.svcSectionTitle, { color: Colors.textMuted }]}>الخدمات المخفية</Text>
                  {hidden.map(svc => {
                    const isPending = pendingFor("show", svc);
                    return (
                      <View key={svc} style={styles.svcRow}>
                        <TouchableOpacity
                          style={[styles.svcActionBtn, { borderColor: isPending ? Colors.textMuted : meta.color, opacity: isPending ? 0.5 : 1 }]}
                          onPress={() => submitRequest("show", svc)}
                          disabled={isPending || sending}
                        >
                          <Ionicons name={isPending ? "time-outline" : "eye-outline"} size={14} color={isPending ? Colors.textMuted : meta.color} />
                          <Text style={[styles.svcActionBtnText, { color: isPending ? Colors.textMuted : meta.color }]}>
                            {isPending ? "معلّق" : "إظهار"}
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.svcItemLeft}>
                          <Ionicons name="eye-off-outline" size={14} color={Colors.textMuted} />
                          <Text style={[styles.svcItemText, { color: Colors.textMuted }]}>{svc}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* سجل الطلبات */}
              {requests.length > 0 && (
                <View style={styles.svcSection}>
                  <Text style={styles.svcSectionTitle}>سجل الطلبات</Text>
                  {requests.slice(0, 10).map(r => (
                    <View key={r.id} style={styles.svcRequestRow}>
                      <View style={[styles.svcStatusBadge, { backgroundColor: STATUS_COLORS[r.status] + "22" }]}>
                        <Text style={[styles.svcStatusText, { color: STATUS_COLORS[r.status] }]}>{STATUS_LABELS[r.status]}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.svcRequestName}>{r.service_name}</Text>
                        <Text style={styles.svcRequestAction}>{ACTION_LABELS[r.action]}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Detail Modal ────────────────────────────────────────────────

function DetailModal({ c, onClose, token }: { c: Community; onClose: () => void; token?: string }) {
  const { isRTL } = useLang();
  const meta = CATEGORIES[c.category] ?? CATEGORIES.wafid;
  const insets = useSafeAreaInsets();
  const [showSvcMgmt, setShowSvcMgmt] = useState(false);
  const canManageSvcs = !!token;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.detailSheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          {showSvcMgmt && token && (
            <ServiceManagementModal community={c} token={token} onClose={() => setShowSvcMgmt(false)} />
          )}

          {/* Header */}
          <View style={[styles.detailHeader, { borderRightColor: meta.color, borderRightWidth: 4 }]}>
            <View style={[styles.detailIcon, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon} size={28} color={meta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailName}>{c.name}</Text>
              {c.origin ? <Text style={styles.detailOrigin}>{c.origin}</Text> : null}
              <View style={[styles.catBadge, { backgroundColor: meta.bg, alignSelf: "flex-end", marginTop: 4 }]}>
                <Text style={[styles.catBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 12 }}>
            {c.description ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>نبذة عن الجالية</Text>
                <Text style={styles.detailSectionText}>{c.description}</Text>
              </View>
            ) : null}

            {[
              { icon: "person-outline" as const, label: "الممثل المسؤول", value: c.representative_name },
              { icon: "call-outline"   as const, label: "رقم التواصل",    value: c.contact_phone      },
              { icon: "location-outline" as const, label: "الحي / المنطقة", value: c.neighborhood     },
              { icon: "time-outline"   as const, label: "مواعيد التجمع",  value: c.meeting_schedule   },
            ].filter(f => f.value).map(f => (
              <View key={f.label} style={styles.detailRow}>
                <Ionicons name={f.icon} size={16} color={meta.color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailRowLabel}>{f.label}</Text>
                  <Text style={styles.detailRowValue}>{f.value}</Text>
                </View>
              </View>
            ))}

            {c.members_count > 0 && (
              <View style={[styles.membersCard, { backgroundColor: meta.bg }]}>
                <Ionicons name="people" size={22} color={meta.color} />
                <Text style={[styles.membersCount, { color: meta.color }]}>{c.members_count.toLocaleString()}</Text>
                <Text style={[styles.membersLabel, { color: meta.color }]}>عضو مسجّل</Text>
              </View>
            )}

            {c.services ? (
              <View style={styles.detailSection}>
                <View style={styles.svcSectionHeader}>
                  <Text style={styles.detailSectionTitle}>الخدمات المقدَّمة</Text>
                  {canManageSvcs && (
                    <TouchableOpacity
                      style={[styles.svcMgmtBtn, { backgroundColor: meta.color + "22", borderColor: meta.color + "44" }]}
                      onPress={() => setShowSvcMgmt(true)}
                    >
                      <Ionicons name="settings-outline" size={13} color={meta.color} />
                      <Text style={[styles.svcMgmtBtnText, { color: meta.color }]}>إدارة الخدمات</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {c.services.split("·").map((s, i) => s.trim() ? (
                  <View key={i} style={styles.serviceItem}>
                    <Ionicons name="checkmark-circle" size={14} color={meta.color} />
                    <Text style={styles.serviceItemText}>{s.trim()}</Text>
                  </View>
                ) : null)}
              </View>
            ) : (
              canManageSvcs ? (
                <TouchableOpacity
                  style={[styles.svcEmptyBtn, { borderColor: meta.color + "44" }]}
                  onPress={() => setShowSvcMgmt(true)}
                >
                  <Ionicons name="add-circle-outline" size={18} color={meta.color} />
                  <Text style={[styles.svcEmptyBtnText, { color: meta.color }]}>إضافة خدمات للمؤسسة</Text>
                </TouchableOpacity>
              ) : null
            )}

            {c.contact_phone ? (
              <TouchableOpacity
                style={[styles.detailCallBtn, { backgroundColor: meta.color }]}
                onPress={() => Linking.openURL(`tel:${c.contact_phone}`)}
              >
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={styles.detailCallBtnText}>اتصل بالممثل المسؤول</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>إغلاق</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Register Modal ──────────────────────────────────────────────

function RegisterModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { isRTL } = useLang();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({
    name: "", category: "wafid" as CatKey, origin: "", description: "",
    representative_name: "", representative_title: "", representative_phone: "",
    representative_national_id: "", representative_email: "",
    contact_phone: "", members_count: "",
    neighborhood: "", services: "", meeting_schedule: "",
  });
  const [sending, setSending] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSend = async () => {
    if (!form.name.trim() || !form.contact_phone.trim()) {
      Alert.alert("مطلوب", "اسم الجهة ورقم التواصل إلزاميان");
      return;
    }
    if (!form.representative_name.trim()) {
      Alert.alert("مطلوب", "اسم ممثل الجهة إلزامي");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/communities/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          members_count: parseInt(form.members_count) || 0,
        }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose(); onSuccess();
      } else {
        const err = await res.json();
        Alert.alert("خطأ", err.error || "حاول مرة أخرى");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال"); }
    finally { setSending(false); }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.regSheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.regHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.regTitle}>طلب انضمام مؤسسة</Text>
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>{step}/3</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.regForm}>
            {/* ─── الخطوة ١: بيانات الجهة ─── */}
            {step === 1 && (
              <>
                <Text style={styles.formSectionTitle}>بيانات الجهة أو المؤسسة</Text>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>اسم المؤسسة / الجالية *</Text>
                  <TextInput style={styles.formInput} value={form.name} onChangeText={set("name")}
                    placeholder="الاسم الرسمي للجهة" placeholderTextColor={Colors.textMuted} textAlign="right" />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>نوع الجهة</Text>
                  <View style={styles.catGrid}>
                    {(Object.entries(CATEGORIES) as [CatKey, typeof CATEGORIES[CatKey]][]).map(([k, m]) => (
                      <TouchableOpacity
                        key={k}
                        style={[styles.catBtn, form.category === k && { backgroundColor: m.color, borderColor: m.color }]}
                        onPress={() => setForm(f => ({ ...f, category: k }))}
                      >
                        <Ionicons name={m.icon} size={13} color={form.category === k ? "#fff" : Colors.textSecondary} />
                        <Text style={[styles.catBtnText, form.category === k && { color: "#fff" }]}>{m.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>الأصل / المنشأ</Text>
                  <TextInput style={styles.formInput} value={form.origin} onChangeText={set("origin")}
                    placeholder="مثال: حكومية، أهلية، دولية" placeholderTextColor={Colors.textMuted} textAlign="right" />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>نبذة عن الجهة</Text>
                  <TextInput style={[styles.formInput, styles.formTextArea]} value={form.description} onChangeText={set("description")}
                    placeholder="وصف مختصر عن المؤسسة وأهدافها..." placeholderTextColor={Colors.textMuted}
                    multiline textAlign="right" textAlignVertical="top" />
                </View>

                <TouchableOpacity
                  style={styles.nextBtn}
                  onPress={() => {
                    if (!form.name.trim()) { Alert.alert("مطلوب", "أدخل اسم المؤسسة"); return; }
                    setStep(2);
                  }}
                >
                  <Text style={styles.nextBtnText}>التالي</Text>
                  <Ionicons name="chevron-back" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            )}

            {/* ─── الخطوة ٢: بيانات الممثل ─── */}
            {step === 2 && (
              <>
                <View style={{ backgroundColor: Colors.primary + "12", borderRadius: 10, padding: 12, marginBottom: 14, flexDirection: "row-reverse", gap: 8, alignItems: "center" }}>
                  <Ionicons name="person-circle-outline" size={20} color={Colors.primary} />
                  <Text style={[styles.formSectionTitle, { marginBottom: 0, color: Colors.primary }]}>بيانات ممثل الجهة</Text>
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>الاسم الكامل للممثل *</Text>
                  <TextInput style={styles.formInput} value={form.representative_name} onChangeText={set("representative_name")}
                    placeholder="الاسم الثلاثي أو الرباعي" placeholderTextColor={Colors.textMuted} textAlign="right" />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>المنصب / الصفة الوظيفية</Text>
                  <TextInput style={styles.formInput} value={form.representative_title} onChangeText={set("representative_title")}
                    placeholder="مثال: مدير عام، رئيس مجلس الإدارة" placeholderTextColor={Colors.textMuted} textAlign="right" />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>الهاتف الشخصي للممثل</Text>
                  <TextInput style={styles.formInput} value={form.representative_phone} onChangeText={set("representative_phone")}
                    placeholder="+249..." placeholderTextColor={Colors.textMuted}
                    keyboardType="phone-pad" textAlign="right" />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>رقم الهوية الوطنية</Text>
                  <TextInput style={styles.formInput} value={form.representative_national_id} onChangeText={set("representative_national_id")}
                    placeholder="رقم البطاقة الشخصية أو جواز السفر" placeholderTextColor={Colors.textMuted} textAlign="right" />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>البريد الإلكتروني</Text>
                  <TextInput style={styles.formInput} value={form.representative_email} onChangeText={set("representative_email")}
                    placeholder="example@email.com" placeholderTextColor={Colors.textMuted}
                    keyboardType="email-address" autoCapitalize="none" textAlign="right" />
                </View>

                <View style={styles.regBtns}>
                  <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                    <Text style={styles.backBtnText}>رجوع</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.nextBtn}
                    onPress={() => {
                      if (!form.representative_name.trim()) { Alert.alert("مطلوب", "أدخل اسم ممثل الجهة"); return; }
                      setStep(3);
                    }}
                  >
                    <Text style={styles.nextBtnText}>التالي</Text>
                    <Ionicons name="chevron-back" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ─── الخطوة ٣: بيانات التواصل والخدمات ─── */}
            {step === 3 && (
              <>
                <Text style={styles.formSectionTitle}>بيانات التواصل والخدمات</Text>

                {[
                  { label: "رقم تواصل المؤسسة *", key: "contact_phone" as const, placeholder: "+249...", numeric: true },
                  { label: "الحي / المنطقة", key: "neighborhood" as const, placeholder: "اسم الحي أو المنطقة" },
                  { label: "عدد الأعضاء التقريبي", key: "members_count" as const, placeholder: "مثال: 150", numeric: true },
                  { label: "مواعيد التجمع أو العمل", key: "meeting_schedule" as const, placeholder: "مثال: يومياً من ٨ص - ٤م" },
                ].map(f => (
                  <View key={f.key} style={styles.formField}>
                    <Text style={styles.formLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={form[f.key]}
                      onChangeText={set(f.key)}
                      placeholder={f.placeholder}
                      placeholderTextColor={Colors.textMuted}
                      keyboardType={(f as any).numeric ? "phone-pad" : "default"}
                      textAlign="right"
                    />
                  </View>
                ))}

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>الخدمات المقدَّمة</Text>
                  <TextInput style={[styles.formInput, styles.formTextArea]} value={form.services} onChangeText={set("services")}
                    placeholder="مثال: رعاية صحية · تعليم · خدمات اجتماعية" placeholderTextColor={Colors.textMuted}
                    multiline textAlign="right" textAlignVertical="top" />
                </View>

                <View style={styles.regBtns}>
                  <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                    <Text style={styles.backBtnText}>رجوع</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, { opacity: sending ? 0.7 : 1 }]}
                    onPress={handleSend} disabled={sending}
                  >
                    <Ionicons name="send" size={15} color="#fff" />
                    <Text style={styles.submitBtnText}>{sending ? "جاري الإرسال..." : "إرسال الطلب"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Stats Bar ───────────────────────────────────────────────────

function StatsBar({ communities }: { communities: Community[] }) {
  const total = communities.length;
  const members = communities.reduce((s, c) => s + (c.members_count || 0), 0);
  const foreign = communities.filter(c => c.category === "foreign").length;
  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.statsBar}>
      {[
        { label: "جالية مسجّلة", value: total, icon: "people" as const, color: Colors.primary },
        { label: "إجمالي الأعضاء", value: members.toLocaleString(), icon: "person" as const, color: Colors.cyber },
        { label: "جالية أجنبية", value: foreign, icon: "earth" as const, color: Colors.accent },
      ].map((s, i) => (
        <View key={i} style={styles.statItem}>
          <Ionicons name={s.icon} size={16} color={s.color} />
          <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
          <Text style={styles.statLabel}>{s.label}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────

export default function CommunitiesScreen() {
  const { isRTL } = useLang();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const auth = useAuth();
  const canManageServices = !auth.isGuest && !!auth.token && (auth.user?.role === "admin" || auth.user?.role === "moderator");

  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Community | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  const loadCommunities = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("category", filter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${getApiUrl()}/api/communities?${params}`);
      if (res.ok) setCommunities(await res.json());
    } catch {}
    finally { setLoading(false); }
  }, [filter, search]);

  useEffect(() => { loadCommunities(); }, [loadCommunities]);
  useFocusEffect(useCallback(() => { loadCommunities(); }, [loadCommunities]));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14 }]}>
        <View style={[styles.headerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={{ flex: 1, alignItems: isRTL ? "flex-end" : "flex-start" }}>
            <Text style={styles.headerTitle}>الجاليات بالحصاحيصا</Text>
            <Text style={styles.headerSub}>المجتمعات المقيمة بالمنطقة وخدماتها</Text>
          </View>
          <AnimatedPress
            style={[styles.regBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => setShowRegister(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.regBtnText}>سجّل جاليتك</Text>
          </AnimatedPress>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث باسم الجالية أو المنطقة..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign={isRTL ? "right" : "left"}
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Filter Pills */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={[styles.filtersRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        {FILTERS.map(f => {
          const color = f.key === "all" ? Colors.primary : (CATEGORIES[f.key as CatKey]?.color ?? Colors.primary);
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterBtn, filter === f.key && { backgroundColor: color + "20", borderColor: color }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, filter === f.key && { color, fontFamily: "Cairo_700Bold" }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Stats Bar */}
      {communities.length > 0 && <StatsBar communities={communities} />}

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="loading" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>جاري التحميل...</Text>
        </View>
      ) : communities.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {search ? `لا توجد جاليات تطابق "${search}"` : "لا توجد جاليات في هذه الفئة"}
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowRegister(true)}>
            <Text style={styles.emptyBtnText}>سجّل جاليتك الآن</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={communities}
          keyExtractor={c => String(c.id)}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <Animated.View entering={FadeIn.delay(300).duration(400)} style={styles.footerCard}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.textMuted} />
              <Text style={styles.footerText}>
                هل جاليتك غير مسجّلة؟ اضغط "سجّل جاليتك" لإرسال طلب التسجيل وستتم مراجعته من قِبل الإدارة.
              </Text>
            </Animated.View>
          }
          renderItem={({ item, index }) => (
            <CommunityCard c={item} index={index} onPress={() => setSelected(item)} />
          )}
        />
      )}

      {selected && <DetailModal c={selected} onClose={() => setSelected(null)} token={canManageServices ? auth.token ?? undefined : undefined} />}
      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onSuccess={() => {
            Alert.alert(
              "✅ تم الإرسال",
              "شكراً لك! تم استلام طلب تسجيل جاليتك وسيتم مراجعته من قِبل الإدارة خلال 48 ساعة.",
              [{ text: "حسناً" }]
            );
            loadCommunities();
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    backgroundColor: Colors.cardBg, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 12,
  },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 1, textAlign: "right" },
  regBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 9,
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
  },
  regBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#fff" },
  searchBox: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },

  // Filters
  filtersScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  filtersRow: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg,
  },
  filterText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },

  // Stats
  statsBar: {
    flexDirection: "row-reverse", backgroundColor: Colors.cardBg,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    paddingHorizontal: 8,
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 2 },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },

  // Card
  list: { padding: 14, gap: 12 },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.divider,
    padding: 14, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  cardIcon: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  cardName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", lineHeight: 22 },
  cardOrigin: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  catBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  catBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  servicesRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  servicesText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary, textAlign: "right", flex: 1 },
  cardFooter: { flexDirection: "row-reverse", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 4 },
  metaChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: Colors.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.divider,
  },
  metaChipText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  callBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginRight: "auto",
  },
  callBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff" },

  // Empty / center
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyText: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textSecondary, textAlign: "center" },
  emptyBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // Footer
  footerCard: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: Colors.divider,
  },
  footerText: {
    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted,
    textAlign: "right", lineHeight: 18,
  },

  // Overlay & sheets
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheetHandle: { width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },

  // Detail sheet
  detailSheet: {
    backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%",
  },
  detailHeader: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 12,
    margin: 16, padding: 14, borderRadius: 14,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider,
  },
  detailIcon: { width: 52, height: 52, borderRadius: 16, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  detailName: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  detailOrigin: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  detailSection: {
    backgroundColor: Colors.bg, borderRadius: 14, padding: 14, gap: 8,
    borderWidth: 1, borderColor: Colors.divider,
  },
  detailSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  detailSectionText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  detailRow: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.bg, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  detailRowLabel: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  detailRowValue: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", marginTop: 2 },
  membersCard: {
    borderRadius: 14, padding: 16, alignItems: "center", gap: 4,
  },
  membersCount: { fontFamily: "Cairo_700Bold", fontSize: 32 },
  membersLabel: { fontFamily: "Cairo_500Medium", fontSize: 13 },
  serviceItem: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  serviceItemText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  detailCallBtn: {
    borderRadius: 14, paddingVertical: 14,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  detailCallBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  closeBtn: {
    backgroundColor: Colors.divider, borderRadius: 14, paddingVertical: 12, alignItems: "center",
  },
  closeBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary },

  // Register sheet
  regSheet: {
    backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "95%",
  },
  regHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  regTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  stepPill: {
    backgroundColor: Colors.primary + "20", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  stepPillText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.primary },
  regForm: { padding: 16, gap: 12 },
  formSectionTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right",
    borderRightWidth: 3, borderRightColor: Colors.primary, paddingRight: 10, marginBottom: 4,
  },
  formField: { gap: 5 },
  formLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  formInput: {
    backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.divider,
  },
  formTextArea: { minHeight: 80, lineHeight: 22 },
  catGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  catBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg,
  },
  catBtnText: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textSecondary },
  nextBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 4,
  },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  regBtns: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  backBtn: { flex: 0.4, backgroundColor: Colors.divider, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  backBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textSecondary },
  submitBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  // Service management
  svcSectionHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  svcMgmtBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4,
  },
  svcMgmtBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  svcEmptyBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", paddingVertical: 14,
  },
  svcEmptyBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14 },
  svcSheet: {
    backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%",
  },
  svcSheetHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  svcSheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  svcSheetSub: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 6 },
  svcSection: {
    backgroundColor: Colors.bg, borderRadius: 14, padding: 14, gap: 10,
    borderWidth: 1, borderColor: Colors.divider,
  },
  svcSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  svcAddRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  svcAddBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  svcAddBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
  svcInput: {
    backgroundColor: Colors.cardBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.divider,
  },
  svcRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  svcActionBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5, flexShrink: 0,
  },
  svcActionBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  svcItemLeft: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  svcItemText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textPrimary, textAlign: "right", flex: 1 },
  svcRequestRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  svcStatusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  svcStatusText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  svcRequestName: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  svcRequestAction: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
});
