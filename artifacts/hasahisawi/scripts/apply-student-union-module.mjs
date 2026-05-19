import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'app/(tabs)/unions.tsx');
let src = fs.readFileSync(file, 'utf8');

if (!src.includes('import { router } from "expo-router";')) {
  src = src.replace('import * as Haptics from "expo-haptics";', 'import * as Haptics from "expo-haptics";\nimport { router } from "expo-router";');
}

const marker = '      {/* Tabs — scrollable row */}';
const block = `      {/* Student Union professional portal */}\n      <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>\n        <LinearGradient colors={["#0B1224", "#172554"]} style={{ borderRadius: 22, padding: 16, borderWidth: 1, borderColor: "#818CF855" }}>\n          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>\n            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "#FFFFFF12", alignItems: "center", justifyContent: "center" }}>\n              <Ionicons name="school-outline" size={27} color="#A5B4FC" />\n            </View>\n            <View style={{ flex: 1 }}>\n              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right" }}>اتحاد الطلاب — محلية الحصاحيصا</Text>\n              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#C7D2FE", textAlign: "right", marginTop: 3, lineHeight: 19 }}>استمارة عضوية طلابية، لوحة إدارة الاتحاد، أرشيف الاستمارات، وبوابة تفعيل الاتحاد.</Text>\n            </View>\n          </View>\n          <View style={{ flexDirection: "row-reverse", gap: 9, marginTop: 14, flexWrap: "wrap" }}>\n            <Pressable onPress={() => router.push("/student-union-join" as any)} style={{ flexGrow: 1, minWidth: 145, backgroundColor: "#6366F1", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 }}>\n              <Ionicons name="document-text-outline" size={17} color="#fff" />\n              <Text style={{ fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 13 }}>طلب عضوية الطلاب</Text>\n            </Pressable>\n            <Pressable onPress={() => router.push("/student-union-admin" as any)} style={{ flexGrow: 1, minWidth: 145, backgroundColor: "#FFFFFF10", borderWidth: 1, borderColor: "#A5B4FC55", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 }}>\n              <Ionicons name="settings-outline" size={17} color="#C7D2FE" />\n              <Text style={{ fontFamily: "Cairo_700Bold", color: "#C7D2FE", fontSize: 13 }}>لوحة إدارة الاتحاد</Text>\n            </Pressable>\n          </View>\n        </LinearGradient>\n      </View>\n\n`;

if (!src.includes('Student Union professional portal')) src = src.replace(marker, block + marker);

fs.writeFileSync(file, src);
console.log('Student union portal patch applied');
