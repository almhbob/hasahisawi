import { useEffect, useState } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";
import { toast } from "sonner";

type RequestRow = {
  id: number;
  agency_name: string;
  agency_type: string;
  contact_name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  city?: string;
  country?: string;
  booking_products?: string[];
  destinations?: string[];
  status: "pending" | "approved" | "rejected" | "needs_info";
  created_at: string;
};

const C = {
  bg: "hsl(222 47% 8%)",
  card: "hsl(222 47% 11%)",
  border: "hsl(217 32% 18%)",
  text: "hsl(210 40% 92%)",
  muted: "hsl(215 20% 55%)",
  blue: "#0ea5e9",
  green: "#22c55e",
  red: "#ef4444",
  orange: "#f59e0b",
};

const statusLabel = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  needs_info: "تحتاج معلومات",
};

export default function TravelAgencyApplications() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiJson<{ applications: RequestRow[] }>("/admin/travel-agencies/applications");
      setRows(Array.isArray(data.applications) ? data.applications : []);
    } catch {
      toast.error("تعذر تحميل طلبات وكالات السفر");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function changeStatus(id: number, status: RequestRow["status"]) {
    try {
      await apiFetch(`/admin/travel-agencies/applications/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success("تم تحديث حالة الطلب");
      load();
    } catch {
      toast.error("تعذر تحديث الطلب");
    }
  }

  async function createAgency(id: number) {
    try {
      await apiFetch(`/admin/travel-agencies/applications/${id}/approve`, { method: "POST" });
      toast.success("تم إنشاء مساحة الوكالة");
      load();
    } catch {
      toast.error("تعذر إنشاء مساحة الوكالة");
    }
  }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <PageHeader
        title="طلبات وكالات السفر"
        subtitle="اعتماد الوكالات وتجهيز مساحات الحجوزات الخاصة بها"
        action={<button onClick={load} style={btn(C.blue)}>{loading ? "جاري التحميل..." : "تحديث"}</button>}
      />
      <main style={{ padding: 24, display: "grid", gap: 14 }}>
        {rows.length === 0 ? (
          <div style={card}>لا توجد طلبات حالياً</div>
        ) : rows.map(row => (
          <section key={row.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0 }}>{row.agency_name}</h3>
                  <span style={badge(row.status)}>{statusLabel[row.status]}</span>
                </div>
                <div style={{ color: C.muted, marginTop: 8, fontSize: 13 }}>
                  المسؤول: {row.contact_name || "—"} · التواصل: {row.whatsapp || row.phone || row.email || "—"} · الموقع: {[row.city, row.country].filter(Boolean).join(" - ") || "—"}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {(row.booking_products || []).map(x => <Chip key={x}>{x}</Chip>)}
                  {(row.destinations || []).slice(0, 4).map(x => <Chip key={x} color={C.orange}>{x}</Chip>)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                <button onClick={() => createAgency(row.id)} style={btn(C.green)}>اعتماد</button>
                <button onClick={() => changeStatus(row.id, "needs_info")} style={btn(C.blue)}>معلومات</button>
                <button onClick={() => changeStatus(row.id, "rejected")} style={btn(C.red)}>رفض</button>
              </div>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

function Chip({ children, color = C.green }: { children: React.ReactNode; color?: string }) {
  return <span style={{ color, border: `1px solid ${color}55`, background: color + "15", borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 800 }}>{children}</span>;
}
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 };
function btn(color: string): React.CSSProperties { return { background: color, color: "#fff", border: "none", borderRadius: 10, padding: "9px 12px", fontWeight: 800, cursor: "pointer" }; }
function badge(status: RequestRow["status"]): React.CSSProperties {
  const color = status === "approved" ? C.green : status === "rejected" ? C.red : status === "needs_info" ? C.blue : C.orange;
  return { color, background: color + "15", border: `1px solid ${color}55`, borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 900 };
}
