import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/Layout";
import { apiFetch } from "@/lib/api";
import { useState } from "react";

const green  = "hsl(147 60% 42%)";
const card   = "hsl(222 47% 10%)";
const border = "hsl(217 32% 14%)";
const muted  = "hsl(215 20% 55%)";
const fg     = "hsl(210 40% 95%)";
const bg     = "hsl(222 47% 8%)";

type ActivityItem = {
  id: string;
  type: "user" | "post" | "transport" | "report" | "job" | "merchant" | "event" | "missing" | "ad";
  action: string;
  title: string;
  subtitle?: string;
  time: string;
  icon: string;
  color: string;
  status?: string;
};

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  user:      { icon: "👤", color: "#60a5fa", label: "مستخدم جديد" },
  post:      { icon: "📝", color: "#34d399", label: "منشور" },
  transport: { icon: "🚗", color: "hsl(147 60% 42%)", label: "مشوار" },
  report:    { icon: "📋", color: "#f87171", label: "بلاغ" },
  job:       { icon: "💼", color: "#818cf8", label: "وظيفة" },
  merchant:  { icon: "🏪", color: "#2dd4bf", label: "تاجر" },
  event:     { icon: "🎉", color: "#fb7185", label: "فعالية" },
  missing:   { icon: "🔍", color: "#f59e0b", label: "مفقود" },
  ad:        { icon: "📢", color: "#f59e0b", label: "إعلان" },
};

function useActivityLog() {
  return useQuery<ActivityItem[]>({
    queryKey: ["activity-log"],
    queryFn: async () => {
      const [usersR, postsR, tripsR, reportsR, jobsR, merchantsR, eventsR, missingR, adsR] = await Promise.allSettled([
        apiFetch("/admin/users?limit=8&sort=newest").then(r => r.ok ? r.json() : null),
        apiFetch("/admin/posts?limit=8&sort=newest").then(r => r.ok ? r.json() : null),
        apiFetch("/admin/transport/trips?limit=8&sort=newest").then(r => r.ok ? r.json() : null),
        apiFetch("/admin/reports?limit=8&sort=newest").then(r => r.ok ? r.json() : null),
        apiFetch("/admin/jobs?limit=8&sort=newest").then(r => r.ok ? r.json() : null),
        apiFetch("/admin/merchants?limit=8&sort=newest").then(r => r.ok ? r.json() : null),
        apiFetch("/admin/events?limit=8&sort=newest").then(r => r.ok ? r.json() : null),
        apiFetch("/admin/missing?limit=8&sort=newest").then(r => r.ok ? r.json() : null),
        apiFetch("/admin/ads?limit=8&sort=newest").then(r => r.ok ? r.json() : null),
      ]);

      const items: ActivityItem[] = [];

      const val = <T,>(r: PromiseSettledResult<T>): T | null =>
        r.status === "fulfilled" ? r.value : null;

      const users = val(usersR) as any;
      if (users?.users) {
        for (const u of users.users) {
          items.push({
            id: `user-${u.id}`,
            type: "user",
            action: "تسجيل مستخدم جديد",
            title: u.name || "مستخدم",
            subtitle: u.phone || u.email || "",
            time: u.created_at,
            icon: "👤", color: "#60a5fa",
          });
        }
      }

      const posts = val(postsR) as any;
      const postsArr = Array.isArray(posts) ? posts : posts?.posts ?? [];
      for (const p of postsArr) {
        items.push({
          id: `post-${p.id}`,
          type: "post",
          action: "منشور جديد",
          title: p.content?.slice(0, 60) || "منشور",
          subtitle: p.author_name || "",
          time: p.created_at,
          icon: "📝", color: "#34d399",
          status: p.status,
        });
      }

      const trips = val(tripsR) as any;
      const tripsArr = Array.isArray(trips) ? trips : trips?.trips ?? [];
      for (const t of tripsArr) {
        items.push({
          id: `trip-${t.id}`,
          type: "transport",
          action: `رحلة ${t.status === "completed" ? "مكتملة" : t.status === "pending" ? "قيد الانتظار" : t.status || ""}`,
          title: `${t.from_zone ?? ""} → ${t.to_zone ?? ""}`,
          subtitle: t.passenger_name || t.driver_name || "",
          time: t.created_at || t.requested_at,
          icon: "🚗", color: green,
          status: t.status,
        });
      }

      const reports = val(reportsR) as any;
      const reportsArr = Array.isArray(reports) ? reports : reports?.reports ?? [];
      for (const r of reportsArr) {
        items.push({
          id: `report-${r.id}`,
          type: "report",
          action: `بلاغ ${r.status === "open" ? "مفتوح" : ""}`,
          title: r.title || r.subject || "بلاغ مواطن",
          subtitle: r.reporter_name || "",
          time: r.created_at,
          icon: "📋", color: "#f87171",
          status: r.status,
        });
      }

      const jobs = val(jobsR) as any;
      const jobsArr = Array.isArray(jobs) ? jobs : jobs?.jobs ?? [];
      for (const j of jobsArr) {
        items.push({
          id: `job-${j.id}`,
          type: "job",
          action: "وظيفة جديدة",
          title: j.title || j.position || "وظيفة",
          subtitle: j.company || j.employer_name || "",
          time: j.created_at,
          icon: "💼", color: "#818cf8",
          status: j.status,
        });
      }

      const merchants = val(merchantsR) as any;
      const merchantsArr = Array.isArray(merchants) ? merchants : merchants?.merchants ?? [];
      for (const m of merchantsArr) {
        items.push({
          id: `merchant-${m.id}`,
          type: "merchant",
          action: "تاجر جديد",
          title: m.name || m.shop_name || "تاجر",
          subtitle: m.phone || m.category || "",
          time: m.created_at,
          icon: "🏪", color: "#2dd4bf",
          status: m.status,
        });
      }

      const events = val(eventsR) as any;
      const eventsArr = Array.isArray(events) ? events : events?.events ?? [];
      for (const e of eventsArr) {
        items.push({
          id: `event-${e.id}`,
          type: "event",
          action: "فعالية جديدة",
          title: e.title || "فعالية",
          subtitle: e.location || "",
          time: e.created_at,
          icon: "🎉", color: "#fb7185",
        });
      }

      const missing = val(missingR) as any;
      const missingArr = Array.isArray(missing) ? missing : missing?.persons ?? [];
      for (const m of missingArr) {
        items.push({
          id: `missing-${m.id}`,
          type: "missing",
          action: m.type === "found" ? "تم إيجاد شخص" : "بلاغ مفقود",
          title: m.name || "مجهول الهوية",
          subtitle: m.last_seen_location || m.found_location || "",
          time: m.created_at,
          icon: "🔍", color: "#f59e0b",
          status: m.type,
        });
      }

      const ads = val(adsR) as any;
      const adsArr = Array.isArray(ads) ? ads : ads?.ads ?? [];
      for (const a of adsArr) {
        items.push({
          id: `ad-${a.id}`,
          type: "ad",
          action: "إعلان جديد",
          title: a.title || "إعلان",
          subtitle: a.advertiser_name || "",
          time: a.created_at,
          icon: "📢", color: "#f59e0b",
          status: a.status,
        });
      }

      // Sort by time descending
      items.sort((a, b) => {
        const ta = a.time ? new Date(a.time).getTime() : 0;
        const tb = b.time ? new Date(b.time).getTime() : 0;
        return tb - ta;
      });

      return items.slice(0, 60);
    },
    refetchInterval: 30_000,
  });
}

function timeAgo(timeStr?: string): string {
  if (!timeStr) return "—";
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `منذ ${days} يوم`;
  return d.toLocaleDateString("ar-SA");
}

const FILTERS = [
  { id: "all",       label: "الكل",      icon: "⊞" },
  { id: "user",      label: "مستخدمون", icon: "👤" },
  { id: "post",      label: "منشورات",   icon: "📝" },
  { id: "transport", label: "مشاوير",    icon: "🚗" },
  { id: "report",    label: "بلاغات",    icon: "📋" },
  { id: "job",       label: "وظائف",     icon: "💼" },
  { id: "merchant",  label: "تجار",      icon: "🏪" },
  { id: "event",     label: "فعاليات",   icon: "🎉" },
  { id: "missing",   label: "مفقودات",   icon: "🔍" },
];

export default function ActivityLog() {
  const { data: items = [], isLoading, dataUpdatedAt } = useActivityLog();
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? items : items.filter(i => i.type === filter);

  const counts: Record<string, number> = {};
  for (const item of items) counts[item.type] = (counts[item.type] || 0) + 1;

  return (
    <div>
      <PageHeader
        title="سجل النشاط"
        subtitle={`آخر ${items.length} حدث في التطبيق · يتحدث تلقائياً كل 30 ثانية`}
        action={
          dataUpdatedAt ? (
            <span style={{ fontSize: 12, color: muted }}>
              آخر تحديث: {timeAgo(new Date(dataUpdatedAt).toISOString())}
            </span>
          ) : undefined
        }
      />

      <div style={{ padding: "20px 28px" }}>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {FILTERS.filter(f => f.id !== "all").map(f => (
            <div key={f.id} style={{
              background: card, border: `1px solid ${border}`, borderRadius: 12,
              padding: "12px 18px", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>{f.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: fg }}>{counts[f.id] ?? 0}</div>
                <div style={{ fontSize: 11, color: muted }}>{f.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: "6px 14px", borderRadius: 9999, border: `1px solid ${filter === f.id ? green : border}`,
                background: filter === f.id ? `${green}1a` : card,
                color: filter === f.id ? green : muted,
                fontWeight: filter === f.id ? 700 : 400,
                fontSize: 13, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              {f.icon} {f.label}
              {f.id !== "all" && counts[f.id] > 0 && (
                <span style={{
                  background: filter === f.id ? green : muted,
                  color: filter === f.id ? "#000" : "#fff",
                  borderRadius: 9999, padding: "0 6px", fontSize: 11, fontWeight: 700,
                }}>{counts[f.id]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 60, color: muted }}>جارٍ تحميل السجل...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: muted }}>لا توجد أحداث في هذه الفئة</div>
        ) : (
          <div style={{
            background: card, border: `1px solid ${border}`, borderRadius: 16,
            overflow: "hidden",
          }}>
            {filtered.map((item, idx) => (
              <div key={item.id} style={{
                display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 20px",
                borderBottom: idx < filtered.length - 1 ? `1px solid ${border}` : "none",
                transition: "background 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = bg)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: `${item.color}1a`, border: `1px solid ${item.color}40`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, marginTop: 2,
                }}>
                  {item.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: item.color, background: `${item.color}1a`, padding: "1px 8px", borderRadius: 9999 }}>
                      {item.action}
                    </span>
                    {item.status && (
                      <span style={{ fontSize: 11, color: muted }}>· {item.status}</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: fg, marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.title}
                  </div>
                  {item.subtitle && (
                    <div style={{ fontSize: 12, color: muted }}>{item.subtitle}</div>
                  )}
                </div>

                {/* Time */}
                <div style={{ fontSize: 12, color: muted, flexShrink: 0, textAlign: "left", marginTop: 4 }}>
                  {timeAgo(item.time)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
