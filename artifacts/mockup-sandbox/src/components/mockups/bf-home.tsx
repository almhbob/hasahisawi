export default function BFHome() {
  const A="#27AE68",A2="#3EFF9C",BG="#050D0A";
  const features=[
    {e:"🏪",n:"السوق والتجارة",d:"تسوّق، بيع، مزاد، نجارة ومحلات الهواتف"},
    {e:"🚗",n:"النقل والتوصيل",d:"رحلات داخل المدينة وتوصيل الطرود"},
    {e:"🎪",n:"مناسباتك علينا",d:"تأجير صيوانات وكل مستلزمات الأفراح"},
    {e:"👩",n:"قسم المرأة",d:"خدمات نسائية خاصة بخصوصية مضمونة"},
    {e:"🏥",n:"الطب والصحة",d:"دليل طبي، مواعيد، استشارات وأخصائيون"},
    {e:"💼",n:"الوظائف",d:"فرص عمل دوام كامل وجزئي وتطوع"},
    {e:"⚽",n:"الرياضة",d:"أندية رياضية، أخبار وبطولات المدينة"},
    {e:"🎭",n:"الثقافة والفعاليات",d:"مهرجانات، مؤتمرات، معارض وحفلات"},
    {e:"👥",n:"المجتمعات",d:"وافدون، جاليات أجنبية، نازحون ومغتربون"},
    {e:"🚨",n:"الأمان والطوارئ",d:"بلاغات، مفقودون، وأرقام الطوارئ"},
    {e:"🤖",n:"المساعد الذكي",d:"دعم فوري بالذكاء الاصطناعي 24/7"},
    {e:"🎓",n:"قسم الطالب",d:"حاسبة معدل، مؤقت مذاكرة ومهام دراسية"},
  ];
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle,${A}22 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", bottom:-40, left:-40, width:240, height:240, borderRadius:"50%", background:`radial-gradient(circle,rgba(240,165,0,0.12) 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#F0A500)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>الواجهة الرئيسية</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>🏠</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>الواجهة الرئيسية</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>بوابتك الشاملة لكل خدمات المدينة</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            تستقبلك الواجهة الرئيسية بلوحة تضم اختصارات جميع خدمات التطبيق الخمس والعشرين في مكان واحد — مع إشعارات فورية بالمستجدات والأخبار وأحدث العروض في مدينة الحصاحيصا.
          </div>
        </div>

        <div style={{ fontSize:11, color:A2, fontWeight:700, marginBottom:8 }}>▸ الخدمات الرئيسية في التطبيق</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
          {features.map((f,i)=>(
            <div key={i} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:11, padding:"9px 11px", display:"flex", alignItems:"flex-start", gap:7 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{f.e}</span>
              <div>
                <div style={{ fontSize:10.5, fontWeight:800, color:"#fff", marginBottom:2 }}>{f.n}</div>
                <div style={{ fontSize:9.5, color:"rgba(255,255,255,0.38)" }}>{f.d}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"11px 16px", textAlign:"center", marginTop:10 }}>
          <div style={{ fontSize:14, fontWeight:800, color:A2 }}>"كل ما تحتاجه — في تطبيق واحد."</div>
        </div>
      </div>
    </div>
  );
}
