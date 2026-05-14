import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// ─── Types ─────────────────────────────────────────────────────────────────
type Company = {
  id: number; name: string; short?: string; logo_initial?: string;
  brand_color: string; brand_color2?: string; description?: string;
  founded?: string; subscribers?: string; coverage?: string;
  website?: string; hotline?: string; ussd?: string; recharge?: string;
  is_active: boolean; sort_order: number; created_at: string;
};
type Offer = {
  id: number; company_id?: number; company_name?: string;
  title: string; description?: string; category: string;
  price: number; currency: string; validity?: string; details?: string;
  image_url?: string; is_active: boolean; sort_order: number; created_at: string;
};
type TelecomEvent = {
  id: number; company_id?: number; company_name?: string;
  title: string; description?: string; event_date?: string;
  location?: string; image_url?: string; is_active: boolean; created_at: string;
};
type ContractComp = Company & {
  package_type?: string; contract_start?: string; contract_end?: string;
  monthly_fee?: number; contact_person?: string; contact_email?: string;
  promo_tagline?: string; promo_badge?: string; promo_banner_url?: string;
};

const CAT_LABELS: Record<string, string> = {
  data: "إنترنت", calls: "مكالمات", combo: "باقات مدمجة",
  roaming: "تجوال", sms: "رسائل",
};
const CAT_COLORS: Record<string, string> = {
  data: "#06B6D4", calls: "#22C55E", combo: "#8B5CF6",
  roaming: "#F59E0B", sms: "#EC4899",
};

// ─── مكوّنات مساعدة ───────────────────────────────────────────────────────
function Badge({ color, text }: { color: string; text: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
      background: color + "22", color, border: `1px solid ${color}44`,
    }}>
      {text}
    </span>
  );
}

function CompanyDot({ color, initial }: { color: string; initial?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 32, height: 32, borderRadius: 16, background: color,
      color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0,
    }}>
      {initial || "?"}
    </span>
  );
}

// ─── الشاشة الرئيسية ────────────────────────────────────────────────────────
const PKG_COLORS: Record<string, string> = { premium: "#F59E0B", standard: "#0EA5E9", basic: "#6B7280" };
const PKG_LABELS: Record<string, string> = { premium: "★ بريميوم", standard: "⬡ ستاندرد", basic: "● أساسي" };

export default function Telecom() {
  const { token } = useAuth();
  const [tab, setTab] = useState<"companies" | "offers" | "events" | "contracts">("companies");

  // Companies
  const [companies, setCompanies] = useState<Company[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  const [editingComp, setEditingComp] = useState<Partial<Company> | null>(null);

  // Offers
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Partial<Offer> | null>(null);

  // Events
  const [events, setEvents] = useState<TelecomEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Partial<TelecomEvent> | null>(null);

  // Contracts
  const [contracts, setContracts] = useState<ContractComp[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [showCredModal, setShowCredModal] = useState(false);
  const [credTarget, setCredTarget] = useState<ContractComp | null>(null);
  const [credForm, setCredForm] = useState({ pin: "", package_type: "basic", contract_start: "", contract_end: "", monthly_fee: "", contact_person: "", contact_email: "" });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Load ──
  const loadCompanies = useCallback(async () => {
    setCompLoading(true);
    try {
      const data = await apiJson("/telecom/companies");
      setCompanies(Array.isArray(data) ? data : []);
    } catch { setError("فشل تحميل الشركات"); }
    finally { setCompLoading(false); }
  }, []);

  const loadOffers = useCallback(async () => {
    setOffersLoading(true);
    try {
      const data = await apiJson("/admin/telecom/offers");
      setOffers(Array.isArray(data) ? data : []);
    } catch { setError("فشل تحميل العروض"); }
    finally { setOffersLoading(false); }
  }, []);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const data = await apiJson("/admin/telecom/events");
      setEvents(Array.isArray(data) ? data : []);
    } catch { setError("فشل تحميل الفعاليات"); }
    finally { setEventsLoading(false); }
  }, []);

  const loadContracts = useCallback(async () => {
    setContractsLoading(true);
    try {
      const data = await apiJson("/telecom/companies");
      setContracts(Array.isArray(data) ? data : []);
    } catch { setError("فشل تحميل بيانات العقود"); }
    finally { setContractsLoading(false); }
  }, []);

  useEffect(() => {
    loadCompanies();
    loadOffers();
    loadEvents();
  }, [loadCompanies, loadOffers, loadEvents]);

  useEffect(() => {
    if (tab === "contracts") loadContracts();
  }, [tab, loadContracts]);

  async function saveCredentials() {
    if (!credTarget) return;
    setSaving(true); setError("");
    try {
      await apiFetch(`/admin/telecom/companies/${credTarget.id}/credentials`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(credForm.pin ? { pin: credForm.pin } : {}),
          package_type: credForm.package_type || undefined,
          contract_start: credForm.contract_start || undefined,
          contract_end: credForm.contract_end || undefined,
          monthly_fee: credForm.monthly_fee ? Number(credForm.monthly_fee) : undefined,
          contact_person: credForm.contact_person || undefined,
          contact_email: credForm.contact_email || undefined,
        }),
      });
      setShowCredModal(false);
      loadContracts();
    } catch { setError("فشل حفظ بيانات العقد"); }
    finally { setSaving(false); }
  }

  // ── Save Company ──
  async function saveCompany() {
    if (!editingComp?.name) { setError("الاسم مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editingComp.id;
      const url = isEdit ? `/admin/telecom/companies/${editingComp.id}` : "/admin/telecom/companies";
      await apiFetch(url, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editingComp) });
      setShowCompModal(false);
      loadCompanies();
    } catch { setError("فشل الحفظ"); }
    finally { setSaving(false); }
  }

  async function deleteCompany(id: number) {
    if (!confirm("هل تريد حذف هذه الشركة؟")) return;
    try {
      await apiFetch(`/admin/telecom/companies/${id}`, { method: "DELETE" });
      loadCompanies();
    } catch { setError("فشل الحذف"); }
  }

  async function toggleCompany(c: Company) {
    try {
      await apiFetch(`/admin/telecom/companies/${c.id}`, {
        method: "PATCH", body: JSON.stringify({ is_active: !c.is_active }),
      });
      loadCompanies();
    } catch { setError("فشل التحديث"); }
  }

  // ── Save Offer ──
  async function saveOffer() {
    if (!editingOffer?.title) { setError("العنوان مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editingOffer.id;
      const url = isEdit ? `/admin/telecom/offers/${editingOffer.id}` : "/admin/telecom/offers";
      await apiFetch(url, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editingOffer) });
      setShowOfferModal(false);
      loadOffers();
    } catch { setError("فشل الحفظ"); }
    finally { setSaving(false); }
  }

  async function deleteOffer(id: number) {
    if (!confirm("هل تريد حذف هذا العرض؟")) return;
    try {
      await apiFetch(`/admin/telecom/offers/${id}`, { method: "DELETE" });
      loadOffers();
    } catch { setError("فشل الحذف"); }
  }

  // ── Save Event ──
  async function saveEvent() {
    if (!editingEvent?.title) { setError("العنوان مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editingEvent.id;
      const url = isEdit ? `/admin/telecom/events/${editingEvent.id}` : "/admin/telecom/events";
      await apiFetch(url, { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editingEvent) });
      setShowEventModal(false);
      loadEvents();
    } catch { setError("فشل الحفظ"); }
    finally { setSaving(false); }
  }

  async function deleteEvent(id: number) {
    if (!confirm("هل تريد حذف هذه الفعالية؟")) return;
    try {
      await apiFetch(`/admin/telecom/events/${id}`, { method: "DELETE" });
      loadEvents();
    } catch { setError("فشل الحذف"); }
  }

  const TC = "#0EA5E9";

  return (
    <div style={{ padding: "24px 28px", direction: "rtl", fontFamily: "'Cairo', sans-serif" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f0fdf4" }}>
            📡 شركات الاتصالات
          </h1>
          <p style={{ margin: "4px 0 0", color: "hsl(215 20% 50%)", fontSize: 13 }}>
            إدارة الشركات والعروض والفعاليات
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {tab === "companies" && (
            <button onClick={() => { setEditingComp({ brand_color: "#0EA5E9", brand_color2: "#2563EB", is_active: true, sort_order: 0 }); setShowCompModal(true); }} style={btnStyle(TC)}>
              + إضافة شركة
            </button>
          )}
          {tab === "offers" && (
            <button onClick={() => { setEditingOffer({ category: "data", price: 0, currency: "SDG", is_active: true, sort_order: 0 }); setShowOfferModal(true); }} style={btnStyle(TC)}>
              + إضافة عرض
            </button>
          )}
          {tab === "events" && (
            <button onClick={() => { setEditingEvent({ is_active: true }); setShowEventModal(true); }} style={btnStyle(TC)}>
              + إضافة فعالية
            </button>
          )}
          {tab === "contracts" && (
            <a href="telecom-portal" target="_blank" rel="noopener" style={{ ...btnStyle("#F59E0B"), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              🔑 فتح بوابة الشركات
            </a>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "#EF444422", border: "1px solid #EF4444", borderRadius: 8, padding: "10px 16px", color: "#FCA5A5", marginBottom: 16, fontSize: 13 }}>
          {error}
          <button onClick={() => setError("")} style={{ marginRight: 12, background: "none", border: "none", color: "#FCA5A5", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "hsl(222 47% 10%)", padding: 4, borderRadius: 12, width: "fit-content" }}>
        {[
          { key: "companies", label: "الشركات",   count: companies.length },
          { key: "offers",    label: "العروض",    count: offers.length },
          { key: "events",    label: "الفعاليات", count: events.length },
          { key: "contracts", label: "العقود",    count: companies.length },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            style={{
              padding: "7px 18px", borderRadius: 9, border: "none", cursor: "pointer",
              fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13,
              background: tab === t.key ? TC : "transparent",
              color: tab === t.key ? "#fff" : "hsl(215 20% 55%)",
              display: "flex", alignItems: "center", gap: 8,
              transition: "all 0.15s",
            }}
          >
            {t.label}
            <span style={{
              padding: "0 6px", borderRadius: 10, fontSize: 11,
              background: tab === t.key ? "#ffffff30" : "hsl(222 47% 18%)",
              color: tab === t.key ? "#fff" : "hsl(215 20% 55%)",
            }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ══ تبويب الشركات ══ */}
      {tab === "companies" && (
        <div>
          {compLoading ? <Spinner /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 16 }}>
              {companies.map(c => (
                <div key={c.id} style={{
                  background: "hsl(222 47% 11%)", border: `1px solid ${c.brand_color}33`,
                  borderRadius: 14, overflow: "hidden", position: "relative",
                }}>
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${c.brand_color}, ${c.brand_color2 || c.brand_color})` }} />
                  <div style={{ padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                      <CompanyDot color={c.brand_color} initial={c.logo_initial} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#f0fdf4" }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginTop: 2 }}>{c.description}</div>
                      </div>
                      <Badge color={c.is_active ? "#22C55E" : "#EF4444"} text={c.is_active ? "نشط" : "موقوف"} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                      {c.subscribers && <StatPill icon="👥" val={c.subscribers} />}
                      {c.coverage && <StatPill icon="📶" val={c.coverage} />}
                      {c.founded && <StatPill icon="📅" val={`منذ ${c.founded}`} />}
                      {c.hotline && <StatPill icon="📞" val={c.hotline} />}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setEditingComp({ ...c }); setShowCompModal(true); }} style={smallBtn("#0EA5E9")}>تعديل</button>
                      <button onClick={() => toggleCompany(c)} style={smallBtn(c.is_active ? "#F59E0B" : "#22C55E")}>
                        {c.is_active ? "إيقاف" : "تفعيل"}
                      </button>
                      <button onClick={() => deleteCompany(c.id)} style={smallBtn("#EF4444")}>حذف</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ تبويب العروض ══ */}
      {tab === "offers" && (
        <div>
          {offersLoading ? <Spinner /> : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  {["الشركة", "العنوان", "الفئة", "السعر", "المدة", "الحالة", "إجراءات"].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {offers.map(o => {
                  const comp = companies.find(c => c.id === o.company_id);
                  return (
                    <tr key={o.id} style={{ borderBottom: "1px solid hsl(222 47% 14%)" }}>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {comp && <CompanyDot color={comp.brand_color} initial={comp.logo_initial} />}
                          <span style={{ fontSize: 12, color: "hsl(215 20% 65%)" }}>{o.company_name || "—"}</span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: "#f0fdf4", fontSize: 13 }}>{o.title}</div>
                        {o.description && <div style={{ fontSize: 11, color: "hsl(215 20% 50%)", marginTop: 2 }}>{o.description.substring(0, 60)}…</div>}
                      </td>
                      <td style={tdStyle}>
                        <Badge color={CAT_COLORS[o.category] || "#64748B"} text={CAT_LABELS[o.category] || o.category} />
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: CAT_COLORS[o.category] || "#0EA5E9" }}>
                        {o.price} {o.currency}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: "hsl(215 20% 55%)" }}>{o.validity || "—"}</td>
                      <td style={tdStyle}>
                        <Badge color={o.is_active ? "#22C55E" : "#EF4444"} text={o.is_active ? "نشط" : "موقوف"} />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { setEditingOffer({ ...o }); setShowOfferModal(true); }} style={smallBtn("#0EA5E9")}>تعديل</button>
                          <button onClick={() => deleteOffer(o.id)} style={smallBtn("#EF4444")}>حذف</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {offers.length === 0 && (
                  <tr><td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "hsl(215 20% 40%)", padding: 40 }}>لا توجد عروض بعد</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ تبويب الفعاليات ══ */}
      {tab === "events" && (
        <div>
          {eventsLoading ? <Spinner /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
              {events.map(e => {
                const comp = companies.find(c => c.id === e.company_id);
                const dateStr = e.event_date ? new Date(e.event_date).toLocaleDateString("ar-SD", { year: "numeric", month: "long", day: "numeric" }) : null;
                return (
                  <div key={e.id} style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#f0fdf4" }}>{e.title}</div>
                        {e.company_name && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                            {comp && <CompanyDot color={comp.brand_color} initial={comp.logo_initial} />}
                            <span style={{ fontSize: 12, color: comp?.brand_color || TC }}>{e.company_name}</span>
                          </div>
                        )}
                      </div>
                      <Badge color={e.is_active ? "#22C55E" : "#EF4444"} text={e.is_active ? "نشطة" : "موقوفة"} />
                    </div>
                    {e.description && <p style={{ margin: "0 0 8px", fontSize: 12, color: "hsl(215 20% 55%)", lineHeight: 1.6 }}>{e.description}</p>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, fontSize: 12, color: "hsl(215 20% 55%)" }}>
                      {dateStr && <span>📅 {dateStr}</span>}
                      {e.location && <span>📍 {e.location}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setEditingEvent({ ...e }); setShowEventModal(true); }} style={smallBtn("#0EA5E9")}>تعديل</button>
                      <button onClick={() => deleteEvent(e.id)} style={smallBtn("#EF4444")}>حذف</button>
                    </div>
                  </div>
                );
              })}
              {events.length === 0 && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", color: "hsl(215 20% 40%)", padding: 60 }}>لا توجد فعاليات بعد</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ تبويب العقود ══ */}
      {tab === "contracts" && (
        <div>
          {contractsLoading ? <Spinner /> : (
            <>
              {/* ملاحظة إرشادية */}
              <div style={{ background: "#F59E0B18", border: "1px solid #F59E0B40", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#F59E0B", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span>💡</span>
                <div>
                  <strong>كيف تعمل المساحات الإعلانية:</strong> كل شركة تحصل على عقد إعلاني ببيانات دخول خاصة (رمز PIN) تتيح لها إدارة مساحتها في التطبيق مباشرة.
                  الباقة تحدد ما يمكنها تعديله: <strong>أساسي</strong> = عروض فقط | <strong>ستاندرد</strong> = عروض + خدمات + بيانات ترويجية | <strong>بريميوم</strong> = كل شيء + أولوية العرض.
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 16 }}>
                {contracts.map((c: ContractComp) => {
                  const pkg = c.package_type || "basic";
                  const pkgColor = PKG_COLORS[pkg] || "#6B7280";
                  const isExpired = c.contract_end ? new Date(c.contract_end) < new Date() : false;
                  return (
                    <div key={c.id} style={{ background: "hsl(222 47% 11%)", border: `1px solid ${pkgColor}33`, borderRadius: 14, overflow: "hidden" }}>
                      <div style={{ height: 3, background: `linear-gradient(90deg, ${pkgColor}, ${pkgColor}80)` }} />
                      <div style={{ padding: "16px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                          <CompanyDot color={c.brand_color} initial={c.logo_initial} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: "#f0fdf4" }}>{c.name}</div>
                            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                              <span style={{ padding: "1px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: pkgColor + "22", color: pkgColor, border: `1px solid ${pkgColor}44` }}>
                                {PKG_LABELS[pkg] || pkg}
                              </span>
                              {isExpired && <span style={{ padding: "1px 8px", borderRadius: 8, fontSize: 11, background: "#EF444422", color: "#EF4444", border: "1px solid #EF444444" }}>⚠ منتهي</span>}
                              {!c.package_type && <span style={{ padding: "1px 8px", borderRadius: 8, fontSize: 11, background: "#6B728022", color: "#6B7280" }}>بدون عقد</span>}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginBottom: 14, fontSize: 12 }}>
                          {c.contract_start && <div><span style={{ color: "hsl(215 20% 45%)" }}>بداية:</span> <span style={{ color: "#f0fdf4" }}>{new Date(c.contract_start).toLocaleDateString("ar-SA")}</span></div>}
                          {c.contract_end && <div><span style={{ color: "hsl(215 20% 45%)" }}>نهاية:</span> <span style={{ color: isExpired ? "#EF4444" : "#f0fdf4" }}>{new Date(c.contract_end).toLocaleDateString("ar-SA")}</span></div>}
                          {c.monthly_fee != null && c.monthly_fee > 0 && <div><span style={{ color: "hsl(215 20% 45%)" }}>الرسوم:</span> <span style={{ color: pkgColor }}>{c.monthly_fee} SDG/شهر</span></div>}
                          {c.contact_person && <div><span style={{ color: "hsl(215 20% 45%)" }}>المسؤول:</span> <span style={{ color: "#f0fdf4" }}>{c.contact_person}</span></div>}
                        </div>

                        {(c.promo_tagline || c.promo_badge) && (
                          <div style={{ background: "hsl(222 47% 14%)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12 }}>
                            {c.promo_tagline && <div style={{ color: pkgColor, marginBottom: 3 }}>💬 {c.promo_tagline}</div>}
                            {c.promo_badge && <div style={{ color: "hsl(215 20% 55%)" }}>🏷 {c.promo_badge}</div>}
                          </div>
                        )}

                        <button
                          onClick={() => {
                            setCredTarget(c);
                            setCredForm({ pin: "", package_type: c.package_type || "basic", contract_start: c.contract_start?.slice(0,10)||"", contract_end: c.contract_end?.slice(0,10)||"", monthly_fee: c.monthly_fee?.toString()||"", contact_person: c.contact_person||"", contact_email: c.contact_email||"" });
                            setShowCredModal(true);
                          }}
                          style={{ ...smallBtn(pkgColor), width: "100%" }}
                        >
                          🔐 إعداد بيانات الدخول والعقد
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ Modal: بيانات العقد والدخول ══ */}
      {showCredModal && credTarget && (
        <Modal title={`🔐 عقد وبيانات الدخول — ${credTarget.name}`} onClose={() => setShowCredModal(false)}>
          <div style={{ background: "#0EA5E922", border: "1px solid #0EA5E940", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#7DD3FC" }}>
            سيُمكَّن ممثل الشركة من الدخول إلى بوابة إدارة المساحة الإعلانية باستخدام رقم الشركة + الرمز السري الذي تحدده هنا.
          </div>
          <div style={formGrid}>
            <Field label="رمز PIN جديد (اتركه فارغاً للإبقاء على الحالي)">
              <input type="password" style={inputStyle} value={credForm.pin} onChange={e => setCredForm(p => ({ ...p, pin: e.target.value }))} placeholder="••••••" maxLength={10} />
            </Field>
            <Field label="نوع الباقة">
              <select style={inputStyle} value={credForm.package_type} onChange={e => setCredForm(p => ({ ...p, package_type: e.target.value }))}>
                <option value="basic">● أساسي — عروض فقط</option>
                <option value="standard">⬡ ستاندرد — عروض + خدمات + ترويجي</option>
                <option value="premium">★ بريميوم — كل شيء + أولوية</option>
              </select>
            </Field>
            <Field label="تاريخ بداية العقد">
              <input type="date" style={inputStyle} value={credForm.contract_start} onChange={e => setCredForm(p => ({ ...p, contract_start: e.target.value }))} />
            </Field>
            <Field label="تاريخ نهاية العقد">
              <input type="date" style={inputStyle} value={credForm.contract_end} onChange={e => setCredForm(p => ({ ...p, contract_end: e.target.value }))} />
            </Field>
            <Field label="الرسوم الشهرية (SDG)">
              <input type="number" style={inputStyle} value={credForm.monthly_fee} onChange={e => setCredForm(p => ({ ...p, monthly_fee: e.target.value }))} placeholder="0" />
            </Field>
            <Field label="اسم المسؤول في الشركة">
              <input style={inputStyle} value={credForm.contact_person} onChange={e => setCredForm(p => ({ ...p, contact_person: e.target.value }))} />
            </Field>
            <Field label="البريد الإلكتروني للتواصل" full>
              <input type="email" style={inputStyle} value={credForm.contact_email} onChange={e => setCredForm(p => ({ ...p, contact_email: e.target.value }))} />
            </Field>
          </div>
          {error && <div style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowCredModal(false)} style={cancelBtn}>إلغاء</button>
            <button onClick={saveCredentials} disabled={saving} style={btnStyle("#F59E0B")}>{saving ? "جارٍ الحفظ…" : "💾 حفظ العقد والبيانات"}</button>
          </div>
        </Modal>
      )}

      {/* ══ Modal: شركة ══ */}
      {showCompModal && editingComp && (
        <Modal title={editingComp.id ? "تعديل الشركة" : "إضافة شركة"} onClose={() => setShowCompModal(false)}>
          <div style={formGrid}>
            <Field label="الاسم الكامل *">
              <input style={inputStyle} value={editingComp.name || ""} onChange={e => setEditingComp(p => ({ ...p!, name: e.target.value }))} placeholder="MTN السودان" />
            </Field>
            <Field label="الاختصار">
              <input style={inputStyle} value={editingComp.short || ""} onChange={e => setEditingComp(p => ({ ...p!, short: e.target.value }))} placeholder="MTN" />
            </Field>
            <Field label="الحرف الأولي">
              <input style={inputStyle} value={editingComp.logo_initial || ""} onChange={e => setEditingComp(p => ({ ...p!, logo_initial: e.target.value }))} placeholder="M" maxLength={2} />
            </Field>
            <Field label="اللون الرئيسي">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={editingComp.brand_color || "#0EA5E9"} onChange={e => setEditingComp(p => ({ ...p!, brand_color: e.target.value }))} style={{ width: 40, height: 36, padding: 2, borderRadius: 6, border: "1px solid hsl(222 47% 22%)", background: "transparent", cursor: "pointer" }} />
                <input style={{ ...inputStyle, flex: 1 }} value={editingComp.brand_color || ""} onChange={e => setEditingComp(p => ({ ...p!, brand_color: e.target.value }))} />
              </div>
            </Field>
            <Field label="وصف الشركة" full>
              <textarea style={{ ...inputStyle, minHeight: 72 }} value={editingComp.description || ""} onChange={e => setEditingComp(p => ({ ...p!, description: e.target.value }))} placeholder="وصف مختصر عن الشركة…" />
            </Field>
            <Field label="سنة التأسيس">
              <input style={inputStyle} value={editingComp.founded || ""} onChange={e => setEditingComp(p => ({ ...p!, founded: e.target.value }))} placeholder="1997" />
            </Field>
            <Field label="عدد المشتركين">
              <input style={inputStyle} value={editingComp.subscribers || ""} onChange={e => setEditingComp(p => ({ ...p!, subscribers: e.target.value }))} placeholder="+٢٠ مليون" />
            </Field>
            <Field label="نسبة التغطية">
              <input style={inputStyle} value={editingComp.coverage || ""} onChange={e => setEditingComp(p => ({ ...p!, coverage: e.target.value }))} placeholder="٩٨٪" />
            </Field>
            <Field label="خط الخدمة">
              <input style={inputStyle} value={editingComp.hotline || ""} onChange={e => setEditingComp(p => ({ ...p!, hotline: e.target.value }))} placeholder="1800" />
            </Field>
            <Field label="كود الاستعلام (USSD)">
              <input style={inputStyle} value={editingComp.ussd || ""} onChange={e => setEditingComp(p => ({ ...p!, ussd: e.target.value }))} placeholder="*100#" />
            </Field>
            <Field label="كود الشحن">
              <input style={inputStyle} value={editingComp.recharge || ""} onChange={e => setEditingComp(p => ({ ...p!, recharge: e.target.value }))} placeholder="*555*[رمز]#" />
            </Field>
            <Field label="الموقع الإلكتروني">
              <input style={inputStyle} value={editingComp.website || ""} onChange={e => setEditingComp(p => ({ ...p!, website: e.target.value }))} placeholder="https://www.mtn.sd" />
            </Field>
            <Field label="الترتيب">
              <input type="number" style={inputStyle} value={editingComp.sort_order ?? 0} onChange={e => setEditingComp(p => ({ ...p!, sort_order: Number(e.target.value) }))} />
            </Field>
          </div>
          {error && <div style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowCompModal(false)} style={cancelBtn}>إلغاء</button>
            <button onClick={saveCompany} disabled={saving} style={btnStyle(TC)}>{saving ? "جارٍ الحفظ…" : "حفظ"}</button>
          </div>
        </Modal>
      )}

      {/* ══ Modal: عرض ══ */}
      {showOfferModal && editingOffer && (
        <Modal title={editingOffer.id ? "تعديل العرض" : "إضافة عرض"} onClose={() => setShowOfferModal(false)}>
          <div style={formGrid}>
            <Field label="الشركة">
              <select style={inputStyle} value={editingOffer.company_id || ""} onChange={e => setEditingOffer(p => ({ ...p!, company_id: e.target.value ? Number(e.target.value) : undefined }))}>
                <option value="">كل الشركات</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="الفئة">
              <select style={inputStyle} value={editingOffer.category || "data"} onChange={e => setEditingOffer(p => ({ ...p!, category: e.target.value }))}>
                <option value="data">إنترنت</option>
                <option value="calls">مكالمات</option>
                <option value="combo">باقة مدمجة</option>
                <option value="roaming">تجوال</option>
                <option value="sms">رسائل</option>
              </select>
            </Field>
            <Field label="عنوان العرض *" full>
              <input style={inputStyle} value={editingOffer.title || ""} onChange={e => setEditingOffer(p => ({ ...p!, title: e.target.value }))} placeholder="باقة 10 جيجا لمدة أسبوع" />
            </Field>
            <Field label="الوصف" full>
              <textarea style={{ ...inputStyle, minHeight: 64 }} value={editingOffer.description || ""} onChange={e => setEditingOffer(p => ({ ...p!, description: e.target.value }))} />
            </Field>
            <Field label="السعر">
              <input type="number" style={inputStyle} value={editingOffer.price || 0} onChange={e => setEditingOffer(p => ({ ...p!, price: Number(e.target.value) }))} />
            </Field>
            <Field label="العملة">
              <select style={inputStyle} value={editingOffer.currency || "SDG"} onChange={e => setEditingOffer(p => ({ ...p!, currency: e.target.value }))}>
                <option value="SDG">جنيه سوداني (SDG)</option>
                <option value="USD">دولار (USD)</option>
              </select>
            </Field>
            <Field label="مدة الصلاحية">
              <input style={inputStyle} value={editingOffer.validity || ""} onChange={e => setEditingOffer(p => ({ ...p!, validity: e.target.value }))} placeholder="7 أيام" />
            </Field>
            <Field label="تفاصيل إضافية" full>
              <textarea style={{ ...inputStyle, minHeight: 64 }} value={editingOffer.details || ""} onChange={e => setEditingOffer(p => ({ ...p!, details: e.target.value }))} placeholder="شروط وتفاصيل العرض…" />
            </Field>
            <Field label="الترتيب">
              <input type="number" style={inputStyle} value={editingOffer.sort_order || 0} onChange={e => setEditingOffer(p => ({ ...p!, sort_order: Number(e.target.value) }))} />
            </Field>
          </div>
          {error && <div style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowOfferModal(false)} style={cancelBtn}>إلغاء</button>
            <button onClick={saveOffer} disabled={saving} style={btnStyle(TC)}>{saving ? "جارٍ الحفظ…" : "حفظ"}</button>
          </div>
        </Modal>
      )}

      {/* ══ Modal: فعالية ══ */}
      {showEventModal && editingEvent && (
        <Modal title={editingEvent.id ? "تعديل الفعالية" : "إضافة فعالية"} onClose={() => setShowEventModal(false)}>
          <div style={formGrid}>
            <Field label="الشركة">
              <select style={inputStyle} value={editingEvent.company_id || ""} onChange={e => setEditingEvent(p => ({ ...p!, company_id: e.target.value ? Number(e.target.value) : undefined }))}>
                <option value="">غير مرتبطة بشركة</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="عنوان الفعالية *" full>
              <input style={inputStyle} value={editingEvent.title || ""} onChange={e => setEditingEvent(p => ({ ...p!, title: e.target.value }))} placeholder="حفل إطلاق باقة الإنترنت الجديدة" />
            </Field>
            <Field label="الوصف" full>
              <textarea style={{ ...inputStyle, minHeight: 72 }} value={editingEvent.description || ""} onChange={e => setEditingEvent(p => ({ ...p!, description: e.target.value }))} />
            </Field>
            <Field label="تاريخ الفعالية">
              <input type="datetime-local" style={inputStyle} value={editingEvent.event_date ? editingEvent.event_date.slice(0, 16) : ""} onChange={e => setEditingEvent(p => ({ ...p!, event_date: e.target.value }))} />
            </Field>
            <Field label="المكان">
              <input style={inputStyle} value={editingEvent.location || ""} onChange={e => setEditingEvent(p => ({ ...p!, location: e.target.value }))} placeholder="قاعة مهرجان الحصاحيصا" />
            </Field>
          </div>
          {error && <div style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowEventModal(false)} style={cancelBtn}>إلغاء</button>
            <button onClick={saveEvent} disabled={saving} style={btnStyle(TC)}>{saving ? "جارٍ الحفظ…" : "حفظ"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── مكوّنات مساعدة ───────────────────────────────────────────────────────────
function Spinner() {
  return <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 40%)" }}>جارٍ التحميل…</div>;
}

function StatPill({ icon, val }: { icon: string; val: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 8, background: "hsl(222 47% 14%)", fontSize: 11, color: "hsl(215 20% 60%)" }}>
      {icon} {val}
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(222 47% 18%)", width: "100%", maxWidth: 680, maxHeight: "88vh", overflow: "auto", direction: "rtl" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid hsl(222 47% 14%)" }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "#f0fdf4", fontFamily: "'Cairo', sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "hsl(215 20% 50%)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: "20px" }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? "1/-1" : undefined }}>
      <label style={{ display: "block", fontSize: 12, color: "hsl(215 20% 55%)", marginBottom: 5, fontFamily: "'Cairo', sans-serif" }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const btnStyle = (color: string): React.CSSProperties => ({
  padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer",
  fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13,
  background: color, color: "#fff",
});

const smallBtn = (color: string): React.CSSProperties => ({
  padding: "5px 12px", borderRadius: 8, border: `1px solid ${color}50`,
  background: color + "18", color, cursor: "pointer",
  fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 12,
});

const cancelBtn: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 10, border: "1px solid hsl(222 47% 22%)",
  background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer",
  fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid hsl(222 47% 22%)",
  background: "hsl(222 47% 8%)", color: "#f0fdf4", fontSize: 13,
  fontFamily: "'Cairo', sans-serif", boxSizing: "border-box",
};

const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse",
  background: "hsl(222 47% 11%)", borderRadius: 12, overflow: "hidden",
  border: "1px solid hsl(222 47% 14%)",
};

const thStyle: React.CSSProperties = {
  padding: "12px 14px", textAlign: "right", fontSize: 12, fontWeight: 600,
  color: "hsl(215 20% 50%)", background: "hsl(222 47% 10%)",
  borderBottom: "1px solid hsl(222 47% 14%)",
  fontFamily: "'Cairo', sans-serif",
};

const tdStyle: React.CSSProperties = {
  padding: "11px 14px", verticalAlign: "middle",
  fontFamily: "'Cairo', sans-serif",
};

const formGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 18px",
};
