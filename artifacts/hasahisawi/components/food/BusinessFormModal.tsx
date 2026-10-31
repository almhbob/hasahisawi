import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Pressable, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Switch, Alert } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { uploadFile } from "@/lib/firebase/storage";
import { foodApi, TYPE_META, type BizType, type FoodBusiness } from "@/lib/food-api";

type Props = { visible: boolean; initial?: FoodBusiness | null; token: string | null | undefined; onClose: () => void; onSaved: (b: FoodBusiness, msg?: string) => void };
type F = Partial<FoodBusiness> & { delivery_fee_s?: string; min_order_s?: string };

function notify(t: string, m?: string) { if (Platform.OS === "web") (globalThis as any).alert?.(m ? `${t}\n${m}` : t); else Alert.alert(t, m); }

function Field({ label, value, onChange, placeholder, keyboard, multiline, half }: { label: string; value?: string | null; onChange: (t: string) => void; placeholder?: string; keyboard?: any; multiline?: boolean; half?: boolean }) {
  return (
    <View style={half ? { flex: 1 } : undefined}>
      <Text style={st.label}>{label}</Text>
      <TextInput style={[st.input, multiline && { minHeight: 74, textAlignVertical: "top" }]} value={value ?? ""} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor={Colors.textMuted} keyboardType={keyboard} multiline={multiline} textAlign="right" />
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={st.toggle}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.primary + "88", false: Colors.divider }} thumbColor={value ? Colors.primary : "#fff"} />
      <Text style={st.toggleTxt}>{label}</Text>
    </View>
  );
}

export default function BusinessFormModal({ visible, initial, token, onClose, onSaved }: Props) {
  const [f, setF] = useState<F>({});
  const [saving, setSaving] = useState(false);
  const [up, setUp] = useState<"logo" | "cover" | null>(null);

  useEffect(() => {
    if (!visible) return;
    setF(initial ? { ...initial, delivery_fee_s: initial.delivery_fee ? String(initial.delivery_fee) : "", min_order_s: initial.min_order ? String(initial.min_order) : "" }
      : { business_type: "restaurant", delivery_enabled: true, takeaway_enabled: true, dine_in_enabled: true, accepting_orders: true });
  }, [visible, initial]);
  const set = (k: keyof F, v: any) => setF((p) => ({ ...p, [k]: v }));

  const pick = async (kind: "logo" | "cover") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return notify("نحتاج إذن الصور");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: kind === "logo" ? [1, 1] : [16, 9], quality: 0.8 });
    if (r.canceled || !r.assets?.[0]) return;
    setUp(kind);
    try { set(kind === "logo" ? "logo_url" : "cover_url", await uploadFile(`food/${kind}_${Date.now()}.jpg`, r.assets[0].uri)); }
    catch (e: any) { notify("تعذّر رفع الصورة", e?.message); } finally { setUp(null); }
  };

  const save = async () => {
    if (!f.name || f.name.trim().length < 2) return notify("اسم المطعم مطلوب");
    if (!f.phone?.trim() && !f.whatsapp?.trim()) return notify("رقم التواصل مطلوب", "أضف هاتفاً أو واتساب ليتواصل معك العملاء.");
    setSaving(true);
    const body: any = {
      name: f.name, business_type: f.business_type, phone: f.phone, whatsapp: f.whatsapp, district: f.district, address: f.address,
      description: f.description, opening_hours: f.opening_hours, prep_note: f.prep_note, logo_url: f.logo_url, cover_url: f.cover_url,
      delivery_enabled: f.delivery_enabled !== false, takeaway_enabled: f.takeaway_enabled !== false, dine_in_enabled: f.dine_in_enabled !== false,
      delivery_fee: Number(f.delivery_fee_s || 0), min_order: Number(f.min_order_s || 0), accepting_orders: f.accepting_orders !== false,
    };
    try {
      if (initial) { const r = await foodApi.updateBusiness(token, initial.id, body); onSaved(r.business, "تم حفظ التعديلات"); }
      else { const r = await foodApi.createBusiness(token, body); onSaved(r.business, r.message); }
      onClose();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setSaving(false); }
  };

  const accent = TYPE_META[(f.business_type as BizType) || "restaurant"].color;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={st.backdrop} onPress={onClose}>
          <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={st.handle} />
            <View style={st.head}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close" size={24} color={Colors.textMuted} /></TouchableOpacity>
              <Text style={st.title}>{initial ? "إعدادات المطعم" : "سجّل مطعمك"}</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {!initial ? <Text style={st.hint}>جهّز المنيو فور التسجيل، ويظهر مطعمك للجميع بعد موافقة الإدارة.</Text> : null}
              <TouchableOpacity activeOpacity={0.85} onPress={() => pick("cover")} style={[st.cover, { backgroundColor: accent + "22" }]}>
                {f.cover_url ? <Image source={{ uri: f.cover_url }} style={StyleSheet.absoluteFill} /> : (
                  <View style={st.coverEmpty}>{up === "cover" ? <ActivityIndicator color={accent} /> : <Ionicons name="image-outline" size={22} color={accent} />}<Text style={[st.coverTxt, { color: accent }]}>صورة الغلاف — واجهة المحل أو أشهر طبق</Text></View>
                )}
                <TouchableOpacity activeOpacity={0.85} onPress={() => pick("logo")} style={[st.logo, { backgroundColor: accent }]}>
                  {f.logo_url ? <Image source={{ uri: f.logo_url }} style={{ width: "100%", height: "100%" }} /> : up === "logo" ? <ActivityIndicator color="#fff" /> : <Ionicons name="camera" size={22} color="#fff" />}
                </TouchableOpacity>
              </TouchableOpacity>

              <Text style={st.label}>نوع المحل</Text>
              <View style={st.types}>
                {(Object.keys(TYPE_META) as BizType[]).map((k) => {
                  const on = f.business_type === k; const m = TYPE_META[k];
                  return (
                    <TouchableOpacity key={k} onPress={() => set("business_type", k)} style={[st.type, on && { backgroundColor: m.color, borderColor: m.color }]}>
                      <MaterialCommunityIcons name={m.icon as any} size={18} color={on ? "#fff" : m.color} />
                      <Text style={[st.typeTxt, on && { color: "#fff" }]}>{m.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Field label="اسم المطعم *" value={f.name} onChange={(t) => set("name", t)} placeholder="مثال: مطعم الضيافة" />
              <View style={st.row}>
                <Field half label="الهاتف" value={f.phone} onChange={(t) => set("phone", t)} placeholder="09xxxxxxxx" keyboard="phone-pad" />
                <Field half label="واتساب" value={f.whatsapp} onChange={(t) => set("whatsapp", t)} placeholder="09xxxxxxxx" keyboard="phone-pad" />
              </View>
              <View style={st.row}>
                <Field half label="الحي" value={f.district} onChange={(t) => set("district", t)} placeholder="السوق الكبير" />
                <Field half label="مواعيد العمل" value={f.opening_hours} onChange={(t) => set("opening_hours", t)} placeholder="8 ص — 11 م" />
              </View>
              <Field label="العنوان التفصيلي" value={f.address} onChange={(t) => set("address", t)} placeholder="الشارع / بجوار…" />
              <Field label="نبذة عن المطعم" value={f.description} onChange={(t) => set("description", t)} placeholder="أشهر الأطباق، الجلسات العائلية…" multiline />

              <Text style={st.section}>طرق الطلب</Text>
              <Toggle label="توصيل" value={f.delivery_enabled !== false} onChange={(v) => set("delivery_enabled", v)} />
              <Toggle label="استلام من المحل" value={f.takeaway_enabled !== false} onChange={(v) => set("takeaway_enabled", v)} />
              <Toggle label="طلب داخل المحل" value={f.dine_in_enabled !== false} onChange={(v) => set("dine_in_enabled", v)} />
              <View style={st.row}>
                {f.delivery_enabled !== false ? <Field half label="رسوم التوصيل (ج.س)" value={f.delivery_fee_s} onChange={(t) => set("delivery_fee_s", t.replace(/[^\d.]/g, ""))} placeholder="0" keyboard="numeric" /> : null}
                <Field half label="الحد الأدنى للطلب" value={f.min_order_s} onChange={(t) => set("min_order_s", t.replace(/[^\d.]/g, ""))} placeholder="0" keyboard="numeric" />
              </View>
              <Field label="ملاحظة للعملاء" value={f.prep_note} onChange={(t) => set("prep_note", t)} placeholder="التوصيل خلال 45 دقيقة داخل المدينة" />
              {initial ? <Toggle label="يستقبل الطلبات الآن" value={f.accepting_orders !== false} onChange={(v) => set("accepting_orders", v)} /> : null}

              <TouchableOpacity disabled={saving || !!up} onPress={save} style={[st.save, { backgroundColor: accent }, (saving || !!up) && { opacity: 0.6 }]}>
                {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name={initial ? "save-outline" : "send"} size={18} color="#fff" />}
                <Text style={st.saveTxt}>{initial ? "حفظ" : "تسجيل المطعم"}</Text>
              </TouchableOpacity>
              <View style={{ height: 30 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "94%", paddingHorizontal: 18, paddingTop: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 10 },
  head: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 10 },
  cover: { height: 130, borderRadius: 16, marginBottom: 30 },
  coverEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  coverTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  logo: { position: "absolute", bottom: -26, right: 16, width: 68, height: 68, borderRadius: 20, borderWidth: 3, borderColor: "#fff", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 6, marginTop: 12 },
  section: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", marginTop: 20, marginBottom: 4 },
  input: { backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)" },
  row: { flexDirection: "row-reverse", gap: 10 },
  types: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  type: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  typeTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  toggle: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  toggleTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  save: { marginTop: 22, borderRadius: 14, paddingVertical: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  saveTxt: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
