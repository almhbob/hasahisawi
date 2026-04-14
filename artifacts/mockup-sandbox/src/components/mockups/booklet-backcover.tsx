export default function BookletBackCover() {
  const services = ["قسم المرأة","مشوارك علينا","مناسبتك علينا","مساحة التجار","محلات الهواتف","المكتبات","الطب والمواعيد","الوظائف","الرياضة","الثقافة","المجتمعات","الدليل الطبي","البلاغات والطوارئ","الأرقام المهمة"];
  return (
    <div style={{ width:540, height:760, background:"#050D0A", position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-80, right:-80, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(39,174,104,0.2) 0%,transparent 65%)" }} />
      <div style={{ position:"absolute", bottom:-60, left:-60, width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle,rgba(240,165,0,0.15) 0%,transparent 65%)" }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:"linear-gradient(90deg,#27AE68,#3EFF9C,#F0A500)" }} />
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#27AE68 50%,transparent)" }} />

      <div style={{ display:"flex", flexDirection:"column", height:"100%", padding:"22px 28px 20px", position:"relative", zIndex:5 }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:34, height:34, borderRadius:10, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>حصاحيصاوي</div>
          </div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:2 }}>07 / 07</div>
        </div>

        {/* Headline */}
        <div style={{ textAlign:"center", marginBottom:18 }}>
          <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.2, marginBottom:6 }}>
            مدينتك في جيبك.<br/>
            <span style={{ background:"linear-gradient(135deg,#27AE68,#3EFF9C)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>ابدأ الآن.</span>
          </div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", lineHeight:1.7 }}>أكثر من 25 خدمة تنتظرك في تطبيق واحد</div>
        </div>

        {/* Services cloud */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:7, justifyContent:"center", marginBottom:18 }}>
          {services.map((s,i)=>(
            <div key={i} style={{ background:"rgba(39,174,104,0.08)", border:"1px solid rgba(39,174,104,0.2)", borderRadius:20, padding:"5px 12px", fontSize:10.5, color:"rgba(255,255,255,0.6)", fontWeight:600 }}>{s}</div>
          ))}
        </div>

        {/* Stats */}
        <div style={{ display:"flex", justifyContent:"space-around", background:"rgba(39,174,104,0.08)", border:"1px solid rgba(39,174,104,0.2)", borderRadius:16, padding:"14px 10px", marginBottom:18 }}>
          {[{v:"+25",l:"خدمة"},{v:"500+",l:"مستخدم"},{v:"24/7",l:"متاح"}].map((s,i)=>(
            <div key={i} style={{ textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:900, background:"linear-gradient(135deg,#27AE68,#F0A500)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{s.v}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ background:"linear-gradient(135deg,#27AE68,#1a7a4a)", borderRadius:16, padding:"16px 20px", textAlign:"center", boxShadow:"0 8px 30px rgba(39,174,104,0.4)", marginBottom:14 }}>
          <div style={{ fontSize:16, fontWeight:900, color:"#fff", marginBottom:4 }}>حمّل التطبيق مجاناً الآن</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>play.google.com/store/apps/details?id=com.almhbob.hasahisawi</div>
        </div>

        {/* Hashtags */}
        <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
          {["#حصاحيصاوي","#الحصاحيصا","#السودان","#تطبيق_ذكي"].map((t,i)=>(
            <span key={i} style={{ fontSize:10, color:"rgba(39,174,104,0.55)" }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
