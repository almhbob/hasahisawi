export default function BookletWomen() {
  const A = "#FF4FA3", A2 = "#FF85C2", BG = "#120A14";
  return (
    <div style={{ width:540, height:760, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}30 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", bottom:-40, right:-40, width:250, height:250, borderRadius:"50%", background:`radial-gradient(circle,rgba(240,165,0,0.1) 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},#FF85C2,#F0A500)` }} />

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:34, height:34, borderRadius:10, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:2 }}>01 / 07</div>
      </div>

      {/* Hero */}
      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"22px 28px 20px", position:"relative", zIndex:5, marginBottom:20 }}>
        <div style={{ fontSize:44, marginBottom:10 }}>👩</div>
        <div style={{ fontSize:32, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:6 }}>قسم المرأة</div>
        <div style={{ fontSize:14, color:A2, fontWeight:700, marginBottom:8 }}>فضاؤها الخاص — خصوصيتها مضمونة</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>
          مساحة مستقلة مصممة للمرأة وحدها، لا يطّلع عليها إلا من تختار.
        </div>
      </div>

      {/* Features */}
      <div style={{ padding:"0 24px", position:"relative", zIndex:5 }}>
        {[
          { icon:"💄", title:"خدمات التجميل", desc:"صالونات موثوقة · خياطة وتفصيل · نساء خبيرات" },
          { icon:"🥘", title:"وصفات المطبخ السوداني", desc:"ملاح ضاني · عصيدة · حلويات تقليدية خطوة بخطوة" },
          { icon:"💊", title:"نصائح الصحة النسائية", desc:"تغذية الحامل · فحوصات دورية · الصحة النفسية" },
          { icon:"👶", title:"رعاية الأطفال والتعليم", desc:"حضانات موثوقة · تعليم منزلي · رعاية احترافية" },
        ].map((f,i)=>(
          <div key={i} style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:16, background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:14, padding:"14px 16px" }}>
            <div style={{ fontSize:28, flexShrink:0 }}>{f.icon}</div>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:"#fff", marginBottom:3 }}>{f.title}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.6 }}>{f.desc}</div>
            </div>
          </div>
        ))}

        {/* Quote */}
        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:14, padding:"14px 18px", marginTop:4, textAlign:"center" }}>
          <div style={{ fontSize:15, fontWeight:800, color:A2, marginBottom:4 }}>"مساحتها، شروطها، خصوصيتها."</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)" }}>حصاحيصاوي · قسم المرأة</div>
        </div>
      </div>
    </div>
  );
}
