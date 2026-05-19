import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

const UC  = "#6366F1";
const UC2 = "#A5B4FC";

type Application = {
  id: number;
  full_name: string;
  national_id: string;
  phone: string;
  email?: string;
  institution: string;
  major: string;
  year: string;
  neighborhood?: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type Stats = { total: number; pending: number; approved: number; rejected: number };

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "#F59E0B",
  approved: "#22C55E",
  rejected: "#EF4444",
};

export default function StudentUnionAdminScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [updating, setUpdating] = useState<number | null>(null);

  const apiHeaders = () => ({
    "Content-Type": "application/json",
    ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/student-union/applications`, {
        headers: apiHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const list: Application[] = data.applications ?? data ?? [];
        setApps(list);
        setStats({
          total: list.length,
          pending: list.filter(a => a.status === "pending").length,
          approved: list.filter(a => a.status === "approved").length,
          rejected: list.filter(a => a.status === "rejected").length,
        });
      }
    } catch {
      // نتجاهل أخطاء الشبكة عند الاستدعاء الأول
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const updateStatus = async (id: number, status: "approved" | "rejected") => {
    setUpdating(id);
    try {
      const res = await fetch(`${getApiUrl()}/api/student-union/applications/${id}/status`, {
        method: "PATCH",
        headers: apiHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
        setStats(prev => {
          const old = apps.find(a => a.id === id)?.status ?? "pending";
          return {
            ...prev,
            [old]: Math.max(0, prev[old as keyof Stats] as number - 1),
            [status]: (prev[status as keyof Stats] as number) + 1,
          } as Stats;
        });
      } else {
        throw new Error("فشل تحديث الحالة");
      }
    } catch (e: any) {
      Alert.alert("خطأ", e.message || "تعذر تحديث الحالة");
    } finally {
      setUpdating(null);
    }
  };

  const confirmUpdate = (id: number, status: "approved" | "rejected", name: string) => {
    Alert.alert(
      status === "approved" ? "قبول الطلب" : "رفض الطلب",
      `هل تريد ${status === "approved" ? "قبول" : "رفض"} طلب ${name}؟`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "تأكيد", style: status === "rejected" ? "destructive" : "default",
          onPress: () => updateStatus(id, status) },
      ]
    );
  };

  const filtered = filter === "all" ? apps : apps.filter(a => a.status === filter);

  if (!isAdmin) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} />
        <Text style={s.emptyTitle}>غير مصرح</Text>
        <Text style={s.emptySub}>هذه الصفحة للمشرفين فقط</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.backLink}>
          <Text style={s.backLinkText}>العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* الهيدر */}
      <LinearGradient
        colors={["#0B1224", "#172554"]}
        style={[s.header, { paddingTop: insets.top + 12 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={UC2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>لوحة إدارة اتحاد الطلاب</Text>
          <Text style={s.headerSub}>محلية الحصاحيصا</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={s.backBtn} hitSlop={12}>
          <Ionicons name="refresh-outline" size={20} color={UC2} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UC} />}
        showsVerticalScrollIndicator={false}
      >
        {/* إحصائيات */}
        <Animated.View entering={FadeInDown.springify()} style={s.statsRow}>
          {([
            ["الكل",         stats.total,    "#6366F1"],
            ["قيد المراجعة", stats.pending,  "#F59E0B"],
            ["مقبول",        stats.approved, "#22C55E"],
            ["مرفوض",        stats.rejected, "#EF4444"],
          ] as const).map(([label, count, color]) => (
            <View key={label} style={[s.statCard, { borderColor: color + "30" }]}>
              <Text style={[s.statNum, { color }]}>{count}</Text>
              <Text style={s.statLabel}>{label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* فلاتر */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {(["all", "pending", "approved", "rejected"] as const).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[s.filterChip, filter === f && s.filterChipActive]}
            >
              <Text style={[s.filterChipText, filter === f && s.filterChipTextActive]}>
                {f === "all" ? "الكل" : STATUS_LABEL[f]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* القائمة */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={UC} size="large" />
          </View>
        ) : filtered.length === 0 ? (
          <Animated.View entering={FadeInDown.springify()} style={s.emptyBox}>
            <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>لا توجد طلبات</Text>
            <Text style={s.emptySub}>لم يتم تقديم أي طلبات بعد في هذه الفئة</Text>
          </Animated.View>
        ) : (
          <View style={{ padding: 16, gap: 12 }}>
            {filtered.map((app, i) => (
              <Animated.View key={app.id} entering={FadeInDown.delay(i * 30).springify()} style={s.appCard}>
                {/* الرأس */}
                <View style={s.appCardHeader}>
                  <View style={s.appAvatar}>
                    <Text style={s.appAvatarText}>{app.full_name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.appName}>{app.full_name}</Text>
                    <Text style={s.appInstitution}>{app.institution} — {app.year}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[app.status] + "20" }]}>
                    <Text style={[s.statusText, { color: STATUS_COLOR[app.status] }]}>
                      {STATUS_LABEL[app.status]}
                    </Text>
                  </View>
                </View>

                {/* التفاصيل */}
                <View style={s.appDetails}>
                  {[
                    ["الرقم الوطني", app.national_id],
                    ["الهاتف",       app.phone],
                    ["التخصص",       app.major],
                    ...(app.neighborhood ? [["الحي", app.neighborhood] as [string, string]] : []),
                  ].map(([label, val]) => (
                    <View key={label} style={s.detailRow}>
                      <Text style={s.detailVal}>{val}</Text>
                      <Text style={s.detailLabel}>{label}:</Text>
                    </View>
                  ))}
                </View>

                {/* أزرار الإجراء */}
                {app.status === "pending" && (
                  <View style={s.appActions}>
                    <TouchableOpacity
                      style={[s.actionBtn, s.rejectBtn]}
                      onPress={() => confirmUpdate(app.id, "rejected", app.full_name)}
                      disabled={updating === app.id}
                    >
                      {updating === app.id
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <><Ionicons name="close-outline" size={16} color="#fff" /><Text style={s.actionBtnText}>رفض</Text></>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, s.approveBtn]}
                      onPress={() => confirmUpdate(app.id, "approved", app.full_name)}
                      disabled={updating === app.id}
                    >
                      {updating === app.id
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <><Ionicons name="checkmark-outline" size={16} color="#fff" /><Text style={s.actionBtnText}>قبول</Text></>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF10",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#fff",
    textAlign: "center",
  },
  headerSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: UC2,
    textAlign: "center",
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row-reverse",
    gap: 10,
    padding: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  statNum: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
  },
  statLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "center",
  },
  filterRow: {
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: UC,
    borderColor: UC,
  },
  filterChipText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyBox: {
    alignItems: "center",
    padding: 40,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  emptySub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
  },
  backLink: { marginTop: 16 },
  backLinkText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: UC2,
    textDecorationLine: "underline",
  },
  appCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: "hidden",
  },
  appCardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  appAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: UC + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  appAvatarText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: UC2,
  },
  appName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: Colors.text,
    textAlign: "right",
  },
  appInstitution: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "right",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  appDetails: {
    padding: 14,
    gap: 6,
  },
  detailRow: {
    flexDirection: "row-reverse",
    gap: 6,
    alignItems: "center",
  },
  detailLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
  },
  detailVal: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
    textAlign: "right",
  },
  appActions: {
    flexDirection: "row-reverse",
    gap: 10,
    padding: 14,
    paddingTop: 0,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  approveBtn: { backgroundColor: "#22C55E" },
  rejectBtn:  { backgroundColor: "#EF4444" },
  actionBtnText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#fff",
  },
});
