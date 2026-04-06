export default function BFSocial() {
  const A="#F97316",A2="#FB923C",BG="#0E0704";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle,${A}20 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#27AE68)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>التواصل والذكاء الاصطناعي</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}20,${A}06)`, borderTop:`1px solid ${A}28`, borderBottom:`1px solid ${A}18`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>💬</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>التواصل والمساعد الذكي</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>اجتماعي · دردشة · ذكاء اصطناعي · إعلانات</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:14, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            أربعة أبواب للتواصل تجعل حصاحيصاوي أكثر من مجرد تطبيق خدمات — إنه مجتمع رقمي حقيقي لأبناء المدينة.
          </div>
        </div>

        {[
          { icon:"📱", title:"التواصل الاجتماعي — شبكة المدينة", desc:"انشر، علّق، وتفاعل مع منشورات أبناء الحصاحيصا. صور، أخبار، أفكار — كل ما يحدث في المدينة في تغذية اجتماعية واحدة." },
          { icon:"💬", title:"الدردشة المباشرة", desc:"تواصل مع أي مستخدم آخر في التطبيق بشكل مباشر — سواء لإتمام صفقة، السؤال عن خدمة، أو مجرد التواصل مع جار أو صديق." },
          { icon:"📢", title:"الإعلانات المدفوعة والمجانية", desc:"أعلن عن منتجك أو خدمتك أو فعاليتك — وصول لكل مستخدمي التطبيق بإعلان مُصمَّم بشكل احترافي. خيارات مجانية ومدفوعة." },
          { icon:"🗺️", title:"الخريطة التفاعلية للمدينة", desc:"اكتشف الحصاحيصا على خريطة تفاعلية — مواقع المحلات، المنشآت الطبية، الأندية الرياضية والمراكز الثقافية محدّدة بدقة." },
          { icon:"🤖", title:"المساعد الذكي — دعم بالذكاء الاصطناعي", desc:"اسأل المساعد الذكي أي سؤال عن خدمات التطبيق أو المدينة أو أي موضوع آخر — إجابات فورية ودقيقة على مدار الساعة دون انتظار." },
          { icon:"⭐", title:"التقييمات والمراجعات", desc:"قيّم الخدمات التي استخدمتها وساعد الآخرين في اختيار الأفضل — نظام تقييم شفاف يرتقي بمستوى الخدمات في المدينة." },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:8, background:"rgba(255,255,255,0.03)", border:`1px solid ${A}13`, borderRadius:12, padding:"9px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
              <span style={{ fontSize:17 }}>{f.icon}</span>
              <div style={{ fontSize:11.5, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.43)", lineHeight:1.6 }}>{f.desc}</div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}15,${A}06)`, border:`1px solid ${A}30`, borderRadius:13, padding:"10px 16px", textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:800, color:A2 }}>"أكثر من تطبيق — مجتمع رقمي حقيقي."</div>
        </div>
      </div>
    </div>
  );
}
