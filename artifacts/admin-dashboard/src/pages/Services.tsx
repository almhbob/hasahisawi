import { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type HealthStatus = "checking" | "online" | "offline" | "slow";

// ─── Constants ───────────────────────────────────────────────────────────────
const DB_EXPIRY = new Date("2026-05-20T00:00:00Z");

const C = {
  bg:       "hsl(222 47% 8%)",
  surface:  "hsl(222 47% 11%)",
  border:   "hsl(217 32% 15%)",
  text:     "hsl(210 40% 93%)",
  muted:    "hsl(215 20% 50%)",
  green:    "hsl(147 60% 42%)",
  yellow:   "hsl(45 96% 56%)",
  red:      "hsl(0 72% 55%)",
  blue:     "hsl(210 80% 58%)",
  orange:   "hsl(28 100% 58%)",
  purple:   "hsl(270 60% 60%)",
};

// ─── Utility ─────────────────────────────────────────────────────────────────
function getDaysLeft(expiry: Date): number {
  return Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
}

function useCopyToClipboard() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);
  return { copied, copy };
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function StatusDot({ status }: { status: "ok" | "warning" | "danger" | "info" }) {
  const colors = { ok: C.green, warning: C.yellow, danger: C.red, info: C.blue };
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: colors[status],
      boxShadow: `0 0 6px ${colors[status]}80`,
    }} />
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
      background: color + "20", color, border: `1px solid ${color}40`,
      letterSpacing: 0.3,
    }}>{label}</span>
  );
}

function CopyBtn({
  text, id, copied, onCopy,
}: { text: string; id: string; copied: string | null; onCopy: (t: string, id: string) => void }) {
  const done = copied === id;
  return (
    <button
      onClick={() => onCopy(text, id)}
      title="نسخ"
      style={{
        background: done ? C.green + "20" : "hsl(217 32% 18%)",
        border: `1px solid ${done ? C.green + "40" : C.border}`,
        borderRadius: 6, padding: "3px 8px", cursor: "pointer",
        color: done ? C.green : C.muted, fontSize: 11, transition: "all 0.2s",
      }}
    >
      {done ? "✓ تم النسخ" : "نسخ"}
    </button>
  );
}

function ActionBtn({
  href, label, icon, color, outline,
}: { href: string; label: string; icon: string; color: string; outline?: boolean }) {
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
        textDecoration: "none", transition: "all 0.2s",
        background: outline ? color + "15" : color,
        color: outline ? color : "#fff",
        border: `1px solid ${outline ? color + "50" : color}`,
      }}
    >
      <span>{icon}</span> {label}
    </a>
  );
}

function InfoRow({
  label, value, copyId, copied, onCopy, mono,
}: {
  label: string; value: string; copyId?: string;
  copied?: string | null; onCopy?: (t: string, id: string) => void; mono?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderBottom: `1px solid ${C.border}`,
      gap: 12,
    }}>
      <span style={{ color: C.muted, fontSize: 13, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{
          color: C.text, fontSize: 13,
          fontFamily: mono ? "monospace" : undefined,
          wordBreak: "break-all", textAlign: "left",
        }}>{value}</span>
        {copyId && onCopy && copied !== undefined && (
          <CopyBtn text={value} id={copyId} copied={copied} onCopy={onCopy} />
        )}
      </div>
    </div>
  );
}

// ─── Service Card ─────────────────────────────────────────────────────────────
function ServiceCard({
  icon, title, subtitle, status, statusLabel, accentColor, children,
}: {
  icon: string; title: string; subtitle: string;
  status: "ok" | "warning" | "danger" | "info";
  statusLabel: string; accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 16, overflow: "hidden",
      boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
    }}>
      {/* Header */}
      <div style={{
        background: accentColor + "12",
        borderBottom: `1px solid ${accentColor}30`,
        padding: "18px 22px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: accentColor + "20",
            border: `1px solid ${accentColor}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22,
          }}>{icon}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>{title}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusDot status={status} />
          <Badge label={statusLabel} color={
            status === "ok" ? C.green : status === "warning" ? C.yellow : status === "danger" ? C.red : C.blue
          } />
        </div>
      </div>
      {/* Body */}
      <div style={{ padding: "16px 22px" }}>{children}</div>
    </div>
  );
}

// ─── Countdown component ──────────────────────────────────────────────────────
function Countdown({ expiry }: { expiry: Date }) {
  const [days, setDays] = useState(getDaysLeft(expiry));
  useEffect(() => {
    const t = setInterval(() => setDays(getDaysLeft(expiry)), 60_000);
    return () => clearInterval(t);
  }, [expiry]);

  const color = days <= 7 ? C.red : days <= 30 ? C.yellow : C.green;
  return (
    <div style={{
      background: color + "10", border: `1px solid ${color}40`,
      borderRadius: 12, padding: "14px 18px", margin: "14px 0",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{ fontSize: 30 }}>{days <= 7 ? "🚨" : days <= 30 ? "⚠️" : "📅"}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>
          {days} يوم
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          متبق حتى انتهاء قاعدة البيانات المجانية — {expiry.toLocaleDateString("ar-SD")}
        </div>
      </div>
      {days <= 30 && (
        <a
          href="https://dashboard.render.com/"
          target="_blank" rel="noopener noreferrer"
          style={{
            marginRight: "auto", padding: "8px 16px", borderRadius: 8,
            background: C.red, color: "#fff", fontSize: 13, fontWeight: 700,
            textDecoration: "none", flexShrink: 0,
          }}
        >
          ترقية الآن
        </a>
      )}
    </div>
  );
}

// ─── Health Ping ──────────────────────────────────────────────────────────────
function HealthPing({ url }: { url: string }) {
  const [status, setStatus] = useState<HealthStatus>("checking");
  const [latency, setLatency] = useState<number | null>(null);

  const ping = useCallback(async () => {
    setStatus("checking");
    const t0 = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const ms = Date.now() - t0;
      setLatency(ms);
      setStatus(res.ok ? (ms > 3000 ? "slow" : "online") : "offline");
    } catch {
      setStatus("offline"); setLatency(null);
    }
  }, [url]);

  useEffect(() => { ping(); }, [ping]);

  const color = status === "online" ? C.green : status === "slow" ? C.yellow :
                status === "offline" ? C.red : C.muted;
  const label = status === "online" ? "متصل" : status === "slow" ? "بطيء" :
                status === "offline" ? "غير متصل" : "جارٍ الفحص...";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px", borderRadius: 10,
      background: color + "10", border: `1px solid ${color}30`,
      margin: "14px 0",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {status === "checking"
          ? <span style={{ color: C.muted, fontSize: 20 }}>⏳</span>
          : <StatusDot status={status === "online" ? "ok" : status === "slow" ? "warning" : "danger"} />}
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color }}>فحص الاتصال: {label}</div>
          {latency && <div style={{ fontSize: 11, color: C.muted }}>{latency} ms استجابة</div>}
        </div>
      </div>
      <button
        onClick={ping}
        style={{
          background: "hsl(217 32% 18%)", border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "6px 14px", cursor: "pointer",
          color: C.muted, fontSize: 12,
        }}
      >🔄 إعادة الفحص</button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Services() {
  const { copied, copy } = useCopyToClipboard();

  // ── Render Web Service
  const RENDER_SVC_URL = "https://dashboard.render.com/web/srv-d7hnfmvaqgkc739ea5f0";
  const RENDER_DB_URL  = "https://dashboard.render.com/d/dpg-d7iqkae7r5hc73cd8icg-a";
  const API_URL        = "https://hasahisawi.onrender.com";
  const HEALTH_URL     = `${API_URL}/api/healthz`;

  return (
    <div style={{ padding: "28px 32px", direction: "rtl", maxWidth: 1100, margin: "0 auto" }}>

      {/* ── Page Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: C.purple + "20", border: `1px solid ${C.purple}40`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
          }}>🛰️</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.text }}>
              إدارة الإشتراكات والخدمات
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: C.muted }}>
              مركز متابعة جميع الخدمات والاشتراكات — روابط مباشرة للترقية والإدارة
            </p>
          </div>
        </div>

        {/* Summary Bar */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 24,
        }}>
          {[
            { label: "Render Server",   icon: "🖥️", status: "تشغيل", color: C.green   },
            { label: "قاعدة البيانات",  icon: "🗄️", status: "مجانية", color: C.yellow  },
            { label: "Firebase",         icon: "🔥", status: "نشط",    color: C.orange  },
            { label: "EAS / Expo",       icon: "📱", status: "نشط",    color: C.blue    },
          ].map((s) => (
            <div key={s.label} style={{
              background: C.surface, border: `1px solid ${s.color}30`,
              borderRadius: 12, padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 22 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 12, color: C.muted }}>{s.label}</div>
                <div style={{ fontWeight: 700, color: s.color, fontSize: 14 }}>{s.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Subscriptions Payment Table */}
      <div style={{
        marginBottom: 28, background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 16, overflow: "hidden",
      }}>
        <div style={{
          padding: "16px 24px", borderBottom: `1px solid ${C.border}`,
          background: C.purple + "10",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>💳</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>جدول الاشتراكات والمدفوعات</div>
              <div style={{ fontSize: 12, color: C.muted }}>روابط مباشرة لإدارة كل اشتراك والسداد</div>
            </div>
          </div>
          <div style={{
            background: C.green + "20", border: `1px solid ${C.green}40`,
            borderRadius: 10, padding: "8px 16px", textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: C.muted }}>الإجمالي الشهري</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.green }}>$7 <span style={{ fontSize: 12 }}>كحد أدنى</span></div>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "hsl(217 32% 13%)" }}>
                {["الخدمة", "الخطة", "التكلفة / شهر", "الأولوية", "الحالة", "إجراء"].map(h => (
                  <th key={h} style={{
                    padding: "12px 16px", textAlign: "right", color: C.muted,
                    fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {
                  service: "🖥️ Render — API Server",
                  plan: "Starter (مُوصى به)",
                  cost: "$7",
                  priority: "عالية", priorityColor: C.red,
                  status: "مجاني حالياً ينام", statusColor: C.yellow,
                  btnLabel: "ترقية الآن", btnColor: C.red,
                  href: "https://dashboard.render.com/web/srv-d7hnfmvaqgkc739ea5f0/settings",
                },
                {
                  service: "🗄️ Render — PostgreSQL",
                  plan: "Starter DB (قبل 20 مايو)",
                  cost: "$7",
                  priority: "حرجة", priorityColor: C.red,
                  status: "تنتهي 20 مايو 2026", statusColor: C.red,
                  btnLabel: "ترقية الخطة", btnColor: C.red,
                  href: "https://dashboard.render.com/d/dpg-d7iqkae7r5hc73cd8icg-a",
                },
                {
                  service: "🔥 Firebase",
                  plan: "Blaze (ادفع عند الاستهلاك)",
                  cost: "$0*",
                  priority: "متوسطة", priorityColor: C.yellow,
                  status: "Spark مجاني", statusColor: C.green,
                  btnLabel: "ترقية الخطة",  btnColor: C.orange,
                  href: "https://console.firebase.google.com/project/hasahisawi/settings/usage",
                },
                {
                  service: "🐙 GitHub",
                  plan: "Free",
                  cost: "$0",
                  priority: "—", priorityColor: C.muted,
                  status: "يعمل", statusColor: C.green,
                  btnLabel: "إدارة", btnColor: C.purple,
                  href: "https://github.com/almhbob/hasahisawi",
                },
                {
                  service: "🎮 Google Play",
                  plan: "رسوم تسجيل (مدفوعة)",
                  cost: "$0",
                  priority: "—", priorityColor: C.muted,
                  status: "منشور", statusColor: C.green,
                  btnLabel: "Play Console", btnColor: C.green,
                  href: "https://play.google.com/console/",
                },
              ].map((row, i) => (
                <tr key={i} style={{
                  borderBottom: `1px solid ${C.border}`,
                  background: i % 2 === 0 ? "transparent" : "hsl(217 32% 10%)",
                  transition: "background 0.15s",
                }}>
                  <td style={{ padding: "13px 16px", color: C.text, fontWeight: 600 }}>{row.service}</td>
                  <td style={{ padding: "13px 16px", color: C.muted }}>{row.plan}</td>
                  <td style={{ padding: "13px 16px" }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: C.text, fontFamily: "monospace" }}>{row.cost}</span>
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <Badge label={row.priority} color={row.priorityColor} />
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <span style={{ color: row.statusColor, fontWeight: 600, fontSize: 12 }}>● {row.status}</span>
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <a href={row.href} target="_blank" rel="noopener noreferrer"
                      style={{
                        display: "inline-block", padding: "6px 14px", borderRadius: 8,
                        background: row.btnColor + "20", color: row.btnColor,
                        border: `1px solid ${row.btnColor}50`,
                        fontSize: 12, fontWeight: 700, textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >{row.btnLabel}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "10px 24px", background: "hsl(217 32% 10%)", fontSize: 11, color: C.muted }}>
          * Firebase Blaze مجاني حتى تتجاوز الحد المجاني (50K قراءة/يوم) — لا رسوم ثابتة
        </div>
      </div>

      {/* ── Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ── 1. Render Web Service */}
        <ServiceCard
          icon="🖥️" title="Render — API Server"
          subtitle="خادم التطبيق الرئيسي"
          status="ok" statusLabel="يعمل" accentColor={C.green}
        >
          <HealthPing url={HEALTH_URL} />
          <InfoRow label="رابط الـ API"     value={API_URL}                        copyId="api-url"     copied={copied} onCopy={copy} mono />
          <InfoRow label="معرف الخدمة"     value="srv-d7hnfmvaqgkc739ea5f0"        copyId="srv-id"      copied={copied} onCopy={copy} mono />
          <InfoRow label="فحص الصحة"       value={HEALTH_URL}                      copyId="health-url"  copied={copied} onCopy={copy} mono />
          <InfoRow label="المنطقة"          value="Frankfurt — EU West" />
          <InfoRow label="أمر التشغيل"     value="node dist/index.mjs"             copyId="start-cmd"   copied={copied} onCopy={copy} mono />
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <ActionBtn href={RENDER_SVC_URL}                              icon="📊" label="لوحة التحكم"   color={C.green} />
            <ActionBtn href={`${RENDER_SVC_URL}/logs`}                   icon="📄" label="سجلات التشغيل" color={C.green} outline />
            <ActionBtn href={`${RENDER_SVC_URL}/settings`}               icon="⚙️" label="الإعدادات"      color={C.green} outline />
            <ActionBtn href="https://dashboard.render.com/billing/info"   icon="💳" label="الفواتير"        color={C.muted} outline />
          </div>
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: "hsl(217 32% 14%)", border: `1px solid ${C.border}`,
            fontSize: 12, color: C.muted, lineHeight: 1.7,
          }}>
            💡 لترقية الخطة: افتح لوحة التحكم → Settings → Instance Type → اختر Starter ($7/شهر) أو أعلى
          </div>
        </ServiceCard>

        {/* ── 2. Render PostgreSQL */}
        <ServiceCard
          icon="🗄️" title="Render — PostgreSQL"
          subtitle="قاعدة البيانات الرئيسية"
          status={getDaysLeft(DB_EXPIRY) <= 7 ? "danger" : getDaysLeft(DB_EXPIRY) <= 30 ? "warning" : "ok"}
          statusLabel={getDaysLeft(DB_EXPIRY) <= 30 ? "تنتهي قريباً" : "مجانية"}
          accentColor={getDaysLeft(DB_EXPIRY) <= 30 ? C.yellow : C.green}
        >
          <Countdown expiry={DB_EXPIRY} />
          <InfoRow label="معرف قاعدة البيانات" value="dpg-d7iqkae7r5hc73cd8icg-a" copyId="db-id" copied={copied} onCopy={copy} mono />
          <InfoRow label="الاسم"               value="hasahisawi-db" />
          <InfoRow label="المنطقة"             value="Frankfurt — EU West" />
          <InfoRow label="الخطة الحالية"       value="Free (90 يوم)" />
          <InfoRow label="تاريخ الانتهاء"      value="20 مايو 2026" />
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <ActionBtn href={RENDER_DB_URL}                     icon="📊" label="إدارة القاعدة" color={C.yellow} />
            <ActionBtn href={`${RENDER_DB_URL}/info`}           icon="ℹ️" label="معلومات الاتصال" color={C.yellow} outline />
            <ActionBtn href="https://dashboard.render.com/new/database" icon="⬆️" label="قاعدة بيانات جديدة" color={C.red} outline />
          </div>
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: C.red + "10", border: `1px solid ${C.red}30`,
            fontSize: 12, color: C.yellow, lineHeight: 1.7,
          }}>
            ⚠️ الخطة المجانية تنتهي بعد 90 يوم وتُحذف البيانات نهائياً. للترقية: افتح الإدارة → Upgrade → Starter ($7/شهر).
            يُنصح بعمل نسخة احتياطية قبل الانتهاء مباشرةً.
          </div>
        </ServiceCard>

        {/* ── 3. Firebase */}
        <ServiceCard
          icon="🔥" title="Firebase"
          subtitle="المصادقة والإشعارات والتخزين"
          status="ok" statusLabel="نشط" accentColor={C.orange}
        >
          <InfoRow label="معرف المشروع"      value="hasahisawi"                copyId="fb-proj"   copied={copied} onCopy={copy} mono />
          <InfoRow label="رقم المشروع"       value="133656291161"              copyId="fb-num"    copied={copied} onCopy={copy} mono />
          <InfoRow label="Auth Domain"        value="hasahisawi.firebaseapp.com" copyId="fb-auth"  copied={copied} onCopy={copy} mono />
          <InfoRow label="Storage Bucket"     value="hasahisawi.firebasestorage.app" copyId="fb-storage" copied={copied} onCopy={copy} mono />
          <InfoRow label="Messaging Sender"   value="133656291161"              copyId="fb-msg"    copied={copied} onCopy={copy} mono />
          <InfoRow label="App ID (Android)"   value="1:133656291161:android:a4f8b2c3d1e09876" copyId="fb-apk" copied={copied} onCopy={copy} mono />
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <ActionBtn href="https://console.firebase.google.com/project/hasahisawi" icon="🔥" label="Firebase Console" color={C.orange} />
            <ActionBtn href="https://console.firebase.google.com/project/hasahisawi/authentication" icon="🔐" label="Authentication" color={C.orange} outline />
            <ActionBtn href="https://console.firebase.google.com/project/hasahisawi/messaging" icon="🔔" label="Cloud Messaging" color={C.orange} outline />
            <ActionBtn href="https://console.firebase.google.com/project/hasahisawi/storage" icon="💾" label="Storage" color={C.orange} outline />
          </div>
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: "hsl(217 32% 14%)", border: `1px solid ${C.border}`,
            fontSize: 12, color: C.muted, lineHeight: 1.7,
          }}>
            💡 SHA-1 المسجّل في Firebase: <span style={{ fontFamily: "monospace", color: C.text }}>7B:C4:A4:FC:7A:92:37:05:D3:66:53:B1:E0:67:79:4D:6B:D4:C2:08</span>
          </div>
        </ServiceCard>

        {/* ── 4. EAS / Expo */}
        <ServiceCard
          icon="📱" title="EAS / Expo"
          subtitle="بناء وتوزيع التطبيق"
          status="ok" statusLabel="نشط" accentColor={C.blue}
        >
          <InfoRow label="اسم المشروع"   value="al-hasahisa-service"                        copyId="eas-slug" copied={copied} onCopy={copy} mono />
          <InfoRow label="معرف المشروع"  value="0d3b27d0-5d06-49dd-9b21-be26fb7a5a1a"      copyId="eas-id"   copied={copied} onCopy={copy} mono />
          <InfoRow label="المالك"        value="almhbob2026" />
          <InfoRow label="اسم الحزمة"   value="com.almhbob.hasahisawi"                      copyId="pkg"      copied={copied} onCopy={copy} mono />
          <InfoRow label="الإصدار الحالي" value="5.5.6 (versionCode 156)" />
          <InfoRow label="أمر البناء"   value="eas build --platform android --profile production" copyId="build-cmd" copied={copied} onCopy={copy} mono />
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <ActionBtn href="https://expo.dev/accounts/almhbob2026/projects/al-hasahisa-service" icon="🚀" label="Expo Dashboard" color={C.blue} />
            <ActionBtn href="https://expo.dev/accounts/almhbob2026/projects/al-hasahisa-service/builds" icon="🔨" label="سجل البناء" color={C.blue} outline />
            <ActionBtn href="https://expo.dev/pricing"                                                   icon="⬆️" label="ترقية الخطة" color={C.purple} outline />
          </div>
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: "hsl(217 32% 14%)", border: `1px solid ${C.border}`,
            fontSize: 12, color: C.muted, lineHeight: 1.7,
          }}>
            💡 لبناء AAB: تأكد من وجود EXPO_TOKEN في متغيرات البيئة ثم نفّذ أمر البناء
          </div>
        </ServiceCard>

        {/* ── 5. Google Play Console */}
        <ServiceCard
          icon="🎮" title="Google Play Console"
          subtitle="توزيع التطبيق على Android"
          status="ok" statusLabel="منشور" accentColor={C.green}
        >
          <InfoRow label="اسم التطبيق"  value="حصاحيصاوي" />
          <InfoRow label="اسم الحزمة"   value="com.almhbob.hasahisawi"   copyId="gplay-pkg"  copied={copied} onCopy={copy} mono />
          <InfoRow label="الإصدار"      value="5.5.6 (versionCode 156)" />
          <InfoRow label="SHA-1 (Play)" value="7B:C4:A4:FC:7A:92:37:05:D3:66:53:B1:E0:67:79:4D:6B:D4:C2:08" copyId="sha1" copied={copied} onCopy={copy} mono />
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <ActionBtn
              href="https://play.google.com/console/u/0/developers/app/com.almhbob.hasahisawi"
              icon="🎮" label="Play Console" color={C.green}
            />
            <ActionBtn
              href="https://play.google.com/console/u/0/developers/app/com.almhbob.hasahisawi/releases/overview"
              icon="🚀" label="إدارة الإصدارات" color={C.green} outline
            />
            <ActionBtn
              href="https://play.google.com/console/u/0/developers/app/com.almhbob.hasahisawi/store-presence/store-listing"
              icon="🏪" label="قائمة المتجر" color={C.green} outline
            />
          </div>
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: "hsl(217 32% 14%)", border: `1px solid ${C.border}`,
            fontSize: 12, color: C.muted, lineHeight: 1.7,
          }}>
            💡 بعد بناء AAB من EAS: Play Console → Production → Create new release → رفع ملف .aab
          </div>
        </ServiceCard>

        {/* ── 6. GitHub */}
        <ServiceCard
          icon="🐙" title="GitHub"
          subtitle="مستودع الكود الرئيسي"
          status="ok" statusLabel="نشط" accentColor={C.purple}
        >
          <InfoRow label="المستودع"      value="almhbob/hasahisawi"                   copyId="gh-repo"   copied={copied} onCopy={copy} mono />
          <InfoRow label="الفرع الرئيسي" value="master" />
          <InfoRow label="آخر SHA"       value="fcc07c4633b1821b62b5067694751546ad428dc9" copyId="gh-sha" copied={copied} onCopy={copy} mono />
          <InfoRow label="رابط المستودع" value="https://github.com/almhbob/hasahisawi" copyId="gh-url"   copied={copied} onCopy={copy} mono />
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <ActionBtn href="https://github.com/almhbob/hasahisawi"         icon="🐙" label="فتح المستودع"   color={C.purple} />
            <ActionBtn href="https://github.com/almhbob/hasahisawi/commits" icon="📜" label="سجل التعديلات"  color={C.purple} outline />
            <ActionBtn href="https://github.com/almhbob/hasahisawi/actions" icon="⚙️" label="GitHub Actions" color={C.purple} outline />
          </div>
        </ServiceCard>

      </div>

      {/* ── Quick Reference Table */}
      <div style={{
        marginTop: 28, background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: "22px 24px",
      }}>
        <h2 style={{ margin: "0 0 18px", fontSize: 17, color: C.text, fontWeight: 700 }}>
          📋 مرجع سريع — بيانات الدخول والمعرّفات الرئيسية
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>
          {[
            { label: "API Base URL",       value: API_URL,                  id: "ref-api"   },
            { label: "Admin Email",        value: "Hasahisawi@hotmail.com", id: "ref-email" },
            { label: "Admin PIN",          value: "4444",                   id: "ref-pin"   },
            { label: "Firebase Project",   value: "hasahisawi",             id: "ref-fbp"   },
            { label: "Render Service ID",  value: "srv-d7hnfmvaqgkc739ea5f0", id: "ref-srv" },
            { label: "Render DB ID",       value: "dpg-d7iqkae7r5hc73cd8icg-a", id: "ref-db" },
            { label: "EAS Project ID",     value: "0d3b27d0-5d06-49dd-9b21-be26fb7a5a1a", id: "ref-eas" },
            { label: "App Bundle",         value: "com.almhbob.hasahisawi", id: "ref-bundle" },
          ].map(row => (
            <InfoRow
              key={row.id}
              label={row.label} value={row.value}
              copyId={row.id} copied={copied} onCopy={copy} mono
            />
          ))}
        </div>
      </div>

      {/* ── Urgent Actions */}
      <div style={{
        marginTop: 20, background: C.red + "08", border: `1px solid ${C.red}30`,
        borderRadius: 16, padding: "20px 24px",
      }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 16, color: C.red, fontWeight: 700 }}>
          🚨 إجراءات عاجلة مطلوبة
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              pri: "عالية جداً",
              color: C.red,
              title: "ترقية قاعدة البيانات على Render",
              desc: `قاعدة البيانات المجانية تنتهي ${DB_EXPIRY.toLocaleDateString("ar-SD")} وتُحذف البيانات نهائياً. يجب الترقية أو نسخ البيانات قبل ذلك.`,
              href: RENDER_DB_URL,
              action: "ترقية الآن",
            },
            {
              pri: "متوسطة",
              color: C.yellow,
              title: "ترقية Render Web Service",
              desc: "الخطة المجانية تُعيد تشغيل السيرفر بعد 15 دقيقة خمول مما يسبب بطئاً عند أول طلب. الترقية للـ Starter ($7/شهر) تحل هذه المشكلة.",
              href: `${RENDER_SVC_URL}/settings`,
              action: "ترقية الخطة",
            },
            {
              pri: "منخفضة",
              color: C.blue,
              title: "تخزين الملفات المرفوعة",
              desc: "الملفات تُخزّن حالياً في /tmp/uploads (مؤقتة تُحذف عند إعادة التشغيل). يُنصح بالانتقال إلى Cloudinary أو Render Disk للتخزين الدائم.",
              href: "https://cloudinary.com/pricing",
              action: "خيارات التخزين",
            },
          ].map(item => (
            <div key={item.title} style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              padding: "14px 16px", borderRadius: 10,
              background: item.color + "08", border: `1px solid ${item.color}25`,
            }}>
              <Badge label={item.pri} color={item.color} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
              <a href={item.href} target="_blank" rel="noopener noreferrer"
                style={{
                  padding: "7px 14px", borderRadius: 8, flexShrink: 0,
                  background: item.color, color: "#fff",
                  fontSize: 12, fontWeight: 700, textDecoration: "none",
                }}
              >{item.action}</a>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
