export default function BookletLibraries() {
  const A = "#0EA5E9", A2 = "#38BDF8", BG = "#050E14";
  return (
    <div style={{ width:540, height:760, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}25 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#27AE68)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:34, height:34, borderRadius:10, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:2 }}>06 / 07</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"22px 28px 20px", position:"relative", zIndex:5, marginBottom:20 }}>
        <div style={{ fontSize:44, marginBottom:10 }}>📚</div>
        <div style={{ fontSize:32, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:6 }}>المكتبات والقرطاسية</div>
        <div style={{ fontSize:14, color:A2, fontWeight:700, marginBottom:8 }}>المعرفة على بُعد خطوة</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>لأن التعليم يبدأ من المدينة — كل ما يحتاجه الطالب في مكان واحد.</div>
      </div>

      <div style={{ padding:"0 24px", position:"relative", zIndex:5 }}>
        {[
          { icon:"📖", title:"الكتب المدرسية والجامعية", desc:"تحقق من توفر الكتاب الذي تحتاجه قبل التوجه للمكتبة." },
          { icon:"🖊️", title:"أدوات القرطاسية الكاملة", desc:"أقلام · دفاتر · ملفات · لوازم رسم · كل ما يحتاجه الطالب." },
          { icon:"🖨️", title:"خدمات الطباعة والتصوير", desc:"اعرف أقرب مكتبة تقدم خدمة الطباعة وأسعارها مسبقاً." },
          { icon:"🕐", title:"أوقات العمل والعناوين", desc:"دليل شامل لمواقع المكتبات وأوقات فتحها وإغلاقها." },
          { icon:"📞", title:"تواصل مباشر", desc:"اتصل بالمكتبة مباشرة لحجز الكتاب أو الاستفسار عن التوفر." },
        ].map((f,i)=>(
          <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:13, background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:13, padding:"12px 14px" }}>
            <div style={{ fontSize:24, flexShrink:0 }}>{f.icon}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:"#fff", marginBottom:2 }}>{f.title}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"13px 18px", textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:800, color:A2 }}>"كل ما يحتاجه الطالب والمكتب — في تطبيق واحد."</div>
        </div>
      </div>
    </div>
  );
}
