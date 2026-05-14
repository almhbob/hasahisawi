import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type TokenStats = { total: string; expo_tokens: string; unique_users: string };

const orange = "#f97316";
const C = {
  bg:      "hsl(222 47% 10%)",
  border:  "hsl(217 32% 15%)",
  muted:   "hsl(215 20% 50%)",
  text:    "hsl(210 40% 88%)",
  green:   "#34d399",
  blue:    "#60a5fa",
  yellow:  "#fbbf24",
  purple:  "#c084fc",
  red:     "#f87171",
};

const SEGMENTS = [
  { key: "all",          label: "الكل",                icon: "👥", color: orange    },
  { key: "transport",    label: "مستخدمو المواصلات",   icon: "🚗", color: C.blue    },
  { key: "zawajil",      label: "مستخدمو زواجل",       icon: "🎁", color: "#f472b6" },
  { key: "social",       label: "مستخدمو الاجتماعي",   icon: "📝", color: C.green   },
  { key: "sports",       label: "متابعو الرياضة",       icon: "⚽", color: C.yellow  },
  { key: "jobs",         label: "الباحثون عن عمل",     icon: "💼", color: C.purple  },
  { key: "merchants",    label: "التجار",               icon: "🏪", color: C.muted   },
  { key: "admins",       label: "المشرفون فقط",         icon: "🛡️", color: C.red     },
];

const TEMPLATES = [
  { title: "تحديث جديد 🎉", body: "تم تحديث تطبيق حصاحيصاوي بمزايا جديدة رائعة! افتح التطبيق لاكتشافها." },
  { title: "🕌 موعد الصلاة", body: "حان وقت صلاة المغرب. جعلها الله قبولاً." },
  { title: "فعالية قادمة 📅", body: "تابع جديد فعاليات وأنشطة مدينة الحصاحيصا في التطبيق." },
  { title: "⚽ نتائج الرياضة", body: "شاهد نتائج مباريات اليوم وآخر أخبار الرياضة في الحصاحيصا." },
  { title: "خدمة جديدة 🆕", body: "اكتشف خدمة زواجل — أرسل هداياك ورسائلك باحترافية!" },
];

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: `1px solid ${C.border}`, background: "hsl(222 47% 9%)",
  color: C.text, fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
};

export default function Notifications() {
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [sending,    setSending]    = useState(false);
  const [activeTab,  setActiveTab]  = useState<"broadcast" | "targeted" | "segment">("broadcast");

  // Broadcast
  const [bTitle, setBTitle] = useState("");
  const [bBody,  setBBody]  = useState("");
  const [bSent,  setBSent]  = useState(false);

  // User specific
  const [userId,  setUserId] = useState("");
  const [uTitle,  setUTitle] = useState("");
  const [uBody,   setUBody]  = useState("");
  const [uSent,   setUSent]  = useState(false);

  // Segment
  const [segment, setSegment] = useState("all");
  const [sTitle,  setSTitle]  = useState("");
  const [sBody,   setSBody]   = useState("");
  const [sSent,   setSSent]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTokenStats(await apiJson<TokenStats>("/admin/push/tokens")); }
    catch {}
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

  const sendSegment = async () => {
    if (!sTitle || !sBody) { alert("العنوان والمحتوى مطلوبان"); return; }
    const seg = SEGMENTS.find(s => s.key === segment);
    if (!confirm(`إرسال إشعار لفئة "${seg?.label}"؟\n"${sTitle}"`)) return;
    setSending(true);
    try {
      await apiFetch("/admin/push/segment", { method: "POST", body: JSON.stringify({ segment, title: sTitle, body: sBody }) });
      setSSent(true); setSTitle(""); setSBody("");
      setTimeout(() => setSSent(false), 3000);
    } catch { alert("حدث خطأ أثناء الإرسال"); }
    setSending(false);
  };

  const applyTemplate = (t: { title: string; body: string }) => {
    if (activeTab === "broadcast") { setBTitle(t.title); setBBody(t.body); }
    else if (activeTab === "targeted") { setUTitle(t.title); setUBody(t.body); }
    else { setSTitle(t.title); setSBody(t.body); }
  };

  const tabBtn = (key: typeof activeTab, label: string) => (
    <button onClick={() => setActiveTab(key)} style={{
      padding: "9px 20px", borderRadius: 20, border: "1px solid",
      borderColor: activeTab === key ? `${orange}50` : C.border,
      background: activeTab === key ? `${orange}15` : "transparent",
      color: activeTab === key ? orange : C.muted,
      cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
    }}>{label}</button>
  );

  return (
    <div>
      <PageHeader title="مركز الإشعارات" subtitle="إرسال Push Notifications لمستخدمي التطبيق" />

      <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* إحصائيات */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {loading ? <div style={{ color: C.muted }}>جارٍ التحميل...</div> : tokenStats && (
            <>
              {[
                { label: "أجهزة مسجّلة",   value: tokenStats.total,        icon: "📱", color: orange    },
                { label: "Expo Tokens",      value: tokenStats.expo_tokens,  icon: "🔔", color: C.green  },
                { label: "مستخدمون فريدون", value: tokenStats.unique_users, icon: "👥", color: C.blue   },
              ].map(c => (
                <div key={c.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 22px", display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 160 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: c.color + "18", border: `1px solid ${c.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{c.icon}</div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{c.label}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* تبويبات */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabBtn("broadcast", "📢 إشعار جماعي")}
          {tabBtn("segment",   "🎯 إشعار بالفئة")}
          {tabBtn("targeted",  "👤 إشعار مستخدم")}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, alignItems: "start" }}>
          {/* نموذج الإرسال */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px" }}>

            {/* ── جماعي ── */}
            {activeTab === "broadcast" && (
              <>
                <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: C.text }}>📢 إشعار جماعي</h3>
                <p style={{ margin: "0 0 18px", fontSize: 12, color: C.muted }}>يُرسَل لجميع المستخدمين المسجّلين في التطبيق</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>عنوان الإشعار</label>
                    <input value={bTitle} onChange={e => setBTitle(e.target.value)} placeholder="مثال: تحديث مهم 🎉" style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>نص الرسالة</label>
                    <textarea value={bBody} onChange={e => setBBody(e.target.value)} placeholder="نص الإشعار هنا..." rows={4} style={{ ...inp, resize: "vertical" }} />
                  </div>
                  <button onClick={sendBroadcast} disabled={sending} style={{ padding: "12px", borderRadius: 12, border: "none", background: bSent ? C.green : sending ? C.border : `linear-gradient(135deg,${orange},#ea580c)`, color: "#fff", cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, transition: "background .3s" }}>
                    {bSent ? "✅ تم الإرسال!" : sending ? "جارٍ الإرسال..." : "📡 إرسال للجميع"}
                  </button>
                </div>
              </>
            )}

            {/* ── بالفئة ── */}
            {activeTab === "segment" && (
              <>
                <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: C.text }}>🎯 إشعار بالفئة</h3>
                <p style={{ margin: "0 0 18px", fontSize: 12, color: C.muted }}>أرسل إشعاراً لمستخدمي قسم محدد فقط</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 8 }}>اختر الفئة</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {SEGMENTS.map(s => (
                        <button key={s.key} onClick={() => setSegment(s.key)} style={{
                          padding: "6px 13px", borderRadius: 20, border: "1px solid",
                          borderColor: segment === s.key ? `${s.color}50` : C.border,
                          background: segment === s.key ? `${s.color}15` : "transparent",
                          color: segment === s.key ? s.color : C.muted,
                          cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                        }}>{s.icon} {s.label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>عنوان الإشعار</label>
                    <input value={sTitle} onChange={e => setSTitle(e.target.value)} placeholder="عنوان الرسالة" style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>نص الرسالة</label>
                    <textarea value={sBody} onChange={e => setSBody(e.target.value)} placeholder="نص الإشعار..." rows={4} style={{ ...inp, resize: "vertical" }} />
                  </div>
                  <button onClick={sendSegment} disabled={sending} style={{ padding: "12px", borderRadius: 12, border: "none", background: sSent ? C.green : sending ? C.border : "#3b82f6", color: "#fff", cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
                    {sSent ? "✅ تم الإرسال!" : sending ? "جارٍ الإرسال..." : `🎯 إرسال للـ ${SEGMENTS.find(s => s.key === segment)?.label}`}
                  </button>
                </div>
              </>
            )}

            {/* ── لمستخدم محدد ── */}
            {activeTab === "targeted" && (
              <>
                <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: C.text }}>👤 إشعار لمستخدم محدد</h3>
                <p style={{ margin: "0 0 18px", fontSize: 12, color: C.muted }}>أدخل معرّف المستخدم (ID) من صفحة المستخدمين</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>معرّف المستخدم (ID)</label>
                    <input type="number" value={userId} onChange={e => setUserId(e.target.value)} placeholder="مثال: 5" style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>عنوان الإشعار</label>
                    <input value={uTitle} onChange={e => setUTitle(e.target.value)} placeholder="عنوان الرسالة" style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>نص الرسالة</label>
                    <textarea value={uBody} onChange={e => setUBody(e.target.value)} placeholder="نص الإشعار..." rows={3} style={{ ...inp, resize: "vertical" }} />
                  </div>
                  <button onClick={sendToUser} disabled={sending} style={{ padding: "12px", borderRadius: 12, border: "none", background: uSent ? C.green : sending ? C.border : "#8b5cf6", color: "#fff", cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
                    {uSent ? "✅ تم الإرسال!" : sending ? "جارٍ الإرسال..." : "🎯 إرسال للمستخدم"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* قوالب جاهزة */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 18, padding: "20px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: C.text }}>📋 قوالب جاهزة</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TEMPLATES.map((t, i) => (
                <button key={i} onClick={() => applyTemplate(t)} style={{
                  padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent",
                  color: C.text, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textAlign: "right",
                  transition: "border-color .2s, background .2s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${orange}40`; e.currentTarget.style.background = `${orange}08`; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>{t.title}</div>
                  <div style={{ color: C.muted, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.body}</div>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 18, background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.2)", borderRadius: 12, padding: "14px" }}>
              <div style={{ fontWeight: 700, color: C.blue, fontSize: 12, marginBottom: 8 }}>💡 ملاحظات</div>
              <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11, color: C.muted, lineHeight: 1.9 }}>
                <li>الإشعارات تُرسَل عبر Expo Push API</li>
                <li>الإشعارات الجماعية على دُفعات 100</li>
                <li>الإشعارات التلقائية تُرسَل عند تغيير حالة الطلبات</li>
                <li>القوالب قابلة للتعديل قبل الإرسال</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
