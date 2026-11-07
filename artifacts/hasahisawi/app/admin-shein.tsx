/** إدارة خدمة شي إن: حالة الخدمة (قريباً/فعالة/قيد الصيانة)، الأسعار والعمولات، الفريق، وكل الطلبات */
import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { confirmAction, notify } from "@/lib/xplatform";
import { toLatinDigits } from "@/lib/digits";
import { NeuButton, NeuField, NeuRaised } from "@/components/auth/neu";
import { ACCENT, Empty, OrderCard, ServiceBadge, Shell, SmallBtn, u } from "@/components/shein/ui";
import PolicyView from "@/components/shein/PolicyView";
import { computeFinancials, fmt, rateAgeDays, ROLE_LABEL, SERVICE_BADGE, ServiceState, sheinApi, SheinAgent, SheinOrder, SheinRole, SheinSettings, SheinStatus, STATUS_META } from "@/lib/shein-api";

const NUM_FIELDS: { k: keyof SheinSettings; label: string; icon: string }[] = [
  { k: "sar_to_sdg", label: "سعر الصرف: 1 ريال = ? جنيه", icon: "swap-horizontal-outline" },
  { k: "proxy_fee_pct", label: "عمولة الشراء بالنيابة (%)", icon: "trending-up-outline" },
  { k: "proxy_fee_fixed_sar", label: "رسوم ثابتة لكل طلب (ريال)", icon: "pricetag-outline" },
  { k: "local_shipping_sar", label: "الشحن داخل السعودية لكل طلب (ريال)", icon: "car-outline" },
  { k: "intl_shipping_sar_per_item", label: "الشحن الدولي لكل قطعة (ريال)", icon: "airplane-outline" },
  { k: "local_delivery_sdg", label: "التوصيل داخل الحصاحيصا (جنيه)", icon: "bicycle-outline" },
];

export default function AdminSheinScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof sheinApi.overview>> | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<SheinStatus | "">("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<SheinRole>("verifier");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await sheinApi.overview(token, filter || undefined);
      setData(r); setErr("");
      setForm(f => Object.keys(f).length ? f : Object.fromEntries(Object.entries(r.settings).map(([k, v]) => [k, String(v)])));
    } catch (e: any) { setErr(e?.message || "غير مصرح"); }
  }, [token, filter]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (err) return <Shell title="إدارة شي إن" insets={insets}><Empty icon="lock-closed-outline" text={err} /></Shell>;
  if (!data || !token) return <Shell title="إدارة شي إن" insets={insets}><ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} /></Shell>;

  const setStatus = async (status: ServiceState) => {
    try { const r = await sheinApi.saveSettings(token, { status }); setData(d => d && { ...d, settings: r.settings }); setForm(f => ({ ...f, status })); }
    catch (e: any) { notify("خطأ", e?.message); }
  };
  const save = async () => {
    setSaving(true);
    try {
      const body: any = { note: form.note ?? "", bank_info: form.bank_info ?? "", policy: form.policy ?? "" };
      for (const f of NUM_FIELDS) body[f.k] = toLatinDigits(form[f.k] ?? "");
      const r = await sheinApi.saveSettings(token, body);
      setData(d => d && { ...d, settings: r.settings });
      notify("تم الحفظ ✓", "تُطبّق الأسعار الجديدة على الطلبات الجديدة فقط.");
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setSaving(false); }
  };
  const addAgent = async () => {
    try { const r = await sheinApi.addAgent(token, toLatinDigits(phone), role); notify("تمت الإضافة ✓", `${r.agent.name} — ${ROLE_LABEL[role]}`); setPhone(""); load(); }
    catch (e: any) { notify("تعذّرت الإضافة", e?.message); }
  };
  const removeAgent = async (a: SheinAgent) => {
    if (!(await confirmAction("إزالة من الفريق", `إزالة ${a.name} من ${ROLE_LABEL[a.role]}؟`, "إزالة", true))) return;
    try { await sheinApi.removeAgent(token, a.user_id, a.role); load(); } catch (e: any) { notify("خطأ", e?.message); }
  };
  const cancel = async (o: SheinOrder) => {
    const reason = "ألغته الإدارة";
    if (!(await confirmAction("إلغاء الطلب", `إلغاء طلب #${o.id} وإبلاغ العميل؟`, "إلغاء", true))) return;
    try { await sheinApi.adminCancel(token, o.id, reason); load(); } catch (e: any) { notify("خطأ", e?.message); }
  };

  const count = (s: SheinStatus) => data.counts.find(c => c.status === s)?.n ?? 0;
  const revenue = data.counts.filter(c => c.status !== "cancelled").reduce((a, c) => a + Number(c.sdg || 0), 0);
  const sample = computeFinancials(100, 1, { ...data.settings, ...Object.fromEntries(NUM_FIELDS.map(f => [f.k, Number(toLatinDigits(form[f.k] ?? "")) || 0])) } as SheinSettings);

  return (
    <Shell title="إدارة شي إن" sub="الخدمة والأسعار والفريق" insets={insets} right={<ServiceBadge state={data.settings.status} />}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ACCENT} />}>
        <NeuRaised radius={20} style={u.card}>
          <Text style={u.section}>حالة الخدمة</Text>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            {(Object.keys(SERVICE_BADGE) as ServiceState[]).map(s => {
              const b = SERVICE_BADGE[s], on = data.settings.status === s;
              return (
                <TouchableOpacity key={s} onPress={() => setStatus(s)} style={[st.state, on && { backgroundColor: b.bg, borderColor: b.color }]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Ionicons name={b.icon as any} size={18} color={on ? b.color : Colors.textMuted} />
                  <Text style={[st.stateText, on && { color: b.color }]}>{b.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <NeuField label="رسالة للمستخدمين (اختياري)" icon="megaphone-outline" value={form.note ?? ""} onChangeText={t => setForm(f => ({ ...f, note: t }))} placeholder="مثال: نعود للعمل بعد العيد" />
        </NeuRaised>

        <View style={st.stats}>
          {(["pending_payment_verification", "paid_and_processing", "purchased_saudi", "shipped_to_sudan", "received_hasahisa", "delivered"] as SheinStatus[]).map(s => (
            <TouchableOpacity key={s} onPress={() => setFilter(f => (f === s ? "" : s))} style={[st.stat, filter === s && { borderColor: STATUS_META[s].color }]}>
              <Ionicons name={STATUS_META[s].icon as any} size={16} color={STATUS_META[s].color} />
              <Text style={[st.statN, { color: STATUS_META[s].color }]}>{count(s)}</Text>
              <Text style={st.statL} numberOfLines={1}>{STATUS_META[s].short}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[u.meta, { textAlign: "center" }]}>إجمالي قيمة الطلبات غير الملغاة: <Text style={{ fontFamily: "Cairo_700Bold", color: ACCENT }}>{fmt(revenue)} ج.س</Text></Text>

        {(() => {
          const age = rateAgeDays(data.settings);
          if (data.settings.status !== "active" || (age !== null && age < 7)) return null;
          return (
            <View style={st.warn}>
              <Ionicons name="warning-outline" size={18} color="#946B00" />
              <Text style={[u.meta, { flex: 1, color: "#6B4D00" }]}>
                {age === null ? "لم يُحدَّث سعر الصرف منذ تفعيل الخدمة" : `آخر تحديث لسعر الصرف قبل ${Math.floor(age)} يوماً`} — حدّثه لتجنب الخسارة في الطلبات الجديدة.
              </Text>
            </View>
          );
        })()}

        <NeuRaised radius={20} style={u.card}>
          <Text style={u.section}>الأسعار والعمولات</Text>
          {data.settings.rate_updated_at ? <Text style={u.meta}>آخر تحديث لسعر الصرف: {new Date(data.settings.rate_updated_at).toLocaleString("ar-SD", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</Text> : null}
          {NUM_FIELDS.map(f => (
            <NeuField key={f.k} label={f.label} icon={f.icon as any} value={form[f.k] ?? ""} keyboardType="decimal-pad" onChangeText={t => setForm(x => ({ ...x, [f.k]: t }))} />
          ))}
          <NeuField label="بيانات التحويل للعملاء (بنكك…)" icon="card-outline" value={form.bank_info ?? ""} multiline onChangeText={t => setForm(x => ({ ...x, bank_info: t }))}
            placeholder={"بنك الخرطوم — بنكك\nرقم الحساب: …\nالاسم: …"} />
          <Text style={u.meta}>مثال: منتج بـ100 ريال ← العميل يدفع {fmt(sample.total_sdg)} ج.س ({fmt(sample.total_sar, 2)} ر.س)</Text>
          <NeuButton label="حفظ الإعدادات" icon="save-outline" onPress={save} loading={saving} />
        </NeuRaised>

        <NeuRaised radius={20} style={u.card}>
          <View style={[u.row, { justifyContent: "space-between" }]}>
            <Text style={u.section}>سياسة الخدمة</Text>
            <TouchableOpacity onPress={() => setPreview(p => !p)}><Text style={[u.meta, { color: ACCENT }]}>{preview ? "تعديل" : "معاينة"}</Text></TouchableOpacity>
          </View>
          <Text style={u.meta}>اكتب «## » قبل عنوان القسم و«- » قبل كل بند. أي تعديل يُلزم العملاء بالموافقة من جديد على الطلبات الجديدة، والطلبات السابقة تبقى على النسخة التي وافقوا عليها.</Text>
          {preview ? <PolicyView text={form.policy ?? ""} /> : (
            <NeuField label="نص السياسة" icon="document-text-outline" value={form.policy ?? ""} multiline onChangeText={t => setForm(x => ({ ...x, policy: t }))} inputStyle={{ minHeight: 260, textAlignVertical: "top" }} />
          )}
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <SmallBtn label="حفظ السياسة" icon="save-outline" filled onPress={save} disabled={saving} />
            <SmallBtn label="استعادة النص الافتراضي" icon="refresh" color="#946B00" onPress={async () => {
              if (!(await confirmAction("استعادة السياسة الافتراضية", "سيُستبدل نصك الحالي بالسياسة الافتراضية. متابعة؟", "استعادة"))) return;
              try { const r = await sheinApi.saveSettings(token, { policy: "" }); setData(d => d && { ...d, settings: r.settings }); setForm(f => ({ ...f, policy: r.settings.policy })); } catch (e: any) { notify("خطأ", e?.message); }
            }} />
          </View>
        </NeuRaised>

        <NeuRaised radius={20} style={u.card}>
          <Text style={u.section}>فريق الخدمة</Text>
          <View style={{ flexDirection: "row-reverse", gap: 6 }}>
            {(Object.keys(ROLE_LABEL) as SheinRole[]).map(r => (
              <TouchableOpacity key={r} onPress={() => setRole(r)} style={[st.state, role === r && { borderColor: ACCENT, backgroundColor: ACCENT + "12" }]}>
                <Text style={[st.stateText, role === r && { color: ACCENT }]}>{ROLE_LABEL[r]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <NeuField label="رقم هاتف العضو (حسابه في التطبيق)" icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <SmallBtn label={`إضافة كـ${ROLE_LABEL[role]}`} icon="person-add" filled onPress={addAgent} disabled={phone.replace(/\D/g, "").length < 9 && toLatinDigits(phone).replace(/\D/g, "").length < 9} />
          {data.agents.length === 0 ? <Text style={u.meta}>لا يوجد أعضاء بعد — أضف مدقق دفع ووكيلاً في السعودية ووكيلاً في الحصاحيصا.</Text> : data.agents.map(a => (
            <View key={`${a.user_id}-${a.role}`} style={st.agent}>
              <Ionicons name={a.role === "verifier" ? "shield-checkmark" : a.role === "saudi" ? "airplane" : "bicycle"} size={18} color={ACCENT} />
              <View style={{ flex: 1 }}>
                <Text style={st.agentName}>{a.name}</Text>
                <Text style={u.meta}>{ROLE_LABEL[a.role]}{a.phone ? ` · ${a.phone}` : ""}</Text>
              </View>
              <TouchableOpacity onPress={() => removeAgent(a)} accessibilityLabel={`إزالة ${a.name}`}><Ionicons name="trash-outline" size={18} color="#B42323" /></TouchableOpacity>
            </View>
          ))}
        </NeuRaised>

        <Text style={u.section}>{filter ? STATUS_META[filter].label : "أحدث الطلبات"} ({data.orders.length})</Text>
        {data.orders.length === 0 ? <Empty icon="bag-outline" text="لا توجد طلبات" /> : data.orders.map(o => (
          <OrderCard key={o.id} o={o} showCustomer footer={["pending_payment_verification", "paid_and_processing", "purchased_saudi"].includes(o.status)
            ? <SmallBtn label="إلغاء إداري" icon="close-outline" color="#B42323" onPress={() => cancel(o)} /> : undefined} />
        ))}
      </ScrollView>
    </Shell>
  );
}

const st = StyleSheet.create({
  state: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 14, borderWidth: 1.4, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  stateText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  stats: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  stat: { width: "31.5%", flexGrow: 1, alignItems: "center", gap: 2, paddingVertical: 10, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1.4, borderColor: Colors.divider },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 20 },
  statL: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted },
  warn: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#FFF7E0", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#F7D76A" },
  agent: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  agentName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
});
