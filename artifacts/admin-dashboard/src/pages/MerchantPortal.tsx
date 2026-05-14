import { useState, useCallback } from "react";

// ── ألوان ─────────────────────────────────────────────────────────────────────
const C = {
  bg:       "hsl(222 47% 8%)",
  surface:  "hsl(222 47% 11%)",
  surfaceHi:"hsl(222 47% 14%)",
  border:   "hsl(217 32% 15%)",
  text:     "hsl(210 40% 92%)",
  muted:    "hsl(215 20% 50%)",
  orange:   "#f97316",
  green:    "#34d399",
  blue:     "#60a5fa",
  yellow:   "#fbbf24",
  red:      "#f87171",
  teal:     "#2dd4bf",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string) => `${BASE}/api${path}`;
const PIN_KEY = "merchant_portal_pin";

// ── أنواع ─────────────────────────────────────────────────────────────────────
type MerchantShop = {
  id: number; shop_name: string; owner_name: string;
  category: string; description: string; address: string;
  phone: string; whatsapp: string; working_hours: string;
  logo_emoji: string; status: string; is_featured: boolean;
  is_verified: boolean; created_at: string;
  portal_token?: string;
};
type MerchantItem = {
  id: number; shop_id: number; name: string; description: string;
  price: number; unit: string; category: string; is_available: boolean;
  image_emoji: string; quantity_hint: string; sort_order: number;
};
type PortalData = { shop: MerchantShop; items: MerchantItem[]; token: string };

const EMPTY_ITEM = {
  name: "", description: "", price: "", unit: "حبة", category: "general",
  image_emoji: "📦", quantity_hint: "", is_available: true,
};

// ── مكوّن الإدخال ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`,
  background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
};

// ── شاشة الدخول ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (data: PortalData) => void }) {
  const [shopId,  setShopId]  = useState("");
  const [pin,     setPin]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const login = async () => {
    if (!shopId || !pin) { setError("رقم المتجر والرمز مطلوبان"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(api("/merchant-portal/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_id: Number(shopId), pin }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "فشل تسجيل الدخول"); return; }
      const data: PortalData = await res.json();
      sessionStorage.setItem(PIN_KEY, data.token);
      onLogin(data);
    } catch { setError("خطأ في الاتصال"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 380, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 24, padding: "40px 36px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🏪</div>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: C.text }}>بوابة التجار</h1>
        <p style={{ margin: "0 0 28px", fontSize: 13, color: C.muted }}>ادخل رقم متجرك والرمز السري للوصول</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "right" }}>
          <Field label="رقم المتجر (ID)">
            <input type="number" value={shopId} onChange={e => setShopId(e.target.value)} placeholder="احصل عليه من الأدمن" style={inp} />
          </Field>
          <Field label="الرمز السري">
            <input type="password" value={pin} onChange={e => setPin(e.target.value)}
              placeholder="••••" style={inp} onKeyDown={e => e.key === "Enter" && login()} />
          </Field>

          {error && (
            <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.red }}>
              ⚠️ {error}
            </div>
          )}

          <button onClick={login} disabled={loading} style={{
            padding: "13px", borderRadius: 12, border: "none", cursor: loading ? "not-allowed" : "pointer",
            background: loading ? C.border : `linear-gradient(135deg,${C.orange},#ea580c)`,
            color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 700,
          }}>
            {loading ? "جارٍ الدخول..." : "🔑 دخول"}
          </button>
        </div>

        <p style={{ marginTop: 22, fontSize: 11, color: C.muted }}>
          لا تملك رمزاً؟ تواصل مع الإدارة لتفعيل بوابتك
        </p>
      </div>
    </div>
  );
}

// ── بطاقة منتج ──────────────────────────────────────────────────────────────
function ItemCard({ item, onEdit, onToggle, onDelete }: {
  item: MerchantItem;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: C.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{item.image_emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{item.name}</span>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: item.is_available ? "rgba(52,211,153,.15)" : "rgba(107,114,128,.15)", color: item.is_available ? C.green : C.muted, border: `1px solid ${item.is_available ? "rgba(52,211,153,.3)" : C.border}` }}>
            {item.is_available ? "متاح" : "غير متاح"}
          </span>
        </div>
        {item.description && <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{item.description}</div>}
        <div style={{ fontSize: 13, color: C.orange, fontWeight: 700 }}>
          {Number(item.price) > 0 ? `${item.price} SDG / ${item.unit}` : "السعر عند الطلب"}
          {item.quantity_hint && <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginRight: 8 }}>{item.quantity_hint}</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
        <button onClick={onEdit} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.blue, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600 }}>تعديل</button>
        <button onClick={onToggle} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: item.is_available ? C.muted : C.green, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>
          {item.is_available ? "إخفاء" : "إظهار"}
        </button>
        <button onClick={onDelete} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.08)", color: C.red, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>حذف</button>
      </div>
    </div>
  );
}

// ── الواجهة الرئيسية ──────────────────────────────────────────────────────────
function PortalMain({ data, onLogout }: { data: PortalData; onLogout: () => void }) {
  const [items,       setItems]       = useState<MerchantItem[]>(data.items);
  const [activeTab,   setActiveTab]   = useState<"items" | "shop">("items");
  const [showForm,    setShowForm]    = useState(false);
  const [editItem,    setEditItem]    = useState<MerchantItem | null>(null);
  const [form,        setForm]        = useState({ ...EMPTY_ITEM });
  const [saving,      setSaving]      = useState(false);
  const [shopForm,    setShopForm]    = useState({ ...data.shop });
  const [savingShop,  setSavingShop]  = useState(false);
  const [shopSaved,   setShopSaved]   = useState(false);
  const [searchTerm,  setSearchTerm]  = useState("");

  const headers = { "Content-Type": "application/json", "Authorization": `Bearer mp_${data.token}` };

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch(api(`/merchant-portal/shop/${data.shop.id}/items`), { headers });
      if (res.ok) setItems(await res.json());
    } catch {}
  }, [data.shop.id, data.token]);

  const openAdd  = () => { setEditItem(null); setForm({ ...EMPTY_ITEM }); setShowForm(true); };
  const openEdit = (item: MerchantItem) => {
    setEditItem(item);
    setForm({ name: item.name, description: item.description || "", price: String(item.price), unit: item.unit || "حبة", category: item.category || "general", image_emoji: item.image_emoji || "📦", quantity_hint: item.quantity_hint || "", is_available: item.is_available });
    setShowForm(true);
  };

  const saveItem = async () => {
    if (!form.name) { alert("اسم المنتج مطلوب"); return; }
    setSaving(true);
    try {
      if (editItem) {
        const res = await fetch(api(`/merchant-portal/shop/${data.shop.id}/items/${editItem.id}`), { method: "PATCH", headers, body: JSON.stringify({ ...form, price: Number(form.price) || 0 }) });
        if (!res.ok) { alert("فشل التحديث"); return; }
      } else {
        const res = await fetch(api(`/merchant-portal/shop/${data.shop.id}/items`), { method: "POST", headers, body: JSON.stringify({ ...form, price: Number(form.price) || 0 }) });
        if (!res.ok) { alert("فشل الإضافة"); return; }
      }
      await loadItems();
      setShowForm(false);
    } catch { alert("خطأ في الاتصال"); }
    finally { setSaving(false); }
  };

  const toggleItem = async (item: MerchantItem) => {
    try {
      await fetch(api(`/merchant-portal/shop/${data.shop.id}/items/${item.id}`), {
        method: "PATCH", headers, body: JSON.stringify({ is_available: !item.is_available }),
      });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i));
    } catch {}
  };

  const deleteItem = async (item: MerchantItem) => {
    if (!confirm(`حذف "${item.name}"؟`)) return;
    try {
      await fetch(api(`/merchant-portal/shop/${data.shop.id}/items/${item.id}`), { method: "DELETE", headers });
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch {}
  };

  const saveShop = async () => {
    setSavingShop(true);
    try {
      const res = await fetch(api(`/merchant-portal/shop/${data.shop.id}`), {
        method: "PATCH", headers, body: JSON.stringify({
          description: shopForm.description, address: shopForm.address,
          phone: shopForm.phone, whatsapp: shopForm.whatsapp,
          working_hours: shopForm.working_hours, logo_emoji: shopForm.logo_emoji,
        }),
      });
      if (res.ok) { setShopSaved(true); setTimeout(() => setShopSaved(false), 3000); }
      else alert("فشل الحفظ");
    } catch { alert("خطأ في الاتصال"); }
    finally { setSavingShop(false); }
  };

  const filtered = items.filter(i => !searchTerm || i.name.includes(searchTerm) || i.description?.includes(searchTerm));

  const tabBtn = (key: "items" | "shop", label: string) => (
    <button onClick={() => setActiveTab(key)} style={{
      padding: "9px 22px", borderRadius: 20, border: "1px solid",
      borderColor: activeTab === key ? `${C.orange}50` : C.border,
      background: activeTab === key ? `${C.orange}15` : "transparent",
      color: activeTab === key ? C.orange : C.muted,
      cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, direction: "rtl" }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 28px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 50, height: 50, borderRadius: 14, background: C.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{data.shop.logo_emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{data.shop.shop_name}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {data.shop.owner_name} ·
            <span style={{ marginRight: 6, padding: "2px 8px", borderRadius: 20, fontSize: 10, background: data.shop.status === "approved" ? "rgba(52,211,153,.15)" : "rgba(251,191,36,.15)", color: data.shop.status === "approved" ? C.green : C.yellow, border: `1px solid ${data.shop.status === "approved" ? "rgba(52,211,153,.3)" : "rgba(251,191,36,.3)"}` }}>
              {data.shop.status === "approved" ? "✓ مفعّل" : "⏳ قيد المراجعة"}
            </span>
            {data.shop.is_verified && <span style={{ marginRight: 4, padding: "2px 8px", borderRadius: 20, fontSize: 10, background: "rgba(192,132,252,.15)", color: "#c084fc", border: "1px solid rgba(192,132,252,.3)" }}>موثّق</span>}
          </div>
        </div>
        <button onClick={onLogout} style={{ padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
          تسجيل خروج
        </button>
      </div>

      <div style={{ padding: "24px 28px 48px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {tabBtn("items", `📦 المنتجات (${items.length})`)}
          {tabBtn("shop", "🏪 معلومات المتجر")}
        </div>

        {/* ── تبويب المنتجات ── */}
        {activeTab === "items" && (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
              <button onClick={openAdd} style={{ padding: "10px 22px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${C.orange},#ea580c)`, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
                ➕ إضافة منتج جديد
              </button>
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="ابحث في المنتجات..." style={{ ...inp, width: 220, flex: "0 0 auto" }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginRight: "auto" }}>
                <span style={{ fontSize: 12, color: C.muted }}>{items.filter(i => i.is_available).length} متاح</span>
                <span style={{ fontSize: 12, color: C.muted }}>·</span>
                <span style={{ fontSize: 12, color: C.muted }}>{items.filter(i => !i.is_available).length} مخفي</span>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                <div style={{ color: C.muted, fontSize: 14 }}>لا توجد منتجات بعد. أضف منتجك الأول!</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(380px,1fr))", gap: 12 }}>
                {filtered.map(item => (
                  <ItemCard key={item.id} item={item}
                    onEdit={() => openEdit(item)}
                    onToggle={() => toggleItem(item)}
                    onDelete={() => deleteItem(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── تبويب المتجر ── */}
        {activeTab === "shop" && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px" }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: C.text }}>✏️ تعديل معلومات المتجر</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="وصف المتجر">
                  <textarea value={shopForm.description || ""} onChange={e => setShopForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="وصف مختصر لمتجرك وخدماتك..." rows={3} style={{ ...inp, resize: "vertical" }} />
                </Field>
                <Field label="العنوان">
                  <input value={shopForm.address || ""} onChange={e => setShopForm(p => ({ ...p, address: e.target.value }))} placeholder="موقع المتجر" style={inp} />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="رقم الهاتف">
                    <input value={shopForm.phone || ""} onChange={e => setShopForm(p => ({ ...p, phone: e.target.value }))} placeholder="09XXXXXXXX" style={inp} />
                  </Field>
                  <Field label="واتساب">
                    <input value={shopForm.whatsapp || ""} onChange={e => setShopForm(p => ({ ...p, whatsapp: e.target.value }))} placeholder="09XXXXXXXX" style={inp} />
                  </Field>
                </div>
                <Field label="ساعات العمل">
                  <input value={shopForm.working_hours || ""} onChange={e => setShopForm(p => ({ ...p, working_hours: e.target.value }))} placeholder="مثال: 8ص – 10م يومياً" style={inp} />
                </Field>
                <Field label="رمز المتجر (Emoji)">
                  <input value={shopForm.logo_emoji || "🏪"} onChange={e => setShopForm(p => ({ ...p, logo_emoji: e.target.value }))} placeholder="🏪" style={{ ...inp, width: 80 }} />
                </Field>

                <button onClick={saveShop} disabled={savingShop} style={{
                  padding: "12px", borderRadius: 12, border: "none", cursor: savingShop ? "not-allowed" : "pointer",
                  background: shopSaved ? C.green : `linear-gradient(135deg,${C.orange},#ea580c)`,
                  color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700,
                }}>
                  {shopSaved ? "✅ تم الحفظ!" : savingShop ? "جارٍ الحفظ..." : "💾 حفظ التغييرات"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16, background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.2)", borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ fontSize: 12, color: C.blue, fontWeight: 700, marginBottom: 6 }}>ℹ️ معلومات للقراءة فقط</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
                <div>معرّف المتجر: <strong style={{ color: C.text }}>#{data.shop.id}</strong></div>
                <div>التصنيف: <strong style={{ color: C.text }}>{data.shop.category}</strong></div>
                <div>تاريخ التسجيل: <strong style={{ color: C.text }}>{new Date(data.shop.created_at).toLocaleDateString("ar")}</strong></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal إضافة/تعديل منتج */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: "28px 28px 24px", width: 480, maxHeight: "90vh", overflowY: "auto", direction: "rtl" }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: C.text }}>
              {editItem ? "✏️ تعديل المنتج" : "➕ إضافة منتج جديد"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 64px", gap: 10 }}>
                <Field label="اسم المنتج *">
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="اسم المنتج" style={inp} />
                </Field>
                <Field label="رمز">
                  <input value={form.image_emoji} onChange={e => setForm(p => ({ ...p, image_emoji: e.target.value }))} placeholder="📦" style={{ ...inp, textAlign: "center", fontSize: 20 }} />
                </Field>
              </div>
              <Field label="الوصف">
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="وصف مختصر للمنتج..." rows={2} style={{ ...inp, resize: "vertical" }} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="السعر (SDG)">
                  <input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0 = عند الطلب" style={inp} />
                </Field>
                <Field label="الوحدة">
                  <input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} placeholder="حبة / كيلو / متر..." style={inp} />
                </Field>
              </div>
              <Field label="ملاحظة الكمية">
                <input value={form.quantity_hint} onChange={e => setForm(p => ({ ...p, quantity_hint: e.target.value }))} placeholder="مثال: محدود / متوفر بكميات كبيرة" style={inp} />
              </Field>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" id="avail" checked={form.is_available} onChange={e => setForm(p => ({ ...p, is_available: e.target.checked }))} />
                <label htmlFor="avail" style={{ fontSize: 13, color: C.text, cursor: "pointer" }}>متاح للطلب الآن</label>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button onClick={saveItem} disabled={saving} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", cursor: saving ? "not-allowed" : "pointer", background: `linear-gradient(135deg,${C.orange},#ea580c)`, color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
                {saving ? "جارٍ الحفظ..." : editItem ? "💾 حفظ التعديل" : "✅ إضافة"}
              </button>
              <button onClick={() => setShowForm(false)} style={{ padding: "12px 20px", borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── المكوّن الرئيسي ───────────────────────────────────────────────────────────
export default function MerchantPortal() {
  const [portalData, setPortalData] = useState<PortalData | null>(null);

  const handleLogout = () => {
    sessionStorage.removeItem(PIN_KEY);
    setPortalData(null);
  };

  if (!portalData) return <LoginScreen onLogin={setPortalData} />;
  return <PortalMain data={portalData} onLogout={handleLogout} />;
}
