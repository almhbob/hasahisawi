import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  ActivityIndicator, RefreshControl, Alert, Platform, TextInput,
  Modal, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import type { ContractStatus } from "@/lib/feature-flags-context";

type Section = {
  section_key: string;
  section_name: string;
  section_name_en: string;
  section_description?: string;
  is_visible: boolean;
  requires_contract: boolean;
  contract_status: ContractStatus;
  contract_signed_at?: string;
  contract_expiry_at?: string;
  contract_notes?: string;
  authorized_entity?: string;
  authorized_contact?: string;
  sort_order: number;
  updated_at: string;
};

const CONTRACT_META: Record<ContractStatus, { label: string; color: string; icon: string }> = {
  none:    { label: "بدون عقد",    color: "#9CA3AF", icon: "ellipse-outline" },
  pending: { label: "قيد التفاوض", color: "#F59E0B", icon: "time-outline" },
  signed:  { label: "عقد ساري",    color: "#22C55E", icon: "checkmark-circle" },
  expired: { label: "انتهى العقد", color: "#EF4444", icon: "close-circle" },
};

const CONTRACT_STATUSES: ContractStatus[] = ["none", "pending", "signed", "expired"];

export default function AdminSectionsConfigScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();

  const [sections, setSections]     = useState<Section[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving]         = useState<string | null>(null);

  // Modal لتعديل القسم
  const [editModal, setEditModal]         = useState(false);
  const [editSection, setEditSection]     = useState<Section | null>(null);
  const [editContractStatus, setECS]      = useState<ContractStatus>("none");
  const [editSignedAt, setEditSignedAt]   = useState("");
  const [editExpiryAt, setEditExpiryAt]   = useState("");
  const [editNotes, setEditNotes]         = useState("");
  const [editEntity, setEditEntity]       = useState("");
  const [editContact, setEditContact]     = useState("");
  const [editDesc, setEditDesc]           = useState("");
  const [modalSaving, setModalSaving]     = useState(false);

  const headers = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/section-configs`, { headers: headers() });
      if (res.ok) { const d = await res.json(); setSections(d.sections ?? []); }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggleVisibility = async (key: string, newVal: boolean) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSaving(key);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/section-configs/${key}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ is_visible: newVal }),
      });
      if (res.ok) {
        setSections(prev => prev.map(s => s.section_key === key ? { ...s, is_visible: newVal } : s));
      } else {
        Alert.alert("خطأ", "فشل تحديث الرؤية");
        setSections(prev => prev.map(s => s.section_key === key ? { ...s, is_visible: !newVal } : s));
      }
    } catch { Alert.alert("خطأ", "تعذر الاتصال بالخادم"); }
    finally { setSaving(null); }
  };

  const openEdit = (sec: Section) => {
    setEditSection(sec);
    setECS(sec.contract_status);
    setEditSignedAt(sec.contract_signed_at?.slice(0, 10) || "");
    setEditExpiryAt(sec.contract_expiry_at?.slice(0, 10) || "");
    setEditNotes(sec.contract_notes || "");
    setEditEntity(sec.authorized_entity || "");
    setEditContact(sec.authorized_contact || "");
    setEditDesc(sec.section_description || "");
    setEditModal(true);
  };

  const saveEdit = async () => {
    if (!editSection) return;
    setModalSaving(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/section-configs/${editSection.section_key}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({
          contract_status:    editContractStatus,
          contract_signed_at: editSignedAt || null,
          contract_expiry_at: editExpiryAt || null,
          contract_notes:     editNotes.trim() || null,
          authorized_entity:  editEntity.trim() || null,
          authorized_contact: editContact.trim() || null,
          section_description: editDesc.trim() || null,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setSections(prev => prev.map(s => s.section_key === editSection.section_key ? d.section : s));
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setEditModal(false);
      } else { Alert.alert("خطأ", "فشل حفظ التغييرات"); }
    } catch { Alert.alert("خطأ", "تعذر الاتصال بالخادم"); }
    finally { setModalSaving(false); }
  };

  if (user?.role !== "admin") {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} />
        <Text style={s.emptyTitle}>غير مصرح</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#A5B4FC", textDecorationLine: "underline" }}>العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // تجميع الأقسام: أقسام حكومية ثم بقية
  const govSections   = sections.filter(s => s.requires_contract);
  const otherSections = sections.filter(s => !s.requires_contract);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* الهيدر */}
      <LinearGradient colors={["#0B1224", "#172554"]} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#A5B4FC" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>إدارة أقسام التطبيق</Text>
          <Text style={s.headerSub}>إخفاء وإظهار وإدارة التصاريح والعقود</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={s.iconBtn} hitSlop={12}>
          <Ionicons name="refresh-outline" size={20} color="#A5B4FC" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#6366F1" />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {loading ? (
          <View style={[s.center, { paddingTop: 60 }]}><ActivityIndicator color="#6366F1" size="large" /></View>
        ) : (
          <>
            {/* ─ الأقسام الحكومية ─ */}
            <Animated.View entering={FadeInDown.springify()}>
              <View style={s.groupHeader}>
                <Ionicons name="business-outline" size={18} color="#F59E0B" />
                <Text style={[s.groupTitle, { color: "#F59E0B" }]}>الأقسام الحكومية (تتطلب تصاريح وعقوداً)</Text>
              </View>
              <View style={{ gap: 10 }}>
                {govSections.map((sec, i) => (
                  <Animated.View key={sec.section_key} entering={FadeInDown.delay(i * 30).springify()}>
                    <SectionCard
                      section={sec}
                      isSaving={saving === sec.section_key}
                      onToggle={v => toggleVisibility(sec.section_key, v)}
                      onEdit={() => openEdit(sec)}
                    />
                  </Animated.View>
                ))}
              </View>
            </Animated.View>

            {/* ─ الأقسام الأخرى ─ */}
            <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginTop: 24 }}>
              <View style={s.groupHeader}>
                <Ionicons name="apps-outline" size={18} color="#6366F1" />
                <Text style={[s.groupTitle, { color: "#6366F1" }]}>الأقسام العامة</Text>
              </View>
              <View style={{ gap: 10 }}>
                {otherSections.map((sec, i) => (
                  <Animated.View key={sec.section_key} entering={FadeInDown.delay(i * 25).springify()}>
                    <SectionCard
                      section={sec}
                      isSaving={saving === sec.section_key}
                      onToggle={v => toggleVisibility(sec.section_key, v)}
                      onEdit={() => openEdit(sec)}
                    />
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/* Modal التعديل */}
      <Modal visible={editModal} animationType="slide" transparent onRequestClose={() => setEditModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: "#00000080" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditModal(false)} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>{editSection?.section_name}</Text>
              <Text style={s.modalSub}>تحديث حالة العقد والتصريح</Text>

              {/* وصف القسم */}
              <Text style={s.fieldLabel}>وصف القسم</Text>
              <TextInput
                style={[s.fieldInput, { height: 80, textAlignVertical: "top", paddingTop: 10 }]}
                value={editDesc} onChangeText={setEditDesc}
                placeholder="وصف مختصر عن هذا القسم وخدماته..."
                placeholderTextColor={Colors.textMuted} textAlign="right" multiline
              />

              {/* حالة العقد */}
              <Text style={s.fieldLabel}>حالة العقد / التصريح</Text>
              <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {CONTRACT_STATUSES.map(cs => {
                  const meta = CONTRACT_META[cs];
                  return (
                    <TouchableOpacity key={cs} onPress={() => setECS(cs)}
                      style={[s.statusChip, editContractStatus === cs && { borderColor: meta.color, backgroundColor: meta.color + "20" }]}>
                      <Ionicons name={meta.icon as any} size={14} color={editContractStatus === cs ? meta.color : Colors.textMuted} />
                      <Text style={[s.statusChipText, editContractStatus === cs && { color: meta.color }]}>{meta.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* تفاصيل العقد */}
              {editContractStatus !== "none" && (
                <>
                  <Text style={s.fieldLabel}>الجهة المُرخِّصة / طرف العقد</Text>
                  <TextInput style={s.fieldInput} value={editEntity} onChangeText={setEditEntity}
                    placeholder="مثال: ولاية الجزيرة — وزارة الصحة"
                    placeholderTextColor={Colors.textMuted} textAlign="right" />

                  <Text style={s.fieldLabel}>جهة الاتصال المفوَّضة</Text>
                  <TextInput style={s.fieldInput} value={editContact} onChangeText={setEditContact}
                    placeholder="الاسم ورقم الهاتف للمسؤول"
                    placeholderTextColor={Colors.textMuted} textAlign="right" />

                  <Text style={s.fieldLabel}>تاريخ توقيع العقد</Text>
                  <TextInput style={s.fieldInput} value={editSignedAt} onChangeText={setEditSignedAt}
                    placeholder="مثال: 2025-01-15"
                    placeholderTextColor={Colors.textMuted} textAlign="right" keyboardType="numbers-and-punctuation" />

                  <Text style={s.fieldLabel}>تاريخ انتهاء العقد</Text>
                  <TextInput style={s.fieldInput} value={editExpiryAt} onChangeText={setEditExpiryAt}
                    placeholder="مثال: 2026-01-15"
                    placeholderTextColor={Colors.textMuted} textAlign="right" keyboardType="numbers-and-punctuation" />
                </>
              )}

              <Text style={s.fieldLabel}>ملاحظات إضافية</Text>
              <TextInput
                style={[s.fieldInput, { height: 80, textAlignVertical: "top", paddingTop: 10 }]}
                value={editNotes} onChangeText={setEditNotes}
                placeholder="أي ملاحظات أو شروط خاصة..."
                placeholderTextColor={Colors.textMuted} textAlign="right" multiline
              />

              {/* أزرار */}
              <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 16, marginBottom: 8 }}>
                <TouchableOpacity onPress={() => setEditModal(false)} style={s.cancelBtn}>
                  <Text style={s.cancelBtnText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveEdit} disabled={modalSaving}
                  style={[s.saveBtn, modalSaving && { opacity: 0.6 }]}>
                  {modalSaving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.saveBtnText}>حفظ التغييرات</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── بطاقة القسم ──────────────────────────────────────────────────
function SectionCard({
  section, isSaving, onToggle, onEdit,
}: {
  section: Section;
  isSaving: boolean;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
}) {
  const meta = CONTRACT_META[section.contract_status];
  return (
    <View style={[card.box, !section.is_visible && { opacity: 0.7 }]}>
      <View style={card.row}>
        {/* أيقونة الحالة */}
        <View style={[card.iconBox, { backgroundColor: meta.color + "18" }]}>
          <Ionicons name={meta.icon as any} size={20} color={meta.color} />
        </View>
        {/* الاسم والمعلومات */}
        <View style={{ flex: 1 }}>
          <Text style={card.name}>{section.section_name}</Text>
          <View style={card.statusRow}>
            <View style={[card.statusDot, { backgroundColor: meta.color }]} />
            <Text style={[card.statusText, { color: meta.color }]}>{meta.label}</Text>
            {section.contract_expiry_at && (
              <Text style={card.expiryText}>
                {" "}· حتى {section.contract_expiry_at.slice(0, 10)}
              </Text>
            )}
          </View>
          {section.authorized_entity && (
            <Text style={card.entityText}>{section.authorized_entity}</Text>
          )}
        </View>
        {/* تبديل الإظهار / الإخفاء */}
        {isSaving
          ? <ActivityIndicator color="#6366F1" size="small" />
          : <Switch
              value={section.is_visible}
              onValueChange={onToggle}
              trackColor={{ false: Colors.borderSubtle, true: "#6366F1" }}
              thumbColor="#fff"
            />
        }
      </View>

      {/* زر التعديل */}
      <TouchableOpacity onPress={onEdit} style={card.editBtn}>
        <Ionicons name="create-outline" size={15} color="#A5B4FC" />
        <Text style={card.editBtnText}>تعديل بيانات العقد والتصريح</Text>
      </TouchableOpacity>

      {/* تحذير إذا كان القسم حكومياً وبدون عقد */}
      {section.requires_contract && section.contract_status === "none" && section.is_visible && (
        <View style={card.warnBanner}>
          <Ionicons name="warning-outline" size={14} color="#F59E0B" />
          <Text style={card.warnText}>هذا القسم يتطلب تصريحاً حكومياً لم يُوثَّق بعد</Text>
        </View>
      )}
    </View>
  );
}

// ─── الأنماط ───────────────────────────────────────────────────────
const card = StyleSheet.create({
  box: {
    backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1,
    borderColor: Colors.borderSubtle, overflow: "hidden",
  },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14 },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  expiryText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  entityText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  editBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    borderTopWidth: 1, borderTopColor: Colors.borderSubtle,
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: "#FFFFFF05",
  },
  editBtnText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#A5B4FC" },
  warnBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    backgroundColor: "#F59E0B18", paddingVertical: 8, paddingHorizontal: 14,
  },
  warnText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#F59E0B", flex: 1, textAlign: "right" },
});

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 16, gap: 8,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#FFFFFF10", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#A5B4FC", textAlign: "center", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, marginTop: 12 },
  groupHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 10 },
  groupTitle: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  // Modal
  modalSheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, maxHeight: "90%",
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderSubtle, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.text, textAlign: "right", marginBottom: 2 },
  modalSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 16 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text, textAlign: "right", marginBottom: 6, marginTop: 12 },
  fieldInput: {
    backgroundColor: Colors.cardBg, borderRadius: 12, padding: 13,
    color: Colors.text, fontSize: 14, fontFamily: "Cairo_400Regular",
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  statusChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.cardBg,
  },
  statusChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.borderSubtle,
    alignItems: "center", justifyContent: "center",
  },
  cancelBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textMuted },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: "#6366F1", alignItems: "center", justifyContent: "center" },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
});
