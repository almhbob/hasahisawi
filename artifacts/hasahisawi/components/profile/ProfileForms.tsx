// نماذج الملف الشخصي: تعديل البيانات المهنية، إضافة شهادة، وطلب التوثيق
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Modal, ScrollView, TextInput, Pressable, Switch,
  ActivityIndicator, Platform, Image, KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { uploadFile } from "@/lib/firebase/storage";
import { notify } from "@/lib/xplatform";
import { CERT_KINDS, Cert, CertKind, FullProfile, SOCIALS, profileApi } from "@/lib/profile-api";

// ── عناصر مشتركة ───────────────────────────────────────────────────
function Sheet({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[st.head, { paddingTop: Platform.OS === "android" ? insets.top + 8 : 14 }]}>
          <Pressable onPress={onClose} hitSlop={10} style={st.close}><Ionicons name="close" size={22} color={Colors.textPrimary} /></Pressable>
          <Text style={st.headTitle}>{title}</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder, max = 120, multiline, keyboard, icon, iconColor }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number; multiline?: boolean;
  keyboard?: "default" | "phone-pad" | "url" | "email-address"; icon?: string; iconColor?: string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={st.fieldHead}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
          {icon ? <Ionicons name={icon as any} size={15} color={iconColor || Colors.textSecondary} /> : null}
          <Text style={st.label}>{label}</Text>
        </View>
        {multiline ? <Text style={st.count}>{value.length}/{max}</Text> : null}
      </View>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.slice(0, max))}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSubtle}
        multiline={multiline}
        keyboardType={keyboard || "default"}
        autoCapitalize={keyboard === "url" ? "none" : "sentences"}
        style={[st.input, multiline && { minHeight: 96, textAlignVertical: "top" }]}
        textAlign="right"
      />
    </View>
  );
}

function SwitchRow({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={st.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={st.switchLabel}>{label}</Text>
        {sub ? <Text style={st.switchSub}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: Colors.divider, true: Colors.primary + "70" }} thumbColor={value ? Colors.primary : "#f4f4f4"} />
    </View>
  );
}

function PrimaryButton({ label, onPress, busy, icon = "checkmark" }: { label: string; onPress: () => void; busy?: boolean; icon?: string }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={[st.primary, busy && { opacity: 0.7 }]}>
      {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name={icon as any} size={18} color="#fff" />}
      <Text style={st.primaryText}>{label}</Text>
    </Pressable>
  );
}

// ── تعديل الملف ───────────────────────────────────────────────────
export function EditProfileModal({ visible, profile, token, onClose, onSaved }: {
  visible: boolean; profile: FullProfile; token: string; onClose: () => void; onSaved: (p: FullProfile, name: string) => void;
}) {
  const [f, setF] = useState({ name: "", headline: "", profession: "", neighborhood: "", bio: "" });
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [openToWork, setOpenToWork] = useState(false);
  const [showCerts, setShowCerts] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setF({ name: profile.name || "", headline: profile.headline || "", profession: profile.profession || "", neighborhood: profile.neighborhood || "", bio: profile.bio || "" });
    setSkills(profile.skills.map((s) => s.name));
    const l: Record<string, string> = {};
    for (const [k, v] of Object.entries(profile.social_links || {})) {
      l[k] = k === "whatsapp" ? String(v).replace("https://wa.me/", "+") : String(v);
    }
    setLinks(l);
    setOpenToWork(!!profile.open_to_work);
    setShowCerts(profile.show_certs !== false);
  }, [visible, profile]);

  const addSkill = () => {
    const parts = skillInput.split(/[،,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setSkills((p) => [...p, ...parts.filter((s) => !p.includes(s))].slice(0, 15));
    setSkillInput("");
  };

  const save = async () => {
    const name = f.name.trim();
    if (name.length < 2) { notify("الاسم مطلوب", "اكتب اسمك (حرفان على الأقل)"); return; }
    setBusy(true);
    try {
      const { getApiUrl } = await import("@/lib/query-client");
      if (name !== profile.name) {
        const r = await fetch(`${getApiUrl()}/api/auth/profile`, {
          method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, bio: f.bio.trim(), neighborhood: f.neighborhood.trim() }),
        });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "تعذّر حفظ الاسم"); }
      }
      const pending = skillInput.trim() ? [...skills, ...skillInput.split(/[،,]/).map((s) => s.trim()).filter(Boolean)] : skills;
      const p = await profileApi.update(token, {
        headline: f.headline, profession: f.profession, neighborhood: f.neighborhood, bio: f.bio,
        skills: pending.slice(0, 15), social_links: links, open_to_work: openToWork, show_certs: showCerts,
      });
      setSkillInput("");
      onSaved(p, name);
    } catch (e: any) { notify("تعذّر الحفظ", e?.message || "حاول مرة أخرى"); }
    finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} title="تعديل الملف الشخصي" onClose={onClose} footer={<PrimaryButton label="حفظ التغييرات" onPress={save} busy={busy} />}>
      <Text style={st.section}>الهوية</Text>
      <Field label="الاسم الكامل" value={f.name} max={60} onChange={(v) => setF({ ...f, name: v })} placeholder="اسمك كما تحب أن يظهر" />
      <Field label="العنوان المهني" value={f.headline} max={140} onChange={(v) => setF({ ...f, headline: v })} placeholder="مثال: مهندس مدني · 5 سنوات خبرة في الإنشاءات" />
      <Field label="المهنة / التخصص" value={f.profession} max={100} onChange={(v) => setF({ ...f, profession: v })} placeholder="مثال: محاسب، معلم، فني كهرباء" />
      <Field label="الحي" value={f.neighborhood} max={100} onChange={(v) => setF({ ...f, neighborhood: v })} placeholder="مثال: حي الشرقي" />
      <Field label="نبذة عنك" value={f.bio} max={600} multiline onChange={(v) => setF({ ...f, bio: v })} placeholder="من أنت، ماذا تعمل، وما الذي تقدّمه لمجتمعك…" />

      <Text style={st.section}>المهارات <Text style={st.sectionSub}>({skills.length}/15) — يزكّيها الآخرون</Text></Text>
      <View style={st.chips}>
        {skills.map((s) => (
          <Pressable key={s} onPress={() => setSkills((p) => p.filter((x) => x !== s))} style={st.skillChip}>
            <Text style={st.skillText}>{s}</Text>
            <Ionicons name="close" size={13} color={Colors.primaryDeep} />
          </Pressable>
        ))}
      </View>
      <View style={st.addRow}>
        <TextInput value={skillInput} onChangeText={setSkillInput} onSubmitEditing={addSkill} placeholder="أضف مهارة واضغط +" placeholderTextColor={Colors.textSubtle} style={[st.input, { flex: 1 }]} textAlign="right" returnKeyType="done" />
        <Pressable onPress={addSkill} style={st.addBtn}><Ionicons name="add" size={22} color="#fff" /></Pressable>
      </View>

      <Text style={st.section}>الظهور المهني</Text>
      <SwitchRow label="متاح للعمل" sub="تظهر شارة «متاح للعمل» لجهات التوظيف" value={openToWork} onChange={setOpenToWork} />
      <SwitchRow label="إظهار الشهادات للجميع" sub="عند الإيقاف لن يرى الشهاداتِ إلا أنت" value={showCerts} onChange={setShowCerts} />

      <Text style={st.section}>روابط التواصل الاجتماعي</Text>
      {SOCIALS.map((s) => (
        <Field key={s.key} label={s.label} icon={s.icon} iconColor={s.color} value={links[s.key] || ""} max={300}
          keyboard={s.key === "whatsapp" ? "phone-pad" : "url"} placeholder={s.hint}
          onChange={(v) => setLinks((l) => ({ ...l, [s.key]: v }))} />
      ))}
    </Sheet>
  );
}

// ── إضافة / تعديل شهادة ──────────────────────────────────────────
export function CertFormModal({ visible, token, cert, onClose, onSaved }: {
  visible: boolean; token: string; cert: Cert | null; onClose: () => void; onSaved: () => void;
}) {
  const [kind, setKind] = useState<CertKind>("course");
  const [f, setF] = useState({ title: "", issuer: "", issued_on: "", credential_id: "", credential_url: "" });
  const [file, setFile] = useState<{ url: string; type: "pdf" | "image"; name?: string } | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKind(cert?.kind || "course");
    setF({ title: cert?.title || "", issuer: cert?.issuer || "", issued_on: cert?.issued_on || "", credential_id: cert?.credential_id || "", credential_url: cert?.credential_url || "" });
    setFile(cert?.file_url ? { url: cert.file_url, type: cert.file_type || "image" } : null);
    setIsPublic(cert ? cert.is_public : true);
  }, [visible, cert]);

  const pickImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { notify("الإذن مطلوب", "اسمح بالوصول إلى الصور"); return; }
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    await upload(r.assets[0].uri, "image", r.assets[0].fileName || "certificate.jpg", r.assets[0].mimeType || "image/jpeg");
  };
  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 20 * 1024 * 1024) { notify("الملف كبير", "الحد الأقصى 20 ميجابايت"); return; }
    await upload(a.uri, "pdf", a.name || "certificate.pdf", "application/pdf");
  };
  const upload = async (uri: string, type: "pdf" | "image", name: string, mime: string) => {
    setUploading(true);
    try {
      const url = await uploadFile(`certificates/${Date.now()}_${name.replace(/[^\w.\-]/g, "_")}`, uri, { fileName: name, mimeType: mime });
      setFile({ url, type, name });
    } catch (e: any) { notify("تعذّر رفع الملف", e?.message || "حاول مجدداً"); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (f.title.trim().length < 2) { notify("اسم الشهادة مطلوب", "اكتب اسم الشهادة أو الخبرة"); return; }
    setBusy(true);
    try {
      const body = { kind, ...f, file_url: file?.url || null, file_type: file?.type || null, is_public: isPublic } as any;
      if (cert) await profileApi.editCert(token, cert.id, body); else await profileApi.addCert(token, body);
      onSaved();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message || "حاول مرة أخرى"); }
    finally { setBusy(false); }
  };

  const isExp = kind === "experience";
  return (
    <Sheet visible={visible} title={cert ? "تعديل الشهادة" : "إضافة شهادة أو خبرة"} onClose={onClose}
      footer={<PrimaryButton label={cert ? "حفظ التعديل" : "إضافة إلى ملفي"} onPress={save} busy={busy || uploading} />}>
      <Text style={st.section}>النوع</Text>
      <View style={st.chips}>
        {CERT_KINDS.map((k) => {
          const sel = k.key === kind;
          return (
            <Pressable key={k.key} onPress={() => setKind(k.key)} style={[st.kindChip, sel && { backgroundColor: k.color, borderColor: k.color }]}>
              <Ionicons name={k.icon as any} size={14} color={sel ? "#fff" : k.color} />
              <Text style={[st.kindText, sel && { color: "#fff" }]}>{k.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label={isExp ? "المسمى الوظيفي" : "اسم الشهادة"} value={f.title} max={200} onChange={(v) => setF({ ...f, title: v })} placeholder={isExp ? "مثال: محاسب أول" : "مثال: بكالوريوس هندسة مدنية"} />
      <Field label={isExp ? "جهة العمل" : "الجهة المانحة"} value={f.issuer} max={200} onChange={(v) => setF({ ...f, issuer: v })} placeholder={isExp ? "مثال: مصنع سكر الجنيد" : "مثال: جامعة الجزيرة"} />
      <Field label={isExp ? "الفترة" : "تاريخ الحصول"} value={f.issued_on} max={20} onChange={(v) => setF({ ...f, issued_on: v })} placeholder={isExp ? "2019 – 2024" : "2023"} />
      {!isExp && <Field label="رقم الشهادة (اختياري)" value={f.credential_id} max={120} onChange={(v) => setF({ ...f, credential_id: v })} placeholder="للتحقق من قبل جهة العمل" />}
      {!isExp && <Field label="رابط التحقق (اختياري)" value={f.credential_url} max={500} keyboard="url" onChange={(v) => setF({ ...f, credential_url: v })} placeholder="https://" />}

      <Text style={st.section}>المرفق</Text>
      {file ? (
        <View style={st.fileBox}>
          {file.type === "image" ? <Image source={{ uri: file.url }} style={st.fileThumb} /> : (
            <View style={[st.fileThumb, { alignItems: "center", justifyContent: "center", backgroundColor: "#FDECEC" }]}><Ionicons name="document" size={26} color="#C62828" /></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={st.fileName} numberOfLines={1}>{file.name || (file.type === "pdf" ? "ملف PDF" : "صورة الشهادة")}</Text>
            <Text style={st.switchSub}>تم الرفع ✓</Text>
          </View>
          <Pressable onPress={() => setFile(null)} hitSlop={8}><Ionicons name="trash-outline" size={20} color="#C62828" /></Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: "row-reverse", gap: 10 }}>
          <Pressable onPress={pickImage} disabled={uploading} style={st.attach}><Ionicons name="image-outline" size={20} color={Colors.primary} /><Text style={st.attachText}>صورة</Text></Pressable>
          <Pressable onPress={pickPdf} disabled={uploading} style={st.attach}><Ionicons name="document-attach-outline" size={20} color={Colors.primary} /><Text style={st.attachText}>ملف PDF</Text></Pressable>
          {uploading && <ActivityIndicator color={Colors.primary} />}
        </View>
      )}
      <View style={{ height: 12 }} />
      <SwitchRow label="ظاهرة في ملفي العام" sub="تراها جهات العمل في الملف المهني" value={isPublic} onChange={setIsPublic} />
    </Sheet>
  );
}

// ── طلب التوثيق ───────────────────────────────────────────────────
const VERIF_KINDS = [
  { key: "identity", label: "توثيق الهوية", sub: "بطاقة قومية أو جواز أو رخصة قيادة", icon: "person" },
  { key: "professional", label: "مهني", sub: "بطاقة نقابة أو شهادة مزاولة مهنة", icon: "briefcase" },
  { key: "business", label: "نشاط تجاري", sub: "سجل تجاري أو رخصة محل", icon: "storefront" },
  { key: "public_figure", label: "شخصية عامة", sub: "إعلامي، مسؤول، ناشط مجتمعي", icon: "megaphone" },
];

export function VerifyModal({ visible, token, onClose, onSent }: { visible: boolean; token: string; onClose: () => void; onSent: () => void }) {
  const [kind, setKind] = useState("identity");
  const [doc, setDoc] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setDoc(null); setNote(""); setKind("identity"); } }, [visible]);

  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (Platform.OS !== "web" && perm.status !== "granted") { notify("الإذن مطلوب", "اسمح بالوصول للمتابعة"); return; }
    const r = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    setUploading(true);
    try { setDoc(await uploadFile(`verification/${Date.now()}.jpg`, r.assets[0].uri, { fileName: "verification.jpg", mimeType: "image/jpeg" })); }
    catch (e: any) { notify("تعذّر الرفع", e?.message || "حاول مجدداً"); }
    finally { setUploading(false); }
  };

  const send = async () => {
    if (!doc) { notify("المرفق مطلوب", "أرفق صورة واضحة للمستند"); return; }
    setBusy(true);
    try { await profileApi.requestVerification(token, { doc_url: doc, kind, note }); onSent(); }
    catch (e: any) { notify("تعذّر الإرسال", e?.message || "حاول مرة أخرى"); }
    finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} title="طلب شارة «موثوق»" onClose={onClose} footer={<PrimaryButton label="إرسال الطلب" icon="shield-checkmark" onPress={send} busy={busy || uploading} />}>
      <View style={st.info}>
        <Ionicons name="shield-checkmark" size={22} color="#1D9BF0" />
        <Text style={st.infoText}>الشارة الزرقاء تُخبر الناس أن الحساب حقيقي وأن صاحبه تحقّقت منه إدارة حصاحيصاوي. تُراجع الطلبات خلال 48 ساعة، والمستند لا يظهر لأي أحد غير الإدارة.</Text>
      </View>
      <Text style={st.section}>نوع التوثيق</Text>
      {VERIF_KINDS.map((k) => {
        const sel = kind === k.key;
        return (
          <Pressable key={k.key} onPress={() => setKind(k.key)} style={[st.vk, sel && st.vkSel]}>
            <Ionicons name={sel ? "radio-button-on" : "radio-button-off"} size={20} color={sel ? Colors.primary : Colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={st.switchLabel}>{k.label}</Text>
              <Text style={st.switchSub}>{k.sub}</Text>
            </View>
            <Ionicons name={k.icon as any} size={18} color={sel ? Colors.primary : Colors.textMuted} />
          </Pressable>
        );
      })}
      <Text style={st.section}>صورة المستند</Text>
      {doc ? (
        <View style={st.fileBox}>
          <Image source={{ uri: doc }} style={st.fileThumb} />
          <Text style={[st.fileName, { flex: 1 }]}>تم إرفاق المستند ✓</Text>
          <Pressable onPress={() => setDoc(null)} hitSlop={8}><Ionicons name="trash-outline" size={20} color="#C62828" /></Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: "row-reverse", gap: 10 }}>
          {Platform.OS !== "web" && <Pressable onPress={() => pick(true)} style={st.attach}><Ionicons name="camera-outline" size={20} color={Colors.primary} /><Text style={st.attachText}>تصوير</Text></Pressable>}
          <Pressable onPress={() => pick(false)} style={st.attach}><Ionicons name="images-outline" size={20} color={Colors.primary} /><Text style={st.attachText}>من المعرض</Text></Pressable>
          {uploading && <ActivityIndicator color={Colors.primary} />}
        </View>
      )}
      <View style={{ height: 12 }} />
      <Field label="ملاحظة للإدارة (اختياري)" value={note} max={500} multiline onChange={setNote} placeholder="أي معلومة تساعد في التحقق" />
    </Sheet>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: Colors.border },
  close: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  headTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: Colors.border },
  section: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right", marginTop: 8, marginBottom: 8 },
  sectionSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  fieldHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  count: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSubtle },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 13, backgroundColor: "#fff", paddingHorizontal: 13, paddingVertical: Platform.OS === "web" ? 11 : 9, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8 },
  switchLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  switchSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  primary: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary, height: 50, borderRadius: 15 },
  primaryText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  skillChip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "35", paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20 },
  skillText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primaryDeep },
  addRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 6 },
  addBtn: { width: 46, height: 46, borderRadius: 13, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  kindChip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: "#fff" },
  kindText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  fileBox: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 10 },
  fileThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: Colors.bg },
  fileName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  attach: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 52, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: Colors.primary + "70", backgroundColor: Colors.primary + "08" },
  attachText: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.primary },
  info: { flexDirection: "row-reverse", gap: 10, backgroundColor: "#E8F4FD", borderRadius: 14, padding: 12, marginBottom: 6 },
  infoText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12.5, lineHeight: 21, color: "#0F4C75", textAlign: "right" },
  vk: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8 },
  vkSel: { borderColor: Colors.primary, backgroundColor: Colors.primary + "08" },
});
