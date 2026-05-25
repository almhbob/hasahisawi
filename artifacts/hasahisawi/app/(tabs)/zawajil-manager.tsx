import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView, Pressable, RefreshControl, Switch,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import OrgInviteCard from "@/components/OrgInviteCard";


const PINK = "#EC4899";
const PINK2 = "#F472B6";
const BG = "#070D0A";
const CARD = "#0D1F12";
const CARD2 = "#0A1A10";
const BORDER = "#1A3020";

const TOKEN_KEY = "zawajil_manager_token";
const MANAGER_KEY = "zawajil_manager_info";

// ── حالات الطلب ─────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review: { label: "قيد المراجعة",     color: "#F59E0B" },
  approved:       { label: "موافق عليه",        color: "#22C55E" },
  preparing:      { label: "جاري التحضير",      color: "#0EA5E9" },
  sending:        { label: "جاري الإرسال",      color: "#C084FC" },
  completed:      { label: "مكتمل",             color: "#3EFF9C" },
  rejected:       { label: "مرفوض",             color: "#EF4444" },
};

const SERVICE_LABELS: Record<string, string> = {
  hamasat_itab: "همسات عتاب",
  nifaj:        "نفاج",
  shoubash:     "شوبش",
  tabrikat:     "تبريكات",
  salamat:      "سلامات",
};

type Manager = { id: number; full_name: string; username: string };
type Stats = { total_orders: number; pending: number; completed: number; revenue: number };
type Order = {
  id: number; order_number: string; recipient_name: string; service_type: string;
  status: string; estimated_cost?: number; admin_notes?: string;
  rejection_reason?: string; created_at: string; sender_name?: string;
  sender_phone?: string; message?: string; notes?: string;
  shoubash_guests?: any[];
};
type Product = {
  id: number; name: string; description?: string; price: number;
  category: string; is_available: boolean; sort_order: number;
};

// ── شاشة تسجيل الدخول ───────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (tok: string, mgr: Manager) => void }) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("أدخل اسم المستخدم وكلمة المرور");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${getApiUrl()}/zawajil-manager/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "بيانات الدخول غير صحيحة"); return; }
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      await AsyncStorage.setItem(MANAGER_KEY, JSON.stringify(data.manager));
      onLogin(data.token, data.manager);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[s.flex, { backgroundColor: BG }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={[s.loginContainer, { paddingTop: insets.top + 40 }]}>
        {/* شعار */}
        <Animated.View entering={FadeInDown.duration(500)} style={s.loginIconWrap}>
          <LinearGradient colors={[PINK + "30", PINK + "10"]} style={s.loginIconBg}>
            <Ionicons name="shield-checkmark" size={48} color={PINK} />
          </LinearGradient>
        </Animated.View>

        <Animated.Text entering={FadeInDown.delay(100).duration(500)} style={s.loginTitle}>
          بوابة مدير زواجل
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(150).duration(500)} style={s.loginSubtitle}>
          نظام الإدارة المستقل لخدمة زواجل
        </Animated.Text>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={s.loginCard}>
          {/* اسم المستخدم */}
          <Text style={s.fieldLabel}>اسم المستخدم</Text>
          <View style={s.inputWrap}>
            <Ionicons name="person-outline" size={18} color={Colors.textMuted} style={s.inputIcon} />
            <TextInput
              style={s.input}
              placeholder="أدخل اسم المستخدم"
              placeholderTextColor={Colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              textAlign="right"
            />
          </View>

          {/* كلمة المرور */}
          <Text style={[s.fieldLabel, { marginTop: 14 }]}>كلمة المرور</Text>
          <View style={s.inputWrap}>
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={s.inputIcon}>
              <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.textMuted} />
            </TouchableOpacity>
            <TextInput
              style={s.input}
              placeholder="كلمة المرور"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              textAlign="right"
            />
          </View>

          {error ? (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={s.loginBtn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
            <LinearGradient colors={[PINK, "#BE185D"]} style={s.loginBtnGrad}>
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={18} color="#fff" />
                  <Text style={s.loginBtnText}>تسجيل الدخول</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── بطاقة إحصائية ────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | number; color: string }) {
  return (
    <View style={[s.statCard, { borderColor: color + "30" }]}>
      <LinearGradient colors={[color + "20", color + "08"]} style={s.statCardGrad}>
        <Ionicons name={icon} size={22} color={color} />
        <Text style={[s.statValue, { color }]}>{value}</Text>
        <Text style={s.statLabel}>{label}</Text>
      </LinearGradient>
    </View>
  );
}

// ── شارة الحالة ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const info = STATUS_LABELS[status] || { label: status, color: Colors.textMuted };
  return (
    <View style={[s.badge, { backgroundColor: info.color + "20", borderColor: info.color + "40" }]}>
      <Text style={[s.badgeText, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

// ── بطاقة طلب ────────────────────────────────────────────────────────────────
function OrderCard({
  order, token, onRefresh,
}: { order: Order; token: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [estimatedCost, setEstimatedCost] = useState(order.estimated_cost?.toString() || "");
  const [adminNotes, setAdminNotes] = useState(order.admin_notes || "");
  const [rejectionReason, setRejectionReason] = useState(order.rejection_reason || "");
  const [newStatus, setNewStatus] = useState(order.status);

  const updateStatus = async (status: string, notes?: string) => {
    setActing(true);
    try {
      const res = await fetch(`${getApiUrl()}/zawajil-manager/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_notes: notes }),
      });
      if (res.ok) { onRefresh(); setExpanded(false); }
      else { const d = await res.json(); Alert.alert("خطأ", d.error || "تعذّر التحديث"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال"); } finally { setActing(false); }
  };

  const submitReview = async () => {
    setActing(true);
    try {
      const res = await fetch(`${getApiUrl()}/zawajil-manager/orders/${order.id}/review`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reviewAction,
          admin_notes: adminNotes || null,
          rejection_reason: rejectionReason || null,
          estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null,
        }),
      });
      if (res.ok) { setReviewModal(false); onRefresh(); setExpanded(false); }
      else { const d = await res.json(); Alert.alert("خطأ", d.error || "تعذّر التحديث"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال"); } finally { setActing(false); }
  };

  const statusInfo = STATUS_LABELS[order.status] || { color: Colors.textMuted };

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={[s.orderCard, { borderLeftColor: statusInfo.color, borderLeftWidth: 3 }]}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
        <View style={s.orderRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.orderNumber}># {order.order_number}</Text>
            <Text style={s.orderRecipient}>{order.recipient_name}</Text>
            <Text style={s.orderService}>{SERVICE_LABELS[order.service_type] || order.service_type}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <StatusBadge status={order.status} />
            {order.estimated_cost ? (
              <Text style={s.orderCost}>{order.estimated_cost} ج.س</Text>
            ) : null}
            <Text style={s.orderDate}>{new Date(order.created_at).toLocaleDateString("ar-SA")}</Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} style={{ marginRight: 4 }} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={s.orderDetails}>
          <View style={s.detailDivider} />
          {order.sender_name ? <Text style={s.detailLine}><Text style={s.detailKey}>المُرسِل: </Text>{order.sender_name}</Text> : null}
          {order.sender_phone ? <Text style={s.detailLine}><Text style={s.detailKey}>الهاتف: </Text>{order.sender_phone}</Text> : null}
          {order.message ? <Text style={s.detailLine}><Text style={s.detailKey}>الرسالة: </Text>{order.message}</Text> : null}
          {order.notes ? <Text style={s.detailLine}><Text style={s.detailKey}>ملاحظات: </Text>{order.notes}</Text> : null}
          {order.admin_notes ? <Text style={s.detailLine}><Text style={s.detailKey}>ملاحظات الإدارة: </Text>{order.admin_notes}</Text> : null}
          {order.rejection_reason ? (
            <Text style={[s.detailLine, { color: "#EF4444" }]}><Text style={s.detailKey}>سبب الرفض: </Text>{order.rejection_reason}</Text>
          ) : null}

          {/* أزرار الإجراءات */}
          <View style={s.actionBtns}>
            {order.status === "pending_review" && (
              <>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#EF444418", borderColor: "#EF444440" }]}
                  onPress={() => { setReviewAction("reject"); setReviewModal(true); }}
                  disabled={acting}
                >
                  <Ionicons name="close-circle-outline" size={14} color="#EF4444" />
                  <Text style={[s.actionBtnText, { color: "#EF4444" }]}>رفض</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: "#22C55E18", borderColor: "#22C55E40", flex: 2 }]}
                  onPress={() => { setReviewAction("approve"); setReviewModal(true); }}
                  disabled={acting}
                >
                  <Ionicons name="checkmark-circle-outline" size={14} color="#22C55E" />
                  <Text style={[s.actionBtnText, { color: "#22C55E" }]}>موافقة</Text>
                </TouchableOpacity>
              </>
            )}
            {order.status === "approved" && (
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: "#0EA5E918", borderColor: "#0EA5E940", flex: 1 }]}
                onPress={() => updateStatus("preparing")}
                disabled={acting}
              >
                {acting ? <ActivityIndicator size="small" color="#0EA5E9" /> : <>
                  <Ionicons name="construct-outline" size={14} color="#0EA5E9" />
                  <Text style={[s.actionBtnText, { color: "#0EA5E9" }]}>بدء التحضير</Text>
                </>}
              </TouchableOpacity>
            )}
            {order.status === "preparing" && (
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: "#C084FC18", borderColor: "#C084FC40", flex: 1 }]}
                onPress={() => updateStatus("sending")}
                disabled={acting}
              >
                {acting ? <ActivityIndicator size="small" color="#C084FC" /> : <>
                  <Ionicons name="bicycle-outline" size={14} color="#C084FC" />
                  <Text style={[s.actionBtnText, { color: "#C084FC" }]}>جاري الإرسال</Text>
                </>}
              </TouchableOpacity>
            )}
            {order.status === "sending" && (
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: "#3EFF9C18", borderColor: "#3EFF9C40", flex: 1 }]}
                onPress={() => updateStatus("completed")}
                disabled={acting}
              >
                {acting ? <ActivityIndicator size="small" color="#3EFF9C" /> : <>
                  <Ionicons name="checkmark-done-outline" size={14} color="#3EFF9C" />
                  <Text style={[s.actionBtnText, { color: "#3EFF9C" }]}>مكتمل</Text>
                </>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* مودال المراجعة */}
      <Modal visible={reviewModal} transparent animationType="slide" onRequestClose={() => setReviewModal(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setReviewModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <Pressable onPress={e => e.stopPropagation()}>
              <Animated.View entering={FadeInDown.springify().damping(22)} style={s.modalSheet}>
                <View style={s.modalHandle} />
                <Text style={s.modalTitle}>
                  {reviewAction === "approve" ? "موافقة على الطلب" : "رفض الطلب"}
                </Text>

                {reviewAction === "approve" && (
                  <>
                    <Text style={s.fieldLabel}>التكلفة التقديرية (اختياري)</Text>
                    <View style={s.inputWrap}>
                      <Ionicons name="cash-outline" size={16} color={Colors.textMuted} style={s.inputIcon} />
                      <TextInput
                        style={s.input}
                        placeholder="0.00 ج.س"
                        placeholderTextColor={Colors.textMuted}
                        value={estimatedCost}
                        onChangeText={setEstimatedCost}
                        keyboardType="decimal-pad"
                        textAlign="right"
                      />
                    </View>
                  </>
                )}

                {reviewAction === "reject" && (
                  <>
                    <Text style={s.fieldLabel}>سبب الرفض</Text>
                    <View style={[s.inputWrap, { height: 80, alignItems: "flex-start", paddingTop: 10 }]}>
                      <TextInput
                        style={[s.input, { flex: 1, height: 60, textAlignVertical: "top" }]}
                        placeholder="اذكر سبب الرفض..."
                        placeholderTextColor={Colors.textMuted}
                        value={rejectionReason}
                        onChangeText={setRejectionReason}
                        multiline
                        textAlign="right"
                      />
                    </View>
                  </>
                )}

                <Text style={[s.fieldLabel, { marginTop: 10 }]}>ملاحظات إضافية (اختياري)</Text>
                <View style={[s.inputWrap, { height: 70, alignItems: "flex-start", paddingTop: 10 }]}>
                  <TextInput
                    style={[s.input, { flex: 1, height: 50, textAlignVertical: "top" }]}
                    placeholder="أي ملاحظات إضافية..."
                    placeholderTextColor={Colors.textMuted}
                    value={adminNotes}
                    onChangeText={setAdminNotes}
                    multiline
                    textAlign="right"
                  />
                </View>

                <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 16 }}>
                  <TouchableOpacity style={[s.modalBtn, { backgroundColor: "#FFFFFF0A" }]} onPress={() => setReviewModal(false)}>
                    <Text style={[s.modalBtnText, { color: Colors.textMuted }]}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.modalBtn, { flex: 2, backgroundColor: reviewAction === "approve" ? "#22C55E" : "#EF4444" }]}
                    onPress={submitReview}
                    disabled={acting}
                  >
                    {acting ? <ActivityIndicator size="small" color="#fff" /> : (
                      <Text style={[s.modalBtnText, { color: "#fff" }]}>
                        {reviewAction === "approve" ? "تأكيد الموافقة" : "تأكيد الرفض"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

// ── تبويب الطلبات ────────────────────────────────────────────────────────────
function OrdersTab({ token }: { token: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const q = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`${getApiUrl()}/zawajil-manager/orders${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setOrders(await res.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [token, filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const filters: Array<[string, string]> = [
    ["all", "الكل"],
    ["pending_review", "قيد المراجعة"],
    ["approved", "موافق"],
    ["preparing", "التحضير"],
    ["sending", "الإرسال"],
    ["completed", "مكتمل"],
    ["rejected", "مرفوض"],
  ];

  return (
    <View style={s.flex}>
      {/* فلاتر الحالة */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow}>
        {filters.map(([k, lbl]) => (
          <TouchableOpacity
            key={k}
            style={[s.filterChip, filter === k && { backgroundColor: PINK + "25", borderColor: PINK + "60" }]}
            onPress={() => setFilter(k)}
          >
            <Text style={[s.filterChipText, filter === k && { color: PINK }]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={PINK} size="large" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={PINK} />}
        >
          {orders.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="gift-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyText}>لا توجد طلبات</Text>
            </View>
          ) : orders.map(order => (
            <OrderCard key={order.id} order={order} token={token} onRefresh={load} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── تبويب المنتجات ───────────────────────────────────────────────────────────
function ProductsTab({ token }: { token: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [acting, setActing] = useState(false);

  // حقول النموذج
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pCategory, setPCategory] = useState("general");
  const [pAvailable, setPAvailable] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/zawajil-manager/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setProducts(await res.json());
    } catch {} finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setPName(""); setPDesc(""); setPPrice(""); setPCategory("general"); setPAvailable(true);
    setEditProduct(null);
    setAddModal(true);
  };

  const openEdit = (p: Product) => {
    setPName(p.name); setPDesc(p.description || "");
    setPPrice(p.price.toString()); setPCategory(p.category);
    setPAvailable(p.is_available);
    setEditProduct(p);
    setAddModal(true);
  };

  const saveProduct = async () => {
    if (!pName.trim()) { Alert.alert("خطأ", "اسم المنتج مطلوب"); return; }
    setActing(true);
    try {
      const body = { name: pName, description: pDesc, price: parseFloat(pPrice) || 0, category: pCategory, is_available: pAvailable };
      const url = editProduct
        ? `${getApiUrl()}/zawajil-manager/products/${editProduct.id}`
        : `${getApiUrl()}/zawajil-manager/products`;
      const res = await fetch(url, {
        method: editProduct ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setAddModal(false); load(); }
      else { const d = await res.json(); Alert.alert("خطأ", d.error || "تعذّر الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال"); } finally { setActing(false); }
  };

  const deleteProduct = (p: Product) => {
    Alert.alert("حذف المنتج", `هل تريد حذف "${p.name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${getApiUrl()}/zawajil-manager/products/${p.id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            load();
          } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
        },
      },
    ]);
  };

  const toggleAvailable = async (p: Product) => {
    try {
      await fetch(`${getApiUrl()}/zawajil-manager/products/${p.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: !p.is_available }),
      });
      load();
    } catch {}
  };

  return (
    <View style={s.flex}>
      {/* زر إضافة */}
      <View style={s.productsHeader}>
        <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.85}>
          <LinearGradient colors={[PINK, "#BE185D"]} style={s.addBtnGrad}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={s.addBtnText}>إضافة منتج</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={PINK} size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={s.listContent}>
          {products.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyText}>لا توجد منتجات</Text>
            </View>
          ) : products.map(p => (
            <Animated.View key={p.id} entering={FadeInDown.springify().damping(18)} style={s.productCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.productName}>{p.name}</Text>
                {p.description ? <Text style={s.productDesc}>{p.description}</Text> : null}
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <Text style={s.productPrice}>{p.price} ج.س</Text>
                  <View style={s.categoryChip}>
                    <Text style={s.categoryText}>{p.category}</Text>
                  </View>
                </View>
              </View>
              <View style={s.productActions}>
                <Switch
                  value={p.is_available}
                  onValueChange={() => toggleAvailable(p)}
                  trackColor={{ false: "#333", true: PINK + "80" }}
                  thumbColor={p.is_available ? PINK : "#666"}
                />
                <TouchableOpacity onPress={() => openEdit(p)} style={s.iconBtn}>
                  <Ionicons name="create-outline" size={18} color="#0EA5E9" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteProduct(p)} style={s.iconBtn}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))}
                <OrgInviteCard />
</ScrollView>
      )}

      {/* مودال إضافة/تعديل */}
      <Modal visible={addModal} transparent animationType="slide" onRequestClose={() => setAddModal(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setAddModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <Pressable onPress={e => e.stopPropagation()}>
              <Animated.View entering={FadeInDown.springify().damping(22)} style={s.modalSheet}>
                <View style={s.modalHandle} />
                <Text style={s.modalTitle}>{editProduct ? "تعديل المنتج" : "إضافة منتج جديد"}</Text>

                <Text style={s.fieldLabel}>اسم المنتج *</Text>
                <View style={s.inputWrap}>
                  <TextInput style={s.input} placeholder="اسم المنتج" placeholderTextColor={Colors.textMuted}
                    value={pName} onChangeText={setPName} textAlign="right" />
                </View>

                <Text style={[s.fieldLabel, { marginTop: 10 }]}>الوصف</Text>
                <View style={[s.inputWrap, { height: 70, alignItems: "flex-start", paddingTop: 10 }]}>
                  <TextInput style={[s.input, { flex: 1, height: 50, textAlignVertical: "top" }]}
                    placeholder="وصف المنتج..." placeholderTextColor={Colors.textMuted}
                    value={pDesc} onChangeText={setPDesc} multiline textAlign="right" />
                </View>

                <Text style={[s.fieldLabel, { marginTop: 10 }]}>السعر</Text>
                <View style={s.inputWrap}>
                  <Ionicons name="cash-outline" size={16} color={Colors.textMuted} style={s.inputIcon} />
                  <TextInput style={s.input} placeholder="0.00" placeholderTextColor={Colors.textMuted}
                    value={pPrice} onChangeText={setPPrice} keyboardType="decimal-pad" textAlign="right" />
                </View>

                <Text style={[s.fieldLabel, { marginTop: 10 }]}>الفئة</Text>
                <View style={s.inputWrap}>
                  <TextInput style={s.input} placeholder="general" placeholderTextColor={Colors.textMuted}
                    value={pCategory} onChangeText={setPCategory} textAlign="right" />
                </View>

                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 14 }}>
                  <Switch
                    value={pAvailable}
                    onValueChange={setPAvailable}
                    trackColor={{ false: "#333", true: PINK + "80" }}
                    thumbColor={pAvailable ? PINK : "#666"}
                  />
                  <Text style={s.fieldLabel}>متاح للطلب</Text>
                </View>

                <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 16 }}>
                  <TouchableOpacity style={[s.modalBtn, { backgroundColor: "#FFFFFF0A" }]} onPress={() => setAddModal(false)}>
                    <Text style={[s.modalBtnText, { color: Colors.textMuted }]}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.modalBtn, { flex: 2, backgroundColor: PINK }]} onPress={saveProduct} disabled={acting}>
                    {acting ? <ActivityIndicator size="small" color="#fff" /> : (
                      <Text style={[s.modalBtnText, { color: "#fff" }]}>{editProduct ? "حفظ التعديلات" : "إضافة"}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── الشاشة الرئيسية ──────────────────────────────────────────────────────────
export default function ZawajilManagerScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"orders" | "products">("orders");
  const [stats, setStats] = useState<Stats | null>(null);

  // فحص الجلسة المحفوظة
  useEffect(() => {
    (async () => {
      const tok = await AsyncStorage.getItem(TOKEN_KEY);
      const mgrRaw = await AsyncStorage.getItem(MANAGER_KEY);
      if (tok && mgrRaw) {
        setToken(tok);
        setManager(JSON.parse(mgrRaw));
      }
      setLoading(false);
    })();
  }, []);

  // جلب الإحصائيات
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/zawajil-manager/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          setStats(d.stats);
          setManager(d.manager);
        } else if (res.status === 401) {
          // انتهت الجلسة
          await AsyncStorage.removeItem(TOKEN_KEY);
          await AsyncStorage.removeItem(MANAGER_KEY);
          setToken(null); setManager(null);
        }
      } catch {}
    })();
  }, [token]);

  const handleLogin = (tok: string, mgr: Manager) => {
    setToken(tok);
    setManager(mgr);
  };

  const handleLogout = async () => {
    Alert.alert("تسجيل الخروج", "هل تريد الخروج من بوابة المدير؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج", style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${getApiUrl()}/zawajil-manager/logout`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch {}
          await AsyncStorage.removeItem(TOKEN_KEY);
          await AsyncStorage.removeItem(MANAGER_KEY);
          setToken(null); setManager(null); setStats(null);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[s.flex, { backgroundColor: BG, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={PINK} size="large" />
      </View>
    );
  }

  if (!token || !manager) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <View style={[s.flex, { backgroundColor: BG }]}>
      {/* رأس الصفحة */}
      <LinearGradient colors={[CARD, BG]} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            <Text style={s.logoutText}>خروج</Text>
          </TouchableOpacity>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.headerTitle}>بوابة مدير زواجل</Text>
            <Text style={s.headerSub}>{manager.full_name}</Text>
          </View>
          <View style={s.headerIcon}>
            <Ionicons name="shield-checkmark" size={24} color={PINK} />
          </View>
        </View>

        {/* بطاقات الإحصائيات */}
        {stats && (
          <Animated.View entering={FadeIn.duration(500)} style={s.statsRow}>
            <StatCard icon="list-outline" label="إجمالي الطلبات" value={stats.total_orders} color="#0EA5E9" />
            <StatCard icon="time-outline" label="قيد المراجعة" value={stats.pending} color="#F59E0B" />
            <StatCard icon="checkmark-done-outline" label="مكتمل" value={stats.completed} color="#22C55E" />
            <StatCard icon="cash-outline" label="الإيرادات" value={`${stats.revenue.toFixed(0)} ج`} color={PINK} />
          </Animated.View>
        )}

        {/* أزرار التبويبات */}
        <View style={s.tabBtns}>
          {([["orders", "الطلبات", "receipt-outline"], ["products", "المنتجات", "cube-outline"]] as const).map(([k, lbl, icon]) => (
            <TouchableOpacity
              key={k}
              style={[s.tabBtn, activeTab === k && { backgroundColor: PINK + "25", borderColor: PINK + "60" }]}
              onPress={() => setActiveTab(k)}
            >
              <Ionicons name={icon} size={15} color={activeTab === k ? PINK : Colors.textMuted} />
              <Text style={[s.tabBtnText, activeTab === k && { color: PINK }]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* المحتوى */}
      {activeTab === "orders" && <OrdersTab token={token} />}
      {activeTab === "products" && <ProductsTab token={token} />}
    </View>
  );
}

// ── الأنماط ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex: { flex: 1 },

  // صفحة الدخول
  loginContainer: { alignItems: "center", padding: 24, paddingBottom: 48 },
  loginIconWrap: { marginBottom: 20 },
  loginIconBg: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  loginTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff", textAlign: "center", marginBottom: 4 },
  loginSubtitle: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", marginBottom: 28 },
  loginCard: { width: "100%", backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 20 },

  // حقول الإدخال
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text, textAlign: "right", marginBottom: 6 },
  inputWrap: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: "#FFFFFF0A", borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, height: 48 },
  inputIcon: { marginLeft: 8 },
  input: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 14, color: "#fff" },

  // خطأ
  errorBox: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 10, padding: 10, backgroundColor: "#EF444415", borderRadius: 10, borderWidth: 1, borderColor: "#EF444435" },
  errorText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "#EF4444", flex: 1, textAlign: "right" },

  // زر الدخول
  loginBtn: { marginTop: 20, borderRadius: 14, overflow: "hidden" },
  loginBtnGrad: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  loginBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // رأس الصفحة
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: PINK, textAlign: "right" },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: PINK + "18", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: PINK + "35" },
  logoutBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, padding: 8, backgroundColor: "#EF444415", borderRadius: 10, borderWidth: 1, borderColor: "#EF444435" },
  logoutText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#EF4444" },

  // إحصائيات
  statsRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 14 },
  statCard: { flex: 1, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  statCardGrad: { padding: 10, alignItems: "center", gap: 3 },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 9, color: Colors.textMuted, textAlign: "center" },

  // تبويبات
  tabBtns: { flexDirection: "row-reverse", gap: 8 },
  tabBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: "#FFFFFF0A" },
  tabBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  // فلاتر
  filterScroll: { maxHeight: 50 },
  filterRow: { flexDirection: "row-reverse", paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "#FFFFFF0A", borderWidth: 1, borderColor: BORDER },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },

  // محتوى القائمة
  listContent: { padding: 14, paddingBottom: 40, gap: 10 },

  // فارغ
  emptyWrap: { alignItems: "center", marginTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted },

  // بطاقة الطلب
  orderCard: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14 },
  orderRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 },
  orderNumber: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  orderRecipient: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", marginBottom: 2 },
  orderService: { fontFamily: "Cairo_500Medium", fontSize: 12, color: PINK },
  orderCost: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#22C55E" },
  orderDate: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  // تفاصيل الطلب
  orderDetails: { marginTop: 4 },
  detailDivider: { height: 1, backgroundColor: BORDER, marginVertical: 10 },
  detailLine: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginBottom: 3 },
  detailKey: { fontFamily: "Cairo_600SemiBold", color: Colors.text },

  // أزرار الإجراءات
  actionBtns: { flexDirection: "row-reverse", gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },

  // شارة الحالة
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },

  // بطاقة منتج
  productCard: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  productName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", textAlign: "right" },
  productDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  productPrice: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#22C55E" },
  categoryChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: "#FFFFFF0A", borderWidth: 1, borderColor: BORDER },
  categoryText: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  productActions: { flexDirection: "column", alignItems: "center", gap: 8 },
  iconBtn: { padding: 6 },

  // رأس المنتجات
  productsHeader: { padding: 14, paddingBottom: 8 },
  addBtn: { borderRadius: 12, overflow: "hidden" },
  addBtnGrad: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  addBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  // مودال
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#0D1F12", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, borderTopWidth: 1, borderColor: BORDER },
  modalHandle: { width: 40, height: 4, backgroundColor: BORDER, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right", marginBottom: 16 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  modalBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14 },
});
