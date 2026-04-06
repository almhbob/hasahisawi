export default function BFMisc() {
  const A="#F0A500",A2="#FBBF24",BG="#0E0A02";
  return (
    <div style={{ width:540, height:900, background:BG, position:"relative", overflow:"hidden", fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", direction:"rtl" }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle,${A}20 0%,transparent 65%)` }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${A},${A2},#27AE68)` }} />

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", position:"relative", zIndex:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden" }}><img src="/__mockup/hasahisawi-logo.png" alt="" style={{ width:"100%", height:"100%" }} /></div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>حصاحيصاوي</div>
        </div>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>خدمات متنوعة</div>
      </div>

      <div style={{ background:`linear-gradient(160deg,${A}20,${A}06)`, borderTop:`1px solid ${A}28`, borderBottom:`1px solid ${A}18`, padding:"18px 26px 16px", position:"relative", zIndex:5, marginBottom:14 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>✨</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", lineHeight:1.1, marginBottom:5 }}>خدمات متنوعة أخرى</div>
        <div style={{ fontSize:13, color:A2, fontWeight:700 }}>التهانئ · التكريم · التقويم · البحث</div>
      </div>

      <div style={{ padding:"0 22px", position:"relative", zIndex:5 }}>
        {[
          {
            icon:"🌸", title:"التهانئ والمناسبات",
            desc:"رسائل تهنئة جاهزة لكل مناسبة — أعياد ميلاد، أفراح، تخرج، رمضان وعيد. شارك تهنئتك بنقرة واحدة عبر الواتساب أو أي وسيلة أخرى. يضم أيضاً تقويماً للمناسبات الوطنية والدينية.",
          },
          {
            icon:"🏅", title:"قاعة التكريم — شخصيات الحصاحيصا",
            desc:"معرض رقمي يُخلّد أبرز الشخصيات التي أثرت في مدينة الحصاحيصا — علماء، أدباء، رياضيون ورجال أعمال. تعرّف على تاريخ مدينتك ورموزها.",
          },
          {
            icon:"🔍", title:"البحث الشامل",
            desc:"بحث موحّد يغطي كل خدمات التطبيق في آنٍ واحد — ابحث عن محل، خدمة، شخص، وظيفة أو فعالية وستجدها جميعاً في نتيجة واحدة.",
          },
          {
            icon:"📅", title:"التقويم والأحداث",
            desc:"تقويم تفاعلي يجمع المواعيد الطبية، الفعاليات القادمة، المناسبات الوطنية والدينية في رؤية زمنية موحّدة وسهلة.",
          },
          {
            icon:"🌐", title:"خدمة متعددة اللغات",
            desc:"التطبيق يدعم اللغة العربية واللغة الإنجليزية، مما يجعله متاحاً للجاليات الأجنبية والمقيمين غير الناطقين بالعربية في المدينة.",
          },
          {
            icon:"⚙️", title:"الإعدادات والتخصيص",
            desc:"خصّص تجربتك في التطبيق — اضبط اللغة والإشعارات والخصوصية. التطبيق يحفظ تفضيلاتك ويتكيّف مع احتياجاتك.",
          },
        ].map((f,i)=>(
          <div key={i} style={{ marginBottom:9, background:"rgba(255,255,255,0.03)", border:`1px solid ${A}13`, borderRadius:12, padding:"10px 13px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:19 }}>{f.icon}</span>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff" }}>{f.title}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.43)", lineHeight:1.65 }}>{f.desc}</div>
          </div>
        ))}

        <div style={{ background:`linear-gradient(135deg,${A}15,${A}06)`, border:`1px solid ${A}30`, borderRadius:13, padding:"10px 16px", textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:800, color:A2 }}>"كل تفصيلة في حياتك اليومية — غطّاها حصاحيصاوي."</div>
        </div>
      </div>
    </div>
  );
}
