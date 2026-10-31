// إدارة التطوع: المهام، اعتماد الإنجاز، طلبات البطاقة، وإعدادات السعر.
// متاحة للأدمن ولمن مُنح صلاحية قسم «التطوع». تعديل السعر للأدمن فقط.
import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Switch, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { volunteerApi, TASK_CATEGORIES, fmtDate, type VolunteerTask } from "@/lib/volunteer";
import { confirmAction, notify } from "@/lib/xplatform";
import RtlScrollRow from "@/components/ui/RtlScrollRow";

type Tab = "tasks" | "cards" | "settings";
type Signup = Awaited<ReturnType<typeof volunteerApi.signups>>[number];
type CardReq = Awaited<ReturnType<typeof volunteerApi.cards>>[number];

const EMPTY = { title: "", description: "", category: "social", location: "", points: "20", slots: "", organizer: "", starts_at: "" };

export default function VolunteerAdmin() {
  const insets = useSafeAreaInsets();
  const { token, user, isLoading: authLoading } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("tasks");
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [cards, setCards] = useState<CardReq[]>([]);
  const [cfg, setCfg] = useState<{ price: string; priceVisible: boolean; months: string; paymentInfo: string; currency: string } | null>(null);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    // ننتظر جلسة الدخول؛ الطلب بدون رمز يُرفض فيظهر «غير مصرح» خطأً
    if (!token) {
      if (!authLoading) { setForbidden(true); setLoading(false); }
      return;
    }
    try {
      const [t, c, st] = await Promise.all([
        volunteerApi.tasks(token, "all"),
        volunteerApi.cards(token, "pending"),
        volunteerApi.settings(token),
      ]);
      setTasks(t);
      setCards(c);
      setForbidden(false);
      setCfg({ price: String(st.price), priceVisible: st.priceVisible, months: String(st.months), paymentInfo: st.paymentInfo, currency: st.currency });
    } catch (e: any) {
      if (/مصرح/.test(e?.message || "")) setForbidden(true);
      else notify("تعذّر التحميل", e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, authLoading]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openSignups = async (taskId: number) => {
    if (openTask === taskId) { setOpenTask(null); return; }
    setOpenTask(taskId);
    setSignups([]);
    try { setSignups(await volunteerApi.signups(token, taskId)); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
  };

  const saveTask = async () => {
    if (!form) return;
    if (form.title.trim().length < 3) { notify("عنوان المهمة", "اكتب عنواناً واضحاً للمهمة."); return; }
    try {
      await volunteerApi.createTask(token, {
        title: form.title, description: form.description, category: form.category, location: form.location,
        points: Number(form.points) || 0, slots: form.slots ? Number(form.slots) : null, organizer: form.organizer,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      } as any);
      setForm(null);
      load();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };

  const setStatus = async (t: VolunteerTask, status: VolunteerTask["status"]) => {
    try { await volunteerApi.updateTask(token, t.id, { status }); load(); } catch (e: any) { notify("تعذّر التنفيذ", e?.message); }
  };

  const removeTask = async (t: VolunteerTask) => {
    if (!(await confirmAction("حذف المهمة؟", `«${t.title}» — النقاط الممنوحة سابقاً تبقى للمتطوعين.`, "حذف", true))) return;
    try { await volunteerApi.deleteTask(token, t.id); load(); } catch (e: any) { notify("تعذّر الحذف", e?.message); }
  };

  const review = async (sg: Signup, action: "complete" | "reject") => {
    try {
      await volunteerApi.review(token, sg.id, action);
      if (openTask) setSignups(await volunteerApi.signups(token, openTask));
    } catch (e: any) { notify("تعذّر التنفيذ", e?.message); }
  };

  const reviewCard = async (c: CardReq, action: "approve" | "reject") => {
    if (action === "approve" && !(await confirmAction("اعتماد البطاقة؟", `تأكد من استلام ${c.amount} — مرجع: ${c.payment_ref}`, "اعتماد"))) return;
    try { await volunteerApi.reviewCard(token, c.id, action); load(); } catch (e: any) { notify("تعذّر التنفيذ", e?.message); }
  };

  const saveCfg = async () => {
    if (!cfg) return;
    try {
      await volunteerApi.saveSettings(token, {
        price: Number(cfg.price) || 0, priceVisible: cfg.priceVisible, months: Number(cfg.months) || 12,
        paymentInfo: cfg.paymentInfo, currency: cfg.currency,
      });
      notify("تم الحفظ", cfg.priceVisible && Number(cfg.price) > 0 ? "البطاقة الآن برسوم، وتُفعَّل بعد تأكيد الدفع." : "البطاقة الآن مجانية وتُصدر فوراً.");
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/volunteer" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>إدارة التطوع</Text>
        <View style={{ width: 44 }} />
      </View>

      {forbidden ? (
        <View style={s.empty}><Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} /><Text style={s.muted}>هذه الصفحة للأدمن ولمن مُنح صلاحية قسم التطوع.</Text></View>
      ) : loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : (
        <>
          <View style={s.tabs}>
            {([["tasks", "المهام"], ["cards", `طلبات البطاقة${cards.length ? ` (${cards.length})` : ""}`], ["settings", "الإعدادات"]] as const).map(([k, l]) => (
              <TouchableOpacity key={k} style={[s.tab, tab === k && s.tabOn]} onPress={() => setTab(k)}>
                <Text style={[s.tabText, tab === k && { color: Colors.onColor }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
            keyboardShouldPersistTaps="handled"
          >
            {tab === "tasks" && (
              <>
                {form ? (
                  <View style={s.card}>
                    <Text style={s.cardTitle}>مهمة جديدة</Text>
                    <Field label="العنوان" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
                    <Field label="الوصف" value={form.description} onChange={(v) => setForm({ ...form, description: v })} multiline />
                    <Text style={s.label}>التصنيف</Text>
                    <RtlScrollRow contentContainerStyle={{ gap: 8 }}>
                      {Object.entries(TASK_CATEGORIES).map(([k, c]) => (
                        <TouchableOpacity key={k} style={[s.chip, form.category === k && s.chipOn]} onPress={() => setForm({ ...form, category: k })}>
                          <Text style={[s.chipText, form.category === k && { color: Colors.onColor }]}>{c.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </RtlScrollRow>
                    <Field label="المكان" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
                    <Field label="الجهة المنظِّمة" value={form.organizer} onChange={(v) => setForm({ ...form, organizer: v })} />
                    <Field label="التاريخ (مثال 2026-11-15)" value={form.starts_at} onChange={(v) => setForm({ ...form, starts_at: v })} />
                    <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                      <View style={{ flex: 1 }}><Field label="النقاط" value={form.points} onChange={(v) => setForm({ ...form, points: v.replace(/\D/g, "") })} numeric /></View>
                      <View style={{ flex: 1 }}><Field label="عدد المقاعد (اختياري)" value={form.slots} onChange={(v) => setForm({ ...form, slots: v.replace(/\D/g, "") })} numeric /></View>
                    </View>
                    <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                      <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={saveTask}><Text style={s.btnText}>نشر المهمة</Text></TouchableOpacity>
                      <TouchableOpacity style={[s.btnGhost, { flex: 1 }]} onPress={() => setForm(null)}><Text style={s.btnGhostText}>إلغاء</Text></TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={s.btn} onPress={() => setForm({ ...EMPTY })}>
                    <Ionicons name="add" size={20} color={Colors.onColor} />
                    <Text style={s.btnText}>إضافة مهمة تطوعية</Text>
                  </TouchableOpacity>
                )}

                {tasks.map((t) => (
                  <View key={t.id} style={s.card}>
                    <View style={s.rowBetween}>
                      <Text style={[s.cardTitle, { flex: 1 }]} numberOfLines={2}>{t.title}</Text>
                      <Text style={[s.status, t.status === "open" ? s.statusOpen : null]}>
                        {t.status === "open" ? "مفتوحة" : t.status === "closed" ? "مغلقة" : "منتهية"}
                      </Text>
                    </View>
                    <Text style={s.muted}>{t.points} نقطة · {t.joined_count}{t.slots ? `/${t.slots}` : ""} متطوع · {fmtDate(t.starts_at)}</Text>
                    <View style={s.actions}>
                      <Small icon="people-outline" label={openTask === t.id ? "إخفاء المتطوعين" : "المتطوعون والاعتماد"} onPress={() => openSignups(t.id)} />
                      {t.status === "open"
                        ? <Small icon="lock-closed-outline" label="إغلاق التسجيل" onPress={() => setStatus(t, "closed")} />
                        : <Small icon="lock-open-outline" label="فتح التسجيل" onPress={() => setStatus(t, "open")} />}
                      <Small icon="trash-outline" label="حذف" danger onPress={() => removeTask(t)} />
                    </View>
                    {openTask === t.id && (
                      <View style={{ gap: 8 }}>
                        {signups.length === 0 ? <Text style={s.muted}>لا يوجد متطوعون بعد.</Text> : signups.map((sg) => (
                          <View key={sg.id} style={s.signup}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.name}>{sg.name}</Text>
                              {sg.phone ? <Text style={s.muted}>{sg.phone}</Text> : null}
                            </View>
                            {sg.status === "completed" ? (
                              <Text style={[s.status, s.statusOpen]}>+{sg.points_awarded}</Text>
                            ) : sg.status === "rejected" ? (
                              <Text style={[s.status, { color: Colors.danger }]}>لم يُعتمد</Text>
                            ) : (
                              <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                                <TouchableOpacity style={s.okBtn} onPress={() => review(sg, "complete")} accessibilityLabel={`اعتماد إنجاز ${sg.name}`}>
                                  <Ionicons name="checkmark" size={18} color={Colors.onColor} />
                                </TouchableOpacity>
                                <TouchableOpacity style={s.noBtn} onPress={() => review(sg, "reject")} accessibilityLabel={`رفض ${sg.name}`}>
                                  <Ionicons name="close" size={18} color={Colors.danger} />
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}

            {tab === "cards" && (cards.length === 0 ? <Text style={[s.muted, { textAlign: "center", marginTop: 30 }]}>لا توجد طلبات بانتظار المراجعة.</Text> : cards.map((c) => (
              <View key={c.id} style={s.card}>
                <Text style={s.cardTitle}>{c.name} · {c.kind === "renew" ? "تجديد" : "بطاقة جديدة"}</Text>
                <Text style={s.muted}>المبلغ: {c.amount} · مرجع الدفع: {c.payment_ref} · {c.card_no}</Text>
                {c.phone ? <Text style={s.muted}>{c.phone}</Text> : null}
                <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                  <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={() => reviewCard(c, "approve")}><Text style={s.btnText}>اعتماد وتفعيل</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.btnGhost, { flex: 1 }]} onPress={() => reviewCard(c, "reject")}><Text style={[s.btnGhostText, { color: Colors.danger }]}>رفض</Text></TouchableOpacity>
                </View>
              </View>
            )))}

            {tab === "settings" && cfg && (
              <View style={s.card}>
                <Text style={s.cardTitle}>رسوم بطاقة المتطوع</Text>
                {!isAdmin && <Text style={s.muted}>تعديل السعر للأدمن فقط.</Text>}
                <View style={s.switchRow}>
                  <View style={{ width: 56, alignItems: "center", direction: "ltr" }}>
                  <Switch value={cfg.priceVisible} onValueChange={(v) => setCfg({ ...cfg, priceVisible: v })} disabled={!isAdmin} trackColor={{ true: Colors.primary, false: Colors.border }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>إظهار السعر وطلب الدفع</Text>
                    <Text style={s.muted}>عند الإخفاء تصبح البطاقة مجانية وتُصدر فوراً لكل من أنجز مهمة.</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                  <View style={{ flex: 2 }}><Field label="السعر" value={cfg.price} onChange={(v) => setCfg({ ...cfg, price: v.replace(/[^\d.]/g, "") })} numeric editable={isAdmin} /></View>
                  <View style={{ flex: 1 }}><Field label="العملة" value={cfg.currency} onChange={(v) => setCfg({ ...cfg, currency: v })} editable={isAdmin} /></View>
                </View>
                <Field label="مدة الصلاحية (بالأشهر)" value={cfg.months} onChange={(v) => setCfg({ ...cfg, months: v.replace(/\D/g, "") })} numeric editable={isAdmin} />
                <Field label="طريقة الدفع (تظهر للمتطوع)" value={cfg.paymentInfo} onChange={(v) => setCfg({ ...cfg, paymentInfo: v })} multiline editable={isAdmin} />
                {isAdmin && <TouchableOpacity style={s.btn} onPress={saveCfg}><Text style={s.btnText}>حفظ الإعدادات</Text></TouchableOpacity>}
              </View>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function Field({ label, value, onChange, multiline, numeric, editable = true }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; numeric?: boolean; editable?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { height: 90, textAlignVertical: "top", paddingTop: 10 }, !editable && { opacity: 0.6 }]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={numeric ? "numeric" : "default"}
        textAlign="right"
        editable={editable}
        placeholderTextColor={Colors.textMuted}
      />
    </View>
  );
}

function Small({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={s.small} onPress={onPress}>
      <Ionicons name={icon} size={15} color={danger ? Colors.danger : Colors.primary} />
      <Text style={[s.smallText, danger && { color: Colors.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text },
  tabs: { flexDirection: "row-reverse", marginHorizontal: 16, padding: 4, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  tab: { flex: 1, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: Colors.primary },
  tabText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  rowBetween: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  status: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textMuted, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, backgroundColor: Colors.bg, overflow: "hidden" },
  statusOpen: { color: Colors.primary, backgroundColor: Colors.primarySoft },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  actions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  small: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 36, borderRadius: 10, backgroundColor: Colors.bg },
  smallText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },
  signup: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: Colors.bg },
  name: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right" },
  okBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  noBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: Colors.danger, alignItems: "center", justifyContent: "center" },
  btn: { height: 48, borderRadius: 14, backgroundColor: Colors.primary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.onColor },
  btnGhost: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  btnGhostText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textSecondary },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  input: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.text, backgroundColor: Colors.bg },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  empty: { alignItems: "center", gap: 10, paddingTop: 60, paddingHorizontal: 30 },
});
