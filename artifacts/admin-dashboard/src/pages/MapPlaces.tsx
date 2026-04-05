import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Place = {
  id: number; name: string; category: string; address?: string;
  phone?: string; lat: number; lng: number; icon: string; color: string;
};

const CATS = ["طبي","مدارس","سوق","مساجد","معالم","صيدليات","حكومي","بنوك","رياضة","ثقافة","وقود"];

const EMPTY: Partial<Place> = { name: "", category: "معالم", address: "", phone: "", lat: 15.55, lng: 32.53, icon: "📍", color: "#27AE68" };

export default function MapPlaces() {
  const [places,  setPlaces]  = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState<Partial<Place>>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm,setShowForm]= useState(false);
  const [search,  setSearch]  = useState("");
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<Place[]>("/map/places");
      setPlaces(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name || !form.category) return alert("الاسم والفئة مطلوبان");
    setSaving(true);
    try {
      if (editing !== null) {
        const res = await apiFetch(`/map/places/${editing}`, {
          method: "PUT", body: JSON.stringify(form),
        });
        const d = await res.json();
        setPlaces(prev => prev.map(p => p.id === editing ? d : p));
      } else {
        const res = await apiFetch("/map/places", { method: "POST", body: JSON.stringify(form) });
        const d = await res.json();
        setPlaces(prev => [...prev, d]);
      }
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY);
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا المكان؟")) return;
    await apiFetch(`/map/places/${id}`, { method: "DELETE" });
    setPlaces(prev => prev.filter(p => p.id !== id));
  };

  const filtered = places.filter(p =>
    !search || p.name.includes(search) || p.category.includes(search) || p.address?.includes(search)
  );

  const ICONS = ["📍","🏥","🕌","🏪","🏫","💊","🏛️","🏦","⚽","🎭","⛽","🏨","🌿","🌊"];

  return (
    <div>
      <PageHeader
        title="إدارة خريطة المدينة"
        subtitle={`${places.length} مكان مسجّل`}
        action={
          <div style={{ display: "flex", gap: 10 }}>
            <input className="input-field" style={{ width: 200, padding: "9px 14px" }}
              placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
            <button className="btn-primary" onClick={() => { setEditing(null); setForm(EMPTY); setShowForm(true); }}>
              + إضافة مكان
            </button>
          </div>
        }
      />

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{ margin: "20px 28px", background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(147 60% 42% / 0.3)", padding: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 90%)", marginBottom: 20, marginTop: 0 }}>
            {editing !== null ? "تعديل المكان" : "إضافة مكان جديد"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "الاسم *", key: "name", type: "text" },
              { label: "العنوان", key: "address", type: "text" },
              { label: "الهاتف", key: "phone", type: "text" },
              { label: "خط العرض (lat)", key: "lat", type: "number" },
              { label: "خط الطول (lng)", key: "lng", type: "number" },
              { label: "اللون", key: "color", type: "color" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>{f.label}</label>
                <input
                  type={f.type} value={(form as any)[f.key] ?? ""} step="any"
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: f.type === "number" ? parseFloat(e.target.value) : e.target.value }))}
                  className="input-field"
                  style={f.type === "color" ? { height: 42, padding: "4px 8px", cursor: "pointer" } : {}}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>الفئة *</label>
              <select value={form.category ?? "معالم"} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                style={{ width: "100%", background: "hsl(217 32% 12%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 10, padding: "10px 14px", fontSize: 14, color: "hsl(210 40% 85%)", fontFamily: "inherit" }}>
                {CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>الأيقونة</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ICONS.map(ic => (
                  <button key={ic} onClick={() => setForm(prev => ({ ...prev, icon: ic }))}
                    style={{
                      width: 36, height: 36, borderRadius: 10, fontSize: 18,
                      background: form.icon === ic ? "hsl(147 60% 42% / 0.2)" : "hsl(217 32% 14%)",
                      border: `2px solid ${form.icon === ic ? "hsl(147 60% 42% / 0.5)" : "hsl(217 32% 20%)"}`,
                      cursor: "pointer",
                    }}
                  >{ic}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</button>
            <button onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY); }}
              style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: "16px 28px 28px" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0" }}>جارٍ التحميل...</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {filtered.map(p => (
              <div key={p.id} style={{ background: "hsl(222 47% 10%)", borderRadius: 14, border: "1px solid hsl(217 32% 14%)", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: p.color + "22", border: `1.5px solid ${p.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                    {p.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "hsl(210 40% 93%)" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "hsl(215 20% 55%)" }}>{p.category}{p.address ? ` · ${p.address}` : ""}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "hsl(215 20% 45%)", marginBottom: 12 }}>
                  📍 {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                  {p.phone && ` · 📞 ${p.phone}`}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setEditing(p.id); setForm({ ...p }); setShowForm(true); }}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 9, border: "1px solid hsl(217 32% 22%)", background: "transparent", color: "hsl(215 20% 70%)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                    تعديل
                  </button>
                  <button className="btn-danger" style={{ padding: "7px 14px" }} onClick={() => remove(p.id)}>حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
