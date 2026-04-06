export default function Booklet2BackCover() {
  const services=["قسم المرأة وخصوصيتها","مشوارك علينا (النقل)","مناسبتك علينا (التأجير)","مساحة التجار","محلات الهواتف","المكتبات والقرطاسية","الدليل الطبي","الوظائف","الرياضة والأندية","الفعاليات والثقافة","المجتمعات والمناطق","البلاغات والطوارئ","الأرقام المهمة","خدمة عملاء مباشرة"];
  return (
    <div style={{ width:540, height:900, background:"#050D0A", position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-80, right:-80, width:420, height:420, borderRadius:"50%", background:"radial-gradient(circle,rgba(39,174,104,0.18) 0%,transparent 65%)" }} />
      <div style={{ position:"absolute", bottom:-60, left:-60, width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle,rgba(240,165,0,0.12) 0%,transparent 65%)" }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:"linear-gradient(90deg,#27AE68,#3EFF9C,#F0A500)" }} />

      <div style={{ display:"flex", flexDirection:"column", height:"100%", padding:"20px 26px 18px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
          </div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>07 / 07</div>
        </div>

        <div style={{ textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:26, fontWeight:900, color:"#fff", lineHeight:1.3, marginBottom:8 }}>
            مدينتك في جيبك.<br/>
            <span style={{ background:"linear-gradient(135deg,#27AE68,#3EFF9C)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>ابدأ الآن.</span>
          </div>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.45)", lineHeight:1.8 }}>حصاحيصاوي ليس مجرد تطبيق — هو بوابة رقمية لمدينة بأكملها. كل الخدمات التي تحتاجها في حياتك اليومية، من النقل والتسوق والمناسبات حتى الصحة والتعليم والثقافة، كلها في مكان واحد وعلى بُعد لمسة.</div>
        </div>

        {/* All services */}
        <div style={{ background:"rgba(39,174,104,0.06)", border:"1px solid rgba(39,174,104,0.15)", borderRadius:14, padding:"12px 14px", marginBottom:14 }}>
          <div style={{ fontSize:10, color:"rgba(39,174,104,0.7)", fontWeight:700, letterSpacing:1, marginBottom:10 }}>▸ جميع الخدمات المتاحة في التطبيق</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {services.map((s,i)=>(
              <div key={i} style={{ background:"rgba(39,174,104,0.08)", border:"1px solid rgba(39,174,104,0.18)", borderRadius:18, padding:"4px 11px", fontSize:10, color:"rgba(255,255,255,0.58)", fontWeight:600 }}>{s}</div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"flex", justifyContent:"space-around", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, padding:"14px 10px", marginBottom:14 }}>
          {[{v:"+25",l:"خدمة متكاملة"},{v:"500+",l:"مستخدم نشط"},{v:"24/7",l:"خدمة مستمرة"},{v:"100%",l:"مجاني"}].map((s,i)=>(
            <div key={i} style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:900, background:"linear-gradient(135deg,#27AE68,#F0A500)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{s.v}</div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.35)", marginTop:3 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ background:"linear-gradient(135deg,#27AE68,#1a7a4a)", borderRadius:14, padding:"14px 18px", textAlign:"center", boxShadow:"0 8px 25px rgba(39,174,104,0.35)", marginBottom:12 }}>
          <div style={{ fontSize:15, fontWeight:900, color:"#fff", marginBottom:4 }}>حمّل التطبيق مجاناً الآن</div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.7)", marginBottom:8 }}>متاح على Google Play</div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.45)", direction:"ltr" }}>play.google.com/store/apps/details?id=com.almhbob.hasahisawi</div>
        </div>

        {/* Hashtags */}
        <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
          {["#حصاحيصاوي","#حصاحيصا","#السودان","#تطبيق_ذكي"].map((t,i)=>(
            <span key={i} style={{ fontSize:10, color:"rgba(39,174,104,0.5)" }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
