// أدوات إدارية: تسجيل الحضور بمسح بطاقة المسعف، أزرار التصدير/الطباعة، وسجل التدقيق.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, openExternal } from "@/lib/xplatform";
import { srcsStyles } from "@/components/srcs/styles";
import { srcsApi, SRCS_RED, AUDIT_LABEL, type SrcsAudit } from "@/lib/red-crescent";

// ═══ مسح البطاقات لتسجيل الحضور ═══
type Scan = { ok: boolean; name?: string; sub?: string; error?: string; at: number };
export function CheckinScanner({ target, onClose }: { target: { title: string; meeting_id?: number; course_id?: number } | null; onClose: () => void }) {
  const { token } = useAuth();
  const [perm, requestPerm] = useCameraPermissions();
  const [log, setLog] = useState<Scan[]>([]);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  useEffect(() => { if (target) { setLog([]); setManual(""); } }, [target]);

  const submit = useCallback(async (code: string) => {
    const c = code.trim();
    if (!c || !target || busy) return;
    if (last.current.code === c && Date.now() - last.current.at < 4000) return; // تجاهل تكرار نفس الرمز
    last.current = { code: c, at: Date.now() };
    setBusy(true);
    try {
      const r = await srcsApi.admin.checkin(token!, { code: c, meeting_id: target.meeting_id, course_id: target.course_id });
      setLog((p) => [{ ok: true, name: r.member.name, sub: `${r.member.role_label}${r.member.unit ? ` · ${r.member.unit}` : ""} · ${r.member.card_no}`, at: Date.now() }, ...p].slice(0, 50));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      setLog((p) => [{ ok: false, error: e?.message || "تعذّر التسجيل", at: Date.now() }, ...p].slice(0, 50));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally { setBusy(false); }
  }, [target, token, busy]);

  const okCount = log.filter((x) => x.ok).length;
  return (
    <Modal visible={!!target} animationType="slide" onRequestClose={onClose}>
      <View style={st.wrap}>
        <View style={st.head}>
          <TouchableOpacity onPress={onClose} style={st.icon}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
          <View style={{ flex: 1 }}><Text style={st.title} numberOfLines={1}>تسجيل الحضور</Text><Text style={st.sub} numberOfLines={1}>{target?.title} · سُجّل {okCount}</Text></View>
        </View>
        <View style={st.camBox}>
          {Platform.OS !== "web" && perm?.granted ? (
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(e) => submit(e.data)} />
          ) : Platform.OS !== "web" ? (
            <TouchableOpacity style={st.permBtn} onPress={requestPerm}><Ionicons name="camera" size={28} color="#fff" /><Text style={st.permTxt}>السماح باستخدام الكاميرا لمسح البطاقات</Text></TouchableOpacity>
          ) : (
            <View style={st.permBtn}><Ionicons name="qr-code" size={28} color="#fff" /><Text style={st.permTxt}>المسح بالكاميرا متاح في تطبيق الهاتف — أدخل رقم البطاقة يدوياً</Text></View>
          )}
          <View pointerEvents="none" style={st.frame} />
          {busy ? <ActivityIndicator color="#fff" style={{ position: "absolute", top: 12, left: 12 }} /> : null}
        </View>
        <View style={st.manual}>
          <TextInput value={manual} onChangeText={setManual} placeholder="أو أدخل رقم البطاقة SRCS-HSH-…" placeholderTextColor="#9CA3AF" autoCapitalize="characters" style={st.input} onSubmitEditing={() => { submit(manual); setManual(""); }} />
          <TouchableOpacity style={st.go} onPress={() => { submit(manual); setManual(""); }}><Ionicons name="checkmark" size={22} color="#fff" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }}>
          {!log.length ? <Text style={st.empty}>وجّه الكاميرا نحو رمز QR في ظهر بطاقة المسعف</Text> : log.map((x) => (
            <View key={x.at} style={[st.row, { borderColor: x.ok ? "#16A34A" : "#DC2626" }]}>
              <Ionicons name={x.ok ? "checkmark-circle" : "close-circle"} size={22} color={x.ok ? "#16A34A" : "#DC2626"} />
              <View style={{ flex: 1 }}>
                <Text style={st.rowT}>{x.ok ? x.name : x.error}</Text>
                {x.sub ? <Text style={st.rowS}>{x.sub}</Text> : null}
              </View>
              <Text style={st.rowS}>{new Date(x.at).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ═══ أزرار التصدير ═══
export function ExportButtons({ kind, id, compact }: { kind: "members" | "cohort" | "course" | "meeting"; id: number | null; compact?: boolean }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState<"" | "csv" | "html">("");
  const go = async (format: "csv" | "html") => {
    setBusy(format);
    try { const r = await srcsApi.admin.exportLink(token!, kind, id, format); openExternal(r.url); }
    catch (e: any) { notify("تعذّر التصدير", e?.message); } finally { setBusy(""); }
  };
  return (
    <View style={{ flexDirection: "row-reverse", gap: 8 }}>
      <TouchableOpacity style={[s.ghost, compact && { height: 38 }]} onPress={() => go("html")} disabled={!!busy}>
        {busy === "html" ? <ActivityIndicator color={SRCS_RED} /> : <><Ionicons name="print-outline" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>طباعة / PDF</Text></>}
      </TouchableOpacity>
      <TouchableOpacity style={[s.ghost, compact && { height: 38 }]} onPress={() => go("csv")} disabled={!!busy}>
        {busy === "csv" ? <ActivityIndicator color={SRCS_RED} /> : <><Ionicons name="grid-outline" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>Excel</Text></>}
      </TouchableOpacity>
    </View>
  );
}

// ═══ سجل التدقيق ═══
export function AuditPanel() {
  const { token } = useAuth();
  const [rows, setRows] = useState<SrcsAudit[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { srcsApi.admin.audit(token!).then((r) => setRows(r.entries)).catch((e) => { notify("تعذّر التحميل", e?.message); setRows([]); }); }, [token]);
  const list = (rows || []).filter((r) => !q.trim() || [r.actor_name, r.target, AUDIT_LABEL[r.action], r.action].some((x) => String(x || "").includes(q.trim())));
  const icon = (a: string) => (a === "ban" ? "ban" : a.startsWith("cert") ? "ribbon" : a === "perms" ? "key" : a === "settings" ? "cash" : a === "export" ? "download" : a === "checkin" ? "qr-code" : a.startsWith("doc") ? "document" : a.startsWith("results") ? "stats-chart" : "create");
  return (
    <View style={{ gap: 10 }}>
      <View style={s.card}>
        <View style={s.row}><Ionicons name="shield-checkmark" size={18} color={SRCS_RED} /><Text style={[s.cardTitle, { flex: 1 }]}>سجل التدقيق</Text></View>
        <Text style={s.hint}>كل إجراء حساس يُسجَّل تلقائياً: من نفّذه، وعلى من، ومتى — ولا يمكن تعديله أو حذفه من التطبيق.</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="ابحث باسم المنفّذ أو العضو أو الإجراء" placeholderTextColor={Colors.textMuted} style={s.input} />
      </View>
      {!rows ? <ActivityIndicator color={SRCS_RED} /> : !list.length ? <Text style={s.empty}>لا توجد سجلات.</Text> : list.map((r) => (
        <View key={r.id} style={st.audit}>
          <View style={st.aIcon}><Ionicons name={icon(r.action) as any} size={16} color={r.action === "ban" || r.action === "cert_revoke" ? "#B91C1C" : SRCS_RED} /></View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={s.itemTitle}>{AUDIT_LABEL[r.action] ?? r.action} — <Text style={{ fontFamily: "Cairo_400Regular" }}>{r.target.replace(/^\w+:\d+\s*/, "") || r.target}</Text></Text>
            <Text style={s.meta}>بواسطة {r.actor_name || "النظام"} · {new Date(r.created_at).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</Text>
            {summary(r) ? <Text style={[s.meta, { color: Colors.textSecondary }]} numberOfLines={3}>{summary(r)}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}
const FIELD_AR: Record<string, string> = { status: "الحالة", role: "الصفة", unit: "الوحدة", affiliation: "الجهة", cohort_id: "الدفعة", perms: "الصلاحيات", revoked: "إلغاء البطاقة", renew_card: "تجديد", reason: "السبب", cert_price: "السعر", cert_currency: "العملة", cert_payment_info: "تعليمات الدفع", amount: "المبلغ", ref: "الإيصال", note: "ملاحظة", format: "الصيغة", name: "العضو", title: "المستند" };
function summary(r: SrcsAudit): string {
  const d = r.detail || {};
  return Object.entries(d).filter(([k, v]) => v !== undefined && v !== null && k !== "user_id" && k !== "member").map(([k, v]) => {
    const val = typeof v === "object" && v && "to" in (v as any) ? `${fmt((v as any).from)} ← ${fmt((v as any).to)}` : fmt(v);
    return `${FIELD_AR[k] ?? k}: ${val}`;
  }).join(" · ");
}
const fmt = (v: unknown) => { if (v === true) return "نعم"; if (v === false) return "لا"; if (v === null || v === undefined || v === "") return "—"; const s = String(v); return s.length > 60 ? s.slice(0, 60) + "…" : s; };

const s = StyleSheet.create({ ...srcsStyles });
const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0E0F0E" },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: Platform.OS === "ios" ? 54 : 30, paddingBottom: 10 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", textAlign: "right" },
  camBox: { height: 300, marginHorizontal: 14, borderRadius: 22, overflow: "hidden", backgroundColor: "#1F2937" },
  frame: { position: "absolute", top: 50, bottom: 50, left: "18%", right: "18%", borderWidth: 3, borderColor: "#FACC15", borderRadius: 18 },
  permBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  permTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#fff", textAlign: "center" },
  manual: { flexDirection: "row-reverse", gap: 8, padding: 14 },
  input: { flex: 1, height: 48, borderRadius: 14, backgroundColor: "#1F2937", color: "#fff", paddingHorizontal: 14, fontFamily: "Cairo_600SemiBold", fontSize: 14, textAlign: "center" },
  go: { width: 48, height: 48, borderRadius: 14, backgroundColor: SRCS_RED, alignItems: "center", justifyContent: "center" },
  empty: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center", paddingTop: 10 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, backgroundColor: "#111827", borderWidth: 1 },
  rowT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", textAlign: "right" },
  rowS: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.65)", textAlign: "right" },
  audit: { flexDirection: "row-reverse", gap: 10, padding: 12, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  aIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: SRCS_RED + "12", alignItems: "center", justifyContent: "center" },
});
