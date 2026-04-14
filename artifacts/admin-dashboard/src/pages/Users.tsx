import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type User = {
  id: number; name: string; email: string; phone?: string;
  neighborhood?: string; role: string; is_banned?: boolean;
  created_at: string; avatar_url?: string;
};

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  user:      { label: "عضو",    color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  moderator: { label: "مشرف",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  admin:     { label: "مسؤول", color: "#34d399", bg: "rgba(52,211,153,0.12)" },
};

type ConfirmAction =
  | { type: "promote"; user: User }
  | { type: "demote";  user: User }
  | { type: "ban";     user: User; ban: boolean }
  | null;

export default function Users() {
  const [users,   setUsers]   = useState<User[]>([]);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [filter,  setFilter]  = useState<"all" | "user" | "moderator" | "admin">("all");
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [acting,  setActing]  = useState(false);
  const PER = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ users: User[] }>("/admin/users?limit=2000");
      setUsers(Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data as unknown as User[] : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const executeAction = async () => {
    if (!confirm) return;
    setActing(true);
    try {
      if (confirm.type === "promote") {
        const res = await apiFetch(`/admin/users/${confirm.user.id}/role`, {
          method: "PATCH", body: JSON.stringify({ role: "moderator" }),
        });
        if (res.ok) setUsers(prev => prev.map(u => u.id === confirm.user.id ? { ...u, role: "moderator" } : u));
      } else if (confirm.type === "demote") {
        const res = await apiFetch(`/admin/users/${confirm.user.id}/role`, {
          method: "PATCH", body: JSON.stringify({ role: "user" }),
        });
        if (res.ok) setUsers(prev => prev.map(u => u.id === confirm.user.id ? { ...u, role: "user" } : u));
      } else if (confirm.type === "ban") {
        const res = await apiFetch(`/admin/users/${confirm.user.id}/ban`, {
          method: "PATCH", body: JSON.stringify({ ban: confirm.ban }),
        });
        if (res.ok) setUsers(prev => prev.map(u => u.id === confirm.user.id ? { ...u, is_banned: confirm.ban } : u));
      }
    } catch {}
    setActing(false);
    setConfirm(null);
  };

  const filtered = users.filter(u => {
    const matchSearch = !search || u.name?.includes(search) || u.email?.includes(search) || u.phone?.includes(search) || u.neighborhood?.includes(search);
    const matchFilter = filter === "all" || u.role === filter;
    return matchSearch && matchFilter;
  });
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * PER, page * PER);

  const counts = {
    all:       users.length,
    user:      users.filter(u => u.role === "user").length,
    moderator: users.filter(u => u.role === "moderator").length,
    admin:     users.filter(u => u.role === "admin").length,
  };

  return (
    <div>
      <PageHeader
        title="إدارة المستخدمين"
        subtitle={`${counts.all} مستخدم مسجّل — ${counts.moderator} مشرف · ${counts.admin} مسؤول`}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              className="input-field"
              style={{ width: 220, padding: "9px 14px" }}
              placeholder="بحث بالاسم أو البريد أو الهاتف..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        }
      />

      <div style={{ padding: "0 28px 20px" }}>
        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {([
            { key: "all",       label: "الكل" },
            { key: "user",      label: "أعضاء" },
            { key: "moderator", label: "مشرفون" },
            { key: "admin",     label: "مسؤولون" },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(1); }}
              style={{
                padding: "6px 16px", borderRadius: 10, border: "1px solid",
                borderColor: filter === f.key ? "hsl(147 60% 42% / 0.5)" : "hsl(217 32% 17%)",
                background:  filter === f.key ? "hsl(147 60% 42% / 0.15)" : "transparent",
                color:       filter === f.key ? "hsl(147 60% 60%)" : "hsl(215 20% 55%)",
                cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {f.label}
              <span style={{
                background: filter === f.key ? "hsl(147 60% 42% / 0.25)" : "hsl(217 32% 17%)",
                color: filter === f.key ? "hsl(147 60% 65%)" : "hsl(215 20% 45%)",
                borderRadius: 20, padding: "1px 7px", fontSize: 11,
              }}>{counts[f.key]}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0", fontSize: 15 }}>جارٍ التحميل...</p>
        ) : (
          <>
            <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1.4fr 0.9fr 0.7fr 0.7fr 1.5fr",
                padding: "12px 20px", borderBottom: "1px solid hsl(217 32% 14%)",
                fontSize: 12, fontWeight: 700, color: "hsl(215 20% 45%)",
                background: "hsl(222 47% 9%)",
              }}>
                <span>الاسم</span>
                <span>البريد / الهاتف</span>
                <span>الحي</span>
                <span>الصفة</span>
                <span>الحالة</span>
                <span>الإجراءات</span>
              </div>

              {paged.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px 0", color: "hsl(215 20% 50%)", fontSize: 14 }}>
                  لا يوجد مستخدمون
                </div>
              ) : paged.map(u => {
                const meta = ROLE_META[u.role] ?? ROLE_META.user;
                return (
                  <div key={u.id} className="table-row" style={{
                    display: "grid",
                    gridTemplateColumns: "1.6fr 1.4fr 0.9fr 0.7fr 0.7fr 1.5fr",
                    padding: "13px 20px", alignItems: "center",
                  }}>
                    {/* Name */}
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 11,
                        background: meta.bg, border: `1px solid ${meta.color}30`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15, fontWeight: 700, color: meta.color, flexShrink: 0,
                      }}>{u.name?.[0] || "؟"}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 40% 90%)" }}>{u.name}</div>
                        {u.neighborhood && (
                          <div style={{ fontSize: 11, color: "hsl(215 20% 45%)", marginTop: 1 }}>📍 {u.neighborhood}</div>
                        )}
                      </div>
                    </div>

                    {/* Contact */}
                    <div>
                      {u.email && <div style={{ fontSize: 12, color: "hsl(215 20% 60%)" }}>{u.email}</div>}
                      {u.phone && <div style={{ fontSize: 11, color: "hsl(215 20% 45%)", marginTop: 2 }}>{u.phone}</div>}
                    </div>

                    {/* Neighborhood (already in name cell, keep placeholder) */}
                    <span style={{ fontSize: 12, color: "hsl(215 20% 50%)" }}>
                      {new Date(u.created_at).toLocaleDateString("ar-SA", { month: "short", year: "numeric" })}
                    </span>

                    {/* Role badge */}
                    <span style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: meta.bg, color: meta.color,
                      border: `1px solid ${meta.color}30`,
                    }}>{meta.label}</span>

                    {/* Status */}
                    <span style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: u.is_banned ? "rgba(239,68,68,0.12)" : "rgba(52,211,153,0.12)",
                      color: u.is_banned ? "#f87171" : "#34d399",
                      border: `1px solid ${u.is_banned ? "#f8717130" : "#34d39930"}`,
                    }}>{u.is_banned ? "محظور" : "نشط"}</span>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {/* Promote: user → moderator */}
                      {u.role === "user" && (
                        <button
                          onClick={() => setConfirm({ type: "promote", user: u })}
                          style={{
                            padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.35)",
                            background: "rgba(251,191,36,0.1)", color: "#fbbf24",
                            cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                            display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          ⬆ ترقية لمشرف
                        </button>
                      )}

                      {/* Demote: moderator → user */}
                      {u.role === "moderator" && (
                        <button
                          onClick={() => setConfirm({ type: "demote", user: u })}
                          style={{
                            padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.3)",
                            background: "rgba(148,163,184,0.08)", color: "hsl(215 20% 60%)",
                            cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                            display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          ⬇ تخفيض لعضو
                        </button>
                      )}

                      {/* Ban / Unban */}
                      {u.role !== "admin" && (
                        <button
                          onClick={() => setConfirm({ type: "ban", user: u, ban: !u.is_banned })}
                          style={{
                            padding: "5px 11px", borderRadius: 8, border: `1px solid ${u.is_banned ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}`,
                            background: u.is_banned ? "rgba(52,211,153,0.08)" : "rgba(239,68,68,0.08)",
                            color: u.is_banned ? "#34d399" : "#f87171",
                            cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                          }}
                        >
                          {u.is_banned ? "رفع الحظر" : "حظر"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {total > PER && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20 }}>
                {Array.from({ length: Math.ceil(total / PER) }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    style={{
                      width: 36, height: 36, borderRadius: 10, border: "1px solid",
                      borderColor: p === page ? "hsl(147 60% 42% / 0.5)" : "hsl(217 32% 17%)",
                      background: p === page ? "hsl(147 60% 42% / 0.15)" : "transparent",
                      color: p === page ? "hsl(147 60% 52%)" : "hsl(215 20% 60%)",
                      cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                    }}
                  >{p}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Confirm Dialog ──────────────────────────────────────────── */}
      {confirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => !acting && setConfirm(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "hsl(222 47% 11%)", borderRadius: 20,
              border: "1px solid hsl(217 32% 18%)",
              padding: "32px 28px", width: 380, maxWidth: "90vw",
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }}
          >
            {/* Icon */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 62, height: 62, borderRadius: 18,
                background:
                  confirm.type === "promote" ? "rgba(251,191,36,0.15)" :
                  confirm.type === "demote"  ? "rgba(148,163,184,0.1)" :
                  confirm.ban                ? "rgba(52,211,153,0.15)" : "rgba(239,68,68,0.15)",
                fontSize: 28,
                border: `1px solid ${
                  confirm.type === "promote" ? "rgba(251,191,36,0.3)" :
                  confirm.type === "demote"  ? "rgba(148,163,184,0.2)" :
                  confirm.ban                ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"
                }`,
              }}>
                {confirm.type === "promote" ? "⬆" : confirm.type === "demote" ? "⬇" : confirm.ban ? "✅" : "🚫"}
              </div>
            </div>

            {/* Title */}
            <h3 style={{ textAlign: "center", margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "hsl(210 40% 92%)" }}>
              {confirm.type === "promote" ? "ترقية إلى مشرف" :
               confirm.type === "demote"  ? "تخفيض إلى عضو"  :
               confirm.ban                ? "رفع الحظر"       : "حظر المستخدم"}
            </h3>
            <p style={{ textAlign: "center", margin: "0 0 20px", fontSize: 13, color: "hsl(215 20% 55%)", lineHeight: 1.7 }}>
              {confirm.type === "promote"
                ? <>سيتم منح <strong style={{ color: "hsl(210 40% 85%)" }}>{confirm.user.name}</strong> صلاحيات الإشراف والتحكم في المحتوى</>
                : confirm.type === "demote"
                ? <>سيتم سحب صلاحيات الإشراف من <strong style={{ color: "hsl(210 40% 85%)" }}>{confirm.user.name}</strong> وإعادته عضواً عادياً</>
                : confirm.ban
                ? <>سيتم رفع الحظر عن <strong style={{ color: "hsl(210 40% 85%)" }}>{confirm.user.name}</strong> والسماح له بالدخول مجدداً</>
                : <>سيتم حظر <strong style={{ color: "hsl(210 40% 85%)" }}>{confirm.user.name}</strong> ومنعه من الوصول إلى التطبيق</>
              }
            </p>

            {/* User card */}
            <div style={{
              background: "hsl(222 47% 8%)", borderRadius: 12,
              border: "1px solid hsl(217 32% 15%)",
              padding: "12px 16px", marginBottom: 22,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: ROLE_META[confirm.user.role]?.bg ?? "hsl(217 32% 17%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17, fontWeight: 700,
                color: ROLE_META[confirm.user.role]?.color ?? "hsl(210 40% 80%)",
                flexShrink: 0,
              }}>{confirm.user.name?.[0] || "؟"}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "hsl(210 40% 88%)" }}>{confirm.user.name}</div>
                <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginTop: 2 }}>
                  {confirm.user.email || confirm.user.phone || "—"}
                </div>
              </div>
              <span style={{
                marginRight: "auto", padding: "3px 10px", borderRadius: 20,
                fontSize: 11, fontWeight: 700,
                background: ROLE_META[confirm.user.role]?.bg ?? "transparent",
                color: ROLE_META[confirm.user.role]?.color ?? "hsl(210 40% 80%)",
                border: `1px solid ${(ROLE_META[confirm.user.role]?.color ?? "#888") + "30"}`,
              }}>{ROLE_META[confirm.user.role]?.label ?? confirm.user.role}</span>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => !acting && setConfirm(null)}
                disabled={acting}
                style={{
                  flex: 1, padding: "11px", borderRadius: 12,
                  border: "1px solid hsl(217 32% 20%)",
                  background: "transparent", color: "hsl(215 20% 60%)",
                  cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                }}
              >إلغاء</button>
              <button
                onClick={executeAction}
                disabled={acting}
                style={{
                  flex: 1.4, padding: "11px", borderRadius: 12, border: "none",
                  background:
                    confirm.type === "promote" ? "linear-gradient(135deg, #f59e0b, #d97706)" :
                    confirm.type === "demote"  ? "linear-gradient(135deg, hsl(217 32% 22%), hsl(217 32% 18%))" :
                    confirm.ban                ? "linear-gradient(135deg, #10b981, #059669)" :
                                                "linear-gradient(135deg, #ef4444, #dc2626)",
                  color: "#fff", cursor: acting ? "not-allowed" : "pointer",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 700,
                  opacity: acting ? 0.7 : 1,
                }}
              >
                {acting ? "جارٍ التنفيذ..." :
                 confirm.type === "promote" ? "تأكيد الترقية" :
                 confirm.type === "demote"  ? "تأكيد التخفيض" :
                 confirm.ban                ? "تأكيد رفع الحظر" : "تأكيد الحظر"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
