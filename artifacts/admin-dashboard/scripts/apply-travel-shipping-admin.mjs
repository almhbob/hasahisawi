import { readFileSync, writeFileSync } from 'node:fs';

const pagePath = new URL('../src/pages/Travel.tsx', import.meta.url);
let source = readFileSync(pagePath, 'utf8');
let changed = false;

function rep(a, b) {
  if (!source.includes(a)) return false;
  source = source.replace(a, b);
  changed = true;
  return true;
}

rep(
  'type Settings = {\n  travel_enabled: string; travel_payment_timeout_hrs: string; travel_admin_whatsapp: string;\n};',
  'type Settings = {\n  travel_enabled: string; travel_payment_timeout_hrs: string; travel_admin_whatsapp: string;\n  travel_shipping_enabled?: string; travel_shipping_local_enabled?: string; travel_shipping_international_enabled?: string;\n  travel_shipping_pickup_enabled?: string; travel_shipping_admin_whatsapp?: string; travel_shipping_terms?: string;\n  travel_shipping_local_zones?: string; travel_shipping_international_zones?: string; travel_shipping_price_note?: string;\n};'
);

rep(
  'const [tab, setTab] = useState<"overview"|"companies"|"routes"|"bookings"|"scanner"|"settings">("overview");',
  'const [tab, setTab] = useState<"overview"|"companies"|"routes"|"bookings"|"scanner"|"shipping"|"settings">("overview");'
);

rep(
  'const [settings,  setSettings]  = useState<Settings>({ travel_enabled:"true", travel_payment_timeout_hrs:"3", travel_admin_whatsapp:"" });',
  'const [settings,  setSettings]  = useState<Settings>({ travel_enabled:"true", travel_payment_timeout_hrs:"3", travel_admin_whatsapp:"", travel_shipping_enabled:"true", travel_shipping_local_enabled:"true", travel_shipping_international_enabled:"true", travel_shipping_pickup_enabled:"true", travel_shipping_admin_whatsapp:"", travel_shipping_terms:"", travel_shipping_local_zones:"الحصاحيصا، مدني، الخرطوم", travel_shipping_international_zones:"السعودية، الإمارات، مصر", travel_shipping_price_note:"" });'
);

rep(
  '{ key:"scanner",    label:"فحص التذاكر",   icon:"📷" },\n    { key:"settings",   label:"الإعدادات",    icon:"⚙️" },',
  '{ key:"scanner",    label:"فحص التذاكر",   icon:"📷" },\n    { key:"shipping",   label:"الشحن",        icon:"📦" },\n    { key:"settings",   label:"الإعدادات",    icon:"⚙️" },'
);

const shippingBlock = `
      {/* ══ Shipping Settings ══ */}
      {!loading && tab === "shipping" && (
        <div style={{ display:"grid", gap:18 }}>
          <div style={{ background:`linear-gradient(135deg, #042f2e, ${CARD})`, border:`1px solid #2dd4bf44`, borderRadius:20, padding:24 }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:18, alignItems:"flex-start", flexWrap:"wrap" }}>
              <div>
                <h2 style={{ margin:"0 0 8px", color:TEXT, fontSize:20 }}>📦 إدارة خدمات الشحن المحلي والدولي</h2>
                <p style={{ margin:0, color:MUTED, fontSize:13, maxWidth:720, lineHeight:1.8 }}>
                  مساحة احترافية للوكالات لإدارة قبول طلبات الشحن، مناطق التغطية، الأسعار، الاستلام من العميل، حالات التتبع، وسياسات المستندات والتسليم.
                </p>
              </div>
              <SaveBtn onClick={saveSettings} label="حفظ إعدادات الشحن" />
            </div>
          </div>

          <Grid cols={3}>
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:16, padding:18 }}>
              <div style={{ fontSize:28, marginBottom:10 }}>🚚</div>
              <h3 style={{ margin:"0 0 8px", color:TEXT, fontSize:15 }}>الشحن المحلي</h3>
              <p style={{ color:MUTED, fontSize:12, lineHeight:1.7 }}>مناطق الاستلام والتسليم داخل السودان، رسوم الطرد والكيلو، وساعات العمل.</p>
            </div>
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:16, padding:18 }}>
              <div style={{ fontSize:28, marginBottom:10 }}>✈️</div>
              <h3 style={{ margin:"0 0 8px", color:TEXT, fontSize:15 }}>الشحن الدولي</h3>
              <p style={{ color:MUTED, fontSize:12, lineHeight:1.7 }}>وجهات دولية، مستندات مطلوبة، تتبع، تخليص، وتأكيد التسليم.</p>
            </div>
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:16, padding:18 }}>
              <div style={{ fontSize:28, marginBottom:10 }}>⚙️</div>
              <h3 style={{ margin:"0 0 8px", color:TEXT, fontSize:15 }}>إعدادات الوكالة</h3>
              <p style={{ color:MUTED, fontSize:12, lineHeight:1.7 }}>تشغيل الخدمة، واتساب المسؤول، سياسة الأسعار، وقوالب المتابعة.</p>
            </div>
          </Grid>

          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:18, padding:22 }}>
            <h3 style={{ margin:"0 0 16px", color:TEXT, fontSize:15 }}>إعدادات الخدمة</h3>
            <Grid cols={3}>
              <Sel label="تفعيل الشحن" value={settings.travel_shipping_enabled ?? "true"} onChange={v=>setSettings(s=>({...s, travel_shipping_enabled:v}))} options={[{v:"true",l:"مفعل"},{v:"false",l:"متوقف"}]} />
              <Sel label="الشحن المحلي" value={settings.travel_shipping_local_enabled ?? "true"} onChange={v=>setSettings(s=>({...s, travel_shipping_local_enabled:v}))} options={[{v:"true",l:"مفعل"},{v:"false",l:"متوقف"}]} />
              <Sel label="الشحن الدولي" value={settings.travel_shipping_international_enabled ?? "true"} onChange={v=>setSettings(s=>({...s, travel_shipping_international_enabled:v}))} options={[{v:"true",l:"مفعل"},{v:"false",l:"متوقف"}]} />
              <Sel label="استلام من العميل" value={settings.travel_shipping_pickup_enabled ?? "true"} onChange={v=>setSettings(s=>({...s, travel_shipping_pickup_enabled:v}))} options={[{v:"true",l:"متاح"},{v:"false",l:"غير متاح"}]} />
              <Inp label="واتساب مسؤول الشحن" value={settings.travel_shipping_admin_whatsapp ?? ""} onChange={v=>setSettings(s=>({...s, travel_shipping_admin_whatsapp:v}))} placeholder="+249..." />
              <Inp label="ملاحظة الأسعار" value={settings.travel_shipping_price_note ?? ""} onChange={v=>setSettings(s=>({...s, travel_shipping_price_note:v}))} placeholder="تحدد حسب الوزن والوجهة" />
              <Inp label="مناطق الشحن المحلي" value={settings.travel_shipping_local_zones ?? ""} onChange={v=>setSettings(s=>({...s, travel_shipping_local_zones:v}))} placeholder="الحصاحيصا، مدني، الخرطوم" />
              <Inp label="وجهات الشحن الدولي" value={settings.travel_shipping_international_zones ?? ""} onChange={v=>setSettings(s=>({...s, travel_shipping_international_zones:v}))} placeholder="السعودية، الإمارات، مصر" />
              <Inp label="شروط وسياسة الشحن" value={settings.travel_shipping_terms ?? ""} onChange={v=>setSettings(s=>({...s, travel_shipping_terms:v}))} placeholder="المستندات المطلوبة، زمن التسليم، شروط الاسترجاع" />
            </Grid>
          </div>
        </div>
      )}
`;

if (!source.includes('إدارة خدمات الشحن المحلي والدولي')) {
  rep('      {/* ══ Companies ══ */}', shippingBlock + '\n      {/* ══ Companies ══ */}');
}

if (changed) writeFileSync(pagePath, source);
console.log(changed ? 'travel shipping admin applied' : 'travel shipping admin already applied');
