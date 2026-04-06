export default function BFCulture() {
  const A="#A855F7",A2="#C084FC",BG="#0A0514";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle,${A}22 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#F0A500)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>الثقافة والفعاليات</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>🎭</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>الثقافة والفعاليات</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>مدينة حيّة — أحداث لا تتوقف</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            قسمان متكاملان — الثقافة للمراكز والمكتبات، والفعاليات لكل حدث يُنظّم في الحصاحيصا. لا تفوتك فعالية، ولا تُضيع وقتك في البحث.
          </div>
        </div>

        <div style={{ fontSize:11, color:A2, fontWeight:700, marginBottom:8 }}>▸ المراكز الثقافية والمكتبات</div>
        {[
          { icon:"📚", title:"المكتبات العامة", desc:"دليل المكتبات العامة في المدينة مع مخزونها من الكتب والمراجع، أوقات العمل والخدمات المتاحة كالطباعة والتصوير." },
          { icon:"🏛️", title:"المراكز الثقافية", desc:"مراكز النشاط الثقافي والاجتماعي في الحصاحيصا — الأماكن المخصصة للفعاليات والاجتماعات والعروض الثقافية." },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:8, background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:12, padding:"10px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
              <span style={{ fontSize:17 }}>{f.icon}</span>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.43)", lineHeight:1.6 }}>{f.desc}</div>
          </div>
        ))}

        <div style={{ fontSize:11, color:A2, fontWeight:700, marginBottom:8, marginTop:4 }}>▸ أنواع الفعاليات</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7, marginBottom:10 }}>
          {[{e:"⭐",n:"مهرجانات"},{e:"🎓",n:"تخاريج"},{e:"🏢",n:"مؤتمرات"},{e:"🎨",n:"معارض"},{e:"🎵",n:"حفلات"},{e:"➕",n:"وغيرها"}].map((t,i)=>(
            <div key={i} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:10, padding:"9px 7px", textAlign:"center" }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{t.e}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.6)", fontWeight:700 }}>{t.n}</div>
            </div>
          ))}
        </div>

        {[
          { icon:"📅", title:"جدول الفعاليات القادمة", desc:"تصفّح جميع الفعاليات المجدولة في المدينة مع تاريخها، مكانها، ووصفها — بفلترة سهلة حسب النوع." },
          { icon:"📣", title:"أضف فعاليتك", desc:"نظّمت حفلاً أو مؤتمراً أو معرضاً؟ أضفه للتطبيق وأعلمه لجميع أبناء الحصاحيصا في دقيقة واحدة." },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:8, background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:12, padding:"10px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
              <span style={{ fontSize:17 }}>{f.icon}</span>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.43)", lineHeight:1.6 }}>{f.desc}</div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"10px 16px", textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:800, color:A2 }}>"مدينتك لا تنام — تابع كل حدث."</div>
        </div>
      </div>
    </div>
  );
}
