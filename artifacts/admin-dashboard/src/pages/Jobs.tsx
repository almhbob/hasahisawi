import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Job = {
  id: number; title: string; company: string;
  type: "fulltime" | "parttime" | "freelance" | "volunteer";
  location: string; description: string; contact_phone: string;
  salary?: string; is_active: boolean; author_name: string;
  created_at: string; user_name_ref?: string;
};

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  fulltime:  { label: "دوام كامل",   color: "#34d399", bg: "rgba(52,211,153,.12)"  },
  parttime:  { label: "دوام جزئي",   color: "#60a5fa", bg: "rgba(96,165,250,.12)"  },
  freelance: { label: "حر / مستقل",  color: "#fbbf24", bg: "rgba(251,191,36,.12)"  },
  volunteer: { label: "تطوع",         color: "#c084fc", bg: "rgba(192,132,252,.12)" },
};
const orange = "#f97316";

function TypeBadge({ type }: { type: string }) {
  const m = TYPE_META[type] ?? { label: type, color: "#94a3b8", bg: "rgba(148,163,184,.1)" };
  return <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.color}30` }}>{m.label}</span>;
}

export default function Jobs() {
  const [jobs,    setJobs]    = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<"all" | "active" | "inactive">("all");
  const [search,  setSearch]  = useState("");
  const [saving,  setSaving]  = useState<number | null>(null);

  // Add modal state
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", company: "", type: "fulltime", location: "الحصاحيصا", description: "", contact_phone: "", salary: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter !== "all" ? `?status=${filter}` : "";
      const data = await apiJson<Job[]>(`/admin/jobs${q}`);
      setJobs(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (job: Job) => {
    setSaving(job.id);
    await apiFetch(`/admin/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !job.is_active }) });
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, is_active: !j.is_active } : j));
    setSaving(null);
  };

  const deleteJob = async (id: number) => {
    if (!confirm("حذف هذا الإعلان الوظيفي نهائياً؟")) return;
    await apiFetch(`/admin/jobs/${id}`, { method: "DELETE" });
    setJobs(prev => prev.filter(j => j.id !== id));
  };

  const addJob = async () => {
    if (!form.title || !form.description) { alert("العنوان والوصف مطلوبان"); return; }
    setSubmitting(true);
    try {
      // Use admin token via apiFetch which sets auth header
      const res = await apiFetch("/jobs", { method: "POST", body: JSON.stringify(form) });
      const newJob = await res.json();
      setJobs(prev => [newJob, ...prev]);
      setShowAdd(false);
      setForm({ title: "", company: "", type: "fulltime", location: "الحصاحيصا", description: "", contact_phone: "", salary: "" });
    } catch { alert("حدث خطأ"); }
    setSubmitting(false);
  };

  const filtered = jobs.filter(j => {
    if (filter === "active" && !j.is_active) return false;
    if (filter === "inactive" && j.is_active) return false;
    if (search && !j.title.includes(search) && !j.company.includes(search) && !j.author_name.includes(search)) return false;
    return true;
  });

  const activeCount   = jobs.filter(j => j.is_active).length;
  const inactiveCount = jobs.filter(j => !j.is_active).length;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 10,
    border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 9%)",
    color: "hsl(210 40% 88%)", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
  };

  return (
    <div>
      <PageHeader
        title="إدارة الوظائف"
        subtitle={`${jobs.length} إعلان · ${activeCount} نشط · ${inactiveCount} معطّل`}
        action={
          <button onClick={() => setShowAdd(true)} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${orange},#ea580c)`, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>
            + إضافة وظيفة
          </button>
        }
      />

      {/* Filters */}
      <div style={{ padding: "14px 28px 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {([
            { key: "all",      label: `الكل (${jobs.length})` },
            { key: "active",   label: `نشط (${activeCount})` },
            { key: "inactive", label: `معطّل (${inactiveCount})` },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: "6px 14px", borderRadius: 20, border: "1px solid", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderColor: filter === f.key ? `${orange}60` : "hsl(217 32% 17%)",
              background:  filter === f.key ? `${orange}15` : "transparent",
              color:       filter === f.key ? orange : "hsl(215 20% 55%)",
            }}>{f.label}</button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالعنوان أو الشركة..."
          style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, width: 220 }} />
      </div>

      {/* Jobs Table */}
      <div style={{ padding: "16px 28px 28px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "70px 0", color: "hsl(215 20% 48%)" }}>جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 0", color: "hsl(215 20% 48%)", fontSize: 14 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💼</div>
            لا توجد وظائف في هذه الفئة
          </div>
        ) : (
          <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1.5fr 1fr 1fr 1fr 1.4fr", padding: "11px 20px", borderBottom: "1px solid hsl(217 32% 14%)", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 40%)", background: "hsl(222 47% 9%)" }}>
              <span>الوظيفة</span><span>الشركة · الموقع</span><span>النوع</span><span>الراتب</span><span>الحالة</span><span>الإجراءات</span>
            </div>
            {filtered.map(j => (
              <div key={j.id} style={{ display: "grid", gridTemplateColumns: "2.5fr 1.5fr 1fr 1fr 1fr 1.4fr", padding: "14px 20px", alignItems: "center", borderBottom: "1px solid hsl(217 32% 11%)", opacity: j.is_active ? 1 : 0.6 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(210 40% 90%)" }}>{j.title}</div>
                  <div style={{ fontSize: 11, color: "hsl(215 20% 48%)", marginTop: 2 }}>
                    {j.author_name} · {new Date(j.created_at).toLocaleDateString("ar")}
                  </div>
                  {j.contact_phone && <div style={{ fontSize: 11, color: "hsl(215 20% 45%)", marginTop: 1 }}>📞 {j.contact_phone}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "hsl(210 40% 80%)", fontWeight: 600 }}>{j.company || "—"}</div>
                  <div style={{ fontSize: 11, color: "hsl(215 20% 48%)", marginTop: 2 }}>📍 {j.location}</div>
                </div>
                <TypeBadge type={j.type} />
                <span style={{ fontSize: 12, color: j.salary ? "#fbbf24" : "hsl(215 20% 42%)" }}>{j.salary || "غير محدد"}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: j.is_active ? "#34d399" : "#f87171" }}>
                  {j.is_active ? "● نشط" : "○ معطّل"}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => toggleActive(j)} disabled={saving === j.id}
                    style={{ padding: "5px 11px", borderRadius: 8, border: `1px solid ${j.is_active ? "rgba(248,113,113,.3)" : "rgba(52,211,153,.3)"}`, background: j.is_active ? "rgba(248,113,113,.08)" : "rgba(52,211,153,.08)", color: j.is_active ? "#f87171" : "#34d399", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>
                    {saving === j.id ? "..." : j.is_active ? "تعطيل" : "تفعيل"}
                  </button>
                  <button onClick={() => deleteJob(j.id)}
                    style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid rgba(248,113,113,.25)", background: "rgba(248,113,113,.07)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Job Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={() => setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 20, padding: "28px 26px", width: 500, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "hsl(210 40% 92%)" }}>💼 إضافة إعلان وظيفي</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>العنوان الوظيفي *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="مثال: مدرس رياضيات" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>الشركة / الجهة</label>
                <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="اسم الشركة" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>نوع الوظيفة</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ ...inputStyle }}>
                  <option value="fulltime">دوام كامل</option>
                  <option value="parttime">دوام جزئي</option>
                  <option value="freelance">حر / مستقل</option>
                  <option value="volunteer">تطوع</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>الموقع</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="الحصاحيصا" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>رقم التواصل</label>
                <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+249..." style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>الراتب (اختياري)</label>
                <input value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} placeholder="مثال: ٣٠٠٠ جنيه" style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>الوصف الوظيفي *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="تفاصيل الوظيفة والمتطلبات..." rows={4}
                  style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 58%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
              <button onClick={addJob} disabled={submitting} style={{ flex: 1.5, padding: "11px", borderRadius: 12, border: "none", background: submitting ? "hsl(217 32% 18%)" : `linear-gradient(135deg,${orange},#ea580c)`, color: "#fff", cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>
                {submitting ? "جارٍ النشر..." : "نشر الوظيفة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
