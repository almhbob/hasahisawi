import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, Share, Platform, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

const MED = "#10B981";
const LEAVE_TYPES = [
  { key: "student",  label: "طالب",    icon: "school-outline",   color: "#6366F1" },
  { key: "military", label: "عسكري",   icon: "shield-outline",   color: "#F59E0B" },
  { key: "employee", label: "موظف",    icon: "briefcase-outline", color: "#10B981" },
];

function typeLabel(t: string) { return LEAVE_TYPES.find(x => x.key === t)?.label || t; }
function typeColor(t: string) { return LEAVE_TYPES.find(x => x.key === t)?.color || MED; }
function typeIcon(t: string)  { return LEAVE_TYPES.find(x => x.key === t)?.icon  || "document-text-outline"; }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

function StatusBadge({ expired }: { expired: boolean }) {
  const color = expired ? "#EF4444" : "#10B981";
  const label = expired ? "منتهية" : "سارية";
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: color + "20" }}>
      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color }}>{label}</Text>
    </View>
  );
}

async function generateSickLeavePDF(sl: any) {
  const typeStr = typeLabel(sl.leave_type);
  const isExpired = new Date() > new Date(sl.end_date + "T23:59:59");
  const html = `
  <!DOCTYPE html>
  <html dir="rtl" lang="ar">
  <head><meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; background: #fff; padding: 32px; direction: rtl; }
    .header { text-align: center; border-bottom: 3px solid #10B981; padding-bottom: 20px; margin-bottom: 24px; }
    .title { font-size: 26px; font-weight: bold; color: #10B981; margin-bottom: 6px; }
    .subtitle { font-size: 14px; color: #6B7280; }
    .type-badge { display: inline-block; background: ${typeColor(sl.leave_type)}20; color: ${typeColor(sl.leave_type)}; padding: 4px 14px; border-radius: 20px; font-size: 14px; font-weight: bold; margin: 8px 0; }
    .field { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #F3F4F6; }
    .label { color: #6B7280; min-width: 140px; font-size: 13px; }
    .value { color: #111827; font-weight: bold; font-size: 14px; }
    .barcode { text-align: center; margin: 28px 0; padding: 20px; background: #F9FAFB; border-radius: 12px; border: 2px dashed #D1FAE5; }
    .bc-label { color: #6B7280; font-size: 12px; margin-bottom: 8px; }
    .bc-token { font-size: 18px; font-weight: bold; letter-spacing: 3px; color: #111827; font-family: monospace; }
    .status { text-align: center; font-size: 14px; padding: 10px; border-radius: 8px; margin-top: 12px; }
    .valid   { background: #D1FAE5; color: #065F46; }
    .invalid { background: #FEE2E2; color: #991B1B; }
    .footer { text-align: center; margin-top: 32px; font-size: 11px; color: #9CA3AF; }
  </style>
  </head>
  <body>
  <div class="header">
    <div class="title">إجازة مرضية رسمية</div>
    <div class="subtitle">حصاحيصاوي — المنصة الصحية المتكاملة</div>
    <div class="type-badge">${typeStr}</div>
  </div>
  <div class="field"><span class="label">اسم الطبيب:</span><span class="value">${sl.doctor_name || "—"}</span></div>
  <div class="field"><span class="label">المنشأة الطبية:</span><span class="value">${sl.facility_name || "—"}</span></div>
  ${sl.institution_name ? `<div class="field"><span class="label">جهة العمل / المؤسسة:</span><span class="value">${sl.institution_name}</span></div>` : ""}
  <div class="field"><span class="label">تاريخ البداية:</span><span class="value">${sl.start_date}</span></div>
  <div class="field"><span class="label">تاريخ الانتهاء:</span><span class="value">${sl.end_date}</span></div>
  <div class="field"><span class="label">عدد الأيام:</span><span class="value">${sl.leave_days} يوم</span></div>
  ${sl.diagnosis ? `<div class="field"><span class="label">التشخيص:</span><span class="value">${sl.diagnosis}</span></div>` : ""}
  <div class="barcode">
    <div class="bc-label">رمز التحقق (بدلاً من الباركود)</div>
    <div class="bc-token">${sl.barcode_token}</div>
    <div class="status ${isExpired ? "invalid" : "valid"}">${isExpired ? "⚠️ منتهية الصلاحية" : "✅ إجازة سارية"}</div>
  </div>
  <div class="footer">أُصدرت هذه الإجازة إلكترونياً عبر منصة حصاحيصاوي — رقم ${sl.id} — ${new Date().toLocaleDateString("ar-EG")}</div>
  </body></html>`;
  return html;
}

type SickLeave = {
  id: number; leave_type: string; leave_days: number;
  start_date: string; end_date: string; diagnosis: string;
  doctor_name: string; facility_name: string; institution_name: string;
  barcode_token: string; created_at: string;
};

export default function SickLeaveScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [leaves, setLeaves] = useState<SickLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"mine" | "doctor">("mine");
  const [isDoctor, setIsDoctor] = useState(false);

  // New form state (doctor)
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [leaveType, setLeaveType] = useState("employee");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [diagnosis, setDiagnosis] = useState("");
  const [institution, setInstitution] = useState("");

  const token = (user as any)?.token;

  const fetchLeaves = useCallback(async (tab = activeTab) => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const path = tab === "doctor" ? "/medical/sick-leaves/doctor" : "/medical/sick-leaves/mine";
      const r = await fetchWithTimeout(`${getApiUrl()}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.sick_leaves) setLeaves(d.sick_leaves);
      if (tab === "mine") setIsDoctor(false);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token, activeTab]);

  useEffect(() => { fetchLeaves(activeTab); }, [activeTab]);

  // Check if user is doctor
  useEffect(() => {
    if (!token) return;
    fetchWithTimeout(`${getApiUrl()}/medical/staff/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => {
      if (d.profile?.staff_type === "doctor") setIsDoctor(true);
    }).catch(() => {});
  }, [token]);

  async function submitLeave() {
    if (!patientId.trim()) return Alert.alert("خطأ", "أدخل رقم المريض");
    if (endDate < startDate) return Alert.alert("خطأ", "تاريخ الانتهاء قبل تاريخ البداية");
    setFormLoading(true);
    try {
      const r = await fetchWithTimeout(`${getApiUrl()}/medical/sick-leaves`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ patient_user_id: parseInt(patientId), leave_type: leaveType, start_date: startDate, end_date: endDate, diagnosis: diagnosis.trim(), institution_name: institution.trim() }),
      });
      const d = await r.json();
      if (d.sick_leave) {
        Alert.alert("✅ تم إصدار الإجازة", "تم إرسال إشعار للمريض");
        setShowForm(false);
        setPatientId(""); setDiagnosis(""); setInstitution("");
        fetchLeaves("doctor");
        setActiveTab("doctor");
      } else {
        Alert.alert("خطأ", d.error || "حدث خطأ");
      }
    } catch { Alert.alert("خطأ", "تعذر الاتصال بالسيرفر"); }
    setFormLoading(false);
  }

  async function downloadPDF(sl: SickLeave) {
    try {
      const html = await generateSickLeavePDF(sl);
      const { uri } = await Print.printToFileAsync({ html });
      if (Platform.OS === "ios") {
        await Sharing.shareAsync(uri);
      } else {
        await Share.share({ message: `إجازة مرضية - ${sl.barcode_token}`, url: uri });
      }
    } catch { Alert.alert("خطأ", "تعذر إنشاء ملف PDF"); }
  }

  const now = new Date();
  const tabs: Array<{ key: "mine" | "doctor"; label: string; icon: any }> = [
    { key: "mine", label: "إجازاتي", icon: "document-text-outline" },
    ...(isDoctor ? [{ key: "doctor" as const, label: "صادرة", icon: "medical-outline" }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0F1E" }}>
      <LinearGradient colors={["#0A0F1E", "#0D1B2A"]} style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16, gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#FFFFFF18", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" }}>الإجازات المرضية</Text>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: MED, marginTop: 1 }}>مدعومة برمز تحقق إلكتروني</Text>
          </View>
          {isDoctor && (
            <TouchableOpacity onPress={() => setShowForm(true)} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: MED + "30", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="add" size={24} color={MED} />
            </TouchableOpacity>
          )}
        </View>
        {/* Tabs */}
        {tabs.length > 1 && (
          <View style={{ flexDirection: "row-reverse", marginTop: 12, paddingHorizontal: 16, gap: 8 }}>
            {tabs.map(t => (
              <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)}
                style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: activeTab === t.key ? MED : "#FFFFFF10", borderWidth: 1, borderColor: activeTab === t.key ? MED : "#FFFFFF10" }}>
                <Ionicons name={t.icon} size={16} color={activeTab === t.key ? "#fff" : "#94A3B8"} />
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: activeTab === t.key ? "#fff" : "#94A3B8" }}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </LinearGradient>

      {/* New Leave Form Modal */}
      {showForm && (
        <View style={{ position: "absolute", inset: 0, zIndex: 100, backgroundColor: "#000000CC", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#0F1B2D", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "center", marginBottom: 16 }}>إصدار إجازة مرضية</Text>
            {/* Type selector */}
            <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14 }}>
              {LEAVE_TYPES.map(lt => (
                <TouchableOpacity key={lt.key} onPress={() => setLeaveType(lt.key)}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: leaveType === lt.key ? lt.color : "#FFFFFF10", alignItems: "center" }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: leaveType === lt.key ? "#fff" : "#94A3B8" }}>{lt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={patientId} onChangeText={setPatientId} placeholder="رقم المريض (ID)" placeholderTextColor="#4B5563" keyboardType="numeric"
              style={{ backgroundColor: "#FFFFFF0D", borderRadius: 12, borderWidth: 1, borderColor: "#FFFFFF18", padding: 12, color: "#fff", fontFamily: "Cairo_400Regular", textAlign: "right", marginBottom: 10 }} />
            <TextInput value={institution} onChangeText={setInstitution} placeholder="اسم المؤسسة / الجهة (اختياري)" placeholderTextColor="#4B5563"
              style={{ backgroundColor: "#FFFFFF0D", borderRadius: 12, borderWidth: 1, borderColor: "#FFFFFF18", padding: 12, color: "#fff", fontFamily: "Cairo_400Regular", textAlign: "right", marginBottom: 10 }} />
            <TextInput value={diagnosis} onChangeText={setDiagnosis} placeholder="التشخيص (اختياري)" placeholderTextColor="#4B5563" multiline
              style={{ backgroundColor: "#FFFFFF0D", borderRadius: 12, borderWidth: 1, borderColor: "#FFFFFF18", padding: 12, color: "#fff", fontFamily: "Cairo_400Regular", textAlign: "right", marginBottom: 10, minHeight: 60 }} />
            <View style={{ flexDirection: "row-reverse", gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#94A3B8", textAlign: "right", marginBottom: 4 }}>من</Text>
                <TextInput value={startDate} onChangeText={setStartDate} placeholder="2025-01-01" placeholderTextColor="#4B5563"
                  style={{ backgroundColor: "#FFFFFF0D", borderRadius: 12, borderWidth: 1, borderColor: "#FFFFFF18", padding: 12, color: "#fff", fontFamily: "Cairo_400Regular", textAlign: "center" }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#94A3B8", textAlign: "right", marginBottom: 4 }}>إلى</Text>
                <TextInput value={endDate} onChangeText={setEndDate} placeholder="2025-01-07" placeholderTextColor="#4B5563"
                  style={{ backgroundColor: "#FFFFFF0D", borderRadius: 12, borderWidth: 1, borderColor: "#FFFFFF18", padding: 12, color: "#fff", fontFamily: "Cairo_400Regular", textAlign: "center" }} />
              </View>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <TouchableOpacity onPress={() => setShowForm(false)} style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: "#FFFFFF10", alignItems: "center" }}>
                <Text style={{ fontFamily: "Cairo_700Bold", color: "#94A3B8" }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitLeave} disabled={formLoading}
                style={{ flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: MED, alignItems: "center" }}>
                {formLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 15 }}>إصدار الإجازة</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLeaves(); }} tintColor={MED} />}
      >
        {loading ? (
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <ActivityIndicator color={MED} size="large" />
          </View>
        ) : leaves.length === 0 ? (
          <Animated.View entering={FadeInDown.delay(100)} style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
            <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: MED + "20", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="document-text-outline" size={40} color={MED} />
            </View>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" }}>لا توجد إجازات مرضية</Text>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: "#6B7280", textAlign: "center" }}>
              {activeTab === "mine" ? "ستظهر هنا إجازاتك المرضية الصادرة من طبيبك" : "لم تُصدر أي إجازات بعد"}
            </Text>
          </Animated.View>
        ) : (
          leaves.map((sl, i) => {
            const isExpired = now > new Date(sl.end_date + "T23:59:59");
            const color = typeColor(sl.leave_type);
            return (
              <Animated.View key={sl.id} entering={FadeInDown.delay(i * 60)}>
                <LinearGradient colors={["#0F1E14", "#0B1910"]} style={{ borderRadius: 18, borderWidth: 1, borderColor: isExpired ? "#374151" : color + "40", marginBottom: 14, overflow: "hidden" }}>
                  {/* Header */}
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 12 }}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: color + "25", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={typeIcon(sl.leave_type) as any} size={24} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" }}>{typeLabel(sl.leave_type)}</Text>
                        <StatusBadge expired={isExpired} />
                      </View>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                        الطبيب: {sl.doctor_name || "—"} • {sl.facility_name || ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-start" }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 22, color: isExpired ? "#6B7280" : color }}>{sl.leave_days}</Text>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: "#6B7280" }}>يوم</Text>
                    </View>
                  </View>

                  {/* Dates */}
                  <View style={{ flexDirection: "row-reverse", paddingHorizontal: 14, paddingBottom: 12, gap: 16 }}>
                    <View style={{ flex: 1, backgroundColor: "#FFFFFF08", borderRadius: 10, padding: 8 }}>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#94A3B8", textAlign: "center" }}>من</Text>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff", textAlign: "center", marginTop: 2 }}>{sl.start_date}</Text>
                    </View>
                    <View style={{ width: 24, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="arrow-back" size={16} color="#4B5563" />
                    </View>
                    <View style={{ flex: 1, backgroundColor: "#FFFFFF08", borderRadius: 10, padding: 8 }}>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#94A3B8", textAlign: "center" }}>إلى</Text>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff", textAlign: "center", marginTop: 2 }}>{sl.end_date}</Text>
                    </View>
                  </View>

                  {sl.institution_name && (
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 10 }}>
                      <Ionicons name="business-outline" size={15} color="#94A3B8" />
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#94A3B8" }}>{sl.institution_name}</Text>
                    </View>
                  )}

                  {/* Barcode token */}
                  <View style={{ marginHorizontal: 14, marginBottom: 12, backgroundColor: "#FFFFFF06", borderRadius: 12, borderWidth: 1, borderColor: "#FFFFFF10", padding: 10, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#6B7280", marginBottom: 4 }}>رمز التحقق</Text>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: isExpired ? "#6B7280" : color, letterSpacing: 2 }}>{sl.barcode_token}</Text>
                  </View>

                  {/* Actions */}
                  <TouchableOpacity onPress={() => downloadPDF(sl)}
                    style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, margin: 14, marginTop: 4, paddingVertical: 12, borderRadius: 12, backgroundColor: isExpired ? "#374151" : color }}>
                    <Ionicons name="download-outline" size={18} color="#fff" />
                    <Text style={{ fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 14 }}>تحميل PDF</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
