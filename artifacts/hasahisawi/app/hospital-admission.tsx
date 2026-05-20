import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

const BLUE = "#3B82F6";
const GREEN = "#10B981";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    active:    ["نشط",   "#10B981"],
    discharged:["صُرف",  "#6B7280"],
    pending:   ["بانتظار الموافقة", "#F59E0B"],
    approved:  ["معتمد", "#10B981"],
    rejected:  ["مرفوض", "#EF4444"],
  };
  const [label, color] = map[status] || [status, "#9CA3AF"];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: color + "20" }}>
      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color }}>{label}</Text>
    </View>
  );
}

type Companion = {
  id: number; companion_name: string; companion_phone?: string;
  relation?: string; status: string; exit_pass_active: boolean;
  companion_user_id?: number;
};

type Admission = {
  id: number; facility_name: string; ward?: string; room_number?: string;
  bed_number?: string; admission_date: string; expected_discharge?: string;
  diagnosis?: string; status: string; doctor_name?: string;
  medications_needed?: any; visit_schedule?: any;
  companions?: Companion[];
};

export default function HospitalAdmissionScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Admission | null>(null);
  const [companionRequests, setCompanionRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"admissions" | "companion">("admissions");

  // Add companion form
  const [showAddCompanion, setShowAddCompanion] = useState<number | null>(null);
  const [compName, setCompName] = useState("");
  const [compPhone, setCompPhone] = useState("");
  const [compRelation, setCompRelation] = useState("");
  const [compLoading, setCompLoading] = useState(false);

  const token = (user as any)?.token;

  const fetchData = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const [admR, cmpR] = await Promise.all([
        fetchWithTimeout(`${getApiUrl()}/medical/admissions/mine`, { headers: { Authorization: `Bearer ${token}` } }),
        fetchWithTimeout(`${getApiUrl()}/medical/my-companion-requests`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const admD = await admR.json();
      const cmpD = await cmpR.json();
      if (admD.admissions) setAdmissions(admD.admissions);
      if (cmpD.companion_requests) setCompanionRequests(cmpD.companion_requests);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { fetchData(); }, []);

  async function approveCompanion(admId: number, cmpId: number, status: "approved" | "rejected") {
    try {
      const r = await fetchWithTimeout(`${getApiUrl()}/medical/admissions/${admId}/companions/${cmpId}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (d.companion) {
        Alert.alert(status === "approved" ? "✅ تم الاعتماد" : "تم الرفض", "");
        fetchData();
      }
    } catch { Alert.alert("خطأ", "تعذر تحديث الحالة"); }
  }

  async function toggleExitPass(admId: number, cmpId: number, active: boolean) {
    try {
      await fetchWithTimeout(`${getApiUrl()}/medical/admissions/${admId}/companions/${cmpId}/exit-pass`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      fetchData();
    } catch { Alert.alert("خطأ", "تعذر تحديث بطاقة الخروج"); }
  }

  async function addCompanion(admId: number) {
    if (!compName.trim()) return Alert.alert("خطأ", "اسم المرافق مطلوب");
    setCompLoading(true);
    try {
      const r = await fetchWithTimeout(`${getApiUrl()}/medical/admissions/${admId}/companions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ companion_name: compName.trim(), companion_phone: compPhone.trim(), relation: compRelation.trim() }),
      });
      const d = await r.json();
      if (d.companion) {
        Alert.alert("✅ تم إرسال طلب المرافقة", "سيتم مراجعة الطلب والاعتماد");
        setShowAddCompanion(null); setCompName(""); setCompPhone(""); setCompRelation("");
        fetchData();
      } else { Alert.alert("خطأ", d.error || "حدث خطأ"); }
    } catch { Alert.alert("خطأ", "تعذر الاتصال"); }
    setCompLoading(false);
  }

  function safeJSON(v: any): any[] {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
    return [];
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#060D1F" }}>
      <LinearGradient colors={["#060D1F", "#0A1427"]} style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16, gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#FFFFFF18", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" }}>التنويم والمرافق</Text>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: BLUE, marginTop: 1 }}>متابعة حالة التنويم والمرافقين</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        {/* Tab bar */}
        <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 12, paddingHorizontal: 16 }}>
          {[
            { key: "admissions", label: "تنويماتي", icon: "bed-outline", count: admissions.length },
            { key: "companion",  label: "مرافقة", icon: "people-outline", count: companionRequests.length },
          ].map(t => (
            <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key as any)}
              style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12,
                backgroundColor: activeTab === t.key ? BLUE : "#FFFFFF0A", borderWidth: 1, borderColor: activeTab === t.key ? BLUE : "#FFFFFF10" }}>
              <Ionicons name={t.icon as any} size={16} color={activeTab === t.key ? "#fff" : "#64748B"} />
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: activeTab === t.key ? "#fff" : "#64748B" }}>{t.label}</Text>
              {t.count > 0 && (
                <View style={{ backgroundColor: activeTab === t.key ? "#FFFFFF40" : BLUE, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" }}>{t.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* Add companion modal */}
      {showAddCompanion !== null && (
        <View style={{ position: "absolute", inset: 0, zIndex: 100, backgroundColor: "#000000CC", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#0F1B2D", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "center", marginBottom: 16 }}>إضافة مرافق</Text>
            {[
              { val: compName, set: setCompName, ph: "اسم المرافق *", kb: "default" as any },
              { val: compPhone, set: setCompPhone, ph: "رقم الهاتف (اختياري)", kb: "phone-pad" as any },
              { val: compRelation, set: setCompRelation, ph: "صلة القرابة (اختياري)", kb: "default" as any },
            ].map((f, i) => (
              <TextInput key={i} value={f.val} onChangeText={f.set} placeholder={f.ph} placeholderTextColor="#4B5563" keyboardType={f.kb}
                style={{ backgroundColor: "#FFFFFF0D", borderRadius: 12, borderWidth: 1, borderColor: "#FFFFFF18", padding: 12, color: "#fff", fontFamily: "Cairo_400Regular", textAlign: "right", marginBottom: 10 }} />
            ))}
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <TouchableOpacity onPress={() => { setShowAddCompanion(null); setCompName(""); setCompPhone(""); setCompRelation(""); }}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: "#FFFFFF10", alignItems: "center" }}>
                <Text style={{ fontFamily: "Cairo_700Bold", color: "#94A3B8" }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => addCompanion(showAddCompanion!)} disabled={compLoading}
                style={{ flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: BLUE, alignItems: "center" }}>
                {compLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 15 }}>إرسال الطلب</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={BLUE} />}
      >
        {loading ? (
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <ActivityIndicator color={BLUE} size="large" />
          </View>
        ) : activeTab === "admissions" ? (
          <>
            {admissions.length === 0 ? (
              <Animated.View entering={FadeInDown.delay(100)} style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
                <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: BLUE + "20", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="bed-outline" size={40} color={BLUE} />
                </View>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" }}>لا توجد تنويمات مسجلة</Text>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: "#6B7280", textAlign: "center" }}>عند تحويلك للتنويم من قبل الطبيب، ستظهر تفاصيلها هنا</Text>
              </Animated.View>
            ) : (
              admissions.map((adm, i) => {
                const isActive = adm.status === "active";
                const meds = safeJSON(adm.medications_needed);
                const visits = safeJSON(adm.visit_schedule);
                const companions: Companion[] = safeJSON(adm.companions) || [];
                const expanded = selected?.id === adm.id;
                return (
                  <Animated.View key={adm.id} entering={FadeInDown.delay(i * 60)}>
                    <LinearGradient colors={["#0A1627", "#060F1E"]} style={{ borderRadius: 18, borderWidth: 1, borderColor: isActive ? BLUE + "50" : "#1E293B", marginBottom: 14, overflow: "hidden" }}>
                      <TouchableOpacity onPress={() => setSelected(expanded ? null : adm)} style={{ padding: 14 }}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
                          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: isActive ? BLUE + "25" : "#1E293B", alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name="bed-outline" size={24} color={isActive ? BLUE : "#64748B"} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" }}>{adm.facility_name || "مستشفى"}</Text>
                              <StatusBadge status={adm.status} />
                            </View>
                            {adm.ward && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#64748B", marginTop: 2 }}>العنبر: {adm.ward}{adm.room_number ? ` — غرفة ${adm.room_number}` : ""}{adm.bed_number ? ` — سرير ${adm.bed_number}` : ""}</Text>}
                            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#64748B", marginTop: 2 }}>الطبيب: {adm.doctor_name || "—"}</Text>
                          </View>
                          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#64748B" />
                        </View>
                        {adm.diagnosis && (
                          <View style={{ marginTop: 10, backgroundColor: "#FFFFFF08", borderRadius: 10, padding: 10 }}>
                            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#94A3B8", textAlign: "right" }}>{adm.diagnosis}</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      {expanded && (
                        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                          {/* Admission/discharge dates */}
                          <View style={{ flexDirection: "row-reverse", gap: 10, marginBottom: 12 }}>
                            <View style={{ flex: 1, backgroundColor: "#FFFFFF08", borderRadius: 10, padding: 10 }}>
                              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#94A3B8", textAlign: "center" }}>تاريخ الدخول</Text>
                              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff", textAlign: "center", marginTop: 2 }}>{new Date(adm.admission_date).toLocaleDateString("ar-EG")}</Text>
                            </View>
                            {adm.expected_discharge && (
                              <View style={{ flex: 1, backgroundColor: "#FFFFFF08", borderRadius: 10, padding: 10 }}>
                                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#94A3B8", textAlign: "center" }}>صرف متوقع</Text>
                                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff", textAlign: "center", marginTop: 2 }}>{adm.expected_discharge}</Text>
                              </View>
                            )}
                          </View>

                          {/* Medications needed */}
                          {meds.length > 0 && (
                            <View style={{ marginBottom: 12 }}>
                              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff", textAlign: "right", marginBottom: 8 }}>المستلزمات المطلوبة</Text>
                              {meds.map((m: any, mi: number) => (
                                <View key={mi} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                  <Ionicons name="checkmark-circle-outline" size={16} color={GREEN} />
                                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: "#D1FAE5" }}>{typeof m === "string" ? m : m.name || JSON.stringify(m)}</Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {/* Visit schedule */}
                          {visits.length > 0 && (
                            <View style={{ marginBottom: 12 }}>
                              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff", textAlign: "right", marginBottom: 8 }}>جدول الزيارات</Text>
                              {visits.map((v: any, vi: number) => (
                                <View key={vi} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                  <Ionicons name="calendar-outline" size={16} color={BLUE} />
                                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: "#BFDBFE" }}>{typeof v === "string" ? v : v.day || JSON.stringify(v)}{v.time ? ` — ${v.time}` : ""}</Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {/* Companions */}
                          <View style={{ marginBottom: 8 }}>
                            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>المرافقون</Text>
                              {isActive && (
                                <TouchableOpacity onPress={() => setShowAddCompanion(adm.id)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: BLUE + "20", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 }}>
                                  <Ionicons name="person-add-outline" size={14} color={BLUE} />
                                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: BLUE }}>إضافة مرافق</Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            {companions.length === 0 ? (
                              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#6B7280", textAlign: "center", paddingVertical: 12 }}>لا يوجد مرافقون معتمدون</Text>
                            ) : (
                              companions.map((c: Companion) => (
                                <View key={c.id} style={{ backgroundColor: "#FFFFFF08", borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.status === "approved" ? GREEN + "30" : c.status === "pending" ? "#F59E0B30" : "#EF444430" }}>
                                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FFFFFF10", alignItems: "center", justifyContent: "center" }}>
                                      <Ionicons name="person-outline" size={18} color="#94A3B8" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>{c.companion_name}</Text>
                                      {c.relation && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#64748B" }}>{c.relation}</Text>}
                                    </View>
                                    <StatusBadge status={c.status} />
                                  </View>
                                  {c.status === "pending" && isActive && (
                                    <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
                                      <TouchableOpacity onPress={() => approveCompanion(adm.id, c.id, "rejected")}
                                        style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: "#EF444420", alignItems: "center" }}>
                                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#EF4444" }}>رفض</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity onPress={() => approveCompanion(adm.id, c.id, "approved")}
                                        style={{ flex: 2, paddingVertical: 8, borderRadius: 10, backgroundColor: GREEN, alignItems: "center" }}>
                                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff" }}>اعتماد المرافق</Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                  {c.status === "approved" && isActive && (
                                    <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#94A3B8" }}>بطاقة الخروج والعودة</Text>
                                      <TouchableOpacity onPress={() => toggleExitPass(adm.id, c.id, !c.exit_pass_active)}
                                        style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: c.exit_pass_active ? GREEN : "#374151", borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 }}>
                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff" }} />
                                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff" }}>{c.exit_pass_active ? "مفعّلة" : "غير مفعّلة"}</Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </View>
                              ))
                            )}
                          </View>
                        </View>
                      )}
                    </LinearGradient>
                  </Animated.View>
                );
              })
            )}
          </>
        ) : (
          /* Companion requests tab */
          <>
            {companionRequests.length === 0 ? (
              <Animated.View entering={FadeInDown.delay(100)} style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
                <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: BLUE + "20", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="people-outline" size={40} color={BLUE} />
                </View>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" }}>لا توجد طلبات مرافقة</Text>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: "#6B7280", textAlign: "center" }}>ستظهر هنا الطلبات التي قدّمتها لمرافقة شخص آخر</Text>
              </Animated.View>
            ) : (
              companionRequests.map((req, i) => (
                <Animated.View key={req.id} entering={FadeInDown.delay(i * 60)}>
                  <View style={{ backgroundColor: "#0A1627", borderRadius: 18, borderWidth: 1, borderColor: "#1E293B", marginBottom: 12, padding: 14 }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 10 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: BLUE + "20", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="person-outline" size={22} color={BLUE} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" }}>{req.patient_name || "مريض"}</Text>
                        <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#64748B", marginTop: 2 }}>{req.facility_name || "مستشفى"}{req.ward ? ` — ${req.ward}` : ""}</Text>
                      </View>
                      <StatusBadge status={req.status} />
                    </View>
                    {req.status === "approved" && (
                      <>
                        {req.diagnosis && (
                          <View style={{ backgroundColor: "#FFFFFF08", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#94A3B8", textAlign: "right" }}>{req.diagnosis}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                          {req.expected_discharge && (
                            <View style={{ flex: 1, backgroundColor: "#FFFFFF08", borderRadius: 10, padding: 8 }}>
                              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#94A3B8", textAlign: "center" }}>صرف متوقع</Text>
                              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff", textAlign: "center", marginTop: 2 }}>{req.expected_discharge}</Text>
                            </View>
                          )}
                          <View style={{ flex: 1, backgroundColor: req.exit_pass_active ? GREEN + "20" : "#374151", borderRadius: 10, padding: 8 }}>
                            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#94A3B8", textAlign: "center" }}>بطاقة الخروج</Text>
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: req.exit_pass_active ? GREEN : "#6B7280", textAlign: "center", marginTop: 2 }}>{req.exit_pass_active ? "مفعّلة ✓" : "غير مفعّلة"}</Text>
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                </Animated.View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
