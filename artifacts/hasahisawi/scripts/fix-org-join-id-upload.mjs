import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const file = resolve(appRoot, 'app/org-join.tsx');
let src = readFileSync(file, 'utf8');
const before = src;

function replaceOnce(from, to, label) {
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.warn(`[fix-org-join-id-upload] skipped ${label}: source not found`);
    return;
  }
  src = src.replace(from, to);
}

function replaceRegex(regex, to, label) {
  if (!regex.test(src)) {
    console.warn(`[fix-org-join-id-upload] skipped ${label}: pattern not found`);
    return;
  }
  src = src.replace(regex, to);
}

replaceOnce(
  'import * as ImagePicker from "expo-image-picker";',
  'import * as ImagePicker from "expo-image-picker";\nimport * as DocumentPicker from "expo-document-picker";',
  'document picker import',
);

replaceOnce(
  'const COMMITMENT_DATE = "١ أبريل ٢٠٢٦";\n',
  `const COMMITMENT_DATE = "١ أبريل ٢٠٢٦";\n\nconst REP_PHOTO_PENDING_URL = "https://almhbob.github.io/hasahisawi/privacy.html#identity-upload-pending";\ntype RepPhotoAsset = { uri: string; name?: string | null; mimeType?: string | null; source: "library" | "camera" | "document" };\n\nfunction getIdentityExt(asset: RepPhotoAsset): string {\n  const value = asset.name || asset.uri || "";\n  const clean = value.split("?")[0].split("#")[0];\n  const match = clean.match(/\\.([a-z0-9]+)$/i);\n  const ext = match?.[1]?.toLowerCase();\n  if (ext && ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"].includes(ext)) return ext;\n  if (asset.mimeType === "application/pdf") return "pdf";\n  if (asset.mimeType === "image/png") return "png";\n  if (asset.mimeType === "image/webp") return "webp";\n  if (asset.mimeType === "image/heic") return "heic";\n  if (asset.mimeType === "image/heif") return "heif";\n  return "jpg";\n}\n\nfunction getIdentityMime(asset: RepPhotoAsset): string {\n  if (asset.mimeType && (asset.mimeType.startsWith("image/") || asset.mimeType === "application/pdf")) return asset.mimeType;\n  const ext = getIdentityExt(asset);\n  if (ext === "pdf") return "application/pdf";\n  if (ext === "png") return "image/png";\n  if (ext === "webp") return "image/webp";\n  if (ext === "heic") return "image/heic";\n  if (ext === "heif") return "image/heif";\n  return "image/jpeg";\n}\n`,
  'identity upload helpers',
);

replaceOnce(
  '  const [repPhotoUploadFailed, setRepPhotoUploadFailed] = useState(false);',
  `  const [repPhotoUploadFailed, setRepPhotoUploadFailed] = useState(false);\n  const [repPhotoFileName, setRepPhotoFileName] = useState<string | null>(null);\n  const [repPhotoMimeType, setRepPhotoMimeType] = useState<string | null>(null);\n  const [repPhotoUploadError, setRepPhotoUploadError] = useState<string | null>(null);`,
  'identity upload state',
);

const robustBlock = `  // رفع صورة هوية الممثل — لا نمنع اكتمال الطلب عند فشل الشبكة، بل نرسله كمراجعة هوية.
  const doUploadRepPhoto = async (assetOrUri: RepPhotoAsset | string): Promise<string | null> => {
    const asset: RepPhotoAsset = typeof assetOrUri === "string"
      ? { uri: assetOrUri, name: repPhotoFileName, mimeType: repPhotoMimeType, source: "library" }
      : assetOrUri;

    setRepPhotoUploading(true);
    setRepPhotoUploadFailed(false);
    setRepPhotoUploadError(null);

    try {
      const userKey = auth.user?.id || repPhone.replace(/\\D/g, "") || repNationalId.replace(/\\D/g, "") || "guest";
      const folder = \`institution_applications/\${userKey}/identity\`;
      const ext = getIdentityExt(asset);
      const safeName = (asset.name || \`\${Date.now()}_rep_id.\${ext}\`).replace(/[\\\\/]+/g, "_");
      const url = await uploadFile(\`\${folder}/\${safeName}\`, asset.uri, {
        fileName: safeName,
        mimeType: getIdentityMime(asset),
      });
      setRepPhotoUrl(url);
      setRepPhotoUploadFailed(false);
      setRepPhotoUploadError(null);
      return url;
    } catch (error: any) {
      const msg = error?.message || "تعذّر رفع صورة الهوية حالياً";
      setRepPhotoUploadFailed(true);
      setRepPhotoUploadError(msg);
      return null;
    } finally {
      setRepPhotoUploading(false);
    }
  };

  const setRepPhotoAsset = async (asset: RepPhotoAsset) => {
    setRepPhotoUri(asset.uri);
    setRepPhotoFileName(asset.name || null);
    setRepPhotoMimeType(asset.mimeType || null);
    setRepPhotoUrl(null);
    await doUploadRepPhoto(asset);
  };

  const pickRepPhotoFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      if (perm.canAskAgain === false) {
        Alert.alert(
          "الإذن مرفوض",
          "قمت برفض إذن المعرض بشكل دائم. يمكنك فتح الإعدادات أو اختيار ملف الهوية مباشرة.",
          [
            { text: "اختيار ملف", onPress: pickRepPhotoAsDocument },
            { text: "فتح الإعدادات", onPress: () => Linking.openSettings() },
            { text: "إلغاء", style: "cancel" },
          ],
        );
      } else {
        Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول إلى المعرض أو اختر ملف الهوية من الجهاز");
      }
      return;
    }

    const mediaTypes = (ImagePicker as any).MediaTypeOptions?.Images ?? ["images"];
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.82,
      exif: false,
      base64: false,
    } as any);
    if (result.canceled || !result.assets?.[0]) return;
    const picked = result.assets[0];
    await setRepPhotoAsset({
      uri: picked.uri,
      name: picked.fileName || \`\${Date.now()}_rep_id.jpg\`,
      mimeType: picked.mimeType || "image/jpeg",
      source: "library",
    });
  };

  const takeRepPhotoWithCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("إذن الكاميرا مطلوب", "اسمح للتطبيق باستخدام الكاميرا لتصوير الهوية، أو اختر صورة/ملفاً من الجهاز.");
      return;
    }
    const mediaTypes = (ImagePicker as any).MediaTypeOptions?.Images ?? ["images"];
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes,
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.82,
      exif: false,
      base64: false,
    } as any);
    if (result.canceled || !result.assets?.[0]) return;
    const picked = result.assets[0];
    await setRepPhotoAsset({
      uri: picked.uri,
      name: picked.fileName || \`\${Date.now()}_rep_id.jpg\`,
      mimeType: picked.mimeType || "image/jpeg",
      source: "camera",
    });
  };

  const pickRepPhotoAsDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const picked = result.assets[0];
    await setRepPhotoAsset({
      uri: picked.uri,
      name: picked.name || \`\${Date.now()}_rep_id.jpg\`,
      mimeType: picked.mimeType || null,
      source: "document",
    });
  };

  const pickRepPhoto = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      await pickRepPhotoAsDocument();
      return;
    }

    Alert.alert(
      "إرفاق الهوية",
      "اختر الطريقة المناسبة. إذا فشل الرفع بسبب الشبكة سيظل بإمكانك إرسال الطلب للمراجعة.",
      [
        { text: "المعرض", onPress: pickRepPhotoFromLibrary },
        { text: "الكاميرا", onPress: takeRepPhotoWithCamera },
        { text: "ملف / PDF", onPress: pickRepPhotoAsDocument },
        { text: "إلغاء", style: "cancel" },
      ],
    );
  };

  // التحقق من حالة الطلب`;

if (!src.includes('const pickRepPhotoAsDocument = async () =>')) {
  replaceRegex(/  \/\/ رفع صورة هوية الممثل[\s\S]*?\n\n  \/\/ التحقق من حالة الطلب/, robustBlock, 'robust identity picker block');
}

src = src.replace(
`      if (!repPhotoUri && !repPhotoUrl) {
        return Alert.alert("تنبيه", "يرجى إرفاق صورة هوية الممثل الرسمي");
      }`,
`      if (!repPhotoUri && !repPhotoUrl) {
        setRepPhotoUploadFailed(true);
        setRepPhotoUploadError("لم يتم إرفاق الهوية بعد؛ يمكنك المتابعة وسيُصنّف الطلب كمراجعة هوية يدوية.");
      }`,
);

if (!src.includes('pending_manual_review')) {
  replaceRegex(
    /    \/\/ إعادة محاولة رفع صورة الهوية إذا فشلت سابقاً[\s\S]*?\n    }\n\n    try \{/,
`    // إعادة محاولة رفع الهوية. عند فشل الشبكة لا نسقط الطلب؛ نرسله للمراجعة اليدوية.
    let finalRepPhotoUrl = repPhotoUrl;
    let identityUploadStatus: "uploaded" | "pending_manual_review" = finalRepPhotoUrl ? "uploaded" : "pending_manual_review";
    if (!finalRepPhotoUrl && repPhotoUri) {
      finalRepPhotoUrl = await doUploadRepPhoto({
        uri: repPhotoUri,
        name: repPhotoFileName || \`\${Date.now()}_rep_id.jpg\`,
        mimeType: repPhotoMimeType,
        source: "library",
      });
      identityUploadStatus = finalRepPhotoUrl ? "uploaded" : "pending_manual_review";
    }
    if (!finalRepPhotoUrl) {
      finalRepPhotoUrl = REP_PHOTO_PENDING_URL;
      identityUploadStatus = "pending_manual_review";
    }

    try {`,
    'submit upload fallback block',
  );
}

src = src.replace(
`          rep_email: repEmail.trim() || undefined,
          rep_photo_url: finalRepPhotoUrl || undefined,
        }),`,
`          rep_email: repEmail.trim() || undefined,
          rep_photo_url: finalRepPhotoUrl,
          rep_photo_upload_status: identityUploadStatus,
          rep_photo_upload_note: identityUploadStatus === "pending_manual_review"
            ? "تعذر رفع صورة الهوية من جهاز المستخدم؛ يُرجى مراجعة الطلب والتواصل مع الممثل لإرسال الهوية عبر واتساب أو إعادة الرفع."
            : undefined,
        }),`,
);

src = src.replace(
`                            ? "فشل الرفع"
                            : "✓ تم رفع الصورة"`,
`                            ? "تعذّر الرفع — سيُراجع يدوياً"
                            : repPhotoUrl ? "✓ تم رفع الهوية" : "تم اختيار الهوية"`,
);

src = src.replace(
`                      {repPhotoUploadFailed && !repPhotoUploading && (
                        <TouchableOpacity
                          style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}
                          onPress={(e) => { e.stopPropagation?.(); doUploadRepPhoto(repPhotoUri!); }}
                        >
                          <Ionicons name="refresh" size={14} color={Colors.primary} />
                          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primary }}>إعادة الرفع</Text>
                        </TouchableOpacity>
                      )}`,
`                      {repPhotoUploadFailed && !repPhotoUploading && (
                        <View style={{ marginTop: 2, gap: 4 }}>
                          <TouchableOpacity
                            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                            onPress={(e) => { e.stopPropagation?.(); doUploadRepPhoto(repPhotoUri!); }}
                          >
                            <Ionicons name="refresh" size={14} color={Colors.primary} />
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primary }}>إعادة الرفع</Text>
                          </TouchableOpacity>
                          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "right" }}>
                            {repPhotoUploadError || "يمكنك المتابعة وسيُراجع فريق الإدارة الهوية يدوياً."}
                          </Text>
                        </View>
                      )}`,
);

src = src.replace(
`                ⚠ الصورة مشفّرة ومحمية — تُستخدم للتحقق من الهوية فقط ولا تُنشر علناً`,
`                ⚠ الهوية تُستخدم للتحقق فقط. إذا تعذر الرفع بسبب الشبكة سيكتمل الطلب كمراجعة هوية يدوية.`
);

if (src !== before) {
  writeFileSync(file, src);
  console.log('[fix-org-join-id-upload] organization join identity upload patched.');
} else {
  console.log('[fix-org-join-id-upload] organization join identity upload already clean.');
}
