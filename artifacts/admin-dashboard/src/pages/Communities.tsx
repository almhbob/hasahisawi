import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Community = {
  id: number; name: string; description?: string; category?: string;
  neighborhood?: string; services?: string; status: string;
  representative_name?: string; representative_phone?: string;
  member_count?: number; created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار الموافقة",
  active: "نشط",
  rejected: "مرفوض",
  suspended: "موقوف",
};
const STATUS_CLASS: Record<string, string> = {
  pending: "badge-yellow", active: "badge-green", rejected: "badge-red", suspended: "badge-red",
};

export default function Communities() {
  const [list,    setList]    = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<string>("all");
  const [search,  setSearch]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<any>("/admin/communities");
      setList(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: number, status: string) => {
    await apiFetch(`/admin/communities/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    setList(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا المجتمع؟")) return;
    await apiFetch(`/admin/communities/${id}`, { method: "DELETE" });
    setList(prev => prev.filter(c => c.id !== id));
  };

  const filtered = list.filter(c => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search && !c.name.includes(search) && !c.representative_name?.includes(search)) return false;
    return true;
  });

  const pending = list.filter(c => c.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="إدارة المجتمعات"
        subtitle={`${list.length} مجتمع${pending ? ` · ${pending} بانتظار الموافقة` : ""}`}
        action={
          <input className="input-field" style={{ width: 220, padding: "9px 14px" }}
            placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
        }
      />
      <div style={{ padding: "14px 28px 0", display: "flex", gap: 8 }}>
        {(["all","pending","active","rejected","suspended"] as const).map(f => {
          const labels: Record<string, string> = { all: "الكل", pending: "بانتظار", active: "نشطة", rejected: "مرفوضة", suspended: "موقوفة" };
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: "7px 16px", borderRadius: 20, border: "1px solid",
                borderColor: filter === f ? "hsl(147 60% 42% / 0.5)" : "hsl(217 32% 17%)",
                background: filter === f ? "hsl(147 60% 42% / 0.15)" : "transparent",
                color: filter === f ? "hsl(147 60% 52%)" : "hsl(215 20% 60%)",
                cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              }}
            >{labels[f]}</button>
          );
        })}
      </div>
      <div style={{ padding: "16px 28px 28px" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0" }}>جارٍ التحميل...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0" }}>لا توجد مجتمعات</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
            {filtered.map(c => (
              <div key={c.id} className="table-row" style={{ padding: "14px 20px", display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                  background: "hsl(147 60% 42% / 0.12)", border: "1px solid hsl(147 60% 42% / 0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                }}>🏘️</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "hsl(210 40% 93%)" }}>{c.name}</span>
                    <span className={STATUS_CLASS[c.status] || "badge-blue"} style={{ fontSize: 10 }}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                    {c.category && <span className="badge-blue" style={{ fontSize: 10 }}>{c.category}</span>}
                    {c.member_count !== undefined && <span style={{ fontSize: 11, color: "hsl(215 20% 50%)" }}>{c.member_count} عضو</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>
                    {c.representative_name ? `ممثل: ${c.representative_name}` : ""}
                    {c.representative_phone ? ` · ${c.representative_phone}` : ""}
                    {c.neighborhood ? ` · ${c.neighborhood}` : ""}
                  </div>
                  {c.description && <p style={{ fontSize: 12, color: "hsl(215 20% 60%)", lineHeight: 1.4, margin: "5px 0 0" }}>{c.description.slice(0, 100)}{c.description.length > 100 ? "..." : ""}</p>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                  {c.status !== "active" && (
                    <button onClick={() => setStatus(c.id, "active")}
                      style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid hsl(147 60% 42% / 0.4)", background: "hsl(147 60% 42% / 0.15)", color: "hsl(147 60% 52%)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                      ✓ قبول
                    </button>
                  )}
                  {c.status !== "rejected" && (
                    <button onClick={() => setStatus(c.id, "rejected")}
                      style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid hsl(0 72% 55% / 0.3)", background: "hsl(0 72% 55% / 0.12)", color: "hsl(0 72% 65%)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                      رفض
                    </button>
                  )}
                  {c.status === "active" && (
                    <button onClick={() => setStatus(c.id, "suspended")}
                      style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid hsl(38 90% 50% / 0.4)", background: "hsl(38 90% 50% / 0.12)", color: "hsl(38 90% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                      إيقاف
                    </button>
                  )}
                  <button className="btn-danger" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => remove(c.id)}>حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
