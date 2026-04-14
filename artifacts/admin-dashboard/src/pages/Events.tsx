import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Event = {
  id: number;
  title: string;
  type: string;
  description?: string;
  location: string;
  event_date: string;
  event_time?: string;
  organizer_name: string;
  contact_phone?: string;
  is_free: boolean;
  price?: number;
  capacity?: number;
  registered_count: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  cultural: "ثقافي", sports: "رياضي", social: "اجتماعي",
  educational: "تعليمي", religious: "ديني", charity: "خيري", other: "أخرى",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "معلّق", approved: "مقبول", rejected: "مرفوض",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(38 90% 55%)", approved: "hsl(147 60% 42%)", rejected: "hsl(0 70% 55%)",
};

export default function Events() {
  const [list,    setList]    = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<"all" | "pending" | "approved" | "rejected">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ events: Event[] }>("/admin/events");
      setList(Array.isArray(data) ? data : (data as any).events ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? list : list.filter(e => e.status === filter);

  const changeStatus = async (id: number, status: string) => {
    try {
      await apiFetch(`/admin/events/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setList(prev => prev.map(e => e.id === id ? { ...e, status: status as Event["status"] } : e));
    } catch {}
  };

  const deleteEvent = async (id: number) => {
    if (!confirm("حذف الفعالية؟")) return;
    try {
      await apiFetch(`/admin/events/${id}`, { method: "DELETE" });
      setList(prev => prev.filter(e => e.id !== id));
    } catch {}
  };

  const pending   = list.filter(e => e.status === "pending").length;
  const approved  = list.filter(e => e.status === "approved").length;

  return (
    <div>
      <PageHeader title="إدارة الفعاليات" subtitle="مراجعة وقبول فعاليات المدينة" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "إجمالي الفعاليات", value: list.length, color: "hsl(215 50% 60%)" },
          { label: "معلّقة", value: pending, color: "hsl(38 90% 55%)" },
          { label: "مقبولة", value: approved, color: "hsl(147 60% 42%)" },
        ].map(stat => (
          <div key={stat.label} style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 13, color: "hsl(215 20% 55%)", marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["all", "pending", "approved", "rejected"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid",
              borderColor: filter === f ? "hsl(147 60% 42%)" : "hsl(217 32% 14%)",
              background: filter === f ? "hsl(147 60% 42% / 0.15)" : "transparent",
              color: filter === f ? "hsl(147 60% 42%)" : "hsl(215 20% 55%)",
              cursor: "pointer", fontSize: 13,
            }}
          >{f === "all" ? "الكل" : STATUS_LABELS[f]}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>لا توجد فعاليات</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(ev => (
            <div key={ev.id} style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 6, fontWeight: 600,
                      background: STATUS_COLORS[ev.status] + "22",
                      color: STATUS_COLORS[ev.status], border: `1px solid ${STATUS_COLORS[ev.status]}44`,
                    }}>{STATUS_LABELS[ev.status]}</span>
                    <span style={{ fontSize: 11, color: "hsl(215 20% 55%)", background: "hsl(217 32% 14%)", padding: "3px 10px", borderRadius: 6 }}>
                      {TYPE_LABELS[ev.type] || ev.type}
                    </span>
                    {!ev.is_free && <span style={{ fontSize: 11, color: "hsl(38 90% 55%)" }}>💰 {ev.price} جنيه</span>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 95%)", marginBottom: 4 }}>{ev.title}</div>
                  <div style={{ fontSize: 13, color: "hsl(215 20% 55%)", marginBottom: 4 }}>📍 {ev.location} &nbsp;|&nbsp; 📅 {ev.event_date}</div>
                  <div style={{ fontSize: 13, color: "hsl(215 20% 55%)" }}>👤 {ev.organizer_name}</div>
                  {ev.description && <div style={{ fontSize: 13, color: "hsl(215 20% 65%)", marginTop: 8 }}>{ev.description}</div>}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {ev.status !== "approved" && (
                    <button onClick={() => changeStatus(ev.id, "approved")} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid hsl(147 60% 42% / 0.4)", background: "hsl(147 60% 42% / 0.15)", color: "hsl(147 60% 42%)", cursor: "pointer", fontSize: 13 }}>
                      ✅ قبول
                    </button>
                  )}
                  {ev.status !== "rejected" && (
                    <button onClick={() => changeStatus(ev.id, "rejected")} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid hsl(38 90% 55% / 0.4)", background: "hsl(38 90% 55% / 0.15)", color: "hsl(38 90% 55%)", cursor: "pointer", fontSize: 13 }}>
                      ⛔ رفض
                    </button>
                  )}
                  <button onClick={() => deleteEvent(ev.id)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid hsl(0 70% 55% / 0.4)", background: "hsl(0 70% 55% / 0.12)", color: "hsl(0 70% 55%)", cursor: "pointer", fontSize: 13 }}>
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
