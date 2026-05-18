import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'app/admin.tsx');
let src = fs.readFileSync(file, 'utf8');

const importAnchor = 'import BrandPattern from "@/components/BrandPattern";';
const importLine = 'import { IMPORTANT_APP_SERVICE_LINKS } from "@/constants/service-links";';
if (!src.includes(importLine)) {
  src = src.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const withPartners = 'type Tab = "overview" | "members" | "admins" | "moderators" | "landmarks" | "ads" | "communities" | "partners_admin" | "neighborhoods" | "ai_settings" | "security" | "honored" | "transport" | "updates" | "libraries" | "merchants_admin" | "phone_shops";';
const withPartnersTarget = 'type Tab = "overview" | "members" | "admins" | "moderators" | "landmarks" | "ads" | "communities" | "partners_admin" | "service_links" | "neighborhoods" | "ai_settings" | "security" | "honored" | "transport" | "updates" | "libraries" | "merchants_admin" | "phone_shops";';
const base = 'type Tab = "overview" | "members" | "admins" | "moderators" | "landmarks" | "ads" | "communities" | "neighborhoods" | "ai_settings" | "security" | "honored" | "transport" | "updates" | "libraries" | "merchants_admin" | "phone_shops";';
const baseTarget = 'type Tab = "overview" | "members" | "admins" | "moderators" | "landmarks" | "ads" | "communities" | "service_links" | "neighborhoods" | "ai_settings" | "security" | "honored" | "transport" | "updates" | "libraries" | "merchants_admin" | "phone_shops";';
if (!src.includes('"service_links"')) {
  src = src.replace(withPartners, withPartnersTarget);
  src = src.replace(base, baseTarget);
}

const tabAnchor = '{ key: "communities", label: "المؤسسات", icon: "business-outline", adminOnly: false },';
const tabLine = '{ key: "service_links", label: "الخدمات", icon: "link-outline", adminOnly: true },';
if (!src.includes('key: "service_links"')) {
  src = src.replace(tabAnchor, `${tabAnchor}\n    ${tabLine}`);
}

const caseAnchor = 'case "communities": return renderCommunities();';
const caseLine = 'case "service_links": return renderServiceLinksAdmin();';
if (!src.includes(caseLine)) {
  src = src.replace(caseAnchor, `${caseAnchor}\n      ${caseLine}`);
}

const beforeReturn = '  return (\n    <KeyboardAvoidingView';
const component = `  const renderServiceLinksAdmin = () => (\n    <ScrollView style={s.content} showsVerticalScrollIndicator={false}>\n      <SectionHeader title=\"اشتراكات وخدمات التطبيق\" />\n      <View style={s.emptyCard}>\n        <Ionicons name=\"link-outline\" size={42} color={Colors.primary} />\n        <Text style={s.emptyTitle}>روابط التشغيل المهمة</Text>\n        <Text style={s.emptyText}>السيرفرات، البناء، التخزين، Firebase، GitHub وخدمات النشر في مكان واحد.</Text>\n      </View>\n      {IMPORTANT_APP_SERVICE_LINKS.map((item) => (\n        <TouchableOpacity\n          key={item.key}\n          activeOpacity={0.86}\n          onPress={() => Linking.openURL(item.url)}\n          style={s.infoCard}\n        >\n          <View style={{ flexDirection: \"row-reverse\", alignItems: \"center\", gap: 12 }}>\n            <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: \"center\", justifyContent: \"center\", backgroundColor: Colors.primary + \"18\" }}>\n              <Ionicons name=\"link-outline\" size={22} color={Colors.primary} />\n            </View>\n            <View style={{ flex: 1, alignItems: \"flex-end\" }}>\n              <Text style={s.infoTitle}>{item.title}</Text>\n              <Text style={s.infoText}>{item.description}</Text>\n              <Text style={[s.infoText, { color: Colors.primary, marginTop: 3 }]} numberOfLines={1}>{item.url}</Text>\n            </View>\n            <Ionicons name=\"open-outline\" size={18} color={Colors.textMuted} />\n          </View>\n        </TouchableOpacity>\n      ))}\n    </ScrollView>\n  );\n\n${beforeReturn}`;
if (!src.includes('روابط التشغيل المهمة')) {
  src = src.replace(beforeReturn, component);
}

fs.writeFileSync(file, src);
console.log('service links tab patch applied');
