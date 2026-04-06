export default function BookletCover() {
  return (
    <div style={{ width:540, height:760, background:"#050D0A", position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-80, right:-80, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle, rgba(39,174,104,0.25) 0%, transparent 65%)" }} />
      <div style={{ position:"absolute", bottom:-60, left:-60, width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle, rgba(240,165,0,0.15) 0%, transparent 65%)" }} />
      <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.04 }} viewBox="0 0 540 760">
        {Array.from({length:11}).map((_,i)=>Array.from({length:16}).map((_,j)=><circle key={`${i}${j}`} cx={i*54} cy={j*50} r="1.2" fill="#27AE68"/>))}
      </svg>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:"linear-gradient(90deg,#27AE68,#3EFF9C,#F0A500)" }} />
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#27AE68 50%,transparent)" }} />

      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", padding:"0 40px", position:"relative", zIndex:5 }}>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:4, textTransform:"uppercase", marginBottom:32 }}>HASAHISA · SUDAN · 2026</div>

        <div style={{ width:120, height:120, borderRadius:28, overflow:"hidden", boxShadow:"0 0 0 3px rgba(39,174,104,0.3), 0 0 60px rgba(39,174,104,0.4)", marginBottom:28 }}>
          <img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
        </div>

        <div style={{ fontSize:56, fontWeight:900, color:"#fff", lineHeight:1, marginBottom:8, textAlign:"center", letterSpacing:-2, textShadow:"0 0 40px rgba(39,174,104,0.4)" }}>حصاحيصاوي</div>
        <div style={{ fontSize:13, color:"rgba(255,255,255,0.35)", letterSpacing:5, textTransform:"uppercase", marginBottom:36 }}>H A S A H I S A W I</div>

        <div style={{ width:200, height:1.5, background:"linear-gradient(90deg,transparent,#27AE68 30%,#F0A500 70%,transparent)", marginBottom:36 }} />

        <div style={{ fontSize:22, fontWeight:700, color:"#fff", textAlign:"center", lineHeight:1.6, marginBottom:12 }}>
          البوابة الذكية<br/><span style={{ color:"#27AE68" }}>لمدينة الحصاحيصا</span>
        </div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", textAlign:"center", lineHeight:1.8, maxWidth:360, marginBottom:44 }}>
          كتيب تعريفي شامل بجميع خدمات التطبيق
        </div>

        <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center", marginBottom:40 }}>
          {["+25 خدمة","500+ مستخدم","24/7"].map((t,i)=>(
            <div key={i} style={{ background:"rgba(39,174,104,0.1)", border:"1px solid rgba(39,174,104,0.25)", borderRadius:20, padding:"6px 16px", fontSize:12, color:"#3EFF9C", fontWeight:700 }}>{t}</div>
          ))}
        </div>

        <div style={{ background:"linear-gradient(135deg,#27AE68,#1a7a4a)", borderRadius:16, padding:"14px 36px", fontSize:14, fontWeight:800, color:"#fff", boxShadow:"0 8px 30px rgba(39,174,104,0.4)" }}>
          متاح على Google Play الآن
        </div>
      </div>
    </div>
  );
}
