// أدوات عضوية ديوان الكُتّاب: نموذج تعديل البيانات (طلب للعضو، تعديل مباشر للمشرف)،
// عارض البطاقة المكبّرة مع حفظها صورة، ونموذج طلب البطاقة المطبوعة.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Modal, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator, Platform, Share, useWindowDimensions, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { notify } from "@/lib/xplatform";
import { capturePoster } from "@/lib/poster-capture";
import { membersApi, EDIT_FIELDS, type Member, type PrintMeta } from "@/lib/lit-members";
import { WINE, GOLD, INK } from "@/lib/lit";

const toLatin = (v: string) => v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
const fmt = (n: number, cur: string) => `${Math.round(n).toLocaleString("ar-EG")} ${cur}`;

/* ─────────── ورقة سفلية موحّدة ─────────── */
function Sheet({ visible, onClose, title, sub, children, footer }: { visible: boolean; onClose: () => void; title: string; sub?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.grab} />
            <View style={s.head}>
              <View style={{ flex: 1 }}><Text style={s.title}>{title}</Text>{sub ? <Text style={s.sub}>{sub}</Text> : null}</View>
              <Pressable onPress={onClose} style={s.x} accessibilityLabel="إغلاق"><Ionicons name="close" size={20} color={INK} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
            {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>{footer}</View> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ─────────── تعديل البيانات ─────────── */
export function EditDataSheet({ visible, onClose, member, mode, token, onDone }: { visible: boolean; onClose: () => void; member: Member; mode: "request" | "admin"; token: string; onDone: () => void }) {
  const fields = useMemo(() => EDIT_FIELDS.filter((f) => !f.journalist || member.category === "journalist"), [member.category]);
  const initial = useMemo(() => Object.fromEntries(fields.map((f) => {
    const v: any = (member as any)[f.key];
    return [f.key, Array.isArray(v) ? v.join("، ") : v == null ? "" : String(v)];
  })), [member, fields]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setVals(initial); setNote(""); } }, [visible, initial]);
  const changed = fields.filter((f) => (vals[f.key] ?? "").trim() !== (initial[f.key] ?? "").trim());

  const submit = async () => {
    if (!changed.length) return notify("لا تعديلات", "غيّر حقلاً واحداً على الأقل.");
    const changes: Record<string, unknown> = {};
    for (const f of changed) {
      const raw = (vals[f.key] ?? "").trim();
      changes[f.key] = f.key === "genres" ? raw.split(/[،,]/).map((x) => x.trim()).filter(Boolean) : f.numeric ? toLatin(raw) : raw;
    }
    setBusy(true);
    try {
      if (mode === "admin") { await membersApi.adminEdit(token, member.id, changes); notify("تم", "حُدّثت بيانات العضو وأُشعر بذلك"); }
      else { const r = await membersApi.requestEdit(token, changes, note.trim() || undefined); notify("أُرسل الطلب", r.message); }
      onDone(); onClose();
    } catch (e: any) { notify("تعذّر", e?.message || ""); }
    finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} onClose={onClose}
      title={mode === "admin" ? `تعديل بيانات ${member.pen_name || member.full_name}` : "طلب تعديل بياناتي"}
      sub={mode === "admin" ? "تعديل مباشر من الإدارة — يُسجَّل ويُشعر العضو" : "تراجع الإدارة التعديل قبل ظهوره على بطاقتك"}
      footer={
        <Pressable onPress={submit} disabled={busy} style={[s.primary, { backgroundColor: WINE, opacity: busy ? 0.7 : 1 }]} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name={mode === "admin" ? "save" : "send"} size={17} color="#fff" />}
          <Text style={s.primaryT}>{mode === "admin" ? "حفظ التعديلات" : `إرسال الطلب${changed.length ? ` (${changed.length})` : ""}`}</Text>
        </Pressable>
      }>
      {fields.map((f) => {
        const isChanged = changed.includes(f);
        return (
          <View key={f.key} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
              <Text style={s.lbl}>{f.label}</Text>
              {isChanged ? <Text style={s.changed}>● معدّل</Text> : null}
            </View>
            <TextInput value={vals[f.key] ?? ""} onChangeText={(v) => setVals((x) => ({ ...x, [f.key]: v }))}
              multiline={f.multiline} keyboardType={f.numeric ? "number-pad" : f.key === "email" ? "email-address" : "default"} autoCapitalize={f.latin ? "words" : "none"}
              style={[s.input, f.multiline && { minHeight: 84, textAlignVertical: "top" }, isChanged && { borderColor: GOLD }]}
              textAlign={f.latin || f.numeric ? "left" : "right"} placeholderTextColor={Colors.textMuted} />
          </View>
        );
      })}
      {mode === "request" ? (
        <View style={{ gap: 4 }}>
          <Text style={s.lbl}>ملاحظة للإدارة (اختياري)</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="مثال: تغيّر اسمي الأدبي / تصحيح خطأ في الاسم" placeholderTextColor={Colors.textMuted} style={s.input} textAlign="right" />
        </View>
      ) : null}
    </Sheet>
  );
}

/* ─────────── البطاقة المكبّرة ─────────── */
export function CardViewer({ visible, onClose, render, onPrint, printLabel, name }: { visible: boolean; onClose: () => void; render: (w: number) => React.ReactNode; onPrint?: () => void; printLabel?: string; name: string }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const w = Math.min(landscape ? height * 1.35 : width - 24, 640);
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      if (Platform.OS === "web") {
        const { blob } = await capturePoster(ref as any, 1600);
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob!); a.download = `${name}-card.png`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } else {
        const { uri } = await capturePoster(ref as any, 1600, Math.round(1600 * 0.63));
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "حفظ البطاقة" });
        else await Share.share({ url: uri });
      }
    } catch (e: any) { if (!/cancel|abort/i.test(String(e?.message || ""))) notify("تعذّر حفظ الصورة", ""); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={["portrait", "landscape"]}>
      <View style={[s.viewer, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16 }]}>
        <View style={{ flexDirection: "row-reverse", alignSelf: "stretch", paddingHorizontal: 16 }}>
          <Pressable onPress={onClose} style={s.vClose} accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color="#fff" /></Pressable>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <View ref={ref} collapsable={false} style={{ borderRadius: 18, overflow: "hidden" }}>{render(w)}</View>
          <Text style={s.vHint}>أدِر الهاتف أفقياً لعرض أكبر</Text>
        </View>
        <View style={s.vActions}>
          <Pressable onPress={save} disabled={busy} style={[s.vBtn, { backgroundColor: "rgba(255,255,255,0.14)" }]} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="download-outline" size={18} color="#fff" />}
            <Text style={s.vBtnT}>حفظ صورة عالية الدقة</Text>
          </Pressable>
          {onPrint ? (
            <Pressable onPress={onPrint} style={[s.vBtn, { backgroundColor: GOLD }]} accessibilityRole="button">
              <Ionicons name="print-outline" size={18} color="#2E2200" />
              <Text style={[s.vBtnT, { color: "#2E2200" }]}>{printLabel || "اطلب نسخة مطبوعة"}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/* ─────────── طلب البطاقة المطبوعة ─────────── */
export function PrintOrderSheet({ visible, onClose, token, member, meta, face, onDone }: { visible: boolean; onClose: () => void; token: string; member: Member; meta: PrintMeta; face: "local" | "intl"; onDone: () => void }) {
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState<"standard" | "large">("standard");
  const [delivery, setDelivery] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(member.phone || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setQty(1); setSize("standard"); setDelivery("pickup"); setAddress(""); setPhone(member.phone || ""); setNote(""); } }, [visible, member.phone]);
  const unit = size === "large" ? meta.price_large : meta.price_standard;
  const fee = delivery === "delivery" ? meta.delivery_fee : 0;
  const total = unit * qty + fee;
  const submit = async () => {
    setBusy(true);
    try {
      const r = await membersApi.printOrder(token, { qty, size, delivery, address: address.trim(), phone: toLatin(phone.trim()), note: note.trim(), face });
      notify("استلمنا طلبك", r.message); onDone(); onClose();
    } catch (e: any) { notify("تعذّر", e?.message || ""); }
    finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="بطاقة مطبوعة" sub="نسخة ورقية فاخرة من بطاقة عضويتك تُسلَّم لك يداً بيد"
      footer={
        <Pressable onPress={submit} disabled={busy} style={[s.primary, { backgroundColor: WINE, opacity: busy ? 0.7 : 1 }]} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="print" size={17} color="#fff" />}
          <Text style={s.primaryT}>تأكيد الطلب · {fmt(total, meta.currency)}</Text>
        </Pressable>
      }>
      <Text style={s.lbl}>المقاس</Text>
      <View style={{ gap: 8 }}>
        <Choice on={size === "standard"} onPress={() => setSize("standard")} title={meta.sizes?.standard || "مقاس البطاقة"} side={fmt(meta.price_standard, meta.currency)} />
        {meta.price_large > 0 ? <Choice on={size === "large"} onPress={() => setSize("large")} title={meta.sizes?.large || "مقاس كبير"} side={fmt(meta.price_large, meta.currency)} /> : null}
      </View>
      <View style={[s.row, { justifyContent: "space-between", marginTop: 6 }]}>
        <Text style={s.lbl}>عدد النسخ</Text>
        <View style={s.stepper}>
          <Pressable onPress={() => setQty((q) => Math.min(meta.max_qty, q + 1))} style={s.stepBtn} accessibilityLabel="زيادة"><Ionicons name="add" size={18} color="#fff" /></Pressable>
          <Text style={s.stepN}>{qty.toLocaleString("ar-EG")}</Text>
          <Pressable onPress={() => setQty((q) => Math.max(1, q - 1))} style={[s.stepBtn, { backgroundColor: Colors.bg }]} accessibilityLabel="إنقاص"><Ionicons name="remove" size={18} color={WINE} /></Pressable>
        </View>
      </View>
      <Text style={[s.lbl, { marginTop: 6 }]}>الاستلام</Text>
      <View style={{ gap: 8 }}>
        <Choice on={delivery === "pickup"} onPress={() => setDelivery("pickup")} title="استلام شخصي" side="مجاناً" hint={meta.pickup_note || undefined} />
        <Choice on={delivery === "delivery"} onPress={() => setDelivery("delivery")} title="توصيل" side={meta.delivery_fee ? fmt(meta.delivery_fee, meta.currency) : "مجاناً"} />
      </View>
      {delivery === "delivery" ? <TextInput value={address} onChangeText={setAddress} placeholder="عنوان التوصيل بالتفصيل" placeholderTextColor={Colors.textMuted} style={s.input} textAlign="right" /> : null}
      <TextInput value={phone} onChangeText={setPhone} placeholder="رقم للتواصل" placeholderTextColor={Colors.textMuted} style={s.input} keyboardType="phone-pad" textAlign="left" />
      <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة (اختياري)" placeholderTextColor={Colors.textMuted} style={s.input} textAlign="right" />
      <View style={s.summary}>
        <Line k={`${qty.toLocaleString("ar-EG")} × ${fmt(unit, meta.currency)}`} v={fmt(unit * qty, meta.currency)} />
        {fee ? <Line k="التوصيل" v={fmt(fee, meta.currency)} /> : null}
        <View style={{ height: 1, backgroundColor: Colors.divider, marginVertical: 4 }} />
        <Line k="الإجمالي" v={fmt(total, meta.currency)} bold />
        {meta.payment_note ? <Text style={s.payNote}><Ionicons name="wallet-outline" size={13} color={WINE} /> {meta.payment_note}</Text> : null}
      </View>
    </Sheet>
  );
}

function Choice({ on, onPress, title, side, hint }: { on: boolean; onPress: () => void; title: string; side: string; hint?: string }) {
  return (
    <Pressable onPress={onPress} style={[s.choice, on && { borderColor: WINE, backgroundColor: WINE + "0D" }]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
      <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={18} color={on ? WINE : Colors.textMuted} />
      <View style={{ flex: 1 }}><Text style={s.choiceT}>{title}</Text>{hint ? <Text style={s.sub}>{hint}</Text> : null}</View>
      <Text style={s.choiceSide}>{side}</Text>
    </Pressable>
  );
}
function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <View style={[s.row, { justifyContent: "space-between" }]}><Text style={[s.sub, bold && { color: INK, fontFamily: "Cairo_700Bold", fontSize: 14 }]}>{k}</Text><Text style={[s.lineV, bold && { fontSize: 15, color: WINE }]}>{v}</Text></View>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { maxHeight: "92%", backgroundColor: Colors.cardBg, borderTopLeftRadius: 26, borderTopRightRadius: 26, width: "100%", maxWidth: 620, alignSelf: "center" },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, alignSelf: "center", marginTop: 8 },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 16.5, color: INK, textAlign: "right" },
  sub: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  x: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  lbl: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  changed: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#8A6A00" },
  input: { backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary },
  primary: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 16 },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  viewer: { flex: 1, backgroundColor: "rgba(10,6,5,0.94)", alignItems: "center" },
  vClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  vHint: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 12 },
  vActions: { flexDirection: "row-reverse", gap: 10, paddingHorizontal: 16, width: "100%", maxWidth: 640 },
  vBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 16 },
  vBtnT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: "#fff" },
  row: { flexDirection: "row-reverse", alignItems: "center" },
  stepper: { flexDirection: "row-reverse", alignItems: "center", gap: 14, backgroundColor: WINE + "10", borderRadius: 14, padding: 4 },
  stepBtn: { width: 36, height: 34, borderRadius: 11, backgroundColor: WINE, alignItems: "center", justifyContent: "center" },
  stepN: { fontFamily: "Cairo_700Bold", fontSize: 16, color: INK, minWidth: 22, textAlign: "center" },
  choice: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.bg },
  choiceT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  choiceSide: { fontFamily: "Cairo_700Bold", fontSize: 13, color: WINE },
  summary: { marginTop: 6, padding: 12, borderRadius: 14, backgroundColor: GOLD + "12", borderWidth: 1, borderColor: GOLD + "40", gap: 4 },
  lineV: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  payNote: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: WINE, textAlign: "right", marginTop: 6 },
});
