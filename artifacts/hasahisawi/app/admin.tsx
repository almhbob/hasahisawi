import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, ActivityIndicator, Alert,
  TextInput, Pressable, Modal,
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

type Tab = "overview" | "members" | "admins" | "moderators";

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

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    if (tab !== "overview") loadUsers();
  }, [tab, loadUsers]);

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

  const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { key: "overview",   label: "نظرة عامة", icon: "grid-outline",          color: Colors.cyber   },
    { key: "members",    label: "الأعضاء",   icon: "people-outline",        color: Colors.primary },
    { key: "admins",     label: "المديرون",  icon: "shield",                color: "#E74C3C"      },
    { key: "moderators", label: "المشرفون",  icon: "shield-half",           color: "#F0A500"      },
  ];

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
            <Ionicons name={t.icon} size={14} color={tab === t.key ? t.color : Colors.textMuted} />
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
              {/* Stats cards */}
              <Animated.View entering={FadeIn.duration(500)} style={s.statsRow}>
                <StatCard icon="people"       label="إجمالي الأعضاء" value={stats.totals.total}      color={Colors.primary} />
                <StatCard icon="shield"       label="المديرون"       value={stats.totals.admins}     color="#E74C3C"        />
                <StatCard icon="shield-half"  label="المشرفون"       value={stats.totals.moderators} color="#F0A500"        />
                <StatCard icon="person"       label="الأعضاء"        value={stats.totals.members}    color={Colors.cyber}   />
              </Animated.View>

              {/* By neighborhood */}
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

              {/* Recent users */}
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
      ) : (
        <View style={{ flex: 1 }}>
          {/* Search */}
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
});
