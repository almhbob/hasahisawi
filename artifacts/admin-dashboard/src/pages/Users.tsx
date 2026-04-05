import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type User = {
  id: number; name: string; email: string; phone?: string;
  neighborhood?: string; role: string; is_banned?: boolean;
  created_at: string; avatar_url?: string;
};

const ROLES = [
  { value: "user",      label: "مستخدم",  color: "badge-blue" },
  { value: "moderator", label: "مشرف",    color: "badge-yellow" },
  { value: "admin",     label: "مسؤول",   color: "badge-green" },
];

export default function Users() {
  const [users,   setUsers]   = useState<User[]>([]);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const PER = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ users: User[] }>("/admin/users?limit=200");
      setUsers(Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data as unknown as User[] : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const ban = async (id: number, banUser: boolean) => {
    await apiFetch(`/admin/users/${id}/ban`, { method: "PATCH", body: JSON.stringify({ ban: banUser }) });
    setUsers(prev => prev.map(u => u.id === id ? { ...u, is_banned: banUser } : u));
  };

  const changeRole = async (id: number, role: string) => {
    await apiFetch(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
  };

  const filtered = users.filter(u =>
    !search || u.name?.includes(search) || u.email?.includes(search) || u.phone?.includes(search) || u.neighborhood?.includes(search)
  );
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * PER, page * PER);

  return (
    <div>
      <PageHeader
        title="إدارة المستخدمين"
        subtitle={`${total} مستخدم مسجّل`}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              className="input-field"
              style={{ width: 240, padding: "9px 14px" }}
              placeholder="بحث بالاسم أو البريد أو الهاتف..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        }
      />
      <div style={{ padding: "20px 28px" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0", fontSize: 15 }}>جارٍ التحميل...</p>
        ) : (
          <>
            <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
              {/* Table header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 0.8fr 0.8fr 1.2fr",
                padding: "12px 20px", borderBottom: "1px solid hsl(217 32% 14%)",
                fontSize: 12, fontWeight: 700, color: "hsl(215 20% 50%)",
                background: "hsl(222 47% 9%)",
              }}>
                <span>الاسم</span>
                <span>البريد / الهاتف</span>
                <span>الحي</span>
                <span>الدور</span>
                <span>الحالة</span>
                <span>الإجراءات</span>
              </div>
              {paged.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "hsl(215 20% 50%)", fontSize: 14 }}>
                  لا يوجد مستخدمون
                </div>
              ) : paged.map(u => (
                <div key={u.id} className="table-row" style={{
                  display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 0.8fr 0.8fr 1.2fr",
                  padding: "12px 20px", alignItems: "center",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, background: "hsl(217 32% 17%)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15, fontWeight: 700, color: "hsl(147 60% 52%)", flexShrink: 0,
                    }}>{u.name?.[0] || "؟"}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 40% 90%)" }}>{u.name}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "hsl(215 20% 65%)" }}>{u.email}</div>
                    {u.phone && <div style={{ fontSize: 11, color: "hsl(215 20% 50%)" }}>{u.phone}</div>}
                  </div>
                  <span style={{ fontSize: 12, color: "hsl(215 20% 60%)" }}>{u.neighborhood || "—"}</span>
                  <div>
                    <select
                      value={u.role}
                      onChange={e => changeRole(u.id, e.target.value)}
                      style={{
                        background: "hsl(217 32% 14%)", border: "1px solid hsl(217 32% 20%)",
                        borderRadius: 8, padding: "4px 8px", fontSize: 12,
                        color: "hsl(210 40% 85%)", cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className={u.is_banned ? "badge-red" : "badge-green"}>
                      {u.is_banned ? "محظور" : "نشط"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => ban(u.id, !u.is_banned)}
                      className={u.is_banned ? "btn-primary" : "btn-danger"}
                      style={{ fontSize: 11, padding: "5px 10px" }}
                    >
                      {u.is_banned ? "رفع الحظر" : "حظر"}
                    </button>
                  </div>
                </div>
              ))}
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
    </div>
  );
}
