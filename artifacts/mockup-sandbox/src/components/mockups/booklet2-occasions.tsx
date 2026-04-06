export default function Booklet2Occasions() {
  const A="#F0A500",A2="#FBBF24",BG="#0D0B05";
  const items=[{e:"⛺",n:"صيوانات",d:"بأحجام صغيرة ومتوسطة وكبيرة"},{e:"🪑",n:"كراسي وطاولات",d:"للعشرة وحتى الألف ضيف"},{e:"🔊",n:"صوتيات",d:"مكبرات ومايكروفون احترافي"},{e:"💡",n:"إضاءة وزينة",d:"ليد ملوّن وزينة المناسبات"},{e:"🌸",n:"ديكور وتنسيق",d:"تنسيق احترافي على ذوقك"},{e:"🍽️",n:"ضيافة وتقديم",d:"طاقم خدمة وضيافة متكامل"},{e:"⚡",n:"مولدات",d:"كهرباء مضمونة طوال الفعالية"},{e:"❄️",n:"كولرات",d:"برودة في أشد الأوقات حرارة"}];
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}22 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#FF4FA3)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>03 / 07</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:40, marginBottom:8 }}>🎪</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>مناسبتك علينا</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>تأجير مستلزمات الأفراح والفعاليات</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"13px 16px", marginBottom:13 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            يوفّر هذا القسم حلاً شاملاً لكل ما تحتاجه أي مناسبة في الحصاحيصا — من الأفراح والأعراس والختانات إلى حفلات التخرج والعزومات الكبيرة. بدلاً من التوجه لأماكن متعددة وإضاعة الوقت والجهد، تجد هنا كل أصحاب الخدمات في مكان واحد وتتواصل معهم مباشرة.
          </div>
        </div>

        {/* Grid */}
        <div style={{ fontSize:11, color:A2, fontWeight:700, marginBottom:8 }}>▸ المستلزمات المتاحة للتأجير</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:13 }}>
          {items.map((it,i)=>(
            <div key={i} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:11, padding:"10px 12px", display:"flex", alignItems:"flex-start", gap:8 }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{it.e}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:"#fff", marginBottom:2 }}>{it.n}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>{it.d}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Transport */}
        <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:13, padding:"11px 14px", marginBottom:11 }}>
          <div style={{ fontSize:12, fontWeight:800, color:"#fff", marginBottom:6 }}>🚌 نقل الضيوف — خدمة متكاملة</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", lineHeight:1.75, marginBottom:8 }}>لا يكتمل يوم المناسبة دون راحة الضيوف في التنقل. نوفّر خيارات متعددة تناسب كل الأعداد والمسافات:</div>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
            {["🚌 باص","🚐 هايسة","🚐 ميني باص","🚛 شاحنة","🚗 سيارة خاصة"].map((t,i)=>(
              <div key={i} style={{ background:`${A}15`, border:`1px solid ${A}30`, borderRadius:18, padding:"4px 11px", fontSize:10, color:A2, fontWeight:600 }}>{t}</div>
            ))}
          </div>
        </div>

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"11px 16px", textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:800, color:A2 }}>"يوم لا ينسى — مناسبتك علينا."</div>
        </div>
      </div>
    </div>
  );
}
