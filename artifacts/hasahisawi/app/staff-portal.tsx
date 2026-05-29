import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl, Modal,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

const BACKEND_TOKEN_KEY = "auth_backend_token";

type StaffType = "doctor" | "lab" | "pharmacist" | "nurse";
type Staff = { id: number; staff_type: StaffType; full_name: string; specialty?: string; facility?: string; is_verified: boolean };
type Patient = { id: number; name: string; phone?: string };
type Order = { id: number; patient_name: string; patient_phone?: string; medications?: string; tests?: string; status: string; created_at: string; notes?: string };
type Prescription = { id: number; patient_name: string; medication_name: string; dosage?: string; frequency?: string; duration?: string; prescribed_date?: string };

async function api(path: string, options?: RequestInit) {
  const token = await AsyncStorage.getItem(BACKEND_TOKEN_KEY);
  return fetchWithTimeout(`${getApiUrl()}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  });
}

// ─── تسجيل كطاقم طبي ───────────────────────────────────────────────────────
function RegisterStaff({ onDone }: { onDone: () => void }) {
  const [type, setType] = useState<StaffType>("doctor");
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [license, setLicense] = useState("");
  const [facility, setFacility] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const TYPES: { key: StaffType; label: string; icon: any; color: string }[] = [
    { key: "doctor",     label: "طبيب",    icon: "medkit-outline",      color: "#3B82F6" },
    { key: "lab",        label: "معمل",    icon: "flask-outline",       color: "#8B5CF6" },
    { key: "pharmacist", label: "صيدلاني", icon: "medical-outline",     color: "#10B981" },
    { key: "nurse",      label: "تمريض",  icon: "heart-outline",       color: "#F59E0B" },
  ];

  const submit = async () => {
    if (!name.trim()) { Alert.alert("تنبيه", "الاسم مطلوب"); return; }
    setLoading(true);
    try {
      const res = await api("/api/medical/staff/register", {
        method: "POST",
        body: JSON.stringify({ staff_type: type, full_name: name.trim(), specialty, license_number: license, facility, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      Alert.alert("تم التسجيل", "تم تسجيلك كطاقم طبي بنجاح");
      onDone();
    } catch (e: any) {
      Alert.alert("خطأ", e.message || "فشل التسجيل");
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={reg.scroll} keyboardShouldPersistTaps="handled">
        <Text style={reg.title}>التسجيل كطاقم طبي</Text>
        <Text style={reg.sub}>أدخل بياناتك للوصول إلى بوابة الطاقم الطبي</Text>

        <Text style={reg.label}>نوع العمل</Text>
        <View style={reg.typeRow}>
          {TYPES.map(t => (
            <TouchableOpacity key={t.key} style={[reg.typeBtn, type === t.key && { borderColor: t.color, backgroundColor: t.color + "18" }]} onPress={() => setType(t.key)}>
              <Ionicons name={t.icon} size={20} color={type === t.key ? t.color : Colors.textMuted} />
              <Text style={[reg.typeTxt, type === t.key && { color: t.color }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {[
          { label: "الاسم الكامل *", val: name, set: setName, placeholder: "د. محمد أحمد" },
          { label: "التخصص", val: specialty, set: setSpecialty, placeholder: "طب عام / جراحة..." },
          { label: "رقم الترخيص", val: license, set: setLicense, placeholder: "رقم الترخيص المهني" },
          { label: "المنشأة الصحية", val: facility, set: setFacility, placeholder: "مستشفى / عيادة..." },
          { label: "رقم الهاتف", val: phone, set: setPhone, placeholder: "0912345678" },
        ].map(f => (
          <View key={f.label} style={reg.field}>
            <Text style={reg.label}>{f.label}</Text>
            <TextInput style={reg.input} value={f.val} onChangeText={f.set} placeholder={f.placeholder}
              placeholderTextColor={Colors.textMuted} textAlign="right" />
          </View>
        ))}

        <TouchableOpacity style={reg.btn} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={reg.btnTxt}>تسجيل</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── بوابة الطبيب ────────────────────────────────────────────────────────────
function DoctorPortal({ staff }: { staff: Staff }) {
  const [tab, setTab] = useState<"prescriptions" | "lab" | "admissions">("prescriptions");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query2, setQuery2] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // form state
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [tests, setTests] = useState("");

  const loadPrescriptions = useCallback(async () => {
    try {
      const res = await api("/api/medical/prescriptions/doctor");
      const data = await res.json();
      if (data.prescriptions) setPrescriptions(data.prescriptions);
    } catch {}
  }, []);

  useEffect(() => { loadPrescriptions(); }, [loadPrescriptions]);

  useEffect(() => {
    if (query2.length < 2) { setPatients([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api(`/api/medical/patients?q=${encodeURIComponent(query2)}`);
        const data = await res.json();
        setPatients(data.patients || []);
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [query2]);

  const writePrescription = async () => {
    if (!selectedPatient || !medication) { Alert.alert("تنبيه", "اختر مريضاً وأدخل اسم الدواء"); return; }
    setLoading(true);
    try {
      const res = await api("/api/medical/prescriptions", {
        method: "POST",
        body: JSON.stringify({ patient_id: selectedPatient.id, medication_name: medication, dosage, frequency, duration, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      Alert.alert("تم", "تمت كتابة الروشتة بنجاح");
      setShowForm(false); setMedication(""); setDosage(""); setFrequency(""); setDuration(""); setNotes("");
      setSelectedPatient(null); setQuery2(""); loadPrescriptions();
    } catch (e: any) { Alert.alert("خطأ", e.message); }
    finally { setLoading(false); }
  };

  const orderLab = async () => {
    if (!selectedPatient || !tests) { Alert.alert("تنبيه", "اختر مريضاً وأدخل التحاليل المطلوبة"); return; }
    setLoading(true);
    try {
      const res = await api("/api/medical/lab-orders", {
        method: "POST",
        body: JSON.stringify({ patient_id: selectedPatient.id, tests, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      Alert.alert("تم", "تم إرسال طلب التحليل للمعمل");
      setTests(""); setNotes(""); setSelectedPatient(null); setQuery2("");
    } catch (e: any) { Alert.alert("خطأ", e.message); }
    finally { setLoading(false); }
  };

  const TABS = [
    { key: "prescriptions" as const, label: "الروشتات", icon: "document-text-outline" },
    { key: "lab" as const, label: "تحاليل", icon: "flask-outline" },
    { key: "admissions" as const, label: "تنويم", icon: "bed-outline" },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={dr.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[dr.tabBtn, tab === t.key && dr.tabActive]} onPress={() => setTab(t.key)}>
            <Ionicons name={t.icon as any} size={16} color={tab === t.key ? Colors.primary : Colors.textMuted} />
            <Text style={[dr.tabTxt, tab === t.key && { color: Colors.primary }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPrescriptions().finally(() => setRefreshing(false)); }} />}>

        {/* بحث المريض */}
        {(tab === "prescriptions" || tab === "lab") && (
          <View style={dr.card}>
            <Text style={dr.cardTitle}>🔍 ابحث عن مريض</Text>
            <TextInput style={dr.input} value={query2} onChangeText={setQuery2}
              placeholder="اسم المريض أو رقم الهاتف..." placeholderTextColor={Colors.textMuted} textAlign="right" />
            {patients.map(p => (
              <TouchableOpacity key={p.id} style={[dr.patientRow, selectedPatient?.id === p.id && dr.patientRowSel]}
                onPress={() => { setSelectedPatient(p); setPatients([]); setQuery2(p.name); }}>
                <Ionicons name="person-outline" size={16} color={Colors.primary} />
                <Text style={dr.patientName}>{p.name}</Text>
                {p.phone && <Text style={dr.patientPhone}>{p.phone}</Text>}
              </TouchableOpacity>
            ))}
            {selectedPatient && (
              <View style={dr.selectedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                <Text style={dr.selectedTxt}>المريض: {selectedPatient.name}</Text>
                <TouchableOpacity onPress={() => { setSelectedPatient(null); setQuery2(""); }}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {tab === "prescriptions" && (
          <>
            <View style={dr.card}>
              <Text style={dr.cardTitle}>💊 كتابة روشتة</Text>
              {[
                { label: "اسم الدواء *", val: medication, set: setMedication, placeholder: "Paracetamol 500mg" },
                { label: "الجرعة", val: dosage, set: setDosage, placeholder: "قرص واحد" },
                { label: "التكرار", val: frequency, set: setFrequency, placeholder: "3 مرات يومياً" },
                { label: "المدة", val: duration, set: setDuration, placeholder: "7 أيام" },
                { label: "ملاحظات", val: notes, set: setNotes, placeholder: "..." },
              ].map(f => (
                <View key={f.label} style={{ marginTop: 8 }}>
                  <Text style={dr.fieldLabel}>{f.label}</Text>
                  <TextInput style={dr.input} value={f.val} onChangeText={f.set}
                    placeholder={f.placeholder} placeholderTextColor={Colors.textMuted} textAlign="right" />
                </View>
              ))}
              <TouchableOpacity style={dr.submitBtn} onPress={writePrescription} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={dr.submitTxt}>إصدار الروشتة</Text>}
              </TouchableOpacity>
            </View>

            <Text style={dr.sectionTitle}>آخر الروشتات</Text>
            {prescriptions.length === 0 && <Text style={dr.empty}>لا توجد روشتات بعد</Text>}
            {prescriptions.map(p => (
              <View key={p.id} style={dr.listCard}>
                <Text style={dr.listTitle}>{p.medication_name}</Text>
                <Text style={dr.listSub}>{p.patient_name} · {p.prescribed_date}</Text>
                {p.dosage && <Text style={dr.listDetail}>{p.dosage} — {p.frequency}</Text>}
              </View>
            ))}
          </>
        )}

        {tab === "lab" && (
          <View style={dr.card}>
            <Text style={dr.cardTitle}>🔬 طلب تحاليل</Text>
            <Text style={dr.fieldLabel}>التحاليل المطلوبة *</Text>
            <TextInput style={[dr.input, { minHeight: 80, textAlignVertical: "top" }]}
              value={tests} onChangeText={setTests} multiline
              placeholder="صورة الدم الكاملة&#10;وظائف الكبد&#10;وظائف الكلى..."
              placeholderTextColor={Colors.textMuted} textAlign="right" />
            <Text style={dr.fieldLabel}>ملاحظات</Text>
            <TextInput style={dr.input} value={notes} onChangeText={setNotes}
              placeholder="أي تعليمات للمعمل..." placeholderTextColor={Colors.textMuted} textAlign="right" />
            <TouchableOpacity style={dr.submitBtn} onPress={orderLab} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={dr.submitTxt}>إرسال الطلب للمعمل</Text>}
            </TouchableOpacity>
          </View>
        )}

        {tab === "admissions" && (
          <View style={dr.card}>
            <Ionicons name="bed-outline" size={40} color={Colors.textMuted} style={{ alignSelf: "center", marginBottom: 8 }} />
            <Text style={dr.empty}>قيد التطوير — إدارة التنويم</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── بوابة المعمل ────────────────────────────────────────────────────────────
function LabPortal({ staff }: { staff: Staff }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testName, setTestName] = useState("");
  const [result, setResult] = useState("");
  const [unit, setUnit] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState("normal");
  const [notes, setNotes] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const res = await api("/api/medical/lab-orders");
      const data = await res.json();
      if (data.orders) setOrders(data.orders);
    } catch {}
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const uploadResult = async () => {
    if (!selected || !testName || !result) { Alert.alert("تنبيه", "أدخل اسم التحليل والنتيجة"); return; }
    setLoading(true);
    try {
      const res = await api("/api/medical/lab-results", {
        method: "POST",
        body: JSON.stringify({
          order_id: selected.id, patient_id: selected.id,
          test_name: testName, result, unit, reference_range: reference, status, notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      Alert.alert("تم", "تم رفع نتيجة التحليل وإشعار المريض");
      setSelected(null); setTestName(""); setResult(""); setUnit(""); setReference(""); setNotes("");
      loadOrders();
    } catch (e: any) { Alert.alert("خطأ", e.message); }
    finally { setLoading(false); }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders().finally(() => setRefreshing(false)); }} />}>
      <Text style={dr.sectionTitle}>طلبات التحاليل المعلقة ({orders.length})</Text>
      {orders.length === 0 && <Text style={dr.empty}>لا توجد طلبات معلقة ✓</Text>}
      {orders.map(o => (
        <TouchableOpacity key={o.id} style={[dr.listCard, selected?.id === o.id && { borderColor: "#8B5CF6", borderWidth: 1.5 }]}
          onPress={() => { setSelected(o === selected ? null : o); setTestName(o.tests?.split("\n")[0] || ""); }}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={dr.listTitle}>{o.patient_name}</Text>
            <View style={[dr.badge, { backgroundColor: "#8B5CF620" }]}>
              <Text style={{ color: "#8B5CF6", fontSize: 11, fontFamily: "Cairo-SemiBold" }}>معلق</Text>
            </View>
          </View>
          <Text style={dr.listSub}>{o.tests}</Text>
          {o.notes && <Text style={dr.listDetail}>{o.notes}</Text>}
        </TouchableOpacity>
      ))}

      {selected && (
        <View style={dr.card}>
          <Text style={dr.cardTitle}>📤 رفع نتيجة — {selected.patient_name}</Text>
          {[
            { label: "اسم التحليل *", val: testName, set: setTestName, ph: "صورة الدم الكاملة" },
            { label: "النتيجة *", val: result, set: setResult, ph: "12.5" },
            { label: "الوحدة", val: unit, set: setUnit, ph: "g/dL" },
            { label: "المعدل الطبيعي", val: reference, set: setReference, ph: "11-15" },
            { label: "ملاحظات", val: notes, set: setNotes, ph: "..." },
          ].map(f => (
            <View key={f.label} style={{ marginTop: 8 }}>
              <Text style={dr.fieldLabel}>{f.label}</Text>
              <TextInput style={dr.input} value={f.val} onChangeText={f.set}
                placeholder={f.ph} placeholderTextColor={Colors.textMuted} textAlign="right" />
            </View>
          ))}
          <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
            {["normal", "high", "low", "critical"].map(s => (
              <TouchableOpacity key={s} onPress={() => setStatus(s)}
                style={[dr.statusBtn, status === s && { backgroundColor: statusColor(s) + "30", borderColor: statusColor(s) }]}>
                <Text style={[{ fontSize: 12, fontFamily: "Cairo-Regular" }, status === s && { color: statusColor(s) }]}>{statusLabel(s)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[dr.submitBtn, { backgroundColor: "#8B5CF6" }]} onPress={uploadResult} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={dr.submitTxt}>رفع النتيجة</Text>}
          </TouchableOpacity>
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── بوابة الصيدلاني ─────────────────────────────────────────────────────────
function PharmacistPortal({ staff }: { staff: Staff }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const loadOrders = useCallback(async () => {
    try {
      const q = filter === "all" ? "" : `?status=${filter}`;
      const res = await api(`/api/medical/pharmacy-orders${q}`);
      const data = await res.json();
      if (data.orders) setOrders(data.orders);
    } catch {}
  }, [filter]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const dispenseOrder = async (id: number) => {
    try {
      const res = await api(`/api/medical/pharmacy-orders/${id}/dispense`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error();
      loadOrders();
    } catch { Alert.alert("خطأ", "فشل تحديث الحالة"); }
  };

  const STATUS_MAP: Record<string, { label: string; color: string; canDispense?: boolean }> = {
    pending:   { label: "معلق",    color: "#F59E0B", canDispense: true },
    delivered: { label: "سُلِّم", color: "#6B7280" },
    cancelled: { label: "ملغي",   color: "#EF4444" },
  };

  const FILTERS = [
    { key: "pending" as const,   label: "معلق" },
    { key: "all" as const,       label: "الكل" },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={dr.tabRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[dr.tabBtn, filter === f.key && dr.tabActive]} onPress={() => setFilter(f.key)}>
            <Text style={[dr.tabTxt, filter === f.key && { color: "#10B981" }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders().finally(() => setRefreshing(false)); }} />}>
        {orders.length === 0 && <Text style={dr.empty}>لا توجد طلبات</Text>}
        {orders.map(o => {
          const sm = STATUS_MAP[o.status] || STATUS_MAP.pending;
          return (
            <View key={o.id} style={dr.listCard}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text style={dr.listTitle}>{o.patient_name}</Text>
                <View style={[dr.badge, { backgroundColor: sm.color + "20" }]}>
                  <Text style={{ color: sm.color, fontSize: 11, fontFamily: "Cairo-SemiBold" }}>{sm.label}</Text>
                </View>
              </View>
              <Text style={dr.listSub}>{o.medications}</Text>
              {o.notes && <Text style={dr.listDetail}>{o.notes}</Text>}
              {o.patient_phone && (
                <Text style={[dr.listDetail, { color: Colors.primary }]}>📞 {o.patient_phone}</Text>
              )}
              {sm.canDispense && (
                <TouchableOpacity style={[dr.submitBtn, { backgroundColor: sm.color, marginTop: 8 }]}
                  onPress={() => dispenseOrder(o.id)}>
                  <Text style={dr.submitTxt}>صرف الدواء</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── الشاشة الرئيسية ──────────────────────────────────────────────────────────
export default function StaffPortalScreen() {
  const insets = useSafeAreaInsets();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/medical/staff/profile");
      const data = await res.json();
      if (data.staff) setStaff(data.staff);
      else setRegistering(true);
    } catch { setRegistering(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const TYPE_CONFIG: Record<StaffType, { label: string; color: string; icon: any }> = {
    doctor:     { label: "بوابة الطبيب",    color: "#3B82F6", icon: "medkit-outline" },
    lab:        { label: "بوابة المعمل",    color: "#8B5CF6", icon: "flask-outline" },
    pharmacist: { label: "بوابة الصيدلاني", color: "#10B981", icon: "medical-outline" },
    nurse:      { label: "بوابة التمريض",   color: "#F59E0B", icon: "heart-outline" },
  };

  const cfg = staff ? TYPE_CONFIG[staff.staff_type] : null;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#020C1B", "#061525"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{cfg ? cfg.label : "بوابة الطاقم الطبي"}</Text>
        {staff && (
          <TouchableOpacity style={s.reRegBtn} onPress={() => { setStaff(null); setRegistering(true); }}>
            <Ionicons name="create-outline" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        {!staff && <View style={{ width: 36 }} />}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : registering ? (
        <RegisterStaff onDone={() => { setRegistering(false); loadProfile(); }} />
      ) : staff ? (
        <>
          {/* Staff badge */}
          <View style={[s.badge, { borderColor: cfg!.color + "40", backgroundColor: cfg!.color + "10" }]}>
            <Ionicons name={cfg!.icon} size={18} color={cfg!.color} />
            <Text style={[s.badgeName, { color: cfg!.color }]}>{staff.full_name}</Text>
            {staff.specialty && <Text style={s.badgeSpec}>{staff.specialty}</Text>}
            {!staff.is_verified && (
              <View style={s.unverifiedBadge}>
                <Text style={s.unverifiedTxt}>قيد المراجعة</Text>
              </View>
            )}
          </View>

          {staff.staff_type === "doctor"     && <DoctorPortal staff={staff} />}
          {staff.staff_type === "lab"        && <LabPortal staff={staff} />}
          {staff.staff_type === "pharmacist" && <PharmacistPortal staff={staff} />}
          {staff.staff_type === "nurse"      && (
            <View style={s.center}>
              <Ionicons name="heart-outline" size={60} color={Colors.textMuted} />
              <Text style={s.emptyTxt}>بوابة التمريض قيد التطوير</Text>
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function statusColor(s: string) {
  return s === "high" ? "#EF4444" : s === "low" ? "#F59E0B" : s === "critical" ? "#DC2626" : "#10B981";
}
function statusLabel(s: string) {
  return s === "high" ? "مرتفع" : s === "low" ? "منخفض" : s === "critical" ? "حرج" : "طبيعي";
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1 },
  header: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(37,99,235,0.15)",
  },
  headerTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: "Cairo-SemiBold" },
  backBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(37,99,235,0.12)", justifyContent: "center", alignItems: "center" },
  reRegBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  center:   { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyTxt: { color: Colors.textMuted, fontSize: 15, fontFamily: "Cairo-Regular" },
  badge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  badgeName:      { color: Colors.textPrimary, fontSize: 14, fontFamily: "Cairo-SemiBold", flex: 1, textAlign: "right" },
  badgeSpec:      { color: Colors.textMuted, fontSize: 12, fontFamily: "Cairo-Regular" },
  unverifiedBadge:{ backgroundColor: "#F59E0B20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  unverifiedTxt:  { color: "#F59E0B", fontSize: 10, fontFamily: "Cairo-SemiBold" },
});

const dr = StyleSheet.create({
  tabRow: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: "rgba(37,99,235,0.12)" },
  tabBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabTxt: { color: Colors.textMuted, fontSize: 12, fontFamily: "Cairo-SemiBold" },
  card: { backgroundColor: "rgba(10,31,54,0.80)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(37,99,235,0.15)" },
  cardTitle: { color: Colors.textPrimary, fontSize: 15, fontFamily: "Cairo-Bold", textAlign: "right", marginBottom: 10 },
  input: {
    backgroundColor: "rgba(37,99,235,0.08)", borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(37,99,235,0.20)", paddingHorizontal: 12, paddingVertical: 10,
    color: Colors.textPrimary, fontSize: 14, fontFamily: "Cairo-Regular",
  },
  fieldLabel: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Cairo-SemiBold", textAlign: "right", marginBottom: 4 },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  submitTxt: { color: "#fff", fontSize: 14, fontFamily: "Cairo-SemiBold" },
  sectionTitle: { color: Colors.textPrimary, fontSize: 15, fontFamily: "Cairo-Bold", textAlign: "right" },
  empty: { color: Colors.textMuted, fontSize: 14, fontFamily: "Cairo-Regular", textAlign: "center", paddingVertical: 20 },
  listCard: { backgroundColor: "rgba(10,31,54,0.80)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(37,99,235,0.12)" },
  listTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: "Cairo-SemiBold", textAlign: "right" },
  listSub:   { color: Colors.textSecondary, fontSize: 12, fontFamily: "Cairo-Regular", textAlign: "right", marginTop: 2 },
  listDetail:{ color: Colors.textMuted, fontSize: 11, fontFamily: "Cairo-Regular", textAlign: "right", marginTop: 2 },
  patientRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 8, borderRadius: 8, marginTop: 4, backgroundColor: "rgba(37,99,235,0.05)" },
  patientRowSel: { backgroundColor: "rgba(37,99,235,0.15)", borderWidth: 1, borderColor: Colors.primary },
  patientName: { color: Colors.textPrimary, fontSize: 13, fontFamily: "Cairo-SemiBold", flex: 1, textAlign: "right" },
  patientPhone:{ color: Colors.textMuted, fontSize: 12, fontFamily: "Cairo-Regular" },
  selectedBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "#22C55E15", borderRadius: 8, padding: 8, marginTop: 6 },
  selectedTxt: { color: "#22C55E", fontSize: 12, fontFamily: "Cairo-SemiBold", flex: 1, textAlign: "right" },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusBtn: { borderRadius: 8, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 10, paddingVertical: 5 },
});

const reg = StyleSheet.create({
  scroll: { padding: 20, gap: 4 },
  title:  { color: Colors.textPrimary, fontSize: 22, fontFamily: "Cairo-Bold", textAlign: "center", marginBottom: 4 },
  sub:    { color: Colors.textSecondary, fontSize: 13, fontFamily: "Cairo-Regular", textAlign: "center", marginBottom: 16 },
  typeRow:{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  typeBtn:{ flexDirection: "row-reverse", alignItems: "center", gap: 6, borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  typeTxt:{ color: Colors.textMuted, fontSize: 13, fontFamily: "Cairo-SemiBold" },
  label:  { color: Colors.textSecondary, fontSize: 12, fontFamily: "Cairo-SemiBold", textAlign: "right", marginBottom: 4 },
  field:  { marginTop: 8 },
  input: {
    backgroundColor: "rgba(37,99,235,0.08)", borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(37,99,235,0.20)", paddingHorizontal: 12, paddingVertical: 10,
    color: Colors.textPrimary, fontSize: 14, fontFamily: "Cairo-Regular",
  },
  btn:    { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  btnTxt: { color: "#fff", fontSize: 16, fontFamily: "Cairo-Bold" },
});
