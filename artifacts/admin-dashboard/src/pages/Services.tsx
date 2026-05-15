import { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type HealthStatus = "checking" | "online" | "offline" | "slow";

// ─── Constants ───────────────────────────────────────────────────────────────

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

  // ── Vercel + Railway (الخادم الحالي)
  const API_URL        = "https://hasahisawi-api-asim-abdulrahman-mohammed.vercel.app";
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
            { label: "Vercel API",        icon: "▲",  status: "يعمل",   color: C.green   },
            { label: "Railway Postgres",  icon: "🗄️", status: "يعمل",   color: C.green   },
            { label: "Firebase",          icon: "🔥", status: "نشط",    color: C.orange  },
            { label: "EAS / Expo",        icon: "📱", status: "نشط",    color: C.blue    },
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
                  service: "▲ Vercel — API Server",
                  plan: "Hobby (مجاني)",
                  cost: "$0",
                  priority: "—", priorityColor: C.muted,
                  status: "يعمل بلا cold-start", statusColor: C.green,
                  btnLabel: "لوحة Vercel", btnColor: C.green,
                  href: "https://vercel.com/asim-abdulrahman-mohammed/hasahisawi-api",
                },
                {
                  service: "🗄️ Railway — PostgreSQL",
                  plan: "مجاني (5$ رصيد/شهر)",
                  cost: "$0",
                  priority: "متوسطة", priorityColor: C.yellow,
                  status: "يعمل", statusColor: C.green,
                  btnLabel: "لوحة Railway", btnColor: C.purple,
                  href: "https://railway.app",
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

        {/* ── 1. Vercel API Server */}
        <ServiceCard
          icon="▲" title="Vercel — API Server"
          subtitle="خادم التطبيق الرئيسي (مجاني، بلا cold-start)"
          status="ok" statusLabel="يعمل" accentColor={C.green}
        >
          <HealthPing url={HEALTH_URL} />
          <InfoRow label="رابط الـ API"     value={API_URL}                                   copyId="api-url"    copied={copied} onCopy={copy} mono />
          <InfoRow label="Project ID"       value="prj_h3HTgJKHTAsqBt6W2r93MhgDuJGm"         copyId="prj-id"     copied={copied} onCopy={copy} mono />
          <InfoRow label="فحص الصحة"       value={HEALTH_URL}                                 copyId="health-url" copied={copied} onCopy={copy} mono />
          <InfoRow label="المنطقة"          value="Washington D.C. — US East (iad1)" />
          <InfoRow label="النشر"            value="Vercel Deploy API (بدون GitHub push)" />
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <ActionBtn href="https://vercel.com/asim-abdulrahman-mohammed/hasahisawi-api"         icon="▲" label="لوحة Vercel"       color={C.green} />
            <ActionBtn href="https://vercel.com/asim-abdulrahman-mohammed/hasahisawi-api/logs"    icon="📄" label="سجلات التشغيل"  color={C.green} outline />
            <ActionBtn href="https://vercel.com/asim-abdulrahman-mohammed/hasahisawi-api/settings" icon="⚙️" label="الإعدادات"       color={C.green} outline />
          </div>
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: "hsl(217 32% 14%)", border: `1px solid ${C.border}`,
            fontSize: 12, color: C.muted, lineHeight: 1.7,
          }}>
            💡 للنشر: شغّل <code>node build.mjs</code> ثم ارفع الملفات عبر Vercel Deploy API باستخدام <code>VERCEL_TOKEN</code>
          </div>
        </ServiceCard>

        {/* ── 2. Railway PostgreSQL */}
        <ServiceCard
          icon="🗄️" title="Railway — PostgreSQL"
          subtitle="قاعدة البيانات الرئيسية (60 جدول)"
          status="ok" statusLabel="يعمل" accentColor={C.green}
        >
          <InfoRow label="Host"             value="shortline.proxy.rlwy.net:28066"              copyId="db-host"    copied={copied} onCopy={copy} mono />
          <InfoRow label="Database"         value="railway"                                      copyId="db-name"    copied={copied} onCopy={copy} mono />
          <InfoRow label="Project ID"       value="4e3750d2 (sunny-peace)"                      copyId="db-proj"    copied={copied} onCopy={copy} mono />
          <InfoRow label="الجداول"          value="60 جدول — مُهيَّأة وجاهزة" />
          <InfoRow label="SSL"              value="sslmode=require + rejectUnauthorized: false" />
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <ActionBtn href="https://railway.app/project/4e3750d2" icon="🚂" label="لوحة Railway"     color={C.purple} />
            <ActionBtn href="https://railway.app"                  icon="➕" label="لوحة عامة"        color={C.purple} outline />
          </div>
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: "hsl(217 32% 14%)", border: `1px solid ${C.border}`,
            fontSize: 12, color: C.muted, lineHeight: 1.7,
          }}>
            💡 Railway يمنح رصيداً مجانياً $5/شهر. إن انتهى، قم بترقية الخطة أو نقل البيانات لـ Neon PostgreSQL (مجاني).
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
            { label: "Vercel Project ID",   value: "prj_h3HTgJKHTAsqBt6W2r93MhgDuJGm", id: "ref-vercel" },
            { label: "Railway Host",       value: "shortline.proxy.rlwy.net:28066", id: "ref-railway" },
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
              pri: "متوسطة",
              color: C.yellow,
              title: "رصيد Railway ($5/شهر)",
              desc: "Railway يمنح $5 رصيداً مجانياً شهرياً. إن قاربت الحدّ، قم بترقية الخطة أو انقل قاعدة البيانات إلى Neon PostgreSQL (طبقة مجانية سخية).",
              href: "https://railway.app",
              action: "لوحة Railway",
            },
            {
              pri: "منخفضة",
              color: C.blue,
              title: "تفعيل Firebase Storage",
              desc: "تشغيل Firebase Storage مطلوب للصور والفيديوهات المرفوعة. افتح Firebase Console → Storage → Get Started ثم انشر القواعد.",
              href: "https://console.firebase.google.com/project/hasahisawi/storage",
              action: "فتح Firebase Storage",
            },
            {
              pri: "منخفضة",
              color: C.blue,
              title: "إضافة SHA-1 لـ Play App Signing",
              desc: "أضف SHA-1 مفتاح توقيع Play إلى Firebase لتفعيل Google Sign-In على الإصدار المنشور. افتح Play Console → App Integrity → Copy Signing Certificate SHA-1.",
              href: "https://console.firebase.google.com/project/hasahisawi/settings/general/android:com.almhbob.hasahisawi",
              action: "إعدادات Firebase Android",
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
