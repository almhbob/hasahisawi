import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiJson, apiFetch } from "@/lib/api";

const orange = "#f97316";
const green  = "#3EFF9C";
const red    = "#f87171";

type Specialist = {
  id: number; name: string; specialty: string; bio: string | null;
  clinic: string | null; phone: string | null; fees: string | null;
  is_active: boolean; order_num: number; created_at: string;
};

type Groups = Record<string, Specialist[]>;

const SPECIALTIES: Record<string, string> = {
  "طب وصحة الأطفال": "👶",
  "الباطنية": "🫀",
  "طب وجراحة الأسنان": "🦷",
  "جراحة الأطفال والعيوب الخلقية": "🔬",
  "جراحة العظام والإصابات": "🦴",
  "المختبر الطبي": "🧪",
};
const specialtyIcon = (s: string) => SPECIALTIES[s] || "🩺";

// ─ Modal إضافة طبيب ─────────────────────────────────────
function AddDoctorModal({ clinicName, onClose, onAdded }: { clinicName: string; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    name: "", specialty: "طب وصحة الأطفال", bio: "", phone: "", fees: "", order_num: "0", clinic: clinicName
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const f = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr("الاسم مطلوب"); return; }
    setSaving(true); setErr("");
    try {
      const r = await apiFetch("/specialists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, order_num: Number(form.order_num) || 0 })
      });
      const d = await r.json();
      if (d.specialist) {
        // إخفاؤه تلقائياً ضمن المستوصف نفسه إذا كان المستوصف مخفياً
        await apiFetch(`/admin/specialists/${d.specialist.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false })
        });
        onAdded();
      } else setErr(d.error || "فشل الحفظ");
    } catch { setErr("خطأ في الاتصال"); }
    setSaving(false);
  };

  const inputStyle = {
    width: "100%", background: "hsl(217 32% 14%)", border: "1px solid hsl(217 32% 20%)",
    borderRadius: 10, padding: "10px 12px", color: "hsl(210 40% 92%)", fontSize: 13,
    outline: "none", boxSizing: "border-box" as const
  };
  const labelStyle = { fontSize: 11, color: "hsl(215 20% 48%)", marginBottom: 5, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 20, padding: "28px 32px", width: 520, maxHeight: "90vh", overflowY: "auto", zIndex: 1 }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 800, color: "hsl(210 40% 94%)" }}>➕ إضافة طبيب جديد</h2>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>الاسم الكامل *</label>
          <input style={inputStyle} value={form.name} onChange={e => f("name")(e.target.value)} placeholder="د. الاسم هنا" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>التخصص</label>
          <select style={{ ...inputStyle, cursor: "pointer" }} value={form.specialty} onChange={e => f("specialty")(e.target.value)}>
            {["طب وصحة الأطفال","الباطنية","طب وجراحة الأسنان","جراحة الأطفال والعيوب الخلقية","جراحة العظام والإصابات","المختبر الطبي","طب عام","نسائية وتوليد","عيون","أنف وأذن وحنجرة","أمراض جلدية","أخرى"].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>السيرة / المؤهلات</label>
          <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={form.bio} onChange={e => f("bio")(e.target.value)} placeholder="المؤهلات والخبرات..." />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>رقم الهاتف</label>
            <input style={inputStyle} value={form.phone} onChange={e => f("phone")(e.target.value)} placeholder="09xxxxxxxx" />
          </div>
          <div>
            <label style={labelStyle}>رسوم الكشف</label>
            <input style={inputStyle} value={form.fees} onChange={e => f("fees")(e.target.value)} placeholder="مثال: 500 جنيه" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>اسم المستوصف</label>
            <input style={inputStyle} value={form.clinic} onChange={e => f("clinic")(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>رقم الترتيب</label>
            <input style={inputStyle} type="number" value={form.order_num} onChange={e => f("order_num")(e.target.value)} />
          </div>
        </div>
        {err && <div style={{ color: red, fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: "11px 0", background: `linear-gradient(135deg,${orange},#ef4444)`, border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "جارٍ الحفظ..." : "💾 إضافة الطبيب"}
          </button>
          <button onClick={onClose} style={{ padding: "11px 24px", background: "hsl(217 32% 16%)", border: "none", borderRadius: 12, color: "hsl(215 20% 60%)", cursor: "pointer", fontSize: 14 }}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

// ─ صفحة الإدارة الرئيسية ──────────────────────────────
export default function MedicalClinics() {
  const [groups, setGroups]             = useState<Groups>({});
  const [loading, setLoading]           = useState(true);
  const [toggling, setToggling]         = useState<number | string | null>(null);
  const [showAddModal, setShowAddModal] = useState<string | null>(null);
  const [expandedClinics, setExpandedClinics] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const d = await apiJson<{ groups: Groups }>("/admin/specialists");
      setGroups(d.groups || {});
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleClinic = async (clinicName: string, currentActive: boolean) => {
    setToggling(clinicName);
    try {
      await apiFetch("/admin/specialists/clinic-toggle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinic: clinicName, is_active: !currentActive })
      });
      await load();
    } finally { setToggling(null); }
  };

  const toggleDoctor = async (id: number, currentActive: boolean) => {
    setToggling(id);
    try {
      await apiFetch(`/admin/specialists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentActive })
      });
      await load();
    } finally { setToggling(null); }
  };

  const deleteDoctor = async (id: number, name: string) => {
    if (!confirm(`هل أنت متأكد من حذف "${name}"؟`)) return;
    try {
      await apiFetch(`/admin/specialists/${id}`, { method: "DELETE" });
      await load();
    } catch {}
  };

  const toggleExpand = (name: string) => {
    setExpandedClinics(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const clinicNames = Object.keys(groups).sort();
  const totalDoctors = Object.values(groups).flat().length;
  const activeDoctors = Object.values(groups).flat().filter(s => s.is_active).length;

  return (
    <div>
      <PageHeader
        title="الدليل الطبي والمستوصفات"
        subtitle="إدارة الأطباء والمستوصفات وإظهار أو إخفاء خدماتها في التطبيق"
      />

      <div style={{ padding: "20px 28px 48px" }}>
        {/* ── KPIs ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10, marginBottom: 24 }}>
          {[
            { label: "إجمالي المستوصفات", value: clinicNames.length, icon: "🏥", color: orange },
            { label: "إجمالي الأطباء",    value: totalDoctors,       icon: "🩺", color: "#60a5fa" },
            { label: "خدمات مفعّلة",      value: activeDoctors,      icon: "✅", color: green },
            { label: "خدمات مخفية",       value: totalDoctors - activeDoctors, icon: "🔒", color: "#fbbf24" },
          ].map(k => (
            <div key={k.label} style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: k.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{k.icon}</div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: "hsl(215 20% 48%)", marginTop: 3 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "hsl(215 20% 46%)" }}>⏳ جارٍ التحميل...</div>
        ) : clinicNames.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏥</div>
            <div style={{ color: "hsl(215 20% 46%)", fontSize: 15 }}>لا توجد مستوصفات أو أطباء بعد</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {clinicNames.map(clinicName => {
              const doctors = groups[clinicName] || [];
              const allActive = doctors.every(d => d.is_active);
              const anyActive = doctors.some(d => d.is_active);
              const expanded  = expandedClinics.has(clinicName);
              const isTogglingClinic = toggling === clinicName;

              return (
                <div key={clinicName} style={{ background: "hsl(222 47% 10%)", border: `1px solid ${anyActive ? orange + "40" : "hsl(217 32% 14%)"}`, borderRadius: 18, overflow: "hidden" }}>
                  {/* رأس المستوصف */}
                  <div style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 14 }}>
                    {/* شعار */}
                    <div style={{ width: 50, height: 50, borderRadius: 14, background: anyActive ? orange + "20" : "hsl(217 32% 16%)", border: `1.5px solid ${anyActive ? orange + "50" : "hsl(217 32% 20%)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🏥</div>

                    {/* اسم المستوصف */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "hsl(210 40% 94%)", marginBottom: 4 }}>{clinicName}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "hsl(215 20% 48%)" }}>{doctors.length} طبيب</span>
                        <span style={{ fontSize: 11, color: anyActive ? green : "hsl(215 20% 44%)" }}>
                          {anyActive ? `• ${doctors.filter(d => d.is_active).length} نشط` : "• مخفي بالكامل"}
                        </span>
                      </div>
                    </div>

                    {/* أزرار */}
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      {/* زر إضافة طبيب */}
                      <button
                        onClick={() => setShowAddModal(clinicName)}
                        style={{ padding: "7px 14px", background: "hsl(217 32% 18%)", border: "1px solid hsl(217 32% 24%)", borderRadius: 10, color: "hsl(210 40% 78%)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                      >➕ طبيب</button>

                      {/* زر التوسيع */}
                      <button
                        onClick={() => toggleExpand(clinicName)}
                        style={{ padding: "7px 14px", background: "hsl(217 32% 18%)", border: "1px solid hsl(217 32% 24%)", borderRadius: 10, color: "hsl(210 40% 78%)", fontSize: 12, cursor: "pointer" }}
                      >{expanded ? "▲ إخفاء" : "▼ عرض الأطباء"}</button>

                      {/* زر تفعيل/إخفاء الكل */}
                      <button
                        onClick={() => toggleClinic(clinicName, allActive)}
                        disabled={isTogglingClinic}
                        style={{
                          padding: "7px 18px", borderRadius: 10, cursor: isTogglingClinic ? "wait" : "pointer",
                          fontWeight: 700, fontSize: 13,
                          background: allActive ? red + "20" : green + "20",
                          color: allActive ? red : green,
                          borderStyle: "solid", borderWidth: 1,
                          borderColor: allActive ? red + "40" : green + "40"
                        }}
                      >
                        {isTogglingClinic ? "..." : allActive ? "🔒 إخفاء الكل" : "👁 إظهار الكل"}
                      </button>
                    </div>
                  </div>

                  {/* قائمة الأطباء (قابلة للطي) */}
                  {expanded && (
                    <div style={{ borderTop: "1px solid hsl(217 32% 14%)" }}>
                      {doctors.map((doc, idx) => (
                        <div
                          key={doc.id}
                          style={{
                            padding: "14px 22px",
                            display: "flex", alignItems: "center", gap: 14,
                            borderBottom: idx < doctors.length - 1 ? "1px solid hsl(217 32% 12%)" : "none",
                            background: doc.is_active ? "hsl(222 47% 11%)" : "transparent"
                          }}
                        >
                          {/* أيقونة التخصص */}
                          <div style={{ width: 40, height: 40, borderRadius: 12, background: "hsl(217 32% 16%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                            {specialtyIcon(doc.specialty)}
                          </div>

                          {/* بيانات الطبيب */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: doc.is_active ? "hsl(210 40% 92%)" : "hsl(215 20% 50%)" }}>{doc.name}</div>
                            <div style={{ fontSize: 11, color: "hsl(215 20% 42%)", marginTop: 2 }}>{doc.specialty}</div>
                            {doc.bio && <div style={{ fontSize: 11, color: "hsl(215 20% 38%)", marginTop: 2 }}>{doc.bio}</div>}
                          </div>

                          {/* معلومات إضافية */}
                          <div style={{ textAlign: "center", minWidth: 90 }}>
                            {doc.phone && <div style={{ fontSize: 11, color: "#60a5fa", direction: "ltr" }}>{doc.phone}</div>}
                            {doc.fees  && <div style={{ fontSize: 10, color: "hsl(215 20% 42%)", marginTop: 2 }}>{doc.fees}</div>}
                          </div>

                          {/* حالة الظهور */}
                          <div style={{ width: 70, textAlign: "center" }}>
                            <span style={{
                              display: "inline-block", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                              background: doc.is_active ? green + "18" : red + "18",
                              color: doc.is_active ? green : red
                            }}>
                              {doc.is_active ? "ظاهر" : "مخفي"}
                            </span>
                          </div>

                          {/* أزرار التحكم */}
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={() => toggleDoctor(doc.id, doc.is_active)}
                              disabled={toggling === doc.id}
                              title={doc.is_active ? "إخفاء هذا الطبيب" : "إظهار هذا الطبيب"}
                              style={{
                                width: 34, height: 34, borderRadius: 9, border: "none", cursor: toggling === doc.id ? "wait" : "pointer",
                                background: doc.is_active ? red + "18" : green + "18",
                                color: doc.is_active ? red : green, fontSize: 16
                              }}
                            >
                              {toggling === doc.id ? "..." : doc.is_active ? "🔒" : "👁"}
                            </button>
                            <button
                              onClick={() => deleteDoctor(doc.id, doc.name)}
                              title="حذف"
                              style={{ width: 34, height: 34, borderRadius: 9, border: "none", cursor: "pointer", background: "hsl(217 32% 16%)", color: "hsl(215 20% 50%)", fontSize: 16 }}
                            >🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── إشعار ملاحظة ── */}
        <div style={{ marginTop: 24, padding: "14px 18px", background: `${orange}10`, border: `1px solid ${orange}30`, borderRadius: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>💡</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "hsl(210 40% 88%)", marginBottom: 4 }}>كيفية إظهار خدمات مستوصف</div>
            <div style={{ fontSize: 12, color: "hsl(215 20% 52%)", lineHeight: 1.7 }}>
              اضغط "إظهار الكل" بجانب اسم المستوصف لتفعيل جميع أطبائه دفعةً واحدة، أو افتح القائمة وفعّل كل طبيب على حدة.
              التغييرات تظهر فوراً في تطبيق الجوال.
            </div>
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddDoctorModal
          clinicName={showAddModal}
          onClose={() => setShowAddModal(null)}
          onAdded={() => { setShowAddModal(null); load(); }}
        />
      )}
    </div>
  );
}
