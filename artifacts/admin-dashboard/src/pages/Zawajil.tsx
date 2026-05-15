import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiJson } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";

// ─── Brand colors ────────────────────────────────────────────────────────────
const PINK   = "#EC4899";
const PINK_D = "#BE185D";
const GOLD   = "#D4AF37";
const GREEN  = "#22C55E";
const BG     = "#0A0F0C";
const CARD   = "#111A14";
const CARD2  = "#172012";
const BORDER = "#1F3329";
const T1     = "#F0FDF4";
const T2     = "#A7F3D0";
const T3     = "#6EE7B7";

// ─── Types ───────────────────────────────────────────────────────────────────
type Order = {
  id: number; order_number: string;
  sender_name: string; sender_phone: string;
  recipient_name: string; recipient_phone: string; recipient_address: string;
  delivery_location: string; service_type: string; occasion_type?: string;
  message_text?: string; message_by_us: boolean; voice_presentation: boolean;
  gift_type: string; gift_product_name?: string; gift_external_desc?: string;
  gift_money_amount: string; status: string; estimated_cost: string;
  admin_notes?: string; rejection_reason?: string; modification_request?: string;
  created_at: string; updated_at: string;
  shoubash_guests?: { guest_name: string; guest_phone: string; gift_desc: string; gift_amount: string }[];
};
type Product = {
  id: number; name: string; description?: string;
  price: string; category: string; is_available: boolean; sort_order: number;
};
type ReviewForm = {
  action: string; admin_notes: string;
  rejection_reason: string; modification_request: string; estimated_cost: string;
};
type ProdForm = {
  name: string; description: string; price: string;
  category: string; is_available: boolean; sort_order: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUS_PIPELINE = [
  { key: "pending_review",         label: "انتظار مراجعة", color: "#F59E0B", icon: "⏳" },
  { key: "modification_requested", label: "طلب تعديل",     color: "#F97316", icon: "✏️" },
  { key: "approved",               label: "مقبول",          color: GREEN,     icon: "✅" },
  { key: "preparing",              label: "جارٍ التجهيز",   color: "#0EA5E9", icon: "🔧" },
  { key: "sending",                label: "في الطريق",      color: "#C084FC", icon: "🚴" },
  { key: "completed",              label: "مكتمل",          color: "#3EFF9C", icon: "🏁" },
  { key: "rejected",               label: "مرفوض",          color: "#EF4444", icon: "✕"  },
  { key: "returned",               label: "مُعادة",         color: "#6B7280", icon: "↩"  },
];

const SVC_MAP: Record<string, { label: string; color: string; emoji: string }> = {
  hamasat_itab: { label: "همسات عتاب",  color: PINK,     emoji: "💌" },
  nifaj:        { label: "نفاج",         color: "#F59E0B",emoji: "💡" },
  shoubash:     { label: "شوبش",         color: GOLD,     emoji: "💍" },
  tabrikat:     { label: "تبريكات",      color: "#C084FC",emoji: "🎉" },
  salamat:      { label: "سلامات",       color: GREEN,    emoji: "🌿" },
};

const GIFT_LABELS: Record<string, string> = {
  none: "بدون هدية", from_store: "من المتجر", money: "مبلغ مادي", external: "هدية خارجية",
};

const STATUS_MAP = Object.fromEntries(STATUS_PIPELINE.map(s => [s.key, s]));

// ─── Style helpers ────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  background: CARD2, border: `1px solid ${BORDER}`,
  borderRadius: 10, padding: "9px 13px",
  color: T1, fontFamily: "'Cairo', sans-serif",
  fontSize: 13, width: "100%", direction: "rtl",
  boxSizing: "border-box", outline: "none",
};
const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({
  padding: "8px 18px", borderRadius: 10, border: "none",
  cursor: "pointer", background: bg, color: fg,
  fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 700,
  transition: "opacity .15s",
});
const chip = (color: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
  background: color + "1A", color, border: `1px solid ${color}33`,
});
const card: React.CSSProperties = {
  background: CARD, border: `1px solid ${BORDER}`,
  borderRadius: 16, overflow: "hidden",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function ModalWrap({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ ...card, width:"100%", maxWidth:620, maxHeight:"90vh", overflow:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"20px 24px 16px", borderBottom:`1px solid ${BORDER}` }}>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T3, cursor:"pointer", fontSize:20, lineHeight:1, padding:2 }}>✕</button>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontWeight:800, fontSize:16, color:T1 }}>{title}</div>
            {subtitle && <div style={{ fontSize:12, color:T3, marginTop:3 }}>{subtitle}</div>}
          </div>
        </div>
        <div style={{ padding:"20px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display:"block", fontSize:12, color:T3, marginBottom:5, textAlign:"right", fontWeight:600 }}>{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value?: string | number | null; color?: string }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:7, gap:12 }}>
      <span style={{ color: color || T1, fontSize:13, textAlign:"right", flex:1 }}>{value}</span>
      <span style={{ color:T3, fontSize:12, whiteSpace:"nowrap" }}>{label}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Zawajil() {
  const confirm = useConfirm();

  // Tab + filter state
  const [tab, setTab]               = useState<"orders" | "products" | "stats">("orders");
  const [statusFilter, setStatusFilter] = useState("all");

  // Data
  const [orders, setOrders]         = useState<Order[]>([]);
  const [products, setProducts]     = useState<Product[]>([]);
  const [loading, setLoading]       = useState(false);
  const [prodLoading, setProdLoading] = useState(false);
  const [error, setError]           = useState("");
  const [saving, setSaving]         = useState(false);

  // Modals
  const [detailOrder, setDetailOrder]    = useState<Order | null>(null);
  const [reviewTarget, setReviewTarget]  = useState<Order | null>(null);
  const [reviewForm, setReviewForm]      = useState<ReviewForm>({ action:"approve", admin_notes:"", rejection_reason:"", modification_request:"", estimated_cost:"" });
  const [editingProd, setEditingProd]    = useState<Partial<Product> | null>(null);
  const [prodForm, setProdForm]          = useState<ProdForm>({ name:"", description:"", price:"0", category:"general", is_available:true, sort_order:"0" });

  // ── Loaders ──────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await apiJson(`/admin/zawajil/orders?status=${statusFilter}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch { setError("فشل تحميل الطلبات"); }
    finally { setLoading(false); }
  }, [statusFilter]);

  const loadProducts = useCallback(async () => {
    setProdLoading(true);
    try {
      const data = await apiJson("/admin/zawajil/products");
      setProducts(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setProdLoading(false); }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => { if (tab === "products") loadProducts(); }, [tab, loadProducts]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function submitReview() {
    if (!reviewTarget) return;
    setSaving(true); setError("");
    try {
      await apiFetch(`/admin/zawajil/orders/${reviewTarget.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          action: reviewForm.action,
          admin_notes:           reviewForm.admin_notes           || undefined,
          rejection_reason:      reviewForm.rejection_reason      || undefined,
          modification_request:  reviewForm.modification_request  || undefined,
          estimated_cost:        reviewForm.estimated_cost ? Number(reviewForm.estimated_cost) : undefined,
        }),
      });
      setReviewTarget(null);
      loadOrders();
    } catch { setError("فشل حفظ المراجعة"); }
    finally { setSaving(false); }
  }

  async function quickStatus(orderId: number, status: string) {
    try {
      await apiFetch(`/admin/zawajil/orders/${orderId}/status`, { method:"PATCH", body:JSON.stringify({ status }) });
      loadOrders();
    } catch { setError("فشل تحديث الحالة"); }
  }

  async function saveProd() {
    setSaving(true); setError("");
    try {
      if (editingProd?.id) {
        await apiFetch(`/admin/zawajil/products/${editingProd.id}`, { method:"PATCH", body:JSON.stringify({ ...prodForm, price:Number(prodForm.price), sort_order:Number(prodForm.sort_order) }) });
      } else {
        await apiFetch("/admin/zawajil/products", { method:"POST", body:JSON.stringify({ ...prodForm, price:Number(prodForm.price), sort_order:Number(prodForm.sort_order) }) });
      }
      setEditingProd(null);
      loadProducts();
    } catch { setError("فشل حفظ المنتج"); }
    finally { setSaving(false); }
  }

  async function deleteProd(id: number) {
    if (!(await confirm({ title:"تأكيد الحذف", description:"حذف هذا المنتج نهائياً؟", confirmText:"حذف", destructive:true }))) return;
    try { await apiFetch(`/admin/zawajil/products/${id}`, { method:"DELETE" }); loadProducts(); }
    catch { setError("فشل الحذف"); }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const allOrders    = orders;
  const statusCounts = STATUS_PIPELINE.reduce((acc, s) => {
    acc[s.key] = allOrders.filter(o => o.status === s.key).length;
    return acc;
  }, {} as Record<string, number>);
  const totalOrders  = allOrders.length;
  const pendingCount = statusCounts["pending_review"] || 0;
  const completedCount = statusCounts["completed"] || 0;
  const totalRevenue = allOrders.reduce((s, o) => s + (Number(o.estimated_cost) || 0), 0);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:BG, fontFamily:"'Cairo', sans-serif", direction:"rtl", color:T1 }}>

      {/* ══ Topbar ══ */}
      <div style={{ background:CARD, borderBottom:`1px solid ${BORDER}`, padding:"0 28px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", height:64 }}>
          {/* Brand */}
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:`linear-gradient(135deg,${PINK},${PINK_D})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🎁</div>
            <div>
              <div style={{ fontWeight:800, fontSize:18, color:T1 }}>زواجل</div>
              <div style={{ fontSize:11, color:T3 }}>لوحة إدارة الهدايا والرسائل</div>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display:"flex", gap:20 }}>
            {[
              { label:"إجمالي الطلبات", value:totalOrders, color:T1 },
              { label:"بانتظار المراجعة", value:pendingCount, color:"#F59E0B" },
              { label:"مكتملة", value:completedCount, color:"#3EFF9C" },
              { label:"إيرادات تقديرية", value:totalRevenue > 0 ? totalRevenue.toLocaleString("ar-EG") + " SDG" : "—", color:GOLD },
            ].map(s => (
              <div key={s.label} style={{ textAlign:"center" }}>
                <div style={{ fontWeight:800, fontSize:16, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:10, color:T3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Refresh */}
          <button onClick={loadOrders} style={{ ...btn(CARD2, T3), border:`1px solid ${BORDER}` }}>
            ↻ تحديث
          </button>
        </div>

        {/* Tab nav */}
        <div style={{ display:"flex", gap:0, borderTop:`1px solid ${BORDER}` }}>
          {[
            { key:"orders",   label:"📋 الطلبات",    badge: pendingCount > 0 ? pendingCount : undefined },
            { key:"products", label:"🛍️ متجر الهدايا" },
            { key:"stats",    label:"📊 الإحصاء" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              style={{
                background:"none", border:"none", cursor:"pointer",
                padding:"12px 20px", fontSize:13, fontWeight:700,
                color: tab === t.key ? PINK : T3,
                borderBottom: tab === t.key ? `2px solid ${PINK}` : "2px solid transparent",
                fontFamily:"'Cairo', sans-serif", display:"flex", alignItems:"center", gap:6,
                transition:"color .15s",
              }}
            >
              {t.label}
              {t.badge ? (
                <span style={{ background:PINK, color:"#fff", borderRadius:10, fontSize:10, fontWeight:800, padding:"1px 6px", minWidth:18, textAlign:"center" }}>{t.badge}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"24px 28px", maxWidth:1200, margin:"0 auto" }}>

        {error && (
          <div style={{ background:"#EF444415", border:"1px solid #EF444433", borderRadius:10, padding:"10px 16px", color:"#FCA5A5", fontSize:13, marginBottom:16 }}>
            ⚠️ {error}
            <button onClick={() => setError("")} style={{ background:"none", border:"none", color:"#EF4444", cursor:"pointer", marginRight:10, fontSize:14, float:"left" }}>✕</button>
          </div>
        )}

        {/* ══ Orders Tab ══ */}
        {tab === "orders" && (
          <>
            {/* Pipeline filter */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(110px, 1fr))", gap:8, marginBottom:24 }}>
              {[{ key:"all", label:"الكل", color:"#94A3B8", icon:"🗂️" }, ...STATUS_PIPELINE].map(s => {
                const cnt = s.key === "all" ? totalOrders : statusCounts[s.key] || 0;
                const isActive = statusFilter === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setStatusFilter(s.key)}
                    style={{
                      background: isActive ? s.color + "22" : CARD,
                      border: `1px solid ${isActive ? s.color + "66" : BORDER}`,
                      borderRadius:12, padding:"10px 8px", cursor:"pointer",
                      textAlign:"center", fontFamily:"'Cairo', sans-serif",
                      transition:"all .15s",
                    }}
                  >
                    <div style={{ fontSize:16, marginBottom:3 }}>{("icon" in s) ? s.icon : "📦"}</div>
                    <div style={{ fontSize:18, fontWeight:800, color: s.color, lineHeight:1 }}>{cnt}</div>
                    <div style={{ fontSize:10, color:T3, marginTop:2 }}>{s.label}</div>
                  </button>
                );
              })}
            </div>

            {/* Orders list */}
            {loading ? (
              <div style={{ textAlign:"center", color:T3, padding:60, fontSize:14 }}>
                <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
                جارٍ التحميل...
              </div>
            ) : orders.length === 0 ? (
              <div style={{ textAlign:"center", color:T3, padding:80 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🎁</div>
                <div style={{ fontSize:15, fontWeight:700, color:T2 }}>لا توجد طلبات</div>
                <div style={{ fontSize:13, marginTop:6 }}>لا توجد طلبات بهذه الحالة حالياً</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {orders.map(order => {
                  const st  = STATUS_MAP[order.status] ?? STATUS_MAP["pending_review"];
                  const svc = SVC_MAP[order.service_type] ?? { label:order.service_type, color:"#6B7280", emoji:"📦" };
                  return (
                    <div key={order.id} style={{ ...card, borderColor: st.color + "33" }}>
                      {/* Color top strip */}
                      <div style={{ height:3, background:`linear-gradient(90deg, ${st.color}, ${st.color}55)` }} />

                      <div style={{ padding:"16px 20px" }}>
                        {/* Row 1: order number + status */}
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                            <span style={chip(st.color)}>{st.icon} {st.label}</span>
                            <span style={chip(svc.color)}>{svc.emoji} {svc.label}</span>
                            {order.delivery_location === "outside_city" && <span style={chip("#F97316")}>📍 خارج المدينة</span>}
                            {order.voice_presentation  && <span style={chip(GOLD)}>🎤 تقديم صوتي</span>}
                            {order.message_by_us       && <span style={chip("#C084FC")}>✍️ نكتب الرسالة</span>}
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontWeight:800, fontSize:15, color:T1 }}>{order.order_number}</div>
                            <div style={{ fontSize:11, color:T3, marginTop:2 }}>
                              {new Date(order.created_at).toLocaleString("ar-SA", { dateStyle:"short", timeStyle:"short" })}
                            </div>
                          </div>
                        </div>

                        {/* Row 2: info grid */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:"4px 20px", marginBottom:12, background:CARD2, borderRadius:10, padding:"12px 16px" }}>
                          {[
                            ["المُرسِل",        order.sender_name],
                            ["هاتف المرسل",    order.sender_phone],
                            ["المُستلِم",       order.recipient_name],
                            ["هاتف المستلم",   order.recipient_phone],
                            ["العنوان",         order.recipient_address],
                            ["نوع الهدية",     GIFT_LABELS[order.gift_type]],
                            ...(order.gift_product_name ? [["المنتج", order.gift_product_name]] : []),
                            ...(Number(order.gift_money_amount) > 0 ? [["المبلغ المُهدى", Number(order.gift_money_amount).toLocaleString("ar-EG") + " SDG"]] : []),
                            ...(Number(order.estimated_cost) > 0 ? [["التكلفة المقدرة", Number(order.estimated_cost).toLocaleString("ar-EG") + " SDG"]] : []),
                          ].map(([lbl, val]) => val ? (
                            <div key={lbl as string} style={{ fontSize:12 }}>
                              <span style={{ color:T3 }}>{lbl}: </span>
                              <span style={{ color:T1, fontWeight:600 }}>{val}</span>
                            </div>
                          ) : null)}
                        </div>

                        {/* Message preview */}
                        {order.message_text && (
                          <div style={{ background:BG, borderRadius:10, padding:"10px 14px", marginBottom:10, borderRight:`3px solid ${PINK}44` }}>
                            <div style={{ fontSize:11, color:T3, marginBottom:4 }}>💬 الرسالة{order.message_by_us ? " (يطلب كتابتها)" : ""}</div>
                            <div style={{ fontSize:13, color:T2, lineHeight:1.8 }}>{order.message_text}</div>
                          </div>
                        )}

                        {/* Alert boxes */}
                        {order.modification_request && (
                          <div style={{ background:"#F9731615", border:"1px solid #F9731633", borderRadius:8, padding:"8px 12px", marginBottom:8, fontSize:12, color:"#FED7AA", borderRight:`3px solid #F97316` }}>
                            ✏️ طلب التعديل: {order.modification_request}
                          </div>
                        )}
                        {order.rejection_reason && (
                          <div style={{ background:"#EF444415", border:"1px solid #EF444433", borderRadius:8, padding:"8px 12px", marginBottom:8, fontSize:12, color:"#FCA5A5", borderRight:`3px solid #EF4444` }}>
                            ✕ سبب الرفض: {order.rejection_reason}
                          </div>
                        )}
                        {order.admin_notes && (
                          <div style={{ background:"#22C55E15", border:"1px solid #22C55E33", borderRadius:8, padding:"8px 12px", marginBottom:8, fontSize:12, color:"#86EFAC", borderRight:`3px solid ${GREEN}` }}>
                            📝 ملاحظات الإدارة: {order.admin_notes}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:12, paddingTop:12, borderTop:`1px solid ${BORDER}` }}>
                          <button
                            onClick={() => setDetailOrder(order)}
                            style={{ ...btn(CARD2, T2), border:`1px solid ${BORDER}` }}
                          >
                            🔍 التفاصيل الكاملة
                          </button>

                          {order.status === "pending_review" && (
                            <button
                              onClick={() => {
                                setReviewTarget(order);
                                setReviewForm({ action:"approve", admin_notes:"", rejection_reason:"", modification_request:"", estimated_cost:"" });
                              }}
                              style={btn(GREEN + "CC")}
                            >
                              ✓ مراجعة الطلب
                            </button>
                          )}

                          {order.status === "approved"   && <button onClick={() => quickStatus(order.id, "preparing")} style={btn("#0EA5E9CC")}>🔧 بدء التجهيز</button>}
                          {order.status === "preparing"  && <button onClick={() => quickStatus(order.id, "sending")}   style={btn("#C084FCCC")}>🚴 إرسال</button>}
                          {order.status === "sending"    && <button onClick={() => quickStatus(order.id, "completed")} style={btn("#3EFF9C", "#0A0F0C")}>🏁 تم الاستلام</button>}
                          {order.status === "sending"    && <button onClick={() => quickStatus(order.id, "returned")}  style={{ ...btn(CARD2, "#9CA3AF"), border:`1px solid ${BORDER}` }}>↩ رُدَّت الهدية</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══ Products Tab ══ */}
        {tab === "products" && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:16, color:T1 }}>🛍️ متجر هدايا زواجل</div>
                <div style={{ fontSize:12, color:T3, marginTop:3 }}>إدارة الهدايا المتاحة للطلب — {products.length} منتج</div>
              </div>
              <button
                onClick={() => {
                  setEditingProd({});
                  setProdForm({ name:"", description:"", price:"0", category:"general", is_available:true, sort_order:"0" });
                }}
                style={{ ...btn(`linear-gradient(135deg,${PINK},${PINK_D})`), display:"flex", alignItems:"center", gap:6 }}
              >
                + إضافة هدية جديدة
              </button>
            </div>

            {prodLoading ? (
              <div style={{ textAlign:"center", color:T3, padding:60 }}>⏳ جارٍ التحميل...</div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:14 }}>
                {products.map(p => (
                  <div key={p.id} style={{ ...card, padding:0, overflow:"hidden" }}>
                    <div style={{ height:4, background:`linear-gradient(90deg, ${PINK}, ${GOLD})` }} />
                    <div style={{ padding:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                        <div style={{ display:"flex", gap:6 }}>
                          <button
                            onClick={() => {
                              setEditingProd(p);
                              setProdForm({ name:p.name, description:p.description||"", price:p.price, category:p.category, is_available:p.is_available, sort_order:String(p.sort_order) });
                            }}
                            style={{ padding:"4px 10px", borderRadius:8, border:`1px solid #0EA5E933`, cursor:"pointer", background:"#0EA5E918", color:"#38BDF8", fontFamily:"'Cairo', sans-serif", fontSize:12, fontWeight:600 }}
                          >
                            ✏️ تعديل
                          </button>
                          <button
                            onClick={() => deleteProd(p.id)}
                            style={{ padding:"4px 10px", borderRadius:8, border:`1px solid #EF444433`, cursor:"pointer", background:"#EF444418", color:"#FCA5A5", fontFamily:"'Cairo', sans-serif", fontSize:12, fontWeight:600 }}
                          >
                            🗑️
                          </button>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontWeight:700, fontSize:14, color:T1 }}>{p.name}</div>
                          {p.description && <div style={{ fontSize:12, color:T3, marginTop:3 }}>{p.description}</div>}
                        </div>
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
                        <span style={{ ...chip(p.is_available ? GREEN : "#EF4444"), fontSize:11 }}>
                          {p.is_available ? "✓ متاح" : "✕ غير متاح"}
                        </span>
                        <span style={{ fontSize:16, fontWeight:800, color:GOLD }}>{Number(p.price).toLocaleString("ar-EG")} SDG</span>
                      </div>
                    </div>
                  </div>
                ))}
                {products.length === 0 && !prodLoading && (
                  <div style={{ gridColumn:"1/-1", textAlign:"center", color:T3, padding:80 }}>
                    <div style={{ fontSize:36, marginBottom:12 }}>🎁</div>
                    <div style={{ fontSize:15, fontWeight:700, color:T2 }}>لا توجد منتجات</div>
                    <div style={{ fontSize:13, marginTop:6 }}>أضف أول هدية للمتجر باستخدام الزر أعلاه</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ══ Stats Tab ══ */}
        {tab === "stats" && (
          <>
            <div style={{ fontWeight:800, fontSize:16, color:T1, marginBottom:20 }}>📊 إحصاءات زواجل</div>

            {/* Summary cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:12, marginBottom:28 }}>
              {[
                { label:"إجمالي الطلبات",    value:totalOrders,            color:T1,        icon:"📋" },
                { label:"بانتظار المراجعة",  value:pendingCount,           color:"#F59E0B", icon:"⏳" },
                { label:"مكتملة بنجاح",       value:completedCount,         color:"#3EFF9C", icon:"🏁" },
                { label:"قيد التجهيز/الإرسال",value:(statusCounts["preparing"]||0)+(statusCounts["sending"]||0), color:"#C084FC", icon:"🚴" },
                { label:"مرفوضة",             value:statusCounts["rejected"]||0, color:"#EF4444", icon:"✕" },
                { label:"الإيرادات التقديرية",value:totalRevenue > 0 ? totalRevenue.toLocaleString("ar-EG") + " SDG" : "—", color:GOLD, icon:"💰" },
              ].map(s => (
                <div key={s.label} style={{ ...card, padding:"18px 20px", textAlign:"right" }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>{s.icon}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:12, color:T3, marginTop:6 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* By service breakdown */}
            <div style={{ ...card, marginBottom:16 }}>
              <div style={{ padding:"16px 20px", borderBottom:`1px solid ${BORDER}`, fontWeight:700, fontSize:14, color:T1 }}>
                📦 الطلبات حسب نوع الخدمة
              </div>
              <div style={{ padding:"16px 20px" }}>
                {Object.entries(SVC_MAP).map(([key, svc]) => {
                  const count = orders.filter(o => o.service_type === key).length;
                  const pct   = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
                  return (
                    <div key={key} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                      <div style={{ width:44, textAlign:"right", fontSize:13, fontWeight:700, color:svc.color }}>{count}</div>
                      <div style={{ flex:1, height:10, background:CARD2, borderRadius:5, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${svc.color},${svc.color}88)`, borderRadius:5, transition:"width .4s" }} />
                      </div>
                      <div style={{ width:130, textAlign:"right", fontSize:13, color:T2 }}>
                        {svc.emoji} {svc.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By status breakdown */}
            <div style={{ ...card }}>
              <div style={{ padding:"16px 20px", borderBottom:`1px solid ${BORDER}`, fontWeight:700, fontSize:14, color:T1 }}>
                🔄 توزيع الطلبات حسب الحالة
              </div>
              <div style={{ padding:"16px 20px", display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:10 }}>
                {STATUS_PIPELINE.map(s => (
                  <div key={s.key} style={{ background:CARD2, borderRadius:10, padding:"12px 14px", textAlign:"right", borderRight:`3px solid ${s.color}` }}>
                    <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{statusCounts[s.key] || 0}</div>
                    <div style={{ fontSize:11, color:T3, marginTop:3 }}>{s.icon} {s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ══ Modal: تفاصيل الطلب ══ */}
      {detailOrder && (
        <ModalWrap
          title={`تفاصيل الطلب — ${detailOrder.order_number}`}
          subtitle={`${SVC_MAP[detailOrder.service_type]?.emoji ?? "📦"} ${SVC_MAP[detailOrder.service_type]?.label ?? detailOrder.service_type}`}
          onClose={() => setDetailOrder(null)}
        >
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 20px", marginBottom:16 }}>
            <InfoRow label="المُرسِل"        value={detailOrder.sender_name} />
            <InfoRow label="هاتف المرسل"    value={detailOrder.sender_phone} />
            <InfoRow label="المُستلِم"       value={detailOrder.recipient_name} />
            <InfoRow label="هاتف المستلم"   value={detailOrder.recipient_phone} />
            <InfoRow label="العنوان"         value={detailOrder.recipient_address} />
            <InfoRow label="التوصيل"         value={detailOrder.delivery_location === "inside_city" ? "داخل المدينة" : "خارج المدينة"} />
            <InfoRow label="المناسبة"        value={detailOrder.occasion_type} />
            <InfoRow label="الهدية"          value={GIFT_LABELS[detailOrder.gift_type]} />
            {detailOrder.gift_product_name  && <InfoRow label="المنتج"            value={detailOrder.gift_product_name} color={GOLD} />}
            {detailOrder.gift_external_desc && <InfoRow label="هدية خارجية"       value={detailOrder.gift_external_desc} />}
            {Number(detailOrder.gift_money_amount) > 0 && <InfoRow label="المبلغ المُهدى" value={Number(detailOrder.gift_money_amount).toLocaleString("ar-EG") + " SDG"} color={GREEN} />}
            {Number(detailOrder.estimated_cost) > 0     && <InfoRow label="التكلفة المقدرة" value={Number(detailOrder.estimated_cost).toLocaleString("ar-EG") + " SDG"} color={GOLD} />}
          </div>

          {detailOrder.message_text && (
            <div style={{ background:BG, borderRadius:10, padding:"12px 16px", marginBottom:14, borderRight:`3px solid ${PINK}55` }}>
              <div style={{ fontSize:11, color:T3, marginBottom:6 }}>
                💬 الرسالة {detailOrder.message_by_us ? "(يطلب كتابتها نيابةً عنه)" : ""}
              </div>
              <div style={{ fontSize:13, color:T2, lineHeight:1.9, textAlign:"right" }}>{detailOrder.message_text}</div>
            </div>
          )}

          {detailOrder.voice_presentation && (
            <div style={{ ...chip(GOLD), marginBottom:10, display:"inline-flex" }}>🎤 يطلب تقديم صوتي خلال الحفل</div>
          )}

          {detailOrder.shoubash_guests && detailOrder.shoubash_guests.length > 0 && (
            <div style={{ marginTop:14 }}>
              <div style={{ fontWeight:700, color:GOLD, marginBottom:10, fontSize:13 }}>💍 ضيوف الشوبش ({detailOrder.shoubash_guests.length})</div>
              {detailOrder.shoubash_guests.map((g, i) => (
                <div key={i} style={{ background:CARD2, borderRadius:10, padding:"10px 14px", marginBottom:8, fontSize:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:T3 }}>{g.guest_phone}</span>
                    <span style={{ color:T1, fontWeight:600 }}>{g.guest_name}</span>
                  </div>
                  {g.gift_desc   && <div style={{ color:T3, marginTop:4 }}>{g.gift_desc}</div>}
                  {Number(g.gift_amount) > 0 && <div style={{ color:GREEN, marginTop:4 }}>{Number(g.gift_amount).toLocaleString("ar-EG")} SDG</div>}
                </div>
              ))}
            </div>
          )}

          {/* Quick actions from detail modal */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:16, paddingTop:16, borderTop:`1px solid ${BORDER}` }}>
            {detailOrder.status === "pending_review" && (
              <button
                onClick={() => { setReviewTarget(detailOrder); setDetailOrder(null); setReviewForm({ action:"approve", admin_notes:"", rejection_reason:"", modification_request:"", estimated_cost:"" }); }}
                style={btn(GREEN + "CC")}
              >
                ✓ مراجعة هذا الطلب
              </button>
            )}
            {detailOrder.status === "approved"  && <button onClick={() => { quickStatus(detailOrder.id, "preparing"); setDetailOrder(null); }} style={btn("#0EA5E9CC")}>🔧 بدء التجهيز</button>}
            {detailOrder.status === "preparing" && <button onClick={() => { quickStatus(detailOrder.id, "sending");  setDetailOrder(null); }} style={btn("#C084FCCC")}>🚴 إرسال</button>}
            {detailOrder.status === "sending"   && <button onClick={() => { quickStatus(detailOrder.id, "completed"); setDetailOrder(null); }} style={btn("#3EFF9C", "#0A0F0C")}>🏁 تم الاستلام</button>}
          </div>
        </ModalWrap>
      )}

      {/* ══ Modal: مراجعة الطلب ══ */}
      {reviewTarget && (
        <ModalWrap
          title={`مراجعة الطلب — ${reviewTarget.order_number}`}
          subtitle={`${SVC_MAP[reviewTarget.service_type]?.emoji ?? ""} من: ${reviewTarget.sender_name || "—"} → إلى: ${reviewTarget.recipient_name}`}
          onClose={() => setReviewTarget(null)}
        >
          {/* Action selection */}
          <Field label="قرار المراجعة *">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              {[
                { k:"approve",              l:"✓ قبول",       c:GREEN        },
                { k:"request_modification", l:"✏️ طلب تعديل", c:"#F97316"   },
                { k:"reject",               l:"✕ رفض",        c:"#EF4444"    },
              ].map(a => (
                <button
                  key={a.k}
                  onClick={() => setReviewForm(p => ({ ...p, action:a.k }))}
                  style={{
                    padding:"11px 6px", borderRadius:10,
                    border:`2px solid ${reviewForm.action === a.k ? a.c : a.c + "33"}`,
                    cursor:"pointer", background:reviewForm.action === a.k ? a.c + "22" : "transparent",
                    color:reviewForm.action === a.k ? a.c : T3,
                    fontFamily:"'Cairo', sans-serif", fontSize:13, fontWeight:700,
                    transition:"all .15s",
                  }}
                >
                  {a.l}
                </button>
              ))}
            </div>
          </Field>

          <Field label="التكلفة المقدرة (SDG)">
            <input type="number" style={inp} value={reviewForm.estimated_cost} onChange={e => setReviewForm(p => ({ ...p, estimated_cost:e.target.value }))} placeholder="ادخل التكلفة الإجمالية للمرسل" />
          </Field>

          <Field label="ملاحظات للمرسل (اختيارية)">
            <textarea style={{ ...inp, height:70, resize:"none" }} value={reviewForm.admin_notes} onChange={e => setReviewForm(p => ({ ...p, admin_notes:e.target.value }))} placeholder="مثال: سيتم التواصل معك لتأكيد الموعد..." />
          </Field>

          {reviewForm.action === "reject" && (
            <Field label="سبب الرفض *">
              <textarea style={{ ...inp, height:70, resize:"none", borderColor:"#EF444444" }} value={reviewForm.rejection_reason} onChange={e => setReviewForm(p => ({ ...p, rejection_reason:e.target.value }))} placeholder="اشرح سبب رفض الطلب..." />
            </Field>
          )}

          {reviewForm.action === "request_modification" && (
            <Field label="ما الذي يحتاج تعديل؟ *">
              <textarea style={{ ...inp, height:70, resize:"none", borderColor:"#F9741644" }} value={reviewForm.modification_request} onChange={e => setReviewForm(p => ({ ...p, modification_request:e.target.value }))} placeholder="وضّح ما يجب تعديله..." />
            </Field>
          )}

          {error && <div style={{ color:"#FCA5A5", fontSize:12, marginBottom:10, background:"#EF444410", padding:"6px 10px", borderRadius:6 }}>{error}</div>}

          <div style={{ display:"flex", gap:10, justifyContent:"flex-start" }}>
            <button onClick={() => setReviewTarget(null)} style={{ ...btn(CARD2, T3), border:`1px solid ${BORDER}` }}>إلغاء</button>
            <button
              onClick={submitReview}
              disabled={saving}
              style={btn(reviewForm.action === "approve" ? GREEN : reviewForm.action === "reject" ? "#EF4444" : "#F97316")}
            >
              {saving ? "⏳ جارٍ الحفظ..." : "💾 تأكيد القرار"}
            </button>
          </div>
        </ModalWrap>
      )}

      {/* ══ Modal: منتج ══ */}
      {editingProd !== null && (
        <ModalWrap
          title={editingProd.id ? "تعديل هدية" : "إضافة هدية للمتجر"}
          subtitle="هدايا متجر زواجل"
          onClose={() => setEditingProd(null)}
        >
          <Field label="اسم الهدية *">
            <input type="text" style={inp} value={prodForm.name} onChange={e => setProdForm(p => ({ ...p, name:e.target.value }))} placeholder="مثال: باقة ورد، مروحة ذكية..." />
          </Field>
          <Field label="الوصف">
            <input type="text" style={inp} value={prodForm.description} onChange={e => setProdForm(p => ({ ...p, description:e.target.value }))} placeholder="وصف مختصر للهدية" />
          </Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="السعر (SDG) *">
              <input type="number" style={inp} value={prodForm.price} onChange={e => setProdForm(p => ({ ...p, price:e.target.value }))} />
            </Field>
            <Field label="الترتيب">
              <input type="number" style={inp} value={prodForm.sort_order} onChange={e => setProdForm(p => ({ ...p, sort_order:e.target.value }))} />
            </Field>
          </div>
          <Field label="الفئة">
            <input type="text" style={inp} value={prodForm.category} onChange={e => setProdForm(p => ({ ...p, category:e.target.value }))} placeholder="مثال: flowers, electronics, food" />
          </Field>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, padding:"10px 14px", background:CARD2, borderRadius:10, cursor:"pointer" }} onClick={() => setProdForm(p => ({ ...p, is_available:!p.is_available }))}>
            <div style={{ width:40, height:22, borderRadius:11, background:prodForm.is_available ? GREEN : "#374151", transition:"background .2s", position:"relative" }}>
              <div style={{ width:18, height:18, borderRadius:9, background:"#fff", position:"absolute", top:2, left:prodForm.is_available ? 20 : 2, transition:"left .2s" }} />
            </div>
            <span style={{ color:prodForm.is_available ? T1 : T3, fontSize:13, fontWeight:600 }}>
              {prodForm.is_available ? "✓ متاح للطلب" : "غير متاح حالياً"}
            </span>
          </div>

          {error && <div style={{ color:"#FCA5A5", fontSize:12, marginBottom:10, background:"#EF444410", padding:"6px 10px", borderRadius:6 }}>{error}</div>}

          <div style={{ display:"flex", gap:10, justifyContent:"flex-start" }}>
            <button onClick={() => setEditingProd(null)} style={{ ...btn(CARD2, T3), border:`1px solid ${BORDER}` }}>إلغاء</button>
            <button onClick={saveProd} disabled={saving} style={btn(`linear-gradient(135deg,${PINK},${PINK_D})`)}>
              {saving ? "⏳ جارٍ الحفظ..." : editingProd.id ? "💾 حفظ التعديلات" : "➕ إضافة للمتجر"}
            </button>
          </div>
        </ModalWrap>
      )}
    </div>
  );
}
