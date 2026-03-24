import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, ActivityIndicator, Alert,
  TextInput, Pressable, Modal, Image,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import BrandPattern from "@/components/BrandPattern";

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

type Tab = "overview" | "members" | "admins" | "moderators" | "landmarks" | "ads" | "neighborhoods" | "ai_settings";

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

const ROLE_LABELS: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  admin:     { label: "مدير",   color: "#E74C3C", icon: "shield"        },
  moderator: { label: "مشرف",  color: "#F0A500", icon: "shield-half"   },
  user:      { label: "عضو",   color: "#27AE68", icon: "person"        },
};

function apiFetch(path: string, token: string | null, opts: Parameters<typeof fetch>[1] = {}) {
  const url = new URL(path, getApiUrl()).toString();
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts as any).headers },
  });
}

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_LABELS[role] ?? ROLE_LABELS.user;
  return (
    <View style={[s.badge, { backgroundColor: meta.color + "22" }]}>
      <Ionicons name={meta.icon} size={11} color={meta.color} />
      <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function StatCard({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; color: string }) {
  return (
    <View style={[s.statCard, { borderColor: color + "40" }]}>
      <View style={[s.statIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function UserCard({
  user, isAdmin, onRoleChange,
}: {
  user: AdminUser; isAdmin: boolean; onRoleChange: (u: AdminUser) => void;
}) {
  const joinDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })
    : "—";
  const birthDate = user.birth_date
    ? new Date(user.birth_date).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={s.userCard}>
      <View style={s.userCardTop}>
        <View style={s.avatarCircle}>
          <Text style={s.avatarLetter}>{user.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.userName}>{user.name}</Text>
          <Text style={s.userContact}>{user.phone || user.email || "—"}</Text>
        </View>
        <RoleBadge role={user.role} />
      </View>

      <View style={s.userDetailsGrid}>
        {user.neighborhood ? (
          <View style={s.detailChip}>
            <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
            <Text style={s.detailText}>{user.neighborhood}</Text>
          </View>
        ) : null}
        {birthDate ? (
          <View style={s.detailChip}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
            <Text style={s.detailText}>{birthDate}</Text>
          </View>
        ) : null}
        <View style={s.detailChip}>
          <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
          <Text style={s.detailText}>انضم {joinDate}</Text>
        </View>
        {user.national_id_masked ? (
          <View style={s.detailChip}>
            <Ionicons name="id-card-outline" size={12} color={Colors.textMuted} />
            <Text style={s.detailText}>{user.national_id_masked}</Text>
          </View>
        ) : null}
      </View>

      {isAdmin && (
        <TouchableOpacity style={s.changeRoleBtn} onPress={() => onRoleChange(user)}>
          <Ionicons name="swap-horizontal-outline" size={14} color={Colors.primary} />
          <Text style={s.changeRoleTxt}>تغيير الصفة</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [roleModal, setRoleModal] = useState<AdminUser | null>(null);
  const [roleChanging, setRoleChanging] = useState(false);

  // ── Landmarks state ──
  const [landmarks, setLandmarks] = useState<ApiLandmark[]>([]);
  const [loadingLM, setLoadingLM] = useState(false);
  const [lmForm, setLmForm] = useState({ name: "", sub: "", image_url: "" });
  const [addingLM, setAddingLM] = useState(false);
  const [showAddLM, setShowAddLM] = useState(false);

  // ── Ads state ──
  const [adsList, setAdsList] = useState<AdRecord[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [adsFilter, setAdsFilter] = useState<"all" | "pending" | "active" | "rejected" | "expired">("all");
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [adDetailModal, setAdDetailModal] = useState<AdRecord | null>(null);
  const [approvalDays, setApprovalDays] = useState("7");
  const [adminNote, setAdminNote] = useState("");

  // ── Neighborhoods state ──
  type NbrItem = { label: string; type: "neighborhood" | "village"; key?: string };
  const [neighborhoods, setNeighborhoods] = useState<NbrItem[]>([]);
  const [loadingNbr, setLoadingNbr] = useState(false);
  const [nbrForm, setNbrForm] = useState<{ label: string; type: "neighborhood" | "village" }>({ label: "", type: "neighborhood" });
  const [addingNbr, setAddingNbr] = useState(false);
  const [editingNbr, setEditingNbr] = useState<NbrItem | null>(null);
  const [showAddNbr, setShowAddNbr] = useState(false);
  const [nbrFilter, setNbrFilter] = useState<"all" | "neighborhood" | "village">("all");

  // ── AI Settings state ──
  const [aiSettings, setAiSettings] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [aiForm, setAiForm] = useState({ ai_api_key: "", ai_enabled: "false", ai_system_prompt: "" });
  const [showApiKey, setShowApiKey] = useState(false);

  const isAdmin = user?.role === "admin";
  const isMod   = user?.role === "moderator";

  useEffect(() => {
    if (!isAdmin && !isMod) {
      router.replace("/(tabs)/" as any);
    }
  }, [user]);

  const loadStats = useCallback(async () => {
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

  const addLandmark = async () => {
    if (!lmForm.name.trim() || !lmForm.image_url.trim()) {
      Alert.alert("تنبيه", "الاسم ورابط الصورة مطلوبان");
      return;
    }
    setAddingLM(true);
    try {
      const res = await apiFetch("/api/admin/landmarks", token, {
        method: "POST",
        body: JSON.stringify(lmForm),
      });
      const json = await res.json();
      if (!res.ok) { Alert.alert("خطأ", json.error); return; }
      setLandmarks(prev => [...prev, json]);
      setLmForm({ name: "", sub: "", image_url: "" });
      setShowAddLM(false);
    } catch {
      Alert.alert("خطأ", "تعذّر إضافة المعلم");
    } finally { setAddingLM(false); }
  };

  const deleteLandmark = (lm: ApiLandmark) => {
    Alert.alert(
      "حذف معلم",
      `هل تريد حذف "${lm.name}"؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف", style: "destructive",
          onPress: async () => {
            try {
              await apiFetch(`/api/admin/landmarks/${lm.id}`, token, { method: "DELETE" });
              setLandmarks(prev => prev.filter(x => x.id !== lm.id));
            } catch {
              Alert.alert("خطأ", "تعذّر الحذف");
            }
          },
        },
      ]
    );
  };

  const loadAds = useCallback(async () => {
    setLoadingAds(true);
    try {
      const res = await apiFetch("/api/admin/ads", token);
      if (res.ok) setAdsList(await res.json());
    } catch {}
    finally { setLoadingAds(false); }
  }, [token]);

  const updateAdStatus = async (
    ad: AdRecord,
    status: "active" | "rejected" | "expired",
    days?: string,
    note?: string,
  ) => {
    setApprovingId(ad.id);
    try {
      const res = await apiFetch(`/api/admin/ads/${ad.id}/status`, token, {
        method: "PUT",
        body: JSON.stringify({
          status,
          duration_days: parseInt(days || "7"),
          admin_note: note?.trim() || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAdsList(prev => prev.map(a => a.id === ad.id ? updated : a));
        setAdDetailModal(null);
        setApprovalDays("7");
        setAdminNote("");
      } else {
        const err = await res.json();
        Alert.alert("خطأ", err.error);
      }
    } catch {
      Alert.alert("خطأ", "تعذّر تحديث الإعلان");
    } finally { setApprovingId(null); }
  };

  // ── Neighborhoods CRUD ────────────────────────────────────────────
  const loadNeighborhoods = useCallback(async () => {
    setLoadingNbr(true);
    try {
      const res = await apiFetch("/api/admin/neighborhoods", token);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setNeighborhoods(data);
        } else {
          const { DEFAULT_HASAHISA_LOCATIONS } = await import("@/constants/neighborhoods");
          setNeighborhoods(DEFAULT_HASAHISA_LOCATIONS);
        }
      } else {
        const { DEFAULT_HASAHISA_LOCATIONS } = await import("@/constants/neighborhoods");
        setNeighborhoods(DEFAULT_HASAHISA_LOCATIONS);
      }
    } catch {
      const { DEFAULT_HASAHISA_LOCATIONS } = await import("@/constants/neighborhoods");
      setNeighborhoods(DEFAULT_HASAHISA_LOCATIONS);
    } finally { setLoadingNbr(false); }
  }, [token]);

  const saveNeighborhood = async () => {
    if (!nbrForm.label.trim()) { Alert.alert("تنبيه", "أدخل الاسم"); return; }
    setAddingNbr(true);
    try {
      if (editingNbr?.key) {
        const res = await apiFetch(`/api/admin/neighborhoods/${editingNbr.key}`, token, {
          method: "PUT", body: JSON.stringify(nbrForm),
        });
        if (res.ok) {
          const updated = await res.json();
          setNeighborhoods(prev => prev.map(n => n.key === editingNbr.key ? updated : n));
        }
      } else {
        const res = await apiFetch("/api/admin/neighborhoods", token, {
          method: "POST", body: JSON.stringify(nbrForm),
        });
        if (res.ok) {
          const added = await res.json();
          setNeighborhoods(prev => [...prev, added]);
        }
      }
      setNbrForm({ label: "", type: "neighborhood" });
      setEditingNbr(null);
      setShowAddNbr(false);
    } catch { Alert.alert("خطأ", "تعذّرت العملية"); }
    finally { setAddingNbr(false); }
  };

  const deleteNeighborhood = (item: NbrItem) => {
    Alert.alert("حذف", `حذف "${item.label}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
        onPress: async () => {
          if (!item.key) {
            setNeighborhoods(prev => prev.filter(n => n.label !== item.label));
            return;
          }
          try {
            await apiFetch(`/api/admin/neighborhoods/${item.key}`, token, { method: "DELETE" });
            setNeighborhoods(prev => prev.filter(n => n.key !== item.key));
          } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
        },
      },
    ]);
  };

  // ── AI Settings ────────────────────────────────────────────────────
  const loadAiSettings = useCallback(async () => {
    setLoadingAi(true);
    try {
      const res = await apiFetch("/api/admin/ai-settings", token);
      if (res.ok) {
        const data = await res.json();
        setAiSettings(data);
        setAiForm({
          ai_api_key: data.ai_api_key || "",
          ai_enabled: data.ai_enabled || "false",
          ai_system_prompt: data.ai_system_prompt || "",
        });
      }
    } catch {}
    finally { setLoadingAi(false); }
  }, [token]);

  const saveAiSettings = async () => {
    setSavingAi(true);
    try {
      const res = await apiFetch("/api/admin/ai-settings", token, {
        method: "PUT",
        body: JSON.stringify(aiForm),
      });
      if (res.ok) Alert.alert("تم", "تم حفظ إعدادات الذكاء الاصطناعي");
      else Alert.alert("خطأ", "فشل الحفظ");
    } catch { Alert.alert("خطأ", "تعذّر الحفظ"); }
    finally { setSavingAi(false); }
  };

  const deleteAd = (ad: AdRecord) => {
    Alert.alert("حذف إعلان", `حذف إعلان "${ad.institution_name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
        onPress: async () => {
          try {
            await apiFetch(`/api/admin/ads/${ad.id}`, token, { method: "DELETE" });
            setAdsList(prev => prev.filter(a => a.id !== ad.id));
            setAdDetailModal(null);
          } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
        },
      },
    ]);
  };

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    if (tab !== "overview" && tab !== "landmarks" && tab !== "ads" && tab !== "neighborhoods" && tab !== "ai_settings") loadUsers();
    if (tab === "landmarks") loadLandmarks();
    if (tab === "ads") loadAds();
    if (tab === "neighborhoods") loadNeighborhoods();
    if (tab === "ai_settings") loadAiSettings();
  }, [tab, loadUsers, loadLandmarks, loadAds, loadNeighborhoods, loadAiSettings]);

  const handleRoleChange = async (newRole: string) => {
    if (!roleModal) return;
    setRoleChanging(true);
    try {
      const res = await apiFetch(`/api/admin/users/${roleModal.id}/role`, token, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) { Alert.alert("خطأ", json.error); return; }
      setUsers(prev => prev.map(u => u.id === roleModal.id ? { ...u, role: newRole as any } : u));
      if (stats) {
        loadStats();
      }
      setRoleModal(null);
    } catch {
      Alert.alert("خطأ", "تعذّر تغيير الصفة");
    } finally { setRoleChanging(false); }
  };

  const filteredUsers = users.filter(u => {
    const matchSearch = !search || u.name.includes(search) || (u.neighborhood || "").includes(search);
    if (tab === "members")    return matchSearch && u.role === "user";
    if (tab === "admins")     return matchSearch && u.role === "admin";
    if (tab === "moderators") return matchSearch && u.role === "moderator";
    return matchSearch;
  });

  const pendingAdsCount = adsList.filter(a => a.status === "pending").length;

  const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; badge?: number }[] = [
    { key: "overview",   label: "نظرة عامة", icon: "grid-outline",          color: Colors.cyber   },
    { key: "members",    label: "الأعضاء",   icon: "people-outline",        color: Colors.primary },
    { key: "admins",     label: "المديرون",  icon: "shield",                color: "#E74C3C"      },
    { key: "moderators", label: "المشرفون",  icon: "shield-half",           color: "#F0A500"      },
    { key: "landmarks",  label: "المعالم",   icon: "location",              color: "#9B59B6"      },
    { key: "ads",           label: "إعلانات",  icon: "megaphone",             color: "#F0A500", badge: pendingAdsCount },
    { key: "neighborhoods", label: "الأحياء",  icon: "map-outline",           color: "#3498DB"      },
    { key: "ai_settings",   label: "الذكاء الاصطناعي", icon: "sparkles", color: Colors.cyber },
  ];

  const filteredAds = adsFilter === "all" ? adsList : adsList.filter(a => a.status === adsFilter);

  const AD_STATUS_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    pending:  { label: "قيد المراجعة",  color: "#F0A500", icon: "time-outline"         },
    active:   { label: "نشط",           color: Colors.primary, icon: "checkmark-circle" },
    rejected: { label: "مرفوض",         color: "#E74C3C", icon: "close-circle"         },
    expired:  { label: "منتهي",         color: Colors.textMuted, icon: "ban-outline"    },
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <BrandPattern variant="diagonal" opacity={0.025} />

      {/* ── Header ─────────────────────────────────────── */}
      <LinearGradient
        colors={["#0D1A12", "#0D1A12CC", "transparent"]}
        style={s.headerGrad}
      >
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
            <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={s.headerTitle}>لوحة الإدارة</Text>
            <View style={s.roleTag}>
              <Ionicons name={isAdmin ? "shield" : "shield-half"} size={12} color={isAdmin ? "#E74C3C" : "#F0A500"} />
              <Text style={[s.roleTagText, { color: isAdmin ? "#E74C3C" : "#F0A500" }]}>
                {isAdmin ? "مدير" : "مشرف"}
              </Text>
            </View>
          </View>
          <View style={[s.avatarCircle, { width: 40, height: 40 }]}>
            <Text style={[s.avatarLetter, { fontSize: 18 }]}>{user?.name?.charAt(0) ?? "؟"}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Tabs ─────────────────────────────────────────── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.tabsScroll} contentContainerStyle={s.tabsRow}
      >
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && { backgroundColor: t.color + "22", borderColor: t.color }]}
            onPress={() => setTab(t.key)}
          >
            <View style={{ position: "relative" }}>
              <Ionicons name={t.icon} size={14} color={tab === t.key ? t.color : Colors.textMuted} />
              {(t.badge ?? 0) > 0 && (
                <View style={s.tabBadge}>
                  <Text style={s.tabBadgeText}>{t.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[s.tabLabel, tab === t.key && { color: t.color, fontFamily: "Cairo_700Bold" }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Content ──────────────────────────────────────── */}
      {tab === "overview" ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {loadingStats ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
          ) : stats ? (
            <>
              <Animated.View entering={FadeIn.duration(500)} style={s.statsRow}>
                <StatCard icon="people"       label="إجمالي الأعضاء" value={stats.totals.total}      color={Colors.primary} />
                <StatCard icon="shield"       label="المديرون"       value={stats.totals.admins}     color="#E74C3C"        />
                <StatCard icon="shield-half"  label="المشرفون"       value={stats.totals.moderators} color="#F0A500"        />
                <StatCard icon="person"       label="الأعضاء"        value={stats.totals.members}    color={Colors.cyber}   />
              </Animated.View>

              {stats.byNeighborhood.length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>توزيع الأعضاء بالأحياء</Text>
                  {stats.byNeighborhood.map((n, i) => (
                    <Animated.View entering={FadeInDown.delay(i * 50).springify()} key={n.neighborhood} style={s.nbrRow}>
                      <Text style={s.nbrCount}>{n.count}</Text>
                      <View style={s.nbrBar}>
                        <View style={[s.nbrFill, {
                          width: `${Math.round((n.count / stats.totals.total) * 100)}%` as any,
                        }]} />
                      </View>
                      <Text style={s.nbrName}>{n.neighborhood}</Text>
                    </Animated.View>
                  ))}
                </View>
              )}

              <View style={s.section}>
                <Text style={s.sectionTitle}>أحدث المنضمين</Text>
                {stats.recentUsers.map((u, i) => (
                  <Animated.View entering={FadeInDown.delay(i * 40).springify()} key={u.id} style={s.recentRow}>
                    <View style={[s.avatarCircle, { width: 34, height: 34 }]}>
                      <Text style={[s.avatarLetter, { fontSize: 14 }]}>{u.name.charAt(0)}</Text>
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

      ) : tab === "landmarks" ? (
        /* ─── تبويب إدارة المعالم ─────────────────────── */
        <View style={{ flex: 1 }}>
          {/* زر إضافة */}
          <View style={s.lmHeader}>
            <Text style={s.lmHeaderTitle}>معالم المدينة ({landmarks.length})</Text>
            <TouchableOpacity
              style={[s.lmAddBtn, { backgroundColor: "#9B59B6" }]}
              onPress={() => setShowAddLM(true)}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={s.lmAddTxt}>إضافة معلم</Text>
            </TouchableOpacity>
          </View>

          {loadingLM ? (
            <ActivityIndicator color="#9B59B6" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={landmarks}
              keyExtractor={lm => String(lm.id)}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              ListEmptyComponent={
                <Text style={s.empty}>لا توجد معالم — أضف أول معلم للمدينة</Text>
              }
              renderItem={({ item }) => (
                <Animated.View entering={FadeInDown.springify().damping(16)} style={s.lmCard}>
                  {/* معاينة الصورة */}
                  {item.image_url.startsWith("http") ? (
                    <Image
                      source={{ uri: item.image_url }}
                      style={s.lmThumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[s.lmThumb, s.lmLocalThumb]}>
                      <Ionicons name="image-outline" size={24} color="#9B59B6" />
                      <Text style={s.lmLocalKey} numberOfLines={1}>{item.image_url}</Text>
                    </View>
                  )}
                  {/* المعلومات */}
                  <View style={{ flex: 1 }}>
                    <Text style={s.lmName}>{item.name}</Text>
                    {item.sub ? <Text style={s.lmSub}>{item.sub}</Text> : null}
                    <Text style={s.lmUrl} numberOfLines={1}>{item.image_url}</Text>
                  </View>
                  {/* زر حذف */}
                  <TouchableOpacity
                    onPress={() => deleteLandmark(item)}
                    style={s.lmDeleteBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                  </TouchableOpacity>
                </Animated.View>
              )}
            />
          )}

          {/* نافذة إضافة معلم */}
          <Modal visible={showAddLM} transparent animationType="slide" onRequestClose={() => setShowAddLM(false)}>
            <Pressable style={s.overlay} onPress={() => setShowAddLM(false)}>
              <Pressable style={s.lmModal} onPress={e => e.stopPropagation()}>
                <Text style={s.dialogTitle}>إضافة معلم جديد</Text>

                <Text style={s.lmFieldLabel}>اسم المعلم *</Text>
                <TextInput
                  style={s.lmInput}
                  placeholder="مثال: عجلة الهواء"
                  placeholderTextColor={Colors.textMuted}
                  value={lmForm.name}
                  onChangeText={v => setLmForm(f => ({ ...f, name: v }))}
                  textAlign="right"
                />

                <Text style={s.lmFieldLabel}>الوصف (اختياري)</Text>
                <TextInput
                  style={s.lmInput}
                  placeholder="مثال: كورنيش الحصاحيصا"
                  placeholderTextColor={Colors.textMuted}
                  value={lmForm.sub}
                  onChangeText={v => setLmForm(f => ({ ...f, sub: v }))}
                  textAlign="right"
                />

                <Text style={s.lmFieldLabel}>رابط الصورة *</Text>
                <TextInput
                  style={[s.lmInput, { height: 54 }]}
                  placeholder="https://... أو local:ferris-wheel"
                  placeholderTextColor={Colors.textMuted}
                  value={lmForm.image_url}
                  onChangeText={v => setLmForm(f => ({ ...f, image_url: v }))}
                  textAlign="right"
                  autoCapitalize="none"
                  keyboardType="url"
                />

                <Text style={s.lmHint}>للصور المحلية استخدم: local:ferris-wheel أو local:hasahisa-city</Text>

                <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 6 }}>
                  <TouchableOpacity
                    style={[s.lmAddBtn, { flex: 1, backgroundColor: "#9B59B6", justifyContent: "center" }]}
                    onPress={addLandmark}
                    disabled={addingLM}
                  >
                    {addingLM
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={[s.lmAddTxt, { fontSize: 14 }]}>إضافة</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.cancelBtn, { flex: 1 }]}
                    onPress={() => setShowAddLM(false)}
                  >
                    <Text style={s.cancelTxt}>إلغاء</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </View>

      ) : tab === "ads" ? (
        /* ─── تبويب إدارة الإعلانات ──────────────────── */
        <View style={{ flex: 1 }}>
          {/* Header + Reload */}
          <View style={s.lmHeader}>
            <Text style={s.lmHeaderTitle}>
              الإعلانات ({adsList.length})
              {pendingAdsCount > 0 ? ` · ${pendingAdsCount} معلق` : ""}
            </Text>
            <TouchableOpacity
              style={[s.lmAddBtn, { backgroundColor: "#F0A50020", borderWidth: 1, borderColor: "#F0A500" }]}
              onPress={loadAds}
            >
              <Ionicons name="refresh-outline" size={14} color="#F0A500" />
              <Text style={[s.lmAddTxt, { color: "#F0A500" }]}>تحديث</Text>
            </TouchableOpacity>
          </View>

          {/* Filter pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }} contentContainerStyle={{ flexDirection: "row-reverse", gap: 8, padding: 12 }}>
            {(["all", "pending", "active", "rejected", "expired"] as const).map(f => {
              const meta = f === "all"
                ? { label: "الكل", color: Colors.cyber }
                : { label: AD_STATUS_META[f]?.label, color: AD_STATUS_META[f]?.color };
              return (
                <TouchableOpacity
                  key={f}
                  style={[s.tabBtn, { paddingHorizontal: 12, paddingVertical: 6 },
                    adsFilter === f && { backgroundColor: meta.color + "22", borderColor: meta.color }]}
                  onPress={() => setAdsFilter(f)}
                >
                  <Text style={[s.tabLabel, adsFilter === f && { color: meta.color, fontFamily: "Cairo_700Bold" }]}>
                    {meta.label}
                    {f === "pending" && pendingAdsCount > 0 ? ` (${pendingAdsCount})` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {loadingAds ? (
            <ActivityIndicator color="#F0A500" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredAds}
              keyExtractor={a => String(a.id)}
              contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 10 }}
              ListEmptyComponent={
                <Text style={s.empty}>
                  {adsFilter === "pending" ? "لا توجد طلبات معلقة" : "لا توجد إعلانات"}
                </Text>
              }
              renderItem={({ item: ad }) => {
                const statusMeta = AD_STATUS_META[ad.status] ?? AD_STATUS_META.pending;
                const dateStr = new Date(ad.created_at).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
                return (
                  <Animated.View entering={FadeInDown.springify().damping(16)}>
                    <TouchableOpacity
                      style={[s.adCard, { borderRightWidth: 3, borderRightColor: statusMeta.color }]}
                      onPress={() => { setAdDetailModal(ad); setApprovalDays(String(ad.duration_days)); setAdminNote(ad.admin_note || ""); }}
                      activeOpacity={0.82}
                    >
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                        <View style={[s.adStatusDot, { backgroundColor: statusMeta.color + "20" }]}>
                          <Ionicons name={statusMeta.icon} size={16} color={statusMeta.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.adCardTitle}>{ad.institution_name}</Text>
                          <Text style={s.adCardSub} numberOfLines={1}>{ad.title}</Text>
                        </View>
                        <View style={[s.adStatusBadge, { backgroundColor: statusMeta.color + "18" }]}>
                          <Text style={[s.adStatusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 6 }}>
                        {ad.contact_phone ? (
                          <View style={s.adMeta}>
                            <Ionicons name="call-outline" size={11} color={Colors.textMuted} />
                            <Text style={s.adMetaText}>{ad.contact_phone}</Text>
                          </View>
                        ) : null}
                        <View style={s.adMeta}>
                          <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                          <Text style={s.adMetaText}>{dateStr}</Text>
                        </View>
                        {ad.budget ? (
                          <View style={s.adMeta}>
                            <Ionicons name="cash-outline" size={11} color={Colors.accent} />
                            <Text style={[s.adMetaText, { color: Colors.accent }]}>{ad.budget}</Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              }}
            />
          )}

          {/* Ad Detail / Approval Modal */}
          <Modal visible={!!adDetailModal} transparent animationType="slide" onRequestClose={() => setAdDetailModal(null)}>
            <Pressable style={s.overlay} onPress={() => setAdDetailModal(null)}>
              <Pressable style={[s.lmModal, { maxHeight: "90%" }]} onPress={e => e.stopPropagation()}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {adDetailModal && (() => {
                    const ad = adDetailModal;
                    const statusMeta = AD_STATUS_META[ad.status] ?? AD_STATUS_META.pending;
                    return (
                      <>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 14 }}>
                          <Text style={[s.dialogTitle, { flex: 1 }]}>{ad.institution_name}</Text>
                          <View style={[s.adStatusBadge, { backgroundColor: statusMeta.color + "20" }]}>
                            <Text style={[s.adStatusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                          </View>
                        </View>

                        {[
                          { label: "عنوان الإعلان", value: ad.title },
                          { label: "تفاصيل",         value: ad.description },
                          { label: "نوع الإعلان",    value: ad.type },
                          { label: "شخص التواصل",    value: ad.contact_name },
                          { label: "رقم التواصل",    value: ad.contact_phone },
                          { label: "الميزانية",      value: ad.budget },
                          { label: "مدة مطلوبة",     value: `${ad.duration_days} يوم` },
                          { label: "ملاحظة الإدارة", value: ad.admin_note },
                          { label: "تاريخ الطلب",    value: new Date(ad.created_at).toLocaleDateString("ar-SA") },
                        ].map(({ label, value }) => value ? (
                          <View key={label} style={s.adDetailRow}>
                            <Text style={s.adDetailLabel}>{label}</Text>
                            <Text style={s.adDetailValue}>{value}</Text>
                          </View>
                        ) : null)}

                        {ad.status === "pending" && (
                          <>
                            <View style={s.divider} />
                            <Text style={[s.lmFieldLabel, { marginTop: 8 }]}>مدة النشر (أيام)</Text>
                            <TextInput
                              style={s.lmInput}
                              value={approvalDays}
                              onChangeText={setApprovalDays}
                              keyboardType="numeric"
                              textAlign="right"
                            />
                            <Text style={[s.lmFieldLabel]}>ملاحظة للمؤسسة (اختياري)</Text>
                            <TextInput
                              style={[s.lmInput, { height: 70 }]}
                              value={adminNote}
                              onChangeText={setAdminNote}
                              multiline
                              textAlign="right"
                              placeholder="رسالة توضيحية..."
                              placeholderTextColor={Colors.textMuted}
                            />
                            <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 10 }}>
                              <TouchableOpacity
                                style={[s.lmAddBtn, { flex: 1, backgroundColor: Colors.primary, justifyContent: "center" }]}
                                onPress={() => updateAdStatus(ad, "active", approvalDays, adminNote)}
                                disabled={approvingId === ad.id}
                              >
                                {approvingId === ad.id
                                  ? <ActivityIndicator color="#fff" size="small" />
                                  : <Text style={s.lmAddTxt}>✓ قبول ونشر</Text>}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[s.lmAddBtn, { flex: 1, backgroundColor: "#E74C3C", justifyContent: "center" }]}
                                onPress={() => updateAdStatus(ad, "rejected", approvalDays, adminNote)}
                                disabled={approvingId === ad.id}
                              >
                                <Text style={s.lmAddTxt}>✗ رفض</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}

                        {ad.status === "active" && (
                          <View style={{ marginTop: 12, gap: 8 }}>
                            <View style={s.divider} />
                            <TouchableOpacity
                              style={[s.lmAddBtn, { backgroundColor: "#E67E22", justifyContent: "center" }]}
                              onPress={() => updateAdStatus(ad, "expired", approvalDays, adminNote)}
                              disabled={approvingId === ad.id}
                            >
                              <Text style={s.lmAddTxt}>إيقاف الإعلان</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {isAdmin && (
                          <TouchableOpacity
                            style={[s.cancelBtn, { marginTop: 8, backgroundColor: "#E74C3C18", borderWidth: 1, borderColor: "#E74C3C30" }]}
                            onPress={() => deleteAd(ad)}
                          >
                            <Text style={[s.cancelTxt, { color: "#E74C3C" }]}>حذف نهائي</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity style={[s.cancelBtn, { marginTop: 8 }]} onPress={() => setAdDetailModal(null)}>
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

      ) : tab === "neighborhoods" ? (
        /* ─── إدارة الأحياء ─────── */
        <View style={{ flex: 1 }}>
          {/* شريط العنوان */}
          <View style={[s.lmHeader, { justifyContent: "space-between" }]}>
            <Text style={s.lmHeaderTitle}>الأحياء والقرى ({neighborhoods.length})</Text>
            <TouchableOpacity
              style={[s.lmAddBtn, { backgroundColor: "#3498DB" }]}
              onPress={() => { setNbrForm({ label: "", type: "neighborhood" }); setEditingNbr(null); setShowAddNbr(true); }}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={s.lmAddTxt}>إضافة</Text>
            </TouchableOpacity>
          </View>

          {/* فلاتر */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            {(["all", "neighborhood", "village"] as const).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setNbrFilter(f)}
                style={[s.filterChip, nbrFilter === f && s.filterChipActive]}
              >
                <Text style={[s.filterChipText, nbrFilter === f && s.filterChipTextActive]}>
                  {f === "all" ? "الكل" : f === "neighborhood" ? "أحياء" : "قرى"}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingNbr ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={nbrFilter === "all" ? neighborhoods : neighborhoods.filter(n => n.type === nbrFilter)}
              keyExtractor={(_, i) => i.toString()}
              contentContainerStyle={{ padding: 16, gap: 8 }}
              renderItem={({ item }) => (
                <View style={[s.lmCard, { justifyContent: "space-between" }]}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, flex: 1 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: item.type === "neighborhood" ? "#3498DB22" : "#9B59B622", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={item.type === "neighborhood" ? "home" : "leaf"} size={18} color={item.type === "neighborhood" ? "#3498DB" : "#9B59B6"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lmName}>{item.label}</Text>
                      <Text style={[s.lmSub, { color: item.type === "neighborhood" ? "#3498DB" : "#9B59B6" }]}>
                        {item.type === "neighborhood" ? "حي" : "قرية"}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={[s.lmDeleteBtn, { backgroundColor: "#3498DB18", borderColor: "#3498DB30" }]}
                      onPress={() => { setEditingNbr(item); setNbrForm({ label: item.label, type: item.type }); setShowAddNbr(true); }}
                    >
                      <Ionicons name="pencil-outline" size={16} color="#3498DB" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.lmDeleteBtn} onPress={() => deleteNeighborhood(item)}>
                      <Ionicons name="trash-outline" size={16} color="#E74C3C" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}

          {/* Modal إضافة/تعديل */}
          <Modal visible={showAddNbr} transparent animationType="fade" onRequestClose={() => setShowAddNbr(false)}>
            <Pressable style={s.modalOverlay} onPress={() => setShowAddNbr(false)}>
              <Pressable style={s.lmModal}>
                <Text style={[s.sectionTitle, { textAlign: "center" }]}>
                  {editingNbr ? "تعديل الحي/القرية" : "إضافة حي أو قرية"}
                </Text>
                <Text style={s.lmFieldLabel}>الاسم</Text>
                <TextInput
                  style={s.lmInput} value={nbrForm.label} onChangeText={t => setNbrForm(p => ({ ...p, label: t }))}
                  placeholder="اسم الحي أو القرية" placeholderTextColor={Colors.textMuted}
                  textAlign="right"
                />
                <Text style={s.lmFieldLabel}>النوع</Text>
                <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 4 }}>
                  {(["neighborhood", "village"] as const).map(t => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setNbrForm(p => ({ ...p, type: t }))}
                      style={[s.filterChip, nbrForm.type === t && s.filterChipActive, { flex: 1, justifyContent: "center" }]}
                    >
                      <Text style={[s.filterChipText, nbrForm.type === t && s.filterChipTextActive]}>
                        {t === "neighborhood" ? "حي" : "قرية"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[s.lmAddBtn, { backgroundColor: "#3498DB", justifyContent: "center", marginTop: 12, height: 46 }]}
                  onPress={saveNeighborhood}
                  disabled={addingNbr}
                >
                  {addingNbr ? <ActivityIndicator color="#fff" /> : <Text style={s.lmAddTxt}>{editingNbr ? "حفظ التعديل" : "إضافة"}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAddNbr(false)}>
                  <Text style={s.cancelTxt}>إلغاء</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        </View>

      ) : tab === "ai_settings" ? (
        /* ─── إعدادات الذكاء الاصطناعي ─────── */
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <View style={[s.overviewCard, { gap: 14 }]}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.cyber + "22", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="sparkles" size={20} color={Colors.cyber} />
              </View>
              <Text style={s.sectionTitle}>إعدادات الذكاء الاصطناعي (Gemini)</Text>
            </View>

            {loadingAi ? <ActivityIndicator color={Colors.primary} /> : (
              <>
                {/* تفعيل/تعطيل */}
                <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.bg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.divider }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary }}>تفعيل المساعد الذكي</Text>
                  <TouchableOpacity
                    onPress={() => setAiForm(p => ({ ...p, ai_enabled: p.ai_enabled === "true" ? "false" : "true" }))}
                    style={{ width: 50, height: 28, borderRadius: 14, backgroundColor: aiForm.ai_enabled === "true" ? Colors.primary : Colors.divider, justifyContent: "center", alignItems: aiForm.ai_enabled === "true" ? "flex-end" : "flex-start", paddingHorizontal: 3 }}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" }} />
                  </TouchableOpacity>
                </View>

                {/* Gemini API Key */}
                <View style={{ gap: 6 }}>
                  <Text style={s.lmFieldLabel}>مفتاح Gemini API</Text>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <TextInput
                      style={[s.lmInput, { flex: 1 }]}
                      value={aiForm.ai_api_key}
                      onChangeText={t => setAiForm(p => ({ ...p, ai_api_key: t }))}
                      placeholder="AIza..."
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!showApiKey}
                      textAlign="right"
                    />
                    <TouchableOpacity onPress={() => setShowApiKey(p => !p)} style={{ padding: 10 }}>
                      <Ionicons name={showApiKey ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={s.lmHint}>الحصول على المفتاح: aistudio.google.com → Get API Key (مجاني)</Text>
                </View>

                {/* System Prompt */}
                <View style={{ gap: 6 }}>
                  <Text style={s.lmFieldLabel}>رسالة النظام (System Prompt)</Text>
                  <TextInput
                    style={[s.lmInput, { height: 100, textAlignVertical: "top", paddingTop: 10 }]}
                    value={aiForm.ai_system_prompt}
                    onChangeText={t => setAiForm(p => ({ ...p, ai_system_prompt: t }))}
                    placeholder="أنت مساعد ذكي لخدمة أهل مدينة الحصاحيصا..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={4}
                    textAlign="right"
                  />
                </View>

                <TouchableOpacity
                  style={[s.lmAddBtn, { backgroundColor: Colors.primary, justifyContent: "center", height: 48, borderRadius: 14 }]}
                  onPress={saveAiSettings}
                  disabled={savingAi}
                >
                  {savingAi ? <ActivityIndicator color="#000" /> : (
                    <>
                      <Ionicons name="save-outline" size={18} color="#000" />
                      <Text style={[s.lmAddTxt, { color: "#000" }]}>حفظ الإعدادات</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>

      ) : (
        /* ─── تبويبات الأعضاء/المديرين/المشرفين ─────── */
        <View style={{ flex: 1 }}>
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="ابحث باسم أو حي..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {loadingUsers ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={u => String(u.id)}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              ListEmptyComponent={<Text style={s.empty}>لا يوجد مستخدمون في هذه الفئة</Text>}
              renderItem={({ item }) => (
                <UserCard user={item} isAdmin={isAdmin} onRoleChange={setRoleModal} />
              )}
            />
          )}
        </View>
      )}

      {/* ── Role Change Modal ─────────────────────────── */}
      <Modal visible={!!roleModal} transparent animationType="fade" onRequestClose={() => setRoleModal(null)}>
        <Pressable style={s.overlay} onPress={() => setRoleModal(null)}>
          <Pressable style={s.roleDialog} onPress={e => e.stopPropagation()}>
            <Text style={s.dialogTitle}>تغيير صفة: {roleModal?.name}</Text>
            <Text style={s.dialogSub}>الصفة الحالية: {ROLE_LABELS[roleModal?.role ?? "user"]?.label}</Text>

            {(["user", "moderator", "admin"] as const).map(r => {
              const meta = ROLE_LABELS[r];
              const isCurrent = roleModal?.role === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[s.roleOption, isCurrent && { backgroundColor: meta.color + "22" }]}
                  onPress={() => !isCurrent && handleRoleChange(r)}
                  disabled={roleChanging || isCurrent}
                >
                  <Ionicons name={meta.icon} size={20} color={meta.color} />
                  <Text style={[s.roleOptionText, { color: meta.color }]}>{meta.label}</Text>
                  {isCurrent && <Ionicons name="checkmark-circle" size={18} color={meta.color} />}
                </TouchableOpacity>
              );
            })}

            {roleChanging && <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />}

            <TouchableOpacity style={s.cancelBtn} onPress={() => setRoleModal(null)}>
              <Text style={s.cancelTxt}>إلغاء</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  headerGrad: { paddingBottom: 8 },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  backBtn: { padding: 6, borderRadius: 10, backgroundColor: Colors.cardBg },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  roleTag: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 2 },
  roleTagText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  tabsScroll: { flexGrow: 0 },
  tabsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tabBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.divider,
    backgroundColor: Colors.cardBg,
  },
  tabLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  statsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, minWidth: "44%", backgroundColor: Colors.cardBg,
    borderRadius: 16, padding: 14, alignItems: "center", gap: 4,
    borderWidth: 1,
  },
  statIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 26, color: Colors.textPrimary },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", marginBottom: 12 },
  nbrRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 10 },
  nbrName: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, width: 110, textAlign: "right" },
  nbrBar: { flex: 1, height: 8, backgroundColor: Colors.divider, borderRadius: 4, overflow: "hidden" },
  nbrFill: { height: "100%", backgroundColor: Colors.primary, borderRadius: 4 },
  nbrCount: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary, width: 24, textAlign: "right" },
  recentRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 10 },
  recentName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  recentSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + "30", alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.primary },
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  searchWrap: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: Colors.cardBg, margin: 16, marginBottom: 0,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.divider,
  },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  userCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.divider,
  },
  userCardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 10 },
  userName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  userContact: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  userDetailsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  detailChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: Colors.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  detailText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  changeRoleBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6, alignSelf: "flex-end",
    backgroundColor: Colors.primary + "15", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
  },
  changeRoleTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primary },
  empty: { fontFamily: "Cairo_500Medium", fontSize: 15, color: Colors.textMuted, textAlign: "center", marginTop: 60 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 24 },
  roleDialog: {
    backgroundColor: Colors.cardBg, borderRadius: 20, padding: 20, width: "100%", maxWidth: 360,
    gap: 10,
  },
  dialogTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  dialogSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 4 },
  roleOption: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    backgroundColor: Colors.bg, borderRadius: 14, padding: 14,
  },
  roleOptionText: { fontFamily: "Cairo_700Bold", fontSize: 15, flex: 1, textAlign: "right" },
  cancelBtn: { backgroundColor: Colors.divider, borderRadius: 14, padding: 12, alignItems: "center", marginTop: 4 },
  cancelTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary },

  /* ── Landmarks management ── */
  lmHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: Colors.divider,
  },
  lmHeaderTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  lmAddBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
  },
  lmAddTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  lmCard: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  lmThumb: {
    width: 68, height: 52, borderRadius: 10, overflow: "hidden",
  },
  lmLocalThumb: {
    backgroundColor: "#9B59B620", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#9B59B640",
  },
  lmLocalKey: {
    fontFamily: "Cairo_400Regular", fontSize: 8, color: "#9B59B6",
    marginTop: 2, textAlign: "center", paddingHorizontal: 2,
  },
  lmName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  lmSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 2 },
  lmUrl: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "right", marginTop: 4 },
  lmDeleteBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#E74C3C18", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#E74C3C30",
  },
  lmModal: {
    backgroundColor: Colors.cardBg, borderRadius: 20, padding: 20, width: "100%", maxWidth: 380,
    gap: 6,
  },
  lmFieldLabel: {
    fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary,
    textAlign: "right", marginTop: 6,
  },
  lmInput: {
    backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 14, paddingVertical: 10, height: 46,
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textPrimary,
  },
  lmHint: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted,
    textAlign: "right", lineHeight: 16,
  },

  /* ── Ads management ── */
  tabBadge: {
    position: "absolute", top: -4, right: -6,
    backgroundColor: "#E74C3C", borderRadius: 6,
    minWidth: 12, height: 12, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 2,
  },
  tabBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 8, color: "#fff" },
  adCard: {
    backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  adStatusDot: {
    width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  adCardTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  adCardSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  adStatusBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start",
  },
  adStatusText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  adMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  adMetaText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  adDetailRow: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  adDetailLabel: {
    fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted,
    width: 90, textAlign: "right", flexShrink: 0,
  },
  adDetailValue: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: 12 },

  /* ── Neighborhoods ── */
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.divider, marginRight: 8,
    backgroundColor: Colors.cardBg,
  },
  filterChipActive: {
    backgroundColor: Colors.primary + "22", borderColor: Colors.primary,
  },
  filterChipText: {
    fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary,
  },
  filterChipTextActive: { color: Colors.primary },
  modalOverlay: {
    flex: 1, backgroundColor: "#00000099",
    justifyContent: "center", alignItems: "center", padding: 20,
  },

  /* ── AI Settings ── */
  overviewCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.divider,
  },
});
