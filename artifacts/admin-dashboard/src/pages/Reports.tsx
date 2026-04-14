import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Report = {
  id: number;
  title?: string;
  description: string;
  type?: string;
  category?: string;
  location?: string;
  location_lat?: number;
  location_lng?: number;
  image_url?: string;
  status: string;
  priority?: string;
  user_id?: number;
  reporter_name?: string;
  contact_phone?: string;
  created_at: string;
  updated_at?: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "معلّق", reviewing: "قيد المراجعة", resolved: "محلول", rejected: "مرفوض",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(38 90% 55%)", reviewing: "hsl(215 70% 60%)",
  resolved: "hsl(147 60% 42%)", rejected: "hsl(0 70% 55%)",
};
const PRIORITY_LABELS: Record<string, string> = {
  low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة",
};

export default function Reports() {
  const [list,    setList]    = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<Report[]>("/admin/reports");
      setList(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? list : list.filter(r => r.status === filter);

  const changeStatus = async (id: number, status: string) => {
    try {
      await apiFetch(`/reports/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setList(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch {}
  };

  const deleteReport = async (id: number) => {
    if (!confirm("حذف هذا البلاغ؟")) return;
    try {
      await apiFetch(`/admin/reports/${id}`, { method: "DELETE" });
      setList(prev => prev.filter(r => r.id !== id));
    } catch {}
  };

  const counts: Record<string, number> = { all: list.length };
  list.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

  return (
    <div>
      <PageHeader title="بلاغات المواطنين" subtitle="متابعة ومعالجة البلاغات والشكاوى" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {Object.entries(STATUS_LABELS).map(([s, label]) => (
          <div key={s} style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: STATUS_COLORS[s] }}>{counts[s] || 0}</div>
            <div style={{ fontSize: 12, color: "hsl(215 20% 55%)", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["all", "الكل"], ...Object.entries(STATUS_LABELS)].map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid", fontSize: 12, cursor: "pointer",
              borderColor: filter === k ? STATUS_COLORS[k] || "hsl(147 60% 42%)" : "hsl(217 32% 14%)",
              background: filter === k ? (STATUS_COLORS[k] || "hsl(147 60% 42%)" ) + "22" : "transparent",
              color: filter === k ? STATUS_COLORS[k] || "hsl(147 60% 42%)" : "hsl(215 20% 55%)" }}>
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>لا توجد بلاغات</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(r => (
            <div key={r.id} style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, fontWeight: 600,
                      background: STATUS_COLORS[r.status] + "22", color: STATUS_COLORS[r.status],
                      border: `1px solid ${STATUS_COLORS[r.status]}44` }}>{STATUS_LABELS[r.status] || r.status}</span>
                    {r.priority && r.priority !== "low" && (
                      <span style={{ fontSize: 11, background: "hsl(0 70% 55% / 0.15)", color: "hsl(0 70% 65%)", padding: "3px 10px", borderRadius: 6 }}>
                        {PRIORITY_LABELS[r.priority]}
                      </span>
                    )}
                    {r.category && <span style={{ fontSize: 11, background: "hsl(217 32% 14%)", color: "hsl(215 20% 55%)", padding: "3px 10px", borderRadius: 6 }}>{r.category}</span>}
                  </div>
                  {r.title && <div style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 95%)", marginBottom: 4 }}>{r.title}</div>}
                  <div style={{ fontSize: 13, color: "hsl(215 20% 65%)", marginBottom: 4 }}>{r.description}</div>
                  {r.location && <div style={{ fontSize: 12, color: "hsl(215 20% 45%)" }}>📍 {r.location}</div>}
                  {r.reporter_name && <div style={{ fontSize: 12, color: "hsl(215 20% 45%)", marginTop: 2 }}>👤 {r.reporter_name} {r.contact_phone && `| 📞 ${r.contact_phone}`}</div>}
                  <div style={{ fontSize: 11, color: "hsl(215 20% 35%)", marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString("ar-SD")}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {r.status !== "reviewing" && <button onClick={() => changeStatus(r.id, "reviewing")} style={btnStyle("hsl(215 70% 60%)")}>مراجعة</button>}
                    {r.status !== "resolved" && <button onClick={() => changeStatus(r.id, "resolved")} style={btnStyle("hsl(147 60% 42%)")}>حُلّ</button>}
                    {r.status !== "rejected" && <button onClick={() => changeStatus(r.id, "rejected")} style={btnStyle("hsl(38 90% 55%)")}>رفض</button>}
                  </div>
                  <button onClick={() => deleteReport(r.id)} style={btnStyle("hsl(0 70% 55%)")}>🗑️ حذف</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function btnStyle(color: string) {
  return {
    padding: "6px 12px", borderRadius: 8, border: `1px solid ${color}44`,
    background: color + "18", color: color, cursor: "pointer" as const, fontSize: 12,
  };
}
