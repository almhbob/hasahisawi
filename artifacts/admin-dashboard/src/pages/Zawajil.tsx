import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiJson } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";

const PINK  = "#EC4899";
const GOLD  = "#D4AF37";
const GREEN = "#22C55E";

const STATUS_PIPELINE = [
  { key: "pending_review",         label: "انتظار مراجعة", color: "#F59E0B" },
  { key: "modification_requested", label: "طلب تعديل",     color: "#F97316" },
  { key: "approved",               label: "مقبول",          color: GREEN     },
  { key: "preparing",              label: "جارٍ التجهيز",   color: "#0EA5E9" },
  { key: "sending",                label: "في الطريق",      color: "#C084FC" },
  { key: "completed",              label: "مكتمل",          color: "#3EFF9C" },
  { key: "rejected",               label: "مرفوض",          color: "#EF4444" },
  { key: "returned",               label: "مُعادة",         color: "#6B7280" },
];

const SVC_LABELS: Record<string, { label: string; color: string }> = {
  hamasat_itab: { label: "همسات عتاب",  color: PINK   },
  nifaj:        { label: "نفاج",         color: GOLD   },
  shoubash:     { label: "شوبش",         color: GOLD   },
  tabrikat:     { label: "تبريكات",      color: "#C084FC" },
  salamat:      { label: "سلامات",       color: GREEN  },
};

const GIFT_LABELS: Record<string, string> = {
  none: "بدون هدية", from_store: "من المتجر", money: "مبلغ مادي", external: "هدية خارجية",
};

type Order = {
  id: number; order_number: string; sender_name: string; sender_phone: string;
  recipient_name: string; recipient_phone: string; recipient_address: string;
  delivery_location: string; service_type: string; occasion_type?: string;
  message_text?: string; message_by_us: boolean; voice_presentation: boolean;
  gift_type: string; gift_product_name?: string; gift_external_desc?: string; gift_money_amount: string;
  status: string; estimated_cost: string; admin_notes?: string;
  rejection_reason?: string; modification_request?: string;
  created_at: string; updated_at: string;
  shoubash_guests?: { guest_name: string; guest_phone: string; gift_desc: string; gift_amount: string }[];
};
type Product = { id: number; name: string; description?: string; price: string; category: string; is_available: boolean; sort_order: number };

type ReviewForm = { action: string; admin_notes: string; rejection_reason: string; modification_request: string; estimated_cost: string };
type ProdForm   = { name: string; description: string; price: string; category: string; is_available: boolean; sort_order: string };

const inputS: React.CSSProperties = {
  background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 8,
  padding: "8px 12px", color: "#f0fdf4", fontFamily: "'Cairo', sans-serif",
  fontSize: 13, width: "100%", direction: "rtl", boxSizing: "border-box",
};
const btnS = (c: string): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
  background: c, color: "#fff", fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 700,
});
const smallBtn = (c: string): React.CSSProperties => ({
  padding: "4px 10px", borderRadius: 6, border: `1px solid ${c}44`, cursor: "pointer",
  background: c + "18", color: c, fontFamily: "'Cairo', sans-serif", fontSize: 12, fontWeight: 600,
});

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ background:"hsl(222 47% 10%)",borderRadius:18,width:"100%",maxWidth:600,maxHeight:"90vh",overflow:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.6)",border:"1px solid hsl(217 32% 18%)" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 22px",borderBottom:"1px solid hsl(217 32% 15%)" }}>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"hsl(215 20% 55%)",cursor:"pointer",fontSize:20 }}>✕</button>
          <span style={{ fontWeight:700,fontSize:16,color:"#f0fdf4" }}>{title}</span>
        </div>
        <div style={{ padding:"18px 22px" }}>{children}</div>
      </div>
    </div>
  );
}
function DL({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div style={{ marginBottom: 8 }}><span style={{ color: "hsl(215 20% 45%)", fontSize: 12 }}>{label}: </span><span style={{ color: "#f0fdf4", fontSize: 13 }}>{value}</span></div>;
}

export default function Zawajil() {
  const confirm = useConfirm();
  const [tab, setTab]     = useState<"orders" | "products">("orders");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts]    = useState<Product[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(false);

  // review modal
  const [reviewTarget, setReviewTarget]  = useState<Order | null>(null);
  const [showReview, setShowReview]      = useState(false);
  const [reviewForm, setReviewForm]      = useState<ReviewForm>({ action:"approve", admin_notes:"", rejection_reason:"", modification_request:"", estimated_cost:"" });

  // order detail modal
  const [detailOrder, setDetailOrder]    = useState<Order | null>(null);
  const [showDetail, setShowDetail]      = useState(false);

  // product modal
  const [showProdModal, setShowProdModal]  = useState(false);
  const [editingProd, setEditingProd]      = useState<Partial<Product> | null>(null);
  const [prodForm, setProdForm]            = useState<ProdForm>({ name:"", description:"", price:"0", category:"general", is_available:true, sort_order:"0" });

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

  async function submitReview() {
    if (!reviewTarget) return;
    setSaving(true); setError("");
    try {
      await apiFetch(`/admin/zawajil/orders/${reviewTarget.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          action: reviewForm.action,
          admin_notes: reviewForm.admin_notes || undefined,
          rejection_reason: reviewForm.rejection_reason || undefined,
          modification_request: reviewForm.modification_request || undefined,
          estimated_cost: reviewForm.estimated_cost ? Number(reviewForm.estimated_cost) : undefined,
        }),
      });
      setShowReview(false);
      loadOrders();
    } catch { setError("فشل حفظ المراجعة"); }
    finally { setSaving(false); }
  }

  async function quickStatus(orderId: number, status: string) {
    try {
      await apiFetch(`/admin/zawajil/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      loadOrders();
    } catch { setError("فشل تحديث الحالة"); }
  }

  async function saveProd() {
    setSaving(true); setError("");
    try {
      if (editingProd?.id) {
        await apiFetch(`/admin/zawajil/products/${editingProd.id}`, { method: "PATCH", body: JSON.stringify({ ...prodForm, price: Number(prodForm.price), sort_order: Number(prodForm.sort_order) }) });
      } else {
        await apiFetch("/admin/zawajil/products", { method: "POST", body: JSON.stringify({ ...prodForm, price: Number(prodForm.price), sort_order: Number(prodForm.sort_order) }) });
      }
      setShowProdModal(false);
      loadProducts();
    } catch { setError("فشل حفظ المنتج"); }
    finally { setSaving(false); }
  }

  async function deleteProd(id: number) {
    if (!(await confirm({ title: "تأكيد الحذف", description: "حذف هذا المنتج؟", confirmText: "حذف", destructive: true }))) return;
    try { await apiFetch(`/admin/zawajil/products/${id}`, { method: "DELETE" }); loadProducts(); }
    catch { setError("فشل الحذف"); }
  }

  const statusCounts = STATUS_PIPELINE.reduce((acc, s) => {
    acc[s.key] = orders.filter(o => o.status === s.key).length; return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ padding: 28, direction: "rtl", fontFamily: "'Cairo', sans-serif" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ color: "#f0fdf4", fontSize: 22, fontWeight: 800, margin: 0 }}>🎁 زواجل — خدمة الهدايا والرسائل</h2>
          <p style={{ color: "hsl(215 20% 50%)", fontSize: 13, margin: "4px 0 0" }}>إدارة طلبات التوصيل والهدايا — مراجعة، قبول، رفض، تجهيز وتوصيل</p>
        </div>
      </div>

      {error && <div style={{ color: "#FCA5A5", fontSize: 13, marginBottom: 12, background: "#EF444415", padding: "8px 14px", borderRadius: 8 }}>{error}</div>}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "hsl(222 47% 10%)", padding: 4, borderRadius: 12, width: "fit-content" }}>
        {[{ key: "orders", label: `الطلبات (${orders.length})` }, { key: "products", label: `متجر الهدايا` }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{ padding: "8px 20px", borderRadius: 9, border: "none", cursor: "pointer", background: tab === t.key ? PINK : "transparent", color: tab === t.key ? "#fff" : "hsl(215 20% 55%)", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13 }}>{t.label}</button>
        ))}
      </div>

      {/* ══ تبويب الطلبات ══ */}
      {tab === "orders" && (
        <>
          {/* Pipeline stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8, marginBottom: 20 }}>
            {[{ key: "all", label: "الكل", color: "#6B7280" }, ...STATUS_PIPELINE].map(s => {
              const cnt = s.key === "all" ? orders.length : statusCounts[s.key] || 0;
              return (
                <button key={s.key} onClick={() => setStatusFilter(s.key)} style={{ background: statusFilter === s.key ? s.color + "22" : "hsl(222 47% 11%)", border: `1px solid ${statusFilter === s.key ? s.color + "66" : "hsl(217 32% 16%)"}`, borderRadius: 10, padding: "10px 8px", cursor: "pointer", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{cnt}</div>
                  <div style={{ fontSize: 11, color: "hsl(215 20% 55%)", marginTop: 2 }}>{s.label}</div>
                </button>
              );
            })}
          </div>

          {loading ? <div style={{ textAlign: "center", color: "hsl(215 20% 55%)", padding: 40 }}>جارٍ التحميل...</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {orders.map(order => {
                const st = STATUS_PIPELINE.find(s => s.key === order.status) ?? STATUS_PIPELINE[0];
                const svc = SVC_LABELS[order.service_type] ?? { label: order.service_type, color: "#6B7280" };
                const isPending = order.status === "pending_review";
                return (
                  <div key={order.id} style={{ background: "hsl(222 47% 11%)", border: `1px solid ${st.color}22`, borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ height: 3, background: `linear-gradient(90deg, ${st.color}, ${st.color}66)` }} />
                    <div style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: st.color + "18", color: st.color, border: `1px solid ${st.color}33` }}>{st.label}</span>
                          <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, background: svc.color + "18", color: svc.color }}>{svc.label}</span>
                          {order.delivery_location === "outside_city" && <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, background: "#F9731618", color: "#F97316" }}>خارج المدينة</span>}
                          {order.voice_presentation && <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, background: "#D4AF3718", color: "#D4AF37" }}>🎤 تقديم صوتي</span>}
                          {order.message_by_us && <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, background: "#C084FC18", color: "#C084FC" }}>✍️ نصيغ الرسالة</span>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 800, fontSize: 15, color: "#f0fdf4" }}>{order.order_number}</div>
                          <div style={{ fontSize: 11, color: "hsl(215 20% 45%)" }}>{new Date(order.created_at).toLocaleString("ar-SA")}</div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 16px", marginBottom: 12, fontSize: 12 }}>
                        <div><span style={{ color: "hsl(215 20% 45%)" }}>المرسل: </span><span style={{ color: "#f0fdf4" }}>{order.sender_name || "—"}</span></div>
                        <div><span style={{ color: "hsl(215 20% 45%)" }}>هاتفه: </span><span style={{ color: "#f0fdf4", direction: "ltr", display: "inline-block" }}>{order.sender_phone || "—"}</span></div>
                        <div><span style={{ color: "hsl(215 20% 45%)" }}>المستلم: </span><span style={{ color: "#f0fdf4" }}>{order.recipient_name}</span></div>
                        <div><span style={{ color: "hsl(215 20% 45%)" }}>هاتفه: </span><span style={{ color: "#f0fdf4", direction: "ltr", display: "inline-block" }}>{order.recipient_phone || "—"}</span></div>
                        <div><span style={{ color: "hsl(215 20% 45%)" }}>العنوان: </span><span style={{ color: "#f0fdf4" }}>{order.recipient_address || "—"}</span></div>
                        <div><span style={{ color: "hsl(215 20% 45%)" }}>الهدية: </span><span style={{ color: "#f0fdf4" }}>{GIFT_LABELS[order.gift_type] || order.gift_type}</span></div>
                        {Number(order.estimated_cost) > 0 && <div><span style={{ color: "hsl(215 20% 45%)" }}>التكلفة: </span><span style={{ color: GOLD, fontWeight: 700 }}>{Number(order.estimated_cost).toLocaleString()} SDG</span></div>}
                        {Number(order.gift_money_amount) > 0 && <div><span style={{ color: "hsl(215 20% 45%)" }}>المبلغ المُهدى: </span><span style={{ color: GREEN }}>{Number(order.gift_money_amount).toLocaleString()} SDG</span></div>}
                      </div>

                      {order.message_text && (
                        <div style={{ background: "hsl(222 47% 9%)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "hsl(215 20% 70%)", lineHeight: 1.8, textAlign: "right" }}>
                          💬 {order.message_text}
                        </div>
                      )}

                      {order.modification_request && (
                        <div style={{ background: "#F9731615", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 12, color: "#FED7AA", borderLeft: "3px solid #F97316" }}>
                          ✏️ طلب التعديل: {order.modification_request}
                        </div>
                      )}
                      {order.rejection_reason && (
                        <div style={{ background: "#EF444415", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 12, color: "#FCA5A5", borderLeft: "3px solid #EF4444" }}>
                          ✕ سبب الرفض: {order.rejection_reason}
                        </div>
                      )}
                      {order.admin_notes && (
                        <div style={{ background: "#22C55E15", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 12, color: "#86EFAC", borderLeft: "3px solid #22C55E" }}>
                          📝 ملاحظات: {order.admin_notes}
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        <button onClick={() => { setDetailOrder(order); setShowDetail(true); }} style={smallBtn("#0EA5E9")}>🔍 تفاصيل</button>
                        {isPending && (
                          <button onClick={() => { setReviewTarget(order); setReviewForm({ action:"approve", admin_notes:"", rejection_reason:"", modification_request:"", estimated_cost:"" }); setShowReview(true); }} style={smallBtn(GREEN)}>✓ مراجعة</button>
                        )}
                        {order.status === "approved" && (
                          <button onClick={() => quickStatus(order.id, "preparing")} style={smallBtn("#0EA5E9")}>🔧 بدء التجهيز</button>
                        )}
                        {order.status === "preparing" && (
                          <button onClick={() => quickStatus(order.id, "sending")} style={smallBtn("#C084FC")}>🚴 إرسال</button>
                        )}
                        {order.status === "sending" && (
                          <button onClick={() => quickStatus(order.id, "completed")} style={smallBtn("#3EFF9C")}>✓ مكتمل</button>
                        )}
                        {order.status === "sending" && (
                          <button onClick={() => quickStatus(order.id, "returned")} style={smallBtn("#6B7280")}>↩ مُعادة</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {orders.length === 0 && !loading && (
                <div style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: 60, fontSize: 15 }}>لا توجد طلبات بهذه الحالة</div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══ تبويب المتجر ══ */}
      {tab === "products" && (
        <>
          <button onClick={() => { setEditingProd(null); setProdForm({ name:"", description:"", price:"0", category:"general", is_available:true, sort_order:"0" }); setShowProdModal(true); }} style={btnS(PINK)}>+ إضافة هدية للمتجر</button>
          <div style={{ marginTop: 16 }}>
            {prodLoading ? <div style={{ textAlign: "center", color: "hsl(215 20% 55%)", padding: 40 }}>جارٍ التحميل...</div> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
                {products.map(p => (
                  <div key={p.id} style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(217 32% 16%)", borderRadius: 14, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { setEditingProd(p); setProdForm({ name:p.name, description:p.description||"", price:p.price, category:p.category, is_available:p.is_available, sort_order:String(p.sort_order) }); setShowProdModal(true); }} style={smallBtn("#0EA5E9")}>تعديل</button>
                        <button onClick={() => deleteProd(p.id)} style={smallBtn("#EF4444")}>حذف</button>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#f0fdf4" }}>{p.name}</div>
                        {p.description && <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginTop: 3 }}>{p.description}</div>}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, background: p.is_available ? "#22C55E18" : "#EF444418", color: p.is_available ? "#22C55E" : "#EF4444" }}>{p.is_available ? "متاح" : "غير متاح"}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 800, color: GOLD }}>{Number(p.price).toLocaleString()} SDG</span>
                    </div>
                  </div>
                ))}
                {products.length === 0 && !prodLoading && (
                  <div style={{ gridColumn: "1/-1", textAlign: "center", color: "hsl(215 20% 50%)", padding: 60 }}>لا توجد منتجات — أضف أول هدية للمتجر</div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ Modal: مراجعة الطلب ══ */}
      {showReview && reviewTarget && (
        <Modal title={`مراجعة الطلب ${reviewTarget.order_number}`} onClose={() => setShowReview(false)}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#f0fdf4", marginBottom: 4, textAlign: "right" }}>الإجراء</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ k:"approve", l:"قبول ✓", c: GREEN }, { k:"request_modification", l:"طلب تعديل ✏️", c:"#F97316" }, { k:"reject", l:"رفض ✕", c:"#EF4444" }].map(a => (
                <button key={a.k} onClick={() => setReviewForm(p=>({...p,action:a.k}))} style={{ flex:1, padding:"9px 4px", borderRadius:8, border:`2px solid ${reviewForm.action===a.k?a.c:a.c+"33"}`, cursor:"pointer", background:reviewForm.action===a.k?a.c+"22":"transparent", color:reviewForm.action===a.k?a.c:"hsl(215 20% 55%)", fontFamily:"'Cairo',sans-serif", fontSize:12, fontWeight:700 }}>{a.l}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display:"block", fontSize:12, color:"hsl(215 20% 50%)", marginBottom:4, textAlign:"right" }}>التكلفة المقدرة (SDG)</label>
            <input type="number" style={inputS} value={reviewForm.estimated_cost} onChange={e=>setReviewForm(p=>({...p,estimated_cost:e.target.value}))} placeholder="0" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display:"block", fontSize:12, color:"hsl(215 20% 50%)", marginBottom:4, textAlign:"right" }}>ملاحظات للمرسل</label>
            <textarea style={{ ...inputS, height: 70, resize:"none" }} value={reviewForm.admin_notes} onChange={e=>setReviewForm(p=>({...p,admin_notes:e.target.value}))} />
          </div>
          {reviewForm.action === "reject" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display:"block", fontSize:12, color:"hsl(215 20% 50%)", marginBottom:4, textAlign:"right" }}>سبب الرفض *</label>
              <textarea style={{ ...inputS, height: 70, resize:"none" }} value={reviewForm.rejection_reason} onChange={e=>setReviewForm(p=>({...p,rejection_reason:e.target.value}))} />
            </div>
          )}
          {reviewForm.action === "request_modification" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display:"block", fontSize:12, color:"hsl(215 20% 50%)", marginBottom:4, textAlign:"right" }}>ما الذي يحتاج تعديل؟ *</label>
              <textarea style={{ ...inputS, height: 70, resize:"none" }} value={reviewForm.modification_request} onChange={e=>setReviewForm(p=>({...p,modification_request:e.target.value}))} />
            </div>
          )}
          {error && <div style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <button onClick={() => setShowReview(false)} style={{ ...btnS("hsl(222 47% 15%)"), color:"hsl(215 20% 55%)" }}>إلغاء</button>
            <button onClick={submitReview} disabled={saving} style={btnS(reviewForm.action==="approve"?GREEN:reviewForm.action==="reject"?"#EF4444":"#F97316")}>{saving ? "جارٍ الحفظ…" : "💾 تأكيد"}</button>
          </div>
        </Modal>
      )}

      {/* ══ Modal: تفاصيل الطلب ══ */}
      {showDetail && detailOrder && (
        <Modal title={`تفاصيل ${detailOrder.order_number}`} onClose={() => setShowDetail(false)}>
          <DL label="المرسل"    value={detailOrder.sender_name} />
          <DL label="هاتف المرسل"  value={detailOrder.sender_phone} />
          <DL label="المستلم"   value={detailOrder.recipient_name} />
          <DL label="هاتف المستلم" value={detailOrder.recipient_phone} />
          <DL label="العنوان"   value={detailOrder.recipient_address} />
          <DL label="التوصيل"   value={detailOrder.delivery_location === "inside_city" ? "داخل المدينة" : "خارج المدينة"} />
          <DL label="الخدمة"    value={SVC_LABELS[detailOrder.service_type]?.label ?? detailOrder.service_type} />
          <DL label="المناسبة"  value={detailOrder.occasion_type} />
          <DL label="الهدية"    value={GIFT_LABELS[detailOrder.gift_type]} />
          {detailOrder.gift_product_name && <DL label="المنتج" value={detailOrder.gift_product_name} />}
          {detailOrder.gift_external_desc && <DL label="الهدية الخارجية" value={detailOrder.gift_external_desc} />}
          {Number(detailOrder.gift_money_amount) > 0 && <DL label="المبلغ" value={Number(detailOrder.gift_money_amount).toLocaleString() + " SDG"} />}
          {detailOrder.message_text && (
            <div style={{ background: "hsl(222 47% 9%)", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "hsl(215 20% 45%)", marginBottom: 6 }}>الرسالة {detailOrder.message_by_us ? "(نكتبها عنه)" : ""}:</div>
              <div style={{ fontSize: 13, color: "#f0fdf4", lineHeight: 1.8, textAlign: "right" }}>{detailOrder.message_text}</div>
            </div>
          )}
          {detailOrder.voice_presentation && <div style={{ color: "#D4AF37", fontSize: 13, marginBottom: 8 }}>🎤 يطلب تقديم صوتي خلال الحفل</div>}
          {detailOrder.shoubash_guests && detailOrder.shoubash_guests.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, color: GOLD, marginBottom: 8, fontSize: 13 }}>ضيوف الشوبش:</div>
              {detailOrder.shoubash_guests.map((g,i) => (
                <div key={i} style={{ background: "hsl(222 47% 9%)", borderRadius: 8, padding: "8px 12px", marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: "#f0fdf4" }}>{g.guest_name}</span>
                  {g.guest_phone && <span style={{ color: "hsl(215 20% 50%)", marginRight: 10, direction: "ltr", display:"inline-block" }}>{g.guest_phone}</span>}
                  {g.gift_desc && <div style={{ color: "hsl(215 20% 60%)", marginTop: 4 }}>{g.gift_desc}</div>}
                  {Number(g.gift_amount) > 0 && <div style={{ color: GREEN, marginTop: 2 }}>{Number(g.gift_amount).toLocaleString()} SDG</div>}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ══ Modal: منتج ══ */}
      {showProdModal && (
        <Modal title={editingProd?.id ? "تعديل الهدية" : "إضافة هدية للمتجر"} onClose={() => setShowProdModal(false)}>
          {[
            { label:"اسم الهدية *", key:"name", type:"text" },
            { label:"الوصف", key:"description", type:"text" },
            { label:"السعر (SDG)", key:"price", type:"number" },
            { label:"الفئة", key:"category", type:"text" },
            { label:"الترتيب", key:"sort_order", type:"number" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{ display:"block", fontSize:12, color:"hsl(215 20% 50%)", marginBottom:4, textAlign:"right" }}>{f.label}</label>
              <input type={f.type} style={inputS} value={(prodForm as any)[f.key]} onChange={e=>setProdForm(p=>({...p,[f.key]:e.target.value}))} />
            </div>
          ))}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <input type="checkbox" id="avail" checked={prodForm.is_available} onChange={e=>setProdForm(p=>({...p,is_available:e.target.checked}))} />
            <label htmlFor="avail" style={{ color:"hsl(215 20% 70%)", fontSize:13, cursor:"pointer" }}>متاح للطلب</label>
          </div>
          {error && <div style={{ color:"#FCA5A5", fontSize:12, marginBottom:8 }}>{error}</div>}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <button onClick={() => setShowProdModal(false)} style={{ ...btnS("hsl(222 47% 15%)"), color:"hsl(215 20% 55%)" }}>إلغاء</button>
            <button onClick={saveProd} disabled={saving} style={btnS(PINK)}>{saving ? "جارٍ الحفظ…" : "💾 حفظ"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
