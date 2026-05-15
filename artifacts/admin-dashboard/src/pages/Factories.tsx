import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiJson } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/Layout";

const FAC   = "#F97316";
const FAC2  = "#EA580C";
const GOLD  = "#F59E0B";
const GREEN = "#22C55E";

const API_BASE = (() => {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return base + "/api";
})();

const PLAN_COLORS: Record<string, string> = { premium: GOLD, standard: "#0EA5E9", basic: GREEN, free: "#6B7280" };
const PLAN_LABELS: Record<string, string> = { premium: "★ بريميوم", standard: "⬡ ستاندرد", basic: "◉ أساسي", free: "● مجاني" };
const FAC_CAT_LABELS: Record<string, string> = {
  food: "غذاء", textile: "نسيج وملابس", building: "مواد بناء",
  chemicals: "كيماويات", metals: "معادن", agri: "زراعي", consumer: "استهلاكي", general: "عام",
};
const STOCK_COLORS: Record<string, string> = { available: GREEN, limited: GOLD, out_of_stock: "#EF4444" };
const STOCK_LABELS: Record<string, string> = { available: "متوفر", limited: "كمية محدودة", out_of_stock: "نفذ" };

type Factory = {
  id: number; name: string; short_name?: string; logo_initial?: string;
  brand_color: string; brand_color2?: string; category: string; description?: string;
  location?: string; address?: string; phone?: string; whatsapp?: string; email?: string; website?: string;
  contact_person?: string; contact_email?: string; founded?: string; employees?: string;
  promo_tagline?: string; promo_badge?: string; promo_banner_url?: string;
  package_type: string; plan_name_ar?: string; plan_color?: string; plan_icon?: string;
  contract_start?: string; contract_end?: string; monthly_fee?: number;
  portal_pin_hash?: string; is_active: boolean; is_featured: boolean;
  products_count?: number; sort_order: number; views_count?: number;
  created_at: string;
};
type Product = {
  id: number; factory_id: number; name: string; description?: string;
  category: string; price?: number; price_unit?: string; price_note?: string;
  min_order?: string; image_url?: string; stock_status: string;
  is_featured: boolean; is_active: boolean; sort_order: number;
};
type Plan = {
  id: number; name: string; name_ar: string; description?: string; price_monthly: number;
  max_products: number; has_priority: boolean; has_banner: boolean;
  has_promo: boolean; has_sponsor_badge: boolean; color: string; icon: string;
};
type Sponsor = { id: number; display_name: string; brand_color: string; tagline?: string; website?: string; is_active: boolean; sponsor_from?: string; sponsor_to?: string };

const iS: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid hsl(222 47% 20%)", background: "hsl(222 47% 8%)",
  color: "#f0fdf4", fontFamily: "'Cairo', sans-serif", fontSize: 13, boxSizing: "border-box",
};
const selS: React.CSSProperties = { ...iS };

function FGroup({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "span 1" }}>
      <label style={{ display: "block", fontSize: 12, color: "hsl(215 20% 55%)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Factory Portal (company side) ─────────────────────────────────────────
async function factoryPortalFetch(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...((opts.headers as Record<string, string>) || {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Server error"); }
  return res.json();
}

function FactoryPortalView() {
  const confirm = useConfirm();
  const [factories, setFactories] = useState<{ id: number; name: string; logo_initial?: string; brand_color: string }[]>([]);
  const [selFac, setSelFac] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [token, setToken] = useState(() => sessionStorage.getItem("fac_portal_token") || "");
  const [factory, setFactory] = useState<Factory | null>(null);
  const [tab, setTab] = useState<"profile" | "products">("profile");
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pf, setPf] = useState({ description: "", location: "", address: "", phone: "", whatsapp: "", email: "", website: "", contact_person: "", contact_email: "", promo_tagline: "", promo_banner_url: "", promo_badge: "" });
  const [showProdForm, setShowProdForm] = useState(false);
  const [editProd, setEditProd] = useState<Partial<Product> | null>(null);
  const co = factory?.brand_color || FAC;
  const planColor = PLAN_COLORS[factory?.package_type || "free"] || "#6B7280";
  const contractExpired = factory?.contract_end ? new Date(factory.contract_end) < new Date() : false;
  const isStd = ["standard", "premium"].includes(factory?.package_type || "");
  const isPremium = factory?.package_type === "premium";

  useEffect(() => {
    fetch(`${API_BASE}/factories`).then(r => r.json()).then(d => setFactories(d || [])).catch(() => {});
  }, []);

  const loadPortal = useCallback(async (t = token) => {
    if (!t) return;
    try {
      const me = await factoryPortalFetch("/factories/portal/me", t);
      setFactory(me);
      setPf({ description: me.description || "", location: me.location || "", address: me.address || "", phone: me.phone || "", whatsapp: me.whatsapp || "", email: me.email || "", website: me.website || "", contact_person: me.contact_person || "", contact_email: me.contact_email || "", promo_tagline: me.promo_tagline || "", promo_banner_url: me.promo_banner_url || "", promo_badge: me.promo_badge || "" });
      const prods = await factoryPortalFetch("/factories/portal/products", t).catch(() => []);
      setProducts(Array.isArray(prods) ? prods : []);
    } catch { setToken(""); sessionStorage.removeItem("fac_portal_token"); }
  }, [token]);

  useEffect(() => { if (token) loadPortal(token); }, []);

  async function doLogin() {
    if (!selFac) { setLoginErr("اختر مصنعك أولاً"); return; }
    if (!pin) { setLoginErr("أدخل الرمز السري"); return; }
    setLoginLoading(true); setLoginErr("");
    try {
      const res = await fetch(`${API_BASE}/factories/portal/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factory_id: selFac, pin }) });
      const data = await res.json();
      if (!res.ok) { setLoginErr(data.error || "فشل الدخول"); return; }
      const t = data.token;
      setToken(t); sessionStorage.setItem("fac_portal_token", t);
      await loadPortal(t);
    } catch { setLoginErr("تعذّر الاتصال بالخادم"); }
    finally { setLoginLoading(false); }
  }

  async function saveProfile() {
    setSaving(true); setError("");
    try { const me = await factoryPortalFetch("/factories/portal/me", token, { method: "PATCH", body: JSON.stringify(pf) }); setFactory(me); alert("✅ تم الحفظ"); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function saveProd() {
    if (!editProd?.name) { setError("اسم المنتج مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editProd.id;
      await factoryPortalFetch(isEdit ? `/factories/portal/products/${editProd.id}` : "/factories/portal/products", token, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editProd) });
      setShowProdForm(false); setEditProd(null);
      const d = await factoryPortalFetch("/factories/portal/products", token).catch(() => []); setProducts(d);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteProd(id: number) {
    if (!(await confirm({ title: "تأكيد الحذف", description: "هل تريد حذف هذا المنتج؟", confirmText: "حذف", destructive: true }))) return;
    try { await factoryPortalFetch(`/factories/portal/products/${id}`, token, { method: "DELETE" }); setProducts(products.filter(p => p.id !== id)); }
    catch (e: any) { setError(e.message); }
  }

  if (!token || !factory) {
    return (
      <div style={{ padding: "40px 24px", maxWidth: 480, margin: "0 auto", direction: "rtl" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏭</div>
          <h2 style={{ margin: 0, color: "#f0fdf4", fontSize: 20 }}>بوابة إدارة المصنع</h2>
          <p style={{ color: "hsl(215 20% 50%)", margin: "8px 0 0", fontSize: 13 }}>منصة حصاحيصاوي — أصحاب المصانع</p>
        </div>
        <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, padding: 28, border: "1px solid hsl(222 47% 18%)" }}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 60%)", marginBottom: 6 }}>اختر مصنعك</label>
            <select style={selS} value={selFac || ""} onChange={e => setSelFac(Number(e.target.value))}>
              <option value="">— اختر المصنع —</option>
              {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 60%)", marginBottom: 6 }}>الرمز السري</label>
            <input type="password" maxLength={10} style={{ ...iS, textAlign: "center", letterSpacing: 8, fontSize: 18 }} value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && doLogin()} placeholder="••••••" />
          </div>
          {loginErr && <div style={{ background: "#EF444422", border: "1px solid #EF4444", borderRadius: 8, padding: "8px 14px", color: "#FCA5A5", fontSize: 13, marginBottom: 14 }}>{loginErr}</div>}
          <button onClick={doLogin} disabled={loginLoading} style={{ width: "100%", padding: "12px 0", borderRadius: 11, border: "none", background: `linear-gradient(90deg,${FAC},${FAC2})`, color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 15, cursor: loginLoading ? "default" : "pointer", opacity: loginLoading ? 0.7 : 1 }}>
            {loginLoading ? "جارٍ التحقق…" : "دخول البوابة →"}
          </button>
          <p style={{ margin: "14px 0 0", textAlign: "center", fontSize: 12, color: "hsl(215 20% 40%)" }}>للحصول على بيانات الدخول تواصل مع إدارة حصاحيصاوي</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ direction: "rtl", fontFamily: "'Cairo', sans-serif" }}>
      {/* Top Bar */}
      <div style={{ background: "hsl(222 47% 9%)", borderBottom: "1px solid hsl(222 47% 14%)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 21, background: co, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: "#fff" }}>{factory.logo_initial || "🏭"}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#f0fdf4" }}>{factory.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <span style={{ padding: "1px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: planColor + "22", color: planColor, border: `1px solid ${planColor}44` }}>{PLAN_LABELS[factory.package_type]}</span>
              {factory.contract_end && <span style={{ fontSize: 11, color: contractExpired ? "#EF4444" : "hsl(215 20% 50%)" }}>{contractExpired ? "⚠️ انتهى العقد" : `ينتهي: ${new Date(factory.contract_end).toLocaleDateString("ar-SA")}`}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ textAlign: "center", background: "hsl(222 47% 14%)", borderRadius: 10, padding: "6px 16px" }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: co }}>{(factory as any).products_count ?? products.length}</div>
            <div style={{ fontSize: 10, color: "hsl(215 20% 50%)" }}>منتج</div>
          </div>
          <button onClick={() => { setToken(""); setFactory(null); sessionStorage.removeItem("fac_portal_token"); }} style={{ padding: "7px 16px", borderRadius: 9, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13 }}>خروج</button>
        </div>
      </div>

      {error && <div style={{ margin: "0 24px 16px", background: "#EF444422", border: "1px solid #EF4444", borderRadius: 8, padding: "10px 16px", color: "#FCA5A5", fontSize: 13 }}>{error}<button onClick={() => setError("")} style={{ marginRight: 10, background: "none", border: "none", color: "#FCA5A5", cursor: "pointer" }}>✕</button></div>}

      <div style={{ display: "flex", gap: 4, padding: "16px 24px 0" }}>
        {[{ key: "profile", label: "🏭 بروفايل المصنع" }, { key: "products", label: `📦 منتجاتي (${products.length})` }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13, background: tab === t.key ? co : "hsl(222 47% 12%)", color: tab === t.key ? "#fff" : "hsl(215 20% 55%)" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 24px 60px" }}>
        {tab === "profile" && (
          <div style={{ maxWidth: 800 }}>
            <h3 style={{ margin: "0 0 20px", color: "#f0fdf4", fontSize: 16 }}>تعديل ملف المصنع</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
              <FGroup label="الوصف العام" full><textarea style={iS} value={pf.description} onChange={e => setPf(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="اكتب وصفاً لمصنعك ومنتجاتك…" /></FGroup>
              <FGroup label="الموقع / المنطقة"><input style={iS} value={pf.location} onChange={e => setPf(p => ({ ...p, location: e.target.value }))} /></FGroup>
              <FGroup label="العنوان التفصيلي"><input style={iS} value={pf.address} onChange={e => setPf(p => ({ ...p, address: e.target.value }))} /></FGroup>
              <FGroup label="رقم الهاتف"><input style={iS} value={pf.phone} onChange={e => setPf(p => ({ ...p, phone: e.target.value }))} /></FGroup>
              <FGroup label="واتساب"><input style={iS} value={pf.whatsapp} onChange={e => setPf(p => ({ ...p, whatsapp: e.target.value }))} /></FGroup>
              <FGroup label="البريد الإلكتروني"><input style={iS} value={pf.email} onChange={e => setPf(p => ({ ...p, email: e.target.value }))} /></FGroup>
              <FGroup label="الموقع الإلكتروني"><input style={iS} value={pf.website} onChange={e => setPf(p => ({ ...p, website: e.target.value }))} placeholder="https://..." /></FGroup>
              <FGroup label="اسم جهة الاتصال"><input style={iS} value={pf.contact_person} onChange={e => setPf(p => ({ ...p, contact_person: e.target.value }))} /></FGroup>
              <FGroup label="بريد التواصل"><input style={iS} value={pf.contact_email} onChange={e => setPf(p => ({ ...p, contact_email: e.target.value }))} /></FGroup>
            </div>
            {isStd && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid hsl(222 47% 16%)" }}>
                <h4 style={{ margin: "0 0 16px", color: co, fontSize: 14 }}>🎯 المحتوى الترويجي</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
                  <FGroup label="شعار ترويجي" full><input style={iS} value={pf.promo_tagline} onChange={e => setPf(p => ({ ...p, promo_tagline: e.target.value }))} placeholder="أجود المنتجات — من الحصاحيصا!" maxLength={150} /></FGroup>
                  <FGroup label="شارة مميزة"><input style={iS} value={pf.promo_badge} onChange={e => setPf(p => ({ ...p, promo_badge: e.target.value }))} placeholder="جديد · إنتاج محلي" maxLength={40} /></FGroup>
                  {isPremium && <FGroup label="رابط بانر (Premium)" full><input style={iS} value={pf.promo_banner_url} onChange={e => setPf(p => ({ ...p, promo_banner_url: e.target.value }))} placeholder="https://..." /></FGroup>}
                </div>
              </div>
            )}
            <button onClick={saveProfile} disabled={saving} style={{ marginTop: 20, padding: "12px 28px", borderRadius: 11, border: "none", background: co, color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
              {saving ? "جارٍ الحفظ…" : "💾 حفظ"}
            </button>
          </div>
        )}

        {tab === "products" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#f0fdf4", fontSize: 16 }}>إدارة المنتجات</h3>
              <button onClick={() => { setEditProd({ stock_status: "available", category: "general", price_unit: "SDG" }); setShowProdForm(true); }}
                style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: co, color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                + إضافة منتج
              </button>
            </div>

            {showProdForm && (
              <div style={{ background: "hsl(222 47% 10%)", borderRadius: 14, padding: 20, marginBottom: 20, border: "1px solid hsl(222 47% 18%)" }}>
                <h4 style={{ margin: "0 0 16px", color: co }}>{editProd?.id ? "تعديل المنتج" : "منتج جديد"}</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                  <FGroup label="اسم المنتج" full><input style={iS} value={editProd?.name || ""} onChange={e => setEditProd(p => ({ ...p, name: e.target.value }))} /></FGroup>
                  <FGroup label="الوصف" full><textarea style={iS} value={editProd?.description || ""} onChange={e => setEditProd(p => ({ ...p, description: e.target.value }))} rows={2} /></FGroup>
                  <FGroup label="الفئة"><select style={selS} value={editProd?.category || "general"} onChange={e => setEditProd(p => ({ ...p, category: e.target.value }))}>
                    {Object.entries(FAC_CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></FGroup>
                  <FGroup label="السعر"><input style={iS} type="number" value={editProd?.price ?? ""} onChange={e => setEditProd(p => ({ ...p, price: e.target.value ? Number(e.target.value) : undefined }))} /></FGroup>
                  <FGroup label="العملة/الوحدة"><input style={iS} value={editProd?.price_unit || "SDG"} onChange={e => setEditProd(p => ({ ...p, price_unit: e.target.value }))} /></FGroup>
                  <FGroup label="ملاحظة السعر"><input style={iS} value={editProd?.price_note || ""} onChange={e => setEditProd(p => ({ ...p, price_note: e.target.value }))} placeholder="للطن / للكيس..." /></FGroup>
                  <FGroup label="الحد الأدنى للطلب"><input style={iS} value={editProd?.min_order || ""} onChange={e => setEditProd(p => ({ ...p, min_order: e.target.value }))} placeholder="50 كيس / طن واحد..." /></FGroup>
                  <FGroup label="حالة المخزون"><select style={selS} value={editProd?.stock_status || "available"} onChange={e => setEditProd(p => ({ ...p, stock_status: e.target.value }))}>
                    <option value="available">متوفر</option>
                    <option value="limited">كمية محدودة</option>
                    <option value="out_of_stock">نفذ المخزون</option>
                  </select></FGroup>
                  <FGroup label="رابط صورة المنتج" full><input style={iS} value={editProd?.image_url || ""} onChange={e => setEditProd(p => ({ ...p, image_url: e.target.value }))} placeholder="https://..." /></FGroup>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button onClick={saveProd} disabled={saving} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: co, color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer" }}>{saving ? "جارٍ الحفظ…" : "💾 حفظ"}</button>
                  <button onClick={() => { setShowProdForm(false); setEditProd(null); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: "hsl(215 20% 60%)", fontFamily: "'Cairo', sans-serif", fontSize: 13, cursor: "pointer" }}>إلغاء</button>
                </div>
              </div>
            )}

            {products.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px", color: "hsl(215 20% 40%)" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                <p>لم تضف أي منتجات بعد. ابدأ بإضافة منتجاتك!</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {products.map(p => (
                  <div key={p.id} style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 16%)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: "#f0fdf4", fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span>{FAC_CAT_LABELS[p.category] || p.category}</span>
                        {p.price != null && <span style={{ color: co }}>{Number(p.price).toLocaleString("ar")} {p.price_unit}</span>}
                        <span style={{ color: STOCK_COLORS[p.stock_status] }}>{STOCK_LABELS[p.stock_status]}</span>
                        {!p.is_active && <span style={{ color: "#EF4444" }}>مخفي</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setEditProd(p); setShowProdForm(true); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: co, fontFamily: "'Cairo', sans-serif", fontSize: 12, cursor: "pointer" }}>تعديل</button>
                      <button onClick={() => deleteProd(p.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #EF444440", background: "#EF444420", color: "#EF4444", fontFamily: "'Cairo', sans-serif", fontSize: 12, cursor: "pointer" }}>حذف</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// صفحة المصانع (أدمن)
// ══════════════════════════════════════════════════════════════════
export default function FactoriesAdmin() {
  const confirm = useConfirm();
  const [mainTab, setMainTab] = useState<"admin" | "portal" | "plans" | "sponsors">("admin");
  const [factories, setFactories] = useState<Factory[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editFac, setEditFac] = useState<Partial<Factory> | null>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editPlan, setEditPlan] = useState<Partial<Plan> | null>(null);
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [newSponsor, setNewSponsor] = useState({ display_name: "", brand_color: "#F97316", tagline: "", website: "", sponsor_from: "", sponsor_to: "" });
  const [portalPin, setPortalPin] = useState("");
  const [expandedFac, setExpandedFac] = useState<number | null>(null);
  const [facProducts, setFacProducts] = useState<Record<number, Product[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [facR, planR, spR] = await Promise.allSettled([
        apiJson("/factories?_admin=1"),
        apiJson("/admin/factory-plans"),
        apiJson("/admin/app/sponsors"),
      ]);
      if (facR.status === "fulfilled") setFactories(facR.value as Factory[]);
      if (planR.status === "fulfilled") setPlans(planR.value as Plan[]);
      if (spR.status === "fulfilled") setSponsors(spR.value as Sponsor[]);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveFac() {
    if (!editFac?.name) { setError("اسم المصنع مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editFac.id;
      const body = portalPin ? { ...editFac, portal_pin: portalPin } : editFac;
      await apiFetch(isEdit ? `/admin/factories/${editFac.id}` : "/admin/factories", { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(body) });
      setShowForm(false); setEditFac(null); setPortalPin(""); await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function toggleActive(f: Factory) {
    try { await apiFetch(`/admin/factories/${f.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !f.is_active }) }); load(); }
    catch (e: any) { setError(e.message); }
  }

  async function deleteFac(id: number) {
    if (!(await confirm({ title: "حذف المصنع", description: "سيُحذف المصنع وجميع منتجاته. هل أنت متأكد؟", confirmText: "حذف", destructive: true }))) return;
    try { await apiFetch(`/admin/factories/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { setError(e.message); }
  }

  async function loadFacProducts(facId: number) {
    if (facProducts[facId]) { setExpandedFac(expandedFac === facId ? null : facId); return; }
    try { const d = await apiJson(`/admin/factories/${facId}/products`); setFacProducts(p => ({ ...p, [facId]: d as Product[] })); setExpandedFac(facId); }
    catch (e: any) { setError(e.message); }
  }

  async function savePlan() {
    if (!editPlan?.id) return;
    setSaving(true);
    try { await apiFetch(`/admin/factory-plans/${editPlan.id}`, { method: "PATCH", body: JSON.stringify(editPlan) }); setShowPlanForm(false); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function addSponsor() {
    if (!newSponsor.display_name) { setError("اسم الراعي مطلوب"); return; }
    setSaving(true);
    try { await apiFetch("/admin/app/sponsors", { method: "POST", body: JSON.stringify(newSponsor) }); setShowSponsorForm(false); setNewSponsor({ display_name: "", brand_color: "#F97316", tagline: "", website: "", sponsor_from: "", sponsor_to: "" }); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function toggleSponsor(s: Sponsor) {
    try { await apiFetch(`/admin/app/sponsors/${s.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !s.is_active }) }); load(); }
    catch (e: any) { setError(e.message); }
  }

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "hsl(215 20% 50%)" }}>جارٍ التحميل…</div>;

  return (
    <div style={{ direction: "rtl", fontFamily: "'Cairo', sans-serif" }}>
      <PageHeader title="المصانع والإنتاج المحلي" subtitle="إدارة المصانع · الباقات · الرعاة · بوابة أصحاب المصانع" />

      {/* Main Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "16px 24px 0", borderBottom: "1px solid hsl(222 47% 12%)", background: "hsl(222 47% 8%)" }}>
        {[{ k: "admin", l: "🏭 المصانع" }, { k: "plans", l: "💰 الباقات" }, { k: "sponsors", l: "🏆 الرعاة" }, { k: "portal", l: "🔑 بوابة المصنع" }].map(t => (
          <button key={t.k} onClick={() => setMainTab(t.k as any)}
            style={{ padding: "9px 18px", borderRadius: "10px 10px 0 0", border: "none", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13, background: mainTab === t.k ? "hsl(222 47% 12%)" : "transparent", color: mainTab === t.k ? FAC : "hsl(215 20% 50%)", borderBottom: mainTab === t.k ? `2px solid ${FAC}` : "2px solid transparent" }}>
            {t.l}
          </button>
        ))}
      </div>

      <div style={{ padding: "24px" }}>
        {error && <div style={{ background: "#EF444422", border: "1px solid #EF4444", borderRadius: 8, padding: "10px 16px", color: "#FCA5A5", fontSize: 13, marginBottom: 16 }}>{error}<button onClick={() => setError("")} style={{ marginRight: 10, background: "none", border: "none", color: "#FCA5A5", cursor: "pointer" }}>✕</button></div>}

        {/* ══ Admin Tab ══ */}
        {mainTab === "admin" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#f0fdf4", fontSize: 16 }}>المصانع المسجّلة ({factories.length})</h3>
              <button onClick={() => { setEditFac({ package_type: "free", category: "general", brand_color: "#F97316", brand_color2: "#EA580C" }); setShowForm(true); }}
                style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: FAC, color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                + إضافة مصنع
              </button>
            </div>

            {showForm && (
              <div style={{ background: "hsl(222 47% 10%)", borderRadius: 14, padding: 20, marginBottom: 24, border: `1px solid ${FAC}30` }}>
                <h4 style={{ margin: "0 0 18px", color: FAC }}>{editFac?.id ? "تعديل مصنع" : "مصنع جديد"}</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                  <FGroup label="اسم المصنع *" full><input style={iS} value={editFac?.name || ""} onChange={e => setEditFac(p => ({ ...p, name: e.target.value }))} /></FGroup>
                  <FGroup label="الاسم المختصر"><input style={iS} value={editFac?.short_name || ""} onChange={e => setEditFac(p => ({ ...p, short_name: e.target.value }))} /></FGroup>
                  <FGroup label="الحرف الأول / الرمز"><input style={iS} value={editFac?.logo_initial || ""} onChange={e => setEditFac(p => ({ ...p, logo_initial: e.target.value }))} maxLength={5} placeholder="🏭 أو حرف" /></FGroup>
                  <FGroup label="الفئة"><select style={selS} value={editFac?.category || "general"} onChange={e => setEditFac(p => ({ ...p, category: e.target.value }))}>
                    {Object.entries(FAC_CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></FGroup>
                  <FGroup label="لون الهوية"><input style={{ ...iS, height: 38 }} type="color" value={editFac?.brand_color || "#F97316"} onChange={e => setEditFac(p => ({ ...p, brand_color: e.target.value }))} /></FGroup>
                  <FGroup label="الوصف" full><textarea style={iS} value={editFac?.description || ""} onChange={e => setEditFac(p => ({ ...p, description: e.target.value }))} rows={2} /></FGroup>
                  <FGroup label="الموقع"><input style={iS} value={editFac?.location || ""} onChange={e => setEditFac(p => ({ ...p, location: e.target.value }))} /></FGroup>
                  <FGroup label="الهاتف"><input style={iS} value={editFac?.phone || ""} onChange={e => setEditFac(p => ({ ...p, phone: e.target.value }))} /></FGroup>
                  <FGroup label="واتساب"><input style={iS} value={editFac?.whatsapp || ""} onChange={e => setEditFac(p => ({ ...p, whatsapp: e.target.value }))} /></FGroup>
                  <FGroup label="سنة التأسيس"><input style={iS} value={editFac?.founded || ""} onChange={e => setEditFac(p => ({ ...p, founded: e.target.value }))} /></FGroup>
                  <FGroup label="العمالة"><input style={iS} value={editFac?.employees || ""} onChange={e => setEditFac(p => ({ ...p, employees: e.target.value }))} /></FGroup>
                  <FGroup label="الباقة"><select style={selS} value={editFac?.package_type || "free"} onChange={e => setEditFac(p => ({ ...p, package_type: e.target.value }))}>
                    {Object.entries(PLAN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></FGroup>
                  <FGroup label="بداية العقد"><input style={iS} type="date" value={editFac?.contract_start || ""} onChange={e => setEditFac(p => ({ ...p, contract_start: e.target.value }))} /></FGroup>
                  <FGroup label="نهاية العقد"><input style={iS} type="date" value={editFac?.contract_end || ""} onChange={e => setEditFac(p => ({ ...p, contract_end: e.target.value }))} /></FGroup>
                  <FGroup label="الرسوم الشهرية (SDG)"><input style={iS} type="number" value={editFac?.monthly_fee ?? ""} onChange={e => setEditFac(p => ({ ...p, monthly_fee: Number(e.target.value) }))} /></FGroup>
                  <FGroup label="رمز البوابة السري (PIN)" full><input style={iS} type="password" value={portalPin} onChange={e => setPortalPin(e.target.value)} placeholder="اتركه فارغاً لعدم التغيير" maxLength={20} /></FGroup>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <button onClick={saveFac} disabled={saving} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: FAC, color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer" }}>{saving ? "جارٍ الحفظ…" : "💾 حفظ"}</button>
                  <button onClick={() => { setShowForm(false); setEditFac(null); setPortalPin(""); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: "hsl(215 20% 60%)", fontFamily: "'Cairo', sans-serif", fontSize: 13, cursor: "pointer" }}>إلغاء</button>
                </div>
              </div>
            )}

            {factories.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px", color: "hsl(215 20% 40%)" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🏭</div>
                <p>لا توجد مصانع مسجّلة بعد. ابدأ بإضافة أول مصنع!</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {factories.map(f => {
                  const planColor = f.plan_color || PLAN_COLORS[f.package_type] || "#6B7280";
                  const planLabel = f.plan_name_ar || PLAN_LABELS[f.package_type];
                  const isExpanded = expandedFac === f.id;
                  return (
                    <div key={f.id}>
                      <div style={{ background: "hsl(222 47% 10%)", border: `1px solid ${f.brand_color}30`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, opacity: f.is_active ? 1 : 0.6 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 22, background: f.brand_color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: "#fff", flexShrink: 0 }}>{f.logo_initial || "🏭"}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: "#f0fdf4", fontSize: 15 }}>{f.name}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 6, background: planColor + "22", color: planColor, border: `1px solid ${planColor}44` }}>{planLabel}</span>
                            <span style={{ fontSize: 11, color: "hsl(215 20% 50%)" }}>{FAC_CAT_LABELS[f.category] || f.category}</span>
                            {(f.products_count ?? 0) > 0 && <span style={{ fontSize: 11, color: f.brand_color }}>📦 {f.products_count} منتج</span>}
                            {f.monthly_fee ? <span style={{ fontSize: 11, color: GOLD }}>{Number(f.monthly_fee).toLocaleString("ar")} SDG/شهر</span> : null}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button onClick={() => loadFacProducts(f.id)} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: isExpanded ? f.brand_color : "hsl(215 20% 55%)", fontSize: 12, cursor: "pointer" }}>📦</button>
                          <button onClick={() => { setEditFac(f); setShowForm(true); window.scrollTo(0, 0); }} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: f.brand_color, fontFamily: "'Cairo', sans-serif", fontSize: 12, cursor: "pointer" }}>تعديل</button>
                          <button onClick={() => toggleActive(f)} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: f.is_active ? "#F59E0B" : GREEN, fontFamily: "'Cairo', sans-serif", fontSize: 12, cursor: "pointer" }}>{f.is_active ? "إخفاء" : "إظهار"}</button>
                          <button onClick={() => deleteFac(f.id)} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #EF444430", background: "#EF444415", color: "#EF4444", fontSize: 12, cursor: "pointer" }}>🗑</button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{ background: "hsl(222 47% 8%)", borderRadius: "0 0 12px 12px", border: "1px solid hsl(222 47% 14%)", borderTop: "none", padding: 16 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: f.brand_color, marginBottom: 10 }}>منتجات {f.name} ({(facProducts[f.id] || []).length})</div>
                          {(facProducts[f.id] || []).length === 0 ? (
                            <div style={{ color: "hsl(215 20% 40%)", fontSize: 13 }}>لا توجد منتجات</div>
                          ) : (
                            <div style={{ display: "grid", gap: 8 }}>
                              {(facProducts[f.id] || []).map(p => (
                                <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", background: "hsl(222 47% 12%)", borderRadius: 8 }}>
                                  <div style={{ flex: 1 }}>
                                    <span style={{ fontWeight: 600, fontSize: 13, color: "#f0fdf4" }}>{p.name}</span>
                                    <span style={{ fontSize: 11, color: "hsl(215 20% 50%)", marginRight: 8 }}>{p.price != null ? `${Number(p.price).toLocaleString("ar")} ${p.price_unit}` : ""}</span>
                                    <span style={{ fontSize: 11, color: STOCK_COLORS[p.stock_status] }}>{STOCK_LABELS[p.stock_status]}</span>
                                  </div>
                                  {!p.is_active && <span style={{ fontSize: 10, color: "#EF4444", border: "1px solid #EF444440", borderRadius: 4, padding: "1px 6px" }}>مخفي</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ Plans Tab ══ */}
        {mainTab === "plans" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#f0fdf4", fontSize: 16 }}>باقات الاشتراك ({plans.length})</h3>
            </div>
            {showPlanForm && editPlan && (
              <div style={{ background: "hsl(222 47% 10%)", borderRadius: 14, padding: 20, marginBottom: 24, border: `1px solid ${FAC}30` }}>
                <h4 style={{ margin: "0 0 16px", color: FAC }}>تعديل الباقة</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                  <FGroup label="الاسم بالعربي"><input style={iS} value={editPlan.name_ar || ""} onChange={e => setEditPlan(p => ({ ...p, name_ar: e.target.value }))} /></FGroup>
                  <FGroup label="السعر الشهري (SDG)"><input style={iS} type="number" value={editPlan.price_monthly ?? ""} onChange={e => setEditPlan(p => ({ ...p, price_monthly: Number(e.target.value) }))} /></FGroup>
                  <FGroup label="الحد الأقصى للمنتجات"><input style={iS} type="number" value={editPlan.max_products ?? ""} onChange={e => setEditPlan(p => ({ ...p, max_products: Number(e.target.value) }))} /></FGroup>
                  <FGroup label="اللون"><input style={{ ...iS, height: 38 }} type="color" value={editPlan.color || "#6B7280"} onChange={e => setEditPlan(p => ({ ...p, color: e.target.value }))} /></FGroup>
                  <FGroup label="الأيقونة"><input style={iS} value={editPlan.icon || ""} onChange={e => setEditPlan(p => ({ ...p, icon: e.target.value }))} /></FGroup>
                  <FGroup label="الوصف" full><textarea style={iS} value={editPlan.description || ""} onChange={e => setEditPlan(p => ({ ...p, description: e.target.value }))} rows={2} /></FGroup>
                  {(["has_priority","has_banner","has_promo","has_sponsor_badge"] as const).map(f => (
                    <FGroup key={f} label={{ has_priority: "أولوية العرض", has_banner: "بانر إعلاني", has_promo: "محتوى ترويجي", has_sponsor_badge: "شارة الراعي" }[f]}>
                      <select style={selS} value={editPlan[f] ? "true" : "false"} onChange={e => setEditPlan(p => ({ ...p, [f]: e.target.value === "true" }))}>
                        <option value="true">✅ نعم</option><option value="false">❌ لا</option>
                      </select>
                    </FGroup>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button onClick={savePlan} disabled={saving} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: FAC, color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer" }}>{saving ? "جارٍ الحفظ…" : "💾 حفظ"}</button>
                  <button onClick={() => setShowPlanForm(false)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: "hsl(215 20% 60%)", fontFamily: "'Cairo', sans-serif", fontSize: 13, cursor: "pointer" }}>إلغاء</button>
                </div>
              </div>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              {plans.map(p => {
                const pc = p.color;
                return (
                  <div key={p.id} style={{ background: "hsl(222 47% 10%)", border: `1px solid ${pc}30`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 22, background: pc + "25", border: `1px solid ${pc}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: pc }}>{p.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: pc, fontSize: 15 }}>{p.icon} {p.name_ar}</div>
                      <div style={{ fontSize: 12, color: "hsl(215 20% 55%)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span>{Number(p.price_monthly).toLocaleString("ar")} SDG/شهر</span>
                        <span>حتى {p.max_products === 999 ? "∞" : p.max_products} منتج</span>
                        {p.has_priority && <span style={{ color: GREEN }}>✓ أولوية</span>}
                        {p.has_banner && <span style={{ color: GOLD }}>✓ بانر</span>}
                        {p.has_sponsor_badge && <span style={{ color: GOLD }}>✓ شارة راعي</span>}
                      </div>
                    </div>
                    <button onClick={() => { setEditPlan(p); setShowPlanForm(true); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: pc, fontFamily: "'Cairo', sans-serif", fontSize: 12, cursor: "pointer" }}>تعديل</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ Sponsors Tab ══ */}
        {mainTab === "sponsors" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, color: "#f0fdf4", fontSize: 16 }}>🏆 الراعي الرسمي للتطبيق</h3>
                <p style={{ margin: "4px 0 0", color: "hsl(215 20% 50%)", fontSize: 12 }}>يظهر بانر الراعي في قسم المصانع والصفحة الرئيسية</p>
              </div>
              <button onClick={() => setShowSponsorForm(!showSponsorForm)}
                style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: GOLD, color: "#000", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                + راعٍ جديد
              </button>
            </div>

            {showSponsorForm && (
              <div style={{ background: "hsl(222 47% 10%)", borderRadius: 14, padding: 20, marginBottom: 24, border: `1px solid ${GOLD}30` }}>
                <h4 style={{ margin: "0 0 16px", color: GOLD }}>إضافة راعٍ جديد</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                  <FGroup label="اسم الراعي *" full><input style={iS} value={newSponsor.display_name} onChange={e => setNewSponsor(p => ({ ...p, display_name: e.target.value }))} /></FGroup>
                  <FGroup label="شعار ترويجي (Tagline)" full><input style={iS} value={newSponsor.tagline} onChange={e => setNewSponsor(p => ({ ...p, tagline: e.target.value }))} placeholder="راعي التطبيق بفخر!" /></FGroup>
                  <FGroup label="الموقع الإلكتروني"><input style={iS} value={newSponsor.website} onChange={e => setNewSponsor(p => ({ ...p, website: e.target.value }))} placeholder="https://..." /></FGroup>
                  <FGroup label="لون الهوية"><input style={{ ...iS, height: 38 }} type="color" value={newSponsor.brand_color} onChange={e => setNewSponsor(p => ({ ...p, brand_color: e.target.value }))} /></FGroup>
                  <FGroup label="بداية الرعاية"><input style={iS} type="date" value={newSponsor.sponsor_from} onChange={e => setNewSponsor(p => ({ ...p, sponsor_from: e.target.value }))} /></FGroup>
                  <FGroup label="نهاية الرعاية"><input style={iS} type="date" value={newSponsor.sponsor_to} onChange={e => setNewSponsor(p => ({ ...p, sponsor_to: e.target.value }))} /></FGroup>
                </div>
                <div style={{ background: GOLD + "12", border: `1px solid ${GOLD}30`, borderRadius: 10, padding: 12, marginTop: 16, fontSize: 12, color: "hsl(215 20% 65%)" }}>
                  ⚠️ إضافة راعٍ جديد سيُلغّي الراعي النشط الحالي تلقائياً.
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button onClick={addSponsor} disabled={saving} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: GOLD, color: "#000", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer" }}>{saving ? "جارٍ الحفظ…" : "💾 حفظ"}</button>
                  <button onClick={() => setShowSponsorForm(false)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: "hsl(215 20% 60%)", fontFamily: "'Cairo', sans-serif", fontSize: 13, cursor: "pointer" }}>إلغاء</button>
                </div>
              </div>
            )}

            {sponsors.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px", color: "hsl(215 20% 40%)" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
                <p>لا يوجد راعٍ حالياً. أضف راعياً ليظهر في التطبيق!</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {sponsors.map(s => (
                  <div key={s.id} style={{ background: "hsl(222 47% 10%)", border: `1px solid ${s.is_active ? GOLD : "hsl(222 47% 16%)"}40`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, opacity: s.is_active ? 1 : 0.6 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 22, background: s.brand_color + "25", border: `1px solid ${s.brand_color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏆</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: s.is_active ? GOLD : "#f0fdf4", fontSize: 15 }}>
                        {s.is_active ? "⚡ " : ""}{s.display_name}
                      </div>
                      {s.tagline && <div style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>{s.tagline}</div>}
                      <div style={{ fontSize: 11, color: "hsl(215 20% 45%)", marginTop: 4, display: "flex", gap: 10 }}>
                        {s.sponsor_from && <span>من: {new Date(s.sponsor_from).toLocaleDateString("ar-SA")}</span>}
                        {s.sponsor_to && <span>إلى: {new Date(s.sponsor_to).toLocaleDateString("ar-SA")}</span>}
                      </div>
                    </div>
                    <button onClick={() => toggleSponsor(s)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid hsl(222 47% 22%)", background: s.is_active ? "#EF444420" : GREEN + "20", color: s.is_active ? "#EF4444" : GREEN, fontFamily: "'Cairo', sans-serif", fontSize: 12, cursor: "pointer" }}>
                      {s.is_active ? "إلغاء تفعيل" : "تفعيل"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ Portal Tab ══ */}
        {mainTab === "portal" && <FactoryPortalView />}
      </div>
    </div>
  );
}
