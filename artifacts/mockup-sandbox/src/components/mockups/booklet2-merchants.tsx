export default function Booklet2Merchants() {
  const A="#6366F1",A2="#818CF8",BG="#080A16";
  const cats=[{e:"🛒",n:"بقالة وأسواق",d:"مواد غذائية ومستلزمات يومية"},{e:"🍽️",n:"مطاعم",d:"وجبات وحلويات ومشروبات"},{e:"💊",n:"صيدليات",d:"أدوية ومستلزمات صحية"},{e:"👗",n:"ملابس",d:"أزياء سودانية وعصرية"},{e:"📱",n:"إلكترونيات",d:"أجهزة وإكسسوارات"},{e:"🔧",n:"خدمات",d:"صيانة وحرف متنوعة"},{e:"🎨",n:"حرف يدوية",d:"منتجات تراثية وفنية"},{e:"🏪",n:"متنوع",d:"محلات متعددة الأصناف"}];
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}22 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#27AE68)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>04 / 07</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:40, marginBottom:8 }}>🏪</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>مساحة التجار</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>السوق الرقمي في قلب الحصاحيصا</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"13px 16px", marginBottom:13 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            مساحة التجار هي الدليل التجاري الرقمي لمدينة الحصاحيصا — يمكن لأي تاجر أو صاحب محل تسجيل نشاطه التجاري مجاناً والوصول لآلاف المستخدمين في المدينة، بينما يستطيع المشتري البحث عن المنتج الذي يحتاجه وإيجاد أقرب محل يوفّره في ثوانٍ.
          </div>
        </div>

        <div style={{ fontSize:11, color:A2, fontWeight:700, marginBottom:8 }}>▸ التصنيفات المتاحة في المساحة</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:13 }}>
          {cats.map((c,i)=>(
            <div key={i} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:11, padding:"10px 12px", display:"flex", alignItems:"flex-start", gap:8 }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{c.e}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:"#fff", marginBottom:2 }}>{c.n}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>{c.d}</div>
              </div>
            </div>
          ))}
        </div>

        {[
          { icon:"⚡", title:"للتاجر: سجّل في دقيقتين", desc:"أدخل اسم محلك وتصنيفه وبيانات التواصل، وأضف منتجاتك وأسعارك. سيظهر محلك فوراً لكل مستخدمي التطبيق في الحصاحيصا — بدون رسوم ولا اشتراكات." },
          { icon:"🔍", title:"للمشتري: ابحث واعثر فوراً", desc:"تصفّح المحلات حسب الصنف، أو ابحث مباشرة عن المنتج الذي تريده، ثم تواصل مع المحل عبر الهاتف أو الواتساب بنقرة واحدة." },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:10, background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:12, padding:"11px 14px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
              <span style={{ fontSize:18 }}>{f.icon}</span>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>{f.desc}</div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"11px 16px", textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:800, color:A2 }}>"مكانك في السوق الرقمي ينتظرك."</div>
        </div>
      </div>
    </div>
  );
}
