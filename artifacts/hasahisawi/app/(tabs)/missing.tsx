import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
  Share,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";
import GuestGate from "@/components/GuestGate";
import { getApiUrl } from "@/lib/query-client";

export type LostItem = {
  id: string;
  item_name: string;
  category: "phone" | "keys" | "wallet" | "documents" | "jewelry" | "bag" | "other";
  description: string;
  last_seen: string;
  contact_phone: string;
  status: "lost" | "found";
  reporter_name: string;
  user_id?: number;
  created_at: string;
};

export const LOST_ITEMS_KEY = "lost_items_v2";

const CATEGORY_ICONS: Record<string, string> = {
  phone: "phone-portrait-outline",
  keys: "key-outline",
  wallet: "wallet-outline",
  documents: "document-text-outline",
  jewelry: "diamond-outline",
  bag: "bag-handle-outline",
  other: "help-circle-outline",
};

const CATEGORY_LABELS: Record<string, string> = {
  phone: "هاتف",
  keys: "مفاتيح",
  wallet: "محفظة",
  documents: "وثائق",
  jewelry: "مجوهرات",
  bag: "حقيبة",
  other: "أخرى",
};

const CATEGORY_COLORS: Record<string, string> = {
  phone: "#2E7D9A",
  keys: Colors.accent,
  wallet: Colors.primaryDim,
  documents: "#6A5ACD",
  jewelry: "#C0392B",
  bag: "#E67E22",
  other: Colors.textMuted,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 864e5);
  const h = Math.floor(diff / 36e5);
  if (d >= 1) return `منذ ${d} يوم`;
  if (h >= 1) return `منذ ${h} ساعة`;
  return "منذ قليل";
}

function contactOptions(phone: string) {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const clean = phone.replace(/[^0-9]/g, "");
  Alert.alert("تواصل", "اختر طريقة التواصل", [
    { text: "إلغاء", style: "cancel" },
    { text: "واتساب", onPress: () => Linking.openURL(`https://wa.me/${clean}`) },
    { text: "اتصال", onPress: () => Linking.openURL(`tel:${phone}`) },
  ]);
}

async function shareItem(item: LostItem) {
  try {
    await Share.share({
      message: `مفقود: ${item.item_name}\n${item.description}\nآخر مكان: ${item.last_seen}\nللتواصل: ${item.contact_phone}\n\nحصاحيصاوي — بوابة مدينة الحصاحيصا`,
      title: `مفقود: ${item.item_name}`,
    });
  } catch {}
}

const CATEGORIES = ["phone", "keys", "wallet", "documents", "jewelry", "bag", "other"] as const;

function ItemCard({ item, onMarkFound, onDelete, myUserId }: {
  item: LostItem;
  onMarkFound: (id: string) => void;
  onDelete: (id: string) => void;
  myUserId?: number;
}) {
  const isFound = item.status === "found";
  const isOwner = myUserId && item.user_id === myUserId;
  const color = CATEGORY_COLORS[item.category] || Colors.textMuted;

  return (
    <View style={[styles.card, isFound && styles.cardFound]}>
      <View style={styles.cardInner}>
        <View style={[styles.catIcon, { backgroundColor: color + "18" }]}>
          <Ionicons name={CATEGORY_ICONS[item.category] as any} size={24} color={color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            {isFound && <View style={styles.foundBadge}><Text style={styles.foundBadgeText}>موجود</Text></View>}
            <Text style={[styles.itemName, isFound && { color: Colors.textMuted }]}>{item.item_name}</Text>
          </View>
          <View style={styles.catRow}>
            <View style={[styles.catTag, { backgroundColor: color + "14" }]}>
              <Text style={[styles.catTagText, { color }]}>{CATEGORY_LABELS[item.category] || "أخرى"}</Text>
            </View>
            <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={styles.descText} numberOfLines={2}>{item.description}</Text>
          {item.last_seen ? (
            <TouchableOpacity
              style={styles.locationRow}
              onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(item.last_seen + " Hasahisa")}`)}
            >
              <Text style={[styles.locationText, { color: Colors.primary }]} numberOfLines={1}>{item.last_seen}</Text>
              <Ionicons name="location-outline" size={13} color={Colors.primary} />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.reporterText}>أبلغ عنه: {item.reporter_name}</Text>
        </View>
      </View>
      <View style={styles.cardDivider} />
      <View style={styles.cardActions}>
        <View style={styles.actionsRight}>
          {!isFound && isOwner && (
            <TouchableOpacity style={styles.foundBtn} onPress={() => onMarkFound(item.id)}>
              <Ionicons name="checkmark-circle-outline" size={15} color={Colors.success} />
              <Text style={styles.foundBtnText}>وُجد</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.actionsLeft}>
          <TouchableOpacity style={styles.shareBtn} onPress={() => shareItem(item)}>
            <Ionicons name="share-social-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.contactBtn} onPress={() => contactOptions(item.contact_phone)}>
            <Ionicons name="call-outline" size={14} color={Colors.primary} />
            <Text style={styles.contactBtnText}>تواصل</Text>
          </TouchableOpacity>
          {isOwner && (
            <TouchableOpacity onPress={() => onDelete(item.id)}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

function AddItemModal({ visible, onClose, onSave, saving }: {
  visible: boolean; onClose: () => void; onSave: (data: any) => void; saving: boolean
}) {
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("other");
  const [description, setDescription] = useState("");
  const [lastSeen, setLastSeen] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const reset = () => { setItemName(""); setCategory("other"); setDescription(""); setLastSeen(""); setContactPhone(""); };

  const save = () => {
    if (!itemName.trim() || !contactPhone.trim()) {
      Alert.alert("بيانات ناقصة", "اسم الغرض ورقم التواصل مطلوبان");
      return;
    }
    onSave({ item_name: itemName.trim(), category, description: description.trim(), last_seen: lastSeen.trim(), contact_phone: contactPhone.trim() });
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={addModal.overlay}>
          <View style={addModal.sheet}>
            <Text style={addModal.title}>الإبلاغ عن مفقود</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={addModal.label}>اسم الغرض المفقود *</Text>
              <TextInput style={addModal.input} value={itemName} onChangeText={setItemName} placeholder="مثال: هاتف سامسونج" placeholderTextColor={Colors.textMuted} textAlign="right" />

              <Text style={addModal.label}>التصنيف</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[addModal.catChip, category === cat && { backgroundColor: (CATEGORY_COLORS[cat] || Colors.primary) + "25", borderColor: CATEGORY_COLORS[cat] || Colors.primary }]}
                    onPress={() => setCategory(cat)}
                  >
                    <Ionicons name={CATEGORY_ICONS[cat] as any} size={14} color={category === cat ? (CATEGORY_COLORS[cat] || Colors.primary) : Colors.textSecondary} />
                    <Text style={[addModal.catChipText, category === cat && { color: CATEGORY_COLORS[cat] || Colors.primary }]}>{CATEGORY_LABELS[cat]}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={addModal.label}>وصف الغرض</Text>
              <TextInput
                style={[addModal.input, { height: 80, textAlignVertical: "top" }]}
                value={description}
                onChangeText={setDescription}
                placeholder="اللون، الحجم، العلامات المميزة..."
                placeholderTextColor={Colors.textMuted}
                textAlign="right"
                multiline
              />

              <Text style={addModal.label}>آخر مكان شوهد فيه</Text>
              <TextInput style={addModal.input} value={lastSeen} onChangeText={setLastSeen} placeholder="مثال: سوق الحصاحيصا" placeholderTextColor={Colors.textMuted} textAlign="right" />

              <Text style={addModal.label}>رقم التواصل *</Text>
              <TextInput style={addModal.input} value={contactPhone} onChangeText={setContactPhone} placeholder="+249XXXXXXXXX" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign="right" />
            </ScrollView>

            <View style={addModal.actions}>
              <TouchableOpacity style={addModal.cancelBtn} onPress={() => { reset(); onClose(); }}>
                <Text style={addModal.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[addModal.saveBtn, { opacity: saving ? 0.6 : 1 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={addModal.saveText}>نشر</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function LostItemsScreen() {
  const { isRTL } = useLang();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [items, setItems] = useState<LostItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<"all" | "lost" | "found">("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = getApiUrl();
      if (!base) return;
      const url = filterStatus !== "all" ? `${base}/api/lost-items?status=${filterStatus}` : `${base}/api/lost-items`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (e) {
      console.error("Lost items load error:", e);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markFound = async (id: string) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const base = getApiUrl();
      const token = auth.token;
      if (!base || !token) return;
      const res = await fetch(`${base}/api/lost-items/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "found" }),
      });
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: "found" } : i));
      }
    } catch {}
  };

  const deleteItem = (id: string) => {
    Alert.alert("حذف البلاغ", "هل أنت متأكد من حذف هذا البلاغ؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
        onPress: async () => {
          try {
            const base = getApiUrl();
            const token = auth.token;
            if (!base || !token) return;
            const res = await fetch(`${base}/api/lost-items/${id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              setItems(prev => prev.filter(i => i.id !== id));
            } else {
              Alert.alert("خطأ", "تعذّر الحذف");
            }
          } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
        },
      },
    ]);
  };

  const handleAdd = async (data: any) => {
    setSaving(true);
    try {
      const base = getApiUrl();
      const token = auth.token;
      if (!base) return;
      const res = await fetch(`${base}/api/lost-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowAddModal(false);
        load();
      } else {
        const err = await res.json();
        Alert.alert("خطأ", err.error || "تعذّر النشر");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSaving(false); }
  };

  const filtered = filterStatus === "all" ? items : items.filter(i => i.status === filterStatus);
  const lostCount = items.filter(i => i.status === "lost").length;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <AnimatedPress
          style={styles.addBtn}
          onPress={() => {
            if (auth.isGuest) {
              Alert.alert("تسجيل مطلوب", "يجب إنشاء حساب للإبلاغ عن المفقودات.", [{ text: "حسناً" }]);
              return;
            }
            setShowAddModal(true);
          }}
        >
          <Ionicons name="add" size={20} color={Colors.cardBg} />
          <Text style={styles.addBtnText}>إبلاغ عن مفقود</Text>
        </AnimatedPress>
        <View style={styles.headerRight}>
          <Text style={styles.headerTitle}>المفقودات</Text>
          {lostCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{lostCount}</Text>
            </View>
          )}
        </View>
      </View>

      <GuestGate
        title="المفقودات والموجودات"
        preview={
          <View style={{ padding: 16, gap: 12 }}>
            {[
              { name: "محفظة جلدية سوداء", status: "lost", loc: "سوق الحصاحيصا", time: "منذ يومين" },
              { name: "هاتف سامسونج A54", status: "lost", loc: "شارع المدارس", time: "منذ ٥ أيام" },
              { name: "وثيقة هوية وطنية", status: "found", loc: "حي السلام", time: "منذ ٣ أيام" },
            ].map((item, i) => (
              <View key={i} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: (item.status === "lost" ? Colors.danger : Colors.primary) + "20", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={item.status === "lost" ? "search-outline" : "checkmark-circle-outline"} size={20} color={item.status === "lost" ? Colors.danger : Colors.primary} />
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" }}>{item.name}</Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" }}>{item.loc} • {item.time}</Text>
                  </View>
                  <View style={{ backgroundColor: (item.status === "lost" ? Colors.danger : Colors.primary) + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 11, color: item.status === "lost" ? Colors.danger : Colors.primary }}>
                      {item.status === "lost" ? "مفقود" : "موجود"}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        }
        features={[
          { icon: "search-outline",         text: "أعلن عن مفقوداتك للمجتمع" },
          { icon: "checkmark-done-outline",  text: "أبلّغ عن الأشياء التي عثرت عليها" },
          { icon: "call-outline",            text: "تواصل مع أصحاب المفقودات مباشرة" },
        ]}
      >
        <View style={[styles.filters, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {(["all", "lost", "found"] as const).map((f) => (
            <AnimatedPress
              key={f}
              style={[styles.filterBtn, filterStatus === f && styles.filterBtnActive]}
              onPress={() => setFilterStatus(f)}
              scaleDown={0.92}
            >
              <Text style={[styles.filterBtnText, filterStatus === f && styles.filterBtnTextActive]}>
                {f === "all" ? "الكل" : f === "lost" ? "مفقود" : "موجود"}
              </Text>
            </AnimatedPress>
          ))}
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 }}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, marginTop: 12 }}>جاري التحميل...</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={i => String(i.id)}
            contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={52} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>لا توجد بلاغات</Text>
                <Text style={styles.emptyText}>كن أول من يُبلّغ عن مفقود في مدينتنا</Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
                <ItemCard
                  item={item}
                  onMarkFound={markFound}
                  onDelete={deleteItem}
                  myUserId={auth.user?.id as number | undefined}
                />
              </Animated.View>
            )}
          />
        )}
      </GuestGate>

      <AddItemModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAdd}
        saving={saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 16, paddingBottom: 16,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  headerRight: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  countBadge: { backgroundColor: Colors.danger + "18", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.danger },
  addBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 9,
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
  },
  addBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.cardBg },
  filters: {
    flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16,
    paddingVertical: 10, backgroundColor: Colors.cardBg,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterBtnTextActive: { color: "#FFFFFF" },
  list: { padding: 14, gap: 12 },
  empty: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textSecondary },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardFound: { opacity: 0.6 },
  cardInner: { flexDirection: "row-reverse", padding: 14, gap: 12, alignItems: "flex-start" },
  catIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  cardBody: { flex: 1, alignItems: "flex-end", gap: 5 },
  cardTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  itemName: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  foundBadge: { backgroundColor: Colors.success + "18", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2 },
  foundBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.success },
  catRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  catTag: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 2 },
  catTagText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  timeText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  descText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 19 },
  locationRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  locationText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, flex: 1, textAlign: "right" },
  reporterText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 14 },
  cardActions: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  actionsRight: { flexDirection: "row-reverse", gap: 8 },
  actionsLeft: { flexDirection: "row", gap: 12, alignItems: "center" },
  foundBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: Colors.success + "15", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  foundBtnText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.success },
  shareBtn: { width: 30, height: 30, justifyContent: "center", alignItems: "center" },
  contactBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: Colors.primary + "12", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  contactBtnText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.primary },
});

const addModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: "90%" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, textAlign: "center", marginBottom: 16 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 4 },
  input: { backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, marginBottom: 12 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, marginRight: 8, backgroundColor: Colors.bg },
  catChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  actions: { flexDirection: "row", gap: 12, marginTop: 12 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, alignItems: "center" },
  cancelText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  saveText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
