// إدارة ديوان الكُتّاب: مراجعة طلبات تعديل البيانات، وطلبات طباعة البطاقة وإعدادات سعرها.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet, Switch, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { notify, confirmAction } from "@/lib/xplatform";
import { membersApi, type AdminEdit, type PrintMeta, type PrintOrder } from "@/lib/lit-members";
import { WINE, GOLD, INK } from "@/lib/lit";
import { Pill, Empty, ithraaStyles as u } from "@/components/ithraa/ui";

const show = (v: unknown) => (v == null || v === "" ? "—" : Array.isArray(v) ? v.join("، ") : String(v));
const toLatin = (v: string) => v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/* ─────────── طلبات تعديل البيانات ─────────── */
export function AdminEdits({ token, onCount }: { token: string; onCount?: (n: number) => void }) {
  const [status, setStatus] = useState("pending");
  const [list, setList] = useState<AdminEdit[] | null>(null);
  const load = useCallback(async () => {
    setList(null);
    try { const r = await membersApi.edits(token, status); setList(r.edits); onCount?.(r.pending); } catch (e: any) { notify("تعذّر التحميل", e?.message); setList([]); }
  }, [token, status, onCount]);
  useEffect(() => { load(); }, [load]);
  return (
    <View style={{ gap: 10 }}>
      <View style={u.wrap}>
        {[["pending", "بانتظار المراجعة"], ["applied", "معتمدة"], ["rejected", "مرفوضة"]].map(([k, l]) => <Pill key={k} label={l} on={status === k} onPress={() => setStatus(k)} color={k === "pending" ? "#B7791F" : WINE} />)}
      </View>
      {!list ? <ActivityIndicator color={WINE} style={{ marginTop: 20 }} /> : !list.length ? <Empty icon="create-outline" title="لا توجد طلبات" /> : list.map((e) => <EditCard key={e.id} e={e} token={token} onDone={load} />)}
    </View>
  );
}

function EditCard({ e, token, onDone }: { e: AdminEdit; token: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [fix, setFix] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const act = async (action: "apply" | "reject") => {
    if (action === "reject" && note.trim().length < 3) return notify("السبب", "اكتب سبب الرفض ليصل للعضو.");
    if (action === "apply" && !(await confirmAction("اعتماد التعديل", `${e.name} — ستظهر البيانات الجديدة على بطاقته`, "اعتماد"))) return;
    setBusy(true);
    try {
      const changes = Object.keys(fix).length ? Object.fromEntries(Object.entries(fix).map(([k, v]) => [k, k === "genres" ? v.split(/[،,]/).map((x) => x.trim()).filter(Boolean) : v])) : undefined;
      await membersApi.editAction(token, e.id, action, { note: note.trim() || undefined, changes });
      notify("تم", action === "apply" ? "اعتُمد التعديل وأُشعر العضو" : "رُفض الطلب وأُشعر العضو");
      onDone();
    } catch (err: any) { notify("تعذّر", err?.message); } finally { setBusy(false); }
  };
  return (
    <View style={[u.card, { gap: 8, borderRightWidth: 4, borderRightColor: e.status === "pending" ? "#B7791F" : e.status === "applied" ? "#0E8A5F" : "#C0392B" }]}>
      <View style={[u.rowR, { justifyContent: "space-between" }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{e.name}</Text>
          <Text style={u.hint}>{e.category}{e.member_no ? ` · ${e.member_no}` : ""} · {new Date(e.created_at).toLocaleDateString("ar-EG")}</Text>
        </View>
      </View>
      {e.note ? <Text style={[u.hint, { color: INK }]}>💬 {e.note}</Text> : null}
      {e.changes.map((c) => (
        <View key={c.key} style={s.diff}>
          <Text style={s.diffK}>{c.label}</Text>
          <View style={s.diffRow}><Text style={s.before}>قبل</Text><Text style={s.beforeV}>{show(c.before)}</Text></View>
          <View style={s.diffRow}><Text style={s.after}>بعد</Text>
            {e.status === "pending" ? (
              <TextInput defaultValue={show(c.after) === "—" ? "" : show(c.after)} onChangeText={(v) => setFix((x) => ({ ...x, [c.key]: c.key === "birth_year" || c.key === "phone" ? toLatin(v) : v }))}
                style={s.afterIn} multiline={String(c.after ?? "").length > 40} textAlign="right" />
            ) : <Text style={s.afterV}>{show(c.after)}</Text>}
          </View>
        </View>
      ))}
      {e.status === "pending" ? (
        <>
          <Text style={u.hint}>يمكنك تصحيح القيمة الجديدة قبل الاعتماد.</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة للعضو (إلزامية عند الرفض)" placeholderTextColor={Colors.textMuted} style={u.input} />
          <View style={[u.rowR, { gap: 8 }]}>
            <Btn l="اعتماد التعديل" c="#0E8A5F" i="checkmark-circle" on={() => act("apply")} busy={busy} />
            <Btn l="رفض" c="#C0392B" i="close-circle" on={() => act("reject")} busy={busy} />
          </View>
        </>
      ) : null}
    </View>
  );
}

/* ─────────── طلبات الطباعة والإعدادات ─────────── */
const FLOW: [string, string, string][] = [["confirmed", "تأكيد", "#2B6CB0"], ["printing", "قيد الطباعة", "#7A2E3A"], ["ready", "جاهزة", "#0E8A5F"], ["delivered", "سُلّمت", "#0E8A5F"], ["cancelled", "إلغاء", "#C0392B"]];

export function AdminPrint({ token }: { token: string }) {
  const [status, setStatus] = useState("open");
  const [data, setData] = useState<{ orders: (PrintOrder & { name: string; category: string; member_no: string })[]; counts: Record<string, number> } | null>(null);
  const [meta, setMeta] = useState<PrintMeta | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const load = useCallback(async () => {
    setData(null);
    try { const [o, m] = await Promise.all([membersApi.printOrders(token, status), membersApi.printMeta()]); setData(o); setMeta(m); if (!m.enabled) setShowSettings(true); }
    catch (e: any) { notify("تعذّر التحميل", e?.message); }
  }, [token, status]);
  useEffect(() => { load(); }, [load]);
  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={() => setShowSettings((x) => !x)} style={s.settingsHead} accessibilityRole="button">
        <Ionicons name="settings" size={18} color={WINE} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>إعدادات خدمة الطباعة</Text>
          <Text style={u.hint}>{meta ? (meta.enabled ? `مفعّلة · ${meta.price_standard.toLocaleString("ar-EG")} ${meta.currency} للبطاقة` : "معطّلة — لا تظهر للأعضاء") : "…"}</Text>
        </View>
        <Ionicons name={showSettings ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
      </Pressable>
      {showSettings && meta ? <PrintSettings token={token} meta={meta} onSaved={(m) => { setMeta(m); notify("حُفظت الإعدادات", m.enabled ? "الخدمة ظاهرة للأعضاء الآن" : "الخدمة مخفية عن الأعضاء"); }} /> : null}
      <View style={u.wrap}>
        {[["open", "قيد التنفيذ"], ["delivered", "مُسلّمة"], ["cancelled", "ملغاة"], ["all", "الكل"]].map(([k, l]) => <Pill key={k} label={l} on={status === k} onPress={() => setStatus(k)} color={WINE} />)}
      </View>
      {!data ? <ActivityIndicator color={WINE} style={{ marginTop: 20 }} /> : !data.orders.length ? <Empty icon="print-outline" title="لا توجد طلبات طباعة" /> : data.orders.map((o) => <OrderCard key={o.id} o={o} token={token} onDone={load} />)}
    </View>
  );
}

function PrintSettings({ token, meta, onSaved }: { token: string; meta: PrintMeta; onSaved: (m: PrintMeta) => void }) {
  const [v, setV] = useState({ ...meta, price_standard: String(meta.price_standard || ""), price_large: String(meta.price_large || ""), delivery_fee: String(meta.delivery_fee || ""), max_qty: String(meta.max_qty) });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const m = await membersApi.printSettings(token, {
        enabled: v.enabled, price_standard: Number(toLatin(v.price_standard)) || 0, price_large: Number(toLatin(v.price_large)) || 0,
        delivery_fee: Number(toLatin(v.delivery_fee)) || 0, currency: v.currency, payment_note: v.payment_note, pickup_note: v.pickup_note, max_qty: Number(toLatin(v.max_qty)) || 10,
      });
      onSaved(m);
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };
  const num = (k: "price_standard" | "price_large" | "delivery_fee" | "max_qty", l: string) => (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={s.lbl}>{l}</Text>
      <TextInput value={v[k]} onChangeText={(x) => setV({ ...v, [k]: x.replace(/[^\d٠-٩]/g, "") })} keyboardType="number-pad" style={u.input} textAlign="right" placeholder="0" placeholderTextColor={Colors.textMuted} />
    </View>
  );
  return (
    <View style={[u.card, { gap: 10, backgroundColor: GOLD + "0D", borderColor: GOLD + "44" }]}>
      <View style={[u.rowR, { justifyContent: "space-between" }]}>
        <Text style={s.name}>تفعيل الخدمة للأعضاء</Text>
        <Switch value={v.enabled} onValueChange={(x) => setV({ ...v, enabled: x })} trackColor={{ true: WINE + "80", false: Colors.divider }} thumbColor={v.enabled ? WINE : "#ccc"} />
      </View>
      <View style={[u.rowR, { gap: 8 }]}>{num("price_standard", "سعر البطاقة العادية")}{num("price_large", "سعر المقاس الكبير (0 = إخفاء)")}</View>
      <View style={[u.rowR, { gap: 8 }]}>{num("delivery_fee", "رسوم التوصيل")}{num("max_qty", "أقصى عدد نسخ")}
        <View style={{ flex: 1, gap: 4 }}><Text style={s.lbl}>العملة</Text><TextInput value={v.currency} onChangeText={(x) => setV({ ...v, currency: x })} style={u.input} textAlign="right" /></View>
      </View>
      <Text style={s.lbl}>طريقة الدفع (تظهر للعضو)</Text>
      <TextInput value={v.payment_note} onChangeText={(x) => setV({ ...v, payment_note: x })} placeholder="مثال: الدفع عند الاستلام أو تحويل بنكك إلى …" placeholderTextColor={Colors.textMuted} style={u.input} textAlign="right" />
      <Text style={s.lbl}>مكان الاستلام الشخصي</Text>
      <TextInput value={v.pickup_note} onChangeText={(x) => setV({ ...v, pickup_note: x })} placeholder="مثال: مكتب ديوان الكُتّاب — السوق الكبير" placeholderTextColor={Colors.textMuted} style={u.input} textAlign="right" />
      <Text style={u.hint}>البطاقة المطبوعة منتج مادي يُسلَّم باليد، فتحصيل ثمنه نقداً أو بالتحويل متوافق مع سياسات متاجر التطبيقات.</Text>
      <Btn l="حفظ الإعدادات" c={WINE} i="save" on={save} busy={busy} />
    </View>
  );
}

function OrderCard({ o, token, onDone }: { o: PrintOrder & { name: string; category: string; member_no: string }; token: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [ref, setRef] = useState(o.payment_ref || "");
  const [busy, setBusy] = useState(false);
  const setStatus = async (st: string) => {
    if (st === "cancelled" && !(await confirmAction("إلغاء الطلب", o.name, "إلغاء", true))) return;
    setBusy(true);
    try { await membersApi.printStatus(token, o.id, st, { note: note.trim() || undefined, payment_ref: ref.trim() || undefined }); setNote(""); onDone(); }
    catch (e: any) { notify("تعذّر", e?.message); } finally { setBusy(false); }
  };
  const done = o.status === "delivered" || o.status === "cancelled";
  return (
    <View style={[u.card, { gap: 6 }]}>
      <View style={[u.rowR, { justifyContent: "space-between" }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{o.name} <Text style={u.hint}>· {o.member_no}</Text></Text>
          <Text style={u.hint}>{o.qty.toLocaleString("ar-EG")} × {o.size_label} · {o.face === "intl" ? "الوجه الدولي" : "الوجه المحلي"}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: (o.status === "cancelled" ? "#7A8794" : o.status === "pending" ? "#B7791F" : "#0E8A5F") + "18" }]}>
          <Text style={[s.badgeT, { color: o.status === "cancelled" ? "#7A8794" : o.status === "pending" ? "#B7791F" : "#0E8A5F" }]}>{o.status_label}</Text>
        </View>
      </View>
      <Text style={s.total}>{o.total.toLocaleString("ar-EG")} {o.currency}<Text style={u.hint}>{o.delivery_fee ? `  (شامل توصيل ${o.delivery_fee.toLocaleString("ar-EG")})` : ""}</Text></Text>
      <Pressable onPress={() => Linking.openURL(`tel:${o.phone}`)}><Text style={[u.hint, { color: WINE }]}>📞 {o.phone}</Text></Pressable>
      <Text style={u.hint}>{o.delivery === "delivery" ? `🚚 توصيل إلى: ${o.address}` : "🏠 استلام شخصي"}{o.note ? ` · ${o.note}` : ""}</Text>
      {!done ? (
        <>
          <View style={[u.rowR, { gap: 8 }]}>
            <TextInput value={ref} onChangeText={setRef} placeholder="مرجع الدفع (اختياري)" placeholderTextColor={Colors.textMuted} style={[u.input, { flex: 1 }]} textAlign="right" />
            <TextInput value={note} onChangeText={setNote} placeholder="رسالة للعضو" placeholderTextColor={Colors.textMuted} style={[u.input, { flex: 1.3 }]} textAlign="right" />
          </View>
          <View style={[u.rowR, { gap: 6, flexWrap: "wrap" }]}>
            {FLOW.filter(([k]) => k !== o.status).map(([k, l, c]) => <Btn key={k} l={l} c={c} i={k === "cancelled" ? "close-circle" : "arrow-back-circle"} on={() => setStatus(k)} busy={busy} />)}
          </View>
        </>
      ) : o.payment_ref ? <Text style={u.hint}>مرجع الدفع: {o.payment_ref}</Text> : null}
    </View>
  );
}

function Btn({ l, c, i, on, busy }: { l: string; c: string; i: string; on: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={on} disabled={busy} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: c + "16", borderWidth: 1, borderColor: c + "55", opacity: busy ? 0.6 : 1 }} accessibilityRole="button">
      <Ionicons name={i as any} size={15} color={c} /><Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12.5, color: c }}>{l}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  lbl: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  diff: { padding: 10, borderRadius: 12, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider, gap: 4 },
  diffK: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: WINE, textAlign: "right" },
  diffRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 },
  before: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#7A8794", width: 26, textAlign: "right" },
  beforeV: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: "#7A8794", textAlign: "right", textDecorationLine: "line-through" },
  after: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#0E8A5F", width: 26, textAlign: "right", paddingTop: 6 },
  afterV: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  afterIn: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.cardBg, borderRadius: 10, borderWidth: 1, borderColor: "#0E8A5F55", paddingHorizontal: 10, paddingVertical: 6 },
  settingsHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  badge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  badgeT: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  total: { fontFamily: "Cairo_700Bold", fontSize: 15, color: WINE, textAlign: "right" },
});
