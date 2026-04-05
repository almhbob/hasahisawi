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

export type CarpentryItem = {
  id: string;
  shopName: string;
  ownerName: string;
  specialty: "doors" | "furniture" | "kitchens" | "windows" | "decor" | "other";
  productName: string;
  description: string;
  priceFrom: string;
  priceTo: string;
  contactPhone: string;
  location: string;
  status: "available" | "unavailable";
  createdAt: string;
  rating?: number;
};

const FAMILY_KEY = "family_market_v1";
const AUCTION_KEY = "auction_market_v1";
const CARPENTRY_KEY = "carpentry_market_v1";

// ─── Merchant Types ───────────────────────────────────────────────────────────
type MerchantCat = "grocery" | "restaurant" | "pharmacy" | "clothing" | "electronics" | "services" | "crafts" | "other";

type MerchantSpace = {
  id: number;
  shop_name: string;
  owner_name: string;
  category: MerchantCat;
  description?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  working_hours?: string;
  logo_emoji: string;
  tags: string[];
  is_featured: boolean;
  is_verified: boolean;
  created_at: string;
};

const MERCHANT_CATS: { key: "all" | MerchantCat; label: string; emoji: string; color: string }[] = [
  { key:"all",         label:"الكل",          emoji:"🏪", color:"#6366F1" },
  { key:"grocery",     label:"بقالة وأسواق",  emoji:"🛒", color:"#10B981" },
  { key:"restaurant",  label:"مطاعم وكافيهات",emoji:"🍽️", color:"#F97316" },
  { key:"pharmacy",    label:"صيدليات",        emoji:"💊", color:"#EF4444" },
  { key:"clothing",    label:"ملابس وأزياء",  emoji:"👗", color:"#EC4899" },
  { key:"electronics", label:"إلكترونيات",    emoji:"📱", color:"#3B82F6" },
  { key:"services",    label:"خدمات عامة",    emoji:"🔧", color:"#F59E0B" },
  { key:"crafts",      label:"حرف ومصنوعات",  emoji:"🎨", color:"#8B5CF6" },
  { key:"other",       label:"أخرى",          emoji:"📦", color:"#6B7280" },
];

const MERCHANT_TAGS = [
  "توصيل منزلي","دفع إلكتروني","مواد طازجة","خصومات يومية",
  "خدمة 24 ساعة","خدمة عملاء","ضمان المنتج","تركيب مجاني",
  "استشارة مجانية","حجز مسبق","منتجات طبيعية","صنع يدوي",
];

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

const CARPENTRY_ACCENT = "#7D4E2D";
const CARPENTRY_LIGHT = "#A0672A";

const CARPENTRY_CATS = [
  { key: "all", label: "الكل" },
  { key: "doors", label: "أبواب" },
  { key: "furniture", label: "أثاث" },
  { key: "kitchens", label: "مطابخ" },
  { key: "windows", label: "نوافذ" },
  { key: "decor", label: "ديكور" },
  { key: "other", label: "أخرى" },
] as const;

const CARPENTRY_CAT_ICONS: Record<CarpentryItem["specialty"], string> = {
  doors: "door-open",
  furniture: "sofa",
  kitchens: "countertop",
  windows: "window-open",
  decor: "palette",
  other: "toolbox",
};

const CARPENTRY_CAT_COLORS: Record<CarpentryItem["specialty"], string> = {
  doors: "#7D4E2D",
  furniture: "#A0522D",
  kitchens: "#C47A3A",
  windows: "#6B8E6B",
  decor: "#9B6B9B",
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

const CARPENTRY_SAMPLES: CarpentryItem[] = [
  {
    id: "cs1",
    shopName: "ورشة أبو بكر للنجارة",
    ownerName: "أبو بكر عثمان",
    specialty: "doors",
    productName: "أبواب خشب زان وتيك",
    description: "أبواب غرف ومداخل من خشب الزان والتيك، تشطيبات ناعمة أو خشنة حسب الطلب، كل الأحجام متاحة",
    priceFrom: "15,000",
    priceTo: "45,000",
    contactPhone: "+249912347001",
    location: "حي الوسط - الحصاحيصا",
    status: "available",
    createdAt: new Date(Date.now() - 864e5).toISOString(),
    rating: 5,
  },
  {
    id: "cs2",
    shopName: "أثاث الحصاحيصا الحديث",
    ownerName: "محمد أحمد الطيب",
    specialty: "furniture",
    productName: "غرف نوم وصالونات",
    description: "تصميم وتنفيذ غرف نوم كاملة، صالونات وكنبات، تصاميم كلاسيكية وعصرية حسب رغبة العميل",
    priceFrom: "80,000",
    priceTo: "250,000",
    contactPhone: "+249912347002",
    location: "السوق القديم - الحصاحيصا",
    status: "available",
    createdAt: new Date(Date.now() - 2 * 864e5).toISOString(),
    rating: 4,
  },
  {
    id: "cs3",
    shopName: "مطابخ الفن والجمال",
    ownerName: "إبراهيم خليل",
    specialty: "kitchens",
    productName: "مطابخ MDF وخشب طبيعي",
    description: "تصميم وتركيب مطابخ بمقاسات دقيقة، خشب MDF وخشب طبيعي، ألوان وتصاميم متنوعة، ضمان على التركيب",
    priceFrom: "150,000",
    priceTo: "500,000",
    contactPhone: "+249912347003",
    location: "حي الشرق - الحصاحيصا",
    status: "available",
    createdAt: new Date(Date.now() - 3 * 864e5).toISOString(),
    rating: 5,
  },
  {
    id: "cs4",
    shopName: "ورشة النيل للنجارة",
    ownerName: "عبدالرحمن النيل",
    specialty: "windows",
    productName: "نوافذ وشبابيك خشبية",
    description: "نوافذ وشبابيك خشبية بجميع الأحجام والتصاميم، بما في ذلك الشبابيك ذات الزجاج المزدوج",
    priceFrom: "8,000",
    priceTo: "25,000",
    contactPhone: "+249912347004",
    location: "المنطقة الصناعية - الحصاحيصا",
    status: "available",
    createdAt: new Date(Date.now() - 4 * 864e5).toISOString(),
    rating: 4,
  },
  {
    id: "cs5",
    shopName: "ديكور الخشب الراقي",
    ownerName: "أسامة عبدالله",
    specialty: "decor",
    productName: "أعمال ديكور وزخرفة خشبية",
    description: "تصاميم ديكور خشبية فاخرة: أرفف، لوحات جدارية، أعمال خشبية مشغولة ومنحوتة بالأيدي",
    priceFrom: "5,000",
    priceTo: "80,000",
    contactPhone: "+249912347005",
    location: "حي الشمال - الحصاحيصا",
    status: "available",
    createdAt: new Date(Date.now() - 1 * 864e5).toISOString(),
    rating: 5,
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

// ─── Carpentry Shop Card ──────────────────────────────────────────────────────

function CarpentryCard({
  item,
  onDelete,
}: {
  item: CarpentryItem;
  onDelete: (id: string) => void;
}) {
  const { isRTL, tr } = useLang();
  const isSample = item.id.startsWith("cs");
  const catColor = CARPENTRY_CAT_COLORS[item.specialty] ?? CARPENTRY_ACCENT;
  const icon = CARPENTRY_CAT_ICONS[item.specialty] ?? "toolbox";

  const specialtyLabels: Record<CarpentryItem["specialty"], string> = {
    doors: "أبواب",
    furniture: "أثاث",
    kitchens: "مطابخ",
    windows: "نوافذ",
    decor: "ديكور",
    other: "أخرى",
  };

  const stars = item.rating ?? 0;

  return (
    <View style={styles.carpCard}>
      {/* Wood-grain accent bar */}
      <View style={[styles.carpAccentBar, { backgroundColor: catColor }]} />

      {/* Shop header */}
      <View style={[styles.carpHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={[styles.carpIconWrap, { backgroundColor: catColor + "18" }]}>
          <MaterialCommunityIcons name={icon as any} size={28} color={catColor} />
        </View>
        <View style={[styles.carpHeaderInfo, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
          <Text style={[styles.carpShopName, { textAlign: isRTL ? "right" : "left" }]}>{item.shopName}</Text>
          <View style={[styles.carpTagsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={[styles.carpSpecBadge, { backgroundColor: catColor + "18", borderColor: catColor + "40" }]}>
              <MaterialCommunityIcons name={icon as any} size={11} color={catColor} />
              <Text style={[styles.carpSpecText, { color: catColor }]}>{specialtyLabels[item.specialty]}</Text>
            </View>
            <View style={styles.carpLocBadge}>
              <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.carpLocText} numberOfLines={1}>{item.location}</Text>
            </View>
          </View>
          {/* Stars */}
          <View style={[styles.carpStarsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons
                key={s}
                name={s <= stars ? "star" : "star-outline"}
                size={13}
                color={s <= stars ? "#F5A623" : Colors.divider}
              />
            ))}
            <Text style={styles.carpOwnerName}>{item.ownerName}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardDivider} />

      {/* Product info */}
      <View style={styles.carpBody}>
        <Text style={[styles.carpProductName, { textAlign: isRTL ? "right" : "left" }]}>{item.productName}</Text>
        <Text style={[styles.cardDesc, { textAlign: isRTL ? "right" : "left" }]} numberOfLines={2}>{item.description}</Text>
      </View>

      <View style={styles.cardDivider} />

      {/* Footer */}
      <View style={[styles.carpFooter, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={[styles.footerLeft, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {!isSample && (
            <TouchableOpacity onPress={() => onDelete(item.id)}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.carpQuoteBtn, { backgroundColor: catColor + "15", borderColor: catColor + "40", flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={14} color={catColor} />
            <Text style={[styles.carpQuoteText, { color: catColor }]}>{tr("طلب عرض سعر", "Request Quote")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.callBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Ionicons name="call-outline" size={14} color={Colors.primary} />
            <Text style={styles.callBtnText}>{tr("تواصل", "Contact")}</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.carpPriceWrap]}>
          <Text style={styles.carpPriceFrom}>{tr("من", "From")}</Text>
          <Text style={[styles.carpPriceValue, { color: catColor }]}>{item.priceFrom}</Text>
          <Text style={styles.carpPriceCurrency}>{tr("جنيه", "SDG")}</Text>
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

// ─── Add Carpentry Modal ──────────────────────────────────────────────────────

function AddCarpentryModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (item: Omit<CarpentryItem, "id" | "createdAt" | "status">) => Promise<void>;
}) {
  const { isRTL, tr } = useLang();
  const insets = useSafeAreaInsets();
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [specialty, setSpecialty] = useState<CarpentryItem["specialty"]>("doors");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [location, setLocation] = useState("");
  const [rating, setRating] = useState(5);

  const reset = () => {
    setShopName(""); setOwnerName(""); setSpecialty("doors");
    setProductName(""); setDescription(""); setPriceFrom("");
    setPriceTo(""); setContactPhone(""); setLocation(""); setRating(5);
  };

  const handleSave = async () => {
    if (!shopName.trim() || !productName.trim() || !priceFrom.trim() || !contactPhone.trim()) {
      Alert.alert(tr("خطأ", "Error"), tr("يرجى تعبئة الحقول المطلوبة", "Please fill all required fields"));
      return;
    }
    await onSave({
      shopName: shopName.trim(), ownerName: ownerName.trim(), specialty,
      productName: productName.trim(), description: description.trim(),
      priceFrom: priceFrom.trim(), priceTo: priceTo.trim(),
      contactPhone: contactPhone.trim(), location: location.trim(), rating,
    });
    reset(); onClose();
  };

  const specialtyList: { key: CarpentryItem["specialty"]; label: string }[] = [
    { key: "doors", label: "أبواب" },
    { key: "furniture", label: "أثاث" },
    { key: "kitchens", label: "مطابخ" },
    { key: "windows", label: "نوافذ" },
    { key: "decor", label: "ديكور" },
    { key: "other", label: "أخرى" },
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
            <Text style={styles.sheetTitle}>{tr("إضافة محل نجارة", "Add Carpentry Shop")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.form}>
              {/* Specialty */}
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>{tr("التخصص", "Specialty")}</Text>
                <View style={[styles.catBtnRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  {specialtyList.map(({ key, label }) => {
                    const cc = CARPENTRY_CAT_COLORS[key];
                    const icon = CARPENTRY_CAT_ICONS[key];
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.catPickBtn, specialty === key && { backgroundColor: cc, borderColor: cc }]}
                        onPress={() => setSpecialty(key)}
                      >
                        <MaterialCommunityIcons name={icon as any} size={13} color={specialty === key ? "#fff" : Colors.textSecondary} />
                        <Text style={[styles.catPickText, specialty === key && { color: "#fff" }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              {/* Rating */}
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>{tr("التقييم الذاتي", "Self Rating")}</Text>
                <View style={[styles.carpStarsInput, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <TouchableOpacity key={s} onPress={() => setRating(s)}>
                      <Ionicons name={s <= rating ? "star" : "star-outline"} size={28} color={s <= rating ? "#F5A623" : Colors.divider} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {[
                { label: tr("اسم المحل *", "Shop Name *"), value: shopName, set: setShopName, placeholder: tr("مثال: ورشة أبو بكر للنجارة", "e.g. Al-Nour Carpentry") },
                { label: tr("اسم صاحب المحل", "Owner Name"), value: ownerName, set: setOwnerName, placeholder: tr("اسمك", "Your name") },
                { label: tr("اسم المنتج / الخدمة *", "Product / Service *"), value: productName, set: setProductName, placeholder: tr("مثال: أبواب خشب زان", "e.g. Oak wood doors") },
                { label: tr("الوصف", "Description"), value: description, set: setDescription, placeholder: tr("تفاصيل المواد، الجودة، المميزات...", "Materials, quality, features..."), multi: true },
                { label: tr("السعر من *", "Price From *"), value: priceFrom, set: setPriceFrom, placeholder: tr("مثال: 15,000", "e.g. 15,000"), numeric: true },
                { label: tr("السعر إلى", "Price To"), value: priceTo, set: setPriceTo, placeholder: tr("مثال: 45,000", "e.g. 45,000"), numeric: true },
                { label: tr("رقم الهاتف *", "Phone *"), value: contactPhone, set: setContactPhone, placeholder: "+249...", numeric: true },
                { label: tr("الموقع", "Location"), value: location, set: setLocation, placeholder: tr("مثال: حي الوسط - الحصاحيصا", "e.g. Central district") },
              ].map((f, i) => (
                <View key={i} style={styles.formField}>
                  <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.formInput, (f as any).multi && styles.formTextArea]}
                    placeholder={f.placeholder}
                    placeholderTextColor={Colors.textMuted}
                    value={f.value}
                    onChangeText={f.set}
                    multiline={(f as any).multi}
                    keyboardType={(f as any).numeric ? "numeric" : "default"}
                    textAlign={isRTL ? "right" : "left"}
                    textAlignVertical={(f as any).multi ? "top" : undefined}
                  />
                </View>
              ))}
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: CARPENTRY_ACCENT, flexDirection: isRTL ? "row-reverse" : "row" }]}
                onPress={handleSave}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="storefront-plus-outline" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>{tr("نشر المحل", "Publish Shop")}</Text>
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

  const [tab, setTab] = useState<"family" | "auction" | "carpentry" | "merchants">("family");
  const [familyItems, setFamilyItems] = useState<FamilyItem[]>([]);
  const [auctionItems, setAuctionItems] = useState<AuctionItem[]>([]);
  const [carpentryItems, setCarpentryItems] = useState<CarpentryItem[]>([]);
  const [familyCat, setFamilyCat] = useState("all");
  const [auctionCat, setAuctionCat] = useState("all");
  const [carpEntryCat, setCarpEntryCat] = useState("all");
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [showAuctionModal, setShowAuctionModal] = useState(false);
  const [showCarpentryModal, setShowCarpentryModal] = useState(false);

  // ── Merchants state ──────────────────────────────────────────────────────
  const [merchants, setMerchants]           = useState<MerchantSpace[]>([]);
  const [merchantCat, setMerchantCat]       = useState<"all" | MerchantCat>("all");
  const [merchantSearch, setMerchantSearch] = useState("");
  const [merchantLoading, setMerchantLoading] = useState(false);
  const [merchantRegModal, setMerchantRegModal] = useState(false);
  const [merchantRegSuccess, setMerchantRegSuccess] = useState(false);
  const [merchantForm, setMerchantForm]     = useState({
    shop_name:"", owner_name:"", category:"grocery" as MerchantCat,
    description:"", address:"", phone:"", whatsapp:"",
    working_hours:"", logo_emoji:"🏪", tags:[] as string[],
  });
  const [merchantSubmitting, setMerchantSubmitting] = useState(false);

  const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

  const loadMerchants = async () => {
    setMerchantLoading(true);
    try {
      const params = new URLSearchParams();
      if (merchantCat !== "all") params.set("category", merchantCat);
      if (merchantSearch.trim()) params.set("q", merchantSearch.trim());
      const res = await fetch(`${BASE_URL}/api/merchants?${params}`);
      if (res.ok) { const data = await res.json(); setMerchants(data.merchants ?? []); }
    } catch {} finally { setMerchantLoading(false); }
  };

  const submitMerchantReg = async () => {
    if (!merchantForm.shop_name.trim()) { Alert.alert("خطأ", "اسم المحل مطلوب"); return; }
    if (!merchantForm.owner_name.trim()) { Alert.alert("خطأ", "اسم المالك مطلوب"); return; }
    if (!merchantForm.phone.trim() && !merchantForm.whatsapp.trim()) { Alert.alert("خطأ", "رقم التواصل مطلوب"); return; }
    setMerchantSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/merchants`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...merchantForm }),
      });
      if (res.ok) {
        setMerchantRegSuccess(true);
        setMerchantForm({ shop_name:"", owner_name:"", category:"grocery", description:"", address:"", phone:"", whatsapp:"", working_hours:"", logo_emoji:"🏪", tags:[] });
      } else {
        const err = await res.json().catch(()=>({}));
        Alert.alert("خطأ", err.error ?? "تعذّر إرسال الطلب");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); } finally { setMerchantSubmitting(false); }
  };

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

  const CARP_CATS = useMemo(() => [
    { key: "all", label: tr("الكل", "All") },
    { key: "doors", label: tr("أبواب", "Doors") },
    { key: "furniture", label: tr("أثاث", "Furniture") },
    { key: "kitchens", label: tr("مطابخ", "Kitchens") },
    { key: "windows", label: tr("نوافذ", "Windows") },
    { key: "decor", label: tr("ديكور", "Decor") },
    { key: "other", label: tr("أخرى", "Other") },
  ], [tr]);

  const load = async () => {
    const rawF = await AsyncStorage.getItem(FAMILY_KEY);
    const savedF: FamilyItem[] = rawF ? JSON.parse(rawF) : [];
    setFamilyItems([...savedF, ...FAMILY_SAMPLES]);

    const rawA = await AsyncStorage.getItem(AUCTION_KEY);
    const savedA: AuctionItem[] = rawA ? JSON.parse(rawA) : [];
    setAuctionItems([...savedA, ...AUCTION_SAMPLES]);

    const rawC = await AsyncStorage.getItem(CARPENTRY_KEY);
    const savedC: CarpentryItem[] = rawC ? JSON.parse(rawC) : [];
    setCarpentryItems([...savedC, ...CARPENTRY_SAMPLES]);
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));
  useEffect(() => { if (tab === "merchants") loadMerchants(); }, [tab, merchantCat, merchantSearch]);

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

  const saveCarpentry = async (data: Omit<CarpentryItem, "id" | "createdAt" | "status">): Promise<void> => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newItem: CarpentryItem = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8), status: "available", createdAt: new Date().toISOString() };
    const raw = await AsyncStorage.getItem(CARPENTRY_KEY);
    const existing: CarpentryItem[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(CARPENTRY_KEY, JSON.stringify([newItem, ...existing]));
    await load();
  };

  const deleteCarpentryItem = (id: string) => {
    Alert.alert(tr("تأكيد", "Confirm"), tr("هل تريد حذف هذا المحل؟", "Delete this shop?"), [
      { text: tr("إلغاء", "Cancel"), style: "cancel" },
      { text: tr("حذف", "Delete"), style: "destructive", onPress: async () => {
        const raw = await AsyncStorage.getItem(CARPENTRY_KEY);
        const saved: CarpentryItem[] = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem(CARPENTRY_KEY, JSON.stringify(saved.filter(i => i.id !== id)));
        load();
      }},
    ]);
  };

  const filteredFamily = familyItems.filter(i => familyCat === "all" || i.category === familyCat);
  const filteredAuction = auctionItems.filter(i => auctionCat === "all" || i.category === auctionCat);
  const filteredCarpentry = carpentryItems.filter(i => carpEntryCat === "all" || i.specialty === carpEntryCat);

  const activeCount = tab === "family"
    ? familyItems.filter(i => i.status === "available").length
    : tab === "auction"
    ? auctionItems.filter(i => i.status === "available").length
    : tab === "merchants"
    ? merchants.filter(m => true).length
    : carpentryItems.filter(i => i.status === "available").length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <AnimatedPress
          style={[
            styles.addBtn,
            tab === "auction" && { backgroundColor: Colors.violet },
            tab === "carpentry" && { backgroundColor: CARPENTRY_ACCENT },
            { flexDirection: isRTL ? "row-reverse" : "row" },
          ]}
          onPress={() => {
            if (auth.isGuest) {
              Alert.alert(
                tr("تسجيل مطلوب", "Login Required"),
                tr("يجب إنشاء حساب لإضافة عروض في السوق.", "You need an account to add items to the market."),
                [{ text: tr("حسناً", "OK") }]
              );
              return;
            }
            if (tab === "family") setShowFamilyModal(true);
            else if (tab === "auction") setShowAuctionModal(true);
            else if (tab === "carpentry") setShowCarpentryModal(true);
            else { setMerchantRegSuccess(false); setMerchantRegModal(true); }
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
          style={[styles.switchTab, tab === "carpentry" && styles.switchTabActive, tab === "carpentry" && { borderColor: CARPENTRY_ACCENT }, { flexDirection: isRTL ? "row-reverse" : "row" }]}
          onPress={() => setTab("carpentry")}
          scaleDown={0.92}
        >
          <MaterialCommunityIcons name="saw-blade" size={15} color={tab === "carpentry" ? CARPENTRY_ACCENT : Colors.textMuted} />
          <Text style={[styles.switchTabText, tab === "carpentry" && { color: CARPENTRY_ACCENT }]}>{tr("محلات النجارة", "Carpentry")}</Text>
        </AnimatedPress>
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
        <AnimatedPress
          style={[styles.switchTab, tab === "merchants" && styles.switchTabActive, tab === "merchants" && { borderColor: "#6366F1" }, { flexDirection: isRTL ? "row-reverse" : "row" }]}
          onPress={() => setTab("merchants")}
          scaleDown={0.92}
        >
          <MaterialCommunityIcons name="store-marker-outline" size={15} color={tab === "merchants" ? "#6366F1" : Colors.textMuted} />
          <Text style={[styles.switchTabText, tab === "merchants" && { color: "#6366F1" }]}>مساحة التجار</Text>
        </AnimatedPress>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={[styles.filterBarContent, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        {tab !== "merchants" && (tab === "family" ? FAMILY_CATS : tab === "auction" ? AUCTION_CATS : CARP_CATS).map((c) => {
          const active = tab === "family" ? familyCat === c.key : tab === "auction" ? auctionCat === c.key : carpEntryCat === c.key;
          const activeColor = tab === "family" ? Colors.primary : tab === "auction" ? Colors.violet : CARPENTRY_ACCENT;
          return (
            <AnimatedPress
              key={c.key}
              style={[styles.filterChip, active && { backgroundColor: activeColor, borderColor: activeColor }]}
              onPress={() => {
                if (tab === "family") setFamilyCat(c.key);
                else if (tab === "auction") setAuctionCat(c.key);
                else setCarpEntryCat(c.key);
              }}
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

      {tab === "carpentry" && (
        <FlatList
          key="carpentry"
          data={filteredCarpentry}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.carpBanner}>
              <View style={[styles.carpBannerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={styles.carpBannerIcon}>
                  <MaterialCommunityIcons name="saw-blade" size={22} color={CARPENTRY_ACCENT} />
                </View>
                <View style={{ flex: 1, alignItems: isRTL ? "flex-end" : "flex-start" }}>
                  <Text style={[styles.carpBannerTitle, { textAlign: isRTL ? "right" : "left" }]}>
                    {tr("محلات النجارة في الحصاحيصا", "Hasahisa Carpentry Shops")}
                  </Text>
                  <Text style={[styles.carpBannerSub, { textAlign: isRTL ? "right" : "left" }]}>
                    {tr("أبواب · أثاث · مطابخ · ديكور خشبي احترافي", "Doors · Furniture · Kitchens · Woodwork")}
                  </Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="toolbox-outline" text={tr("لا توجد محلات نجارة حالياً", "No carpentry shops yet")} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
              <CarpentryCard item={item} onDelete={deleteCarpentryItem} />
            </Animated.View>
          )}
        />
      )}

      <AddFamilyModal visible={showFamilyModal} onClose={() => setShowFamilyModal(false)} onSave={saveFamily} />
      <AddAuctionModal visible={showAuctionModal} onClose={() => setShowAuctionModal(false)} onSave={saveAuction} />
      <AddCarpentryModal visible={showCarpentryModal} onClose={() => setShowCarpentryModal(false)} onSave={saveCarpentry} />

      {/* ══ مساحة التجار ══ */}
      {tab === "merchants" && (
        <View style={{ flex:1 }}>
          {/* Merchant Registration Modal */}
          <Modal visible={merchantRegModal} transparent animationType="slide" onRequestClose={()=>setMerchantRegModal(false)}>
            <View style={{ flex:1, backgroundColor:"rgba(0,0,0,0.7)", justifyContent:"flex-end" }}>
              <Animated.View entering={FadeIn.duration(200)}>
                <View style={{ backgroundColor:Colors.cardBgElevated, borderTopLeftRadius:28, borderTopRightRadius:28, padding:24, maxHeight:"92%", borderTopWidth:1, borderColor:Colors.divider }}>
                  <View style={{ flexDirection:"row-reverse", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                    <View style={{ flexDirection:"row-reverse", alignItems:"center", gap:10 }}>
                      <View style={{ width:42,height:42,borderRadius:12,backgroundColor:"#6366F120",justifyContent:"center",alignItems:"center" }}>
                        <MaterialCommunityIcons name="store-plus-outline" size={22} color="#6366F1" />
                      </View>
                      <Text style={{ fontFamily:"Cairo_700Bold", fontSize:17, color:Colors.textPrimary }}>
                        {merchantRegSuccess ? "تم الإرسال!" : "تسجيل محلك التجاري"}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={()=>{ setMerchantRegModal(false); setMerchantRegSuccess(false); }}>
                      <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {merchantRegSuccess ? (
                    <View style={{ alignItems:"center", paddingVertical:30, gap:14 }}>
                      <View style={{ width:76,height:76,borderRadius:22,backgroundColor:Colors.primary+"20",justifyContent:"center",alignItems:"center" }}>
                        <Ionicons name="checkmark-circle" size={46} color={Colors.primary} />
                      </View>
                      <Text style={{ fontFamily:"Cairo_700Bold", fontSize:18, color:Colors.textPrimary, textAlign:"center" }}>تم استلام طلبك!</Text>
                      <Text style={{ fontFamily:"Cairo_400Regular", fontSize:14, color:Colors.textSecondary, textAlign:"center", lineHeight:22, maxWidth:280 }}>
                        ستتم مراجعة بياناتك وإضافة محلك في دليل التجار قريباً.
                      </Text>
                      <TouchableOpacity onPress={()=>{ setMerchantRegModal(false); setMerchantRegSuccess(false); }}
                        style={{ backgroundColor:Colors.primary, borderRadius:14, paddingVertical:13, paddingHorizontal:36, marginTop:6 }}>
                        <Text style={{ fontFamily:"Cairo_700Bold", fontSize:15, color:"#000" }}>حسناً</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:20 }}>
                      {/* Emoji Picker */}
                      <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:8 }}>اختر أيقونة المحل</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, flexDirection:"row-reverse", marginBottom:14 }}>
                        {["🏪","🛒","🍽️","💊","👗","📱","🔧","🎨","📦","🧁","🌿","🏗️"].map(em=>(
                          <TouchableOpacity key={em} onPress={()=>setMerchantForm(f=>({...f,logo_emoji:em}))}
                            style={{ width:44,height:44,borderRadius:12,alignItems:"center",justifyContent:"center",
                              backgroundColor: merchantForm.logo_emoji===em ? "#6366F120" : Colors.cardBg,
                              borderWidth:2, borderColor: merchantForm.logo_emoji===em ? "#6366F1" : Colors.divider }}>
                            <Text style={{ fontSize:22 }}>{em}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      {/* Fields */}
                      {([
                        { label:"اسم المحل *",   key:"shop_name",     ph:"مثال: بقالة الأمل" },
                        { label:"اسم المالك *",   key:"owner_name",    ph:"اسمك الكامل" },
                        { label:"العنوان",         key:"address",       ph:"الحي أو الشارع" },
                        { label:"رقم الهاتف *",   key:"phone",         ph:"+249XXXXXXXXX" },
                        { label:"واتساب",          key:"whatsapp",      ph:"+249XXXXXXXXX" },
                        { label:"ساعات العمل",     key:"working_hours", ph:"مثال: ٨ص–١٢م، ٤م–١٢م" },
                      ] as {label:string;key:keyof typeof merchantForm;ph:string}[]).map(field=>(
                        <View key={field.key} style={{ marginBottom:12 }}>
                          <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:5 }}>{field.label}</Text>
                          <TextInput
                            value={merchantForm[field.key] as string}
                            onChangeText={v=>setMerchantForm(f=>({...f,[field.key]:v}))}
                            placeholder={field.ph} placeholderTextColor={Colors.textMuted}
                            style={{ backgroundColor:Colors.bg, borderRadius:12, padding:12, fontFamily:"Cairo_400Regular", fontSize:14, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider, textAlign:"right" }}
                          />
                        </View>
                      ))}

                      {/* Category */}
                      <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:8 }}>نوع النشاط *</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, flexDirection:"row-reverse", marginBottom:14 }}>
                        {MERCHANT_CATS.filter(c=>c.key!=="all").map(cat=>(
                          <TouchableOpacity key={cat.key} onPress={()=>setMerchantForm(f=>({...f,category:cat.key as MerchantCat}))}
                            style={{ flexDirection:"row-reverse", alignItems:"center", gap:5, paddingHorizontal:12, paddingVertical:8, borderRadius:12,
                              backgroundColor: merchantForm.category===cat.key ? cat.color+"20" : Colors.cardBg,
                              borderWidth:1, borderColor: merchantForm.category===cat.key ? cat.color : Colors.divider }}>
                            <Text style={{ fontSize:14 }}>{cat.emoji}</Text>
                            <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:12, color: merchantForm.category===cat.key ? cat.color : Colors.textMuted }}>{cat.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      {/* Tags */}
                      <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:8 }}>مميزات المحل</Text>
                      <View style={{ flexDirection:"row-reverse", flexWrap:"wrap", gap:8, marginBottom:16 }}>
                        {MERCHANT_TAGS.map(tag=>{
                          const on = merchantForm.tags.includes(tag);
                          return (
                            <TouchableOpacity key={tag} onPress={()=>setMerchantForm(f=>({
                              ...f, tags: on ? f.tags.filter(t=>t!==tag) : [...f.tags, tag]
                            }))}
                              style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8,
                                backgroundColor: on ? "#6366F120" : Colors.cardBg,
                                borderWidth:1, borderColor: on ? "#6366F160" : Colors.divider }}>
                              <Text style={{ fontFamily:"Cairo_500Medium", fontSize:11, color: on ? "#6366F1" : Colors.textMuted }}>{tag}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Description */}
                      <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:5 }}>وصف المحل</Text>
                      <TextInput
                        value={merchantForm.description} multiline numberOfLines={3}
                        onChangeText={v=>setMerchantForm(f=>({...f,description:v}))}
                        placeholder="اذكر المنتجات والخدمات..." placeholderTextColor={Colors.textMuted}
                        style={{ backgroundColor:Colors.bg, borderRadius:12, padding:12, fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider, textAlign:"right", minHeight:80, textAlignVertical:"top", marginBottom:16 }}
                      />

                      <TouchableOpacity onPress={submitMerchantReg} disabled={merchantSubmitting}
                        style={{ borderRadius:14, overflow:"hidden" }}>
                        <View style={{ backgroundColor:"#6366F1", paddingVertical:14, alignItems:"center", borderRadius:14 }}>
                          <Text style={{ fontFamily:"Cairo_700Bold", fontSize:15, color:"#fff" }}>
                            {merchantSubmitting ? "جارٍ الإرسال..." : "إرسال طلب التسجيل"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </ScrollView>
                  )}
                </View>
              </Animated.View>
            </View>
          </Modal>

          {/* Search + category filter + register */}
          <View style={{ backgroundColor:Colors.cardBg, borderBottomWidth:1, borderBottomColor:Colors.divider }}>
            <View style={{ flexDirection:"row-reverse", gap:10, alignItems:"center", paddingHorizontal:16, paddingTop:12, paddingBottom:8 }}>
              <View style={{ flex:1, flexDirection:"row-reverse", alignItems:"center", gap:8, backgroundColor:Colors.bg, borderRadius:12, borderWidth:1, borderColor:Colors.divider, paddingHorizontal:12, paddingVertical:8 }}>
                <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
                <TextInput value={merchantSearch} onChangeText={setMerchantSearch}
                  placeholder="ابحث عن محل أو خدمة..." placeholderTextColor={Colors.textMuted}
                  style={{ flex:1, fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textPrimary, textAlign:"right" }} />
                {merchantSearch.length>0 && <TouchableOpacity onPress={()=>setMerchantSearch("")}><Ionicons name="close-circle" size={16} color={Colors.textMuted} /></TouchableOpacity>}
              </View>
              <TouchableOpacity onPress={()=>{ setMerchantRegSuccess(false); setMerchantRegModal(true); }}
                style={{ backgroundColor:"#6366F1", borderRadius:12, paddingHorizontal:14, paddingVertical:10, flexDirection:"row-reverse", alignItems:"center", gap:5 }}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:12, color:"#fff" }}>سجّل</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, flexDirection:"row-reverse", paddingHorizontal:16, paddingBottom:10 }}>
              {MERCHANT_CATS.map(cat=>(
                <TouchableOpacity key={cat.key} onPress={()=>setMerchantCat(cat.key)}
                  style={{ flexDirection:"row-reverse", alignItems:"center", gap:5, paddingHorizontal:12, paddingVertical:7, borderRadius:20,
                    backgroundColor: merchantCat===cat.key ? cat.color+"20" : Colors.cardBg,
                    borderWidth:1, borderColor: merchantCat===cat.key ? cat.color+"60" : Colors.divider }}>
                  <Text style={{ fontSize:12 }}>{cat.emoji}</Text>
                  <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:12, color: merchantCat===cat.key ? cat.color : Colors.textMuted }}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Merchant list */}
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:130, gap:12 }} showsVerticalScrollIndicator={false}>
            {merchantLoading ? (
              <View style={{ alignItems:"center", paddingVertical:60 }}>
                <MaterialCommunityIcons name="store-clock-outline" size={48} color={Colors.textMuted} style={{ opacity:0.3, marginBottom:10 }} />
                <Text style={{ fontFamily:"Cairo_500Medium", fontSize:14, color:Colors.textMuted }}>جارٍ التحميل...</Text>
              </View>
            ) : merchants.length === 0 ? (
              <Animated.View entering={FadeInDown.springify()} style={{ alignItems:"center", paddingVertical:60 }}>
                <View style={{ width:92,height:92,borderRadius:28,backgroundColor:"#6366F115",justifyContent:"center",alignItems:"center",marginBottom:16 }}>
                  <MaterialCommunityIcons name="store-outline" size={48} color="#6366F1" />
                </View>
                <Text style={{ fontFamily:"Cairo_700Bold", fontSize:17, color:Colors.textSecondary, marginBottom:8, textAlign:"center" }}>لا يوجد تجار مسجّلون بعد</Text>
                <Text style={{ fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textMuted, textAlign:"center", lineHeight:20, maxWidth:260 }}>
                  سجّل محلك التجاري وكن ضمن أول التجار في دليل حصاحيصا
                </Text>
                <TouchableOpacity onPress={()=>{ setMerchantRegSuccess(false); setMerchantRegModal(true); }}
                  style={{ marginTop:20, backgroundColor:"#6366F1", borderRadius:14, paddingVertical:12, paddingHorizontal:28, flexDirection:"row-reverse", alignItems:"center", gap:8 }}>
                  <Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text style={{ fontFamily:"Cairo_700Bold", fontSize:14, color:"#fff" }}>سجّل محلك الآن</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              merchants.map((m, i) => {
                const cat = MERCHANT_CATS.find(c=>c.key===m.category) ?? MERCHANT_CATS[0];
                return (
                  <Animated.View key={m.id} entering={FadeInDown.delay(i*70).springify().damping(18)}>
                    <View style={{ backgroundColor:Colors.cardBg, borderRadius:20, borderWidth:1,
                      borderColor: m.is_featured ? cat.color+"50" : Colors.divider, overflow:"hidden" }}>
                      {m.is_featured && (
                        <View style={{ backgroundColor:cat.color+"18", paddingHorizontal:14, paddingVertical:6, flexDirection:"row-reverse", alignItems:"center", gap:6 }}>
                          <MaterialCommunityIcons name="star-circle" size={14} color={cat.color} />
                          <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:11, color:cat.color }}>محل مميّز</Text>
                        </View>
                      )}
                      <View style={{ padding:16 }}>
                        {/* Header row */}
                        <View style={{ flexDirection:"row-reverse", alignItems:"center", gap:12, marginBottom:10 }}>
                          <View style={{ width:54,height:54,borderRadius:16,backgroundColor:cat.color+"18",alignItems:"center",justifyContent:"center" }}>
                            <Text style={{ fontSize:28 }}>{m.logo_emoji}</Text>
                          </View>
                          <View style={{ flex:1 }}>
                            <View style={{ flexDirection:"row-reverse", alignItems:"center", gap:6 }}>
                              <Text style={{ fontFamily:"Cairo_700Bold", fontSize:15, color:Colors.textPrimary }}>{m.shop_name}</Text>
                              {m.is_verified && <MaterialCommunityIcons name="check-decagram" size={16} color="#6366F1" />}
                            </View>
                            <Text style={{ fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, textAlign:"right", marginTop:2 }}>{m.owner_name}</Text>
                            <View style={{ flexDirection:"row-reverse", gap:6, marginTop:4, flexWrap:"wrap" }}>
                              <View style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:6, backgroundColor:cat.color+"15", borderWidth:1, borderColor:cat.color+"30" }}>
                                <Text style={{ fontFamily:"Cairo_500Medium", fontSize:10, color:cat.color }}>{cat.emoji} {cat.label}</Text>
                              </View>
                            </View>
                          </View>
                        </View>

                        {/* Description */}
                        {m.description ? <Text style={{ fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textSecondary, textAlign:"right", lineHeight:20, marginBottom:10 }}>{m.description}</Text> : null}

                        {/* Address + Hours */}
                        {(m.address || m.working_hours) ? (
                          <View style={{ gap:5, marginBottom:10 }}>
                            {m.address ? (
                              <View style={{ flexDirection:"row-reverse", alignItems:"center", gap:6 }}>
                                <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
                                <Text style={{ fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textMuted, flex:1, textAlign:"right" }}>{m.address}</Text>
                              </View>
                            ) : null}
                            {m.working_hours ? (
                              <View style={{ flexDirection:"row-reverse", alignItems:"center", gap:6 }}>
                                <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                                <Text style={{ fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textMuted, flex:1, textAlign:"right" }}>{m.working_hours}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}

                        {/* Tags */}
                        {m.tags?.length > 0 && (
                          <View style={{ flexDirection:"row-reverse", flexWrap:"wrap", gap:6, marginBottom:12 }}>
                            {m.tags.slice(0,5).map((tag:string)=>(
                              <View key={tag} style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:6, backgroundColor:Colors.bg, borderWidth:1, borderColor:Colors.divider }}>
                                <Text style={{ fontFamily:"Cairo_500Medium", fontSize:10, color:Colors.textSecondary }}>{tag}</Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {/* Contact buttons */}
                        <View style={{ flexDirection:"row-reverse", gap:8 }}>
                          {m.phone ? (
                            <TouchableOpacity onPress={()=>{ require("react-native").Linking.openURL(`tel:${m.phone}`); }}
                              style={{ flex:1, flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:6, backgroundColor:"#10B98118", borderRadius:12, paddingVertical:10, borderWidth:1, borderColor:"#10B98130" }}>
                              <Ionicons name="call-outline" size={15} color="#10B981" />
                              <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:"#10B981" }}>اتصال</Text>
                            </TouchableOpacity>
                          ) : null}
                          {m.whatsapp ? (
                            <TouchableOpacity onPress={()=>{ require("react-native").Linking.openURL(`https://wa.me/${m.whatsapp?.replace(/\D/g,"")}`); }}
                              style={{ flex:1, flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:6, backgroundColor:"#25D36618", borderRadius:12, paddingVertical:10, borderWidth:1, borderColor:"#25D36630" }}>
                              <MaterialCommunityIcons name="whatsapp" size={15} color="#25D366" />
                              <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:"#25D366" }}>واتساب</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </ScrollView>
        </View>
      )}
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
  // ─── Carpentry Styles ───────────────────────────────────────────────────────
  carpCard: {
    backgroundColor: Colors.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#7D4E2D", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
    overflow: "hidden",
  },
  carpAccentBar: {
    position: "absolute", top: 0, bottom: 0, left: 0,
    width: 5, borderTopLeftRadius: 18, borderBottomLeftRadius: 18,
  },
  carpHeader: { flexDirection: "row-reverse", padding: 14, gap: 12, alignItems: "flex-start" },
  carpIconWrap: {
    width: 58, height: 58, borderRadius: 16,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
    borderWidth: 1, borderColor: "#7D4E2D22",
  },
  carpHeaderInfo: { flex: 1, gap: 5 },
  carpShopName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  carpTagsRow: { flexDirection: "row-reverse", gap: 6, flexWrap: "wrap" },
  carpSpecBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1,
  },
  carpSpecText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  carpLocBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 3,
    backgroundColor: Colors.bg, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.divider,
    maxWidth: 160,
  },
  carpLocText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  carpStarsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  carpOwnerName: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textSecondary, marginStart: 6 },
  carpBody: { paddingHorizontal: 14, paddingVertical: 12, gap: 5 },
  carpProductName: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary },
  carpFooter: {
    flexDirection: "row-reverse", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10,
  },
  carpPriceWrap: { alignItems: "flex-end" },
  carpPriceFrom: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  carpPriceValue: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  carpPriceCurrency: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  carpQuoteBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    borderRadius: 9, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1,
  },
  carpQuoteText: { fontFamily: "Cairo_500Medium", fontSize: 12 },
  // Carpentry Banner
  carpBanner: {
    backgroundColor: "#7D4E2D12",
    borderRadius: 14, borderWidth: 1, borderColor: "#7D4E2D30",
    marginBottom: 4, padding: 12,
  },
  carpBannerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  carpBannerIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: "#7D4E2D18",
    justifyContent: "center", alignItems: "center",
  },
  carpBannerTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#7D4E2D" },
  carpBannerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  // Stars input
  carpStarsInput: { gap: 6, paddingVertical: 4 },
});
