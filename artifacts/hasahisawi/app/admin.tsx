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

type Tab = "overview" | "members" | "admins" | "moderators" | "landmarks" | "ads" | "communities" | "neighborhoods" | "ai_settings" | "security" | "honored" | "transport" | "updates" | "libraries" | "merchants_admin" | "phone_shops";

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
  const [memberSort, setMemberSort] = useState<"newest" | "oldest" | "name">("newest");
  const [memberNbrFilter, setMemberNbrFilter] = useState<string>("all");
  const [promotingId, setPromotingId] = useState<number | null>(null);
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
  const [statsError, setStatsError] = useState<string | null>(null);
  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);
    try {
      const res = await apiFetch("/api/admin/dashboard-stats", token);
      if (res.ok) {
        setStats(await res.json());
      } else if (res.status === 401) {
        setStatsError("الجلسة منتهية — يرجى تسجيل الدخول من جديد");
      } else if (res.status === 403) {
        setStatsError("ليس لديك صلاحية مدير. تواصل مع مدير النظام لمنحك الصلاحية.");
      } else {
        setStatsError(`فشل التحميل (رمز ${res.status})`);
      }
    } catch (e: any) {
      setStatsError(`تعذّر الاتصال بالخادم: ${e?.message ?? "خطأ شبكة"}`);
    }
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
        const { items } = await seedRes.json();
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
                const { items } = await res.json();
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
        const data = await res.json();
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
        const d = await settingsRes.json();
        const st = d.transport_status as "coming_soon" | "maintenance" | "available";
        setTransportStatus(["coming_soon","maintenance","available"].includes(st) ? st : "coming_soon");
        setTransportNote(d.transport_note || "");
        setTransportPhone(d.transport_phone || "");
      }
      if (driversRes.ok) setTransportDrivers(await driversRes.json());
      if (tripsRes.ok) setTransportTrips(await tripsRes.json());
      if (statsRes.ok) setTransportStats(await statsRes.json());
      if (faresRes.ok) {
        const fm = await faresRes.json();
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
        const j = await res.json();
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
      else { const j = await res.json(); Alert.alert("خطأ", j.error || "تعذّر الحفظ"); }
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
      if (res.ok) setApprovedDriversList(await res.json());
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
        const j = await res.json();
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
        const data = await res.json();
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
      else { const j = await res.json(); Alert.alert("خطأ", j.error || "تعذّر الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSavingAdsSettings(false); }
  };

  const loadContractSettings = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/contract-settings", token);
      if (res.ok) { const d = await res.json(); setContractWhatsapp(d.contract_whatsapp || "+966597083352"); }
    } catch {}
  }, [token]);

  const saveContractSettings = async () => {
    setSavingContractSettings(true);
    try {
      const res = await apiFetch("/api/admin/contract-settings", token, {
        method: "PUT", body: JSON.stringify({ contract_whatsapp: contractWhatsapp }),
      });
      if (res.ok) Alert.alert("✅ تم الحفظ", "تم تحديث رقم واتساب عقود المؤسسات");
      else { const j = await res.json(); Alert.alert("خطأ", j.error || "تعذّر الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSavingContractSettings(false); }
  };

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

  const loadUpdates = useCallback(async () => {
    setLoadingUpdates(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/app/version`);
      if (res.ok) {
        const data = await res.json();
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
      if (res.ok) { const d = await res.json(); setAdminPhoneShops(d.shops ?? []); }
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
      if (res.ok) { const d = await res.json(); setAdminLibraries(Array.isArray(d) ? d : d.libraries ?? []); }
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
      if (res.ok) { const d = await res.json(); setAdminMerchants(Array.isArray(d) ? d : d.merchants ?? []); }
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
    if (tab === "honored")      loadHonoredFigures();
    if (tab === "ads")          { loadAds(); loadAdsSettings(); }
    if (tab === "communities")  { loadCommunities(); loadServiceRequests("pending"); loadContractSettings(); }
    if (tab === "neighborhoods") loadNeighborhoods();
    if (tab === "ai_settings")   loadAiSettings();
    if (tab === "security")      loadSecurity();
    if (tab === "updates")         loadUpdates();
    if (tab === "libraries")       loadAdminLibraries();
    if (tab === "merchants_admin") loadAdminMerchants();
    if (tab === "phone_shops")     loadAdminPhoneShops();
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
      if (!res.ok) { const j = await res.json(); Alert.alert("خطأ", j.error); return; }
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

  const openUserStats = async (u: AdminUser) => {
    setStatsUser(u);
    setUserStats(null);
    setLoadingUserStats(true);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}/stats`, token);
      if (res.ok) setUserStats(await res.json());
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

  const pickLandmarkImageForAdd = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("تنبيه", "يجب منح صلاحية الوصول للمعرض"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 0.85, allowsEditing: true, aspect: [16, 9],
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
      mediaTypes: ["images"], quality: 0.85, allowsEditing: true, aspect: [16, 9],
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
      const json = await res.json();
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
      const json = await res.json();
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
      const json = await res.json();
      if (!res.ok) { Alert.alert("خطأ", json.error || "تعذّر التعديل"); return; }
      setHonoredList(prev => prev.map(x => x.id === editingHonor.id ? json : x));
      setShowEditHonor(false); setEditingHonor(null);
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setUpdatingHonor(false); }
  };

  const toggleHonoredVisibility = async (figure: HonoredFigure) => {
    try {
      const res = await apiFetch(`/api/admin/honored-figures/${figure.id}/visibility`, token, { method: "PATCH" });
      const json = await res.json();
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, allowsEditing: true, aspect: [3, 4] });
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, allowsEditing: true, aspect: [3, 4] });
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
    { key: "merchants_admin",  label: "مساحة التجار",      icon: "storefront",         color: "#6366F1",      adminOnly: true               },
    { key: "phone_shops",      label: "محلات الهواتف",     icon: "phone-portrait",     color: "#7C3AED",      adminOnly: true, badge: adminPhoneShops.filter(s=>!s.is_approved).length || undefined },
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
            adminMerchants.map((m, i) => (
              <Animated.View key={m.id} entering={FadeInDown.delay(i * 60).springify()} style={[s.card, { marginBottom: 12 }]}>
                <View style={[s.cardHeaderRow, { marginBottom: 10 }]}>
                  <Text style={{ fontSize: 28, marginLeft: 10 }}>{m.logo_emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                      <Text style={[s.cardTitle, { fontSize: 15 }]}>{m.shop_name}</Text>
                      {m.is_verified && <MaterialCommunityIcons name="check-decagram" size={15} color="#6366F1" />}
                      {m.is_featured && <MaterialCommunityIcons name="star-circle" size={15} color="#F0A500" />}
                    </View>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>
                      {m.owner_name} · {m.phone}
                    </Text>
                    {m.address ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" }}>{m.address}</Text> : null}
                  </View>
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
