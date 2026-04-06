export default function Booklet2Transport() {
  const A="#F97316",A2="#FBBF24",BG="#0D0A05";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}25 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#27AE68)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>02 / 07</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}25,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"20px 26px 18px", position:"relative", zIndex:5, marginBottom:16 }}>
        <div style={{ fontSize:40, marginBottom:8 }}>🚗</div>
        <div style={{ fontSize:30, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>مشوارك علينا</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>خدمة النقل والتوصيل داخل المدينة</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:14, padding:"14px 16px", marginBottom:14 }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", lineHeight:1.9 }}>
            تهدف خدمة النقل في حصاحيصاوي إلى حل مشكلة التنقل اليومي في المدينة بطريقة منظّمة وشفافة. بدلاً من البحث عن سيارة أجرة في الشارع والتفاوض على السعر، يمكنك الآن طلب رحلتك من التطبيق ومعرفة التكلفة مسبقاً قبل التأكيد.
          </div>
        </div>

        {/* Zones */}
        <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:13, padding:"12px 14px", marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:800, color:"#fff", marginBottom:8 }}>🗺️ مناطق التغطية الخمس</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", lineHeight:1.8, marginBottom:10 }}>قُسِّمت الحصاحيصا إلى خمس مناطق جغرافية تغطي المدينة من قلبها إلى أطرافها، لضمان وصول الخدمة لكل الأحياء دون استثناء.</div>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
            {["م١ — المركز","م٢ — الشمال","م٣ — الجنوب","م٤ — الشرق","م٥ — الغرب"].map((z,i)=>(
              <div key={i} style={{ background:`${A}15`, border:`1px solid ${A}35`, borderRadius:18, padding:"4px 12px", fontSize:10, color:A2, fontWeight:700 }}>{z}</div>
            ))}
          </div>
        </div>

        {[
          { icon:"💰", title:"الأجرة مُحدَّدة مسبقاً", desc:"يعرض التطبيق تكلفة الرحلة الكاملة قبل أن تضغط على تأكيد. لا مفاوضات، لا نزاعات — الرقم واضح من البداية للنهاية." },
          { icon:"📍", title:"تتبّع الرحلة لحظةً بلحظة", desc:"تستطيع متابعة حالة رحلتك عبر ثلاث مراحل واضحة: انتظار السائق — الرحلة جارية — الوصول لوجهتك. كل شيء أمام عينيك." },
          { icon:"✅", title:"سائقون مُختَبَرون وموثوقون", desc:"كل سائق يمر بعملية تسجيل وتدريب واختبار معايير الجودة قبل انضمامه للمنصة، لضمان تجربة آمنة ومريحة في كل مرة." },
          { icon:"📦", title:"توصيل الطرود والطلبات", desc:"لا تحتاج للخروج لإرسال أي شيء — أرسل طردك، هديتك، أو أي طلب لأي عنوان داخل المدينة بكل أمان وبتكلفة محددة." },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:11, background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:13, padding:"11px 14px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
              <span style={{ fontSize:18 }}>{f.icon}</span>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>{f.desc}</div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}18,${A}08)`, border:`1px solid ${A}35`, borderRadius:13, padding:"11px 16px", textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:800, color:A2 }}>"وصولك ضمانتنا."</div>
        </div>
      </div>
    </div>
  );
}
