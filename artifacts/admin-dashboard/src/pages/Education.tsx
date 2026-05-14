import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Institution = {
  id: number; name: string; type: string; address: string; phone: string;
  principal?: string; email?: string; website?: string; description?: string;
  grades?: string; shifts?: string; services: string[]; status: string;
  is_active: boolean; created_at: string;
};
type StudentReg = {
  id: number; reg_number: string; institution_name: string; grade: string;
  student_name: string; parent_name: string; parent_phone: string;
  status: string; admin_notes: string | null; created_at: string;
};
type StudentTrf = {
  id: number; transfer_number: string; from_institution_name: string;
  to_institution_name: string; student_name: string; parent_phone: string;
  transfer_reason: string; status: string; admin_notes: string | null; created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  primary: "أساسي", secondary: "ثانوي", kindergarten: "رياض أطفال",
  university: "جامعي", institute: "معهد", training: "تدريب",
  quran: "قرآن كريم", private: "خاص", other: "أخرى",
};
const SVC_LABELS: Record<string, string> = {
  results: "نتائج", enrollment: "تسجيل", transfer: "نقل", library: "مكتبة",
  tutoring: "دروس خاصة", scholarship: "منح", activity: "أنشطة", textbooks: "كتب",
  guidance: "إرشاد", exam: "امتحانات", transport: "مواصلات", office: "مكتبة",
  quran: "حفظ قرآن", training: "تدريب",
};
const EMPTY = {
  name: "", type: "primary", address: "", phone: "", principal: "",
  email: "", website: "", description: "", grades: "", shifts: "",
  services: [] as string[], status: "active",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(38 90% 55%)", approved: "hsl(147 60% 42%)", rejected: "hsl(0 70% 55%)",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض",
};

type Tab = "institutions" | "registrations" | "transfers";

const card = { background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "16px 20px" };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "hsl(222 47% 6%)", color: "hsl(210 40% 95%)", fontSize: 14, boxSizing: "border-box" as const };
const labelStyle = { display: "block", fontSize: 13, color: "hsl(215 20% 55%)", marginBottom: 5 };
const btnBase = { padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, border: "1px solid transparent" };

export default function Education() {
  const [activeTab, setActiveTab] = useState<Tab>("institutions");

  // Institutions
  const [list,     setList]     = useState<Institution[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<number | null>(null);
  const [form,     setForm]     = useState<typeof EMPTY>({ ...EMPTY });
  const [saving,   setSaving]   = useState(false);

  // Registrations
  const [regs,       setRegs]       = useState<StudentReg[]>([]);
  const [regsLoad,   setRegsLoad]   = useState(false);
  const [regStatus,  setRegStatus]  = useState("all");

  // Transfers
  const [trfs,       setTrfs]       = useState<StudentTrf[]>([]);
  const [trfsLoad,   setTrfsLoad]   = useState(false);
  const [trfStatus,  setTrfStatus]  = useState("all");

  // Reg notes modal
  const [regNote, setRegNote] = useState<{ id: number; action: "approve" | "reject"; notes: string } | null>(null);
  const [trfNote, setTrfNote] = useState<{ id: number; action: "approve" | "reject"; notes: string } | null>(null);

  const loadInsts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ institutions: Institution[] }>("/admin/educational-institutions");
      setList((data as any).institutions ?? []);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadRegs = useCallback(async () => {
    setRegsLoad(true);
    try {
      const data = await apiJson<{ registrations: StudentReg[] }>(`/admin/education/registrations${regStatus !== "all" ? `?status=${regStatus}` : ""}`);
      setRegs(data.registrations ?? []);
    } catch {} finally { setRegsLoad(false); }
  }, [regStatus]);

  const loadTrfs = useCallback(async () => {
    setTrfsLoad(true);
    try {
      const data = await apiJson<{ transfers: StudentTrf[] }>(`/admin/education/transfers${trfStatus !== "all" ? `?status=${trfStatus}` : ""}`);
      setTrfs(data.transfers ?? []);
    } catch {} finally { setTrfsLoad(false); }
  }, [trfStatus]);

  useEffect(() => { loadInsts(); }, [loadInsts]);
  useEffect(() => { if (activeTab === "registrations") loadRegs(); }, [activeTab, loadRegs]);
  useEffect(() => { if (activeTab === "transfers") loadTrfs(); }, [activeTab, loadTrfs]);

  const openNew  = () => { setEditing(null); setForm({ ...EMPTY }); setShowForm(true); };
  const openEdit = (inst: Institution) => {
    setEditing(inst.id);
    setForm({ name: inst.name, type: inst.type, address: inst.address, phone: inst.phone,
      principal: inst.principal || "", email: inst.email || "", website: inst.website || "",
      description: inst.description || "", grades: inst.grades || "", shifts: inst.shifts || "",
      services: inst.services || [], status: inst.status || "active" });
    setShowForm(true);
  };

  const toggleSvc = (s: string) => setForm(p => ({
    ...p, services: p.services.includes(s) ? p.services.filter(x => x !== s) : [...p.services, s],
  }));

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) return alert("الاسم والهاتف مطلوبان");
    setSaving(true);
    try {
      if (editing !== null) {
        const updated = await apiJson<Institution>(`/admin/educational-institutions/${editing}`, { method: "PATCH", body: JSON.stringify(form) });
        setList(prev => prev.map(i => i.id === editing ? updated : i));
      } else {
        const created = await apiJson<Institution>("/admin/educational-institutions", { method: "POST", body: JSON.stringify(form) });
        setList(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { alert("حدث خطأ أثناء الحفظ"); }
    setSaving(false);
  };

  const deleteInst = async (id: number) => {
    if (!confirm("حذف هذه المؤسسة؟")) return;
    try {
      await apiFetch(`/admin/educational-institutions/${id}`, { method: "DELETE" });
      setList(prev => prev.filter(i => i.id !== id));
    } catch {}
  };

  const toggleActive = async (inst: Institution) => {
    try {
      const updated = await apiJson<Institution>(`/admin/educational-institutions/${inst.id}`, {
        method: "PATCH", body: JSON.stringify({ is_active: !inst.is_active }),
      });
      setList(prev => prev.map(i => i.id === inst.id ? updated : i));
    } catch {}
  };

  const updateRegStatus = async (id: number, status: string, notes: string) => {
    try {
      await apiJson(`/admin/education/registrations/${id}`, {
        method: "PATCH", body: JSON.stringify({ status, admin_notes: notes }),
      });
      setRegs(prev => prev.map(r => r.id === id ? { ...r, status, admin_notes: notes } : r));
      setRegNote(null);
    } catch { alert("خطأ في التحديث"); }
  };

  const updateTrfStatus = async (id: number, status: string, notes: string) => {
    try {
      await apiJson(`/admin/education/transfers/${id}`, {
        method: "PATCH", body: JSON.stringify({ status, admin_notes: notes }),
      });
      setTrfs(prev => prev.map(t => t.id === id ? { ...t, status, admin_notes: notes } : t));
      setTrfNote(null);
    } catch { alert("خطأ في التحديث"); }
  };

  const pendingRegs = regs.filter(r => r.status === "pending").length;
  const pendingTrfs = trfs.filter(t => t.status === "pending").length;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "institutions",  label: "المؤسسات التعليمية" },
    { key: "registrations", label: "طلبات التسجيل",   badge: pendingRegs },
    { key: "transfers",     label: "طلبات النقل",      badge: pendingTrfs },
  ];

  const tabStyle = (active: boolean) => ({
    padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
    fontWeight: active ? 700 : 400, fontSize: 13,
    background: active ? "hsl(24 95% 56% / 0.15)" : "transparent",
    color: active ? "hsl(24 95% 56%)" : "hsl(215 20% 55%)",
    borderBottom: active ? "2px solid hsl(24 95% 56%)" : "2px solid transparent",
    transition: "all 0.15s",
  });

  return (
    <div>
      <PageHeader title="التعليم" subtitle="إدارة المؤسسات والاستمارات" />

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "إجمالي المؤسسات", value: list.length,                               color: "hsl(215 50% 60%)" },
          { label: "مؤسسات نشطة",    value: list.filter(i => i.is_active).length,       color: "hsl(147 60% 42%)" },
          { label: "طلبات تسجيل",    value: regs.length,                                color: "hsl(24 95% 56%)"  },
          { label: "طلبات نقل",      value: trfs.length,                                color: "hsl(270 60% 60%)" },
          { label: "قيد المراجعة",   value: (pendingRegs + pendingTrfs) || 0,            color: "hsl(38 90% 55%)"  },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: "16px 18px" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "hsl(215 20% 55%)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid hsl(217 32% 14%)", marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} style={tabStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            {t.label}
            {t.badge ? <span style={{ marginRight: 6, background: "hsl(0 70% 55%)", color: "#fff", fontSize: 10, padding: "1px 6px", borderRadius: 8, fontWeight: 700 }}>{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ── Institutions Tab ── */}
      {activeTab === "institutions" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button onClick={openNew} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "hsl(147 60% 42%)", color: "#000", fontWeight: 700, cursor: "pointer" }}>
              + إضافة مؤسسة
            </button>
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>جارٍ التحميل...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {list.map(inst => (
                <div key={inst.id} style={{ ...card, opacity: inst.is_active ? 1 : 0.55 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 95%)" }}>{inst.name}</span>
                        <span style={{ fontSize: 11, background: "hsl(217 32% 14%)", color: "hsl(215 20% 65%)", padding: "2px 8px", borderRadius: 6 }}>{TYPE_LABELS[inst.type] || inst.type}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "hsl(215 20% 55%)" }}>📍 {inst.address} &nbsp;|&nbsp; 📞 {inst.phone}</div>
                      {inst.principal && <div style={{ fontSize: 12, color: "hsl(215 20% 45%)", marginTop: 2 }}>👤 {inst.principal}</div>}
                      {inst.services?.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          {inst.services.slice(0, 5).map(s => (
                            <span key={s} style={{ fontSize: 11, background: "hsl(215 50% 50% / 0.12)", color: "hsl(215 60% 65%)", padding: "2px 8px", borderRadius: 6 }}>{SVC_LABELS[s] || s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => toggleActive(inst)} style={{ ...btnBase, background: "hsl(222 47% 12%)", color: "hsl(215 20% 65%)", border: "1px solid hsl(217 32% 20%)" }}>
                        {inst.is_active ? "⏸ إيقاف" : "▶ تفعيل"}
                      </button>
                      <button onClick={() => openEdit(inst)} style={{ ...btnBase, background: "hsl(38 90% 55% / 0.12)", color: "hsl(38 90% 55%)", border: "1px solid hsl(38 90% 55% / 0.4)" }}>✏️ تعديل</button>
                      <button onClick={() => deleteInst(inst.id)} style={{ ...btnBase, background: "hsl(0 70% 55% / 0.12)", color: "hsl(0 70% 55%)", border: "1px solid hsl(0 70% 55% / 0.4)" }}>🗑️ حذف</button>
                    </div>
                  </div>
                </div>
              ))}
              {list.length === 0 && <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>لا توجد مؤسسات</div>}
            </div>
          )}
        </>
      )}

      {/* ── Registrations Tab ── */}
      {activeTab === "registrations" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {(["all", "pending", "approved", "rejected"] as const).map(st => (
              <button key={st} onClick={() => setRegStatus(st)}
                style={{ ...btnBase, padding: "6px 14px",
                  background: regStatus === st ? "hsl(24 95% 56% / 0.15)" : "hsl(222 47% 9%)",
                  color: regStatus === st ? "hsl(24 95% 56%)" : "hsl(215 20% 55%)",
                  border: `1px solid ${regStatus === st ? "hsl(24 95% 56% / 0.5)" : "hsl(217 32% 14%)"}` }}>
                {st === "all" ? "الكل" : STATUS_LABELS[st]}
              </button>
            ))}
            <button onClick={loadRegs} style={{ ...btnBase, padding: "6px 14px", marginRight: "auto", background: "hsl(222 47% 9%)", color: "hsl(215 20% 55%)", border: "1px solid hsl(217 32% 14%)" }}>🔄 تحديث</button>
          </div>
          {regsLoad ? (
            <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>جارٍ التحميل...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {regs.map(reg => (
                <div key={reg.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 95%)" }}>{reg.student_name}</span>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6,
                          background: `${STATUS_COLORS[reg.status] || "hsl(215 20% 40%)"}/20`,
                          color: STATUS_COLORS[reg.status] || "hsl(215 20% 55%)" }}>
                          {STATUS_LABELS[reg.status] || reg.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "hsl(215 20% 55%)" }}>
                        🏫 {reg.institution_name} · 📚 {reg.grade}
                      </div>
                      <div style={{ fontSize: 12, color: "hsl(215 20% 45%)", marginTop: 2 }}>
                        👤 {reg.parent_name} · 📞 {reg.parent_phone}
                      </div>
                      <div style={{ fontSize: 11, color: "hsl(215 20% 35%)", marginTop: 4, display: "flex", gap: 12 }}>
                        <span>#{reg.reg_number}</span>
                        <span>{new Date(reg.created_at).toLocaleDateString("ar-EG")}</span>
                      </div>
                      {reg.admin_notes && (
                        <div style={{ fontSize: 12, color: "hsl(38 90% 55%)", marginTop: 6 }}>ملاحظة: {reg.admin_notes}</div>
                      )}
                    </div>
                    {reg.status === "pending" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setRegNote({ id: reg.id, action: "approve", notes: "" })}
                          style={{ ...btnBase, background: "hsl(147 60% 42% / 0.15)", color: "hsl(147 60% 42%)", border: "1px solid hsl(147 60% 42% / 0.4)" }}>
                          ✓ قبول
                        </button>
                        <button onClick={() => setRegNote({ id: reg.id, action: "reject", notes: "" })}
                          style={{ ...btnBase, background: "hsl(0 70% 55% / 0.15)", color: "hsl(0 70% 55%)", border: "1px solid hsl(0 70% 55% / 0.4)" }}>
                          ✗ رفض
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {regs.length === 0 && <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>لا توجد طلبات تسجيل</div>}
            </div>
          )}
        </>
      )}

      {/* ── Transfers Tab ── */}
      {activeTab === "transfers" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {(["all", "pending", "approved", "rejected"] as const).map(st => (
              <button key={st} onClick={() => setTrfStatus(st)}
                style={{ ...btnBase, padding: "6px 14px",
                  background: trfStatus === st ? "hsl(24 95% 56% / 0.15)" : "hsl(222 47% 9%)",
                  color: trfStatus === st ? "hsl(24 95% 56%)" : "hsl(215 20% 55%)",
                  border: `1px solid ${trfStatus === st ? "hsl(24 95% 56% / 0.5)" : "hsl(217 32% 14%)"}` }}>
                {st === "all" ? "الكل" : STATUS_LABELS[st]}
              </button>
            ))}
            <button onClick={loadTrfs} style={{ ...btnBase, padding: "6px 14px", marginRight: "auto", background: "hsl(222 47% 9%)", color: "hsl(215 20% 55%)", border: "1px solid hsl(217 32% 14%)" }}>🔄 تحديث</button>
          </div>
          {trfsLoad ? (
            <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>جارٍ التحميل...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {trfs.map(trf => (
                <div key={trf.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 95%)" }}>{trf.student_name}</span>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6,
                          background: `${STATUS_COLORS[trf.status] || "hsl(215 20% 40%)"}/20`,
                          color: STATUS_COLORS[trf.status] || "hsl(215 20% 55%)" }}>
                          {STATUS_LABELS[trf.status] || trf.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "hsl(215 20% 55%)" }}>
                        ↔ {trf.from_institution_name} → {trf.to_institution_name}
                      </div>
                      <div style={{ fontSize: 12, color: "hsl(215 20% 45%)", marginTop: 2 }}>
                        📞 {trf.parent_phone} · سبب: {trf.transfer_reason}
                      </div>
                      <div style={{ fontSize: 11, color: "hsl(215 20% 35%)", marginTop: 4, display: "flex", gap: 12 }}>
                        <span>#{trf.transfer_number}</span>
                        <span>{new Date(trf.created_at).toLocaleDateString("ar-EG")}</span>
                      </div>
                      {trf.admin_notes && (
                        <div style={{ fontSize: 12, color: "hsl(38 90% 55%)", marginTop: 6 }}>ملاحظة: {trf.admin_notes}</div>
                      )}
                    </div>
                    {trf.status === "pending" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setTrfNote({ id: trf.id, action: "approve", notes: "" })}
                          style={{ ...btnBase, background: "hsl(147 60% 42% / 0.15)", color: "hsl(147 60% 42%)", border: "1px solid hsl(147 60% 42% / 0.4)" }}>
                          ✓ قبول
                        </button>
                        <button onClick={() => setTrfNote({ id: trf.id, action: "reject", notes: "" })}
                          style={{ ...btnBase, background: "hsl(0 70% 55% / 0.15)", color: "hsl(0 70% 55%)", border: "1px solid hsl(0 70% 55% / 0.4)" }}>
                          ✗ رفض
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {trfs.length === 0 && <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>لا توجد طلبات نقل</div>}
            </div>
          )}
        </>
      )}

      {/* ── Institution Form Modal ── */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 16%)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 20px", color: "hsl(210 40% 95%)", fontSize: 18 }}>{editing !== null ? "تعديل مؤسسة" : "إضافة مؤسسة"}</h2>
            {[
              { label: "الاسم *", key: "name" }, { label: "الهاتف *", key: "phone" },
              { label: "العنوان *", key: "address" }, { label: "المدير / الناظر", key: "principal" },
              { label: "البريد الإلكتروني", key: "email" }, { label: "الموقع الإلكتروني", key: "website" },
              { label: "الصفوف (مثل: 1-8)", key: "grades" }, { label: "الفترات (صباحي/مسائي)", key: "shifts" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={labelStyle}>{f.label}</label>
                <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>النوع</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                style={{ ...inputStyle }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>الخدمات</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(SVC_LABELS).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => toggleSvc(k)}
                    style={{ padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                      border: `1px solid ${form.services.includes(k) ? "hsl(147 60% 42%)" : "hsl(217 32% 14%)"}`,
                      background: form.services.includes(k) ? "hsl(147 60% 42% / 0.2)" : "transparent",
                      color: form.services.includes(k) ? "hsl(147 60% 42%)" : "hsl(215 20% 55%)" }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer" }}>إلغاء</button>
              <button onClick={save} disabled={saving} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "hsl(147 60% 42%)", color: "#000", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "جارٍ الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reg Status Modal ── */}
      {regNote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <div style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 16%)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420 }}>
            <h3 style={{ margin: "0 0 16px", color: "hsl(210 40% 95%)" }}>
              {regNote.action === "approve" ? "✅ قبول طلب التسجيل" : "❌ رفض طلب التسجيل"}
            </h3>
            <label style={labelStyle}>ملاحظات (اختياري)</label>
            <textarea value={regNote.notes} onChange={e => setRegNote(n => n ? { ...n, notes: e.target.value } : n)}
              rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="سبب القبول أو الرفض..." />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setRegNote(null)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer" }}>إلغاء</button>
              <button onClick={() => updateRegStatus(regNote.id, regNote.action === "approve" ? "approved" : "rejected", regNote.notes)}
                style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", fontWeight: 700, cursor: "pointer",
                  background: regNote.action === "approve" ? "hsl(147 60% 42%)" : "hsl(0 70% 55%)", color: regNote.action === "approve" ? "#000" : "#fff" }}>
                {regNote.action === "approve" ? "قبول" : "رفض"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Trf Status Modal ── */}
      {trfNote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <div style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 16%)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420 }}>
            <h3 style={{ margin: "0 0 16px", color: "hsl(210 40% 95%)" }}>
              {trfNote.action === "approve" ? "✅ قبول طلب النقل" : "❌ رفض طلب النقل"}
            </h3>
            <label style={labelStyle}>ملاحظات (اختياري)</label>
            <textarea value={trfNote.notes} onChange={e => setTrfNote(n => n ? { ...n, notes: e.target.value } : n)}
              rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="سبب القبول أو الرفض..." />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setTrfNote(null)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer" }}>إلغاء</button>
              <button onClick={() => updateTrfStatus(trfNote.id, trfNote.action === "approve" ? "approved" : "rejected", trfNote.notes)}
                style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", fontWeight: 700, cursor: "pointer",
                  background: trfNote.action === "approve" ? "hsl(147 60% 42%)" : "hsl(0 70% 55%)", color: trfNote.action === "approve" ? "#000" : "#fff" }}>
                {trfNote.action === "approve" ? "قبول" : "رفض"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
