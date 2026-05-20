import fs from 'node:fs';
import path from 'node:path';

function safeReplace(src, anchor, replacement, label) {
  if (!src.includes(anchor)) {
    console.error(`[patch] SKIP — anchor not found: ${label}`);
    return src;
  }
  return src.replace(anchor, replacement);
}

const file = path.resolve(process.cwd(), 'app/(tabs)/unions.tsx');
if (!fs.existsSync(file)) {
  console.error(`[patch] ERROR — file not found: ${file}`);
  process.exit(1);
}
let src = fs.readFileSync(file, 'utf8');

// أضف import لـ router إن لم يكن موجوداً
if (!src.includes('import { router } from "expo-router";')) {
  src = safeReplace(
    src,
    'import * as Haptics from "expo-haptics";',
    'import * as Haptics from "expo-haptics";\nimport { router } from "expo-router";',
    'haptics import anchor'
  );
}

// أضف بوابة اتحاد الطلاب قبل تبويبات النقابات
const marker = '      {/* Tabs — scrollable row */}';
if (!src.includes('Student Union professional portal')) {
  if (!src.includes(marker)) {
    console.error('[patch] SKIP — tabs marker not found in unions.tsx');
  } else {
    const block = `      {/* Student Union professional portal */}
      <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
        <LinearGradient colors={["#0B1224", "#172554"]} style={{ borderRadius: 22, padding: 16, borderWidth: 1, borderColor: "#818CF855" }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "#FFFFFF12", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="school-outline" size={27} color="#A5B4FC" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right" }}>اتحاد الطلاب — محلية الحصاحيصا</Text>
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#C7D2FE", textAlign: "right", marginTop: 3, lineHeight: 19 }}>استمارة عضوية طلابية، لوحة إدارة الاتحاد، أرشيف الاستمارات، وبوابة تفعيل الاتحاد.</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row-reverse", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
            <Pressable onPress={() => router.push("/student-union-join")} style={{ flexGrow: 1, minWidth: 145, backgroundColor: "#6366F1", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Ionicons name="document-text-outline" size={17} color="#fff" />
              <Text style={{ fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 13 }}>استمارة العضوية</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/union-partnership-apply")} style={{ flexGrow: 1, minWidth: 145, backgroundColor: "#FFFFFF10", borderWidth: 1, borderColor: "#A5B4FC55", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Ionicons name="people-outline" size={17} color="#C7D2FE" />
              <Text style={{ fontFamily: "Cairo_700Bold", color: "#C7D2FE", fontSize: 13 }}>انضمام الاتحادات</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/student-union-contact")} style={{ flexGrow: 1, minWidth: 145, backgroundColor: "#FFFFFF10", borderWidth: 1, borderColor: "#A5B4FC55", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Ionicons name="chatbubbles-outline" size={17} color="#C7D2FE" />
              <Text style={{ fontFamily: "Cairo_700Bold", color: "#C7D2FE", fontSize: 13 }}>التواصل والاستفسار</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/student-union-admin")} style={{ flexGrow: 1, minWidth: 145, backgroundColor: "#FFFFFF10", borderWidth: 1, borderColor: "#A5B4FC55", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Ionicons name="settings-outline" size={17} color="#C7D2FE" />
              <Text style={{ fontFamily: "Cairo_700Bold", color: "#C7D2FE", fontSize: 13 }}>لوحة الإدارة</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>

`;
    src = src.replace(marker, block + marker);
  }
}

fs.writeFileSync(file, src);
console.log('[patch] student-union portal applied');
