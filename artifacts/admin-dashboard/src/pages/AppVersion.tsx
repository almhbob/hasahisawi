import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/Layout";
import { apiFetch } from "@/lib/api";

type VersionData = { version: number; notes: string; force: boolean };

function useVersion() {
  return useQuery<VersionData>({
    queryKey: ["app-version"],
    queryFn: async () => {
      const r = await apiFetch("/app/version");
      return r.json();
    },
  });
}

const green   = "hsl(147 60% 42%)";
const card    = "hsl(222 47% 10%)";
const border  = "hsl(217 32% 14%)";
const muted   = "hsl(215 20% 55%)";
const fg      = "hsl(210 40% 95%)";

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: 24, ...style }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 13, fontWeight: 600, color: muted, display: "block", marginBottom: 8 }}>{children}</label>;
}

export default function AppVersion() {
  const qc = useQueryClient();
  const { data, isLoading } = useVersion();
  const [version, setVersion] = useState<number | "">("");
  const [notes,   setNotes]   = useState("");
  const [force,   setForce]   = useState(false);
  const [saved,   setSaved]   = useState(false);

  // Sync form with fetched data once
  const [synced, setSynced] = useState(false);
  if (data && !synced) {
    setVersion(data.version);
    setNotes(data.notes ?? "");
    setForce(data.force ?? false);
    setSynced(true);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/admin/app/version", {
        method: "PATCH",
        body: JSON.stringify({ version: Number(version), notes, force }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "حدث خطأ");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-version"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: muted }}>جارٍ التحميل...</div>
    );
  }

  return (
    <div>
      <PageHeader
        title="إدارة إصدار التطبيق"
        subtitle="التحكم في نسخة التطبيق وإشعارات التحديث للمستخدمين"
      />

      <div style={{ padding: "24px 28px", maxWidth: 720 }}>

        {/* Current version banner */}
        <div style={{
          background: `${green}12`, border: `1px solid ${green}33`,
          borderRadius: 16, padding: "20px 24px", marginBottom: 24,
          display: "flex", alignItems: "center", gap: 20,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16,
            background: `${green}1a`, border: `1px solid ${green}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, flexShrink: 0,
          }}>📱</div>
          <div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 4 }}>الإصدار الحالي المنشور</div>
            <div style={{ fontWeight: 800, fontSize: 32, color: green, lineHeight: 1 }}>
              {data?.version ?? "—"}
            </div>
            <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>
              {data?.force ? "⚠️ التحديث إجباري" : "التحديث اختياري"} · {data?.notes ? `"${data.notes.slice(0, 60)}${data.notes.length > 60 ? "…" : ""}"` : "لا توجد ملاحظات"}
            </div>
          </div>
        </div>

        {/* Edit form */}
        <Card>
          <h2 style={{ fontWeight: 700, fontSize: 16, color: fg, margin: "0 0 24px" }}>تعديل إعدادات الإصدار</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <div>
              <Label>رقم الإصدار الجديد</Label>
              <input
                type="number" min={1}
                value={version}
                onChange={e => setVersion(e.target.value ? Number(e.target.value) : "")}
                className="input-field"
                placeholder="مثال: 5"
              />
              <div style={{ fontSize: 11, color: muted, marginTop: 5 }}>
                الإصدار الحالي: {data?.version ?? "—"}
              </div>
            </div>
            <div>
              <Label>نوع التحديث</Label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setForce(false)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${force ? border : green}`,
                    background: force ? card : `${green}1a`, color: force ? muted : green,
                    fontWeight: 600, fontSize: 13, cursor: "pointer",
                  }}
                >
                  ✓ اختياري
                </button>
                <button
                  type="button"
                  onClick={() => setForce(true)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${force ? "hsl(0 72% 55%)" : border}`,
                    background: force ? "hsl(0 72% 55% / 0.15)" : card,
                    color: force ? "hsl(0 72% 65%)" : muted,
                    fontWeight: 600, fontSize: 13, cursor: "pointer",
                  }}
                >
                  ⚠️ إجباري
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <Label>ملاحظات التحديث (تظهر للمستخدمين)</Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="مثال: إصلاح خطأ في شاشة المشوار وتحسينات في الأداء..."
              className="input-field"
              rows={4}
              style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
            />
          </div>

          {force && (
            <div style={{
              padding: "12px 16px", borderRadius: 10,
              background: "hsl(0 72% 55% / 0.1)", border: "1px solid hsl(0 72% 55% / 0.3)",
              color: "hsl(0 72% 65%)", fontSize: 13, marginBottom: 20,
            }}>
              ⚠️ <strong>تحذير:</strong> التحديث الإجباري سيمنع المستخدمين الذين لديهم إصدار أقدم من استخدام التطبيق حتى يُحدّثوه. تأكد قبل الحفظ.
            </div>
          )}

          {mutation.isError && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "hsl(0 72% 55% / 0.15)", border: "1px solid hsl(0 72% 55% / 0.3)", color: "hsl(0 72% 65%)", fontSize: 13, marginBottom: 16 }}>
              {(mutation.error as Error).message}
            </div>
          )}
          {saved && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: `${green}1a`, border: `1px solid ${green}40`, color: green, fontSize: 13, marginBottom: 16 }}>
              ✓ تم حفظ إعدادات الإصدار بنجاح
            </div>
          )}

          <button
            className="btn-primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || version === ""}
            style={{ minWidth: 160 }}
          >
            {mutation.isPending ? "جارٍ الحفظ..." : "💾 حفظ الإعدادات"}
          </button>
        </Card>

        {/* Info guide */}
        <Card style={{ marginTop: 20 }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, color: fg, margin: "0 0 16px" }}>
            📖 كيف يعمل نظام الإصدار؟
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { icon: "🔢", title: "رقم الإصدار", desc: "عدد صحيح يزيد مع كل تحديث للتطبيق (1، 2، 3...). التطبيق يقارن رقمه بالرقم المحفوظ هنا." },
              { icon: "✅", title: "تحديث اختياري", desc: "يظهر للمستخدم إشعار بالتحديث لكنه يستطيع تجاهله ومواصلة استخدام التطبيق." },
              { icon: "⚠️", title: "تحديث إجباري", desc: "المستخدمون الذين لديهم إصدار أقدم من الرقم المحدد لن يستطيعوا استخدام التطبيق حتى يُحدّثوه." },
              { icon: "📝", title: "ملاحظات التحديث", desc: "نص يظهر في نافذة التحديث يشرح للمستخدم ما الجديد في هذا الإصدار." },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10, background: "hsl(222 47% 8%)" }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: fg, marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
