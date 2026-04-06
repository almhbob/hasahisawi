export default function Booklet2Libraries() {
  const A="#0EA5E9",A2="#38BDF8",BG="#050E14";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}22 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#27AE68)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>06 / 07</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:40, marginBottom:8 }}>📚</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>المكتبات والقرطاسية</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>المعرفة على بُعد خطوة</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"13px 16px", marginBottom:13 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            يجمع هذا القسم مكتبات ومحلات القرطاسية في الحصاحيصا في دليل رقمي واحد. يستطيع الطالب والأستاذ وصاحب المكتب معرفة ما هو متوفر في المكتبات القريبة منه قبل التوجه إليها، مما يوفّر الوقت ويضمن الحصول على ما يحتاجه من المكان الصحيح.
          </div>
        </div>

        {[
          { icon:"📖", title:"الكتب المدرسية والجامعية", desc:"يمكن للمكتبات رفع قائمة بالكتب المتوفرة لديها حسب الصفوف الدراسية والتخصصات الجامعية. يطّلع عليها الطالب قبل الذهاب ليضمن توفّر ما يحتاجه." },
          { icon:"🖊️", title:"أدوات القرطاسية الكاملة", desc:"أقلام، دفاتر، ملفات، مساطر، أدوات رسم هندسي وفني — يعرف الطالب مسبقاً أين يجدها وبكم سعرها دون الدوران بين المحلات." },
          { icon:"🖨️", title:"خدمات الطباعة والتصوير", desc:"يوضح كل فرع أنواع خدمات الطباعة التي يقدمها وأسعارها — طباعة ملوّنة، أبيض وأسود، تصوير مستندات، تجليد — مع أوقات العمل الدقيقة." },
          { icon:"🗺️", title:"أوقات العمل والعناوين", desc:"دليل شامل بمواقع المكتبات في المدينة مع عناوينها وأرقامها وأوقات فتحها وإغلاقها أيام العمل والإجازات والامتحانات." },
          { icon:"📞", title:"تواصل مباشر وحجز مسبق", desc:"تواصل مع المكتبة لحجز كتاب، الاستفسار عن توفّر مادة معينة، أو معرفة موعد وصول طلبية جديدة — كل ذلك بنقرة واحدة." },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:10, background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:12, padding:"10px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:17 }}>{f.icon}</span>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.43)", lineHeight:1.65 }}>{f.desc}</div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"11px 16px", textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:800, color:A2 }}>"كل ما يحتاجه الطالب والمكتب — في تطبيق واحد."</div>
        </div>
      </div>
    </div>
  );
}
