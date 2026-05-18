import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'app/admin.tsx');
let src = fs.readFileSync(file, 'utf8');

const oldTabType = 'type Tab = "overview" | "members" | "admins" | "moderators" | "landmarks" | "ads" | "communities" | "neighborhoods" | "ai_settings" | "security" | "honored" | "transport" | "updates" | "libraries" | "merchants_admin" | "phone_shops";';
const newTabType = 'type Tab = "overview" | "members" | "admins" | "moderators" | "landmarks" | "ads" | "communities" | "partners_admin" | "neighborhoods" | "ai_settings" | "security" | "honored" | "transport" | "updates" | "libraries" | "merchants_admin" | "phone_shops";';
src = src.replace(oldTabType, newTabType);

const permAnchor = '  { key: "communities", label: "موافقات المؤسسات",  icon: "business-outline"     as const },';
const permLine = '  { key: "partners_admin", label: "إدارة الشركاء", icon: "briefcase-outline" as const },';
if (!src.includes('key: "partners_admin"')) src = src.replace(permAnchor, `${permAnchor}\n${permLine}`);

const tabAnchor = '{ key: "communities", label: "المؤسسات", icon: "business-outline", adminOnly: false },';
const tabLine = '{ key: "partners_admin", label: "الشركاء", icon: "briefcase-outline", adminOnly: false },';
if (!src.includes('label: "الشركاء"')) src = src.replace(tabAnchor, `${tabAnchor}\n    ${tabLine}`);

const caseAnchor = 'case "communities": return renderCommunities();';
const caseLine = 'case "partners_admin": return renderPartnersAdmin();';
if (!src.includes(caseLine)) src = src.replace(caseAnchor, `${caseAnchor}\n      ${caseLine}`);

const beforeReturn = '  return (\n    <KeyboardAvoidingView';
const component = `  const renderPartnersAdmin = () => (\n    <ScrollView style={s.content} showsVerticalScrollIndicator={false}>\n      <SectionHeader title=\"إدارة الشركاء\" />\n      <View style={s.emptyCard}>\n        <Ionicons name=\"briefcase-outline\" size={42} color={Colors.primary} />\n        <Text style={s.emptyTitle}>لوحة الشركاء</Text>\n        <Text style={s.emptyText}>قبول وإدارة طلبات واشتراكات شركاء السفريات ومتجر زواجل.</Text>\n      </View>\n    </ScrollView>\n  );\n\n${beforeReturn}`;
if (!src.includes('لوحة الشركاء')) src = src.replace(beforeReturn, component);

fs.writeFileSync(file, src);
console.log('partner zone patch applied');
