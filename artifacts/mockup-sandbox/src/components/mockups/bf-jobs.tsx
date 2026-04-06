export default function BFJobs() {
  const A="#0EA5E9",A2="#38BDF8",BG="#05080E";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle,${A}22 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#27AE68)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>الوظائف</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>💼</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>فرص العمل</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>وظيفتك القادمة في الحصاحيصا</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            يربط هذا القسم أصحاب العمل في الحصاحيصا بالباحثين عن فرص العمل — من وظائف الدوام الكامل إلى العمل المستقل والتطوع، كل ذلك بتواصل مباشر دون وسيط.
          </div>
        </div>

        {/* Types */}
        <div style={{ display:"flex", gap:7, marginBottom:12, flexWrap:"wrap" }}>
          {[{e:"🕐",n:"دوام كامل"},{e:"⏰",n:"دوام جزئي"},{e:"💻",n:"مستقل"},{e:"🤝",n:"تطوع"}].map((t,i)=>(
            <div key={i} style={{ background:`${A}15`, border:`1px solid ${A}35`, borderRadius:20, padding:"5px 13px", fontSize:10.5, color:A2, fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
              <span>{t.e}</span><span>{t.n}</span>
            </div>
          ))}
        </div>

        {[
          { icon:"🔍", title:"تصفّح الوظائف المتاحة", desc:"قائمة محدّثة بكل الوظائف الشاغرة في الحصاحيصا — مُرتّبة حسب التاريخ مع اسم الجهة والموقع وطبيعة العمل والراتب المتوقع." },
          { icon:"📋", title:"انشر وظيفتك خلال دقيقتين", desc:"أضف عنوان الوظيفة، اسم الشركة، نوع العمل، الموقع، وصف المهام، الراتب ورقم التواصل — يراها كل مستخدمي التطبيق فوراً." },
          { icon:"📞", title:"تواصل مباشر بين صاحب العمل والمتقدم", desc:"المتقدم للوظيفة يتواصل مع صاحب العمل مباشرة عبر الهاتف دون الحاجة لنماذج معقدة أو سير ذاتية مطوّلة." },
          { icon:"📌", title:"أمثلة على الوظائف المتاحة", desc:"مدرس رياضيات، محاسب، سائق توصيل، مصمم جرافيك، متطوع في الإسعاف المجتمعي — وظائف حقيقية لأبناء الحصاحيصا." },
          { icon:"🎯", title:"للباحثين عن عمل", desc:"لا تفوّت أي فرصة — تابع الوظائف الجديدة فور نشرها وتقدم فوراً. الفرص لمن يكون في المكان الصحيح في الوقت الصحيح." },
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
          <div style={{ fontSize:13, fontWeight:800, color:A2 }}>"وظيفتك في مدينتك — من حصاحيصاوي."</div>
        </div>
      </div>
    </div>
  );
}
