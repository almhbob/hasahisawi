import { useState, useEffect } from "react";
import { PageHeader } from "@/components/Layout";
import { apiJson } from "@/lib/api";

type Stats = {
  totals: { total: number; admins: number; moderators: number; members: number };
  byNeighborhood: { neighborhood: string; count: number }[];
  recentUsers: any[];
};

export default function Dashboard() {
  const [stats, setStats]   = useState<Stats | null>(null);
  const [appVer, setAppVer] = useState<any>(null);
  const [posts, setPosts]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiJson<Stats>("/admin/dashboard-stats").catch(() => null),
      apiJson<any>("/app/version").catch(() => null),
      apiJson<any[]>("/posts?limit=5").catch(() => []),
    ]).then(([s, v, p]) => {
      setStats(s);
      setAppVer(v);
      setPosts(Array.isArray(p) ? p.slice(0, 5) : []);
      setLoading(false);
    });
  }, []);

  const cards = [
    { label: "إجمالي المستخدمين", value: stats?.totals?.total ?? "—",     icon: "👥", color: "#27AE68", bg: "hsl(147 60% 42% / 0.12)" },
    { label: "مشرفون",            value: stats?.totals?.moderators ?? "—", icon: "🛡️", color: "#F0A500", bg: "hsl(38 90% 50% / 0.12)" },
    { label: "أعضاء عاديون",      value: stats?.totals?.members ?? "—",    icon: "👤", color: "#3B82F6", bg: "hsl(217 91% 60% / 0.12)" },
    { label: "إصدار التطبيق",      value: appVer?.version ? `v${appVer.version}` : "—", icon: "📱", color: "#8B5CF6", bg: "hsl(270 91% 65% / 0.12)" },
  ];

  return (
    <div>
      <PageHeader title="لوحة التحكم" subtitle="نظرة عامة على التطبيق والمجتمع" />

      <div style={{ padding: "24px 28px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "hsl(215 20% 50%)", fontSize: 15 }}>
            جارٍ تحميل البيانات...
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
              {cards.map(card => (
                <div key={card.label} className="stat-card" style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 14, background: card.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                      {card.icon}
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: card.color }}>{card.value}</div>
                  </div>
                  <div style={{ fontSize: 13, color: "hsl(215 20% 60%)", fontWeight: 500 }}>{card.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* By neighborhood */}
              {stats?.byNeighborhood && stats.byNeighborhood.length > 0 && (
                <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", padding: 20 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 90%)", marginBottom: 16, marginTop: 0 }}>المستخدمون حسب الحي</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {stats.byNeighborhood.slice(0, 8).map(n => {
                      const max = Math.max(...stats.byNeighborhood.map(x => x.count));
                      const pct = Math.round((n.count / max) * 100);
                      return (
                        <div key={n.neighborhood}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                            <span style={{ color: "hsl(210 40% 85%)" }}>{n.neighborhood || "غير محدد"}</span>
                            <span style={{ color: "hsl(147 60% 52%)", fontWeight: 700 }}>{n.count}</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 9999, background: "hsl(217 32% 17%)" }}>
                            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 9999, background: "hsl(147 60% 42%)", transition: "width 0.5s ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent users */}
              {stats?.recentUsers && stats.recentUsers.length > 0 && (
                <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", padding: 20 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 90%)", marginBottom: 16, marginTop: 0 }}>أحدث المستخدمين</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {stats.recentUsers.slice(0, 6).map(u => (
                      <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          background: "hsl(217 32% 17%)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, fontWeight: 700, color: "hsl(147 60% 52%)",
                        }}>
                          {u.name?.[0] || "؟"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 40% 90%)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {u.name}
                          </div>
                          <div style={{ fontSize: 11, color: "hsl(215 20% 50%)" }}>
                            {u.neighborhood || "—"}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "hsl(215 20% 45%)", flexShrink: 0 }}>
                          {new Date(u.created_at).toLocaleDateString("ar")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent posts */}
            {posts.length > 0 && (
              <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", padding: 20, marginTop: 20 }}>
                <h3 style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 90%)", marginBottom: 16, marginTop: 0 }}>أحدث المنشورات</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {posts.map(p => (
                    <div key={p.id} className="table-row" style={{ padding: "10px 0", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "hsl(217 32% 17%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "hsl(38 90% 60%)", flexShrink: 0 }}>
                        {p.author_name?.[0] || "؟"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "hsl(210 40% 90%)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.content}
                        </div>
                        <div style={{ fontSize: 11, color: "hsl(215 20% 50%)" }}>
                          {p.author_name} · {p.category} · {new Date(p.created_at).toLocaleDateString("ar")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
