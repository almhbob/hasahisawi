export default function UpdatePost4K() {
  const SCALE = 3;
  const S = 540;

  return (
    <div style={{ width: S * SCALE, height: S * SCALE, overflow: "hidden", background: "#0B1F14" }}>
      <div style={{ transform: `scale(${SCALE})`, transformOrigin: "top left", width: S, height: S }}>

        <div style={{
          width: S, height: S, background: "#0B1F14", position: "relative",
          overflow: "hidden", fontFamily: "'Segoe UI', 'Tahoma', Arial, sans-serif",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>

          {/* Glows */}
          <div style={{
            position: "absolute", top: -120, left: -120, width: 400, height: 400, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(39,174,104,0.3) 0%, transparent 70%)", pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: -100, right: -100, width: 350, height: 350, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(240,165,0,0.2) 0%, transparent 70%)", pointerEvents: "none",
          }} />

          {/* Dot grid */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.05 }} viewBox="0 0 540 540">
            {Array.from({ length: 11 }).map((_, i) =>
              Array.from({ length: 11 }).map((_, j) => (
                <circle key={`${i}-${j}`} cx={i * 54} cy={j * 54} r="1.5" fill="#27AE68" />
              ))
            )}
          </svg>

          {/* Speed lines */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.04 }} viewBox="0 0 540 540">
            {[0,60,120,180,240,300,360,420,480,540,600].map((x, i) => (
              <line key={i} x1={x} y1="0" x2={x - 200} y2="540" stroke="#3EFF9C" strokeWidth="1" />
            ))}
          </svg>

          {/* NEW badge */}
          <div style={{
            position: "absolute", top: 28, left: "50%", transform: "translateX(-50%)",
            background: "linear-gradient(135deg, #27AE68, #1a7a4a)", borderRadius: 30, padding: "6px 24px",
            fontSize: 12, color: "#fff", fontWeight: 800, letterSpacing: 3, textTransform: "uppercase",
            zIndex: 10, boxShadow: "0 4px 20px rgba(39,174,104,0.5)", whiteSpace: "nowrap",
          }}>
            🚀 تحديث جديد
          </div>

          {/* Main content */}
          <div style={{
            position: "relative", zIndex: 10, display: "flex", flexDirection: "column",
            alignItems: "center", textAlign: "center", direction: "rtl", padding: "0 40px",
          }}>
            {/* Logo */}
            <div style={{
              width: 90, height: 90, borderRadius: 22, overflow: "hidden",
              boxShadow: "0 0 0 3px rgba(39,174,104,0.3), 0 0 40px rgba(39,174,104,0.4)", marginBottom: 18,
            }}>
              <img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>

            {/* Version */}
            <div style={{
              background: "rgba(39,174,104,0.12)", border: "1px solid rgba(39,174,104,0.35)",
              borderRadius: 20, padding: "4px 18px", fontSize: 12, color: "#3EFF9C",
              fontWeight: 700, marginBottom: 14, letterSpacing: 1,
            }}>
              الإصدار 2.3.2
            </div>

            {/* Headline */}
            <div style={{
              fontSize: 36, fontWeight: 900, color: "#FFFFFF", lineHeight: 1.2, marginBottom: 6,
              textShadow: "0 0 30px rgba(39,174,104,0.4)",
            }}>
              التحديث وصل!
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
              حصاحيصاوي أقوى وأسرع من أي وقت
            </div>

            {/* Feature */}
            <div style={{
              background: "linear-gradient(135deg, rgba(240,165,0,0.12), rgba(39,174,104,0.08))",
              border: "1px solid rgba(240,165,0,0.3)", borderRadius: 16, padding: "16px 24px",
              marginBottom: 20, width: "100%", boxSizing: "border-box",
            }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, letterSpacing: 1 }}>
                الجديد في هذا الإصدار
              </div>
              <div style={{ fontSize: 15, color: "#F0A500", fontWeight: 700, marginBottom: 8 }}>
                🎪 قسم الفعاليات والتأجير
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                خيام · أثاث · صوتيات · تصوير · إضاءة · ضيافة
              </div>
            </div>

            {/* Tags */}
            <div style={{ display: "flex", gap: 10, marginBottom: 24, width: "100%", justifyContent: "center" }}>
              {["✅ أداء أسرع", "✅ استقرار أعلى", "✅ تجربة أفضل"].map((t, i) => (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 10, padding: "7px 10px", fontSize: 11, color: "rgba(255,255,255,0.65)",
                  flex: 1, textAlign: "center",
                }}>{t}</div>
              ))}
            </div>

            {/* CTA */}
            <div style={{
              width: "100%", background: "linear-gradient(135deg, #27AE68, #1E8A50)",
              borderRadius: 16, padding: "14px 20px", fontSize: 16, fontWeight: 800, color: "#fff",
              boxShadow: "0 8px 30px rgba(39,174,104,0.45)",
            }}>
              حدّث التطبيق الآن ←
            </div>
          </div>

          {/* Hashtags */}
          <div style={{ position: "absolute", bottom: 20, zIndex: 10, display: "flex", gap: 8 }}>
            {["#حصاحيصاوي", "#الحصاحيصا", "#تحديث_جديد"].map((t, i) => (
              <span key={i} style={{
                fontSize: 10, color: "rgba(39,174,104,0.6)", background: "rgba(39,174,104,0.08)",
                border: "1px solid rgba(39,174,104,0.15)", borderRadius: 8, padding: "3px 8px",
              }}>{t}</span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
