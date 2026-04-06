export default function BFStudent() {
  const A="#8B5CF6",A2="#A78BFA",BG="#08050E";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle,${A}22 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#3EFF9C)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>قسم الطالب</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>🎓</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>قسم الطالب</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>أدواتك الدراسية — في جيبك دائماً</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            صُمِّم هذا القسم خصيصاً لطلاب الحصاحيصا في جميع المراحل الدراسية — أدوات عملية تساعد على التنظيم والتركيز وحساب الدرجات دون الحاجة لتطبيقات إضافية.
          </div>
        </div>

        {[
          { icon:"🧮", title:"حاسبة المعدل", desc:"أدخل درجاتك في كل مادة وعدد الساعات المعتمدة — واحصل على معدلك الفصلي والتراكمي بدقة كاملة ولحظياً.", tag:"حاسبة" },
          { icon:"⏳", title:"العداد التنازلي للشهادة", desc:"عدّاد يتنازل تلقائياً حتى يوم الامتحان النهائي — شاهد كم يوماً وساعةً تبقّى. الضغط الإيجابي الذي يدفعك للأمام.", tag:"الامتحانات" },
          { icon:"⌛", title:"مؤقت المذاكرة", desc:"قنّن وقتك بالتقنية المثلى — مذاكرة مركّزة لمدة محددة، ثم استراحة قصيرة. نظام طوماتو مُخصَّص للطالب السوداني.", tag:"تركيز" },
          { icon:"✅", title:"مهامي الدراسية", desc:"سجّل واجباتك ومهامك الدراسية، حدّد مواعيد تسليمها، وضع إشارة الإتمام عند الانتهاء — نظام تنظيم بسيط وفعّال.", tag:"تنظيم" },
          { icon:"🎓", title:"حاسبة درجات الشهادة السودانية", desc:"حاسبة متخصصة لنظام شهادة الأساس والثانوية السودانية — احسب درجتك الإجمالية ونسبتك المئوية وقرار النجاح.", tag:"شهادة سودانية" },
          { icon:"💡", title:"نصائح الاستذكار", desc:"مجموعة من نصائح الاستذكار والتعلم الفعّال — كيف تذاكر أكثر في وقت أقل، وكيف تحتفظ بالمعلومات أطول فترة ممكنة.", tag:"إرشادات" },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:8, background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:12, padding:"9px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <span style={{ fontSize:17 }}>{f.icon}</span>
                <div style={{ fontSize:11.5, fontWeight:800, color:"#fff" }}>{f.title}</div>
              </div>
              <div style={{ background:`${A}20`, borderRadius:10, padding:"2px 8px", fontSize:9, color:A2, fontWeight:700 }}>{f.tag}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.43)", lineHeight:1.6 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
