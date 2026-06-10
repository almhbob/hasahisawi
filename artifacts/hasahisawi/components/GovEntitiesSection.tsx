import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

type JoinStatus = "pending" | "invited" | "joined";

type GovEntity = {
  id: number;
  name: string;
  icon: string;
  category: string;
  description?: string;
  phone?: string;
  email?: string;
  join_status: JoinStatus;
};

const STATUS_CONFIG: Record<JoinStatus, { label: string; color: string; bg: string }> = {
  pending:  { label: "قيد التواصل",   color: "#F59E0B", bg: "#F59E0B22" },
  invited:  { label: "دعوة مُرسَلة", color: "#60A5FA", bg: "#60A5FA22" },
  joined:   { label: "منضم رسمياً",  color: "#3EFF9C", bg: "#3EFF9C22" },
};

export default function GovEntitiesSection() {
  const [entities, setEntities] = useState<GovEntity[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const base = getApiUrl();
    fetch(`${base}/api/gov-entities`)
      .then(r => r.json())
      .then(data => setEntities(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || entities.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.container}>
      {/* عنوان القسم */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="business-outline" size={20} color={Colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>الجهات الحكومية</Text>
          <Text style={styles.headerSub}>نحو خدمات رقمية في الحصاحيصا</Text>
        </View>
      </View>

      {/* لافتة الدعوة */}
      <View style={styles.inviteBanner}>
        <Text style={styles.inviteIcon}>📢</Text>
        <Text style={styles.inviteText}>
          ندعو جميع الجهات الحكومية في الحصاحيصا للانضمام إلى التطبيق وتقديم خدماتها رقمياً لمواطني المدينة
        </Text>
      </View>

      {/* قائمة الجهات */}
      <View style={styles.grid}>
        {entities.map((ent, idx) => {
          const st = STATUS_CONFIG[ent.join_status];
          return (
            <Animated.View
              key={ent.id}
              entering={FadeInDown.delay(idx * 60).springify()}
              style={styles.card}
            >
              {/* أيقونة وعنوان */}
              <View style={styles.cardHeader}>
                <View style={styles.entityIcon}>
                  <Text style={styles.entityIconText}>{ent.icon}</Text>
                </View>
                <View style={styles.entityInfo}>
                  <Text style={styles.entityName}>{ent.name}</Text>
                  {ent.description && (
                    <Text style={styles.entityDesc} numberOfLines={3}>{ent.description}</Text>
                  )}
                </View>
              </View>

              {/* حالة الانضمام */}
              <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
              </View>

              {/* إذا انضمت — أزرار التواصل */}
              {ent.join_status === "joined" && (ent.phone || ent.email) && (
                <View style={styles.contactRow}>
                  {ent.phone && (
                    <TouchableOpacity
                      style={styles.contactBtn}
                      onPress={() => Linking.openURL(`tel:${ent.phone}`)}
                    >
                      <Ionicons name="call-outline" size={14} color="#3EFF9C" />
                      <Text style={styles.contactBtnText}>{ent.phone}</Text>
                    </TouchableOpacity>
                  )}
                  {ent.email && (
                    <TouchableOpacity
                      style={[styles.contactBtn, { borderColor: "#60A5FA44" }]}
                      onPress={() => Linking.openURL(`mailto:${ent.email}`)}
                    >
                      <Ionicons name="mail-outline" size={14} color="#60A5FA" />
                      <Text style={[styles.contactBtnText, { color: "#60A5FA" }]}>بريد</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* إذا لم تنضم بعد — رسالة تشجيعية */}
              {ent.join_status !== "joined" && (
                <Text style={styles.pendingMsg}>
                  {ent.join_status === "invited"
                    ? "📩 تم إرسال دعوة الانضمام — في انتظار الرد"
                    : "⏳ جارٍ التواصل مع الجهة للانضمام إلى التطبيق"}
                </Text>
              )}
            </Animated.View>
          );
        })}
      </View>

      {/* زر التفاعل العام */}
      <TouchableOpacity style={styles.joinCallout}>
        <Ionicons name="megaphone-outline" size={16} color={Colors.accent} />
        <Text style={styles.joinCalloutText}>هل تعمل في جهة حكومية؟ ساعدنا بالتواصل معها</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.accent + "18",
    borderWidth: 1,
    borderColor: Colors.accent + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
  headerSub: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 1,
  },
  inviteBanner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#3B82F611",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#3B82F622",
  },
  inviteIcon: { fontSize: 18 },
  inviteText: {
    flex: 1,
    fontSize: 12,
    color: "#93C5FD",
    lineHeight: 18,
  },
  grid: {
    gap: 10,
  },
  card: {
    backgroundColor: "#0F1B12",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1e2d22",
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 10,
  },
  entityIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#1e2d2299",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  entityIconText: { fontSize: 22 },
  entityInfo: { flex: 1 },
  entityName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E2E8F0",
    marginBottom: 3,
  },
  entityDesc: {
    fontSize: 11,
    color: "#6b7280",
    lineHeight: 16,
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  contactRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#3EFF9C44",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  contactBtnText: {
    fontSize: 12,
    color: "#3EFF9C",
    fontWeight: "600",
  },
  pendingMsg: {
    fontSize: 11,
    color: "#6b7280",
    fontStyle: "italic",
    marginTop: 2,
  },
  joinCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.accent + "10",
    borderWidth: 1,
    borderColor: Colors.accent + "25",
  },
  joinCalloutText: {
    flex: 1,
    fontSize: 12,
    color: Colors.accent,
    fontWeight: "600",
  },
});
