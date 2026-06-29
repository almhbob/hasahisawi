import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, ActivityIndicator, Alert,
  TextInput, Pressable, Modal, Image,
  KeyboardAvoidingView, Platform, Linking,
} from "react-native";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { uploadLandmarkImage } from "@/lib/firebase/storage";
import BrandPattern from "@/components/BrandPattern";
import { IMPORTANT_APP_SERVICE_LINKS } from "@/constants/service-links";
import { alertForNewPendingAdminItems, countPendingAdminItems } from "@/lib/attention-alerts";

// ─── Types ──────────────────────────────────────────────────────────────────
type AdminUser = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  role: "user" | "admin" | "moderator";
  neighborhood?: string | null;
  birth_date?: string | null;
  national_id_masked?: string | null;
  created_at: string;
};

type Stats = {
  totals: { total: number; admins: number; moderators: number; members: number };
  byNeighborhood: { neighborhood: string; count: number }[];
  recentUsers: AdminUser[];
  sections?: {
    jobs_active: number; reports_pending: number; missing_lost: number;
    factories_active: number; rentals_active: number; feedback_pending: number;
    ratings_total: number; travel_pending: number;
  };
};

type Tab = "overview" | "members" | "admins" | "moderators" | "landmarks" | "ads" | "communities" | "service_links" | "neighborhoods" | "ai_settings" | "security" | "honored" | "transport" | "updates" | "libraries" | "merchants_admin" | "phone_shops" | "sections_config" | "legal_suggestions" | "sick_leaves" | "admissions" | "zawajil" | "student_union" | "partners" | "lawyers_admin" | "designers_admin" | "join_requests" | "reports_admin" | "missing_admin" | "numbers_admin" | "factories_admin" | "farmers_admin" | "rentals_admin" | "jobs_admin" | "ratings_admin" | "feedback_admin";

type TransportDriver = {
  id: number; name: string; phone: string; vehicle_type: string;
  vehicle_desc: string; plate: string; area: string;
  status: "pending" | "approved" | "rejected"; admin_note: string;
  is_online: boolean; total_trips: number; rating: number; created_at: string;
};
type TransportTrip = {
  id: number; user_name: string; user_phone: string; trip_type: string;
  from_location: string; to_location: string; notes: string;
  from_zone: number | null; to_zone: number | null;
  fare_estimate: number | null; vehicle_preference: string;
  delivery_desc: string | null;
  status: string; driver_name: string | null; driver_id: number | null; driver_phone?: string;
  created_at: string; rating: number | null;
};

type AdRecord = {
  id: number;
  institution_name: string;
  contact_name?: string;
  contact_phone?: string;
  title: string;
  description?: string;
  type: string;
  target_screen: string;
  duration_days: number;
  budget?: string;
  status: "pending" | "active" | "rejected" | "expired";
  admin_note?: string;
  start_date?: string;
  end_date?: string;
  priority: number;
  created_at: string;
  approved_at?: string;
  approved_by_name?: string;
  image_url?: string;
  website_url?: string;
};

type ApiLandmark = { id: number; name: string; sub: string; image_url: string; sort_order: number };
type HonoredFigure = {
  id: number;
  name: string;
  title: string;
  city_role: string;
  photo_url: string;
  tribute: string;
  start_date: string;
  end_date: string;
  is_visible: boolean;
  created_at: string;
};
type NbrItem = { label: string; type: "neighborhood" | "village"; key?: string };
type CommunityRecord = {
  id: number;
  name: string;
  category: string;
  origin?: string;
  description?: string;
  // بيانات ممثل الجهة
  representative_name?: string;
  representative_title?: string;
  representative_phone?: string;
  representative_national_id?: string;
  representative_email?: string;
  // بيانات المؤسسة
  contact_phone?: string;
  members_count?: number;
  neighborhood?: string;
  services?: string;
  services_hidden?: string;
  status: "pending" | "active" | "rejected" | "suspended";
  suspension_reason?: string;
  submitted_by?: number;
  submitted_by_name?: string;
  created_at: string;
};

type AdminServiceRequest = {
  id: number;
  community_id: number;
  community_name: string;
  community_category: string;
  action: "add" | "hide" | "show";
  service_name: string;
  status: "pending" | "approved" | "rejected";
  submitted_by_name?: string;
  created_at: string;
  reviewed_at?: string;
  reviewer_note?: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  admin:     { label: "مدير",  color: "#E05567", icon: "shield"      },
  moderator: { label: "مشرف", color: "#F0A500", icon: "shield-half" },
  user:      { label: "عضو",  color: Colors.primary, icon: "person" },
};

const MODERATOR_SECTIONS = [
  { key: "members",     label: "متابعة الأعضاء",   icon: "people-outline"       as const },
  { key: "communities", label: "موافقات المؤسسات",  icon: "business-outline"     as const },
  { key: "partners_admin", label: "إدارة الشركاء", icon: "briefcase-outline" as const },
  { key: "ads",         label: "الإعلانات",         icon: "megaphone-outline"    as const },
  { key: "landmarks",   label: "المعالم",           icon: "location-outline"     as const },
  { key: "medical",     label: "الطب والصحة",      icon: "medkit-outline"       as const },
  { key: "jobs",        label: "الوظائف",           icon: "briefcase-outline"    as const },
  { key: "social",      label: "المنشورات",         icon: "newspaper-outline"    as const },
  { key: "news",        label: "الأخبار",           icon: "radio-outline"        as const },
  { key: "education",   label: "التعليم",           icon: "school-outline"       as const },
  { key: "business",    label: "التجارة",           icon: "storefront-outline"   as const },
];

const AD_STATUS_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending:  { label: "قيد المراجعة", color: "#F0A500",        icon: "time-outline"        },
  active:   { label: "نشط",          color: Colors.primary,   icon: "checkmark-circle"    },
  rejected: { label: "مرفوض",        color: "#E05567",        icon: "close-circle"        },
  expired:  { label: "منتهي",        color: Colors.textMuted, icon: "ban-outline"         },
};

// ─── CSV Export Helper ────────────────────────────────────────────────────────
function exportToCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) { Alert.alert("لا توجد بيانات", "لا توجد سجلات للتصدير"); return; }
  if (Platform.OS !== "web") { Alert.alert("متاح على الويب فقط", "افتح لوحة الإدارة عبر المتصفح لتحميل الملف"); return; }

  const cols = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v == null ? "" : String(v).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => escape(r[c])).join(","))].join("\n");
  const bom = "﻿"; // BOM for Arabic in Excel
  const blob = new (globalThis as any).Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = (globalThis as any).URL.createObjectURL(blob);
  const a = (globalThis as any).document.createElement("a");
  a.href = url; a.download = filename; a.click();
  (globalThis as any).URL.revokeObjectURL(url);
}

// ─── API Helper ─────────────────────────────────────────────────────────────
function apiFetch(
  path: string,
  token: string | null,
  opts: Parameters<typeof fetch>[1] = {},
  timeoutMs = 30000,
  adminPin?: string,
) {
  const base = getApiUrl();
  if (!base) return Promise.reject(new Error("API not configured"));
  const url = new URL(path, base).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...opts,
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(adminPin ? { "x-admin-pin": adminPin } : {}),
      ...(opts as any).headers,
    },
  }).finally(() => clearTimeout(timer));
}

async function safeJson<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  if (text.trim().startsWith("<")) throw new Error("الخادم غير متاح مؤقتاً");
  if (!text.trim()) throw new Error("الخادم أعاد استجابة فارغة");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("استجابة غير صالحة من الخادم");
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_LABELS[role] ?? ROLE_LABELS.user;
  return (
    <View style={[s.badge, { backgroundColor: meta.color + "22", borderColor: meta.color + "44" }]}>
      <Ionicons name={meta.icon} size={11} color={meta.color} />
      <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function StatCard({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; color: string }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(16)} style={[s.statCard, { borderColor: color + "30" }]}>
      <LinearGradient colors={[color + "18", color + "08"]} style={s.statGrad}>
        <View style={[s.statIcon, { backgroundColor: color + "25" }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <Text style={[s.statValue, { color }]}>{value.toLocaleString("ar-SA")}</Text>
        <Text style={s.statLabel}>{label}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

function ActionButton({ label, color, icon, onPress, disabled, outline }: {
  label: string; color: string; icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void; disabled?: boolean; outline?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        s.actionBtn,
        outline
          ? { backgroundColor: color + "15", borderWidth: 1, borderColor: color + "40" }
          : { backgroundColor: color }
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.78}
    >
      {icon && <Ionicons name={icon} size={16} color={outline ? color : "#fff"} />}
      <Text style={[s.actionBtnTxt, { color: outline ? color : "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Admin Legal Suggestions Tab ─────────────────────────────────────────────
function AdminLegalSuggestionsTab({ token, apiBase }: { token: string; apiBase: string }) {
  const [suggestions, setSuggestions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("pending");

  React.useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/api/admin/legal-form-suggestions?status=${filter}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.suggestions) setSuggestions(d.suggestions); }).catch(() => {}).finally(() => setLoading(false));
  }, [filter]);

  async function review(id: number, status: "approved" | "rejected", notes?: string) {
    await fetch(`${apiBase}/api/admin/legal-form-suggestions/${id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status, admin_notes: notes }),
    });
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }

  const STATUS_COLOR: Record<string, string> = { pending: "#F59E0B", approved: "#10B981", rejected: "#EF4444" };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14 }}>
        {["pending","approved","rejected"].map(s => (
          <TouchableOpacity key={s} onPress={() => setFilter(s)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: filter === s ? STATUS_COLOR[s] : "#FFFFFF0A", alignItems: "center" }}>
            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: filter === s ? "#fff" : "#9CA3AF" }}>
              {s === "pending" ? "معلقة" : s === "approved" ? "مقبولة" : "مرفوضة"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color="#8B5CF6" style={{ marginTop: 40 }} /> : suggestions.length === 0 ? (
        <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد اقتراحات</Text>
      ) : suggestions.map(s => (
        <View key={s.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }}>{s.form_title || `استمارة #${s.form_id}`}</Text>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>{s.lawyer_name}</Text>
          </View>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 18, marginBottom: 10 }}>{s.suggestion_text}</Text>
          {s.status === "pending" && (
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <TouchableOpacity onPress={() => review(s.id, "rejected")}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "#EF444420", alignItems: "center", borderWidth: 1, borderColor: "#EF4444" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#EF4444", fontSize: 13 }}>رفض</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => review(s.id, "approved")}
                style={{ flex: 2, paddingVertical: 10, borderRadius: 10, backgroundColor: "#10B981", alignItems: "center" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#fff", fontSize: 13 }}>اعتماد الاقتراح</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Admin Partners Tab ───────────────────────────────────────────────────────
function AdminPartnersTab({ token, apiBase }: { token: string; apiBase: string }) {
  const [items, setItems]   = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("pending");

  const load = React.useCallback(() => {
    setLoading(true);
    fetch(`${apiBase}/api/admin/external-partnerships?status=${filter}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.partnerships) setItems(d.partnerships); }).catch(() => {}).finally(() => setLoading(false));
  }, [filter, token, apiBase]);

  React.useEffect(() => { load(); }, [load]);

  async function review(id: number, status: "approved" | "rejected") {
    await fetch(`${apiBase}/api/admin/external-partnerships/${id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setItems(prev => prev.filter(p => p.id !== id));
  }

  async function remove(id: number) {
    await fetch(`${apiBase}/api/admin/external-partnerships/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setItems(prev => prev.filter(p => p.id !== id));
  }

  const SC: Record<string, string> = { pending: "#F59E0B", approved: "#10B981", rejected: "#EF4444" };
  const SL: Record<string, string> = { pending: "معلقة", approved: "مقبولة", rejected: "مرفوضة" };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14 }}>
        {["pending", "approved", "rejected"].map(s => (
          <TouchableOpacity key={s} onPress={() => setFilter(s)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: filter === s ? SC[s] : "#FFFFFF0A", alignItems: "center", borderWidth: 1, borderColor: filter === s ? SC[s] : "#FFFFFF10" }}>
            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: filter === s ? "#fff" : "#9CA3AF" }}>{SL[s]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} /> : items.length === 0 ? (
        <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد طلبات شراكة</Text>
      ) : items.map(p => (
        <View key={p.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 16, marginBottom: 14, borderRightWidth: 4, borderRightColor: SC[p.status] ?? "#F97316" }}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, flex: 1, textAlign: "right" }}>{p.org_name}</Text>
            <View style={{ backgroundColor: (SC[p.status] ?? "#888") + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: SC[p.status] ?? "#888" }}>{SL[p.status] ?? p.status}</Text>
            </View>
          </View>
          {p.org_type ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>النوع: {p.org_type}{p.sector ? ` · ${p.sector}` : ""}</Text> : null}
          {(p.city || p.country) ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>{[p.city, p.country].filter(Boolean).join("، ")}</Text> : null}
          {p.cooperation_scope ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 18, marginBottom: 8 }} numberOfLines={2}>{p.cooperation_scope}</Text> : null}
          {p.contact_name ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>المتقدم: {p.contact_name}{p.contact_phone ? ` — ${p.contact_phone}` : ""}</Text> : null}
          {p.created_at ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textDisabled, textAlign: "right", marginBottom: 10 }}>{new Date(p.created_at).toLocaleDateString("ar-EG")}</Text> : null}
          {p.status === "pending" ? (
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <TouchableOpacity onPress={() => review(p.id, "rejected")} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "#EF444420", alignItems: "center", borderWidth: 1, borderColor: "#EF4444" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#EF4444", fontSize: 13 }}>رفض</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => review(p.id, "approved")} style={{ flex: 2, paddingVertical: 10, borderRadius: 10, backgroundColor: "#10B981", alignItems: "center" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#fff", fontSize: 13 }}>قبول الشراكة</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => remove(p.id)} style={{ paddingVertical: 8, borderRadius: 10, backgroundColor: "#EF444415", alignItems: "center", borderWidth: 1, borderColor: "#EF444440" }}>
              <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#EF4444", fontSize: 12 }}>حذف</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Admin Lawyers Tab ────────────────────────────────────────────────────────
function AdminLawyersTab({ token, apiBase }: { token: string; apiBase: string }) {
  const [view, setView]         = React.useState<"apps" | "active">("apps");
  const [apps, setApps]         = React.useState<any[]>([]);
  const [lawyers, setLawyers]   = React.useState<any[]>([]);
  const [loading, setLoading]   = React.useState(true);
  const [filter, setFilter]     = React.useState("pending");

  React.useEffect(() => {
    setLoading(true);
    if (view === "apps") {
      fetch(`${apiBase}/api/admin/lawyer-applications?status=${filter}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setApps(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
    } else {
      fetch(`${apiBase}/api/admin/lawyers`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setLawyers(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [view, filter, token, apiBase]);

  async function approveApp(id: number) {
    await fetch(`${apiBase}/api/admin/lawyer-applications/${id}/approve`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
    setApps(prev => prev.filter(a => a.id !== id));
  }
  async function rejectApp(id: number) {
    await fetch(`${apiBase}/api/admin/lawyer-applications/${id}/reject`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ admin_note: "غير مستوفٍ للشروط" }) });
    setApps(prev => prev.filter(a => a.id !== id));
  }
  async function toggleLawyer(id: number, field: string, val: boolean) {
    await fetch(`${apiBase}/api/admin/lawyers/${id}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ [field]: val }) });
    setLawyers(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l));
  }
  async function deleteLawyer(id: number) {
    await fetch(`${apiBase}/api/admin/lawyers/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setLawyers(prev => prev.filter(l => l.id !== id));
  }

  const SC: Record<string, string> = { pending: "#F59E0B", approved: "#10B981", rejected: "#EF4444" };
  const SL: Record<string, string> = { pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض" };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* View toggle + Export */}
      <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14, alignItems: "center" }}>
        {(["apps", "active"] as const).map(v => (
          <TouchableOpacity key={v} onPress={() => setView(v)} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: view === v ? "#8B5CF6" : "#FFFFFF0A", alignItems: "center", borderWidth: 1, borderColor: view === v ? "#8B5CF6" : "#FFFFFF10" }}>
            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: view === v ? "#fff" : "#9CA3AF" }}>
              {v === "apps" ? "الطلبات" : "المحامون"}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => { const data = view === "apps" ? apps : lawyers; exportToCSV(data.map(x => ({ الاسم: x.full_name||x.name||"", الهاتف: x.phone||"", البريد: x.email||"", التخصص: x.specialization||"", الحالة: x.status||"", التاريخ: x.created_at ? new Date(x.created_at).toLocaleDateString("ar-SA") : "" })), view === "apps" ? "طلبات_المحامين.csv" : "المحامون.csv"); }}
          style={{ paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: "#FFFFFF08", alignItems: "center", borderWidth: 1, borderColor: "#FFFFFF15" }}>
          <Ionicons name="download-outline" size={15} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {view === "apps" && (
        <>
          <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14 }}>
            {["pending", "approved", "rejected"].map(s => (
              <TouchableOpacity key={s} onPress={() => setFilter(s)} style={{ flex: 1, paddingVertical: 7, borderRadius: 10, backgroundColor: filter === s ? SC[s] : "#FFFFFF0A", alignItems: "center" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: filter === s ? "#fff" : "#9CA3AF" }}>{SL[s]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {loading ? <ActivityIndicator color="#8B5CF6" style={{ marginTop: 40 }} /> : apps.length === 0 ? (
            <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد طلبات</Text>
          ) : apps.map(a => (
            <View key={a.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 16, marginBottom: 14, borderRightWidth: 4, borderRightColor: SC[a.status] ?? "#888" }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, flex: 1, textAlign: "right" }}>{a.full_name}</Text>
                <View style={{ backgroundColor: (SC[a.status] ?? "#888") + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: SC[a.status] ?? "#888" }}>{SL[a.status] ?? a.status}</Text>
                </View>
              </View>
              {a.title ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>{a.title}</Text> : null}
              {a.phone ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>{a.phone}</Text> : null}
              {a.specialties ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 4 }} numberOfLines={2}>{a.specialties}</Text> : null}
              {a.status === "pending" && (
                <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 12 }}>
                  <TouchableOpacity onPress={() => rejectApp(a.id)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "#EF444420", alignItems: "center", borderWidth: 1, borderColor: "#EF4444" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#EF4444", fontSize: 13 }}>رفض</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => approveApp(a.id)} style={{ flex: 2, paddingVertical: 10, borderRadius: 10, backgroundColor: "#8B5CF6", alignItems: "center" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#fff", fontSize: 13 }}>قبول وتفعيل</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </>
      )}

      {view === "active" && (
        <>
          {loading ? <ActivityIndicator color="#8B5CF6" style={{ marginTop: 40 }} /> : lawyers.length === 0 ? (
            <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا يوجد محامون مسجلون</Text>
          ) : lawyers.map(l => (
            <View key={l.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 16, marginBottom: 14 }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" }}>{l.full_name}</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>{l.title}{l.plan_name_ar ? ` · ${l.plan_name_ar}` : ""}</Text>
                </View>
                <View style={{ backgroundColor: l.is_active ? "#10B98120" : "#EF444420", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 8 }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: l.is_active ? "#10B981" : "#EF4444" }}>{l.is_active ? "فعّال" : "موقوف"}</Text>
                </View>
              </View>
              {l.phone ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>{l.phone}</Text> : null}
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 12 }}>العقود: {l.contracts_count ?? 0}</Text>
              <View style={{ flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" }}>
                <TouchableOpacity onPress={() => toggleLawyer(l.id, "is_active", !l.is_active)} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: l.is_active ? "#EF444420" : "#10B98120", borderWidth: 1, borderColor: l.is_active ? "#EF4444" : "#10B981" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: l.is_active ? "#EF4444" : "#10B981" }}>{l.is_active ? "إيقاف" : "تفعيل"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggleLawyer(l.id, "is_featured", !l.is_featured)} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: l.is_featured ? "#F59E0B20" : "#FFFFFF0A", borderWidth: 1, borderColor: l.is_featured ? "#F59E0B" : "#FFFFFF10" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: l.is_featured ? "#F59E0B" : "#9CA3AF" }}>{l.is_featured ? "★ مميَّز" : "تمييز"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteLawyer(l.id)} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444440" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#EF4444" }}>حذف</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ─── Admin Designers Tab ──────────────────────────────────────────────────────
function AdminDesignersTab({ token, apiBase }: { token: string; apiBase: string }) {
  const [view, setView]       = React.useState<"members" | "orders">("members");
  const [members, setMembers] = React.useState<any[]>([]);
  const [orders, setOrders]   = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    if (view === "members") {
      fetch(`${apiBase}/api/admin/design-gallery/members`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setMembers(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
    } else {
      fetch(`${apiBase}/api/admin/design-gallery/orders`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setOrders(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [view, token, apiBase]);

  async function updateMemberStatus(id: number, status: string) {
    await fetch(`${apiBase}/api/admin/design-gallery/members/${id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    setMembers(prev => prev.map(m => m.id === id ? { ...m, status } : m));
  }
  async function deleteMember(id: number) {
    await fetch(`${apiBase}/api/admin/design-gallery/members/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setMembers(prev => prev.filter(m => m.id !== id));
  }
  async function updateOrderStatus(id: number, status: string) {
    await fetch(`${apiBase}/api/admin/design-gallery/orders/${id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  }

  const SC: Record<string, string> = { active: "#10B981", pending: "#F59E0B", suspended: "#EF4444", completed: "#22C55E", cancelled: "#EF4444", in_progress: "#3B82F6" };
  const SL: Record<string, string> = { active: "فعّال", pending: "معلق", suspended: "موقوف", completed: "مكتمل", cancelled: "ملغى", in_progress: "جارٍ" };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14 }}>
        {(["members", "orders"] as const).map(v => (
          <TouchableOpacity key={v} onPress={() => setView(v)} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: view === v ? "#F472B6" : "#FFFFFF0A", alignItems: "center", borderWidth: 1, borderColor: view === v ? "#F472B6" : "#FFFFFF10" }}>
            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: view === v ? "#fff" : "#9CA3AF" }}>
              {v === "members" ? "المصممون" : "الطلبات"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color="#F472B6" style={{ marginTop: 40 }} /> : view === "members" ? (
        members.length === 0 ? (
          <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا يوجد مصممون مسجلون</Text>
        ) : members.map(m => (
          <View key={m.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 16, marginBottom: 14, borderRightWidth: 4, borderRightColor: SC[m.status] ?? "#F472B6" }}>
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, flex: 1, textAlign: "right" }}>{m.shop_name}</Text>
              <View style={{ backgroundColor: (SC[m.status] ?? "#F472B6") + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: SC[m.status] ?? "#F472B6" }}>{SL[m.status] ?? m.status}</Text>
              </View>
            </View>
            {m.owner_name ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>المالك: {m.owner_name}</Text> : null}
            {m.phone ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>{m.phone}</Text> : null}
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 6, marginBottom: 12 }}>
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>منتجات: {m.product_count ?? 0}</Text>
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>طلبات: {m.order_count ?? 0}</Text>
              {m.package_name ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: m.pkg_color ?? "#F472B6" }}>الباقة: {m.package_name}</Text> : null}
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" }}>
              {m.status !== "active" && (
                <TouchableOpacity onPress={() => updateMemberStatus(m.id, "active")} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#10B98120", borderWidth: 1, borderColor: "#10B981" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#10B981" }}>تفعيل</Text>
                </TouchableOpacity>
              )}
              {m.status !== "suspended" && (
                <TouchableOpacity onPress={() => updateMemberStatus(m.id, "suspended")} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#EF444420", borderWidth: 1, borderColor: "#EF4444" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#EF4444" }}>تعليق</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => deleteMember(m.id)} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444440" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#EF4444" }}>حذف</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      ) : (
        orders.length === 0 ? (
          <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد طلبات</Text>
        ) : orders.map(o => (
          <View key={o.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 16, marginBottom: 14 }}>
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, flex: 1, textAlign: "right" }}>{o.shop_name}</Text>
              <View style={{ backgroundColor: (SC[o.status] ?? "#888") + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: SC[o.status] ?? "#888" }}>{SL[o.status] ?? o.status}</Text>
              </View>
            </View>
            {o.product_title ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginBottom: 4 }}>المنتج: {o.product_title}</Text> : null}
            {o.client_name ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>العميل: {o.client_name}</Text> : null}
            {o.created_at ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textDisabled, textAlign: "right", marginTop: 4, marginBottom: 10 }}>{new Date(o.created_at).toLocaleDateString("ar-EG")}</Text> : null}
            {o.status === "pending" && (
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TouchableOpacity onPress={() => updateOrderStatus(o.id, "cancelled")} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: "#EF444420", alignItems: "center", borderWidth: 1, borderColor: "#EF4444" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#EF4444", fontSize: 12 }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => updateOrderStatus(o.id, "in_progress")} style={{ flex: 2, paddingVertical: 8, borderRadius: 10, backgroundColor: "#3B82F6", alignItems: "center" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#fff", fontSize: 12 }}>بدء التنفيذ</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ─── Admin Sick Leaves Tab ────────────────────────────────────────────────────
function AdminSickLeavesTab({ token, apiBase }: { token: string; apiBase: string }) {
  const [leaves, setLeaves] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all");
  const [acting, setActing] = React.useState<number | null>(null);
  const TYPES = [["all","الكل"], ["student","طلاب"], ["military","عسكريون"], ["employee","موظفون"]];

  const load = React.useCallback(() => {
    const q = filter !== "all" ? `?type=${filter}` : "";
    fetch(`${apiBase}/api/admin/sick-leaves${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.sick_leaves) setLeaves(d.sick_leaves); }).catch(() => {}).finally(() => setLoading(false));
  }, [filter, token, apiBase]);

  React.useEffect(() => { setLoading(true); load(); }, [load]);
  React.useEffect(() => {
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const updateStatus = async (id: number, status: string) => {
    setActing(id);
    try {
      await fetch(`${apiBase}/api/admin/sick-leaves/${id}/status`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    } catch { Alert.alert("خطأ", "تعذّر تحديث الحالة"); } finally { setActing(null); }
  };

  const typeLabel = (t: string) => t === "student" ? "طالب" : t === "military" ? "عسكري" : "موظف";
  const statusColor = (s: string) => s === "verified" ? "#10B981" : s === "flagged" ? "#EF4444" : "#F59E0B";
  const statusLabel = (s: string) => s === "verified" ? "موثّق" : s === "flagged" ? "مشكوك فيه" : "قيد المراجعة";

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <TouchableOpacity onPress={load} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
          <Ionicons name="refresh" size={15} color={Colors.textMuted} />
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>تحديث تلقائي كل 30 ث</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text }}>الإجازات المرضية</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          {TYPES.map(([k, lbl]) => (
            <TouchableOpacity key={k} onPress={() => setFilter(k)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: filter === k ? "#10B981" : "#FFFFFF0A" }}>
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: filter === k ? "#fff" : "#9CA3AF" }}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      {loading ? <ActivityIndicator color="#10B981" style={{ marginTop: 40 }} /> : leaves.length === 0 ? (
        <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد إجازات</Text>
      ) : leaves.map(sl => (
        <View key={sl.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text }}>{sl.doctor_name || "طبيب"}</Text>
            <View style={{ flexDirection: "row-reverse", gap: 6, alignItems: "center" }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "#6366F120" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: "#6366F1" }}>{typeLabel(sl.leave_type)}</Text>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: statusColor(sl.status || "pending") + "20" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: statusColor(sl.status || "pending") }}>{statusLabel(sl.status || "pending")}</Text>
              </View>
            </View>
          </View>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>{sl.start_date} ← {sl.end_date}  ({sl.leave_days} يوم)</Text>
          {sl.institution_name && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 3 }}>المؤسسة: {sl.institution_name}</Text>}
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#4B5563", textAlign: "right", marginTop: 3 }}>رمز التحقق: {sl.barcode_token}</Text>
          {(!sl.status || sl.status === "pending") && (
            <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
              <TouchableOpacity onPress={() => updateStatus(sl.id, "flagged")} disabled={acting === sl.id}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: "#EF444420", borderWidth: 1, borderColor: "#EF444440", alignItems: "center" }}>
                {acting === sl.id ? <ActivityIndicator size="small" color="#EF4444" /> :
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#EF4444" }}>تشكيك</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => updateStatus(sl.id, "verified")} disabled={acting === sl.id}
                style={{ flex: 2, paddingVertical: 9, borderRadius: 10, backgroundColor: "#10B981", alignItems: "center" }}>
                {acting === sl.id ? <ActivityIndicator size="small" color="#fff" /> :
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" }}>✓ توثيق الإجازة</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Admin Admissions Tab ─────────────────────────────────────────────────────
function AdminAdmissionsTab({ token, apiBase }: { token: string; apiBase: string }) {
  const [admissions, setAdmissions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("active");
  const [acting, setActing] = React.useState<number | null>(null);

  const load = React.useCallback(() => {
    fetch(`${apiBase}/api/admin/admissions?status=${filter}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.admissions) setAdmissions(d.admissions); }).catch(() => {}).finally(() => setLoading(false));
  }, [filter, token, apiBase]);

  React.useEffect(() => { setLoading(true); load(); }, [load]);
  React.useEffect(() => {
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const discharge = async (id: number) => {
    Alert.alert("تأكيد الصرف", "هل تريد صرف هذا المريض؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "صرف", style: "destructive", onPress: async () => {
        setActing(id);
        try {
          await fetch(`${apiBase}/api/admin/admissions/${id}/discharge`, {
            method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          setAdmissions(prev => prev.filter(a => a.id !== id));
        } catch { Alert.alert("خطأ", "تعذّر الصرف"); } finally { setActing(null); }
      }},
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <TouchableOpacity onPress={load} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
          <Ionicons name="refresh" size={15} color={Colors.textMuted} />
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>تحديث تلقائي كل 30 ث</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text }}>التنويم والمرافق</Text>
      </View>
      <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14 }}>
        {[["active","نشطة"], ["discharged","مُصرَّف"]].map(([k, lbl]) => (
          <TouchableOpacity key={k} onPress={() => setFilter(k)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: filter === k ? "#3B82F6" : "#FFFFFF0A", alignItems: "center" }}>
            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: filter === k ? "#fff" : "#9CA3AF" }}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color="#3B82F6" style={{ marginTop: 40 }} /> : admissions.length === 0 ? (
        <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد حالات</Text>
      ) : admissions.map(a => (
        <View key={a.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text }}>{a.patient_display_name || `مريض #${a.patient_user_id}`}</Text>
            <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: a.status === "active" ? "#10B98120" : "#6B728020" }}>
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: a.status === "active" ? "#10B981" : "#6B7280" }}>{a.status === "active" ? "نشط" : "صُرف"}</Text>
            </View>
          </View>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>{a.facility_name || "مستشفى"}{a.ward ? ` — ${a.ward}` : ""}</Text>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>الطبيب: {a.doctor_name || "—"}</Text>
          {a.diagnosis && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 4 }}>{a.diagnosis}</Text>}
          {a.status === "active" && (
            <TouchableOpacity onPress={() => discharge(a.id)} disabled={acting === a.id}
              style={{ marginTop: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: "#3B82F6", alignItems: "center" }}>
              {acting === a.id ? <ActivityIndicator size="small" color="#fff" /> :
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" }}>صرف المريض</Text>}
            </TouchableOpacity>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Admin Zawajil Tab ────────────────────────────────────────────────────────
function AdminZawajilTab({ token, apiBase }: { token: string; apiBase: string }) {
  const PINK = "#EC4899";
  const [subTab, setSubTab] = React.useState<"orders" | "applications">("orders");
  const [orders, setOrders] = React.useState<any[]>([]);
  const [apps, setApps] = React.useState<any[]>([]);
  const [ordFilter, setOrdFilter] = React.useState("pending_review");
  const [loading, setLoading] = React.useState(true);
  const [acting, setActing] = React.useState<number | null>(null);
  const [reviewModal, setReviewModal] = React.useState<any>(null);
  const [notes, setNotes] = React.useState("");
  const [cost, setCost] = React.useState("");

  const loadOrders = React.useCallback(() => {
    const q = ordFilter !== "all" ? `?status=${ordFilter}` : "";
    fetch(`${apiBase}/api/admin/zawajil/orders${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.orders) setOrders(d.orders); }).catch(() => {}).finally(() => setLoading(false));
  }, [ordFilter, token, apiBase]);

  const loadApps = React.useCallback(() => {
    fetch(`${apiBase}/api/admin/zawajil/applications`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.applications) setApps(d.applications); }).catch(() => {});
  }, [token, apiBase]);

  React.useEffect(() => {
    setLoading(true);
    if (subTab === "orders") loadOrders(); else loadApps();
  }, [subTab, loadOrders, loadApps]);

  React.useEffect(() => {
    const iv = setInterval(() => { if (subTab === "orders") loadOrders(); else loadApps(); }, 30000);
    return () => clearInterval(iv);
  }, [subTab, loadOrders, loadApps]);

  const reviewOrder = async (id: number, action: "approved" | "rejected" | "modification_requested") => {
    setActing(id);
    try {
      await fetch(`${apiBase}/api/admin/zawajil/orders/${id}/review`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, admin_notes: notes, rejection_reason: action === "rejected" ? notes : undefined, estimated_cost: cost ? parseFloat(cost) : undefined }),
      });
      setReviewModal(null); setNotes(""); setCost("");
      setOrders(prev => prev.filter(o => o.id !== id));
    } catch { Alert.alert("خطأ", "تعذّر تحديث الطلب"); } finally { setActing(null); }
  };

  const updateStatus = async (id: number, status: string) => {
    setActing(id);
    try {
      await fetch(`${apiBase}/api/admin/zawajil/orders/${id}/status`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    } catch { Alert.alert("خطأ", "تعذّر تحديث الحالة"); } finally { setActing(null); }
  };

  const updateAppStatus = async (id: number, status: string) => {
    setActing(id);
    try {
      await fetch(`${apiBase}/api/admin/zawajil/applications/${id}/status`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    } catch { Alert.alert("خطأ", "تعذّر تحديث الطلب"); } finally { setActing(null); }
  };

  const STATUS_NEXT: Record<string, string> = { approved: "preparing", preparing: "sending", sending: "completed" };
  const STATUS_LABEL: Record<string, string> = { pending_review: "قيد المراجعة", approved: "مقبول", preparing: "جارٍ التجهيز", sending: "في الطريق", completed: "مكتمل", rejected: "مرفوض" };
  const STATUS_COLOR: Record<string, string> = { pending_review: "#F59E0B", approved: "#22C55E", preparing: "#0EA5E9", sending: "#C084FC", completed: "#3EFF9C", rejected: "#EF4444" };
  const roleLabel = (r: string) => ({ zaajil:"زاجل", krowan:"كروان", khattaat:"خطاط", gift_store:"متجر هدايا", service_girl:"مُقدِّمة خدمة", service_boy:"مُقدِّم خدمة" } as any)[r] || r;

  const ORD_FILTERS = [["pending_review","معلقة"], ["approved","مقبولة"], ["preparing","تجهيز"], ["sending","إرسال"], ["completed","مكتملة"], ["all","الكل"]];

  return (
    <View style={{ flex: 1 }}>
      {/* Sub tabs */}
      <View style={{ flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle }}>
        {[["orders","الطلبات"],["applications","طلبات الانضمام"]].map(([k, lbl]) => (
          <TouchableOpacity key={k} onPress={() => setSubTab(k as any)}
            style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: subTab === k ? PINK : "transparent" }}>
            <Text style={{ fontFamily: subTab === k ? "Cairo_700Bold" : "Cairo_500Medium", fontSize: 13, color: subTab === k ? PINK : Colors.textMuted }}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {subTab === "orders" && (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 52, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}>
              {ORD_FILTERS.map(([k, lbl]) => (
                <TouchableOpacity key={k} onPress={() => setOrdFilter(k)}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: ordFilter === k ? PINK : "#FFFFFF0A" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: ordFilter === k ? "#fff" : "#9CA3AF" }}>{lbl}{k === "pending_review" && orders.filter(o => o.status === "pending_review").length > 0 && ordFilter !== "pending_review" ? ` (${orders.filter(o => o.status === "pending_review").length})` : ""}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={loadOrders} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "#FFFFFF0A" }}>
                <Ionicons name="refresh" size={15} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </ScrollView>
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {loading ? <ActivityIndicator color={PINK} style={{ marginTop: 40 }} /> : orders.length === 0 ? (
              <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد طلبات</Text>
            ) : orders.map(o => (
              <View key={o.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: (STATUS_COLOR[o.status] || "#888") + "40", marginBottom: 14, overflow: "hidden" }}>
                <View style={{ height: 3, backgroundColor: STATUS_COLOR[o.status] || "#888" }} />
                <View style={{ padding: 14 }}>
                  <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 8 }}>
                    <View>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text }}>{o.order_number}</Text>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>{new Date(o.created_at).toLocaleDateString("ar-SA")}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: (STATUS_COLOR[o.status] || "#888") + "20" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: STATUS_COLOR[o.status] || "#888" }}>{STATUS_LABEL[o.status] || o.status}</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary, textAlign: "right" }}>من: {o.sender_anonymous ? "ممهول" : o.sender_name}  →  إلى: {o.recipient_name}</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>الخدمة: {o.service_type} · الهدية: {o.gift_type}</Text>
                  {o.message_text && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 4, fontStyle: "italic" }}>"{o.message_text}"</Text>}
                  {o.delivery_location === "outside_city" && <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 11, color: "#F97316", textAlign: "right", marginTop: 2 }}>خارج المدينة</Text>}
                  {o.estimated_cost > 0 && <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#D4AF37", textAlign: "right", marginTop: 3 }}>التكلفة: {Number(o.estimated_cost).toLocaleString()} SDG</Text>}
                  {o.sender_phone && (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${o.sender_phone}`)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 6 }}>
                      <Ionicons name="call-outline" size={13} color="#22C55E" />
                      <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 12, color: "#22C55E" }}>{o.sender_phone}</Text>
                    </TouchableOpacity>
                  )}
                  {/* Actions */}
                  {o.status === "pending_review" && (
                    <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 12 }}>
                      <TouchableOpacity onPress={() => { setReviewModal({ ...o, action: "rejected" }); setNotes(""); }} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: "#EF444420", borderWidth: 1, borderColor: "#EF444440", alignItems: "center" }}>
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#EF4444" }}>رفض</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setReviewModal({ ...o, action: "approved" }); setNotes(""); setCost(""); }} style={{ flex: 2, paddingVertical: 9, borderRadius: 10, backgroundColor: PINK, alignItems: "center" }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>✓ قبول وتحديد تكلفة</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {STATUS_NEXT[o.status] && (
                    <TouchableOpacity onPress={() => updateStatus(o.id, STATUS_NEXT[o.status])} disabled={acting === o.id}
                      style={{ marginTop: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: "#0EA5E930", borderWidth: 1, borderColor: "#0EA5E950", alignItems: "center" }}>
                      {acting === o.id ? <ActivityIndicator size="small" color="#0EA5E9" /> :
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#0EA5E9" }}>تقدّم: {STATUS_LABEL[STATUS_NEXT[o.status]]}</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {subTab === "applications" && (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <TouchableOpacity onPress={loadApps}><Ionicons name="refresh" size={16} color={Colors.textMuted} /></TouchableOpacity>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text }}>طلبات الانضمام ({apps.length})</Text>
          </View>
          {apps.length === 0 ? (
            <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد طلبات</Text>
          ) : apps.map(a => (
            <View key={a.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14, marginBottom: 12 }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text }}>{a.full_name}</Text>
                <View style={{ flexDirection: "row-reverse", gap: 5, alignItems: "center" }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: PINK + "20" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: PINK }}>{roleLabel(a.role)}</Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: a.status === "approved" ? "#10B98120" : a.status === "rejected" ? "#EF444420" : "#F59E0B20" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: a.status === "approved" ? "#10B981" : a.status === "rejected" ? "#EF4444" : "#F59E0B" }}>{a.status === "approved" ? "مقبول" : a.status === "rejected" ? "مرفوض" : "معلق"}</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${a.phone}`)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
                <Ionicons name="call-outline" size={13} color="#22C55E" /><Text style={{ fontFamily: "Cairo_500Medium", fontSize: 12, color: "#22C55E" }}>{a.phone}</Text>
              </TouchableOpacity>
              {a.neighborhood && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>الحي: {a.neighborhood}</Text>}
              {a.experience && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 4 }}>{a.experience}</Text>}
              {a.status === "pending" && (
                <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
                  <TouchableOpacity onPress={() => updateAppStatus(a.id, "rejected")} disabled={acting === a.id}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: "#EF444420", borderWidth: 1, borderColor: "#EF444440", alignItems: "center" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#EF4444" }}>رفض</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateAppStatus(a.id, "approved")} disabled={acting === a.id}
                    style={{ flex: 2, paddingVertical: 9, borderRadius: 10, backgroundColor: PINK, alignItems: "center" }}>
                    {acting === a.id ? <ActivityIndicator size="small" color="#fff" /> :
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>✓ قبول في الفريق</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Review Modal */}
      <Modal visible={!!reviewModal} transparent animationType="slide" onRequestClose={() => setReviewModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }} onPress={() => setReviewModal(null)}>
            <Pressable style={{ backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }} onPress={() => {}}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.text, textAlign: "right", marginBottom: 6 }}>
                {reviewModal?.action === "approved" ? "قبول الطلب" : "رفض الطلب"}
              </Text>
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 16 }}>
                طلب: {reviewModal?.order_number} — إلى: {reviewModal?.recipient_name}
              </Text>
              {reviewModal?.action === "approved" && (
                <TextInput
                  style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 12 }}
                  placeholder="التكلفة التقديرية (SDG)"
                  placeholderTextColor={Colors.textMuted}
                  value={cost} onChangeText={setCost}
                  keyboardType="numeric"
                />
              )}
              <TextInput
                style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", borderWidth: 1, borderColor: Colors.borderSubtle, height: 80, textAlignVertical: "top", marginBottom: 16 }}
                placeholder={reviewModal?.action === "approved" ? "ملاحظات للمرسل (اختياري)" : "سبب الرفض (مطلوب)"}
                placeholderTextColor={Colors.textMuted}
                value={notes} onChangeText={setNotes}
                multiline
              />
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                <TouchableOpacity onPress={() => setReviewModal(null)} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#FFFFFF0A", alignItems: "center" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => reviewModal && reviewOrder(reviewModal.id, reviewModal.action)}
                  disabled={!!(acting && reviewModal && acting === reviewModal.id)}
                  style={{ flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: reviewModal?.action === "approved" ? PINK : "#EF4444", alignItems: "center" }}>
                  {acting && reviewModal && acting === reviewModal.id ? <ActivityIndicator color="#fff" /> :
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" }}>{reviewModal?.action === "approved" ? "تأكيد القبول" : "تأكيد الرفض"}</Text>}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Admin Student Union Tab ──────────────────────────────────────────────────
function AdminStudentUnionTab({ token, apiBase }: { token: string; apiBase: string }) {
  const UC = "#6366F1";
  const [apps, setApps] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [acting, setActing] = React.useState<number | null>(null);
  const [filter, setFilter] = React.useState("pending");
  const [lastUpdated, setLastUpdated] = React.useState<Date>(new Date());
  const [grantResult, setGrantResult] = React.useState<{ username: string; temp_password: string; full_name: string } | null>(null);
  const [granting, setGranting] = React.useState<number | null>(null);
  const [resetPwdApp, setResetPwdApp] = React.useState<{ id: number; full_name: string } | null>(null);
  const [resetPwdNew, setResetPwdNew] = React.useState("");
  const [resetPwdConfirm, setResetPwdConfirm] = React.useState("");
  const [resetPwdLoading, setResetPwdLoading] = React.useState(false);
  const [resetPwdDone, setResetPwdDone] = React.useState<string | null>(null);

  const resetPassword = async () => {
    if (!resetPwdApp) return;
    if (resetPwdNew.length < 6) { Alert.alert("خطأ", "كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (resetPwdNew !== resetPwdConfirm) { Alert.alert("خطأ", "كلمتا المرور غير متطابقتين"); return; }
    setResetPwdLoading(true);
    try {
      const r = await fetch(`${apiBase}/api/admin/student-union/managers/reset-password`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: resetPwdApp.id, new_password: resetPwdNew }),
      });
      const d = await r.json();
      if (!r.ok) { Alert.alert("خطأ", d.error || "فشل التحديث"); return; }
      setResetPwdDone(d.username);
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setResetPwdLoading(false); }
  };

  const load = React.useCallback(() => {
    fetch(`${apiBase}/api/student-union/applications`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.applications) { setApps(d.applications); setLastUpdated(new Date()); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, apiBase]);

  React.useEffect(() => { setLoading(true); load(); }, [load]);
  React.useEffect(() => {
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const updateStatus = async (id: number, status: string) => {
    setActing(id);
    try {
      const r = await fetch(`${apiBase}/api/student-union/applications/${id}/status`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error();
      setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    } catch { Alert.alert("خطأ", "تعذّر تحديث الطلب"); } finally { setActing(null); }
  };

  const grantManager = async (id: number) => {
    setGranting(id);
    try {
      const r = await fetch(`${apiBase}/api/student-union/applications/${id}/grant-manager`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (!r.ok) { Alert.alert("خطأ", d.error || "تعذّر منح الصلاحيات"); return; }
      setGrantResult({ username: d.username, temp_password: d.temp_password, full_name: d.full_name });
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); } finally { setGranting(null); }
  };

  const filtered = apps.filter(a => filter === "all" ? true : a.status === filter);
  const pendingCount = apps.filter(a => a.status === "pending").length;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

      {/* مودال بيانات الدخول بعد منح الصلاحيات */}
      <Modal visible={!!grantResult} transparent animationType="fade" onRequestClose={() => setGrantResult(null)}>
        <View style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: Colors.cardBg, borderRadius: 20, padding: 24, width: "100%", gap: 14, borderWidth: 1, borderColor: UC + "40" }}>
            <View style={{ alignItems: "center", gap: 6 }}>
              <Ionicons name="shield-checkmark" size={40} color={UC} />
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "center" }}>
                تم منح صلاحيات إدارة الإتحاد
              </Text>
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" }}>
                {grantResult?.full_name}
              </Text>
            </View>
            <View style={{ backgroundColor: "#0B1A12", borderRadius: 12, padding: 16, gap: 10 }}>
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>بيانات الدخول للبوابة</Text>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted }}>اسم المستخدم</Text>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: UC, letterSpacing: 1 }}>{grantResult?.username}</Text>
              </View>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted }}>كلمة المرور المؤقتة</Text>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#F59E0B", letterSpacing: 1 }}>{grantResult?.temp_password}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" }}>
              احتفظ بهذه البيانات وأرسلها للعضو — لا يمكن استعادة كلمة المرور لاحقاً
            </Text>
            <TouchableOpacity onPress={() => setGrantResult(null)}
              style={{ backgroundColor: UC, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" }}>حسناً — تم التسجيل</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* مودال تعديل كلمة المرور */}
      <Modal visible={!!resetPwdApp} transparent animationType="fade" onRequestClose={() => { setResetPwdApp(null); setResetPwdNew(""); setResetPwdConfirm(""); setResetPwdDone(null); }}>
        <View style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: Colors.cardBg, borderRadius: 20, padding: 24, width: "100%", gap: 14, borderWidth: 1, borderColor: UC + "40" }}>
            {resetPwdDone ? (
              <>
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={40} color="#10B981" />
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "center" }}>تم تحديث كلمة المرور</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" }}>المستخدم: {resetPwdDone}</Text>
                </View>
                <TouchableOpacity onPress={() => { setResetPwdApp(null); setResetPwdNew(""); setResetPwdConfirm(""); setResetPwdDone(null); }}
                  style={{ backgroundColor: "#10B981", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" }}>حسناً</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Ionicons name="key" size={32} color={UC} />
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "center" }}>تعديل كلمة المرور</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" }}>{resetPwdApp?.full_name}</Text>
                </View>
                <TextInput
                  value={resetPwdNew}
                  onChangeText={setResetPwdNew}
                  placeholder="كلمة المرور الجديدة"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry
                  style={{ backgroundColor: "#0B1A12", color: "#fff", borderRadius: 10, padding: 12, fontFamily: "Cairo_400Regular", textAlign: "right", borderWidth: 1, borderColor: UC + "40" }}
                />
                <TextInput
                  value={resetPwdConfirm}
                  onChangeText={setResetPwdConfirm}
                  placeholder="تأكيد كلمة المرور"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry
                  style={{ backgroundColor: "#0B1A12", color: "#fff", borderRadius: 10, padding: 12, fontFamily: "Cairo_400Regular", textAlign: "right", borderWidth: 1, borderColor: resetPwdConfirm && resetPwdNew !== resetPwdConfirm ? "#EF4444" : UC + "40" }}
                />
                {resetPwdConfirm.length > 0 && resetPwdNew !== resetPwdConfirm && (
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#EF4444", textAlign: "center" }}>كلمتا المرور غير متطابقتين</Text>
                )}
                <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                  <TouchableOpacity onPress={() => { setResetPwdApp(null); setResetPwdNew(""); setResetPwdConfirm(""); }}
                    style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: "#FFFFFF0A", alignItems: "center", borderWidth: 1, borderColor: "#FFFFFF15" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted }}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={resetPassword} disabled={resetPwdLoading || resetPwdNew.length < 6 || resetPwdNew !== resetPwdConfirm}
                    style={{ flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: UC, alignItems: "center", opacity: (resetPwdLoading || resetPwdNew.length < 6 || resetPwdNew !== resetPwdConfirm) ? 0.5 : 1 }}>
                    {resetPwdLoading ? <ActivityIndicator size="small" color="#fff" /> :
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>حفظ كلمة المرور</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
          <TouchableOpacity onPress={load} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
            <Ionicons name="refresh" size={14} color={Colors.textMuted} />
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted }}>
              {lastUpdated.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => exportToCSV(apps.map(a => ({ الاسم: a.full_name||a.applicant_name||"", الهاتف: a.phone||"", المؤسسة: a.institution||"", التخصص: a.major||"", الحالة: a.status||"", التاريخ: a.created_at ? new Date(a.created_at).toLocaleDateString("ar-SA") : "" })), "طلبات_اتحاد_الطلاب.csv")}
            style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "#FFFFFF08", borderWidth: 1, borderColor: "#FFFFFF15" }}>
            <Ionicons name="download-outline" size={13} color={Colors.textMuted} />
            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.textMuted }}>تصدير CSV</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
          {pendingCount > 0 && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "#EF444420" }}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: "#EF4444" }}>{pendingCount} معلق</Text>
            </View>
          )}
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text }}>إتحاد الطلاب</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row-reverse", gap: 6, marginBottom: 14 }}>
        {[["pending","معلق"],["approved","مقبول"],["rejected","مرفوض"],["all","الكل"]].map(([k, lbl]) => (
          <TouchableOpacity key={k} onPress={() => setFilter(k)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: filter === k ? UC : "#FFFFFF0A", alignItems: "center" }}>
            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: filter === k ? "#fff" : "#9CA3AF" }}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color={UC} style={{ marginTop: 40 }} /> : filtered.length === 0 ? (
        <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد طلبات</Text>
      ) : filtered.map(a => (
        <View key={a.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text }}>{a.full_name || a.applicant_name || "مقدّم طلب"}</Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: a.status === "approved" ? "#10B98120" : a.status === "rejected" ? "#EF444420" : "#F59E0B20" }}>
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: a.status === "approved" ? "#10B981" : a.status === "rejected" ? "#EF4444" : "#F59E0B" }}>
                {a.status === "approved" ? "مقبول" : a.status === "rejected" ? "مرفوض" : "معلق"}
              </Text>
            </View>
          </View>
          {a.phone && <TouchableOpacity onPress={() => Linking.openURL(`tel:${a.phone}`)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <Ionicons name="call-outline" size={13} color="#22C55E" /><Text style={{ fontFamily: "Cairo_500Medium", fontSize: 12, color: "#22C55E" }}>{a.phone}</Text>
          </TouchableOpacity>}
          {a.institution && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>المؤسسة: {a.institution}</Text>}
          {a.major && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>التخصص: {a.major}</Text>}
          {a.motivation && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 4, fontStyle: "italic" }} numberOfLines={2}>"{a.motivation}"</Text>}
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 4 }}>{new Date(a.created_at).toLocaleDateString("ar-SA")}</Text>

          {/* أزرار المعلق */}
          {a.status === "pending" && (
            <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
              <TouchableOpacity onPress={() => updateStatus(a.id, "rejected")} disabled={acting === a.id}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: "#EF444420", borderWidth: 1, borderColor: "#EF444440", alignItems: "center" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#EF4444" }}>رفض</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => updateStatus(a.id, "approved")} disabled={acting === a.id}
                style={{ flex: 2, paddingVertical: 9, borderRadius: 10, backgroundColor: UC, alignItems: "center" }}>
                {acting === a.id ? <ActivityIndicator size="small" color="#fff" /> :
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>✓ قبول في الإتحاد</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* أزرار المقبول */}
          {a.status === "approved" && (
            <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => { setResetPwdApp({ id: a.id, full_name: a.full_name || a.applicant_name || "المدير" }); setResetPwdNew(""); setResetPwdConfirm(""); setResetPwdDone(null); }}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: "#0B1A12", alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: UC + "60" }}>
                <Ionicons name="key-outline" size={14} color={UC} />
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: UC }}>تعديل كلمة المرور</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => grantManager(a.id)}
                disabled={granting === a.id}
                style={{ flex: 2, paddingVertical: 9, borderRadius: 10, backgroundColor: "#7C3AED", alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 6 }}>
                {granting === a.id ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" }}>منح صلاحيات الإدارة</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Admin Unions Tab ─────────────────────────────────────────────────────────
function AdminUnionsTab({ token, apiBase }: { token: string; apiBase: string }) {
  const UC = "#8B5CF6";
  const [subTab, setSubTab] = React.useState<"members" | "unions" | "announcements">("members");
  const [unions, setUnions]       = React.useState<any[]>([]);
  const [members, setMembers]     = React.useState<any[]>([]);
  const [announcements, setAnnouncements] = React.useState<any[]>([]);
  const [loading, setLoading]     = React.useState(true);
  const [acting, setActing]       = React.useState<number | null>(null);
  const [memberFilter, setMemberFilter] = React.useState("pending");
  const [unionFilter, setUnionFilter]   = React.useState<number | "all">("all");
  const [addUnionModal, setAddUnionModal] = React.useState(false);
  const [addAnnoModal, setAddAnnoModal]   = React.useState(false);
  const [newUnion, setNewUnion]   = React.useState({ name: "", field: "", phone: "", address: "", description: "" });
  const [newAnno, setNewAnno]     = React.useState({ title: "", body: "", union_id: "" });
  const [memberNo, setMemberNo]   = React.useState("");
  const [approveModal, setApproveModal] = React.useState<any>(null);
  const [lastRefresh, setLastRefresh] = React.useState(new Date());

  const loadMembers = React.useCallback(() => {
    const q = memberFilter !== "all" ? `?status=${memberFilter}` : "";
    fetch(`${apiBase}/api/admin/union-members${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setMembers(Array.isArray(d) ? d : []); setLastRefresh(new Date()); }).catch(() => {}).finally(() => setLoading(false));
  }, [memberFilter, token, apiBase]);

  const loadUnions = React.useCallback(() => {
    fetch(`${apiBase}/api/admin/unions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setUnions(Array.isArray(d) ? d : []); }).catch(() => {}).finally(() => setLoading(false));
  }, [token, apiBase]);

  const loadAnnouncements = React.useCallback(() => {
    fetch(`${apiBase}/api/admin/union-announcements`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setAnnouncements(Array.isArray(d) ? d : []); }).catch(() => {}).finally(() => setLoading(false));
  }, [token, apiBase]);

  React.useEffect(() => {
    setLoading(true);
    if (subTab === "members")       loadMembers();
    else if (subTab === "unions")   loadUnions();
    else                            loadAnnouncements();
  }, [subTab, loadMembers, loadUnions, loadAnnouncements]);

  React.useEffect(() => {
    const iv = setInterval(() => {
      if (subTab === "members") loadMembers();
      else if (subTab === "unions") loadUnions();
    }, 30000);
    return () => clearInterval(iv);
  }, [subTab, loadMembers, loadUnions]);

  const updateMemberStatus = async (id: number, status: string, membership_no?: string) => {
    setActing(id);
    try {
      await fetch(`${apiBase}/api/admin/union-members/${id}/status`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status, membership_no: membership_no || undefined }),
      });
      setMembers(prev => prev.map(m => m.id === id ? { ...m, status, membership_no: membership_no || m.membership_no } : m));
      setApproveModal(null); setMemberNo("");
    } catch { Alert.alert("خطأ", "تعذّر تحديث الطلب"); } finally { setActing(null); }
  };

  const toggleUnionActive = async (u: any) => {
    setActing(u.id);
    try {
      await fetch(`${apiBase}/api/admin/unions/${u.id}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      setUnions(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x));
    } catch { Alert.alert("خطأ", "تعذّر التحديث"); } finally { setActing(null); }
  };

  const createUnion = async () => {
    if (!newUnion.name.trim()) { Alert.alert("خطأ", "اسم النقابة مطلوب"); return; }
    try {
      const r = await fetch(`${apiBase}/api/admin/unions`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(newUnion),
      });
      const d = await r.json();
      if (d.id) { setUnions(prev => [d, ...prev]); setAddUnionModal(false); setNewUnion({ name: "", field: "", phone: "", address: "", description: "" }); }
    } catch { Alert.alert("خطأ", "تعذّر الإضافة"); }
  };

  const createAnnouncement = async () => {
    if (!newAnno.title.trim() || !newAnno.body.trim()) { Alert.alert("خطأ", "العنوان والمحتوى مطلوبان"); return; }
    try {
      await fetch(`${apiBase}/api/admin/union-announcements`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...newAnno, union_id: newAnno.union_id ? parseInt(newAnno.union_id) : null }),
      });
      loadAnnouncements(); setAddAnnoModal(false); setNewAnno({ title: "", body: "", union_id: "" });
    } catch { Alert.alert("خطأ", "تعذّر النشر"); }
  };

  const deleteAnnouncement = async (id: number) => {
    Alert.alert("تأكيد الحذف", "هل تريد حذف هذا الإعلان؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        await fetch(`${apiBase}/api/admin/union-announcements/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
        setAnnouncements(prev => prev.filter(a => a.id !== id));
      }},
    ]);
  };

  const pendingCount = members.filter(m => m.status === "pending").length;
  const filteredMembers = members.filter(m => {
    const statusOk = memberFilter === "all" ? true : m.status === memberFilter;
    const unionOk  = unionFilter === "all" ? true : m.union_id === unionFilter;
    return statusOk && unionOk;
  });

  const statusColor = (s: string) => s === "approved" ? "#10B981" : s === "rejected" ? "#EF4444" : "#F59E0B";
  const statusLabel = (s: string) => s === "approved" ? "مقبول" : s === "rejected" ? "مرفوض" : "معلق";

  return (
    <View style={{ flex: 1 }}>
      {/* Sub tabs */}
      <View style={{ flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle, backgroundColor: Colors.cardBg }}>
        {([["members","طلبات الانضمام"], ["unions","النقابات"], ["announcements","الإعلانات"]] as [string,string][]).map(([k, lbl]) => (
          <TouchableOpacity key={k} onPress={() => setSubTab(k as any)}
            style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: subTab === k ? UC : "transparent" }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
              <Text style={{ fontFamily: subTab === k ? "Cairo_700Bold" : "Cairo_500Medium", fontSize: 12, color: subTab === k ? UC : Colors.textMuted }}>{lbl}</Text>
              {k === "members" && pendingCount > 0 && (
                <View style={{ backgroundColor: "#EF4444", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 9, color: "#fff" }}>{pendingCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── طلبات الانضمام ── */}
      {subTab === "members" && (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted }}>
              آخر تحديث: {lastRefresh.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
            </Text>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text }}>طلبات الانضمام</Text>
          </View>

          {/* Filter status */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row-reverse", gap: 6 }}>
              {[["pending","معلق"], ["approved","مقبول"], ["rejected","مرفوض"], ["all","الكل"]].map(([k, lbl]) => (
                <TouchableOpacity key={k} onPress={() => setMemberFilter(k)}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: memberFilter === k ? UC : "#FFFFFF0A" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: memberFilter === k ? "#fff" : "#9CA3AF" }}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Filter by union */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row-reverse", gap: 6 }}>
              <TouchableOpacity onPress={() => setUnionFilter("all")} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: unionFilter === "all" ? UC + "40" : "#FFFFFF0A" }}>
                <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted }}>كل النقابات</Text>
              </TouchableOpacity>
              {unions.map(u => (
                <TouchableOpacity key={u.id} onPress={() => setUnionFilter(u.id)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: unionFilter === u.id ? UC + "40" : "#FFFFFF0A" }}>
                  <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted }}>{u.short_name || u.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {loading ? <ActivityIndicator color={UC} style={{ marginTop: 40 }} /> : filteredMembers.length === 0 ? (
            <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد طلبات</Text>
          ) : filteredMembers.map(m => (
            <View key={m.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14, marginBottom: 12 }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text }}>{m.full_name}</Text>
                <View style={{ flexDirection: "row-reverse", gap: 5 }}>
                  {m.membership_no && (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: UC + "20" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: UC }}>#{m.membership_no}</Text>
                    </View>
                  )}
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: statusColor(m.status) + "20" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: statusColor(m.status) }}>{statusLabel(m.status)}</Text>
                  </View>
                </View>
              </View>
              {m.union_name && <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 12, color: UC, textAlign: "right" }}>النقابة: {m.union_name}</Text>}
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>التخصص: {m.specialty || m.job_title || "—"}</Text>
              {m.phone && <TouchableOpacity onPress={() => Linking.openURL(`tel:${m.phone}`)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 4 }}>
                <Ionicons name="call-outline" size={13} color="#22C55E" />
                <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 12, color: "#22C55E" }}>{m.phone}</Text>
              </TouchableOpacity>}
              {m.employer && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>جهة العمل: {m.employer}</Text>}
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 3 }}>
                {new Date(m.applied_at).toLocaleDateString("ar-SA")}
              </Text>
              {m.status === "pending" && (
                <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
                  <TouchableOpacity onPress={() => updateMemberStatus(m.id, "rejected")} disabled={acting === m.id}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: "#EF444420", borderWidth: 1, borderColor: "#EF444440", alignItems: "center" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#EF4444" }}>رفض</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setApproveModal(m); setMemberNo(""); }} disabled={acting === m.id}
                    style={{ flex: 2, paddingVertical: 9, borderRadius: 10, backgroundColor: UC, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>✓ قبول وإصدار رقم عضوية</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── النقابات ── */}
      {subTab === "unions" && (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
            <TouchableOpacity onPress={() => setAddUnionModal(true)}
              style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: UC }}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" }}>نقابة جديدة</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text }}>النقابات ({unions.length})</Text>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {loading ? <ActivityIndicator color={UC} style={{ marginTop: 40 }} /> : unions.map(u => (
              <View key={u.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: u.is_active ? UC + "40" : Colors.borderSubtle, padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }}>{u.name}</Text>
                  <TouchableOpacity onPress={() => toggleUnionActive(u)} disabled={acting === u.id}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: u.is_active ? "#10B98120" : "#6B728020", marginRight: 8 }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: u.is_active ? "#10B981" : "#6B7280" }}>{u.is_active ? "نشطة" : "معطّلة"}</Text>
                  </TouchableOpacity>
                </View>
                {u.field && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: UC, textAlign: "right" }}>المجال: {u.field}</Text>}
                {u.address && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>{u.address}</Text>}
                <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 8 }}>
                  <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted }}>{u.members_total || 0} عضو</Text>
                  {u.phone && <TouchableOpacity onPress={() => Linking.openURL(`tel:${u.phone}`)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                    <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 11, color: "#22C55E" }}>{u.phone}</Text>
                    <Ionicons name="call-outline" size={13} color="#22C55E" />
                  </TouchableOpacity>}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── الإعلانات ── */}
      {subTab === "announcements" && (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
            <TouchableOpacity onPress={() => setAddAnnoModal(true)}
              style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: UC }}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" }}>إعلان جديد</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text }}>الإعلانات</Text>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {loading ? <ActivityIndicator color={UC} style={{ marginTop: 40 }} /> : announcements.length === 0 ? (
              <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد إعلانات</Text>
            ) : announcements.map((a: any) => (
              <View key={a.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14, marginBottom: 12 }}>
                <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }}>{a.title}</Text>
                  <TouchableOpacity onPress={() => deleteAnnouncement(a.id)} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
                {a.union_name && <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 11, color: UC, textAlign: "right", marginBottom: 4 }}>{a.union_name}</Text>}
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" }}>{a.body}</Text>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "right", marginTop: 6 }}>{new Date(a.created_at).toLocaleDateString("ar-SA")}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Modal: قبول العضوية */}
      <Modal visible={!!approveModal} transparent animationType="slide" onRequestClose={() => setApproveModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }} onPress={() => setApproveModal(null)}>
            <Pressable style={{ backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }} onPress={() => {}}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text, textAlign: "right", marginBottom: 4 }}>قبول العضوية</Text>
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 16 }}>
                {approveModal?.full_name} — {approveModal?.union_name}
              </Text>
              <TextInput
                style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.text, textAlign: "right", borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 16 }}
                placeholder="رقم العضوية (اختياري)"
                placeholderTextColor={Colors.textMuted}
                value={memberNo} onChangeText={setMemberNo}
                keyboardType="default"
              />
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                <TouchableOpacity onPress={() => setApproveModal(null)} style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#FFFFFF0A", alignItems: "center" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => approveModal && updateMemberStatus(approveModal.id, "approved", memberNo)}
                  disabled={!!(acting && approveModal && acting === approveModal.id)}
                  style={{ flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: UC, alignItems: "center" }}>
                  {acting && approveModal && acting === approveModal.id ? <ActivityIndicator color="#fff" /> :
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" }}>تأكيد القبول</Text>}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: إضافة نقابة */}
      <Modal visible={addUnionModal} transparent animationType="slide" onRequestClose={() => setAddUnionModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }} onPress={() => setAddUnionModal(false)}>
            <Pressable style={{ backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "80%" }} onPress={() => {}}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text, textAlign: "right", marginBottom: 16 }}>إضافة نقابة / اتحاد / جمعية</Text>
              {[
                { key: "name", placeholder: "الاسم الكامل *", keyboardType: "default" as const },
                { key: "field", placeholder: "المجال / التخصص", keyboardType: "default" as const },
                { key: "phone", placeholder: "رقم الهاتف", keyboardType: "phone-pad" as const },
                { key: "address", placeholder: "العنوان", keyboardType: "default" as const },
              ].map(f => (
                <TextInput key={f.key}
                  style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 10 }}
                  placeholder={f.placeholder} placeholderTextColor={Colors.textMuted}
                  keyboardType={f.keyboardType}
                  value={(newUnion as any)[f.key]} onChangeText={v => setNewUnion(p => ({ ...p, [f.key]: v }))}
                />
              ))}
              <TextInput
                style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", borderWidth: 1, borderColor: Colors.borderSubtle, height: 70, textAlignVertical: "top", marginBottom: 16 }}
                placeholder="وصف مختصر" placeholderTextColor={Colors.textMuted}
                value={newUnion.description} onChangeText={v => setNewUnion(p => ({ ...p, description: v }))}
                multiline
              />
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                <TouchableOpacity onPress={() => setAddUnionModal(false)} style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#FFFFFF0A", alignItems: "center" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={createUnion} style={{ flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: UC, alignItems: "center" }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" }}>إضافة</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: إضافة إعلان */}
      <Modal visible={addAnnoModal} transparent animationType="slide" onRequestClose={() => setAddAnnoModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }} onPress={() => setAddAnnoModal(false)}>
            <Pressable style={{ backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }} onPress={() => {}}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text, textAlign: "right", marginBottom: 16 }}>نشر إعلان</Text>
              <TextInput
                style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 10 }}
                placeholder="العنوان *" placeholderTextColor={Colors.textMuted}
                value={newAnno.title} onChangeText={v => setNewAnno(p => ({ ...p, title: v }))}
              />
              <TextInput
                style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", borderWidth: 1, borderColor: Colors.borderSubtle, height: 90, textAlignVertical: "top", marginBottom: 10 }}
                placeholder="المحتوى *" placeholderTextColor={Colors.textMuted}
                value={newAnno.body} onChangeText={v => setNewAnno(p => ({ ...p, body: v }))}
                multiline
              />
              <TextInput
                style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", borderWidth: 1, borderColor: Colors.borderSubtle, marginBottom: 16 }}
                placeholder="ID النقابة (اتركه فارغاً لإعلان عام)" placeholderTextColor={Colors.textMuted}
                value={newAnno.union_id} onChangeText={v => setNewAnno(p => ({ ...p, union_id: v }))}
                keyboardType="numeric"
              />
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                <TouchableOpacity onPress={() => setAddAnnoModal(false)} style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#FFFFFF0A", alignItems: "center" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={createAnnouncement} style={{ flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: UC, alignItems: "center" }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" }}>نشر</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Admin Join Requests Tab ─────────────────────────────────────────────────
type JoinSub = "student_union" | "women" | "occasions" | "union_partner" | "union_manager" | "edu_reg" | "edu_transfer" | "travel_agency";
function AdminJoinRequestsTab({ token, apiBase }: { token: string; apiBase: string }) {
  const [sub, setSub] = React.useState<JoinSub>("student_union");
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  // مدراء الاتحادات
  const [mgrView, setMgrView] = React.useState<"apps" | "managers">("apps");
  const [managers, setManagers] = React.useState<any[]>([]);
  const [mgrLoading, setMgrLoading] = React.useState(false);
  const [mgrActing, setMgrActing] = React.useState<number | null>(null);

  // دعوات وكالات السفر
  const [taView, setTaView] = React.useState<"apps" | "invitations">("apps");
  const [invitations, setInvitations] = React.useState<any[]>([]);
  const [invLoading, setInvLoading] = React.useState(false);
  const [invActing, setInvActing] = React.useState<number | null>(null);
  const [showInvForm, setShowInvForm] = React.useState(false);
  const [invAgencyName, setInvAgencyName] = React.useState("");
  const [invContactName, setInvContactName] = React.useState("");
  const [invPhone, setInvPhone] = React.useState("");
  const [invWhatsapp, setInvWhatsapp] = React.useState("");
  const [invEmail, setInvEmail] = React.useState("");
  const [invCity, setInvCity] = React.useState("");
  const [invAgencyType, setInvAgencyType] = React.useState("local");
  const [invNote, setInvNote] = React.useState("");
  const [invSubmitting, setInvSubmitting] = React.useState(false);

  const loadManagers = React.useCallback(() => {
    setMgrLoading(true);
    fetch(`${apiBase}/api/admin/union-managers`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setManagers(Array.isArray(d) ? d : []))
      .catch(() => setManagers([])).finally(() => setMgrLoading(false));
  }, [token, apiBase]);

  const loadInvitations = React.useCallback(() => {
    setInvLoading(true);
    fetch(`${apiBase}/api/admin/travel-agencies/invitations`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setInvitations(Array.isArray(d) ? d : []))
      .catch(() => setInvitations([])).finally(() => setInvLoading(false));
  }, [token, apiBase]);

  React.useEffect(() => {
    if (sub === "union_manager" && mgrView === "managers") loadManagers();
  }, [sub, mgrView, loadManagers]);

  React.useEffect(() => {
    if (sub === "travel_agency" && taView === "invitations") loadInvitations();
  }, [sub, taView, loadInvitations]);

  async function createInvitation() {
    if (!invAgencyName.trim()) { Alert.alert("بيانات ناقصة", "اسم الوكالة مطلوب"); return; }
    setInvSubmitting(true);
    try {
      const r = await fetch(`${apiBase}/api/admin/travel-agencies/invitations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_name: invAgencyName, contact_name: invContactName,
          phone: invPhone, whatsapp: invWhatsapp, email: invEmail,
          city: invCity, agency_type: invAgencyType, note: invNote,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "فشل الإنشاء");
      setInvAgencyName(""); setInvContactName(""); setInvPhone(""); setInvWhatsapp(""); setInvEmail(""); setInvCity(""); setInvAgencyType("local"); setInvNote("");
      setShowInvForm(false);
      loadInvitations();
      if (d.invite_link) {
        Alert.alert("✅ تم إنشاء الدعوة", `رابط الدعوة:\n${d.invite_link}`, [
          { text: "نسخ الرابط", onPress: () => copyInviteLink({ invite_link: d.invite_link }) },
          { text: "حسناً" },
        ]);
      }
    } catch (e: any) {
      Alert.alert("خطأ", e.message || "تعذّر إنشاء الدعوة");
    } finally { setInvSubmitting(false); }
  }

  async function deleteInvitation(id: number) {
    Alert.alert("تأكيد الحذف", "هل تريد حذف هذه الدعوة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        setInvActing(id);
        try {
          const r = await fetch(`${apiBase}/api/admin/travel-agencies/invitations/${id}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}` },
          });
          if (r.ok) setInvitations(prev => prev.filter(i => i.id !== id));
          else { const d = await r.json(); Alert.alert("خطأ", d.error || "فشل الحذف"); }
        } catch { Alert.alert("خطأ", "تعذّر الاتصال"); } finally { setInvActing(null); }
      }},
    ]);
  }

  function copyInviteLink(inv: { invite_link?: string; token?: string }) {
    const link = inv.invite_link || (inv.token ? `https://hasahisawi.pages.dev/travel-agencies?invite=${inv.token}` : "");
    if (!link) return;
    if (Platform.OS === "web") {
      (globalThis as any).navigator?.clipboard?.writeText(link)
        .then(() => Alert.alert("تم النسخ ✅", link))
        .catch(() => Alert.alert("رابط الدعوة", link));
    } else {
      Alert.alert("رابط الدعوة", link, [
        { text: "فتح الرابط", onPress: () => Linking.openURL(link).catch(() => {}) },
        { text: "حسناً" },
      ]);
    }
  }

  async function toggleManager(id: number, is_active: boolean) {
    setMgrActing(id);
    try {
      const r = await fetch(`${apiBase}/api/admin/union-managers/${id}/status`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active }),
      });
      if (r.ok) setManagers(prev => prev.map(m => m.id === id ? { ...m, is_active } : m));
      else { const d = await r.json(); Alert.alert("خطأ", d.error || "فشل التحديث"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال"); } finally { setMgrActing(null); }
  }

  async function deleteManager(id: number, name: string) {
    Alert.alert("تأكيد الحذف", `هل تريد حذف حساب "${name}" نهائياً؟ لا يمكن التراجع.`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        setMgrActing(id);
        try {
          const r = await fetch(`${apiBase}/api/admin/union-managers/${id}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}` },
          });
          if (r.ok) setManagers(prev => prev.filter(m => m.id !== id));
          else { const d = await r.json(); Alert.alert("خطأ", d.error || "فشل الحذف"); }
        } catch { Alert.alert("خطأ", "تعذّر الاتصال"); } finally { setMgrActing(null); }
      }},
    ]);
  }

  const SUB_TABS: { key: JoinSub; label: string }[] = [
    { key: "student_union",  label: "إتحاد الطلاب" },
    { key: "women",          label: "النساء" },
    { key: "occasions",      label: "مناسبتي" },
    { key: "union_partner",  label: "شراكات الاتحادات" },
    { key: "union_manager",  label: "مديرو الاتحادات" },
    { key: "edu_reg",        label: "تسجيل طلاب" },
    { key: "edu_transfer",   label: "نقل قيد" },
    { key: "travel_agency",  label: "وكالات سفر" },
  ];

  const URL_MAP: Record<JoinSub, string> = {
    student_union: `${apiBase}/api/student-union/applications`,
    women:         `${apiBase}/api/women/join-requests`,
    occasions:     `${apiBase}/api/occasions/shops/all`,
    union_partner: `${apiBase}/api/admin/union-partnership`,
    union_manager: `${apiBase}/api/admin/union-manager-apps`,
    edu_reg:       `${apiBase}/api/admin/education/registrations`,
    edu_transfer:  `${apiBase}/api/admin/education/transfers`,
    travel_agency: `${apiBase}/api/admin/travel-agencies/applications`,
  };

  const load = React.useCallback(() => {
    setLoading(true);
    fetch(URL_MAP[sub], { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const arr = Array.isArray(d) ? d
          : d.rows ?? d.applications ?? d.items ?? d.registrations ?? d.transfers ?? [];
        setItems(arr);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [sub, token]);

  const [grantResult2, setGrantResult2] = React.useState<{ username: string; temp_password: string; full_name: string } | null>(null);
  const [granting2, setGranting2] = React.useState<number | null>(null);
  const [grantingUnionMgr, setGrantingUnionMgr] = React.useState<number | null>(null);

  React.useEffect(() => { load(); }, [load]);

  const SC: Record<string, string> = { pending: "#F59E0B", approved: "#10B981", rejected: "#EF4444", active: "#10B981" };
  const SL: Record<string, string> = { pending: "معلق", approved: "مقبول", rejected: "مرفوض", active: "نشط" };

  async function review(id: number, status: "approved" | "rejected") {
    if (sub === "travel_agency") {
      if (status === "approved") {
        await fetch(`${apiBase}/api/admin/travel-agencies/applications/${id}/approve`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
      } else {
        await fetch(`${apiBase}/api/admin/travel-agencies/applications/${id}/status`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
      }
      setItems(prev => prev.filter(x => x.id !== id));
      return;
    }

    if (sub === "student_union") {
      await fetch(`${apiBase}/api/student-union/applications/${id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setItems(prev => prev.map(x => x.id === id ? { ...x, status } : x));
      return;
    }

    const patchMap: Record<JoinSub, string> = {
      student_union: "",
      women:         "",
      occasions:     `${apiBase}/api/occasions/shops/${id}/status`,
      union_partner: `${apiBase}/api/admin/union-partnership/${id}`,
      union_manager: `${apiBase}/api/admin/union-manager-apps/${id}/status`,
      edu_reg:       `${apiBase}/api/admin/education/registrations/${id}`,
      edu_transfer:  `${apiBase}/api/admin/education/transfers/${id}`,
      travel_agency: "",
    };
    const url = patchMap[sub];
    if (!url) return;
    await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setItems(prev => prev.filter(x => x.id !== id));
  }

  async function grantStudentUnionManager(id: number) {
    setGranting2(id);
    try {
      const r = await fetch(`${apiBase}/api/student-union/applications/${id}/grant-manager`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (!r.ok) { Alert.alert("خطأ", d.error || "تعذّر منح الصلاحيات"); return; }
      setGrantResult2({ username: d.username, temp_password: d.temp_password, full_name: d.full_name });
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); } finally { setGranting2(null); }
  }

  async function grantUnionManagerCredentials(id: number) {
    setGrantingUnionMgr(id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await fetch(`${apiBase}/api/admin/union-manager-apps/${id}/grant-credentials`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      let d: any = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        Alert.alert("خطأ", d.error || `فشل الطلب (${r.status})`);
        return;
      }
      setGrantResult2({ username: d.username, temp_password: d.temp_password, full_name: d.full_name });
    } catch (e: any) {
      clearTimeout(timeout);
      Alert.alert("خطأ", e?.name === "AbortError" ? "انتهت مهلة الطلب — حاول مجدداً" : "تعذّر الاتصال بالخادم");
    }
    finally { setGrantingUnionMgr(null); }
  }

  function getTitle(item: any): string {
    return item.full_name ?? item.name ?? item.shop_name ?? item.agency_name ?? item.contact_name
      ?? item.org_name ?? item.student_name ?? item.union_name ?? item.applicant_name ?? `#${item.id}`;
  }
  function getSub(item: any): string {
    return item.phone ?? item.email ?? item.city ?? item.region ?? "";
  }
  function getDesc(item: any): string {
    return item.description ?? item.cooperation_scope ?? item.notes ?? item.reason ?? item.target_routes ?? "";
  }

  return (
    <View style={{ flex: 1 }}>

      {/* مودال بيانات دخول مدير الاتحاد */}
      <Modal visible={!!grantResult2} transparent animationType="fade" onRequestClose={() => setGrantResult2(null)}>
        <View style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: Colors.cardBg, borderRadius: 20, padding: 24, width: "100%", gap: 14, borderWidth: 1, borderColor: "#6366F140" }}>
            <View style={{ alignItems: "center", gap: 6 }}>
              <Ionicons name="shield-checkmark" size={40} color="#6366F1" />
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "center" }}>تم منح صلاحيات إدارة الإتحاد</Text>
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" }}>{grantResult2?.full_name}</Text>
            </View>
            <View style={{ backgroundColor: "#0B1A12", borderRadius: 12, padding: 16, gap: 10 }}>
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>بيانات دخول بوابة إدارة الاتحاد</Text>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted }}>اسم المستخدم</Text>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#6366F1" }}>{grantResult2?.username}</Text>
              </View>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted }}>كلمة المرور المؤقتة</Text>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#F59E0B" }}>{grantResult2?.temp_password}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" }}>
              أرسل هذه البيانات للعضو — لا يمكن استعادة كلمة المرور لاحقاً
            </Text>
            <TouchableOpacity onPress={() => setGrantResult2(null)}
              style={{ backgroundColor: "#6366F1", borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" }}>حسناً — تم التسجيل</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 12, paddingBottom: 6, gap: 8 }}>
        <TouchableOpacity
          onPress={() => {
            const LABELS: Record<JoinSub, string> = { student_union: "اتحاد_الطلاب", women: "النساء", occasions: "مناسبتي", union_partner: "شراكات_الاتحادات", union_manager: "مديرو_الاتحادات", edu_reg: "تسجيل_طلاب", edu_transfer: "نقل_قيد", travel_agency: "وكالات_سفر" };
            const rows = items.map(x => ({ الاسم: x.full_name||x.contact_person||x.name||x.applicant_name||"", الهاتف: x.phone||"", البريد: x.email||"", الحالة: x.status||"", التاريخ: x.created_at ? new Date(x.created_at).toLocaleDateString("ar-SA") : "" }));
            exportToCSV(rows, `طلبات_${LABELS[sub]}.csv`);
          }}
          style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#FFFFFF08", borderWidth: 1, borderColor: "#FFFFFF15" }}>
          <Ionicons name="download-outline" size={13} color={Colors.textMuted} />
          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.textMuted }}>تصدير CSV</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "left" }}>{items.length} سجل</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, flexDirection: "row-reverse", alignItems: "center" }}>
        {SUB_TABS.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setSub(t.key)}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
              backgroundColor: sub === t.key ? Colors.primary : "#FFFFFF0A",
              borderWidth: 1, borderColor: sub === t.key ? Colors.primary : "#FFFFFF15" }}>
            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12,
              color: sub === t.key ? "#fff" : "#9CA3AF" }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> :
         items.length === 0 ? (
          <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>
            لا توجد طلبات
          </Text>
        ) : items.map(item => {
          const st = item.status ?? "pending";
          const isPending = !item.status || item.status === "pending";
          const isApproved = item.status === "approved";
          return (
            <View key={item.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1,
              borderColor: Colors.borderSubtle, padding: 16, marginBottom: 14,
              borderRightWidth: 4, borderRightColor: SC[st] ?? "#F59E0B" }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, flex: 1, textAlign: "right" }}>
                  {getTitle(item)}
                </Text>
                <View style={{ backgroundColor: (SC[st] ?? "#888") + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: SC[st] ?? "#888" }}>
                    {SL[st] ?? st}
                  </Text>
                </View>
              </View>
              {!!getSub(item) && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>{getSub(item)}</Text>}
              {!!getDesc(item) && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 18, marginBottom: 8 }} numberOfLines={3}>{getDesc(item)}</Text>}
              {item.created_at && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textDisabled, textAlign: "right", marginBottom: 10 }}>{new Date(item.created_at).toLocaleDateString("ar-EG")}</Text>}
              {/* أزرار قبول/رفض للمعلق */}
              {sub !== "women" && isPending && (
                <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                  <TouchableOpacity onPress={() => review(item.id, "rejected")}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "#EF444420", alignItems: "center", borderWidth: 1, borderColor: "#EF4444" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#EF4444", fontSize: 13 }}>رفض</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => review(item.id, "approved")}
                    style={{ flex: 2, paddingVertical: 10, borderRadius: 10, backgroundColor: "#10B981", alignItems: "center" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#fff", fontSize: 13 }}>قبول</Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* زر منح صلاحيات الاتحاد للمقبولين - طلبات الطلاب */}
              {sub === "student_union" && isApproved && (
                <TouchableOpacity onPress={() => grantStudentUnionManager(item.id)} disabled={granting2 === item.id}
                  style={{ marginTop: 8, paddingVertical: 10, borderRadius: 10, backgroundColor: "#7C3AED", alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 6 }}>
                  {granting2 === item.id ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>منح صلاحيات إدارة الإتحاد</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {/* زر منح بيانات الدخول لمديري الاتحادات المقبولين */}
              {sub === "union_manager" && isApproved && (
                <TouchableOpacity
                  onPress={() => grantUnionManagerCredentials(item.id)}
                  disabled={grantingUnionMgr === item.id}
                  style={{ marginTop: 8, paddingVertical: 11, borderRadius: 10, backgroundColor: "#059669", alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 6 }}
                >
                  {grantingUnionMgr === item.id ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <Ionicons name="key-outline" size={14} color="#fff" />
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>منح بيانات الدخول</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ─── عرض دعوات وكالات السفر ─── */}
      {sub === "travel_agency" && (
        <View style={{ marginTop: 8 }}>
          {/* toggle الطلبات / الدعوات */}
          <View style={{ flexDirection: "row-reverse", gap: 8, paddingHorizontal: 12, paddingBottom: 10 }}>
            {(["apps", "invitations"] as const).map(v => (
              <TouchableOpacity key={v} onPress={() => setTaView(v)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                  backgroundColor: taView === v ? "#1D4ED8" : "#FFFFFF0A",
                  borderWidth: 1, borderColor: taView === v ? "#3B82F6" : "#FFFFFF15" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: taView === v ? "#fff" : "#9CA3AF" }}>
                  {v === "apps" ? "الطلبات" : "✉️ الدعوات"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {taView === "invitations" && (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

              {/* زر إنشاء دعوة جديدة */}
              <TouchableOpacity
                onPress={() => setShowInvForm(v => !v)}
                style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: showInvForm ? "#FFFFFF12" : "#1D4ED820", borderWidth: 1, borderColor: "#3B82F640", marginBottom: 12 }}>
                <Ionicons name={showInvForm ? "chevron-up" : "add-circle-outline"} size={18} color="#60A5FA" />
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#60A5FA", flex: 1, textAlign: "right" }}>
                  {showInvForm ? "إخفاء نموذج الدعوة" : "إنشاء دعوة جديدة"}
                </Text>
                <TouchableOpacity onPress={loadInvitations} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "#FFFFFF0A" }}>
                  <Ionicons name="refresh" size={13} color={Colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>

              {/* نموذج الدعوة */}
              {showInvForm && (
                <View style={{ backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: "#3B82F630", padding: 16, marginBottom: 16, gap: 10 }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right", marginBottom: 4 }}>✉️ بيانات الدعوة</Text>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>اسم الوكالة *</Text>
                      <TextInput value={invAgencyName} onChangeText={setInvAgencyName} placeholder="وكالة عاشق طيبة" placeholderTextColor={Colors.textMuted}
                        style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right" }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>اسم المسؤول</Text>
                      <TextInput value={invContactName} onChangeText={setInvContactName} placeholder="الاسم الكامل" placeholderTextColor={Colors.textMuted}
                        style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right" }} />
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>الهاتف</Text>
                      <TextInput value={invPhone} onChangeText={setInvPhone} placeholder="+249..." placeholderTextColor={Colors.textMuted} keyboardType="phone-pad"
                        style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right" }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>واتساب</Text>
                      <TextInput value={invWhatsapp} onChangeText={setInvWhatsapp} placeholder="+966..." placeholderTextColor={Colors.textMuted} keyboardType="phone-pad"
                        style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right" }} />
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>البريد الإلكتروني</Text>
                      <TextInput value={invEmail} onChangeText={setInvEmail} placeholder="info@agency.com" placeholderTextColor={Colors.textMuted} keyboardType="email-address" autoCapitalize="none"
                        style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right" }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>المدينة</Text>
                      <TextInput value={invCity} onChangeText={setInvCity} placeholder="الحصاحيصا" placeholderTextColor={Colors.textMuted}
                        style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right" }} />
                    </View>
                  </View>

                  <View>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 6 }}>نوع الوكالة</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, flexDirection: "row-reverse" }}>
                      {(["local","international","hajj_umrah","tourism","corporate"] as const).map(t => {
                        const EMOJI: Record<string,string> = { local:"🇸🇩", international:"✈️", hajj_umrah:"🕋", tourism:"🌍", corporate:"💼" };
                        const LABEL: Record<string,string> = { local:"محلية", international:"دولية", hajj_umrah:"حج وعمرة", tourism:"سياحة", corporate:"شركات" };
                        return (
                          <TouchableOpacity key={t} onPress={() => setInvAgencyType(t)}
                            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                              backgroundColor: invAgencyType === t ? "#1D4ED820" : "#FFFFFF08",
                              borderColor: invAgencyType === t ? "#3B82F6" : "#FFFFFF15" }}>
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: invAgencyType === t ? "#60A5FA" : Colors.textMuted }}>
                              {EMOJI[t]} {LABEL[t]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>ملاحظة للوكالة</Text>
                    <TextInput value={invNote} onChangeText={setInvNote} placeholder="نص الدعوة الذي سيراه المدعو..." placeholderTextColor={Colors.textMuted} multiline
                      style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right", minHeight: 60, textAlignVertical: "top" }} />
                  </View>

                  <TouchableOpacity onPress={createInvitation} disabled={invSubmitting}
                    style={{ paddingVertical: 12, borderRadius: 12, backgroundColor: "#1D4ED8", alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 8, opacity: invSubmitting ? 0.6 : 1 }}>
                    {invSubmitting ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <Ionicons name="send-outline" size={16} color="#fff" />
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" }}>إرسال الدعوة</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* قائمة الدعوات */}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <Text style={{ flex: 1, fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" }}>
                  {invitations.length} دعوة مرسلة
                </Text>
              </View>

              {invLoading ? <ActivityIndicator color="#3B82F6" style={{ marginTop: 30 }} /> :
               invitations.length === 0 ? (
                <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 30 }}>
                  لا توجد دعوات مرسلة بعد
                </Text>
              ) : invitations.map(inv => {
                const INV_STATUS_COLOR: Record<string,string> = { pending: "#F59E0B", opened: "#3B82F6", applied: "#10B981", expired: "#6B7280" };
                const INV_STATUS_LABEL: Record<string,string> = { pending: "لم تُفتح", opened: "مفتوحة", applied: "تم التقديم", expired: "منتهية" };
                const st = inv.status || "pending";
                const color = INV_STATUS_COLOR[st] || "#F59E0B";
                return (
                  <View key={inv.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: color + "40", borderRightWidth: 4, borderRightColor: color, padding: 14, marginBottom: 10 }}>
                    <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }}>{inv.agency_name}</Text>
                      <View style={{ backgroundColor: color + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color }}>{INV_STATUS_LABEL[st] || st}</Text>
                      </View>
                    </View>
                    {inv.contact_name && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>👤 {inv.contact_name}</Text>}
                    {inv.phone && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>📞 {inv.phone}</Text>}
                    {inv.city && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>📍 {inv.city}</Text>}
                    {inv.note && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginBottom: 6, lineHeight: 18 }} numberOfLines={2}>{inv.note}</Text>}
                    <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textDisabled }}>
                        أُنشئت: {new Date(inv.created_at).toLocaleDateString("ar-EG")}
                      </Text>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textDisabled }}>
                        تنتهي: {new Date(inv.expires_at).toLocaleDateString("ar-EG")}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                      <TouchableOpacity onPress={() => copyInviteLink(inv)}
                        style={{ flex: 2, paddingVertical: 9, borderRadius: 10, backgroundColor: "#1D4ED820", borderWidth: 1, borderColor: "#3B82F650", alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 5 }}>
                        <Ionicons name="copy-outline" size={14} color="#60A5FA" />
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#60A5FA" }}>نسخ الرابط</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteInvitation(inv.id)} disabled={invActing === inv.id}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: "#EF444420", borderWidth: 1, borderColor: "#EF444450", alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 5 }}>
                        {invActing === inv.id ? <ActivityIndicator size="small" color="#EF4444" /> : (
                          <>
                            <Ionicons name="trash-outline" size={14} color="#EF4444" />
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#EF4444" }}>حذف</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* ─── عرض إدارة مدراء الاتحادات ─── */}
      {sub === "union_manager" && (
        <View style={{ marginTop: 8 }}>
          {/* toggle الطلبات / المدراء */}
          <View style={{ flexDirection: "row-reverse", gap: 8, paddingHorizontal: 12, paddingBottom: 10 }}>
            {(["apps", "managers"] as const).map(v => (
              <TouchableOpacity key={v} onPress={() => setMgrView(v)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                  backgroundColor: mgrView === v ? "#059669" : "#FFFFFF0A",
                  borderWidth: 1, borderColor: mgrView === v ? "#059669" : "#FFFFFF15" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: mgrView === v ? "#fff" : "#9CA3AF" }}>
                  {v === "apps" ? "الطلبات" : "المدراء"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mgrView === "managers" && (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {/* زر تصدير CSV للمدراء */}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", marginBottom: 10, gap: 8 }}>
                <TouchableOpacity onPress={() => exportToCSV(managers.map(m => ({ الاسم: m.full_name, اسم_المستخدم: m.username, الهاتف: m.phone||"", البريد: m.email||"", الحالة: m.is_active ? "نشط" : "معلق", تاريخ_الإنشاء: m.created_at ? new Date(m.created_at).toLocaleDateString("ar-SA") : "" })), "مدراء_الاتحادات.csv")}
                  style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#FFFFFF08", borderWidth: 1, borderColor: "#FFFFFF15" }}>
                  <Ionicons name="download-outline" size={13} color={Colors.textMuted} />
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.textMuted }}>تصدير CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={loadManagers}
                  style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: "#FFFFFF08", borderWidth: 1, borderColor: "#FFFFFF15" }}>
                  <Ionicons name="refresh" size={13} color={Colors.textMuted} />
                </TouchableOpacity>
                <Text style={{ flex: 1, fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "left" }}>{managers.length} مدير</Text>
              </View>

              {mgrLoading ? <ActivityIndicator color="#059669" style={{ marginTop: 30 }} /> :
               managers.length === 0 ? (
                <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 30 }}>لا يوجد مدراء مسجلون</Text>
              ) : managers.map(m => (
                <View key={m.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1,
                  borderColor: m.is_active ? "#05966940" : "#EF444440", padding: 14, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text }}>{m.full_name}</Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                      backgroundColor: m.is_active ? "#05966920" : "#EF444420" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10,
                        color: m.is_active ? "#10B981" : "#EF4444" }}>
                        {m.is_active ? "● نشط" : "◌ معلق"}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>
                    اسم المستخدم: <Text style={{ color: Colors.text, fontFamily: "Cairo_600SemiBold" }}>{m.username}</Text>
                  </Text>
                  {m.phone && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>📞 {m.phone}</Text>}
                  {m.institution && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>{m.institution}</Text>}
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 4 }}>
                    {new Date(m.created_at).toLocaleDateString("ar-SA")}
                  </Text>

                  <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
                    {/* تعليق / تفعيل */}
                    <TouchableOpacity
                      onPress={() => toggleManager(m.id, !m.is_active)}
                      disabled={mgrActing === m.id}
                      style={{ flex: 2, paddingVertical: 9, borderRadius: 10, alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 5,
                        backgroundColor: m.is_active ? "#F59E0B20" : "#05966920",
                        borderWidth: 1, borderColor: m.is_active ? "#F59E0B50" : "#05966950" }}>
                      {mgrActing === m.id ? <ActivityIndicator size="small" color={m.is_active ? "#F59E0B" : "#10B981"} /> : (
                        <>
                          <Ionicons name={m.is_active ? "pause-circle-outline" : "play-circle-outline"} size={15} color={m.is_active ? "#F59E0B" : "#10B981"} />
                          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: m.is_active ? "#F59E0B" : "#10B981" }}>
                            {m.is_active ? "تعليق النشاط" : "إعادة التفعيل"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {/* حذف */}
                    <TouchableOpacity
                      onPress={() => deleteManager(m.id, m.full_name)}
                      disabled={mgrActing === m.id}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 5,
                        backgroundColor: "#EF444420", borderWidth: 1, borderColor: "#EF444450" }}>
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#EF4444" }}>حذف</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const { user, token, isLoading: authLoading, refreshBackendToken, loginAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  // ── Overview ──
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // ── Firebase health + sync ──
  const [fbHealth, setFbHealth]         = useState<any | null>(null);
  const [fbSyncing, setFbSyncing]       = useState(false);
  const [fbSyncResult, setFbSyncResult] = useState<any | null>(null);
  const [migrateUrl, setMigrateUrl]     = useState("");
  const [migrating, setMigrating]       = useState(false);
  const [migrateResult, setMigrateResult] = useState<any | null>(null);
  const [fbSaJson, setFbSaJson]         = useState("");
  const [fbSaJsonSaving, setFbSaJsonSaving] = useState(false);
  const [fbSaJsonResult, setFbSaJsonResult] = useState<any | null>(null);
  const [showFbSaForm, setShowFbSaForm] = useState(false);

  // ── Users ──
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [roleModal, setRoleModal] = useState<AdminUser | null>(null);
  const [roleChanging, setRoleChanging] = useState(false);
  const [permModal, setPermModal] = useState<AdminUser | null>(null);
  const [permSections, setPermSections] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);
  const [memberSort, setMemberSort] = useState<"newest" | "oldest" | "name">("newest");
  const [memberNbrFilter, setMemberNbrFilter] = useState<string>("all");
  const [promoTarget, setPromoTarget] = useState<AdminUser | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  // ── User Stats Modal ──
  const [statsUser, setStatsUser] = useState<AdminUser | null>(null);
  const [userStats, setUserStats] = useState<null | {
    user: AdminUser & { bio?: string; is_banned?: boolean };
    posts_count: number; comments_count: number; likes_count: number;
    reports_count: number; messages_count: number; ads_count: number;
    appointments_count: number; last_seen: string | null;
  }>(null);
  const [loadingUserStats, setLoadingUserStats] = useState(false);

  // ── Landmarks ──
  const [landmarks, setLandmarks] = useState<ApiLandmark[]>([]);
  const [loadingLM, setLoadingLM] = useState(false);
  const [lmForm, setLmForm] = useState({ name: "", sub: "", image_url: "" });
  const [addingLM, setAddingLM] = useState(false);
  const [showAddLM, setShowAddLM] = useState(false);
  const [lmAddImgUploading, setLmAddImgUploading] = useState(false);
  const [editingLM, setEditingLM] = useState<ApiLandmark | null>(null);
  const [editLmForm, setEditLmForm] = useState({ name: "", sub: "", image_url: "" });
  const [showEditLM, setShowEditLM] = useState(false);
  const [updatingLM, setUpdatingLM] = useState(false);
  const [lmEditImgUploading, setLmEditImgUploading] = useState(false);

  // ── Honored Figures ──
  const [honoredList, setHonoredList]       = useState<HonoredFigure[]>([]);
  const [loadingHonored, setLoadingHonored] = useState(false);
  const [showAddHonor, setShowAddHonor]     = useState(false);
  const [addingHonor, setAddingHonor]       = useState(false);
  const [honorImgUploading, setHonorImgUploading] = useState(false);
  const [editingHonor, setEditingHonor]     = useState<HonoredFigure | null>(null);
  const [showEditHonor, setShowEditHonor]   = useState(false);
  const [updatingHonor, setUpdatingHonor]   = useState(false);
  const [editHonorImgUploading, setEditHonorImgUploading] = useState(false);
  const HONOR_FORM_INIT = { name: "", title: "", city_role: "", photo_url: "", tribute: "", start_date: "", end_date: "" };
  const [honorForm, setHonorForm]           = useState(HONOR_FORM_INIT);
  const [editHonorForm, setEditHonorForm]   = useState(HONOR_FORM_INIT);

  // ── Ads ──
  const [adsList, setAdsList] = useState<AdRecord[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [adsFilter, setAdsFilter] = useState<"all" | "pending" | "active" | "rejected" | "expired">("all");
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [adDetailModal, setAdDetailModal] = useState<AdRecord | null>(null);
  const [approvalDays, setApprovalDays] = useState("7");
  const [adminNote, setAdminNote] = useState("");

  // ── Ads Settings ──
  const [adsSettings, setAdsSettings] = useState({
    ad_price_per_day: "500", ad_contact_phone: "", ad_contact_whatsapp: "",
    ad_promo_text: "", ad_partner_email: "", ad_bank_info: "",
  });
  const [savingAdsSettings, setSavingAdsSettings] = useState(false);
  const [showAdsSettingsModal, setShowAdsSettingsModal] = useState(false);

  // ── Contract Settings ──
  const [contractWhatsapp, setContractWhatsapp] = useState("+966597083352");
  const [savingContractSettings, setSavingContractSettings] = useState(false);

  // ── Neighborhoods ──
  const [neighborhoods, setNeighborhoods] = useState<NbrItem[]>([]);
  const [loadingNbr, setLoadingNbr] = useState(false);
  const [seedingNbr, setSeedingNbr] = useState(false);
  const [nbrForm, setNbrForm] = useState<{ label: string; type: "neighborhood" | "village" }>({ label: "", type: "neighborhood" });
  const [addingNbr, setAddingNbr] = useState(false);
  const [editingNbr, setEditingNbr] = useState<NbrItem | null>(null);
  const [showAddNbr, setShowAddNbr] = useState(false);
  const [nbrFilter, setNbrFilter] = useState<"all" | "neighborhood" | "village">("all");
  const [nbrSearch, setNbrSearch] = useState("");

  // ── AI Settings ──
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [aiForm, setAiForm] = useState({ ai_api_key: "", ai_enabled: "false", ai_system_prompt: "" });
  const [showApiKey, setShowApiKey] = useState(false);

  // ── Transport ──
  const [transportStatus, setTransportStatus] = useState<"coming_soon" | "maintenance" | "available">("coming_soon");
  const [transportNote, setTransportNote] = useState("");
  const [transportPhone, setTransportPhone] = useState("");
  const [savingTransportSettings, setSavingTransportSettings] = useState(false);
  const [loadingTransport, setLoadingTransport] = useState(false);
  const [transportDrivers, setTransportDrivers] = useState<TransportDriver[]>([]);
  const [transportTrips, setTransportTrips] = useState<TransportTrip[]>([]);
  const [transportDriverFilter, setTransportDriverFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [transportTripFilter, setTransportTripFilter] = useState<"all" | "pending" | "accepted" | "completed" | "cancelled">("all");
  const [transportStats, setTransportStats] = useState<{ drivers: any[]; trips: any[]; pendingDrivers: number } | null>(null);
  const [transportView, setTransportView] = useState<"overview" | "fares" | "drivers" | "trips" | "settings">("overview");
  const [fareMatrix, setFareMatrix] = useState<Record<number, Record<number, { car: number; rickshaw: number; delivery: number }>>>({});
  const [editingFares, setEditingFares] = useState<Record<string, { car: string; rickshaw: string; delivery: string }>>({});
  const [savingFares, setSavingFares] = useState(false);
  const [assigningTrip, setAssigningTrip] = useState<number | null>(null);
  const [showAssignModal,   setShowAssignModal]   = useState(false);
  const [assigningTripId,   setAssigningTripId]   = useState<number | null>(null);
  const [approvedDriversList, setApprovedDriversList] = useState<TransportDriver[]>([]);
  const [updatingTripId,    setUpdatingTripId]    = useState<number | null>(null);
  const [lastPendingAdminCount, setLastPendingAdminCount] = useState(0);

  // ── Updates ──
  const [appVersion, setAppVersion]       = useState("1");
  const [updateNotes, setUpdateNotes]     = useState("");
  const [updateForce, setUpdateForce]     = useState(false);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [savingUpdates, setSavingUpdates] = useState(false);

  // ── Phone Shops (Admin) ──
  const [adminPhoneShops, setAdminPhoneShops] = useState<any[]>([]);
  const [loadingPhoneShops, setLoadingPhoneShops] = useState(false);
  const [deletingPhoneShopId, setDeletingPhoneShopId] = useState<number | null>(null);

  // ── Student Libraries (Admin) ──
  const [adminLibraries, setAdminLibraries] = useState<any[]>([]);
  const [loadingAdminLibs, setLoadingAdminLibs] = useState(false);
  const [deletingLibId, setDeletingLibId] = useState<number | null>(null);

  // ── Merchants (Admin) ──
  const [adminMerchants, setAdminMerchants] = useState<any[]>([]);
  const [loadingAdminMerchants, setLoadingAdminMerchants] = useState(false);
  const [deletingMerchantId, setDeletingMerchantId] = useState<number | null>(null);
  const [marketOrders, setMarketOrders] = useState<any[]>([]);
  const [loadingMarketOrders, setLoadingMarketOrders] = useState(false);

  // ── Reports Admin ──
  const [adminReports, setAdminReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsActing, setReportsActing] = useState<number | null>(null);
  const [reportsFilter, setReportsFilter] = useState<"all"|"pending"|"inProgress"|"resolved">("all");

  // ── Missing Persons Admin ──
  const [adminMissing, setAdminMissing] = useState<any[]>([]);
  const [loadingMissing, setLoadingMissing] = useState(false);
  const [missingActing, setMissingActing] = useState<number | null>(null);

  // ── Emergency Numbers Admin ──
  const [adminNumbers, setAdminNumbers] = useState<any[]>([]);
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [numbersActing, setNumbersActing] = useState<number | null>(null);
  const [showNumberForm, setShowNumberForm] = useState(false);
  const [editingNumber, setEditingNumber] = useState<any | null>(null);
  const [numForm, setNumForm] = useState({ name:"", number:"", category:"عام", icon:"call", color:"#F97316", note:"", sort_order:"99" });
  const [savingNumber, setSavingNumber] = useState(false);

  // ── Factories Admin ──
  const [adminFactories, setAdminFactories] = useState<any[]>([]);
  const [loadingFactories, setLoadingFactories] = useState(false);
  const [factoriesActing, setFactoriesActing] = useState<number | null>(null);

  // ── Farmers Admin ──
  const [adminFarmers, setAdminFarmers] = useState<{ crops: any[]; lands: any[]; tools: any[]; workers: any[] }>({ crops:[], lands:[], tools:[], workers:[] });
  const [loadingFarmers, setLoadingFarmers] = useState(false);
  const [farmersActing, setFarmersActing] = useState<string | null>(null);
  const [farmersSub, setFarmersSub] = useState<"crops"|"lands"|"tools"|"workers">("crops");

  // ── Rentals Admin ──
  const [adminRentals, setAdminRentals] = useState<any[]>([]);
  const [adminContracts, setAdminContracts] = useState<any[]>([]);
  const [loadingRentals, setLoadingRentals] = useState(false);
  const [rentalsActing, setRentalsActing] = useState<number | null>(null);
  const [rentalView, setRentalView] = useState<"listings"|"contracts">("listings");

  // ── Jobs Admin ──
  const [adminJobs, setAdminJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsActing, setJobsActing] = useState<number | null>(null);
  const [jobsFilter, setJobsFilter] = useState<"all"|"active"|"inactive">("all");

  // ── Ratings Admin ──
  const [adminRatings, setAdminRatings] = useState<any[]>([]);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [ratingsActing, setRatingsActing] = useState<number | null>(null);

  // ── Feedback Admin ──
  const [adminFeedback, setAdminFeedback] = useState<any[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [feedbackActing, setFeedbackActing] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [replyText, setReplyText] = useState("");

  // ── Security ──
  const [pinForm, setPinForm] = useState({ current: "", newPin: "", confirm: "" });
  const [savingPin, setSavingPin] = useState(false);
  const [adminNameForm, setAdminNameForm] = useState({ name: "" });
  const [savingName, setSavingName] = useState(false);
  const [loadingSecurity, setLoadingSecurity] = useState(false);

  // ── Communities ──
  const [communitiesList, setCommunitiesList] = useState<CommunityRecord[]>([]);
  const [loadingCommunities, setLoadingCommunities] = useState(false);
  const [communityFilter, setCommunityFilter] = useState<"all" | "pending" | "active" | "rejected" | "suspended">("pending");
  const [communityDetailModal, setCommunityDetailModal] = useState<CommunityRecord | null>(null);
  const [approvingCommunityId, setApprovingCommunityId] = useState<number | null>(null);
  const [showCommunityForm, setShowCommunityForm] = useState(false);
  const [submittingCommunity, setSubmittingCommunity] = useState(false);
  const [communityForm, setCommunityForm] = useState({
    name: "", category: "institution", origin: "", description: "",
    representative_name: "", representative_title: "", representative_phone: "",
    representative_national_id: "", representative_email: "",
    contact_phone: "", neighborhood: "", services: "",
  });
  const [suspendModal, setSuspendModal] = useState<CommunityRecord | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  // ── Service Requests ──
  const [svcRequests, setSvcRequests] = useState<AdminServiceRequest[]>([]);
  const [loadingSvcReqs, setLoadingSvcReqs] = useState(false);
  const [decidingSvcReqId, setDecidingSvcReqId] = useState<number | null>(null);
  const [svcReqsFilter, setSvcReqsFilter] = useState<"pending" | "approved" | "rejected">("pending");

  useEffect(() => {
    const current = countPendingAdminItems({
      ads: adsList,
      communities: communitiesList,
      serviceRequests: svcRequests,
      drivers: transportDrivers,
      trips: transportTrips,
    });

    alertForNewPendingAdminItems(lastPendingAdminCount, current);
    setLastPendingAdminCount(current);
  }, [adsList, communitiesList, svcRequests, transportDrivers, transportTrips]);

  const isAdmin = user?.role === "admin";
  const isMod   = user?.role === "moderator";
  const modPerms = (user?.permissions ?? []) as string[];

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin && !isMod) router.replace("/(tabs)/" as any);
  }, [user, authLoading, isAdmin, isMod]);

  // ── Admin PIN fallback (for silent re-auth when session is stale) ─────────
  // Stores the working PIN in memory so we never show a form unless truly needed
  const adminPinRef = React.useRef<string>("4444");

  // ── Data fetchers ────────────────────────────────────────────────────────
  const [statsError, setStatsError] = useState<string | null>(null);
  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);
    try {
      // 1. Try with current token
      let res = await apiFetch("/api/admin/dashboard-stats", token);

      // 2. Token stale → try Firebase refresh silently
      if ((res.status === 401 || res.status === 403) && refreshBackendToken) {
        const newToken = await refreshBackendToken();
        if (newToken) res = await apiFetch("/api/admin/dashboard-stats", newToken);
      }

      // 3. Still failing → silent PIN fallback (no UI prompt)
      if ((res.status === 401 || res.status === 403)) {
        res = await apiFetch("/api/admin/dashboard-stats", token, {}, 30000, adminPinRef.current);
      }

      if (res.ok) {
        setStats(await safeJson(res));
      } else if (res.status === 401 || res.status === 403) {
        setStatsError("403");
      } else {
        setStatsError(`فشل التحميل (رمز ${res.status})`);
      }
    } catch (e: any) {
      setStatsError(`تعذّر الاتصال بالخادم: ${e?.message ?? "خطأ شبكة"}`);
    }
    finally { setLoadingStats(false); }
  }, [token, refreshBackendToken]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    let lastErr: any = null;
    let activeToken = token;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 1500));
        let res = await apiFetch("/api/admin/users", activeToken, {}, 45000);

        // Stale session — refresh and retry once on first attempt
        if ((res.status === 401 || res.status === 403) && attempt === 0 && refreshBackendToken) {
          const newToken = await refreshBackendToken();
          if (newToken) {
            activeToken = newToken;
            res = await apiFetch("/api/admin/users", activeToken, {}, 45000);
          }
        }

        if (res.ok) {
          const d = await safeJson(res);
          setUsers(Array.isArray(d) ? d : (d.users ?? []));
          setLoadingUsers(false);
          return;
        } else {
          const d = await safeJson(res).catch(() => ({}));
          lastErr = (d as any).error || `HTTP ${res.status}`;
          break;
        }
      } catch (e: any) {
        const isCanceled = e?.name === "AbortError" || e?.message?.includes("cancel") || e?.message?.includes("Cancel");
        if (isCanceled && attempt < 2) continue;
        if (!isCanceled) { lastErr = "تعذّر الاتصال بالخادم"; break; }
      }
    }
    if (lastErr) Alert.alert("خطأ في التحميل", lastErr);
    setLoadingUsers(false);
  }, [token, refreshBackendToken]);

  const loadFirebaseHealth = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/users-source-health", token);
      if (res.ok) setFbHealth(await safeJson(res));
    } catch {}
  }, [token]);

  const syncFirebaseNow = useCallback(async () => {
    setFbSyncing(true);
    setFbSyncResult(null);
    try {
      const res = await apiFetch("/api/admin/sync-firebase-users", token, { method: "POST" }, 60000);
      const d = await safeJson(res);
      setFbSyncResult(d);
      // أعد تحميل المستخدمين والإحصائيات بعد المزامنة
      await Promise.all([loadStats(), loadFirebaseHealth(), loadUsers()]);
    } catch (e: any) {
      setFbSyncResult({ error: e?.message ?? "فشل الاتصال" });
    }
    finally { setFbSyncing(false); }
  }, [token, loadStats, loadFirebaseHealth, loadUsers]);

  const migrateFromDb = useCallback(async (sourceUrl: string) => {
    if (!sourceUrl.trim()) return;
    setMigrating(true);
    setMigrateResult(null);
    try {
      const res = await apiFetch("/api/admin/migrate-users-from-db", token, {
        method: "POST",
        body: JSON.stringify({ source_db_url: sourceUrl.trim() }),
      }, 120000);
      const d = await safeJson(res);
      setMigrateResult(d);
      if ((d as any).migrated > 0) {
        await Promise.all([loadStats(), loadUsers()]);
      }
    } catch (e: any) {
      setMigrateResult({ error: e?.message ?? "فشل الاتصال" });
    } finally {
      setMigrating(false);
    }
  }, [token, loadStats, loadUsers]);

  const saveFbSaJson = useCallback(async () => {
    if (!fbSaJson.trim()) return;
    setFbSaJsonSaving(true);
    setFbSaJsonResult(null);
    try {
      const res = await apiFetch("/api/admin/set-firebase-credentials", token, {
        method: "POST",
        body: JSON.stringify({ firebase_sa_json: fbSaJson.trim() }),
      }, 30000);
      const d = await safeJson(res);
      setFbSaJsonResult(d);
      if ((d as any).ok) {
        setFbSaJson("");
        setShowFbSaForm(false);
        setTimeout(() => loadFirebaseHealth(), 3000);
      }
    } catch (e: any) {
      setFbSaJsonResult({ error: e?.message ?? "فشل الاتصال" });
    } finally {
      setFbSaJsonSaving(false);
    }
  }, [token, fbSaJson, loadFirebaseHealth]);

  const loadLandmarks = useCallback(async () => {
    setLoadingLM(true);
    try {
      const res = await apiFetch("/api/landmarks", token);
      if (res.ok) setLandmarks(await safeJson(res));
    } catch {}
    finally { setLoadingLM(false); }
  }, [token]);

  const loadAds = useCallback(async () => {
    setLoadingAds(true);
    try {
      const res = await apiFetch("/api/admin/ads", token);
      if (res.ok) setAdsList(await safeJson(res));
    } catch {}
    finally { setLoadingAds(false); }
  }, [token]);

  const loadNeighborhoods = useCallback(async () => {
    setLoadingNbr(true);
    try {
      const res = await apiFetch("/api/admin/neighborhoods", token);
      if (res.ok) {
        const data = await safeJson(res);
        if (Array.isArray(data) && data.length > 0) {
          setNeighborhoods(data);
          setLoadingNbr(false);
          return;
        }
      }
      // قاعدة البيانات فارغة — زرع الأحياء الافتراضية تلقائياً
      const { DEFAULT_HASAHISA_LOCATIONS } = await import("@/constants/neighborhoods");
      setSeedingNbr(true);
      const seedRes = await apiFetch("/api/admin/neighborhoods/seed", token, {
        method: "POST",
        body: JSON.stringify({ items: DEFAULT_HASAHISA_LOCATIONS, replace: false }),
      });
      if (seedRes.ok) {
        const { items } = await safeJson(seedRes);
        setNeighborhoods(items);
      } else {
        setNeighborhoods(DEFAULT_HASAHISA_LOCATIONS);
      }
    } catch {
      const { DEFAULT_HASAHISA_LOCATIONS } = await import("@/constants/neighborhoods");
      setNeighborhoods(DEFAULT_HASAHISA_LOCATIONS);
    } finally {
      setLoadingNbr(false);
      setSeedingNbr(false);
    }
  }, [token]);

  const restoreDefaultNeighborhoods = useCallback(() => {
    Alert.alert(
      "استعادة الافتراضيات",
      `سيتم حذف جميع الأحياء الحالية وإعادة تحميل القائمة الافتراضية (${57} حياً وقرية). هل أنت متأكد؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "استعادة",
          style: "destructive",
          onPress: async () => {
            setSeedingNbr(true);
            try {
              const { DEFAULT_HASAHISA_LOCATIONS } = await import("@/constants/neighborhoods");
              const res = await apiFetch("/api/admin/neighborhoods/seed", token, {
                method: "POST",
                body: JSON.stringify({ items: DEFAULT_HASAHISA_LOCATIONS, replace: true }),
              });
              if (res.ok) {
                const { items } = await safeJson(res);
                setNeighborhoods(items);
                Alert.alert("تم", `تم استعادة ${items.length} حياً وقرية بنجاح`);
              } else {
                Alert.alert("خطأ", "فشلت الاستعادة");
              }
            } catch {
              Alert.alert("خطأ", "تعذّرت العملية");
            } finally {
              setSeedingNbr(false);
            }
          },
        },
      ]
    );
  }, [token]);

  const loadAiSettings = useCallback(async () => {
    setLoadingAi(true);
    try {
      const res = await apiFetch("/api/admin/ai-settings", token);
      if (res.ok) {
        const data = await safeJson(res);
        setAiForm({ ai_api_key: data.ai_api_key || "", ai_enabled: data.ai_enabled || "false", ai_system_prompt: data.ai_system_prompt || "" });
      }
    } catch {}
    finally { setLoadingAi(false); }
  }, [token]);

  const loadTransportData = useCallback(async () => {
    setLoadingTransport(true);
    try {
      const [settingsRes, driversRes, tripsRes, statsRes, faresRes] = await Promise.all([
        apiFetch("/api/admin/transport/settings", token),
        apiFetch(`/api/admin/transport/drivers?status=${transportDriverFilter}`, token),
        apiFetch(`/api/admin/transport/trips?status=${transportTripFilter}`, token),
        apiFetch("/api/admin/transport/stats", token),
        fetch(`${getApiUrl()}/api/transport/fares`),
      ]);
      if (settingsRes.ok) {
        const d = await safeJson(settingsRes);
        const st = d.transport_status as "coming_soon" | "maintenance" | "available";
        setTransportStatus(["coming_soon","maintenance","available"].includes(st) ? st : "coming_soon");
        setTransportNote(d.transport_note || "");
        setTransportPhone(d.transport_phone || "");
      }
      if (driversRes.ok) setTransportDrivers(await safeJson(driversRes));
      if (tripsRes.ok) setTransportTrips(await safeJson(tripsRes));
      if (statsRes.ok) setTransportStats(await safeJson(statsRes));
      if (faresRes.ok) {
        const fm = await safeJson(faresRes);
        setFareMatrix(fm);
        // تهيئة قيم التعديل
        const init: Record<string, { car: string; rickshaw: string; delivery: string }> = {};
        for (let f = 1; f <= 5; f++) {
          for (let t = 1; t <= 5; t++) {
            const key = `${f}-${t}`;
            init[key] = {
              car: String(fm[f]?.[t]?.car ?? ""),
              rickshaw: String(fm[f]?.[t]?.rickshaw ?? ""),
              delivery: String(fm[f]?.[t]?.delivery ?? ""),
            };
          }
        }
        setEditingFares(init);
      }
    } catch {}
    finally { setLoadingTransport(false); }
  }, [token, transportDriverFilter, transportTripFilter]);

  const saveFares = async () => {
    setSavingFares(true);
    try {
      const fares: Array<{ from_zone: number; to_zone: number; fare_car: number; fare_rickshaw: number; fare_delivery: number }> = [];
      for (const key of Object.keys(editingFares)) {
        const [f, t] = key.split("-").map(Number);
        const v = editingFares[key];
        fares.push({
          from_zone: f, to_zone: t,
          fare_car: Number(v.car) || 0,
          fare_rickshaw: Number(v.rickshaw) || 0,
          fare_delivery: Number(v.delivery) || 0,
        });
      }
      const res = await apiFetch("/api/admin/transport/fares/bulk", token, {
        method: "PUT", body: JSON.stringify({ fares }),
      });
      if (res.ok) {
        Alert.alert("✅ تم الحفظ", "تم تحديث جدول التعرفة بنجاح");
        loadTransportData();
      } else {
        const j = await safeJson(res);
        Alert.alert("خطأ", j.error || "تعذّر حفظ التعرفة");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSavingFares(false); }
  };

  const updateFareField = (fromZ: number, toZ: number, field: "car" | "rickshaw" | "delivery", val: string) => {
    const key = `${fromZ}-${toZ}`;
    setEditingFares(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: val },
    }));
  };

  const saveTransportSettings = async () => {
    setSavingTransportSettings(true);
    try {
      const res = await apiFetch("/api/admin/transport/settings", token, {
        method: "PUT",
        body: JSON.stringify({
          transport_status: transportStatus,
          transport_note: transportNote,
          transport_phone: transportPhone,
        }),
      });
      if (res.ok) Alert.alert("✅ تم الحفظ", "تم تحديث إعدادات خدمة مشوارك علينا");
      else { const j = await safeJson(res); Alert.alert("خطأ", j.error || "تعذّر الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSavingTransportSettings(false); }
  };

  const approveTransportDriver = async (driver: TransportDriver, newStatus: "approved" | "rejected") => {
    try {
      const res = await apiFetch(`/api/admin/transport/drivers/${driver.id}`, token, {
        method: "PATCH", body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setTransportDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, status: newStatus } : d));
        Alert.alert("تم", newStatus === "approved" ? `تم قبول السائق ${driver.name}` : `تم رفض السائق ${driver.name}`);
      }
    } catch { Alert.alert("خطأ", "تعذّر العملية"); }
  };

  const deleteTransportDriver = async (id: number) => {
    Alert.alert("حذف سائق", "هل تريد حذف هذا السائق نهائياً؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        try {
          await apiFetch(`/api/admin/transport/drivers/${id}`, token, { method: "DELETE" });
          setTransportDrivers(prev => prev.filter(d => d.id !== id));
        } catch {}
      }},
    ]);
  };

  const deleteTransportTrip = async (id: number) => {
    try {
      await apiFetch(`/api/admin/transport/trips/${id}`, token, { method: "DELETE" });
      setTransportTrips(prev => prev.filter(t => t.id !== id));
    } catch {}
  };

  const loadApprovedDrivers = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/transport/drivers?status=approved", token);
      if (res.ok) setApprovedDriversList(await safeJson(res));
    } catch {}
  }, [token]);

  const openAssignModal = (tripId: number) => {
    setAssigningTripId(tripId);
    setShowAssignModal(true);
    loadApprovedDrivers();
  };

  const assignDriverToTrip = async (driver: TransportDriver) => {
    if (!assigningTripId) return;
    setAssigningTrip(assigningTripId);
    try {
      const res = await apiFetch(`/api/admin/transport/trips/${assigningTripId}/assign`, token, {
        method: "PATCH",
        body: JSON.stringify({ driver_id: driver.id, status: "accepted" }),
      });
      if (res.ok) {
        setTransportTrips(prev => prev.map(t =>
          t.id === assigningTripId
            ? { ...t, status: "accepted", driver_id: driver.id, driver_name: driver.name }
            : t
        ));
        setShowAssignModal(false);
        setAssigningTripId(null);
        Alert.alert("✅ تم التعيين", `تم تعيين السائق ${driver.name} للرحلة بنجاح`);
      } else {
        const j = await safeJson(res);
        Alert.alert("خطأ", j.error || "تعذّرت العملية");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setAssigningTrip(null); }
  };

  const updateTripStatus = async (tripId: number, newStatus: "accepted" | "completed" | "cancelled") => {
    setUpdatingTripId(tripId);
    try {
      const res = await apiFetch(`/api/transport/trips/${tripId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setTransportTrips(prev => prev.map(t =>
          t.id === tripId ? { ...t, status: newStatus } : t
        ));
      } else {
        Alert.alert("خطأ", "تعذّر تحديث حالة الرحلة");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setUpdatingTripId(null); }
  };

  const loadAdsSettings = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/ads/settings`);
      if (res.ok) {
        const data = await safeJson(res);
        setAdsSettings({
          ad_price_per_day:    data.ad_price_per_day    || "500",
          ad_contact_phone:    data.ad_contact_phone    || "",
          ad_contact_whatsapp: data.ad_contact_whatsapp || "",
          ad_promo_text:       data.ad_promo_text        || "",
          ad_partner_email:    data.ad_partner_email    || "",
          ad_bank_info:        data.ad_bank_info        || "",
        });
      }
    } catch {}
  }, []);

  const saveAdsSettings = async () => {
    setSavingAdsSettings(true);
    try {
      const res = await apiFetch("/api/admin/ads-settings", token, {
        method: "PUT", body: JSON.stringify(adsSettings),
      });
      if (res.ok) Alert.alert("✅ تم الحفظ", "تم تحديث إعدادات الإعلانات");
      else { const j = await safeJson(res); Alert.alert("خطأ", j.error || "تعذّر الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSavingAdsSettings(false); }
  };

  const loadContractSettings = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/contract-settings", token);
      if (res.ok) { const d = await safeJson(res); setContractWhatsapp(d.contract_whatsapp || "+966597083352"); }
    } catch {}
  }, [token]);

  const saveContractSettings = async () => {
    setSavingContractSettings(true);
    try {
      const res = await apiFetch("/api/admin/contract-settings", token, {
        method: "PUT", body: JSON.stringify({ contract_whatsapp: contractWhatsapp }),
      });
      if (res.ok) Alert.alert("✅ تم الحفظ", "تم تحديث رقم واتساب عقود المؤسسات");
      else { const j = await safeJson(res); Alert.alert("خطأ", j.error || "تعذّر الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSavingContractSettings(false); }
  };

  const loadSecurity = useCallback(async () => {
    setLoadingSecurity(true);
    try {
      const res = await apiFetch("/api/admin/name", token);
      if (res.ok) {
        const data = await safeJson(res);
        setAdminNameForm({ name: data.name || "" });
      }
    } catch {}
    finally { setLoadingSecurity(false); }
  }, [token]);

  const loadUpdates = useCallback(async () => {
    setLoadingUpdates(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/app/version`);
      if (res.ok) {
        const data = await safeJson(res);
        setAppVersion(String(data.version ?? 1));
        setUpdateNotes(data.notes ?? "");
        setUpdateForce(data.force ?? false);
      }
    } catch {}
    finally { setLoadingUpdates(false); }
  }, []);

  const loadAdminPhoneShops = useCallback(async () => {
    setLoadingPhoneShops(true);
    try {
      const res = await apiFetch("/api/admin/phone-shops", token);
      if (res.ok) { const d = await safeJson(res); setAdminPhoneShops(d.shops ?? []); }
    } catch {}
    finally { setLoadingPhoneShops(false); }
  }, [token]);

  const approvePhoneShop = useCallback(async (id: number, approved: boolean) => {
    try {
      await apiFetch(`/api/admin/phone-shops/${id}`, token, { method:"PUT", body:JSON.stringify({ is_approved:!approved }), headers:{"Content-Type":"application/json"} });
      setAdminPhoneShops(prev => prev.map(s => s.id===id ? {...s, is_approved:!approved} : s));
    } catch {}
  }, [token]);

  const verifyPhoneShop = useCallback(async (id: number, verified: boolean) => {
    try {
      await apiFetch(`/api/admin/phone-shops/${id}`, token, { method:"PUT", body:JSON.stringify({ is_verified:!verified }), headers:{"Content-Type":"application/json"} });
      setAdminPhoneShops(prev => prev.map(s => s.id===id ? {...s, is_verified:!verified} : s));
    } catch {}
  }, [token]);

  const featurePhoneShop = useCallback(async (id: number, featured: boolean) => {
    try {
      await apiFetch(`/api/admin/phone-shops/${id}`, token, { method:"PUT", body:JSON.stringify({ is_featured:!featured }), headers:{"Content-Type":"application/json"} });
      setAdminPhoneShops(prev => prev.map(s => s.id===id ? {...s, is_featured:!featured} : s));
    } catch {}
  }, [token]);

  const deletePhoneShop = useCallback(async (id: number) => {
    setDeletingPhoneShopId(id);
    try {
      await apiFetch(`/api/admin/phone-shops/${id}`, token, { method:"DELETE" });
      setAdminPhoneShops(prev => prev.filter(s => s.id!==id));
    } catch {}
    finally { setDeletingPhoneShopId(null); }
  }, [token]);

  const loadAdminLibraries = useCallback(async () => {
    setLoadingAdminLibs(true);
    try {
      const res = await apiFetch("/api/admin/student-libraries", token);
      if (res.ok) { const d = await safeJson(res); setAdminLibraries(Array.isArray(d) ? d : d.libraries ?? []); }
    } catch {}
    finally { setLoadingAdminLibs(false); }
  }, [token]);

  const deleteAdminLibrary = useCallback(async (id: number) => {
    setDeletingLibId(id);
    try {
      await apiFetch(`/api/admin/student-libraries/${id}`, token, { method: "DELETE" });
      setAdminLibraries(prev => prev.filter(l => l.id !== id));
    } catch {}
    finally { setDeletingLibId(null); }
  }, [token]);

  const toggleLibraryVerified = useCallback(async (id: number, verified: boolean) => {
    try {
      await apiFetch(`/api/admin/student-libraries/${id}`, token, { method: "PUT", body: JSON.stringify({ is_verified: !verified }), headers: { "Content-Type": "application/json" } });
      setAdminLibraries(prev => prev.map(l => l.id === id ? { ...l, is_verified: !verified } : l));
    } catch {}
  }, [token]);

  const loadAdminMerchants = useCallback(async () => {
    setLoadingAdminMerchants(true);
    try {
      const res = await apiFetch("/api/admin/merchants", token);
      if (res.ok) { const d = await safeJson(res); setAdminMerchants(Array.isArray(d) ? d : d.merchants ?? []); }
    } catch {}
    finally { setLoadingAdminMerchants(false); }
  }, [token]);

  const deleteAdminMerchant = useCallback(async (id: number) => {
    setDeletingMerchantId(id);
    try {
      await apiFetch(`/api/admin/merchants/${id}`, token, { method: "DELETE" });
      setAdminMerchants(prev => prev.filter(m => m.id !== id));
    } catch {}
    finally { setDeletingMerchantId(null); }
  }, [token]);

  const toggleMerchantVerified = useCallback(async (id: number, verified: boolean) => {
    try {
      await apiFetch(`/api/admin/merchants/${id}`, token, { method: "PUT", body: JSON.stringify({ is_verified: !verified }), headers: { "Content-Type": "application/json" } });
      setAdminMerchants(prev => prev.map(m => m.id === id ? { ...m, is_verified: !verified } : m));
    } catch {}
  }, [token]);

  const toggleMerchantFeatured = useCallback(async (id: number, featured: boolean) => {
    try {
      await apiFetch(`/api/admin/merchants/${id}`, token, { method: "PUT", body: JSON.stringify({ is_featured: !featured }), headers: { "Content-Type": "application/json" } });
      setAdminMerchants(prev => prev.map(m => m.id === id ? { ...m, is_featured: !featured } : m));
    } catch {}
  }, [token]);

  const approveMerchant = useCallback(async (id: number) => {
    try {
      await apiFetch(`/api/admin/merchants/${id}`, token, { method: "PUT", body: JSON.stringify({ status: "approved" }), headers: { "Content-Type": "application/json" } });
      setAdminMerchants(prev => prev.map(m => m.id === id ? { ...m, status: "approved" } : m));
    } catch {}
  }, [token]);

  const rejectMerchant = useCallback(async (id: number) => {
    try {
      await apiFetch(`/api/admin/merchants/${id}`, token, { method: "PUT", body: JSON.stringify({ status: "rejected" }), headers: { "Content-Type": "application/json" } });
      setAdminMerchants(prev => prev.map(m => m.id === id ? { ...m, status: "rejected" } : m));
    } catch {}
  }, [token]);

  const loadMarketOrders = useCallback(async () => {
    setLoadingMarketOrders(true);
    try {
      const res = await apiFetch("/api/admin/marketplace-orders", token);
      if (res.ok) { const d = await safeJson(res); setMarketOrders(Array.isArray(d) ? d : d.orders ?? []); }
    } catch {}
    finally { setLoadingMarketOrders(false); }
  }, [token]);

  const updateOrderStatus = useCallback(async (id: number, status: string) => {
    try {
      await apiFetch(`/api/admin/marketplace-orders/${id}`, token, { method: "PATCH", body: JSON.stringify({ status }), headers: { "Content-Type": "application/json" } });
      setMarketOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    } catch {}
  }, [token]);

  // ── load functions for new tabs ──────────────────────────────────────────
  const loadAdminReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const res = await apiFetch("/api/admin/reports", token);
      if (res.ok) { const d = await safeJson(res); setAdminReports(Array.isArray(d) ? d : []); }
    } catch {}
    finally { setLoadingReports(false); }
  }, [token]);

  const loadAdminMissing = useCallback(async () => {
    setLoadingMissing(true);
    try {
      const res = await apiFetch("/api/admin/lost-items", token);
      if (res.ok) { const d = await safeJson(res); setAdminMissing(Array.isArray(d) ? d : []); }
    } catch {}
    finally { setLoadingMissing(false); }
  }, [token]);

  const loadAdminNumbers = useCallback(async () => {
    setLoadingNumbers(true);
    try {
      const res = await apiFetch("/api/admin/emergency-numbers", token);
      if (res.ok) { const d = await safeJson(res); setAdminNumbers(Array.isArray(d) ? d : []); }
    } catch {}
    finally { setLoadingNumbers(false); }
  }, [token]);

  const loadAdminFactories = useCallback(async () => {
    setLoadingFactories(true);
    try {
      const res = await apiFetch("/api/admin/factories", token);
      if (res.ok) { const d = await safeJson(res); setAdminFactories(Array.isArray(d) ? d : d.factories ?? []); }
    } catch {}
    finally { setLoadingFactories(false); }
  }, [token]);

  const loadAdminFarmers = useCallback(async () => {
    setLoadingFarmers(true);
    try {
      const res = await apiFetch("/api/admin/farmers", token);
      if (res.ok) { const d = await safeJson(res); setAdminFarmers({ crops: d.crops??[], lands: d.lands??[], tools: d.tools??[], workers: d.workers??[] }); }
    } catch {}
    finally { setLoadingFarmers(false); }
  }, [token]);

  const loadAdminRentals = useCallback(async () => {
    setLoadingRentals(true);
    try {
      const [rL, rC] = await Promise.all([
        apiFetch("/api/admin/rentals", token),
        apiFetch("/api/admin/rentals/contracts", token),
      ]);
      if (rL.ok) { const d = await safeJson(rL); setAdminRentals(Array.isArray(d) ? d : d.listings??[]); }
      if (rC.ok) { const d = await safeJson(rC); setAdminContracts(Array.isArray(d) ? d : d.contracts??[]); }
    } catch {}
    finally { setLoadingRentals(false); }
  }, [token]);

  const loadAdminJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await apiFetch("/api/admin/jobs", token);
      if (res.ok) { const d = await safeJson(res); setAdminJobs(Array.isArray(d) ? d : []); }
    } catch {}
    finally { setLoadingJobs(false); }
  }, [token]);

  const loadAdminRatings = useCallback(async () => {
    setLoadingRatings(true);
    try {
      const res = await apiFetch("/api/admin/ratings", token);
      if (res.ok) { const d = await safeJson(res); setAdminRatings(Array.isArray(d) ? d : []); }
    } catch {}
    finally { setLoadingRatings(false); }
  }, [token]);

  const loadAdminFeedback = useCallback(async () => {
    setLoadingFeedback(true);
    try {
      const res = await apiFetch("/api/admin/feedback", token);
      if (res.ok) { const d = await safeJson(res); setAdminFeedback(Array.isArray(d) ? d : []); }
    } catch {}
    finally { setLoadingFeedback(false); }
  }, [token]);

  const loadCommunities = useCallback(async () => {
    setLoadingCommunities(true);
    try {
      const res = await apiFetch("/api/admin/communities", token);
      if (res.ok) setCommunitiesList(await safeJson(res));
    } catch {}
    finally { setLoadingCommunities(false); }
  }, [token]);

  const loadServiceRequests = useCallback(async (statusFilter = "pending") => {
    setLoadingSvcReqs(true);
    try {
      const res = await apiFetch(`/api/moderator/service-requests?status=${statusFilter}`, token);
      if (res.ok) setSvcRequests(await safeJson(res));
    } catch {}
    finally { setLoadingSvcReqs(false); }
  }, [token]);

  const decideServiceRequest = async (id: number, decision: "approved" | "rejected") => {
    setDecidingSvcReqId(id);
    try {
      const res = await apiFetch(`/api/moderator/service-requests/${id}`, token, {
        method: "PATCH", body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        setSvcRequests(prev => prev.filter(r => r.id !== id));
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const j = await safeJson(res);
        Alert.alert("خطأ", j.error || "تعذّر تنفيذ القرار");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال"); }
    finally { setDecidingSvcReqId(null); }
  };

  const updateCommunityStatus = async (
    c: CommunityRecord,
    status: "active" | "rejected" | "suspended",
    suspension_reason?: string,
  ) => {
    setApprovingCommunityId(c.id);
    try {
      const res = await apiFetch(`/api/admin/communities/${c.id}/status`, token, {
        method: "PUT", body: JSON.stringify({ status, suspension_reason }),
      });
      if (res.ok) {
        const updated = await safeJson(res);
        setCommunitiesList(prev => prev.map(x => x.id === c.id ? { ...x, ...updated } : x));
        setCommunityDetailModal(null);
        setSuspendModal(null);
        setSuspendReason("");
      } else {
        const err = await safeJson(res);
        Alert.alert("خطأ", err.error || "فشل التحديث");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setApprovingCommunityId(null); }
  };

  const deleteCommunity = async (c: CommunityRecord) => {
    try {
      await apiFetch(`/api/admin/communities/${c.id}`, token, { method: "DELETE" });
      setCommunitiesList(prev => prev.filter(x => x.id !== c.id));
      setCommunityDetailModal(null);
    } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
  };

  const submitCommunity = async () => {
    if (!communityForm.name.trim() || !communityForm.contact_phone.trim()) {
      Alert.alert("بيانات ناقصة", "اسم المؤسسة ورقم التواصل مطلوبان");
      return;
    }
    setSubmittingCommunity(true);
    try {
      const res = await apiFetch("/api/moderator/communities", token, {
        method: "POST", body: JSON.stringify(communityForm),
      });
      if (res.ok) {
        const created = await safeJson(res);
        setCommunitiesList(prev => [{ ...created, ...communityForm } as CommunityRecord, ...prev]);
        setShowCommunityForm(false);
        setCommunityForm({ name: "", category: "institution", origin: "", description: "", representative_name: "", representative_title: "", representative_phone: "", representative_national_id: "", representative_email: "", contact_phone: "", neighborhood: "", services: "" });
        Alert.alert("تم الإرسال", "تم رفع الطلب بنجاح — سيراجعه المدير");
      } else {
        const err = await safeJson(res);
        Alert.alert("خطأ", err.error || "فشل الإرسال");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSubmittingCommunity(false); }
  };

  useEffect(() => {
    loadStats();
    const t = setTimeout(() => loadFirebaseHealth(), 1200);
    return () => clearTimeout(t);
  }, [loadStats, loadFirebaseHealth]);
  useEffect(() => {
    if (tab === "members" || tab === "admins" || tab === "moderators") {
      const t = setTimeout(() => loadUsers(), 300);
      return () => clearTimeout(t);
    }
    if (tab === "landmarks")    loadLandmarks();
    if (tab === "honored")      loadHonoredFigures();
    if (tab === "ads")          { loadAds(); loadAdsSettings(); }
    if (tab === "communities")  { loadCommunities(); loadServiceRequests("pending"); loadContractSettings(); }
    if (tab === "neighborhoods") loadNeighborhoods();
    if (tab === "ai_settings")   loadAiSettings();
    if (tab === "security")      loadSecurity();
    if (tab === "updates")         loadUpdates();
    if (tab === "libraries")       loadAdminLibraries();
    if (tab === "merchants_admin") { loadAdminMerchants(); loadMarketOrders(); }
    if (tab === "phone_shops")     loadAdminPhoneShops();
    if (tab === "reports_admin")   loadAdminReports();
    if (tab === "missing_admin")   loadAdminMissing();
    if (tab === "numbers_admin")   loadAdminNumbers();
    if (tab === "factories_admin") loadAdminFactories();
    if (tab === "farmers_admin")   loadAdminFarmers();
    if (tab === "rentals_admin")   loadAdminRentals();
    if (tab === "jobs_admin")      loadAdminJobs();
    if (tab === "ratings_admin")   loadAdminRatings();
    if (tab === "feedback_admin")  loadAdminFeedback();
  }, [tab]);

  // ── User actions ─────────────────────────────────────────────────────────
  const handleRoleChange = async (newRole: string) => {
    if (!roleModal) return;
    setRoleChanging(true);
    try {
      const res = await apiFetch(`/api/admin/users/${roleModal.id}/role`, token, {
        method: "PATCH", body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) { const j = await safeJson(res); Alert.alert("خطأ", j.error); return; }
      setUsers(prev => prev.map(u => u.id === roleModal.id ? { ...u, role: newRole as any } : u));
      loadStats();
      setRoleModal(null);
    } catch { Alert.alert("خطأ", "تعذّر تغيير الصفة"); }
    finally { setRoleChanging(false); }
  };

  const handleQuickPromote = (u: AdminUser) => {
    setPromoTarget(u);
  };

  const executePromote = async () => {
    if (!promoTarget) return;
    setPromoLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users/${promoTarget.id}/role`, token, {
        method: "PATCH", body: JSON.stringify({ role: "moderator" }),
      });
      if (!res.ok) { const j = await safeJson(res); Alert.alert("خطأ", j.error); return; }
      setUsers(prev => prev.map(x => x.id === promoTarget.id ? { ...x, role: "moderator" } : x));
      loadStats();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPromoTarget(null);
    } catch { Alert.alert("خطأ", "تعذّر الترقية"); }
    finally { setPromoLoading(false); }
  };

  const handleDeleteUser = async (u: AdminUser) => {
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}`, token, { method: "DELETE" });
      if (res.ok) {
        setUsers(prev => prev.filter(x => x.id !== u.id));
        loadStats();
      } else {
        const j = await safeJson(res);
        Alert.alert("خطأ", j.error);
      }
    } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
  };

  const openPermModal = async (u: AdminUser) => {
    setPermModal(u);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}/permissions`, token);
      if (res.ok) setPermSections(await safeJson(res));
      else setPermSections([]);
    } catch { setPermSections([]); }
  };

  const openUserStats = async (u: AdminUser) => {
    setStatsUser(u);
    setUserStats(null);
    setLoadingUserStats(true);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}/stats`, token);
      if (res.ok) setUserStats(await safeJson(res));
    } catch {}
    finally { setLoadingUserStats(false); }
  };

  const savePerms = async () => {
    if (!permModal) return;
    setSavingPerms(true);
    try {
      const res = await apiFetch(`/api/admin/users/${permModal.id}/permissions`, token, {
        method: "PUT", body: JSON.stringify({ sections: permSections }),
      });
      if (res.ok) { setPermModal(null); Alert.alert("تم", "تم حفظ الصلاحيات"); }
      else Alert.alert("خطأ", "فشل الحفظ");
    } catch { Alert.alert("خطأ", "تعذّر الحفظ"); }
    finally { setSavingPerms(false); }
  };

  // ── Landmarks actions ────────────────────────────────────────────────────
  const addLandmark = async () => {
    if (!lmForm.name.trim() || !lmForm.image_url.trim()) { Alert.alert("تنبيه", "الاسم ورابط الصورة مطلوبان"); return; }
    setAddingLM(true);
    try {
      const res = await apiFetch("/api/admin/landmarks", token, { method: "POST", body: JSON.stringify(lmForm) });
      const json = await safeJson(res);
      if (!res.ok) { Alert.alert("خطأ", json.error); return; }
      setLandmarks(prev => [...prev, json]);
      setLmForm({ name: "", sub: "", image_url: "" });
      setShowAddLM(false);
    } catch { Alert.alert("خطأ", "تعذّر الإضافة"); }
    finally { setAddingLM(false); }
  };

  const updateLandmark = async () => {
    if (!editingLM) return;
    if (!editLmForm.name.trim() || !editLmForm.image_url.trim()) { Alert.alert("تنبيه", "الاسم ورابط الصورة مطلوبان"); return; }
    setUpdatingLM(true);
    try {
      const res = await apiFetch(`/api/admin/landmarks/${editingLM.id}`, token, { method: "PATCH", body: JSON.stringify(editLmForm) });
      const json = await safeJson(res);
      if (!res.ok) { Alert.alert("خطأ", json.error || "تعذّر التعديل"); return; }
      setLandmarks(prev => prev.map(x => x.id === editingLM.id ? json : x));
      setShowEditLM(false); setEditingLM(null);
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setUpdatingLM(false); }
  };

  const deleteLandmark = async (lm: ApiLandmark) => {
    try {
      await apiFetch(`/api/admin/landmarks/${lm.id}`, token, { method: "DELETE" });
      setLandmarks(prev => prev.filter(x => x.id !== lm.id));
    } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
  };

  const pickLandmarkImageForAdd = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("تنبيه", "يجب منح صلاحية الوصول للمعرض"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 1.0, allowsEditing: true, aspect: [16, 9],
    });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setLmAddImgUploading(true);
    try {
      const url = await uploadLandmarkImage(uri);
      setLmForm(f => ({ ...f, image_url: url }));
    } catch { Alert.alert("خطأ", "تعذّر رفع الصورة، تأكد من اتصالك بالإنترنت"); }
    finally { setLmAddImgUploading(false); }
  };

  const pickLandmarkImageForEdit = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("تنبيه", "يجب منح صلاحية الوصول للمعرض"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 1.0, allowsEditing: true, aspect: [16, 9],
    });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setLmEditImgUploading(true);
    try {
      const url = await uploadLandmarkImage(uri);
      setEditLmForm(f => ({ ...f, image_url: url }));
    } catch { Alert.alert("خطأ", "تعذّر رفع الصورة، تأكد من اتصالك بالإنترنت"); }
    finally { setLmEditImgUploading(false); }
  };

  // ── Honored Figures actions ───────────────────────────────────────────────
  const loadHonoredFigures = async () => {
    setLoadingHonored(true);
    try {
      const res = await apiFetch("/api/admin/honored-figures", token);
      const json = await safeJson(res);
      if (res.ok) setHonoredList(json);
    } catch { }
    finally { setLoadingHonored(false); }
  };

  const addHonoredFigure = async () => {
    if (!honorForm.name.trim() || !honorForm.photo_url.trim() || !honorForm.start_date || !honorForm.end_date) {
      Alert.alert("تنبيه", "الاسم والصورة والتاريخان مطلوبة");
      return;
    }
    setAddingHonor(true);
    try {
      const res = await apiFetch("/api/admin/honored-figures", token, {
        method: "POST", body: JSON.stringify(honorForm),
      });
      const json = await safeJson(res);
      if (!res.ok) { Alert.alert("خطأ", json.error); return; }
      setHonoredList(prev => [json, ...prev]);
      setHonorForm(HONOR_FORM_INIT);
      setShowAddHonor(false);
    } catch { Alert.alert("خطأ", "تعذّر الإضافة"); }
    finally { setAddingHonor(false); }
  };

  const updateHonoredFigure = async () => {
    if (!editingHonor) return;
    if (!editHonorForm.name.trim() || !editHonorForm.photo_url.trim() || !editHonorForm.start_date || !editHonorForm.end_date) {
      Alert.alert("تنبيه", "الاسم والصورة والتاريخان مطلوبة");
      return;
    }
    setUpdatingHonor(true);
    try {
      const res = await apiFetch(`/api/admin/honored-figures/${editingHonor.id}`, token, {
        method: "PATCH", body: JSON.stringify(editHonorForm),
      });
      const json = await safeJson(res);
      if (!res.ok) { Alert.alert("خطأ", json.error || "تعذّر التعديل"); return; }
      setHonoredList(prev => prev.map(x => x.id === editingHonor.id ? json : x));
      setShowEditHonor(false); setEditingHonor(null);
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setUpdatingHonor(false); }
  };

  const toggleHonoredVisibility = async (figure: HonoredFigure) => {
    try {
      const res = await apiFetch(`/api/admin/honored-figures/${figure.id}/visibility`, token, { method: "PATCH" });
      const json = await safeJson(res);
      if (res.ok) setHonoredList(prev => prev.map(x => x.id === figure.id ? json : x));
    } catch { Alert.alert("خطأ", "تعذّر تغيير الحالة"); }
  };

  const deleteHonoredFigure = async (figure: HonoredFigure) => {
    Alert.alert("حذف التكريم", `هل أنت متأكد من حذف "${figure.name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
        onPress: async () => {
          try {
            await apiFetch(`/api/admin/honored-figures/${figure.id}`, token, { method: "DELETE" });
            setHonoredList(prev => prev.filter(x => x.id !== figure.id));
          } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
        },
      },
    ]);
  };

  const pickHonorImageForAdd = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("تنبيه", "يجب منح صلاحية الوصول للمعرض"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1.0, allowsEditing: true, aspect: [3, 4] });
    if (result.canceled || !result.assets?.[0]) return;
    setHonorImgUploading(true);
    try {
      const { uploadHonorImage } = await import("@/lib/firebase/storage");
      const url = await uploadHonorImage(result.assets[0].uri);
      setHonorForm(f => ({ ...f, photo_url: url }));
    } catch { Alert.alert("خطأ", "تعذّر رفع الصورة"); }
    finally { setHonorImgUploading(false); }
  };

  const pickHonorImageForEdit = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("تنبيه", "يجب منح صلاحية الوصول للمعرض"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1.0, allowsEditing: true, aspect: [3, 4] });
    if (result.canceled || !result.assets?.[0]) return;
    setEditHonorImgUploading(true);
    try {
      const { uploadHonorImage } = await import("@/lib/firebase/storage");
      const url = await uploadHonorImage(result.assets[0].uri);
      setEditHonorForm(f => ({ ...f, photo_url: url }));
    } catch { Alert.alert("خطأ", "تعذّر رفع الصورة"); }
    finally { setEditHonorImgUploading(false); }
  };

  // ── Ads actions ──────────────────────────────────────────────────────────
  const updateAdStatus = async (ad: AdRecord, status: "active" | "rejected" | "expired", days?: string, note?: string) => {
    setApprovingId(ad.id);
    try {
      const res = await apiFetch(`/api/admin/ads/${ad.id}/status`, token, {
        method: "PUT",
        body: JSON.stringify({ status, duration_days: parseInt(days || "7"), admin_note: note?.trim() || null }),
      });
      if (res.ok) {
        const updated = await safeJson(res);
        setAdsList(prev => prev.map(a => a.id === ad.id ? updated : a));
        setAdDetailModal(null); setApprovalDays("7"); setAdminNote("");
      } else {
        const err = await safeJson(res);
        Alert.alert("خطأ", err.error);
      }
    } catch { Alert.alert("خطأ", "تعذّر تحديث الإعلان"); }
    finally { setApprovingId(null); }
  };

  const deleteAd = async (ad: AdRecord) => {
    try {
      await apiFetch(`/api/admin/ads/${ad.id}`, token, { method: "DELETE" });
      setAdsList(prev => prev.filter(a => a.id !== ad.id));
      setAdDetailModal(null);
    } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
  };

  // ── Neighborhoods actions ────────────────────────────────────────────────
  const saveNeighborhood = async () => {
    if (!nbrForm.label.trim()) { Alert.alert("تنبيه", "أدخل الاسم"); return; }
    setAddingNbr(true);
    try {
      if (editingNbr?.key) {
        const res = await apiFetch(`/api/admin/neighborhoods/${editingNbr.key}`, token, { method: "PUT", body: JSON.stringify(nbrForm) });
        if (res.ok) { const updated = await safeJson(res); setNeighborhoods(prev => prev.map(n => n.key === editingNbr.key ? updated : n)); }
      } else {
        const res = await apiFetch("/api/admin/neighborhoods", token, { method: "POST", body: JSON.stringify(nbrForm) });
        if (res.ok) { const added = await safeJson(res); setNeighborhoods(prev => [...prev, added]); }
      }
      setNbrForm({ label: "", type: "neighborhood" }); setEditingNbr(null); setShowAddNbr(false);
    } catch { Alert.alert("خطأ", "تعذّرت العملية"); }
    finally { setAddingNbr(false); }
  };

  const deleteNeighborhood = async (item: NbrItem) => {
    if (!item.key) { setNeighborhoods(prev => prev.filter(n => n.label !== item.label)); return; }
    try {
      await apiFetch(`/api/admin/neighborhoods/${item.key}`, token, { method: "DELETE" });
      setNeighborhoods(prev => prev.filter(n => n.key !== item.key));
    } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
  };

  // ── AI Settings ──────────────────────────────────────────────────────────
  const saveAiSettings = async () => {
    setSavingAi(true);
    try {
      const res = await apiFetch("/api/admin/ai-settings", token, { method: "PUT", body: JSON.stringify(aiForm) });
      if (res.ok) Alert.alert("تم الحفظ", "تم حفظ إعدادات الذكاء الاصطناعي بنجاح");
      else Alert.alert("خطأ", "فشل الحفظ");
    } catch { Alert.alert("خطأ", "تعذّر الحفظ"); }
    finally { setSavingAi(false); }
  };

  // ── Security actions ─────────────────────────────────────────────────────
  const changePin = async () => {
    if (!pinForm.current.trim()) { Alert.alert("تنبيه", "أدخل الرمز الحالي"); return; }
    if (!pinForm.newPin.trim() || pinForm.newPin.length < 4) { Alert.alert("تنبيه", "الرمز الجديد يجب أن يكون 4 أرقام على الأقل"); return; }
    if (pinForm.newPin !== pinForm.confirm) { Alert.alert("تنبيه", "الرمز الجديد وتأكيده غير متطابقين"); return; }
    setSavingPin(true);
    try {
      const validateRes = await apiFetch("/api/admin/validate-pin", token, { method: "POST", body: JSON.stringify({ pin: pinForm.current }) });
      const validateData = await safeJson(validateRes);
      if (!validateData.valid) { Alert.alert("خطأ", "الرمز الحالي غير صحيح"); return; }
      const changeRes = await apiFetch("/api/admin/change-pin", token, { method: "POST", body: JSON.stringify({ new_pin: pinForm.newPin }) });
      if (changeRes.ok) {
        Alert.alert("تم", "تم تغيير رمز المدير بنجاح");
        setPinForm({ current: "", newPin: "", confirm: "" });
      } else Alert.alert("خطأ", "فشل تغيير الرمز");
    } catch { Alert.alert("خطأ", "تعذّرت العملية"); }
    finally { setSavingPin(false); }
  };

  const saveAdminName = async () => {
    if (!adminNameForm.name.trim()) { Alert.alert("تنبيه", "أدخل اسم المدير"); return; }
    setSavingName(true);
    try {
      const res = await apiFetch("/api/admin/name", token, { method: "POST", body: JSON.stringify({ name: adminNameForm.name.trim() }) });
      if (res.ok) Alert.alert("تم", "تم حفظ الاسم بنجاح");
      else Alert.alert("خطأ", "فشل الحفظ");
    } catch { Alert.alert("خطأ", "تعذّر الحفظ"); }
    finally { setSavingName(false); }
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const allMembers = users.filter(u => u.role === "user");
  const now = new Date();
  const thisMonth = allMembers.filter(u => {
    const d = new Date(u.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisWeek = allMembers.filter(u => {
    const d = new Date(u.created_at);
    return (now.getTime() - d.getTime()) < 7 * 86400000;
  });
  const membersByNbr = allMembers.reduce<Record<string, number>>((acc, u) => {
    const key = u.neighborhood || "غير محدد";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topNbrs = Object.entries(membersByNbr).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const filteredUsers = users
    .filter(u => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || u.name.toLowerCase().includes(q) || (u.phone || "").includes(q) || (u.neighborhood || "").toLowerCase().includes(q);
      const matchNbr = tab !== "members" || memberNbrFilter === "all" || (u.neighborhood || "غير محدد") === memberNbrFilter;
      if (tab === "members")    return matchSearch && matchNbr && u.role === "user";
      if (tab === "admins")     return matchSearch && u.role === "admin";
      if (tab === "moderators") return matchSearch && u.role === "moderator";
      return matchSearch;
    })
    .sort((a, b) => {
      if (tab !== "members") return 0;
      if (memberSort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (memberSort === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return a.name.localeCompare(b.name, "ar");
    });

  const pendingAdsCount       = adsList.filter(a => a.status === "pending").length;
  const pendingCommunitiesCount = communitiesList.filter(c => c.status === "pending").length;
  const filteredAds        = adsFilter === "all" ? adsList : adsList.filter(a => a.status === adsFilter);
  const filteredCommunities = communityFilter === "all" ? communitiesList : communitiesList.filter(c => c.status === communityFilter);

  const ALL_TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; badge?: number; adminOnly?: boolean; modPerm?: string }[] = [
    { key: "overview",       label: "نظرة عامة",        icon: "grid",               color: Colors.cyber                                  },
    { key: "members",        label: "الأعضاء",           icon: "people",             color: Colors.primary, modPerm: "members"            },
    { key: "admins",         label: "المديرون",          icon: "shield",             color: "#E05567",      adminOnly: true               },
    { key: "moderators",     label: "المشرفون",          icon: "shield-half",        color: "#F0A500",      adminOnly: true               },
    { key: "communities",    label: "المؤسسات",          icon: "business",           color: "#16A085", badge: pendingCommunitiesCount, modPerm: "communities" },
    { key: "honored",        label: "قاعة التكريم",      icon: "trophy",             color: "#D4AF37",      adminOnly: true               },
    { key: "landmarks",      label: "المعالم",           icon: "location",           color: "#9B59B6",      modPerm: "landmarks"          },
    { key: "ads",            label: "الإعلانات",         icon: "megaphone",          color: "#F0A500", badge: pendingAdsCount, modPerm: "ads" },
    { key: "neighborhoods",  label: "الأحياء",           icon: "map",                color: "#3498DB",      adminOnly: true               },
    { key: "ai_settings",    label: "الذكاء الاصطناعي", icon: "sparkles",           color: Colors.cyber,   adminOnly: true               },
    { key: "security",       label: "الأمان",            icon: "lock-closed",        color: "#E05567",      adminOnly: true               },
    { key: "transport",        label: "مشوارك علينا",      icon: "car",                color: "#F97316",      adminOnly: true },
    { key: "updates",          label: "التحديثات",         icon: "cloud-upload",       color: Colors.primary, adminOnly: true               },
    { key: "libraries",        label: "المكتبات الطلابية", icon: "library",            color: "#0EA5E9",      adminOnly: true               },
    { key: "merchants_admin",  label: "مساحة التجار",      icon: "storefront",         color: "#6366F1",      adminOnly: true, badge: adminMerchants.filter(m=>m.status==="pending").length || undefined },
    { key: "phone_shops",      label: "محلات الهواتف",     icon: "phone-portrait",     color: "#7C3AED",      adminOnly: true, badge: adminPhoneShops.filter(s=>!s.is_approved).length || undefined },
    { key: "sections_config",  label: "أقسام التطبيق",     icon: "toggle",             color: "#10B981",      adminOnly: true },
    { key: "legal_suggestions", label: "اقتراحات قانونية",  icon: "document-text",     color: "#8B5CF6",      adminOnly: true },
    { key: "sick_leaves",      label: "الإجازات المرضية",   icon: "medical",            color: "#10B981",      adminOnly: true },
    { key: "admissions",       label: "التنويم",            icon: "bed",                color: "#3B82F6",      adminOnly: true },
    { key: "zawajil",          label: "زواجل",              icon: "gift",               color: "#EC4899",      adminOnly: true },
    { key: "student_union",    label: "إتحاد الطلاب",       icon: "people-circle",      color: "#6366F1",      adminOnly: true },
    { key: "partners",         label: "بوابة الشركاء",      icon: "handshake-outline" as any, color: "#F97316", adminOnly: true },
    { key: "lawyers_admin",    label: "المحامون",           icon: "briefcase",          color: "#8B5CF6",      adminOnly: true },
    { key: "designers_admin",  label: "المصممون",           icon: "color-palette",      color: "#F472B6",      adminOnly: true },
    { key: "join_requests",    label: "طلبات الانضمام",     icon: "person-add",         color: "#F59E0B",      adminOnly: true },
    { key: "reports_admin",    label: "البلاغات",            icon: "warning",            color: "#EF4444",      adminOnly: true },
    { key: "missing_admin",    label: "المفقودات",           icon: "search",             color: "#F97316",      adminOnly: true },
    { key: "numbers_admin",    label: "الأرقام الهامة",      icon: "call",               color: "#10B981",      adminOnly: true },
    { key: "factories_admin",  label: "المصانع",             icon: "business-outline" as any, color: "#6B7280", adminOnly: true },
    { key: "farmers_admin",    label: "السوق الزراعي",       icon: "leaf",               color: "#16A34A",      adminOnly: true },
    { key: "rentals_admin",    label: "الإيجارات",           icon: "home",               color: "#0EA5E9",      adminOnly: true },
    { key: "jobs_admin",       label: "الوظائف",             icon: "briefcase",          color: "#8B5CF6",      adminOnly: true },
    { key: "ratings_admin",    label: "التقييمات",           icon: "star",               color: "#F59E0B",      adminOnly: true },
    { key: "feedback_admin",   label: "الشكاوى والمقترحات",  icon: "chatbubbles",        color: "#06B6D4",      adminOnly: true },
  ];

  const TABS = ALL_TABS.filter(t => {
    if (t.adminOnly) return isAdmin;
    if (isMod && t.modPerm) return modPerms.includes(t.modPerm);
    return true;
  });

  // ─── Render helpers ────────────────────────────────────────────────────────
  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "اليوم";
    if (days < 7) return `منذ ${days} يوم`;
    if (days < 30) return `منذ ${Math.floor(days / 7)} أسبوع`;
    if (days < 365) return `منذ ${Math.floor(days / 30)} شهر`;
    return `منذ ${Math.floor(days / 365)} سنة`;
  }

  function renderUserCard(u: AdminUser) {
    const roleColor = ROLE_LABELS[u.role]?.color ?? Colors.primary;
    const joinAgo   = u.created_at ? timeAgo(u.created_at) : "—";
    return (
      <Animated.View entering={FadeInDown.springify().damping(18)} key={u.id} style={uc.card}>
        {/* اضغط على البطاقة لرؤية الإحصائيات */}
        <TouchableOpacity onPress={() => openUserStats(u)} activeOpacity={0.85} style={{ position: "absolute", top: 10, left: 12, zIndex: 5 }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + "30" }}>
            <Ionicons name="bar-chart-outline" size={12} color={Colors.primary} />
            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.primary }}>إحصائيات</Text>
          </View>
        </TouchableOpacity>
        {/* Top row */}
        <View style={uc.topRow}>
          {/* Avatar */}
          <View style={[uc.avatar, { backgroundColor: roleColor + "22", borderColor: roleColor + "44" }]}>
            <Text style={[uc.avatarLetter, { color: roleColor }]}>{u.name.charAt(0)}</Text>
          </View>

          {/* Name + meta */}
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={uc.name}>{u.name}</Text>
            <View style={uc.metaRow}>
              {u.phone ? (
                <View style={uc.metaChip}>
                  <Ionicons name="call-outline" size={11} color={Colors.textMuted} />
                  <Text style={uc.metaText}>{u.phone}</Text>
                </View>
              ) : u.email ? (
                <View style={uc.metaChip}>
                  <Ionicons name="mail-outline" size={11} color={Colors.textMuted} />
                  <Text style={uc.metaText}>{u.email}</Text>
                </View>
              ) : null}
              {u.neighborhood ? (
                <View style={uc.metaChip}>
                  <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                  <Text style={uc.metaText}>{u.neighborhood}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Role badge + join time */}
          <View style={{ alignItems: "flex-end", gap: 5 }}>
            <RoleBadge role={u.role} />
            <Text style={uc.joinAgo}>{joinAgo}</Text>
          </View>
        </View>

        {/* Action bar - only for admin */}
        {isAdmin && (
          <View style={uc.actionBar}>
            {/* Primary action: Promote (only for regular users) */}
            {u.role === "user" && (
              <TouchableOpacity
                style={uc.promoteBtn}
                onPress={() => handleQuickPromote(u)}
                activeOpacity={0.78}
              >
                <Ionicons name="arrow-up-circle" size={15} color="#fff" />
                <Text style={uc.promoteBtnTxt}>ترقية لمشرف</Text>
              </TouchableOpacity>
            )}

            {/* Permissions (only for moderators) */}
            {u.role === "moderator" && (
              <TouchableOpacity
                style={[uc.secBtn, { borderColor: "#F0A50040", backgroundColor: "#F0A50012" }]}
                onPress={() => openPermModal(u)}
              >
                <Ionicons name="key-outline" size={14} color="#F0A500" />
                <Text style={[uc.secBtnTxt, { color: "#F0A500" }]}>الصلاحيات</Text>
              </TouchableOpacity>
            )}

            {/* Change role */}
            <TouchableOpacity
              style={[uc.secBtn, { borderColor: Colors.primary + "40", backgroundColor: Colors.primary + "12" }]}
              onPress={() => setRoleModal(u)}
            >
              <Ionicons name="swap-horizontal-outline" size={14} color={Colors.primary} />
              <Text style={[uc.secBtnTxt, { color: Colors.primary }]}>الصفة</Text>
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity
              style={[uc.secBtn, { borderColor: "#E0556730", backgroundColor: "#E0556710" }]}
              onPress={() => handleDeleteUser(u)}
            >
              <Ionicons name="trash-outline" size={14} color="#E05567" />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.bg }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <BrandPattern variant="diagonal" opacity={0.02} />

      {/* Header */}
      <LinearGradient colors={["#0A1510", "#0D1A12E0", "transparent"]} style={s.headerGrad}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
            <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={s.headerTitle}>لوحة الإدارة</Text>
            <View style={s.headerBadge}>
              <Ionicons name={isAdmin ? "shield" : "shield-half"} size={11} color={isAdmin ? "#E05567" : "#F0A500"} />
              <Text style={[s.headerBadgeTxt, { color: isAdmin ? "#E05567" : "#F0A500" }]}>
                {isAdmin ? "مدير النظام" : "مشرف"}
              </Text>
            </View>
          </View>
          <View style={s.headerAvatar}>
            <Text style={s.headerAvatarLetter}>{user?.name?.charAt(0) ?? "؟"}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Tab bar */}
      <View style={s.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[s.tabBtn, active && { backgroundColor: t.color + "20", borderColor: t.color + "80" }]}
                onPress={() => {
                  if (t.key === "transport") { router.push("/admin-transport" as any); return; }
                  if (t.key === "sections_config") { router.push("/admin-sections-config" as any); return; }
                  setTab(t.key);
                }}
                activeOpacity={0.75}
              >
                <View style={{ position: "relative" }}>
                  <Ionicons name={t.icon} size={15} color={active ? t.color : Colors.textMuted} />
                  {(t.badge ?? 0) > 0 && (
                    <View style={s.tabBadge}>
                      <Text style={s.tabBadgeText}>{t.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[s.tabLabel, active && { color: t.color, fontFamily: "Cairo_700Bold" }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content area ── */}

      {/* Overview */}
      {tab === "overview" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {loadingStats ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
          ) : stats ? (
            <>
              <Animated.View entering={FadeIn.duration(400)} style={s.statsGrid}>
                <StatCard icon="people"      label="إجمالي المستخدمين" value={stats.totals.total}      color={Colors.primary} />
                <StatCard icon="shield"      label="المديرون"           value={stats.totals.admins}     color="#E05567"        />
                <StatCard icon="shield-half" label="المشرفون"           value={stats.totals.moderators} color="#F0A500"        />
                <StatCard icon="person"      label="الأعضاء"            value={stats.totals.members}    color={Colors.cyber}   />
              </Animated.View>

              {stats.sections && (
                <Animated.View entering={FadeIn.delay(120).duration(400)} style={[s.statsGrid, { marginTop: 4 }]}>
                  <StatCard icon="briefcase-outline"      label="وظائف نشطة"       value={stats.sections.jobs_active}     color="#10B981" />
                  <StatCard icon="warning-outline"        label="بلاغات معلقة"      value={stats.sections.reports_pending} color="#EF4444" />
                  <StatCard icon="search-outline"         label="مفقودون"           value={stats.sections.missing_lost}    color="#F59E0B" />
                  <StatCard icon="business-outline"       label="مصانع نشطة"        value={stats.sections.factories_active} color="#8B5CF6" />
                  <StatCard icon="home-outline"           label="إيجارات نشطة"      value={stats.sections.rentals_active}  color="#06B6D4" />
                  <StatCard icon="chatbubble-outline"     label="مقترحات معلقة"     value={stats.sections.feedback_pending} color="#F97316" />
                  <StatCard icon="star-outline"           label="التقييمات"         value={stats.sections.ratings_total}   color="#FBBF24" />
                  <StatCard icon="airplane-outline"       label="وكالات بانتظار"    value={stats.sections.travel_pending}  color="#EC4899" />
                </Animated.View>
              )}

              {/* ── Firebase Sync Card ── */}
              {isAdmin && (() => {
                const configured = fbHealth?.firebase_admin_configured;
                const fbTotal    = fbHealth?.firebase_users ?? null;
                const pgTotal    = fbHealth?.postgres_users ?? stats.totals.total;
                const missing    = fbHealth?.firebase_missing_in_postgres ?? null;
                const status     = fbHealth?.status ?? "loading";
                const statusColors: Record<string, string> = {
                  healthy: "#10B981", needs_sync: "#F59E0B",
                  firebase_error: "#EF4444", missing_env: "#6B7280",
                  invalid_json: "#EF4444", configured: "#06B6D4", loading: "#6B7280",
                };
                const statusLabels: Record<string, string> = {
                  healthy: "مزامَن بالكامل ✓", needs_sync: "يحتاج مزامنة",
                  firebase_error: "خطأ Firebase", missing_env: "Firebase غير مُهيَّأ",
                  invalid_json: "إعدادات خاطئة", configured: "جاهز", loading: "جارٍ الفحص…",
                };
                return (
                  <Animated.View entering={FadeInDown.delay(80).springify()} style={{ backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 16, marginBottom: 12 }}>
                    {/* Header */}
                    <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary }}>مزامنة حسابات المستخدمين</Text>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColors[status] ?? "#6B7280" }} />
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: statusColors[status] ?? "#6B7280" }}>
                          {statusLabels[status] ?? status}
                        </Text>
                      </View>
                    </View>

                    {/* Stats row */}
                    <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14 }}>
                      <View style={{ flex: 1, backgroundColor: "#FFFFFF08", borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#EF444430" }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: "#F97316" }}>{pgTotal ?? "—"}</Text>
                        <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>قاعدة البيانات</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: "#FFFFFF08", borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#4285F430" }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: "#4285F4" }}>{fbTotal !== null ? fbTotal : "—"}</Text>
                        <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Firebase</Text>
                      </View>
                      {missing !== null && missing > 0 && (
                        <View style={{ flex: 1, backgroundColor: "#F59E0B10", borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#F59E0B40" }}>
                          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: "#F59E0B" }}>{missing}</Text>
                          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>غير مزامَن</Text>
                        </View>
                      )}
                    </View>

                    {/* Result */}
                    {fbSyncResult && !fbSyncResult.error && (
                      <View style={{ backgroundColor: "#10B98115", borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "#10B98130" }}>
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#10B981", textAlign: "right" }}>
                          ✓ تمت المزامنة — Firebase: {fbSyncResult.firebase_total} · أُضيف: {fbSyncResult.created} · حُدِّث: {fbSyncResult.updated}
                          {fbSyncResult.errors > 0 ? ` · أخطاء: ${fbSyncResult.errors}` : ""}
                        </Text>
                      </View>
                    )}
                    {fbSyncResult?.error && (
                      <View style={{ backgroundColor: "#EF444415", borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "#EF444430" }}>
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#EF4444", textAlign: "right" }}>{fbSyncResult.error}</Text>
                      </View>
                    )}
                    {!configured && fbHealth && (
                      <View style={{ marginBottom: 10 }}>
                        <View style={{ backgroundColor: "#F59E0B10", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#F59E0B30" }}>
                          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#F59E0B", textAlign: "right", marginBottom: 4 }}>
                            ⚠ Firebase Admin SDK غير مُهيَّأ — المستخدمون لن يظهروا
                          </Text>
                          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#9CA3AF", textAlign: "right" }}>
                            لاسترجاع المستخدمين: افتح Firebase Console ← Project Settings ← Service Accounts ← Generate new private key ← انسخ المحتوى والصقه أدناه
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setShowFbSaForm(v => !v)}
                          style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: "#4285F415", borderWidth: 1, borderColor: "#4285F440", marginBottom: 6 }}
                        >
                          <Ionicons name={showFbSaForm ? "chevron-up-outline" : "key-outline"} size={15} color="#4285F4" />
                          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#4285F4" }}>
                            {showFbSaForm ? "إخفاء النموذج" : "إعداد Firebase Service Account"}
                          </Text>
                        </TouchableOpacity>
                        {showFbSaForm && (
                          <View style={{ backgroundColor: "#FFFFFF05", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#4285F430" }}>
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 6 }}>
                              الصق محتوى ملف serviceAccountKey.json هنا:
                            </Text>
                            <TextInput
                              value={fbSaJson}
                              onChangeText={setFbSaJson}
                              multiline
                              numberOfLines={6}
                              placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                              placeholderTextColor="#4B5563"
                              style={{ backgroundColor: "#111827", borderRadius: 8, padding: 10, fontFamily: "monospace", fontSize: 11, color: "#E5E7EB", textAlign: "left", minHeight: 120, borderWidth: 1, borderColor: "#374151", marginBottom: 8 }}
                            />
                            {fbSaJsonResult && (
                              <View style={{ backgroundColor: (fbSaJsonResult as any).ok ? "#10B98115" : "#EF444415", borderRadius: 8, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: (fbSaJsonResult as any).ok ? "#10B98130" : "#EF444430" }}>
                                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: (fbSaJsonResult as any).ok ? "#10B981" : "#EF4444", textAlign: "right" }}>
                                  {(fbSaJsonResult as any).ok
                                    ? `✓ ${(fbSaJsonResult as any).message ?? "تم الحفظ بنجاح"}`
                                    : `✗ ${(fbSaJsonResult as any).error ?? "فشل الحفظ"}`}
                                </Text>
                              </View>
                            )}
                            <TouchableOpacity
                              onPress={saveFbSaJson}
                              disabled={fbSaJsonSaving || !fbSaJson.trim()}
                              style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: fbSaJsonSaving || !fbSaJson.trim() ? "#FFFFFF10" : "#4285F4" }}
                            >
                              {fbSaJsonSaving
                                ? <ActivityIndicator size="small" color="#4285F4" />
                                : <Ionicons name="save-outline" size={15} color="#fff" />}
                              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: fbSaJsonSaving || !fbSaJson.trim() ? Colors.textMuted : "#fff" }}>
                                {fbSaJsonSaving ? "جارٍ الحفظ…" : "حفظ وتفعيل Firebase"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Sync button */}
                    <TouchableOpacity
                      onPress={syncFirebaseNow}
                      disabled={fbSyncing}
                      style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 13, backgroundColor: fbSyncing ? "#FFFFFF10" : Colors.primary, borderWidth: 1, borderColor: fbSyncing ? Colors.borderSubtle : Colors.primary }}
                    >
                      {fbSyncing
                        ? <ActivityIndicator size="small" color={Colors.primary} />
                        : <Ionicons name="sync-outline" size={17} color="#000" />}
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: fbSyncing ? Colors.textMuted : "#000" }}>
                        {fbSyncing ? "جارٍ الاستيراد من Firebase…" : "استيراد كل الحسابات من Firebase"}
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })()}

              {stats.byNeighborhood.length > 0 && (
                <View style={s.card}>
                  <SectionHeader title="توزيع الأعضاء بالأحياء" />
                  {stats.byNeighborhood.map((n, i) => (
                    <Animated.View entering={FadeInDown.delay(i * 40).springify()} key={n.neighborhood} style={s.barRow}>
                      <Text style={s.barLabel}>{n.neighborhood}</Text>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { width: `${Math.round((n.count / Math.max(stats.totals.total, 1)) * 100)}%` as any }]} />
                      </View>
                      <Text style={s.barCount}>{n.count}</Text>
                    </Animated.View>
                  ))}
                </View>
              )}

              <View style={s.card}>
                <SectionHeader title="أحدث المنضمين" />
                {stats.recentUsers.map((u, i) => (
                  <Animated.View entering={FadeInDown.delay(i * 35).springify()} key={u.id} style={s.recentRow}>
                    <View style={[s.avatarSm, { backgroundColor: ROLE_LABELS[u.role]?.color + "25" }]}>
                      <Text style={[s.avatarSmLetter, { color: ROLE_LABELS[u.role]?.color }]}>{u.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.recentName}>{u.name}</Text>
                      {u.neighborhood ? <Text style={s.recentSub}>{u.neighborhood}</Text> : null}
                    </View>
                    <RoleBadge role={u.role} />
                  </Animated.View>
                ))}
              </View>
            </>
          ) : (
            <View style={{ alignItems: "center", paddingHorizontal: 24, paddingTop: 60, gap: 16 }}>
              <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
              <Text style={[s.empty, { textAlign: "center" }]}>
                {statsError ?? "تعذّر تحميل البيانات"}
              </Text>
              <TouchableOpacity
                onPress={loadStats}
                style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
              >
                <Text style={{ color: "#000", fontFamily: "Cairo_700Bold", fontSize: 14 }}>إعادة المحاولة</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Members / Admins / Moderators */}
      {(tab === "members" || tab === "admins" || tab === "moderators") && (
        <View style={{ flex: 1 }}>
          {/* جدول متابعة الأعضاء - فقط في تبويب الأعضاء */}
          {tab === "members" && !loadingUsers && (
            <Animated.View entering={FadeInDown.duration(300)} style={sm.trackingPanel}>
              {/* إحصائيات سريعة */}
              <View style={sm.trackingRow}>
                <View style={[sm.trackingStat, { borderColor: Colors.primary + "40" }]}>
                  <Text style={[sm.trackingNum, { color: Colors.primary }]}>{allMembers.length}</Text>
                  <Text style={sm.trackingLabel}>إجمالي الأعضاء</Text>
                </View>
                <View style={[sm.trackingStat, { borderColor: "#3498DB40" }]}>
                  <Text style={[sm.trackingNum, { color: "#3498DB" }]}>{thisMonth.length}</Text>
                  <Text style={sm.trackingLabel}>هذا الشهر</Text>
                </View>
                <View style={[sm.trackingStat, { borderColor: Colors.cyber + "40" }]}>
                  <Text style={[sm.trackingNum, { color: Colors.cyber }]}>{thisWeek.length}</Text>
                  <Text style={sm.trackingLabel}>هذا الأسبوع</Text>
                </View>
              </View>

              {/* أعلى الأحياء */}
              {topNbrs.length > 0 && (
                <View style={sm.nbrSection}>
                  <Text style={sm.nbrTitle}>توزيع الأعضاء بالأحياء</Text>
                  {topNbrs.map(([nbr, count]) => (
                    <TouchableOpacity
                      key={nbr}
                      style={sm.nbrRow}
                      onPress={() => setMemberNbrFilter(memberNbrFilter === nbr ? "all" : nbr)}
                      activeOpacity={0.75}
                    >
                      <View style={[sm.nbrBar, {
                        width: `${Math.round((count / (topNbrs[0]?.[1] || 1)) * 100)}%` as any,
                        backgroundColor: memberNbrFilter === nbr ? Colors.primary : Colors.primary + "30",
                      }]} />
                      <View style={sm.nbrInfo}>
                        <Text style={[sm.nbrName, memberNbrFilter === nbr && { color: Colors.primary }]}>{nbr}</Text>
                        <Text style={sm.nbrCount}>{count} عضو</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {memberNbrFilter !== "all" && (
                    <TouchableOpacity onPress={() => setMemberNbrFilter("all")} style={sm.clearFilter}>
                      <Ionicons name="close-circle" size={13} color={Colors.textMuted} />
                      <Text style={sm.clearFilterTxt}>إلغاء الفلتر</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </Animated.View>
          )}

          {/* شريط البحث والترتيب */}
          <View style={{ paddingHorizontal: 14, paddingTop: 8, gap: 8 }}>
            <View style={s.searchBar}>
              <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder={tab === "members" ? "ابحث باسم أو هاتف أو حي..." : "ابحث باسم..."}
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                textAlign="right"
              />
              {search ? (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {/* أزرار الترتيب - فقط للأعضاء */}
            {tab === "members" && (
              <View style={sm.sortRow}>
                <Text style={sm.sortLabel}>ترتيب:</Text>
                {([ ["newest", "الأحدث"], ["oldest", "الأقدم"], ["name", "الاسم"] ] as const).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[sm.sortBtn, memberSort === key && sm.sortBtnActive]}
                    onPress={() => setMemberSort(key)}
                  >
                    <Text style={[sm.sortBtnTxt, memberSort === key && sm.sortBtnTxtActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={[sm.sortLabel, { marginRight: "auto" as any }]}>
                  {filteredUsers.length} عضو
                </Text>
              </View>
            )}
          </View>

          {loadingUsers ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
          ) : users.length === 0 && tab === "members" ? (
            <ScrollView contentContainerStyle={{ alignItems: "center", padding: 24, gap: 14 }}>
              <Ionicons name="people-outline" size={52} color={Colors.primary + "50"} />
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "center" }}>
                قاعدة البيانات فارغة
              </Text>

              {/* ── استيراد من DB القديمة ── */}
              <View style={{ width: "100%", backgroundColor: "#0d1f0d", borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.primary + "40" }}>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" }}>
                  📦 استيراد من قاعدة بيانات Render القديمة
                </Text>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>
                  من Render Dashboard ← Databases ← انسخ "External Database URL"
                </Text>
                <TextInput
                  value={migrateUrl}
                  onChangeText={setMigrateUrl}
                  placeholder="postgres://user:pass@host:5432/db"
                  placeholderTextColor={Colors.textMuted}
                  style={{ backgroundColor: "#162416", color: "#fff", borderRadius: 8, padding: 10, fontFamily: "Cairo_400Regular", textAlign: "left", fontSize: 11, borderWidth: 1, borderColor: Colors.primary + "50" }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                />
                <TouchableOpacity
                  style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: migrating ? 0.7 : 1 }}
                  onPress={() => migrateFromDb(migrateUrl)}
                  disabled={migrating || !migrateUrl.trim()}
                >
                  {migrating
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Ionicons name="cloud-download-outline" size={16} color="#000" />
                  }
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#000" }}>
                    {migrating ? "جاري النقل..." : "نقل المستخدمين الآن"}
                  </Text>
                </TouchableOpacity>
                {migrateResult && !migrateResult.error && (
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.primary, textAlign: "center" }}>
                    ✅ نُقل: {migrateResult.migrated} · تجاهل: {migrateResult.skipped} · أخطاء: {migrateResult.errors} (من {migrateResult.total})
                  </Text>
                )}
                {migrateResult?.error && (
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#EF4444", textAlign: "center" }}>
                    ❌ {migrateResult.error}
                  </Text>
                )}
              </View>

              {/* ── مزامنة Firebase ── */}
              <View style={{ width: "100%", borderTopWidth: 1, borderColor: "#ffffff15", paddingTop: 14, gap: 8 }}>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" }}>
                  أو إذا سجّل المستخدمون عبر Google / Firebase:
                </Text>
                <TouchableOpacity
                  style={{ borderWidth: 1, borderColor: Colors.primary + "80", borderRadius: 10, paddingVertical: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                  onPress={() => syncFirebaseNow()}
                  disabled={fbSyncing}
                >
                  {fbSyncing ? <ActivityIndicator color={Colors.primary} size="small" /> : <Ionicons name="sync-outline" size={16} color={Colors.primary} />}
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary }}>
                    {fbSyncing ? "جاري المزامنة..." : "مزامنة مستخدمي Firebase"}
                  </Text>
                </TouchableOpacity>
                {fbSyncResult && (
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.primary, textAlign: "center" }}>
                    ✅ Firebase: {(fbSyncResult as any).created ?? 0} جديد، {(fbSyncResult as any).updated ?? 0} محدَّث
                  </Text>
                )}
              </View>
            </ScrollView>
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={u => String(u.id)}
              contentContainerStyle={{ padding: 14, paddingBottom: 60, gap: 10 }}
              ListEmptyComponent={<Text style={s.empty}>لا يوجد مستخدمون في هذه الفئة</Text>}
              renderItem={({ item }) => renderUserCard(item)}
            />
          )}
        </View>
      )}

      {/* ═══ قاعة التكريم ═══ */}
      {tab === "honored" && (
        <View style={{ flex: 1 }}>
          <View style={s.pageHeader}>
            <Text style={s.pageHeaderTitle}>قاعة التكريم ({honoredList.length})</Text>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: "#D4AF37" }]} onPress={() => { setHonorForm(HONOR_FORM_INIT); setShowAddHonor(true); }}>
              <Ionicons name="add" size={16} color="#000" />
              <Text style={[s.addBtnTxt, { color: "#000" }]}>إضافة</Text>
            </TouchableOpacity>
          </View>

          {loadingHonored ? (
            <ActivityIndicator color="#D4AF37" style={{ marginTop: 40 }} />
          ) : honoredList.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="trophy-outline" size={44} color="#D4AF3760" />
              <Text style={s.emptyStateText}>لا توجد شخصيات مكرّمة بعد</Text>
              <Text style={[s.emptyStateText, { fontSize: 12, marginTop: 4 }]}>اضغط "إضافة" لتكريم أول شخصية من أبناء المدينة</Text>
            </View>
          ) : (
            <FlatList
              data={honoredList}
              keyExtractor={item => String(item.id)}
              contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
              renderItem={({ item }) => {
                const now = new Date(); now.setHours(0, 0, 0, 0);
                const start = new Date(item.start_date); const end = new Date(item.end_date);
                const isActive = item.is_visible && start <= now && now <= end;
                const isPast   = end < now;
                return (
                  <Animated.View entering={FadeInDown.springify().damping(16)} style={hs.honorCard}>
                    {/* Photo + Name row */}
                    <View style={hs.honorCardTop}>
                      {item.photo_url ? (
                        <Image source={{ uri: item.photo_url }} style={hs.honorThumb} resizeMode="cover" />
                      ) : (
                        <View style={[hs.honorThumb, hs.honorThumbPlaceholder]}>
                          <Ionicons name="person" size={22} color="#D4AF37" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={hs.honorName}>{item.name}</Text>
                        {!!item.title && <Text style={hs.honorTitle}>{item.title}</Text>}
                        {!!item.city_role && <Text style={hs.honorRole}>{item.city_role}</Text>}
                      </View>
                      {/* Visibility badge */}
                      <View style={[hs.visChip, { backgroundColor: isActive ? "#D4AF3720" : isPast ? "#E0556720" : "#3E9CBF20", borderColor: isActive ? "#D4AF3750" : isPast ? "#E0556750" : "#3E9CBF50" }]}>
                        <View style={[hs.visDot, { backgroundColor: isActive ? "#D4AF37" : isPast ? "#E05567" : "#3E9CBF" }]} />
                        <Text style={[hs.visText, { color: isActive ? "#D4AF37" : isPast ? "#E05567" : "#3E9CBF" }]}>
                          {isActive ? "نشط" : isPast ? "منتهي" : "مجدوَل"}
                        </Text>
                      </View>
                    </View>

                    {/* Dates */}
                    <View style={hs.datesRow}>
                      <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
                      <Text style={hs.datesText}>
                        {new Date(item.start_date).toLocaleDateString("ar-SD", { day: "numeric", month: "short" })} ←
                        {new Date(item.end_date).toLocaleDateString("ar-SD", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                    </View>

                    {!!item.tribute && (
                      <Text style={hs.tributePreview} numberOfLines={2}>{item.tribute}</Text>
                    )}

                    {/* Actions */}
                    <View style={hs.honorActions}>
                      <TouchableOpacity
                        style={[hs.honorAction, { borderColor: item.is_visible ? "#D4AF3740" : "#3E9CBF40", backgroundColor: item.is_visible ? "#D4AF3712" : "#3E9CBF12" }]}
                        onPress={() => toggleHonoredVisibility(item)}
                      >
                        <Ionicons name={item.is_visible ? "eye" : "eye-off"} size={14} color={item.is_visible ? "#D4AF37" : "#3E9CBF"} />
                        <Text style={[hs.honorActionTxt, { color: item.is_visible ? "#D4AF37" : "#3E9CBF" }]}>{item.is_visible ? "إخفاء" : "إظهار"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[hs.honorAction, { borderColor: "#3498DB40", backgroundColor: "#3498DB12" }]}
                        onPress={() => {
                          setEditingHonor(item);
                          setEditHonorForm({ name: item.name, title: item.title, city_role: item.city_role, photo_url: item.photo_url, tribute: item.tribute, start_date: item.start_date.slice(0, 10), end_date: item.end_date.slice(0, 10) });
                          setShowEditHonor(true);
                        }}
                      >
                        <Ionicons name="create-outline" size={14} color="#3498DB" />
                        <Text style={[hs.honorActionTxt, { color: "#3498DB" }]}>تعديل</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[hs.honorAction, { borderColor: Colors.danger + "40", backgroundColor: Colors.danger + "12" }]}
                        onPress={() => deleteHonoredFigure(item)}
                      >
                        <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                        <Text style={[hs.honorActionTxt, { color: Colors.danger }]}>حذف</Text>
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                );
              }}
            />
          )}

          {/* ── Add Modal ── */}
          <Modal visible={showAddHonor} transparent animationType="slide" onRequestClose={() => setShowAddHonor(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
              <Pressable style={s.overlay} onPress={() => setShowAddHonor(false)}>
                <Pressable style={[s.modalCard, { maxHeight: "95%" }]} onPress={e => e.stopPropagation()}>
                  <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                    <View style={hs.modalHeaderRow}>
                      <Ionicons name="trophy" size={20} color="#D4AF37" />
                      <Text style={[s.modalTitle, { color: "#D4AF37", marginBottom: 0 }]}>إضافة شخصية مكرّمة</Text>
                    </View>

                    <Text style={s.fieldLabel}>الاسم الكامل *</Text>
                    <TextInput style={s.fieldInput} value={honorForm.name} onChangeText={v => setHonorForm(f => ({ ...f, name: v }))} placeholder="اسم الشخصية" placeholderTextColor={Colors.textMuted} textAlign="right" />

                    <Text style={s.fieldLabel}>اللقب / المنصب</Text>
                    <TextInput style={s.fieldInput} value={honorForm.title} onChangeText={v => setHonorForm(f => ({ ...f, title: v }))} placeholder="مثال: رائد أعمال · شاعر · معلم" placeholderTextColor={Colors.textMuted} textAlign="right" />

                    <Text style={s.fieldLabel}>دوره في المدينة</Text>
                    <TextInput style={s.fieldInput} value={honorForm.city_role} onChangeText={v => setHonorForm(f => ({ ...f, city_role: v }))} placeholder="مثال: خدم المجتمع لأكثر من ٣٠ عاماً" placeholderTextColor={Colors.textMuted} textAlign="right" />

                    <Text style={s.fieldLabel}>الصورة الشخصية *</Text>
                    {honorForm.photo_url ? (
                      <Image source={{ uri: honorForm.photo_url }} style={hs.honorPhotoPreview} resizeMode="cover" />
                    ) : (
                      <View style={[hs.honorPhotoPreview, hs.honorPhotoPlaceholder]}>
                        <Ionicons name="person-circle-outline" size={44} color="#D4AF37" />
                        <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 6 }}>اختر صورة شخصية</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={pickHonorImageForAdd}
                      disabled={honorImgUploading}
                      style={[s.lmPickBtn, { borderColor: "#D4AF3750", backgroundColor: "#D4AF3712" }]}
                    >
                      {honorImgUploading
                        ? <><ActivityIndicator size="small" color="#D4AF37" /><Text style={[s.lmPickBtnText, { color: "#D4AF37" }]}>جاري الرفع...</Text></>
                        : <><Ionicons name="cloud-upload-outline" size={18} color="#D4AF37" /><Text style={[s.lmPickBtnText, { color: "#D4AF37" }]}>{honorForm.photo_url ? "تغيير الصورة" : "رفع صورة"}</Text></>
                      }
                    </TouchableOpacity>

                    <Text style={s.fieldLabel}>شهادة التكريم</Text>
                    <TextInput
                      style={[s.fieldInput, { height: 90, textAlignVertical: "top", paddingTop: 10 }]}
                      value={honorForm.tribute} onChangeText={v => setHonorForm(f => ({ ...f, tribute: v }))}
                      placeholder="اكتب كلمة التكريم أو شهادة وجيزة..."
                      placeholderTextColor={Colors.textMuted} textAlign="right" multiline
                    />

                    <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>تاريخ البدء *</Text>
                        <TextInput style={s.fieldInput} value={honorForm.start_date} onChangeText={v => setHonorForm(f => ({ ...f, start_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} textAlign="right" keyboardType="numbers-and-punctuation" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>تاريخ الانتهاء *</Text>
                        <TextInput style={s.fieldInput} value={honorForm.end_date} onChangeText={v => setHonorForm(f => ({ ...f, end_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} textAlign="right" keyboardType="numbers-and-punctuation" />
                      </View>
                    </View>
                    <Text style={s.fieldHint}>يتم إخفاء الشخصية تلقائياً بعد تاريخ الانتهاء</Text>

                    <View style={[s.modalBtns, { marginTop: 8 }]}>
                      <ActionButton label="إضافة التكريم" color="#D4AF37" icon="trophy-outline" onPress={addHonoredFigure} disabled={addingHonor || honorImgUploading} />
                      <ActionButton label="إلغاء" color={Colors.textMuted} onPress={() => setShowAddHonor(false)} outline />
                    </View>
                  </ScrollView>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>

          {/* ── Edit Modal ── */}
          <Modal visible={showEditHonor} transparent animationType="slide" onRequestClose={() => setShowEditHonor(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
              <Pressable style={s.overlay} onPress={() => setShowEditHonor(false)}>
                <Pressable style={[s.modalCard, { maxHeight: "95%" }]} onPress={e => e.stopPropagation()}>
                  <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                    <View style={hs.modalHeaderRow}>
                      <Ionicons name="create" size={20} color="#3498DB" />
                      <Text style={[s.modalTitle, { color: "#3498DB", marginBottom: 0 }]}>تعديل التكريم</Text>
                    </View>

                    <Text style={s.fieldLabel}>الاسم الكامل *</Text>
                    <TextInput style={s.fieldInput} value={editHonorForm.name} onChangeText={v => setEditHonorForm(f => ({ ...f, name: v }))} placeholder="اسم الشخصية" placeholderTextColor={Colors.textMuted} textAlign="right" />

                    <Text style={s.fieldLabel}>اللقب / المنصب</Text>
                    <TextInput style={s.fieldInput} value={editHonorForm.title} onChangeText={v => setEditHonorForm(f => ({ ...f, title: v }))} placeholder="مثال: رائد أعمال · شاعر · معلم" placeholderTextColor={Colors.textMuted} textAlign="right" />

                    <Text style={s.fieldLabel}>دوره في المدينة</Text>
                    <TextInput style={s.fieldInput} value={editHonorForm.city_role} onChangeText={v => setEditHonorForm(f => ({ ...f, city_role: v }))} placeholder="مثال: خدم المجتمع لأكثر من ٣٠ عاماً" placeholderTextColor={Colors.textMuted} textAlign="right" />

                    <Text style={s.fieldLabel}>الصورة الشخصية *</Text>
                    {editHonorForm.photo_url ? (
                      <Image source={{ uri: editHonorForm.photo_url }} style={hs.honorPhotoPreview} resizeMode="cover" />
                    ) : (
                      <View style={[hs.honorPhotoPreview, hs.honorPhotoPlaceholder]}>
                        <Ionicons name="person-circle-outline" size={44} color="#D4AF37" />
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={pickHonorImageForEdit}
                      disabled={editHonorImgUploading}
                      style={[s.lmPickBtn, { borderColor: "#D4AF3750", backgroundColor: "#D4AF3712" }]}
                    >
                      {editHonorImgUploading
                        ? <><ActivityIndicator size="small" color="#D4AF37" /><Text style={[s.lmPickBtnText, { color: "#D4AF37" }]}>جاري الرفع...</Text></>
                        : <><Ionicons name="cloud-upload-outline" size={18} color="#D4AF37" /><Text style={[s.lmPickBtnText, { color: "#D4AF37" }]}>{editHonorForm.photo_url ? "تغيير الصورة" : "رفع صورة"}</Text></>
                      }
                    </TouchableOpacity>

                    <Text style={s.fieldLabel}>شهادة التكريم</Text>
                    <TextInput
                      style={[s.fieldInput, { height: 90, textAlignVertical: "top", paddingTop: 10 }]}
                      value={editHonorForm.tribute} onChangeText={v => setEditHonorForm(f => ({ ...f, tribute: v }))}
                      placeholder="اكتب كلمة التكريم أو شهادة وجيزة..."
                      placeholderTextColor={Colors.textMuted} textAlign="right" multiline
                    />

                    <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>تاريخ البدء *</Text>
                        <TextInput style={s.fieldInput} value={editHonorForm.start_date} onChangeText={v => setEditHonorForm(f => ({ ...f, start_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} textAlign="right" keyboardType="numbers-and-punctuation" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>تاريخ الانتهاء *</Text>
                        <TextInput style={s.fieldInput} value={editHonorForm.end_date} onChangeText={v => setEditHonorForm(f => ({ ...f, end_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} textAlign="right" keyboardType="numbers-and-punctuation" />
                      </View>
                    </View>

                    <View style={[s.modalBtns, { marginTop: 8 }]}>
                      <ActionButton label="حفظ التعديلات" color="#D4AF37" icon="save-outline" onPress={updateHonoredFigure} disabled={updatingHonor || editHonorImgUploading} />
                      <ActionButton label="إلغاء" color={Colors.textMuted} onPress={() => setShowEditHonor(false)} outline />
                    </View>
                  </ScrollView>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      )}

      {/* Landmarks */}
      {tab === "landmarks" && (
        <View style={{ flex: 1 }}>
          <View style={s.pageHeader}>
            <Text style={s.pageHeaderTitle}>معالم المدينة ({landmarks.length})</Text>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: "#9B59B6" }]} onPress={() => setShowAddLM(true)}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={s.addBtnTxt}>إضافة</Text>
            </TouchableOpacity>
          </View>

          {loadingLM ? (
            <ActivityIndicator color="#9B59B6" style={{ marginTop: 60 }} />
          ) : (
            <FlatList
              data={landmarks}
              keyExtractor={lm => String(lm.id)}
              contentContainerStyle={{ padding: 14, paddingBottom: 60, gap: 10 }}
              ListEmptyComponent={<Text style={s.empty}>لا توجد معالم — أضف أول معلم</Text>}
              renderItem={({ item }) => (
                <Animated.View entering={FadeInDown.springify().damping(16)} style={s.lmCard}>
                  {item.image_url.startsWith("http") ? (
                    <Image source={{ uri: item.image_url }} style={s.lmThumb} resizeMode="cover" />
                  ) : (
                    <View style={[s.lmThumb, s.lmThumbLocal]}>
                      <Ionicons name="image-outline" size={22} color="#9B59B6" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.lmName}>{item.name}</Text>
                    {item.sub ? <Text style={s.lmSub}>{item.sub}</Text> : null}
                    <Text style={s.lmUrl} numberOfLines={1}>{item.image_url}</Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    <TouchableOpacity
                      style={[s.iconBtn, { backgroundColor: "#3498DB15", borderColor: "#3498DB30" }]}
                      onPress={() => { setEditingLM(item); setEditLmForm({ name: item.name, sub: item.sub || "", image_url: item.image_url }); setShowEditLM(true); }}
                    >
                      <Ionicons name="pencil-outline" size={15} color="#3498DB" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.iconBtn, { backgroundColor: "#E0556715", borderColor: "#E0556730" }]}
                      onPress={() => deleteLandmark(item)}
                    >
                      <Ionicons name="trash-outline" size={15} color="#E05567" />
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}
            />
          )}

          {/* Edit Modal */}
          <Modal visible={showEditLM} transparent animationType="slide" onRequestClose={() => setShowEditLM(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
              <Pressable style={s.overlay} onPress={() => setShowEditLM(false)}>
                <Pressable style={s.modalCard} onPress={e => e.stopPropagation()}>
                  <Text style={s.modalTitle}>تعديل المعلم</Text>
                  <Text style={s.fieldLabel}>اسم المعلم *</Text>
                  <TextInput style={s.fieldInput} value={editLmForm.name} onChangeText={v => setEditLmForm(f => ({ ...f, name: v }))} placeholder="مثال: عجلة الهواء" placeholderTextColor={Colors.textMuted} textAlign="right" />
                  <Text style={s.fieldLabel}>الوصف (اختياري)</Text>
                  <TextInput style={s.fieldInput} value={editLmForm.sub} onChangeText={v => setEditLmForm(f => ({ ...f, sub: v }))} placeholder="وصف قصير" placeholderTextColor={Colors.textMuted} textAlign="right" />

                  <Text style={s.fieldLabel}>صورة المعلم *</Text>
                  {/* معاينة الصورة */}
                  {editLmForm.image_url.startsWith("http") ? (
                    <Image source={{ uri: editLmForm.image_url }} style={s.lmImgPreview} resizeMode="cover" />
                  ) : editLmForm.image_url ? (
                    <View style={[s.lmImgPreview, s.lmImgPlaceholder]}>
                      <Ionicons name="image-outline" size={28} color="#9B59B6" />
                      <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 4 }} numberOfLines={1}>{editLmForm.image_url}</Text>
                    </View>
                  ) : (
                    <View style={[s.lmImgPreview, s.lmImgPlaceholder]}>
                      <Ionicons name="camera-outline" size={30} color={Colors.textMuted} />
                      <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 6 }}>لم تُختر صورة بعد</Text>
                    </View>
                  )}
                  {/* زر رفع الصورة */}
                  <TouchableOpacity
                    onPress={pickLandmarkImageForEdit}
                    disabled={lmEditImgUploading}
                    style={[s.lmPickBtn, { borderColor: "#9B59B6" + "50", backgroundColor: "#9B59B6" + "12" }]}
                  >
                    {lmEditImgUploading
                      ? <><ActivityIndicator size="small" color="#9B59B6" /><Text style={[s.lmPickBtnText, { color: "#9B59B6" }]}>جاري الرفع...</Text></>
                      : <><Ionicons name="cloud-upload-outline" size={18} color="#9B59B6" /><Text style={[s.lmPickBtnText, { color: "#9B59B6" }]}>{editLmForm.image_url ? "تغيير الصورة" : "رفع صورة من الجهاز"}</Text></>
                    }
                  </TouchableOpacity>
                  {/* رابط يدوي (اختياري) */}
                  <Text style={[s.fieldLabel, { marginTop: 8 }]}>أو أدخل رابط الصورة يدوياً</Text>
                  <TextInput style={s.fieldInput} value={editLmForm.image_url} onChangeText={v => setEditLmForm(f => ({ ...f, image_url: v }))} placeholder="https://..." placeholderTextColor={Colors.textMuted} textAlign="right" autoCapitalize="none" keyboardType="url" />

                  <View style={s.modalBtns}>
                    <ActionButton label="حفظ التعديلات" color="#3498DB" icon="save-outline" onPress={updateLandmark} disabled={updatingLM || lmEditImgUploading} />
                    <ActionButton label="إلغاء" color={Colors.textMuted} onPress={() => setShowEditLM(false)} outline />
                  </View>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>

          {/* Add Modal */}
          <Modal visible={showAddLM} transparent animationType="slide" onRequestClose={() => setShowAddLM(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
              <Pressable style={s.overlay} onPress={() => setShowAddLM(false)}>
                <Pressable style={s.modalCard} onPress={e => e.stopPropagation()}>
                  <Text style={s.modalTitle}>إضافة معلم جديد</Text>
                  <Text style={s.fieldLabel}>اسم المعلم *</Text>
                  <TextInput style={s.fieldInput} value={lmForm.name} onChangeText={v => setLmForm(f => ({ ...f, name: v }))} placeholder="مثال: عجلة الهواء" placeholderTextColor={Colors.textMuted} textAlign="right" />
                  <Text style={s.fieldLabel}>الوصف (اختياري)</Text>
                  <TextInput style={s.fieldInput} value={lmForm.sub} onChangeText={v => setLmForm(f => ({ ...f, sub: v }))} placeholder="وصف قصير" placeholderTextColor={Colors.textMuted} textAlign="right" />

                  <Text style={s.fieldLabel}>صورة المعلم *</Text>
                  {/* معاينة الصورة */}
                  {lmForm.image_url.startsWith("http") ? (
                    <Image source={{ uri: lmForm.image_url }} style={s.lmImgPreview} resizeMode="cover" />
                  ) : lmForm.image_url ? (
                    <View style={[s.lmImgPreview, s.lmImgPlaceholder]}>
                      <Ionicons name="image-outline" size={28} color="#9B59B6" />
                      <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 4 }} numberOfLines={1}>{lmForm.image_url}</Text>
                    </View>
                  ) : (
                    <View style={[s.lmImgPreview, s.lmImgPlaceholder]}>
                      <Ionicons name="camera-outline" size={30} color={Colors.textMuted} />
                      <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 6 }}>اختر صورة المعلم</Text>
                    </View>
                  )}
                  {/* زر رفع الصورة */}
                  <TouchableOpacity
                    onPress={pickLandmarkImageForAdd}
                    disabled={lmAddImgUploading}
                    style={[s.lmPickBtn, { borderColor: "#9B59B6" + "50", backgroundColor: "#9B59B6" + "12" }]}
                  >
                    {lmAddImgUploading
                      ? <><ActivityIndicator size="small" color="#9B59B6" /><Text style={[s.lmPickBtnText, { color: "#9B59B6" }]}>جاري الرفع...</Text></>
                      : <><Ionicons name="cloud-upload-outline" size={18} color="#9B59B6" /><Text style={[s.lmPickBtnText, { color: "#9B59B6" }]}>{lmForm.image_url ? "تغيير الصورة" : "رفع صورة من الجهاز"}</Text></>
                    }
                  </TouchableOpacity>
                  {/* رابط يدوي (اختياري) */}
                  <Text style={[s.fieldLabel, { marginTop: 8 }]}>أو أدخل رابط الصورة يدوياً</Text>
                  <TextInput style={s.fieldInput} value={lmForm.image_url} onChangeText={v => setLmForm(f => ({ ...f, image_url: v }))} placeholder="https://... أو local:ferris-wheel" placeholderTextColor={Colors.textMuted} textAlign="right" autoCapitalize="none" keyboardType="url" />
                  <Text style={s.fieldHint}>للصور المحلية: local:ferris-wheel أو local:hasahisa-city</Text>

                  <View style={s.modalBtns}>
                    <ActionButton label="إضافة المعلم" color="#9B59B6" icon="add-circle-outline" onPress={addLandmark} disabled={addingLM || lmAddImgUploading} />
                    <ActionButton label="إلغاء" color={Colors.textMuted} onPress={() => setShowAddLM(false)} outline />
                  </View>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      )}

      {/* Ads */}
      {tab === "ads" && (
        <View style={{ flex: 1 }}>
          <View style={s.pageHeader}>
            <Text style={s.pageHeaderTitle}>
              الإعلانات ({adsList.length}){pendingAdsCount > 0 ? ` · ${pendingAdsCount} معلق` : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {isAdmin && (
                <TouchableOpacity style={[s.addBtn, { backgroundColor: Colors.primary + "15", borderWidth: 1, borderColor: Colors.primary }]} onPress={() => setShowAdsSettingsModal(true)}>
                  <Ionicons name="settings-outline" size={14} color={Colors.primary} />
                  <Text style={[s.addBtnTxt, { color: Colors.primary }]}>الإعدادات</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.addBtn, { backgroundColor: "#F0A50015", borderWidth: 1, borderColor: "#F0A500" }]} onPress={loadAds}>
                <Ionicons name="refresh" size={14} color="#F0A500" />
                <Text style={[s.addBtnTxt, { color: "#F0A500" }]}>تحديث</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow} style={{ flexGrow: 0 }}>
            {(["all", "pending", "active", "rejected", "expired"] as const).map(f => {
              const meta = f === "all" ? { label: "الكل", color: Colors.cyber } : { label: AD_STATUS_META[f]?.label, color: AD_STATUS_META[f]?.color };
              return (
                <TouchableOpacity
                  key={f}
                  style={[s.filterChip, adsFilter === f && { backgroundColor: meta.color + "20", borderColor: meta.color }]}
                  onPress={() => setAdsFilter(f)}
                >
                  <Text style={[s.filterChipTxt, adsFilter === f && { color: meta.color, fontFamily: "Cairo_700Bold" }]}>
                    {meta.label}{f === "pending" && pendingAdsCount > 0 ? ` (${pendingAdsCount})` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {loadingAds ? (
            <ActivityIndicator color="#F0A500" style={{ marginTop: 60 }} />
          ) : (
            <FlatList
              data={filteredAds}
              keyExtractor={a => String(a.id)}
              contentContainerStyle={{ padding: 14, paddingBottom: 60, gap: 10 }}
              ListEmptyComponent={<Text style={s.empty}>{adsFilter === "pending" ? "لا توجد طلبات معلقة" : "لا توجد إعلانات"}</Text>}
              renderItem={({ item: ad }) => {
                const statusMeta = AD_STATUS_META[ad.status] ?? AD_STATUS_META.pending;
                return (
                  <Animated.View entering={FadeInDown.springify().damping(16)}>
                    <TouchableOpacity
                      style={[s.adCard, { borderRightWidth: 3, borderRightColor: statusMeta.color }]}
                      onPress={() => { setAdDetailModal(ad); setApprovalDays(String(ad.duration_days)); setAdminNote(ad.admin_note || ""); }}
                      activeOpacity={0.82}
                    >
                      <View style={s.adCardRow}>
                        <View style={[s.adStatusIcon, { backgroundColor: statusMeta.color + "20" }]}>
                          <Ionicons name={statusMeta.icon} size={17} color={statusMeta.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.adCardTitle}>{ad.institution_name}</Text>
                          <Text style={s.adCardSub} numberOfLines={1}>{ad.title}</Text>
                        </View>
                        <View style={[s.adStatusBadge, { backgroundColor: statusMeta.color + "18" }]}>
                          <Text style={[s.adStatusTxt, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                        </View>
                      </View>
                      <View style={s.adMeta}>
                        {ad.contact_phone ? (
                          <View style={s.adMetaItem}>
                            <Ionicons name="call-outline" size={11} color={Colors.textMuted} />
                            <Text style={s.adMetaTxt}>{ad.contact_phone}</Text>
                          </View>
                        ) : null}
                        <View style={s.adMetaItem}>
                          <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                          <Text style={s.adMetaTxt}>{new Date(ad.created_at).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}</Text>
                        </View>
                        {ad.budget ? (
                          <View style={s.adMetaItem}>
                            <Ionicons name="cash-outline" size={11} color={Colors.accent} />
                            <Text style={[s.adMetaTxt, { color: Colors.accent }]}>{ad.budget}</Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              }}
            />
          )}

          {/* Ads Settings Modal */}
          {isAdmin && (
            <Modal visible={showAdsSettingsModal} transparent animationType="slide" onRequestClose={() => setShowAdsSettingsModal(false)}>
              <Pressable style={s.overlay} onPress={() => setShowAdsSettingsModal(false)}>
                <Pressable style={[s.modalCard, { maxHeight: "90%" }]} onPress={e => e.stopPropagation()}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", marginBottom: 16, gap: 10 }}>
                      <Ionicons name="settings" size={22} color={Colors.primary} />
                      <Text style={[s.modalTitle, { flex: 1, marginBottom: 0 }]}>إعدادات الإعلانات</Text>
                    </View>

                    {/* إحصائية الإيرادات */}
                    <View style={[s.infoBlock, { backgroundColor: Colors.accent + "10", borderColor: Colors.accent + "30" }]}>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <Ionicons name="cash" size={16} color={Colors.accent} />
                        <Text style={{ fontFamily: "Cairo_700Bold", color: Colors.accent, fontSize: 14 }}>إحصائيات الإيرادات</Text>
                      </View>
                      <InfoRow label="الإعلانات النشطة" value={String(adsList.filter(a => a.status === "active").length)} />
                      <InfoRow label="مجموع الطلبات" value={String(adsList.length)} />
                      <InfoRow
                        label="إجمالي الإيرادات (تقديري)"
                        value={`${adsList.filter(a => a.status === "active" || a.status === "expired").reduce((sum, a) => sum + (a.duration_days || 0) * parseInt(adsSettings.ad_price_per_day || "500"), 0).toLocaleString()} جنيه`}
                      />
                    </View>

                    <View style={s.divider} />
                    <Text style={[s.fieldLabel, { marginBottom: 10 }]}>إعدادات التسعير والتواصل</Text>

                    {[
                      { label: "سعر اليوم الواحد (جنيه)", key: "ad_price_per_day", numeric: true, placeholder: "500" },
                      { label: "رقم التواصل للإعلانات", key: "ad_contact_phone", placeholder: "+249..." },
                      { label: "رقم واتساب للإعلانات", key: "ad_contact_whatsapp", placeholder: "+249..." },
                      { label: "البريد الإلكتروني (اختياري)", key: "ad_partner_email", placeholder: "ads@..." },
                    ].map(f => (
                      <View key={f.key} style={{ marginBottom: 12 }}>
                        <Text style={s.fieldLabel}>{f.label}</Text>
                        <TextInput
                          style={s.fieldInput}
                          value={(adsSettings as any)[f.key]}
                          onChangeText={v => setAdsSettings(prev => ({ ...prev, [f.key]: v }))}
                          keyboardType={f.numeric ? "numeric" : "default"}
                          placeholder={f.placeholder}
                          placeholderTextColor={Colors.textMuted}
                          textAlign="right"
                          autoCapitalize="none"
                        />
                      </View>
                    ))}

                    <Text style={s.fieldLabel}>نص ترويجي مخصص</Text>
                    <TextInput
                      style={[s.fieldInput, { height: 80 }]}
                      value={adsSettings.ad_promo_text}
                      onChangeText={v => setAdsSettings(prev => ({ ...prev, ad_promo_text: v }))}
                      multiline
                      textAlign="right"
                      textAlignVertical="top"
                      placeholder="نص يظهر في شاشة الإعلانات لتحفيز المؤسسات..."
                      placeholderTextColor={Colors.textMuted}
                    />

                    <Text style={[s.fieldLabel, { marginTop: 12 }]}>معلومات الدفع / البنك (اختياري)</Text>
                    <TextInput
                      style={[s.fieldInput, { height: 72 }]}
                      value={adsSettings.ad_bank_info}
                      onChangeText={v => setAdsSettings(prev => ({ ...prev, ad_bank_info: v }))}
                      multiline
                      textAlign="right"
                      textAlignVertical="top"
                      placeholder="رقم الحساب / اسم البنك / طريقة الدفع..."
                      placeholderTextColor={Colors.textMuted}
                    />

                    <View style={[s.modalBtns, { marginTop: 16 }]}>
                      <ActionButton
                        label={savingAdsSettings ? "جاري الحفظ..." : "حفظ الإعدادات"}
                        color={Colors.primary}
                        icon="save-outline"
                        onPress={saveAdsSettings}
                        disabled={savingAdsSettings}
                      />
                    </View>
                    <TouchableOpacity style={[s.cancelBtn, { marginTop: 10 }]} onPress={() => setShowAdsSettingsModal(false)}>
                      <Text style={s.cancelTxt}>إغلاق</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>
          )}

          {/* Ad Detail Modal */}
          <Modal visible={!!adDetailModal} transparent animationType="slide" onRequestClose={() => setAdDetailModal(null)}>
            <Pressable style={s.overlay} onPress={() => setAdDetailModal(null)}>
              <Pressable style={[s.modalCard, { maxHeight: "92%" }]} onPress={e => e.stopPropagation()}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {adDetailModal && (() => {
                    const ad = adDetailModal;
                    const statusMeta = AD_STATUS_META[ad.status] ?? AD_STATUS_META.pending;
                    return (
                      <>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 16 }}>
                          <Text style={[s.modalTitle, { flex: 1, marginBottom: 0 }]}>{ad.institution_name}</Text>
                          <View style={[s.adStatusBadge, { backgroundColor: statusMeta.color + "20" }]}>
                            <Text style={[s.adStatusTxt, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                          </View>
                        </View>

                        {ad.image_url && (
                          <Image
                            source={{ uri: ad.image_url }}
                            style={{ width: "100%", height: 160, borderRadius: 12, marginBottom: 12 }}
                            resizeMode="cover"
                          />
                        )}
                        <View style={s.infoBlock}>
                          <InfoRow label="عنوان الإعلان" value={ad.title} />
                          <InfoRow label="تفاصيل"         value={ad.description} />
                          <InfoRow label="نوع الإعلان"    value={ad.type} />
                          <InfoRow label="شخص التواصل"    value={ad.contact_name} />
                          <InfoRow label="رقم التواصل"    value={ad.contact_phone} />
                          <InfoRow label="الموقع الإلكتروني" value={ad.website_url} />
                          <InfoRow label="الميزانية"      value={ad.budget} />
                          <InfoRow label="مدة مطلوبة"     value={`${ad.duration_days} يوم`} />
                          <InfoRow label="ملاحظة الإدارة" value={ad.admin_note} />
                          <InfoRow label="تاريخ الطلب"    value={new Date(ad.created_at).toLocaleDateString("ar-SA")} />
                        </View>

                        {ad.status === "pending" && (
                          <>
                            <View style={s.divider} />
                            <Text style={s.fieldLabel}>مدة النشر (أيام)</Text>
                            <TextInput style={s.fieldInput} value={approvalDays} onChangeText={setApprovalDays} keyboardType="numeric" textAlign="right" />
                            <Text style={s.fieldLabel}>ملاحظة للمؤسسة (اختياري)</Text>
                            <TextInput style={[s.fieldInput, { height: 72 }]} value={adminNote} onChangeText={setAdminNote} multiline textAlign="right" placeholder="رسالة توضيحية..." placeholderTextColor={Colors.textMuted} textAlignVertical="top" />
                            <View style={s.modalBtns}>
                              <ActionButton label="قبول ونشر" color={Colors.primary} icon="checkmark-circle-outline" onPress={() => updateAdStatus(ad, "active", approvalDays, adminNote)} disabled={approvingId === ad.id} />
                              <ActionButton label="رفض" color="#E05567" icon="close-circle-outline" onPress={() => updateAdStatus(ad, "rejected", approvalDays, adminNote)} disabled={approvingId === ad.id} outline />
                            </View>
                          </>
                        )}

                        {ad.status === "active" && (
                          <>
                            <View style={s.divider} />
                            <ActionButton label="إيقاف الإعلان" color="#E67E22" icon="pause-circle-outline" onPress={() => updateAdStatus(ad, "expired", approvalDays, adminNote)} disabled={approvingId === ad.id} />
                          </>
                        )}

                        {isAdmin && (
                          <>
                            <View style={[s.divider, { marginTop: 12 }]} />
                            <ActionButton label="حذف الإعلان نهائياً" color="#E05567" icon="trash-outline" onPress={() => deleteAd(ad)} outline />
                          </>
                        )}

                        <TouchableOpacity style={[s.cancelBtn, { marginTop: 10 }]} onPress={() => setAdDetailModal(null)}>
                          <Text style={s.cancelTxt}>إغلاق</Text>
                        </TouchableOpacity>
                      </>
                    );
                  })()}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      )}

      {/* Communities */}
      {tab === "communities" && (
        <View style={{ flex: 1 }}>
          {/* ── Header ── */}
          <View style={s.pageHeader}>
            <Text style={s.pageHeaderTitle}>
              المؤسسات ({communitiesList.length}){pendingCommunitiesCount > 0 ? ` · ${pendingCommunitiesCount} معلق` : ""}
            </Text>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <TouchableOpacity style={[s.addBtn, { backgroundColor: "#16A08515", borderWidth: 1, borderColor: "#16A085" }]} onPress={loadCommunities}>
                <Ionicons name="refresh" size={14} color="#16A085" />
                <Text style={[s.addBtnTxt, { color: "#16A085" }]}>تحديث</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.addBtn, { backgroundColor: Colors.primary + "18", borderWidth: 1, borderColor: Colors.primary }]} onPress={() => setShowCommunityForm(true)}>
                <Ionicons name="add-circle-outline" size={14} color={Colors.primary} />
                <Text style={[s.addBtnTxt, { color: Colors.primary }]}>رفع طلب</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Moderator notice ── */}
          {isMod && (
            <View style={{ marginHorizontal: 14, marginBottom: 8, padding: 10, backgroundColor: "#F0A50012", borderRadius: 8, borderWidth: 1, borderColor: "#F0A50030", flexDirection: "row-reverse", gap: 8, alignItems: "center" }}>
              <Ionicons name="information-circle-outline" size={16} color="#F0A500" />
              <Text style={{ color: "#F0A500", fontFamily: "Cairo_400Regular", fontSize: 12, flex: 1, textAlign: "right" }}>
                صلاحيتك: رفع طلبات مؤسسات جديدة للمراجعة. الموافقة والإيقاف والحذف من صلاحية الإدارة فقط.
              </Text>
            </View>
          )}

          {/* ── إعداد رقم واتساب عقود المؤسسات ── */}
          {isAdmin && (
            <View style={{ marginHorizontal: 14, marginBottom: 12, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.primary + "30" }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#25D36620", justifyContent: "center", alignItems: "center" }}>
                  <MaterialCommunityIcons name="whatsapp" size={18} color="#25D366" />
                </View>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary }}>رقم واتساب عقود المؤسسات</Text>
              </View>
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 8 }}>
                هذا الرقم يُرسَل إليه عقد الانضمام الموقع من المؤسسات عبر واتساب
              </Text>
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TextInput
                  value={contractWhatsapp}
                  onChangeText={setContractWhatsapp}
                  placeholder="+966597083352"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  style={{
                    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
                    backgroundColor: Colors.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                    borderWidth: 1, borderColor: Colors.divider, textAlign: "right",
                  }}
                />
                <TouchableOpacity
                  onPress={saveContractSettings}
                  disabled={savingContractSettings}
                  style={{ backgroundColor: "#25D366", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }}
                >
                  {savingContractSettings
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>حفظ</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Service Requests ── */}
          <View style={{ marginHorizontal: 14, marginBottom: 8 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                {(["pending", "approved", "rejected"] as const).map(sf => {
                  const sfMeta = sf === "pending" ? { label: "معلّقة", color: Colors.accent }
                               : sf === "approved" ? { label: "مقبولة", color: Colors.primary }
                               :                    { label: "مرفوضة", color: "#EF4444" };
                  return (
                    <TouchableOpacity
                      key={sf}
                      style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: svcReqsFilter === sf ? sfMeta.color : Colors.divider, backgroundColor: svcReqsFilter === sf ? sfMeta.color + "18" : "transparent" }]}
                      onPress={() => { setSvcReqsFilter(sf); loadServiceRequests(sf); }}
                    >
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: svcReqsFilter === sf ? sfMeta.color : Colors.textMuted }}>{sfMeta.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                {svcRequests.filter(r => r.status === "pending").length > 0 && (
                  <View style={{ backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" }}>{svcRequests.filter(r => r.status === "pending").length}</Text>
                  </View>
                )}
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" }}>طلبات الخدمات</Text>
                <Ionicons name="layers-outline" size={15} color={Colors.cyber} />
              </View>
            </View>

            {loadingSvcReqs ? (
              <ActivityIndicator color={Colors.cyber} size="small" style={{ marginVertical: 8 }} />
            ) : svcRequests.length === 0 ? (
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center", paddingVertical: 8 }}>
                {svcReqsFilter === "pending" ? "لا توجد طلبات معلقة" : "لا توجد طلبات"}
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ gap: 8 }}>
                {svcRequests.map(sr => {
                  const actionMeta = sr.action === "add"  ? { label: "إضافة",  color: Colors.primary, icon: "add-circle-outline" as const }
                                   : sr.action === "hide" ? { label: "إخفاء",  color: "#EF4444",      icon: "eye-off-outline"    as const }
                                   :                       { label: "إظهار",  color: Colors.cyber,   icon: "eye-outline"        as const };
                  const isDeciding = decidingSvcReqId === sr.id;
                  return (
                    <View key={sr.id} style={{ backgroundColor: Colors.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.divider, gap: 8 }}>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" }}>{sr.service_name}</Text>
                          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" }}>{sr.community_name}</Text>
                        </View>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: actionMeta.color + "18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Ionicons name={actionMeta.icon} size={12} color={actionMeta.color} />
                          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: actionMeta.color }}>{actionMeta.label}</Text>
                        </View>
                      </View>
                      {sr.submitted_by_name && (
                        <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" }}>مقدّم من: {sr.submitted_by_name}</Text>
                      )}
                      {svcReqsFilter === "pending" && (
                        <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 4 }}>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: "#EF444415", borderColor: "#EF4444", flex: 1, opacity: isDeciding ? 0.5 : 1 }]}
                            disabled={isDeciding}
                            onPress={() => decideServiceRequest(sr.id, "rejected")}
                          >
                            {isDeciding ? <ActivityIndicator size="small" color="#EF4444" /> : <><Ionicons name="close" size={14} color="#EF4444" /><Text style={[s.actionBtnTxt, { color: "#EF4444" }]}>رفض</Text></>}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: Colors.primary + "18", borderColor: Colors.primary, flex: 1, opacity: isDeciding ? 0.5 : 1 }]}
                            disabled={isDeciding}
                            onPress={() => decideServiceRequest(sr.id, "approved")}
                          >
                            {isDeciding ? <ActivityIndicator size="small" color={Colors.primary} /> : <><Ionicons name="checkmark" size={14} color={Colors.primary} /><Text style={[s.actionBtnTxt, { color: Colors.primary }]}>موافقة</Text></>}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* ── Filters ── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow} style={{ flexGrow: 0 }}>
            {(["pending", "all", "active", "suspended", "rejected"] as const).map(f => {
              const meta = f === "all"       ? { label: "الكل",       color: Colors.cyber    }
                         : f === "pending"   ? { label: "قيد المراجعة", color: "#F0A500"    }
                         : f === "active"    ? { label: "نشط",         color: Colors.primary }
                         : f === "suspended" ? { label: "موقوف مؤقتاً", color: "#E67E22"   }
                         :                    { label: "مرفوض",        color: "#E05567"      };
              return (
                <TouchableOpacity
                  key={f}
                  style={[s.filterChip, communityFilter === f && { backgroundColor: meta.color + "20", borderColor: meta.color }]}
                  onPress={() => setCommunityFilter(f as any)}
                >
                  <Text style={[s.filterChipTxt, communityFilter === f && { color: meta.color, fontFamily: "Cairo_700Bold" }]}>
                    {meta.label}{f === "pending" && pendingCommunitiesCount > 0 ? ` (${pendingCommunitiesCount})` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── List ── */}
          {loadingCommunities ? (
            <ActivityIndicator color="#16A085" style={{ marginTop: 60 }} />
          ) : (
            <FlatList
              data={filteredCommunities}
              keyExtractor={c => String(c.id)}
              contentContainerStyle={{ padding: 14, paddingBottom: 80, gap: 10 }}
              ListEmptyComponent={<Text style={s.empty}>{communityFilter === "pending" ? "لا توجد طلبات معلقة" : "لا توجد مؤسسات"}</Text>}
              renderItem={({ item: c }) => {
                const statusColor = c.status === "active" ? Colors.primary
                  : c.status === "suspended" ? "#E67E22"
                  : c.status === "rejected"  ? "#E05567"
                  : "#F0A500";
                const statusLabel = c.status === "active" ? "نشط"
                  : c.status === "suspended" ? "موقوف مؤقتاً"
                  : c.status === "rejected"  ? "مرفوض"
                  : "قيد المراجعة";
                return (
                  <Animated.View entering={FadeInDown.springify().damping(16)}>
                    <TouchableOpacity
                      style={[s.adCard, { borderRightWidth: 3, borderRightColor: statusColor }]}
                      onPress={() => setCommunityDetailModal(c)}
                      activeOpacity={0.82}
                    >
                      <View style={s.adCardRow}>
                        <View style={[s.adStatusIcon, { backgroundColor: "#16A08520" }]}>
                          <Ionicons name="business-outline" size={17} color="#16A085" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.adCardTitle}>{c.name}</Text>
                          <Text style={s.adCardSub} numberOfLines={1}>{c.category}{c.origin ? ` · ${c.origin}` : ""}</Text>
                        </View>
                        <View style={[s.adStatusBadge, { backgroundColor: statusColor + "18" }]}>
                          <Text style={[s.adStatusTxt, { color: statusColor }]}>{statusLabel}</Text>
                        </View>
                      </View>
                      <View style={s.adMeta}>
                        {c.representative_name ? (
                          <View style={s.adMetaItem}>
                            <Ionicons name="person-outline" size={11} color={Colors.textMuted} />
                            <Text style={s.adMetaTxt}>{c.representative_name}</Text>
                          </View>
                        ) : null}
                        {c.contact_phone ? (
                          <View style={s.adMetaItem}>
                            <Ionicons name="call-outline" size={11} color={Colors.textMuted} />
                            <Text style={s.adMetaTxt}>{c.contact_phone}</Text>
                          </View>
                        ) : null}
                        {c.submitted_by_name ? (
                          <View style={s.adMetaItem}>
                            <Ionicons name="shield-half-outline" size={11} color="#F0A500" />
                            <Text style={[s.adMetaTxt, { color: "#F0A500" }]}>رُفع بواسطة: {c.submitted_by_name}</Text>
                          </View>
                        ) : null}
                        <View style={s.adMetaItem}>
                          <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                          <Text style={s.adMetaTxt}>{new Date(c.created_at).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              }}
            />
          )}

          {/* ── Community Detail Modal ── */}
          <Modal visible={!!communityDetailModal} transparent animationType="slide" onRequestClose={() => setCommunityDetailModal(null)}>
            <Pressable style={s.overlay} onPress={() => setCommunityDetailModal(null)}>
              <Pressable style={[s.modalCard, { maxHeight: "92%" }]} onPress={e => e.stopPropagation()}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {communityDetailModal && (() => {
                    const c = communityDetailModal;
                    const statusColor = c.status === "active" ? Colors.primary
                      : c.status === "suspended" ? "#E67E22"
                      : c.status === "rejected"  ? "#E05567"
                      : "#F0A500";
                    const statusLabel = c.status === "active" ? "نشط"
                      : c.status === "suspended" ? "موقوف مؤقتاً"
                      : c.status === "rejected"  ? "مرفوض"
                      : "قيد المراجعة";
                    return (
                      <>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 16 }}>
                          <Text style={[s.modalTitle, { flex: 1, marginBottom: 0 }]}>{c.name}</Text>
                          <View style={[s.adStatusBadge, { backgroundColor: statusColor + "20" }]}>
                            <Text style={[s.adStatusTxt, { color: statusColor }]}>{statusLabel}</Text>
                          </View>
                        </View>

                        {/* ── بيانات المؤسسة ── */}
                        <View style={s.infoBlock}>
                          <InfoRow label="التصنيف"      value={c.category} />
                          <InfoRow label="الأصل / المنشأ" value={c.origin} />
                          <InfoRow label="الحي / المنطقة" value={c.neighborhood} />
                          <InfoRow label="الخدمات"       value={c.services} />
                          <InfoRow label="رقم تواصل المؤسسة" value={c.contact_phone} />
                          <InfoRow label="عدد الأعضاء"  value={c.members_count ? String(c.members_count) : undefined} />
                          <InfoRow label="الوصف"         value={c.description} />
                        </View>

                        {/* ── بيانات ممثل الجهة ── */}
                        <View style={{ backgroundColor: Colors.primary + "08", borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.primary + "20" }}>
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 10 }}>
                            <Ionicons name="person-circle-outline" size={16} color={Colors.primary} />
                            <Text style={{ color: Colors.primary, fontFamily: "Cairo_700Bold", fontSize: 13 }}>بيانات ممثل الجهة</Text>
                          </View>
                          <View style={s.infoBlock}>
                            <InfoRow label="الاسم الكامل"       value={c.representative_name} />
                            <InfoRow label="المنصب / الوظيفة"   value={c.representative_title} />
                            <InfoRow label="الهاتف الشخصي"      value={c.representative_phone} />
                            <InfoRow label="رقم الهوية"          value={c.representative_national_id} />
                            <InfoRow label="البريد الإلكتروني"  value={c.representative_email} />
                          </View>
                        </View>

                        {/* ── معلومات الطلب ── */}
                        <View style={s.infoBlock}>
                          {c.submitted_by_name && <InfoRow label="رُفع بواسطة المشرف" value={c.submitted_by_name} />}
                          {c.suspension_reason  && <InfoRow label="سبب الإيقاف"        value={c.suspension_reason} />}
                          <InfoRow label="تاريخ الطلب" value={new Date(c.created_at).toLocaleDateString("ar-SA")} />
                        </View>

                        {/* ── Admin actions only ── */}
                        {isAdmin && (
                          <>
                            <View style={s.divider} />
                            {c.status === "pending" && (
                              <>
                                <Text style={[s.fieldLabel, { marginBottom: 12, textAlign: "center", color: "#F0A500" }]}>
                                  ⬤ طلب قيد المراجعة — اتخذ قراراً
                                </Text>
                                <View style={s.modalBtns}>
                                  <ActionButton
                                    label="قبول وتفعيل"
                                    color={Colors.primary}
                                    icon="checkmark-circle-outline"
                                    onPress={() => updateCommunityStatus(c, "active")}
                                    disabled={approvingCommunityId === c.id}
                                  />
                                  <ActionButton
                                    label="رفض الطلب"
                                    color="#E05567"
                                    icon="close-circle-outline"
                                    onPress={() => updateCommunityStatus(c, "rejected")}
                                    disabled={approvingCommunityId === c.id}
                                    outline
                                  />
                                </View>
                              </>
                            )}
                            {(c.status === "active" || c.status === "suspended") && (
                              <View style={s.modalBtns}>
                                {c.status === "active" && (
                                  <ActionButton
                                    label="إيقاف مؤقت"
                                    color="#E67E22"
                                    icon="pause-circle-outline"
                                    onPress={() => { setCommunityDetailModal(null); setSuspendModal(c); }}
                                    disabled={approvingCommunityId === c.id}
                                  />
                                )}
                                {c.status === "suspended" && (
                                  <ActionButton
                                    label="إعادة تفعيل"
                                    color={Colors.primary}
                                    icon="play-circle-outline"
                                    onPress={() => updateCommunityStatus(c, "active")}
                                    disabled={approvingCommunityId === c.id}
                                  />
                                )}
                              </View>
                            )}
                            <View style={[s.divider, { marginTop: 12 }]} />
                            <ActionButton
                              label="حذف نهائياً"
                              color="#E05567"
                              icon="trash-outline"
                              onPress={() => deleteCommunity(c)}
                              outline
                            />
                          </>
                        )}

                        {/* ── Moderator: read-only notice ── */}
                        {isMod && (
                          <View style={{ marginTop: 12, padding: 10, backgroundColor: "#F0A50010", borderRadius: 8, borderWidth: 1, borderColor: "#F0A50030" }}>
                            <Text style={{ color: "#F0A500", fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: "center" }}>
                              المراجعة والموافقة والإيقاف من صلاحية الإدارة
                            </Text>
                          </View>
                        )}

                        <TouchableOpacity style={[s.cancelBtn, { marginTop: 12 }]} onPress={() => setCommunityDetailModal(null)}>
                          <Text style={s.cancelTxt}>إغلاق</Text>
                        </TouchableOpacity>
                      </>
                    );
                  })()}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          {/* ── Suspension Reason Modal ── */}
          <Modal visible={!!suspendModal} transparent animationType="fade" onRequestClose={() => setSuspendModal(null)}>
            <Pressable style={s.overlay} onPress={() => setSuspendModal(null)}>
              <Pressable style={[s.modalCard, { maxHeight: "60%" }]} onPress={e => e.stopPropagation()}>
                <Text style={[s.modalTitle, { color: "#E67E22" }]}>إيقاف مؤقت</Text>
                <Text style={[s.fieldLabel, { marginBottom: 8, textAlign: "right" }]}>
                  {suspendModal?.name}
                </Text>
                <Text style={[s.fieldLabel, { marginBottom: 6 }]}>سبب الإيقاف (اختياري)</Text>
                <TextInput
                  style={[s.inputField, { height: 80, textAlignVertical: "top" }]}
                  placeholder="مثال: شكاوى متكررة، عدم الالتزام بالاتفاقية..."
                  placeholderTextColor={Colors.textMuted}
                  value={suspendReason}
                  onChangeText={setSuspendReason}
                  multiline
                  textAlign="right"
                />
                <View style={[s.modalBtns, { marginTop: 16 }]}>
                  <ActionButton
                    label="تأكيد الإيقاف"
                    color="#E67E22"
                    icon="pause-circle-outline"
                    onPress={() => suspendModal && updateCommunityStatus(suspendModal, "suspended", suspendReason)}
                    disabled={approvingCommunityId === suspendModal?.id}
                  />
                  <ActionButton label="إلغاء" color={Colors.textMuted} icon="close-outline" onPress={() => { setSuspendModal(null); setSuspendReason(""); }} outline />
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          {/* ── Submit Community Form Modal ── */}
          <Modal visible={showCommunityForm} transparent animationType="slide" onRequestClose={() => setShowCommunityForm(false)}>
            <Pressable style={s.overlay} onPress={() => setShowCommunityForm(false)}>
              <Pressable style={[s.modalCard, { maxHeight: "95%" }]} onPress={e => e.stopPropagation()}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={s.modalTitle}>رفع طلب مؤسسة</Text>
                    <Text style={[s.fieldLabel, { color: Colors.textMuted, marginBottom: 14, textAlign: "center", fontSize: 11 }]}>
                      الطلب سيُرسل للإدارة للمراجعة والموافقة
                    </Text>

                    <Text style={s.fieldLabel}>اسم المؤسسة *</Text>
                    <TextInput
                      style={s.inputField}
                      placeholder="اسم المؤسسة أو الجهة"
                      placeholderTextColor={Colors.textMuted}
                      value={communityForm.name}
                      onChangeText={v => setCommunityForm(p => ({ ...p, name: v }))}
                      textAlign="right"
                    />

                    <Text style={s.fieldLabel}>التصنيف</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, flexDirection: "row-reverse" }}>
                      {[
                        { key: "institution", label: "مؤسسة" },
                        { key: "health",      label: "صحية" },
                        { key: "education",   label: "تعليمية" },
                        { key: "ngo",         label: "منظمة" },
                        { key: "business",    label: "تجارية" },
                        { key: "wafid",       label: "وافدون" },
                        { key: "other",       label: "أخرى" },
                      ].map(cat => (
                        <TouchableOpacity
                          key={cat.key}
                          style={[s.filterChip, communityForm.category === cat.key && { backgroundColor: Colors.primary + "20", borderColor: Colors.primary }]}
                          onPress={() => setCommunityForm(p => ({ ...p, category: cat.key }))}
                        >
                          <Text style={[s.filterChipTxt, communityForm.category === cat.key && { color: Colors.primary, fontFamily: "Cairo_700Bold" }]}>{cat.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* ── بيانات ممثل الجهة ── */}
                    <View style={{ backgroundColor: Colors.primary + "10", borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.primary + "25" }}>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <Ionicons name="person-circle-outline" size={18} color={Colors.primary} />
                        <Text style={[s.fieldLabel, { color: Colors.primary, marginBottom: 0, fontFamily: "Cairo_700Bold" }]}>بيانات ممثل الجهة</Text>
                      </View>

                      <Text style={s.fieldLabel}>الاسم الكامل للممثل *</Text>
                      <TextInput
                        style={s.inputField}
                        placeholder="الاسم الثلاثي أو الرباعي"
                        placeholderTextColor={Colors.textMuted}
                        value={communityForm.representative_name}
                        onChangeText={v => setCommunityForm(p => ({ ...p, representative_name: v }))}
                        textAlign="right"
                      />

                      <Text style={s.fieldLabel}>المنصب / الصفة الوظيفية</Text>
                      <TextInput
                        style={s.inputField}
                        placeholder="مثال: مدير عام، رئيس مجلس الإدارة"
                        placeholderTextColor={Colors.textMuted}
                        value={communityForm.representative_title}
                        onChangeText={v => setCommunityForm(p => ({ ...p, representative_title: v }))}
                        textAlign="right"
                      />

                      <Text style={s.fieldLabel}>هاتف الممثل الشخصي</Text>
                      <TextInput
                        style={s.inputField}
                        placeholder="رقم الهاتف الشخصي"
                        placeholderTextColor={Colors.textMuted}
                        value={communityForm.representative_phone}
                        onChangeText={v => setCommunityForm(p => ({ ...p, representative_phone: v }))}
                        keyboardType="phone-pad"
                        textAlign="right"
                      />

                      <Text style={s.fieldLabel}>رقم الهوية الوطنية</Text>
                      <TextInput
                        style={s.inputField}
                        placeholder="رقم البطاقة الشخصية أو جواز السفر"
                        placeholderTextColor={Colors.textMuted}
                        value={communityForm.representative_national_id}
                        onChangeText={v => setCommunityForm(p => ({ ...p, representative_national_id: v }))}
                        textAlign="right"
                      />

                      <Text style={s.fieldLabel}>البريد الإلكتروني</Text>
                      <TextInput
                        style={s.inputField}
                        placeholder="example@email.com"
                        placeholderTextColor={Colors.textMuted}
                        value={communityForm.representative_email}
                        onChangeText={v => setCommunityForm(p => ({ ...p, representative_email: v }))}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        textAlign="right"
                      />
                    </View>

                    <Text style={s.fieldLabel}>رقم تواصل المؤسسة *</Text>
                    <TextInput
                      style={s.inputField}
                      placeholder="الرقم الرسمي للجهة أو المؤسسة"
                      placeholderTextColor={Colors.textMuted}
                      value={communityForm.contact_phone}
                      onChangeText={v => setCommunityForm(p => ({ ...p, contact_phone: v }))}
                      keyboardType="phone-pad"
                      textAlign="right"
                    />

                    <Text style={s.fieldLabel}>الحي / المنطقة</Text>
                    <TextInput
                      style={s.inputField}
                      placeholder="الحي أو المنطقة التي تخدمها"
                      placeholderTextColor={Colors.textMuted}
                      value={communityForm.neighborhood}
                      onChangeText={v => setCommunityForm(p => ({ ...p, neighborhood: v }))}
                      textAlign="right"
                    />

                    <Text style={s.fieldLabel}>الأصل / المنشأ</Text>
                    <TextInput
                      style={s.inputField}
                      placeholder="مثال: حكومية، أهلية، دولية"
                      placeholderTextColor={Colors.textMuted}
                      value={communityForm.origin}
                      onChangeText={v => setCommunityForm(p => ({ ...p, origin: v }))}
                      textAlign="right"
                    />

                    <Text style={s.fieldLabel}>وصف الخدمات المقدَّمة</Text>
                    <TextInput
                      style={[s.inputField, { height: 90, textAlignVertical: "top" }]}
                      placeholder="ما هي الخدمات التي تقدمها للمواطنين؟"
                      placeholderTextColor={Colors.textMuted}
                      value={communityForm.services}
                      onChangeText={v => setCommunityForm(p => ({ ...p, services: v }))}
                      multiline
                      textAlign="right"
                    />

                    <Text style={s.fieldLabel}>ملاحظات إضافية</Text>
                    <TextInput
                      style={[s.inputField, { height: 70, textAlignVertical: "top" }]}
                      placeholder="أي معلومات إضافية ترى أهميتها"
                      placeholderTextColor={Colors.textMuted}
                      value={communityForm.description}
                      onChangeText={v => setCommunityForm(p => ({ ...p, description: v }))}
                      multiline
                      textAlign="right"
                    />

                    <View style={[s.modalBtns, { marginTop: 16 }]}>
                      <ActionButton
                        label={submittingCommunity ? "جارٍ الإرسال..." : "إرسال الطلب"}
                        color={Colors.primary}
                        icon="paper-plane-outline"
                        onPress={submitCommunity}
                        disabled={submittingCommunity}
                      />
                      <ActionButton label="إلغاء" color={Colors.textMuted} icon="close-outline" onPress={() => setShowCommunityForm(false)} outline />
                    </View>
                  </ScrollView>
                </KeyboardAvoidingView>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      )}

      {/* Neighborhoods */}
      {tab === "neighborhoods" && (
        <View style={{ flex: 1 }}>

          {/* Header */}
          <View style={s.pageHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.pageHeaderTitle}>الأحياء والقرى</Text>
              <Text style={[s.filterChipTxt, { marginTop: 2 }]}>
                {neighborhoods.length} عنصر — {neighborhoods.filter(n => n.type === "neighborhood").length} حي، {neighborhoods.filter(n => n.type === "village").length} قرية
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TouchableOpacity
                style={[s.iconBtn, { backgroundColor: "#E0556715", borderColor: "#E0556730", width: 36, height: 36 }]}
                onPress={restoreDefaultNeighborhoods}
                disabled={seedingNbr}
              >
                {seedingNbr
                  ? <ActivityIndicator size={14} color="#E05567" />
                  : <Ionicons name="refresh-outline" size={16} color="#E05567" />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.addBtn, { backgroundColor: "#3498DB" }]}
                onPress={() => { setNbrForm({ label: "", type: "neighborhood" }); setEditingNbr(null); setShowAddNbr(true); }}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={s.addBtnTxt}>إضافة</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
            <View style={[s.filterChip, { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 12, borderRadius: 12 }]}>
              <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
              <TextInput
                style={{ flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: "#fff", textAlign: "right" }}
                placeholder="ابحث عن حي أو قرية..."
                placeholderTextColor={Colors.textMuted}
                value={nbrSearch}
                onChangeText={setNbrSearch}
              />
              {nbrSearch.length > 0 && (
                <TouchableOpacity onPress={() => setNbrSearch("")}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.filterRow, { paddingTop: 8 }]} style={{ flexGrow: 0 }}>
            {(["all", "neighborhood", "village"] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterChip, nbrFilter === f && { backgroundColor: "#3498DB20", borderColor: "#3498DB" }]}
                onPress={() => setNbrFilter(f)}
              >
                <Ionicons
                  name={f === "all" ? "apps-outline" : f === "neighborhood" ? "home-outline" : "leaf-outline"}
                  size={13}
                  color={nbrFilter === f ? "#3498DB" : Colors.textMuted}
                />
                <Text style={[s.filterChipTxt, nbrFilter === f && { color: "#3498DB", fontFamily: "Cairo_700Bold" }]}>
                  {f === "all" ? `الكل (${neighborhoods.length})` : f === "neighborhood" ? `أحياء (${neighborhoods.filter(n => n.type === "neighborhood").length})` : `قرى (${neighborhoods.filter(n => n.type === "village").length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* List */}
          {loadingNbr || seedingNbr ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
              <ActivityIndicator color="#3498DB" size="large" />
              <Text style={[s.filterChipTxt, { textAlign: "center" }]}>
                {seedingNbr ? "جارٍ حفظ الأحياء في قاعدة البيانات…" : "تحميل…"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={(() => {
                let list = nbrFilter === "all" ? neighborhoods : neighborhoods.filter(n => n.type === nbrFilter);
                if (nbrSearch.trim()) list = list.filter(n => n.label.includes(nbrSearch.trim()));
                return list;
              })()}
              keyExtractor={(item, i) => item.key ?? i.toString()}
              contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 100 }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", marginTop: 40, gap: 8 }}>
                  <Ionicons name="search-outline" size={32} color={Colors.textMuted} />
                  <Text style={s.empty}>{nbrSearch ? "لا نتائج للبحث" : "لا توجد أحياء"}</Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <Animated.View entering={FadeInDown.delay(index * 20).springify()}>
                  <View style={s.nbrCard}>
                    <View style={[s.nbrIcon, { backgroundColor: item.type === "neighborhood" ? "#3498DB15" : "#9B59B615" }]}>
                      <Ionicons
                        name={item.type === "neighborhood" ? "home" : "leaf"}
                        size={18}
                        color={item.type === "neighborhood" ? "#3498DB" : "#9B59B6"}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.nbrName}>{item.label}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.type === "neighborhood" ? "#3498DB" : "#9B59B6" }} />
                        <Text style={[s.nbrType, { color: item.type === "neighborhood" ? "#3498DB" : "#9B59B6" }]}>
                          {item.type === "neighborhood" ? "حي" : "قرية"}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        style={[s.iconBtn, { backgroundColor: "#3498DB15", borderColor: "#3498DB30" }]}
                        onPress={() => { setEditingNbr(item); setNbrForm({ label: item.label, type: item.type }); setShowAddNbr(true); }}
                      >
                        <Ionicons name="pencil-outline" size={15} color="#3498DB" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.iconBtn, { backgroundColor: "#E0556715", borderColor: "#E0556730" }]}
                        onPress={() => {
                          Alert.alert(
                            "حذف",
                            `هل تريد حذف "${item.label}"؟`,
                            [
                              { text: "إلغاء", style: "cancel" },
                              { text: "حذف", style: "destructive", onPress: () => deleteNeighborhood(item) },
                            ]
                          );
                        }}
                      >
                        <Ionicons name="trash-outline" size={15} color="#E05567" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Animated.View>
              )}
            />
          )}

          {/* Add/Edit Modal */}
          <Modal visible={showAddNbr} transparent animationType="slide" onRequestClose={() => setShowAddNbr(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
              <Pressable style={s.overlay} onPress={() => setShowAddNbr(false)}>
                <Pressable style={s.modalCard} onPress={e => e.stopPropagation()}>

                  {/* Modal header */}
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", marginBottom: 16 }}>
                    <View style={[s.nbrIcon, { backgroundColor: "#3498DB20", marginLeft: 10 }]}>
                      <Ionicons name={editingNbr ? "pencil" : "add-circle"} size={18} color="#3498DB" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.modalTitle}>{editingNbr ? "تعديل الحي / القرية" : "إضافة حي أو قرية"}</Text>
                      {editingNbr && <Text style={[s.filterChipTxt, { marginTop: 2 }]}>{editingNbr.label}</Text>}
                    </View>
                  </View>

                  {/* Name */}
                  <Text style={s.fieldLabel}>الاسم *</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={nbrForm.label}
                    onChangeText={t => setNbrForm(p => ({ ...p, label: t }))}
                    placeholder="مثال: حي الأمل"
                    placeholderTextColor={Colors.textMuted}
                    textAlign="right"
                    autoFocus
                  />

                  {/* Type */}
                  <Text style={s.fieldLabel}>النوع</Text>
                  <View style={{ flexDirection: "row-reverse", gap: 10, marginVertical: 8 }}>
                    {(["neighborhood", "village"] as const).map(t => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setNbrForm(p => ({ ...p, type: t }))}
                        style={[
                          s.filterChip,
                          { flex: 1, justifyContent: "center", gap: 6 },
                          nbrForm.type === t && { backgroundColor: "#3498DB20", borderColor: "#3498DB" },
                        ]}
                      >
                        <Ionicons
                          name={t === "neighborhood" ? "home-outline" : "leaf-outline"}
                          size={15}
                          color={nbrForm.type === t ? "#3498DB" : Colors.textMuted}
                        />
                        <Text style={[s.filterChipTxt, nbrForm.type === t && { color: "#3498DB" }]}>
                          {t === "neighborhood" ? "حي" : "قرية"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Actions */}
                  <View style={[s.modalBtns, { marginTop: 8 }]}>
                    <ActionButton
                      label={editingNbr ? "حفظ التعديل" : "إضافة"}
                      color="#3498DB"
                      icon={editingNbr ? "save-outline" : "add-circle-outline"}
                      onPress={saveNeighborhood}
                      disabled={addingNbr || !nbrForm.label.trim()}
                    />
                    <ActionButton label="إلغاء" color={Colors.textMuted} onPress={() => { setShowAddNbr(false); setEditingNbr(null); }} outline />
                  </View>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      )}

      {/* AI Settings */}
      {tab === "ai_settings" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <View style={[s.cardIcon, { backgroundColor: Colors.cyber + "20" }]}>
                <Ionicons name="sparkles" size={20} color={Colors.cyber} />
              </View>
              <Text style={s.cardTitle}>إعدادات مساعد Gemini</Text>
            </View>

            {loadingAi ? <ActivityIndicator color={Colors.cyber} style={{ marginVertical: 20 }} /> : (
              <>
                {/* Enable toggle */}
                <View style={s.toggleRow}>
                  <Text style={s.toggleLabel}>تفعيل المساعد الذكي</Text>
                  <TouchableOpacity
                    onPress={() => setAiForm(p => ({ ...p, ai_enabled: p.ai_enabled === "true" ? "false" : "true" }))}
                    style={[s.toggle, { backgroundColor: aiForm.ai_enabled === "true" ? Colors.primary : Colors.divider }]}
                    activeOpacity={0.8}
                  >
                    <View style={[s.toggleThumb, { alignSelf: aiForm.ai_enabled === "true" ? "flex-end" : "flex-start" }]} />
                  </TouchableOpacity>
                </View>

                {/* API Key */}
                <Text style={s.fieldLabel}>مفتاح Gemini API</Text>
                <View style={s.inputWithIcon}>
                  <TextInput
                    style={[s.fieldInput, { flex: 1, marginBottom: 0 }]}
                    value={aiForm.ai_api_key}
                    onChangeText={t => setAiForm(p => ({ ...p, ai_api_key: t }))}
                    placeholder="AIza..."
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showApiKey}
                    textAlign="right"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowApiKey(p => !p)} style={{ padding: 10 }}>
                    <Ionicons name={showApiKey ? "eye-off-outline" : "eye-outline"} size={19} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <Text style={s.fieldHint}>احصل على المفتاح مجاناً: aistudio.google.com → Get API Key</Text>

                {/* System Prompt */}
                <Text style={[s.fieldLabel, { marginTop: 10 }]}>رسالة النظام (System Prompt)</Text>
                <TextInput
                  style={[s.fieldInput, { height: 110, textAlignVertical: "top", paddingTop: 10 }]}
                  value={aiForm.ai_system_prompt}
                  onChangeText={t => setAiForm(p => ({ ...p, ai_system_prompt: t }))}
                  placeholder="أنت مساعد ذكي لخدمة أهالي مدينة الحصاحيصا..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={4}
                  textAlign="right"
                />

                <ActionButton label="حفظ الإعدادات" color={Colors.primary} icon="save-outline" onPress={saveAiSettings} disabled={savingAi} />
              </>
            )}
          </View>
        </ScrollView>
      )}

      {/* Security */}
      {tab === "security" && isAdmin && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* PIN Card */}
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <View style={[s.cardIcon, { backgroundColor: "#E0556720" }]}>
                <Ionicons name="lock-closed" size={20} color="#E05567" />
              </View>
              <Text style={s.cardTitle}>رمز تسجيل المديرين</Text>
            </View>
            <Text style={s.fieldHint}>يُستخدم هذا الرمز عند تسجيل مدير جديد. الرمز الافتراضي: 4444</Text>

            {loadingSecurity ? <ActivityIndicator color="#E05567" style={{ marginVertical: 20 }} /> : (
              <>
                <Text style={s.fieldLabel}>الرمز الحالي</Text>
                <TextInput style={s.fieldInput} value={pinForm.current} onChangeText={v => setPinForm(p => ({ ...p, current: v }))} placeholder="••••" placeholderTextColor={Colors.textMuted} secureTextEntry keyboardType="number-pad" textAlign="right" maxLength={10} />
                <Text style={s.fieldLabel}>الرمز الجديد</Text>
                <TextInput style={s.fieldInput} value={pinForm.newPin} onChangeText={v => setPinForm(p => ({ ...p, newPin: v }))} placeholder="أدخل رمزاً جديداً (4 أرقام على الأقل)" placeholderTextColor={Colors.textMuted} secureTextEntry keyboardType="number-pad" textAlign="right" maxLength={10} />
                <Text style={s.fieldLabel}>تأكيد الرمز الجديد</Text>
                <TextInput style={s.fieldInput} value={pinForm.confirm} onChangeText={v => setPinForm(p => ({ ...p, confirm: v }))} placeholder="أعد إدخال الرمز" placeholderTextColor={Colors.textMuted} secureTextEntry keyboardType="number-pad" textAlign="right" maxLength={10} />
                <ActionButton label={savingPin ? "جاري الحفظ..." : "تغيير الرمز"} color="#E05567" icon="lock-closed-outline" onPress={changePin} disabled={savingPin} />
              </>
            )}
          </View>

          {/* Admin Name Card */}
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <View style={[s.cardIcon, { backgroundColor: Colors.primary + "20" }]}>
                <Ionicons name="person-circle" size={20} color={Colors.primary} />
              </View>
              <Text style={s.cardTitle}>اسم المدير في التطبيق</Text>
            </View>
            <Text style={s.fieldHint}>الاسم الذي يظهر في التطبيق كممثل للإدارة</Text>
            <Text style={s.fieldLabel}>الاسم المعروض</Text>
            <TextInput
              style={s.fieldInput}
              value={adminNameForm.name}
              onChangeText={v => setAdminNameForm({ name: v })}
              placeholder="مثال: إدارة حصاحيصاوي"
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
            />
            <ActionButton label={savingName ? "جاري الحفظ..." : "حفظ الاسم"} color={Colors.primary} icon="save-outline" onPress={saveAdminName} disabled={savingName} />
          </View>
        </ScrollView>
      )}

      {/* ══ التحديثات ══ */}
      {tab === "updates" && isAdmin && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* تحذير إذا لم يكن هناك توكن للخادم */}
          {!token && (
            <View style={{ backgroundColor: "#FFF3CD", borderRadius: 12, padding: 14, marginBottom: 14, flexDirection: "row-reverse", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#F0A500" }}>
              <Ionicons name="warning-outline" size={20} color="#F0A500" />
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: "#856404", flex: 1, textAlign: "right" }}>
                {"جلسة الخادم غير نشطة — أغلق التطبيق وسجّل الدخول مجدداً لتفعيل نشر التحديثات"}
              </Text>
            </View>
          )}
          {loadingUpdates ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
          ) : (
            <>
              {/* بطاقة الإصدار الحالي */}
              <Animated.View entering={FadeInDown.duration(300)} style={s.card}>
                <View style={s.cardHeaderRow}>
                  <View style={[s.cardIcon, { backgroundColor: Colors.primary + "20" }]}>
                    <Ionicons name="cloud-upload-outline" size={20} color={Colors.primary} />
                  </View>
                  <Text style={s.cardTitle}>إدارة إصدار التطبيق</Text>
                </View>

                {/* رقم الإصدار */}
                <Text style={[s.fieldLabel, { marginTop: 14 }]}>رقم الإصدار الجديد</Text>
                <View style={{ flexDirection: "row-reverse", gap: 10, alignItems: "center" }}>
                  <TouchableOpacity
                    onPress={() => setAppVersion(v => String(Math.max(1, Number(v) - 1)))}
                    style={{ padding: 10, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider }}
                  >
                    <Ionicons name="remove" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingVertical: 12, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.primary }}>{appVersion}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setAppVersion(v => String(Number(v) + 1))}
                    style={{ padding: 10, backgroundColor: Colors.primary + "15", borderRadius: 10, borderWidth: 1, borderColor: Colors.primary }}
                  >
                    <Ionicons name="add" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* ملاحظات التحديث */}
                <Text style={[s.fieldLabel, { marginTop: 14 }]}>ملاحظات التحديث (كل سطر نقطة)</Text>
                <TextInput
                  style={{
                    backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1,
                    borderColor: Colors.divider, padding: 12, height: 100,
                    textAlignVertical: "top", color: Colors.text,
                    fontFamily: "Cairo_400Regular", fontSize: 13,
                  }}
                  value={updateNotes}
                  onChangeText={setUpdateNotes}
                  multiline
                  placeholder={"- ميزة جديدة\n- إصلاح مشكلة\n- تحسينات في الأداء"}
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right"
                />

                {/* تحديث إجباري */}
                <TouchableOpacity
                  onPress={() => setUpdateForce(f => !f)}
                  style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 14, padding: 14, backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: updateForce ? Colors.danger : Colors.divider }}
                  activeOpacity={0.8}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
                    borderColor: updateForce ? Colors.danger : Colors.divider,
                    backgroundColor: updateForce ? Colors.danger : "transparent",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {updateForce && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: updateForce ? Colors.danger : Colors.text, textAlign: "right" }}>
                      تحديث إجباري
                    </Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>
                      المستخدم لا يستطيع تجاهل الإشعار
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* زر الحفظ */}
                <TouchableOpacity
                  style={{ marginTop: 18, borderRadius: 14, overflow: "hidden", opacity: savingUpdates ? 0.7 : 1 }}
                  disabled={savingUpdates}
                  onPress={async () => {
                    if (!token) {
                      Alert.alert("خطأ", "لم يتم تسجيل الدخول بعد — أغلق التطبيق وأعد فتحه، ثم سجّل الدخول مجدداً");
                      return;
                    }
                    setSavingUpdates(true);
                    try {
                      const res = await apiFetch("/api/admin/app/version", token, {
                        method: "PATCH",
                        body: JSON.stringify({ version: Number(appVersion), notes: updateNotes, force: updateForce }),
                      });
                      if (res.ok) {
                        Alert.alert("تم", `تم نشر الإصدار ${appVersion} بنجاح — سيرى المستخدمون الإشعار تلقائياً`);
                      } else {
                        const errText = await res.text().catch(() => "");
                        Alert.alert("خطأ", `تعذّر حفظ الإصدار (${res.status})${errText ? `: ${errText}` : ""}`);
                      }
                    } catch (e: any) {
                      Alert.alert("خطأ", `تعذّر الاتصال: ${e?.message ?? "خطأ غير معروف"}`);
                    } finally {
                      setSavingUpdates(false);
                    }
                  }}
                >
                  <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {savingUpdates
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <>
                          <Ionicons name="cloud-upload" size={18} color="#fff" />
                          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" }}>نشر التحديث</Text>
                        </>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              {/* ملاحظة توضيحية */}
              <Animated.View entering={FadeInDown.duration(400).delay(100)} style={[s.card, { backgroundColor: Colors.primary + "08" }]}>
                <View style={{ flexDirection: "row-reverse", gap: 10, alignItems: "flex-start" }}>
                  <Ionicons name="information-circle-outline" size={22} color={Colors.primary} style={{ marginTop: 2 }} />
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 22 }}>
                    عند رفع رقم الإصدار، سيظهر للمستخدمين تلقائياً إشعار بالتحديث عند فتح التطبيق أو العودة إليه. رقم الإصدار الحالي في التطبيق هو {1}.
                  </Text>
                </View>
              </Animated.View>
            </>
          )}
        </ScrollView>
      )}

      {/* ══ إدارة المكتبات الطلابية ══ */}
      {tab === "libraries" && isAdmin && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {loadingAdminLibs ? (
            <ActivityIndicator color="#0EA5E9" style={{ marginTop: 60 }} />
          ) : adminLibraries.length === 0 ? (
            <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems: "center", paddingVertical: 60 }}>
              <Ionicons name="library-outline" size={56} color={Colors.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textMuted, textAlign: "center" }}>
                لا توجد مكتبات مسجّلة بعد
              </Text>
            </Animated.View>
          ) : (
            adminLibraries.map((lib, i) => (
              <Animated.View key={lib.id} entering={FadeInDown.delay(i * 60).springify()} style={[s.card, { marginBottom: 12 }]}>
                <View style={[s.cardHeaderRow, { marginBottom: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitle, { fontSize: 15 }]}>{lib.library_name}</Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>
                      {lib.manager_name} · {lib.phone}
                    </Text>
                  </View>
                  {lib.is_verified && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "#0EA5E920" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#0EA5E9" }}>موثّقة</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => toggleLibraryVerified(lib.id, lib.is_verified)}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center",
                      backgroundColor: lib.is_verified ? Colors.bg : "#0EA5E915",
                      borderWidth: 1, borderColor: lib.is_verified ? Colors.divider : "#0EA5E940" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: lib.is_verified ? Colors.textMuted : "#0EA5E9" }}>
                      {lib.is_verified ? "إلغاء التوثيق" : "توثيق"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => Alert.alert("حذف المكتبة", `هل تريد حذف "${lib.library_name}"؟`, [
                      { text: "إلغاء", style: "cancel" },
                      { text: "حذف", style: "destructive", onPress: () => deleteAdminLibrary(lib.id) }
                    ])}
                    disabled={deletingLibId === lib.id}
                    style={{ paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10, alignItems: "center",
                      backgroundColor: Colors.danger + "15", borderWidth: 1, borderColor: Colors.danger + "40" }}>
                    {deletingLibId === lib.id
                      ? <ActivityIndicator size="small" color={Colors.danger} />
                      : <Ionicons name="trash-outline" size={18} color={Colors.danger} />}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ))
          )}
        </ScrollView>
      )}

      {/* ══ إدارة مساحة التجار ══ */}
      {tab === "merchants_admin" && isAdmin && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {!loadingAdminMerchants && adminMerchants.length > 0 && (
            <View style={{ flexDirection: "row-reverse", gap: 10, marginBottom: 16 }}>
              {[
                { label: "الكل",            val: adminMerchants.length,                                       color: "#6366F1" },
                { label: "بانتظار الموافقة", val: adminMerchants.filter(m => m.status === "pending").length,  color: "#F59E0B" },
                { label: "معتمدة",          val: adminMerchants.filter(m => m.status === "approved").length, color: "#10B981" },
              ].map(stat => (
                <View key={stat.label} style={{ flex: 1, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.divider }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 22, color: stat.color }}>{stat.val}</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" }}>{stat.label}</Text>
                </View>
              ))}
            </View>
          )}
          {loadingAdminMerchants ? (
            <ActivityIndicator color="#6366F1" style={{ marginTop: 60 }} />
          ) : adminMerchants.length === 0 ? (
            <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems: "center", paddingVertical: 60 }}>
              <MaterialCommunityIcons name="store-outline" size={56} color={Colors.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textMuted, textAlign: "center" }}>
                لا يوجد تجار مسجّلون بعد
              </Text>
            </Animated.View>
          ) : (
            [...adminMerchants].sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1)).map((m, i) => (
              <Animated.View key={m.id} entering={FadeInDown.delay(i * 60).springify()} style={[s.card, { marginBottom: 12, borderLeftWidth: 3, borderLeftColor: m.status === "approved" ? "#10B981" : m.status === "rejected" ? Colors.danger : "#F59E0B" }]}>
                <View style={[s.cardHeaderRow, { marginBottom: 10 }]}>
                  <Text style={{ fontSize: 28, marginLeft: 10 }}>{m.logo_emoji || "🏪"}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                      <Text style={[s.cardTitle, { fontSize: 15 }]}>{m.shop_name}</Text>
                      {m.is_verified && <MaterialCommunityIcons name="check-decagram" size={15} color="#6366F1" />}
                      {m.is_featured && <MaterialCommunityIcons name="star-circle" size={15} color="#F0A500" />}
                    </View>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>
                      {m.owner_name} · {m.phone || m.whatsapp}
                    </Text>
                    {m.address ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" }}>{m.address}</Text> : null}
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: m.status === "approved" ? "#10B98120" : m.status === "rejected" ? Colors.danger + "20" : "#F59E0B20" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: m.status === "approved" ? "#10B981" : m.status === "rejected" ? Colors.danger : "#F59E0B" }}>
                      {m.status === "approved" ? "معتمد" : m.status === "rejected" ? "مرفوض" : "بانتظار الموافقة"}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 8 }}>
                  {m.status !== "approved" && (
                    <TouchableOpacity onPress={() => approveMerchant(m.id)}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: "#10B98115", borderWidth: 1, borderColor: "#10B98140" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#10B981" }}>قبول الطلب</Text>
                    </TouchableOpacity>
                  )}
                  {m.status !== "rejected" && (
                    <TouchableOpacity onPress={() => rejectMerchant(m.id)}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: Colors.danger + "15", borderWidth: 1, borderColor: Colors.danger + "40" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.danger }}>رفض</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => toggleMerchantVerified(m.id, m.is_verified)}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center",
                      backgroundColor: m.is_verified ? Colors.bg : "#6366F115",
                      borderWidth: 1, borderColor: m.is_verified ? Colors.divider : "#6366F140" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: m.is_verified ? Colors.textMuted : "#6366F1" }}>
                      {m.is_verified ? "إلغاء التوثيق" : "توثيق"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => toggleMerchantFeatured(m.id, m.is_featured)}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center",
                      backgroundColor: m.is_featured ? "#F0A50015" : Colors.bg,
                      borderWidth: 1, borderColor: m.is_featured ? "#F0A50040" : Colors.divider }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: m.is_featured ? "#F0A500" : Colors.textMuted }}>
                      {m.is_featured ? "إزالة التمييز" : "تمييز"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => Alert.alert("حذف المحل", `هل تريد حذف "${m.shop_name}"؟`, [
                      { text: "إلغاء", style: "cancel" },
                      { text: "حذف", style: "destructive", onPress: () => deleteAdminMerchant(m.id) }
                    ])}
                    disabled={deletingMerchantId === m.id}
                    style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, alignItems: "center",
                      backgroundColor: Colors.danger + "15", borderWidth: 1, borderColor: Colors.danger + "40" }}>
                    {deletingMerchantId === m.id
                      ? <ActivityIndicator size="small" color={Colors.danger} />
                      : <Ionicons name="trash-outline" size={18} color={Colors.danger} />}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ))
          )}

          <Text style={[s.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>طلبات الشراء من السوق</Text>
          {loadingMarketOrders ? (
            <ActivityIndicator color="#14B8A6" style={{ marginTop: 20 }} />
          ) : marketOrders.length === 0 ? (
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 24 }}>
              لا توجد طلبات شراء حتى الآن
            </Text>
          ) : (
            marketOrders.map((o, i) => (
              <Animated.View key={o.id} entering={FadeInDown.delay(i * 50).springify()} style={[s.card, { marginBottom: 12, borderLeftWidth: 3, borderLeftColor: o.status === "delivered" ? "#10B981" : o.status === "cancelled" ? Colors.danger : o.status === "confirmed" ? "#6366F1" : "#F59E0B" }]}>
                <View style={[s.cardHeaderRow, { marginBottom: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitle, { fontSize: 14 }]}>{o.order_number}{o.shop_name ? ` · ${o.shop_name}` : ""}</Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>
                      {o.customer_name} · {o.customer_phone}
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: o.status === "delivered" ? "#10B98120" : o.status === "cancelled" ? Colors.danger + "20" : o.status === "confirmed" ? "#6366F120" : "#F59E0B20" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: o.status === "delivered" ? "#10B981" : o.status === "cancelled" ? Colors.danger : o.status === "confirmed" ? "#6366F1" : "#F59E0B" }}>
                      {o.status === "delivered" ? "تم التسليم" : o.status === "cancelled" ? "ملغي" : o.status === "confirmed" ? "مؤكد" : "بانتظار التأكيد"}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary, textAlign: "right", marginBottom: 8 }}>
                  الإجمالي: {Math.round(Number(o.total || 0)).toLocaleString("ar-SA")} ج.س
                </Text>
                {o.notes ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 8 }}>{o.notes}</Text> : null}
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  {o.status === "pending" && (
                    <TouchableOpacity onPress={() => updateOrderStatus(o.id, "confirmed")}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: "#6366F115", borderWidth: 1, borderColor: "#6366F140" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#6366F1" }}>تأكيد الطلب</Text>
                    </TouchableOpacity>
                  )}
                  {(o.status === "pending" || o.status === "confirmed") && (
                    <TouchableOpacity onPress={() => updateOrderStatus(o.id, "delivered")}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: "#10B98115", borderWidth: 1, borderColor: "#10B98140" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#10B981" }}>تم التسليم</Text>
                    </TouchableOpacity>
                  )}
                  {o.status !== "cancelled" && o.status !== "delivered" && (
                    <TouchableOpacity onPress={() => updateOrderStatus(o.id, "cancelled")}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: Colors.danger + "15", borderWidth: 1, borderColor: Colors.danger + "40" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.danger }}>إلغاء</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>
            ))
          )}
        </ScrollView>
      )}

      {/* ══ إدارة محلات الهواتف ══ */}
      {tab === "phone_shops" && isAdmin && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Summary bar */}
          <View style={{ flexDirection:"row-reverse", gap:10, marginBottom:16 }}>
            {[
              { label:"الكل",      val: adminPhoneShops.length,                             color:"#7C3AED" },
              { label:"بانتظار الموافقة", val: adminPhoneShops.filter(s=>!s.is_approved).length, color:"#F59E0B" },
              { label:"مفعّلة",    val: adminPhoneShops.filter(s=>s.is_approved).length,    color:"#10B981" },
            ].map(stat=>(
              <View key={stat.label} style={{ flex:1, backgroundColor:Colors.cardBg, borderRadius:14, padding:12, alignItems:"center", borderWidth:1, borderColor:Colors.divider }}>
                <Text style={{ fontFamily:"Cairo_700Bold", fontSize:22, color:stat.color }}>{stat.val}</Text>
                <Text style={{ fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textMuted, textAlign:"center" }}>{stat.label}</Text>
              </View>
            ))}
          </View>
          {loadingPhoneShops ? (
            <ActivityIndicator color="#7C3AED" style={{ marginTop: 40 }} />
          ) : adminPhoneShops.length === 0 ? (
            <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems:"center", paddingVertical:60 }}>
              <MaterialCommunityIcons name="cellphone-off" size={56} color={Colors.textMuted} style={{ opacity:0.3, marginBottom:12 }} />
              <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:15, color:Colors.textMuted, textAlign:"center" }}>لا توجد متاجر هواتف مسجّلة</Text>
            </Animated.View>
          ) : (
            adminPhoneShops.map((shop, i) => (
              <Animated.View key={shop.id} entering={FadeInDown.delay(i*60).springify()} style={[s.card, { marginBottom:12, borderLeftWidth:3, borderLeftColor: shop.is_approved?"#10B981":"#F59E0B" }]}>
                {/* Header */}
                <View style={{ flexDirection:"row-reverse", alignItems:"center", gap:12, marginBottom:12 }}>
                  <View style={{ width:52,height:52,borderRadius:16,backgroundColor:"#7C3AED15",alignItems:"center",justifyContent:"center" }}>
                    <Text style={{ fontSize:26 }}>{shop.logo_emoji}</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <View style={{ flexDirection:"row-reverse", alignItems:"center", gap:6 }}>
                      <Text style={[s.cardTitle, { fontSize:15 }]}>{shop.shop_name}</Text>
                      {shop.is_verified && <MaterialCommunityIcons name="check-decagram" size={15} color="#7C3AED" />}
                      {shop.is_featured && <MaterialCommunityIcons name="star-circle" size={15} color="#F0A500" />}
                    </View>
                    <Text style={{ fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textMuted, textAlign:"right", marginTop:2 }}>
                      {shop.owner_name} · {shop.phone ?? shop.whatsapp ?? "—"}
                    </Text>
                    {shop.address && <Text style={{ fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textMuted, textAlign:"right" }}>{shop.address}</Text>}
                  </View>
                  <View style={{ paddingHorizontal:8, paddingVertical:4, borderRadius:8, backgroundColor: shop.is_approved?"#10B98120":"#F59E0B20" }}>
                    <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:10, color: shop.is_approved?"#10B981":"#F59E0B" }}>
                      {shop.is_approved?"مفعّل":"بانتظار الموافقة"}
                    </Text>
                  </View>
                </View>
                {/* Specialties */}
                {shop.specialties?.length > 0 && (
                  <View style={{ flexDirection:"row-reverse", flexWrap:"wrap", gap:6, marginBottom:12 }}>
                    {shop.specialties.slice(0,5).map((sp: string)=>(
                      <View key={sp} style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:8, backgroundColor:"#7C3AED12" }}>
                        <Text style={{ fontFamily:"Cairo_500Medium", fontSize:10, color:"#7C3AED" }}>{sp}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {/* Stats */}
                <View style={{ flexDirection:"row-reverse", gap:8, marginBottom:12 }}>
                  <View style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:10, backgroundColor:Colors.bg, borderWidth:1, borderColor:Colors.divider }}>
                    <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:12, color:Colors.textSecondary }}>
                      {shop.total_products ?? 0} منتج
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:10, backgroundColor:Colors.bg, borderWidth:1, borderColor:Colors.divider }}>
                    <Text style={{ fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textMuted }}>
                      {new Date(shop.created_at).toLocaleDateString("ar")}
                    </Text>
                  </View>
                </View>
                {/* Actions */}
                <View style={{ flexDirection:"row-reverse", gap:6, flexWrap:"wrap" }}>
                  <TouchableOpacity onPress={()=>approvePhoneShop(shop.id, shop.is_approved)}
                    style={{ flex:1, paddingVertical:9, borderRadius:10, alignItems:"center", minWidth:80,
                      backgroundColor: shop.is_approved?Colors.bg:"#10B98115", borderWidth:1,
                      borderColor: shop.is_approved?Colors.divider:"#10B98140" }}>
                    <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:11, color: shop.is_approved?Colors.textMuted:"#10B981" }}>
                      {shop.is_approved?"إلغاء التفعيل":"تفعيل المتجر"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={()=>verifyPhoneShop(shop.id, shop.is_verified)}
                    style={{ flex:1, paddingVertical:9, borderRadius:10, alignItems:"center", minWidth:80,
                      backgroundColor: shop.is_verified?Colors.bg:"#7C3AED15", borderWidth:1,
                      borderColor: shop.is_verified?Colors.divider:"#7C3AED40" }}>
                    <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:11, color: shop.is_verified?Colors.textMuted:"#7C3AED" }}>
                      {shop.is_verified?"إلغاء التوثيق":"توثيق"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={()=>featurePhoneShop(shop.id, shop.is_featured)}
                    style={{ paddingVertical:9, paddingHorizontal:12, borderRadius:10, alignItems:"center",
                      backgroundColor: shop.is_featured?"#F0A50015":Colors.bg, borderWidth:1,
                      borderColor: shop.is_featured?"#F0A50040":Colors.divider }}>
                    <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:11, color: shop.is_featured?"#F0A500":Colors.textMuted }}>
                      {shop.is_featured?"✦ مميّز":"تمييز"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={()=>Alert.alert("حذف المتجر",`حذف "${shop.shop_name}"؟`,[
                    { text:"إلغاء", style:"cancel" },
                    { text:"حذف", style:"destructive", onPress:()=>deletePhoneShop(shop.id) }
                  ])} disabled={deletingPhoneShopId===shop.id}
                    style={{ paddingVertical:9, paddingHorizontal:12, borderRadius:10, alignItems:"center",
                      backgroundColor:Colors.danger+"15", borderWidth:1, borderColor:Colors.danger+"40" }}>
                    {deletingPhoneShopId===shop.id
                      ? <ActivityIndicator size="small" color={Colors.danger} />
                      : <Ionicons name="trash-outline" size={17} color={Colors.danger} />}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ))
          )}
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════════════════════
          ── اقتراحات الاستمارات القانونية
      ═══════════════════════════════════════════════════════ */}
      {tab === "legal_suggestions" && isAdmin && (
        <AdminLegalSuggestionsTab token={token!} apiBase={getApiUrl()} />
      )}

      {/* ═══════════════════════════════════════════════════════
          ── الإجازات المرضية
      ═══════════════════════════════════════════════════════ */}
      {tab === "sick_leaves" && isAdmin && (
        <AdminSickLeavesTab token={token!} apiBase={getApiUrl()} />
      )}

      {/* ═══════════════════════════════════════════════════════
          ── التنويم
      ═══════════════════════════════════════════════════════ */}
      {tab === "admissions" && isAdmin && (
        <AdminAdmissionsTab token={token!} apiBase={getApiUrl()} />
      )}

      {/* ═══════════════════════════════════════════════════════
          ── زواجل
      ═══════════════════════════════════════════════════════ */}
      {tab === "zawajil" && isAdmin && (
        <AdminZawajilTab token={token!} apiBase={getApiUrl()} />
      )}

      {/* ═══════════════════════════════════════════════════════
          ── إتحاد الطلاب
      ═══════════════════════════════════════════════════════ */}
      {tab === "student_union" && isAdmin && (
        <AdminStudentUnionTab token={token!} apiBase={getApiUrl()} />
      )}

      {/* ═══════════════════════════════════════════════════════
          ── بوابة الشركاء
      ═══════════════════════════════════════════════════════ */}
      {tab === "partners" && isAdmin && (
        <AdminPartnersTab token={token!} apiBase={getApiUrl()} />
      )}

      {/* ═══════════════════════════════════════════════════════
          ── المحامون
      ═══════════════════════════════════════════════════════ */}
      {tab === "lawyers_admin" && isAdmin && (
        <AdminLawyersTab token={token!} apiBase={getApiUrl()} />
      )}

      {/* ═══════════════════════════════════════════════════════
          ── المصممون
      ═══════════════════════════════════════════════════════ */}
      {tab === "designers_admin" && isAdmin && (
        <AdminDesignersTab token={token!} apiBase={getApiUrl()} />
      )}

      {/* ═══════════════════════════════════════════════════════
          ── طلبات الانضمام الموحدة
      ═══════════════════════════════════════════════════════ */}
      {tab === "join_requests" && isAdmin && (
        <AdminJoinRequestsTab token={token!} apiBase={getApiUrl()} />
      )}

      {/* ══ البلاغات ══ */}
      {tab === "reports_admin" && isAdmin && (
        <View style={{ flex: 1 }}>
          {/* فلتر الحالة */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8, flexDirection: "row-reverse", alignItems: "center" }}>
            {(["all","pending","inProgress","resolved"] as const).map(f => {
              const FL: Record<string,string> = { all:"الكل", pending:"معلق", inProgress:"قيد المعالجة", resolved:"محلول" };
              return (
                <TouchableOpacity key={f} onPress={() => setReportsFilter(f)}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: reportsFilter === f ? "#EF4444" : "#FFFFFF0A",
                    borderWidth: 1, borderColor: reportsFilter === f ? "#EF4444" : "#FFFFFF15" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: reportsFilter === f ? "#fff" : "#9CA3AF" }}>{FL[f]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {loadingReports ? <ActivityIndicator color="#EF4444" style={{ marginTop: 40 }} /> :
             (() => {
               const filtered = reportsFilter === "all" ? adminReports : adminReports.filter(r => r.status === reportsFilter);
               const SC: Record<string,string> = { pending:"#F59E0B", received:"#3B82F6", inProgress:"#F97316", resolved:"#10B981", dismissed:"#6B7280" };
               const SL: Record<string,string> = { pending:"معلق", received:"استُلم", inProgress:"قيد المعالجة", resolved:"محلول", dismissed:"مُتجاهل" };
               return filtered.length === 0 ? (
                <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد بلاغات</Text>
               ) : filtered.map(r => {
                 const sc = SC[r.status] || "#F59E0B";
                 return (
                   <View key={r.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: sc+"30", borderRightWidth: 4, borderRightColor: sc, padding: 14, marginBottom: 12 }}>
                     <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                       <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }} numberOfLines={1}>{r.issue || r.agency_name}</Text>
                       {r.urgent && <View style={{ backgroundColor: "#EF444420", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 6 }}><Text style={{ fontFamily: "Cairo_700Bold", fontSize: 10, color: "#EF4444" }}>🚨 عاجل</Text></View>}
                       <View style={{ backgroundColor: sc+"20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                         <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: sc }}>{SL[r.status]||r.status}</Text>
                       </View>
                     </View>
                     {r.reporter_name && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>👤 {r.reporter_name} {r.phone ? `· ${r.phone}` : ""}</Text>}
                     {r.location && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>📍 {r.location}</Text>}
                     {r.description && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 18, marginBottom: 6 }} numberOfLines={2}>{r.description}</Text>}
                     <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textDisabled, textAlign: "right", marginBottom: 10 }}>{new Date(r.created_at).toLocaleDateString("ar-EG")}</Text>
                     <View style={{ flexDirection: "row-reverse", gap: 6, flexWrap: "wrap" }}>
                       {(["received","inProgress","resolved","dismissed"] as const).map(ns => ns !== r.status && (
                         <TouchableOpacity key={ns} disabled={reportsActing === r.id}
                           onPress={async () => {
                             setReportsActing(r.id);
                             try {
                               const res = await apiFetch(`/api/admin/reports/${r.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status: ns }) });
                               if (res.ok) setAdminReports(prev => prev.map(x => x.id === r.id ? { ...x, status: ns } : x));
                               else { const d = await safeJson(res); Alert.alert("خطأ", d.error); }
                             } catch { Alert.alert("خطأ", "تعذّر الاتصال"); } finally { setReportsActing(null); }
                           }}
                           style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: (SC[ns]||"#888")+"18", borderWidth: 1, borderColor: (SC[ns]||"#888")+"40" }}>
                           <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: SC[ns]||"#888" }}>{SL[ns]||ns}</Text>
                         </TouchableOpacity>
                       ))}
                       <TouchableOpacity disabled={reportsActing === r.id}
                         onPress={() => Alert.alert("حذف البلاغ", "هل تريد حذف هذا البلاغ؟", [
                           { text: "إلغاء", style: "cancel" },
                           { text: "حذف", style: "destructive", onPress: async () => {
                             setReportsActing(r.id);
                             await apiFetch(`/api/admin/reports/${r.id}`, token, { method: "DELETE" }).catch(()=>{});
                             setAdminReports(prev => prev.filter(x => x.id !== r.id));
                             setReportsActing(null);
                           }},
                         ])}
                         style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444440" }}>
                         <Ionicons name="trash-outline" size={14} color="#EF4444" />
                       </TouchableOpacity>
                     </View>
                   </View>
                 );
               });
             })()}
          </ScrollView>
        </View>
      )}

      {/* ══ المفقودات ══ */}
      {tab === "missing_admin" && isAdmin && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {loadingMissing ? <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} /> :
           adminMissing.length === 0 ? (
            <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد سجلات مفقودات</Text>
           ) : adminMissing.map(item => (
            <View key={item.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1,
              borderColor: item.status === "found" ? "#10B98140" : "#F9731640", borderRightWidth: 4, borderRightColor: item.status === "found" ? "#10B981" : "#F97316",
              padding: 14, marginBottom: 12 }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }}>{item.item_name}</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: (item.status === "found" ? "#10B981" : "#F97316")+"20" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: item.status === "found" ? "#10B981" : "#F97316" }}>
                    {item.status === "found" ? "✅ وُجد" : "🔍 مفقود"}
                  </Text>
                </View>
              </View>
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>👤 {item.reporter_name || item.user_display_name || "—"}</Text>
              {item.contact_phone && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>📞 {item.contact_phone}</Text>}
              {item.last_seen && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>📍 {item.last_seen}</Text>}
              {item.description && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 18, marginBottom: 6 }} numberOfLines={2}>{item.description}</Text>}
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textDisabled, textAlign: "right", marginBottom: 10 }}>{new Date(item.created_at).toLocaleDateString("ar-EG")}</Text>
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TouchableOpacity disabled={missingActing === item.id}
                  onPress={async () => {
                    const ns = item.status === "found" ? "lost" : "found";
                    setMissingActing(item.id);
                    try {
                      const res = await apiFetch(`/api/admin/lost-items/${item.id}`, token, { method: "PATCH", body: JSON.stringify({ status: ns }) });
                      if (res.ok) setAdminMissing(prev => prev.map(x => x.id === item.id ? { ...x, status: ns } : x));
                    } catch {} finally { setMissingActing(null); }
                  }}
                  style={{ flex: 2, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1,
                    backgroundColor: item.status === "found" ? "#F9731615" : "#10B98115",
                    borderColor: item.status === "found" ? "#F9731640" : "#10B98140" }}>
                  {missingActing === item.id ? <ActivityIndicator size="small" color="#10B981" /> :
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: item.status === "found" ? "#F97316" : "#10B981" }}>
                      {item.status === "found" ? "تراجع — لا يزال مفقوداً" : "✅ تم العثور عليه"}
                    </Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity disabled={missingActing === item.id}
                  onPress={() => Alert.alert("حذف", "هل تريد حذف هذا السجل؟", [
                    { text: "إلغاء", style: "cancel" },
                    { text: "حذف", style: "destructive", onPress: async () => {
                      setMissingActing(item.id);
                      await apiFetch(`/api/admin/lost-items/${item.id}`, token, { method: "DELETE" }).catch(()=>{});
                      setAdminMissing(prev => prev.filter(x => x.id !== item.id));
                      setMissingActing(null);
                    }},
                  ])}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444440" }}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
           ))}
        </ScrollView>
      )}

      {/* ══ الأرقام الهامة ══ */}
      {tab === "numbers_admin" && isAdmin && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* فورم إضافة / تعديل */}
          <View style={{ backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: "#10B98130", padding: 16, marginBottom: 16 }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right", marginBottom: 12 }}>
              {editingNumber ? "✏️ تعديل الرقم" : "➕ إضافة رقم جديد"}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>الاسم *</Text>
                <TextInput value={numForm.name} onChangeText={v => setNumForm(f=>({...f, name:v}))} placeholder="مثال: الإطفاء" placeholderTextColor={Colors.textMuted}
                  style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right" }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>الرقم *</Text>
                <TextInput value={numForm.number} onChangeText={v => setNumForm(f=>({...f, number:v}))} placeholder="998 أو +249..." placeholderTextColor={Colors.textMuted} keyboardType="phone-pad"
                  style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right" }} />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>التصنيف</Text>
                <TextInput value={numForm.category} onChangeText={v => setNumForm(f=>({...f, category:v}))} placeholder="عام / طوارئ / صحة..." placeholderTextColor={Colors.textMuted}
                  style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right" }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>اللون</Text>
                <TextInput value={numForm.color} onChangeText={v => setNumForm(f=>({...f, color:v}))} placeholder="#F97316" placeholderTextColor={Colors.textMuted} autoCapitalize="none"
                  style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right" }} />
              </View>
            </View>
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>ملاحظة</Text>
              <TextInput value={numForm.note} onChangeText={v => setNumForm(f=>({...f, note:v}))} placeholder="وصف اختياري..." placeholderTextColor={Colors.textMuted} multiline
                style={{ backgroundColor: "#FFFFFF0A", borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right", minHeight: 50, textAlignVertical: "top" }} />
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 12 }}>
              {editingNumber && (
                <TouchableOpacity onPress={() => { setEditingNumber(null); setNumForm({ name:"", number:"", category:"عام", icon:"call", color:"#F97316", note:"", sort_order:"99" }); }}
                  style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#FFFFFF0A", borderWidth: 1, borderColor: "#FFFFFF18" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted }}>إلغاء</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity disabled={savingNumber} onPress={async () => {
                if (!numForm.name.trim() || !numForm.number.trim()) { Alert.alert("بيانات ناقصة", "الاسم والرقم مطلوبان"); return; }
                setSavingNumber(true);
                try {
                  const url = editingNumber ? `/api/admin/emergency-numbers/${editingNumber.id}` : "/api/admin/emergency-numbers";
                  const method = editingNumber ? "PATCH" : "POST";
                  const res = await apiFetch(url, token, { method, body: JSON.stringify({ name: numForm.name, number: numForm.number, category: numForm.category, color: numForm.color, icon: numForm.icon, note: numForm.note, sort_order: parseInt(numForm.sort_order)||99 }) });
                  if (res.ok) {
                    const d = await safeJson(res);
                    if (editingNumber) setAdminNumbers(prev => prev.map(n => n.id === editingNumber.id ? d : n));
                    else setAdminNumbers(prev => [d, ...prev]);
                    setEditingNumber(null);
                    setNumForm({ name:"", number:"", category:"عام", icon:"call", color:"#F97316", note:"", sort_order:"99" });
                  } else { const d = await safeJson(res); Alert.alert("خطأ", d.error || "تعذّر الحفظ"); }
                } catch { Alert.alert("خطأ", "تعذّر الاتصال"); } finally { setSavingNumber(false); }
              }}
                style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: "#10B981", alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 6, opacity: savingNumber ? 0.6 : 1 }}>
                {savingNumber ? <ActivityIndicator color="#fff" size="small" /> : (
                  <><Ionicons name={editingNumber ? "checkmark" : "add"} size={16} color="#fff" /><Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>{editingNumber ? "حفظ التعديل" : "إضافة"}</Text></>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* قائمة الأرقام */}
          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 10 }}>{adminNumbers.length} رقم مسجّل</Text>
          {loadingNumbers ? <ActivityIndicator color="#10B981" style={{ marginTop: 20 }} /> :
           adminNumbers.map(n => (
            <View key={n.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: (n.color||"#10B981")+"40", borderRightWidth: 4, borderRightColor: n.color||"#10B981", padding: 14, marginBottom: 10 }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, flex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: (n.color||"#10B981")+"20", justifyContent: "center", alignItems: "center" }}>
                    <Ionicons name={(n.icon||"call") as any} size={16} color={n.color||"#10B981"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" }}>{n.name}</Text>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: n.color||"#10B981", textAlign: "right" }}>{n.number}</Text>
                  </View>
                </View>
                {!n.is_active && <View style={{ backgroundColor: "#EF444420", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}><Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: "#EF4444" }}>معطّل</Text></View>}
              </View>
              {n.category && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>{n.category}</Text>}
              {n.note && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 8 }}>{n.note}</Text>}
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TouchableOpacity onPress={() => { setEditingNumber(n); setNumForm({ name: n.name, number: n.number, category: n.category||"عام", icon: n.icon||"call", color: n.color||"#F97316", note: n.note||"", sort_order: String(n.sort_order||99) }); }}
                  style={{ flex: 2, paddingVertical: 8, borderRadius: 9, backgroundColor: "#FFFFFF0A", borderWidth: 1, borderColor: "#FFFFFF18", alignItems: "center" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted }}>✏️ تعديل</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={numbersActing === n.id}
                  onPress={() => Alert.alert("حذف", `هل تريد حذف رقم "${n.name}"؟`, [
                    { text: "إلغاء", style: "cancel" },
                    { text: "حذف", style: "destructive", onPress: async () => {
                      setNumbersActing(n.id);
                      await apiFetch(`/api/admin/emergency-numbers/${n.id}`, token, { method: "DELETE" }).catch(()=>{});
                      setAdminNumbers(prev => prev.filter(x => x.id !== n.id));
                      setNumbersActing(null);
                    }},
                  ])}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 9, backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444440", alignItems: "center" }}>
                  {numbersActing === n.id ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="trash-outline" size={16} color="#EF4444" />}
                </TouchableOpacity>
              </View>
            </View>
           ))}
        </ScrollView>
      )}

      {/* ══ المصانع ══ */}
      {tab === "factories_admin" && isAdmin && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 12 }}>{adminFactories.length} مصنع مسجّل</Text>
          {loadingFactories ? <ActivityIndicator color="#6B7280" style={{ marginTop: 40 }} /> :
           adminFactories.length === 0 ? (
            <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد مصانع مسجّلة بعد</Text>
           ) : adminFactories.map(f => (
            <View key={f.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: (f.brand_color||"#6B7280")+"40", borderRightWidth: 4, borderRightColor: f.brand_color||"#6B7280", padding: 14, marginBottom: 12 }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }}>{f.name}</Text>
                <View style={{ flexDirection: "row-reverse", gap: 4 }}>
                  {f.is_featured && <View style={{ backgroundColor: "#F59E0B20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}><Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: "#F59E0B" }}>⭐ مميز</Text></View>}
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: f.is_active ? "#10B98120" : "#EF444420" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: f.is_active ? "#10B981" : "#EF4444" }}>{f.is_active ? "نشط" : "معطّل"}</Text>
                  </View>
                </View>
              </View>
              {f.category && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>🏷️ {f.category}</Text>}
              {f.location && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>📍 {f.location}</Text>}
              {f.phone && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>📞 {f.phone}</Text>}
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 4, marginBottom: 10 }}>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textDisabled }}>{new Date(f.created_at).toLocaleDateString("ar-EG")}</Text>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted }}>{f.package_type || "free"}</Text>
              </View>
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TouchableOpacity disabled={factoriesActing === f.id}
                  onPress={async () => {
                    setFactoriesActing(f.id);
                    try {
                      const res = await apiFetch(`/api/admin/factories/${f.id}`, token, { method: "PATCH", body: JSON.stringify({ is_active: !f.is_active }) });
                      if (res.ok) setAdminFactories(prev => prev.map(x => x.id === f.id ? { ...x, is_active: !f.is_active } : x));
                    } catch {} finally { setFactoriesActing(null); }
                  }}
                  style={{ flex: 2, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1,
                    backgroundColor: f.is_active ? "#EF444415" : "#10B98115",
                    borderColor: f.is_active ? "#EF444440" : "#10B98140" }}>
                  {factoriesActing === f.id ? <ActivityIndicator size="small" color={f.is_active ? "#EF4444" : "#10B981"} /> :
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: f.is_active ? "#EF4444" : "#10B981" }}>{f.is_active ? "تعطيل" : "تفعيل"}</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity disabled={factoriesActing === f.id}
                  onPress={async () => {
                    setFactoriesActing(f.id);
                    try {
                      const res = await apiFetch(`/api/admin/factories/${f.id}`, token, { method: "PATCH", body: JSON.stringify({ is_featured: !f.is_featured }) });
                      if (res.ok) setAdminFactories(prev => prev.map(x => x.id === f.id ? { ...x, is_featured: !f.is_featured } : x));
                    } catch {} finally { setFactoriesActing(null); }
                  }}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1,
                    backgroundColor: "#F59E0B15", borderColor: "#F59E0B40" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#F59E0B" }}>{f.is_featured ? "⭐ إلغاء" : "⭐ تمييز"}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={factoriesActing === f.id}
                  onPress={() => Alert.alert("حذف", `هل تريد حذف مصنع "${f.name}"؟`, [
                    { text: "إلغاء", style: "cancel" },
                    { text: "حذف", style: "destructive", onPress: async () => {
                      setFactoriesActing(f.id);
                      await apiFetch(`/api/admin/factories/${f.id}`, token, { method: "DELETE" }).catch(()=>{});
                      setAdminFactories(prev => prev.filter(x => x.id !== f.id));
                      setFactoriesActing(null);
                    }},
                  ])}
                  style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444440", alignItems: "center" }}>
                  <Ionicons name="trash-outline" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
           ))}
        </ScrollView>
      )}

      {/* ══ السوق الزراعي ══ */}
      {tab === "farmers_admin" && isAdmin && (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8, flexDirection: "row-reverse", alignItems: "center" }}>
            {(["crops","lands","tools","workers"] as const).map(f => {
              const FL: Record<string,string> = { crops:"🌾 محاصيل", lands:"🟫 أراضي", tools:"⚙️ معدات", workers:"👷 عمال" };
              const FC: Record<string,string> = { crops:"#16A34A", lands:"#92400E", tools:"#6B7280", workers:"#F59E0B" };
              return (
                <TouchableOpacity key={f} onPress={() => setFarmersSub(f)}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: farmersSub === f ? FC[f] : "#FFFFFF0A",
                    borderWidth: 1, borderColor: farmersSub === f ? FC[f] : "#FFFFFF15" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: farmersSub === f ? "#fff" : "#9CA3AF" }}>{FL[f]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {loadingFarmers ? <ActivityIndicator color="#16A34A" style={{ marginTop: 40 }} /> : (() => {
              const items = adminFarmers[farmersSub];
              const COLOR: Record<string,string> = { crops:"#16A34A", lands:"#92400E", tools:"#6B7280", workers:"#F59E0B" };
              return items.length === 0 ? (
                <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد سجلات في هذا القسم</Text>
              ) : items.map((item: any) => (
                <View key={item.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1,
                  borderColor: COLOR[farmersSub]+"30", borderRightWidth: 3, borderRightColor: COLOR[farmersSub],
                  padding: 12, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text, flex: 1, textAlign: "right" }}>{item.title}</Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: item.is_available ? "#10B98120" : "#EF444420" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: item.is_available ? "#10B981" : "#EF4444" }}>{item.is_available ? "متاح" : "غير متاح"}</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>👤 {item.user_display_name || "—"} {item.contact_phone ? `· ${item.contact_phone}` : ""}</Text>
                  {item.location && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>📍 {item.location}</Text>}
                  <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textDisabled }}>{new Date(item.created_at).toLocaleDateString("ar-EG")}</Text>
                    <TouchableOpacity onPress={() => Alert.alert("حذف", `هل تريد حذف "${item.title}"؟`, [
                      { text: "إلغاء", style: "cancel" },
                      { text: "حذف", style: "destructive", onPress: async () => {
                        setFarmersActing(`${farmersSub}-${item.id}`);
                        await apiFetch(`/api/admin/farmers/${farmersSub}/${item.id}`, token, { method: "DELETE" }).catch(()=>{});
                        setAdminFarmers(prev => ({ ...prev, [farmersSub]: prev[farmersSub].filter((x:any) => x.id !== item.id) }));
                        setFarmersActing(null);
                      }},
                    ])}
                      style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444440" }}>
                      {farmersActing === `${farmersSub}-${item.id}` ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="trash-outline" size={14} color="#EF4444" />}
                    </TouchableOpacity>
                  </View>
                </View>
              ));
            })()}
          </ScrollView>
        </View>
      )}

      {/* ══ الإيجارات ══ */}
      {tab === "rentals_admin" && isAdmin && (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row-reverse", gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
            {(["listings","contracts"] as const).map(v => (
              <TouchableOpacity key={v} onPress={() => setRentalView(v)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                  backgroundColor: rentalView === v ? "#0EA5E9" : "#FFFFFF0A",
                  borderWidth: 1, borderColor: rentalView === v ? "#0EA5E9" : "#FFFFFF15" }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: rentalView === v ? "#fff" : "#9CA3AF" }}>
                  {v === "listings" ? "🏠 العقارات" : "📄 العقود"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {loadingRentals ? <ActivityIndicator color="#0EA5E9" style={{ marginTop: 40 }} /> : rentalView === "listings" ? (
              adminRentals.length === 0 ? (
                <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد عقارات مسجّلة</Text>
              ) : adminRentals.map(r => (
                <View key={r.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1,
                  borderColor: r.is_verified ? "#0EA5E940" : "#FFFFFF15", borderRightWidth: 4, borderRightColor: r.is_verified ? "#0EA5E9" : "#6B7280",
                  padding: 14, marginBottom: 12 }}>
                  <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }}>{r.title}</Text>
                    <View style={{ flexDirection: "row-reverse", gap: 4 }}>
                      {r.is_verified && <View style={{ backgroundColor: "#0EA5E920", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}><Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: "#0EA5E9" }}>✅ موثّق</Text></View>}
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: r.status === "active" ? "#10B98120" : "#6B728020" }}>
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: r.status === "active" ? "#10B981" : "#9CA3AF" }}>{r.status === "active" ? "نشط" : r.status}</Text>
                      </View>
                    </View>
                  </View>
                  {r.owner_name && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>👤 {r.owner_name} {r.owner_phone ? `· ${r.owner_phone}` : ""}</Text>}
                  {r.neighborhood && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>📍 {r.neighborhood}</Text>}
                  {(r.price_per_month || r.price_per_day) && <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#0EA5E9", textAlign: "right", marginBottom: 6 }}>{r.price_per_month ? `${r.price_per_month} / شهر` : `${r.price_per_day} / يوم`}</Text>}
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textDisabled, textAlign: "right", marginBottom: 10 }}>{new Date(r.created_at).toLocaleDateString("ar-EG")}</Text>
                  <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                    <TouchableOpacity disabled={rentalsActing === r.id}
                      onPress={async () => {
                        setRentalsActing(r.id);
                        try {
                          const res = await apiFetch(`/api/admin/rentals/${r.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status: r.status === "active" ? "inactive" : "active" }) });
                          if (res.ok) setAdminRentals(prev => prev.map(x => x.id === r.id ? { ...x, status: x.status === "active" ? "inactive" : "active" } : x));
                        } catch {} finally { setRentalsActing(null); }
                      }}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1,
                        backgroundColor: r.status === "active" ? "#EF444415" : "#10B98115",
                        borderColor: r.status === "active" ? "#EF444440" : "#10B98140" }}>
                      {rentalsActing === r.id ? <ActivityIndicator size="small" color={r.status === "active" ? "#EF4444" : "#10B981"} /> :
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: r.status === "active" ? "#EF4444" : "#10B981" }}>{r.status === "active" ? "إيقاف" : "تفعيل"}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              adminContracts.length === 0 ? (
                <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد عقود</Text>
              ) : adminContracts.map(c => {
                const SC: Record<string,string> = { pending:"#F59E0B", active:"#10B981", completed:"#3B82F6", cancelled:"#EF4444", disputed:"#EF4444" };
                const SL: Record<string,string> = { pending:"معلق", active:"نشط", completed:"مكتمل", cancelled:"ملغى", disputed:"نزاع" };
                return (
                  <View key={c.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1,
                    borderColor: (SC[c.status]||"#888")+"30", borderRightWidth: 4, borderRightColor: SC[c.status]||"#888",
                    padding: 14, marginBottom: 12 }}>
                    <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }} numberOfLines={1}>{c.listing_title}</Text>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: (SC[c.status]||"#888")+"20" }}>
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: SC[c.status]||"#888" }}>{SL[c.status]||c.status}</Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>🏠 المالك: {c.owner_name} {c.owner_phone ? `· ${c.owner_phone}` : ""}</Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>👤 المستأجر: {c.renter_name} {c.renter_phone ? `· ${c.renter_phone}` : ""}</Text>
                    <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 6 }}>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textDisabled }}>{c.start_date ? new Date(c.start_date).toLocaleDateString("ar-EG") : "—"} ← {c.end_date ? new Date(c.end_date).toLocaleDateString("ar-EG") : "—"}</Text>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#0EA5E9" }}>{c.total_amount} SDG</Text>
                    </View>
                    {c.status === "disputed" && c.dispute_details && (
                      <View style={{ backgroundColor: "#EF444410", borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#EF444430" }}>
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#EF4444", textAlign: "right" }}>⚠️ تفاصيل النزاع: {c.dispute_details}</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
                      {c.status === "disputed" && (
                        <TouchableOpacity disabled={rentalsActing === c.id}
                          onPress={async () => {
                            setRentalsActing(c.id);
                            try {
                              const res = await apiFetch(`/api/admin/rentals/${c.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status: "resolved" }) });
                              if (res.ok) setAdminContracts(prev => prev.map(x => x.id === c.id ? { ...x, status: "resolved" } : x));
                            } catch {} finally { setRentalsActing(null); }
                          }}
                          style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: "#10B98115", borderWidth: 1, borderColor: "#10B98140", alignItems: "center" }}>
                          {rentalsActing === c.id ? <ActivityIndicator size="small" color="#10B981" /> :
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#10B981" }}>✅ حل النزاع</Text>
                          }
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* ══ الوظائف ══ */}
      {tab === "jobs_admin" && isAdmin && (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8, flexDirection: "row-reverse", alignItems: "center" }}>
            {(["all","active","inactive"] as const).map(f => {
              const FL: Record<string,string> = { all:"الكل", active:"نشطة", inactive:"معطّلة" };
              return (
                <TouchableOpacity key={f} onPress={() => setJobsFilter(f)}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: jobsFilter === f ? "#8B5CF6" : "#FFFFFF0A",
                    borderWidth: 1, borderColor: jobsFilter === f ? "#8B5CF6" : "#FFFFFF15" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: jobsFilter === f ? "#fff" : "#9CA3AF" }}>{FL[f]}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity onPress={loadAdminJobs} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: "#FFFFFF0A" }}>
              <Ionicons name="refresh" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>{adminJobs.length} وظيفة</Text>
          </ScrollView>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {loadingJobs ? <ActivityIndicator color="#8B5CF6" style={{ marginTop: 40 }} /> : (() => {
              const filtered = jobsFilter === "all" ? adminJobs
                : jobsFilter === "active" ? adminJobs.filter(j => j.is_active)
                : adminJobs.filter(j => !j.is_active);
              const TYPE_LABEL: Record<string,string> = { fulltime:"دوام كامل", parttime:"دوام جزئي", freelance:"عمل حر", volunteer:"تطوع" };
              return filtered.length === 0 ? (
                <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد وظائف</Text>
              ) : filtered.map(job => (
                <View key={job.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1,
                  borderColor: job.is_active ? "#8B5CF640" : "#6B728040", borderRightWidth: 4, borderRightColor: job.is_active ? "#8B5CF6" : "#6B7280",
                  padding: 14, marginBottom: 12 }}>
                  <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }} numberOfLines={1}>{job.title}</Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: job.is_active ? "#8B5CF620" : "#6B728020" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: job.is_active ? "#8B5CF6" : "#9CA3AF" }}>{job.is_active ? "● نشطة" : "◌ معطّلة"}</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 2 }}>{job.company}</Text>
                  <View style={{ flexDirection: "row-reverse", gap: 10, marginBottom: 4 }}>
                    {job.type && <View style={{ backgroundColor: "#8B5CF615", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}><Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#A78BFA" }}>{TYPE_LABEL[job.type] || job.type}</Text></View>}
                    {job.location && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>📍 {job.location}</Text>}
                  </View>
                  {job.salary && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#10B981", textAlign: "right", marginBottom: 2 }}>💰 {job.salary}</Text>}
                  {job.contact_phone && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>📞 {job.contact_phone}</Text>}
                  {job.author_name && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textDisabled, textAlign: "right", marginBottom: 2 }}>👤 {job.author_name}</Text>}
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textDisabled, textAlign: "right", marginBottom: 10 }}>{new Date(job.created_at).toLocaleDateString("ar-EG")}</Text>
                  <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                    <TouchableOpacity disabled={jobsActing === job.id}
                      onPress={async () => {
                        setJobsActing(job.id);
                        try {
                          const res = await apiFetch(`/api/admin/jobs/${job.id}`, token, { method: "PATCH", body: JSON.stringify({ is_active: !job.is_active }) });
                          if (res.ok) setAdminJobs(prev => prev.map(j => j.id === job.id ? { ...j, is_active: !job.is_active } : j));
                        } catch {} finally { setJobsActing(null); }
                      }}
                      style={{ flex: 2, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1,
                        backgroundColor: job.is_active ? "#EF444415" : "#10B98115",
                        borderColor: job.is_active ? "#EF444440" : "#10B98140" }}>
                      {jobsActing === job.id ? <ActivityIndicator size="small" color={job.is_active ? "#EF4444" : "#10B981"} /> :
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: job.is_active ? "#EF4444" : "#10B981" }}>{job.is_active ? "تعطيل" : "تفعيل"}</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity disabled={jobsActing === job.id}
                      onPress={() => Alert.alert("حذف الوظيفة", `هل تريد حذف "${job.title}"؟`, [
                        { text: "إلغاء", style: "cancel" },
                        { text: "حذف", style: "destructive", onPress: async () => {
                          setJobsActing(job.id);
                          await apiFetch(`/api/admin/jobs/${job.id}`, token, { method: "DELETE" }).catch(()=>{});
                          setAdminJobs(prev => prev.filter(j => j.id !== job.id));
                          setJobsActing(null);
                        }},
                      ])}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444440" }}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ));
            })()}
          </ScrollView>
        </View>
      )}

      {/* ══ التقييمات ══ */}
      {tab === "ratings_admin" && isAdmin && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", marginBottom: 12, gap: 8 }}>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>{adminRatings.length} تقييم</Text>
            <TouchableOpacity onPress={loadAdminRatings} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#FFFFFF0A" }}>
              <Ionicons name="refresh" size={13} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          {loadingRatings ? <ActivityIndicator color="#F59E0B" style={{ marginTop: 40 }} /> :
           adminRatings.length === 0 ? (
            <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد تقييمات</Text>
           ) : adminRatings.map(r => {
             const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
             const starColor = r.rating >= 4 ? "#10B981" : r.rating >= 3 ? "#F59E0B" : "#EF4444";
             return (
               <View key={r.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1,
                 borderColor: starColor + "30", borderRightWidth: 3, borderRightColor: starColor,
                 padding: 14, marginBottom: 10 }}>
                 <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                   <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text, flex: 1, textAlign: "right" }} numberOfLines={1}>{r.entity_name || r.target_id || "—"}</Text>
                   <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: starColor, letterSpacing: 1 }}>{stars}</Text>
                 </View>
                 {r.entity_type && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>🏷️ {r.entity_type}</Text>}
                 {r.user_display_name && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>👤 {r.user_display_name}</Text>}
                 {r.comment && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 18, marginBottom: 6 }} numberOfLines={3}>{r.comment}</Text>}
                 <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                   <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textDisabled }}>{new Date(r.created_at).toLocaleDateString("ar-EG")}</Text>
                   <TouchableOpacity disabled={ratingsActing === r.id}
                     onPress={() => Alert.alert("حذف التقييم", "هل تريد حذف هذا التقييم؟", [
                       { text: "إلغاء", style: "cancel" },
                       { text: "حذف", style: "destructive", onPress: async () => {
                         setRatingsActing(r.id);
                         await apiFetch(`/api/admin/ratings/${r.id}`, token, { method: "DELETE" }).catch(()=>{});
                         setAdminRatings(prev => prev.filter(x => x.id !== r.id));
                         setRatingsActing(null);
                       }},
                     ])}
                     style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444440" }}>
                     {ratingsActing === r.id ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="trash-outline" size={14} color="#EF4444" />}
                   </TouchableOpacity>
                 </View>
               </View>
             );
           })}
        </ScrollView>
      )}

      {/* ══ الشكاوى والمقترحات ══ */}
      {tab === "feedback_admin" && isAdmin && (
        <View style={{ flex: 1 }}>
          {/* مودال الرد */}
          <Modal visible={!!replyingTo} transparent animationType="fade" onRequestClose={() => { setReplyingTo(null); setReplyText(""); }}>
            <View style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "center", alignItems: "center", padding: 24 }}>
              <View style={{ backgroundColor: Colors.cardBg, borderRadius: 20, padding: 24, width: "100%", gap: 12, borderWidth: 1, borderColor: "#06B6D440" }}>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" }}>رد على: {replyingTo?.title}</Text>
                <TextInput
                  value={replyText} onChangeText={setReplyText}
                  placeholder="اكتب ردّك هنا..." placeholderTextColor={Colors.textMuted}
                  multiline style={{ backgroundColor: "#FFFFFF0A", borderRadius: 12, borderWidth: 1, borderColor: "#FFFFFF18", paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Cairo_400Regular", color: Colors.text, fontSize: 13, textAlign: "right", minHeight: 90, textAlignVertical: "top" }}
                />
                <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                  <TouchableOpacity onPress={() => { setReplyingTo(null); setReplyText(""); }}
                    style={{ flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: "#FFFFFF0A", alignItems: "center", borderWidth: 1, borderColor: "#FFFFFF18" }}>
                    <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted }}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={feedbackActing !== null || !replyText.trim()}
                    onPress={async () => {
                      if (!replyText.trim() || !replyingTo) return;
                      setFeedbackActing(replyingTo.id);
                      try {
                        const res = await apiFetch(`/api/admin/feedback/${replyingTo.id}/reply`, token, {
                          method: "PATCH", body: JSON.stringify({ reply: replyText }),
                        });
                        if (res.ok) {
                          setAdminFeedback(prev => prev.map(f => f.id === replyingTo.id ? { ...f, admin_reply: replyText, status: "replied" } : f));
                          setReplyingTo(null); setReplyText("");
                        } else { const d = await safeJson(res); Alert.alert("خطأ", d.error || "تعذّر إرسال الرد"); }
                      } catch { Alert.alert("خطأ", "تعذّر الاتصال"); } finally { setFeedbackActing(null); }
                    }}
                    style={{ flex: 2, paddingVertical: 11, borderRadius: 12, backgroundColor: "#06B6D4", alignItems: "center", opacity: replyText.trim() ? 1 : 0.5 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>إرسال الرد</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <View style={{ flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 12, paddingBottom: 6, gap: 8 }}>
            <Text style={{ flex: 1, fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" }}>{adminFeedback.length} رسالة</Text>
            <TouchableOpacity onPress={loadAdminFeedback} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#FFFFFF0A" }}>
              <Ionicons name="refresh" size={13} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {loadingFeedback ? <ActivityIndicator color="#06B6D4" style={{ marginTop: 40 }} /> :
             adminFeedback.length === 0 ? (
              <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 40 }}>لا توجد شكاوى أو مقترحات</Text>
             ) : adminFeedback.map(fb => {
               const TYPE_COLOR: Record<string,string> = { suggestion: "#10B981", complaint: "#EF4444", general: "#6B7280" };
               const TYPE_LABEL: Record<string,string> = { suggestion: "💡 مقترح", complaint: "⚠️ شكوى", general: "💬 عام" };
               const STATUS_COLOR: Record<string,string> = { pending: "#F59E0B", replied: "#10B981", closed: "#6B7280" };
               const STATUS_LABEL: Record<string,string> = { pending: "جديد", replied: "تم الرد", closed: "مغلق" };
               const tc = TYPE_COLOR[fb.type] || "#6B7280";
               const sc = STATUS_COLOR[fb.status] || "#F59E0B";
               return (
                 <View key={fb.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1,
                   borderColor: tc + "30", borderRightWidth: 4, borderRightColor: tc, padding: 14, marginBottom: 12 }}>
                   <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                     <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" }} numberOfLines={1}>{fb.title}</Text>
                     <View style={{ flexDirection: "row-reverse", gap: 4 }}>
                       <View style={{ backgroundColor: tc + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                         <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: tc }}>{TYPE_LABEL[fb.type] || fb.type}</Text>
                       </View>
                       <View style={{ backgroundColor: sc + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                         <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10, color: sc }}>{STATUS_LABEL[fb.status] || fb.status}</Text>
                       </View>
                     </View>
                   </View>
                   <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 2 }}>👤 {fb.sender_name} {fb.phone ? `· ${fb.phone}` : ""}</Text>
                   {fb.category && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 4 }}>🏷️ {fb.category}</Text>}
                   <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 18, marginBottom: 6 }} numberOfLines={3}>{fb.body}</Text>
                   {fb.admin_reply && (
                     <View style={{ backgroundColor: "#06B6D410", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#06B6D430" }}>
                       <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#06B6D4", textAlign: "right", marginBottom: 4 }}>✅ ردّ الإدارة:</Text>
                       <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 18 }}>{fb.admin_reply}</Text>
                     </View>
                   )}
                   <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textDisabled, textAlign: "right", marginBottom: 10 }}>{new Date(fb.created_at).toLocaleDateString("ar-EG")}</Text>
                   <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                     <TouchableOpacity onPress={() => { setReplyingTo(fb); setReplyText(fb.admin_reply || ""); }}
                       style={{ flex: 2, paddingVertical: 9, borderRadius: 10, backgroundColor: "#06B6D415", borderWidth: 1, borderColor: "#06B6D440", alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 6 }}>
                       <Ionicons name="chatbubble-outline" size={14} color="#06B6D4" />
                       <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#06B6D4" }}>{fb.admin_reply ? "تعديل الرد" : "ردّ"}</Text>
                     </TouchableOpacity>
                   </View>
                 </View>
               );
             })}
          </ScrollView>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ── مودال إحصائيات المستخدم
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={!!statsUser}
        transparent
        animationType="slide"
        onRequestClose={() => { setStatsUser(null); setUserStats(null); }}
      >
        <Pressable style={ps.backdrop} onPress={() => { setStatsUser(null); setUserStats(null); }}>
          <Animated.View entering={FadeInDown.springify().damping(22)} style={[ps.sheet, { maxHeight: "92%" }]}>
            <Pressable onPress={e => e.stopPropagation()}>

              {/* Handle */}
              <View style={ps.handle} />

              {/* Header — اسم المستخدم */}
              {statsUser && (() => {
                const roleColor = ROLE_LABELS[statsUser.role]?.color ?? Colors.primary;
                return (
                  <View style={{ alignItems: "center", marginBottom: 16 }}>
                    <View style={[ps.memberAvatar, {
                      backgroundColor: roleColor + "25",
                      width: 64, height: 64, borderRadius: 32,
                      marginBottom: 8,
                    }]}>
                      <Text style={[ps.memberLetter, { fontSize: 26 }]}>{statsUser.name.charAt(0)}</Text>
                    </View>
                    <Text style={[ps.memberName, { fontSize: 18 }]}>{statsUser.name}</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center" }}>
                      <RoleBadge role={statsUser.role} />
                      {statsUser.neighborhood ? (
                        <View style={ps.nbrChip}>
                          <Ionicons name="location-outline" size={10} color={Colors.textMuted} />
                          <Text style={ps.nbrChipTxt}>{statsUser.neighborhood}</Text>
                        </View>
                      ) : null}
                    </View>
                    {(statsUser.phone || statsUser.email) ? (
                      <Text style={[ps.memberSub, { marginTop: 4 }]}>{statsUser.phone || statsUser.email}</Text>
                    ) : null}
                  </View>
                );
              })()}

              {/* Loading */}
              {loadingUserStats && (
                <View style={{ alignItems: "center", paddingVertical: 32, gap: 10 }}>
                  <ActivityIndicator color={Colors.cyber} size="large" />
                  <Text style={ps.permLabel}>جارٍ تحميل الإحصائيات…</Text>
                </View>
              )}

              {/* Stats Grid */}
              {!loadingUserStats && userStats && (() => {
                const st = userStats;
                const joinDate = st.user.created_at
                  ? new Date(st.user.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })
                  : "—";
                const lastSeen = st.last_seen
                  ? timeAgo(st.last_seen)
                  : "غير متاح";

                const statItems = [
                  { icon: "newspaper-outline",     label: "المنشورات",    value: st.posts_count,        color: Colors.primary  },
                  { icon: "chatbubble-outline",     label: "التعليقات",    value: st.comments_count,     color: "#3B82F6"       },
                  { icon: "heart-outline",          label: "الإعجابات",   value: st.likes_count,        color: "#E74C6F"       },
                  { icon: "megaphone-outline",      label: "البلاغات",     value: st.reports_count,      color: "#F59E0B"       },
                  { icon: "chatbubbles-outline",    label: "الرسائل",      value: st.messages_count,     color: "#06B6D4"       },
                  { icon: "pricetag-outline",       label: "الإعلانات",    value: st.ads_count,          color: "#F0A500"       },
                  { icon: "calendar-outline",       label: "المواعيد",     value: st.appointments_count, color: "#8B5CF6"       },
                ];

                return (
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
                    {/* شبكة الإحصائيات */}
                    <Text style={[ps.permBlockTitle, { marginBottom: 10 }]}>نشاط المستخدم</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                      {statItems.map(item => (
                        <View key={item.label} style={{
                          width: "30%", flex: 1, minWidth: "28%",
                          backgroundColor: item.color + "12",
                          borderRadius: 12, borderWidth: 1,
                          borderColor: item.color + "30",
                          padding: 12, alignItems: "center", gap: 5,
                        }}>
                          <Ionicons name={item.icon as any} size={20} color={item.color} />
                          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: item.color }}>
                            {item.value}
                          </Text>
                          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" }}>
                            {item.label}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* معلومات الحساب */}
                    <Text style={[ps.permBlockTitle, { marginBottom: 8 }]}>معلومات الحساب</Text>
                    <View style={[ps.permBlock, { gap: 10, marginBottom: 16 }]}>
                      {[
                        { icon: "calendar-number-outline", label: "تاريخ الانضمام", val: joinDate  },
                        { icon: "time-outline",            label: "آخر دخول",       val: lastSeen  },
                        { icon: "phone-portrait-outline",  label: "رقم الهاتف",     val: st.user.phone || "—"  },
                        { icon: "mail-outline",            label: "البريد",          val: st.user.email || "—"  },
                        { icon: "home-outline",            label: "الحي",            val: st.user.neighborhood || "—"  },
                      ].map(row => (
                        <View key={row.label} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name={row.icon as any} size={15} color={Colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>{row.label}</Text>
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" }}>{row.val}</Text>
                          </View>
                        </View>
                      ))}
                      {st.user.bio ? (
                        <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 }}>
                          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                            <Ionicons name="person-outline" size={15} color={Colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>نبذة</Text>
                            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textPrimary, lineHeight: 20 }}>{st.user.bio}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>

                    {/* أزرار الإجراءات */}
                    {isAdmin && statsUser && (
                      <View style={{ gap: 10, paddingBottom: 20 }}>
                        {statsUser.role === "user" && (
                          <TouchableOpacity
                            style={[ps.confirmBtn, { backgroundColor: "#F0A500" }]}
                            onPress={() => { setStatsUser(null); setUserStats(null); handleQuickPromote(statsUser); }}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="arrow-up-circle" size={18} color="#fff" />
                            <Text style={ps.confirmBtnTxt}>ترقية إلى مشرف</Text>
                          </TouchableOpacity>
                        )}
                        {statsUser.role === "moderator" && (
                          <TouchableOpacity
                            style={[ps.confirmBtn, { backgroundColor: "#F0A50090" }]}
                            onPress={() => { setStatsUser(null); setUserStats(null); openPermModal(statsUser); }}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="key-outline" size={18} color="#fff" />
                            <Text style={ps.confirmBtnTxt}>تعديل صلاحيات المشرف</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[ps.confirmBtn, { backgroundColor: Colors.primary + "CC" }]}
                          onPress={() => { setStatsUser(null); setUserStats(null); setRoleModal(statsUser); }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="swap-horizontal-outline" size={18} color="#fff" />
                          <Text style={ps.confirmBtnTxt}>تغيير الصفة</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[ps.cancelBtn, { backgroundColor: "#E0556715", borderWidth: 1, borderColor: "#E0556740", borderRadius: 12 }]}
                          onPress={() => {
                            Alert.alert("حذف المستخدم", `هل تريد حذف حساب "${statsUser.name}" نهائياً؟`, [
                              { text: "إلغاء", style: "cancel" },
                              { text: "حذف", style: "destructive", onPress: () => { setStatsUser(null); setUserStats(null); handleDeleteUser(statsUser); } },
                            ]);
                          }}
                        >
                          <Text style={[ps.cancelBtnTxt, { color: "#E05567" }]}>حذف الحساب</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </ScrollView>
                );
              })()}

              {/* Close button if not loading */}
              {!loadingUserStats && !userStats && (
                <TouchableOpacity style={ps.cancelBtn} onPress={() => { setStatsUser(null); setUserStats(null); }}>
                  <Text style={ps.cancelBtnTxt}>إغلاق</Text>
                </TouchableOpacity>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* ─── Promote-to-Moderator Sheet ─────────────────────────────────── */}
      <Modal visible={!!promoTarget} transparent animationType="slide" onRequestClose={() => setPromoTarget(null)}>
        <Pressable style={ps.backdrop} onPress={() => !promoLoading && setPromoTarget(null)}>
          <Animated.View entering={FadeInDown.springify().damping(20)} style={ps.sheet}>
            {/* Handle */}
            <View style={ps.handle} />

            {/* Icon header */}
            <View style={ps.iconWrap}>
              <LinearGradient colors={["#F0A500", "#E8900A"]} style={ps.iconGrad}>
                <Ionicons name="arrow-up-circle" size={34} color="#fff" />
              </LinearGradient>
              <Text style={ps.sheetTitle}>ترقية إلى مشرف</Text>
              <Text style={ps.sheetSub}>تغيير صفة العضو وإعطاؤه صلاحيات الإشراف</Text>
            </View>

            {/* Member info card */}
            {promoTarget && (
              <View style={ps.memberCard}>
                <View style={[ps.memberAvatar, { backgroundColor: Colors.primary + "25" }]}>
                  <Text style={ps.memberLetter}>{promoTarget.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={ps.memberName}>{promoTarget.name}</Text>
                  {(promoTarget.phone || promoTarget.email) ? (
                    <Text style={ps.memberSub}>{promoTarget.phone || promoTarget.email}</Text>
                  ) : null}
                  {promoTarget.neighborhood ? (
                    <View style={ps.nbrChip}>
                      <Ionicons name="location-outline" size={10} color={Colors.textMuted} />
                      <Text style={ps.nbrChipTxt}>{promoTarget.neighborhood}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={ps.roleFlow}>
                  <RoleBadge role="user" />
                  <Ionicons name="arrow-back" size={14} color={Colors.textMuted} />
                  <RoleBadge role="moderator" />
                </View>
              </View>
            )}

            {/* Permissions preview */}
            <View style={ps.permBlock}>
              <Text style={ps.permBlockTitle}>سيكون بإمكانه بعد الترقية:</Text>
              {[
                { icon: "people-outline",   label: "متابعة الأعضاء ومراجعة طلباتهم" },
                { icon: "business-outline", label: "مراجعة طلبات المؤسسات والمجتمعات" },
                { icon: "megaphone-outline",label: "إدارة الإعلانات وقبولها أو رفضها"   },
                { icon: "location-outline", label: "إضافة وتعديل المعالم السياحية"       },
              ].map(p => (
                <View key={p.icon} style={ps.permRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                  <Ionicons name={p.icon as any} size={14} color={Colors.textMuted} />
                  <Text style={ps.permLabel}>{p.label}</Text>
                </View>
              ))}
            </View>

            {/* Actions */}
            <TouchableOpacity
              style={[ps.confirmBtn, promoLoading && { opacity: 0.7 }]}
              onPress={executePromote}
              disabled={promoLoading}
              activeOpacity={0.8}
            >
              {promoLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="arrow-up-circle" size={18} color="#fff" />
                  <Text style={ps.confirmBtnTxt}>تأكيد الترقية</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={ps.cancelBtn}
              onPress={() => setPromoTarget(null)}
              disabled={promoLoading}
            >
              <Text style={ps.cancelBtnTxt}>إلغاء</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Role Change Modal */}
      <Modal visible={!!roleModal} transparent animationType="fade" onRequestClose={() => setRoleModal(null)}>
        <Pressable style={s.overlay} onPress={() => setRoleModal(null)}>
          <Pressable style={s.modalCard} onPress={e => e.stopPropagation()}>
            <Text style={s.modalTitle}>تغيير صفة العضو</Text>
            <Text style={s.modalSub}>{roleModal?.name}</Text>
            {(["user", "moderator", "admin"] as const).map(r => {
              const meta = ROLE_LABELS[r];
              const isCurrent = roleModal?.role === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[s.roleOption, isCurrent && { backgroundColor: meta.color + "18", borderColor: meta.color + "40" }]}
                  onPress={() => !isCurrent && handleRoleChange(r)}
                  disabled={roleChanging || isCurrent}
                  activeOpacity={0.78}
                >
                  <Ionicons name={meta.icon} size={20} color={meta.color} />
                  <Text style={[s.roleOptionTxt, { color: meta.color }]}>{meta.label}</Text>
                  {isCurrent && <Ionicons name="checkmark-circle" size={18} color={meta.color} />}
                </TouchableOpacity>
              );
            })}
            {roleChanging && <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />}
            <TouchableOpacity style={[s.cancelBtn, { marginTop: 6 }]} onPress={() => setRoleModal(null)}>
              <Text style={s.cancelTxt}>إلغاء</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Moderator Permissions Modal */}
      <Modal visible={!!permModal} transparent animationType="fade" onRequestClose={() => setPermModal(null)}>
        <Pressable style={s.overlay} onPress={() => setPermModal(null)}>
          <Pressable style={[s.modalCard, { maxHeight: "85%" }]} onPress={e => e.stopPropagation()}>
            <Text style={s.modalTitle}>صلاحيات المشرف</Text>
            <Text style={s.modalSub}>{permModal?.name}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {MODERATOR_SECTIONS.map(sec => {
                const enabled = permSections.includes(sec.key);
                return (
                  <TouchableOpacity
                    key={sec.key}
                    style={[s.permRow, enabled && { backgroundColor: Colors.primary + "10", borderColor: Colors.primary + "30" }]}
                    onPress={() => setPermSections(prev => enabled ? prev.filter(k => k !== sec.key) : [...prev, sec.key])}
                    activeOpacity={0.78}
                  >
                    <View style={[s.permIconWrap, { backgroundColor: enabled ? Colors.primary + "20" : Colors.divider }]}>
                      <Ionicons name={sec.icon} size={16} color={enabled ? Colors.primary : Colors.textMuted} />
                    </View>
                    <Text style={[s.permLabel, enabled && { color: Colors.textPrimary }]}>{sec.label}</Text>
                    <View style={[s.permCheck, { backgroundColor: enabled ? Colors.primary : "transparent", borderColor: enabled ? Colors.primary : Colors.textMuted }]}>
                      {enabled && <Ionicons name="checkmark" size={12} color="#000" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <ActionButton label={savingPerms ? "جاري الحفظ..." : "حفظ الصلاحيات"} color={Colors.primary} icon="key-outline" onPress={savePerms} disabled={savingPerms} />
            <TouchableOpacity style={[s.cancelBtn, { marginTop: 8 }]} onPress={() => setPermModal(null)}>
              <Text style={s.cancelTxt}>إلغاء</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  /* Header */
  headerGrad: { paddingBottom: 8 },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  backBtn: { padding: 8, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 2 },
  headerBadgeTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary + "25", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.primary + "40" },
  headerAvatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.primary },

  /* Tabs */
  tabsContainer: { borderBottomWidth: 1, borderColor: Colors.divider },
  tabsRow: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  tabBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg,
  },
  tabLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  tabBadge: { position: "absolute", top: -5, right: -6, backgroundColor: "#E05567", borderRadius: 6, minWidth: 13, height: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  tabBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 8, color: "#fff" },

  /* Content */
  scrollContent: { padding: 14, paddingBottom: 60, gap: 14 },

  /* Stats Grid */
  statsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  statCard: { flex: 1, minWidth: "44%", borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  statGrad: { padding: 16, alignItems: "center", gap: 4 },
  statIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 28 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },

  /* Cards */
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.divider },
  cardHeaderRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 6 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, flex: 1, textAlign: "right" },

  /* Section header */
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },

  /* Bar chart */
  barRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 6 },
  barLabel: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary, width: 100, textAlign: "right" },
  barTrack: { flex: 1, height: 7, backgroundColor: Colors.divider, borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: Colors.primary, borderRadius: 4 },
  barCount: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.primary, width: 26, textAlign: "right" },

  /* Recent row */
  recentRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderColor: Colors.divider + "80" },
  avatarSm: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarSmLetter: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  recentName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  recentSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },

  /* Search */
  searchBar: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: Colors.cardBg, margin: 14, marginBottom: 6,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.divider,
  },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },

  /* User Card */
  userCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.divider,
  },
  userCardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 10 },
  avatarCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary + "25", alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.primary },
  userName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  userContact: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: Colors.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.divider },
  chipText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  userActions: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  userActionBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: Colors.primary + "12", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: Colors.primary + "30" },
  userActionTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },

  /* Badge */
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 11 },

  /* Page header */
  pageHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.divider },
  pageHeaderTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  addBtnTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },

  /* Filter row */
  filterRow: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  filterChipTxt: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },

  /* Landmarks */
  lmCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  lmThumb: { width: 64, height: 52, borderRadius: 10, overflow: "hidden" },
  lmThumbLocal: { backgroundColor: "#9B59B615", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#9B59B630" },
  lmName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  lmSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 2 },
  lmUrl: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "right", marginTop: 4 },
  lmImgPreview: {
    width: "100%", height: 140, borderRadius: 12, marginBottom: 10, overflow: "hidden",
  },
  lmImgPlaceholder: {
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider,
    alignItems: "center", justifyContent: "center",
  },
  lmPickBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginBottom: 4,
  },
  lmPickBtnText: {
    fontFamily: "Cairo_600SemiBold", fontSize: 14,
  },

  /* Icon button */
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },

  /* Ads */
  adCard: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  adCardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 8 },
  adStatusIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  adCardTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  adCardSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  adStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  adStatusTxt: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  adMeta: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" },
  adMetaItem: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  adMetaTxt: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  /* Info block */
  infoBlock: { backgroundColor: Colors.bg, borderRadius: 14, padding: 12, gap: 6, borderWidth: 1, borderColor: Colors.divider, marginBottom: 10 },
  infoRow: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderColor: Colors.divider + "60" },
  infoLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  infoValue: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", flex: 1, marginRight: 12 },

  /* Neighborhoods */
  nbrCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  nbrIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nbrName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  nbrType: { fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 2, textAlign: "right" },

  /* Form fields */
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 6 },
  fieldInput: {
    backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 14, paddingVertical: 12, height: 48,
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textPrimary,
    marginBottom: 10,
  },
  fieldHint: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", lineHeight: 18, marginBottom: 8 },
  inputWithIcon: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginBottom: 4 },

  /* Toggle */
  toggleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.bg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.divider, marginBottom: 10 },
  toggleLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  toggle: { width: 50, height: 28, borderRadius: 14, justifyContent: "center", paddingHorizontal: 3 },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" },

  /* Modal */
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: {
    backgroundColor: Colors.cardBg, borderRadius: 22, padding: 20,
    width: "100%", maxWidth: 380, gap: 4,
    borderWidth: 1, borderColor: Colors.divider,
  },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right", marginBottom: 4 },
  modalSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 10 },
  modalBtns: { gap: 8, marginTop: 6 },

  /* Action button */
  actionBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14 },
  actionBtnTxt: { fontFamily: "Cairo_700Bold", fontSize: 14 },

  /* Role options */
  roleOption: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.bg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider, marginVertical: 3 },
  roleOptionTxt: { fontFamily: "Cairo_700Bold", fontSize: 15, flex: 1, textAlign: "right" },

  /* Moderator permissions */
  permRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, marginVertical: 3 },
  permIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  permLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted, flex: 1, textAlign: "right" },
  permCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },

  /* Cancel button */
  cancelBtn: { backgroundColor: Colors.divider, borderRadius: 14, padding: 12, alignItems: "center" },
  cancelTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary },

  /* Divider */
  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: 8 },

  /* Empty state */
  empty: { fontFamily: "Cairo_500Medium", fontSize: 15, color: Colors.textMuted, textAlign: "center", marginTop: 70, marginBottom: 20 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8, minHeight: 160 },
  emptyStateText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },

  /* Input field */
  inputField: {
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary,
    backgroundColor: Colors.cardBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.divider, textAlign: "right",
  },
});

// ─── Member Tracking Styles ──────────────────────────────────────────────────
const sm = StyleSheet.create({
  trackingPanel: {
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 14,
    gap: 12,
  },
  trackingRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  trackingStat: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 4,
  },
  trackingNum: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
  },
  trackingLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "center",
  },
  nbrSection: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: 10,
  },
  nbrTitle: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "right",
    marginBottom: 2,
  },
  nbrRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    height: 28,
    position: "relative",
    borderRadius: 6,
    overflow: "hidden",
  },
  nbrBar: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 6,
  },
  nbrInfo: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    zIndex: 1,
  },
  nbrName: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    color: Colors.textPrimary,
  },
  nbrCount: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: Colors.textMuted,
  },
  clearFilter: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-end",
    marginTop: 2,
  },
  clearFilterTxt: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  sortRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  sortLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.cardBg,
  },
  sortBtnActive: {
    borderColor: Colors.primary + "60",
    backgroundColor: Colors.primary + "15",
  },
  sortBtnTxt: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
  },
  sortBtnTxtActive: {
    color: Colors.primary,
    fontFamily: "Cairo_600SemiBold",
  },
});

// ─── User Card Styles ────────────────────────────────────────────────────────
const uc = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 14,
    gap: 12,
  },
  topRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
  },
  name: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  metaRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 5,
  },
  metaChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  joinAgo: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "right",
  },
  actionBar: {
    flexDirection: "row-reverse",
    gap: 7,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: 10,
  },
  promoteBtn: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#F0A500",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  promoteBtnTxt: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#fff",
  },
  secBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: 1,
  },
  secBtnTxt: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
});

// ─── Promote Sheet Styles ────────────────────────────────────────────────────
const ps = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    alignSelf: "center",
    marginBottom: 4,
  },
  iconWrap: {
    alignItems: "center",
    gap: 8,
  },
  iconGrad: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  sheetSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
  },
  memberCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 12,
  },
  memberAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  memberLetter: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: Colors.primary,
  },
  memberName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  memberSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "right",
  },
  nbrChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  nbrChipTxt: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  roleFlow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
  },
  permBlock: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 14,
    gap: 10,
  },
  permBlockTitle: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "right",
    marginBottom: 2,
  },
  permRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  permLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  confirmBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F0A500",
    borderRadius: 16,
    paddingVertical: 15,
  },
  confirmBtnTxt: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  cancelBtnTxt: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: Colors.textMuted,
  },
});

const hs = StyleSheet.create({
  honorCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D4AF3722",
    padding: 14,
    gap: 10,
  },
  honorCardTop: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  honorThumb: {
    width: 62,
    height: 74,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D4AF3740",
  },
  honorThumbPlaceholder: {
    backgroundColor: "#D4AF3715",
    alignItems: "center",
    justifyContent: "center",
  },
  honorName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  honorTitle: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: "#D4AF37",
    textAlign: "right",
    marginTop: 2,
  },
  honorRole: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "right",
    marginTop: 2,
  },
  visChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  visDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  visText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
  },
  datesRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
  },
  datesText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  tributePreview: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "right",
    fontStyle: "italic",
    borderRightWidth: 2,
    borderRightColor: "#D4AF3740",
    paddingRight: 8,
  },
  honorActions: {
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 2,
  },
  honorAction: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
  },
  honorActionTxt: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  honorPhotoPreview: {
    width: "100%",
    height: 200,
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
  },
  honorPhotoPlaceholder: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: "#D4AF3730",
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
});
