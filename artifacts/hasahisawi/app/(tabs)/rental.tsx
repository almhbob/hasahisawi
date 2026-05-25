import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, Linking,
  RefreshControl, Image, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import OrgInviteCard from "@/components/OrgInviteCard";


const API = () => getApiUrl() || "https://hasahisawi-api-asim-abdulrahman-mohammed.vercel.app";

// ─── Types ────────────────────────────────────────────────────────
type RentalType = "real_estate" | "event_tools" | "construction_tools";

interface Listing {
  id: number;
  owner_name: string;
  owner_phone: string;
  owner_whatsapp?: string;
  title: string;
  description: string;
  rental_type: RentalType;
  sub_type?: string;
  neighborhood?: string;
  address?: string;
  price_per_day?: number;
  price_per_week?: number;
  price_per_month?: number;
  deposit_amount?: number;
  images?: string[];
  status: string;
  views: number;
  is_verified: boolean;
  created_at: string;
}

interface Contract {
  id: number;
  listing_id: number;
  listing_title: string;
  rental_type: string;
  owner_name: string;
  owner_phone: string;
  renter_name: string;
  renter_phone: string;
  neighborhood?: string;
  address?: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  commission_amount: number;
  from_app: boolean;
  deposit_amount?: number;
  commission_paid: boolean;
  payment_proof_url?: string;
  owner_signed: boolean;
  renter_signed: boolean;
  status: string;
  conditions?: string;
  created_at: string;
}

interface RentalSettings {
  rental_account_number: string;
  rental_whatsapp: string;
  rental_commission_pct: string;
}

// ─── Constants ────────────────────────────────────────────────────
const RENTAL_TYPES: { key: RentalType; label: string; icon: string; color: string }[] = [
  { key: "real_estate",       label: "عقارات",          icon: "home",               color: "#3E9CBF" },
  { key: "event_tools",       label: "أدوات مناسبات",   icon: "party-popper",       color: "#F97316" },
  { key: "construction_tools",label: "معدات بناء",      icon: "hammer-wrench",      color: "#8B5CF6" },
];

const REAL_ESTATE_SUBTYPES = ["شقة", "منزل", "محل تجاري", "مكتب", "أرض", "مستودع", "أخرى"];
const EVENT_SUBTYPES        = ["خيمة", "كراسي وطاولات", "صوتيات وإضاءة", "مولدات", "أطباق وأدوات", "أخرى"];
const CONSTRUCTION_SUBTYPES = ["لودر وجريدر", "خلاطة اسمنت", "سقالات", "مولد كهرباء", "ضخة مياه", "أخرى"];

const NEIGHBORHOODS = [
  "الحي الشرقي", "الحي الأوسط", "حي الواحة", "حي الصفاء", "حي الزهور",
  "حي العمدة", "حي الموظفين", "حي كريمة", "الامتداد", "الحلة الجديدة",
  "المنصورة", "أركويت", "ود الكامل", "خارج المدينة",
];

// ─── Helpers ──────────────────────────────────────────────────────
function formatPrice(listing: Listing): string {
  if (listing.price_per_month) return `${listing.price_per_month.toLocaleString()} ج.س / شهر`;
  if (listing.price_per_week)  return `${listing.price_per_week.toLocaleString()} ج.س / أسبوع`;
  if (listing.price_per_day)   return `${listing.price_per_day.toLocaleString()} ج.س / يوم`;
  return "السعر عند الاتصال";
}

function typeLabel(t: string) {
  return RENTAL_TYPES.find(r => r.key === t)?.label || t;
}

function typeColor(t: string) {
  return RENTAL_TYPES.find(r => r.key === t)?.color || Colors.accent;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("ar-SD", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Contract Text (Sudanese Law) ─────────────────────────────────
function buildContractText(c: Contract, settings: RentalSettings): string {
  const pct = settings.rental_commission_pct || "5";
  const account = settings.rental_account_number || "1471388";
  const today = new Date().toLocaleDateString("ar-SD", { year:"numeric", month:"long", day:"numeric" });

  return `
══════════════════════════════════════
عقد إيجار رقمي معتمد
الرقم المرجعي: EC-${c.id}-${c.listing_id}
التاريخ: ${today}
مكان التعاقد: الحصاحيصا، ولاية الجزيرة — السودان
══════════════════════════════════════

أولاً: أطراف العقد
───────────────────
الطرف الأول (المؤجر):
الاسم: ${c.owner_name}
الهاتف: ${c.owner_phone}

الطرف الثاني (المستأجر):
الاسم: ${c.renter_name}
الهاتف: ${c.renter_phone}

ثانياً: محل العقد
───────────────────
نوع المأجور: ${typeLabel(c.rental_type)}
الاسم/الوصف: ${c.listing_title}
${c.neighborhood ? `الحي: ${c.neighborhood}` : ""}
${c.address ? `العنوان: ${c.address}` : ""}

ثالثاً: مدة الإيجار
───────────────────
من تاريخ: ${formatDate(c.start_date)}
إلى تاريخ: ${formatDate(c.end_date)}

رابعاً: بدل الإيجار
───────────────────
المبلغ الإجمالي: ${c.total_amount.toLocaleString()} جنيه سوداني
${c.deposit_amount ? `التأمين: ${c.deposit_amount} ج.س (مستردّ)` : ""}
طريقة الدفع: متفق عليها بين الطرفين

خامساً: شهادة التطبيق
───────────────────────
يُقر الطرفان بأن هذا العقد أُبرم عبر تطبيق "حصاحيصاوي" الذي يعمل بصفة الشاهد الرقمي على هذه المعاملة. يُعدّ هذا العقد المحفوظ على الخادم وثيقةً إلكترونية معتمدة وفق أحكام قانون المعاملات الإلكترونية السوداني، ويُحتجّ به في أي نزاع قانوني.

سادساً: الشروط والأحكام
────────────────────────
1. يلتزم المستأجر بالمحافظة على المأجور وإعادته بحالته الأصلية عند انتهاء مدة العقد.
2. لا يحق للمستأجر التأجير من الباطن إلا بموافقة خطية صريحة من المؤجر.
3. يتحمل المستأجر كامل المسؤولية عن أي ضرر أو فقدان يلحق بالمأجور نتيجة إهماله أو سوء استخدامه.
4. يلتزم المستأجر بسداد بدل الإيجار في المواعيد المتفق عليها، وإلا جاز للمؤجر فسخ العقد فوراً بعد إشعار رسمي.
5. في حال وقوع نزاع، تُعدّ الوثائق المحفوظة على منصة حصاحيصاوي المرجعَ الأوّل والحاسم، ويلتزم الطرفان بالتحكيم الودّي قبل اللجوء للقضاء.
6. يُطبَّق على هذا العقد قانون المعاملات المدنية السوداني لسنة 1984 وقانون الإيجارات المعمول به في ولاية الجزيرة.
7. أي تعديل على هذا العقد يجب أن يتم كتابةً وبموافقة الطرفين وتسجيله على المنصة.
${c.conditions ? `\nشروط إضافية متفق عليها:\n${c.conditions}` : ""}

سابعاً: عمولة المنصة
───────────────────────
وفقاً لاتفاقية استخدام منصة حصاحيصاوي، يتعهد مقدّم الخدمة (المؤجر) بسداد نسبة ${pct}% من إجمالي بدل الإيجار (${c.commission_amount.toLocaleString()} ج.س) لصالح المنصة، وذلك حصراً في حال جاء المستأجر عن طريق التطبيق. تُحوَّل العمولة على الحساب: ${account}، مع إرفاق إشعار التحويل.
${!c.from_app ? "* ملاحظة: تم الإعفاء من العمولة — المستأجر جاء من خارج التطبيق." : ""}

ثامناً: التوقيع الرقمي
───────────────────────
الطرف الأول (المؤجر): ${c.owner_signed ? "✅ وقّع رقمياً بتاريخ " + formatDate(c.start_date) : "⏳ في انتظار التوقيع"}
الطرف الثاني (المستأجر): ${c.renter_signed ? "✅ وقّع رقمياً" : "⏳ في انتظار التوقيع"}

══════════════════════════════════════
هذا العقد وثيقة رقمية معتمدة
تطبيق حصاحيصاوي 🤝 — حصاحيصا، السودان
══════════════════════════════════════
`.trim();
}

// ═══════════════════════════════════════════════════════════════════
export default function RentalScreen() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<"browse" | "post" | "contracts">("browse");

  // ── Browse state ────
  const [listings, setListings]     = useState<Listing[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<"all" | RentalType>("all");
  const [filterNbr, setFilterNbr]   = useState("");
  const [filterMax, setFilterMax]   = useState("");
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<Listing | null>(null);

  // ── Post state ──────
  const [postLoading, setPostLoading] = useState(false);
  const [form, setForm] = useState({
    owner_name: user?.name || "", owner_phone: "", owner_whatsapp: "",
    title: "", description: "", rental_type: "real_estate" as RentalType,
    sub_type: "", neighborhood: "", address: "",
    price_per_day: "", price_per_week: "", price_per_month: "", deposit_amount: "",
  });

  // ── Contracts state ─
  const [contracts, setContracts]         = useState<Contract[]>([]);
  const [contractLoading, setContractLoading] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showContractModal, setShowContractModal] = useState(false);

  // ── New contract modal ──
  const [showContractForm, setShowContractForm] = useState(false);
  const [contractListing, setContractListing] = useState<Listing | null>(null);
  const [contractForm, setContractForm] = useState({
    renter_name: user?.name || "", renter_phone: "",
    start_date: "", end_date: "", total_amount: "", from_app: true, conditions: "",
  });

  // ── Settings ────────
  const [settings, setSettings] = useState<RentalSettings>({
    rental_account_number: "1471388", rental_whatsapp: "249916897578", rental_commission_pct: "5",
  });

  // ── Load settings ───
  useEffect(() => {
    fetch(`${API()}/api/rentals/settings`)
      .then(r => r.json())
      .then(s => { if (s.rental_account_number) setSettings(s); })
      .catch(() => {});
  }, []);

  // ── Load listings ───
  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (filterNbr.trim())    params.set("neighborhood", filterNbr.trim());
      if (filterMax.trim())    params.set("max_price", filterMax.trim());
      if (search.trim())       params.set("search", search.trim());
      const r = await fetch(`${API()}/api/rentals?${params}`);
      const data = await r.json();
      setListings(Array.isArray(data) ? data : []);
    } catch { setListings([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filterType, filterNbr, filterMax, search]);

  useEffect(() => { if (tab === "browse") loadListings(); }, [tab, filterType, loadListings]);

  // ── Load contracts ──
  const loadContracts = useCallback(async () => {
    if (!user || !token) return;
    setContractLoading(true);
    try {
      const r = await fetch(`${API()}/api/rentals/contracts/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      setContracts(Array.isArray(data) ? data : []);
    } catch { setContracts([]); }
    finally { setContractLoading(false); }
  }, [user, token]);

  useEffect(() => { if (tab === "contracts") loadContracts(); }, [tab, loadContracts]);

  // ── Submit listing ──
  const handlePost = async () => {
    if (!form.owner_name || !form.owner_phone || !form.title || !form.description) {
      Alert.alert("تنبيه", "يرجى ملء جميع الحقول الإلزامية"); return;
    }
    setPostLoading(true);
    try {
      const body: any = { ...form };
      if (form.price_per_day)   body.price_per_day   = parseFloat(form.price_per_day);
      if (form.price_per_week)  body.price_per_week  = parseFloat(form.price_per_week);
      if (form.price_per_month) body.price_per_month = parseFloat(form.price_per_month);
      if (form.deposit_amount)  body.deposit_amount  = parseFloat(form.deposit_amount);
      const r = await fetch(`${API()}/api/rentals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        Alert.alert("تم النشر", "تم نشر إعلانك بنجاح! سيظهر في قائمة الإعلانات.");
        setForm({ owner_name: user?.name||"", owner_phone:"", owner_whatsapp:"", title:"", description:"", rental_type:"real_estate", sub_type:"", neighborhood:"", address:"", price_per_day:"", price_per_week:"", price_per_month:"", deposit_amount:"" });
        setTab("browse");
      } else {
        const j = await r.json();
        Alert.alert("خطأ", j.error || "فشل النشر");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setPostLoading(false); }
  };

  // ── Create contract ──
  const handleCreateContract = async () => {
    if (!contractListing) return;
    if (!contractForm.renter_name || !contractForm.renter_phone || !contractForm.start_date || !contractForm.end_date || !contractForm.total_amount) {
      Alert.alert("تنبيه", "يرجى ملء جميع الحقول الإلزامية"); return;
    }
    if (!user) { Alert.alert("تسجيل الدخول", "يجب تسجيل الدخول لإبرام عقد"); return; }
    setPostLoading(true);
    try {
      const r = await fetch(`${API()}/api/rentals/${contractListing.id}/contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...contractForm,
          total_amount: parseFloat(contractForm.total_amount),
        }),
      });
      const j = await r.json();
      if (r.ok) {
        setShowContractForm(false);
        Alert.alert("تم إنشاء العقد", "تم إنشاء العقد بنجاح. يمكنك الاطلاع عليه في تبويب «عقودي» وتوقيعه.");
        setTab("contracts");
      } else {
        Alert.alert("خطأ", j.error || "فشل إنشاء العقد");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setPostLoading(false); }
  };

  // ── Sign contract ───
  const handleSign = async (contract: Contract, role: "owner" | "renter") => {
    Alert.alert(
      "تأكيد التوقيع",
      "بتوقيعك على هذا العقد تقرّ بالالتزام بجميع بنوده وشروطه وتتحمل المسؤولية القانونية في حال الإخلال بها.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "أوقّع وأوافق",
          onPress: async () => {
            try {
              const r = await fetch(`${API()}/api/rentals/contracts/${contract.id}/sign`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ role }),
              });
              if (r.ok) {
                loadContracts();
                Alert.alert("تم التوقيع", "تم توقيعك على العقد بنجاح.");
              }
            } catch { Alert.alert("خطأ", "تعذّر التوقيع"); }
          },
        },
      ]
    );
  };

  // ── Payment + WhatsApp ──
  const handlePayCommission = (contract: Contract) => {
    const msg =
      `🏠 *إشعار عمولة إيجار — تطبيق حصاحيصاوي*\n\n` +
      `رقم العقد: EC-${contract.id}-${contract.listing_id}\n` +
      `العقار/الخدمة: ${contract.listing_title}\n` +
      `المؤجر: ${contract.owner_name} — ${contract.owner_phone}\n` +
      `المستأجر: ${contract.renter_name} — ${contract.renter_phone}\n` +
      `إجمالي الإيجار: ${contract.total_amount.toLocaleString()} ج.س\n` +
      `العمولة المستحقة (${settings.rental_commission_pct}%): ${contract.commission_amount.toLocaleString()} ج.س\n` +
      `رقم الحساب: *${settings.rental_account_number}*\n\n` +
      `يرجى مراجعة الحساب والتأكد من استلام المبلغ.\n` +
      `📎 مرفق: إشعار التحويل`;
    const wa = settings.rental_whatsapp?.replace(/[^0-9]/g, "") || "249916897578";
    Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`);
  };

  // ── Listing Card ────────────────────────────────────────────────
  const ListingCard = ({ item }: { item: Listing }) => (
    <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: typeColor(item.rental_type) + "22" }]}>
          <Text style={[styles.typeBadgeText, { color: typeColor(item.rental_type) }]}>{typeLabel(item.rental_type)}</Text>
        </View>
        {item.is_verified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#3EFF9C" />
            <Text style={styles.verifiedText}>موثّق</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      {item.sub_type ? <Text style={styles.cardSub}>{item.sub_type}</Text> : null}
      <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
      <View style={styles.cardFooter}>
        {item.neighborhood ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.cardMeta}>{item.neighborhood}</Text>
          </View>
        ) : null}
        <Text style={styles.cardPrice}>{formatPrice(item)}</Text>
      </View>
    </TouchableOpacity>
  );

  // ── Contract Card ───────────────────────────────────────────────
  const ContractCard = ({ c }: { c: Contract }) => {
    const isOwner  = c.owner_name === user?.name;
    const canSign  = (isOwner && !c.owner_signed) || (!isOwner && !c.renter_signed);
    const statusColor = c.status === "active" ? "#3EFF9C" : c.status === "disputed" ? Colors.danger : c.status === "completed" ? "#A3A3A3" : "#FBBF24";
    const statusLabel = c.status === "active" ? "نشط" : c.status === "disputed" ? "نزاع" : c.status === "completed" ? "منتهي" : "قيد الإنجاز";
    return (
      <View style={styles.contractCard}>
        <View style={styles.contractHeader}>
          <View>
            <Text style={styles.contractTitle}>{c.listing_title}</Text>
            <Text style={styles.contractSub}>{typeLabel(c.rental_type)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={styles.contractInfo}>
          <Text style={styles.contractMeta}>المؤجر: {c.owner_name}</Text>
          <Text style={styles.contractMeta}>المستأجر: {c.renter_name}</Text>
          <Text style={styles.contractMeta}>من {formatDate(c.start_date)} إلى {formatDate(c.end_date)}</Text>
          <Text style={styles.contractMeta}>المبلغ: {c.total_amount.toLocaleString()} ج.س</Text>
          {c.from_app && <Text style={styles.contractMeta}>العمولة: {c.commission_amount.toLocaleString()} ج.س</Text>}
        </View>
        <View style={styles.sigRow}>
          <View style={styles.sigItem}>
            <Ionicons name={c.owner_signed ? "checkmark-circle" : "ellipse-outline"} size={16} color={c.owner_signed ? "#3EFF9C" : Colors.textMuted} />
            <Text style={styles.sigText}>المؤجر</Text>
          </View>
          <View style={styles.sigItem}>
            <Ionicons name={c.renter_signed ? "checkmark-circle" : "ellipse-outline"} size={16} color={c.renter_signed ? "#3EFF9C" : Colors.textMuted} />
            <Text style={styles.sigText}>المستأجر</Text>
          </View>
        </View>
        <View style={styles.contractActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => { setSelectedContract(c); setShowContractModal(true); }}>
            <Ionicons name="document-text-outline" size={15} color={Colors.accent} />
            <Text style={styles.actionBtnText}>عرض العقد</Text>
          </TouchableOpacity>
          {canSign && c.status === "pending" && (
            <TouchableOpacity style={[styles.actionBtn, styles.signBtn]} onPress={() => handleSign(c, isOwner ? "owner" : "renter")}>
              <Ionicons name="pencil-outline" size={15} color="#000" />
              <Text style={[styles.actionBtnText, { color: "#000" }]}>وقّع العقد</Text>
            </TouchableOpacity>
          )}
          {c.from_app && !c.commission_paid && c.status === "active" && isOwner && (
            <TouchableOpacity style={[styles.actionBtn, styles.payBtn]} onPress={() => handlePayCommission(c)}>
              <Ionicons name="logo-whatsapp" size={15} color="#fff" />
              <Text style={[styles.actionBtnText, { color: "#fff" }]}>دفع العمولة</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <MaterialCommunityIcons name="home-city-outline" size={22} color={Colors.accent} />
        <Text style={styles.headerTitle}>قسم التأجير</Text>
        <Text style={styles.headerSub}>عقارات · مناسبات · بناء</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["browse","post","contracts"] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "browse" ? "🏠 عروض" : t === "post" ? "➕ أضف عرضاً" : "📄 عقودي"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── BROWSE ── */}
      {tab === "browse" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadListings(); }} tintColor={Colors.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Filter bar */}
          <View style={styles.filterBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity style={[styles.filterChip, filterType==="all" && styles.filterChipActive]} onPress={() => setFilterType("all")}>
                <Text style={[styles.filterChipText, filterType==="all" && styles.filterChipTextActive]}>الكل</Text>
              </TouchableOpacity>
              {RENTAL_TYPES.map(rt => (
                <TouchableOpacity key={rt.key} style={[styles.filterChip, filterType===rt.key && styles.filterChipActive, filterType===rt.key && { borderColor: rt.color }]} onPress={() => setFilterType(rt.key)}>
                  <Text style={[styles.filterChipText, filterType===rt.key && { color: rt.color }]}>{rt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Search + filters */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="ابحث..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={loadListings}
                returnKeyType="search"
              />
            </View>
            <TouchableOpacity style={styles.searchBtn} onPress={loadListings}>
              <Text style={styles.searchBtnText}>بحث</Text>
            </TouchableOpacity>
          </View>

          {/* Neighborhood + max price */}
          <View style={styles.filterRow}>
            <View style={[styles.searchBox, { flex: 1, marginLeft: 6 }]}>
              <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="الحي..."
                placeholderTextColor={Colors.textMuted}
                value={filterNbr}
                onChangeText={setFilterNbr}
              />
            </View>
            <View style={[styles.searchBox, { flex: 1, marginRight: 6 }]}>
              <Ionicons name="cash-outline" size={14} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="أقصى سعر..."
                placeholderTextColor={Colors.textMuted}
                value={filterMax}
                onChangeText={setFilterMax}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Notice */}
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.accent} />
            <Text style={styles.noticeText}>
              عند إبرام عقد عبر التطبيق، تُستحق عمولة {settings.rental_commission_pct}% على مقدّم الخدمة.
              يعمل التطبيق شاهداً رقمياً معتمداً في حالات النزاع.
            </Text>
          </View>

          {/* Listings */}
          {loading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
          ) : listings.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="home-search-outline" size={60} color={Colors.textMuted} />
              <Text style={styles.emptyText}>لا توجد عروض إيجار حالياً</Text>
              <Text style={styles.emptySubText}>كن أول من ينشر إعلاناً!</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setTab("post")}>
                <Text style={styles.emptyBtnText}>أضف عرضاً الآن</Text>
              </TouchableOpacity>
            </View>
          ) : (
            listings.map(item => <ListingCard key={item.id} item={item} />)
          )}
        </ScrollView>
      )}

      {/* ── POST ── */}
      {tab === "post" && (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>بيانات صاحب العرض</Text>
            <TextInput style={styles.input} placeholder="الاسم الكامل *" placeholderTextColor={Colors.textMuted} value={form.owner_name} onChangeText={v => setForm(f=>({...f,owner_name:v}))} />
            <TextInput style={styles.input} placeholder="رقم الهاتف *" placeholderTextColor={Colors.textMuted} value={form.owner_phone} onChangeText={v => setForm(f=>({...f,owner_phone:v}))} keyboardType="phone-pad" />
            <TextInput style={styles.input} placeholder="رقم الواتساب (اختياري)" placeholderTextColor={Colors.textMuted} value={form.owner_whatsapp} onChangeText={v => setForm(f=>({...f,owner_whatsapp:v}))} keyboardType="phone-pad" />

            <Text style={styles.sectionTitle}>نوع الإعلان</Text>
            <View style={styles.typeSelector}>
              {RENTAL_TYPES.map(rt => (
                <TouchableOpacity key={rt.key} style={[styles.typeChip, form.rental_type===rt.key && { backgroundColor: rt.color+"30", borderColor: rt.color }]} onPress={() => setForm(f=>({...f,rental_type:rt.key,sub_type:""}))}>
                  <Text style={[styles.typeChipText, form.rental_type===rt.key && { color: rt.color }]}>{rt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>التصنيف الفرعي</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {(form.rental_type==="real_estate" ? REAL_ESTATE_SUBTYPES : form.rental_type==="event_tools" ? EVENT_SUBTYPES : CONSTRUCTION_SUBTYPES).map(s => (
                <TouchableOpacity key={s} style={[styles.filterChip, form.sub_type===s && styles.filterChipActive]} onPress={() => setForm(f=>({...f,sub_type:s}))}>
                  <Text style={[styles.filterChipText, form.sub_type===s && styles.filterChipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.sectionTitle}>تفاصيل العرض</Text>
            <TextInput style={styles.input} placeholder="عنوان الإعلان *" placeholderTextColor={Colors.textMuted} value={form.title} onChangeText={v => setForm(f=>({...f,title:v}))} />
            <TextInput style={[styles.input, styles.textArea]} placeholder="وصف تفصيلي *" placeholderTextColor={Colors.textMuted} value={form.description} onChangeText={v => setForm(f=>({...f,description:v}))} multiline numberOfLines={4} textAlignVertical="top" />

            <Text style={styles.sectionTitle}>الموقع</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {NEIGHBORHOODS.map(n => (
                <TouchableOpacity key={n} style={[styles.filterChip, form.neighborhood===n && styles.filterChipActive]} onPress={() => setForm(f=>({...f,neighborhood:n}))}>
                  <Text style={[styles.filterChipText, form.neighborhood===n && styles.filterChipTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput style={styles.input} placeholder="العنوان التفصيلي (اختياري)" placeholderTextColor={Colors.textMuted} value={form.address} onChangeText={v => setForm(f=>({...f,address:v}))} />

            <Text style={styles.sectionTitle}>التسعير (اختياري)</Text>
            <View style={styles.priceRow}>
              <TextInput style={[styles.input, styles.priceInput]} placeholder="يومي (ج.س)" placeholderTextColor={Colors.textMuted} value={form.price_per_day} onChangeText={v => setForm(f=>({...f,price_per_day:v}))} keyboardType="numeric" />
              <TextInput style={[styles.input, styles.priceInput]} placeholder="أسبوعي (ج.س)" placeholderTextColor={Colors.textMuted} value={form.price_per_week} onChangeText={v => setForm(f=>({...f,price_per_week:v}))} keyboardType="numeric" />
              <TextInput style={[styles.input, styles.priceInput]} placeholder="شهري (ج.س)" placeholderTextColor={Colors.textMuted} value={form.price_per_month} onChangeText={v => setForm(f=>({...f,price_per_month:v}))} keyboardType="numeric" />
            </View>
            <TextInput style={styles.input} placeholder="التأمين / الضمان (ج.س)" placeholderTextColor={Colors.textMuted} value={form.deposit_amount} onChangeText={v => setForm(f=>({...f,deposit_amount:v}))} keyboardType="numeric" />

            <View style={styles.commissionNote}>
              <Ionicons name="shield-checkmark-outline" size={16} color={Colors.accent} />
              <Text style={styles.commissionNoteText}>
                عند إبرام عقد عبر التطبيق، يستحق التطبيق عمولة {settings.rental_commission_pct}% من المبلغ الإجمالي
                تُحوَّل على الحساب: <Text style={{ color: Colors.accent, fontWeight: "bold" }}>{settings.rental_account_number}</Text>
              </Text>
            </View>

            <TouchableOpacity style={[styles.submitBtn, postLoading && { opacity: 0.7 }]} onPress={handlePost} disabled={postLoading}>
              {postLoading ? <ActivityIndicator color="#000" /> : <Text style={styles.submitBtnText}>نشر الإعلان</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── CONTRACTS ── */}
      {tab === "contracts" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!user ? (
            <View style={styles.empty}>
              <Ionicons name="lock-closed-outline" size={60} color={Colors.textMuted} />
              <Text style={styles.emptyText}>يجب تسجيل الدخول</Text>
              <Text style={styles.emptySubText}>لمشاهدة عقودك يجب تسجيل الدخول أولاً</Text>
            </View>
          ) : contractLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
          ) : contracts.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={60} color={Colors.textMuted} />
              <Text style={styles.emptyText}>لا توجد عقود بعد</Text>
              <Text style={styles.emptySubText}>عند إبرام عقد يظهر هنا</Text>
            </View>
          ) : (
            contracts.map(c => <ContractCard key={c.id} c={c} />)
          )}
        </ScrollView>
      )}

      {/* ── Listing Detail Modal ── */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{selected.title}</Text>
              <View style={{ width: 24 }} />
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              <View style={[styles.typeBadge, { alignSelf: "flex-start", marginBottom: 12, backgroundColor: typeColor(selected.rental_type) + "22" }]}>
                <Text style={[styles.typeBadgeText, { color: typeColor(selected.rental_type) }]}>{typeLabel(selected.rental_type)}{selected.sub_type ? ` · ${selected.sub_type}` : ""}</Text>
              </View>
              <Text style={styles.detailPrice}>{formatPrice(selected)}</Text>
              {selected.deposit_amount ? <Text style={styles.detailMeta}>التأمين: {selected.deposit_amount.toLocaleString()} ج.س (مستردّ)</Text> : null}
              {selected.neighborhood ? <Text style={styles.detailMeta}>📍 {selected.neighborhood}{selected.address ? ` — ${selected.address}` : ""}</Text> : null}
              <Text style={[styles.detailMeta, { marginTop: 12, fontSize: 15, lineHeight: 24 }]}>{selected.description}</Text>
              <View style={styles.ownerCard}>
                <Ionicons name="person-circle-outline" size={40} color={Colors.accent} />
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.ownerName}>{selected.owner_name}</Text>
                  <Text style={styles.ownerPhone}>{selected.owner_phone}</Text>
                </View>
              </View>
              <View style={styles.detailActions}>
                <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${selected.owner_phone}`)}>
                  <Ionicons name="call-outline" size={18} color="#fff" />
                  <Text style={styles.callBtnText}>اتصال</Text>
                </TouchableOpacity>
                {selected.owner_whatsapp && (
                  <TouchableOpacity style={styles.waBtn} onPress={() => Linking.openURL(`https://wa.me/${selected.owner_whatsapp?.replace(/[^0-9]/g,"")}`)}>
                    <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                    <Text style={styles.callBtnText}>واتساب</Text>
                  </TouchableOpacity>
                )}
              </View>
              {user ? (
                <TouchableOpacity style={styles.contractBtn} onPress={() => { setContractListing(selected); setContractForm(f=>({...f, renter_name: user?.name||""})); setSelected(null); setShowContractForm(true); }}>
                  <Ionicons name="document-text-outline" size={18} color="#000" />
                  <Text style={styles.contractBtnText}>إبرام عقد إيجار</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.witnessNote}>
                <Ionicons name="shield-checkmark" size={16} color={Colors.accent} />
                <Text style={styles.witnessText}>
                  التطبيق يعمل شاهداً رقمياً معتمداً — عمولة {settings.rental_commission_pct}% تُستحق على مقدّم الخدمة عند إبرام العقد
                </Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* ── Contract Form Modal ── */}
      <Modal visible={showContractForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowContractForm(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowContractForm(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>إبرام عقد إيجار</Text>
            <View style={{ width: 24 }} />
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              {contractListing && (
                <View style={styles.contractPreview}>
                  <Text style={styles.contractPreviewTitle}>{contractListing.title}</Text>
                  <Text style={styles.contractPreviewSub}>{typeLabel(contractListing.rental_type)} · {contractListing.neighborhood || ""}</Text>
                </View>
              )}
              <Text style={styles.sectionTitle}>بيانات المستأجر</Text>
              <TextInput style={styles.input} placeholder="الاسم الكامل *" placeholderTextColor={Colors.textMuted} value={contractForm.renter_name} onChangeText={v => setContractForm(f=>({...f,renter_name:v}))} />
              <TextInput style={styles.input} placeholder="رقم الهاتف *" placeholderTextColor={Colors.textMuted} value={contractForm.renter_phone} onChangeText={v => setContractForm(f=>({...f,renter_phone:v}))} keyboardType="phone-pad" />

              <Text style={styles.sectionTitle}>مدة الإيجار</Text>
              <TextInput style={styles.input} placeholder="تاريخ البداية (مثال: 2026-06-01) *" placeholderTextColor={Colors.textMuted} value={contractForm.start_date} onChangeText={v => setContractForm(f=>({...f,start_date:v}))} />
              <TextInput style={styles.input} placeholder="تاريخ النهاية (مثال: 2026-12-01) *" placeholderTextColor={Colors.textMuted} value={contractForm.end_date} onChangeText={v => setContractForm(f=>({...f,end_date:v}))} />

              <Text style={styles.sectionTitle}>المبلغ الإجمالي</Text>
              <TextInput style={styles.input} placeholder="المبلغ الكلي المتفق عليه (ج.س) *" placeholderTextColor={Colors.textMuted} value={contractForm.total_amount} onChangeText={v => setContractForm(f=>({...f,total_amount:v}))} keyboardType="numeric" />

              {contractForm.total_amount ? (
                <View style={styles.commissionCalc}>
                  <Text style={styles.commissionCalcText}>
                    العمولة المستحقة ({settings.rental_commission_pct}%):
                    <Text style={{ color: Colors.accent, fontWeight: "bold" }}>
                      {" "}{(parseFloat(contractForm.total_amount||"0") * parseFloat(settings.rental_commission_pct||"5") / 100).toLocaleString()} ج.س
                    </Text>
                  </Text>
                </View>
              ) : null}

              <Text style={styles.sectionTitle}>هل جاء المستأجر عبر التطبيق؟</Text>
              <View style={styles.boolRow}>
                <TouchableOpacity style={[styles.boolBtn, contractForm.from_app && styles.boolBtnActive]} onPress={() => setContractForm(f=>({...f,from_app:true}))}>
                  <Text style={[styles.boolBtnText, contractForm.from_app && styles.boolBtnTextActive]}>نعم — عبر التطبيق</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.boolBtn, !contractForm.from_app && styles.boolBtnActive]} onPress={() => setContractForm(f=>({...f,from_app:false}))}>
                  <Text style={[styles.boolBtnText, !contractForm.from_app && styles.boolBtnTextActive]}>لا — من خارجه</Text>
                </TouchableOpacity>
              </View>
              {!contractForm.from_app && (
                <View style={styles.exemptNote}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#3EFF9C" />
                  <Text style={styles.exemptText}>معفى من العمولة</Text>
                </View>
              )}

              <Text style={styles.sectionTitle}>شروط إضافية (اختياري)</Text>
              <TextInput style={[styles.input, styles.textArea]} placeholder="أي شروط خاصة متفق عليها بين الطرفين..." placeholderTextColor={Colors.textMuted} value={contractForm.conditions} onChangeText={v => setContractForm(f=>({...f,conditions:v}))} multiline numberOfLines={3} textAlignVertical="top" />

              <View style={styles.legalNote}>
                <Ionicons name="scale-outline" size={16} color="#FBBF24" />
                <Text style={styles.legalText}>
                  هذا العقد مُقدَّم وفق قانون المعاملات المدنية السوداني لسنة 1984 ويُعدّ ملزماً قانونياً لكلا الطرفين. يعمل التطبيق شاهداً رقمياً معتمداً.
                </Text>
              </View>

              <TouchableOpacity style={[styles.submitBtn, postLoading && { opacity: 0.7 }]} onPress={handleCreateContract} disabled={postLoading}>
                {postLoading ? <ActivityIndicator color="#000" /> : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="document-text" size={18} color="#000" />
                    <Text style={styles.submitBtnText}>إنشاء العقد الآن</Text>
                  </View>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Contract View Modal ── */}
      <Modal visible={showContractModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowContractModal(false)}>
        {selectedContract && (
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowContractModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>عقد الإيجار</Text>
              <TouchableOpacity onPress={() => { /* share contract */ }}>
                <Ionicons name="share-outline" size={22} color={Colors.accent} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              <View style={styles.contractDoc}>
                <Text style={styles.contractDocText}>{buildContractText(selectedContract, settings)}</Text>
              </View>
              {selectedContract.from_app && !selectedContract.commission_paid && selectedContract.status === "active" && (
                <View style={styles.payReminder}>
                  <Ionicons name="alert-circle-outline" size={18} color="#FBBF24" />
                  <Text style={styles.payReminderText}>
                    العمولة المستحقة: {selectedContract.commission_amount.toLocaleString()} ج.س
                    {"\n"}الحساب: {settings.rental_account_number}
                  </Text>
                  <TouchableOpacity style={styles.payNowBtn} onPress={() => { setShowContractModal(false); handlePayCommission(selectedContract); }}>
                    <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                    <Text style={styles.payNowBtnText}>إرسال الإشعار</Text>
                  </TouchableOpacity>
                </View>
              )}
                    <OrgInviteCard />
</ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: Colors.bg },
  header:          { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  headerTitle:     { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.text, textAlign: "right" },
  headerSub:       { fontSize: 11, color: Colors.textMuted },
  tabs:            { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  tabBtn:          { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabBtnActive:    { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabText:         { fontSize: 12, color: Colors.textMuted },
  tabTextActive:   { color: Colors.accent, fontWeight: "600" },
  scrollContent:   { padding: 12, paddingBottom: 100 },
  filterBar:       { marginBottom: 10 },
  filterChip:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.borderSubtle, marginLeft: 8, backgroundColor: Colors.surface2 },
  filterChipActive:{ borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  filterChipText:  { fontSize: 12, color: Colors.textMuted },
  filterChipTextActive: { color: Colors.accent, fontWeight: "600" },
  searchRow:       { flexDirection: "row-reverse", gap: 8, marginBottom: 8 },
  filterRow:       { flexDirection: "row-reverse", gap: 8, marginBottom: 10 },
  searchBox:       { flex: 1, flexDirection: "row-reverse", alignItems: "center", backgroundColor: Colors.surface2, borderRadius: 10, paddingHorizontal: 10, gap: 6, borderWidth: 1, borderColor: Colors.borderSubtle },
  searchInput:     { flex: 1, height: 38, color: Colors.text, fontSize: 13, textAlign: "right" },
  searchBtn:       { backgroundColor: Colors.accent, paddingHorizontal: 16, borderRadius: 10, justifyContent: "center", height: 38 },
  searchBtnText:   { color: "#000", fontWeight: "700", fontSize: 13 },
  notice:          { flexDirection: "row-reverse", backgroundColor: Colors.accent + "12", borderRadius: 10, padding: 10, gap: 8, marginBottom: 14, alignItems: "flex-start" },
  noticeText:      { flex: 1, color: Colors.text, fontSize: 11, lineHeight: 18, textAlign: "right" },
  card:            { backgroundColor: Colors.surface2, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderSubtle },
  cardHeader:      { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 8 },
  typeBadge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText:   { fontSize: 11, fontWeight: "600" },
  verifiedBadge:   { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  verifiedText:    { fontSize: 11, color: "#3EFF9C" },
  cardTitle:       { fontSize: 15, fontWeight: "700", color: Colors.text, textAlign: "right", marginBottom: 3 },
  cardSub:         { fontSize: 12, color: Colors.accent, textAlign: "right", marginBottom: 4 },
  cardDesc:        { fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 18, marginBottom: 8 },
  cardFooter:      { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  row:             { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  cardMeta:        { fontSize: 11, color: Colors.textMuted },
  cardPrice:       { fontSize: 14, fontWeight: "700", color: Colors.accent },
  empty:           { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyText:       { fontSize: 16, fontWeight: "600", color: Colors.text },
  emptySubText:    { fontSize: 13, color: Colors.textMuted },
  emptyBtn:        { marginTop: 12, backgroundColor: Colors.accent, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText:    { color: "#000", fontWeight: "700" },
  sectionTitle:    { fontSize: 13, fontWeight: "700", color: Colors.textMuted, marginBottom: 8, marginTop: 12, textAlign: "right" },
  input:           { backgroundColor: Colors.surface2, borderRadius: 10, padding: 12, color: Colors.text, fontSize: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.borderSubtle, textAlign: "right" },
  textArea:        { height: 100, textAlignVertical: "top" },
  typeSelector:    { flexDirection: "row-reverse", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  typeChip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.surface2 },
  typeChipText:    { fontSize: 13, color: Colors.textMuted },
  priceRow:        { flexDirection: "row-reverse", gap: 8 },
  priceInput:      { flex: 1 },
  commissionNote:  { flexDirection: "row-reverse", backgroundColor: Colors.accent + "12", borderRadius: 10, padding: 12, gap: 8, marginBottom: 16, alignItems: "flex-start" },
  commissionNoteText: { flex: 1, color: Colors.text, fontSize: 12, lineHeight: 18, textAlign: "right" },
  submitBtn:       { backgroundColor: Colors.accent, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8, marginBottom: 20 },
  submitBtnText:   { color: "#000", fontWeight: "700", fontSize: 16 },
  contractCard:    { backgroundColor: Colors.surface2, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderSubtle },
  contractHeader:  { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  contractTitle:   { fontSize: 14, fontWeight: "700", color: Colors.text, textAlign: "right" },
  contractSub:     { fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  statusBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText:      { fontSize: 11, fontWeight: "600" },
  contractInfo:    { gap: 3, marginBottom: 10 },
  contractMeta:    { fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  sigRow:          { flexDirection: "row-reverse", gap: 16, marginBottom: 10 },
  sigItem:         { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  sigText:         { fontSize: 12, color: Colors.textMuted },
  contractActions: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  actionBtn:       { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderSubtle },
  actionBtnText:   { fontSize: 12, color: Colors.accent },
  signBtn:         { backgroundColor: Colors.accent, borderColor: Colors.accent },
  payBtn:          { backgroundColor: "#25D366", borderColor: "#25D366" },
  modalSafe:       { flex: 1, backgroundColor: Colors.bg },
  modalHeader:     { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  modalTitle:      { fontSize: 16, fontWeight: "700", color: Colors.text },
  detailPrice:     { fontSize: 22, fontWeight: "800", color: Colors.accent, textAlign: "right", marginBottom: 6 },
  detailMeta:      { fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 4 },
  ownerCard:       { flexDirection: "row-reverse", alignItems: "center", backgroundColor: Colors.surface2, borderRadius: 12, padding: 14, marginTop: 16, gap: 10 },
  ownerName:       { fontSize: 15, fontWeight: "700", color: Colors.text, textAlign: "right" },
  ownerPhone:      { fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  detailActions:   { flexDirection: "row-reverse", gap: 10, marginTop: 14 },
  callBtn:         { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 12 },
  waBtn:           { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#25D366", borderRadius: 10, paddingVertical: 12 },
  callBtnText:     { color: "#fff", fontWeight: "700", fontSize: 14 },
  contractBtn:     { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, marginTop: 14 },
  contractBtnText: { color: "#000", fontWeight: "700", fontSize: 15 },
  witnessNote:     { flexDirection: "row-reverse", backgroundColor: Colors.accent + "10", borderRadius: 10, padding: 12, gap: 8, marginTop: 14, alignItems: "flex-start" },
  witnessText:     { flex: 1, color: Colors.textMuted, fontSize: 11, lineHeight: 18, textAlign: "right" },
  contractPreview: { backgroundColor: Colors.accent + "12", borderRadius: 10, padding: 12, marginBottom: 10 },
  contractPreviewTitle: { fontSize: 15, fontWeight: "700", color: Colors.text, textAlign: "right" },
  contractPreviewSub: { fontSize: 12, color: Colors.accent, textAlign: "right", marginTop: 2 },
  commissionCalc:  { backgroundColor: Colors.accent + "15", borderRadius: 8, padding: 10, marginBottom: 8 },
  commissionCalcText: { fontSize: 13, color: Colors.text, textAlign: "right" },
  boolRow:         { flexDirection: "row-reverse", gap: 10, marginBottom: 10 },
  boolBtn:         { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "center" },
  boolBtnActive:   { borderColor: Colors.accent, backgroundColor: Colors.accent + "15" },
  boolBtnText:     { fontSize: 12, color: Colors.textMuted },
  boolBtnTextActive: { color: Colors.accent, fontWeight: "600" },
  exemptNote:      { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 10 },
  exemptText:      { fontSize: 12, color: "#3EFF9C" },
  legalNote:       { flexDirection: "row-reverse", backgroundColor: "#FBBF2415", borderRadius: 10, padding: 12, gap: 8, marginBottom: 16, alignItems: "flex-start" },
  legalText:       { flex: 1, color: Colors.textMuted, fontSize: 11, lineHeight: 18, textAlign: "right" },
  contractDoc:     { backgroundColor: Colors.surface2, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.borderSubtle },
  contractDocText: { fontSize: 12, color: Colors.text, lineHeight: 22, textAlign: "right", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  payReminder:     { backgroundColor: "#FBBF2415", borderRadius: 12, padding: 14, gap: 10, marginBottom: 16 },
  payReminderText: { fontSize: 13, color: Colors.text, lineHeight: 20, textAlign: "right" },
  payNowBtn:       { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#25D366", borderRadius: 10, paddingVertical: 10 },
  payNowBtnText:   { color: "#fff", fontWeight: "700", fontSize: 13 },
});
