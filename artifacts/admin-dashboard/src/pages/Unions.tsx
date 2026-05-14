import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch, apiJson, getApiBase } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// ─── Types ─────────────────────────────────────────────────────────────────
type Union = {
  id: number; name: string; short_name?: string; field?: string;
  description?: string; logo_url?: string; website?: string; email?: string;
  phone?: string; address?: string; founded?: string; members_count?: string;
  is_active: boolean; sort_order: number; created_at: string;
  members_total?: number;
};

type Member = {
  id: number; union_id?: number; union_name?: string;
  full_name: string; national_id?: string; birth_date?: string;
  birth_place?: string; gender?: string; nationality?: string;
  phone?: string; alt_phone?: string; email?: string;
  address?: string; neighborhood?: string; city?: string;
  job_title?: string; employer?: string; work_address?: string;
  work_phone?: string; specialty?: string; work_start_date?: string;
  work_years?: number;
  degree?: string; institution?: string; graduation_year?: number;
  field_of_study?: string;
  previous_unions?: any[]; union_roles?: string; existing_membership_no?: string;
  workshops?: any[]; conferences?: any[]; trainings?: any[];
  achievements?: string; skills?: string;
  references_list?: any[];
  membership_type: string; membership_no?: string;
  status: string; rejection_reason?: string; notes?: string;
  applied_at: string; approved_at?: string;
};

type Announcement = {
  id: number; union_id?: number; union_name?: string;
  title: string; body?: string; image_url?: string;
  link?: string; is_pinned: boolean; is_active: boolean; created_at: string;
};

type Program = {
  id: number; union_id?: number; union_name?: string;
  title: string; description?: string; type: string;
  start_date?: string; end_date?: string; location?: string;
  max_participants?: number; fee?: string; contact?: string; link?: string;
  is_active: boolean; sort_order: number; created_at: string;
};

type UnionLaw = {
  id: number; union_id?: number; union_name?: string;
  title: string; body?: string; category: string;
  document_url?: string; effective_date?: string; version?: string;
  is_active: boolean; sort_order: number; created_at: string;
};

const UC = "#8B5CF6";
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:  { label: "قيد المراجعة", color: "#F59E0B" },
  approved: { label: "مقبول",        color: "#22C55E" },
  rejected: { label: "مرفوض",        color: "#EF4444" },
};
const MEMBERSHIP_LABELS: Record<string, string> = {
  regular: "عضو عامل", associate: "عضو منتسب", honorary: "عضو فخري",
};
const DEGREE_LABELS: Record<string, string> = {
  بكالوريوس: "B.Sc", ماجستير: "M.Sc", دكتوراه: "PhD", دبلوم: "Dip", "شهادة مهنية": "Prof",
};

// ─── Main Component ─────────────────────────────────────────────────────────
export default function Unions() {
  const [tab, setTab] = useState<"unions" | "members" | "announcements" | "programs" | "laws">("unions");

  // Unions
  const [unions, setUnions] = useState<Union[]>([]);
  const [unionsLoading, setUnionsLoading] = useState(false);
  const [showUnionModal, setShowUnionModal] = useState(false);
  const [editingUnion, setEditingUnion] = useState<Partial<Union> | null>(null);

  // Members
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [filterUnion, setFilterUnion] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [viewingMember, setViewingMember] = useState<Member | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: "", rejection_reason: "", membership_no: "", notes: "" });

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [editingAnn, setEditingAnn] = useState<Partial<Announcement> | null>(null);

  // Programs
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Partial<Program> | null>(null);
  const [programUnionFilter, setProgramUnionFilter] = useState("");
  const [programTypeFilter, setProgramTypeFilter] = useState("");

  // Laws
  const [laws, setLaws] = useState<UnionLaw[]>([]);
  const [lawsLoading, setLawsLoading] = useState(false);
  const [showLawModal, setShowLawModal] = useState(false);
  const [editingLaw, setEditingLaw] = useState<Partial<UnionLaw> | null>(null);
  const [lawUnionFilter, setLawUnionFilter] = useState("");
  const [lawCatFilter, setLawCatFilter] = useState("");
  const [expandedLaw, setExpandedLaw] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Load ──
  const loadUnions = useCallback(async () => {
    setUnionsLoading(true);
    try { setUnions(await apiJson("/admin/unions")); }
    catch { setError("فشل تحميل النقابات"); }
    finally { setUnionsLoading(false); }
  }, []);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterUnion) params.set("union_id", filterUnion);
      if (filterStatus) params.set("status", filterStatus);
      setMembers(await apiJson(`/admin/union-members?${params}`));
    } catch { setError("فشل تحميل الأعضاء"); }
    finally { setMembersLoading(false); }
  }, [filterUnion, filterStatus]);

  const loadAnnouncements = useCallback(async () => {
    setAnnLoading(true);
    try { setAnnouncements(await apiJson("/admin/union-announcements")); }
    catch { setError("فشل تحميل الإعلانات"); }
    finally { setAnnLoading(false); }
  }, []);

  const loadPrograms = useCallback(async () => {
    setProgramsLoading(true);
    try {
      const params = new URLSearchParams();
      if (programUnionFilter) params.set("union_id", programUnionFilter);
      if (programTypeFilter) params.set("type", programTypeFilter);
      setPrograms(await apiJson(`/admin/union-programs?${params}`));
    } catch { setError("فشل تحميل البرامج"); }
    finally { setProgramsLoading(false); }
  }, [programUnionFilter, programTypeFilter]);

  const loadLaws = useCallback(async () => {
    setLawsLoading(true);
    try {
      const params = new URLSearchParams();
      if (lawUnionFilter) params.set("union_id", lawUnionFilter);
      if (lawCatFilter) params.set("category", lawCatFilter);
      setLaws(await apiJson(`/admin/union-laws?${params}`));
    } catch { setError("فشل تحميل القوانين"); }
    finally { setLawsLoading(false); }
  }, [lawUnionFilter, lawCatFilter]);

  useEffect(() => { loadUnions(); loadMembers(); loadAnnouncements(); }, []);
  useEffect(() => { loadMembers(); }, [loadMembers]);
  useEffect(() => { if (tab === "programs") loadPrograms(); }, [tab, loadPrograms]);
  useEffect(() => { if (tab === "laws") loadLaws(); }, [tab, loadLaws]);

  // ── Save Union ──
  async function saveUnion() {
    if (!editingUnion?.name) { setError("الاسم مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editingUnion.id;
      await apiFetch(isEdit ? `/admin/unions/${editingUnion.id}` : "/admin/unions",
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editingUnion) });
      setShowUnionModal(false);
      loadUnions();
    } catch { setError("فشل الحفظ"); }
    finally { setSaving(false); }
  }

  async function deleteUnion(id: number) {
    if (!confirm("هل تريد حذف هذه النقابة؟")) return;
    try { await apiFetch(`/admin/unions/${id}`, { method: "DELETE" }); loadUnions(); }
    catch { setError("فشل الحذف"); }
  }

  // ── Member status ──
  async function updateMemberStatus() {
    if (!viewingMember || !statusForm.status) return;
    setSaving(true); setError("");
    try {
      await apiFetch(`/admin/union-members/${viewingMember.id}/status`,
        { method: "PATCH", body: JSON.stringify(statusForm) });
      setShowStatusModal(false);
      setViewingMember(null);
      loadMembers();
    } catch { setError("فشل التحديث"); }
    finally { setSaving(false); }
  }

  async function deleteMember(id: number) {
    if (!confirm("هل تريد حذف هذا الطلب؟")) return;
    try { await apiFetch(`/admin/union-members/${id}`, { method: "DELETE" }); loadMembers(); }
    catch { setError("فشل الحذف"); }
  }

  // ── Save Announcement ──
  async function saveAnn() {
    if (!editingAnn?.title) { setError("العنوان مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editingAnn.id;
      await apiFetch(isEdit ? `/admin/union-announcements/${editingAnn.id}` : "/admin/union-announcements",
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editingAnn) });
      setShowAnnModal(false);
      loadAnnouncements();
    } catch { setError("فشل الحفظ"); }
    finally { setSaving(false); }
  }

  async function deleteAnn(id: number) {
    if (!confirm("هل تريد حذف هذا الإعلان؟")) return;
    try { await apiFetch(`/admin/union-announcements/${id}`, { method: "DELETE" }); loadAnnouncements(); }
    catch { setError("فشل الحذف"); }
  }

  // ── Programs ──
  async function saveProgram() {
    if (!editingProgram?.title) { setError("العنوان مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editingProgram.id;
      await apiFetch(isEdit ? `/admin/union-programs/${editingProgram.id}` : "/admin/union-programs",
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editingProgram) });
      setShowProgramModal(false);
      loadPrograms();
    } catch { setError("فشل الحفظ"); }
    finally { setSaving(false); }
  }

  async function deleteProgram(id: number) {
    if (!confirm("هل تريد حذف هذا البرنامج؟")) return;
    try { await apiFetch(`/admin/union-programs/${id}`, { method: "DELETE" }); loadPrograms(); }
    catch { setError("فشل الحذف"); }
  }

  // ── Laws ──
  async function saveLaw() {
    if (!editingLaw?.title) { setError("العنوان مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const isEdit = !!editingLaw.id;
      await apiFetch(isEdit ? `/admin/union-laws/${editingLaw.id}` : "/admin/union-laws",
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(editingLaw) });
      setShowLawModal(false);
      loadLaws();
    } catch { setError("فشل الحفظ"); }
    finally { setSaving(false); }
  }

  async function deleteLaw(id: number) {
    if (!confirm("هل تريد حذف هذه الوثيقة؟")) return;
    try { await apiFetch(`/admin/union-laws/${id}`, { method: "DELETE" }); loadLaws(); }
    catch { setError("فشل الحذف"); }
  }

  // ── PDF Print ──
  function printMember(m: Member) {
    const union = unions.find(u => u.id === m.union_id);
    const printWin = window.open("", "_blank", "width=900,height=700");
    if (!printWin) return;
    const dateStr = (d?: string) => d ? new Date(d).toLocaleDateString("ar-SA") : "—";
    const jsonArr = (v: any): any[] => {
      try { return Array.isArray(v) ? v : JSON.parse(v || "[]"); } catch { return []; }
    };
    const prevUnions = jsonArr(m.previous_unions);
    const refs = jsonArr(m.references_list);
    const workshops = jsonArr(m.workshops);
    const confs = jsonArr(m.conferences);
    const trainings = jsonArr(m.trainings);
    printWin.document.write(`
<!DOCTYPE html><html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>استمارة عضوية — ${m.full_name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 13px; direction: rtl; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 18mm; }
  /* Header */
  .header { display: flex; align-items: center; gap: 20px; border-bottom: 3px solid #8B5CF6; padding-bottom: 16px; margin-bottom: 20px; }
  .logo-circle { width: 64px; height: 64px; border-radius: 50%; background: #8B5CF6; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: #fff; flex-shrink: 0; }
  .header-title { font-size: 20px; font-weight: 700; color: #1a1a1a; }
  .header-sub { font-size: 13px; color: #6b7280; margin-top: 4px; }
  .member-no { margin-right: auto; text-align: left; }
  .member-no .no-label { font-size: 11px; color: #6b7280; }
  .member-no .no-val { font-size: 18px; font-weight: 700; color: #8B5CF6; }
  /* Status badge */
  .status-badge { display: inline-block; padding: 3px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .status-pending { background: #FEF3C7; color: #92400E; }
  .status-approved { background: #D1FAE5; color: #065F46; }
  .status-rejected { background: #FEE2E2; color: #991B1B; }
  /* Sections */
  .section { margin-bottom: 20px; }
  .section-title { font-size: 14px; font-weight: 700; color: #8B5CF6; border-right: 4px solid #8B5CF6; padding-right: 10px; margin-bottom: 12px; padding-bottom: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px 20px; }
  .field { padding: 6px 0; border-bottom: 1px solid #e5e7eb; }
  .field-label { font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 2px; }
  .field-val { font-size: 13px; color: #1a1a1a; font-weight: 400; }
  .field-val.empty { color: #d1d5db; }
  /* Lists */
  ul.activity-list { padding-right: 18px; margin: 0; }
  ul.activity-list li { padding: 3px 0; font-size: 12px; color: #374151; }
  /* Previous unions table */
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table th { background: #F3F4F6; padding: 7px 10px; font-weight: 600; color: #374151; text-align: right; border: 1px solid #e5e7eb; }
  table td { padding: 6px 10px; border: 1px solid #e5e7eb; color: #1a1a1a; }
  /* Signature */
  .sig-section { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
  .sig-box { text-align: center; }
  .sig-line { border-bottom: 1px solid #9CA3AF; margin-bottom: 6px; height: 40px; }
  .sig-label { font-size: 11px; color: #6b7280; font-weight: 600; }
  /* Footer */
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 10px; color: #9CA3AF; }
  @media print {
    .page { padding: 12mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="logo-circle">${(union?.short_name || union?.name || "N").charAt(0)}</div>
    <div>
      <div class="header-title">${union?.name || "النقابة"}</div>
      <div class="header-sub">استمارة طلب عضوية</div>
      <div style="margin-top:6px">
        <span class="status-badge status-${m.status}">${STATUS_MAP[m.status]?.label || m.status}</span>
        ${m.membership_no ? `<span style="margin-right:10px;font-size:12px;color:#6b7280;">رقم العضوية: <strong>${m.membership_no}</strong></span>` : ""}
      </div>
    </div>
    <div class="member-no">
      <div class="no-label">تاريخ التقديم</div>
      <div class="no-val" style="font-size:14px">${dateStr(m.applied_at)}</div>
      ${m.approved_at ? `<div class="no-label" style="margin-top:4px">تاريخ القبول</div><div style="font-size:13px;font-weight:600;color:#065F46">${dateStr(m.approved_at)}</div>` : ""}
    </div>
  </div>

  <!-- البيانات الشخصية -->
  <div class="section">
    <div class="section-title">البيانات الشخصية</div>
    <div class="grid">
      ${field("الاسم الكامل", m.full_name)}
      ${field("رقم الهوية", m.national_id)}
      ${field("تاريخ الميلاد", dateStr(m.birth_date))}
      ${field("مكان الميلاد", m.birth_place)}
      ${field("الجنس", m.gender === "male" ? "ذكر" : m.gender === "female" ? "أنثى" : "")}
      ${field("الجنسية", m.nationality)}
      ${field("رقم الهاتف", m.phone)}
      ${field("هاتف بديل", m.alt_phone)}
      ${field("البريد الإلكتروني", m.email)}
      ${field("الحي", m.neighborhood)}
      ${field("المدينة", m.city)}
    </div>
    ${m.address ? `<div class="field" style="margin-top:8px"><div class="field-label">العنوان التفصيلي</div><div class="field-val">${m.address}</div></div>` : ""}
  </div>

  <!-- البيانات المهنية -->
  <div class="section">
    <div class="section-title">البيانات المهنية</div>
    <div class="grid">
      ${field("المسمى الوظيفي", m.job_title)}
      ${field("جهة العمل", m.employer)}
      ${field("التخصص", m.specialty)}
      ${field("هاتف العمل", m.work_phone)}
      ${field("تاريخ بدء العمل", dateStr(m.work_start_date))}
      ${field("سنوات الخبرة", m.work_years ? `${m.work_years} سنة` : undefined)}
    </div>
    ${m.work_address ? `<div class="field" style="margin-top:8px"><div class="field-label">عنوان العمل</div><div class="field-val">${m.work_address}</div></div>` : ""}
  </div>

  <!-- المؤهل الأكاديمي -->
  <div class="section">
    <div class="section-title">المؤهل الأكاديمي</div>
    <div class="grid">
      ${field("الدرجة العلمية", m.degree)}
      ${field("المؤسسة التعليمية", m.institution)}
      ${field("سنة التخرج", m.graduation_year?.toString())}
      ${field("مجال الدراسة", m.field_of_study)}
    </div>
  </div>

  <!-- التاريخ النقابي -->
  ${prevUnions.length > 0 ? `
  <div class="section">
    <div class="section-title">النقابات والجمعيات السابقة</div>
    <table>
      <thead><tr><th>اسم النقابة/الجمعية</th><th>الدور/المنصب</th><th>من</th><th>حتى</th></tr></thead>
      <tbody>
        ${prevUnions.map(pu => `<tr><td>${pu.name || "—"}</td><td>${pu.role || "—"}</td><td>${pu.from || "—"}</td><td>${pu.to || "—"}</td></tr>`).join("")}
      </tbody>
    </table>
    ${m.union_roles ? `<div class="field" style="margin-top:8px"><div class="field-label">المناصب الحالية</div><div class="field-val">${m.union_roles}</div></div>` : ""}
    ${m.existing_membership_no ? `<div class="field"><div class="field-label">رقم العضوية الحالي</div><div class="field-val">${m.existing_membership_no}</div></div>` : ""}
  </div>` : ""}

  <!-- الأنشطة -->
  ${(workshops.length + confs.length + trainings.length > 0 || m.achievements || m.skills) ? `
  <div class="section">
    <div class="section-title">الأنشطة والإنجازات</div>
    <div class="grid">
      ${workshops.length > 0 ? `<div><div class="field-label">ورش العمل</div><ul class="activity-list">${workshops.map(w => `<li>${typeof w === "string" ? w : JSON.stringify(w)}</li>`).join("")}</ul></div>` : ""}
      ${confs.length > 0 ? `<div><div class="field-label">المؤتمرات</div><ul class="activity-list">${confs.map(c => `<li>${typeof c === "string" ? c : JSON.stringify(c)}</li>`).join("")}</ul></div>` : ""}
      ${trainings.length > 0 ? `<div><div class="field-label">الدورات التدريبية</div><ul class="activity-list">${trainings.map(t => `<li>${typeof t === "string" ? t : JSON.stringify(t)}</li>`).join("")}</ul></div>` : ""}
    </div>
    ${m.achievements ? `<div class="field" style="margin-top:8px"><div class="field-label">الإنجازات والمساهمات</div><div class="field-val">${m.achievements}</div></div>` : ""}
    ${m.skills ? `<div class="field"><div class="field-label">المهارات</div><div class="field-val">${m.skills}</div></div>` : ""}
  </div>` : ""}

  <!-- المراجع -->
  ${refs.length > 0 ? `
  <div class="section">
    <div class="section-title">المراجع الشخصية</div>
    <table>
      <thead><tr><th>الاسم</th><th>رقم الهاتف</th><th>الصلة / الصفة</th></tr></thead>
      <tbody>${refs.map(r => `<tr><td>${r.name || "—"}</td><td>${r.phone || "—"}</td><td>${r.relation || "—"}</td></tr>`).join("")}</tbody>
    </table>
  </div>` : ""}

  <!-- نوع العضوية والملاحظات -->
  <div class="section">
    <div class="section-title">بيانات العضوية</div>
    <div class="grid">
      ${field("نوع العضوية", MEMBERSHIP_LABELS[m.membership_type] || m.membership_type)}
      ${field("رقم العضوية", m.membership_no)}
    </div>
    ${m.notes ? `<div class="field" style="margin-top:8px"><div class="field-label">ملاحظات</div><div class="field-val">${m.notes}</div></div>` : ""}
    ${m.rejection_reason ? `<div class="field"><div class="field-label" style="color:#EF4444">سبب الرفض</div><div class="field-val" style="color:#EF4444">${m.rejection_reason}</div></div>` : ""}
  </div>

  <!-- التوقيعات -->
  <div class="sig-section">
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">توقيع مقدّم الطلب</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">توقيع المسؤول</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">ختم النقابة</div></div>
  </div>

  <div class="footer">
    <span>طُبع بتاريخ: ${new Date().toLocaleDateString("ar-SA")}</span>
    <span>${union?.name || ""} — نظام حصاحيصاوي</span>
  </div>
</div>
<script>window.onload = function(){ window.print(); }</script>
</body></html>`);
    printWin.document.close();
  }

  // Print bulk
  function printAll() {
    const filtered = members.filter(m => {
      if (filterStatus && m.status !== filterStatus) return false;
      if (filterUnion && String(m.union_id) !== filterUnion) return false;
      if (searchQ && !m.full_name.includes(searchQ) && !m.national_id?.includes(searchQ)) return false;
      return true;
    });
    if (!filtered.length) { alert("لا توجد نتائج للطباعة"); return; }
    const printWin = window.open("", "_blank", "width=900,height=700");
    if (!printWin) return;
    const rows = filtered.map((m, i) => {
      const union = unions.find(u => u.id === m.union_id);
      const s = STATUS_MAP[m.status] || { label: m.status, color: "#6B7280" };
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${m.full_name}</strong><br/><small>${m.national_id || "—"}</small></td>
        <td>${union?.name || "—"}</td>
        <td>${m.job_title || "—"}</td>
        <td>${m.specialty || "—"}</td>
        <td>${m.degree || "—"}</td>
        <td style="color:${s.color};font-weight:700">${s.label}</td>
        <td>${m.membership_no || "—"}</td>
        <td>${new Date(m.applied_at).toLocaleDateString("ar-SA")}</td>
      </tr>`;
    }).join("");
    printWin.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"/><title>قائمة الأعضاء</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
body{font-family:'Cairo',Arial;font-size:12px;direction:rtl;color:#1a1a1a}
h1{font-size:18px;color:#8B5CF6;border-bottom:2px solid #8B5CF6;padding-bottom:8px;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{background:#F3F4F6;padding:8px;font-weight:600;border:1px solid #e5e7eb;font-size:11px}
td{padding:7px 8px;border:1px solid #e5e7eb;font-size:12px}
tr:nth-child(even){background:#F9FAFB}
small{color:#6b7280;font-size:10px}
.footer{margin-top:16px;font-size:10px;color:#9CA3AF;text-align:center}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<h1>قائمة أعضاء النقابات — ${new Date().toLocaleDateString("ar-SA")}</h1>
<table>
<thead><tr><th>#</th><th>الاسم / الهوية</th><th>النقابة</th><th>المسمى</th><th>التخصص</th><th>المؤهل</th><th>الحالة</th><th>رقم العضوية</th><th>تاريخ التقديم</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<div class="footer">إجمالي: ${filtered.length} عضو — نظام حصاحيصاوي</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
    printWin.document.close();
  }

  // ── Helper ──
  const filteredMembers = members.filter(m => {
    if (searchQ) return m.full_name.includes(searchQ) || (m.national_id || "").includes(searchQ) || (m.phone || "").includes(searchQ);
    return true;
  });

  return (
    <div style={{ padding: "24px 28px", direction: "rtl", fontFamily: "'Cairo', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f0fdf4" }}>🏛️ النقابات المهنية</h1>
          <p style={{ margin: "4px 0 0", color: "hsl(215 20% 50%)", fontSize: 13 }}>إدارة النقابات والجمعيات المهنية وطلبات العضوية</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {tab === "unions" && (
            <button onClick={() => { setEditingUnion({ is_active: true, sort_order: 0 }); setShowUnionModal(true); }} style={btnS(UC)}>+ إضافة نقابة</button>
          )}
          {tab === "announcements" && (
            <button onClick={() => { setEditingAnn({ is_active: true, is_pinned: false }); setShowAnnModal(true); }} style={btnS(UC)}>+ إضافة إعلان</button>
          )}
          {tab === "programs" && (
            <button onClick={() => { setEditingProgram({ is_active: true, type: "event", sort_order: 0 }); setShowProgramModal(true); }} style={btnS(UC)}>+ إضافة برنامج</button>
          )}
          {tab === "laws" && (
            <button onClick={() => { setEditingLaw({ is_active: true, category: "bylaw", sort_order: 0 }); setShowLawModal(true); }} style={btnS(UC)}>+ إضافة وثيقة</button>
          )}
          {tab === "members" && (
            <button onClick={printAll} style={btnS("#F59E0B")}>🖨️ طباعة القائمة PDF</button>
          )}
        </div>
      </div>

      {error && <Err msg={error} onClose={() => setError("")} />}

      {/* Tabs */}
      <TabRow
        tabs={[
          { key: "unions",        label: "النقابات",   count: unions.length },
          { key: "members",       label: "الأعضاء",   count: members.length },
          { key: "announcements", label: "الإعلانات",  count: announcements.length },
          { key: "programs",      label: "البرامج",    count: programs.length },
          { key: "laws",          label: "القوانين",   count: laws.length },
        ]}
        active={tab}
        color={UC}
        onChange={v => setTab(v as any)}
      />

      {/* ══ تبويب النقابات ══ */}
      {tab === "unions" && (
        <div>
          {unionsLoading ? <Spinner /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 16 }}>
              {unions.map(u => (
                <div key={u.id} style={{ background: "hsl(222 47% 11%)", border: `1px solid ${UC}33`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${UC}, #6D28D9)` }} />
                  <div style={{ padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 24, background: UC + "30", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${UC}50` }}>
                        <span style={{ fontWeight: 700, fontSize: 20, color: UC }}>{(u.short_name || u.name).charAt(0)}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#f0fdf4" }}>{u.name}</div>
                        {u.field && <div style={{ fontSize: 12, color: UC + "cc", marginTop: 2 }}>{u.field}</div>}
                        {u.description && <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginTop: 4, lineHeight: 1.5 }}>{u.description}</div>}
                      </div>
                      <span style={{ ...bdgS(u.is_active ? "#22C55E" : "#EF4444") }}>{u.is_active ? "نشطة" : "موقوفة"}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      {u.members_total != null && <Pill icon="👥" val={`${u.members_total} طلب`} />}
                      {u.founded && <Pill icon="📅" val={`منذ ${u.founded}`} />}
                      {u.phone && <Pill icon="📞" val={u.phone} />}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setEditingUnion({ ...u }); setShowUnionModal(true); }} style={smBtn(UC)}>تعديل</button>
                      <button onClick={() => { setFilterUnion(String(u.id)); setTab("members"); }} style={smBtn("#22C55E")}>الأعضاء</button>
                      <button onClick={() => deleteUnion(u.id)} style={smBtn("#EF4444")}>حذف</button>
                    </div>
                  </div>
                </div>
              ))}
              {unions.length === 0 && <Empty msg="لا توجد نقابات بعد" />}
            </div>
          )}
        </div>
      )}

      {/* ══ تبويب الأعضاء ══ */}
      {tab === "members" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <input style={inputS} placeholder="🔍 بحث بالاسم أو الهوية..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            <select style={inputS} value={filterUnion} onChange={e => setFilterUnion(e.target.value)}>
              <option value="">كل النقابات</option>
              {unions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select style={inputS} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">كل الحالات</option>
              <option value="pending">قيد المراجعة</option>
              <option value="approved">مقبول</option>
              <option value="rejected">مرفوض</option>
            </select>
          </div>

          {membersLoading ? <Spinner /> : (
            <table style={tblS}>
              <thead>
                <tr>
                  {["الاسم", "النقابة", "الوظيفة", "المؤهل", "نوع العضوية", "الحالة", "تاريخ التقديم", "إجراءات"].map(h => (
                    <th key={h} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map(m => {
                  const s = STATUS_MAP[m.status] || { label: m.status, color: "#6B7280" };
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid hsl(222 47% 14%)" }}>
                      <td style={tdS}>
                        <div style={{ fontWeight: 700, color: "#f0fdf4", fontSize: 13 }}>{m.full_name}</div>
                        {m.national_id && <div style={{ fontSize: 11, color: "hsl(215 20% 45%)" }}>{m.national_id}</div>}
                        {m.phone && <div style={{ fontSize: 11, color: "hsl(215 20% 45%)" }}>{m.phone}</div>}
                      </td>
                      <td style={{ ...tdS, fontSize: 12, color: UC + "cc" }}>{m.union_name || "—"}</td>
                      <td style={tdS}>
                        <div style={{ fontSize: 12, color: "#f0fdf4" }}>{m.job_title || "—"}</div>
                        {m.specialty && <div style={{ fontSize: 11, color: "hsl(215 20% 45%)" }}>{m.specialty}</div>}
                      </td>
                      <td style={{ ...tdS, fontSize: 12, color: "hsl(215 20% 60%)" }}>{m.degree || "—"}</td>
                      <td style={tdS}><span style={{ ...bdgS(UC) }}>{MEMBERSHIP_LABELS[m.membership_type] || m.membership_type}</span></td>
                      <td style={tdS}>
                        <span style={{ ...bdgS(s.color) }}>{s.label}</span>
                        {m.membership_no && <div style={{ fontSize: 10, color: "#22C55E", marginTop: 3 }}>#{m.membership_no}</div>}
                      </td>
                      <td style={{ ...tdS, fontSize: 12, color: "hsl(215 20% 50%)" }}>
                        {new Date(m.applied_at).toLocaleDateString("ar-SA")}
                      </td>
                      <td style={tdS}>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button onClick={() => { setViewingMember(m); setStatusForm({ status: m.status, rejection_reason: m.rejection_reason || "", membership_no: m.membership_no || "", notes: m.notes || "" }); setShowStatusModal(true); }} style={smBtn(UC)}>مراجعة</button>
                          <button onClick={() => printMember(m)} style={smBtn("#F59E0B")}>PDF</button>
                          <button onClick={() => deleteMember(m.id)} style={smBtn("#EF4444")}>حذف</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredMembers.length === 0 && (
                  <tr><td colSpan={8} style={{ ...tdS, textAlign: "center", color: "hsl(215 20% 40%)", padding: 40 }}>لا توجد نتائج</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ تبويب الإعلانات ══ */}
      {tab === "announcements" && (
        <div>
          {annLoading ? <Spinner /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 14 }}>
              {announcements.map(a => (
                <div key={a.id} style={{ background: "hsl(222 47% 11%)", border: `1px solid ${a.is_pinned ? "#F59E0B55" : "hsl(222 47% 18%)"}`, borderRadius: 12, padding: "14px 16px" }}>
                  {a.is_pinned && <div style={{ color: "#F59E0B", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>📌 مثبّت</div>}
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#f0fdf4", marginBottom: 4 }}>{a.title}</div>
                  {a.union_name && <div style={{ fontSize: 12, color: UC + "cc", marginBottom: 6 }}>{a.union_name}</div>}
                  {a.body && <p style={{ margin: "0 0 8px", fontSize: 12, color: "hsl(215 20% 55%)", lineHeight: 1.6 }}>{a.body}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "hsl(215 20% 40%)" }}>{new Date(a.created_at).toLocaleDateString("ar-SA")}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setEditingAnn({ ...a }); setShowAnnModal(true); }} style={smBtn(UC)}>تعديل</button>
                      <button onClick={() => deleteAnn(a.id)} style={smBtn("#EF4444")}>حذف</button>
                    </div>
                  </div>
                </div>
              ))}
              {announcements.length === 0 && <Empty msg="لا توجد إعلانات بعد" />}
            </div>
          )}
        </div>
      )}

      {/* ══ تبويب البرامج ══ */}
      {tab === "programs" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <select style={inputS} value={programUnionFilter} onChange={e => setProgramUnionFilter(e.target.value)}>
              <option value="">كل النقابات</option>
              {unions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select style={inputS} value={programTypeFilter} onChange={e => setProgramTypeFilter(e.target.value)}>
              <option value="">كل الأنواع</option>
              <option value="event">فعالية</option>
              <option value="training">تدريب</option>
              <option value="workshop">ورشة عمل</option>
              <option value="course">دورة</option>
            </select>
          </div>
          {programsLoading ? <Spinner /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 14 }}>
              {programs.map(p => {
                const TYPE_ICONS: Record<string,string> = { training: "🎓", event: "🎉", workshop: "🔧", course: "📚" };
                const TYPE_LABELS: Record<string,string> = { training: "تدريب", event: "فعالية", workshop: "ورشة عمل", course: "دورة" };
                return (
                  <div key={p.id} style={{ background: "hsl(222 47% 11%)", border: `1px solid ${UC}33`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ height: 3, background: `linear-gradient(90deg, ${UC}, #6D28D9)` }} />
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 18 }}>{TYPE_ICONS[p.type] || "📌"}</span>
                        <span style={{ ...bdgS(UC), fontSize: 11 }}>{TYPE_LABELS[p.type] || p.type}</span>
                        {p.union_name && <span style={{ fontSize: 11, color: UC + "bb" }}>{p.union_name}</span>}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#f0fdf4", marginBottom: 6 }}>{p.title}</div>
                      {p.description && <p style={{ margin: "0 0 8px", fontSize: 12, color: "hsl(215 20% 55%)", lineHeight: 1.5 }}>{p.description}</p>}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {p.start_date && <Pill icon="📅" val={p.start_date} />}
                        {p.end_date && p.end_date !== p.start_date && <Pill icon="🏁" val={p.end_date} />}
                        {p.location && <Pill icon="📍" val={p.location} />}
                        {p.fee && <Pill icon="💰" val={p.fee} />}
                        {p.max_participants && <Pill icon="👥" val={`${p.max_participants} مشارك`} />}
                        {p.contact && <Pill icon="📞" val={p.contact} />}
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "hsl(215 20% 40%)" }}>{new Date(p.created_at).toLocaleDateString("ar-SA")}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { setEditingProgram({ ...p }); setShowProgramModal(true); }} style={smBtn(UC)}>تعديل</button>
                          <button onClick={() => deleteProgram(p.id)} style={smBtn("#EF4444")}>حذف</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {programs.length === 0 && <Empty msg="لا توجد برامج بعد" />}
            </div>
          )}
        </div>
      )}

      {/* ══ تبويب القوانين ══ */}
      {tab === "laws" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <select style={inputS} value={lawUnionFilter} onChange={e => setLawUnionFilter(e.target.value)}>
              <option value="">كل النقابات</option>
              {unions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select style={inputS} value={lawCatFilter} onChange={e => setLawCatFilter(e.target.value)}>
              <option value="">كل التصنيفات</option>
              <option value="bylaw">لائحة</option>
              <option value="regulation">نظام داخلي</option>
              <option value="policy">سياسة</option>
              <option value="decision">قرار</option>
            </select>
          </div>
          {lawsLoading ? <Spinner /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {laws.map(l => {
                const CAT_LABELS: Record<string,string> = { bylaw: "لائحة", regulation: "نظام داخلي", policy: "سياسة", decision: "قرار" };
                const CAT_COLORS: Record<string,string> = { bylaw: "#8B5CF6", regulation: "#0EA5E9", policy: "#22C55E", decision: "#F59E0B" };
                const cc = CAT_COLORS[l.category] || UC;
                const expanded = expandedLaw === l.id;
                return (
                  <div key={l.id} style={{ background: "hsl(222 47% 11%)", border: `1px solid hsl(222 47% 18%)`, borderRadius: 12, overflow: "hidden", borderRight: `4px solid ${cc}` }}>
                    <div style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                      onClick={() => setExpandedLaw(expanded ? null : l.id)}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ ...bdgS(cc), fontSize: 11 }}>{CAT_LABELS[l.category] || l.category}</span>
                          {l.union_name && <span style={{ fontSize: 11, color: UC + "bb" }}>{l.union_name}</span>}
                          {l.version && <span style={{ fontSize: 10, color: "hsl(215 20% 45%)" }}>v{l.version}</span>}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#f0fdf4" }}>{l.title}</div>
                        {l.effective_date && <div style={{ fontSize: 11, color: "hsl(215 20% 45%)", marginTop: 4 }}>نافذة منذ: {l.effective_date}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button onClick={e => { e.stopPropagation(); setEditingLaw({ ...l }); setShowLawModal(true); }} style={smBtn(UC)}>تعديل</button>
                        <button onClick={e => { e.stopPropagation(); deleteLaw(l.id); }} style={smBtn("#EF4444")}>حذف</button>
                        <span style={{ color: "hsl(215 20% 45%)", fontSize: 16 }}>{expanded ? "▲" : "▼"}</span>
                      </div>
                    </div>
                    {expanded && l.body && (
                      <div style={{ padding: "0 16px 14px", borderTop: "1px solid hsl(222 47% 16%)" }}>
                        <p style={{ margin: "12px 0 0", fontSize: 13, color: "hsl(215 20% 60%)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{l.body}</p>
                        {l.document_url && (
                          <a href={l.document_url} target="_blank" rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, color: "#F59E0B", fontSize: 13, fontWeight: 600 }}>
                            📄 تحميل الوثيقة الكاملة
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {laws.length === 0 && <Empty msg="لا توجد قوانين ولوائح بعد" />}
            </div>
          )}
        </div>
      )}

      {/* ══ Modal: نقابة ══ */}
      {showUnionModal && editingUnion && (
        <Modal2 title={editingUnion.id ? "تعديل النقابة" : "إضافة نقابة"} onClose={() => setShowUnionModal(false)}>
          <div style={fGrid}>
            <FField label="الاسم الكامل *"><input style={fInput} value={editingUnion.name || ""} onChange={e => setEditingUnion(p => ({ ...p!, name: e.target.value }))} /></FField>
            <FField label="الاسم المختصر"><input style={fInput} value={editingUnion.short_name || ""} onChange={e => setEditingUnion(p => ({ ...p!, short_name: e.target.value }))} /></FField>
            <FField label="المجال / التخصص"><input style={fInput} value={editingUnion.field || ""} onChange={e => setEditingUnion(p => ({ ...p!, field: e.target.value }))} placeholder="هندسة، طب، معلمون..." /></FField>
            <FField label="الهاتف"><input style={fInput} value={editingUnion.phone || ""} onChange={e => setEditingUnion(p => ({ ...p!, phone: e.target.value }))} /></FField>
            <FField label="البريد الإلكتروني"><input style={fInput} value={editingUnion.email || ""} onChange={e => setEditingUnion(p => ({ ...p!, email: e.target.value }))} /></FField>
            <FField label="الموقع الإلكتروني"><input style={fInput} value={editingUnion.website || ""} onChange={e => setEditingUnion(p => ({ ...p!, website: e.target.value }))} /></FField>
            <FField label="سنة التأسيس"><input style={fInput} value={editingUnion.founded || ""} onChange={e => setEditingUnion(p => ({ ...p!, founded: e.target.value }))} /></FField>
            <FField label="عدد الأعضاء (تقريبي)"><input style={fInput} value={editingUnion.members_count || ""} onChange={e => setEditingUnion(p => ({ ...p!, members_count: e.target.value }))} placeholder="+٥٠٠ عضو" /></FField>
            <FField label="الوصف" full><textarea style={{ ...fInput, minHeight: 80 }} value={editingUnion.description || ""} onChange={e => setEditingUnion(p => ({ ...p!, description: e.target.value }))} /></FField>
            <FField label="العنوان" full><textarea style={{ ...fInput, minHeight: 60 }} value={editingUnion.address || ""} onChange={e => setEditingUnion(p => ({ ...p!, address: e.target.value }))} /></FField>
            <FField label="الترتيب"><input type="number" style={fInput} value={editingUnion.sort_order ?? 0} onChange={e => setEditingUnion(p => ({ ...p!, sort_order: Number(e.target.value) }))} /></FField>
          </div>
          {error && <div style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <ModalActions onClose={() => setShowUnionModal(false)} onSave={saveUnion} saving={saving} color={UC} />
        </Modal2>
      )}

      {/* ══ Modal: مراجعة عضو ══ */}
      {showStatusModal && viewingMember && (
        <Modal2 title={`مراجعة طلب — ${viewingMember.full_name}`} onClose={() => setShowStatusModal(false)} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px", marginBottom: 20 }}>
            {/* معاينة سريعة */}
            <div style={{ gridColumn: "1/-1", background: "hsl(222 47% 8%)", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px", fontSize: 13 }}>
                <InfoItem label="النقابة" val={viewingMember.union_name || "—"} />
                <InfoItem label="الوظيفة" val={viewingMember.job_title || "—"} />
                <InfoItem label="التخصص" val={viewingMember.specialty || "—"} />
                <InfoItem label="المؤهل" val={viewingMember.degree || "—"} />
                <InfoItem label="جهة العمل" val={viewingMember.employer || "—"} />
                <InfoItem label="الهاتف" val={viewingMember.phone || "—"} />
              </div>
            </div>
            {/* الحالة */}
            <FField label="الحالة الجديدة">
              <select style={fInput} value={statusForm.status} onChange={e => setStatusForm(p => ({ ...p, status: e.target.value }))}>
                <option value="pending">قيد المراجعة</option>
                <option value="approved">قبول الطلب</option>
                <option value="rejected">رفض الطلب</option>
              </select>
            </FField>
            <FField label="رقم العضوية (عند القبول)">
              <input style={fInput} value={statusForm.membership_no} onChange={e => setStatusForm(p => ({ ...p, membership_no: e.target.value }))} placeholder="UN-2024-001" />
            </FField>
            <FField label="سبب الرفض (عند الرفض)" full>
              <input style={fInput} value={statusForm.rejection_reason} onChange={e => setStatusForm(p => ({ ...p, rejection_reason: e.target.value }))} />
            </FField>
            <FField label="ملاحظات" full>
              <textarea style={{ ...fInput, minHeight: 64 }} value={statusForm.notes} onChange={e => setStatusForm(p => ({ ...p, notes: e.target.value }))} />
            </FField>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
            <button onClick={() => printMember(viewingMember)} style={smBtn("#F59E0B")}>🖨️ طباعة PDF</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowStatusModal(false)} style={cancelS}>إلغاء</button>
              <button onClick={updateMemberStatus} disabled={saving} style={btnS(UC)}>{saving ? "جارٍ الحفظ…" : "حفظ الحالة"}</button>
            </div>
          </div>
        </Modal2>
      )}

      {/* ══ Modal: إعلان ══ */}
      {showAnnModal && editingAnn && (
        <Modal2 title={editingAnn.id ? "تعديل الإعلان" : "إضافة إعلان"} onClose={() => setShowAnnModal(false)}>
          <div style={fGrid}>
            <FField label="النقابة">
              <select style={fInput} value={editingAnn.union_id || ""} onChange={e => setEditingAnn(p => ({ ...p!, union_id: e.target.value ? Number(e.target.value) : undefined }))}>
                <option value="">كل النقابات</option>
                {unions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </FField>
            <FField label="تثبيت الإعلان">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={!!editingAnn.is_pinned} onChange={e => setEditingAnn(p => ({ ...p!, is_pinned: e.target.checked }))} />
                <span style={{ fontSize: 13, color: "hsl(215 20% 65%)" }}>مثبّت في الأعلى</span>
              </label>
            </FField>
            <FField label="عنوان الإعلان *" full><input style={fInput} value={editingAnn.title || ""} onChange={e => setEditingAnn(p => ({ ...p!, title: e.target.value }))} /></FField>
            <FField label="نص الإعلان" full><textarea style={{ ...fInput, minHeight: 80 }} value={editingAnn.body || ""} onChange={e => setEditingAnn(p => ({ ...p!, body: e.target.value }))} /></FField>
            <FField label="رابط خارجي"><input style={fInput} value={editingAnn.link || ""} onChange={e => setEditingAnn(p => ({ ...p!, link: e.target.value }))} placeholder="https://..." /></FField>
          </div>
          {error && <div style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <ModalActions onClose={() => setShowAnnModal(false)} onSave={saveAnn} saving={saving} color={UC} />
        </Modal2>
      )}

      {/* ══ Modal: برنامج ══ */}
      {showProgramModal && editingProgram && (
        <Modal2 title={editingProgram.id ? "تعديل البرنامج" : "إضافة برنامج"} onClose={() => setShowProgramModal(false)}>
          <div style={fGrid}>
            <FField label="النقابة">
              <select style={fInput} value={editingProgram.union_id || ""} onChange={e => setEditingProgram(p => ({ ...p!, union_id: e.target.value ? Number(e.target.value) : undefined }))}>
                <option value="">غير مرتبط بنقابة</option>
                {unions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </FField>
            <FField label="نوع البرنامج">
              <select style={fInput} value={editingProgram.type || "event"} onChange={e => setEditingProgram(p => ({ ...p!, type: e.target.value }))}>
                <option value="event">فعالية 🎉</option>
                <option value="training">تدريب 🎓</option>
                <option value="workshop">ورشة عمل 🔧</option>
                <option value="course">دورة 📚</option>
              </select>
            </FField>
            <FField label="عنوان البرنامج *" full><input style={fInput} value={editingProgram.title || ""} onChange={e => setEditingProgram(p => ({ ...p!, title: e.target.value }))} /></FField>
            <FField label="الوصف" full><textarea style={{ ...fInput, minHeight: 80 }} value={editingProgram.description || ""} onChange={e => setEditingProgram(p => ({ ...p!, description: e.target.value }))} /></FField>
            <FField label="تاريخ البداية"><input type="date" style={fInput} value={editingProgram.start_date || ""} onChange={e => setEditingProgram(p => ({ ...p!, start_date: e.target.value }))} /></FField>
            <FField label="تاريخ النهاية"><input type="date" style={fInput} value={editingProgram.end_date || ""} onChange={e => setEditingProgram(p => ({ ...p!, end_date: e.target.value }))} /></FField>
            <FField label="المكان"><input style={fInput} value={editingProgram.location || ""} onChange={e => setEditingProgram(p => ({ ...p!, location: e.target.value }))} placeholder="قاعة المؤتمرات، الحصاحيصا" /></FField>
            <FField label="الرسوم"><input style={fInput} value={editingProgram.fee || ""} onChange={e => setEditingProgram(p => ({ ...p!, fee: e.target.value }))} placeholder="مجاناً / ٥٠٠ جنيه" /></FField>
            <FField label="أقصى عدد مشاركين"><input type="number" style={fInput} value={editingProgram.max_participants || ""} onChange={e => setEditingProgram(p => ({ ...p!, max_participants: Number(e.target.value) }))} /></FField>
            <FField label="جهة الاتصال"><input style={fInput} value={editingProgram.contact || ""} onChange={e => setEditingProgram(p => ({ ...p!, contact: e.target.value }))} /></FField>
            <FField label="رابط التسجيل" full><input style={fInput} value={editingProgram.link || ""} onChange={e => setEditingProgram(p => ({ ...p!, link: e.target.value }))} placeholder="https://..." /></FField>
          </div>
          {error && <div style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <ModalActions onClose={() => setShowProgramModal(false)} onSave={saveProgram} saving={saving} color={UC} />
        </Modal2>
      )}

      {/* ══ Modal: قانون / لائحة ══ */}
      {showLawModal && editingLaw && (
        <Modal2 title={editingLaw.id ? "تعديل الوثيقة" : "إضافة وثيقة قانونية"} onClose={() => setShowLawModal(false)} wide>
          <div style={fGrid}>
            <FField label="النقابة">
              <select style={fInput} value={editingLaw.union_id || ""} onChange={e => setEditingLaw(p => ({ ...p!, union_id: e.target.value ? Number(e.target.value) : undefined }))}>
                <option value="">غير مرتبط بنقابة</option>
                {unions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </FField>
            <FField label="تصنيف الوثيقة">
              <select style={fInput} value={editingLaw.category || "bylaw"} onChange={e => setEditingLaw(p => ({ ...p!, category: e.target.value }))}>
                <option value="bylaw">لائحة</option>
                <option value="regulation">نظام داخلي</option>
                <option value="policy">سياسة</option>
                <option value="decision">قرار</option>
              </select>
            </FField>
            <FField label="عنوان الوثيقة *" full><input style={fInput} value={editingLaw.title || ""} onChange={e => setEditingLaw(p => ({ ...p!, title: e.target.value }))} /></FField>
            <FField label="نص الوثيقة" full><textarea style={{ ...fInput, minHeight: 140 }} value={editingLaw.body || ""} onChange={e => setEditingLaw(p => ({ ...p!, body: e.target.value }))} /></FField>
            <FField label="تاريخ السريان"><input type="date" style={fInput} value={editingLaw.effective_date || ""} onChange={e => setEditingLaw(p => ({ ...p!, effective_date: e.target.value }))} /></FField>
            <FField label="رقم الإصدار"><input style={fInput} value={editingLaw.version || ""} onChange={e => setEditingLaw(p => ({ ...p!, version: e.target.value }))} placeholder="1.0" /></FField>
            <FField label="رابط الوثيقة (PDF)" full><input style={fInput} value={editingLaw.document_url || ""} onChange={e => setEditingLaw(p => ({ ...p!, document_url: e.target.value }))} placeholder="https://..." /></FField>
          </div>
          {error && <div style={{ color: "#FCA5A5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <ModalActions onClose={() => setShowLawModal(false)} onSave={saveLaw} saving={saving} color={UC} />
        </Modal2>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function field(label: string, val?: string) {
  const v = val || "";
  return `<div class="field"><div class="field-label">${label}</div><div class="field-val ${!v ? "empty" : ""}">${v || "—"}</div></div>`;
}

function Spinner() {
  return <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 40%)" }}>جارٍ التحميل…</div>;
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ gridColumn: "1/-1", textAlign: "center", color: "hsl(215 20% 40%)", padding: 60 }}>{msg}</div>;
}

function Err({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div style={{ background: "#EF444422", border: "1px solid #EF4444", borderRadius: 8, padding: "10px 16px", color: "#FCA5A5", marginBottom: 16, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
      <span>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#FCA5A5", cursor: "pointer" }}>✕</button>
    </div>
  );
}

function TabRow({ tabs, active, color, onChange }: { tabs: { key: string; label: string; count: number }[]; active: string; color: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "hsl(222 47% 10%)", padding: 4, borderRadius: 12, width: "fit-content" }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: "7px 18px", borderRadius: 9, border: "none", cursor: "pointer",
          fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13,
          background: active === t.key ? color : "transparent",
          color: active === t.key ? "#fff" : "hsl(215 20% 55%)",
          display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s",
        }}>
          {t.label}
          <span style={{ padding: "0 6px", borderRadius: 10, fontSize: 11, background: active === t.key ? "#ffffff30" : "hsl(222 47% 18%)", color: active === t.key ? "#fff" : "hsl(215 20% 55%)" }}>
            {t.count}
          </span>
        </button>
      ))}
    </div>
  );
}

function Modal2({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(222 47% 18%)", width: "100%", maxWidth: wide ? 860 : 680, maxHeight: "90vh", overflow: "auto", direction: "rtl" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid hsl(222 47% 14%)" }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "#f0fdf4", fontFamily: "'Cairo', sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "hsl(215 20% 50%)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ padding: "20px" }}>{children}</div>
      </div>
    </div>
  );
}

function FField({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? "1/-1" : undefined }}>
      <label style={{ display: "block", fontSize: 12, color: "hsl(215 20% 55%)", marginBottom: 5, fontFamily: "'Cairo', sans-serif" }}>{label}</label>
      {children}
    </div>
  );
}

function InfoItem({ label, val }: { label: string; val: string }) {
  return (
    <span><span style={{ color: "hsl(215 20% 50%)", marginLeft: 4 }}>{label}:</span><span style={{ color: "#f0fdf4", fontWeight: 600 }}>{val}</span></span>
  );
}

function Pill({ icon, val }: { icon: string; val: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 8, background: "hsl(222 47% 14%)", fontSize: 11, color: "hsl(215 20% 60%)" }}>
      {icon} {val}
    </span>
  );
}

function ModalActions({ onClose, onSave, saving, color }: { onClose: () => void; onSave: () => void; saving: boolean; color: string }) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
      <button onClick={onClose} style={cancelS}>إلغاء</button>
      <button onClick={onSave} disabled={saving} style={btnS(color)}>{saving ? "جارٍ الحفظ…" : "حفظ"}</button>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const btnS = (c: string): React.CSSProperties => ({ padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13, background: c, color: "#fff" });
const smBtn = (c: string): React.CSSProperties => ({ padding: "5px 12px", borderRadius: 8, border: `1px solid ${c}50`, background: c + "18", color: c, cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 12 });
const cancelS: React.CSSProperties = { padding: "8px 18px", borderRadius: 10, border: "1px solid hsl(222 47% 22%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 13 };
const bdgS = (c: string): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: c + "22", color: c, border: `1px solid ${c}44` });
const fInput: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid hsl(222 47% 22%)", background: "hsl(222 47% 8%)", color: "#f0fdf4", fontSize: 13, fontFamily: "'Cairo', sans-serif", boxSizing: "border-box" };
const fGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 18px" };
const tblS: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "hsl(222 47% 11%)", borderRadius: 12, overflow: "hidden", border: "1px solid hsl(222 47% 14%)" };
const thS: React.CSSProperties = { padding: "12px 14px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "hsl(215 20% 50%)", background: "hsl(222 47% 10%)", borderBottom: "1px solid hsl(222 47% 14%)", fontFamily: "'Cairo', sans-serif" };
const tdS: React.CSSProperties = { padding: "11px 14px", verticalAlign: "middle", fontFamily: "'Cairo', sans-serif" };
const inputS: React.CSSProperties = { padding: "9px 14px", borderRadius: 9, border: "1px solid hsl(222 47% 22%)", background: "hsl(222 47% 8%)", color: "#f0fdf4", fontSize: 13, fontFamily: "'Cairo', sans-serif", minWidth: 180 };
