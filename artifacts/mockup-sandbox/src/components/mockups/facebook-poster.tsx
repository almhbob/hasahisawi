import React, { useRef } from "react";
import { motion } from "framer-motion";
import logoImg from "../../assets/hasahisawi-logo.png";
import mapGlowImg from "../../assets/images/sudan-map-glow.png";

/* ─── Facebook poster 1200×630 ─────────────────────────────────────────────── */
export default function FacebookPoster() {
  const posterRef = useRef<HTMLDivElement>(null);

  const downloadPoster = async () => {
    if (!posterRef.current) return;
    try {
      // Use html2canvas to export
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(posterRef.current, {
        width: 1200, height: 630,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#0D1A12",
        logging: false,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "hasahisawi-facebook-poster.png";
      a.click();
    } catch (e) {
      // fallback: print
      window.print();
    }
  };

  return (
    <div className="min-h-screen bg-[#111] flex flex-col items-center justify-center gap-6 p-8 font-sans">
      {/* ── Poster ── */}
      <div
        ref={posterRef}
        className="relative overflow-hidden flex-shrink-0"
        style={{
          width: 1200,
          height: 630,
          background: "linear-gradient(135deg, #0a1f10 0%, #0D1A12 40%, #0f2b18 100%)",
          fontFamily: "'Cairo', 'Tajawal', 'Arial', sans-serif",
        }}
      >
        {/* Sudan map background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${mapGlowImg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.18,
          }}
        />

        {/* Radial glow */}
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 30% 50%, rgba(39,174,104,0.18) 0%, transparent 65%)" }} />
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 80% 50%, rgba(240,165,0,0.10) 0%, transparent 60%)" }} />

        {/* Vignette */}
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(13,26,18,0.7) 100%)" }} />

        {/* Grid lines decorative */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#27AE68" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Decorative circles */}
        {[1,2,3].map(i => (
          <div key={i} className="absolute rounded-full border"
            style={{
              width: i * 220, height: i * 220,
              left: "8%", top: "50%",
              transform: "translate(-50%, -50%)",
              borderColor: `rgba(39,174,104,${0.12 - i * 0.03})`,
            }}
          />
        ))}

        {/* ── LEFT: Logo + App Info ── */}
        <div className="absolute flex flex-col items-center justify-center gap-3"
          style={{ left: 60, top: 0, bottom: 0, width: 280 }}>

          {/* Logo glow */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(39,174,104,0.5) 0%, transparent 70%)", transform: "scale(2.5)" }} />
            <img src={logoImg} alt="Logo"
              style={{ width: 130, height: 130, objectFit: "contain", position: "relative", zIndex: 1,
                filter: "drop-shadow(0 0 20px rgba(39,174,104,0.6))" }} />
          </div>

          {/* App name */}
          <div style={{ textAlign: "center" }}>
            <div style={{
              color: "#27AE68", fontSize: 42, fontWeight: 900,
              textShadow: "0 0 30px rgba(39,174,104,0.5)",
              lineHeight: 1.1, direction: "rtl",
            }}>
              حصاحيصاوي
            </div>
            <div style={{
              color: "rgba(255,255,255,0.55)", fontSize: 14,
              letterSpacing: "0.15em", marginTop: 4,
              direction: "rtl",
            }}>
              HASAHISAWI APP
            </div>
          </div>

          {/* Stars */}
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {[1,2,3,4,5].map(i => (
              <span key={i} style={{ color: "#F0A500", fontSize: 18 }}>★</span>
            ))}
          </div>
        </div>

        {/* ── CENTER: Divider line ── */}
        <div className="absolute"
          style={{
            left: 360, top: "10%", bottom: "10%", width: 1,
            background: "linear-gradient(to bottom, transparent, rgba(240,165,0,0.5) 30%, rgba(240,165,0,0.5) 70%, transparent)",
          }}
        />

        {/* ── RIGHT: Main content ── */}
        <div className="absolute flex flex-col justify-center"
          style={{ left: 390, right: 60, top: 0, bottom: 0, direction: "rtl" }}>

          {/* "NOW AVAILABLE" badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg, #F0A500, #FFD700)",
            color: "#0D1A12", borderRadius: 100,
            padding: "8px 24px", fontSize: 14, fontWeight: 900,
            letterSpacing: "0.08em", width: "fit-content",
            marginBottom: 20,
            boxShadow: "0 0 25px rgba(240,165,0,0.4)",
          }}>
            ★ متاح الآن ★
          </div>

          {/* Main headline */}
          <div style={{
            color: "#ffffff", fontSize: 50, fontWeight: 900,
            lineHeight: 1.15, marginBottom: 16,
            textShadow: "0 2px 20px rgba(0,0,0,0.5)",
          }}>
            تطبيق
            <span style={{ color: "#27AE68", display: "block" }}>
              الحصاحيصا
            </span>
            الأول والأميز
          </div>

          {/* Sub-headline */}
          <div style={{
            color: "rgba(255,255,255,0.7)", fontSize: 20,
            lineHeight: 1.6, marginBottom: 28,
          }}>
            أخبار المدينة · خدمات محلية · سوق حصاحيصا · مجتمع متصل
          </div>

          {/* Divider */}
          <div style={{
            width: 280, height: 2, marginBottom: 28,
            background: "linear-gradient(to left, transparent, #27AE68 50%, transparent)",
          }} />

          {/* Google Play badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 14,
            background: "#000", borderRadius: 14,
            padding: "12px 24px", width: "fit-content",
            border: "1px solid rgba(255,255,255,0.15)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.5), 0 0 20px rgba(39,174,104,0.1)",
          }}>
            {/* Google Play icon */}
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4.5 3.5L26.5 24L4.5 44.5C3.67 44.05 3.5 43.3 3.5 42.5V5.5C3.5 4.7 3.67 3.95 4.5 3.5Z" fill="#00D4FF"/>
              <path d="M36 16.5L26.5 24L36 31.5L43.5 27.5C45.5 26.4 45.5 21.6 43.5 20.5L36 16.5Z" fill="#FFD700"/>
              <path d="M4.5 3.5L26.5 24L36 16.5L12 2C9 0.3 6 1.3 4.5 3.5Z" fill="#4CAF50"/>
              <path d="M4.5 44.5L26.5 24L36 31.5L12 46C9 47.7 6 46.7 4.5 44.5Z" fill="#F44336"/>
            </svg>
            <div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, letterSpacing: "0.12em" }}>GET IT ON</div>
              <div style={{ color: "#ffffff", fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>Google Play</div>
            </div>
          </div>

          {/* City tag */}
          <div style={{
            marginTop: 24, color: "rgba(255,255,255,0.35)", fontSize: 13,
            letterSpacing: "0.2em",
          }}>
            الحصاحيصا · ولاية سنار · السودان
          </div>
        </div>

        {/* Bottom accent bar */}
        <div className="absolute bottom-0 left-0 right-0"
          style={{
            height: 4,
            background: "linear-gradient(to right, #27AE68, #F0A500, #27AE68)",
          }}
        />

        {/* Corner accents */}
        <div className="absolute top-0 left-0"
          style={{ width: 60, height: 60,
            borderTop: "3px solid rgba(240,165,0,0.5)",
            borderLeft: "3px solid rgba(240,165,0,0.5)" }} />
        <div className="absolute top-0 right-0"
          style={{ width: 60, height: 60,
            borderTop: "3px solid rgba(240,165,0,0.5)",
            borderRight: "3px solid rgba(240,165,0,0.5)" }} />
        <div className="absolute bottom-0 left-0"
          style={{ width: 60, height: 60,
            borderBottom: "3px solid rgba(39,174,104,0.5)",
            borderLeft: "3px solid rgba(39,174,104,0.5)" }} />
        <div className="absolute bottom-0 right-0"
          style={{ width: 60, height: 60,
            borderBottom: "3px solid rgba(39,174,104,0.5)",
            borderRight: "3px solid rgba(39,174,104,0.5)" }} />
      </div>

      {/* ── Download instructions ── */}
      <div className="flex flex-col items-center gap-3 text-center max-w-xl">
        <p className="text-white/50 font-arabic text-sm leading-relaxed" dir="rtl">
          لتحميل البوستر: اضغط كليك يمين على الصورة ← "حفظ الصورة"<br/>
          أو استخدم زر التصوير بالكامل
        </p>
        <button
          onClick={downloadPoster}
          className="flex items-center gap-2 bg-[#27AE68] hover:bg-[#2ecc71] text-white font-arabic font-bold px-6 py-3 rounded-full text-sm shadow-xl cursor-pointer transition-colors"
          dir="rtl">
          ⬇️ تحميل البوستر PNG
        </button>
        <p className="text-white/25 text-xs font-arabic" dir="rtl">
          1200 × 630 بكسل — الحجم المثالي لفيسبوك
        </p>
      </div>
    </div>
  );
}
