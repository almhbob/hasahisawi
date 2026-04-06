import { useEffect, useState } from "react";

export default function PromotionalAd() {
  const [visible, setVisible] = useState(false);
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
    const interval = setInterval(() => {
      setCounter((c) => (c + 1) % features.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const features = [
    { icon: "🛒", label: "السوق الإلكتروني" },
    { icon: "🚗", label: "التوصيل والنقل" },
    { icon: "🎪", label: "الفعاليات والمهرجانات" },
    { icon: "💼", label: "فرص العمل" },
    { icon: "⚽", label: "الرياضة والأندية" },
    { icon: "🏥", label: "الدليل الطبي" },
  ];

  return (
    <div
      dir="rtl"
      style={{
        width: 420,
        minHeight: 750,
        background: "linear-gradient(160deg, #0A1628 0%, #0D2137 40%, #102B1A 100%)",
        borderRadius: 28,
        overflow: "hidden",
        fontFamily: "'Segoe UI', 'Tahoma', Arial, sans-serif",
        position: "relative",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
      }}
    >
      {/* Glow orbs */}
      <div style={{
        position: "absolute", top: -80, right: -80,
        width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(39,174,104,0.25) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: 60, left: -60,
        width: 250, height: 250, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(240,165,0,0.18) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Top bar */}
      <div style={{
        padding: "18px 24px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{
          background: "rgba(39,174,104,0.18)",
          border: "1px solid rgba(39,174,104,0.4)",
          borderRadius: 20, padding: "4px 14px",
          fontSize: 12, color: "#3EFF9C", fontWeight: 600,
        }}>
          🟢 متاح الآن
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          حصاحيصة · السودان
        </div>
      </div>

      {/* Logo + Name */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "10px 24px 8px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-20px)",
        transition: "all 0.8s ease",
      }}>
        <div style={{
          width: 110, height: 110,
          borderRadius: 28,
          background: "rgba(255,255,255,0.08)",
          border: "2px solid rgba(39,174,104,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 30px rgba(39,174,104,0.3)",
          marginBottom: 14,
          overflow: "hidden",
        }}>
          <img
            src="/__mockup/hasahisawi-logo.png"
            alt="Hasahisawi"
            style={{ width: 100, height: 100, borderRadius: 22, objectFit: "cover" }}
          />
        </div>
        <div style={{
          fontSize: 34, fontWeight: 800, color: "#FFFFFF",
          letterSpacing: 1, marginBottom: 4,
          textShadow: "0 0 20px rgba(39,174,104,0.5)",
        }}>
          حصاحيصاوي
        </div>
        <div style={{
          fontSize: 13, color: "rgba(255,255,255,0.55)",
          letterSpacing: 2, textTransform: "uppercase",
        }}>
          Hasahisawi App
        </div>
      </div>

      {/* Divider */}
      <div style={{
        margin: "14px 24px",
        height: 1,
        background: "linear-gradient(90deg, transparent, rgba(39,174,104,0.5), rgba(240,165,0,0.5), transparent)",
      }} />

      {/* Tagline */}
      <div style={{
        textAlign: "center", padding: "0 28px 18px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "all 1s ease 0.3s",
      }}>
        <div style={{
          fontSize: 20, fontWeight: 700,
          color: "#FFFFFF", lineHeight: 1.5, marginBottom: 8,
        }}>
          بوابتك الذكية لمدينة حصاحيصة
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
          كل ما تحتاجه في مكان واحد —{" "}
          <span style={{ color: "#F0A500" }}>سوق · توصيل · فعاليات · صحة · رياضة · وظائف</span>
        </div>
      </div>

      {/* Rotating feature highlight */}
      <div style={{
        margin: "0 24px 20px",
        background: "linear-gradient(135deg, rgba(39,174,104,0.15), rgba(240,165,0,0.1))",
        border: "1px solid rgba(39,174,104,0.25)",
        borderRadius: 16,
        padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 14,
        minHeight: 68,
        transition: "all 0.4s ease",
      }}>
        <div style={{
          fontSize: 32,
          filter: "drop-shadow(0 0 8px rgba(39,174,104,0.6))",
          transition: "all 0.4s ease",
        }}>
          {features[counter].icon}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>
            اكتشف الآن
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#FFFFFF" }}>
            {features[counter].label}
          </div>
        </div>
        <div style={{
          marginRight: "auto",
          width: 32, height: 32, borderRadius: "50%",
          background: "rgba(39,174,104,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#3EFF9C",
        }}>
          ←
        </div>
      </div>

      {/* Feature grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        gap: 10, margin: "0 24px 22px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(30px)",
        transition: "all 1s ease 0.6s",
      }}>
        {features.map((f, i) => (
          <div key={i} style={{
            background: counter === i
              ? "linear-gradient(135deg, rgba(39,174,104,0.25), rgba(240,165,0,0.15))"
              : "rgba(255,255,255,0.05)",
            border: `1px solid ${counter === i ? "rgba(39,174,104,0.5)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 14, padding: "12px 8px",
            textAlign: "center",
            transition: "all 0.4s ease",
          }}>
            <div style={{ fontSize: 22, marginBottom: 5 }}>{f.icon}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>
              {f.label}
            </div>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div style={{
        display: "flex", justifyContent: "space-around",
        margin: "0 24px 22px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 16, padding: "14px 10px",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        {[
          { val: "+500", lbl: "مستخدم" },
          { val: "6", lbl: "خدمات" },
          { val: "24/7", lbl: "متاح" },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 22, fontWeight: 800,
              background: "linear-gradient(135deg, #27AE68, #F0A500)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              {s.val}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              {s.lbl}
            </div>
          </div>
        ))}
      </div>

      {/* CTA Button */}
      <div style={{ padding: "0 24px 20px" }}>
        <div style={{
          background: "linear-gradient(135deg, #27AE68 0%, #1E8A50 100%)",
          borderRadius: 16, padding: "16px",
          textAlign: "center", cursor: "pointer",
          boxShadow: "0 8px 25px rgba(39,174,104,0.4)",
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.9)",
          transition: "all 0.8s ease 0.9s",
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF", marginBottom: 2 }}>
            حمّل التطبيق الآن
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
            متاح على Google Play
          </div>
        </div>

        {/* Secondary CTA */}
        <div style={{
          marginTop: 10,
          border: "1px solid rgba(240,165,0,0.35)",
          borderRadius: 14, padding: "12px",
          textAlign: "center",
          background: "rgba(240,165,0,0.07)",
        }}>
          <div style={{ fontSize: 13, color: "#F0A500", fontWeight: 600 }}>
            🎪 جديد: تأجير مستلزمات الفعاليات
          </div>
        </div>
      </div>

      {/* Bottom tag */}
      <div style={{
        padding: "12px 24px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
          الإصدار 2.3.2
        </div>
        <div style={{
          display: "flex", gap: 6, alignItems: "center",
        }}>
          {["#حصاحيصة", "#السودان", "#تطبيق"].map((tag, i) => (
            <span key={i} style={{
              fontSize: 9, color: "rgba(39,174,104,0.7)",
              background: "rgba(39,174,104,0.1)",
              border: "1px solid rgba(39,174,104,0.2)",
              borderRadius: 8, padding: "2px 6px",
            }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
