export default function UpdatePostV24K() {
  const SCALE = 3, S = 540;
  return (
    <div style={{ width: S*SCALE, height: S*SCALE, overflow:"hidden", background:"#050D0A" }}>
      <div style={{ transform:`scale(${SCALE})`, transformOrigin:"top left", width:S, height:S }}>
        <div style={{
          width:S, height:S, background:"#050D0A",
          position:"relative", overflow:"hidden",
          fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif",
        }}>
          {/* Giant watermark */}
          <div style={{
            position:"absolute", top:-30, left:-20,
            fontSize:220, fontWeight:900, color:"transparent",
            WebkitTextStroke:"1.5px rgba(39,174,104,0.12)",
            lineHeight:1, userSelect:"none", letterSpacing:-10, zIndex:0,
          }}>2.3</div>

          {/* Diagonal slash */}
          <div style={{
            position:"absolute", top:0, right:0, width:0, height:0,
            borderTop:"540px solid transparent",
            borderRight:"260px solid #27AE68",
            opacity:0.07, zIndex:0,
          }} />

          {/* Glows */}
          <div style={{
            position:"absolute", bottom:-60, left:-60, zIndex:0,
            width:300, height:300, borderRadius:"50%",
            background:"radial-gradient(circle, rgba(39,174,104,0.2) 0%, transparent 65%)",
          }} />
          <div style={{
            position:"absolute", top:40, right:-40, zIndex:0,
            width:200, height:200, borderRadius:"50%",
            background:"radial-gradient(circle, rgba(240,165,0,0.15) 0%, transparent 65%)",
          }} />

          {/* Top strip */}
          <div style={{
            position:"absolute", top:0, left:0, right:0, height:4,
            background:"linear-gradient(90deg, #27AE68, #3EFF9C, #F0A500)", zIndex:10,
          }} />

          {/* Content */}
          <div style={{
            position:"relative", zIndex:5,
            height:"100%", display:"flex", flexDirection:"column",
            padding:"32px 36px 24px", boxSizing:"border-box", direction:"rtl",
          }}>

            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{
                  width:52, height:52, borderRadius:14, overflow:"hidden",
                  boxShadow:"0 0 20px rgba(39,174,104,0.5)", flexShrink:0,
                }}>
                  <img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                </div>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:"#fff" }}>حصاحيصاوي</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>HASAHISAWI</div>
                </div>
              </div>
              <div style={{
                background:"rgba(39,174,104,0.15)", border:"1px solid #27AE68",
                borderRadius:30, padding:"5px 14px",
                fontSize:11, color:"#3EFF9C", fontWeight:700, letterSpacing:1,
              }}>v 2.3.2</div>
            </div>

            {/* Headline */}
            <div style={{ flex:1 }}>
              <div style={{
                fontSize:13, color:"#27AE68", fontWeight:700,
                letterSpacing:3, textTransform:"uppercase", marginBottom:10,
              }}>🚀 — تحديث جديد</div>
              <div style={{
                fontSize:58, fontWeight:900, color:"#FFFFFF",
                lineHeight:1.05, marginBottom:6, letterSpacing:-2,
              }}>
                أُعيد
                <br />
                <span style={{
                  background:"linear-gradient(135deg, #27AE68 30%, #3EFF9C 100%)",
                  WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                }}>اختراعه.</span>
              </div>
              <div style={{
                fontSize:14, color:"rgba(255,255,255,0.45)",
                lineHeight:1.7, marginBottom:28, maxWidth:320,
              }}>
                أقوى إصدار في تاريخ التطبيق —
                أسرع، أذكى، وأكمل من أي وقت مضى.
              </div>

              {/* Feature card */}
              <div style={{
                background:"linear-gradient(135deg, rgba(240,165,0,0.1) 0%, rgba(39,174,104,0.06) 100%)",
                borderRight:"3px solid #F0A500",
                borderRadius:"0 14px 14px 0",
                padding:"14px 18px", marginBottom:24,
              }}>
                <div style={{ fontSize:11, color:"#F0A500", fontWeight:700, marginBottom:4, letterSpacing:1 }}>
                  ✦ الجديد
                </div>
                <div style={{ fontSize:16, color:"#fff", fontWeight:700, marginBottom:4 }}>
                  قسم الفعاليات والتأجير
                </div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)" }}>
                  خيام · صوتيات · تصوير · إضاءة · ضيافة
                </div>
              </div>
            </div>

            {/* Bottom */}
            <div style={{ display:"flex", gap:12, alignItems:"center" }}>
              <div style={{
                flex:1,
                background:"linear-gradient(135deg, #27AE68, #1c7a42)",
                borderRadius:14, padding:"14px 20px", textAlign:"center",
                boxShadow:"0 8px 25px rgba(39,174,104,0.4)",
              }}>
                <div style={{ fontSize:15, fontWeight:800, color:"#fff" }}>حدّث الآن ←</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {["أداء ⚡", "استقرار 🛡", "تجربة ✨"].map((t,i) => (
                  <div key={i} style={{
                    background:"rgba(255,255,255,0.05)",
                    border:"1px solid rgba(255,255,255,0.07)",
                    borderRadius:8, padding:"4px 12px",
                    fontSize:11, color:"rgba(255,255,255,0.55)",
                  }}>{t}</div>
                ))}
              </div>
            </div>

            {/* Hashtags */}
            <div style={{ display:"flex", gap:8, marginTop:16 }}>
              {["#حصاحيصاوي","#حصاحيصا","#تحديث_جديد"].map((t,i) => (
                <span key={i} style={{ fontSize:10, color:"rgba(39,174,104,0.55)" }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Bottom strip */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0, height:2,
            background:"linear-gradient(90deg, transparent, #27AE68 50%, transparent)", zIndex:10,
          }} />
        </div>
      </div>
    </div>
  );
}
