import { useState, useEffect } from "react";
import { Link } from "wouter";
import { PageHeader } from "@/components/Layout";
import { apiJson } from "@/lib/api";
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const orange = "#f97316";
const C = {
  bg:      "hsl(222 47% 10%)",
  border:  "hsl(217 32% 14%)",
  muted:   "hsl(215 20% 50%)",
  text:    "hsl(210 40% 88%)",
  green:   "#34d399",
  blue:    "#60a5fa",
  purple:  "#c084fc",
  pink:    "#f472b6",
  yellow:  "#fbbf24",
  teal:    "#2dd4bf",
};

type FullStats = {
  users:         { cnt: string; admins: string; moderators: string; new_this_week: string };
  posts:         { cnt: string; today: string };
  jobs:          { cnt: string; active: string };
  reports:       { cnt: string; open: string };
  missing:       { cnt: string; lost: string; found: string };
  transport:     { total_trips: string; pending: string; active: string; completed: string; drivers: string; online_drivers: string };
  events:        { cnt: string };
  merchants:     { cnt: string; active: string };
  ads:           { cnt: string; active: string };
  sports:        { posts: string };
  notifications: { cnt: string; unread: string };
  zawajil?:      { total: string; pending: string; approved: string; completed: string };
};
type BasicStats = {
  totals: { total: number; admins: number; moderators: number; members: number };
  byNeighborhood: { neighborhood: string; count: number }[];
  recentUsers: any[];
};
type ChartData = {
  daily_activity: { date: string; users: number; posts: number }[];
  transport_pie:  { name: string; value: number; color: string }[];
  zawajil_bar:    { status: string; label: string; count: number; color: string }[];
  section_usage:  { section: string; label: string; count: number }[];
};

const ZAWAJIL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review:         { label: "قيد المراجعة",  color: C.yellow  },
  modification_requested: { label: "طلب تعديل",     color: C.purple  },
  approved:               { label: "مقبول",          color: C.blue    },
  preparing:              { label: "جاري التجهيز",   color: C.teal    },
  sending:                { label: "في الطريق",       color: orange    },
  completed:              { label: "مكتمل",           color: C.green   },
  rejected:               { label: "مرفوض",          color: "#f87171" },
  returned:               { label: "مُعاد",           color: C.muted   },
};

function StatCard({ label, value, sub, icon, color, link }: {
  label: string; value: string | number; sub?: string;
  icon: string; color: string; link?: string;
}) {
  const inner = (
    <div
      style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", display: "flex", alignItems: "center", gap: 13, cursor: link ? "pointer" : "default" }}
      onMouseEnter={e => link && (e.currentTarget.style.borderColor = color + "50")}
      onMouseLeave={e => link && (e.currentTarget.style.borderColor = C.border)}
    >
      <div style={{ width: 44, height: 44, borderRadius: 14, background: color + "18", border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "hsl(215 20% 40%)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
  return link ? <Link href={link} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ margin: "22px 0 10px", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 42%)", textTransform: "uppercase", letterSpacing: 1.5 }}>
      {children}
    </h3>
  );
}

function ChartCard({ title, children, height = 220 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 20px 14px" }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 16 }}>{title}</div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { background: "hsl(222 47% 12%)", border: "1px solid hsl(217 32% 20%)", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: C.text },
  itemStyle: { color: C.muted },
};

export default function Dashboard() {
  const [full,    setFull]    = useState<FullStats | null>(null);
  const [basic,   setBasic]   = useState<BasicStats | null>(null);
  const [posts,   setPosts]   = useState<any[]>([]);
  const [appVer,  setAppVer]  = useState<any>(null);
  const [charts,  setCharts]  = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiJson<FullStats>("/admin/full-stats").catch(() => null),
      apiJson<BasicStats>("/admin/dashboard-stats").catch(() => null),
      apiJson<any>("/app/version").catch(() => null),
      apiJson<any[]>("/posts?limit=6").catch(() => []),
      apiJson<ChartData>("/admin/chart-data").catch(() => null),
    ]).then(([f, b, v, p, ch]) => {
      setFull(f);
      setBasic(b);
      setAppVer(v);
      setPosts(Array.isArray(p) ? p.slice(0, 6) : []);
      setCharts(ch);
      setLoading(false);
    });
  }, []);

  const n = (v?: string | number | null) => (v !== undefined && v !== null ? Number(v) : 0);

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        subtitle={`${new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })}${appVer?.version ? ` · v${appVer.version}` : ""}`}
      />

      <div style={{ padding: "20px 28px 48px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <div style={{ color: C.muted, fontSize: 15 }}>جارٍ تحميل الإحصائيات...</div>
          </div>
        ) : (
          <>
            {/* ── المستخدمون ── */}
            <SectionHead>👥 المستخدمون</SectionHead>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(195px,1fr))", gap: 11 }}>
              <StatCard label="إجمالي المستخدمين"    value={n(full?.users?.cnt)}           sub={`+${n(full?.users?.new_this_week)} هذا الأسبوع`} icon="👥" color={orange}    link="/users" />
              <StatCard label="مشرفون"               value={n(full?.users?.moderators)}    icon="🛡️" color={C.yellow} link="/users" />
              <StatCard label="أعضاء"                value={n(full?.users?.cnt) - n(full?.users?.admins) - n(full?.users?.moderators)} icon="👤" color={C.blue} link="/users" />
              <StatCard label="إشعارات غير مقروءة"  value={n(full?.notifications?.unread)} icon="🔔" color={C.purple} link="/notifications" />
            </div>

            {/* ── المحتوى ── */}
            <SectionHead>📝 المحتوى والنشاط</SectionHead>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(195px,1fr))", gap: 11 }}>
              <StatCard label="منشورات اجتماعية"  value={n(full?.posts?.cnt)}       sub={`${n(full?.posts?.today)} اليوم`}          icon="📝" color={C.green} link="/posts" />
              <StatCard label="إعلانات"            value={n(full?.ads?.cnt)}         sub={`${n(full?.ads?.active)} نشط`}             icon="📢" color={C.yellow} link="/ads" />
              <StatCard label="وظائف"              value={n(full?.jobs?.cnt)}        sub={`${n(full?.jobs?.active)} نشط`}            icon="💼" color={C.purple} link="/jobs" />
              <StatCard label="فعاليات"            value={n(full?.events?.cnt)}      icon="🎉" color={C.pink} link="/events" />
              <StatCard label="تجار وبائعون"       value={n(full?.merchants?.cnt)}   sub={`${n(full?.merchants?.active)} نشط`}      icon="🏪" color={C.teal} link="/merchants" />
              <StatCard label="منشورات رياضية"    value={n(full?.sports?.posts)}    icon="⚽" color={orange} link="/sports" />
            </div>

            {/* ── زواجل ── */}
            <SectionHead>🎁 زواجل — الهدايا والرسائل</SectionHead>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(195px,1fr))", gap: 11 }}>
              <StatCard label="إجمالي الطلبات"   value={n(full?.zawajil?.total)}     icon="🎁" color={C.pink}   link="/zawajil" />
              <StatCard label="قيد المراجعة"     value={n(full?.zawajil?.pending)}   icon="⏳" color={C.yellow} link="/zawajil" />
              <StatCard label="طلبات مقبولة"     value={n(full?.zawajil?.approved)}  icon="✅" color={C.blue}   link="/zawajil" />
              <StatCard label="مكتملة"           value={n(full?.zawajil?.completed)} icon="🎉" color={C.green}  link="/zawajil" />
            </div>

            {/* ── الخدمات الميدانية ── */}
            <SectionHead>🚗 الخدمات الميدانية</SectionHead>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(195px,1fr))", gap: 11 }}>
              <StatCard label="سائقون مقبولون"    value={n(full?.transport?.drivers)}    sub={`${n(full?.transport?.online_drivers)} متصل الآن`} icon="🚗" color={orange}    link="/transport" />
              <StatCard label="رحلات انتظار"      value={n(full?.transport?.pending)}    icon="⏳" color={C.yellow} link="/transport" />
              <StatCard label="رحلات مكتملة"     value={n(full?.transport?.completed)}  icon="✅" color={C.green} link="/transport" />
              <StatCard label="بلاغات مفتوحة"    value={n(full?.reports?.open)}         icon="📋" color="#f87171" link="/reports" />
              <StatCard label="مفقودات نشطة"     value={n(full?.missing?.lost)}         sub={`${n(full?.missing?.found)} موجود`} icon="🔍" color={C.blue} link="/missing" />
            </div>

            {/* ── مخططات بيانية ── */}
            {charts && (
              <>
                <SectionHead>📊 المخططات البيانية</SectionHead>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 4 }}>

                  {/* نشاط آخر 7 أيام */}
                  {charts.daily_activity.length > 0 && (
                    <ChartCard title="📈 نشاط آخر 7 أيام" height={220}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={charts.daily_activity} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={orange}  stopOpacity={0.3} />
                              <stop offset="95%" stopColor={orange}  stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gPosts" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={C.blue}  stopOpacity={0.3} />
                              <stop offset="95%" stopColor={C.blue}  stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip {...tooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Area type="monotone" dataKey="users" name="مستخدمون جدد" stroke={orange} fill="url(#gUsers)" strokeWidth={2} dot={false} />
                          <Area type="monotone" dataKey="posts" name="منشورات"       stroke={C.blue}  fill="url(#gPosts)"  strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  {/* توزيع رحلات المواصلات */}
                  {charts.transport_pie.some(d => d.value > 0) && (
                    <ChartCard title="🚗 توزيع رحلات المواصلات" height={220}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={charts.transport_pie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                            {charts.transport_pie.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: "hsl(222 47% 12%)", border: "1px solid hsl(217 32% 20%)", borderRadius: 10, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span style={{ color: C.text }}>{value}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18 }}>
                  {/* طلبات زواجل حسب الحالة */}
                  {charts.zawajil_bar.some(d => d.count > 0) && (
                    <ChartCard title="🎁 طلبات زواجل حسب الحالة" height={200}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={charts.zawajil_bar} margin={{ top: 0, right: 10, left: -20, bottom: 30 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.muted }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} />
                          <YAxis tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip contentStyle={{ background: "hsl(222 47% 12%)", border: "1px solid hsl(217 32% 20%)", borderRadius: 10, fontSize: 12 }} />
                          <Bar dataKey="count" name="طلبات" radius={[4, 4, 0, 0]}>
                            {charts.zawajil_bar.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  {/* أكثر الأقسام استخداماً */}
                  {charts.section_usage.length > 0 && (
                    <ChartCard title="📱 أكثر الأقسام استخداماً" height={200}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={charts.section_usage} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <YAxis dataKey="label" type="category" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} width={70} />
                          <Tooltip contentStyle={{ background: "hsl(222 47% 12%)", border: "1px solid hsl(217 32% 20%)", borderRadius: 10, fontSize: 12 }} />
                          <Bar dataKey="count" name="عدد" fill={orange} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}
                </div>
              </>
            )}

            {/* ── قسمان جنباً لجنب ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 20 }}>
              {basic?.byNeighborhood && basic.byNeighborhood.length > 0 && (
                <div style={{ background: C.bg, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 22px" }}>
                  <h3 style={{ fontWeight: 700, fontSize: 14, color: "hsl(210 40% 88%)", margin: "0 0 14px" }}>📍 المستخدمون حسب الحي</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {basic.byNeighborhood.slice(0, 7).map(nb => {
                      const max = Math.max(...basic.byNeighborhood.map(x => x.count));
                      const pct = Math.round((nb.count / max) * 100);
                      return (
                        <div key={nb.neighborhood}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: "hsl(210 40% 80%)" }}>{nb.neighborhood || "غير محدد"}</span>
                            <span style={{ color: orange, fontWeight: 700 }}>{nb.count}</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 4, background: "hsl(217 32% 14%)" }}>
                            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg,${orange},#fbbf24)`, transition: "width .5s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {posts.length > 0 && (
                <div style={{ background: C.bg, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ fontWeight: 700, fontSize: 14, color: "hsl(210 40% 88%)", margin: 0 }}>📝 أحدث المنشورات</h3>
                    <Link href="/posts" style={{ fontSize: 12, color: orange, textDecoration: "none" }}>عرض الكل ←</Link>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {posts.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid hsl(217 32% 11%)` }}>
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${orange}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: orange, flexShrink: 0 }}>
                          {p.author_name?.[0] || "؟"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: "hsl(210 40% 84%)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.content}</div>
                          <div style={{ fontSize: 10, color: "hsl(215 20% 44%)", marginTop: 1 }}>{p.author_name} · {new Date(p.created_at).toLocaleDateString("ar")}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── وصول سريع ── */}
            <SectionHead>⚡ وصول سريع</SectionHead>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 9 }}>
              {[
                { href: "/transport",       icon: "🚗", label: "مشوارك علينا"    },
                { href: "/zawajil",         icon: "🎁", label: "زواجل"           },
                { href: "/notifications",   icon: "📡", label: "إرسال إشعار"     },
                { href: "/merchant-portal", icon: "🏪", label: "بوابة التجار"    },
                { href: "/jobs",            icon: "💼", label: "إدارة الوظائف"   },
                { href: "/sports",          icon: "⚽", label: "إدارة الرياضة"   },
                { href: "/reports",         icon: "📋", label: "البلاغات"         },
                { href: "/missing",         icon: "🔍", label: "المفقودون"        },
                { href: "/merchants",       icon: "🏪", label: "التجار"           },
                { href: "/users",           icon: "👥", label: "المستخدمون"      },
                { href: "/events",          icon: "🎉", label: "الفعاليات"        },
                { href: "/settings",        icon: "⚙️", label: "الإعدادات"        },
              ].map(item => (
                <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
                  <div
                    style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 13, padding: "13px 15px", display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${orange}45`; e.currentTarget.style.background = `${orange}08`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}
                  >
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(210 40% 80%)" }}>{item.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
