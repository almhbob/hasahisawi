export default function Booklet2Phones() {
  const A="#7C3AED",A2="#A78BFA",BG="#090814";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}25 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#3EFF9C)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>05 / 07</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:40, marginBottom:8 }}>📱</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>محلات الهواتف</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>تصفّح المخزون قبل أن تتوجّه</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"13px 16px", marginBottom:13 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            صُمِّم هذا القسم لمحلات الهواتف والإلكترونيات في الحصاحيصا — يمكن لكل محل عرض مخزونه الحالي من الأجهزة مع مواصفاتها وأسعارها، فيتمكّن الزبون من مقارنة العروض واختيار الجهاز المناسب له قبل أن يخطو خطوة واحدة خارج المنزل.
          </div>
        </div>

        {/* Brands */}
        <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:13, padding:"11px 14px", marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:800, color:"#fff", marginBottom:6 }}>📲 الماركات المتوفرة في المحلات</div>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
            {["Samsung","iPhone","Tecno","Infinix","Xiaomi","Nokia","Huawei","OPPO","وغيرها"].map((b,i)=>(
              <div key={i} style={{ background:`${A}12`, border:`1px solid ${A}30`, borderRadius:16, padding:"4px 10px", fontSize:10, color:A2, fontWeight:600 }}>{b}</div>
            ))}
          </div>
        </div>

        {[
          { icon:"🔍", title:"تصفّح حسب الماركة أو الموديل", desc:"فلتر سريع يتيح لك البحث عن الجهاز الذي تريده بالاسم أو الماركة ومعرفة المحلات التي تتوفر فيه حالياً دون إضاعة الوقت." },
          { icon:"💰", title:"قارن الأسعار بين المحلات", desc:"تستطيع رؤية نفس الجهاز في أكثر من محل مع سعره في كل مكان، وتختار الأنسب لك من حيث السعر والقرب من موقعك." },
          { icon:"📞", title:"تواصل مباشر مع المحل", desc:"بمجرد اختيارك للمحل المناسب، يمكنك الاتصال أو المراسلة عبر الواتساب مباشرة من التطبيق لتأكيد التوفر وترتيب الزيارة." },
          { icon:"🆕", title:"عروض وأجهزة جديدة لحظياً", desc:"يُحدِّث أصحاب المحلات مخزونهم وعروضهم بصفة منتظمة، فتكون أول من يعلم بأي جهاز جديد وصل أو عرض مميز بدأ." },
          { icon:"🏪", title:"لأصحاب المحلات — سجّل اليوم", desc:"سجّل محلك وأضف مخزونك وأسعارك، وابدأ في استقبال استفسارات العملاء مباشرة — الخدمة مجانية تماماً." },
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
          <div style={{ fontSize:14, fontWeight:800, color:A2 }}>"جميع الأجهزة، في مكان واحد."</div>
        </div>
      </div>
    </div>
  );
}
