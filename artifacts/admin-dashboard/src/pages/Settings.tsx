import { useState, useEffect } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type AppVersion = {
  version: number; notes: string; force: boolean;
};

type AiConfig = {
  ai_enabled: boolean;
  ai_system_prompt: string;
  ai_api_key: string;
};

type FeatureFlags = {
  gov_services_enabled: boolean;
  gov_appointments_enabled: boolean;
  gov_reports_enabled: boolean;
};

export default function Settings() {
  const [version,  setVersion]  = useState<AppVersion>({ version: 1, notes: "", force: false });
  const [aiConfig, setAiConfig] = useState<AiConfig>({ ai_enabled: false, ai_system_prompt: "", ai_api_key: "" });
  const [flags,    setFlags]    = useState<FeatureFlags>({ gov_services_enabled: true, gov_appointments_enabled: true, gov_reports_enabled: true });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [msg,      setMsg]      = useState<{text: string; ok: boolean} | null>(null);

  useEffect(() => {
    Promise.all([
      apiJson<AppVersion>("/app/version").catch(() => null),
      apiJson<Record<string,string>>("/admin/ai-settings").catch(() => null),
      apiJson<FeatureFlags>("/app/feature-flags").catch(() => null),
    ]).then(([v, ai, f]) => {
      if (v) setVersion(v);
      if (ai) setAiConfig({
        ai_enabled: ai.ai_enabled === "true" || ai.ai_enabled === true as any,
        ai_system_prompt: ai.ai_system_prompt ?? "",
        ai_api_key: ai.ai_api_key ?? "",
      });
      if (f) setFlags(f);
      setLoading(false);
    });
  }, []);

  const saveVersion = async () => {
    setSaving("version");
    try {
      await apiFetch("/admin/app/version", { method: "PATCH", body: JSON.stringify(version) });
      setMsg({ text: "تم حفظ إعدادات الإصدار بنجاح", ok: true });
    } catch {
      setMsg({ text: "فشل الحفظ", ok: false });
    }
    setSaving(null);
    setTimeout(() => setMsg(null), 3000);
  };

  const saveAi = async () => {
    setSaving("ai");
    try {
      await apiFetch("/admin/ai-settings", { method: "PUT", body: JSON.stringify({
        ai_enabled: aiConfig.ai_enabled,
        ai_system_prompt: aiConfig.ai_system_prompt,
        ai_api_key: aiConfig.ai_api_key,
      }) });
      setMsg({ text: "تم حفظ إعدادات الذكاء الاصطناعي", ok: true });
    } catch {
      setMsg({ text: "فشل الحفظ", ok: false });
    }
    setSaving(null);
    setTimeout(() => setMsg(null), 3000);
  };

  const saveFlags = async () => {
    setSaving("flags");
    try {
      await apiFetch("/admin/feature-flags", { method: "PATCH", body: JSON.stringify(flags) });
      setMsg({ text: "تم حفظ إعدادات الخدمات الحكومية بنجاح", ok: true });
    } catch {
      setMsg({ text: "فشل الحفظ", ok: false });
    }
    setSaving(null);
    setTimeout(() => setMsg(null), 3000);
  };

  return (
    <div>
      <PageHeader title="إعدادات التطبيق" subtitle="ضبط عام وإصدارات وذكاء اصطناعي" />
      <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Toast */}
        {msg && (
          <div style={{
            padding: "12px 20px", borderRadius: 12, border: "1px solid",
            borderColor: msg.ok ? "hsl(147 60% 42% / 0.4)" : "hsl(0 72% 55% / 0.4)",
            background: msg.ok ? "hsl(147 60% 42% / 0.12)" : "hsl(0 72% 55% / 0.12)",
            color: msg.ok ? "hsl(147 60% 55%)" : "hsl(0 72% 65%)",
            fontSize: 14, fontWeight: 600,
          }}>{msg.text}</div>
        )}

        {loading ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0" }}>جارٍ التحميل...</p>
        ) : (
          <>
            {/* App Version */}
            <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "hsl(217 91% 60% / 0.12)", border: "1px solid hsl(217 91% 60% / 0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📱</div>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 90%)", margin: 0 }}>إصدار التطبيق</h3>
                  <p style={{ fontSize: 12, color: "hsl(215 20% 50%)", margin: "3px 0 0" }}>تحديث إصدار التطبيق المحمول</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* رقم الإصدار */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>رقم الإصدار</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => setVersion(v => ({ ...v, version: Math.max(1, v.version - 1) }))}
                      style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 13%)", color: "hsl(210 40% 70%)", fontSize: 18, cursor: "pointer" }}>−</button>
                    <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 22, color: "hsl(217 91% 60%)" }}>{version.version}</div>
                    <button onClick={() => setVersion(v => ({ ...v, version: v.version + 1 }))}
                      style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid hsl(217 91% 60% / 0.4)", background: "hsl(217 91% 60% / 0.12)", color: "hsl(217 91% 60%)", fontSize: 18, cursor: "pointer" }}>+</button>
                  </div>
                  <p style={{ fontSize: 11, color: "hsl(215 20% 45%)", margin: "6px 0 0" }}>الإصدار الحالي في التطبيق: 1</p>
                </div>
                {/* تحديث إجباري */}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)" }}>تحديث إجباري</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={version.force}
                      onChange={e => setVersion(prev => ({ ...prev, force: e.target.checked }))}
                      style={{ width: 18, height: 18, cursor: "pointer" }} />
                    <span style={{ fontSize: 13, color: version.force ? "hsl(0 72% 65%)" : "hsl(215 20% 60%)" }}>
                      {version.force ? "إجباري — المستخدم لا يستطيع تجاهله" : "اختياري — يمكن تجاهله"}
                    </span>
                  </label>
                </div>
                {/* ملاحظات التحديث */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>ملاحظات التحديث</label>
                  <textarea value={version.notes} rows={3}
                    onChange={e => setVersion(prev => ({ ...prev, notes: e.target.value }))}
                    className="input-field" style={{ resize: "none" }} placeholder="اكتب مزايا الإصدار الجديد (سطر لكل ميزة)..." />
                  <p style={{ fontSize: 11, color: "hsl(215 20% 45%)", margin: "4px 0 0" }}>كل سطر يظهر كنقطة منفصلة في إشعار التحديث</p>
                </div>
              </div>
              <button className="btn-primary" onClick={saveVersion} disabled={saving === "version"} style={{ marginTop: 16 }}>
                {saving === "version" ? "جارٍ النشر..." : "🚀 نشر التحديث"}
              </button>
            </div>

            {/* AI Config */}
            <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "hsl(270 91% 65% / 0.12)", border: "1px solid hsl(270 91% 65% / 0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🤖</div>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 90%)", margin: 0 }}>الذكاء الاصطناعي</h3>
                  <p style={{ fontSize: 12, color: "hsl(215 20% 50%)", margin: "3px 0 0" }}>ضبط المساعد الذكي في التطبيق</p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 40% 80%)" }}>تفعيل الذكاء الاصطناعي</label>
                  <input type="checkbox" checked={aiConfig.ai_enabled}
                    onChange={e => setAiConfig(prev => ({ ...prev, ai_enabled: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: "pointer" }} />
                  <span style={{ fontSize: 12, color: aiConfig.ai_enabled ? "hsl(147 60% 55%)" : "hsl(215 20% 50%)" }}>
                    {aiConfig.ai_enabled ? "مُفعَّل" : "مُعطَّل"}
                  </span>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>مفتاح API</label>
                  <input type="password" value={aiConfig.ai_api_key}
                    onChange={e => setAiConfig(prev => ({ ...prev, ai_api_key: e.target.value }))}
                    className="input-field" placeholder="sk-..." />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>النص التمهيدي للنظام (System Prompt)</label>
                  <textarea value={aiConfig.ai_system_prompt} rows={4}
                    onChange={e => setAiConfig(prev => ({ ...prev, ai_system_prompt: e.target.value }))}
                    className="input-field" style={{ resize: "none" }}
                    placeholder="أنت مساعد ذكي لمدينة الحصاحيصا..." />
                </div>
              </div>
              <button className="btn-primary" onClick={saveAi} disabled={saving === "ai"} style={{ marginTop: 16 }}>
                {saving === "ai" ? "جارٍ الحفظ..." : "💾 حفظ إعدادات الذكاء الاصطناعي"}
              </button>
            </div>

            {/* Government Services Feature Flags */}
            <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "hsl(38 90% 50% / 0.12)", border: "1px solid hsl(38 90% 50% / 0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏛️</div>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 90%)", margin: 0 }}>الخدمات الحكومية</h3>
                  <p style={{ fontSize: 12, color: "hsl(215 20% 50%)", margin: "3px 0 0" }}>إخفاء أو إظهار الأقسام الحكومية في التطبيق فوراً</p>
                </div>
                <div style={{
                  marginRight: "auto", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: flags.gov_services_enabled ? "hsl(147 60% 42% / 0.15)" : "hsl(0 72% 55% / 0.15)",
                  color: flags.gov_services_enabled ? "hsl(147 60% 55%)" : "hsl(0 72% 65%)",
                  border: `1px solid ${flags.gov_services_enabled ? "hsl(147 60% 42% / 0.3)" : "hsl(0 72% 55% / 0.3)"}`,
                }}>
                  {flags.gov_services_enabled ? "✅ مُفعّلة" : "🚫 مُخفاة"}
                </div>
              </div>

              {/* Info Banner */}
              <div style={{ background: "hsl(38 90% 50% / 0.08)", border: "1px solid hsl(38 90% 50% / 0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 16 }}>💡</span>
                <p style={{ fontSize: 12, color: "hsl(38 90% 65%)", lineHeight: 1.7, margin: 0 }}>
                  استخدم هذا القسم لإخفاء الخدمات الحكومية مؤقتاً أثناء مراجعة Google Play. بعد حل المشكلة، أعد تفعيلها من هنا دون الحاجة لتحديث التطبيق.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { key: "gov_services_enabled" as keyof FeatureFlags, label: "جميع الخدمات الحكومية", desc: "مفتاح رئيسي — يؤثر على جميع الأقسام الحكومية في التطبيق", icon: "🏛️", color: "hsl(213 90% 60%)" },
                  { key: "gov_appointments_enabled" as keyof FeatureFlags, label: "حجز المواعيد الحكومية", desc: "إخفاء قسم المحلية، السجل المدني، مكتب الأراضي، المحكمة", icon: "📅", color: "hsl(147 60% 45%)" },
                  { key: "gov_reports_enabled" as keyof FeatureFlags, label: "بلاغات البنية التحتية", desc: "إخفاء البلاغات المتعلقة بالكهرباء والمياه والطرق", icon: "📢", color: "hsl(0 72% 55%)" },
                ].map(item => (
                  <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 14, background: "hsl(217 32% 12%)", borderRadius: 12, padding: "14px 16px", border: "1px solid hsl(217 32% 16%)" }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "hsl(210 40% 88%)", marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "hsl(215 20% 50%)" }}>{item.desc}</div>
                    </div>
                    <button
                      onClick={() => setFlags(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                      style={{
                        width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
                        background: flags[item.key] ? item.color : "hsl(217 32% 20%)",
                        position: "relative", transition: "background 0.2s", flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: "absolute", top: 3, width: 22, height: 22, borderRadius: "50%",
                        background: "#fff", transition: "right 0.2s, left 0.2s",
                        right: flags[item.key] ? 3 : undefined,
                        left: flags[item.key] ? undefined : 3,
                      }} />
                    </button>
                    <span style={{ fontSize: 12, fontWeight: 600, minWidth: 40, color: flags[item.key] ? "hsl(147 60% 55%)" : "hsl(0 72% 65%)" }}>
                      {flags[item.key] ? "ظاهر" : "مخفي"}
                    </span>
                  </div>
                ))}
              </div>

              <button className="btn-primary" onClick={saveFlags} disabled={saving === "flags"} style={{ marginTop: 18 }}>
                {saving === "flags" ? "جارٍ الحفظ..." : "💾 حفظ إعدادات الخدمات الحكومية"}
              </button>
            </div>

            {/* Admin Credentials Info */}
            <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "hsl(38 90% 50% / 0.12)", border: "1px solid hsl(38 90% 50% / 0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔐</div>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 90%)", margin: 0 }}>معلومات الأمان</h3>
                  <p style={{ fontSize: 12, color: "hsl(215 20% 50%)", margin: "3px 0 0" }}>بيانات الدخول وصلاحيات المسؤولين</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { icon: "📧", label: "البريد الإلكتروني للمسؤول", value: "almhbob.iii@gmail.com" },
                  { icon: "🔢", label: "PIN المسؤول", value: "مشفّر في قاعدة البيانات" },
                  { icon: "🔑", label: "نوع المصادقة", value: "Session-based Tokens" },
                  { icon: "🛡️", label: "صلاحيات متاحة", value: "admin · moderator" },
                ].map(i => (
                  <div key={i.label} style={{ background: "hsl(217 32% 12%)", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, color: "hsl(215 20% 50%)", marginBottom: 4 }}>{i.icon} {i.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 40% 85%)" }}>{i.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
