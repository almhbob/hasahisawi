import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../app/(tabs)/women.tsx', import.meta.url);
let src = readFileSync(file, 'utf8');
const before = src;

src = src.replace(
  'type ServiceType = "salon" | "sewing" | "health" | "cooking" | "childcare" | "tip" | "handmade";',
  'type ServiceType = "salon" | "sewing" | "health" | "cooking" | "childcare" | "tip" | "handmade" | "fashion" | "beauty" | "perfume";',
);

src = src.replace(
  '  handmade:  { label: "أعمال يدوية",  icon: "hand-heart-outline",  color: "#14B8A6" },\n};',
  '  handmade:  { label: "أعمال يدوية",  icon: "hand-heart-outline",  color: "#14B8A6" },\n  fashion:   { label: "ملابس وأزياء", icon: "hanger",              color: "#EC4899" },\n  beauty:    { label: "مستحضرات تجميل", icon: "lipstick",          color: "#F472B6" },\n  perfume:   { label: "عطور",          icon: "bottle-tonic-outline", color: "#C084FC" },\n};',
);

src = src.replace(
  'type SubTab = "services" | "health" | "recipes" | "handmade";',
  'type SubTab = "services" | "fashion" | "beauty" | "health" | "recipes" | "handmade";',
);

src = src.replace(
  '    { key: "childcare", label: "رعاية أطفال",   icon: "baby-face-outline" },\n  ];',
  '    { key: "childcare", label: "رعاية أطفال",   icon: "baby-face-outline" },\n    { key: "fashion",   label: "ملابس وأزياء",    icon: "hanger" },\n    { key: "beauty",    label: "مستحضرات تجميل", icon: "lipstick" },\n    { key: "perfume",   label: "عطور",           icon: "bottle-tonic-outline" },\n  ];',
);

src = src.replace(
  '             ["services",  "الخدمات",      "storefront-outline",   "#FF4FA3"],\n             ["handmade",  "يدوية",         "hand-heart-outline",   "#14B8A6"],\n             ["health",    "صحة المرأة",   "heart-outline",        "#3E9CBF"],',
  '             ["services",  "الخدمات",      "storefront-outline",   "#FF4FA3"],\n             ["fashion",   "أزياء",         "hanger",              "#EC4899"],\n             ["beauty",    "تجميل",         "lipstick",            "#F472B6"],\n             ["handmade",  "يدوية",         "hand-heart-outline",   "#14B8A6"],\n             ["health",    "صحة المرأة",   "heart-outline",        "#3E9CBF"],',
);

src = src.replace(
  '            <Text style={s.headerSub}>خدمات · صحة · مطبخ سوداني</Text>',
  '            <Text style={s.headerSub}>خدمات · أزياء · تجميل · عطور · مطبخ</Text>',
);

src = src.replace(
  '            {filtered.map((item, idx) => {',
  '            <View style={fs.featureGrid}>\n              {[\n                { title: "محلات ملابس", sub: "فساتين · عبايات · طرح · ملابس جاهزة", icon: "storefront-outline", color: "#EC4899" },\n                { title: "بائعات ملابس", sub: "طلبات خاصة وتوصيل داخل المنطقة", icon: "account-heart-outline", color: "#F472B6" },\n                { title: "مستحضرات تجميل", sub: "مكياج · عناية بالبشرة · عروض", icon: "lipstick", color: "#FB7185" },\n                { title: "عطور", sub: "عطور نسائية · مخمرية · بخور", icon: "bottle-tonic-outline", color: "#C084FC" },\n              ].map((x) => (\n                <View key={x.title} style={[fs.featureCard, { borderColor: x.color + "35" }]}>\n                  <View style={[fs.featureIcon, { backgroundColor: x.color + "18" }]}><MaterialCommunityIcons name={x.icon as any} size={23} color={x.color} /></View>\n                  <Text style={fs.featureTitle}>{x.title}</Text>\n                  <Text style={fs.featureSub}>{x.sub}</Text>\n                </View>\n              ))}\n            </View>\n\n            {filtered.map((item, idx) => {',
);

src = src.replace(
  '              {([[["all", "الكل"], ["salon", "كوفيرات"], ["sewing", "خياطة"], ["handmade", "يدوية"], ["health", "صحة"], ["cooking", "مطبخ"], ["childcare", "أطفال"]] as [ServiceType | "all", string][]).map(([k, label]) => (',
  '              {([["all", "الكل"], ["salon", "كوفيرات"], ["sewing", "خياطة"], ["fashion", "ملابس"], ["beauty", "تجميل"], ["perfume", "عطور"], ["handmade", "يدوية"], ["health", "صحة"], ["cooking", "مطبخ"], ["childcare", "أطفال"]] as [ServiceType | "all", string][]).map(([k, label]) => (',
);

if (!src.includes('const fs = StyleSheet.create({')) {
  src += `\n\nconst fs = StyleSheet.create({\n  featureGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginBottom: 14 },\n  featureCard: { width: "48%", backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, padding: 13, minHeight: 128 },\n  featureIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 9 },\n  featureTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },\n  featureSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 4, lineHeight: 17 },\n});\n`;
}

if (src !== before) {
  writeFileSync(file, src);
  console.log('[fashion-sections] Women fashion, cosmetics, and perfume spaces enabled.');
} else {
  console.log('[fashion-sections] already applied.');
}
