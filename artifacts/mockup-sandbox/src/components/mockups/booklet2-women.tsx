export default function Booklet2Women() {
  const A="#FF4FA3",A2="#FF85C2",BG="#120A14";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}28 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},#FF85C2,#F0A500)` }} />

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>01 / 07</div>
      </div>

      {/* Hero */}
      <div style={{ background:`linear-gradient(160deg,${A}25,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"20px 26px 18px", position:"relative", zIndex:5, marginBottom:16 }}>
        <div style={{ fontSize:40, marginBottom:8 }}>👩</div>
        <div style={{ fontSize:30, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>قسم المرأة</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>فضاؤها الخاص — خصوصيتها مضمونة</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        {/* Intro */}
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"14px 16px", marginBottom:14 }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", lineHeight:1.9 }}>
            أُنشئ هذا القسم خصيصاً للمرأة الحصاحيصاوية، ويمثّل مساحة رقمية آمنة ومستقلة لا يصلها إلا من تختار المرأة ذاتها. يضمّ القسم كافة الخدمات التي تحتاجها المرأة في حياتها اليومية، من خدمات التجميل والخياطة إلى الصحة والتغذية ورعاية الأطفال، كلها في متناول يدها دون الحاجة للخروج من المنزل.
          </div>
        </div>

        {[
          { icon:"💄", title:"خدمات التجميل والخياطة", desc:"تجدين في هذا القسم قائمة بصالونات التجميل النسائية الموثوقة في الحصاحيصا، مع بيانات التواصل والأسعار. كذلك يضمّ دليلاً بالخياطات والمفصّلات المتخصصات في الأزياء السودانية التقليدية والعصرية." },
          { icon:"🥘", title:"وصفات المطبخ السوداني", desc:"مجموعة من الوصفات التقليدية المعتمدة من ربّات البيوت الحصاحيصاويات — ملاح الضاني، العصيدة، الكسرة، الحلويات — مع شرح مفصّل خطوة بخطوة وقائمة المكونات بكمياتها الدقيقة." },
          { icon:"💊", title:"الصحة النسائية والتغذية", desc:"نصائح طبية مُتحقَّق منها تغطي تغذية الحامل والمرضع، الفحوصات الدورية اللازمة، الصحة النفسية لما بعد الولادة، وكيفية التعامل مع الأمراض الشائعة لدى المرأة." },
          { icon:"👶", title:"رعاية الأطفال والتعليم المنزلي", desc:"دليل بالحضانات ومراكز رعاية الأطفال المعتمدة في المدينة، إلى جانب قائمة بالمعلمات المنزليات المتخصصات في مختلف المراحل الدراسية للتواصل والحجز المباشر." },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:12, background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:13, padding:"12px 14px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <span style={{ fontSize:20 }}>{f.icon}</span>
              <div style={{ fontSize:13, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.75 }}>{f.desc}</div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"12px 16px", textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:800, color:A2 }}>"مساحتها، شروطها، خصوصيتها."</div>
        </div>
      </div>
    </div>
  );
}
