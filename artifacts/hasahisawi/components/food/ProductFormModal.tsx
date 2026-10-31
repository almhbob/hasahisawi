import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Pressable, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Switch, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { uploadFile } from "@/lib/firebase/storage";
import { foodApi, CAT_META, CAT_KEYS, type FoodCat, type FoodProduct } from "@/lib/food-api";
import RtlScrollRow from "@/components/ui/RtlScrollRow";

type Props = { visible: boolean; businessId: number; initial?: FoodProduct | null; token: string | null | undefined; onClose: () => void; onSaved: (p: FoodProduct) => void; onDeleted?: (id: number) => void };

function notify(t: string, m?: string) { if (Platform.OS === "web") (globalThis as any).alert?.(m ? `${t}\n${m}` : t); else Alert.alert(t, m); }

export default function ProductFormModal({ visible, businessId, initial, token, onClose, onSaved, onDeleted }: Props) {
  const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [cost, setCost] = useState("");
  const [stock, setStock] = useState(""); const [prep, setPrep] = useState(""); const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<FoodCat>("meals"); const [avail, setAvail] = useState(true);
  const [images, setImages] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initial?.name || ""); setPrice(initial ? String(initial.price) : ""); setCost(initial?.cost ? String(initial.cost) : "");
    setStock(initial?.stock != null ? String(initial.stock) : ""); setPrep(initial?.prep_minutes ? String(initial.prep_minutes) : "");
    setDesc(initial?.description || ""); setCat(initial?.category || "meals"); setAvail(initial ? initial.is_available : true);
    setImages((initial?.images || []).map((i) => i.image_url));
  }, [visible, initial]);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return notify("نحتاج إذن الصور");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 5 - images.length, quality: 0.8 });
    if (r.canceled) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const a of r.assets.slice(0, 5 - images.length)) urls.push(await uploadFile(`food/items/${businessId}_${Date.now()}_${urls.length}.jpg`, a.uri));
      setImages((p) => [...p, ...urls].slice(0, 5));
    } catch (e: any) { notify("تعذّر رفع الصورة", e?.message); } finally { setUploading(false); }
  };

  const save = async () => {
    if (name.trim().length < 2) return notify("اسم الصنف مطلوب");
    if (!(Number(price) > 0)) return notify("السعر مطلوب");
    setBusy(true);
    const body = { business_id: businessId, name, price: Number(price), cost: Number(cost || 0), stock: stock === "" ? null : Number(stock), prep_minutes: Number(prep || 10), description: desc, category: cat, is_available: avail, images };
    try {
      const r = initial ? await foodApi.updateProduct(token, initial.id, body) : await foodApi.createProduct(token, body);
      onSaved(r.product); onClose();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };

  const remove = () => {
    if (!initial) return;
    const go = async () => { try { await foodApi.deleteProduct(token, initial.id); onDeleted?.(initial.id); onClose(); } catch (e: any) { notify("تعذّر الحذف", e?.message); } };
    if (Platform.OS === "web") { if ((globalThis as any).confirm?.("حذف الصنف؟")) go(); return; }
    Alert.alert("حذف الصنف", `حذف «${initial.name}» من المنيو؟`, [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: go }]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={st.backdrop} onPress={onClose}>
          <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={st.title}>{initial ? "تعديل الصنف" : "صنف جديد"}</Text>
              <RtlScrollRow contentContainerStyle={{ gap: 8 }}>
                {images.map((u, i) => (
                  <View key={u + i}>
                    <Image source={{ uri: u }} style={st.thumb} />
                    <TouchableOpacity onPress={() => setImages((p) => p.filter((_, j) => j !== i))} style={st.thumbX} accessibilityLabel="حذف الصورة"><Ionicons name="close" size={14} color="#fff" /></TouchableOpacity>
                  </View>
                ))}
                {images.length < 5 ? (
                  <TouchableOpacity onPress={pick} style={[st.thumb, st.addThumb]}>
                    {uploading ? <ActivityIndicator color={Colors.primary} /> : <><Ionicons name="camera-outline" size={22} color={Colors.primary} /><Text style={st.addThumbTxt}>صورة</Text></>}
                  </TouchableOpacity>
                ) : null}
              </RtlScrollRow>
              <Text style={st.label}>اسم الصنف *</Text>
              <TextInput style={st.input} value={name} onChangeText={setName} textAlign="right" placeholder="مثال: فول بالجبنة" placeholderTextColor={Colors.textMuted} />
              <View style={st.row}>
                <View style={{ flex: 1 }}><Text style={st.label}>السعر (ج.س) *</Text><TextInput style={st.input} value={price} onChangeText={(t) => setPrice(t.replace(/[^\d.]/g, ""))} keyboardType="numeric" textAlign="right" placeholder="0" placeholderTextColor={Colors.textMuted} /></View>
                <View style={{ flex: 1 }}><Text style={st.label}>التكلفة (للأرباح)</Text><TextInput style={st.input} value={cost} onChangeText={(t) => setCost(t.replace(/[^\d.]/g, ""))} keyboardType="numeric" textAlign="right" placeholder="اختياري" placeholderTextColor={Colors.textMuted} /></View>
              </View>
              <View style={st.row}>
                <View style={{ flex: 1 }}><Text style={st.label}>الكمية المتاحة</Text><TextInput style={st.input} value={stock} onChangeText={(t) => setStock(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" textAlign="right" placeholder="فارغ = غير محدود" placeholderTextColor={Colors.textMuted} /></View>
                <View style={{ flex: 1 }}><Text style={st.label}>وقت التحضير (د)</Text><TextInput style={st.input} value={prep} onChangeText={(t) => setPrep(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" textAlign="right" placeholder="10" placeholderTextColor={Colors.textMuted} /></View>
              </View>
              <Text style={st.label}>القسم</Text>
              <View style={st.cats}>
                {CAT_KEYS.map((k) => (
                  <TouchableOpacity key={k} onPress={() => setCat(k)} style={[st.cat, cat === k && st.catOn]}><Text style={[st.catTxt, cat === k && { color: "#fff" }]}>{CAT_META[k].label}</Text></TouchableOpacity>
                ))}
              </View>
              <Text style={st.label}>الوصف</Text>
              <TextInput style={[st.input, { minHeight: 64, textAlignVertical: "top" }]} value={desc} onChangeText={setDesc} multiline textAlign="right" placeholder="المكوّنات، الحجم…" placeholderTextColor={Colors.textMuted} />
              <View style={st.toggle}>
                <Switch value={avail} onValueChange={setAvail} trackColor={{ true: Colors.primary + "88", false: Colors.divider }} thumbColor={avail ? Colors.primary : "#fff"} />
                <Text style={st.toggleTxt}>متاح للطلب</Text>
              </View>
              <TouchableOpacity disabled={busy || uploading} onPress={save} style={[st.save, (busy || uploading) && { opacity: 0.6 }]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}
                <Text style={st.saveTxt}>حفظ الصنف</Text>
              </TouchableOpacity>
              {initial ? <TouchableOpacity onPress={remove} style={{ alignSelf: "center", marginTop: 12 }}><Text style={st.del}>حذف الصنف</Text></TouchableOpacity> : null}
              <View style={{ height: 24 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: "92%" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right", marginBottom: 10 },
  thumb: { width: 76, height: 76, borderRadius: 14 },
  thumbX: { position: "absolute", top: 4, left: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  addThumb: { borderWidth: 1.5, borderStyle: "dashed", borderColor: Colors.primary + "66", alignItems: "center", justifyContent: "center", gap: 2 },
  addThumbTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primary },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginTop: 12, marginBottom: 5 },
  input: { backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)" },
  row: { flexDirection: "row-reverse", gap: 10 },
  cats: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  cat: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  catOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  toggle: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  toggleTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  save: { marginTop: 18, borderRadius: 14, paddingVertical: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary },
  saveTxt: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  del: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#B3261E" },
});
