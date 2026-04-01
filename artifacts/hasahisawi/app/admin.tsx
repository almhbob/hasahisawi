import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, ActivityIndicator, Alert,
  TextInput, Pressable, Modal, Image,
  KeyboardAvoidingView, Platform,
} from "react-native";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import BrandPattern from "@/components/BrandPattern";

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
};

type Tab = "overview" | "members" | "admins" | "moderators" | "landmarks" | "ads" | "communities" | "neighborhoods" | "ai_settings" | "security";

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
};

type ApiLandmark = { id: number; name: string; sub: string; image_url: string; sort_order: number };
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

// ─── API Helper ─────────────────────────────────────────────────────────────
function apiFetch(path: string, token: string | null, opts: Parameters<typeof fetch>[1] = {}) {
  const base = getApiUrl();
  if (!base) return Promise.reject(new Error("API not configured"));
  const url = new URL(path, base).toString();
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts as any).headers,
    },
  });
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

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  // ── Overview ──
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // ── Users ──
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [roleModal, setRoleModal] = useState<AdminUser | null>(null);
  const [roleChanging, setRoleChanging] = useState(false);
  const [permModal, setPermModal] = useState<AdminUser | null>(null);
  const [permSections, setPermSections] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  // ── Landmarks ──
  const [landmarks, setLandmarks] = useState<ApiLandmark[]>([]);
  const [loadingLM, setLoadingLM] = useState(false);
  const [lmForm, setLmForm] = useState({ name: "", sub: "", image_url: "" });
  const [addingLM, setAddingLM] = useState(false);
  const [showAddLM, setShowAddLM] = useState(false);
  const [editingLM, setEditingLM] = useState<ApiLandmark | null>(null);
  const [editLmForm, setEditLmForm] = useState({ name: "", sub: "", image_url: "" });
  const [showEditLM, setShowEditLM] = useState(false);
  const [updatingLM, setUpdatingLM] = useState(false);

  // ── Ads ──
  const [adsList, setAdsList] = useState<AdRecord[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [adsFilter, setAdsFilter] = useState<"all" | "pending" | "active" | "rejected" | "expired">("all");
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [adDetailModal, setAdDetailModal] = useState<AdRecord | null>(null);
  const [approvalDays, setApprovalDays] = useState("7");
  const [adminNote, setAdminNote] = useState("");

  // ── Neighborhoods ──
  const [neighborhoods, setNeighborhoods] = useState<NbrItem[]>([]);
  const [loadingNbr, setLoadingNbr] = useState(false);
  const [nbrForm, setNbrForm] = useState<{ label: string; type: "neighborhood" | "village" }>({ label: "", type: "neighborhood" });
  const [addingNbr, setAddingNbr] = useState(false);
  const [editingNbr, setEditingNbr] = useState<NbrItem | null>(null);
  const [showAddNbr, setShowAddNbr] = useState(false);
  const [nbrFilter, setNbrFilter] = useState<"all" | "neighborhood" | "village">("all");

  // ── AI Settings ──
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [aiForm, setAiForm] = useState({ ai_api_key: "", ai_enabled: "false", ai_system_prompt: "" });
  const [showApiKey, setShowApiKey] = useState(false);

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

  const isAdmin = user?.role === "admin";
  const isMod   = user?.role === "moderator";
  const modPerms = (user?.permissions ?? []) as string[];

  useEffect(() => {
    if (!isAdmin && !isMod) router.replace("/(tabs)/" as any);
  }, [user]);

  // ── Data fetchers ────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await apiFetch("/api/admin/dashboard-stats", token);
      if (res.ok) setStats(await res.json());
    } catch {}
    finally { setLoadingStats(false); }
  }, [token]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await apiFetch("/api/admin/users", token);
      if (res.ok) setUsers(await res.json());
    } catch {}
    finally { setLoadingUsers(false); }
  }, [token]);

  const loadLandmarks = useCallback(async () => {
    setLoadingLM(true);
    try {
      const res = await apiFetch("/api/landmarks", token);
      if (res.ok) setLandmarks(await res.json());
    } catch {}
    finally { setLoadingLM(false); }
  }, [token]);

  const loadAds = useCallback(async () => {
    setLoadingAds(true);
    try {
      const res = await apiFetch("/api/admin/ads", token);
      if (res.ok) setAdsList(await res.json());
    } catch {}
    finally { setLoadingAds(false); }
  }, [token]);

  const loadNeighborhoods = useCallback(async () => {
    setLoadingNbr(true);
    try {
      const res = await apiFetch("/api/admin/neighborhoods", token);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) { setNeighborhoods(data); return; }
      }
      const { DEFAULT_HASAHISA_LOCATIONS } = await import("@/constants/neighborhoods");
      setNeighborhoods(DEFAULT_HASAHISA_LOCATIONS);
    } catch {
      const { DEFAULT_HASAHISA_LOCATIONS } = await import("@/constants/neighborhoods");
      setNeighborhoods(DEFAULT_HASAHISA_LOCATIONS);
    } finally { setLoadingNbr(false); }
  }, [token]);

  const loadAiSettings = useCallback(async () => {
    setLoadingAi(true);
    try {
      const res = await apiFetch("/api/admin/ai-settings", token);
      if (res.ok) {
        const data = await res.json();
        setAiForm({ ai_api_key: data.ai_api_key || "", ai_enabled: data.ai_enabled || "false", ai_system_prompt: data.ai_system_prompt || "" });
      }
    } catch {}
    finally { setLoadingAi(false); }
  }, [token]);

  const loadSecurity = useCallback(async () => {
    setLoadingSecurity(true);
    try {
      const res = await apiFetch("/api/admin/name", token);
      if (res.ok) {
        const data = await res.json();
        setAdminNameForm({ name: data.name || "" });
      }
    } catch {}
    finally { setLoadingSecurity(false); }
  }, [token]);

  const loadCommunities = useCallback(async () => {
    setLoadingCommunities(true);
    try {
      const res = await apiFetch("/api/admin/communities", token);
      if (res.ok) setCommunitiesList(await res.json());
    } catch {}
    finally { setLoadingCommunities(false); }
  }, [token]);

  const loadServiceRequests = useCallback(async (statusFilter = "pending") => {
    setLoadingSvcReqs(true);
    try {
      const res = await apiFetch(`/api/moderator/service-requests?status=${statusFilter}`, token);
      if (res.ok) setSvcRequests(await res.json());
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
        const j = await res.json();
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
        const updated = await res.json();
        setCommunitiesList(prev => prev.map(x => x.id === c.id ? { ...x, ...updated } : x));
        setCommunityDetailModal(null);
        setSuspendModal(null);
        setSuspendReason("");
      } else {
        const err = await res.json();
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
        const created = await res.json();
        setCommunitiesList(prev => [{ ...created, ...communityForm } as CommunityRecord, ...prev]);
        setShowCommunityForm(false);
        setCommunityForm({ name: "", category: "institution", origin: "", description: "", representative_name: "", representative_title: "", representative_phone: "", representative_national_id: "", representative_email: "", contact_phone: "", neighborhood: "", services: "" });
        Alert.alert("تم الإرسال", "تم رفع الطلب بنجاح — سيراجعه المدير");
      } else {
        const err = await res.json();
        Alert.alert("خطأ", err.error || "فشل الإرسال");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSubmittingCommunity(false); }
  };

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    if (tab === "members" || tab === "admins" || tab === "moderators") loadUsers();
    if (tab === "landmarks")    loadLandmarks();
    if (tab === "ads")          loadAds();
    if (tab === "communities")  { loadCommunities(); loadServiceRequests("pending"); }
    if (tab === "neighborhoods") loadNeighborhoods();
    if (tab === "ai_settings")   loadAiSettings();
    if (tab === "security")      loadSecurity();
  }, [tab]);

  // ── User actions ─────────────────────────────────────────────────────────
  const handleRoleChange = async (newRole: string) => {
    if (!roleModal) return;
    setRoleChanging(true);
    try {
      const res = await apiFetch(`/api/admin/users/${roleModal.id}/role`, token, {
        method: "PATCH", body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) { const j = await res.json(); Alert.alert("خطأ", j.error); return; }
      setUsers(prev => prev.map(u => u.id === roleModal.id ? { ...u, role: newRole as any } : u));
      loadStats();
      setRoleModal(null);
    } catch { Alert.alert("خطأ", "تعذّر تغيير الصفة"); }
    finally { setRoleChanging(false); }
  };

  const handleDeleteUser = async (u: AdminUser) => {
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}`, token, { method: "DELETE" });
      if (res.ok) {
        setUsers(prev => prev.filter(x => x.id !== u.id));
        loadStats();
      } else {
        const j = await res.json();
        Alert.alert("خطأ", j.error);
      }
    } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
  };

  const openPermModal = async (u: AdminUser) => {
    setPermModal(u);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}/permissions`, token);
      if (res.ok) setPermSections(await res.json());
      else setPermSections([]);
    } catch { setPermSections([]); }
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
      const json = await res.json();
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
      const json = await res.json();
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

  // ── Ads actions ──────────────────────────────────────────────────────────
  const updateAdStatus = async (ad: AdRecord, status: "active" | "rejected" | "expired", days?: string, note?: string) => {
    setApprovingId(ad.id);
    try {
      const res = await apiFetch(`/api/admin/ads/${ad.id}/status`, token, {
        method: "PUT",
        body: JSON.stringify({ status, duration_days: parseInt(days || "7"), admin_note: note?.trim() || null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAdsList(prev => prev.map(a => a.id === ad.id ? updated : a));
        setAdDetailModal(null); setApprovalDays("7"); setAdminNote("");
      } else {
        const err = await res.json();
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
        if (res.ok) { const updated = await res.json(); setNeighborhoods(prev => prev.map(n => n.key === editingNbr.key ? updated : n)); }
      } else {
        const res = await apiFetch("/api/admin/neighborhoods", token, { method: "POST", body: JSON.stringify(nbrForm) });
        if (res.ok) { const added = await res.json(); setNeighborhoods(prev => [...prev, added]); }
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
      const validateData = await validateRes.json();
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
  const filteredUsers = users.filter(u => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || u.name.toLowerCase().includes(q) || (u.neighborhood || "").toLowerCase().includes(q);
    if (tab === "members")    return matchSearch && u.role === "user";
    if (tab === "admins")     return matchSearch && u.role === "admin";
    if (tab === "moderators") return matchSearch && u.role === "moderator";
    return matchSearch;
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
    { key: "landmarks",      label: "المعالم",           icon: "location",           color: "#9B59B6",      modPerm: "landmarks"          },
    { key: "ads",            label: "الإعلانات",         icon: "megaphone",          color: "#F0A500", badge: pendingAdsCount, modPerm: "ads" },
    { key: "neighborhoods",  label: "الأحياء",           icon: "map",                color: "#3498DB",      adminOnly: true               },
    { key: "ai_settings",    label: "الذكاء الاصطناعي", icon: "sparkles",           color: Colors.cyber,   adminOnly: true               },
    { key: "security",       label: "الأمان",            icon: "lock-closed",        color: "#E05567",      adminOnly: true               },
  ];

  const TABS = ALL_TABS.filter(t => {
    if (t.adminOnly) return isAdmin;
    if (isMod && t.modPerm) return modPerms.includes(t.modPerm);
    return true;
  });

  // ─── Render helpers ────────────────────────────────────────────────────────
  function renderUserCard(u: AdminUser) {
    const joinDate = u.created_at
      ? new Date(u.created_at).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })
      : "—";
    return (
      <Animated.View entering={FadeInDown.springify().damping(18)} key={u.id} style={s.userCard}>
        <View style={s.userCardRow}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarLetter}>{u.name.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{u.name}</Text>
            <Text style={s.userContact}>{u.phone || u.email || "—"}</Text>
          </View>
          <RoleBadge role={u.role} />
        </View>

        <View style={s.chipRow}>
          {u.neighborhood ? (
            <View style={s.chip}>
              <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
              <Text style={s.chipText}>{u.neighborhood}</Text>
            </View>
          ) : null}
          <View style={s.chip}>
            <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
            <Text style={s.chipText}>{joinDate}</Text>
          </View>
          {u.national_id_masked ? (
            <View style={s.chip}>
              <Ionicons name="id-card-outline" size={11} color={Colors.textMuted} />
              <Text style={s.chipText}>{u.national_id_masked}</Text>
            </View>
          ) : null}
        </View>

        {isAdmin && (
          <View style={s.userActions}>
            <TouchableOpacity style={s.userActionBtn} onPress={() => setRoleModal(u)}>
              <Ionicons name="swap-horizontal-outline" size={14} color={Colors.primary} />
              <Text style={[s.userActionTxt, { color: Colors.primary }]}>تغيير الصفة</Text>
            </TouchableOpacity>
            {u.role === "moderator" && (
              <TouchableOpacity style={[s.userActionBtn, { borderColor: "#F0A50030", backgroundColor: "#F0A50010" }]} onPress={() => openPermModal(u)}>
                <Ionicons name="key-outline" size={14} color="#F0A500" />
                <Text style={[s.userActionTxt, { color: "#F0A500" }]}>الصلاحيات</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.userActionBtn, { borderColor: "#E0556730", backgroundColor: "#E0556710" }]}
              onPress={() => handleDeleteUser(u)}
            >
              <Ionicons name="trash-outline" size={14} color="#E05567" />
              <Text style={[s.userActionTxt, { color: "#E05567" }]}>حذف</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────
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
                onPress={() => setTab(t.key)}
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
            <Text style={s.empty}>تعذّر تحميل البيانات</Text>
          )}
        </ScrollView>
      )}

      {/* Members / Admins / Moderators */}
      {(tab === "members" || tab === "admins" || tab === "moderators") && (
        <View style={{ flex: 1 }}>
          <View style={s.searchBar}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="ابحث باسم أو حي..."
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

          {loadingUsers ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
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
                  <Text style={s.fieldLabel}>رابط الصورة *</Text>
                  <TextInput style={s.fieldInput} value={editLmForm.image_url} onChangeText={v => setEditLmForm(f => ({ ...f, image_url: v }))} placeholder="https://..." placeholderTextColor={Colors.textMuted} textAlign="right" autoCapitalize="none" keyboardType="url" />
                  <View style={s.modalBtns}>
                    <ActionButton label="حفظ التعديلات" color="#3498DB" icon="save-outline" onPress={updateLandmark} disabled={updatingLM} />
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
                  <Text style={s.fieldLabel}>رابط الصورة *</Text>
                  <TextInput style={s.fieldInput} value={lmForm.image_url} onChangeText={v => setLmForm(f => ({ ...f, image_url: v }))} placeholder="https://... أو local:ferris-wheel" placeholderTextColor={Colors.textMuted} textAlign="right" autoCapitalize="none" keyboardType="url" />
                  <Text style={s.fieldHint}>للصور المحلية: local:ferris-wheel أو local:hasahisa-city</Text>
                  <View style={s.modalBtns}>
                    <ActionButton label="إضافة المعلم" color="#9B59B6" icon="add-circle-outline" onPress={addLandmark} disabled={addingLM} />
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
            <TouchableOpacity style={[s.addBtn, { backgroundColor: "#F0A50015", borderWidth: 1, borderColor: "#F0A500" }]} onPress={loadAds}>
              <Ionicons name="refresh" size={14} color="#F0A500" />
              <Text style={[s.addBtnTxt, { color: "#F0A500" }]}>تحديث</Text>
            </TouchableOpacity>
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

                        <View style={s.infoBlock}>
                          <InfoRow label="عنوان الإعلان" value={ad.title} />
                          <InfoRow label="تفاصيل"         value={ad.description} />
                          <InfoRow label="نوع الإعلان"    value={ad.type} />
                          <InfoRow label="شخص التواصل"    value={ad.contact_name} />
                          <InfoRow label="رقم التواصل"    value={ad.contact_phone} />
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
          <View style={s.pageHeader}>
            <Text style={s.pageHeaderTitle}>الأحياء والقرى ({neighborhoods.length})</Text>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: "#3498DB" }]} onPress={() => { setNbrForm({ label: "", type: "neighborhood" }); setEditingNbr(null); setShowAddNbr(true); }}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={s.addBtnTxt}>إضافة</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow} style={{ flexGrow: 0 }}>
            {(["all", "neighborhood", "village"] as const).map(f => (
              <TouchableOpacity key={f} style={[s.filterChip, nbrFilter === f && { backgroundColor: "#3498DB20", borderColor: "#3498DB" }]} onPress={() => setNbrFilter(f)}>
                <Text style={[s.filterChipTxt, nbrFilter === f && { color: "#3498DB", fontFamily: "Cairo_700Bold" }]}>
                  {f === "all" ? "الكل" : f === "neighborhood" ? "أحياء" : "قرى"}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingNbr ? (
            <ActivityIndicator color="#3498DB" style={{ marginTop: 60 }} />
          ) : (
            <FlatList
              data={nbrFilter === "all" ? neighborhoods : neighborhoods.filter(n => n.type === nbrFilter)}
              keyExtractor={(_, i) => i.toString()}
              contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 60 }}
              ListEmptyComponent={<Text style={s.empty}>لا توجد أحياء</Text>}
              renderItem={({ item }) => (
                <View style={s.nbrCard}>
                  <View style={[s.nbrIcon, { backgroundColor: item.type === "neighborhood" ? "#3498DB15" : "#9B59B615" }]}>
                    <Ionicons name={item.type === "neighborhood" ? "home" : "leaf"} size={18} color={item.type === "neighborhood" ? "#3498DB" : "#9B59B6"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.nbrName}>{item.label}</Text>
                    <Text style={[s.nbrType, { color: item.type === "neighborhood" ? "#3498DB" : "#9B59B6" }]}>{item.type === "neighborhood" ? "حي" : "قرية"}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity style={[s.iconBtn, { backgroundColor: "#3498DB15", borderColor: "#3498DB30" }]} onPress={() => { setEditingNbr(item); setNbrForm({ label: item.label, type: item.type }); setShowAddNbr(true); }}>
                      <Ionicons name="pencil-outline" size={15} color="#3498DB" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.iconBtn, { backgroundColor: "#E0556715", borderColor: "#E0556730" }]} onPress={() => deleteNeighborhood(item)}>
                      <Ionicons name="trash-outline" size={15} color="#E05567" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}

          <Modal visible={showAddNbr} transparent animationType="fade" onRequestClose={() => setShowAddNbr(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
              <Pressable style={s.overlay} onPress={() => setShowAddNbr(false)}>
                <Pressable style={s.modalCard} onPress={e => e.stopPropagation()}>
                  <Text style={s.modalTitle}>{editingNbr ? "تعديل الحي/القرية" : "إضافة حي أو قرية"}</Text>
                  <Text style={s.fieldLabel}>الاسم *</Text>
                  <TextInput style={s.fieldInput} value={nbrForm.label} onChangeText={t => setNbrForm(p => ({ ...p, label: t }))} placeholder="اسم الحي أو القرية" placeholderTextColor={Colors.textMuted} textAlign="right" />
                  <Text style={s.fieldLabel}>النوع</Text>
                  <View style={{ flexDirection: "row-reverse", gap: 10, marginVertical: 8 }}>
                    {(["neighborhood", "village"] as const).map(t => (
                      <TouchableOpacity key={t} onPress={() => setNbrForm(p => ({ ...p, type: t }))} style={[s.filterChip, { flex: 1, justifyContent: "center" }, nbrForm.type === t && { backgroundColor: "#3498DB20", borderColor: "#3498DB" }]}>
                        <Text style={[s.filterChipTxt, nbrForm.type === t && { color: "#3498DB" }]}>{t === "neighborhood" ? "حي" : "قرية"}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={s.modalBtns}>
                    <ActionButton label={editingNbr ? "حفظ التعديل" : "إضافة"} color="#3498DB" icon={editingNbr ? "save-outline" : "add-circle-outline"} onPress={saveNeighborhood} disabled={addingNbr} />
                    <ActionButton label="إلغاء" color={Colors.textMuted} onPress={() => setShowAddNbr(false)} outline />
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
});
