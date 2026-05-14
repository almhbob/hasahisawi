import React, { useState, useEffect, useCallback } from "react";

const TC   = "#0EA5E9";
const TC2  = "#2563EB";
const GOLD = "#F59E0B";

const API_BASE = (() => {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return base + "/api";
})();

async function portalFetch(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...((opts.headers as Record<string, string>) || {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Server error"); }
  return res.json();
}

async function portalJson(path: string, token: string) { return portalFetch(path, token); }

type Company = {
  id: number; name: string; short?: string; logo_initial?: string;
  brand_color: string; brand_color2?: string; description?: string;
  founded?: string; subscribers?: string; coverage?: string;
  website?: string; hotline?: string; ussd?: string; recharge?: string;
  contact_person?: string; contact_email?: string;
  promo_tagline?: string; promo_banner_url?: string; promo_badge?: string;
  package_type: string; contract_start?: string; contract_end?: string;
  monthly_fee?: number; is_active: boolean;
};

type Offer   = { id: number; title: string; description?: string; category: string; price: number; currency: string; validity?: string; details?: string; is_active: boolean; sort_order: number };
type Service = { id: number; title: string; description?: string; icon: string; price?: string; category: string; ussd_code?: string; link?: string; is_active: boolean; sort_order: number };
type TcEvent = { id: number; title: string; description?: string; event_date?: string; location?: string; is_active: boolean };

const PKG_COLORS: Record<string, string> = { premium: GOLD, standard: TC, basic: "#6B7280" };
const PKG_LABELS: Record<string, string> = { premium: "★ بريميوم", standard: "⬡ ستاندرد", basic: "● أساسي" };
const PKG_DESC: Record<string, string[]> = {
  basic:    ["إدارة العروض والباقات"],
  standard: ["إدارة العروض والباقات", "إضافة خدمات مفصّلة", "شعار ترويجي (tagline)", "شارة مميزة للشركة", "إدارة الفعاليات"],
  premium:  ["إدارة العروض والباقات", "إضافة خدمات مفصّلة", "شعار ترويجي + بانر صوري", "شارة مميزة للشركة", "إدارة الفعاليات", "أولوية العرض في التطبيق", "إعلان بانر في الصفحة الرئيسية"],
};

const OFFER_CATS = ["data", "calls", "combo", "roaming", "sms"];
const OFFER_CAT_LABELS: Record<string, string> = { data: "إنترنت", calls: "مكالمات", combo: "باقات مدمجة", roaming: "تجوال", sms: "رسائل" };
const SVC_CATS   = ["recharge","transfer","internet","bill","sim","roaming","support","other"];
const SVC_CAT_LABELS: Record<string, string> = { recharge: "شحن", transfer: "تحويل", internet: "إنترنت", bill: "الفاتورة", sim: "SIM", roaming: "تجوال", support: "دعم", other: "أخرى" };
const SVC_ICONS  = ["star-outline", "card-outline", "wifi-outline", "call-outline", "phone-portrait-outline", "swap-horizontal-outline", "receipt-outline", "headset-outline", "earth-outline", "shield-checkmark-outline", "key-outline", "help-circle-outline"];

// ────────────────────────────────────────────────────────────────────────────
export default function TelecomPortal() {
  const [loginStep, setLoginStep] = useState<"select" | "pin">("select");
  const [companies, setCompanies] = useState<{ id: number; name: string; logo_initial?: string; brand_color: string }[]>([]);
  const [selCompany, setSelCompany] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [token, setToken] = useState(() => sessionStorage.getItem("tc_portal_token") || "");
  const [company, setCompany] = useState<Company | null>(null);
  const [tab, setTab] = useState<"profile" | "offers" | "services" | "events">("profile");

  const [offers, setOffers]   = useState<Offer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [events, setEvents]   = useState<TcEvent[]>([]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  // Profile form
  const [pf, setPf] = useState({ description: "", website: "", hotline: "", ussd: "", recharge: "", contact_person: "", contact_email: "", promo_tagline: "", promo_banner_url: "", promo_badge: "" });

  // Offer/Service/Event forms
  const [showOfferForm, setShowOfferForm]     = useState(false);
  const [editOffer, setEditOffer]             = useState<Partial<Offer> | null>(null);
  const [showSvcForm, setShowSvcForm]         = useState(false);
  const [editSvc, setEditSvc]                 = useState<Partial<Service> | null>(null);
  const [showEvForm, setShowEvForm]           = useState(false);
  const [editEv, setEditEv]                   = useState<Partial<TcEvent> | null>(null);

  // Load companies for login
  useEffect(() => {
    fetch(`${API_BASE}/telecom/companies`).then(r => r.json()).then(d => setCompanies(d || [])).catch(() => {});
  }, []);

  // Load portal data when token set
  const loadPortal = useCallback(async (t = token) => {
    if (!t) return;
    try {
      const me = await portalJson("/telecom/portal/me", t);
      setCompany(me);
      setPf({ description: me.description||"", website: me.website||"", hotline: me.hotline||"", ussd: me.ussd||"", recharge: me.recharge||"", contact_person: me.contact_person||"", contact_email: me.contact_email||"", promo_tagline: me.promo_tagline||"", promo_banner_url: me.promo_banner_url||"", promo_badge: me.promo_badge||"" });
      const [o, s, e] = await Promise.all([
        portalJson("/telecom/portal/offers", t),
        portalJson("/telecom/portal/services", t).catch(() => []),
        portalJson("/telecom/portal/events", t).catch(() => []),
      ]);
      setOffers(Array.isArray(o) ? o : []);
      setServices(Array.isArray(s) ? s : []);
      setEvents(Array.isArray(e) ? e : []);
    } catch { setToken(""); sessionStorage.removeItem("tc_portal_token"); }
  }, [token]);

  useEffect(() => { if (token) loadPortal(token); }, []);

  async function doLogin() {
    if (!selCompany) { setLoginErr("اختر شركتك أولاً"); return; }
    if (!pin) { setLoginErr("أدخل الرمز السري"); return; }
    setLoginLoading(true); setLoginErr("");
    try {
      const res = await fetch(`${API_BASE}/telecom/portal/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selCompany, pin }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginErr(data.error || "فشل الدخول"); return; }
      const t = data.token;
      setToken(t); sessionStorage.setItem("tc_portal_token", t);
      await loadPortal(t);
    } catch { setLoginErr("تعذّر الاتصال بالخادم"); }
    finally { setLoginLoading(false); }
  }

  function logout() { setToken(""); setCompany(null); sessionStorage.removeItem("tc_portal_token"); }

  async function saveProfile() {
    setSaving(true); setError("");
    try { const me = await portalFetch("/telecom/portal/me", token, { method: "PATCH", body: JSON.stringify(pf) }); setCompany(me); alert("✅ تم حفظ الملف الشخصي"); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  // ── Offers CRUD ──
  async function saveOffer() {
    if (!editOffer?.title) { setError("العنوان مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editOffer.id;
      await portalFetch(isEdit ? `/telecom/portal/offers/${editOffer.id}` : "/telecom/portal/offers", token, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editOffer) });
      setShowOfferForm(false); setEditOffer(null);
      const d = await portalJson("/telecom/portal/offers", token); setOffers(d);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteOffer(id: number) {
    if (!confirm("هل تريد حذف هذا العرض؟")) return;
    try { await portalFetch(`/telecom/portal/offers/${id}`, token, { method: "DELETE" }); setOffers(offers.filter(o => o.id !== id)); }
    catch (e: any) { setError(e.message); }
  }

  // ── Services CRUD ──
  async function saveService() {
    if (!editSvc?.title) { setError("العنوان مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editSvc.id;
      await portalFetch(isEdit ? `/telecom/portal/services/${editSvc.id}` : "/telecom/portal/services", token, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editSvc) });
      setShowSvcForm(false); setEditSvc(null);
      const d = await portalJson("/telecom/portal/services", token).catch(() => []); setServices(d);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteSvc(id: number) {
    if (!confirm("هل تريد حذف هذه الخدمة؟")) return;
    try { await portalFetch(`/telecom/portal/services/${id}`, token, { method: "DELETE" }); setServices(services.filter(s => s.id !== id)); }
    catch (e: any) { setError(e.message); }
  }

  // ── Events CRUD ──
  async function saveEvent() {
    if (!editEv?.title) { setError("العنوان مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editEv.id;
      await portalFetch(isEdit ? `/telecom/portal/events/${editEv.id}` : "/telecom/portal/events", token, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editEv) });
      setShowEvForm(false); setEditEv(null);
      const d = await portalJson("/telecom/portal/events", token).catch(() => []); setEvents(d);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteEvent(id: number) {
    if (!confirm("هل تريد حذف هذه الفعالية؟")) return;
    try { await portalFetch(`/telecom/portal/events/${id}`, token, { method: "DELETE" }); setEvents(events.filter(e => e.id !== id)); }
    catch (e: any) { setError(e.message); }
  }

  const isStd = company?.package_type === "standard" || company?.package_type === "premium";
  const isPremium = company?.package_type === "premium";
  const co = company?.brand_color || TC;
  const contractExpired = company?.contract_end ? new Date(company.contract_end) < new Date() : false;

  // ══════════ Login Screen ════════════════════════════════════════════════════
  if (!token || !company) {
    return (
      <div style={{ minHeight: "100vh", background: "hsl(222 47% 6%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cairo', sans-serif", direction: "rtl" }}>
        <div style={{ width: "100%", maxWidth: 480, padding: "0 16px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 72, height: 72, borderRadius: 36, background: TC + "25", border: `2px solid ${TC}50`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 30 }}>📡</div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f0fdf4" }}>بوابة إدارة المساحة الإعلانية</h1>
            <p style={{ margin: "6px 0 0", color: "hsl(215 20% 50%)", fontSize: 13 }}>منصة حصاحيصاوي — شركات الاتصالات</p>
          </div>

          {/* Package info cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 28 }}>
            {Object.entries(PKG_LABELS).map(([pkg, label]) => (
              <div key={pkg} style={{ background: "hsl(222 47% 10%)", border: `1px solid ${PKG_COLORS[pkg]}33`, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13, color: PKG_COLORS[pkg], marginBottom: 6 }}>{label}</div>
                {PKG_DESC[pkg].slice(0, 3).map((d, i) => (
                  <div key={i} style={{ fontSize: 10, color: "hsl(215 20% 50%)", marginBottom: 2 }}>✓ {d}</div>
                ))}
              </div>
            ))}
          </div>

          {/* Login form */}
          <div style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 18%)", borderRadius: 16, padding: 28 }}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 60%)", marginBottom: 6 }}>اختر شركتك</label>
              <select
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid hsl(222 47% 22%)", background: "hsl(222 47% 8%)", color: "#f0fdf4", fontFamily: "'Cairo', sans-serif", fontSize: 14 }}
                value={selCompany || ""} onChange={e => setSelCompany(Number(e.target.value))}
              >
                <option value="">— اختر الشركة —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 60%)", marginBottom: 6 }}>الرمز السري</label>
              <input
                type="password" maxLength={10}
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid hsl(222 47% 22%)", background: "hsl(222 47% 8%)", color: "#f0fdf4", fontFamily: "'Cairo', sans-serif", fontSize: 18, textAlign: "center", letterSpacing: 8, boxSizing: "border-box" }}
                value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && doLogin()}
                placeholder="••••••"
              />
            </div>
            {loginErr && <div style={{ background: "#EF444422", border: "1px solid #EF4444", borderRadius: 8, padding: "8px 14px", color: "#FCA5A5", fontSize: 13, marginBottom: 14 }}>{loginErr}</div>}
            <button onClick={doLogin} disabled={loginLoading}
              style={{ width: "100%", padding: "13px 0", borderRadius: 11, border: "none", background: `linear-gradient(90deg, ${TC}, ${TC2})`, color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 15, cursor: loginLoading ? "default" : "pointer", opacity: loginLoading ? 0.7 : 1 }}>
              {loginLoading ? "جارٍ التحقق…" : "دخول البوابة →"}
            </button>
            <p style={{ margin: "14px 0 0", textAlign: "center", fontSize: 12, color: "hsl(215 20% 40%)" }}>للحصول على بيانات الدخول تواصل مع إدارة حصاحيصاوي</p>
          </div>
        </div>
      </div>
    );
  }

  // ══════════ Dashboard ═══════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: "hsl(222 47% 6%)", fontFamily: "'Cairo', sans-serif", direction: "rtl" }}>
      {/* Top Bar */}
      <div style={{ background: "hsl(222 47% 9%)", borderBottom: `1px solid hsl(222 47% 14%)`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 21, background: co, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: "#fff" }}>
            {company.logo_initial}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#f0fdf4" }}>{company.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <span style={{ padding: "1px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: PKG_COLORS[company.package_type] + "22", color: PKG_COLORS[company.package_type], border: `1px solid ${PKG_COLORS[company.package_type]}44` }}>
                {PKG_LABELS[company.package_type]}
              </span>
              {company.contract_end && (
                <span style={{ fontSize: 11, color: contractExpired ? "#EF4444" : "hsl(215 20% 50%)" }}>
                  {contractExpired ? "⚠️ انتهى العقد" : `ينتهي: ${new Date(company.contract_end).toLocaleDateString("ar-SA")}`}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ textAlign: "center", background: "hsl(222 47% 14%)", borderRadius: 10, padding: "6px 16px" }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: co }}>{offers.length}</div>
            <div style={{ fontSize: 10, color: "hsl(215 20% 50%)" }}>عرض</div>
          </div>
          <div style={{ textAlign: "center", background: "hsl(222 47% 14%)", borderRadius: 10, padding: "6px 16px" }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: co }}>{services.length}</div>
            <div style={{ fontSize: 10, color: "hsl(215 20% 50%)" }}>خدمة</div>
          </div>
          <button onClick={logout} style={{ padding: "7px 16px", borderRadius: 9, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13 }}>
            خروج
          </button>
        </div>
      </div>

      {/* Package features */}
      <div style={{ margin: "16px 24px", background: co + "10", border: `1px solid ${co}30`, borderRadius: 12, padding: "12px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: co, marginBottom: 8 }}>مميزات باقتك: {PKG_LABELS[company.package_type]}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px" }}>
          {PKG_DESC[company.package_type].map((d, i) => (
            <span key={i} style={{ fontSize: 12, color: "hsl(215 20% 65%)" }}>✓ {d}</span>
          ))}
        </div>
      </div>

      {error && <div style={{ margin: "0 24px 16px", background: "#EF444422", border: "1px solid #EF4444", borderRadius: 8, padding: "10px 16px", color: "#FCA5A5", fontSize: 13 }}>{error}<button onClick={() => setError("")} style={{ marginRight: 10, background: "none", border: "none", color: "#FCA5A5", cursor: "pointer" }}>✕</button></div>}

      {/* Sub-Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 24px 16px", background: "hsl(222 47% 6%)" }}>
        {[
          { key: "profile",  label: "بروفايل الشركة", icon: "🏢" },
          { key: "offers",   label: `عروضي (${offers.length})`,   icon: "🏷" },
          { key: "services", label: `خدماتي (${services.length})`, icon: "🛠", disabled: !isStd },
          { key: "events",   label: `فعالياتي (${events.length})`, icon: "📅", disabled: !isStd },
        ].map(t => (
          <button key={t.key} onClick={() => !t.disabled && setTab(t.key as any)}
            disabled={!!t.disabled}
            style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: t.disabled ? "not-allowed" : "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13, background: tab === t.key ? co : "hsl(222 47% 12%)", color: tab === t.key ? "#fff" : t.disabled ? "hsl(215 20% 30%)" : "hsl(215 20% 55%)", opacity: t.disabled ? 0.5 : 1 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "0 24px 60px" }}>
        {/* ══ Profile Tab ══ */}
        {tab === "profile" && (
          <div style={{ maxWidth: 800 }}>
            <h3 style={{ margin: "0 0 20px", color: "#f0fdf4", fontSize: 16 }}>تعديل ملف الشركة</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
              <FGroup label="الوصف العام" full>
                <textarea style={iS} value={pf.description} onChange={e => setPf(p => ({ ...p, description: e.target.value }))} placeholder="اكتب وصفاً جذاباً لشركتك…" rows={3} />
              </FGroup>
              <FGroup label="الموقع الإلكتروني">
                <input style={iS} value={pf.website} onChange={e => setPf(p => ({ ...p, website: e.target.value }))} placeholder="https://..." />
              </FGroup>
              <FGroup label="خط خدمة العملاء">
                <input style={iS} value={pf.hotline} onChange={e => setPf(p => ({ ...p, hotline: e.target.value }))} />
              </FGroup>
              <FGroup label="رمز الاستعلام (USSD)">
                <input style={iS} value={pf.ussd} onChange={e => setPf(p => ({ ...p, ussd: e.target.value }))} placeholder="*100#" />
              </FGroup>
              <FGroup label="رمز الشحن">
                <input style={iS} value={pf.recharge} onChange={e => setPf(p => ({ ...p, recharge: e.target.value }))} placeholder="*555*[رمز]#" />
              </FGroup>
              <FGroup label="اسم جهة الاتصال">
                <input style={iS} value={pf.contact_person} onChange={e => setPf(p => ({ ...p, contact_person: e.target.value }))} />
              </FGroup>
              <FGroup label="البريد الإلكتروني للتواصل">
                <input style={iS} value={pf.contact_email} onChange={e => setPf(p => ({ ...p, contact_email: e.target.value }))} />
              </FGroup>
            </div>

            {isStd && (
              <>
                <div style={{ margin: "24px 0 16px", paddingTop: 20, borderTop: "1px solid hsl(222 47% 16%)" }}>
                  <h4 style={{ margin: "0 0 16px", color: co, fontSize: 14 }}>🎯 المحتوى الترويجي</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
                    <FGroup label="شعار ترويجي (Tagline)" full>
                      <input style={iS} value={pf.promo_tagline} onChange={e => setPf(p => ({ ...p, promo_tagline: e.target.value }))} placeholder="أسرع شبكة في السودان — جرّبها الآن!" maxLength={150} />
                    </FGroup>
                    <FGroup label="شارة مميزة (Badge)">
                      <input style={iS} value={pf.promo_badge} onChange={e => setPf(p => ({ ...p, promo_badge: e.target.value }))} placeholder="عرض حصري · جديد · الأقوى" maxLength={40} />
                    </FGroup>
                    {isPremium && (
                      <FGroup label="رابط بانر الصورة (Premium)" full>
                        <input style={iS} value={pf.promo_banner_url} onChange={e => setPf(p => ({ ...p, promo_banner_url: e.target.value }))} placeholder="https://example.com/banner.jpg" />
                      </FGroup>
                    )}
                  </div>
                </div>
              </>
            )}

            <button onClick={saveProfile} disabled={saving} style={{ marginTop: 16, padding: "12px 28px", borderRadius: 11, border: "none", background: co, color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
              {saving ? "جارٍ الحفظ…" : "💾 حفظ الملف الشخصي"}
            </button>
          </div>
        )}

        {/* ══ Offers Tab ══ */}
        {tab === "offers" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#f0fdf4", fontSize: 16 }}>🏷 عروضي وباقاتي</h3>
              <button onClick={() => { setEditOffer({ category: "data", price: 0, currency: "SDG", is_active: true, sort_order: 0 }); setShowOfferForm(true); }} style={bS(co)}>+ إضافة عرض</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
              {offers.map(o => (
                <PortalCard key={o.id} color={co} title={o.title} sub={`${o.price} ${o.currency} — ${o.validity || "—"}`} badge={OFFER_CAT_LABELS[o.category] || o.category} active={o.is_active}
                  onEdit={() => { setEditOffer({ ...o }); setShowOfferForm(true); }} onDelete={() => deleteOffer(o.id)} />
              ))}
              {offers.length === 0 && <Empty msg="لا توجد عروض بعد — أضف أول عرض الآن" />}
            </div>
          </div>
        )}

        {/* ══ Services Tab ══ */}
        {tab === "services" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#f0fdf4", fontSize: 16 }}>🛠 خدماتي</h3>
              <button onClick={() => { setEditSvc({ icon: "star-outline", category: "other", is_active: true, sort_order: 0 }); setShowSvcForm(true); }} style={bS(co)}>+ إضافة خدمة</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
              {services.map(s => (
                <PortalCard key={s.id} color={co} title={s.title} sub={[s.price, s.ussd_code].filter(Boolean).join(" — ") || (s.description || "—")} badge={SVC_CAT_LABELS[s.category] || s.category} active={s.is_active}
                  onEdit={() => { setEditSvc({ ...s }); setShowSvcForm(true); }} onDelete={() => deleteSvc(s.id)} />
              ))}
              {services.length === 0 && <Empty msg="لا توجد خدمات بعد — أضف خدمة مفصّلة لعملائك" />}
            </div>
          </div>
        )}

        {/* ══ Events Tab ══ */}
        {tab === "events" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#f0fdf4", fontSize: 16 }}>📅 فعالياتي</h3>
              <button onClick={() => { setEditEv({ is_active: true }); setShowEvForm(true); }} style={bS(co)}>+ إضافة فعالية</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
              {events.map(ev => (
                <PortalCard key={ev.id} color={co} title={ev.title} sub={[ev.event_date ? new Date(ev.event_date).toLocaleDateString("ar-SA") : "", ev.location].filter(Boolean).join(" — ")} active={ev.is_active}
                  onEdit={() => { setEditEv({ ...ev }); setShowEvForm(true); }} onDelete={() => deleteEvent(ev.id)} />
              ))}
              {events.length === 0 && <Empty msg="لا توجد فعاليات بعد — شارك جمهورك بأحداثك" />}
            </div>
          </div>
        )}
      </div>

      {/* ══ Modals ══ */}
      {showOfferForm && editOffer && (
        <PortalModal title={editOffer.id ? "تعديل العرض" : "إضافة عرض"} onClose={() => setShowOfferForm(false)} color={co}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <FGroup label="عنوان العرض *" full><input style={iS} value={editOffer.title||""} onChange={e => setEditOffer(p => ({ ...p, title: e.target.value }))} /></FGroup>
            <FGroup label="الفئة"><select style={iS} value={editOffer.category||"data"} onChange={e => setEditOffer(p => ({ ...p, category: e.target.value }))}>
              {OFFER_CATS.map(c => <option key={c} value={c}>{OFFER_CAT_LABELS[c]}</option>)}</select></FGroup>
            <FGroup label="السعر"><input type="number" style={iS} value={editOffer.price||0} onChange={e => setEditOffer(p => ({ ...p, price: Number(e.target.value) }))} /></FGroup>
            <FGroup label="العملة"><select style={iS} value={editOffer.currency||"SDG"} onChange={e => setEditOffer(p => ({ ...p, currency: e.target.value }))}>
              {["SDG","USD","SAR"].map(c => <option key={c} value={c}>{c}</option>)}</select></FGroup>
            <FGroup label="مدة الصلاحية"><input style={iS} value={editOffer.validity||""} onChange={e => setEditOffer(p => ({ ...p, validity: e.target.value }))} placeholder="30 يوم" /></FGroup>
            <FGroup label="الوصف" full><textarea style={iS} value={editOffer.description||""} onChange={e => setEditOffer(p => ({ ...p, description: e.target.value }))} rows={2} /></FGroup>
            <FGroup label="تفاصيل إضافية" full><textarea style={iS} value={editOffer.details||""} onChange={e => setEditOffer(p => ({ ...p, details: e.target.value }))} rows={2} /></FGroup>
          </div>
          {error && <ErrBox msg={error} onClose={() => setError("")} />}
          <ModalActions onSave={saveOffer} onClose={() => setShowOfferForm(false)} saving={saving} color={co} />
        </PortalModal>
      )}

      {showSvcForm && editSvc && (
        <PortalModal title={editSvc.id ? "تعديل الخدمة" : "إضافة خدمة"} onClose={() => setShowSvcForm(false)} color={co}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <FGroup label="عنوان الخدمة *" full><input style={iS} value={editSvc.title||""} onChange={e => setEditSvc(p => ({ ...p, title: e.target.value }))} /></FGroup>
            <FGroup label="الفئة"><select style={iS} value={editSvc.category||"other"} onChange={e => setEditSvc(p => ({ ...p, category: e.target.value }))}>
              {SVC_CATS.map(c => <option key={c} value={c}>{SVC_CAT_LABELS[c]}</option>)}</select></FGroup>
            <FGroup label="الأيقونة"><select style={iS} value={editSvc.icon||"star-outline"} onChange={e => setEditSvc(p => ({ ...p, icon: e.target.value }))}>
              {SVC_ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}</select></FGroup>
            <FGroup label="السعر (نص)"><input style={iS} value={editSvc.price||""} onChange={e => setEditSvc(p => ({ ...p, price: e.target.value }))} placeholder="مجاناً · 50 SDG" /></FGroup>
            <FGroup label="رمز USSD"><input style={iS} value={editSvc.ussd_code||""} onChange={e => setEditSvc(p => ({ ...p, ussd_code: e.target.value }))} placeholder="*100*1#" /></FGroup>
            <FGroup label="رابط خارجي"><input style={iS} value={editSvc.link||""} onChange={e => setEditSvc(p => ({ ...p, link: e.target.value }))} placeholder="https://..." /></FGroup>
            <FGroup label="الوصف" full><textarea style={iS} value={editSvc.description||""} onChange={e => setEditSvc(p => ({ ...p, description: e.target.value }))} rows={2} /></FGroup>
          </div>
          {error && <ErrBox msg={error} onClose={() => setError("")} />}
          <ModalActions onSave={saveService} onClose={() => setShowSvcForm(false)} saving={saving} color={co} />
        </PortalModal>
      )}

      {showEvForm && editEv && (
        <PortalModal title={editEv.id ? "تعديل الفعالية" : "إضافة فعالية"} onClose={() => setShowEvForm(false)} color={co}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <FGroup label="عنوان الفعالية *" full><input style={iS} value={editEv.title||""} onChange={e => setEditEv(p => ({ ...p, title: e.target.value }))} /></FGroup>
            <FGroup label="التاريخ"><input type="date" style={iS} value={editEv.event_date?.slice(0,10)||""} onChange={e => setEditEv(p => ({ ...p, event_date: e.target.value }))} /></FGroup>
            <FGroup label="المكان"><input style={iS} value={editEv.location||""} onChange={e => setEditEv(p => ({ ...p, location: e.target.value }))} /></FGroup>
            <FGroup label="الوصف" full><textarea style={iS} value={editEv.description||""} onChange={e => setEditEv(p => ({ ...p, description: e.target.value }))} rows={3} /></FGroup>
          </div>
          {error && <ErrBox msg={error} onClose={() => setError("")} />}
          <ModalActions onSave={saveEvent} onClose={() => setShowEvForm(false)} saving={saving} color={co} />
        </PortalModal>
      )}
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────
function PortalCard({ color, title, sub, badge, active, onEdit, onDelete }: {
  color: string; title: string; sub?: string; badge?: string; active?: boolean; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div style={{ background: "hsl(222 47% 11%)", border: `1px solid ${color}22`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}80)` }} />
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#f0fdf4", flex: 1, marginLeft: 8 }}>{title}</div>
          <span style={{ padding: "1px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700, background: active ? "#22C55E22" : "#EF444422", color: active ? "#22C55E" : "#EF4444" }}>{active ? "✓" : "✗"}</span>
        </div>
        {sub && <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginBottom: badge ? 8 : 0 }}>{sub}</div>}
        {badge && <span style={{ padding: "2px 10px", borderRadius: 8, fontSize: 11, background: color + "20", color, border: `1px solid ${color}40` }}>{badge}</span>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onEdit} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${color}40`, background: color + "15", color, fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>تعديل</button>
          <button onClick={onDelete} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #EF444440", background: "#EF444415", color: "#EF4444", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>حذف</button>
        </div>
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ gridColumn: "1/-1", textAlign: "center", color: "hsl(215 20% 40%)", padding: 60, fontSize: 14 }}>{msg}</div>;
}

function ErrBox({ msg, onClose }: { msg: string; onClose: () => void }) {
  return <div style={{ background: "#EF444422", border: "1px solid #EF4444", borderRadius: 8, padding: "8px 14px", color: "#FCA5A5", fontSize: 12, marginBottom: 12 }}>{msg}<button onClick={onClose} style={{ marginRight: 8, background: "none", border: "none", color: "#FCA5A5", cursor: "pointer" }}>✕</button></div>;
}

function PortalModal({ title, color, onClose, children }: { title: string; color: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(222 47% 18%)", width: "100%", maxWidth: 680, maxHeight: "90vh", overflow: "auto", direction: "rtl" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `2px solid ${color}30` }}>
          <h3 style={{ margin: 0, color: "#f0fdf4", fontSize: 16 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "hsl(215 20% 50%)", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function FGroup({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? "1/-1" : undefined }}>
      <label style={{ display: "block", fontSize: 12, color: "hsl(215 20% 55%)", marginBottom: 5, fontFamily: "'Cairo', sans-serif" }}>{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ onSave, onClose, saving, color }: { onSave: () => void; onClose: () => void; saving: boolean; color: string }) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
      <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13 }}>إلغاء</button>
      <button onClick={onSave} disabled={saving} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: color, color: "#fff", cursor: saving ? "default" : "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13 }}>{saving ? "جارٍ الحفظ…" : "حفظ"}</button>
    </div>
  );
}

const iS: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid hsl(222 47% 22%)", background: "hsl(222 47% 8%)", color: "#f0fdf4", fontFamily: "'Cairo', sans-serif", fontSize: 13, boxSizing: "border-box" };
const bS = (c: string): React.CSSProperties => ({ padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13, background: c, color: "#fff" });
