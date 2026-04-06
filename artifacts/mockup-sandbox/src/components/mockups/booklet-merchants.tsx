export default function BookletMerchants() {
  const A = "#6366F1", A2 = "#818CF8", BG = "#080A16";
  const cats = [
    { e:"🛒", n:"بقالة وأسواق" }, { e:"🍽️", n:"مطاعم" },
    { e:"💊", n:"صيدليات" }, { e:"👗", n:"ملابس" },
    { e:"📱", n:"إلكترونيات" }, { e:"🔧", n:"خدمات" },
    { e:"🎨", n:"حرف يدوية" }, { e:"🏪", n:"متنوع" },
  ];
  return (
    <div style={{ width:540, height:760, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}25 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#27AE68)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:34, height:34, borderRadius:10, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:2 }}>04 / 07</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"20px 28px 18px", position:"relative", zIndex:5, marginBottom:18 }}>
        <div style={{ fontSize:44, marginBottom:8 }}>🏪</div>
        <div style={{ fontSize:30, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>مساحة التجار</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700, marginBottom:6 }}>سوقك الرقمي في قلب المدينة</div>
        <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>افتح محلك الرقمي اليوم — بلا إيجار ولا تكاليف.</div>
      </div>

      <div style={{ padding:"0 24px", position:"relative", zIndex:5 }}>
        <div style={{ fontSize:11, color:A2, fontWeight:700, letterSpacing:1, marginBottom:10 }}>▸ أصناف المحلات المتاحة</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:18 }}>
          {cats.map((c,i)=>(
            <div key={i} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:12, padding:"12px 6px", textAlign:"center" }}>
              <div style={{ fontSize:22, marginBottom:5 }}>{c.e}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.65)", fontWeight:600 }}>{c.n}</div>
            </div>
          ))}
        </div>

        {[
          { icon:"⚡", title:"تسجيل في دقيقتين", desc:"أضف اسم محلك وبياناتك وابدأ التوصل مع العملاء فوراً." },
          { icon:"👥", title:"وصول لكل المستخدمين", desc:"عملاؤك يبحثون عنك في التطبيق — كن موجوداً حيث هم." },
          { icon:"💬", title:"تواصل مباشر", desc:"العميل يتصل أو يراسلك على الواتساب بنقرة واحدة." },
        ].map((f,i)=>(
          <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:12, background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:13, padding:"12px 14px" }}>
            <div style={{ fontSize:24, flexShrink:0 }}>{f.icon}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:"#fff", marginBottom:2 }}>{f.title}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"13px 18px", textAlign:"center", marginTop:4 }}>
          <div style={{ fontSize:14, fontWeight:800, color:A2 }}>"مكانك في السوق الرقمي ينتظرك."</div>
        </div>
      </div>
    </div>
  );
}
