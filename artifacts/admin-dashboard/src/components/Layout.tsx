import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

type NavItem = {
  path: string;
  label: string;
  icon: string;
  badge?: number;
};

const NAV: NavItem[] = [
  { path: "/",              label: "لوحة التحكم",     icon: "⊞" },
  { path: "/users",         label: "المستخدمون",       icon: "👥" },
  { path: "/posts",         label: "المنشورات",        icon: "📝" },
  { path: "/merchants",     label: "التجار",           icon: "🏪" },
  { path: "/phone-shops",   label: "محلات الهواتف",    icon: "📱" },
  { path: "/transport",     label: "مشوارك علينا",      icon: "🚗" },
  { path: "/map",           label: "خريطة المدينة",    icon: "🗺️" },
  { path: "/communities",   label: "المجتمعات",        icon: "🏘️" },
  { path: "/ads",           label: "الإعلانات",        icon: "📢" },
  { path: "/honored",       label: "شخصية مكرّمة",    icon: "🏆" },
  { path: "/missing",        label: "المفقودات",         icon: "🔍" },
  { path: "/numbers",        label: "الأرقام المهمة",   icon: "📞" },
  { path: "/events",         label: "الفعاليات",         icon: "🎉" },
  { path: "/organizations",  label: "المنظمات المجتمعية",icon: "🤝" },
  { path: "/education",      label: "التعليم",            icon: "🎓" },
  { path: "/women",          label: "خدمات المرأة",      icon: "👩" },
  { path: "/medical",        label: "الدليل الطبي",       icon: "🏥" },
  { path: "/reports",        label: "بلاغات المواطنين",  icon: "📋" },
  { path: "/jobs",           label: "الوظائف",            icon: "💼" },
  { path: "/sports",         label: "الرياضة",            icon: "⚽" },
  { path: "/notifications",  label: "مركز الإشعارات",     icon: "🔔" },
  { path: "/prayer",         label: "مواقيت الآذان",      icon: "🕌" },
  { path: "/settings",       label: "الإعدادات",         icon: "⚙️" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "hsl(222 47% 8%)" }}>

      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? 240 : 64,
          background: "hsl(222 47% 7%)",
          borderLeft: "1px solid hsl(217 32% 12%)",
          display: "flex",
          flexDirection: "column",
          transition: "width 0.2s ease",
          flexShrink: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid hsl(217 32% 12%)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "hsl(147 60% 42% / 0.2)",
              border: "1px solid hsl(147 60% 42% / 0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>🌿</div>
            {sidebarOpen && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 95%)", lineHeight: 1.2 }}>حصاحيصاوي</div>
                <div style={{ fontSize: 11, color: "hsl(215 20% 55%)" }}>لوحة التحكم</div>
              </div>
            )}
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {NAV.map(item => {
            const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={`sidebar-link ${active ? "active" : ""}`}
                  style={{ marginBottom: 3, justifyContent: sidebarOpen ? "flex-start" : "center" }}
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                  {sidebarOpen && <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>}
                  {sidebarOpen && item.badge ? (
                    <span style={{
                      marginRight: "auto", background: "hsl(0 72% 55%)", color: "#fff",
                      borderRadius: 9999, padding: "1px 7px", fontSize: 11, fontWeight: 700,
                    }}>{item.badge}</span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User / Logout */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid hsl(217 32% 12%)" }}>
          {sidebarOpen && user && (
            <div style={{
              padding: "10px 12px", borderRadius: 12,
              background: "hsl(217 32% 12%)",
              marginBottom: 8,
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "hsl(210 40% 95%)" }}>{user.name}</div>
              <div style={{ fontSize: 11, color: "hsl(215 20% 55%)" }}>
                {user.role === "admin" ? "مسؤول" : "مشرف"}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="sidebar-link"
            style={{ width: "100%", border: "none", background: "none", justifyContent: sidebarOpen ? "flex-start" : "center", color: "hsl(0 72% 65%)" }}
          >
            <span style={{ fontSize: 18 }}>🚪</span>
            {sidebarOpen && <span>تسجيل الخروج</span>}
          </button>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          style={{
            position: "absolute", bottom: 80, right: sidebarOpen ? 228 : 52,
            width: 24, height: 24, borderRadius: 9999,
            background: "hsl(217 32% 17%)", border: "1px solid hsl(217 32% 22%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 12, color: "hsl(215 20% 65%)",
            transition: "right 0.2s ease",
            zIndex: 10,
          }}
        >
          {sidebarOpen ? "›" : "‹"}
        </button>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div style={{
      padding: "24px 28px 20px",
      borderBottom: "1px solid hsl(217 32% 12%)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "hsl(222 47% 8%)",
      position: "sticky", top: 0, zIndex: 5,
    }}>
      <div>
        <h1 style={{ fontWeight: 700, fontSize: 20, color: "hsl(210 40% 95%)", margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: "hsl(215 20% 55%)", margin: "4px 0 0" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
