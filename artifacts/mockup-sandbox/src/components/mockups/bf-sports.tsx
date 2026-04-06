export default function BFSports() {
  const A="#16A34A",A2="#4ADE80",BG="#050E08";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle,${A}22 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#F0A500)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>الرياضة</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>⚽</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>الرياضة والأندية</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>نبض الرياضة الحصاحيصاوية</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            يُحيي هذا القسم الروح الرياضية في الحصاحيصا — يجمع الأندية الرياضية بجمهورها، ويوفّر منصة لنشر الأخبار والبطولات والإعلانات الرياضية في المدينة.
          </div>
        </div>

        {[
          { icon:"🏟️", title:"دليل الأندية الرياضية", desc:"قائمة بجميع الأندية الرياضية في الحصاحيصا — كرة قدم، كرة سلة، ألعاب قوى وغيرها — مع معلوماتها وبيانات التواصل وجداول تدريباتها." },
          { icon:"📰", title:"أخبار الرياضة المحلية", desc:"تابع آخر أخبار الفرق المحلية ونتائج المباريات ولحظات الفخر الرياضي في مدينتك — كل شيء في تغذية إخبارية واحدة." },
          { icon:"🏆", title:"البطولات والمسابقات", desc:"تابع ترتيب الدوري وجداول المباريات القادمة والنتائج الأخيرة — تغطية شاملة لكل مسابقة رياضية في الحصاحيصا." },
          { icon:"📣", title:"منشورات المجتمع الرياضي", desc:"يستطيع الرياضيون والأندية نشر أخبارهم وإعلاناتهم ومستجداتهم مباشرة للجمهور الرياضي في المدينة." },
          { icon:"➕", title:"سجّل ناديك اليوم", desc:"أصحاب الأندية الرياضية يمكنهم تسجيل أنديتهم وإضافة تفاصيلها وجداول تدريباتها لبناء قاعدة جماهيرية رقمية." },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:9, background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:12, padding:"10px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:17 }}>{f.icon}</span>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.43)", lineHeight:1.65 }}>{f.desc}</div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"11px 16px", textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:800, color:A2 }}>"ناديك في جيبك — تابع كل لحظة."</div>
        </div>
      </div>
    </div>
  );
}
