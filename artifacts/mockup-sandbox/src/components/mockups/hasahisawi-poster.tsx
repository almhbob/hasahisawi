export default function HasahisawiPoster() {
  return (
    <div style={{
      width: 540,
      height: 960,
      background: "#0B1F14",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Segoe UI', 'Tahoma', Arial, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>

      {/* Background pattern */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.06 }} viewBox="0 0 540 960">
        {Array.from({ length: 12 }).map((_, i) =>
          Array.from({ length: 20 }).map((_, j) => (
            <circle key={`${i}-${j}`} cx={i * 50} cy={j * 50} r="1.5" fill="#27AE68" />
          ))
        )}
      </svg>

      {/* Top green arc */}
      <svg style={{ position: "absolute", top: -120, left: -60, width: 660, height: 420, opacity: 0.18 }} viewBox="0 0 660 420">
        <ellipse cx="330" cy="100" rx="300" ry="260" fill="none" stroke="#27AE68" strokeWidth="80" />
      </svg>

      {/* Gold accent bottom */}
      <svg style={{ position: "absolute", bottom: -100, right: -80, width: 500, height: 400, opacity: 0.12 }} viewBox="0 0 500 400">
        <ellipse cx="400" cy="350" rx="250" ry="200" fill="none" stroke="#F0A500" strokeWidth="60" />
      </svg>

      {/* Top bar */}
      <div style={{
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "28px 36px 0",
        boxSizing: "border-box",
        position: "relative",
        zIndex: 10,
      }}>
        <div style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.35)",
          letterSpacing: 3,
          textTransform: "uppercase",
        }}>
          Hasahisa · Sudan
        </div>
        <div style={{
          background: "linear-gradient(135deg, #27AE68, #1a7a4a)",
          borderRadius: 20,
          padding: "5px 16px",
          fontSize: 11,
          color: "#fff",
          fontWeight: 700,
          letterSpacing: 1,
        }}>
          متاح على Google Play
        </div>
      </div>

      {/* Logo */}
      <div style={{
        position: "relative",
        zIndex: 10,
        marginTop: 40,
        marginBottom: 8,
      }}>
        <div style={{
          width: 130,
          height: 130,
          borderRadius: 32,
          overflow: "hidden",
          boxShadow: "0 0 0 4px rgba(39,174,104,0.25), 0 0 60px rgba(39,174,104,0.4), 0 20px 50px rgba(0,0,0,0.5)",
        }}>
          <img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        {/* Glow ring */}
        <div style={{
          position: "absolute",
          inset: -12,
          borderRadius: 44,
          border: "1.5px solid rgba(39,174,104,0.3)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute",
          inset: -24,
          borderRadius: 56,
          border: "1px solid rgba(39,174,104,0.12)",
          pointerEvents: "none",
        }} />
      </div>

      {/* App name */}
      <div style={{
        position: "relative",
        zIndex: 10,
        textAlign: "center",
        marginTop: 22,
        direction: "rtl",
      }}>
        <div style={{
          fontSize: 52,
          fontWeight: 900,
          color: "#FFFFFF",
          lineHeight: 1,
          letterSpacing: -1,
          textShadow: "0 0 40px rgba(39,174,104,0.5)",
          marginBottom: 8,
        }}>
          حصاحيصاوي
        </div>
        <div style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.4)",
          letterSpacing: 5,
          textTransform: "uppercase",
        }}>
          H A S A H I S A W I
        </div>
      </div>

      {/* Divider */}
      <div style={{
        position: "relative",
        zIndex: 10,
        width: 280,
        height: 2,
        margin: "24px auto",
        background: "linear-gradient(90deg, transparent, #27AE68 30%, #F0A500 70%, transparent)",
        borderRadius: 2,
      }} />

      {/* Tagline */}
      <div style={{
        position: "relative",
        zIndex: 10,
        textAlign: "center",
        padding: "0 44px",
        direction: "rtl",
        marginBottom: 32,
      }}>
        <div style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#FFFFFF",
          lineHeight: 1.6,
          marginBottom: 10,
        }}>
          بوابتك الذكية<br />
          <span style={{ color: "#27AE68" }}>لمدينة حصاحيصة</span>
        </div>
        <div style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.5)",
          lineHeight: 1.8,
        }}>
          تطبيق متكامل يجمع كل خدمات مدينتك في مكان واحد
        </div>
      </div>

      {/* Services grid */}
      <div style={{
        position: "relative",
        zIndex: 10,
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 12,
        padding: "0 28px",
        width: "100%",
        boxSizing: "border-box",
        marginBottom: 28,
      }}>
        {[
          { icon: "🛒", name: "السوق", color: "#27AE68" },
          { icon: "🚗", name: "التوصيل", color: "#3EFF9C" },
          { icon: "🎪", name: "الفعاليات", color: "#F0A500" },
          { icon: "💼", name: "الوظائف", color: "#27AE68" },
          { icon: "⚽", name: "الرياضة", color: "#3EFF9C" },
          { icon: "🏥", name: "الصحة", color: "#F0A500" },
        ].map((s, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${s.color}30`,
            borderRadius: 16,
            padding: "18px 10px",
            textAlign: "center",
            backdropFilter: "blur(10px)",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 13, color: s.color, fontWeight: 700, direction: "rtl" }}>{s.name}</div>
          </div>
        ))}
      </div>

      {/* Stats strip */}
      <div style={{
        position: "relative",
        zIndex: 10,
        display: "flex",
        justifyContent: "space-around",
        width: "calc(100% - 56px)",
        background: "rgba(39,174,104,0.1)",
        border: "1px solid rgba(39,174,104,0.2)",
        borderRadius: 20,
        padding: "18px 20px",
        marginBottom: 28,
        direction: "rtl",
      }}>
        {[
          { val: "500+", label: "مستخدم نشط" },
          { val: "6", label: "خدمات متكاملة" },
          { val: "24/7", label: "دعم مستمر" },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 26,
              fontWeight: 900,
              background: "linear-gradient(135deg, #27AE68, #F0A500)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>{s.val}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* New feature badge */}
      <div style={{
        position: "relative",
        zIndex: 10,
        background: "linear-gradient(135deg, rgba(240,165,0,0.15), rgba(240,165,0,0.08))",
        border: "1px solid rgba(240,165,0,0.4)",
        borderRadius: 16,
        padding: "14px 28px",
        marginBottom: 28,
        direction: "rtl",
        textAlign: "center",
      }}>
        <span style={{ color: "#F0A500", fontWeight: 700, fontSize: 13 }}>
          ✨ جديد — تأجير مستلزمات الفعاليات والمهرجانات
        </span>
      </div>

      {/* CTA */}
      <div style={{
        position: "relative",
        zIndex: 10,
        width: "calc(100% - 56px)",
        background: "linear-gradient(135deg, #27AE68 0%, #1E8A50 100%)",
        borderRadius: 20,
        padding: "20px",
        textAlign: "center",
        boxShadow: "0 12px 40px rgba(39,174,104,0.45)",
        direction: "rtl",
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 4 }}>
          حمّل التطبيق الآن مجاناً
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
          الإصدار 2.3.2 · متاح على Android
        </div>
      </div>

      {/* Bottom hashtags */}
      <div style={{
        position: "relative",
        zIndex: 10,
        display: "flex",
        gap: 10,
        marginTop: 22,
        flexWrap: "wrap",
        justifyContent: "center",
        padding: "0 20px",
      }}>
        {["#حصاحيصة", "#السودان", "#حصاحيصاوي", "#تطبيق_ذكي"].map((t, i) => (
          <span key={i} style={{
            fontSize: 11,
            color: "rgba(39,174,104,0.7)",
            background: "rgba(39,174,104,0.08)",
            border: "1px solid rgba(39,174,104,0.2)",
            borderRadius: 10,
            padding: "4px 10px",
          }}>{t}</span>
        ))}
      </div>
    </div>
  );
}
