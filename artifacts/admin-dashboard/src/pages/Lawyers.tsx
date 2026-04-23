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
};

const STATUS_LABEL: Record<string,string> = { pending:"قيد المراجعة", approved:"مقبول", rejected:"مرفوض" };
const STATUS_COLOR: Record<string,string> = { pending:"#F59E0B", approved:"#10B981", rejected:"#EF4444" };

export default function Lawyers() {
  const [tab, setTab] = useState<"applications" | "active">("applications");
  const [apps, setApps] = useState<Application[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"" | "pending" | "approved" | "rejected">("pending");
  const [selected, setSelected] = useState<Application | null>(null);
  const [note, setNote] = useState("");
  const [feature, setFeature] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<any>(`/admin/lawyer-applications${filter ? `?status=${filter}` : ""}`);
      setApps(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, [filter]);

  const loadLawyers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<any>("/admin/lawyers");
      setLawyers(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "applications") loadApps(); else loadLawyers();
  }, [tab, loadApps, loadLawyers]);

  const approve = async () => {
    if (!selected) return;
    if (!confirm(`قبول طلب ${selected.full_name}؟ سيتم إنشاء ملف المحامي تلقائياً.`)) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/admin/lawyer-applications/${selected.id}/approve`, {
        method: "POST", body: JSON.stringify({ admin_note: note, is_featured: feature }),
      });
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
      const r = await apiFetch(`/admin/lawyer-applications/${selected.id}/reject`, {
        method: "POST", body: JSON.stringify({ admin_note: note }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || "فشل الرفض"); }
      else { setSelected(null); setNote(""); loadApps(); }
    } finally { setBusy(false); }
  };

  const toggleField = async (l: Lawyer, field: "is_featured" | "is_verified" | "is_active") => {
    await apiFetch(`/admin/lawyers/${l.id}`, { method: "PATCH", body: JSON.stringify({ [field]: !l[field] }) });
    setLawyers(prev => prev.map(x => x.id === l.id ? { ...x, [field]: !l[field] } : x));
  };

  const remove = async (l: Lawyer) => {
    if (!confirm(`حذف المحامي "${l.full_name}" نهائياً؟ سيُحذف معه كل عقوده وخدماته.`)) return;
    await apiFetch(`/admin/lawyers/${l.id}`, { method: "DELETE" });
    setLawyers(prev => prev.filter(x => x.id !== l.id));
  };

  const pendingCount = apps.filter(a => a.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="المحامون والخدمات القانونية"
        subtitle={tab === "applications"
          ? `${apps.length} طلب${pendingCount ? ` · ${pendingCount} قيد المراجعة` : ""}`
          : `${lawyers.length} محامي مسجّل`}
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
        <button onClick={() => setTab("applications")}
          style={{
            padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
            borderBottom: tab === "applications" ? "2px solid #8B5CF6" : "2px solid transparent",
            color: tab === "applications" ? "#8B5CF6" : "#6B7280", fontWeight: 600,
          }}>
          📥 طلبات الانضمام {pendingCount > 0 && <span style={{ background: "#F59E0B", color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 11, marginRight: 6 }}>{pendingCount}</span>}
        </button>
        <button onClick={() => setTab("active")}
          style={{
            padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
            borderBottom: tab === "active" ? "2px solid #8B5CF6" : "2px solid transparent",
            color: tab === "active" ? "#8B5CF6" : "#6B7280", fontWeight: 600,
          }}>
          ⚖️ المحامون المتعاقدون
        </button>
      </div>

      {/* APPLICATIONS */}
      {tab === "applications" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[["","الكل"],["pending","قيد المراجعة"],["approved","مقبول"],["rejected","مرفوض"]].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v as any)}
                style={{
                  padding: "6px 14px", borderRadius: 16, cursor: "pointer", fontSize: 13,
                  border: `1px solid ${filter === v ? "#8B5CF6" : "#e5e7eb"}`,
                  background: filter === v ? "#8B5CF6" : "#fff",
                  color: filter === v ? "#fff" : "#374151",
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
                        <span style={{
                          background: STATUS_COLOR[a.status] + "22", color: STATUS_COLOR[a.status],
                          padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                        }}>{STATUS_LABEL[a.status]}</span>
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>{a.title} · {a.specialties}</div>
                      <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>
                        📞 {a.phone} · 🆔 {a.bar_number} · ⏱ {a.experience_y} سنة
                      </div>
                      {a.admin_note && a.status !== "pending" && (
                        <div style={{ marginTop: 8, padding: 8, background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#4b5563" }}>
                          💬 {a.admin_note}
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setSelected(a); setNote(a.admin_note || ""); setFeature(false); }}
                      style={{ padding: "8px 14px", background: "#8B5CF6", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                      مراجعة
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ACTIVE LAWYERS */}
      {tab === "active" && (
        <>
          {loading ? <p>جارِ التحميل…</p> : lawyers.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>لا يوجد محامون</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {lawyers.map(l => (
                <div key={l.id} style={{
                  border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fff",
                  opacity: l.is_active ? 1 : 0.55,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong style={{ fontSize: 15 }}>{l.full_name}</strong>
                        {l.is_verified && <span style={{ color: "#10B981" }}>✓</span>}
                        {l.is_featured && <span style={{ background: "#FBBF2422", color: "#B45309", padding: "1px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>مميّز</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{l.title}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                        📞 {l.phone} · 📍 {l.district || "—"} · 🤝 {l.contracts_count} عقد
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => toggleField(l, "is_featured")}
                        style={{ padding: "6px 10px", fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", background: l.is_featured ? "#FBBF2422" : "#fff", color: l.is_featured ? "#B45309" : "#6B7280" }}>
                        {l.is_featured ? "★ مميّز" : "☆ تمييز"}
                      </button>
                      <button onClick={() => toggleField(l, "is_active")}
                        style={{ padding: "6px 10px", fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", background: l.is_active ? "#10B98122" : "#fff", color: l.is_active ? "#047857" : "#6B7280" }}>
                        {l.is_active ? "● نشط" : "○ موقوف"}
                      </button>
                      <button onClick={() => remove(l)}
                        style={{ padding: "6px 10px", fontSize: 11, border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", background: "#fff", color: "#DC2626" }}>
                        🗑 حذف
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* REVIEW MODAL */}
      {selected && (
        <div onClick={() => setSelected(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 14, maxWidth: 640, width: "100%",
            maxHeight: "90vh", overflowY: "auto", padding: 24,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: "#8B5CF6" }}>مراجعة طلب انضمام</h2>
              <button onClick={() => setSelected(null)} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af" }}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, marginBottom: 14 }}>
              <Info label="الاسم"        value={selected.full_name} />
              <Info label="المسمّى"       value={selected.title} />
              <Info label="الهاتف"        value={selected.phone} />
              <Info label="واتساب"        value={selected.whatsapp || "—"} />
              <Info label="البريد"        value={selected.email || "—"} />
              <Info label="رقم النقابة"   value={selected.bar_number} />
              <Info label="الخبرة"        value={`${selected.experience_y} سنة`} />
              <Info label="اللغات"        value={selected.languages} />
              <Info label="الحي"          value={selected.district || "—"} />
              <Info label="رسوم الاستشارة" value={selected.consult_fee || "—"} />
            </div>

            <Info label="التخصصات" value={selected.specialties} block />
            <Info label="العنوان"  value={selected.office_addr || "—"} block />
            {selected.bio && <Info label="نبذة" value={selected.bio} block />}

            {selected.bar_card_url && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>كرت النقابة:</div>
                <a href={selected.bar_card_url} target="_blank" rel="noreferrer"
                   style={{ color: "#8B5CF6", fontSize: 12, wordBreak: "break-all" }}>{selected.bar_card_url}</a>
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
    </div>
  );
}

function Info({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div style={{ gridColumn: block ? "1 / -1" : undefined, marginTop: block ? 10 : 0 }}>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>{value}</div>
    </div>
  );
}
