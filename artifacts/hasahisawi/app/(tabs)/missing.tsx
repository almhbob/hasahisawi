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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import Colors from "@/constants/colors";
import {
  fsGetCollection, fsUpdateDoc, fsDeleteDoc,
  COLLECTIONS, orderBy, isFirebaseAvailable,
} from "@/lib/firebase/firestore";

import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";
import GuestGate from "@/components/GuestGate";

function contactOptions(phone: string, t: any) {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const clean = phone.replace(/[^0-9]/g, "");
  Alert.alert(t('common', 'contact'), t('common', 'contact'), [
    { text: t('common', 'cancel'), style: "cancel" },
    { text: "WhatsApp", onPress: () => Linking.openURL(`https://wa.me/${clean}`) },
    { text: t('medical', 'callPhone'), onPress: () => Linking.openURL(`tel:${phone}`) },
  ]);
}

async function shareItem(item: { itemName: string; description: string; lastSeen: string; contactPhone: string }, t: any) {
  try {
    await Share.share({
      message: `${t('missing', 'lost')}: ${item.itemName}\n${item.description}\n${t('missing', 'lastSeen')}: ${item.lastSeen}\n${t('common', 'contact')}: ${item.contactPhone}\n\n${t('home', 'appTitle')}`,
      title: `${t('missing', 'lost')}: ${item.itemName}`,
    });
  } catch {}
}

export type LostItem = {
  id: string;
  itemName: string;
  category: "phone" | "keys" | "wallet" | "documents" | "jewelry" | "bag" | "other";
  description: string;
  lastSeen: string;
  contactPhone: string;
  status: "lost" | "found";
  createdAt: string;
};

export const LOST_ITEMS_KEY = "lost_items_v2";

const CATEGORY_ICONS: Record<LostItem["category"], string> = {
  phone: "phone-portrait-outline",
  keys: "key-outline",
  wallet: "wallet-outline",
  documents: "document-text-outline",
  jewelry: "diamond-outline",
  bag: "bag-handle-outline",
  other: "help-circle-outline",
};

const CATEGORY_LABELS: Record<LostItem["category"], string> = {
  phone: "هاتف",
  keys: "مفاتيح",
  wallet: "محفظة",
  documents: "وثائق",
  jewelry: "مجوهرات",
  bag: "حقيبة",
  other: "أخرى",
};

const CATEGORY_COLORS: Record<LostItem["category"], string> = {
  phone: "#2E7D9A",
  keys: Colors.accent,
  wallet: Colors.primaryDim,
  documents: "#6A5ACD",
  jewelry: "#C0392B",
  bag: "#E67E22",
  other: Colors.textMuted,
};

const SAMPLE_ITEMS: LostItem[] = [
  {
    id: "s1",
    itemName: "هاتف سامسونج",
    category: "phone",
    description: "هاتف سامسونج Galaxy A54 أسود اللون، الشاشة مكسورة قليلاً",
    lastSeen: "سوق حصاحيصا المركزي",
    contactPhone: "+249912345700",
    status: "lost",
    createdAt: new Date(Date.now() - 2 * 864e5).toISOString(),
  },
  {
    id: "s2",
    itemName: "مفاتيح سيارة",
    category: "keys",
    description: "مجموعة مفاتيح بها 3 مفاتيح وسلسلة خضراء",
    lastSeen: "أمام مدرسة البنات",
    contactPhone: "+249912345701",
    status: "lost",
    createdAt: new Date(Date.now() - 864e5).toISOString(),
  },
  {
    id: "s3",
    itemName: "حقيبة مدرسية",
    category: "bag",
    description: "حقيبة زرقاء داخلها كتب وأدوات مدرسية",
    lastSeen: "محطة الباصات",
    contactPhone: "+249912345702",
    status: "found",
    createdAt: new Date(Date.now() - 5 * 864e5).toISOString(),
  },
];

function timeAgo(iso: string, t: any) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 864e5);
  const h = Math.floor(diff / 36e5);
  if (d >= 1) return `${t('social', 'ago')} ${d} ${t('social', 'daysAgo')}`;
  if (h >= 1) return `${t('social', 'ago')} ${h} ${t('social', 'hoursAgo')}`;
  return t('social', 'justNow');
}

function ItemCard({
  item,
  onMarkFound,
  onDelete,
  t,
  isRTL
}: {
  item: LostItem;
  onMarkFound: (id: string) => void;
  onDelete: (id: string) => void;
  t: any;
  isRTL: boolean;
}) {
  const isFound = item.status === "found";
  const isSample = item.id.startsWith("s");
  const color = CATEGORY_COLORS[item.category];

  return (
    <View style={[styles.card, isFound && styles.cardFound]}>
      <View style={[styles.cardInner, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.catIcon, { backgroundColor: color + "18" }]}>
          <Ionicons name={CATEGORY_ICONS[item.category] as any} size={24} color={color} />
        </View>
        <View style={[styles.cardBody, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <View style={[styles.cardTitleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {isFound && <View style={styles.foundBadge}><Text style={styles.foundBadgeText}>{t('missing', 'found')}</Text></View>}
            <Text style={[styles.itemName, isFound && { color: Colors.textMuted }, { textAlign: isRTL ? 'right' : 'left' }]}>{item.itemName}</Text>
          </View>
          <View style={[styles.catRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.catTag, { backgroundColor: color + "14" }]}>
              <Text style={[styles.catTagText, { color }]}>{t('missing', 'categories')[item.category === 'phone' ? 'phone' : item.category === 'wallet' ? 'wallet' : item.category === 'keys' ? 'key' : item.category === 'documents' ? 'document' : item.category === 'jewelry' ? 'other' : item.category === 'bag' ? 'other' : 'other'] ?? t('missing', 'categories').other}</Text>
            </View>
            <Text style={styles.timeText}>{timeAgo(item.createdAt, t)}</Text>
          </View>
          <Text style={[styles.descText, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>{item.description}</Text>
          <TouchableOpacity
            style={[styles.locationRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(item.lastSeen + " Hasahisa")}`)}
          >
            <Text style={[styles.locationText, { color: Colors.primary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{item.lastSeen}</Text>
            <Ionicons name="location-outline" size={13} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.cardDivider} />
      <View style={[styles.cardActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.actionsRight, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {!isFound && !isSample && (
            <TouchableOpacity style={[styles.foundBtn, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => onMarkFound(item.id)}>
              <Ionicons name="checkmark-circle-outline" size={15} color={Colors.success} />
              <Text style={styles.foundBtnText}>{t('missing', 'found')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.actionsLeft, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
          <TouchableOpacity style={styles.shareBtn} onPress={() => shareItem(item, t)}>
            <Ionicons name="share-social-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.contactBtn, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => contactOptions(item.contactPhone, t)}>
            <Ionicons name="call-outline" size={14} color={Colors.primary} />
            <Text style={styles.contactBtnText}>{t('common', 'contact')}</Text>
          </TouchableOpacity>
          {!isSample && (
            <TouchableOpacity onPress={() => onDelete(item.id)}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

export default function LostItemsScreen() {
  const { t, isRTL, lang, tr } = useLang();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [items, setItems] = useState<LostItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<"all" | "lost" | "found">("all");

  const load = async () => {
    try {
      if (isFirebaseAvailable()) {
        const docs = await fsGetCollection<LostItem>(COLLECTIONS.MISSING, orderBy("createdAt", "desc"));
        setItems(docs.length > 0 ? docs : SAMPLE_ITEMS);
      } else {
        setItems(SAMPLE_ITEMS);
      }
    } catch {
      setItems(SAMPLE_ITEMS);
    }
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const markFound = async (id: string) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await fsUpdateDoc(COLLECTIONS.MISSING, id, { status: "found" });
      load();
    } catch { load(); }
  };

  const deleteItem = (id: string) => {
    const isSample = id.startsWith("s");
    if (isSample) return;
    Alert.alert(t('missing', 'deleteConfirm'), t('missing', 'deleteConfirm'), [
      { text: t('common', 'cancel'), style: "cancel" },
      {
        text: t('common', 'delete'), style: "destructive",
        onPress: async () => {
          try {
            await fsDeleteDoc(COLLECTIONS.MISSING, id);
            load();
          } catch { Alert.alert(t("common", "error"), "تعذّر الحذف"); }
        },
      },
    ]);
  };

  const filtered = items.filter(i => filterStatus === "all" || i.status === filterStatus);
  const lostCount = items.filter(i => i.status === "lost").length;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 16, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <AnimatedPress style={[styles.addBtn, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => {
          if (auth.isGuest) {
            Alert.alert(
              tr("تسجيل مطلوب", "Login Required"),
              tr("يجب إنشاء حساب للإبلاغ عن المفقودات.", "You need an account to report lost items."),
              [{ text: tr("حسناً", "OK") }]
            );
            return;
          }
          router.push("/report");
        }}>
          <Ionicons name="add" size={20} color={Colors.cardBg} />
          <Text style={styles.addBtnText}>{t('missing', 'reportLost')}</Text>
        </AnimatedPress>
        <View style={[styles.headerRight, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.headerTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('missing', 'title')}</Text>
          {lostCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{lostCount}</Text>
            </View>
          )}
        </View>
      </View>

      <GuestGate
        title={tr("المفقودات والموجودات", "Lost & Found")}
        preview={
          <View style={{ padding: 16, gap: 12 }}>
            {[
              { name: "محفظة جلدية سوداء", status: "lost", loc: "سوق حصاحيصا", time: "منذ يومين" },
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
          { icon: "search-outline",          text: tr("أعلن عن مفقوداتك للمجتمع", "Announce your lost items to the community") },
          { icon: "checkmark-done-outline",  text: tr("أبلّغ عن الأشياء التي عثرت عليها", "Report found items to help others") },
          { icon: "call-outline",            text: tr("تواصل مع أصحاب المفقودات مباشرة", "Contact owners directly") },
        ]}
      >
        <View style={[styles.filters, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {(["all", "lost", "found"] as const).map((f) => (
            <AnimatedPress
              key={f}
              style={[styles.filterBtn, filterStatus === f && styles.filterBtnActive]}
              onPress={() => setFilterStatus(f)}
              scaleDown={0.92}
            >
              <Text style={[styles.filterBtnText, filterStatus === f && styles.filterBtnTextActive]}>
                {f === "all" ? t('common', 'all') : f === "lost" ? t('missing', 'lost') : t('missing', 'found')}
              </Text>
            </AnimatedPress>
          ))}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={52} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>{t('missing', 'noItems')}</Text>
              <Text style={styles.emptyText}>{t('missing', 'noItemsSub')}</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
              <ItemCard item={item} onMarkFound={markFound} onDelete={deleteItem} t={t} isRTL={isRTL} />
            </Animated.View>
          )}
        />
      </GuestGate>
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
  countBadge: {
    backgroundColor: Colors.danger + "18", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
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
  filterBtn: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider,
  },
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
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardFound: { opacity: 0.6 },
  cardInner: { flexDirection: "row-reverse", padding: 14, gap: 12, alignItems: "flex-start" },
  catIcon: {
    width: 52, height: 52, borderRadius: 14,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  cardBody: { flex: 1, alignItems: "flex-end", gap: 5 },
  cardTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  itemName: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  foundBadge: {
    backgroundColor: Colors.success + "18", borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  foundBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.success },
  catRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  catTag: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 2 },
  catTagText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  timeText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  descText: {
    fontFamily: "Cairo_400Regular", fontSize: 13,
    color: Colors.textSecondary, textAlign: "right", lineHeight: 19,
  },
  locationRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  locationText: {
    fontFamily: "Cairo_400Regular", fontSize: 12,
    color: Colors.textMuted, flex: 1, textAlign: "right",
  },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 14 },
  cardActions: {
    flexDirection: "row-reverse", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10,
  },
  actionsRight: { flexDirection: "row-reverse", gap: 8 },
  actionsLeft: { flexDirection: "row", gap: 12, alignItems: "center" },
  foundBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    backgroundColor: Colors.success + "15", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  foundBtnText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.success },
  shareBtn: {
    width: 30, height: 30, justifyContent: "center", alignItems: "center",
  },
  contactBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    backgroundColor: Colors.primary + "12", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  contactBtnText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.primary },
});
