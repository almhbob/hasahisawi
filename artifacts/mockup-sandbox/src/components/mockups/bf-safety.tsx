export default function BFSafety() {
  const A="#EF4444",A2="#FCA5A5",BG="#120404";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle,${A}20 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#F97316)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>الأمان والطوارئ</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}20,${A}06)`, borderTop:`1px solid ${A}28`, borderBottom:`1px solid ${A}18`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>🚨</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>الأمان والطوارئ</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>البلاغات · المفقودون · أرقام الطوارئ</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        <div style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}18`, borderRadius:14, padding:"12px 16px", marginBottom:12 }}>
          <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.65)", lineHeight:1.85 }}>
            ثلاثة أقسام لسلامة المجتمع — تُبلِّغ عن مشكلة، تبحث عن مفقود، أو تصل لأرقام الطوارئ في ثوانٍ. حصاحيصاوي يضع أمان المدينة في مقدمة أولوياته.
          </div>
        </div>

        {/* Reports section */}
        <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:13, padding:"12px 14px", marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:800, color:"#fff", marginBottom:8 }}>🚩 البلاغات — أبلِغ عن أي مشكلة</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", lineHeight:1.75, marginBottom:8 }}>أرسل بلاغاً عن أي مشكلة في المدينة وتتبّع حالته خطوةً بخطوة:</div>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
            {[{e:"⏳",n:"قيد الإرسال"},{e:"✅",n:"وصل للجهة"},{e:"🔧",n:"جاري المعالجة"},{e:"✔️",n:"تم الحل"}].map((s,i)=>(
              <div key={i} style={{ background:`${A}12`, border:`1px solid ${A}28`, borderRadius:18, padding:"4px 11px", fontSize:10, color:A2, fontWeight:600 }}>{s.e} {s.n}</div>
            ))}
          </div>
        </div>

        {/* Missing section */}
        <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:13, padding:"12px 14px", marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:800, color:"#fff", marginBottom:6 }}>🔍 المفقودات والموجودات</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", lineHeight:1.75 }}>أبلِغ عن شخص مفقود أو شيء مفقود، أو أعلن عن شيء وجدته. يصل الإشعار فوراً لكل مستخدمي التطبيق في المدينة.</div>
        </div>

        {/* Numbers section */}
        <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${A}15`, borderRadius:13, padding:"12px 14px", marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:800, color:"#fff", marginBottom:6 }}>📞 الأرقام المهمة — دائماً في متناول يدك</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", lineHeight:1.75, marginBottom:8 }}>قائمة شاملة بأرقام الطوارئ مُصنَّفة للوصول السريع:</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7 }}>
            {[{e:"❤️",n:"الصحة"},{e:"🔧",n:"الخدمات"},{e:"🏛️",n:"الحكومة"},{e:"🚒",n:"الطوارئ"},{e:"🚓",n:"الشرطة"},{e:"⚡",n:"الكهرباء"}].map((c,i)=>(
              <div key={i} style={{ background:`${A}10`, border:`1px solid ${A}22`, borderRadius:10, padding:"8px 6px", textAlign:"center" }}>
                <div style={{ fontSize:18, marginBottom:4 }}>{c.e}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.55)", fontWeight:700 }}>{c.n}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background:`linear-gradient(135deg,${A}15,${A}06)`, border:`1px solid ${A}30`, borderRadius:13, padding:"10px 16px", textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:800, color:A2 }}>"أمانك مسؤوليتنا المشتركة."</div>
        </div>
      </div>
    </div>
  );
}
