export default function UpdatePostV2() {
  return (
    <div style={{
      width: 540, height: 540,
      background: "#050D0A",
      position: "relative", overflow: "hidden",
      fontFamily: "'Segoe UI', 'Tahoma', Arial, sans-serif",
    }}>

      {/* Watermark */}
      <div style={{
        position: "absolute", top: -20, left: -10,
        fontSize: 200, fontWeight: 900, color: "transparent",
        WebkitTextStroke: "1.5px rgba(39,174,104,0.1)",
        lineHeight: 1, userSelect: "none", letterSpacing: -8, zIndex: 0,
      }}>2.3</div>

      {/* Diagonal accent */}
      <div style={{
        position: "absolute", top: 0, right: 0, width: 0, height: 0,
        borderTop: "540px solid transparent",
        borderRight: "220px solid #27AE68",
        opacity: 0.06, zIndex: 0,
      }} />

      {/* Glows */}
      <div style={{
        position: "absolute", bottom: -40, left: -40, zIndex: 0,
        width: 280, height: 280, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(39,174,104,0.22) 0%, transparent 65%)",
      }} />
      <div style={{
        position: "absolute", top: 60, right: -30, zIndex: 0,
        width: 180, height: 180, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(240,165,0,0.12) 0%, transparent 65%)",
      }} />

      {/* Top strip */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: "linear-gradient(90deg, #27AE68, #3EFF9C, #F0A500)",
        zIndex: 10,
      }} />

      {/* Content */}
      <div style={{
        position: "relative", zIndex: 5, height: "100%",
        display: "flex", flexDirection: "column",
        padding: "22px 32px 18px", boxSizing: "border-box", direction: "rtl",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12, overflow: "hidden",
              boxShadow: "0 0 18px rgba(39,174,104,0.5)", flexShrink: 0,
            }}>
              <img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>حصاحيصاوي</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", letterSpacing: 1 }}>HASAHISAWI</div>
            </div>
          </div>
          <div style={{
            background: "rgba(39,174,104,0.15)", border: "1px solid rgba(39,174,104,0.6)",
            borderRadius: 20, padding: "4px 12px",
            fontSize: 11, color: "#3EFF9C", fontWeight: 700, letterSpacing: 1,
          }}>v 2.3.2</div>
        </div>

        {/* Label */}
        <div style={{
          fontSize: 11, color: "#27AE68", fontWeight: 700,
          letterSpacing: 3, textTransform: "uppercase", marginBottom: 8,
        }}>🚀 — تحديث جديد</div>

        {/* Headline */}
        <div style={{
          fontSize: 50, fontWeight: 900, color: "#FFFFFF",
          lineHeight: 1.05, marginBottom: 8, letterSpacing: -2,
        }}>
          أُعيد
          <br />
          <span style={{
            background: "linear-gradient(135deg, #27AE68 30%, #3EFF9C 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>اختراعه.</span>
        </div>

        {/* Sub */}
        <div style={{
          fontSize: 12.5, color: "rgba(255,255,255,0.4)",
          lineHeight: 1.6, marginBottom: 16,
        }}>
          أقوى إصدار في تاريخ التطبيق — أسرع، أذكى، وأكمل.
        </div>

        {/* Feature card */}
        <div style={{
          background: "rgba(240,165,0,0.07)",
          border: "1px solid rgba(240,165,0,0.25)",
          borderRight: "3px solid #F0A500",
          borderRadius: "0 12px 12px 0",
          padding: "12px 16px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, color: "#F0A500", fontWeight: 700, marginBottom: 3, letterSpacing: 1 }}>
            ✦ الجديد في هذا الإصدار
          </div>
          <div style={{ fontSize: 15, color: "#fff", fontWeight: 700, marginBottom: 3 }}>
            قسم الفعاليات والتأجير
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)" }}>
            خيام · صوتيات · تصوير · إضاءة · ضيافة
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          <div style={{
            flex: 1,
            background: "linear-gradient(135deg, #27AE68, #1c7a42)",
            borderRadius: 13, padding: "13px 16px", textAlign: "center",
            boxShadow: "0 6px 22px rgba(39,174,104,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>حدّث الآن ←</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {["⚡ أداء أسرع", "🛡 استقرار أعلى", "✨ تجربة أفضل"].map((t, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 7, padding: "5px 10px",
                fontSize: 10, color: "rgba(255,255,255,0.5)",
                whiteSpace: "nowrap",
              }}>{t}</div>
            ))}
          </div>
        </div>

        {/* Hashtags */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {["#حصاحيصاوي", "#الحصاحيصا", "#تحديث_جديد"].map((t, i) => (
            <span key={i} style={{ fontSize: 9.5, color: "rgba(39,174,104,0.5)" }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Bottom strip */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: "linear-gradient(90deg, transparent, #27AE68 50%, transparent)", zIndex: 10,
      }} />
    </div>
  );
}
