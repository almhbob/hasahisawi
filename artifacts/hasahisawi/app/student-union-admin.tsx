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
  gender?: string;
  birth_date?: string;
  address?: string;
  institution: string;
  study_stage?: string;
  major: string;
  year: string;
  skills?: string;
  previous_experience?: boolean;
  committees?: string;
  motivation?: string;
  contribution?: string;
  can_attend_meetings?: boolean;
  weekly_hours?: string;
  pledge_name?: string;
  status: "pending" | "approved" | "rejected";
  admin_note?: string;
  created_at: string;
};

type Partnership = {
  id: number;
  union_name: string;
  union_type?: string;
  contact_person: string;
  phone: string;
  email?: string;
  description?: string;
  membership_count?: number;
  requested_tier?: string;
  annual_fee?: number;
  status: "pending" | "approved" | "rejected";
  admin_note?: string;
  created_at: string;
};

type Stats = { total: number; pending: number; approved: number; rejected: number };

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "#F59E0B", approved: "#22C55E", rejected: "#EF4444",
};
const TIER_LABEL: Record<string, string> = {
  basic: "أساسي", premium: "متقدم", enterprise: "مؤسسي",
};

export default function StudentUnionAdminScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();

  const [tab, setTab] = useState<"members" | "partners">("members");

  // طلبات العضوية
  const [apps, setApps]       = useState<Application[]>([]);
  const [stats, setStats]     = useState<Stats>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [filter, setFilter]   = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  // طلبات الشراكة
  const [partners, setPartners]       = useState<Partnership[]>([]);
  const [pLoading, setPLoading]       = useState(false);
  const [pUpdating, setPUpdating]     = useState<number | null>(null);
  const [pExpanded, setPExpanded]     = useState<number | null>(null);

  const headers = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const loadApps = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/student-union/applications`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        const list: Application[] = data.applications ?? [];
        setApps(list);
        setStats({
          total: list.length,
          pending:  list.filter(a => a.status === "pending").length,
          approved: list.filter(a => a.status === "approved").length,
          rejected: list.filter(a => a.status === "rejected").length,
        });
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  const loadPartners = useCallback(async () => {
    setPLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/union-partnership`, { headers: headers() });
      if (res.ok) { const d = await res.json(); setPartners(d.applications ?? []); }
    } catch {} finally { setPLoading(false); }
  }, [token]);

  useEffect(() => { loadApps(); }, [loadApps]);
  useEffect(() => { if (tab === "partners") loadPartners(); }, [tab, loadPartners]);

  const onRefresh = () => {
    setRefreshing(true);
    loadApps();
    if (tab === "partners") loadPartners();
  };

  const updateAppStatus = async (id: number, status: "approved" | "rejected") => {
    setUpdating(id);
    try {
      const res = await fetch(`${getApiUrl()}/api/student-union/applications/${id}/status`, {
        method: "PATCH", headers: headers(), body: JSON.stringify({ status }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
        setStats(prev => {
          const old = apps.find(a => a.id === id)?.status ?? "pending";
          return {
            ...prev,
            [old]: Math.max(0, (prev[old as keyof Stats] as number) - 1),
            [status]: (prev[status as keyof Stats] as number) + 1,
          } as Stats;
        });
      } else throw new Error("فشل تحديث الحالة");
    } catch (e: any) { Alert.alert("خطأ", e.message); } finally { setUpdating(null); }
  };

  const updatePartner = async (id: number, status: "approved" | "rejected", annual_fee?: number) => {
    setPUpdating(id);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/union-partnership/${id}`, {
        method: "PATCH", headers: headers(),
        body: JSON.stringify({ status, annual_fee: annual_fee ?? undefined }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPartners(prev => prev.map(p => p.id === id ? { ...p, status } : p));
      } else throw new Error("فشل تحديث الحالة");
    } catch (e: any) { Alert.alert("خطأ", e.message); } finally { setPUpdating(null); }
  };

  const confirmUpdate = (id: number, status: "approved" | "rejected", name: string, isPartner = false) => {
    Alert.alert(
      status === "approved" ? "قبول الطلب" : "رفض الطلب",
      `هل تريد ${status === "approved" ? "قبول" : "رفض"} طلب ${name}؟`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "تأكيد", style: status === "rejected" ? "destructive" : "default",
          onPress: () => isPartner ? updatePartner(id, status) : updateAppStatus(id, status) },
      ]
    );
  };

  const safeParseArr = (s?: string): string[] => {
    if (!s) return [];
    try { return JSON.parse(s); } catch { return [s]; }
  };

  if (user?.role !== "admin") {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} />
        <Text style={s.emptyTitle}>غير مصرح</Text>
        <Text style={s.emptySub}>هذه الصفحة للمشرفين فقط</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: UC2, textDecorationLine: "underline" }}>العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const filtered = filter === "all" ? apps : apps.filter(a => a.status === filter);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* الهيدر */}
      <LinearGradient colors={["#0B1224", "#172554"]} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={UC2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>لوحة إدارة اتحاد الطلاب</Text>
          <Text style={s.headerSub}>محلية الحصاحيصا</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={s.iconBtn} hitSlop={12}>
          <Ionicons name="refresh-outline" size={20} color={UC2} />
        </TouchableOpacity>
      </LinearGradient>

      {/* تبويبات الصفحات */}
      <View style={s.tabRow}>
        {([
          ["members",  "العضويات",   "school-outline"],
          ["partners", "الشراكات",   "briefcase-outline"],
        ] as const).map(([key, label, icon]) => (
          <TouchableOpacity key={key} onPress={() => setTab(key)}
            style={[s.tabBtn, tab === key && s.tabBtnActive]}>
            <Ionicons name={icon} size={16} color={tab === key ? "#fff" : Colors.textMuted} />
            <Text style={[s.tabText, tab === key && s.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* محتوى العضويات */}
      {tab === "members" && (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UC} />}
          showsVerticalScrollIndicator={false}
        >
          {/* إحصائيات */}
          <Animated.View entering={FadeInDown.springify()} style={s.statsRow}>
            {([
              ["الكل", stats.total, "#6366F1"],
              ["قيد المراجعة", stats.pending, "#F59E0B"],
              ["مقبول", stats.approved, "#22C55E"],
              ["مرفوض", stats.rejected, "#EF4444"],
            ] as const).map(([label, count, color]) => (
              <View key={label} style={[s.statCard, { borderColor: color + "30" }]}>
                <Text style={[s.statNum, { color }]}>{count}</Text>
                <Text style={s.statLabel}>{label}</Text>
              </View>
            ))}
          </Animated.View>

          {/* فلاتر */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {(["all", "pending", "approved", "rejected"] as const).map(f => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)}
                style={[s.filterChip, filter === f && s.filterChipActive]}>
                <Text style={[s.filterChipText, filter === f && s.filterChipTextActive]}>
                  {f === "all" ? "الكل" : STATUS_LABEL[f]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* القائمة */}
          {loading ? (
            <View style={s.center}><ActivityIndicator color={UC} size="large" /></View>
          ) : filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>لا توجد طلبات</Text>
              <Text style={s.emptySub}>لم يتم تقديم أي طلبات في هذه الفئة</Text>
            </View>
          ) : (
            <View style={{ padding: 16, gap: 12 }}>
              {filtered.map((app, i) => {
                const isExpanded = expanded === app.id;
                const skillsList = safeParseArr(app.skills);
                const commList   = safeParseArr(app.committees);
                return (
                  <Animated.View key={app.id} entering={FadeInDown.delay(i * 25).springify()} style={s.card}>
                    {/* رأس البطاقة */}
                    <TouchableOpacity
                      onPress={() => setExpanded(isExpanded ? null : app.id)}
                      style={s.cardHeader} activeOpacity={0.8}
                    >
                      <View style={s.avatar}>
                        <Text style={s.avatarText}>{app.full_name[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.appName}>{app.full_name}</Text>
                        <Text style={s.appSub}>{app.institution} {app.study_stage ? `— ${app.study_stage}` : ""}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 6 }}>
                        <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[app.status] + "20" }]}>
                          <Text style={[s.statusText, { color: STATUS_COLOR[app.status] }]}>
                            {STATUS_LABEL[app.status]}
                          </Text>
                        </View>
                        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
                      </View>
                    </TouchableOpacity>

                    {/* التفاصيل الموسّعة */}
                    {isExpanded && (
                      <View style={s.details}>
                        {[
                          ["الرقم الوطني", app.national_id],
                          ["الهاتف",       app.phone],
                          ["الجنس",        app.gender],
                          ["تاريخ الميلاد",app.birth_date],
                          ["التخصص",       app.major],
                          ["السنة/المستوى",app.year],
                          ["العنوان",       app.address],
                        ].filter(([, v]) => v).map(([l, v]) => (
                          <View key={l as string} style={s.detailRow}>
                            <Text style={s.detailVal}>{v as string}</Text>
                            <Text style={s.detailLabel}>{l as string}:</Text>
                          </View>
                        ))}

                        {skillsList.length > 0 && (
                          <View style={{ marginTop: 8 }}>
                            <Text style={[s.detailLabel, { textAlign: "right", marginBottom: 6 }]}>المهارات:</Text>
                            <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
                              {skillsList.map(sk => (
                                <View key={sk} style={s.tag}>
                                  <Text style={s.tagText}>{sk}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}

                        {commList.length > 0 && (
                          <View style={{ marginTop: 8 }}>
                            <Text style={[s.detailLabel, { textAlign: "right", marginBottom: 6 }]}>الأمانات المختارة:</Text>
                            <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
                              {commList.map(c => (
                                <View key={c} style={[s.tag, { backgroundColor: UC + "20", borderColor: UC + "40" }]}>
                                  <Text style={[s.tagText, { color: UC2 }]}>{c}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}

                        {app.motivation && (
                          <View style={{ marginTop: 8 }}>
                            <Text style={[s.detailLabel, { textAlign: "right", marginBottom: 4 }]}>الدوافع:</Text>
                            <Text style={[s.detailVal, { textAlign: "right" }]}>{app.motivation}</Text>
                          </View>
                        )}

                        {app.contribution && (
                          <View style={{ marginTop: 8 }}>
                            <Text style={[s.detailLabel, { textAlign: "right", marginBottom: 4 }]}>ما يمكنه تقديمه:</Text>
                            <Text style={[s.detailVal, { textAlign: "right" }]}>{app.contribution}</Text>
                          </View>
                        )}

                        {[
                          ["حضور الاجتماعات", app.can_attend_meetings != null ? (app.can_attend_meetings ? "نعم" : "لا") : null],
                          ["الساعات الأسبوعية", app.weekly_hours],
                          ["خبرة سابقة", app.previous_experience != null ? (app.previous_experience ? "نعم" : "لا") : null],
                        ].filter(([, v]) => v).map(([l, v]) => (
                          <View key={l as string} style={s.detailRow}>
                            <Text style={s.detailVal}>{v as string}</Text>
                            <Text style={s.detailLabel}>{l as string}:</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* أزرار الإجراء */}
                    {app.status === "pending" && (
                      <View style={s.actions}>
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: "#EF4444" }]}
                          onPress={() => confirmUpdate(app.id, "rejected", app.full_name)}
                          disabled={updating === app.id}
                        >
                          {updating === app.id
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <><Ionicons name="close-outline" size={16} color="#fff" /><Text style={s.actionText}>رفض</Text></>
                          }
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: "#22C55E" }]}
                          onPress={() => confirmUpdate(app.id, "approved", app.full_name)}
                          disabled={updating === app.id}
                        >
                          {updating === app.id
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <><Ionicons name="checkmark-outline" size={16} color="#fff" /><Text style={s.actionText}>قبول</Text></>
                          }
                        </TouchableOpacity>
                      </View>
                    )}
                  </Animated.View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* محتوى الشراكات */}
      {tab === "partners" && (
        <ScrollView showsVerticalScrollIndicator={false}>
          {pLoading ? (
            <View style={s.center}><ActivityIndicator color={UC} size="large" /></View>
          ) : partners.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="briefcase-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>لا توجد طلبات شراكة</Text>
              <Text style={s.emptySub}>لم تُقدَّم أي طلبات شراكة حتى الآن</Text>
            </View>
          ) : (
            <View style={{ padding: 16, gap: 12 }}>
              {partners.map((p, i) => {
                const isExp = pExpanded === p.id;
                return (
                  <Animated.View key={p.id} entering={FadeInDown.delay(i * 25).springify()} style={s.card}>
                    <TouchableOpacity onPress={() => setPExpanded(isExp ? null : p.id)}
                      style={s.cardHeader} activeOpacity={0.8}>
                      <View style={[s.avatar, { backgroundColor: "#F59E0B30" }]}>
                        <Text style={[s.avatarText, { color: "#F59E0B" }]}>{p.union_name[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.appName}>{p.union_name}</Text>
                        <Text style={s.appSub}>
                          {p.union_type || "منظمة"} {p.requested_tier ? `— ${TIER_LABEL[p.requested_tier] || p.requested_tier}` : ""}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 6 }}>
                        <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[p.status] + "20" }]}>
                          <Text style={[s.statusText, { color: STATUS_COLOR[p.status] }]}>{STATUS_LABEL[p.status]}</Text>
                        </View>
                        <Ionicons name={isExp ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
                      </View>
                    </TouchableOpacity>

                    {isExp && (
                      <View style={s.details}>
                        {[
                          ["المسؤول",       p.contact_person],
                          ["الهاتف",        p.phone],
                          ["البريد",        p.email],
                          ["عدد الأعضاء",   p.membership_count?.toString()],
                          ["الرسوم السنوية",p.annual_fee ? `${p.annual_fee} جنيه` : null],
                        ].filter(([, v]) => v).map(([l, v]) => (
                          <View key={l as string} style={s.detailRow}>
                            <Text style={s.detailVal}>{v as string}</Text>
                            <Text style={s.detailLabel}>{l as string}:</Text>
                          </View>
                        ))}
                        {p.description && (
                          <View style={{ marginTop: 8 }}>
                            <Text style={[s.detailLabel, { textAlign: "right", marginBottom: 4 }]}>الوصف:</Text>
                            <Text style={[s.detailVal, { textAlign: "right" }]}>{p.description}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {p.status === "pending" && (
                      <View style={s.actions}>
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: "#EF4444" }]}
                          onPress={() => confirmUpdate(p.id, "rejected", p.union_name, true)}
                          disabled={pUpdating === p.id}
                        >
                          {pUpdating === p.id
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <><Ionicons name="close-outline" size={16} color="#fff" /><Text style={s.actionText}>رفض</Text></>
                          }
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: "#22C55E" }]}
                          onPress={() => confirmUpdate(p.id, "approved", p.union_name, true)}
                          disabled={pUpdating === p.id}
                        >
                          {pUpdating === p.id
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <><Ionicons name="checkmark-outline" size={16} color="#fff" /><Text style={s.actionText}>قبول</Text></>
                          }
                        </TouchableOpacity>
                      </View>
                    )}
                  </Animated.View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 16, gap: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#FFFFFF10", alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: UC2, textAlign: "center", marginTop: 2 },
  tabRow: {
    flexDirection: "row-reverse", padding: 12, gap: 8,
    backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  tabBtn: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  tabBtnActive: { backgroundColor: UC, borderColor: UC },
  tabText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  tabTextActive: { color: "#fff" },
  statsRow: { flexDirection: "row-reverse", gap: 10, padding: 16 },
  statCard: {
    flex: 1, backgroundColor: Colors.cardBg, borderRadius: 14,
    borderWidth: 1, padding: 12, alignItems: "center", gap: 4,
  },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 22 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center" },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  filterChipActive: { backgroundColor: UC, borderColor: UC },
  filterChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  filterChipTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyBox: { alignItems: "center", padding: 40, gap: 10 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1,
    borderColor: Colors.borderSubtle, overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: UC + "30", alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontFamily: "Cairo_700Bold", fontSize: 18, color: UC2 },
  appName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  appSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  details: { padding: 14, gap: 6 },
  detailRow: { flexDirection: "row-reverse", gap: 6, alignItems: "flex-start" },
  detailLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  detailVal: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.text, flex: 1 },
  tag: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  tagText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  actions: { flexDirection: "row-reverse", gap: 10, padding: 14, paddingTop: 0 },
  actionBtn: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center",
    justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12,
  },
  actionText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
});
