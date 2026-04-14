import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type TokenStats = { total: string; expo_tokens: string; unique_users: string };

const orange = "#f97316";

export default function Notifications() {
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Broadcast form
  const [bTitle, setBTitle] = useState("");
  const [bBody,  setBBody]  = useState("");
  const [bSent,  setBSent]  = useState(false);

  // User specific
  const [userId,  setUserId]  = useState("");
  const [uTitle,  setUTitle]  = useState("");
  const [uBody,   setUBody]   = useState("");
  const [uSent,   setUSent]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<TokenStats>("/admin/push/tokens");
      setTokenStats(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sendBroadcast = async () => {
    if (!bTitle || !bBody) { alert("العنوان والمحتوى مطلوبان"); return; }
    if (!confirm(`إرسال إشعار لجميع المستخدمين؟\n"${bTitle}"`)) return;
    setSending(true);
    try {
      await apiFetch("/admin/push/broadcast", { method: "POST", body: JSON.stringify({ title: bTitle, body: bBody }) });
      setBSent(true); setBTitle(""); setBBody("");
      setTimeout(() => setBSent(false), 3000);
    } catch { alert("حدث خطأ أثناء الإرسال"); }
    setSending(false);
  };

  const sendToUser = async () => {
    if (!userId || !uTitle || !uBody) { alert("معرّف المستخدم والعنوان والمحتوى مطلوبة"); return; }
    setSending(true);
    try {
      await apiFetch(`/admin/push/user/${userId}`, { method: "POST", body: JSON.stringify({ title: uTitle, body: uBody }) });
      setUSent(true); setUserId(""); setUTitle(""); setUBody("");
      setTimeout(() => setUSent(false), 3000);
    } catch { alert("حدث خطأ أثناء الإرسال"); }
    setSending(false);
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 9%)",
    color: "hsl(210 40% 88%)", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
  };

  return (
    <div>
      <PageHeader title="مركز الإشعارات" subtitle="إرسال Push Notifications لمستخدمي التطبيق" />

      <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Token Stats */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {loading ? <div style={{ color: "hsl(215 20% 48%)" }}>جارٍ التحميل...</div> : tokenStats && (
            <>
              {[
                { label: "أجهزة مسجّلة",  value: tokenStats.total,        icon: "📱", color: orange },
                { label: "Expo Tokens",     value: tokenStats.expo_tokens,  icon: "🔔", color: "#34d399" },
                { label: "مستخدمون فريدون", value: tokenStats.unique_users, icon: "👥", color: "#60a5fa" },
              ].map(c => (
                <div key={c.label} style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 15%)", borderRadius: 16, padding: "18px 22px", display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 160 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: c.color + "18", border: `1px solid ${c.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{c.icon}</div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginTop: 3 }}>{c.label}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Broadcast */}
          <div style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 15%)", borderRadius: 18, padding: "24px" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "hsl(210 40% 92%)" }}>📢 إشعار جماعي</h3>
            <p style={{ margin: "0 0 18px", fontSize: 12, color: "hsl(215 20% 50%)" }}>يُرسَل لجميع المستخدمين المسجّلين في التطبيق</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>عنوان الإشعار</label>
                <input value={bTitle} onChange={e => setBTitle(e.target.value)} placeholder="مثال: تحديث مهم" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>نص الرسالة</label>
                <textarea value={bBody} onChange={e => setBBody(e.target.value)} placeholder="نص الإشعار هنا..." rows={4}
                  style={{ ...inp, resize: "vertical" }} />
              </div>
              <button onClick={sendBroadcast} disabled={sending}
                style={{ padding: "12px", borderRadius: 12, border: "none", background: bSent ? "#34d399" : sending ? "hsl(217 32% 18%)" : `linear-gradient(135deg,${orange},#ea580c)`, color: "#fff", cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, transition: "background .3s" }}>
                {bSent ? "✅ تم الإرسال!" : sending ? "جارٍ الإرسال..." : "📡 إرسال للجميع"}
              </button>
            </div>
          </div>

          {/* User specific */}
          <div style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 15%)", borderRadius: 18, padding: "24px" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "hsl(210 40% 92%)" }}>👤 إشعار لمستخدم محدد</h3>
            <p style={{ margin: "0 0 18px", fontSize: 12, color: "hsl(215 20% 50%)" }}>أدخل معرّف المستخدم (ID) من صفحة المستخدمين</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>معرّف المستخدم (ID)</label>
                <input type="number" value={userId} onChange={e => setUserId(e.target.value)} placeholder="مثال: 5" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>عنوان الإشعار</label>
                <input value={uTitle} onChange={e => setUTitle(e.target.value)} placeholder="عنوان الرسالة" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "hsl(215 20% 52%)", display: "block", marginBottom: 5 }}>نص الرسالة</label>
                <textarea value={uBody} onChange={e => setUBody(e.target.value)} placeholder="نص الإشعار..." rows={3} style={{ ...inp, resize: "vertical" }} />
              </div>
              <button onClick={sendToUser} disabled={sending}
                style={{ padding: "12px", borderRadius: 12, border: "none", background: uSent ? "#34d399" : sending ? "hsl(217 32% 18%)" : "#3b82f6", color: "#fff", cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, transition: "background .3s" }}>
                {uSent ? "✅ تم الإرسال!" : sending ? "جارٍ الإرسال..." : "🎯 إرسال للمستخدم"}
              </button>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div style={{ background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.2)", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, color: "#60a5fa", fontSize: 13, marginBottom: 8 }}>💡 ملاحظات مهمة</div>
          <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: "hsl(215 20% 55%)", lineHeight: 1.8 }}>
            <li>الإشعارات تُرسَل عبر Expo Push Notifications API مباشرةً</li>
            <li>يجب أن يكون المستخدم مسجّلاً في التطبيق ومنحه إذن الإشعارات</li>
            <li>الإشعارات الجماعية تُرسَل على دُفعات (100 جهاز لكل دفعة)</li>
            <li>يُحفظ سجل الإشعارات في قاعدة البيانات لكل مستخدم</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
