// عناصر قسم السفريات الموحّدة: بطاقات العروض والوكالات، شرائح الأنواع، الحالات، رفع الصور، ومنتقي التاريخ.
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator, TextInput, Modal, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import ViewCount from "@/components/ViewCount";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import { uploadLibraryFile } from "@/lib/ithraa";
import {
  TRV, TRV_DEEP, TRV_SOFT, SAND, SAND_INK, SAND_SOFT, OFFER_KINDS, REQUEST_STATUS, kindInfo, fmtPrice, fmtDate, routeLabel,
  type Offer, type Agency, type RequestStatus,
} from "@/lib/travel";

export const AGENCY_TYPE_LABEL: Record<string, string> = {
  local: "وكالة محلية", international: "وكالة دولية", hajj_umrah: "حج وعمرة", tourism: "سياحة", corporate: "سفر الأعمال",
};

// ─── شرائح ─────────────────────────────────────────────────────
export function Chip({ label, active, onPress, icon, count, color = TRV }: { label: string; active?: boolean; onPress: () => void; icon?: string; count?: number; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }} accessibilityLabel={label}
      style={({ pressed }) => [tv.chip, active && { backgroundColor: color, borderColor: color }, pressed && { opacity: 0.85 }]}>
      {!!icon && <MaterialCommunityIcons name={icon as any} size={16} color={active ? "#fff" : color} />}
      <Text style={[tv.chipT, active && { color: "#fff" }]}>{label}</Text>
      {count != null && count > 0 && <Text style={[tv.chipCount, active && { color: "#fff", backgroundColor: "rgba(255,255,255,0.22)" }]}>{count}</Text>}
    </Pressable>
  );
}

export function KindChips({ value, onChange, counts }: { value: string; onChange: (k: string) => void; counts?: Record<string, number> }) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  return (
    <RtlScrollRow contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 4 }}>
      <Chip label="الكل" icon="compass-outline" active={!value} onPress={() => onChange("")} count={total} />
      {OFFER_KINDS.map((k) => (
        <Chip key={k.key} label={k.label} icon={k.icon} active={value === k.key} onPress={() => onChange(k.key)} count={counts?.[k.key]} color={k.color} />
      ))}
    </RtlScrollRow>
  );
}

export function StatusPill({ status }: { status: RequestStatus }) {
  const s = REQUEST_STATUS[status] ?? REQUEST_STATUS.new;
  return (
    <View style={[tv.pill, { backgroundColor: s.color + "18" }]} accessibilityLabel={`الحالة: ${s.label}`}>
      <Ionicons name={s.icon as any} size={13} color={s.color} />
      <Text style={[tv.pillT, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

export function KindBadge({ kind, onImage }: { kind: string; onImage?: boolean }) {
  const k = kindInfo(kind);
  return (
    <View style={[tv.pill, { backgroundColor: onImage ? "rgba(7,59,76,0.86)" : k.color + "16" }]}>
      <MaterialCommunityIcons name={k.icon as any} size={13} color={onImage ? "#fff" : k.color} />
      <Text style={[tv.pillT, { color: onImage ? "#fff" : k.color }]}>{k.label}</Text>
    </View>
  );
}

function AgencyLogo({ uri, size = 30, name }: { uri?: string | null; size?: number; name?: string }) {
  return (
    <View style={[tv.logo, { width: size, height: size, borderRadius: size / 2 }]} accessibilityLabel={name ? `شعار ${name}` : undefined}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : <MaterialCommunityIcons name="airplane" size={size * 0.55} color={TRV} />}
    </View>
  );
}

// ─── بطاقة العرض ────────────────────────────────────────────────
export function OfferCard({ o, onPress, compact, style }: { o: Offer; onPress: () => void; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const k = kindInfo(o.kind);
  const price = fmtPrice(o);
  const route = routeLabel(o);
  const low = o.seats_left != null && o.seats_left <= 5;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${o.title} — ${o.agency_name}`}
      style={({ pressed }) => [tv.card, compact && { width: 260 }, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }, style]}>
      <View style={[tv.cover, compact && { height: 120 }]}>
        {o.images?.[0]
          ? <Image source={{ uri: o.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: k.color, alignItems: "center", justifyContent: "center" }]}>
              <MaterialCommunityIcons name={k.icon as any} size={46} color="rgba(255,255,255,0.55)" />
            </View>}
        <View style={tv.coverShade} />
        <View style={tv.coverTop}>
          <KindBadge kind={o.kind} onImage />
          {o.is_featured && (
            <View style={[tv.pill, { backgroundColor: SAND }]}>
              <Ionicons name="star" size={12} color={SAND_INK} />
              <Text style={[tv.pillT, { color: SAND_INK }]}>عرض مميز</Text>
            </View>
          )}
        </View>
        {!!o.depart_date && (
          <View style={tv.dateTag}>
            <Ionicons name="calendar-outline" size={13} color="#fff" />
            <Text style={tv.dateTagT}>{fmtDate(o.depart_date)}{o.return_date ? ` – ${fmtDate(o.return_date)}` : ""}</Text>
          </View>
        )}
      </View>
      <View style={{ padding: 12, gap: 6 }}>
        <Text style={tv.title} numberOfLines={2}>{o.title}</Text>
        {!!route && (
          <View style={tv.rowR}>
            <Ionicons name="location-outline" size={14} color={TRV} />
            <Text style={tv.meta} numberOfLines={1}>{route}</Text>
          </View>
        )}
        <View style={[tv.rowR, { gap: 10, flexWrap: "wrap" }]}>
          {!!o.duration_days && <View style={tv.rowR}><Ionicons name="time-outline" size={14} color={Colors.textMuted} /><Text style={tv.meta}>{o.duration_days} أيام</Text></View>}
          {o.seats_left != null && (
            <View style={tv.rowR}>
              <Ionicons name="people-outline" size={14} color={low ? Colors.danger : Colors.textMuted} />
              <Text style={[tv.meta, low && { color: Colors.danger, fontFamily: "Cairo_700Bold" }]}>{o.seats_left > 0 ? `${o.seats_left} مقعد متبقٍ` : "اكتملت المقاعد"}</Text>
            </View>
          )}
          <ViewCount kind="travel_offer" id={o.id} />
        </View>
        <View style={tv.cardFoot}>
          <View style={[tv.rowR, { flex: 1 }]}>
            <AgencyLogo uri={o.agency_logo} name={o.agency_name} size={26} />
            <Text style={tv.agencyName} numberOfLines={1}>{o.agency_name}</Text>
          </View>
          <View style={{ alignItems: "flex-start" }}>
            {price ? <Text style={tv.price}>{price}</Text> : <Text style={tv.priceAsk}>السعر عند الطلب</Text>}
            {!!price && !!o.price_note && !compact && <Text style={tv.priceNote} numberOfLines={1}>{o.price_note}</Text>}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── بطاقة الوكالة ──────────────────────────────────────────────
export function AgencyCard({ a, onPress }: { a: Agency; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a.name}
      style={({ pressed }) => [tv.agencyCard, pressed && { opacity: 0.92 }]}>
      <AgencyLogo uri={a.logo_url} size={54} name={a.name} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={[tv.rowR, { gap: 6 }]}>
          <Text style={[tv.title, { fontSize: 15, flexShrink: 1 }]} numberOfLines={1}>{a.name}</Text>
          {a.is_featured && <Ionicons name="checkmark-circle" size={16} color={TRV} accessibilityLabel="وكالة مميزة" />}
        </View>
        <Text style={tv.meta} numberOfLines={1}>{[AGENCY_TYPE_LABEL[a.agency_type] ?? "وكالة سفر", a.city].filter(Boolean).join(" · ")}</Text>
        <View style={[tv.rowR, { gap: 6, flexWrap: "wrap", marginTop: 2 }]}>
          <View style={[tv.pill, { backgroundColor: TRV_SOFT }]}>
            <MaterialCommunityIcons name="tag-outline" size={13} color={TRV} />
            <Text style={[tv.pillT, { color: TRV }]}>{a.offers_count ? `${a.offers_count} عرض متاح` : "لا عروض حالياً"}</Text>
          </View>
          {(a.services_offered || []).slice(0, 2).map((s) => (
            <View key={s} style={[tv.pill, { backgroundColor: SAND_SOFT }]}><Text style={[tv.pillT, { color: SAND_INK }]}>{s}</Text></View>
          ))}
        </View>
      </View>
      <Ionicons name="chevron-back" size={20} color={Colors.textMuted} />
    </Pressable>
  );
}

// ─── حالات فارغة وعناوين ─────────────────────────────────────────
export function EmptyState({ icon, title, hint, action, onAction }: { icon: string; title: string; hint?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={tv.empty}>
      <View style={tv.emptyIcon}><MaterialCommunityIcons name={icon as any} size={34} color={TRV} /></View>
      <Text style={tv.emptyT}>{title}</Text>
      {!!hint && <Text style={tv.emptyH}>{hint}</Text>}
      {!!action && <Pressable onPress={onAction} style={[tv.primary, { marginTop: 8, paddingHorizontal: 20 }]} accessibilityRole="button"><Text style={tv.primaryT}>{action}</Text></Pressable>}
    </View>
  );
}

export function SectionTitle({ title, action, onAction, icon }: { title: string; action?: string; onAction?: () => void; icon?: string }) {
  return (
    <View style={[tv.rowR, { justifyContent: "space-between", paddingHorizontal: 16, marginTop: 18, marginBottom: 10 }]}>
      <View style={tv.rowR}>
        {!!icon && <MaterialCommunityIcons name={icon as any} size={18} color={TRV} />}
        <Text style={tv.h}>{title}</Text>
      </View>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={action} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={tv.link}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── حقول النماذج ────────────────────────────────────────────────
export function Field({ label, value, onChange, multiline, keyboard, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; keyboard?: "numeric" | "phone-pad" | "email-address"; placeholder?: string; hint?: string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={tv.label}>{label}</Text>
      <TextInput style={[tv.input, multiline && { minHeight: 96, textAlignVertical: "top" }]} value={value} onChangeText={onChange} multiline={multiline}
        keyboardType={keyboard} placeholder={placeholder} placeholderTextColor={Colors.textMuted} accessibilityLabel={label} />
      {!!hint && <Text style={tv.fieldHint}>{hint}</Text>}
    </View>
  );
}

/** منتقي صور يرفع إلى التخزين السحابي ويعيد الروابط */
export function ImagesField({ value, onChange, max = 8, label }: { value: string[]; onChange: (v: string[]) => void; max?: number; label?: string }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const add = async () => {
    if (!token) return notify("سجّل الدخول", "سجّل الدخول لرفع الصور");
    const r = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "image/webp"], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 8 * 1024 * 1024) return notify("الصورة كبيرة", "اختر صورة أقل من 8 م.ب");
    setBusy("0%");
    try { const url = await uploadLibraryFile(token, a, (p) => setBusy(`${p}%`)); onChange([...value, url].slice(0, max)); }
    catch (e: any) { notify("تعذّر الرفع", e?.message); } finally { setBusy(null); }
  };
  return (
    <View style={{ marginBottom: 12 }}>
      {!!label && <Text style={tv.label}>{label}</Text>}
      <View style={[tv.rowR, { gap: 8, flexWrap: "wrap" }]}>
        {value.map((u, i) => (
          <View key={u + i} style={tv.thumb}>
            <Image source={{ uri: u }} style={StyleSheet.absoluteFill} />
            {i === 0 && max > 1 && <Text style={tv.thumbMain}>الغلاف</Text>}
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => onChange(value.filter((_, j) => j !== i))} style={tv.thumbDel} accessibilityLabel="حذف الصورة">
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {value.length < max && (
          <Pressable onPress={add} disabled={!!busy} style={[tv.thumb, tv.addThumb]} accessibilityRole="button" accessibilityLabel="إضافة صورة">
            {busy ? <><ActivityIndicator color={TRV} /><Text style={tv.meta}>{busy}</Text></> : <><Ionicons name="image-outline" size={22} color={TRV} /><Text style={tv.meta}>إضافة</Text></>}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAYS = ["س", "أ", "ن", "ث", "ر", "خ", "ج"]; // السبت أولاً
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** حقل تاريخ بتقويم شهري (يعمل على الويب والجوال دون مكتبات إضافية) */
export function DateField({ label, value, onChange, min }: { label: string; value: string; onChange: (v: string) => void; min?: string }) {
  const [open, setOpen] = useState(false);
  const base = value ? new Date(`${value}T12:00:00`) : min ? new Date(`${min}T12:00:00`) : new Date();
  const [cursor, setCursor] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const minIso = min || iso(new Date());
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const lead = (first.getDay() + 1) % 7; // الأسبوع يبدأ السبت
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  }, [cursor]);
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  return (
    <View style={{ marginBottom: 12, flex: 1 }}>
      <Text style={tv.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={[tv.input, tv.rowR, { justifyContent: "space-between" }]} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? fmtDate(value, true) : "غير محدد"}`}>
        <Text style={[tv.inputText, !value && { color: Colors.textMuted }]}>{value ? fmtDate(value, true) : "اختر التاريخ"}</Text>
        <Ionicons name="calendar-outline" size={18} color={TRV} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={tv.overlay} onPress={() => setOpen(false)} accessibilityLabel="إغلاق">
          <Pressable style={tv.calendar} onPress={() => {}}>
            <View style={[tv.rowR, { justifyContent: "space-between", marginBottom: 8 }]}>
              <Pressable onPress={() => shift(-1)} hitSlop={10} style={tv.calNav} accessibilityLabel="الشهر السابق"><Ionicons name="chevron-forward" size={20} color={TRV} /></Pressable>
              <Text style={tv.h}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</Text>
              <Pressable onPress={() => shift(1)} hitSlop={10} style={tv.calNav} accessibilityLabel="الشهر التالي"><Ionicons name="chevron-back" size={20} color={TRV} /></Pressable>
            </View>
            <View style={tv.calGrid}>
              {DAYS.map((d) => <Text key={d} style={tv.calHead}>{d}</Text>)}
              {cells.map((d, i) => {
                if (!d) return <View key={`e${i}`} style={tv.calCell} />;
                const v = iso(d); const disabled = v < minIso; const on = v === value;
                return (
                  <Pressable key={v} disabled={disabled} onPress={() => { onChange(v); setOpen(false); }} style={[tv.calCell, on && { backgroundColor: TRV }]} accessibilityLabel={fmtDate(v, true)}>
                    <Text style={[tv.calDay, disabled && { color: Colors.textMuted, opacity: 0.5 }, on && { color: "#fff" }]}>{d.getDate()}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={[tv.rowR, { gap: 8, marginTop: 10 }]}>
              {!!value && <Pressable onPress={() => { onChange(""); setOpen(false); }} style={[tv.ghost, { flex: 1 }]}><Text style={tv.ghostT}>مسح التاريخ</Text></Pressable>}
              <Pressable onPress={() => setOpen(false)} style={[tv.primary, { flex: 1 }]}><Text style={tv.primaryT}>إغلاق</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── الأنماط المشتركة ────────────────────────────────────────────
export const tv = StyleSheet.create({
  rowR: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  h: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13, color: TRV },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: Colors.text, textAlign: "right", lineHeight: 24 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 6 },
  fieldHint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 4 },
  input: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 12, paddingVertical: 11, minHeight: 46, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right" },
  inputText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right" },
  primary: { backgroundColor: TRV, borderRadius: Colors.radius.md, minHeight: 46, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 8 },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#fff" },
  ghost: { borderRadius: Colors.radius.md, minHeight: 46, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: TRV + "55", flexDirection: "row-reverse", gap: 6, backgroundColor: Colors.cardBg },
  ghostT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: TRV },

  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: Colors.radius.pill, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.cardBg },
  chipT: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text },
  chipCount: { fontFamily: "Cairo_700Bold", fontSize: 12, color: TRV, backgroundColor: TRV_SOFT, borderRadius: 10, paddingHorizontal: 6, minWidth: 20, textAlign: "center", overflow: "hidden" },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Colors.radius.pill, alignSelf: "flex-start" },
  pillT: { fontFamily: "Cairo_700Bold", fontSize: 12 },

  card: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: Colors.borderSubtle, ...Colors.shadow.card },
  cover: { height: 160, backgroundColor: TRV_DEEP },
  coverShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 60, backgroundColor: "rgba(7,59,76,0.35)" },
  coverTop: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row-reverse", justifyContent: "space-between" },
  dateTag: { position: "absolute", bottom: 10, right: 10, flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "rgba(7,59,76,0.86)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: Colors.radius.pill },
  dateTagT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  cardFoot: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, paddingTop: 10, marginTop: 4 },
  agencyName: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary, flexShrink: 1, textAlign: "right" },
  price: { fontFamily: "Cairo_700Bold", fontSize: 16, color: TRV },
  priceAsk: { fontFamily: "Cairo_700Bold", fontSize: 13, color: SAND_INK, backgroundColor: SAND_SOFT, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  priceNote: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, maxWidth: 150 },
  logo: { backgroundColor: TRV_SOFT, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: Colors.borderSubtle },

  agencyCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 12, borderWidth: 1, borderColor: Colors.borderSubtle, ...Colors.shadow.card },

  empty: { alignItems: "center", paddingVertical: 34, paddingHorizontal: 24, gap: 6 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: TRV_SOFT, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "center" },
  emptyH: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },

  thumb: { width: 84, height: 84, borderRadius: Colors.radius.md, overflow: "hidden", backgroundColor: TRV_SOFT },
  addThumb: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: TRV + "77", gap: 2 },
  thumbDel: { position: "absolute", top: 4, left: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  thumbMain: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(7,59,76,0.85)", color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 12, textAlign: "center" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 20 },
  calendar: { width: "100%", maxWidth: 360, backgroundColor: Colors.bg, borderRadius: Colors.radius.lg, padding: 16 },
  calNav: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: TRV_SOFT },
  calGrid: { flexDirection: "row-reverse", flexWrap: "wrap" },
  calHead: { width: `${100 / 7}%`, textAlign: "center", fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textMuted, paddingVertical: 4 },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  calDay: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text },
});

export { TRV, TRV_DEEP, SAND };
