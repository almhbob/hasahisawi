import fs from 'node:fs';
import path from 'node:path';

function safeReplace(src, anchor, replacement, label) {
  if (!src.includes(anchor)) {
    console.warn(`[patch] SKIP — anchor not found: ${label}`);
    return src;
  }
  return src.replace(anchor, replacement);
}

const file = path.resolve(process.cwd(), 'app/admin.tsx');
if (!fs.existsSync(file)) {
  console.error(`[patch] ERROR — file not found: ${file}`);
  process.exit(1);
}
let src = fs.readFileSync(file, 'utf8');

// 1. Import
const importLine = 'import { IMPORTANT_APP_SERVICE_LINKS } from "@/constants/service-links";';
if (!src.includes(importLine)) {
  src = safeReplace(
    src,
    'import BrandPattern from "@/components/BrandPattern";',
    `import BrandPattern from "@/components/BrandPattern";\n${importLine}`,
    'BrandPattern import anchor'
  );
}

// 2. Tab type (يدعم النسختين — مع partners_admin وبدونها)
if (!src.includes('"service_links"')) {
  const withPartners = '"partners_admin" | "neighborhoods"';
  const base         = '"communities" | "neighborhoods"';
  if (src.includes(withPartners)) {
    src = src.replace(withPartners, '"partners_admin" | "service_links" | "neighborhoods"');
  } else if (src.includes(base)) {
    src = src.replace(base, '"communities" | "service_links" | "neighborhoods"');
  } else {
    console.warn('[patch] SKIP — Tab type anchor not found');
  }
}

// 3. Tab entry in tabs array
if (!src.includes('key: "service_links"')) {
  src = safeReplace(
    src,
    '{ key: "communities", label: "المؤسسات", icon: "business-outline", adminOnly: false },',
    '{ key: "communities", label: "المؤسسات", icon: "business-outline", adminOnly: false },\n    { key: "service_links", label: "الخدمات", icon: "link-outline", adminOnly: true },',
    'communities tab anchor'
  );
}

// 4. Switch case
const caseLine = 'case "service_links": return renderServiceLinksAdmin();';
if (!src.includes(caseLine)) {
  src = safeReplace(
    src,
    'case "communities": return renderCommunities();',
    `case "communities": return renderCommunities();\n      ${caseLine}`,
    'communities case anchor'
  );
}

// 5. renderServiceLinksAdmin component
if (!src.includes('روابط التشغيل المهمة')) {
  const beforeReturn = '  return (\n    <KeyboardAvoidingView';
  const component = `  const renderServiceLinksAdmin = () => (
    <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
      <SectionHeader title="اشتراكات وخدمات التطبيق" />
      <View style={s.emptyCard}>
        <Ionicons name="link-outline" size={42} color={Colors.primary} />
        <Text style={s.emptyTitle}>روابط التشغيل المهمة</Text>
        <Text style={s.emptyText}>السيرفرات، البناء، التخزين، Firebase، GitHub وخدمات النشر في مكان واحد.</Text>
      </View>
      {IMPORTANT_APP_SERVICE_LINKS.map((item) => (
        <TouchableOpacity
          key={item.key}
          activeOpacity={0.86}
          onPress={() => Linking.openURL(item.url)}
          style={s.infoCard}
        >
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary + "18" }}>
              <Ionicons name="link-outline" size={22} color={Colors.primary} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={s.infoTitle}>{item.title}</Text>
              <Text style={s.infoText}>{item.description}</Text>
              <Text style={[s.infoText, { color: Colors.primary, marginTop: 3 }]} numberOfLines={1}>{item.url}</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={Colors.textMuted} />
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

${beforeReturn}`;
  src = safeReplace(src, beforeReturn, component, 'return KAV anchor');
}

fs.writeFileSync(file, src);
console.log('[patch] service-links tab applied');
