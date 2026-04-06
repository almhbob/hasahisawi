export default function BFCommunities() {
  const A="#3EFF9C",A2="#6EE7B7",BG="#040E0A";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle,rgba(62,255,156,0.15) 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},#27AE68,#F0A500)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>المجتمعات والمنظمات</div>
      </div>

      <div style={{ background:"linear-gradient(160deg,rgba(62,255,156,0.15),rgba(62,255,156,0.04))", borderTop:"1px solid rgba(62,255,156,0.2)", borderBottom:"1px solid rgba(62,255,156,0.15)", padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>👥</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>المجتمعات والمنظمات</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>معاً نبني — متّصلون دائماً</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(62,255,156,0.15)", borderRadius:14, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            يجمع هذا القسم أبناء الحصاحيصا من كل الخلفيات ويربطهم بالمنظمات والمبادرات المجتمعية — من الوافدين السودانيين والجاليات الأجنبية إلى المبادرات الخيرية والمتطوعين.
          </div>
        </div>

        <div style={{ fontSize:11, color:A2, fontWeight:700, marginBottom:8 }}>▸ أنواع المجتمعات</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:12 }}>
          {[
            {e:"🇸🇩",n:"وافد سوداني",d:"سودانيون من خارج المدينة"},
            {e:"🌍",n:"جالية أجنبية",d:"المقيمون الأجانب في المدينة"},
            {e:"🏠",n:"نازحون ولاجئون",d:"الدعم والتواصل والتضامن"},
            {e:"✈️",n:"مغتربون",d:"أبناء الحصاحيصا خارج البلاد"},
          ].map((c,i)=>(
            <div key={i} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(62,255,156,0.13)", borderRadius:11, padding:"10px 12px" }}>
              <div style={{ fontSize:22, marginBottom:5 }}>{c.e}</div>
              <div style={{ fontSize:11, fontWeight:800, color:"#fff", marginBottom:2 }}>{c.n}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>{c.d}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize:11, color:A2, fontWeight:700, marginBottom:8 }}>▸ المنظمات والمبادرات</div>
        {[
          { icon:"🤝", title:"مبادرة شباب الحصاحيصا", desc:"أيام خدمة مجتمعية — تنظيف، صيانة وتطوير الحي. تواصل ومشاركة متطوع." },
          { icon:"❤️", title:"جمعية البر الخيرية", desc:"توزيع وجبات الإفطار للأسر المحتاجة، وتقديم المساعدات الإنسانية طوال العام." },
          { icon:"🌳", title:"فريق النظافة والتشجير", desc:"حملات زراعة الأشجار في أحياء المدينة وتجميل الفضاءات العامة." },
          { icon:"🎨", title:"مبادرة بنات حصاحيصا", desc:"معارض الحرف اليدوية لعرض ودعم منتجات المرأة الحصاحيصاوية." },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:8, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(62,255,156,0.1)", borderRadius:12, padding:"9px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
              <span style={{ fontSize:17 }}>{f.icon}</span>
              <div style={{ fontSize:11.5, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:10.5, color:"rgba(255,255,255,0.43)", lineHeight:1.6 }}>{f.desc}</div>
          </div>
        ))}

        <div style={{ background:"linear-gradient(135deg,rgba(62,255,156,0.12),rgba(62,255,156,0.04))", border:"1px solid rgba(62,255,156,0.25)", borderRadius:13, padding:"10px 16px", textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:800, color:A2 }}>"مجتمع واحد — منصة واحدة."</div>
        </div>
      </div>
    </div>
  );
}
