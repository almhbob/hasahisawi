import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type PhoneShop = {
  id: number; shop_name: string; owner_name: string;
  phone?: string; whatsapp?: string; address?: string;
  specialties?: string[]; description?: string;
  is_approved: boolean; is_verified: boolean; is_featured: boolean;
  logo_emoji: string; created_at: string; total_products?: number;
};

export default function PhoneShops() {
  const [shops,   setShops]   = useState<PhoneShop[]>([]);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<"all" | "pending" | "approved">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ shops: PhoneShop[] }>("/admin/phone-shops");
      setShops(Array.isArray(data?.shops) ? data.shops : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (id: number, patch: Record<string, boolean>) => {
    await apiFetch(`/admin/phone-shops/${id}`, { method: "PUT", body: JSON.stringify(patch) });
    setShops(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا المتجر؟")) return;
    await apiFetch(`/admin/phone-shops/${id}`, { method: "DELETE" });
    setShops(prev => prev.filter(s => s.id !== id));
  };

  const filtered = shops.filter(s => {
    if (filter === "pending"  && s.is_approved)  return false;
    if (filter === "approved" && !s.is_approved) return false;
    if (search && !s.shop_name.includes(search) && !s.owner_name.includes(search)) return false;
    return true;
  });

  const pending = shops.filter(s => !s.is_approved).length;

  return (
    <div>
      <PageHeader
        title="إدارة محلات الهواتف"
        subtitle={`${shops.length} متجر · ${pending} بانتظار الموافقة`}
        action={
          <input className="input-field" style={{ width: 220, padding: "9px 14px" }}
            placeholder="بحث عن متجر..." value={search} onChange={e => setSearch(e.target.value)} />
        }
      />
      <div style={{ padding: "14px 28px 0", display: "flex", gap: 8 }}>
        {(["all","pending","approved"] as const).map(f => {
          const labels = { all: "الكل", pending: "بانتظار الموافقة", approved: "مفعّلة" };
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: "7px 16px", borderRadius: 20, border: "1px solid",
                borderColor: filter === f ? "hsl(270 91% 65% / 0.5)" : "hsl(217 32% 17%)",
                background: filter === f ? "hsl(270 91% 65% / 0.12)" : "transparent",
                color: filter === f ? "hsl(270 91% 75%)" : "hsl(215 20% 60%)",
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
            {filtered.map(s => (
              <div key={s.id} className="table-row" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                  background: "hsl(270 91% 65% / 0.12)", border: "1px solid hsl(270 91% 65% / 0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
                }}>{s.logo_emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "hsl(210 40% 93%)" }}>{s.shop_name}</span>
                    {s.is_verified && <span className="badge-purple" style={{ fontSize: 10 }}>✓ موثّق</span>}
                    {s.is_featured && <span className="badge-yellow" style={{ fontSize: 10 }}>⭐ مميّز</span>}
                    <span className={s.is_approved ? "badge-green" : "badge-yellow"} style={{ fontSize: 10 }}>
                      {s.is_approved ? "مفعّل" : "بانتظار"}
                    </span>
                    {s.total_products !== undefined && (
                      <span className="badge-blue" style={{ fontSize: 10 }}>{s.total_products} منتج</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>
                    {s.owner_name}{s.phone ? ` · ${s.phone}` : ""}{s.address ? ` · ${s.address}` : ""}
                  </div>
                  {s.specialties && s.specialties.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                      {s.specialties.slice(0,4).map(sp => (
                        <span key={sp} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 9999, background: "hsl(270 91% 65% / 0.12)", color: "hsl(270 91% 72%)" }}>{sp}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                  <button
                    onClick={() => update(s.id, { is_approved: !s.is_approved })}
                    style={{
                      padding: "6px 12px", borderRadius: 9, border: "1px solid",
                      borderColor: s.is_approved ? "hsl(217 32% 22%)" : "hsl(147 60% 42% / 0.4)",
                      background: s.is_approved ? "transparent" : "hsl(147 60% 42% / 0.15)",
                      color: s.is_approved ? "hsl(215 20% 55%)" : "hsl(147 60% 52%)",
                      cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                    }}
                  >{s.is_approved ? "إلغاء التفعيل" : "تفعيل"}</button>
                  <button
                    onClick={() => update(s.id, { is_verified: !s.is_verified })}
                    style={{
                      padding: "6px 12px", borderRadius: 9, border: "1px solid",
                      borderColor: s.is_verified ? "hsl(217 32% 22%)" : "hsl(270 91% 65% / 0.4)",
                      background: s.is_verified ? "transparent" : "hsl(270 91% 65% / 0.12)",
                      color: s.is_verified ? "hsl(215 20% 55%)" : "hsl(270 91% 75%)",
                      cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                    }}
                  >{s.is_verified ? "إلغاء التوثيق" : "توثيق"}</button>
                  <button
                    onClick={() => update(s.id, { is_featured: !s.is_featured })}
                    style={{
                      padding: "6px 12px", borderRadius: 9, border: "1px solid",
                      borderColor: s.is_featured ? "hsl(38 90% 50% / 0.4)" : "hsl(217 32% 22%)",
                      background: s.is_featured ? "hsl(38 90% 50% / 0.12)" : "transparent",
                      color: s.is_featured ? "hsl(38 90% 60%)" : "hsl(215 20% 55%)",
                      cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                    }}
                  >{s.is_featured ? "✦ مميّز" : "تمييز"}</button>
                  <button className="btn-danger" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => remove(s.id)}>حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
