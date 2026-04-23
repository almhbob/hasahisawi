import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Application = {
  id: number; full_name: string; title: string; phone: string; whatsapp: string;
  email: string; bar_number: string; experience_y: number; specialties: string;
  bio: string; office_addr: string; district: string; languages: string;
  consult_fee: string; bar_card_url: string; photo_url: string;
  status: "pending" | "approved" | "rejected"; admin_note: string;
  reviewed_at?: string; lawyer_id?: number; created_at: string;
};
type Lawyer = {
  id: number; full_name: string; title: string; phone: string; specialties: string;
  district: string; consult_fee: string; experience_y: number;
  is_featured: boolean; is_verified: boolean; is_active: boolean;
  contracts_count: number; created_at: string;
  plan_name?: string; plan_name_ar?: string; plan_color?: string; plan_icon?: string;
  sub_commission?: number; sub_expires?: string; sub_started?: string;
};
type SubRow = {
  lawyer_id: number; full_name: string; phone: string; district: string;
  plan_name?: string; plan_name_ar?: string; color?: string; icon?: string; price_label?: string;
  commission_pct?: number; started_at?: string; expires_at?: string;
  payment_ref?: string; admin_note?: string; contracts_count: number;
};
type SubStats = {
  plans: { name: string; name_ar: string; icon: string; price_sdg: number; color: string; subscribers: number; monthly_revenue: number; avg_commission: number }[];
  total_paid: number; free_lawyers: number;
};
type Plan = { id: number; name: string; name_ar: string; price_sdg: number; price_label: string; monthly_contacts: number; has_unlimited_contacts: boolean; has_ads: boolean; has_featured: boolean; has_verified_badge: boolean; has_priority: boolean; commission_pct: number; color: string; icon: string };

const STATUS_LABEL: Record<string, string> = { pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض" };
const STATUS_COLOR: Record<string, string> = { pending: "#F59E0B", approved: "#10B981", rejected: "#EF4444" };
const PLAN_FEATURES: Record<string, string[]> = {
  free:         ["ظهور أساسي في الدليل", "5 طلبات تواصل / شهر", "ملف شخصي مبسّط"],
  basic:        ["تواصل غير محدود", "أولوية الظهور", "شارة الاعتماد ✓", "إشعارات الطلبات"],
  professional: ["كل مميزات الأساسي", "إعلان ترويجي داخل التطبيق", "ظهور مميّز في القائمة", "عمولة 5% على الخدمات المُوجَّهة"],
  premium:      ["كل مميزات المحترف", "صدارة الصفحة الرئيسية", "شارة 👑 البريميوم", "عمولة 8% مع تقارير شهرية"],
};

export default function Lawyers() {
  const [tab, setTab] = useState<"applications" | "active" | "subscriptions">("applications");
  const [apps, setApps] = useState<Application[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [stats, setStats] = useState<SubStats | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"" | "pending" | "approved" | "rejected">("pending");
  const [selected, setSelected] = useState<Application | null>(null);
  const [note, setNote] = useState("");
  const [feature, setFeature] = useState(false);
  const [busy, setBusy] = useState(false);
  // حالة نافذة تعيين الاشتراك
  const [subModal, setSubModal] = useState<SubRow | null>(null);
  const [subForm, setSubForm] = useState({ plan_name: "free", commission_pct: "0", expires_at: "", payment_ref: "", admin_note: "" });
  const [subBusy, setSubBusy] = useState(false);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try { const data = await apiJson<any>(`/admin/lawyer-applications${filter ? `?status=${filter}` : ""}`); setApps(Array.isArray(data) ? data : []); }
    catch {} finally { setLoading(false); }
  }, [filter]);

  const loadLawyers = useCallback(async () => {
    setLoading(true);
    try { const data = await apiJson<any>("/admin/lawyers"); setLawyers(Array.isArray(data) ? data : []); }
    catch {} finally { setLoading(false); }
  }, []);

  const loadSubs = useCallback(async () => {
    setLoading(true);
    try {
      const [subsData, statsData, plansData] = await Promise.all([
        apiJson<any>("/admin/subscriptions"),
        apiJson<any>("/admin/subscription-stats"),
        apiJson<any>("/subscription-plans"),
      ]);
      setSubs(Array.isArray(subsData) ? subsData : []);
      setStats(statsData as SubStats);
      setPlans(Array.isArray(plansData) ? plansData : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "applications") loadApps();
    else if (tab === "active") loadLawyers();
    else loadSubs();
  }, [tab, loadApps, loadLawyers, loadSubs]);

  const approve = async () => {
    if (!selected) return;
    if (!confirm(`قبول طلب ${selected.full_name}؟ سيتم إنشاء ملف المحامي تلقائياً.`)) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/admin/lawyer-applications/${selected.id}/approve`, { method: "POST", body: JSON.stringify({ admin_note: note, is_featured: feature }) });
      if (!r.ok) { const d = await r.json(); alert(d.error || "فشل القبول"); }
      else { setSelected(null); setNote(""); setFeature(false); loadApps(); }
    } finally { setBusy(false); }
  };

  const reject = async () => {
    if (!selected) return;
    if (!note.trim()) { alert("اكتب سبب الرفض"); return; }
    if (!confirm("رفض هذا الطلب؟")) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/admin/lawyer-applications/${selected.id}/reject`, { method: "POST", body: JSON.stringify({ admin_note: note }) });
      if (!r.ok) { const d = await r.json(); alert(d.error || "فشل الرفض"); }
      else { setSelected(null); setNote(""); loadApps(); }
    } finally { setBusy(false); }
  };

  const toggleField = async (l: Lawyer, field: "is_featured" | "is_verified" | "is_active") => {
    await apiFetch(`/admin/lawyers/${l.id}`, { method: "PATCH", body: JSON.stringify({ [field]: !l[field] }) });
    setLawyers(prev => prev.map(x => x.id === l.id ? { ...x, [field]: !l[field] } : x));
  };

  const remove = async (l: Lawyer) => {
    if (!confirm(`حذف المحامي "${l.full_name}" نهائياً؟`)) return;
    await apiFetch(`/admin/lawyers/${l.id}`, { method: "DELETE" });
    setLawyers(prev => prev.filter(x => x.id !== l.id));
  };

  const openSubModal = (row: SubRow) => {
    setSubModal(row);
    setSubForm({ plan_name: row.plan_name || "free", commission_pct: String(row.commission_pct ?? 0), expires_at: row.expires_at ? row.expires_at.slice(0, 10) : "", payment_ref: row.payment_ref || "", admin_note: row.admin_note || "" });
  };

  const saveSub = async () => {
    if (!subModal) return;
    setSubBusy(true);
    try {
      const r = await apiFetch(`/admin/lawyers/${subModal.lawyer_id}/subscription`, {
        method: "PUT", body: JSON.stringify({ ...subForm, commission_pct: Number(subForm.commission_pct) }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || "فشل الحفظ"); }
      else { setSubModal(null); loadSubs(); }
    } finally { setSubBusy(false); }
  };

  const pendingCount = apps.filter(a => a.status === "pending").length;
  const totalRevenue = stats?.plans.reduce((s, p) => s + (p.monthly_revenue || 0), 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="المحامون والخدمات القانونية"
        subtitle={tab === "applications" ? `${apps.length} طلب${pendingCount ? ` · ${pendingCount} قيد المراجعة` : ""}` : tab === "active" ? `${lawyers.length} محامي مسجّل` : "إدارة الاشتراكات والعمولات"}
      />

      {/* ─── Tabs ─── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e5e7eb" }}>
        {([
          ["applications", "📥 طلبات الانضمام", pendingCount],
          ["active",       "⚖️ المحامون",        null],
          ["subscriptions","💳 الاشتراكات",      null],
        ] as const).map(([key, label, badge]) => (
          <button key={key} onClick={() => setTab(key as any)} style={{
            padding: "11px 20px", border: "none", background: "none", cursor: "pointer",
            borderBottom: tab === key ? "2px solid #8B5CF6" : "2px solid transparent",
            color: tab === key ? "#8B5CF6" : "#6B7280", fontWeight: 700, fontSize: 14,
            marginBottom: -2, display: "flex", alignItems: "center", gap: 6,
          }}>
            {label}
            {badge ? <span style={{ background: "#F59E0B", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ─── APPLICATIONS TAB ─── */}
      {tab === "applications" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[["", "الكل"], ["pending", "قيد المراجعة"], ["approved", "مقبول"], ["rejected", "مرفوض"]].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v as any)} style={{
                padding: "6px 14px", borderRadius: 16, cursor: "pointer", fontSize: 13,
                border: `1px solid ${filter === v ? "#8B5CF6" : "#e5e7eb"}`,
                background: filter === v ? "#8B5CF6" : "#fff", color: filter === v ? "#fff" : "#374151",
              }}>{l}</button>
            ))}
          </div>
          {loading ? <p>جارِ التحميل…</p> : apps.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>لا توجد طلبات</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {apps.map(a => (
                <div key={a.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <strong style={{ fontSize: 16 }}>{a.full_name}</strong>
                        <span style={{ background: STATUS_COLOR[a.status] + "22", color: STATUS_COLOR[a.status], padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{STATUS_LABEL[a.status]}</span>
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>{a.title} · {a.specialties}</div>
                      <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>📞 {a.phone} · 🆔 {a.bar_number} · ⏱ {a.experience_y} سنة</div>
                      {a.admin_note && a.status !== "pending" && (
                        <div style={{ marginTop: 8, padding: 8, background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#4b5563" }}>💬 {a.admin_note}</div>
                      )}
                    </div>
                    <button onClick={() => { setSelected(a); setNote(a.admin_note || ""); setFeature(false); }} style={{
                      padding: "7px 14px", borderRadius: 8, border: "1px solid #8B5CF6", background: "#fff", color: "#8B5CF6", cursor: "pointer", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
                    }}>مراجعة التفاصيل</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── ACTIVE LAWYERS TAB ─── */}
      {tab === "active" && (
        <>
          {loading ? <p>جارِ التحميل…</p> : lawyers.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>لا يوجد محامون مسجّلون بعد</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                    {["الاسم", "الخطة", "التخصص", "الحي", "العقود", "الحالة", "إجراءات"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lawyers.map(l => (
                    <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6", background: l.is_active ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 600 }}>{l.full_name}</div>
                        <div style={{ color: "#6b7280", fontSize: 11 }}>{l.title}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {l.plan_name ? (
                          <span style={{ background: (l.plan_color || "#6B7280") + "22", color: l.plan_color || "#6B7280", borderRadius: 12, padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>
                            {l.plan_icon} {l.plan_name_ar}
                          </span>
                        ) : <span style={{ color: "#9ca3af", fontSize: 12 }}>🔓 مجاني</span>}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#374151", maxWidth: 160 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.specialties}</div></td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{l.district}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#4b5563" }}>{l.contracts_count}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <Toggle label="فعّال" on={l.is_active} onChange={() => toggleField(l, "is_active")} color="#10B981" />
                          <Toggle label="مميّز" on={l.is_featured} onChange={() => toggleField(l, "is_featured")} color="#F59E0B" />
                          <Toggle label="موثّق" on={l.is_verified} onChange={() => toggleField(l, "is_verified")} color="#8B5CF6" />
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button onClick={() => remove(l)} style={{ padding: "5px 10px", border: "1px solid #EF4444", background: "#fff", color: "#EF4444", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>حذف</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── SUBSCRIPTIONS TAB ─── */}
      {tab === "subscriptions" && (
        <>
          {/* بطاقات الإحصاء */}
          {stats && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12, marginBottom: 20 }}>
                <StatCard label="إجمالي الإيرادات الشهرية" value={`${totalRevenue.toLocaleString()} ج.س`} color="#10B981" icon="💰" />
                <StatCard label="مشتركون بخطط مدفوعة" value={String(stats.total_paid)} color="#8B5CF6" icon="💳" />
                <StatCard label="على الخطة المجانية" value={String(stats.free_lawyers)} color="#6B7280" icon="🔓" />
              </div>

              {/* جدول الخطط الاحترافي */}
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, color: "#111827", fontSize: 15 }}>
                  📋 جدول خطط الاشتراك
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {["الخطة", "السعر الشهري", "التواصل", "إعلانات", "مميّز", "موثّق", "أولوية", "عمولة الاتفاقية", "المشتركون", "الإيراد"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#374151", whiteSpace: "nowrap", fontSize: 12 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.plans.map(p => (
                        <tr key={p.name} style={{ borderTop: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ background: p.color + "22", color: p.color, borderRadius: 10, padding: "4px 12px", fontWeight: 800, fontSize: 13 }}>{p.icon} {p.name_ar}</span>
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 700 }}>
                            {p.price_sdg === 0 ? <span style={{ color: "#6B7280" }}>مجاناً</span> : <span style={{ color: "#047857" }}>{p.price_sdg.toLocaleString()} ج.س</span>}
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "center" }}>{p.name === "free" ? "5/شهر" : "غير محدود"}</td>
                          <Tick v={p.name !== "free"} />
                          <Tick v={p.name !== "free"} />
                          <Tick v={["professional","premium"].includes(p.name)} />
                          <Tick v={["professional","premium"].includes(p.name)} />
                          <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 700, color: "#8B5CF6" }}>
                            {p.name === "free" ? "—" : `${p.name === "professional" ? "5" : p.name === "premium" ? "8" : "0"}%`}
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 700 }}>{p.subscribers}</td>
                          <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 700, color: "#047857" }}>
                            {p.monthly_revenue > 0 ? `${Number(p.monthly_revenue).toLocaleString()} ج.س` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* مميزات الخطط */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 0, borderTop: "1px solid #f3f4f6" }}>
                  {Object.entries(PLAN_FEATURES).map(([pname, feats]) => {
                    const p = stats.plans.find(x => x.name === pname);
                    return (
                      <div key={pname} style={{ padding: "14px 16px", borderLeft: "1px solid #f3f4f6" }}>
                        <div style={{ fontWeight: 700, color: p?.color || "#6B7280", marginBottom: 8, fontSize: 12 }}>{p?.icon} {p?.name_ar || pname}</div>
                        {feats.map(f => <div key={f} style={{ fontSize: 11, color: "#4b5563", marginBottom: 4 }}>✓ {f}</div>)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* جدول المحامين والاشتراكات */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, color: "#111827", fontSize: 15 }}>
              👤 المحامون واشتراكاتهم
            </div>
            {loading ? <p style={{ padding: 20 }}>جارِ التحميل…</p> : subs.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>لا يوجد بيانات</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["المحامي", "الخطة الحالية", "العمولة", "تاريخ الانتهاء", "العقود", "مرجع الدفع", "الإجراء"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#374151", whiteSpace: "nowrap", fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map(row => (
                      <tr key={row.lawyer_id} style={{ borderTop: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 600 }}>{row.full_name}</div>
                          <div style={{ color: "#9ca3af", fontSize: 11 }}>📞 {row.phone} · {row.district}</div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {row.plan_name ? (
                            <span style={{ background: (row.color || "#6B7280") + "22", color: row.color || "#6B7280", borderRadius: 12, padding: "3px 12px", fontWeight: 700, fontSize: 12 }}>
                              {row.icon} {row.plan_name_ar}
                            </span>
                          ) : <span style={{ color: "#9ca3af", fontSize: 12 }}>🔓 مجاني</span>}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#8B5CF6" }}>
                          {row.commission_pct ? `${row.commission_pct}%` : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                          {row.expires_at ? new Date(row.expires_at).toLocaleDateString("ar-SD") : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700 }}>{row.contracts_count}</td>
                        <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 11 }}>{row.payment_ref || "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <button onClick={() => openSubModal(row)} style={{
                            padding: "6px 14px", border: "1px solid #8B5CF6", background: "#fff", color: "#8B5CF6",
                            borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap",
                          }}>✏️ تعيين خطة</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── نافذة مراجعة طلب الانضمام ─── */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "min(95vw, 680px)", maxHeight: "90vh", overflowY: "auto", padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{selected.full_name}</h2>
                <span style={{ background: STATUS_COLOR[selected.status] + "22", color: STATUS_COLOR[selected.status], padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{STATUS_LABEL[selected.status]}</span>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#6b7280" }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px" }}>
              <Info label="المسمّى الوظيفي" value={selected.title} />
              <Info label="رقم النقابة" value={selected.bar_number} />
              <Info label="الهاتف" value={selected.phone} />
              <Info label="الخبرة" value={`${selected.experience_y} سنة`} />
              <Info label="الحي / المنطقة" value={selected.district} />
              <Info label="أتعاب الاستشارة" value={selected.consult_fee} />
              <Info label="اللغات" value={selected.languages} />
              <Info label="البريد الإلكتروني" value={selected.email || "—"} />
              <Info label="التخصصات" value={selected.specialties} block />
              {selected.office_addr && <Info label="العنوان" value={selected.office_addr} block />}
              {selected.bio && <Info label="نبذة مهنية" value={selected.bio} block />}
            </div>
            {selected.bar_card_url && (
              <div style={{ marginTop: 14 }}>
                <a href={selected.bar_card_url} target="_blank" rel="noopener noreferrer" style={{ color: "#8B5CF6", fontSize: 13, fontWeight: 600 }}>🔗 عرض بطاقة النقابة</a>
              </div>
            )}
            <div style={{ marginTop: 18 }}>
              <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>ملاحظة الإدارة (تظهر للمتقدّم):</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                placeholder="اكتب ملاحظة قبول أو سبب الرفض…"
                style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 13 }} />
            </div>
            {selected.status === "pending" && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                  <input type="checkbox" checked={feature} onChange={e => setFeature(e.target.checked)} />
                  ★ تمييز المحامي بعد القبول (يظهر في أعلى القائمة)
                </label>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <button onClick={reject} disabled={busy}
                    style={{ flex: 1, padding: 12, border: "1px solid #DC2626", background: "#fff", color: "#DC2626", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                    رفض الطلب
                  </button>
                  <button onClick={approve} disabled={busy}
                    style={{ flex: 2, padding: 12, border: "none", background: "#10B981", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
                    {busy ? "جارٍ…" : "✓ قبول وإنشاء ملف المحامي"}
                  </button>
                </div>
              </>
            )}
            {selected.status !== "pending" && (
              <div style={{ marginTop: 16, padding: 12, background: STATUS_COLOR[selected.status] + "11", borderRadius: 8, color: STATUS_COLOR[selected.status], fontWeight: 600, textAlign: "center" }}>
                هذا الطلب {STATUS_LABEL[selected.status]} — بتاريخ {selected.reviewed_at ? new Date(selected.reviewed_at).toLocaleDateString("ar-SD") : "—"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── نافذة تعيين الاشتراك ─── */}
      {subModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "min(95vw, 520px)", padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>💳 تعيين خطة اشتراك</h2>
              <button onClick={() => setSubModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#6b7280" }}>✕</button>
            </div>
            <div style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
              <div style={{ fontWeight: 700 }}>{subModal.full_name}</div>
              <div style={{ color: "#6b7280", fontSize: 12 }}>{subModal.phone} · {subModal.district}</div>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>الخطة</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {plans.map(p => (
                    <button key={p.name} onClick={() => setSubForm(f => ({ ...f, plan_name: p.name, commission_pct: String(p.commission_pct) }))}
                      style={{
                        padding: "10px 12px", borderRadius: 10, cursor: "pointer", textAlign: "right",
                        border: `2px solid ${subForm.plan_name === p.name ? p.color : "#e5e7eb"}`,
                        background: subForm.plan_name === p.name ? p.color + "15" : "#fff",
                      }}>
                      <div style={{ fontWeight: 700, color: p.color }}>{p.icon} {p.name_ar}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{p.price_label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>نسبة العمولة المتفق عليها (%)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" min="0" max="30" step="0.5" value={subForm.commission_pct}
                    onChange={e => setSubForm(f => ({ ...f, commission_pct: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} />
                  <span style={{ color: "#8B5CF6", fontWeight: 800, fontSize: 18 }}>%</span>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>نسبة العمولة التي يدفعها المحامي مقابل المميزات الإضافية</div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>تاريخ انتهاء الاشتراك (اختياري)</label>
                <input type="date" value={subForm.expires_at} onChange={e => setSubForm(f => ({ ...f, expires_at: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>مرجع الدفع / رقم الإيصال</label>
                <input type="text" value={subForm.payment_ref} onChange={e => setSubForm(f => ({ ...f, payment_ref: e.target.value }))}
                  placeholder="مثال: TRX-2026-00123"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>ملاحظة الإدارة</label>
                <textarea value={subForm.admin_note} onChange={e => setSubForm(f => ({ ...f, admin_note: e.target.value }))} rows={2}
                  placeholder="ملاحظة اختيارية…"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setSubModal(null)} style={{ flex: 1, padding: 12, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>إلغاء</button>
              <button onClick={saveSub} disabled={subBusy} style={{ flex: 2, padding: 12, border: "none", background: "#8B5CF6", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
                {subBusy ? "جارِ الحفظ…" : "✓ حفظ الاشتراك"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, on, onChange, color }: { label: string; on: boolean; onChange: () => void; color: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, color: on ? color : "#9ca3af" }}>
      <div onClick={onChange} style={{
        width: 28, height: 16, borderRadius: 8, background: on ? color : "#e5e7eb",
        position: "relative", transition: "background 0.2s", cursor: "pointer", flexShrink: 0,
      }}>
        <div style={{ position: "absolute", top: 2, left: on ? "auto" : 2, right: on ? 2 : "auto", width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "all 0.2s" }} />
      </div>
      {label}
    </label>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${color}33`, borderRadius: 12, padding: "14px 16px", borderRight: `4px solid ${color}` }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 22, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Tick({ v }: { v: boolean }) {
  return <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 16 }}>{v ? "✅" : "—"}</td>;
}

function Info({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div style={{ gridColumn: block ? "1 / -1" : undefined, marginTop: block ? 10 : 0 }}>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>{value}</div>
    </div>
  );
}
