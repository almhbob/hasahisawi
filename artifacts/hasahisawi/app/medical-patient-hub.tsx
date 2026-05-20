import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Platform, Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

const MED = "#10B981";
const MED2 = "#6EE7B7";

type Appointment = { id: number; facility_name: string; appointment_date: string; appointment_time: string; status: string; notes: string };
type LabResult = { id: number; order_id: number; ready_at: string; summary_notes: string; results_data: any; tests: any };
type Prescription = { id: number; doctor_name: string; diagnosis: string; medications: any; follow_up_date: string; created_at: string; facility_name: string };
type PharmacyOrder = { id: number; prescription_id: number; delivery_type: string; status: string; created_at: string; medications: any; doctor_name: string };

function safeJSON(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    pending: ["قيد الانتظار", "#F59E0B"], confirmed: ["مؤكد", "#10B981"],
    completed: ["مكتمل", "#6366F1"], cancelled: ["ملغي", "#EF4444"],
    delivered: ["تم الصرف", "#10B981"], active: ["ساري", "#6366F1"],
  };
  const [label, color] = map[status] || [status, "#9CA3AF"];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: color + "20" }}>
      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color }}>{label}</Text>
    </View>
  );
}

export default function MedicalPatientHubScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();

  const [tab, setTab] = useState<"appointments" | "labs" | "prescriptions" | "pharmacy">("appointments");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [pharmacyOrders, setPharmacyOrders] = useState<PharmacyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<number | null>(null);

  const headers = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const loadAll = useCallback(async () => {
    const base = getApiUrl();
    try {
      const [appts, labs, rxs, pharma] = await Promise.all([
        fetch(`${base}/api/appointments/mine`, { headers: headers() }).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/api/medical/lab-results/mine`, { headers: headers() }).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/api/medical/prescriptions/mine`, { headers: headers() }).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/api/medical/my-pharmacy-orders`, { headers: headers() }).then(r => r.json()).catch(() => ({})),
      ]);
      setAppointments(appts?.appointments ?? appts?.data ?? []);
      setLabResults(labs?.results ?? []);
      setPrescriptions(rxs?.prescriptions ?? []);
      setPharmacyOrders(pharma?.orders ?? []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── توليد PDF الروشتة ──
  const generatePrescriptionPDF = async (rx: Prescription) => {
    setPdfLoading(rx.id);
    try {
      const meds = safeJSON(rx.medications);
      const medsHtml = meds.map((m: any) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">${m.name}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${m.dosage || "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${m.frequency || "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${m.duration || "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${m.storage || "درجة حرارة الغرفة"}</td>
        </tr>
      `).join("");

      const html = `
        <!DOCTYPE html><html dir="rtl" lang="ar">
        <head><meta charset="UTF-8"><style>
          body{font-family:'Arial',sans-serif;padding:30px;color:#111;direction:rtl}
          h1{color:#10B981;font-size:22px;margin-bottom:4px}
          .meta{color:#6b7280;font-size:13px;margin-bottom:20px}
          .section{margin-bottom:18px}
          .label{font-weight:700;color:#374151;margin-bottom:4px}
          table{width:100%;border-collapse:collapse;font-size:13px}
          th{background:#f0fdf4;padding:10px;text-align:right;border-bottom:2px solid #10B981}
          .follow{background:#fef9c3;padding:12px;border-radius:8px;margin-top:16px}
          .footer{margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;text-align:center}
        </style></head>
        <body>
          <h1>وصفة طبية</h1>
          <div class="meta">
            ${rx.facility_name || ""} &nbsp;|&nbsp; ${rx.doctor_name || "الطبيب"} &nbsp;|&nbsp; ${formatDate(rx.created_at)}
          </div>
          <div class="section">
            <div class="label">المريض:</div>
            <div>${user?.name || "—"}</div>
          </div>
          ${rx.diagnosis ? `<div class="section"><div class="label">التشخيص:</div><div>${rx.diagnosis}</div></div>` : ""}
          <div class="section">
            <div class="label">الأدوية الموصوفة:</div>
            <table>
              <tr>
                <th>اسم الدواء</th><th>الجرعة</th><th>التكرار</th><th>المدة</th><th>طريقة الحفظ</th>
              </tr>
              ${medsHtml}
            </table>
          </div>
          ${rx.follow_up_date ? `
            <div class="follow">
              <strong>📅 موعد المتابعة:</strong> ${rx.follow_up_date}
              ${(rx as any).follow_up_notes ? `<br><span style="color:#92400e">${(rx as any).follow_up_notes}</span>` : ""}
            </div>
          ` : ""}
          <div class="footer">
            تم إنشاؤه بواسطة تطبيق حصاحيصا &nbsp;·&nbsp; ${new Date().toLocaleDateString("ar-EG")}
          </div>
        </body></html>
      `;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "مشاركة الوصفة الطبية" });
        } else {
          Alert.alert("تم", "تم حفظ الوصفة كـ PDF");
        }
      }
    } catch (e: any) {
      Alert.alert("خطأ", "تعذر توليد PDF. " + (e?.message || ""));
    } finally { setPdfLoading(null); }
  };

  // ── توليد PDF نتائج المختبر ──
  const generateLabPDF = async (result: LabResult) => {
    setPdfLoading(result.id);
    try {
      const rows = safeJSON(result.results_data);
      const rowsHtml = rows.map((r: any) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">${r.test_name || r.name || "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${r.value ?? "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${r.unit || "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${r.normal_range || "—"}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:${r.flag === "high" ? "#ef4444" : r.flag === "low" ? "#3b82f6" : "#10b981"}">${r.flag === "high" ? "▲ مرتفع" : r.flag === "low" ? "▼ منخفض" : "طبيعي"}</td>
        </tr>
      `).join("");
      const html = `
        <!DOCTYPE html><html dir="rtl" lang="ar">
        <head><meta charset="UTF-8"><style>
          body{font-family:'Arial',sans-serif;padding:30px;color:#111;direction:rtl}
          h1{color:#6366F1;font-size:22px}
          .meta{color:#6b7280;font-size:13px;margin-bottom:20px}
          table{width:100%;border-collapse:collapse;font-size:13px}
          th{background:#f5f3ff;padding:10px;text-align:right;border-bottom:2px solid #6366F1}
          .footer{margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;text-align:center}
        </style></head>
        <body>
          <h1>نتيجة تحليل مختبر</h1>
          <div class="meta">تاريخ الجاهزية: ${formatDate(result.ready_at)}</div>
          <div class="meta">المريض: ${(result as any).patient_name || user?.name || "—"}</div>
          <table>
            <tr><th>الفحص</th><th>القيمة</th><th>الوحدة</th><th>المعدل الطبيعي</th><th>التقييم</th></tr>
            ${rowsHtml}
          </table>
          ${result.summary_notes ? `<div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px"><strong>ملاحظات:</strong> ${result.summary_notes}</div>` : ""}
          <div class="footer">تم إنشاؤه بواسطة تطبيق حصاحيصا</div>
        </body></html>
      `;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "مشاركة نتيجة المختبر" });
        }
      }
    } catch (e: any) {
      Alert.alert("خطأ", "تعذر توليد PDF");
    } finally { setPdfLoading(null); }
  };

  const requestPharmacy = (prescriptionId: number) => {
    Alert.alert("طلب الدواء", "كيف تريد استلام الدواء؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "توصيل للمنزل", onPress: () => placePharmacyOrder(prescriptionId, "delivery") },
      { text: "استلام شخصي", onPress: () => placePharmacyOrder(prescriptionId, "pickup") },
    ]);
  };

  const placePharmacyOrder = async (prescriptionId: number, deliveryType: string) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/medical/pharmacy-orders`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ prescription_id: prescriptionId, delivery_type: deliveryType, patient_name: user?.name }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ تم الطلب", "تم إرسال طلبك للصيدلية. ستصلك رسالة عند جاهزية الدواء.");
        loadAll();
      } else {
        const d = await res.json().catch(() => ({}));
        Alert.alert("خطأ", d?.error || "فشل الطلب");
      }
    } catch { Alert.alert("خطأ", "تعذر الاتصال"); }
  };

  const TABS = [
    { key: "appointments", label: "مواعيدي",   icon: "calendar-outline",    count: appointments.filter(a => a.status !== "cancelled").length },
    { key: "labs",         label: "المختبر",    icon: "flask-outline",        count: labResults.length },
    { key: "prescriptions",label: "الروشتات",  icon: "document-text-outline", count: prescriptions.length },
    { key: "pharmacy",     label: "الصيدلية",   icon: "medical-outline",      count: pharmacyOrders.length },
  ] as const;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <LinearGradient colors={["#064E3B", "#065F46"]} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={MED2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>ملفي الطبي</Text>
          <Text style={s.headerSub}>جميع خدماتي الصحية في مكان واحد</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/medical-record-setup" as any)} style={s.iconBtn} hitSlop={12}>
          <Ionicons name="person-outline" size={22} color={MED2} />
        </TouchableOpacity>
      </LinearGradient>

      {/* تبويبات */}
      <View style={s.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}>
            <View style={{ position: "relative" }}>
              <Ionicons name={t.icon} size={16} color={tab === t.key ? MED : Colors.textMuted} />
              {t.count > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{t.count > 9 ? "9+" : t.count}</Text>
                </View>
              )}
            </View>
            <Text style={[s.tabLabel, tab === t.key && { color: MED }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor={MED} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator color={MED} size="large" /></View>
        ) : (
          <>
            {/* ── مواعيدي ── */}
            {tab === "appointments" && (
              <Animated.View entering={FadeInDown.springify()}>
                {appointments.length === 0 ? (
                  <EmptyState icon="calendar-outline" title="لا توجد مواعيد" sub="احجز موعدك من خلال قائمة المنشآت الصحية" />
                ) : (
                  appointments.map((a, i) => (
                    <Animated.View key={a.id} entering={FadeInDown.delay(i * 25).springify()} style={s.card}>
                      <View style={s.cardRow}>
                        <View style={[s.cardIcon, { backgroundColor: "#065F46" }]}>
                          <Ionicons name="calendar" size={20} color={MED2} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.cardTitle}>{a.facility_name || "المنشأة الصحية"}</Text>
                          <Text style={s.cardSub}>{formatDate(a.appointment_date)} — {a.appointment_time}</Text>
                          {a.notes && <Text style={[s.cardSub, { marginTop: 2 }]}>{a.notes}</Text>}
                        </View>
                        <StatusBadge status={a.status} />
                      </View>
                    </Animated.View>
                  ))
                )}
              </Animated.View>
            )}

            {/* ── نتائج المختبر ── */}
            {tab === "labs" && (
              <Animated.View entering={FadeInDown.springify()}>
                {labResults.length === 0 ? (
                  <EmptyState icon="flask-outline" title="لا توجد نتائج" sub="ستظهر هنا نتائج فحوصاتك فور جاهزيتها" />
                ) : (
                  labResults.map((lr, i) => {
                    const rows = safeJSON(lr.results_data);
                    const abnormal = rows.filter((r: any) => r.flag === "high" || r.flag === "low");
                    return (
                      <Animated.View key={lr.id} entering={FadeInDown.delay(i * 25).springify()} style={s.card}>
                        <View style={s.cardRow}>
                          <View style={[s.cardIcon, { backgroundColor: "#4C1D95" }]}>
                            <Ionicons name="flask" size={20} color="#C4B5FD" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>نتائج تحليل — {formatDate(lr.ready_at)}</Text>
                            <Text style={s.cardSub}>{rows.length} فحص{abnormal.length > 0 ? ` · ${abnormal.length} نتيجة غير طبيعية` : ""}</Text>
                            {lr.summary_notes && <Text style={[s.cardSub, { color: "#F59E0B" }]}>{lr.summary_notes}</Text>}
                          </View>
                        </View>
                        {rows.length > 0 && (
                          <View style={s.resultGrid}>
                            {rows.slice(0, 4).map((r: any, j: number) => (
                              <View key={j} style={[s.resultCell, r.flag && r.flag !== "normal" && { borderColor: r.flag === "high" ? "#EF4444" : "#3B82F6" }]}>
                                <Text style={s.resultName} numberOfLines={1}>{r.test_name || r.name}</Text>
                                <Text style={[s.resultVal, { color: r.flag === "high" ? "#EF4444" : r.flag === "low" ? "#3B82F6" : Colors.text }]}>
                                  {r.value ?? "—"} {r.unit || ""}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                        <TouchableOpacity
                          style={s.pdfBtn}
                          onPress={() => generateLabPDF(lr)}
                          disabled={pdfLoading === lr.id}
                        >
                          {pdfLoading === lr.id
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <><Ionicons name="download-outline" size={15} color="#fff" /><Text style={s.pdfBtnText}>تنزيل PDF / مشاركة</Text></>
                          }
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })
                )}
              </Animated.View>
            )}

            {/* ── الروشتات ── */}
            {tab === "prescriptions" && (
              <Animated.View entering={FadeInDown.springify()}>
                {prescriptions.length === 0 ? (
                  <EmptyState icon="document-text-outline" title="لا توجد وصفات" sub="ستظهر هنا وصفاتك الطبية فور إصدارها" />
                ) : (
                  prescriptions.map((rx, i) => {
                    const meds = safeJSON(rx.medications);
                    return (
                      <Animated.View key={rx.id} entering={FadeInDown.delay(i * 25).springify()} style={s.card}>
                        <View style={s.cardRow}>
                          <View style={[s.cardIcon, { backgroundColor: "#1E3A5F" }]}>
                            <Ionicons name="document-text" size={20} color="#93C5FD" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>{rx.doctor_name || "الطبيب"} — {rx.facility_name || ""}</Text>
                            <Text style={s.cardSub}>{formatDate(rx.created_at)}</Text>
                            {rx.diagnosis && <Text style={[s.cardSub, { color: "#F59E0B" }]}>التشخيص: {rx.diagnosis}</Text>}
                          </View>
                        </View>
                        {/* الأدوية */}
                        <View style={s.medList}>
                          {meds.map((m: any, j: number) => (
                            <View key={j} style={s.medItem}>
                              <Ionicons name="ellipse" size={6} color={MED} style={{ marginTop: 6 }} />
                              <View style={{ flex: 1 }}>
                                <Text style={s.medName}>{m.name} {m.dosage ? `— ${m.dosage}` : ""}</Text>
                                <Text style={s.medSub}>{[m.frequency, m.duration].filter(Boolean).join(" · ")}</Text>
                                {m.storage && <Text style={[s.medSub, { color: "#F59E0B" }]}>📦 {m.storage}</Text>}
                              </View>
                            </View>
                          ))}
                        </View>
                        {rx.follow_up_date && (
                          <View style={s.followUp}>
                            <Ionicons name="calendar-outline" size={14} color="#F59E0B" />
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#F59E0B" }}>موعد المتابعة: {rx.follow_up_date}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: "row-reverse", gap: 8, padding: 12, paddingTop: 0 }}>
                          <TouchableOpacity style={s.pdfBtn} onPress={() => generatePrescriptionPDF(rx)} disabled={pdfLoading === rx.id}>
                            {pdfLoading === rx.id
                              ? <ActivityIndicator color="#fff" size="small" />
                              : <><Ionicons name="download-outline" size={15} color="#fff" /><Text style={s.pdfBtnText}>تنزيل PDF</Text></>
                            }
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.pdfBtn, { backgroundColor: MED, flex: 1 }]} onPress={() => requestPharmacy(rx.id)}>
                            <Ionicons name="bag-handle-outline" size={15} color="#fff" />
                            <Text style={s.pdfBtnText}>طلب الدواء</Text>
                          </TouchableOpacity>
                        </View>
                      </Animated.View>
                    );
                  })
                )}
              </Animated.View>
            )}

            {/* ── الصيدلية ── */}
            {tab === "pharmacy" && (
              <Animated.View entering={FadeInDown.springify()}>
                {pharmacyOrders.length === 0 ? (
                  <EmptyState icon="medical-outline" title="لا توجد طلبات صيدلية" sub="اطلب الدواء من خلال تبويب الروشتات" />
                ) : (
                  pharmacyOrders.map((po, i) => {
                    const meds = safeJSON(po.medications);
                    return (
                      <Animated.View key={po.id} entering={FadeInDown.delay(i * 25).springify()} style={s.card}>
                        <View style={s.cardRow}>
                          <View style={[s.cardIcon, { backgroundColor: "#14532D" }]}>
                            <Ionicons name="bag-handle" size={20} color={MED2} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>طلب صيدلية — {po.delivery_type === "delivery" ? "توصيل" : "استلام"}</Text>
                            <Text style={s.cardSub}>{formatDate(po.created_at)} · الطبيب: {po.doctor_name || "—"}</Text>
                            <Text style={s.cardSub}>{meds.length} دواء</Text>
                          </View>
                          <StatusBadge status={po.status} />
                        </View>
                        {po.status === "delivered" && (
                          <View style={s.dispenseBox}>
                            <Ionicons name="checkmark-circle" size={16} color={MED} />
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: MED }}>تم صرف الدواء — راجع التطبيق لتعليمات الاستخدام</Text>
                          </View>
                        )}
                      </Animated.View>
                    );
                  })
                )}
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function EmptyState({ icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
      <Ionicons name={icon} size={52} color={Colors.textMuted} />
      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text }}>{title}</Text>
      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" }}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#FFFFFF18", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: MED2, textAlign: "center", marginTop: 2 },
  tabRow: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 3, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabBtnActive: { borderBottomColor: MED },
  tabLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted },
  badge: { position: "absolute", top: -5, right: -7, backgroundColor: "#EF4444", borderRadius: 8, minWidth: 15, height: 15, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 9, color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 12, overflow: "hidden" },
  cardRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12, padding: 14 },
  cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  cardSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  resultGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  resultCell: { flex: 1, minWidth: "45%", backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 8 },
  resultName: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  resultVal: { fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right", marginTop: 2 },
  pdfBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "#4338CA", borderRadius: 10, flex: 1 },
  pdfBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  medList: { paddingHorizontal: 14, paddingBottom: 8, gap: 6 },
  medItem: { flexDirection: "row-reverse", gap: 8, alignItems: "flex-start" },
  medName: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text, textAlign: "right" },
  medSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  followUp: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginHorizontal: 14, marginBottom: 8, backgroundColor: "#FEF9C3", padding: 8, borderRadius: 10 },
  dispenseBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, margin: 12, marginTop: 0, backgroundColor: MED + "18", padding: 10, borderRadius: 10 },
});
