import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type LostItem = {
  id: number;
  item_name: string;
  description: string;
  last_seen: string;
  contact_phone: string;
  image_url?: string;
  status: "lost" | "found";
  category: "person" | "animal" | "object" | "other";
  reporter_name?: string;
  user_display_name?: string;
  created_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  person: "شخص",
  animal: "حيوان",
  object: "غرض",
  other: "أخرى",
};

const EMPTY = {
  item_name: "",
  description: "",
  last_seen: "",
  contact_phone: "",
  image_url: "",
  status: "lost" as const,
  category: "person" as const,
  reporter_name: "",
};

export default function Missing() {
  const [list,     setList]     = useState<LostItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<"all" | "lost" | "found">("all");
  const [form,     setForm]     = useState<typeof EMPTY>({ ...EMPTY });
  const [editing,  setEditing]  = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ items: LostItem[] }>("/admin/lost-items");
      const items = Array.isArray(data) ? data : (data as any).items ?? [];
      setList(items);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = list.filter(i => filter === "all" ? true : i.status === filter);
  const lostCount  = list.filter(i => i.status === "lost").length;
  const foundCount = list.filter(i => i.status === "found").length;

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setShowForm(true);
  };

  const openEdit = (item: LostItem) => {
    setEditing(item.id);
    setForm({
      item_name: item.item_name || "",
      description: item.description || "",
      last_seen: item.last_seen || "",
      contact_phone: item.contact_phone || "",
      image_url: item.image_url || "",
      status: item.status || "lost",
      category: item.category || "person",
      reporter_name: item.reporter_name || item.user_display_name || "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.item_name.trim() || !form.contact_phone.trim()) {
      alert("الاسم ورقم التواصل مطلوبان");
      return;
    }
    setSaving(true);
    try {
      if (editing !== null) {
        const res = await apiFetch(`/admin/lost-items/${editing}`, {
          method: "PATCH",
          body: JSON.stringify({
            item_name: form.item_name,
            description: form.description,
            last_seen: form.last_seen,
            contact_phone: form.contact_phone,
            image_url: form.image_url || undefined,
            status: form.status,
            category: form.category,
            reporter_name: form.reporter_name || undefined,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          alert((d as any).error || "فشل التعديل");
        } else {
          setShowForm(false);
          load();
        }
      } else {
        const res = await apiFetch("/lost-items", {
          method: "POST",
          body: JSON.stringify({
            item_name: form.item_name,
            description: form.description,
            last_seen: form.last_seen,
            contact_phone: form.contact_phone,
            image_url: form.image_url || undefined,
            category: form.category,
            reporter_name: form.reporter_name || undefined,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          alert((d as any).error || "فشل الإضافة");
        } else {
          setShowForm(false);
          load();
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا البلاغ نهائياً؟")) return;
    const res = await apiFetch(`/admin/lost-items/${id}`, { method: "DELETE" });
    if (res.ok) setList(prev => prev.filter(i => i.id !== id));
    else alert("فشل الحذف");
  };

  const toggleStatus = async (item: LostItem) => {
    const newStatus = item.status === "found" ? "lost" : "found";
    const res = await apiFetch(`/admin/lost-items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) setList(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i));
    else alert("فشل تغيير الحالة");
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: "hsl(217 32% 12%)", border: "1px solid hsl(217 32% 18%)",
    color: "hsl(210 40% 95%)", fontSize: 14,
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 12, color: "hsl(215 20% 55%)", marginBottom: 5, fontWeight: 600,
  };

  return (
    <div>
      <PageHeader
        title="إدارة المفقودات"
        subtitle={`${lostCount} لا يزال مفقوداً · ${foundCount} تم العثور عليه`}
        action={<button className="btn-primary" onClick={openNew}>+ إضافة بلاغ</button>}
      />

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["all", "lost", "found"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "7px 18px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: "1px solid",
              borderColor: filter === f ? "#F97316" : "hsl(217 32% 18%)",
              background: filter === f ? "hsl(24 95% 53% / 0.12)" : "transparent",
              color: filter === f ? "#F97316" : "hsl(215 20% 55%)",
            }}
          >
            {f === "all" ? `الكل (${list.length})` : f === "lost" ? `مفقود (${lostCount})` : `تم العثور (${foundCount})`}
          </button>
        ))}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 50, padding: 20,
        }}>
          <div style={{
            background: "hsl(222 47% 9%)", borderRadius: 16, padding: 28,
            width: "100%", maxWidth: 560, border: "1px solid hsl(217 32% 14%)",
            maxHeight: "90vh", overflowY: "auto",
          }}>
            <h3 style={{ margin: "0 0 20px", color: "hsl(210 40% 95%)", fontSize: 17, fontWeight: 700 }}>
              {editing !== null ? "تعديل البلاغ" : "بلاغ مفقود جديد"}
            </h3>
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>الاسم / وصف الغرض *</label>
                  <input style={inputStyle} value={form.item_name} onChange={e => setForm(p => ({ ...p, item_name: e.target.value }))} placeholder="اسم الشخص أو الغرض" />
                </div>
                <div>
                  <label style={labelStyle}>التصنيف</label>
                  <select style={inputStyle} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as any }))}>
                    <option value="person">شخص</option>
                    <option value="animal">حيوان</option>
                    <option value="object">غرض</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>الوصف</label>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="وصف مفصّل..." />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>آخر موقع شُوهد فيه</label>
                  <input style={inputStyle} value={form.last_seen} onChange={e => setForm(p => ({ ...p, last_seen: e.target.value }))} placeholder="الحي / المنطقة" />
                </div>
                <div>
                  <label style={labelStyle}>رقم التواصل *</label>
                  <input style={inputStyle} value={form.contact_phone} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} placeholder="09xxxxxxxx" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>المُبلِّغ</label>
                  <input style={inputStyle} value={form.reporter_name} onChange={e => setForm(p => ({ ...p, reporter_name: e.target.value }))} placeholder="اسم المُبلِّغ" />
                </div>
                {editing !== null && (
                  <div>
                    <label style={labelStyle}>الحالة</label>
                    <select style={inputStyle} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))}>
                      <option value="lost">مفقود</option>
                      <option value="found">تم العثور عليه</option>
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>رابط الصورة</label>
                <input style={inputStyle} value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} placeholder="https://..." />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{
                padding: "8px 20px", borderRadius: 8, border: "1px solid hsl(217 32% 18%)",
                background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer",
              }}>إلغاء</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? "جارٍ الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "hsl(215 20% 55%)" }}>جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 40%)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div>لا توجد بلاغات</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map(item => (
            <div key={item.id} style={{
              background: "hsl(217 32% 10%)", borderRadius: 12, padding: "16px 20px",
              border: `1px solid ${item.status === "found" ? "hsl(147 60% 42% / 0.3)" : "hsl(217 32% 14%)"}`,
              display: "flex", gap: 16, alignItems: "flex-start",
            }}>
              {item.image_url && (
                <img src={item.image_url} alt="" style={{
                  width: 64, height: 64, borderRadius: 10, objectFit: "cover", flexShrink: 0,
                  border: "1px solid hsl(217 32% 18%)",
                }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "hsl(210 40% 95%)", fontSize: 15 }}>{item.item_name}</span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 700,
                    background: item.status === "found" ? "hsl(147 60% 42% / 0.15)" : "hsl(0 72% 55% / 0.15)",
                    color: item.status === "found" ? "#3EFF9C" : "#f87171",
                  }}>
                    {item.status === "found" ? "✓ تم العثور عليه" : "مفقود"}
                  </span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 9999, fontSize: 11,
                    background: "hsl(217 32% 14%)", color: "hsl(215 20% 55%)",
                  }}>
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </span>
                </div>
                {item.description && (
                  <div style={{ color: "hsl(215 20% 60%)", fontSize: 13, marginBottom: 4, lineHeight: 1.5 }}>{item.description}</div>
                )}
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "hsl(215 20% 45%)", flexWrap: "wrap" }}>
                  {item.last_seen && <span>📍 {item.last_seen}</span>}
                  <span>📞 {item.contact_phone}</span>
                  {(item.reporter_name || item.user_display_name) && <span>👤 {item.reporter_name || item.user_display_name}</span>}
                  <span>🗓 {new Date(item.created_at).toLocaleDateString("ar-SD")}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, flexDirection: "column" }}>
                <button
                  onClick={() => toggleStatus(item)}
                  style={{
                    padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                    border: "1px solid",
                    borderColor: item.status === "found" ? "hsl(147 60% 42% / 0.4)" : "hsl(217 32% 22%)",
                    background: item.status === "found" ? "hsl(147 60% 42% / 0.1)" : "hsl(217 32% 14%)",
                    color: item.status === "found" ? "#3EFF9C" : "hsl(215 20% 65%)",
                  }}
                >
                  {item.status === "found" ? "✓ وُجد" : "تحديد كوُجد"}
                </button>
                <button onClick={() => openEdit(item)} style={{
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                  border: "1px solid hsl(217 32% 22%)", background: "hsl(217 32% 14%)", color: "hsl(215 20% 65%)",
                }}>تعديل</button>
                <button onClick={() => remove(item.id)} style={{
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                  border: "1px solid hsl(0 72% 55% / 0.3)", background: "hsl(0 72% 55% / 0.08)", color: "#f87171",
                }}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
