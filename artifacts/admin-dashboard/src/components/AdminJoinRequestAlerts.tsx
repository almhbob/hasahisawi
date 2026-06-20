import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiJson } from "@/lib/api";

type EventItem = { id: number; event_type: string; title: string; body?: string; payload?: any; created_at: string };

export default function AdminJoinRequestAlerts() {
  const [, setLocation] = useLocation();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [hidden, setHidden] = useState(false);

  async function load() {
    try {
      const data = await apiJson<{ events: EventItem[] }>("/admin/attention-events");
      setEvents(Array.isArray(data.events) ? data.events.filter(e => e.event_type === "join_request") : []);
    } catch {}
  }

  useEffect(() => {
    load();
    const id = window.setInterval(load, 12_000);
    return () => window.clearInterval(id);
  }, []);

  if (hidden || !events.length) return null;

  return (
    <div dir="rtl" style={{ position: "fixed", top: 118, left: 18, zIndex: 9998, width: 360, maxWidth: "calc(100vw - 32px)", borderRadius: 20, background: "linear-gradient(145deg, rgba(30,41,59,.98), rgba(15,23,42,.98))", border: "1px solid rgba(56,189,248,.55)", boxShadow: "0 20px 55px rgba(56,189,248,.18)", color: "#f8fafc", overflow: "hidden" }}>
      <div style={{ padding: "13px 14px", borderBottom: "1px solid rgba(148,163,184,.18)", display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ width: 42, height: 42, borderRadius: 15, background: "rgba(56,189,248,.16)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🗂️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>طلبات انضمام جديدة</div>
          <div style={{ fontSize: 12, color: "#cbd5e1" }}>يوجد {events.length} طلب يحتاج مراجعة وأرشفة</div>
        </div>
        <button onClick={() => setHidden(true)} style={{ border: 0, borderRadius: 11, background: "rgba(148,163,184,.16)", color: "#e2e8f0", padding: "7px 9px", cursor: "pointer" }}>إخفاء</button>
      </div>
      <div style={{ padding: 12, display: "grid", gap: 8 }}>
        {events.slice(0, 3).map(e => (
          <button key={e.id} onClick={() => setLocation("/applications-archive")} style={{ border: "1px solid rgba(148,163,184,.16)", background: "rgba(15,23,42,.45)", borderRadius: 14, padding: 10, textAlign: "right", color: "#f8fafc", cursor: "pointer" }}>
            <b style={{ fontSize: 13 }}>{e.title}</b>
            <div style={{ color: "#cbd5e1", marginTop: 5, fontSize: 12 }}>{e.body || "طلب جديد"}</div>
          </button>
        ))}
      </div>
      <div style={{ padding: "0 12px 13px" }}>
        <button onClick={() => setLocation("/applications-archive")} style={{ width: "100%", border: 0, borderRadius: 14, background: "#38bdf8", color: "#07111f", fontWeight: 900, padding: "10px 12px", cursor: "pointer" }}>فتح أرشيف الانضمام</button>
      </div>
    </div>
  );
}
