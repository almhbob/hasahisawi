// مركز الطلبات — صندوق موحّد للإدارة: كل طلب جديد يظهر هنا لحظة وصوله،
// مع مراجعة مباشرة للأنواع التي لم تكن لها لوحة (المتاجر، ركن المرأة، الطلبات العامة).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Linking, RefreshControl, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import ModernHeader from "@/components/ui/ModernHeader";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { confirmAction, notify } from "@/lib/xplatform";
import { setAdminUnread } from "@/lib/admin-alerts-store";
import type { AdminAlert } from "@/components/AdminAlertsWatcher";

type Tab = "feed" | "stores" | "women" | "general" | "verify" | "medical";

const SCREEN_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  designers: "color-palette-outline", writers: "id-card-outline", srcs: "medkit-outline", volunteer: "hand-left-outline", ithraa: "library-outline", verify: "shield-checkmark-outline", contractors: "construct-outline", edu_inst: "school-outline",
  lawyers: "briefcase-outline", institutions: "business-outline", women: "flower-outline", stores: "storefront-outline",
  transport: "car-outline", travel: "bus-outline", unions: "people-outline", education: "school-outline",
  partnerships: "git-network-outline", zawajil: "heart-outline", ads: "megaphone-outline", requests: "document-text-outline",
};

// كل نوع طلب يفتح شاشة مراجعته بالضبط (كانت معظمها تفتح لوحة الإدارة العامة فلا يجد المدير الطلب)
const SCREEN_ROUTE: Record<string, { path: string; params?: Record<string, string>; label: string }> = {
  lawyers: { path: "/admin", params: { tab: "lawyers_admin" }, label: "طلبات المحامين" },
  institutions: { path: "/admin", params: { tab: "join_requests" }, label: "انضمام المؤسسات" },
  travel: { path: "/admin", params: { tab: "join_requests" }, label: "وكالات السفر" },
  unions: { path: "/admin", params: { tab: "join_requests" }, label: "طلبات الاتحادات" },
  education: { path: "/admin", params: { tab: "join_requests" }, label: "طلبات التعليم" },
  partnerships: { path: "/admin", params: { tab: "partners" }, label: "بوابة الشركاء" },
  transport: { path: "/admin", params: { tab: "transport" }, label: "مشوارك علينا" },
  zawajil: { path: "/admin", params: { tab: "zawajil" }, label: "زواجل" },
  ads: { path: "/admin", params: { tab: "ads" }, label: "الإعلانات" },
  designers: { path: "/admin", params: { tab: "designers_admin" }, label: "المصممون" },
  writers: { path: "/writers-members-admin", label: "عضويات الكُتّاب" },
  srcs: { path: "/red-crescent-admin", label: "الهلال الأحمر" },
  volunteer: { path: "/volunteer-admin", label: "التطوع" },
  ithraa: { path: "/ithraa-admin", label: "إشراف إثراء" },
  cv: { path: "/(tabs)/cv-builder", label: "قوالب السيرة المميزة" },
  contractors: { path: "/contractors-admin", label: "شركات المقاولات" },
  edu_inst: { path: "/edu-inst-admin", label: "المؤسسات التعليمية" },
};

const STORE_TYPE_AR: Record<string, string> = {
  restaurant: "مطعم", cafe: "كافتيريا", boutique: "بوتيك", grocery: "بقالة", pharmacy: "صيدلية",
  sweets: "حلويات", electronics: "إلكترونيات", general: "عام",
};
const STATUS_AR: Record<string, { t: string; c: string }> = {
  pending: { t: "قيد المراجعة", c: "#B78200" }, new: { t: "جديد", c: "#B78200" }, duplicate: { t: "مكرّر", c: "#6B7280" },
  active: { t: "مفعّل", c: "#00966A" }, approved: { t: "مقبول", c: "#00966A" }, contacted: { t: "تم التواصل", c: "#1D66D4" },
  rejected: { t: "مرفوض", c: "#D93636" }, suspended: { t: "موقوف", c: "#6B7280" },
};

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return new Date(iso).toLocaleDateString("ar-SD", { day: "numeric", month: "short" });
}

function Pill({ status }: { status: string }) {
  const st = STATUS_AR[status] ?? { t: status, c: "#6B7280" };
  return <View style={[s.pill, { backgroundColor: st.c + "1A", borderColor: st.c + "55" }]}><Text style={[s.pillText, { color: st.c }]}>{st.t}</Text></View>;
}

function Act({ label, color, icon, onPress }: { label: string; color: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.act, { backgroundColor: color + "14", borderColor: color + "40", opacity: pressed ? 0.7 : 1 }]}>
      <Ionicons name={icon} size={14} color={color} /><Text style={[s.actText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export default function AdminRequestsScreen() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";
  const isStaff = isAdmin || user?.role === "moderator";
  const [tab, setTab] = useState<Tab>("feed");
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [olderDone, setOlderDone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const [stores, setStores] = useState<any[]>([]);
  const [women, setWomen] = useState<any[]>([]);
  const [general, setGeneral] = useState<any[]>([]);
  const [verifs, setVerifs] = useState<any[]>([]);
  const [medStaff, setMedStaff] = useState<any[]>([]);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || "تعذّر تنفيذ العملية");
    return d;
  }, [token]);

  const load = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    try {
      if (tab === "feed") {
        const d = await call("/api/admin/alerts?after=0&limit=100");
        setAlerts(d.alerts || []); setLastSeen(Number(d.last_seen_id) || 0); setOlderDone((d.alerts || []).length < 100);
        if (d.latest_id) { await call("/api/admin/alerts/seen", { method: "POST", body: JSON.stringify({ last_id: d.latest_id }) }).catch(() => {}); setAdminUnread(0); }
      } else if (tab === "stores") setStores(await call("/api/admin/stores"));
      else if (tab === "women") {
        // طلبات خدمات ركن المرأة + طلبات فتح متاجر ركن المرأة (كانت لا تظهر هنا)
        const [reqs, shops] = await Promise.all([
          call("/api/admin/women/join-requests"),
          call("/api/admin/women/stores").catch(() => []),
        ]);
        const shopRows = (Array.isArray(shops) ? shops : []).map((x: any) => ({ ...x, _kind: "wstore" }));
        const all = [...shopRows, ...(Array.isArray(reqs) ? reqs : [])];
        all.sort((a: any, b: any) => Number(["new", "pending"].includes(b.status)) - Number(["new", "pending"].includes(a.status)) || String(b.created_at).localeCompare(String(a.created_at)));
        setWomen(all);
      }
      else if (tab === "verify") { const d = await call("/api/admin/verification-requests?status=pending"); setVerifs(d.requests || []); }
      else if (tab === "medical") { const d = await call("/api/admin/medical-staff"); setMedStaff(d.staff || []); }
      else { const d = await call("/api/admin/join-requests"); setGeneral(d.requests || []); }
    } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); }
  }, [tab, call, isStaff]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const review = async (kind: "store" | "women" | "general" | "wstore", id: number, status: string, label: string) => {
    const ok = await confirmAction(label, "هل تريد تأكيد هذا الإجراء؟ سيصل إشعار لصاحب الطلب عند توفّره.", label, status === "rejected" || status === "suspended");
    if (!ok) return;
    try {
      let d: any = null;
      if (kind === "store") d = await call(`/api/admin/stores/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      else if (kind === "wstore") d = await call(`/api/admin/women/stores/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      else if (kind === "women") d = await call(`/api/admin/women/join-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      else d = await call(`/api/admin/join-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      const where = d?.published || (kind === "store" && status === "active" ? "المتجر ظاهر الآن في قسم المتاجر" : kind === "wstore" && status === "approved" ? "المتجر ظاهر الآن في ركن المرأة ← المتاجر" : null);
      if (where) notify("تم ✅", where);
      load();
    } catch (e: any) { notify("تعذّر التنفيذ", e?.message); }
  };

  const reviewStaff = async (item: any, status: "approved" | "rejected") => {
    const ok = await confirmAction(status === "approved" ? "اعتماد الكادر الطبي" : "رفض الطلب",
      status === "approved" ? `سيظهر «${item.name}» فوراً في «الأخصائيون» بالقسم الطبي ويُبلَّغ بالاعتماد.` : "سيُخفى من «الأخصائيون» ويُبلَّغ بإمكانية تعديل بياناته وإعادة الإرسال.",
      status === "approved" ? "اعتماد ونشر" : "رفض", status === "rejected");
    if (!ok) return;
    try {
      const d = await call(`/api/admin/medical-staff/${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (d?.published) notify("تم ✅", d.published);
      load();
    } catch (e: any) { notify("تعذّر", e?.message || "حاول مرة أخرى"); }
  };
  const reviewVerif = async (id: number, status: "approved" | "rejected") => {
    const ok = await confirmAction(status === "approved" ? "توثيق الحساب" : "رفض التوثيق", status === "approved" ? "ستظهر شارة «موثوق» بجانب اسم المستخدم في كل التطبيق." : "سيصل إشعار للمستخدم بإمكانية إعادة المحاولة.", status === "approved" ? "توثيق" : "رفض", status === "rejected");
    if (!ok) return;
    try {
      await call(`/api/admin/verification-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status, admin_note: status === "rejected" ? "المستند غير واضح أو غير مطابق، أعد المحاولة بصورة أوضح" : undefined }) });
      if (status === "approved") notify("تم ✅", "أصبح الحساب موثوقاً");
      load();
    } catch (e: any) { notify("تعذّر التنفيذ", e?.message); }
  };

  const tabs = useMemo(() => ([
    { key: "feed" as const, label: "الأحدث", icon: "notifications-outline" as const },
    { key: "stores" as const, label: "المتاجر", icon: "storefront-outline" as const },
    ...(isAdmin ? [{ key: "women" as const, label: "ركن المرأة", icon: "flower-outline" as const }] : []),
    { key: "general" as const, label: "طلبات عامة", icon: "document-text-outline" as const },
    { key: "medical" as const, label: "الكوادر الطبية", icon: "medkit-outline" as const },
    { key: "verify" as const, label: "التوثيق", icon: "shield-checkmark-outline" as const },
  ]), [isAdmin]);

  if (!isStaff) {
    return (
      <View style={s.root}>
        <ModernHeader title="مركز الطلبات" showBack onBack={() => router.back()} />
        <View style={s.empty}><Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} /><Text style={s.emptyText}>هذه الصفحة للإدارة فقط</Text></View>
      </View>
    );
  }

  const data: any[] = tab === "feed" ? alerts : tab === "stores" ? stores : tab === "women" ? women : tab === "verify" ? verifs : tab === "medical" ? medStaff : general;
  const VKIND: Record<string, string> = { identity: "توثيق هوية", professional: "توثيق مهني", business: "نشاط تجاري", public_figure: "شخصية عامة" };

  const renderItem = ({ item }: { item: any }) => {
    if (tab === "feed") {
      const a = item as AdminAlert;
      const isNew = Number(a.id) > lastSeen;
      return (
        <View style={[s.card, isNew && s.cardNew]}>
          <View style={s.row}>
            <View style={[s.icon, isNew && { backgroundColor: Colors.accent }]}><Ionicons name={SCREEN_ICON[a.screen] ?? "document-text-outline"} size={18} color={isNew ? "#fff" : Colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{a.title}</Text>
              <Text style={s.body} numberOfLines={2}>{a.body}</Text>
            </View>
            <Text style={s.time}>{ago(a.created_at)}</Text>
          </View>
          <View style={s.actions}>
            {!!a.phone && <Act label="اتصال" color="#00966A" icon="call-outline" onPress={() => Linking.openURL(`tel:${a.phone}`)} />}
            {a.screen === "stores" ? <Act label="مراجعة المتجر" color="#1D66D4" icon="open-outline" onPress={() => setTab("stores")} />
              : a.screen === "women" && isAdmin ? <Act label="مراجعة" color="#1D66D4" icon="open-outline" onPress={() => setTab("women")} />
              : a.screen === "requests" ? <Act label="مراجعة" color="#1D66D4" icon="open-outline" onPress={() => setTab("general")} />
              : a.screen === "medical_staff" ? <Act label="مراجعة الكادر" color="#00966A" icon="medkit-outline" onPress={() => setTab("medical")} />
              : a.screen === "verify" ? <Act label="مراجعة التوثيق" color="#1D66D4" icon="open-outline" onPress={() => setTab("verify")} />
              : SCREEN_ROUTE[a.screen] ? <Act label={`مراجعة · ${SCREEN_ROUTE[a.screen].label}`} color="#1D66D4" icon="open-outline" onPress={() => router.push({ pathname: SCREEN_ROUTE[a.screen].path, params: SCREEN_ROUTE[a.screen].params } as any)} />
              : <Act label="فتح لوحة الإدارة" color="#1D66D4" icon="open-outline" onPress={() => router.push("/admin" as any)} />}
          </View>
        </View>
      );
    }
    if (tab === "stores") {
      return (
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.icon}><Ionicons name="storefront-outline" size={18} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{item.name}{item.women_only ? " · نسائي" : ""}</Text>
              <Text style={s.body}>{STORE_TYPE_AR[item.type] ?? item.type} · {item.owner_name || "—"} · {item.phone}</Text>
              {!!item.address && <Text style={s.meta}>{item.address}</Text>}
            </View>
            <Pill status={item.status} />
          </View>
          <View style={s.actions}>
            <Act label="اتصال" color="#00966A" icon="call-outline" onPress={() => Linking.openURL(`tel:${item.phone}`)} />
            {user?.role === "admin" && <Act label="إدارة المتجر" color="#1D66D4" icon="construct-outline" onPress={() => router.push({ pathname: "/store-portal", params: { store: String(item.id) } } as any)} />}
            {item.status !== "active" && <Act label="اعتماد" color="#00966A" icon="checkmark-circle-outline" onPress={() => review("store", item.id, "active", "اعتماد المتجر")} />}
            {item.status === "pending" && <Act label="رفض" color="#D93636" icon="close-circle-outline" onPress={() => review("store", item.id, "rejected", "رفض الطلب")} />}
            {item.status === "active" && <Act label="إيقاف" color={Colors.textSecondary} icon="pause-circle-outline" onPress={() => review("store", item.id, "suspended", "إيقاف المتجر")} />}
          </View>
        </View>
      );
    }
    if (tab === "medical") {
      const live = item.status === "approved" && item.specialist_id;
      return (
        <View style={s.card}>
          <View style={s.row}>
            <View style={[s.icon, { backgroundColor: "#00966A1A" }]}><Ionicons name="medkit-outline" size={18} color="#00966A" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{item.name}</Text>
              <Text style={s.body}>{item.type_label}{item.specialty ? ` · ${item.specialty}` : ""}{item.facility_name ? ` · ${item.facility_name}` : ""}</Text>
              {!!item.license_number && <Text style={s.meta}>رقم الترخيص: {item.license_number}</Text>}
              {!!item.phone && <Text style={s.meta}>{item.phone}</Text>}
              <Text style={s.meta}>{live ? "ظاهر في «الأخصائيون» بالقسم الطبي" : item.status === "approved" ? "معتمد — أعد الاعتماد لنشره" : ago(item.created_at)}</Text>
            </View>
            <Pill status={item.status} />
          </View>
          <View style={s.actions}>
            {!!item.phone && <Act label="اتصال" color="#00966A" icon="call-outline" onPress={() => Linking.openURL(`tel:${item.phone}`)} />}
            <Act label="الملف" color="#006B4A" icon="person-outline" onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(item.user_id) } })} />
            {!live && <Act label={item.status === "approved" ? "نشر في الأخصائيين" : "اعتماد ونشر"} color="#00966A" icon="checkmark-circle-outline" onPress={() => reviewStaff(item, "approved")} />}
            {item.status !== "rejected" && <Act label={item.status === "approved" ? "إيقاف" : "رفض"} color="#D93636" icon="close-circle-outline" onPress={() => reviewStaff(item, "rejected")} />}
          </View>
        </View>
      );
    }
    if (tab === "verify") {
      return (
        <View style={s.card}>
          <View style={s.row}>
            <View style={[s.icon, { backgroundColor: "#1D9BF01A" }]}><Ionicons name="shield-checkmark-outline" size={18} color="#1D9BF0" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{item.name}</Text>
              <Text style={s.body}>{VKIND[item.kind] || item.kind}{item.phone ? ` · ${item.phone}` : ""}</Text>
              {!!item.headline && <Text style={s.meta}>{item.headline}</Text>}
              {!!item.note && <Text style={s.meta} numberOfLines={3}>«{item.note}»</Text>}
              <Text style={s.meta}>{ago(item.created_at)}</Text>
            </View>
            {!!item.doc_url && (
              <Pressable onPress={() => Linking.openURL(item.doc_url)}>
                <Image source={{ uri: item.doc_url }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: Colors.divider }} />
              </Pressable>
            )}
          </View>
          <View style={s.actions}>
            <Act label="الملف" color="#1D66D4" icon="person-outline" onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(item.user_id) } })} />
            {!!item.doc_url && <Act label="المستند" color={Colors.textSecondary} icon="image-outline" onPress={() => Linking.openURL(item.doc_url)} />}
            <Act label="توثيق" color="#00966A" icon="checkmark-circle-outline" onPress={() => reviewVerif(item.id, "approved")} />
            <Act label="رفض" color="#D93636" icon="close-circle-outline" onPress={() => reviewVerif(item.id, "rejected")} />
          </View>
        </View>
      );
    }
    if (item._kind === "wstore") {
      return (
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.icon}><Ionicons name="bag-handle-outline" size={18} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{item.name} · متجر نسائي</Text>
              <Text style={s.body}>{item.owner_name || "—"} · {item.phone}{item.product_count ? ` · ${item.product_count} منتج` : ""}</Text>
              {!!item.address && <Text style={s.meta}>{item.address}</Text>}
              <Text style={s.meta}>{ago(item.created_at)}</Text>
            </View>
            <Pill status={item.status} />
          </View>
          <View style={s.actions}>
            <Act label="اتصال" color="#00966A" icon="call-outline" onPress={() => Linking.openURL(`tel:${item.phone}`)} />
            {item.status !== "approved" && <Act label="اعتماد" color="#00966A" icon="checkmark-circle-outline" onPress={() => review("wstore", item.id, "approved", "اعتماد المتجر")} />}
            {item.status === "pending" && <Act label="رفض" color="#D93636" icon="close-circle-outline" onPress={() => review("wstore", item.id, "rejected", "رفض الطلب")} />}
            {item.status === "approved" && <Act label="إيقاف" color={Colors.textSecondary} icon="pause-circle-outline" onPress={() => review("wstore", item.id, "suspended", "إيقاف المتجر")} />}
          </View>
        </View>
      );
    }
    const isWomen = tab === "women";
    const name = isWomen ? item.owner_name : item.applicant_name;
    const sub = isWomen ? item.service_type : (item.entity_name || item.request_type);
    return (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.icon}><Ionicons name={isWomen ? "flower-outline" : "document-text-outline"} size={18} color={Colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{name}</Text>
            <Text style={s.body}>{sub} · {item.phone}</Text>
            {!!(item.description || item.payload?.description) && <Text style={s.meta} numberOfLines={3}>{item.description || item.payload?.description}</Text>}
            <Text style={s.meta}>{ago(item.created_at)}</Text>
          </View>
          <Pill status={item.status} />
        </View>
        <View style={s.actions}>
          <Act label="اتصال" color="#00966A" icon="call-outline" onPress={() => Linking.openURL(`tel:${item.phone}`)} />
          {isWomen && item.status !== "contacted" && item.status !== "approved" && <Act label="تم التواصل" color="#1D66D4" icon="chatbubble-ellipses-outline" onPress={() => review("women", item.id, "contacted", "تم التواصل")} />}
          {item.status !== "approved" && <Act label="قبول" color="#00966A" icon="checkmark-circle-outline" onPress={() => review(isWomen ? "women" : "general", item.id, "approved", "قبول الطلب")} />}
          {item.status !== "rejected" && <Act label="رفض" color="#D93636" icon="close-circle-outline" onPress={() => review(isWomen ? "women" : "general", item.id, "rejected", "رفض الطلب")} />}
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <ModernHeader title="مركز الطلبات" subtitle="كل طلب جديد يصلك هنا فوراً" icon="notifications-outline" showBack onBack={() => router.back()}>
        <View style={s.tabs}>
          {tabs.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tab, tab === t.key && s.tabOn]}>
              <Ionicons name={t.icon} size={15} color={tab === t.key ? Colors.primary : "#fff"} />
              <Text style={[s.tabText, tab === t.key && { color: Colors.primary }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </ModernHeader>
      <FlatList
        data={data}
        keyExtractor={(i) => `${tab}-${i._kind || "r"}-${i.id}`}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListFooterComponent={tab === "feed" && alerts.length > 0 && !olderDone ? (
          <Pressable onPress={async () => {
            setLoadingOlder(true);
            try {
              const minId = Math.min(...alerts.map((x) => Number(x.id)));
              const d = await call(`/api/admin/alerts?before=${minId}&limit=100`);
              const more = d.alerts || [];
              setAlerts((xs) => [...xs, ...more]); if (more.length < 100) setOlderDone(true);
            } catch { /* */ } finally { setLoadingOlder(false); }
          }} style={{ alignSelf: "center", marginTop: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg }}>
            {loadingOlder ? <ActivityIndicator color={Colors.primary} /> : <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary }}>عرض الطلبات الأقدم</Text>}
          </Pressable>
        ) : null}
        ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} /> : (
          <View style={s.empty}><Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.primary} /><Text style={s.emptyText}>لا توجد طلبات هنا حالياً</Text></View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  tabs: { flexDirection: "row-reverse", gap: 6, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 14, padding: 4 },
  tab: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 10 },
  tabOn: { backgroundColor: Colors.cardBg },
  tabText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "#E6ECE9" },
  cardNew: { borderColor: Colors.accent, backgroundColor: "#FFFCF2" },
  row: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primarySoft, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 19 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  time: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  actions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 10 },
  act: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  actText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  pill: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 12, borderWidth: 1 },
  pillText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  empty: { alignItems: "center", gap: 10, paddingTop: 60 },
  emptyText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
});
