// إدارة زواجل — تفتح بحساب الإدارة أو لمن مُنح إدارة القسم (بدون حساب منفصل)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator,
  RefreshControl, Switch, Linking, Platform, Pressable, KeyboardAvoidingView, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import ModernHeader from "@/components/ui/ModernHeader";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { notify, confirmAction } from "@/lib/xplatform";
import { uploadFile } from "@/lib/firebase/storage";

const PINK = "#D6367A";
const GRAD = ["#7A1E4B", "#B8336A", "#D6367A"] as const;

const STATUS: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending_review:         { label: "بانتظار المراجعة", color: "#D97706", icon: "time-outline" },
  modification_requested: { label: "طُلب تعديل",       color: "#7C3AED", icon: "create-outline" },
  approved:               { label: "مقبول",            color: "#16A34A", icon: "checkmark-circle-outline" },
  preparing:              { label: "قيد التجهيز",      color: "#0284C7", icon: "cube-outline" },
  sending:                { label: "في الطريق",        color: "#9333EA", icon: "bicycle-outline" },
  completed:              { label: "تم التسليم",       color: "#059669", icon: "gift-outline" },
  rejected:               { label: "مرفوض",            color: "#DC2626", icon: "close-circle-outline" },
  returned:               { label: "مُعاد",            color: Colors.textSecondary, icon: "return-up-back-outline" },
};
const FILTERS = ["all", "pending_review", "approved", "preparing", "sending", "completed", "rejected"];
const SERVICES: Record<string, { label: string; emoji: string }> = {
  hamasat_itab: { label: "همسات عتاب", emoji: "💌" }, nifaj: { label: "نفاج", emoji: "💡" },
  shoubash: { label: "شوبش", emoji: "💍" }, tabrikat: { label: "تبريكات", emoji: "🎉" }, salamat: { label: "سلامات", emoji: "🌿" },
};
const OCCASIONS: Record<string, string> = { engagement: "خطوبة", graduation: "تخرج", excellence: "تفوق / نجاح", newborn: "مولود جديد", other: "أخرى" };
const GIFTS: Record<string, string> = { none: "بدون هدية", from_store: "من متجر زواجل", money: "مبلغ مادي", external: "هدية خارجية" };
const ROLES: Record<string, string> = {
  zaajil: "زاجل — مندوب توصيل", krowan: "كروان — مؤدي صوتي", khattaat: "خطاط", designer: "مصمم",
  gift_store: "متجر هدايا", service_girl: "خدمة — بنات", service_boy: "خدمة — أولاد",
};

type Tab = "orders" | "products" | "apps" | "managers";

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "الآن"; if (m < 60) return `قبل ${m} د`;
  const h = Math.round(m / 60); if (h < 24) return `قبل ${h} س`;
  return new Date(iso).toLocaleDateString("ar", { day: "numeric", month: "short" });
}
const money = (n: any) => `${Number(n || 0).toLocaleString("en")} ج.س`;

export default function ZawajilManager() {
  const insets = useSafeAreaInsets();
  const { token, isGuest, user } = useAuth();
  const [access, setAccess] = useState<{ allowed: boolean; is_admin: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>("orders");
  const [stats, setStats] = useState<any>(null);

  const call = useCallback(async (path: string, init?: { method?: string; body?: unknown }) => {
    const r = await fetch(`${getApiUrl()}/api${path}`, {
      method: init?.method || "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || `خطأ ${r.status}`);
    return d;
  }, [token]);

  const loadAccess = useCallback(async () => {
    if (!token || isGuest) { setAccess({ allowed: false, is_admin: false }); return; }
    try { setAccess(await call("/zawajil-admin/access")); } catch { setAccess({ allowed: false, is_admin: false }); }
  }, [token, isGuest, call]);
  const loadStats = useCallback(async () => { try { setStats(await call("/zawajil-admin/dashboard")); } catch {} }, [call]);

  useFocusEffect(useCallback(() => { loadAccess(); }, [loadAccess]));
  useEffect(() => { if (access?.allowed) loadStats(); }, [access?.allowed, loadStats]);

  if (!access) {
    return <View style={st.root}><ModernHeader title="إدارة زواجل" showBack gradient={GRAD} /><ActivityIndicator style={{ marginTop: 60 }} color={PINK} size="large" /></View>;
  }
  if (!access.allowed) {
    return (
      <View style={st.root}>
        <ModernHeader title="إدارة زواجل" subtitle="بوابة إدارة الطلبات والهدايا" icon="gift-outline" showBack gradient={GRAD} />
        <View style={st.center}>
          <View style={st.lockIcon}><Ionicons name={isGuest || !token ? "log-in-outline" : "lock-closed-outline"} size={40} color={PINK} /></View>
          <Text style={st.centerTitle}>{isGuest || !token ? "سجّل الدخول أولاً" : "لا تملك صلاحية إدارة زواجل"}</Text>
          <Text style={st.centerText}>
            {isGuest || !token
              ? "تفتح إدارة زواجل بحساب الإدارة أو بحساب مشرف مُنح إدارة القسم."
              : `يمكن لمدير التطبيق منحك إدارة القسم من: إدارة زواجل ← المدراء، باستخدام رقم هاتفك${user?.phone ? ` (${user.phone})` : ""}.`}
          </Text>
          <TouchableOpacity style={st.primaryBtn} onPress={() => router.back()}><Text style={st.primaryTxt}>رجوع</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  const o = stats?.orders || {};
  const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; badge?: number }[] = [
    { key: "orders", label: "الطلبات", icon: "receipt-outline", badge: o.pending },
    { key: "products", label: "المتجر", icon: "pricetags-outline" },
    { key: "apps", label: "الانضمام", icon: "people-outline", badge: stats?.applications?.pending },
    ...(access.is_admin ? [{ key: "managers" as Tab, label: "المدراء", icon: "shield-checkmark-outline" as const }] : []),
  ];

  return (
    <View style={st.root}>
      <ModernHeader title="إدارة زواجل" subtitle={access.is_admin ? "حساب الإدارة" : "مدير القسم"} icon="gift-outline" showBack gradient={GRAD}>
        <View style={st.statsRow}>
          <Stat n={o.pending ?? "–"} label="بانتظارك" />
          <Stat n={o.active ?? "–"} label="قيد التنفيذ" />
          <Stat n={o.completed ?? "–"} label="مكتملة" />
          <Stat n={o.today ?? "–"} label="اليوم" />
        </View>
      </ModernHeader>
      <View style={st.tabs}>
        {tabs.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[st.tab, tab === t.key && st.tabOn]}>
            <Ionicons name={t.icon} size={16} color={tab === t.key ? "#fff" : Colors.textSecondary} />
            <Text style={[st.tabTxt, tab === t.key && { color: "#fff" }]}>{t.label}</Text>
            {t.badge ? <View style={st.badge}><Text style={st.badgeTxt}>{t.badge}</Text></View> : null}
          </Pressable>
        ))}
      </View>
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        {tab === "orders" && <OrdersTab call={call} onChange={loadStats} />}
        {tab === "products" && <ProductsTab call={call} />}
        {tab === "apps" && <AppsTab call={call} onChange={loadStats} />}
        {tab === "managers" && access.is_admin && <ManagersTab call={call} />}
      </View>
    </View>
  );
}

function Stat({ n, label }: { n: any; label: string }) {
  return <View style={st.stat}><Text style={st.statN}>{n}</Text><Text style={st.statL}>{label}</Text></View>;
}

// ── نافذة إدخال عامة ────────────────────────────────────────────
type PromptCfg = { title: string; fields: { key: string; label: string; placeholder?: string; numeric?: boolean; multiline?: boolean; value?: string }[]; confirm: string; color?: string; onSubmit: (v: Record<string, string>) => Promise<void> };
function PromptModal({ cfg, onClose }: { cfg: PromptCfg | null; onClose: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (cfg) setVals(Object.fromEntries(cfg.fields.map((f) => [f.key, f.value || ""]))); }, [cfg]);
  if (!cfg) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.overlay}>
        <View style={st.prompt}>
          <Text style={st.promptTitle}>{cfg.title}</Text>
          {cfg.fields.map((f) => (
            <View key={f.key} style={{ marginBottom: 10 }}>
              <Text style={st.fLabel}>{f.label}</Text>
              <TextInput value={vals[f.key] || ""} onChangeText={(t) => setVals((v) => ({ ...v, [f.key]: t }))} placeholder={f.placeholder} placeholderTextColor={Colors.textSubtle}
                keyboardType={f.numeric ? "numeric" : "default"} multiline={f.multiline} style={[st.input, f.multiline && { minHeight: 80, textAlignVertical: "top" }]} textAlign="right" />
            </View>
          ))}
          <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 4 }}>
            <TouchableOpacity disabled={busy} style={[st.primaryBtn, { flex: 1, backgroundColor: cfg.color || PINK }]} onPress={async () => { setBusy(true); try { await cfg.onSubmit(vals); onClose(); } catch (e: any) { notify("تعذّر التنفيذ", e?.message); } finally { setBusy(false); } }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryTxt}>{cfg.confirm}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={st.ghostBtn} onPress={onClose}><Text style={st.ghostTxt}>إلغاء</Text></TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type Call = (path: string, init?: { method?: string; body?: unknown }) => Promise<any>;

// ── الطلبات ──────────────────────────────────────────────────────
function OrdersTab({ call, onChange }: { call: Call; onChange: () => void }) {
  const [filter, setFilter] = useState("pending_review");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [prompt, setPrompt] = useState<PromptCfg | null>(null);
  const [couriers, setCouriers] = useState<any[] | null>(null);
  const [assignFor, setAssignFor] = useState<any>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await call(`/admin/zawajil/orders?status=${filter}`); setOrders(d.orders || []); }
    catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); }
  }, [call, filter]);
  useEffect(() => { load(); }, [load]);

  const done = () => { load(); onChange(); };
  const review = (o: any, action: "approve" | "reject" | "request_modification") => {
    if (action === "approve") setPrompt({ title: `قبول الطلب ${o.order_number}`, confirm: "قبول وإشعار المرسل", color: "#16A34A",
      fields: [{ key: "cost", label: "التكلفة التقديرية (ج.س)", numeric: true, value: o.estimated_cost ? String(Number(o.estimated_cost)) : "" }, { key: "notes", label: "ملاحظة للمرسل (اختياري)", multiline: true }],
      onSubmit: async (v) => { await call(`/admin/zawajil/orders/${o.id}/review`, { method: "PATCH", body: { action, estimated_cost: v.cost ? Number(v.cost) : undefined, admin_notes: v.notes || undefined } }); done(); } });
    if (action === "reject") setPrompt({ title: "رفض الطلب", confirm: "رفض", color: "#DC2626", fields: [{ key: "r", label: "سبب الرفض", multiline: true }],
      onSubmit: async (v) => { await call(`/admin/zawajil/orders/${o.id}/review`, { method: "PATCH", body: { action, rejection_reason: v.r || "لم يستوفِ الطلب الشروط" } }); done(); } });
    if (action === "request_modification") setPrompt({ title: "طلب تعديل من المرسل", confirm: "إرسال", color: "#7C3AED", fields: [{ key: "m", label: "ما المطلوب تعديله؟", multiline: true }],
      onSubmit: async (v) => { await call(`/admin/zawajil/orders/${o.id}/review`, { method: "PATCH", body: { action, modification_request: v.m } }); done(); } });
  };
  const setStatus = async (o: any, status: string, label: string) => {
    if (!(await confirmAction(label, `تحديث الطلب ${o.order_number}؟ سيصل إشعار للمرسل.`, "تأكيد"))) return;
    try { await call(`/admin/zawajil/orders/${o.id}/status`, { method: "PATCH", body: { status } }); done(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const complete = (o: any) => setPrompt({ title: "تأكيد التسليم", confirm: "تم التسليم", color: "#059669", fields: [{ key: "n", label: "ملاحظات التسليم (اختياري)", multiline: true }],
    onSubmit: async (v) => { await call(`/admin/zawajil/orders/${o.id}/complete-delivery`, { method: "PATCH", body: { delivery_notes: v.n || undefined } }); await call(`/admin/zawajil/orders/${o.id}/status`, { method: "PATCH", body: { status: "completed" } }).catch(() => {}); done(); } });
  const openAssign = async (o: any) => {
    setAssignFor(o);
    if (!couriers) { try { const d = await call("/admin/zawajil/zaajileen"); setCouriers(d.zaajileen || []); } catch { setCouriers([]); } }
  };
  const assign = async (c: any) => {
    const o = assignFor; setAssignFor(null);
    try { await call(`/admin/zawajil/orders/${o.id}/assign`, { method: "PATCH", body: { zaajil_id: c.id, zaajil_name: c.full_name, zaajil_phone: c.phone } }); done(); notify("تم", `أُسند الطلب إلى ${c.full_name}`); }
    catch (e: any) { notify("تعذّر", e?.message); }
  };

  const shown = useMemo(() => {
    const t = q.trim(); if (!t) return orders;
    return orders.filter((o) => [o.order_number, o.recipient_name, o.sender_name, o.sender_phone, o.recipient_phone].some((x) => String(x || "").includes(t)));
  }, [orders, q]);

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filters}>
        {FILTERS.map((f) => {
          const on = filter === f; const c = f === "all" ? PINK : STATUS[f].color;
          return (
            <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[st.chip, on && { backgroundColor: c, borderColor: c }]}>
              <Text style={[st.chipTxt, on && { color: "#fff" }]}>{f === "all" ? "الكل" : STATUS[f].label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={st.searchBox}>
        <Ionicons name="search" size={16} color={Colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="ابحث برقم الطلب أو الاسم أو الهاتف" placeholderTextColor={Colors.textSubtle} style={st.searchInput} textAlign="right" />
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[PINK]} />}>
        {!loading && shown.length === 0 ? <Empty icon="file-tray-outline" text="لا توجد طلبات هنا" /> : null}
        {shown.map((o) => {
          const s = STATUS[o.status] || { label: o.status, color: Colors.textSecondary, icon: "ellipse-outline" };
          const sv = SERVICES[o.service_type] || { label: o.service_type, emoji: "🎁" };
          const isOpen = open === o.id;
          return (
            <View key={o.id} style={st.card}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => setOpen(isOpen ? null : o.id)} style={st.cardHead}>
                <View style={[st.svcIcon, { backgroundColor: s.color + "15" }]}><Text style={{ fontSize: 22 }}>{sv.emoji}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={st.rowR}>
                    <Text style={st.cardTitle}>{sv.label} ← {o.recipient_name}</Text>
                  </View>
                  <Text style={st.meta}>{o.order_number} · {ago(o.created_at)}{Number(o.estimated_cost) ? ` · ${money(o.estimated_cost)}` : ""}</Text>
                </View>
                <View style={[st.pill, { backgroundColor: s.color + "15", borderColor: s.color + "40" }]}>
                  <Ionicons name={s.icon} size={12} color={s.color} /><Text style={[st.pillTxt, { color: s.color }]}>{s.label}</Text>
                </View>
              </TouchableOpacity>
              {isOpen && (
                <View style={st.details}>
                  <Line icon="person-outline" label="المرسل" value={o.sender_anonymous ? `${o.sender_name || "—"} (مجهول للمستلم)` : o.sender_name || "—"} phone={o.sender_phone} />
                  <Line icon="gift-outline" label="المستلم" value={o.recipient_name} phone={o.recipient_phone} />
                  {o.recipient_address ? <Line icon="location-outline" label="العنوان" value={`${o.recipient_address}${o.delivery_location === "outside_city" ? " (خارج المدينة)" : ""}`} /> : null}
                  {o.occasion_type ? <Line icon="sparkles-outline" label="المناسبة" value={OCCASIONS[o.occasion_type] || o.occasion_type} /> : null}
                  <Line icon="cube-outline" label="الهدية" value={`${GIFTS[o.gift_type] || o.gift_type || "—"}${o.gift_product_name ? ` · ${o.gift_product_name}` : ""}${Number(o.gift_money_amount) ? ` · ${money(o.gift_money_amount)}` : ""}${o.gift_external_desc ? ` · ${o.gift_external_desc}` : ""}`} />
                  {o.voice_presentation ? <Line icon="mic-outline" label="تقديم صوتي" value="مطلوب (كروان)" /> : null}
                  {o.message_text || o.message_by_us ? <View style={st.msgBox}><Text style={st.msgLabel}>{o.message_by_us ? "الرسالة (يكتبها فريق زواجل)" : "نص الرسالة"}</Text>{o.message_text ? <Text style={st.msgTxt}>{o.message_text}</Text> : null}</View> : null}
                  {Array.isArray(o.shoubash_guests) && o.shoubash_guests.length ? (
                    <View style={st.msgBox}><Text style={st.msgLabel}>مشاركو الشوبش ({o.shoubash_guests.length})</Text>
                      {o.shoubash_guests.map((g: any) => <Text key={g.id} style={st.msgTxt}>• {g.guest_name}{g.gift_desc ? ` — ${g.gift_desc}` : ""}{Number(g.gift_amount) ? ` — ${money(g.gift_amount)}` : ""}</Text>)}
                    </View>) : null}
                  {o.assigned_zaajil_name ? <Line icon="bicycle-outline" label="الزاجل" value={o.assigned_zaajil_name} phone={o.assigned_zaajil_phone} /> : null}
                  {o.modification_request ? <Line icon="create-outline" label="التعديل المطلوب" value={o.modification_request} /> : null}
                  {o.rejection_reason ? <Line icon="close-circle-outline" label="سبب الرفض" value={o.rejection_reason} /> : null}
                  {o.admin_notes ? <Line icon="document-text-outline" label="ملاحظات" value={o.admin_notes} /> : null}
                  <View style={st.actions}>
                    {(o.status === "pending_review" || o.status === "modification_requested") && <>
                      <Act label="قبول" icon="checkmark-circle" color="#16A34A" onPress={() => review(o, "approve")} />
                      <Act label="طلب تعديل" icon="create" color="#7C3AED" onPress={() => review(o, "request_modification")} />
                      <Act label="رفض" icon="close-circle" color="#DC2626" onPress={() => review(o, "reject")} />
                    </>}
                    {o.status === "approved" && <>
                      <Act label="إسناد لزاجل" icon="bicycle" color="#0284C7" onPress={() => openAssign(o)} />
                      <Act label="بدء التجهيز" icon="cube" color="#0284C7" onPress={() => setStatus(o, "preparing", "بدء التجهيز")} />
                    </>}
                    {o.status === "preparing" && <>
                      {!o.assigned_zaajil_name && <Act label="إسناد لزاجل" icon="bicycle" color="#0284C7" onPress={() => openAssign(o)} />}
                      <Act label="خرج للتوصيل" icon="navigate" color="#9333EA" onPress={() => setStatus(o, "sending", "خرج للتوصيل")} />
                    </>}
                    {o.status === "sending" && <>
                      <Act label="تم التسليم" icon="gift" color="#059669" onPress={() => complete(o)} />
                      <Act label="مُعاد" icon="return-up-back" color={Colors.textSecondary} onPress={() => setStatus(o, "returned", "إعادة الطلب")} />
                    </>}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      <PromptModal cfg={prompt} onClose={() => setPrompt(null)} />
      <Modal visible={!!assignFor} transparent animationType="slide" onRequestClose={() => setAssignFor(null)}>
        <Pressable style={st.overlayBottom} onPress={() => setAssignFor(null)}>
          <Pressable style={st.sheet} onPress={() => {}}>
            <Text style={st.promptTitle}>اختر الزاجل لتوصيل {assignFor?.order_number}</Text>
            {couriers === null ? <ActivityIndicator color={PINK} /> : couriers.length === 0 ? (
              <Text style={st.centerText}>لا يوجد زواجل معتمدون بعد — اعتمدهم من تبويب «الانضمام».</Text>
            ) : couriers.map((c) => (
              <TouchableOpacity key={c.id} style={st.li} onPress={() => assign(c)}>
                <Ionicons name="bicycle" size={20} color="#0284C7" />
                <View style={{ flex: 1 }}><Text style={st.liName}>{c.full_name}</Text><Text style={st.meta}>{[c.phone, c.neighborhood].filter(Boolean).join(" · ")}</Text></View>
                <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Line({ icon, label, value, phone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; phone?: string | null }) {
  return (
    <View style={st.line}>
      <Ionicons name={icon} size={15} color={Colors.textMuted} />
      <Text style={st.lineLabel}>{label}:</Text>
      <Text style={st.lineVal}>{value}</Text>
      {phone ? (
        <View style={{ flexDirection: "row-reverse", gap: 6 }}>
          <TouchableOpacity hitSlop={6} onPress={() => Linking.openURL(`tel:${phone}`)}><Ionicons name="call" size={17} color="#16A34A" /></TouchableOpacity>
          <TouchableOpacity hitSlop={6} onPress={() => Linking.openURL(`https://wa.me/${String(phone).replace(/[^\d]/g, "").replace(/^0/, "249")}`)}><Ionicons name="logo-whatsapp" size={17} color="#25D366" /></TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
function Act({ label, icon, color, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[st.act, { backgroundColor: color + "12", borderColor: color + "40" }]}>
      <Ionicons name={icon} size={15} color={color} /><Text style={[st.actTxt, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}
function Empty({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return <View style={{ alignItems: "center", paddingTop: 50, gap: 8 }}><Ionicons name={icon} size={46} color={Colors.textSubtle} /><Text style={st.centerText}>{text}</Text></View>;
}

// ── منتجات المتجر ────────────────────────────────────────────────
function ProductsTab({ call }: { call: Call }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await call("/admin/zawajil/products"); setItems(Array.isArray(d) ? d : []); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); }
  }, [call]);
  useEffect(() => { load(); }, [load]);
  const toggle = async (p: any) => {
    setItems((l) => l.map((x) => x.id === p.id ? { ...x, is_available: !p.is_available } : x));
    try { await call(`/admin/zawajil/products/${p.id}`, { method: "PATCH", body: { is_available: !p.is_available } }); } catch (e: any) { notify("تعذّر", e?.message); load(); }
  };
  const del = async (p: any) => {
    if (!(await confirmAction("حذف المنتج", `حذف «${p.name}»؟`, "حذف", true))) return;
    try { await call(`/admin/zawajil/products/${p.id}`, { method: "DELETE" }); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 90 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[PINK]} />}>
        {!loading && items.length === 0 ? <Empty icon="pricetags-outline" text="لا توجد منتجات — أضف أول منتج" /> : null}
        {items.map((p) => (
          <View key={p.id} style={[st.card, st.cardHead, !p.is_available && { opacity: 0.6 }]}>
            {p.image_url ? <Image source={{ uri: p.image_url }} style={st.prodImg} /> : <View style={[st.prodImg, { alignItems: "center", justifyContent: "center" }]}><Ionicons name="gift" size={24} color={PINK} /></View>}
            <View style={{ flex: 1 }}>
              <Text style={st.cardTitle}>{p.name}</Text>
              <Text style={st.meta}>{money(p.price)}{p.category && p.category !== "general" ? ` · ${p.category}` : ""}</Text>
            </View>
            <Switch value={!!p.is_available} onValueChange={() => toggle(p)} trackColor={{ true: PINK + "80", false: Colors.divider }} thumbColor={p.is_available ? PINK : "#eee"} />
            <TouchableOpacity hitSlop={8} onPress={() => setEdit(p)}><Ionicons name="create-outline" size={20} color={Colors.textSecondary} /></TouchableOpacity>
            <TouchableOpacity hitSlop={8} onPress={() => del(p)}><Ionicons name="trash-outline" size={20} color="#DC2626" /></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity style={st.fab} onPress={() => setEdit({})}><Ionicons name="add" size={26} color="#fff" /><Text style={st.fabTxt}>منتج</Text></TouchableOpacity>
      <ProductModal item={edit} call={call} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    </>
  );
}

function ProductModal({ item, call, onClose, onSaved }: { item: any | null; call: Call; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", description: "", price: "", category: "", sort_order: "", image_url: "" });
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  useEffect(() => { if (item) setF({ name: item.name || "", description: item.description || "", price: item.price != null ? String(Number(item.price)) : "", category: item.category && item.category !== "general" ? item.category : "", sort_order: item.sort_order ? String(item.sort_order) : "", image_url: item.image_url || "" }); }, [item]);
  if (!item) return null;
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75, allowsEditing: true, aspect: [1, 1] });
    if (r.canceled || !r.assets[0]) return;
    setUp(true);
    try { const url = await uploadFile(`zawajil/products/${Date.now()}.jpg`, r.assets[0].uri, { fileName: "product.jpg", mimeType: "image/jpeg" }); setF((x) => ({ ...x, image_url: url })); }
    catch (e: any) { notify("تعذّر رفع الصورة", e?.message); } finally { setUp(false); }
  };
  const save = async () => {
    if (f.name.trim().length < 2) { notify("الاسم مطلوب"); return; }
    setBusy(true);
    try {
      const body = { name: f.name.trim(), description: f.description.trim() || null, price: Number(f.price) || 0, category: f.category.trim() || "general", sort_order: Number(f.sort_order) || 0, image_url: f.image_url || null };
      if (item.id) await call(`/admin/zawajil/products/${item.id}`, { method: "PATCH", body }); else await call(`/admin/zawajil/products`, { method: "POST", body });
      onSaved();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.overlayBottom}>
        <ScrollView style={st.sheet} contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <Text style={st.promptTitle}>{item.id ? "تعديل المنتج" : "منتج جديد في متجر زواجل"}</Text>
          <TouchableOpacity onPress={pick} style={st.imgPick}>
            {f.image_url ? <Image source={{ uri: f.image_url }} style={{ width: "100%", height: "100%", borderRadius: 14 }} /> : up ? <ActivityIndicator color={PINK} /> : <><Ionicons name="image-outline" size={28} color={PINK} /><Text style={st.ghostTxt}>صورة المنتج</Text></>}
          </TouchableOpacity>
          {([["name", "اسم المنتج", false], ["price", "السعر (ج.س)", true], ["category", "التصنيف (ورد، عطور، شوكولاتة…)", false], ["sort_order", "ترتيب الظهور", true]] as const).map(([k, l, num]) => (
            <View key={k} style={{ marginBottom: 10 }}>
              <Text style={st.fLabel}>{l}</Text>
              <TextInput value={(f as any)[k]} onChangeText={(t) => setF((x) => ({ ...x, [k]: t }))} keyboardType={num ? "numeric" : "default"} style={st.input} textAlign="right" />
            </View>
          ))}
          <Text style={st.fLabel}>الوصف</Text>
          <TextInput value={f.description} onChangeText={(t) => setF((x) => ({ ...x, description: t }))} multiline style={[st.input, { minHeight: 80, textAlignVertical: "top" }]} textAlign="right" />
          <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 14 }}>
            <TouchableOpacity disabled={busy || up} style={[st.primaryBtn, { flex: 1 }]} onPress={save}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryTxt}>حفظ</Text>}</TouchableOpacity>
            <TouchableOpacity style={st.ghostBtn} onPress={onClose}><Text style={st.ghostTxt}>إلغاء</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── طلبات الانضمام (زواجل، كروان، خطاطين…) ───────────────────
function AppsTab({ call, onChange }: { call: Call; onChange: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await call(`/admin/zawajil/applications${role ? `?role=${role}` : ""}`); setItems(d.applications || []); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); }
  }, [call, role]);
  useEffect(() => { load(); }, [load]);
  const setStatus = async (a: any, status: string) => {
    if (!(await confirmAction(status === "approved" ? "اعتماد" : "رفض", `${status === "approved" ? "اعتماد" : "رفض"} طلب ${a.full_name}؟`, "تأكيد", status === "rejected"))) return;
    try { await call(`/admin/zawajil/applications/${a.id}/status`, { method: "PATCH", body: { status } }); load(); onChange(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const SC: Record<string, string> = { pending: "#D97706", approved: "#16A34A", rejected: "#DC2626" };
  const SL: Record<string, string> = { pending: "جديد", approved: "معتمد", rejected: "مرفوض" };
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filters}>
        {[["", "الكل"], ...Object.entries(ROLES)].map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setRole(k)} style={[st.chip, role === k && { backgroundColor: PINK, borderColor: PINK }]}>
            <Text style={[st.chipTxt, role === k && { color: "#fff" }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[PINK]} />}>
        {!loading && items.length === 0 ? <Empty icon="people-outline" text="لا توجد طلبات انضمام" /> : null}
        {items.map((a) => (
          <View key={a.id} style={st.card}>
            <View style={st.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={st.cardTitle}>{a.full_name}</Text>
                <Text style={st.meta}>{ROLES[a.role] || a.role}{a.gender ? ` · ${a.gender === "female" ? "أنثى" : "ذكر"}` : ""}{a.age ? ` · ${a.age} سنة` : ""}{a.neighborhood ? ` · ${a.neighborhood}` : ""} · {ago(a.created_at)}</Text>
              </View>
              <View style={[st.pill, { backgroundColor: (SC[a.status] || "#6B7280") + "15", borderColor: (SC[a.status] || "#6B7280") + "40" }]}><Text style={[st.pillTxt, { color: SC[a.status] || "#6B7280" }]}>{SL[a.status] || a.status}</Text></View>
            </View>
            {a.experience ? <Text style={st.appTxt}>الخبرة: {a.experience}</Text> : null}
            {a.notes ? <Text style={st.appTxt}>ملاحظات: {a.notes}</Text> : null}
            <View style={st.actions}>
              <Act label="اتصال" icon="call" color="#16A34A" onPress={() => Linking.openURL(`tel:${a.phone}`)} />
              {a.samples_url ? <Act label="نماذج الأعمال" icon="images" color="#0284C7" onPress={() => Linking.openURL(a.samples_url)} /> : null}
              {a.status !== "approved" && <Act label="اعتماد" icon="checkmark-circle" color="#16A34A" onPress={() => setStatus(a, "approved")} />}
              {a.status !== "rejected" && <Act label="رفض" icon="close-circle" color="#DC2626" onPress={() => setStatus(a, "rejected")} />}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

// ── المدراء المفوّضون (للإدارة فقط) ─────────────────────────────
function ManagersTab({ call }: { call: Call }) {
  const [managers, setManagers] = useState<any[]>([]);
  const [cands, setCands] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await call("/zawajil-admin/managers"); setManagers(d.managers || []); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); }
  }, [call]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(async () => { try { const d = await call(`/zawajil-admin/candidates?q=${encodeURIComponent(q.trim())}`); setCands(d.users || []); } catch {} }, 350);
    return () => clearTimeout(t);
  }, [q, call]);
  const grant = async (u: any) => {
    if (!(await confirmAction("منح إدارة زواجل", `منح ${u.name} صلاحية إدارة قسم زواجل؟`, "منح"))) return;
    try { await call("/zawajil-admin/managers", { method: "POST", body: { user_id: u.id } }); notify("تم ✅", `أصبح ${u.name} مديراً لزواجل، ووصله إشعار بذلك`); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const revoke = async (u: any) => {
    if (!(await confirmAction("سحب الصلاحية", `سحب إدارة زواجل من ${u.name}؟`, "سحب", true))) return;
    try { await call(`/zawajil-admin/managers/${u.id}`, { method: "DELETE" }); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const ids = new Set(managers.map((m) => m.id));
  const RL: Record<string, string> = { admin: "إدارة", moderator: "مشرف", user: "عضو" };
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[PINK]} />} keyboardShouldPersistTaps="handled">
      <View style={st.infoBox}>
        <Ionicons name="information-circle" size={18} color={PINK} />
        <Text style={st.infoTxt}>حساب الإدارة يدخل دائماً. امنح أي مشرف أو عضو إدارة قسم زواجل ليستقبل الطلبات ويديرها من حسابه العادي.</Text>
      </View>
      <Text style={st.secTitle}>المدراء الحاليون ({managers.length})</Text>
      {managers.length === 0 && !loading ? <Text style={st.centerText}>لم تمنح أحداً بعد.</Text> : null}
      {managers.map((m) => (
        <View key={m.id} style={[st.card, st.cardHead]}>
          <UserAvatar name={m.name} avatarUrl={m.avatar_url} size={40} borderRadius={14} />
          <View style={{ flex: 1 }}><Text style={st.cardTitle}>{m.name}</Text><Text style={st.meta}>{[RL[m.role] || m.role, m.phone].filter(Boolean).join(" · ")}</Text></View>
          <Act label="سحب" icon="remove-circle" color="#DC2626" onPress={() => revoke(m)} />
        </View>
      ))}
      <Text style={[st.secTitle, { marginTop: 8 }]}>إضافة مدير</Text>
      <View style={st.searchBox}>
        <Ionicons name="search" size={16} color={Colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="ابحث بالاسم أو رقم الهاتف (يظهر المشرفون أولاً)" placeholderTextColor={Colors.textSubtle} style={st.searchInput} textAlign="right" />
      </View>
      {cands.filter((u) => !ids.has(u.id) && u.role !== "admin").map((u) => (
        <View key={u.id} style={[st.card, st.cardHead]}>
          <UserAvatar name={u.name} avatarUrl={u.avatar_url} size={40} borderRadius={14} />
          <View style={{ flex: 1 }}><Text style={st.cardTitle}>{u.name}</Text><Text style={st.meta}>{[RL[u.role] || u.role, u.phone].filter(Boolean).join(" · ")}</Text></View>
          <Act label="منح الإدارة" icon="shield-checkmark" color="#16A34A" onPress={() => grant(u)} />
        </View>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 10 },
  lockIcon: { width: 84, height: 84, borderRadius: 28, backgroundColor: PINK + "14", alignItems: "center", justifyContent: "center" },
  centerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "center" },
  centerText: { fontFamily: "Cairo_400Regular", fontSize: 13.5, lineHeight: 22, color: Colors.textSecondary, textAlign: "center" },
  primaryBtn: { backgroundColor: PINK, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  primaryTxt: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#fff" },
  ghostBtn: { height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBg },
  ghostTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  statsRow: { flexDirection: "row-reverse", gap: 8 },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 14, paddingVertical: 8, alignItems: "center" },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#ffffffD0" },
  tabs: { flexDirection: "row-reverse", gap: 6, paddingHorizontal: 12, paddingTop: 12 },
  tab: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, height: 40, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  tabOn: { backgroundColor: PINK, borderColor: PINK },
  tabTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeTxt: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: "#fff" },
  filters: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  chip: { paddingHorizontal: 13, height: 34, borderRadius: 17, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBg, justifyContent: "center" },
  chipTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  searchBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginHorizontal: 12, marginTop: 10, backgroundColor: Colors.cardBg, borderRadius: 13, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textPrimary },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 12 },
  cardHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  svcIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  rowR: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  pillTxt: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  details: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider, gap: 7 },
  line: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  lineLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  lineVal: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  msgBox: { backgroundColor: PINK + "08", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: PINK + "25" },
  msgLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: PINK, textAlign: "right", marginBottom: 2 },
  msgTxt: { fontFamily: "Cairo_400Regular", fontSize: 13.5, lineHeight: 22, color: Colors.textPrimary, textAlign: "right" },
  actions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 6 },
  act: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 11, height: 34, borderRadius: 11, borderWidth: 1 },
  actTxt: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  appTxt: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginTop: 6 },
  prodImg: { width: 54, height: 54, borderRadius: 14, backgroundColor: PINK + "10" },
  fab: { position: "absolute", bottom: 20, left: 20, flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: PINK, paddingHorizontal: 18, height: 50, borderRadius: 25, elevation: 5 },
  fabTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 22 },
  overlayBottom: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  prompt: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 18 },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: "85%" },
  promptTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", marginBottom: 12 },
  fLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.bg, paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 10 : 8, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary },
  imgPick: { height: 130, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: PINK + "60", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 12, backgroundColor: PINK + "06" },
  li: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  liName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  infoBox: { flexDirection: "row-reverse", gap: 8, backgroundColor: PINK + "0C", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: PINK + "25" },
  infoTxt: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 20, color: Colors.textPrimary, textAlign: "right" },
  secTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
});
