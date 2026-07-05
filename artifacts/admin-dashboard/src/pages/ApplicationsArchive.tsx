import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";
import { toast } from "sonner";

type ArchiveSource = "merchant" | "driver" | "travel_agency" | "women_service";

type ApplicationRecord = {
  archive_id: string;
  source: ArchiveSource;
  source_label: string;
  source_id: string | number;
  applicant_name: string;
  entity_name: string;
  phone?: string;
  email?: string;
  status: string;
  status_label: string;
  created_at?: string;
  archived_at: string;
  raw: Record<string, any>;
};

type Snapshot = {
  id: string;
  created_at: string;
  count: number;
  pending: number;
  records: ApplicationRecord[];
};

const ARCHIVE_KEY = "admin_join_applications_archive_v1";

const C = {
  bg: "hsl(222 47% 8%)",
  card: "hsl(222 47% 11%)",
  card2: "hsl(222 47% 9%)",
  border: "hsl(217 32% 18%)",
  text: "hsl(210 40% 92%)",
  muted: "hsl(215 20% 55%)",
  green: "#22c55e",
  orange: "#f59e0b",
  red: "#ef4444",
  blue: "#38bdf8",
  purple: "#c084fc",
};

const SOURCE_LABEL: Record<ArchiveSource, string> = {
  merchant: "طلب انضمام تاجر/متجر",
  driver: "طلب انضمام سائق",
  travel_agency: "طلب انضمام وكالة سفر",
  women_service: "طلب خدمة/مساحة نسائية",
};

function toText(v: any) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join("، ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function statusLabel(status: string) {
  const s = String(status || "").toLowerCase();
  if (["approved", "active", "true", "accepted"].includes(s)) return "معتمد";
  if (["rejected", "false"].includes(s)) return "مرفوض";
  if (["needs_info"].includes(s)) return "تحتاج معلومات";
  if (["pending", "waiting", "review"].includes(s)) return "بانتظار المراجعة";
  return status || "غير محدد";
}

function statusColor(status: string) {
  const label = statusLabel(status);
  if (label.includes("معتمد")) return C.green;
  if (label.includes("مرفوض")) return C.red;
  if (label.includes("معلومات")) return C.blue;
  return C.orange;
}

function normalizeMerchant(row: any): ApplicationRecord {
  const approved = !!row.is_approved;
  return {
    archive_id: `merchant-${row.id}`,
    source: "merchant",
    source_label: SOURCE_LABEL.merchant,
    source_id: row.id,
    applicant_name: row.owner_name || row.contact_name || "—",
    entity_name: row.shop_name || row.name || "متجر بدون اسم",
    phone: row.phone || row.whatsapp,
    email: row.email,
    status: approved ? "approved" : "pending",
    status_label: approved ? "معتمد" : "بانتظار المراجعة",
    created_at: row.created_at,
    archived_at: new Date().toISOString(),
    raw: row,
  };
}

function normalizeDriver(row: any): ApplicationRecord {
  return {
    archive_id: `driver-${row.id}`,
    source: "driver",
    source_label: SOURCE_LABEL.driver,
    source_id: row.id,
    applicant_name: row.name || row.user_name_ref || "سائق",
    entity_name: `${row.vehicle_type || "مركبة"}${row.plate ? ` · ${row.plate}` : ""}`,
    phone: row.phone,
    email: row.email,
    status: row.status || "pending",
    status_label: statusLabel(row.status || "pending"),
    created_at: row.created_at,
    archived_at: new Date().toISOString(),
    raw: row,
  };
}

function normalizeTravel(row: any): ApplicationRecord {
  return {
    archive_id: `travel-agency-${row.id}`,
    source: "travel_agency",
    source_label: SOURCE_LABEL.travel_agency,
    source_id: row.id,
    applicant_name: row.contact_name || "—",
    entity_name: row.agency_name || "وكالة سفر",
    phone: row.whatsapp || row.phone,
    email: row.email,
    status: row.status || "pending",
    status_label: statusLabel(row.status || "pending"),
    created_at: row.created_at,
    archived_at: new Date().toISOString(),
    raw: row,
  };
}

function normalizeWomen(row: any): ApplicationRecord {
  return {
    archive_id: `women-service-${row.id}`,
    source: "women_service",
    source_label: SOURCE_LABEL.women_service,
    source_id: row.id,
    applicant_name: row.owner_name || row.name || "—",
    entity_name: row.name || "خدمة نسائية",
    phone: row.phone,
    email: row.email,
    status: row.is_active ? "approved" : "pending",
    status_label: row.is_active ? "معتمدة/نشطة" : "غير نشطة/بانتظار",
    created_at: row.created_at,
    archived_at: new Date().toISOString(),
    raw: row,
  };
}

function readSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveSnapshots(items: Snapshot[]) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(items.slice(0, 25)));
}

function csvEscape(v: any) {
  const s = toText(v).replace(/\r?\n/g, " ");
  return `"${s.replace(/"/g, '""')}"`;
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(records: ApplicationRecord[]) {
  const headers = [
    "archive_id", "source", "source_label", "source_id", "applicant_name", "entity_name",
    "phone", "email", "status_label", "created_at", "archived_at", "raw_json",
  ];
  const rows = records.map(r => [
    r.archive_id, r.source, r.source_label, r.source_id, r.applicant_name, r.entity_name,
    r.phone, r.email, r.status_label, r.created_at, r.archived_at, JSON.stringify(r.raw),
  ].map(csvEscape).join(","));
  return "\ufeff" + headers.map(csvEscape).join(",") + "\n" + rows.join("\n");
}

function printRecord(record: ApplicationRecord) {
  const fields = Object.entries(record.raw || {})
    .map(([k, v]) => `<tr><th>${k}</th><td>${toText(v)}</td></tr>`).join("");
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />
<title>${record.source_label} #${record.source_id}</title>
<style>
body{font-family:Arial,Tahoma,sans-serif;background:#fff;color:#111;padding:28px;line-height:1.7}.head{border-bottom:3px solid #f97316;padding-bottom:14px;margin-bottom:18px}h1{margin:0;font-size:22px}.meta{color:#555}.box{border:1px solid #ddd;border-radius:12px;padding:14px;margin:12px 0}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #ddd;padding:8px;text-align:right;vertical-align:top}th{width:210px;background:#f8fafc} .stamp{margin-top:24px;color:#666;font-size:12px}@media print{button{display:none}}</style>
</head><body><button onclick="window.print()">طباعة / حفظ PDF</button><div class="head"><h1>استمارة أرشيف طلب انضمام</h1><div class="meta">${record.source_label} · رقم الطلب: ${record.source_id}</div></div><div class="box"><b>الاسم:</b> ${record.applicant_name}<br/><b>الجهة:</b> ${record.entity_name}<br/><b>الهاتف:</b> ${record.phone || "—"}<br/><b>الحالة:</b> ${record.status_label}<br/><b>تاريخ الطلب:</b> ${record.created_at || "—"}</div><table>${fields}</table><div class="stamp">تم إنشاء نسخة الأرشيف: ${new Date(record.archived_at).toLocaleString("ar-SA")}</div></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

export default function ApplicationsArchive() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>(readSnapshots());
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | ArchiveSource>("all");
  const [status, setStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [selected, setSelected] = useState<ApplicationRecord | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [merchantsRes, driversRes, travelRes, womenRes, archiveRes] = await Promise.allSettled([
        apiJson<any>("/admin/merchants"),
        apiJson<any[]>("/admin/transport/drivers"),
        apiJson<any>("/admin/travel-agencies/applications"),
        apiJson<any>("/admin/women-services"),
        apiJson<any>("/admin/join-application-archives"),
      ]);
      const next: ApplicationRecord[] = [];
      if (merchantsRes.status === "fulfilled") {
        const value = merchantsRes.value;
        const rows = Array.isArray(value?.merchants) ? value.merchants : Array.isArray(value) ? value : [];
        next.push(...rows.map(normalizeMerchant));
      }
      if (driversRes.status === "fulfilled") next.push(...(Array.isArray(driversRes.value) ? driversRes.value : []).map(normalizeDriver));
      if (travelRes.status === "fulfilled") {
        const rows = Array.isArray(travelRes.value?.applications) ? travelRes.value.applications : [];
        next.push(...rows.map(normalizeTravel));
      }
      if (womenRes.status === "fulfilled") {
        const rows = Array.isArray(womenRes.value?.services) ? womenRes.value.services : [];
        next.push(...rows.map(normalizeWomen));
      }
      next.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setRecords(next);
      if (archiveRes.status === "fulfilled" && Array.isArray(archiveRes.value?.archives)) {
        const serverSnapshots = archiveRes.value.archives.map((a: any) => ({
          id: a.snapshot_id || String(a.id),
          created_at: a.created_at,
          count: Number(a.total_count || 0),
          pending: Number(a.pending_count || 0),
          records: [],
        }));
        const local = readSnapshots();
        const merged = [...serverSnapshots, ...local].filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i).slice(0, 25);
        setSnapshots(merged);
        saveSnapshots(merged);
      }
      toast.success(`تم تحميل ${next.length} استمارة`);
    } catch {
      toast.error("تعذر تحميل الأرشيف");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => records.filter(r => {
    const q = query.trim();
    if (source !== "all" && r.source !== source) return false;
    const label = r.status_label;
    if (status === "pending" && !label.includes("انتظار") && !label.includes("مراجعة") && !label.includes("غير نشطة")) return false;
    if (status === "approved" && !label.includes("معتمد") && !label.includes("نشطة")) return false;
    if (status === "rejected" && !label.includes("مرفوض")) return false;
    if (q && ![r.applicant_name, r.entity_name, r.phone, r.email, r.source_label, r.status_label].some(x => toText(x).includes(q))) return false;
    return true;
  }), [records, query, source, status]);

  const pendingCount = records.filter(r => r.status_label.includes("انتظار") || r.status_label.includes("مراجعة") || r.status_label.includes("غير نشطة")).length;

  async function archiveCurrent() {
    const snapshot: Snapshot = {
      id: `archive-${Date.now()}`,
      created_at: new Date().toISOString(),
      count: records.length,
      pending: pendingCount,
      records,
    };
    const next = [snapshot, ...snapshots];
    setSnapshots(next);
    saveSnapshots(next);
    try {
      const res = await apiFetch("/admin/join-application-archives", {
        method: "POST",
        body: JSON.stringify({ snapshot_id: snapshot.id, records, note: "manual-dashboard-archive" }),
      });
      if (res.ok) toast.success("تمت أرشفة اللقطة في قاعدة البيانات");
      else toast.warning("حُفظت اللقطة محلياً، وتعذر حفظها في الخادم");
    } catch {
      toast.warning("حُفظت اللقطة محلياً، وتعذر حفظها في الخادم");
    }
  }

  function downloadAllJson() {
    const payload = { exported_at: new Date().toISOString(), total: filtered.length, records: filtered };
    download(`join-applications-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  }

  function downloadAllCsv() {
    download(`join-applications-${Date.now()}.csv`, toCsv(filtered), "text/csv;charset=utf-8");
  }

  function downloadSnapshots() {
    download(`join-applications-archive-snapshots-${Date.now()}.json`, JSON.stringify({ exported_at: new Date().toISOString(), snapshots }, null, 2), "application/json;charset=utf-8");
  }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <PageHeader
        title="أرشيف استمارات الانضمام"
        subtitle="تحميل، حفظ، وطباعة طلبات الانضمام للرجوع إليها عند النزاعات والمراجعات"
        action={<button onClick={load} style={btn(C.blue)}>{loading ? "جاري التحميل..." : "تحديث"}</button>}
      />

      <main style={{ padding: 24, display: "grid", gap: 16 }}>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          <Kpi title="كل الاستمارات" value={records.length} color={C.blue} />
          <Kpi title="بانتظار المراجعة" value={pendingCount} color={C.orange} />
          <Kpi title="الأرشيفات المحفوظة" value={snapshots.length} color={C.purple} />
          <Kpi title="المعروض الآن" value={filtered.length} color={C.green} />
        </section>

        <section style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث بالاسم، الهاتف، الجهة..." style={input} />
            <select value={source} onChange={e => setSource(e.target.value as any)} style={input}>
              <option value="all">كل أنواع الانضمام</option>
              <option value="merchant">التجار والمتاجر</option>
              <option value="driver">السائقون</option>
              <option value="travel_agency">وكالات السفر</option>
              <option value="women_service">خدمات المرأة</option>
            </select>
            <select value={status} onChange={e => setStatus(e.target.value as any)} style={input}>
              <option value="all">كل الحالات</option>
              <option value="pending">بانتظار</option>
              <option value="approved">معتمد</option>
              <option value="rejected">مرفوض</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={downloadAllCsv} style={btn(C.green)}>تحميل CSV</button>
            <button onClick={downloadAllJson} style={btn(C.blue)}>تحميل JSON كامل</button>
            <button onClick={archiveCurrent} style={btn(C.orange)}>أرشفة لقطة حالية</button>
            <button onClick={downloadSnapshots} style={btn(C.purple)} disabled={!snapshots.length}>تحميل الأرشيفات</button>
          </div>
        </section>

        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>الاستمارات</h3>
            <span style={{ color: C.muted, fontSize: 12 }}>اضغط على أي استمارة للتفاصيل أو الطباعة</span>
          </div>
          {loading ? (
            <div style={{ padding: 50, textAlign: "center", color: C.muted }}>جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 50, textAlign: "center", color: C.muted }}>لا توجد استمارات مطابقة</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {filtered.map(record => (
                <button key={record.archive_id} onClick={() => setSelected(record)} style={{ ...rowCard, textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={sourceBadge(record.source)}>{record.source_label}</span>
                    <b style={{ flex: 1 }}>{record.entity_name}</b>
                    <span style={{ color: statusColor(record.status), border: `1px solid ${statusColor(record.status)}55`, borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 900 }}>{record.status_label}</span>
                  </div>
                  <div style={{ color: C.muted, marginTop: 7, fontSize: 12 }}>
                    مقدم الطلب: {record.applicant_name || "—"} · الهاتف: {record.phone || "—"} · التاريخ: {record.created_at ? new Date(record.created_at).toLocaleString("ar-SA") : "—"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>لقطات الأرشيف المحفوظة</h3>
          {snapshots.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13 }}>لم يتم حفظ أي لقطة بعد. استخدم زر “أرشفة لقطة حالية”.</div>
          ) : snapshots.map(s => (
            <div key={s.id} style={{ ...rowCard, cursor: "default", marginBottom: 8 }}>
              <b>أرشيف {new Date(s.created_at).toLocaleString("ar-SA")}</b>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>{s.count} استمارة · {s.pending} بانتظار المراجعة</div>
            </div>
          ))}
        </section>
      </main>

      {selected && (
        <div onClick={e => e.target === e.currentTarget && setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 20 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, width: "min(760px, 96vw)", maxHeight: "88vh", overflow: "auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{selected.entity_name}</h2>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{selected.source_label} · رقم {selected.source_id}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => printRecord(selected)} style={btn(C.green)}>طباعة / PDF</button>
                <button onClick={() => setSelected(null)} style={btn(C.red)}>إغلاق</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
              <Info label="مقدم الطلب" value={selected.applicant_name} />
              <Info label="الهاتف" value={selected.phone || "—"} />
              <Info label="البريد" value={selected.email || "—"} />
              <Info label="الحالة" value={selected.status_label} />
            </div>
            <h3 style={{ margin: "12px 0", fontSize: 15 }}>البيانات الخام المحفوظة</h3>
            <div style={{ display: "grid", gap: 6 }}>
              {Object.entries(selected.raw || {}).map(([k, v]) => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, borderBottom: `1px solid ${C.border}`, padding: "7px 0" }}>
                  <b style={{ color: C.muted, fontSize: 12 }}>{k}</b>
                  <span style={{ fontSize: 13, wordBreak: "break-word" }}>{toText(v) || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ title, value, color }: { title: string; value: number; color: string }) {
  return <div style={{ ...card, padding: 16 }}><div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div><div style={{ color: C.muted, fontSize: 12 }}>{title}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 }}><div style={{ color: C.muted, fontSize: 11 }}>{label}</div><b style={{ fontSize: 13 }}>{value}</b></div>;
}

function btn(color: string): React.CSSProperties {
  return { background: color, color: "#07111f", border: "none", borderRadius: 10, padding: "9px 12px", fontWeight: 900, cursor: "pointer" };
}

const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, background: C.card2, color: C.text, borderRadius: 10, padding: "10px 12px", fontFamily: "inherit" };
const rowCard: React.CSSProperties = { border: `1px solid ${C.border}`, background: C.card2, color: C.text, borderRadius: 14, padding: 13, cursor: "pointer", fontFamily: "inherit" };
function sourceBadge(source: ArchiveSource): React.CSSProperties {
  const colors: Record<ArchiveSource, string> = { merchant: C.green, driver: C.orange, travel_agency: C.blue, women_service: C.purple };
  const color = colors[source];
  return { color, border: `1px solid ${color}55`, background: color + "15", borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 900 };
}
