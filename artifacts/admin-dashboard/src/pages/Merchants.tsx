import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Merchant = {
  id: number; shop_name: string; owner_name: string;
  phone?: string; whatsapp?: string; address?: string;
  category: string; description?: string;
  is_approved: boolean; is_verified: boolean; is_featured: boolean;
  logo_emoji: string; created_at: string; tags?: string[];
};

export default function Merchants() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<"all" | "pending" | "approved">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ merchants: Merchant[] }>("/admin/merchants");
      setMerchants(Array.isArray(data?.merchants) ? data.merchants : Array.isArray(data) ? data as unknown as Merchant[] : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (id: number, patch: Record<string, boolean>) => {
    await apiFetch(`/admin/merchants/${id}`, { method: "PUT", body: JSON.stringify(patch) });
    setMerchants(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا التاجر؟")) return;
    await apiFetch(`/admin/merchants/${id}`, { method: "DELETE" });
    setMerchants(prev => prev.filter(m => m.id !== id));
  };

  const filtered = merchants.filter(m => {
    if (filter === "pending"  && m.is_approved)  return false;
    if (filter === "approved" && !m.is_approved) return false;
    if (search && !m.shop_name.includes(search) && !m.owner_name.includes(search)) return false;
    return true;
  });

  const pending = merchants.filter(m => !m.is_approved).length;

  return (
    <div>
      <PageHeader
        title="إدارة التجار"
        subtitle={`${merchants.length} تاجر · ${pending} بانتظار الموافقة`}
        action={
          <input className="input-field" style={{ width: 220, padding: "9px 14px" }}
            placeholder="بحث عن متجر..." value={search} onChange={e => setSearch(e.target.value)} />
        }
      />

      {/* Filter tabs */}
      <div style={{ padding: "14px 28px 0", display: "flex", gap: 8 }}>
        {(["all","pending","approved"] as const).map(f => {
          const labels = { all: "الكل", pending: "بانتظار الموافقة", approved: "مفعّلة" };
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
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0", fontSize: 15 }}>جارٍ التحميل...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0", fontSize: 14 }}>لا توجد متاجر</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
            {filtered.map(m => (
              <div key={m.id} className="table-row" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                  background: "hsl(217 32% 17%)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
                }}>{m.logo_emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "hsl(210 40% 93%)" }}>{m.shop_name}</span>
                    {m.is_verified && <span className="badge-purple" style={{ fontSize: 10 }}>✓ موثّق</span>}
                    {m.is_featured && <span className="badge-yellow" style={{ fontSize: 10 }}>⭐ مميّز</span>}
                    <span className={m.is_approved ? "badge-green" : "badge-yellow"} style={{ fontSize: 10 }}>
                      {m.is_approved ? "مفعّل" : "بانتظار"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>
                    {m.owner_name}{m.phone ? ` · ${m.phone}` : ""}{m.address ? ` · ${m.address}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                  <button
                    onClick={() => update(m.id, { is_approved: !m.is_approved })}
                    style={{
                      padding: "6px 12px", borderRadius: 9, border: "1px solid",
                      borderColor: m.is_approved ? "hsl(217 32% 22%)" : "hsl(147 60% 42% / 0.4)",
                      background: m.is_approved ? "transparent" : "hsl(147 60% 42% / 0.15)",
                      color: m.is_approved ? "hsl(215 20% 55%)" : "hsl(147 60% 52%)",
                      cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                    }}
                  >{m.is_approved ? "إلغاء التفعيل" : "تفعيل"}</button>
                  <button
                    onClick={() => update(m.id, { is_verified: !m.is_verified })}
                    style={{
                      padding: "6px 12px", borderRadius: 9, border: "1px solid",
                      borderColor: m.is_verified ? "hsl(217 32% 22%)" : "hsl(270 91% 65% / 0.4)",
                      background: m.is_verified ? "transparent" : "hsl(270 91% 65% / 0.12)",
                      color: m.is_verified ? "hsl(215 20% 55%)" : "hsl(270 91% 75%)",
                      cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                    }}
                  >{m.is_verified ? "إلغاء التوثيق" : "توثيق"}</button>
                  <button
                    onClick={() => update(m.id, { is_featured: !m.is_featured })}
                    style={{
                      padding: "6px 12px", borderRadius: 9, border: "1px solid",
                      borderColor: m.is_featured ? "hsl(38 90% 50% / 0.4)" : "hsl(217 32% 22%)",
                      background: m.is_featured ? "hsl(38 90% 50% / 0.12)" : "transparent",
                      color: m.is_featured ? "hsl(38 90% 60%)" : "hsl(215 20% 55%)",
                      cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                    }}
                  >{m.is_featured ? "✦ مميّز" : "تمييز"}</button>
                  <button className="btn-danger" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => remove(m.id)}>حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
