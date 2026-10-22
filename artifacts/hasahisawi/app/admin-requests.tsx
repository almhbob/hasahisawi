// مركز الطلبات — صندوق موحّد للإدارة: كل طلب جديد يظهر هنا لحظة وصوله،
// مع مراجعة مباشرة للأنواع التي لم تكن لها لوحة (المتاجر، ركن المرأة، الطلبات العامة).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Linking, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import ModernHeader from "@/components/ui/ModernHeader";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { confirmAction, notify } from "@/lib/xplatform";
import { setAdminUnread } from "@/lib/admin-alerts-store";
import type { AdminAlert } from "@/components/AdminAlertsWatcher";

type Tab = "feed" | "stores" | "women" | "general";

const SCREEN_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  lawyers: "briefcase-outline", institutions: "business-outline", women: "flower-outline", stores: "storefront-outline",
  transport: "car-outline", travel: "bus-outline", unions: "people-outline", education: "school-outline",
  partnerships: "git-network-outline", zawajil: "heart-outline", ads: "megaphone-outline", requests: "document-text-outline",
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
  const [lastSeen, setLastSeen] = useState(0);
  const [stores, setStores] = useState<any[]>([]);
  const [women, setWomen] = useState<any[]>([]);
  const [general, setGeneral] = useState<any[]>([]);

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
        setAlerts(d.alerts || []); setLastSeen(Number(d.last_seen_id) || 0);
        if (d.latest_id) { await call("/api/admin/alerts/seen", { method: "POST", body: JSON.stringify({ last_id: d.latest_id }) }).catch(() => {}); setAdminUnread(0); }
      } else if (tab === "stores") setStores(await call("/api/admin/stores"));
      else if (tab === "women") setWomen(await call("/api/admin/women/join-requests"));
      else { const d = await call("/api/admin/join-requests"); setGeneral(d.requests || []); }
    } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); }
  }, [tab, call, isStaff]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const review = async (kind: "store" | "women" | "general", id: number, status: string, label: string) => {
    const ok = await confirmAction(label, "هل تريد تأكيد هذا الإجراء؟ سيصل إشعار لصاحب الطلب عند توفّره.", label, status === "rejected" || status === "suspended");
    if (!ok) return;
    try {
      if (kind === "store") await call(`/api/admin/stores/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      else if (kind === "women") await call(`/api/admin/women/join-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      else await call(`/api/admin/join-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (e: any) { notify("تعذّر التنفيذ", e?.message); }
  };

  const tabs = useMemo(() => ([
    { key: "feed" as const, label: "الأحدث", icon: "notifications-outline" as const },
    { key: "stores" as const, label: "المتاجر", icon: "storefront-outline" as const },
    ...(isAdmin ? [{ key: "women" as const, label: "ركن المرأة", icon: "flower-outline" as const }] : []),
    { key: "general" as const, label: "طلبات عامة", icon: "document-text-outline" as const },
  ]), [isAdmin]);

  if (!isStaff) {
    return (
      <View style={s.root}>
        <ModernHeader title="مركز الطلبات" showBack onBack={() => router.back()} />
        <View style={s.empty}><Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} /><Text style={s.emptyText}>هذه الصفحة للإدارة فقط</Text></View>
      </View>
    );
  }

  const data: any[] = tab === "feed" ? alerts : tab === "stores" ? stores : tab === "women" ? women : general;

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
            {item.status !== "active" && <Act label="اعتماد" color="#00966A" icon="checkmark-circle-outline" onPress={() => review("store", item.id, "active", "اعتماد المتجر")} />}
            {item.status === "pending" && <Act label="رفض" color="#D93636" icon="close-circle-outline" onPress={() => review("store", item.id, "rejected", "رفض الطلب")} />}
            {item.status === "active" && <Act label="إيقاف" color="#6B7280" icon="pause-circle-outline" onPress={() => review("store", item.id, "suspended", "إيقاف المتجر")} />}
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
        keyExtractor={(i) => `${tab}-${i.id}`}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
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
  tabOn: { backgroundColor: "#fff" },
  tabText: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: "#fff" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "#E6ECE9" },
  cardNew: { borderColor: Colors.accent, backgroundColor: "#FFFCF2" },
  row: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primarySoft, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 19 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  time: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted },
  actions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 10 },
  act: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  actText: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  pill: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 12, borderWidth: 1 },
  pillText: { fontFamily: "Cairo_700Bold", fontSize: 10.5 },
  empty: { alignItems: "center", gap: 10, paddingTop: 60 },
  emptyText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
});
