import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const file = resolve(appRoot, 'app/travel-agencies.tsx');

let source = readFileSync(file, 'utf8');
let changed = false;

function applyReplace(search, replacement) {
  if (!source.includes(search)) return false;
  source = source.replace(search, replacement);
  changed = true;
  return true;
}

if (!source.includes('const SHIPPING_SERVICES =')) {
  source = source.replace(
`const WORKSPACE_MODULES = [
  { title: "طلبات الحجوزات", sub: "استلام ومتابعة طلبات العملاء", icon: "clipboard-list-outline", color: "#60A5FA" },
  { title: "أسعار وتوافر", sub: "تحديث عروض الطيران والفنادق", icon: "tag-multiple-outline", color: "#34D399" },
  { title: "فريق الوكالة", sub: "صلاحيات الموظفين والمسؤولين", icon: "account-cog-outline", color: "#FBBF24" },
  { title: "إعدادات الدفع", sub: "حسابات التحويل وسياسة التأكيد", icon: "credit-card-cog-outline", color: "#F472B6" },
];`,
`const WORKSPACE_MODULES = [
  { title: "طلبات الحجوزات", sub: "استلام ومتابعة طلبات العملاء", icon: "clipboard-list-outline", color: "#60A5FA" },
  { title: "أسعار وتوافر", sub: "تحديث عروض الطيران والفنادق", icon: "tag-multiple-outline", color: "#34D399" },
  { title: "فريق الوكالة", sub: "صلاحيات الموظفين والمسؤولين", icon: "account-cog-outline", color: "#FBBF24" },
  { title: "إعدادات الدفع", sub: "حسابات التحويل وسياسة التأكيد", icon: "credit-card-cog-outline", color: "#F472B6" },
  { title: "إدارة الشحن", sub: "محلي ودولي، أسعار، تتبع وحالات", icon: "truck-delivery-outline", color: "#2DD4BF" },
  { title: "سياسات الوكالة", sub: "مواعيد، عمولات، شروط وتسليم", icon: "cog-outline", color: "#A78BFA" },
];

const SHIPPING_SERVICES = [
  { key: "local", title: "الشحن المحلي", desc: "استلام وتسليم داخل المدينة والولايات مع تحديد مناطق التغطية وسعر الكيلو أو الطرد.", icon: "truck-fast-outline", color: "#22C55E" },
  { key: "international", title: "الشحن الدولي", desc: "شحن مستندات وطرود إلى الخليج، مصر، أوروبا وباقي الوجهات مع متابعة الحالة.", icon: "airplane-cog", color: "#38BDF8" },
  { key: "customs", title: "تخليص ومتابعة", desc: "إدارة بيانات المستندات، أرقام التتبع، ملاحظات الجمارك، وتحديث العميل آلياً.", icon: "shield-check-outline", color: "#F59E0B" },
  { key: "pickup", title: "استلام من العميل", desc: "تفعيل خدمة الاستلام من المنزل أو المتجر وتحديد ساعات العمل ومناطق الاستلام.", icon: "map-marker-path", color: "#F472B6" },
];

const SHIPPING_SETTINGS_MODULES = [
  { title: "تفعيل الشحن", sub: "تشغيل/إيقاف المحلي والدولي لكل وكالة", icon: "toggle-switch-outline", color: "#22C55E" },
  { title: "مناطق التغطية", sub: "مدن محلية ووجهات دولية قابلة للإدارة", icon: "map-marker-multiple-outline", color: "#38BDF8" },
  { title: "قائمة الأسعار", sub: "سعر الطرد، الكيلو، التأمين والتوصيل", icon: "cash-multiple", color: "#F59E0B" },
  { title: "حالات الطلب", sub: "جديد، تم الاستلام، قيد الشحن، تم التسليم", icon: "timeline-check-outline", color: "#A78BFA" },
  { title: "مستندات الشحن", sub: "إيصال، بوليصة، فاتورة، صورة هوية عند الحاجة", icon: "file-document-check-outline", color: "#FB7185" },
  { title: "رسائل العملاء", sub: "قوالب واتساب للتأكيد والتتبع والتسليم", icon: "whatsapp", color: "#10B981" },
];`
  );
  changed = true;
}

const shippingSection = `
        {/* ── مساحة الشحن الدولي والمحلي ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📦 مساحة الشحن الدولي والمحلي</Text>
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <LinearGradient colors={["#042F2E", "#0F172A", "#164E63"]} style={s.shippingHero}>
              <View style={s.shippingHeroHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.shippingHeroTitle}>خدمات شحن احترافية للوكالات</Text>
                  <Text style={s.shippingHeroSub}>استقبل طلبات الشحن المحلي والدولي، حدّد الأسعار، مناطق التغطية، المستندات المطلوبة، وتتبع حالة كل شحنة من لوحة واحدة.</Text>
                </View>
                <View style={s.shippingHeroIcon}>
                  <MaterialCommunityIcons name="truck-delivery-outline" size={32} color="#2DD4BF" />
                </View>
              </View>
              <View style={s.shippingModeRow}>
                <View style={s.shippingModePill}><Text style={s.shippingModeText}>محلي داخل السودان</Text></View>
                <View style={s.shippingModePill}><Text style={s.shippingModeText}>دولي للخليج ومصر والعالم</Text></View>
              </View>
            </LinearGradient>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
              {SHIPPING_SERVICES.map((item, i) => (
                <Animated.View key={item.key} entering={FadeInRight.delay(i * 70)}>
                  <LinearGradient colors={[item.color + "20", "#0F172A"]} style={[s.shippingCard, { borderColor: item.color + "44" }]}>
                    <View style={[s.shippingIconWrap, { backgroundColor: item.color + "22" }]}>
                      <MaterialCommunityIcons name={item.icon as any} size={25} color={item.color} />
                    </View>
                    <Text style={s.shippingCardTitle}>{item.title}</Text>
                    <Text style={s.shippingCardDesc}>{item.desc}</Text>
                  </LinearGradient>
                </Animated.View>
              ))}
            </ScrollView>

            <View style={s.shippingSettingsBox}>
              <View style={s.shippingSettingsHead}>
                <Text style={s.shippingSettingsTitle}>⚙️ لوحة إعدادات الشحن للوكالة</Text>
                <Text style={s.shippingSettingsSub}>إعدادات جاهزة بعد اعتماد الوكالة</Text>
              </View>
              <View style={s.shippingSettingsGrid}>
                {SHIPPING_SETTINGS_MODULES.map((m, i) => (
                  <View key={i} style={[s.shippingSettingCard, { borderColor: m.color + "36" }]}>
                    <MaterialCommunityIcons name={m.icon as any} size={21} color={m.color} />
                    <Text style={s.shippingSettingTitle}>{m.title}</Text>
                    <Text style={s.shippingSettingSub}>{m.sub}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
`;

if (!source.includes('مساحة الشحن الدولي والمحلي')) {
  applyReplace('        {/* ── لوحة إعدادات الوكالة ── */}', shippingSection + '\n        {/* ── لوحة إعدادات الوكالة ── */}');
}

applyReplace(
  '{["تذاكر طيران", "فنادق", "تأشيرات", "باقات سياحية", "حج وعمرة", "تذاكر داخلية"].map(p => {',
  '{["تذاكر طيران", "فنادق", "تأشيرات", "باقات سياحية", "حج وعمرة", "تذاكر داخلية", "شحن محلي", "شحن دولي", "تخليص جمركي", "تتبع شحنات"].map(p => {'
);
applyReplace(
  'placeholder="مثال: حجز تذاكر طيران، تأشيرات، فنادق، باقات سياحية"',
  'placeholder="مثال: حجز تذاكر طيران، تأشيرات، فنادق، باقات سياحية، شحن محلي ودولي، تخليص جمركي"'
);

const styleBlock = `
  shippingHero: { borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "#2DD4BF40", gap: 12, overflow: "hidden" },
  shippingHeroHead: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 14 },
  shippingHeroIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: "rgba(45,212,191,0.14)", borderWidth: 1, borderColor: "rgba(45,212,191,0.28)", justifyContent: "center", alignItems: "center" },
  shippingHeroTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "right" },
  shippingHeroSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.72)", lineHeight: 20, textAlign: "right", marginTop: 4 },
  shippingModeRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  shippingModePill: { backgroundColor: "rgba(45,212,191,0.12)", borderWidth: 1, borderColor: "rgba(45,212,191,0.26)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  shippingModeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#99F6E4" },
  shippingCard: { width: 206, minHeight: 164, borderRadius: 18, borderWidth: 1, padding: 15, gap: 8, overflow: "hidden" },
  shippingIconWrap: { width: 45, height: 45, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  shippingCardTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", textAlign: "right" },
  shippingCardDesc: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.68)", textAlign: "right", lineHeight: 18 },
  shippingSettingsBox: { backgroundColor: "rgba(15,23,42,0.82)", borderWidth: 1, borderColor: "rgba(148,163,184,0.20)", borderRadius: 20, padding: 16, gap: 12 },
  shippingSettingsHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  shippingSettingsTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  shippingSettingsSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  shippingSettingsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 9 },
  shippingSettingCard: { width: "47%", borderWidth: 1, borderRadius: 14, padding: 12, backgroundColor: "rgba(255,255,255,0.04)", gap: 5 },
  shippingSettingTitle: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff", textAlign: "right" },
  shippingSettingSub: { fontFamily: "Cairo_400Regular", fontSize: 10, color: "rgba(255,255,255,0.62)", textAlign: "right", lineHeight: 15 },
`;
if (!source.includes('shippingHero:')) {
  applyReplace('  workspacePreview: { borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "#60A5FA35", gap: 14, overflow: "hidden" },', styleBlock + '  workspacePreview: { borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "#60A5FA35", gap: 14, overflow: "hidden" },');
}

if (changed) writeFileSync(file, source);
console.log(changed ? 'travel shipping services applied' : 'travel shipping services already applied');
