export default function BFMarket() {
  const A="#10B981",A2="#34D399",BG="#050E0A";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle,${A}22 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#F0A500)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>السوق</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>🛍️</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>السوق الحصاحيصاوي</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>خمسة أسواق في تطبيق واحد</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            السوق الحصاحيصاوي يجمع أنواعاً متعددة من البيع والشراء تحت سقف واحد — سواء كنت تبحث عن قطعة أثاث مستعملة، أو تريد المشاركة في مزاد، أو تحتاج لتواصل مع نجار محترف.
          </div>
        </div>

        {[
          { icon:"👨‍👩‍👧", title:"السوق العائلي — البضائع المستعملة", desc:"منصة لبيع وشراء الأغراض المستعملة بين أبناء الحصاحيصا. انشر إعلانك بصورة وسعر وتواصل البائع والمشتري مباشرة دون وسيط.", color:A },
          { icon:"🔨", title:"المزاد — ابدأ المزايدة", desc:"قسم للمزادات الحية — يطرح البائع سلعته بسعر ابتدائي ويتنافس المشترون بالمزايدة حتى انتهاء الوقت المحدد. شفافية كاملة وتسجيل لكل عرض.", color:"#F0A500" },
          { icon:"🪵", title:"النجارة — حرفيون موثوقون", desc:"دليل النجارين والمشاغل في الحصاحيصا — كراسي، طاولات، خزائن، أبواب. شاهد أعمالهم السابقة وتواصل معهم لطلب عمل مخصص.", color:"#92400E" },
          { icon:"🛒", title:"مساحة التجار — السوق الرقمي", desc:"سجّل محلك مجاناً — بقالة، مطعم، صيدلية، ملابس، إلكترونيات، حرف يدوية. عملاؤك يجدونك في ثوانٍ عبر التطبيق.", color:"#6366F1" },
          { icon:"📱", title:"محلات الهواتف — قارن قبل الشراء", desc:"تصفّح مخزون محلات الهواتف — Samsung، iPhone، Tecno، Infinix وغيرها — مع الأسعار المحدّثة والمقارنة الفورية بين المحلات.", color:"#7C3AED" },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:9, background:"rgba(255,255,255,0.03)", border:`1px solid rgba(255,255,255,0.07)`, borderRadius:12, padding:"10px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:18 }}>{f.icon}</span>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.43)", lineHeight:1.65 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
