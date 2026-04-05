import { useState, useEffect } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type AppVersion = {
  version: string; build_number: string; update_url?: string;
  change_log?: string; is_mandatory?: boolean;
};

type AiConfig = {
  enabled: boolean; system_prompt?: string; model?: string;
  max_tokens?: number;
};

export default function Settings() {
  const [version,  setVersion]  = useState<AppVersion>({ version: "", build_number: "" });
  const [aiConfig, setAiConfig] = useState<AiConfig>({ enabled: false });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [msg,      setMsg]      = useState<{text: string; ok: boolean} | null>(null);

  useEffect(() => {
    Promise.all([
      apiJson<AppVersion>("/app/version").catch(() => null),
      apiJson<AiConfig>("/admin/ai-settings").catch(() => null),
    ]).then(([v, ai]) => {
      if (v) setVersion(v);
      if (ai) setAiConfig(ai);
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
      await apiFetch("/admin/ai-settings", { method: "PUT", body: JSON.stringify(aiConfig) });
      setMsg({ text: "تم حفظ إعدادات الذكاء الاصطناعي", ok: true });
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
                {[
                  { label: "رقم الإصدار", key: "version", placeholder: "1.0.0" },
                  { label: "رقم البناء", key: "build_number", placeholder: "100" },
                  { label: "رابط التحديث", key: "update_url", placeholder: "https://..." },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>{f.label}</label>
                    <input type="text" value={(version as any)[f.key] ?? ""} placeholder={f.placeholder}
                      onChange={e => setVersion(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="input-field" />
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 40% 80%)" }}>تحديث إجباري</label>
                  <input type="checkbox" checked={version.is_mandatory ?? false}
                    onChange={e => setVersion(prev => ({ ...prev, is_mandatory: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: "pointer" }} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>سجل التغييرات</label>
                  <textarea value={version.change_log ?? ""} rows={3}
                    onChange={e => setVersion(prev => ({ ...prev, change_log: e.target.value }))}
                    className="input-field" style={{ resize: "none" }} placeholder="ما الجديد في هذا الإصدار..." />
                </div>
              </div>
              <button className="btn-primary" onClick={saveVersion} disabled={saving === "version"} style={{ marginTop: 16 }}>
                {saving === "version" ? "جارٍ الحفظ..." : "💾 حفظ إعدادات الإصدار"}
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 40% 80%)" }}>تفعيل الذكاء الاصطناعي</label>
                  <input type="checkbox" checked={aiConfig.enabled ?? false}
                    onChange={e => setAiConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: "pointer" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>النموذج</label>
                  <input type="text" value={aiConfig.model ?? ""} placeholder="gpt-4o-mini"
                    onChange={e => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                    className="input-field" />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>الحد الأقصى للـ tokens</label>
                  <input type="number" value={aiConfig.max_tokens ?? 1000}
                    onChange={e => setAiConfig(prev => ({ ...prev, max_tokens: +e.target.value }))}
                    className="input-field" />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>النص التمهيدي للنظام (System Prompt)</label>
                  <textarea value={aiConfig.system_prompt ?? ""} rows={4}
                    onChange={e => setAiConfig(prev => ({ ...prev, system_prompt: e.target.value }))}
                    className="input-field" style={{ resize: "none" }}
                    placeholder="أنت مساعد ذكي لمدينة حصاحيصا..." />
                </div>
              </div>
              <button className="btn-primary" onClick={saveAi} disabled={saving === "ai"} style={{ marginTop: 16 }}>
                {saving === "ai" ? "جارٍ الحفظ..." : "💾 حفظ إعدادات الذكاء الاصطناعي"}
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
