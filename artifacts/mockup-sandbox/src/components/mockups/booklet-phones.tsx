export default function BookletPhones() {
  const A = "#7C3AED", A2 = "#A78BFA", BG = "#090814";
  return (
    <div style={{ width:540, height:760, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}28 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#3EFF9C)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:34, height:34, borderRadius:10, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:2 }}>05 / 07</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"22px 28px 20px", position:"relative", zIndex:5, marginBottom:20 }}>
        <div style={{ fontSize:44, marginBottom:10 }}>📱</div>
        <div style={{ fontSize:32, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:6 }}>محلات الهواتف</div>
        <div style={{ fontSize:14, color:A2, fontWeight:700, marginBottom:8 }}>تصفّح قبل أن تتوجّه</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>اعرف ما هو متوفر وبكم سعره — قبل أن تغادر المنزل.</div>
      </div>

      <div style={{ padding:"0 24px", position:"relative", zIndex:5 }}>
        {[
          { icon:"🔍", title:"تصفّح حسب الماركة", desc:"Samsung · iPhone · Tecno · Infinix · وغيرها — فلترة فورية وسريعة." },
          { icon:"💰", title:"الأسعار في متناول يدك", desc:"قارن الأسعار بين المحلات قبل الخروج واختر الأنسب لك." },
          { icon:"📞", title:"تواصل مباشر مع المحل", desc:"اتصل أو راسل صاحب المحل بنقرة واحدة لتأكيد التوفر." },
          { icon:"🏪", title:"لأصحاب المحلات", desc:"سجّل محلك وأضف مخزونك — وصّل اسمك لكل من يبحث عن جهاز." },
          { icon:"🆕", title:"عروض وتخفيضات لحظية", desc:"تابع آخر العروض والأجهزة الجديدة فور توفرها في المحلات." },
        ].map((f,i)=>(
          <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:13, background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:13, padding:"12px 14px" }}>
            <div style={{ fontSize:24, flexShrink:0 }}>{f.icon}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:"#fff", marginBottom:2 }}>{f.title}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"13px 18px", textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:800, color:A2 }}>"جميع الأجهزة، في مكان واحد."</div>
        </div>
      </div>
    </div>
  );
}
