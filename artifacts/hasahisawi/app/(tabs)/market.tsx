import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";

// ─── Types ───────────────────────────────────────────────────────────────────

export type FamilyItem = {
  id: string;
  sellerName: string;
  category: "food" | "crafts" | "clothing" | "sweets" | "other";
  itemName: string;
  description: string;
  price: string;
  contactPhone: string;
  status: "available" | "sold";
  createdAt: string;
};

export type AuctionItem = {
  id: string;
  sellerName: string;
  itemName: string;
  condition: "new" | "like_new" | "used";
  category: "tools" | "agricultural" | "construction" | "electronics" | "furniture" | "appliances" | "clothing" | "other";
  description: string;
  price: string;
  contactPhone: string;
  status: "available" | "sold";
  createdAt: string;
  interestedCount?: number;
};

const FAMILY_KEY = "family_market_v1";
const AUCTION_KEY = "auction_market_v1";

// ─── Static Data ─────────────────────────────────────────────────────────────

const FAMILY_CATS = [
  { key: "all", label: "الكل" },
  { key: "food", label: "أغذية" },
  { key: "sweets", label: "حلويات" },
  { key: "crafts", label: "حرف يدوية" },
  { key: "clothing", label: "ملابس" },
  { key: "other", label: "أخرى" },
] as const;

const AUCTION_CATS = [
  { key: "all", label: "الكل" },
  { key: "tools", label: "أدوات" },
  { key: "electronics", label: "إلكترونيات" },
  { key: "furniture", label: "أثاث" },
  { key: "appliances", label: "أجهزة" },
  { key: "clothing", label: "ملابس" },
  { key: "other", label: "أخرى" },
] as const;

const FAMILY_CAT_ICONS: Record<FamilyItem["category"], string> = {
  food: "restaurant-outline",
  sweets: "cafe-outline",
  crafts: "color-wand-outline",
  clothing: "shirt-outline",
  other: "grid-outline",
};

const AUCTION_CAT_ICONS: Record<AuctionItem["category"], string> = {
  tools: "hammer-outline",
  agricultural: "leaf-outline",
  construction: "construct-outline",
  electronics: "phone-portrait-outline",
  furniture: "bed-outline",
  appliances: "tv-outline",
  clothing: "shirt-outline",
  other: "grid-outline",
};

const AUCTION_CAT_COLORS: Record<AuctionItem["category"], string> = {
  tools: Colors.violet,
  agricultural: "#27AE60",
  construction: "#E67E22",
  electronics: "#2980B9",
  furniture: "#8E44AD",
  appliances: "#16A085",
  clothing: "#C0392B",
  other: Colors.textSecondary,
};

const CONDITION_LABELS: Record<AuctionItem["condition"], string> = {
  new: "جديد",
  like_new: "شبه جديد",
  used: "مستعمل",
};

const CONDITION_COLORS: Record<AuctionItem["condition"], string> = {
  new: Colors.success,
  like_new: Colors.primaryDim,
  used: Colors.textMuted,
};

const FAMILY_CAT_COLORS: Record<FamilyItem["category"], string> = {
  food: "#C0392B",
  sweets: "#D35400",
  crafts: "#8E44AD",
  clothing: "#2980B9",
  other: Colors.textSecondary,
};

const FAMILY_SAMPLES: FamilyItem[] = [
  {
    id: "fs1",
    sellerName: "أم عبدالله",
    category: "food",
    itemName: "كسرة وملاح",
    description: "وجبة سودانية أصيلة، تُحضَّر يومياً بمكونات طازجة",
    price: "500 جنيه",
    contactPhone: "+249912345900",
    status: "available",
    createdAt: new Date(Date.now() - 864e5).toISOString(),
  },
  {
    id: "fs2",
    sellerName: "أم محمد",
    category: "sweets",
    itemName: "بسيمة وكعك العيد",
    description: "حلويات تقليدية سودانية، كميات محدودة يومياً",
    price: "200 جنيه / كيلو",
    contactPhone: "+249912345901",
    status: "available",
    createdAt: new Date(Date.now() - 2 * 864e5).toISOString(),
  },
  {
    id: "fs3",
    sellerName: "خديجة النور",
    category: "crafts",
    itemName: "سلال من الخوص",
    description: "سلال ومشغولات يدوية من الخوص، صناعة محلية أصيلة",
    price: "150 - 400 جنيه",
    contactPhone: "+249912345902",
    status: "available",
    createdAt: new Date(Date.now() - 3 * 864e5).toISOString(),
  },
];

const AUCTION_SAMPLES: AuctionItem[] = [
  {
    id: "as1",
    sellerName: "أبو محمد",
    itemName: "مولد كهرباء 3 كيلو",
    condition: "used",
    category: "appliances",
    description: "مولد 3 كيلو وات، يعمل بشكل ممتاز، سبب البيع شراء مولد أكبر",
    price: "45,000 جنيه",
    contactPhone: "+249912346000",
    status: "available",
    createdAt: new Date(Date.now() - 864e5).toISOString(),
    interestedCount: 5,
  },
  {
    id: "as2",
    sellerName: "الأستاذ كمال",
    itemName: "طقم أدوات نجارة كامل",
    condition: "like_new",
    category: "tools",
    description: "طقم أدوات نجارة: منشار، مطرقة، إزميل، مقياس — استُخدم مرتين فقط",
    price: "12,000 جنيه",
    contactPhone: "+249912346001",
    status: "available",
    createdAt: new Date(Date.now() - 2 * 864e5).toISOString(),
    interestedCount: 8,
  },
  {
    id: "as3",
    sellerName: "إبراهيم النور",
    itemName: "محراث حديدي مستعمل",
    condition: "used",
    category: "agricultural",
    description: "محراث حديدي لجرار صغير، مناسب لزراعة الفدادين الصغيرة، الحالة جيدة",
    price: "8,500 جنيه",
    contactPhone: "+249912346004",
    status: "available",
    createdAt: new Date(Date.now() - 1 * 864e5).toISOString(),
    interestedCount: 12,
  },
  {
    id: "as4",
    sellerName: "أبو خالد المقاول",
    itemName: "خلاطة خرسانة صغيرة",
    condition: "used",
    category: "construction",
    description: "خلاطة خرسانة 120 لتر، تعمل بالكهرباء، حالة جيدة، سبب البيع انتهاء المشروع",
    price: "25,000 جنيه",
    contactPhone: "+249912346005",
    status: "available",
    createdAt: new Date(Date.now() - 3 * 864e5).toISOString(),
    interestedCount: 4,
  },
  {
    id: "as5",
    sellerName: "أبو عمر",
    itemName: "تلفزيون سامسونج 43 بوصة",
    condition: "used",
    category: "electronics",
    description: "شاشة سمارت، حالة جيدة، سبب البيع السفر",
    price: "28,000 جنيه",
    contactPhone: "+249912346002",
    status: "available",
    createdAt: new Date(Date.now() - 4 * 864e5).toISOString(),
    interestedCount: 6,
  },
  {
    id: "as6",
    sellerName: "الحاج عبدالرحمن",
    itemName: "مضخة مياه للزراعة",
    condition: "used",
    category: "agricultural",
    description: "مضخة مياه 2 إنش، تعمل بالديزل، مستعملة موسم واحد فقط",
    price: "18,000 جنيه",
    contactPhone: "+249912346006",
    status: "available",
    createdAt: new Date(Date.now() - 2 * 864e5).toISOString(),
    interestedCount: 9,
  },
  {
    id: "as7",
    sellerName: "عادل الحداد",
    itemName: "أدوات حدادة وعدة لحام",
    condition: "like_new",
    category: "tools",
    description: "طقم حدادة كامل: أنبوب لحام، قواطع، مطارق — تُباع للضرورة",
    price: "22,000 جنيه",
    contactPhone: "+249912346007",
    status: "available",
    createdAt: new Date(Date.now() - 5 * 864e5).toISOString(),
    interestedCount: 3,
  },
  {
    id: "as8",
    sellerName: "أبو صلاح",
    itemName: "طاولة وكراسي خشب",
    condition: "used",
    category: "furniture",
    description: "طاولة طعام مع 6 كراسي، خشب صلب، في حالة جيدة",
    price: "للتفاوض",
    contactPhone: "+249912346003",
    status: "available",
    createdAt: new Date(Date.now() - 5 * 864e5).toISOString(),
    interestedCount: 2,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 864e5);
  const h = Math.floor(diff / 36e5);
  if (d >= 1) return `منذ ${d} ${d === 1 ? "يوم" : "أيام"}`;
  if (h >= 1) return `منذ ${h} ${h === 1 ? "ساعة" : "ساعات"}`;
  return "منذ قليل";
}

// ─── Family Item Card ─────────────────────────────────────────────────────────

function FamilyCard({
  item,
  onSold,
  onDelete,
}: {
  item: FamilyItem;
  onSold: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t, isRTL, tr } = useLang();
  const isSample = item.id.startsWith("fs");
  const color = FAMILY_CAT_COLORS[item.category];

  return (
    <View style={[styles.card, item.status === "sold" && styles.cardSold]}>
      <View style={[styles.cardTop, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={[styles.cardIcon, { backgroundColor: color + "15" }]}>
          <Ionicons name={FAMILY_CAT_ICONS[item.category] as any} size={26} color={color} />
        </View>
        <View style={[styles.cardBody, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
          <View style={[styles.cardTitleRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {item.status === "sold" && (
              <View style={styles.soldBadge}><Text style={styles.soldBadgeText}>{tr("نفذ", "Sold Out")}</Text></View>
            )}
            <Text style={[styles.cardName, item.status === "sold" && { color: Colors.textMuted }, { textAlign: isRTL ? "right" : "left" }]}>
              {item.itemName}
            </Text>
          </View>
          <Text style={[styles.sellerName, { textAlign: isRTL ? "right" : "left" }]}>{item.sellerName}</Text>
          <Text style={[styles.cardDesc, { textAlign: isRTL ? "right" : "left" }]} numberOfLines={2}>{item.description}</Text>
        </View>
      </View>
      <View style={styles.cardDivider} />
      <View style={[styles.cardFooter, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={[styles.footerLeft, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {!isSample && item.status === "available" && (
            <TouchableOpacity onPress={() => onSold(item.id)} style={styles.soldBtn}>
              <Text style={styles.soldBtnText}>{tr("نفذ", "Sold")}</Text>
            </TouchableOpacity>
          )}
          {!isSample && (
            <TouchableOpacity onPress={() => onDelete(item.id)}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.callBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Ionicons name="call-outline" size={14} color={Colors.primary} />
            <Text style={styles.callBtnText}>{t("common", "contact")}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.priceWrap}>
          <Text style={styles.priceText}>{item.price}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Auction Item Card ────────────────────────────────────────────────────────

function AuctionCard({
  item,
  onSold,
  onDelete,
  onInterested,
}: {
  item: AuctionItem;
  onSold: (id: string) => void;
  onDelete: (id: string) => void;
  onInterested: (id: string) => void;
}) {
  const { t, isRTL, tr } = useLang();
  const isSample = item.id.startsWith("as");
  const condColor = CONDITION_COLORS[item.condition];
  const catColor = AUCTION_CAT_COLORS[item.category] ?? Colors.violet;

  const conditionLabels = {
    new: t("market", "new"),
    like_new: tr("شبه جديد", "Like New"),
    used: t("market", "used"),
  };

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const d = Math.floor(diff / 864e5);
    const h = Math.floor(diff / 36e5);
    if (d >= 1) return tr(`منذ ${d} ${d === 1 ? "يوم" : "أيام"}`, `${d} days ago`);
    if (h >= 1) return tr(`منذ ${h} ${h === 1 ? "ساعة" : "ساعات"}`, `${h} hours ago`);
    return tr("منذ قليل", "Just now");
  }

  const interested = item.interestedCount ?? 0;

  return (
    <View style={[styles.card, item.status === "sold" && styles.cardSold]}>
      {/* Colored left bar per category */}
      <View style={[styles.auctionAccentBar, { backgroundColor: catColor }]} />
      <View style={[styles.cardTop, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={[styles.cardIcon, { backgroundColor: catColor + "15" }]}>
          <Ionicons name={AUCTION_CAT_ICONS[item.category] as any} size={26} color={catColor} />
        </View>
        <View style={[styles.cardBody, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
          <View style={[styles.cardTitleRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {item.status === "sold" && (
              <View style={styles.soldBadge}><Text style={styles.soldBadgeText}>{tr("بيع", "Sold")}</Text></View>
            )}
            <Text style={[styles.cardName, item.status === "sold" && { color: Colors.textMuted }, { textAlign: isRTL ? "right" : "left" }]}>
              {item.itemName}
            </Text>
          </View>
          {/* Direct-owner badge */}
          <View style={[styles.ownerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={styles.ownerBadge}>
              <Ionicons name="person-circle-outline" size={12} color={Colors.primary} />
              <Text style={styles.ownerBadgeText}>{tr("مباشر من المالك", "Direct from Owner")}</Text>
            </View>
            {item.sellerName ? (
              <Text style={styles.ownerName}>{item.sellerName}</Text>
            ) : null}
          </View>
          <View style={[styles.condRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={[styles.condBadge, { backgroundColor: condColor + "15" }]}>
              <Text style={[styles.condBadgeText, { color: condColor }]}>
                {conditionLabels[item.condition]}
              </Text>
            </View>
            <Text style={styles.timeSmall}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={[styles.cardDesc, { textAlign: isRTL ? "right" : "left" }]} numberOfLines={2}>{item.description}</Text>
        </View>
      </View>
      <View style={styles.cardDivider} />
      <View style={[styles.cardFooter, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={[styles.footerLeft, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {!isSample && item.status === "available" && (
            <TouchableOpacity onPress={() => onSold(item.id)} style={styles.soldBtn}>
              <Text style={styles.soldBtnText}>{tr("بيع", "Sold")}</Text>
            </TouchableOpacity>
          )}
          {!isSample && (
            <TouchableOpacity onPress={() => onDelete(item.id)}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.interestedBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => onInterested(item.id)}
            activeOpacity={0.7}
          >
            <Ionicons name="hand-left-outline" size={13} color={catColor} />
            <Text style={[styles.interestedText, { color: catColor }]}>{tr("مهتم", "Interested")}</Text>
            {interested > 0 && (
              <View style={[styles.interestedBadge, { backgroundColor: catColor }]}>
                <Text style={styles.interestedBadgeText}>{interested}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.callBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Ionicons name="call-outline" size={14} color={Colors.primary} />
            <Text style={styles.callBtnText}>{t("common", "contact")}</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.priceWrap, { backgroundColor: Colors.accent + "18" }]}>
          <Text style={[styles.priceText, { color: Colors.accent }]}>{item.price}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Add Family Modal ─────────────────────────────────────────────────────────

function AddFamilyModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (item: Omit<FamilyItem, "id" | "createdAt" | "status">) => Promise<void>;
}) {
  const { t, isRTL, tr } = useLang();
  const insets = useSafeAreaInsets();
  const [sellerName, setSellerName] = useState("");
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<FamilyItem["category"]>("food");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const reset = () => {
    setSellerName(""); setItemName(""); setCategory("food");
    setDescription(""); setPrice(""); setContactPhone("");
  };

  const catColors: Record<FamilyItem["category"], string> = FAMILY_CAT_COLORS;

  const handleSave = async () => {
    if (!sellerName.trim() || !itemName.trim() || !price.trim() || !contactPhone.trim()) {
      Alert.alert(t("common", "error"), t("common", "fillAll"));
      return;
    }
    await onSave({ sellerName: sellerName.trim(), itemName: itemName.trim(), category, description: description.trim(), price: price.trim(), contactPhone: contactPhone.trim() });
    reset(); onClose();
  };

  const categories = [
    { key: "food", label: tr("أغذية", "Food") },
    { key: "sweets", label: tr("حلويات", "Sweets") },
    { key: "crafts", label: tr("حرف يدوية", "Crafts") },
    { key: "clothing", label: tr("ملابس", "Clothing") },
    { key: "other", label: t("common", "all") },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <View style={[styles.sheetHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>{tr("إضافة منتج", "Add Product")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.form}>
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>{t("common", "type")}</Text>
                <View style={[styles.catBtnRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  {(["food", "sweets", "crafts", "clothing", "other"] as FamilyItem["category"][]).map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.catPickBtn, category === c && { backgroundColor: catColors[c], borderColor: catColors[c] }]}
                      onPress={() => setCategory(c)}
                    >
                      <Ionicons name={FAMILY_CAT_ICONS[c] as any} size={14} color={category === c ? "#fff" : Colors.textSecondary} />
                      <Text style={[styles.catPickText, category === c && { color: "#fff" }]}>
                        {categories.find(x => x.key === c)?.label ?? c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {[
                { label: t("market", "seller") + " *", value: sellerName, set: setSellerName, placeholder: t("market", "sellerPlaceholder") },
                { label: t("market", "productName") + " *", value: itemName, set: setItemName, placeholder: t("market", "productNamePlaceholder") },
                { label: t("common", "description"), value: description, set: setDescription, placeholder: tr("مكونات، طريقة الطلب...", "Ingredients, ordering method..."), multi: true },
                { label: t("market", "price") + " *", value: price, set: setPrice, placeholder: t("market", "pricePlaceholder") },
                { label: t("common", "phone") + " *", value: contactPhone, set: setContactPhone, placeholder: "+249...", numeric: true },
              ].map((f, i) => (
                <View key={i} style={styles.formField}>
                  <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.formInput, f.multi && styles.formTextArea]}
                    placeholder={f.placeholder}
                    placeholderTextColor={Colors.textMuted}
                    value={f.value}
                    onChangeText={f.set}
                    multiline={f.multi}
                    keyboardType={f.numeric ? "phone-pad" : "default"}
                    textAlign={isRTL ? "right" : "left"}
                    textAlignVertical={f.multi ? "top" : undefined}
                  />
                </View>
              ))}
              <TouchableOpacity style={[styles.saveBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]} onPress={handleSave} activeOpacity={0.85}>
                <MaterialCommunityIcons name="storefront-outline" size={18} color={Colors.cardBg} />
                <Text style={styles.saveBtnText}>{tr("نشر المنتج", "Post Product")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Add Auction Modal ────────────────────────────────────────────────────────

function AddAuctionModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (item: Omit<AuctionItem, "id" | "createdAt" | "status" | "interestedCount">) => Promise<void>;
}) {
  const { t, isRTL, tr } = useLang();
  const insets = useSafeAreaInsets();
  const [sellerName, setSellerName] = useState("");
  const [itemName, setItemName] = useState("");
  const [condition, setCondition] = useState<AuctionItem["condition"]>("used");
  const [category, setCategory] = useState<AuctionItem["category"]>("tools");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const reset = () => {
    setSellerName(""); setItemName(""); setCondition("used"); setCategory("tools");
    setDescription(""); setPrice(""); setContactPhone("");
  };

  const handleSave = async () => {
    if (!sellerName.trim() || !itemName.trim() || !price.trim() || !contactPhone.trim()) {
      Alert.alert(t("common", "error"), t("common", "fillAll"));
      return;
    }
    await onSave({ sellerName: sellerName.trim(), itemName: itemName.trim(), condition, category, description: description.trim(), price: price.trim(), contactPhone: contactPhone.trim() });
    reset(); onClose();
  };

  const conditionLabels = {
    new: t("market", "new"),
    like_new: tr("شبه جديد", "Like New"),
    used: t("market", "used"),
  };

  const categories = [
    { key: "tools", label: tr("أدوات", "Tools") },
    { key: "agricultural", label: tr("زراعية", "Agricultural") },
    { key: "construction", label: tr("بناء", "Construction") },
    { key: "electronics", label: tr("إلكترونيات", "Electronics") },
    { key: "furniture", label: tr("أثاث", "Furniture") },
    { key: "appliances", label: tr("أجهزة", "Appliances") },
    { key: "clothing", label: tr("ملابس", "Clothing") },
    { key: "other", label: t("common", "all") },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <View style={[styles.sheetHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>{tr("إضافة غرض للبيع", "Add Item for Sale")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.form}>
              {/* Condition */}
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>{t("market", "condition")}</Text>
                <View style={[styles.catBtnRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  {(["new", "like_new", "used"] as AuctionItem["condition"][]).map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.catPickBtn, condition === c && { backgroundColor: CONDITION_COLORS[c], borderColor: CONDITION_COLORS[c] }]}
                      onPress={() => setCondition(c)}
                    >
                      <Text style={[styles.catPickText, condition === c && { color: "#fff" }]}>{conditionLabels[c]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {/* Category */}
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>{t("common", "type")}</Text>
                <View style={[styles.catBtnRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  {(["tools", "agricultural", "construction", "electronics", "furniture", "appliances", "clothing", "other"] as AuctionItem["category"][]).map((c) => {
                    const cc = AUCTION_CAT_COLORS[c] ?? Colors.violet;
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[styles.catPickBtn, category === c && { backgroundColor: cc, borderColor: cc }]}
                        onPress={() => setCategory(c)}
                      >
                        <Ionicons name={AUCTION_CAT_ICONS[c] as any} size={13} color={category === c ? "#fff" : Colors.textSecondary} />
                        <Text style={[styles.catPickText, category === c && { color: "#fff" }]}>
                          {categories.find(x => x.key === c)?.label ?? c}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              {[
                { label: tr("اسم المالك *", "Owner Name *"), value: sellerName, set: setSellerName, placeholder: tr("اسمك (أنت المالك المباشر)", "Your name (you are the direct owner)") },
                { label: tr("اسم الغرض *", "Item Name *"), value: itemName, set: setItemName, placeholder: tr("مثال: مولد كهرباء 3 كيلو", "e.g. 3kW Generator") },
                { label: t("common", "description"), value: description, set: setDescription, placeholder: tr("تفاصيل الحالة، سبب البيع...", "Condition details, reason for selling..."), multi: true },
                { label: t("market", "price") + " *", value: price, set: setPrice, placeholder: t("market", "pricePlaceholder") },
                { label: t("common", "phone") + " *", value: contactPhone, set: setContactPhone, placeholder: "+249...", numeric: true },
              ].map((f, i) => (
                <View key={i} style={styles.formField}>
                  <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.formInput, f.multi && styles.formTextArea]}
                    placeholder={f.placeholder}
                    placeholderTextColor={Colors.textMuted}
                    value={f.value}
                    onChangeText={f.set}
                    multiline={f.multi}
                    keyboardType={f.numeric ? "phone-pad" : "default"}
                    textAlign={isRTL ? "right" : "left"}
                    textAlignVertical={f.multi ? "top" : undefined}
                  />
                </View>
              ))}
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.violet, flexDirection: isRTL ? "row-reverse" : "row" }]} onPress={handleSave} activeOpacity={0.85}>
                <Ionicons name="hammer-outline" size={18} color={Colors.cardBg} />
                <Text style={styles.saveBtnText}>{tr("نشر الإعلان", "Post Ad")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MarketScreen() {
  const { t, isRTL, tr } = useLang();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [tab, setTab] = useState<"family" | "auction">("family");
  const [familyItems, setFamilyItems] = useState<FamilyItem[]>([]);
  const [auctionItems, setAuctionItems] = useState<AuctionItem[]>([]);
  const [familyCat, setFamilyCat] = useState("all");
  const [auctionCat, setAuctionCat] = useState("all");
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [showAuctionModal, setShowAuctionModal] = useState(false);

  const FAMILY_CATS = useMemo(() => [
    { key: "all", label: t("common", "all") },
    { key: "food", label: tr("أغذية", "Food") },
    { key: "sweets", label: tr("حلويات", "Sweets") },
    { key: "crafts", label: tr("حرف يدوية", "Crafts") },
    { key: "clothing", label: tr("ملابس", "Clothing") },
    { key: "other", label: t("common", "all") },
  ], [t, tr]);

  const AUCTION_CATS = useMemo(() => [
    { key: "all", label: t("common", "all") },
    { key: "tools", label: tr("أدوات", "Tools") },
    { key: "agricultural", label: tr("زراعية", "Agricultural") },
    { key: "construction", label: tr("بناء", "Construction") },
    { key: "electronics", label: tr("إلكترونيات", "Electronics") },
    { key: "furniture", label: tr("أثاث", "Furniture") },
    { key: "appliances", label: tr("أجهزة", "Appliances") },
    { key: "clothing", label: tr("ملابس", "Clothing") },
    { key: "other", label: tr("أخرى", "Other") },
  ], [t, tr]);

  const load = async () => {
    const rawF = await AsyncStorage.getItem(FAMILY_KEY);
    const savedF: FamilyItem[] = rawF ? JSON.parse(rawF) : [];
    setFamilyItems([...savedF, ...FAMILY_SAMPLES]);

    const rawA = await AsyncStorage.getItem(AUCTION_KEY);
    const savedA: AuctionItem[] = rawA ? JSON.parse(rawA) : [];
    setAuctionItems([...savedA, ...AUCTION_SAMPLES]);
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const saveFamily = async (data: Omit<FamilyItem, "id" | "createdAt" | "status">): Promise<void> => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newItem: FamilyItem = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8), status: "available", createdAt: new Date().toISOString() };
    const raw = await AsyncStorage.getItem(FAMILY_KEY);
    const existing: FamilyItem[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(FAMILY_KEY, JSON.stringify([newItem, ...existing]));
    await load();
  };

  const saveAuction = async (data: Omit<AuctionItem, "id" | "createdAt" | "status" | "interestedCount">): Promise<void> => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newItem: AuctionItem = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8), status: "available", createdAt: new Date().toISOString(), interestedCount: 0 };
    const raw = await AsyncStorage.getItem(AUCTION_KEY);
    const existing: AuctionItem[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(AUCTION_KEY, JSON.stringify([newItem, ...existing]));
    await load();
  };

  const markFamilySold = async (id: string) => {
    const raw = await AsyncStorage.getItem(FAMILY_KEY);
    const saved: FamilyItem[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(FAMILY_KEY, JSON.stringify(saved.map(i => i.id === id ? { ...i, status: "sold" as const } : i)));
    load();
  };

  const deleteFamilyItem = (id: string) => {
    Alert.alert(t("common", "confirm"), t("common", "deleteMessage"), [
      { text: t("common", "cancel"), style: "cancel" },
      { text: t("common", "delete"), style: "destructive", onPress: async () => {
        const raw = await AsyncStorage.getItem(FAMILY_KEY);
        const saved: FamilyItem[] = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem(FAMILY_KEY, JSON.stringify(saved.filter(i => i.id !== id)));
        load();
      }},
    ]);
  };

  const markAuctionSold = async (id: string) => {
    const raw = await AsyncStorage.getItem(AUCTION_KEY);
    const saved: AuctionItem[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(AUCTION_KEY, JSON.stringify(saved.map(i => i.id === id ? { ...i, status: "sold" as const } : i)));
    load();
  };

  const markAuctionInterested = async (id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const raw = await AsyncStorage.getItem(AUCTION_KEY);
    const saved: AuctionItem[] = raw ? JSON.parse(raw) : [];
    const updated = saved.map(i => i.id === id ? { ...i, interestedCount: (i.interestedCount ?? 0) + 1 } : i);
    await AsyncStorage.setItem(AUCTION_KEY, JSON.stringify(updated));
    setAuctionItems(prev =>
      prev.map(i => i.id === id ? { ...i, interestedCount: (i.interestedCount ?? 0) + 1 } : i)
    );
  };

  const deleteAuctionItem = (id: string) => {
    Alert.alert(t("common", "confirm"), t("common", "deleteMessage"), [
      { text: t("common", "cancel"), style: "cancel" },
      { text: t("common", "delete"), style: "destructive", onPress: async () => {
        const raw = await AsyncStorage.getItem(AUCTION_KEY);
        const saved: AuctionItem[] = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem(AUCTION_KEY, JSON.stringify(saved.filter(i => i.id !== id)));
        load();
      }},
    ]);
  };

  const filteredFamily = familyItems.filter(i => familyCat === "all" || i.category === familyCat);
  const filteredAuction = auctionItems.filter(i => auctionCat === "all" || i.category === auctionCat);

  const activeCount = tab === "family"
    ? familyItems.filter(i => i.status === "available").length
    : auctionItems.filter(i => i.status === "available").length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <AnimatedPress
          style={[styles.addBtn, tab === "auction" && { backgroundColor: Colors.violet }, { flexDirection: isRTL ? "row-reverse" : "row" }]}
          onPress={() => {
            if (auth.isGuest) {
              Alert.alert(
                tr("تسجيل مطلوب", "Login Required"),
                tr("يجب إنشاء حساب لإضافة عروض في السوق.", "You need an account to add items to the market."),
                [{ text: tr("حسناً", "OK") }]
              );
              return;
            }
            tab === "family" ? setShowFamilyModal(true) : setShowAuctionModal(true);
          }}
        >
          <Ionicons name="add" size={20} color={Colors.cardBg} />
          <Text style={styles.addBtnText}>{t("common", "add")}</Text>
        </AnimatedPress>
        <View style={[styles.headerRight, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={styles.headerTitle}>{t("market", "title")}</Text>
          <View style={styles.headerCountBadge}>
            <Text style={styles.headerCountText}>{activeCount}</Text>
          </View>
        </View>
      </View>

      {/* Tab Switch */}
      <View style={[styles.tabSwitch, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <AnimatedPress
          style={[styles.switchTab, tab === "auction" && styles.switchTabActive, tab === "auction" && { borderColor: Colors.violet }, { flexDirection: isRTL ? "row-reverse" : "row" }]}
          onPress={() => setTab("auction")}
          scaleDown={0.92}
        >
          <Ionicons name="hammer-outline" size={15} color={tab === "auction" ? Colors.violet : Colors.textMuted} />
          <Text style={[styles.switchTabText, tab === "auction" && { color: Colors.violet }]}>{t("market", "auctionSector")}</Text>
        </AnimatedPress>
        <AnimatedPress
          style={[styles.switchTab, tab === "family" && styles.switchTabActive, { flexDirection: isRTL ? "row-reverse" : "row" }]}
          onPress={() => setTab("family")}
          scaleDown={0.92}
        >
          <MaterialCommunityIcons name="storefront-outline" size={15} color={tab === "family" ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.switchTabText, tab === "family" && { color: Colors.primary }]}>{t("market", "familySector")}</Text>
        </AnimatedPress>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={[styles.filterBarContent, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        {(tab === "family" ? FAMILY_CATS : AUCTION_CATS).map((c) => {
          const active = (tab === "family" ? familyCat : auctionCat) === c.key;
          const activeColor = tab === "family" ? Colors.primary : Colors.violet;
          return (
            <AnimatedPress
              key={c.key}
              style={[styles.filterChip, active && { backgroundColor: activeColor, borderColor: activeColor }]}
              onPress={() => tab === "family" ? setFamilyCat(c.key) : setAuctionCat(c.key)}
              scaleDown={0.92}
            >
              <Text style={[styles.filterChipText, active && { color: "#fff" }]}>{c.label}</Text>
            </AnimatedPress>
          );
        })}
      </ScrollView>

      {/* List */}
      {tab === "family" ? (
        <FlatList
          key="family"
          data={filteredFamily}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon="storefront-outline" text={t("market", "noItems")} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
              <FamilyCard item={item} onSold={markFamilySold} onDelete={deleteFamilyItem} />
            </Animated.View>
          )}
        />
      ) : (
        <FlatList
          key="auction"
          data={filteredAuction}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.dalalaBanner}>
              <View style={[styles.dalalaBannerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={styles.dalalaBannerIcon}>
                  <Ionicons name="hammer" size={22} color={Colors.violet} />
                </View>
                <View style={{ flex: 1, alignItems: isRTL ? "flex-end" : "flex-start" }}>
                  <Text style={[styles.dalalaBannerTitle, { textAlign: isRTL ? "right" : "left" }]}>
                    {tr("دلالة أهل الحصاحيصا", "Hasahisa Community Auction")}
                  </Text>
                  <Text style={[styles.dalalaBannerSub, { textAlign: isRTL ? "right" : "left" }]}>
                    {tr("للبيع بالتراضي · أدوات وعدة ومعدات مستعملة", "Direct sale · Used tools & equipment")}
                  </Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="hammer-outline" text={t("market", "noItems")} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
              <AuctionCard
                item={item}
                onSold={markAuctionSold}
                onDelete={deleteAuctionItem}
                onInterested={markAuctionInterested}
              />
            </Animated.View>
          )}
        />
      )}

      <AddFamilyModal visible={showFamilyModal} onClose={() => setShowFamilyModal(false)} onSave={saveFamily} />
      <AddAuctionModal visible={showAuctionModal} onClose={() => setShowAuctionModal(false)} onSave={saveAuction} />
    </View>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  const { t } = useLang();
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon as any} size={52} color={Colors.textMuted} />
      <Text style={styles.emptyText}>{text}</Text>
      <Text style={styles.emptySubText}>{t("market", "noItemsSub")}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  headerRight: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  headerCountBadge: {
    backgroundColor: Colors.primary + "18", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  headerCountText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  addBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 9,
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
  },
  addBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.cardBg },
  tabSwitch: {
    flexDirection: "row-reverse",
    backgroundColor: Colors.cardBg,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    paddingHorizontal: 16, gap: 8, paddingBottom: 0,
  },
  switchTab: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: "transparent",
  },
  switchTabActive: { borderBottomColor: Colors.primary },
  switchTabText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted },
  filterBar: {
    backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  filterBarContent: {
    flexDirection: "row-reverse", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider,
  },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  list: { padding: 14, gap: 12 },
  empty: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyText: { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textSecondary },
  emptySubText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  // Card
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardSold: { opacity: 0.55 },
  cardTop: { flexDirection: "row-reverse", padding: 14, gap: 12, alignItems: "flex-start" },
  cardIcon: {
    width: 52, height: 52, borderRadius: 14,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  cardBody: { flex: 1, alignItems: "flex-end", gap: 4 },
  cardTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardName: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  soldBadge: {
    backgroundColor: Colors.textMuted + "22", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2,
  },
  soldBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.textMuted },
  sellerName: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.accent },
  condRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  condBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 2 },
  condBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  timeSmall: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  cardDesc: {
    fontFamily: "Cairo_400Regular", fontSize: 13,
    color: Colors.textSecondary, textAlign: "right", lineHeight: 19,
  },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 14 },
  cardFooter: {
    flexDirection: "row-reverse", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10,
  },
  footerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  priceWrap: {
    backgroundColor: Colors.primary + "14", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  priceText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary },
  soldBtn: {
    backgroundColor: Colors.textMuted + "18", borderRadius: 9,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  soldBtnText: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textSecondary },
  callBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: Colors.primary + "12", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 4,
  },
  callBtnText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.primary },
  // Owner badge
  ownerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, flexWrap: "wrap" },
  ownerBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: Colors.primary + "12", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.primary + "25",
  },
  ownerBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.primary },
  ownerName: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },
  // Auction-specific
  auctionAccentBar: {
    position: "absolute", top: 0, bottom: 0, left: 0,
    width: 4, borderTopLeftRadius: 18, borderBottomLeftRadius: 18,
  },
  interestedBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    borderRadius: 9, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.divider,
  },
  interestedText: { fontFamily: "Cairo_500Medium", fontSize: 12 },
  interestedBadge: {
    borderRadius: 8, minWidth: 18, height: 18,
    justifyContent: "center", alignItems: "center", paddingHorizontal: 4,
  },
  interestedBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  // Dalala banner
  dalalaBanner: {
    backgroundColor: Colors.violet + "10",
    borderRadius: 14, borderWidth: 1, borderColor: Colors.violet + "30",
    marginBottom: 4, padding: 12,
  },
  dalalaBannerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  dalalaBannerIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: Colors.violet + "18",
    justifyContent: "center", alignItems: "center",
  },
  dalalaBannerTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.violet },
  dalalaBannerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  // Modal
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "92%",
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2,
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  form: { padding: 16, gap: 14 },
  formField: { gap: 6 },
  formLabel: {
    fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right",
  },
  formInput: {
    backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.divider,
  },
  formTextArea: { minHeight: 80, lineHeight: 22 },
  catBtnRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  catPickBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg,
  },
  catPickText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 4,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.cardBg },
});
