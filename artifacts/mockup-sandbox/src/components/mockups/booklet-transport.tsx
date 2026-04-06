export default function BookletTransport() {
  const A = "#F97316", A2 = "#FBBF24", BG = "#0D0A05";
  return (
    <div style={{ width:540, height:760, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}28 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", bottom:-40, left:-40, width:250, height:250, borderRadius:"50%", background:`radial-gradient(circle,rgba(39,174,104,0.12) 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#27AE68)` }} />

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:34, height:34, borderRadius:10, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:2 }}>02 / 07</div>
      </div>

      {/* Hero */}
      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"22px 28px 20px", position:"relative", zIndex:5, marginBottom:20 }}>
        <div style={{ fontSize:44, marginBottom:10 }}>🚗</div>
        <div style={{ fontSize:32, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:6 }}>مشوارك علينا</div>
        <div style={{ fontSize:14, color:A2, fontWeight:700, marginBottom:8 }}>خدمة النقل والتوصيل داخل المدينة</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>
          من بابك إلى أي مكان في الحصاحيصا — بلا انتظار ولا متاعب.
        </div>
      </div>

      {/* Zones */}
      <div style={{ padding:"0 24px 16px", position:"relative", zIndex:5 }}>
        <div style={{ fontSize:12, color:A2, fontWeight:700, letterSpacing:1, marginBottom:10 }}>▸ مناطق التغطية الخمس</div>
        <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
          {["المنطقة ١","المنطقة ٢","المنطقة ٣","المنطقة ٤","المنطقة ٥"].map((z,i)=>(
            <div key={i} style={{ background:`${A}18`, border:`1px solid ${A}40`, borderRadius:20, padding:"5px 14px", fontSize:11, color:A2, fontWeight:700 }}>{z}</div>
          ))}
        </div>

        {[
          { icon:"💰", title:"الأجرة محددة مسبقاً", desc:"اطّلع على التكلفة الكاملة قبل تأكيد الرحلة — لا مفاجآت ولا نزاعات." },
          { icon:"📍", title:"تتبع الرحلة لحظةً بلحظة", desc:"انتظار ← جارية ← مكتملة. معك في كل خطوة." },
          { icon:"✅", title:"سائقون موثوقون ومُختَبَرون", desc:"كل سائق يجتاز اختبار معايير الجودة قبل الانضمام للخدمة." },
          { icon:"📦", title:"توصيل الطلبات كذلك", desc:"أرسل أي شيء لأي مكان في المدينة بكل أمان وسرعة." },
        ].map((f,i)=>(
          <div key={i} style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:14, background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:14, padding:"13px 16px" }}>
            <div style={{ fontSize:26, flexShrink:0 }}>{f.icon}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:"#fff", marginBottom:3 }}>{f.title}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.6 }}>{f.desc}</div>
            </div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:14, padding:"14px 18px", textAlign:"center" }}>
          <div style={{ fontSize:15, fontWeight:800, color:A2 }}>"وصولك ضمانتنا."</div>
        </div>
      </div>
    </div>
  );
}
