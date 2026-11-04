// اختيار صورة من المعرض ورفعها (غلاف/شعار راعٍ/صورة مشاركة). يُرجع رابط https أو null عند الإلغاء.
import * as ImagePicker from "expo-image-picker";
import { uploadFile } from "@/lib/firebase/storage";

export async function pickAndUploadContestImage(folder: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("اسمح بالوصول إلى الصور لاختيار صورة.");
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, quality: 0.8, exif: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const url = await uploadFile(`contests/${folder}/${name}`, a.uri, { fileName: name, mimeType: a.mimeType || "image/jpeg" });
  if (!/^https:\/\//i.test(url)) throw new Error("تعذّر الحصول على رابط آمن للصورة.");
  return url;
}
