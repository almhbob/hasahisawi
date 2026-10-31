import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Pressable,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator, Switch, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { uploadFile } from "@/lib/firebase/storage";
import { clubsApi, SPORT_META, SPORT_KEYS, clubInitials, type Club, type ClubSport } from "@/lib/sports-clubs-api";

const PALETTE = ["#0E9C64", "#0B7A4E", "#F0B400", "#C26D3D", "#2186C2", "#06325A", "#B3261E", "#111111"];

type Props = {
  visible: boolean;
  initial?: Club | null;
  token: string | null | undefined;
  userId?: number | string | null;
  onClose: () => void;
  onSaved: (club: Club, message?: string) => void;
};

function notify(title: string, msg?: string) {
  if (Platform.OS === "web") { (globalThis as any).alert?.(msg ? `${title}\n${msg}` : title); return; }
  Alert.alert(title, msg);
}

type FieldProps = { label: string; k: keyof Club; f: Partial<Club>; set: (k: keyof Club, v: any) => void; placeholder?: string; keyboard?: any; multiline?: boolean; half?: boolean };
// خارج المكوّن حتى لا يُعاد إنشاؤه مع كل حرف (كان سيُغلق لوحة المفاتيح)
function Field({ label, k, f, set, placeholder, keyboard, multiline, half }: FieldProps) {
  return (
    <View style={half ? { flex: 1 } : undefined}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        style={[st.input, multiline && { minHeight: 76, textAlignVertical: "top" }]}
        value={(f[k] as any) ?? ""}
        onChangeText={(t) => set(k, t)}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboard}
        multiline={multiline}
        textAlign="right"
      />
    </View>
  );
}

export default function ClubFormModal({ visible, initial, token, userId, onClose, onSaved }: Props) {
  const [f, setF] = useState<Partial<Club>>({ sport: "football", accepts_members: true });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);

  useEffect(() => {
    if (visible) setF(initial ? { ...initial } : { sport: "football", accepts_members: true, primary_color: PALETTE[0] });
  }, [visible, initial]);

  const set = <K extends keyof Club>(k: K, v: Club[K] | undefined) => setF((p) => ({ ...p, [k]: v }));

  const pickImage = async (kind: "logo" | "cover") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return notify("نحتاج إذن الصور", "اسمح للتطبيق بالوصول إلى الصور لاختيار الشعار.");
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: true, quality: 0.8,
      aspect: kind === "logo" ? [1, 1] : [16, 9],
    });
    if (r.canceled || !r.assets?.[0]) return;
    setUploading(kind);
    try {
      const url = await uploadFile(`clubs/${userId || "u"}/${kind}_${Date.now()}.jpg`, r.assets[0].uri);
      set(kind === "logo" ? "logo_url" : "cover_url", url);
    } catch (e: any) {
      notify("تعذّر رفع الصورة", e?.message || "حاول مرة أخرى");
    } finally { setUploading(null); }
  };

  const submit = async () => {
    if (!f.name || f.name.trim().length < 2) return notify("اسم النادي مطلوب");
    if (!f.district?.trim() && !f.address?.trim()) return notify("الموقع مطلوب", "اكتب الحي أو العنوان.");
    if (f.facebook && !/^https:\/\//i.test(f.facebook.trim())) return notify("رابط فيسبوك غير صالح", "يجب أن يبدأ بـ https://");
    setSaving(true);
    try {
      const body: Partial<Club> = { ...f };
      delete (body as any).id; delete (body as any).followers; delete (body as any).status; delete (body as any).verified;
      if (initial) {
        const r = await clubsApi.update(token, initial.id, body);
        onSaved(r.club, "تم حفظ التعديلات");
      } else {
        const r = await clubsApi.create(token, body);
        onSaved(r.club, r.message);
      }
      onClose();
    } catch (e: any) {
      notify("تعذّر الحفظ", e?.message);
    } finally { setSaving(false); }
  };

  const accent = f.primary_color || SPORT_META[(f.sport as ClubSport) || "football"].color;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={st.backdrop} onPress={onClose}>
          <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={st.handle} />
            <View style={st.headRow}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
              <Text style={st.title}>{initial ? "تعديل بيانات النادي" : "سجّل ناديك"}</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {!initial && <Text style={st.hint}>يظهر النادي للجميع بعد مراجعة الإدارة، وتديره أنت من حسابك.</Text>}

              {/* Cover + logo */}
              <TouchableOpacity activeOpacity={0.85} onPress={() => pickImage("cover")} style={[st.cover, { backgroundColor: accent + "22" }]}>
                {f.cover_url ? <Image source={{ uri: f.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
                  <View style={st.coverEmpty}>
                    {uploading === "cover" ? <ActivityIndicator color={accent} /> : <Ionicons name="image-outline" size={22} color={accent} />}
                    <Text style={[st.coverTxt, { color: accent }]}>صورة الغلاف (اختياري)</Text>
                  </View>
                )}
                <TouchableOpacity activeOpacity={0.85} onPress={() => pickImage("logo")} style={[st.logo, { borderColor: "#fff", backgroundColor: accent }]}>
                  {f.logo_url ? <Image source={{ uri: f.logo_url }} style={{ width: "100%", height: "100%" }} />
                    : uploading === "logo" ? <ActivityIndicator color="#fff" />
                    : <Text style={st.logoTxt}>{clubInitials(f.name || "نادي") || "+"}</Text>}
                  <View style={st.logoCam}><Ionicons name="camera" size={12} color="#fff" /></View>
                </TouchableOpacity>
              </TouchableOpacity>

              <Text style={st.label}>الرياضة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
                {SPORT_KEYS.map((k) => {
                  const m = SPORT_META[k]; const on = f.sport === k;
                  return (
                    <TouchableOpacity key={k} onPress={() => set("sport", k)} style={[st.chip, on && { backgroundColor: m.color, borderColor: m.color }]}>
                      <Ionicons name={m.icon as any} size={14} color={on ? "#fff" : m.color} />
                      <Text style={[st.chipTxt, on && { color: "#fff" }]}>{m.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Field f={f} set={set} label="اسم النادي *" k="name" placeholder="مثال: نادي الاتحاد الحصاحيصا" />
              <View style={st.row}>
                <Field f={f} set={set} half label="الاسم المختصر" k="short_name" placeholder="الاتحاد" />
                <Field f={f} set={set} half label="سنة التأسيس" k="founded" placeholder="1965" keyboard="number-pad" />
              </View>
              <Field f={f} set={set} label="الدوري / الدرجة" k="league" placeholder="الدوري المحلي — الدرجة الأولى" />

              <Text style={st.label}>لون النادي</Text>
              <View style={st.palette}>
                {PALETTE.map((c) => (
                  <TouchableOpacity key={c} onPress={() => set("primary_color", c)} style={[st.swatch, { backgroundColor: c }, f.primary_color === c && st.swatchOn]}>
                    {f.primary_color === c ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                  </TouchableOpacity>
                ))}
              </View>
              <Field f={f} set={set} label="ألوان القميص" k="colors" placeholder="أخضر وأبيض" />

              <Text style={st.section}>الموقع والتواصل</Text>
              <View style={st.row}>
                <Field f={f} set={set} half label="الحي *" k="district" placeholder="الحي" />
                <Field f={f} set={set} half label="الملعب" k="stadium" placeholder="ملعب الحصاحيصا" />
              </View>
              <Field f={f} set={set} label="العنوان" k="address" placeholder="الشارع / المعلم القريب" />
              <View style={st.row}>
                <Field f={f} set={set} half label="الهاتف" k="phone" placeholder="09xxxxxxxx" keyboard="phone-pad" />
                <Field f={f} set={set} half label="واتساب" k="whatsapp" placeholder="2499xxxxxxxx" keyboard="phone-pad" />
              </View>
              <Field f={f} set={set} label="صفحة فيسبوك" k="facebook" placeholder="https://facebook.com/..." keyboard="url" />

              <Text style={st.section}>الإدارة والتدريب</Text>
              <View style={st.row}>
                <Field f={f} set={set} half label="رئيس النادي" k="president" />
                <Field f={f} set={set} half label="المدرب" k="coach" />
              </View>
              <Field f={f} set={set} label="مواعيد التدريب" k="training_times" placeholder="السبت والثلاثاء — 4 مساءً" />
              <View style={st.switchRow}>
                <Switch value={f.accepts_members !== false} onValueChange={(v) => set("accepts_members", v)} trackColor={{ true: accent + "88", false: Colors.divider }} thumbColor={f.accepts_members !== false ? accent : "#fff"} />
                <Text style={st.switchTxt}>يستقبل طلبات انضمام لاعبين وأعضاء</Text>
              </View>
              {f.accepts_members !== false && <Field f={f} set={set} label="رسوم العضوية" k="membership_fee" placeholder="مجاناً / 5,000 ج.س شهرياً" />}

              <Text style={st.section}>عن النادي</Text>
              <Field f={f} set={set} label="نبذة" k="description" placeholder="تاريخ النادي ورؤيته..." multiline />
              <Field f={f} set={set} label="الإنجازات والبطولات" k="achievements" placeholder="كل إنجاز في سطر" multiline />

              <TouchableOpacity disabled={saving || !!uploading} onPress={submit} style={[st.save, { backgroundColor: accent }, (saving || !!uploading) && { opacity: 0.6 }]}>
                {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name={initial ? "save-outline" : "send"} size={18} color="#fff" />}
                <Text style={st.saveTxt}>{initial ? "حفظ التعديلات" : "إرسال للمراجعة"}</Text>
              </TouchableOpacity>
              <View style={{ height: 32 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "94%", paddingHorizontal: 18, paddingTop: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 10 },
  headRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 12 },
  cover: { height: 130, borderRadius: 16, overflow: "visible", marginBottom: 34 },
  coverEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  coverTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  logo: { position: "absolute", bottom: -28, right: 16, width: 72, height: 72, borderRadius: 20, borderWidth: 3, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  logoTxt: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff" },
  logoCam: { position: "absolute", bottom: 0, left: 0, right: 0, height: 20, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 6, marginTop: 12 },
  section: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", marginTop: 22 },
  input: { backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)" },
  row: { flexDirection: "row-reverse", gap: 10 },
  chips: { flexDirection: "row-reverse", gap: 8, paddingBottom: 2 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", backgroundColor: Colors.cardBg },
  chipTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary },
  palette: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  swatch: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 3, borderColor: "rgba(0,0,0,0.2)" },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  switchTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  save: { marginTop: 22, borderRadius: 14, paddingVertical: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  saveTxt: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
