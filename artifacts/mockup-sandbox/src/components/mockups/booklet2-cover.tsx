export default function Booklet2Cover() {
  return (
    <div style={{ width:540, height:900, background:"#050D0A", position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-80, right:-80, width:420, height:420, borderRadius:"50%", background:"radial-gradient(circle,rgba(39,174,104,0.22) 0%,transparent 65%)" }} />
      <div style={{ position:"absolute", bottom:-60, left:-60, width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle,rgba(240,165,0,0.13) 0%,transparent 65%)" }} />
      <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.04 }} viewBox="0 0 540 900">
        {Array.from({length:11}).map((_,i)=>Array.from({length:19}).map((_,j)=><circle key={`${i}${j}`} cx={i*54} cy={j*50} r="1.2" fill="#27AE68"/>))}
      </svg>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:"linear-gradient(90deg,#27AE68,#3EFF9C,#F0A500)" }} />

      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", padding:"0 44px", position:"relative", zIndex:5 }}>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:4, textTransform:"uppercase", marginBottom:30 }}>HASAHISA · SUDAN · 2026</div>

        <div style={{ width:130, height:130, borderRadius:30, overflow:"hidden", boxShadow:"0 0 0 3px rgba(39,174,104,0.3),0 0 60px rgba(39,174,104,0.4)", marginBottom:28 }}>
          <img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} />
        </div>

        <div style={{ fontSize:58, fontWeight:900, color:"#fff", lineHeight:1, marginBottom:8, textAlign:"center", textShadow:"0 0 40px rgba(39,174,104,0.4)" }}>حصاحيصاوي</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.3)", letterSpacing:5, textTransform:"uppercase", marginBottom:32 }}>H A S A H I S A W I</div>
        <div style={{ width:200, height:1.5, background:"linear-gradient(90deg,transparent,#27AE68 30%,#F0A500 70%,transparent)", marginBottom:30 }} />

        <div style={{ fontSize:22, fontWeight:800, color:"#fff", textAlign:"center", lineHeight:1.6, marginBottom:10 }}>
          البوابة الذكية<br/><span style={{ color:"#27AE68" }}>لمدينة الحصاحيصا</span>
        </div>
        <div style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.4)", textAlign:"center", letterSpacing:2, marginBottom:32 }}>كتيب الشرح المفصّل للخدمات</div>

        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(39,174,104,0.2)", borderRadius:16, padding:"20px 28px", marginBottom:32, width:"100%" }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", lineHeight:2, textAlign:"center" }}>
            تطبيق حصاحيصاوي هو المنصة الرقمية الأولى التي تجمع خدمات مدينة الحصاحيصا في مكان واحد — من النقل والتوصيل إلى الأسواق والمناسبات والصحة والتعليم، كل ذلك بين يديك أينما كنت.
          </div>
        </div>

        <div style={{ display:"flex", gap:12, marginBottom:32 }}>
          {[{v:"+25",l:"خدمة"},{v:"500+",l:"مستخدم"},{v:"24/7",l:"متاح"},{v:"مجاني",l:"التحميل"}].map((s,i)=>(
            <div key={i} style={{ textAlign:"center", background:"rgba(39,174,104,0.08)", border:"1px solid rgba(39,174,104,0.2)", borderRadius:12, padding:"10px 14px" }}>
              <div style={{ fontSize:16, fontWeight:900, color:"#3EFF9C" }}>{s.v}</div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.35)", marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        <div style={{ background:"linear-gradient(135deg,#27AE68,#1a7a4a)", borderRadius:16, padding:"14px 40px", fontSize:14, fontWeight:800, color:"#fff", boxShadow:"0 8px 30px rgba(39,174,104,0.4)" }}>متاح على Google Play الآن</div>
      </div>
    </div>
  );
}
