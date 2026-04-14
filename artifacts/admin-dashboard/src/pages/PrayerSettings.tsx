import { useState, useEffect } from "react";
import { apiFetch, apiJson } from "@/lib/api";

const METHODS = [
  { id: 3,  label: "الهيئة المصرية العامة للمساحة (موصى به)" },
  { id: 1,  label: "رابطة العالم الإسلامي" },
  { id: 4,  label: "جامعة أم القرى، مكة المكرمة" },
  { id: 5,  label: "جامعة العلوم الإسلامية، كراتشي" },
  { id: 2,  label: "الجمعية الإسلامية لأمريكا الشمالية" },
  { id: 12, label: "مؤسسة الهلال (تحري الرؤية)" },
];

const SCHOOLS = [
  { id: 0, label: "شافعي / مالكي / حنبلي (العصر: مثل الشيء)" },
  { id: 1, label: "حنفي (العصر: مثلي الشيء)" },
];

const PRAYER_NAMES: Record<string, string> = {
  fajr: "الفجر", dhuhr: "الظهر", asr: "العصر", maghrib: "المغرب", isha: "العشاء",
};
const PRAYER_EMOJIS: Record<string, string> = {
  fajr: "🌙", dhuhr: "☀️", asr: "🌤", maghrib: "🌅", isha: "🌒",
};

type Settings = {
  method: number;
  school: number;
  latitude: string;
  longitude: string;
  fajr_offset: number;
  dhuhr_offset: number;
  asr_offset: number;
  maghrib_offset: number;
  isha_offset: number;
};

const DEFAULT: Settings = {
  method: 3, school: 0,
  latitude: "14.0566", longitude: "33.4001",
  fajr_offset: 0, dhuhr_offset: 0, asr_offset: 0, maghrib_offset: 0, isha_offset: 0,
};

type PreviewTimes = Record<string, string>;

export default function PrayerSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewTimes | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // ── جلب الإعدادات ──────────────────────────────────────────────────────────
  useEffect(() => {
    apiJson<{ settings: any }>("/prayer-settings")
      .then(data => {
        if (data.settings && Object.keys(data.settings).length > 0) {
          setSettings({
            method:         data.settings.method         ?? 3,
            school:         data.settings.school         ?? 0,
            latitude:       String(data.settings.latitude  ?? "14.0566"),
            longitude:      String(data.settings.longitude ?? "33.4001"),
            fajr_offset:    data.settings.fajr_offset    ?? 0,
            dhuhr_offset:   data.settings.dhuhr_offset   ?? 0,
            asr_offset:     data.settings.asr_offset     ?? 0,
            maghrib_offset: data.settings.maghrib_offset ?? 0,
            isha_offset:    data.settings.isha_offset    ?? 0,
          });
          if (data.settings.updated_at) setUpdatedAt(new Date(data.settings.updated_at).toLocaleString("ar-EG"));
        }
      })
      .catch(() => setError("فشل تحميل الإعدادات"))
      .finally(() => setLoading(false));
  }, []);

  // ── معاينة الأوقات من AlAdhan ───────────────────────────────────────────────
  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      const tune = `0,${settings.fajr_offset},0,${settings.dhuhr_offset},${settings.asr_offset},${settings.maghrib_offset},0,${settings.isha_offset},0`;
      const url = `https://api.aladhan.com/v1/timings?latitude=${settings.latitude}&longitude=${settings.longitude}&method=${settings.method}&school=${settings.school}&tune=${tune}`;
      const res = await fetch(url);
      const json = await res.json();
      setPreview(json.data?.timings ?? null);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── حفظ الإعدادات ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await apiJson<{ settings: any }>("/admin/prayer-settings", {
        method: "PUT",
        body: JSON.stringify({
          method:         Number(settings.method),
          school:         Number(settings.school),
          latitude:       parseFloat(settings.latitude),
          longitude:      parseFloat(settings.longitude),
          fajr_offset:    settings.fajr_offset,
          dhuhr_offset:   settings.dhuhr_offset,
          asr_offset:     settings.asr_offset,
          maghrib_offset: settings.maghrib_offset,
          isha_offset:    settings.isha_offset,
        }),
      });
      if (data.settings?.updated_at) setUpdatedAt(new Date(data.settings.updated_at).toLocaleString("ar-EG"));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message ?? "فشل حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  const setOffset = (key: keyof Settings, delta: number) => {
    setSettings(s => ({ ...s, [key]: (Number(s[key]) + delta) }));
  };

  const formatPreviewTime = (t: string) => {
    if (!t) return "--";
    const [h, m] = t.split(":").map(Number);
    const period = h < 12 ? "ص" : "م";
    const hh = h % 12 || 12;
    return `${hh}:${String(m).padStart(2, "0")} ${period}`;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "hsl(215 20% 55%)" }}>
        جارٍ التحميل...
      </div>
    );
  }

  return (
    <div style={{ direction: "rtl", maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "hsl(210 40% 95%)", marginBottom: 4 }}>
          🕌 إعدادات مواقيت الآذان
        </div>
        <div style={{ fontSize: 13, color: "hsl(215 20% 50%)" }}>
          ضبط طريقة الحساب والإعدادات الافتراضية لمدينة الحصاحيصا — تُطبَّق على كل مستخدمي التطبيق
        </div>
        {updatedAt && (
          <div style={{ fontSize: 12, color: "hsl(147 60% 42%)", marginTop: 6 }}>
            ✓ آخر تحديث: {updatedAt}
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#E0556715", border: "1px solid #E0556740", borderRadius: 10, padding: "10px 16px", marginBottom: 20, color: "#E05567", fontSize: 14 }}>
          {error}
        </div>
      )}

      {saved && (
        <div style={{ background: "hsl(147 60% 42% / 0.12)", border: "1px solid hsl(147 60% 42% / 0.4)", borderRadius: 10, padding: "10px 16px", marginBottom: 20, color: "hsl(147 60% 55%)", fontSize: 14 }}>
          ✓ تم حفظ الإعدادات بنجاح
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ── طريقة الحساب ── */}
        <div style={card}>
          <div style={cardTitle}>🧮 طريقة الحساب</div>
          {METHODS.map(m => (
            <label key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", cursor: "pointer", borderBottom: "1px solid hsl(217 32% 12%)" }}>
              <input
                type="radio"
                name="method"
                checked={Number(settings.method) === m.id}
                onChange={() => setSettings(s => ({ ...s, method: m.id }))}
                style={{ marginTop: 3, accentColor: "hsl(147 60% 42%)", flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: Number(settings.method) === m.id ? "hsl(147 60% 55%)" : "hsl(215 20% 65%)", lineHeight: 1.5 }}>{m.label}</span>
            </label>
          ))}
        </div>

        {/* ── المذهب والإحداثيات ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* المذهب */}
          <div style={card}>
            <div style={cardTitle}>📐 مذهب صلاة العصر</div>
            {SCHOOLS.map(sc => (
              <label key={sc.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="school"
                  checked={Number(settings.school) === sc.id}
                  onChange={() => setSettings(s => ({ ...s, school: sc.id }))}
                  style={{ marginTop: 3, accentColor: "hsl(147 60% 42%)", flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: Number(settings.school) === sc.id ? "hsl(147 60% 55%)" : "hsl(215 20% 65%)", lineHeight: 1.5 }}>{sc.label}</span>
              </label>
            ))}
          </div>

          {/* الإحداثيات */}
          <div style={card}>
            <div style={cardTitle}>📍 الإحداثيات الجغرافية</div>
            <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginBottom: 12 }}>
              الحصاحيصا الافتراضية: 14.0566 °N, 33.4001 °E
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { key: "latitude" as const, label: "خط العرض (Latitude)" },
                { key: "longitude" as const, label: "خط الطول (Longitude)" },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 55%)", marginBottom: 4 }}>{f.label}</div>
                  <input
                    type="number"
                    step="0.0001"
                    value={settings[f.key]}
                    onChange={e => setSettings(s => ({ ...s, [f.key]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── تعديل الدقائق ── */}
      <div style={{ ...card, marginTop: 20 }}>
        <div style={cardTitle}>⏱ تعديل الدقائق لكل صلاة</div>
        <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginBottom: 16 }}>
          للتصحيح الدقيق بسبب الاختلافات المحلية (يمكن أن يكون موجباً أو سالباً)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {(["fajr", "dhuhr", "asr", "maghrib", "isha"] as const).map(key => {
            const offsetKey = `${key}_offset` as keyof Settings;
            return (
              <div key={key} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{PRAYER_EMOJIS[key]}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 40% 90%)", marginBottom: 8 }}>{PRAYER_NAMES[key]}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <button
                    onClick={() => setOffset(offsetKey, -1)}
                    style={offsetBtn}
                  >−</button>
                  <span style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 95%)", minWidth: 32, textAlign: "center" }}>
                    {Number(settings[offsetKey]) > 0 ? "+" : ""}{settings[offsetKey]}
                  </span>
                  <button
                    onClick={() => setOffset(offsetKey, 1)}
                    style={offsetBtn}
                  >+</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── معاينة الأوقات ── */}
      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={cardTitle}>👁 معاينة الأوقات بالإعدادات الحالية</div>
          <button onClick={loadPreview} disabled={previewLoading} style={{
            background: "hsl(147 60% 42% / 0.15)", border: "1px solid hsl(147 60% 42% / 0.4)",
            borderRadius: 8, padding: "6px 14px", color: "hsl(147 60% 55%)", cursor: "pointer",
            fontSize: 13, fontWeight: 600,
          }}>
            {previewLoading ? "جارٍ الجلب..." : "تحديث المعاينة"}
          </button>
        </div>
        {preview ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].map(p => {
              const nameMap: Record<string, string> = { Fajr: "الفجر", Dhuhr: "الظهر", Asr: "العصر", Maghrib: "المغرب", Isha: "العشاء" };
              const emojiMap: Record<string, string> = { Fajr: "🌙", Dhuhr: "☀️", Asr: "🌤", Maghrib: "🌅", Isha: "🌒" };
              return (
                <div key={p} style={{
                  flex: "1 1 120px", textAlign: "center",
                  background: "hsl(222 47% 8%)", borderRadius: 10, padding: "12px 8px",
                  border: "1px solid hsl(217 32% 12%)",
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{emojiMap[p]}</div>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 55%)", marginBottom: 4 }}>{nameMap[p]}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "hsl(147 60% 55%)" }}>{formatPreviewTime(preview[p])}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "hsl(215 20% 45%)", fontSize: 13, padding: "20px 0" }}>
            اضغط "تحديث المعاينة" لجلب أوقات الصلاة من خادم AlAdhan
          </div>
        )}
      </div>

      {/* ── أزرار الحفظ ── */}
      <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-start" }}>
        <button
          onClick={() => setSettings(DEFAULT)}
          style={{
            background: "hsl(217 32% 10%)", border: "1px solid hsl(217 32% 16%)",
            borderRadius: 10, padding: "10px 20px", color: "hsl(215 20% 55%)",
            cursor: "pointer", fontSize: 14, fontWeight: 500,
          }}
        >
          إعادة تعيين الافتراضيات
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saving ? "hsl(147 60% 25%)" : "hsl(147 60% 42%)",
            border: "none", borderRadius: 10, padding: "10px 28px",
            color: "#fff", cursor: saving ? "not-allowed" : "pointer",
            fontSize: 14, fontWeight: 700,
          }}
        >
          {saving ? "جارٍ الحفظ..." : "💾 حفظ الإعدادات"}
        </button>
      </div>

      {/* تنبيه */}
      <div style={{
        marginTop: 20, padding: "12px 16px",
        background: "hsl(147 60% 42% / 0.06)", borderRadius: 10,
        border: "1px solid hsl(147 60% 42% / 0.2)",
        fontSize: 12, color: "hsl(215 20% 50%)", lineHeight: 1.8,
      }}>
        💡 <strong style={{ color: "hsl(147 60% 50%)" }}>ملاحظة:</strong> هذه الإعدادات تُعدّ الإعدادات الافتراضية للمدينة. يمكن للمستخدم تغييرها محلياً من داخل التطبيق. يُستخدم خادم <strong>AlAdhan</strong> (aladhan.com) لحساب الأوقات — خدمة مجانية وموثوقة.
      </div>
    </div>
  );
}

// ─── أنماط مشتركة ────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: "hsl(222 47% 7%)",
  border: "1px solid hsl(217 32% 12%)",
  borderRadius: 14, padding: "18px 20px",
};

const cardTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: "hsl(210 40% 85%)", marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%", background: "hsl(222 47% 8%)",
  border: "1px solid hsl(217 32% 16%)", borderRadius: 8, padding: "8px 12px",
  color: "hsl(210 40% 90%)", fontSize: 14, boxSizing: "border-box",
  textAlign: "left" as const, direction: "ltr",
};

const offsetBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7,
  background: "hsl(147 60% 42% / 0.15)",
  border: "1px solid hsl(147 60% 42% / 0.4)",
  color: "hsl(147 60% 55%)",
  cursor: "pointer", fontSize: 16, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
};
