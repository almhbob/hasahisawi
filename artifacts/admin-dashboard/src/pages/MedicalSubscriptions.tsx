import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiJson, apiFetch } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";

const teal  = "#0ea5e9";
const green = "#3EFF9C";
const gold  = "#F59E0B";
const red   = "#f87171";
const orange = "#f97316";

// ─── Types ────────────────────────────────────────────────────────────────
type Plan = {
  id: number; name: string; name_ar: string; price_monthly: number; color: string; icon: string;
  max_appointments_per_month: number; has_whatsapp_confirm: boolean; has_reminder: boolean;
  has_priority: boolean; has_featured_badge: boolean; has_analytics: boolean;
  has_supervisor: boolean; has_monthly_report: boolean; description: string | null;
};
type Institution = {
  id: number; name: string; short_name: string | null; type: string; logo_initial: string;
  brand_color: string; address: string | null; phone: string | null; whatsapp: string | null;
  contact_person: string | null; working_hours: string | null; fees_range: string | null;
  is_active: boolean; is_verified: boolean; is_featured: boolean;
  subscription_tier: string | null; plan_name: string | null; plan_name_ar: string | null;
  plan_color: string | null; plan_icon: string | null;
  sub_active: boolean | null; sub_expires: string | null; amount_paid: number | null;
};
type Supervisor = {
  id: number; name: string; phone: string | null; whatsapp: string | null;
  email: string | null; assigned_plan: string; is_active: boolean;
  notes: string | null; assigned_count: number;
};
type Appointment = {
  id: number; user_name: string | null; user_display_name: string | null;
  user_phone: string | null; facility_name: string | null;
  appointment_date: string; appointment_time: string;
  status: string; reminder_sent: boolean; reminder_sent_at: string | null;
};

const PLAN_BADGE: Record<string, string> = {
  gold: "bg-yellow-900/40 text-yellow-300", silver: "bg-gray-700 text-gray-200",
  bronze: "bg-orange-900/40 text-orange-300", free: "bg-gray-800 text-gray-400",
};

// ─── Institution Form Modal ───────────────────────────────────────────────
function InstModal({ inst, onClose, onSaved }: {
  inst: Institution | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: inst?.name || "", short_name: inst?.short_name || "",
    type: inst?.type || "clinic", phone: inst?.phone || "",
    whatsapp: inst?.whatsapp || "", address: inst?.address || "",
    contact_person: inst?.contact_person || "", working_hours: inst?.working_hours || "",
    fees_range: inst?.fees_range || "", brand_color: inst?.brand_color || "#2E7D9A",
    logo_initial: inst?.logo_initial || "🏥",
    is_featured: inst?.is_featured ?? false, is_verified: inst?.is_verified ?? false,
  });
  const [saving, setSaving] = useState(false); const [err, setErr] = useState("");
  const f = (k: string) => (v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr("الاسم مطلوب"); return; }
    setSaving(true); setErr("");
    try {
      const method = inst ? "PATCH" : "POST";
      const url = inst ? `/admin/medical-institutions/${inst.id}` : "/admin/medical-institutions";
      const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) { onSaved(); onClose(); } else { const d = await r.json(); setErr(d.error || "فشل الحفظ"); }
    } catch { setErr("خطأ في الاتصال"); }
    setSaving(false);
  };

  const inp = {
    background: "hsl(222 47% 10%)", border: "1px solid hsl(215 20% 22%)",
    borderRadius: 8, color: "hsl(215 20% 85%)", padding: "9px 12px", width: "100%",
    fontFamily: "inherit", fontSize: 14,
  } as const;
  const label = { color: "hsl(215 20% 55%)", fontSize: 12, marginBottom: 4, display: "block" } as const;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "hsl(222 47% 11%)", borderRadius: 16, padding: 24, width: 520, maxHeight: "85vh", overflowY: "auto", border: "1px solid hsl(215 20% 20%)" }}>
        <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>
          {inst ? "تعديل المؤسسة" : "إضافة مؤسسة طبية جديدة"}
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            ["name","اسم المؤسسة",false], ["short_name","الاسم المختصر",false],
            ["phone","رقم الهاتف",false], ["whatsapp","واتساب",false],
            ["contact_person","مسؤول التواصل",false], ["working_hours","ساعات العمل",false],
            ["fees_range","نطاق الأسعار",false], ["logo_initial","رمز الشعار",false],
          ].map(([k, lbl]) => (
            <div key={k as string}>
              <label style={label}>{lbl as string}</label>
              <input value={(form as any)[k as string]} onChange={e => f(k as string)(e.target.value)} style={inp} />
            </div>
          ))}
          <div style={{ gridColumn: "1/-1" }}>
            <label style={label}>العنوان</label>
            <input value={form.address} onChange={e => f("address")(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={label}>النوع</label>
            <select value={form.type} onChange={e => f("type")(e.target.value)} style={{ ...inp }}>
              <option value="clinic">عيادة</option>
              <option value="hospital">مستشفى</option>
              <option value="pharmacy">صيدلية</option>
              <option value="lab">مختبر</option>
              <option value="center">مركز صحي</option>
            </select>
          </div>
          <div>
            <label style={label}>اللون</label>
            <input type="color" value={form.brand_color} onChange={e => f("brand_color")(e.target.value)}
              style={{ ...inp, padding: 4, height: 40 }} />
          </div>
          <div style={{ display: "flex", gap: 16, gridColumn: "1/-1" }}>
            {[["is_featured","مميّز"], ["is_verified","موثّق"]].map(([k, lbl]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, color: "hsl(215 20% 70%)", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={(form as any)[k]} onChange={e => f(k)(e.target.checked)} />
                {lbl}
              </label>
            ))}
          </div>
        </div>
        {err && <p style={{ color: red, fontSize: 13, marginTop: 10 }}>{err}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, background: "hsl(215 20% 16%)", color: "hsl(215 20% 70%)", border: "none", cursor: "pointer" }}>إلغاء</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 24px", borderRadius: 8, background: teal, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700 }}>
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subscription Modal ────────────────────────────────────────────────────
function SubModal({ inst, plans, onClose, onSaved }: {
  inst: Institution; plans: Plan[]; onClose: () => void; onSaved: () => void;
}) {
  const [planId, setPlanId] = useState<number | "">(inst.plan_name ? (plans.find(p => p.name === inst.plan_name)?.id || "") : "");
  const [expires, setExpires] = useState(""); const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash"); const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false); const [err, setErr] = useState("");
  const inp = { background: "hsl(222 47% 10%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, color: "hsl(215 20% 85%)", padding: "9px 12px", width: "100%", fontFamily: "inherit", fontSize: 14 } as const;
  const label = { color: "hsl(215 20% 55%)", fontSize: 12, marginBottom: 4, display: "block" } as const;
  const save = async () => {
    if (!planId) { setErr("اختر الباقة"); return; }
    setSaving(true); setErr("");
    try {
      const r = await apiFetch("/admin/clinic-subscriptions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution_id: inst.id, plan_id: planId, expires_at: expires||null, amount_paid: amount||null, payment_method: method, notes: notes||null })
      });
      if (r.ok) { onSaved(); onClose(); } else { const d = await r.json(); setErr(d.error || "فشل الحفظ"); }
    } catch { setErr("خطأ في الاتصال"); }
    setSaving(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "hsl(222 47% 11%)", borderRadius: 16, padding: 24, width: 440, border: "1px solid hsl(215 20% 20%)" }}>
        <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>تعيين اشتراك — {inst.name}</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={label}>الباقة</label>
            <select value={planId} onChange={e => setPlanId(Number(e.target.value))} style={{ ...inp }}>
              <option value="">اختر الباقة</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name_ar} — {p.price_monthly.toLocaleString()} SDG/شهر</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={label}>تنتهي في</label><input type="date" value={expires} onChange={e => setExpires(e.target.value)} style={inp} /></div>
            <div><label style={label}>المبلغ المدفوع</label><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={inp} /></div>
          </div>
          <div>
            <label style={label}>طريقة الدفع</label>
            <select value={method} onChange={e => setMethod(e.target.value)} style={{ ...inp }}>
              <option value="cash">نقدي</option><option value="transfer">تحويل بنكي</option><option value="mobile">محفظة جوال</option>
            </select>
          </div>
          <div><label style={label}>ملاحظات</label><textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inp, minHeight: 60, resize: "vertical" } as any} /></div>
        </div>
        {err && <p style={{ color: red, fontSize: 13, marginTop: 8 }}>{err}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, background: "hsl(215 20% 16%)", color: "hsl(215 20% 70%)", border: "none", cursor: "pointer" }}>إلغاء</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 24px", borderRadius: 8, background: gold, color: "#000", border: "none", cursor: "pointer", fontWeight: 700 }}>{saving ? "..." : "تفعيل الاشتراك"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Supervisor Modal ─────────────────────────────────────────────────────
function SupModal({ sup, onClose, onSaved }: { sup: Supervisor | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: sup?.name || "", phone: sup?.phone || "", whatsapp: sup?.whatsapp || "",
    email: sup?.email || "", assigned_plan: sup?.assigned_plan || "all", notes: sup?.notes || "",
  });
  const [saving, setSaving] = useState(false); const [err, setErr] = useState("");
  const inp = { background: "hsl(222 47% 10%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, color: "hsl(215 20% 85%)", padding: "9px 12px", width: "100%", fontFamily: "inherit", fontSize: 14 } as const;
  const label = { color: "hsl(215 20% 55%)", fontSize: 12, marginBottom: 4, display: "block" } as const;
  const f = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const save = async () => {
    if (!form.name.trim()) { setErr("الاسم مطلوب"); return; }
    setSaving(true); setErr("");
    try {
      const method = sup ? "PATCH" : "POST";
      const url = sup ? `/admin/clinic-supervisors/${sup.id}` : "/admin/clinic-supervisors";
      const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) { onSaved(); onClose(); } else { const d = await r.json(); setErr(d.error || "فشل"); }
    } catch { setErr("خطأ"); }
    setSaving(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "hsl(222 47% 11%)", borderRadius: 16, padding: 24, width: 460, border: "1px solid hsl(215 20% 20%)" }}>
        <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>{sup ? "تعديل مشرف" : "إضافة مشرف جديد"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[["name","الاسم الكامل"],["phone","رقم الهاتف"],["whatsapp","واتساب"],["email","البريد الإلكتروني"]].map(([k,lbl]) => (
            <div key={k}><label style={label}>{lbl}</label><input value={(form as any)[k]} onChange={e => f(k)(e.target.value)} style={inp} /></div>
          ))}
          <div style={{ gridColumn: "1/-1" }}>
            <label style={label}>الباقات المسؤول عنها</label>
            <select value={form.assigned_plan} onChange={e => f("assigned_plan")(e.target.value)} style={{ ...inp }}>
              <option value="all">جميع الباقات</option>
              <option value="bronze">برونزي</option>
              <option value="silver">فضي</option>
              <option value="gold">ذهبي</option>
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={label}>ملاحظات</label>
            <textarea value={form.notes} onChange={e => f("notes")(e.target.value)} style={{ ...inp, minHeight: 60, resize: "vertical" } as any} />
          </div>
        </div>
        {err && <p style={{ color: red, fontSize: 13, marginTop: 8 }}>{err}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, background: "hsl(215 20% 16%)", color: "hsl(215 20% 70%)", border: "none", cursor: "pointer" }}>إلغاء</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 24px", borderRadius: 8, background: teal, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700 }}>{saving ? "..." : "حفظ"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function MedicalSubscriptions() {
  const [tab, setTab] = useState<"institutions" | "plans" | "supervisors" | "reminders">("institutions");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [reminders, setReminders] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [instModal, setInstModal] = useState<Institution | null | "new">(null);
  const [subModal, setSubModal] = useState<Institution | null>(null);
  const [supModal, setSupModal] = useState<Supervisor | null | "new">(null);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState<Partial<Plan>>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [reminderResult, setReminderResult] = useState<Record<number, { waLink: string }>>({});
  const confirm = useConfirm();

  const loadInstitutions = useCallback(async () => {
    setLoading(true);
    const d = await apiJson<{ institutions: Institution[] }>("/admin/medical-institutions");
    setInstitutions(d.institutions || []);
    setLoading(false);
  }, []);

  const loadPlans = useCallback(async () => {
    const d = await apiJson<{ plans: Plan[] }>("/admin/clinic-subscription-plans");
    setPlans(d.plans || []);
  }, []);

  const loadSupervisors = useCallback(async () => {
    const d = await apiJson<{ supervisors: Supervisor[] }>("/admin/clinic-supervisors");
    setSupervisors(d.supervisors || []);
  }, []);

  const loadReminders = useCallback(async () => {
    const d = await apiJson<{ reminders: Appointment[] }>("/admin/appointments/reminders-due");
    setReminders(d.reminders || []);
  }, []);

  useEffect(() => {
    loadInstitutions();
    loadPlans();
    loadSupervisors();
    loadReminders();
  }, []);

  // ── Send Reminder ──
  const sendReminder = async (appt: Appointment) => {
    const r = await apiFetch(`/admin/appointments/${appt.id}/send-reminder`, { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      setReminderResult(prev => ({ ...prev, [appt.id]: { waLink: d.wa_link } }));
      setReminders(prev => prev.map(a => a.id === appt.id ? { ...a, reminder_sent: true } : a));
    }
  };

  // ── Toggle Institution Active ──
  const toggleInst = async (inst: Institution) => {
    await apiFetch(`/admin/medical-institutions/${inst.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !inst.is_active })
    });
    loadInstitutions();
  };

  // ── Delete Institution ──
  const deleteInst = async (inst: Institution) => {
    if (!(await confirm({ title: `حذف "${inst.name}"؟`, confirmText: "حذف", destructive: true }))) return;
    await apiFetch(`/admin/medical-institutions/${inst.id}`, { method: "DELETE" });
    loadInstitutions();
  };

  // ── Save Plan ──
  const savePlan = async () => {
    if (!editPlan) return;
    setSavingPlan(true);
    await apiFetch(`/admin/clinic-subscription-plans/${editPlan.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(planForm)
    });
    setSavingPlan(false); setEditPlan(null); setPlanForm({});
    loadPlans();
  };

  // ── Toggle Supervisor Active ──
  const toggleSup = async (s: Supervisor) => {
    await apiFetch(`/admin/clinic-supervisors/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !s.is_active })
    });
    loadSupervisors();
  };

  const card = {
    background: "hsl(222 47% 11%)", borderRadius: 12, border: "1px solid hsl(215 20% 18%)",
    padding: 16, marginBottom: 10,
  } as const;
  const btn = (bg: string, fg = "#fff") => ({
    padding: "6px 14px", borderRadius: 7, background: bg, color: fg,
    border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
  } as const);
  const tabStyle = (active: boolean) => ({
    padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: active ? teal : "hsl(215 20% 16%)",
    color: active ? "#fff" : "hsl(215 20% 55%)", border: "none",
  } as const);

  return (
    <div>
      <PageHeader title="اشتراكات العيادات والمؤسسات الطبية" subtitle="إدارة المؤسسات — الباقات — المشرفون — التذكيرات" />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {(["institutions","plans","supervisors","reminders"] as const).map(t => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {{ institutions: "🏥 المؤسسات", plans: "💰 الباقات", supervisors: "👤 المشرفون", reminders: "🔔 تذكيرات اليوم" }[t]}
            {t === "reminders" && reminders.filter(r => !r.reminder_sent).length > 0 && (
              <span style={{ marginRight: 6, background: red, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>
                {reminders.filter(r => !r.reminder_sent).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TAB: المؤسسات ═══════════════════════════════════════════════ */}
      {tab === "institutions" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ color: "hsl(215 20% 55%)", fontSize: 13 }}>
              {institutions.length} مؤسسة — {institutions.filter(i => i.sub_active).length} مشتركة
            </span>
            <button style={btn(teal)} onClick={() => setInstModal("new")}>+ إضافة مؤسسة</button>
          </div>
          {loading ? <p style={{ color: "hsl(215 20% 50%)" }}>جارٍ التحميل...</p> : (
            institutions.map(inst => (
              <div key={inst.id} style={{ ...card, opacity: inst.is_active ? 1 : 0.5, borderRight: `3px solid ${inst.plan_color || "#334155"}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: (inst.brand_color || "#2E7D9A") + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                    {inst.logo_initial || "🏥"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{inst.name}</span>
                      {inst.is_verified && <span style={{ fontSize: 11, background: "#0ea5e920", color: teal, borderRadius: 6, padding: "2px 7px" }}>✓ موثّق</span>}
                      {inst.is_featured && <span style={{ fontSize: 11, background: "#F59E0B20", color: gold, borderRadius: 6, padding: "2px 7px" }}>★ مميّز</span>}
                      {inst.sub_active ? (
                        <span style={{ fontSize: 11, background: (inst.plan_color || "#334155") + "22", color: inst.plan_color || "#94a3b8", borderRadius: 6, padding: "2px 8px", border: `1px solid ${inst.plan_color || "#334155"}44` }}>
                          {inst.plan_icon || "●"} {inst.plan_name_ar}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, background: "#334155", color: "#94a3b8", borderRadius: 6, padding: "2px 7px" }}>مجاني</span>
                      )}
                    </div>
                    <div style={{ color: "hsl(215 20% 55%)", fontSize: 12, marginTop: 4 }}>
                      {inst.type === "clinic" ? "عيادة" : inst.type === "hospital" ? "مستشفى" : inst.type === "pharmacy" ? "صيدلية" : inst.type}
                      {inst.phone && ` · ${inst.phone}`}
                      {inst.address && ` · ${inst.address}`}
                    </div>
                    {inst.sub_expires && (
                      <div style={{ fontSize: 11, color: "hsl(215 20% 45%)", marginTop: 2 }}>
                        ينتهي: {new Date(inst.sub_expires).toLocaleDateString("ar-SD")}
                        {inst.amount_paid ? ` · دفع: ${Number(inst.amount_paid).toLocaleString()} SDG` : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button style={btn(gold, "#000")} onClick={() => setSubModal(inst)}>اشتراك</button>
                    <button style={btn("hsl(215 20% 20%)")} onClick={() => setInstModal(inst)}>تعديل</button>
                    <button style={btn(inst.is_active ? "#1e3a2f" : "#1e1e3a", inst.is_active ? green : "#818cf8")} onClick={() => toggleInst(inst)}>
                      {inst.is_active ? "إخفاء" : "إظهار"}
                    </button>
                    <button style={btn("#3f1c1c", red)} onClick={() => deleteInst(inst)}>حذف</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══ TAB: الباقات ════════════════════════════════════════════════ */}
      {tab === "plans" && (
        <div>
          <p style={{ color: "hsl(215 20% 50%)", fontSize: 13, marginBottom: 16 }}>
            4 باقات ثابتة — عدّل الأسعار والمميزات حسب الحاجة
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {plans.map(p => (
              <div key={p.id} style={{ ...card, borderTop: `3px solid ${p.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 22 }}>{p.icon}</span>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginRight: 8 }}>{p.name_ar}</span>
                  </div>
                  <button style={btn(p.color + "44", p.color)} onClick={() => { setEditPlan(p); setPlanForm({ name_ar: p.name_ar, price_monthly: p.price_monthly, max_appointments_per_month: p.max_appointments_per_month, description: p.description || "" }); }}>تعديل</button>
                </div>
                <div style={{ color: gold, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                  {p.price_monthly === 0 ? "مجاني" : `${Number(p.price_monthly).toLocaleString()} SDG/شهر`}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    [p.has_whatsapp_confirm, "تأكيد واتساب"],
                    [p.has_reminder, "تذكير تلقائي"],
                    [p.has_priority, "أولوية العرض"],
                    [p.has_featured_badge, "شارة مميّز"],
                    [p.has_analytics, "تقارير إحصائية"],
                    [p.has_supervisor, "مشرف مخصص"],
                    [p.has_monthly_report, "تقرير شهري"],
                  ].map(([has, lbl]) => (
                    <span key={lbl as string} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: has ? "#0ea5e920" : "#1e293b", color: has ? teal : "#475569" }}>
                      {has ? "✓" : "✗"} {lbl}
                    </span>
                  ))}
                </div>
                <div style={{ color: "hsl(215 20% 45%)", fontSize: 11, marginTop: 8 }}>
                  حتى {p.max_appointments_per_month === 999 ? "غير محدود" : p.max_appointments_per_month} موعد/شهر
                </div>
              </div>
            ))}
          </div>

          {editPlan && (
            <div style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
                 onClick={e => e.target === e.currentTarget && setEditPlan(null)}>
              <div style={{ background: "hsl(222 47% 11%)", borderRadius: 16, padding: 24, width: 400, border: "1px solid hsl(215 20% 20%)" }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px" }}>تعديل باقة {editPlan.name_ar}</h3>
                <div style={{ display: "grid", gap: 12 }}>
                  {[["name_ar","اسم الباقة"],["price_monthly","السعر الشهري (SDG)"],["max_appointments_per_month","الحد الأقصى للمواعيد/شهر"],["description","الوصف"]].map(([k,lbl]) => (
                    <div key={k}>
                      <label style={{ color: "hsl(215 20% 55%)", fontSize: 12, display: "block", marginBottom: 4 }}>{lbl}</label>
                      <input value={(planForm as any)[k] || ""} onChange={e => setPlanForm(p => ({ ...p, [k]: e.target.value }))}
                        style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(215 20% 22%)", borderRadius: 8, color: "hsl(215 20% 85%)", padding: "9px 12px", width: "100%", fontFamily: "inherit", fontSize: 14 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
                  <button onClick={() => setEditPlan(null)} style={{ padding: "9px 20px", borderRadius: 8, background: "hsl(215 20% 16%)", color: "hsl(215 20% 70%)", border: "none", cursor: "pointer" }}>إلغاء</button>
                  <button onClick={savePlan} disabled={savingPlan} style={{ padding: "9px 24px", borderRadius: 8, background: teal, color: "#fff", border: "none", cursor: "pointer", fontWeight: 700 }}>{savingPlan ? "..." : "حفظ"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: المشرفون ═══════════════════════════════════════════════ */}
      {tab === "supervisors" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ color: "hsl(215 20% 55%)", fontSize: 13 }}>{supervisors.length} مشرف مسجّل</span>
            <button style={btn(teal)} onClick={() => setSupModal("new")}>+ إضافة مشرف</button>
          </div>
          {supervisors.length === 0 && <p style={{ color: "hsl(215 20% 45%)", textAlign: "center", padding: 40 }}>لا يوجد مشرفون حتى الآن</p>}
          {supervisors.map(s => (
            <div key={s.id} style={{ ...card, opacity: s.is_active ? 1 : 0.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#0ea5e920", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👤</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 700 }}>{s.name}</div>
                  <div style={{ color: "hsl(215 20% 55%)", fontSize: 12, marginTop: 2 }}>
                    {s.phone && `📞 ${s.phone}`}
                    {s.whatsapp && ` · 💬 ${s.whatsapp}`}
                    {s.email && ` · ✉️ ${s.email}`}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    <span style={{ background: "#1e293b", color: "#94a3b8", borderRadius: 6, padding: "2px 8px" }}>
                      باقة: {s.assigned_plan === "all" ? "الكل" : s.assigned_plan}
                    </span>
                    <span style={{ marginRight: 6, color: "hsl(215 20% 45%)" }}>{s.assigned_count} مؤسسة مسنَدة</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {s.whatsapp && (
                    <a href={`https://wa.me/${s.whatsapp.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
                       style={{ ...btn("#1e3a1e", green), textDecoration: "none" }}>واتساب</a>
                  )}
                  <button style={btn("hsl(215 20% 20%)")} onClick={() => setSupModal(s)}>تعديل</button>
                  <button style={btn(s.is_active ? "#1e3a2f" : "#1e1e3a", s.is_active ? green : "#818cf8")} onClick={() => toggleSup(s)}>
                    {s.is_active ? "إيقاف" : "تفعيل"}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {/* الفوائد للمؤسسات */}
          <div style={{ ...card, marginTop: 24, borderColor: gold + "44", background: gold + "08" }}>
            <h4 style={{ color: gold, margin: "0 0 12px" }}>💡 لماذا ينضم المشرف لحصاحيصاوي؟</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                "متابعة مواعيد العيادة في مكان واحد",
                "إرسال تذكيرات واتساب بنقرة واحدة",
                "تقارير شهرية عن الأداء",
                "تنسيق مع الإدارة بشكل مباشر",
                "إشعارات فورية عند حجز موعد جديد",
                "صلاحيات إدارة الجدول الزمني"
              ].map(f => (
                <div key={f} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: green, fontSize: 14 }}>✓</span>
                  <span style={{ color: "hsl(215 20% 65%)", fontSize: 12 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: التذكيرات ══════════════════════════════════════════════ */}
      {tab === "reminders" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ color: "hsl(215 20% 55%)", fontSize: 13 }}>
              مواعيد خلال الـ 5 ساعات القادمة — يحتاج إرسال تذكير واتساب
            </span>
            <button style={btn("hsl(215 20% 20%)")} onClick={loadReminders}>🔄 تحديث</button>
          </div>
          {reminders.length === 0 && (
            <div style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <p style={{ color: "hsl(215 20% 50%)" }}>لا توجد مواعيد تحتاج تذكيراً الآن</p>
            </div>
          )}
          {reminders.map(appt => {
            const result = reminderResult[appt.id];
            return (
              <div key={appt.id} style={{ ...card, borderRight: `3px solid ${appt.reminder_sent ? green : orange}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#fff", fontWeight: 600 }}>{appt.user_display_name || appt.user_name || "مريض"}</span>
                      {appt.reminder_sent && <span style={{ fontSize: 11, color: green, background: "#0f2e1c", borderRadius: 6, padding: "1px 7px" }}>✓ أُرسل</span>}
                    </div>
                    <div style={{ color: "hsl(215 20% 55%)", fontSize: 12, marginTop: 3 }}>
                      🏥 {appt.facility_name || "—"} · 📅 {appt.appointment_date} · ⏰ {appt.appointment_time}
                    </div>
                    {appt.user_phone && (
                      <div style={{ color: "hsl(215 20% 45%)", fontSize: 11, marginTop: 2 }}>📞 {appt.user_phone}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {result?.waLink ? (
                      <a href={result.waLink} target="_blank" rel="noreferrer"
                         style={{ ...btn("#1e3a1e", green), textDecoration: "none" }}>📱 فتح واتساب</a>
                    ) : (
                      <button style={btn(appt.reminder_sent ? "#1e2e1e" : "#1e3a1e", appt.reminder_sent ? "hsl(215 20% 40%)" : green)}
                              onClick={() => sendReminder(appt)} disabled={appt.reminder_sent}>
                        {appt.reminder_sent ? "تم الإرسال" : "📲 إرسال تذكير"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* إرشادات */}
          <div style={{ ...card, marginTop: 24, borderColor: teal + "44", background: teal + "06" }}>
            <h4 style={{ color: teal, margin: "0 0 10px", fontSize: 13 }}>ℹ️ آلية التذكير التلقائي</h4>
            <p style={{ color: "hsl(215 20% 55%)", fontSize: 12, lineHeight: 1.8, margin: 0 }}>
              تظهر هنا المواعيد الحاصلة بين 4-6 ساعات من الآن. اضغط "إرسال تذكير" لتوليد رسالة واتساب جاهزة للمريض.
              الرسالة تُرسَل مباشرةً من هاتف المشرف عبر واتساب. المواعيد التي تم تذكيرها تُخفى تلقائياً في التحديث القادم.
            </p>
          </div>
        </div>
      )}

      {/* Modals */}
      {instModal && (
        <InstModal inst={instModal === "new" ? null : instModal as Institution}
          onClose={() => setInstModal(null)} onSaved={loadInstitutions} />
      )}
      {subModal && (
        <SubModal inst={subModal} plans={plans}
          onClose={() => setSubModal(null)} onSaved={loadInstitutions} />
      )}
      {supModal && (
        <SupModal sup={supModal === "new" ? null : supModal as Supervisor}
          onClose={() => setSupModal(null)} onSaved={loadSupervisors} />
      )}
    </div>
  );
}
