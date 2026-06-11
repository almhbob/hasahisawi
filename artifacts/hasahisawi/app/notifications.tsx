import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { getApiUrl } from "@/lib/query-client";

type Notification = {
  id: number;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  data?: string; // JSON string
};

function timeAgo(isoDate: string, isRTL: boolean): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (isRTL) {
    if (days >= 1) return `منذ ${days} ${days === 1 ? "يوم" : "أيام"}`;
    if (hours >= 1) return `منذ ${hours} ${hours === 1 ? "ساعة" : "ساعات"}`;
    if (mins >= 1) return `منذ ${mins} دقيقة`;
    return "الآن";
  } else {
    if (days >= 1) return `${days}d ago`;
    if (hours >= 1) return `${hours}h ago`;
    if (mins >= 1) return `${mins}m ago`;
    return "Just now";
  }
}

function getTypeIcon(type: string): string {
  switch (type) {
    case "medical":
    case "pharmacy":
    case "lab":
    case "hospital":         return "medkit-outline";
    case "news":
    case "broadcast":        return "newspaper-outline";
    case "alert":            return "warning-outline";
    case "event":            return "calendar-outline";
    case "chat":             return "chatbubble-outline";
    case "zawajil":          return "heart-outline";
    case "institution_application":
    case "external_partnership": return "business-outline";
    case "lawyer_application":   return "scale-outline";
    case "student_union_application":
    case "union_employee_application":
    case "union_partnership_application":
    case "union_manager_application": return "people-outline";
    case "transport":        return "car-outline";
    case "direct":           return "person-outline";
    default:                 return "notifications-outline";
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case "medical":
    case "pharmacy":
    case "lab":
    case "hospital":         return Colors.primary;
    case "news":
    case "broadcast":        return "#2E7D9A";
    case "alert":            return "#FF4757";
    case "event":            return Colors.accent;
    case "chat":             return "#1E90FF";
    case "zawajil":          return "#E91E63";
    case "institution_application":
    case "external_partnership": return "#FF9800";
    case "lawyer_application":   return "#9C27B0";
    case "student_union_application":
    case "union_employee_application":
    case "union_partnership_application":
    case "union_manager_application": return "#4CAF50";
    case "transport":        return "#00BCD4";
    case "direct":           return Colors.textSecondary;
    default:                 return Colors.textSecondary;
  }
}

function getNotifRoute(notif: Notification): string | null {
  let parsed: Record<string, unknown> = {};
  try { parsed = notif.data ? JSON.parse(notif.data) : {}; } catch {}
  const type = notif.type;
  if (parsed?.chatId || type === "chat") return "/conversation";
  if (type === "student_union_application" || type === "union_employee_application" ||
      type === "union_partnership_application" || type === "union_manager_application") return "/union-manager-portal";
  if (type === "institution_application" || type === "external_partnership" ||
      type === "lawyer_application" || type === "alert") return "/admin";
  if (type === "zawajil" || (parsed as any)?.screen === "zawajil") return "/zawajil";
  if (type === "transport") return "/(tabs)";
  return null;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { t, isRTL } = useLang();
  const router = useRouter();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = async () => {
    try {
      const base = getApiUrl();
      const res = await fetch(`${base}/api/notifications`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (e) {
      console.error("Failed to load notifications", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadNotifications(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
  }, []);

  const markAsRead = async (id: number) => {
    try {
      const base = getApiUrl();
      await fetch(`${base}/api/notifications/${id}/read`, { method: "PUT" });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) {
      console.error("Failed to mark as read", e);
    }
  };

  const markAllRead = async () => {
    try {
      const base = getApiUrl();
      await fetch(`${base}/api/notifications/read-all`, { method: "PUT" });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {
      console.error("Failed to mark all as read", e);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead} activeOpacity={0.7}>
              <Text style={styles.markAllText}>{t("notifications", "markAllRead")}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t("notifications", "title")}</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="notifications-off-outline" size={52} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>{t("notifications", "noNotifications")}</Text>
          <Text style={styles.emptySubtitle}>{t("notifications", "noNotificationsSub")}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {notifications.map(notif => (
            <TouchableOpacity
              key={notif.id}
              style={[styles.card, !notif.is_read && styles.cardUnread]}
              onPress={() => {
                markAsRead(notif.id);
                const route = getNotifRoute(notif);
                if (route) router.push(route as any);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.cardRow}>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTime}>{timeAgo(notif.created_at, isRTL)}</Text>
                  {!notif.is_read && (
                    <View style={styles.unreadDot} />
                  )}
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{notif.title}</Text>
                  <Text style={styles.cardBody} numberOfLines={3}>{notif.body}</Text>
                </View>
                <View style={[styles.iconWrap, { backgroundColor: getTypeColor(notif.type) + "18" }]}>
                  <Ionicons name={getTypeIcon(notif.type) as any} size={22} color={getTypeColor(notif.type)} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center",
  },
  headerCenter: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  headerLeft: { width: 80, alignItems: "flex-start" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: "center",
  },
  unreadBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  markAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.primary + "15",
  },
  markAllText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: Colors.cardBg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  emptyTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardUnread: {
    borderColor: Colors.primary + "40",
    backgroundColor: Colors.primary + "06",
  },
  cardRow: {
    flexDirection: "row-reverse",
    gap: 12,
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  cardContent: { flex: 1, gap: 4 },
  cardTitle: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
    lineHeight: 22,
  },
  cardBody: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "right",
    lineHeight: 20,
  },
  cardMeta: {
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  cardTime: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
});
