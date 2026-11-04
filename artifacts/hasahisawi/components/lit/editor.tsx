// أدوات التحرير الاحترافية في «ديوان الكُتّاب»: شريط تنسيق (غامق/مائل/تظليل/مشطوب/فاصل)،
// تراجع وإعادة، مسح التنسيق، تفضيلات العرض (محاذاة/حجم/تباعد)، عدّاد حيّ، وبطاقة المرفقات (ترجمة وصورة).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, Image, ActivityIndicator, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { notify } from "@/lib/xplatform";
import { uploadLibraryFile } from "@/lib/ithraa";
import { WINE, GOLD, INK } from "@/lib/lit";
import {
  stripMarkup, stripInline, TRANSLATION_LANGS, isLtrText, ALIGN_LABEL, SIZE_LABEL, SPACING_LABEL,
  type LitLayout, type LitAlign, type LitSize, type LitSpacing,
} from "@/lib/lit-markup";

type Sel = { start: number; end: number };
type Snap = { text: string; sel: Sel };

// ─── منطق التحرير: التحديد + سجل التراجع ──────────────────────
/**
 * يدير نص المتن مع التحديد وسجل تراجع/إعادة خاص.
 * onUserChange: تغيير من الكتابة (يمرّ على قياس الكتابة/اللصق في الشاشة)،
 * onToolChange: تغيير من الشريط (لا يُحتسب لصقاً ولا كتابة).
 */
export function useRichEditor(value: string, onUserChange: (t: string) => void, onToolChange: (t: string) => void) {
  const sel = useRef<Sel>({ start: value.length, end: value.length });
  const [forced, setForced] = useState<Sel | undefined>(undefined);
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const lastPush = useRef(0);
  const [, bump] = useState(0);
  const inputRef = useRef<TextInput>(null);

  const push = (text: string, force = false) => {
    const now = Date.now();
    // نجمع الكتابة المتتابعة في خطوة واحدة (كل ~0.8 ثانية)
    if (!force && now - lastPush.current < 800 && past.current.length) return;
    lastPush.current = now;
    past.current.push({ text, sel: { ...sel.current } });
    if (past.current.length > 100) past.current.shift();
    future.current = [];
  };

  const apply = (text: string, s: Sel) => {
    push(value, true);
    onToolChange(text);
    sel.current = s;
    setForced(s);
    bump((x) => x + 1);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onChangeText = (t: string) => {
    if (t !== value) push(value);
    setForced(undefined);
    onUserChange(t);
  };
  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    sel.current = e.nativeEvent.selection;
    if (forced) setForced(undefined);
  };

  /** يلفّ التحديد بعلامة (أو يزيلها إن كان ملفوفاً)؛ بلا تحديد يُدرج علامتين والمؤشر بينهما */
  const wrap = (mk: string) => {
    const { start, end } = sel.current;
    const s = Math.min(start, end), e = Math.max(start, end);
    if (s === e) {
      const ins = mk + mk;
      return apply(value.slice(0, s) + ins + value.slice(e), { start: s + mk.length, end: s + mk.length });
    }
    // إن كان التحديد ملفوفاً أصلاً: نزيل اللفّ
    if (value.slice(s - mk.length, s) === mk && value.slice(e, e + mk.length) === mk) {
      const t = value.slice(0, s - mk.length) + value.slice(s, e) + value.slice(e + mk.length);
      return apply(t, { start: s - mk.length, end: e - mk.length });
    }
    const chunk = value.slice(s, e);
    // العلامات تعمل داخل السطر: نلفّ كل سطر محدد على حدة، ونترك المسافات الطرفية خارجها
    const wrapped = chunk.split("\n").map((l) => {
      const m = l.match(/^(\s*)(.*?)(\s*)$/)!;
      return m[2] ? `${m[1]}${mk}${m[2]}${mk}${m[3]}` : l;
    }).join("\n");
    const single = !chunk.includes("\n") && chunk.trim() === chunk;
    apply(value.slice(0, s) + wrapped + value.slice(e), single ? { start: s + mk.length, end: e + mk.length } : { start: s, end: s + wrapped.length });
  };

  const separator = () => {
    const { end } = sel.current;
    const pre = value.slice(0, end), post = value.slice(end);
    const ins = `${pre && !pre.endsWith("\n") ? "\n" : ""}***${post.startsWith("\n") ? "" : "\n"}`;
    apply(pre + ins + post, { start: end + ins.length, end: end + ins.length });
  };

  const clear = () => {
    const { start, end } = sel.current;
    const s = Math.min(start, end), e = Math.max(start, end);
    if (s === e) { const t = stripInline(value); if (t !== value) apply(t, { start: t.length, end: t.length }); return; }
    const mid = stripInline(value.slice(s, e));
    apply(value.slice(0, s) + mid + value.slice(e), { start: s, end: s + mid.length });
  };

  const undo = () => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push({ text: value, sel: { ...sel.current } });
    onToolChange(p.text); sel.current = p.sel; setForced(p.sel); lastPush.current = 0; bump((x) => x + 1);
  };
  const redo = () => {
    const n = future.current.pop();
    if (!n) return;
    past.current.push({ text: value, sel: { ...sel.current } });
    onToolChange(n.text); sel.current = n.sel; setForced(n.sel); lastPush.current = 0; bump((x) => x + 1);
  };

  return {
    inputRef, selection: forced, onChangeText, onSelectionChange,
    wrap, separator, clear, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  };
}
export type RichEditor = ReturnType<typeof useRichEditor>;

// ─── أزرار الشريط ─────────────────────────────────────────────
type MCI = keyof typeof MaterialCommunityIcons.glyphMap;
function ToolBtn({ icon, label, onPress, disabled, on }: { icon: MCI; label: string; onPress: () => void; disabled?: boolean; on?: boolean }) {
  return (
    <Pressable
      onPress={onPress} disabled={disabled} hitSlop={4}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!on }}
      // الويب: نمنع سرقة التركيز من حقل النص حتى يبقى التحديد قائماً
      {...({ onMouseDown: (e: any) => e?.preventDefault?.() } as any)}
      style={({ pressed }) => [t.btn, on && t.btnOn, pressed && { backgroundColor: WINE + "1A" }, disabled && { opacity: 0.35 }]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={on ? "#fff" : INK} />
    </Pressable>
  );
}
const Sep = () => <View style={t.div} />;

/** عدّاد حيّ (أحرف/كلمات/أسطر) على النص الصافي مقارنة بحدود الجنس */
export function CounterChip({ body, min, max, lines }: { body: string; min?: number; max?: number; lines?: [number, number] }) {
  const plain = stripMarkup(body);
  const len = plain.length;
  const words = plain.split(/\s+/).filter(Boolean).length;
  const n = plain.split("\n").filter((l) => l.trim()).length;
  const over = (max != null && len > max) || (!!lines && n > lines[1]);
  const under = (min != null && len < min) || (!!lines && n < lines[0]);
  const color = over ? "#B42318" : under ? "#8A5A00" : "#0E6E4A";
  const label = `${len}${max ? ` / ${max}` : ""} حرف · ${words} كلمة${lines ? ` · ${n} سطر (${lines[0]}–${lines[1]})` : ""}`;
  return (
    <View style={[t.counter, { borderColor: color + "55", backgroundColor: color + "12" }]} accessibilityLabel={`العدّاد: ${label}${over ? "، تجاوز الحد" : under ? "، أقل من الحد الأدنى" : ""}`} accessibilityLiveRegion="polite">
      <Ionicons name={over ? "alert-circle" : under ? "time-outline" : "checkmark-circle"} size={14} color={color} />
      <Text style={[t.counterT, { color }]}>{label}</Text>
    </View>
  );
}

/** الشريط الثابت فوق حقل المتن */
export function EditorToolbar({ ed, layout, onLayout, counter }: { ed: RichEditor; layout: LitLayout; onLayout: (l: LitLayout) => void; counter: React.ReactNode }) {
  const [more, setMore] = useState(false);
  return (
    <View style={t.bar}>
      <View style={[t.row, { flexWrap: "wrap" }]} accessibilityRole="toolbar" accessibilityLabel="أدوات تنسيق النص">
          <ToolBtn icon="format-bold" label="غامق" onPress={() => ed.wrap("**")} />
          <ToolBtn icon="format-italic" label="مائل" onPress={() => ed.wrap("_")} />
          <ToolBtn icon="marker" label="تظليل" onPress={() => ed.wrap("==")} />
          <ToolBtn icon="format-strikethrough-variant" label="مشطوب" onPress={() => ed.wrap("~~")} />
          <ToolBtn icon="dots-horizontal" label="إدراج فاصل بين المقاطع" onPress={ed.separator} />
          <Sep />
          <ToolBtn icon="undo" label="تراجع" onPress={ed.undo} disabled={!ed.canUndo} />
          <ToolBtn icon="redo" label="إعادة" onPress={ed.redo} disabled={!ed.canRedo} />
          <ToolBtn icon="format-clear" label="مسح التنسيق" onPress={ed.clear} />
          <Sep />
          <ToolBtn icon="format-size" label={more ? "إخفاء تنسيق العرض" : "تنسيق العرض: المحاذاة والحجم والتباعد"} onPress={() => setMore((x) => !x)} on={more} />
      </View>
      {more && <LayoutControls value={layout} onChange={onLayout} />}
      <View style={{ marginTop: 6 }}>{counter}</View>
    </View>
  );
}

function Chip({ label, on, onPress, a11y }: { label: string; on: boolean; onPress: () => void; a11y: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: on }} hitSlop={6}
      style={[t.chip, on && { backgroundColor: WINE, borderColor: WINE }]}>
      <Text style={[t.chipT, on && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

/** تفضيلات العرض: المحاذاة والحجم والتباعد (الخط: «القاهرة» — الخط الوحيد المحمّل في التطبيق) */
export function LayoutControls({ value, onChange }: { value: LitLayout; onChange: (l: LitLayout) => void }) {
  const set = (k: keyof LitLayout, v: string) => onChange({ ...value, [k]: v });
  const ALIGN_ICON: Record<LitAlign, MCI> = { right: "format-align-right", center: "format-align-center", justify: "format-align-justify" };
  return (
    <View style={t.layout}>
      <View style={t.lrow}>
        <Text style={t.ll}>المحاذاة</Text>
        <View style={t.lopts}>
          {(Object.keys(ALIGN_LABEL) as LitAlign[]).map((k) => (
            <ToolBtn key={k} icon={ALIGN_ICON[k]} label={`محاذاة: ${ALIGN_LABEL[k]}`} on={(value.align ?? "right") === k} onPress={() => set("align", k)} />
          ))}
        </View>
      </View>
      <View style={t.lrow}>
        <Text style={t.ll}>حجم الخط</Text>
        <View style={t.lopts}>{(Object.keys(SIZE_LABEL) as LitSize[]).map((k) => <Chip key={k} label={SIZE_LABEL[k]} on={(value.size ?? "m") === k} onPress={() => set("size", k)} a11y={`حجم الخط: ${SIZE_LABEL[k]}`} />)}</View>
      </View>
      <View style={t.lrow}>
        <Text style={t.ll}>تباعد الأسطر</Text>
        <View style={t.lopts}>{(Object.keys(SPACING_LABEL) as LitSpacing[]).map((k) => <Chip key={k} label={SPACING_LABEL[k]} on={(value.spacing ?? "relaxed") === k} onPress={() => set("spacing", k)} a11y={`تباعد الأسطر: ${SPACING_LABEL[k]}`} />)}</View>
      </View>
      <Text style={t.note}>الخط: القاهرة · تُطبَّق هذه التفضيلات على صفحة القراءة.</Text>
    </View>
  );
}

// ─── المرفقات: ترجمة وصورة ───────────────────────────────────
export type AttachState = { translation: string; lang: string; by: string; imageUrl: string; caption: string };
export const emptyAttach = (): AttachState => ({ translation: "", lang: "en", by: "", imageUrl: "", caption: "" });
export const attachPayload = (a: AttachState) => ({
  translation: a.translation.trim() || undefined, translation_lang: a.translation.trim() ? a.lang : undefined,
  translation_by: a.translation.trim() ? a.by.trim() || undefined : undefined,
  image_url: a.imageUrl || undefined, image_caption: a.imageUrl ? a.caption.trim() || undefined : undefined,
});

/** صورة بنسبة أبعادها الأصلية */
export function RatioImage({ uri, maxRatio = 1.6, style, label }: { uri: string; maxRatio?: number; style?: any; label?: string }) {
  const [ratio, setRatio] = useState(4 / 3);
  useEffect(() => {
    let live = true;
    Image.getSize(uri, (w, h) => { if (live && w && h) setRatio(Math.max(1 / maxRatio, Math.min(2.2, w / h))); }, () => {});
    return () => { live = false; };
  }, [uri, maxRatio]);
  return <Image source={{ uri }} style={[{ width: "100%", aspectRatio: ratio, borderRadius: 14, backgroundColor: "#EFE5D2" }, style]} resizeMode="cover" accessibilityLabel={label || "صورة مرفقة بالنص"} />;
}

export function AttachmentsCard({ token, value, onChange, defaultBy, maxTranslation, initiallyOpen }: {
  token: string | null; value: AttachState; onChange: (a: AttachState) => void; defaultBy: string; maxTranslation?: number; initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!initiallyOpen || !!value.translation || !!value.imageUrl);
  const [showTr, setShowTr] = useState(!!value.translation);
  const [up, setUp] = useState<number | null>(null);
  const set = useCallback((p: Partial<AttachState>) => onChange({ ...value, ...p }), [value, onChange]);
  const ltr = isLtrText(value.lang, value.translation);
  const count = (value.translation.trim() ? 1 : 0) + (value.imageUrl ? 1 : 0);

  const pick = async () => {
    if (!token) return notify("سجّل الدخول", "سجّل الدخول لرفع صورة.");
    const r = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "image/webp"], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if ((a.size ?? 0) > 8 * 1024 * 1024) return notify("الصورة كبيرة", "الحد الأقصى 8 ميغابايت.");
    setUp(0);
    try { const url = await uploadLibraryFile(token, a, setUp); set({ imageUrl: url }); }
    catch (e: any) { notify("تعذّر رفع الصورة", e?.message || "حاول مرة أخرى"); }
    finally { setUp(null); }
  };

  return (
    <View style={t.att}>
      <Pressable onPress={() => setOpen((x) => !x)} style={t.attHead} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`مرفقات النص${count ? `، ${count} مرفق` : ""}`}>
        <Ionicons name="attach" size={20} color={WINE} />
        <View style={{ flex: 1 }}>
          <Text style={t.attTitle}>مرفقات النص{count ? ` (${count})` : ""}</Text>
          <Text style={t.attSub}>ترجمة إلى لغة أخرى أو صورة ترافق النص — اختيارية</Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={INK} />
      </Pressable>

      {open && (
        <View style={{ gap: 12, marginTop: 10 }}>
          {/* الصورة */}
          <View>
            <Text style={t.sec}>صورة مرفقة</Text>
            {value.imageUrl ? (
              <View style={{ gap: 8 }}>
                <RatioImage uri={value.imageUrl} />
                <View style={[t.rowR, { gap: 8 }]}>
                  <Pressable onPress={pick} style={t.ghost} accessibilityRole="button" accessibilityLabel="استبدال الصورة" disabled={up != null}>
                    <Ionicons name="swap-horizontal" size={16} color={INK} /><Text style={t.ghostT}>استبدال</Text>
                  </Pressable>
                  <Pressable onPress={() => set({ imageUrl: "", caption: "" })} style={[t.ghost, { borderColor: "#C0392B55" }]} accessibilityRole="button" accessibilityLabel="إزالة الصورة">
                    <Ionicons name="trash-outline" size={16} color="#B42318" /><Text style={[t.ghostT, { color: "#B42318" }]}>إزالة</Text>
                  </Pressable>
                  {up != null && <Text style={t.attSub}>جارٍ الرفع {up}%</Text>}
                </View>
                <TextInput value={value.caption} onChangeText={(caption) => set({ caption })} placeholder="تعليق على الصورة (اختياري)" placeholderTextColor="#8A7A6A" maxLength={200} style={t.in} accessibilityLabel="تعليق الصورة" />
              </View>
            ) : (
              <Pressable onPress={pick} disabled={up != null} style={t.drop} accessibilityRole="button" accessibilityLabel="إضافة صورة">
                {up != null ? <ActivityIndicator color={WINE} /> : <Ionicons name="image-outline" size={26} color={WINE} />}
                <Text style={t.dropT}>{up != null ? `جارٍ رفع الصورة ${up}%` : "إضافة صورة"}</Text>
                <Text style={t.attSub}>JPG أو PNG أو WebP حتى 8 ميغابايت · تخضع للمراجعة مع النص</Text>
              </Pressable>
            )}
          </View>

          {/* الترجمة */}
          <View>
            <View style={[t.rowR, { justifyContent: "space-between" }]}>
              <Text style={t.sec}>ترجمة النص</Text>
              {!showTr && (
                <Pressable onPress={() => { setShowTr(true); if (!value.by) set({ by: defaultBy }); }} style={t.ghost} accessibilityRole="button" accessibilityLabel="إضافة ترجمة">
                  <Ionicons name="language" size={16} color={WINE} /><Text style={[t.ghostT, { color: WINE }]}>إضافة ترجمة</Text>
                </Pressable>
              )}
            </View>
            {showTr && (
              <View style={{ gap: 8 }}>
                <Text style={t.attSub}>لغة الترجمة</Text>
                <View style={t.wrap}>
                  {TRANSLATION_LANGS.map((l) => <Chip key={l.key} label={l.label} on={value.lang === l.key} onPress={() => set({ lang: l.key })} a11y={`لغة الترجمة: ${l.label}`} />)}
                </View>
                <TextInput value={value.by} onChangeText={(by) => set({ by })} placeholder="اسم المترجم (افتراضياً: الكاتب)" placeholderTextColor="#8A7A6A" maxLength={120} style={t.in} accessibilityLabel="اسم المترجم" />
                <TextInput
                  value={value.translation} onChangeText={(translation) => set({ translation })} multiline textAlignVertical="top" scrollEnabled={false}
                  placeholder={ltr ? "Write the translation here…" : "اكتب الترجمة هنا…"} placeholderTextColor="#8A7A6A"
                  maxLength={maxTranslation} accessibilityLabel="نص الترجمة"
                  style={[t.in, t.trIn, ltr ? { textAlign: "left", writingDirection: "ltr" } : { textAlign: "right", writingDirection: "rtl" }]}
                />
                <View style={[t.rowR, { justifyContent: "space-between" }]}>
                  <Text style={t.attSub}>{value.translation.trim().length}{maxTranslation ? ` / ${maxTranslation}` : ""} حرف</Text>
                  <Pressable onPress={() => { setShowTr(false); set({ translation: "", by: "" }); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="حذف الترجمة" style={{ minHeight: 44, justifyContent: "center" }}>
                    <Text style={[t.ghostT, { color: "#B42318" }]}>حذف الترجمة</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const t = StyleSheet.create({
  bar: { backgroundColor: "#FFFDF8", borderBottomWidth: 1, borderBottomColor: "#E9DFCC", paddingHorizontal: 10, paddingVertical: 6 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 2 },
  rowR: { flexDirection: "row-reverse", alignItems: "center", flexWrap: "wrap" },
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  btn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnOn: { backgroundColor: WINE },
  div: { width: 1, height: 24, backgroundColor: "#E2D5BE", marginHorizontal: 4 },
  counter: { flexDirection: "row-reverse", alignItems: "center", gap: 5, alignSelf: "flex-end", borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  counterT: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  layout: { marginTop: 6, gap: 6, borderTopWidth: 1, borderTopColor: "#EFE5D2", paddingTop: 6 },
  lrow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  ll: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: INK, minWidth: 74, textAlign: "right" },
  lopts: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: { minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: "#E2D5BE", backgroundColor: "#fff" },
  chipT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: INK },
  note: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#6B5B4B", textAlign: "right" },
  att: { marginTop: 16, backgroundColor: "#FFFBF2", borderRadius: 16, borderWidth: 1, borderColor: GOLD + "55", padding: 12 },
  attHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 44 },
  attTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: INK, textAlign: "right" },
  attSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#6B5B4B", textAlign: "right", lineHeight: 19 },
  sec: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: WINE, textAlign: "right", marginBottom: 6 },
  drop: { alignItems: "center", gap: 4, borderWidth: 1.5, borderStyle: "dashed", borderColor: WINE + "55", borderRadius: 14, paddingVertical: 18, paddingHorizontal: 12, backgroundColor: "#fff" },
  dropT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: WINE },
  ghost: { flexDirection: "row-reverse", alignItems: "center", gap: 5, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E2D5BE", backgroundColor: "#fff" },
  ghostT: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: INK },
  in: { borderWidth: 1, borderColor: "#E2D5BE", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: INK, textAlign: "right" },
  trIn: { minHeight: 140, fontSize: 15, lineHeight: 26 },
});
