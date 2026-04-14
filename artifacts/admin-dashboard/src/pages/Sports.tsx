import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type SportsPost = { id: number; title: string; content: string; type: string; author_name: string; team?: string; likes: number; created_at: string; };
type Player     = { id: number; name: string; position: string; team: string; age?: number; goals: number; assists: number; matches_played: number; bio?: string; };
type Match      = { id: number; team_home: string; team_away: string; score_home?: number; score_away?: number; match_date: string; venue?: string; status: string; };

const POST_TYPE: Record<string, { label: string; color: string }> = {
  news:          { label: "خبر",         color: "#60a5fa" },
  result:        { label: "نتيجة",       color: "#34d399" },
  announcement:  { label: "إعلان",       color: "#fbbf24" },
  match_preview: { label: "مباراة قادمة", color: "#c084fc" },
};
const MATCH_STATUS: Record<string, { label: string; color: string }> = {
  upcoming:  { label: "قادمة",   color: "#fbbf24" },
  live:      { label: "مباشرة",  color: "#f87171" },
  finished:  { label: "انتهت",   color: "#34d399" },
  postponed: { label: "مؤجلة",  color: "#94a3b8" },
};
const orange = "#f97316";

export default function Sports() {
  const [tab, setTab] = useState<"posts" | "players" | "matches">("posts");
  const [posts,   setPosts]   = useState<SportsPost[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");

  // Add-match modal
  const [showMatch, setShowMatch] = useState(false);
  const [matchForm, setMatchForm] = useState({ team_home: "", team_away: "", match_date: "", venue: "", status: "upcoming" });
  const [savingMatch, setSavingMatch] = useState(false);

  // Add-player modal
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerForm, setPlayerForm] = useState({ name: "", position: "", team: "", age: "", goals: "0", assists: "0", matches_played: "0", bio: "" });
  const [savingPlayer, setSavingPlayer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [po, pl, ma] = await Promise.all([
        apiJson<SportsPost[]>("/sports/posts"),
        apiJson<Player[]>("/sports/players"),
        apiJson<Match[]>("/sports/matches"),
      ]);
      setPosts(Array.isArray(po) ? po : []);
      setPlayers(Array.isArray(pl) ? pl : []);
      setMatches(Array.isArray(ma) ? ma : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const deletePost   = async (id: number) => { if (!confirm("حذف هذا المنشور؟")) return; await apiFetch(`/sports/posts/${id}`, { method: "DELETE" }); setPosts(p => p.filter(x => x.id !== id)); };
  const deletePlayer = async (id: number) => { if (!confirm("حذف هذا اللاعب؟")) return; await apiFetch(`/sports/players/${id}`, { method: "DELETE" }); setPlayers(p => p.filter(x => x.id !== id)); };
  const deleteMatch  = async (id: number) => { if (!confirm("حذف هذه المباراة؟")) return; await apiFetch(`/sports/matches/${id}`, { method: "DELETE" }); setMatches(p => p.filter(x => x.id !== id)); };

  const addMatch = async () => {
    if (!matchForm.team_home || !matchForm.team_away || !matchForm.match_date) { alert("الفريقان والتاريخ مطلوبان"); return; }
    setSavingMatch(true);
    try {
      const res = await apiFetch("/sports/matches", { method: "POST", body: JSON.stringify(matchForm) });
      const m = await res.json();
      setMatches(prev => [m, ...prev]);
      setShowMatch(false);
      setMatchForm({ team_home: "", team_away: "", match_date: "", venue: "", status: "upcoming" });
    } catch {}
    setSavingMatch(false);
  };

  const addPlayer = async () => {
    if (!playerForm.name || !playerForm.team) { alert("الاسم والفريق مطلوبان"); return; }
    setSavingPlayer(true);
    try {
      const res = await apiFetch("/sports/players", { method: "POST", body: JSON.stringify({ ...playerForm, age: playerForm.age ? +playerForm.age : null, goals: +playerForm.goals, assists: +playerForm.assists, matches_played: +playerForm.matches_played }) });
      const p = await res.json();
      setPlayers(prev => [p, ...prev]);
      setShowPlayer(false);
      setPlayerForm({ name: "", position: "", team: "", age: "", goals: "0", assists: "0", matches_played: "0", bio: "" });
    } catch {}
    setSavingPlayer(false);
  };

  const updateMatchStatus = async (id: number, status: string) => {
    await apiFetch(`/sports/matches/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setMatches(p => p.map(m => m.id === id ? { ...m, status } : m));
  };

  const filteredPosts   = posts.filter(p => !search || p.title.includes(search) || p.author_name.includes(search));
  const filteredPlayers = players.filter(p => !search || p.name.includes(search) || p.team.includes(search));
  const filteredMatches = matches.filter(m => !search || m.team_home.includes(search) || m.team_away.includes(search));

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 88%)", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" };

  const TABS = [
    { key: "posts",   label: `المنشورات (${posts.length})`,   icon: "📰" },
    { key: "players", label: `اللاعبون (${players.length})`,  icon: "⚽" },
    { key: "matches", label: `المباريات (${matches.length})`, icon: "🏟️" },
  ] as const;

  return (
    <div>
      <PageHeader
        title="إدارة الرياضة"
        subtitle="منشورات · لاعبون · مباريات"
        action={
          tab === "matches" ? <button onClick={() => setShowMatch(true)} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${orange},#ea580c)`, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>+ إضافة مباراة</button>
          : tab === "players" ? <button onClick={() => setShowPlayer(true)} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${orange},#ea580c)`, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>+ إضافة لاعب</button>
          : undefined
        }
      />

      {/* Tabs */}
      <div style={{ padding: "0 28px", borderBottom: "1px solid hsl(217 32% 13%)", display: "flex", gap: 2, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setSearch(""); }}
              style={{ padding: "10px 18px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: "transparent", color: tab === t.key ? orange : "hsl(215 20% 52%)", borderBottom: `2px solid ${tab === t.key ? orange : "transparent"}` }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." style={{ padding: "7px 13px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, width: 200 }} />
      </div>

      <div style={{ padding: "20px 28px" }}>
        {loading ? <div style={{ textAlign: "center", padding: "70px 0", color: "hsl(215 20% 48%)" }}>جارٍ التحميل...</div> : (
          <>
            {/* ── Posts ── */}
            {tab === "posts" && (
              filteredPosts.length === 0
                ? <div style={{ textAlign: "center", padding: "60px 0", color: "hsl(215 20% 48%)", fontSize: 14 }}><div style={{ fontSize: 36, marginBottom: 10 }}>📰</div>لا توجد منشورات</div>
                : <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr 1fr 1fr 0.8fr", padding: "11px 20px", borderBottom: "1px solid hsl(217 32% 14%)", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 40%)", background: "hsl(222 47% 9%)" }}>
                    <span>المنشور</span><span>النوع</span><span>الفريق</span><span>الإعجابات</span><span></span>
                  </div>
                  {filteredPosts.map(p => (
                    <div key={p.id} style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr 1fr 1fr 0.8fr", padding: "13px 20px", alignItems: "center", borderBottom: "1px solid hsl(217 32% 11%)" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(210 40% 90%)" }}>{p.title}</div>
                        <div style={{ fontSize: 11, color: "hsl(215 20% 48%)", marginTop: 2 }}>{p.author_name} · {new Date(p.created_at).toLocaleDateString("ar")}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: POST_TYPE[p.type]?.color ?? "#94a3b8", background: (POST_TYPE[p.type]?.color ?? "#94a3b8") + "15", border: `1px solid ${POST_TYPE[p.type]?.color ?? "#94a3b8"}25`, padding: "3px 10px", borderRadius: 20 }}>{POST_TYPE[p.type]?.label ?? p.type}</span>
                      <span style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>{p.team || "—"}</span>
                      <span style={{ fontSize: 13, color: "#f87171" }}>❤ {p.likes}</span>
                      <button onClick={() => deletePost(p.id)} style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid rgba(248,113,113,.25)", background: "rgba(248,113,113,.07)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>🗑</button>
                    </div>
                  ))}
                </div>
            )}

            {/* ── Players ── */}
            {tab === "players" && (
              filteredPlayers.length === 0
                ? <div style={{ textAlign: "center", padding: "60px 0", color: "hsl(215 20% 48%)", fontSize: 14 }}><div style={{ fontSize: 36, marginBottom: 10 }}>⚽</div>لا يوجد لاعبون</div>
                : <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr", padding: "11px 20px", borderBottom: "1px solid hsl(217 32% 14%)", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 40%)", background: "hsl(222 47% 9%)" }}>
                    <span>اللاعب</span><span>الفريق</span><span>المركز</span><span>العمر</span><span>الأهداف</span><span>التمريرات</span><span></span>
                  </div>
                  {filteredPlayers.map(p => (
                    <div key={p.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr", padding: "12px 20px", alignItems: "center", borderBottom: "1px solid hsl(217 32% 11%)" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(210 40% 90%)" }}>{p.name}</div>
                      <span style={{ fontSize: 12, color: "#60a5fa" }}>{p.team}</span>
                      <span style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>{p.position || "—"}</span>
                      <span style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>{p.age ?? "—"}</span>
                      <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 700 }}>⚽ {p.goals}</span>
                      <span style={{ fontSize: 13, color: "#34d399", fontWeight: 700 }}>🅰 {p.assists}</span>
                      <button onClick={() => deletePlayer(p.id)} style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid rgba(248,113,113,.25)", background: "rgba(248,113,113,.07)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>🗑</button>
                    </div>
                  ))}
                </div>
            )}

            {/* ── Matches ── */}
            {tab === "matches" && (
              filteredMatches.length === 0
                ? <div style={{ textAlign: "center", padding: "60px 0", color: "hsl(215 20% 48%)", fontSize: 14 }}><div style={{ fontSize: 36, marginBottom: 10 }}>🏟️</div>لا توجد مباريات</div>
                : <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 1fr 1fr", padding: "11px 20px", borderBottom: "1px solid hsl(217 32% 14%)", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 40%)", background: "hsl(222 47% 9%)" }}>
                    <span>المباراة</span><span>النتيجة</span><span>التاريخ</span><span>الملعب</span><span>الحالة</span><span>إجراء</span>
                  </div>
                  {filteredMatches.map(m => (
                    <div key={m.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 1fr 1fr", padding: "13px 20px", alignItems: "center", borderBottom: "1px solid hsl(217 32% 11%)" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(210 40% 90%)" }}>{m.team_home} <span style={{ color: orange }}>vs</span> {m.team_away}</div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: m.score_home !== null ? "#fbbf24" : "hsl(215 20% 40%)" }}>
                        {m.score_home !== null && m.score_away !== null ? `${m.score_home} - ${m.score_away}` : "—"}
                      </span>
                      <span style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>{new Date(m.match_date).toLocaleString("ar", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span style={{ fontSize: 11, color: "hsl(215 20% 50%)" }}>{m.venue || "—"}</span>
                      <select value={m.status} onChange={e => updateMatchStatus(m.id, e.target.value)}
                        style={{ padding: "5px 8px", borderRadius: 8, border: `1px solid ${MATCH_STATUS[m.status]?.color ?? "#94a3b8"}40`, background: "hsl(222 47% 9%)", color: MATCH_STATUS[m.status]?.color ?? "#94a3b8", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>
                        {Object.entries(MATCH_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <button onClick={() => deleteMatch(m.id)} style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid rgba(248,113,113,.25)", background: "rgba(248,113,113,.07)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>🗑</button>
                    </div>
                  ))}
                </div>
            )}
          </>
        )}
      </div>

      {/* Add Match Modal */}
      {showMatch && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={() => setShowMatch(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 20, padding: "28px 26px", width: 440, maxWidth: "92vw" }}>
            <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700, color: "hsl(210 40% 92%)" }}>🏟️ إضافة مباراة</h3>
            {[
              { key: "team_home",   label: "الفريق المضيف *",   placeholder: "اسم الفريق" },
              { key: "team_away",   label: "الفريق الضيف *",    placeholder: "اسم الفريق" },
              { key: "match_date",  label: "التاريخ والوقت *",  placeholder: "", type: "datetime-local" },
              { key: "venue",       label: "الملعب",             placeholder: "اسم الملعب" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>{f.label}</label>
                <input type={f.type ?? "text"} value={(matchForm as any)[f.key]} onChange={e => setMatchForm(m => ({ ...m, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inp} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowMatch(false)} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 58%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
              <button onClick={addMatch} disabled={savingMatch} style={{ flex: 1.4, padding: "11px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${orange},#ea580c)`, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>{savingMatch ? "جارٍ الحفظ..." : "حفظ المباراة"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Player Modal */}
      {showPlayer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={() => setShowPlayer(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 20, padding: "28px 26px", width: 460, maxWidth: "92vw" }}>
            <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700, color: "hsl(210 40% 92%)" }}>⚽ إضافة لاعب</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { key: "name",     label: "الاسم *",      placeholder: "اسم اللاعب", col: "1/-1" },
                { key: "team",     label: "الفريق *",     placeholder: "اسم الفريق" },
                { key: "position", label: "المركز",       placeholder: "مثال: مهاجم" },
                { key: "age",      label: "العمر",        placeholder: "السن", type: "number" },
                { key: "goals",    label: "الأهداف",      placeholder: "0",   type: "number" },
                { key: "assists",  label: "التمريرات",    placeholder: "0",   type: "number" },
                { key: "matches_played", label: "المباريات", placeholder: "0", type: "number" },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: (f as any).col ?? "auto" }}>
                  <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>{f.label}</label>
                  <input type={f.type ?? "text"} value={(playerForm as any)[f.key]} onChange={e => setPlayerForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inp} />
                </div>
              ))}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>نبذة</label>
                <textarea value={playerForm.bio} onChange={e => setPlayerForm(p => ({ ...p, bio: e.target.value }))} placeholder="نبذة عن اللاعب..." rows={3} style={{ ...inp, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowPlayer(false)} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 58%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
              <button onClick={addPlayer} disabled={savingPlayer} style={{ flex: 1.4, padding: "11px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${orange},#ea580c)`, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>{savingPlayer ? "جارٍ الحفظ..." : "حفظ اللاعب"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
