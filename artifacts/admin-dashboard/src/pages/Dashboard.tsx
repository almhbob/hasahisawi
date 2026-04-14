import { useState, useEffect } from "react";
import { Link } from "wouter";
import { PageHeader } from "@/components/Layout";
import { apiJson } from "@/lib/api";

const orange = "#f97316";

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
};
type BasicStats = {
  totals: { total: number; admins: number; moderators: number; members: number };
  byNeighborhood: { neighborhood: string; count: number }[];
  recentUsers: any[];
};

function StatCard({ label, value, sub, icon, color, link }: {
  label: string; value: string | number; sub?: string;
  icon: string; color: string; link?: string;
}) {
  const inner = (
    <div
      style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 16, padding: "16px 18px", display: "flex", alignItems: "center", gap: 13, cursor: link ? "pointer" : "default" }}
      onMouseEnter={e => link && (e.currentTarget.style.borderColor = color + "50")}
      onMouseLeave={e => link && (e.currentTarget.style.borderColor = "hsl(217 32% 14%)")}
    >
      <div style={{ width: 44, height: 44, borderRadius: 14, background: color + "18", border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "hsl(215 20% 40%)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
  return link
    ? <Link href={link} style={{ textDecoration: "none" }}>{inner}</Link>
    : inner;
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ margin: "22px 0 10px", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 42%)", textTransform: "uppercase", letterSpacing: 1.5 }}>
      {children}
    </h3>
  );
}

export default function Dashboard() {
  const [full,    setFull]    = useState<FullStats | null>(null);
  const [basic,   setBasic]   = useState<BasicStats | null>(null);
  const [posts,   setPosts]   = useState<any[]>([]);
  const [appVer,  setAppVer]  = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiJson<FullStats>("/admin/full-stats").catch(() => null),
      apiJson<BasicStats>("/admin/dashboard-stats").catch(() => null),
      apiJson<any>("/app/version").catch(() => null),
      apiJson<any[]>("/posts?limit=6").catch(() => []),
    ]).then(([f, b, v, p]) => {
      setFull(f);
      setBasic(b);
      setAppVer(v);
      setPosts(Array.isArray(p) ? p.slice(0, 6) : []);
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
            <div style={{ color: "hsl(215 20% 46%)", fontSize: 15 }}>جارٍ تحميل الإحصائيات...</div>
          </div>
        ) : (
          <>
            {/* ── المستخدمون ── */}
            <SectionHead>👥 المستخدمون</SectionHead>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(195px,1fr))", gap: 11 }}>
              <StatCard label="إجمالي المستخدمين"    value={n(full?.users?.cnt)}           sub={`+${n(full?.users?.new_this_week)} هذا الأسبوع`} icon="👥" color={orange}    link="/users" />
              <StatCard label="مشرفون"               value={n(full?.users?.moderators)}    icon="🛡️" color="#fbbf24" link="/users" />
              <StatCard label="أعضاء"                value={n(full?.users?.cnt) - n(full?.users?.admins) - n(full?.users?.moderators)} icon="👤" color="#60a5fa" link="/users" />
              <StatCard label="إشعارات غير مقروءة"  value={n(full?.notifications?.unread)} icon="🔔" color="#c084fc" link="/notifications" />
            </div>

            {/* ── المحتوى ── */}
            <SectionHead>📝 المحتوى والنشاط</SectionHead>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(195px,1fr))", gap: 11 }}>
              <StatCard label="منشورات اجتماعية"  value={n(full?.posts?.cnt)}       sub={`${n(full?.posts?.today)} اليوم`}          icon="📝" color="#34d399" link="/posts" />
              <StatCard label="إعلانات"            value={n(full?.ads?.cnt)}         sub={`${n(full?.ads?.active)} نشط`}             icon="📢" color="#f59e0b" link="/ads" />
              <StatCard label="وظائف"              value={n(full?.jobs?.cnt)}        sub={`${n(full?.jobs?.active)} نشط`}            icon="💼" color="#818cf8" link="/jobs" />
              <StatCard label="فعاليات"            value={n(full?.events?.cnt)}      icon="🎉" color="#fb7185" link="/events" />
              <StatCard label="تجار وبائعون"       value={n(full?.merchants?.cnt)}   sub={`${n(full?.merchants?.active)} نشط`}      icon="🏪" color="#2dd4bf" link="/merchants" />
              <StatCard label="منشورات رياضية"    value={n(full?.sports?.posts)}    icon="⚽" color="#f97316" link="/sports" />
            </div>

            {/* ── الخدمات ── */}
            <SectionHead>🚗 الخدمات الميدانية</SectionHead>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(195px,1fr))", gap: 11 }}>
              <StatCard label="سائقون مقبولون"    value={n(full?.transport?.drivers)}    sub={`${n(full?.transport?.online_drivers)} متصل الآن`} icon="🚗" color={orange}    link="/transport" />
              <StatCard label="رحلات انتظار"      value={n(full?.transport?.pending)}    icon="⏳" color="#fbbf24" link="/transport" />
              <StatCard label="رحلات مكتملة"     value={n(full?.transport?.completed)}  icon="✅" color="#34d399" link="/transport" />
              <StatCard label="بلاغات مفتوحة"    value={n(full?.reports?.open)}         icon="📋" color="#f87171" link="/reports" />
              <StatCard label="مفقودات نشطة"     value={n(full?.missing?.lost)}         sub={`${n(full?.missing?.found)} موجود`} icon="🔍" color="#60a5fa" link="/missing" />
            </div>

            {/* ── قسمان جنباً لجنب ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 20 }}>
              {/* توزيع حسب الأحياء */}
              {basic?.byNeighborhood && basic.byNeighborhood.length > 0 && (
                <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", padding: "20px 22px" }}>
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

              {/* أحدث المنشورات */}
              {posts.length > 0 && (
                <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", padding: "20px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ fontWeight: 700, fontSize: 14, color: "hsl(210 40% 88%)", margin: 0 }}>📝 أحدث المنشورات</h3>
                    <Link href="/posts" style={{ fontSize: 12, color: orange, textDecoration: "none" }}>عرض الكل ←</Link>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {posts.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid hsl(217 32% 11%)" }}>
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
                { href: "/transport",    icon: "🚗", label: "مشوارك علينا" },
                { href: "/notifications",icon: "📡", label: "إرسال إشعار" },
                { href: "/jobs",         icon: "💼", label: "إدارة الوظائف" },
                { href: "/sports",       icon: "⚽", label: "إدارة الرياضة" },
                { href: "/reports",      icon: "📋", label: "البلاغات" },
                { href: "/missing",      icon: "🔍", label: "المفقودون" },
                { href: "/merchants",    icon: "🏪", label: "التجار" },
                { href: "/users",        icon: "👥", label: "المستخدمون" },
                { href: "/events",       icon: "🎉", label: "الفعاليات" },
                { href: "/settings",     icon: "⚙️", label: "الإعدادات" },
              ].map(item => (
                <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
                  <div
                    style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 13, padding: "13px 15px", display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${orange}45`; e.currentTarget.style.background = `${orange}08`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "hsl(217 32% 14%)"; e.currentTarget.style.background = "hsl(222 47% 10%)"; }}
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
