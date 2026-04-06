export default function BookletOccasions() {
  const A = "#F0A500", A2 = "#FBBF24", BG = "#0D0B05";
  const items = [
    { emoji:"⛺", name:"صيوانات" }, { emoji:"🪑", name:"كراسي وطاولات" },
    { emoji:"🔊", name:"صوتيات" }, { emoji:"💡", name:"إضاءة وزينة" },
    { emoji:"🌸", name:"ديكور" }, { emoji:"🍽️", name:"ضيافة وتقديم" },
    { emoji:"⚡", name:"مولدات" }, { emoji:"❄️", name:"كولرات" },
  ];
  const transport = ["باص","هايسة","ميني باص","شاحنة","سيارة خاصة"];
  return (
    <div style={{ width:540, height:760, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, left:-60, width:320, height:320, borderRadius:"50%", background:`radial-gradient(circle,${A}25 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#FF4FA3)` }} />

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:34, height:34, borderRadius:10, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:2 }}>03 / 07</div>
      </div>

      {/* Hero */}
      <div style={{ background:`linear-gradient(160deg,${A}22,${A}08)`, borderTop:`1px solid ${A}30`, borderBottom:`1px solid ${A}20`, padding:"20px 28px 18px", position:"relative", zIndex:5, marginBottom:18 }}>
        <div style={{ fontSize:44, marginBottom:8 }}>🎪</div>
        <div style={{ fontSize:30, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>مناسبتك علينا</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700, marginBottom:6 }}>تأجير مستلزمات الأفراح والفعاليات</div>
        <div style={{ fontSize:11.5, color:"rgba(255,255,255,0.45)", lineHeight:1.7 }}>يوم لا ينسى يبدأ من هنا — كل شيء في مكان واحد.</div>
      </div>

      {/* Grid */}
      <div style={{ padding:"0 24px", position:"relative", zIndex:5 }}>
        <div style={{ fontSize:11, color:A2, fontWeight:700, letterSpacing:1, marginBottom:10 }}>▸ المستلزمات المتاحة للتأجير</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:16 }}>
          {items.map((it,i)=>(
            <div key={i} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${A}20`, borderRadius:12, padding:"12px 6px", textAlign:"center" }}>
              <div style={{ fontSize:22, marginBottom:5 }}>{it.emoji}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.65)", fontWeight:600 }}>{it.name}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize:11, color:A2, fontWeight:700, letterSpacing:1, marginBottom:10 }}>▸ نقل الضيوف أيضاً</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:18 }}>
          {transport.map((t,i)=>(
            <div key={i} style={{ background:`${A}15`, border:`1px solid ${A}35`, borderRadius:20, padding:"5px 14px", fontSize:11, color:A2, fontWeight:600 }}>{t}</div>
          ))}
        </div>

        <div style={{ background:`linear-gradient(135deg,${A}20,${A}08)`, border:`1px solid ${A}40`, borderRadius:14, padding:"16px 20px", display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ fontSize:30 }}>🤝</div>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:"#fff", marginBottom:3 }}>اجلس وارتاح — نحن نتولى الباقي.</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>تواصل مع أصحاب الخدمات مباشرةً من التطبيق</div>
          </div>
        </div>
      </div>
    </div>
  );
}
