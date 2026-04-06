import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Driver = {
  id: number; name: string; phone: string; vehicle_type: string;
  vehicle_desc?: string; plate?: string; area?: string;
  status: string; admin_note?: string; is_online: boolean;
  rating?: number; total_trips?: number; created_at: string;
  user_name_ref?: string;
};

const VEHICLE_ICONS: Record<string, string> = {
  car: "🚗", motorcycle: "🏍️", tuk_tuk: "🛺", pickup: "🛻", bus: "🚌",
};

const STATUS_LABEL: Record<string, string> = { pending: "بانتظار الموافقة", approved: "مقبول", rejected: "مرفوض" };
const STATUS_CLASS: Record<string, string> = { pending: "badge-yellow", approved: "badge-green", rejected: "badge-red" };

export default function Transport() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<any>("/admin/transport/drivers");
      setDrivers(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: number, status: string, admin_note?: string) => {
    await apiFetch(`/admin/transport/drivers/${id}`, { method: "PATCH", body: JSON.stringify({ status, admin_note }) });
    setDrivers(prev => prev.map(d => d.id === id ? { ...d, status, ...(admin_note ? { admin_note } : {}) } : d));
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا السائق؟")) return;
    await apiFetch(`/admin/transport/drivers/${id}`, { method: "DELETE" });
    setDrivers(prev => prev.filter(d => d.id !== id));
  };

  const pending = drivers.filter(d => d.status === "pending").length;

  const filtered = drivers.filter(d => {
    if (filter !== "all" && d.status !== filter) return false;
    if (search && !d.name.includes(search) && !d.phone.includes(search)) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="إدارة مشوارك علينا"
        subtitle={`${drivers.length} سائق مسجّل${pending ? ` · ${pending} بانتظار الموافقة` : ""}`}
        action={
          <input className="input-field" style={{ width: 220, padding: "9px 14px" }}
            placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} />
        }
      />
      <div style={{ padding: "14px 28px 0", display: "flex", gap: 8 }}>
        {(["all","pending","approved","rejected"] as const).map(f => {
          const labels: Record<string, string> = { all: "الكل", pending: "بانتظار", approved: "مقبول", rejected: "مرفوض" };
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: "7px 16px", borderRadius: 20, border: "1px solid",
                borderColor: filter === f ? "hsl(25 90% 55% / 0.5)" : "hsl(217 32% 17%)",
                background: filter === f ? "hsl(25 90% 55% / 0.12)" : "transparent",
                color: filter === f ? "hsl(25 90% 65%)" : "hsl(215 20% 60%)",
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
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0" }}>لا يوجد سائقون في هذه الفئة</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
            {filtered.map(d => (
              <div key={d.id} className="table-row" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                  background: "hsl(25 90% 55% / 0.12)", border: "1px solid hsl(25 90% 55% / 0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                }}>
                  {VEHICLE_ICONS[d.vehicle_type] ?? "🚗"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "hsl(210 40% 93%)" }}>{d.name}</span>
                    <span className={STATUS_CLASS[d.status] || "badge-blue"} style={{ fontSize: 10 }}>
                      {STATUS_LABEL[d.status] || d.status}
                    </span>
                    {d.is_online && <span className="badge-green" style={{ fontSize: 10 }}>● متصل</span>}
                    {d.rating ? <span style={{ fontSize: 11, color: "hsl(38 90% 60%)" }}>⭐ {d.rating}</span> : null}
                    {d.total_trips ? <span style={{ fontSize: 11, color: "hsl(215 20% 55%)" }}>{d.total_trips} رحلة</span> : null}
                  </div>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>
                    {d.phone}
                    {d.vehicle_desc ? ` · ${d.vehicle_desc}` : ""}
                    {d.area ? ` · ${d.area}` : ""}
                    {d.plate ? ` · ${d.plate}` : ""}
                  </div>
                  {d.admin_note && <div style={{ fontSize: 11, color: "hsl(0 72% 60%)", marginTop: 2 }}>ملاحظة: {d.admin_note}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                  {d.status !== "approved" && (
                    <button onClick={() => setStatus(d.id, "approved")}
                      style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid hsl(147 60% 42% / 0.4)", background: "hsl(147 60% 42% / 0.15)", color: "hsl(147 60% 52%)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                      ✓ قبول
                    </button>
                  )}
                  {d.status !== "rejected" && (
                    <button onClick={() => setStatus(d.id, "rejected")}
                      style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid hsl(0 72% 55% / 0.3)", background: "hsl(0 72% 55% / 0.12)", color: "hsl(0 72% 65%)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                      رفض
                    </button>
                  )}
                  <button className="btn-danger" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => remove(d.id)}>حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
