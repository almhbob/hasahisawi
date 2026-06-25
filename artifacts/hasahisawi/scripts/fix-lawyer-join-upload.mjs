import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const file = resolve(appRoot, 'app/(tabs)/lawyers.tsx');
let src = readFileSync(file, 'utf8');
const before = src;

function replaceOnce(from, to, label) {
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.warn(`[fix-lawyer-join-upload] skipped ${label}: source not found`);
    return;
  }
  src = src.replace(from, to);
}

replaceOnce(
  'import AsyncStorage from "@react-native-async-storage/async-storage";',
  'import AsyncStorage from "@react-native-async-storage/async-storage";\nimport * as DocumentPicker from "expo-document-picker";',
  'document picker import',
);

replaceOnce(
  'import { useAuth } from "@/lib/auth-context";',
  'import { useAuth } from "@/lib/auth-context";\nimport { uploadFile } from "@/lib/firebase/storage";',
  'uploadFile import',
);

replaceOnce(
  '  const [appForm, setAppForm] = useState<typeof EMPTY_APP>(EMPTY_APP);',
  `  const [appForm, setAppForm] = useState<typeof EMPTY_APP>(EMPTY_APP);\n  const [barCardUploading, setBarCardUploading] = useState(false);\n  const [barCardFileName, setBarCardFileName] = useState<string | null>(null);\n  const [barCardUploadFailed, setBarCardUploadFailed] = useState(false);\n  const [barCardUploadError, setBarCardUploadError] = useState<string | null>(null);`,
  'bar card upload state',
);

const uploadFunction = `  const pickBarCardFile = async () => {
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const picked = result.assets[0];
      const safeName = (picked.name || \`lawyer_bar_card_\${Date.now()}.jpg\`)
        .replace(/[\\/]+/g, "_")
        .replace(/[^\p{L}\p{N}._-]+/gu, "_")
        .slice(0, 120) || \`lawyer_bar_card_\${Date.now()}.jpg\`;

      setBarCardFileName(safeName);
      setBarCardUploading(true);
      setBarCardUploadFailed(false);
      setBarCardUploadError(null);

      const key = (deviceId || \`guest_\${Date.now()}\`).replace(/[^a-zA-Z0-9_-]/g, "_");
      const url = await uploadFile(\`lawyer-applications/\${key}/bar-card/\${safeName}\`, picked.uri, {
        fileName: safeName,
        mimeType: picked.mimeType || null,
      });
      setAppForm(f => ({ ...f, bar_card_url: url }));
      setBarCardUploadFailed(false);
      setBarCardUploadError(null);
    } catch (e: any) {
      const msg = e?.message || "تعذر رفع ملف الهوية حالياً";
      setBarCardUploadFailed(true);
      setBarCardUploadError(msg);
      Alert.alert("تعذر الرفع", "يمكنك إرسال الطلب الآن وسيظهر للإدارة كمراجعة هوية يدوية.");
    } finally {
      setBarCardUploading(false);
    }
  };

`;

if (!src.includes('const pickBarCardFile = async () =>')) {
  replaceOnce('  const submitJoinApplication = async () => {', uploadFunction + '  const submitJoinApplication = async () => {', 'bar card picker function');
}

src = src.replace(
`          agree_terms: appForm.agree,
          device_id: deviceId,
        }),`,
`          agree_terms: appForm.agree,
          device_id: deviceId,
          bar_card_upload_status: appForm.bar_card_url ? "uploaded" : "pending_manual_review",
          bar_card_upload_note: appForm.bar_card_url ? "" : "تعذر رفع صورة الهوية/كارنيه النقابة من جهاز المستخدم؛ يرجى مراجعة الطلب يدوياً.",
        }),`,
);

const oldField = `              <Field label="رابط صورة كرت النقابة (اختياري)" value={appForm.bar_card_url} onChange={(v: string) => setAppForm(f => ({ ...f, bar_card_url: v }))} placeholder="https://..." />`;
const newUploadUi = `              <View style={s.uploadBox}>
                <Text style={s.joinSectionTitle}>الهوية المهنية / كارنيه النقابة</Text>
                <Text style={s.uploadHelp}>إرفاق صورة أو PDF اختياري، لكن يسرّع المراجعة. إذا تعذر الرفع سيكتمل الطلب كمراجعة يدوية.</Text>
                <TouchableOpacity onPress={pickBarCardFile} disabled={barCardUploading} style={[s.uploadBtn, barCardUploadFailed && s.uploadBtnWarn, appForm.bar_card_url && s.uploadBtnOk]}>
                  {barCardUploading ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name={appForm.bar_card_url ? "check-decagram" : "card-account-details-outline"} size={18} color="#fff" />}
                  <Text style={s.uploadBtnText}>{barCardUploading ? "جارٍ رفع الملف…" : appForm.bar_card_url ? "تم رفع ملف الهوية" : "إرفاق صورة/ملف الهوية"}</Text>
                </TouchableOpacity>
                {barCardFileName ? <Text style={s.uploadFileName}>الملف: {barCardFileName}</Text> : null}
                {barCardUploadFailed ? <Text style={s.uploadWarn}>{barCardUploadError || "لم يكتمل الرفع، وسيظهر الطلب للإدارة كمراجعة يدوية."}</Text> : null}
                <Field label="رابط يدوي للهوية (اختياري)" value={appForm.bar_card_url} onChange={(v: string) => setAppForm(f => ({ ...f, bar_card_url: v }))} placeholder="https://..." />
              </View>`;

if (src.includes(oldField) && !src.includes('إرفاق صورة/ملف الهوية')) {
  src = src.replace(oldField, newUploadUi);
}

if (!src.includes('uploadBox:')) {
  src = src.replace(
    /const s = StyleSheet\.create\(\{/, 
    `const s = StyleSheet.create({\n  uploadBox: { borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", backgroundColor: "rgba(139,92,246,0.08)", borderRadius: 14, padding: 12, gap: 8 },\n  uploadHelp: { color: Colors.textMuted, fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 18, textAlign: "right" },\n  uploadBtn: { minHeight: 44, borderRadius: 12, backgroundColor: "#8B5CF6", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14 },\n  uploadBtnOk: { backgroundColor: "#10B981" },\n  uploadBtnWarn: { backgroundColor: "#F59E0B" },\n  uploadBtnText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 13 },\n  uploadFileName: { color: Colors.text, fontFamily: "Cairo_600SemiBold", fontSize: 11, textAlign: "right" },\n  uploadWarn: { color: "#F59E0B", fontFamily: "Cairo_600SemiBold", fontSize: 11, textAlign: "right", lineHeight: 17 },`
  );
}

if (src !== before) {
  writeFileSync(file, src);
  console.log('[fix-lawyer-join-upload] lawyer identity upload patched.');
} else {
  console.log('[fix-lawyer-join-upload] lawyer identity upload already clean.');
}
