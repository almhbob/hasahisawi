// مكوّنات قسم المنظمات: بطاقة التسجيل الموحّدة، بطاقة الفعالية، بطاقة الحملة،
// حالة الفراغ، ونموذج إضافة/تعديل فعالية أو حملة (لمسؤولي المنظمة).
// التخطيط: اتجاه التطبيق الأساسي LTR، لذلك الصفوف "row-reverse" والنص "right".
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, ActivityIndicator, Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import ViewCount from "@/components/ViewCount";
import {
  type OrgEvent, type OrgCampaign, formatEventDate, formatEventTime, formatAmount, openWhatsApp, arNum,
} from "@/lib/orgs-api";
import { typeCfg, SOLID, DANGER } from "./orgTheme";

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

// ══════════════ بطاقة التسجيل الموحّدة ══════════════
export function OrgJoinCard({ registered }: { registered: number | null }) {
  const router = useRouter();
  return (
    <View style={s.join} accessibilityRole="summary">
      <View style={s.joinHead}>
        <View style={s.joinIcon}>
          <MaterialCommunityIcons name="domain-plus" size={22} color={Colors.primaryDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.joinTitle}>سجّل مؤسستك في حصاحيصاوي</Text>
          <Text style={s.joinSub}>
            صفحة لمؤسستك تنشر فيها فعالياتها وحملاتها بعد مراجعة الإدارة.
            {registered ? ` المسجّل حالياً: ${arNum(registered)} ${registered === 1 ? "منظمة" : "منظمات"}.` : ""}
          </Text>
        </View>
      </View>
      <View style={s.joinActions}>
        <TouchableOpacity
          style={[s.joinBtn, s.joinBtnSolid]}
          onPress={() => router.push("/org-join" as never)}
          accessibilityRole="button"
          accessibilityLabel="تسجيل مؤسسة من داخل المدينة"
        >
          <Ionicons name="business-outline" size={16} color="#fff" />
          <Text style={[s.joinBtnText, { color: "#fff" }]} numberOfLines={1}>مؤسسة محلية</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.joinBtn, s.joinBtnGhost]}
          onPress={() => router.push("/external-partnership" as never)}
          accessibilityRole="button"
          accessibilityLabel="طلب شراكة لمؤسسة من خارج المدينة"
        >
          <Ionicons name="globe-outline" size={16} color={Colors.primaryDeep} />
          <Text style={[s.joinBtnText, { color: Colors.primaryDeep }]} numberOfLines={1}>شراكة من خارج المدينة</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ══════════════ حالة الفراغ ══════════════
export function EmptyState({ icon, title, body, actionLabel, onAction }: {
  icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; body: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><Ionicons name={icon} size={28} color={Colors.primaryDeep} /></View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity style={s.emptyBtn} onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={s.emptyBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ══════════════ إجراءات المسؤول (تعديل/حذف…) ══════════════
type ManageAction = { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; danger?: boolean };
function ManageBar({ actions }: { actions: ManageAction[] }) {
  return (
    <View style={s.manageBar}>
      {actions.map((a) => (
        <TouchableOpacity key={a.label} onPress={a.onPress} style={s.manageBtn} accessibilityRole="button" accessibilityLabel={a.label} hitSlop={HIT}>
          <Ionicons name={a.icon} size={15} color={a.danger ? DANGER : Colors.textSecondary} />
          <Text style={[s.manageText, a.danger && { color: DANGER }]}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ══════════════ بطاقة الفعالية ══════════════
export function EventCard({ ev, showOrg = true, manage }: { ev: OrgEvent; showOrg?: boolean; manage?: ManageAction[] }) {
  const router = useRouter();
  const cfg = typeCfg(ev.orgType);
  const d = new Date(ev.startsAt);
  const day = isNaN(d.getTime()) ? "" : arNum(d.getDate());
  let month = "";
  try { month = d.toLocaleDateString("ar-EG", { month: "short" }); } catch { /* ignore */ }
  const cancelled = ev.status === "cancelled";
  return (
    <View style={[s.card, cancelled && { opacity: 0.75 }]}>
      <View style={s.row}>
        <View style={[s.dateBox, { backgroundColor: cfg.soft }]} accessibilityLabel={formatEventDate(ev.startsAt)}>
          <Text style={[s.dateDay, { color: cfg.color }]}>{day}</Text>
          <Text style={[s.dateMonth, { color: cfg.color }]}>{month}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.cardTitle}>{ev.title}</Text>
          {showOrg && (
            <TouchableOpacity onPress={() => router.push(`/organization?id=${ev.orgId}` as never)} accessibilityRole="link" accessibilityLabel={`صفحة ${ev.orgName}`} hitSlop={HIT}>
              <Text style={[s.cardOrg, { color: cfg.color }]}>{ev.orgName}</Text>
            </TouchableOpacity>
          )}
          {cancelled && <Text style={s.cancelled}>أُلغيت هذه الفعالية</Text>}
        </View>
        <ViewCount kind="organization" id={`e-${ev.id}`} track />
      </View>
      <View style={{ gap: 4 }}>
        <Meta icon="calendar-outline" text={`${formatEventDate(ev.startsAt)}، الساعة ${formatEventTime(ev.startsAt)}`} />
        {!!ev.location && <Meta icon="location-outline" text={ev.location} />}
      </View>
      {!!ev.description && <Text style={s.cardDesc}>{ev.description}</Text>}
      {!!ev.orgPhone && !cancelled && !manage && (
        <TouchableOpacity
          style={s.outlineBtn}
          onPress={() => openWhatsApp(ev.orgPhone, `السلام عليكم، أرغب في المشاركة في فعالية «${ev.title}».`)}
          accessibilityRole="button"
          accessibilityLabel={`المشاركة في ${ev.title} عبر واتساب`}
        >
          <Ionicons name="logo-whatsapp" size={17} color={Colors.primaryDeep} />
          <Text style={s.outlineBtnText}>أرغب في المشاركة</Text>
        </TouchableOpacity>
      )}
      {manage && <ManageBar actions={manage} />}
    </View>
  );
}

function Meta({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }) {
  return (
    <View style={s.meta}>
      <Ionicons name={icon} size={14} color={Colors.textMuted} />
      <Text style={s.metaText}>{text}</Text>
    </View>
  );
}

// ══════════════ بطاقة الحملة ══════════════
export function CampaignCard({ c, showOrg = true, manage }: { c: OrgCampaign; showOrg?: boolean; manage?: ManageAction[] }) {
  const router = useRouter();
  const cfg = typeCfg(c.orgType);
  const pct = c.goal && c.goal > 0 ? Math.min(100, Math.round((c.raised / c.goal) * 100)) : null;
  const closed = c.status === "closed";
  return (
    <View style={[s.card, closed && { opacity: 0.8 }]}>
      <View style={s.row}>
        <View style={[s.campIcon, { backgroundColor: cfg.soft }]}>
          <MaterialCommunityIcons name="hand-heart" size={24} color={cfg.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.cardTitle}>{c.title}</Text>
          {showOrg && (
            <TouchableOpacity onPress={() => router.push(`/organization?id=${c.orgId}` as never)} accessibilityRole="link" accessibilityLabel={`صفحة ${c.orgName}`} hitSlop={HIT}>
              <Text style={[s.cardOrg, { color: cfg.color }]}>{c.orgName}</Text>
            </TouchableOpacity>
          )}
          {closed && <Text style={s.cancelled}>الحملة مغلقة</Text>}
        </View>
        <ViewCount kind="organization" id={`c-${c.id}`} track />
      </View>
      {!!c.description && <Text style={s.cardDesc}>{c.description}</Text>}

      {pct !== null && (
        <View style={{ gap: 6 }} accessibilityLabel={`جُمع ${pct} بالمئة من الهدف`}>
          <View style={s.progressTrack}><View style={[s.progressFill, { width: `${pct}%`, backgroundColor: cfg.color }]} /></View>
          <View style={s.amountRow}>
            <Text style={s.amountStrong}>{formatAmount(c.raised, c.currency)}</Text>
            <Text style={s.metaText}>من {formatAmount(c.goal!, c.currency)} ({arNum(pct)}٪)</Text>
          </View>
          <Text style={s.note}>المبالغ كما أعلنتها المنظمة</Text>
        </View>
      )}
      {c.endsAt && <Meta icon="time-outline" text={`تنتهي ${formatEventDate(c.endsAt)}`} />}

      {!!c.paymentInfo && (
        <View style={s.payBox}>
          <View style={s.meta}>
            <Ionicons name="wallet-outline" size={15} color={Colors.primaryDeep} />
            <Text style={s.payLabel}>طريقة التبرع</Text>
          </View>
          <Text style={s.payText} selectable>{c.paymentInfo}</Text>
        </View>
      )}
      {!!c.orgPhone && !closed && !manage && (
        <TouchableOpacity
          style={s.outlineBtn}
          onPress={() => openWhatsApp(c.orgPhone, `السلام عليكم، أستفسر عن التبرع لحملة «${c.title}».`)}
          accessibilityRole="button"
          accessibilityLabel={`استفسار عن التبرع لحملة ${c.title} عبر واتساب`}
        >
          <Ionicons name="logo-whatsapp" size={17} color={Colors.primaryDeep} />
          <Text style={s.outlineBtnText}>استفسر من المنظمة</Text>
        </TouchableOpacity>
      )}
      {manage && <ManageBar actions={manage} />}
    </View>
  );
}

// ══════════════ نموذج فعالية / حملة ══════════════
export type ActivityKind = "event" | "campaign";
type FormState = Record<string, string>;

const pad = (n: number) => String(n).padStart(2, "0");
function splitIso(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "", time: "" };
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
const toWestern = (v: string) => v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
function toIso(date: string, time: string): string | null | "invalid" {
  const d = toWestern(date.trim());
  if (!d) return null;
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(d)) return "invalid";
  const t = toWestern(time.trim()) || "00:00";
  if (!/^\d{1,2}:\d{2}$/.test(t)) return "invalid";
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const out = new Date(y, m - 1, dd, hh, mm);
  return isNaN(out.getTime()) ? "invalid" : out.toISOString();
}

export function ActivityFormModal({ visible, kind, initial, orgName, onClose, onSubmit }: {
  visible: boolean; kind: ActivityKind; orgName: string;
  initial?: OrgEvent | OrgCampaign | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [f, setF] = useState<FormState>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setErr("");
    if (kind === "event") {
      const ev = initial as OrgEvent | undefined;
      const st = splitIso(ev?.startsAt);
      setF({ title: ev?.title || "", description: ev?.description || "", date: st.date, time: st.time, location: ev?.location || "" });
    } else {
      const c = initial as OrgCampaign | undefined;
      setF({
        title: c?.title || "", description: c?.description || "",
        goal: c?.goal != null ? String(c.goal) : "", raised: c ? String(c.raised) : "",
        ends: splitIso(c?.endsAt).date, payment: c?.paymentInfo || "",
      });
    }
  }, [visible, kind, initial]);

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setErr("");
    if (!f.title?.trim()) return setErr("اكتب العنوان");
    let body: Record<string, unknown>;
    if (kind === "event") {
      const starts = toIso(f.date || "", f.time || "");
      if (!starts) return setErr("اكتب تاريخ الفعالية");
      if (starts === "invalid") return setErr("التاريخ بصيغة 2026-12-20 والوقت بصيغة 18:30");
      body = { title: f.title, description: f.description || "", starts_at: starts, location: f.location || "" };
    } else {
      if (!f.payment?.trim()) return setErr("اكتب طريقة التبرع: رقم الحساب البنكي أو المحفظة واسم صاحبها");
      const ends = toIso(f.ends || "", "23:59");
      if (ends === "invalid") return setErr("تاريخ الانتهاء بصيغة 2026-12-31");
      body = {
        title: f.title, description: f.description || "", payment_info: f.payment,
        goal_amount: toWestern(f.goal || "").trim() || null, ends_at: ends,
        ...(f.raised?.trim() ? { raised_amount: toWestern(f.raised).trim() } : {}),
      };
    }
    setBusy(true);
    try { await onSubmit(body); onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const editing = !!initial;
  const heading = kind === "event" ? (editing ? "تعديل الفعالية" : "فعالية جديدة") : (editing ? "تعديل الحملة" : "حملة تبرع جديدة");
  const fields: { k: string; label: string; ph: string; multiline?: boolean; kb?: "numeric" | "default" }[] = kind === "event"
    ? [
        { k: "title", label: "عنوان الفعالية *", ph: "مثال: يوم توزيع السلال الغذائية" },
        { k: "date", label: "التاريخ *", ph: "مثال: 2026-12-20" },
        { k: "time", label: "الوقت", ph: "مثال: 18:30" },
        { k: "location", label: "المكان", ph: "مثال: مقر الجمعية، حي السلام" },
        { k: "description", label: "التفاصيل", ph: "ما الذي سيحدث، ومن يمكنه المشاركة", multiline: true },
      ]
    : [
        { k: "title", label: "عنوان الحملة *", ph: "مثال: سلال الشتاء للأسر المتعففة" },
        { k: "description", label: "وصف الحملة", ph: "الغرض من الحملة وكيف تُصرف التبرعات", multiline: true },
        { k: "goal", label: "المبلغ المستهدف (جنيه)", ph: "اتركه فارغاً إن لم يكن محدداً", kb: "numeric" },
        ...(editing ? [{ k: "raised", label: "المبلغ المجموع حتى الآن (جنيه)", ph: "0", kb: "numeric" as const }] : []),
        { k: "ends", label: "تاريخ الانتهاء", ph: "مثال: 2026-12-31" },
        { k: "payment", label: "طريقة التبرع *", ph: "رقم الحساب البنكي أو المحفظة واسم صاحبه", multiline: true },
      ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalOverlay}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} accessibilityRole="button" accessibilityLabel="إغلاق" hitSlop={HIT}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{heading}</Text>
              <Text style={s.sheetSub}>{orgName}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {fields.map((fl) => (
              <View key={fl.k} style={{ gap: 6 }}>
                <Text style={s.fieldLabel}>{fl.label}</Text>
                <TextInput
                  style={[s.input, fl.multiline && { minHeight: 88, textAlignVertical: "top" }]}
                  value={f[fl.k] || ""}
                  onChangeText={set(fl.k)}
                  placeholder={fl.ph}
                  placeholderTextColor={Colors.textMuted}
                  multiline={fl.multiline}
                  keyboardType={fl.kb === "numeric" ? "numeric" : "default"}
                  textAlign="right"
                  accessibilityLabel={fl.label}
                />
              </View>
            ))}
            {kind === "campaign" && (
              <Text style={s.note}>التطبيق لا يستلم التبرعات. تظهر طريقة التبرع للمتبرعين كما كتبتها.</Text>
            )}
            {!!err && <Text style={s.err} accessibilityRole="alert">{err}</Text>}
            <TouchableOpacity style={[s.submit, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy} accessibilityRole="button" accessibilityLabel={editing ? "حفظ التعديلات" : "نشر"}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>{editing ? "حفظ التعديلات" : "نشر"}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  // بطاقة التسجيل
  join: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 12 },
  joinHead: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  joinIcon: { width: 44, height: 44, borderRadius: Colors.radius.md, backgroundColor: Colors.primarySoft, alignItems: "center", justifyContent: "center" },
  joinTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  joinSub: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 21, color: Colors.textSecondary, textAlign: "right" },
  joinActions: { flexDirection: "row-reverse", gap: 8 },
  joinBtn: { flex: 1, minHeight: 44, borderRadius: Colors.radius.md, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
  joinBtnSolid: { backgroundColor: SOLID },
  joinBtnGhost: { backgroundColor: Colors.primarySoft, borderWidth: 1, borderColor: Colors.borderGlow },
  joinBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, flexShrink: 1 },

  // فراغ
  empty: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 24, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.border },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "center" },
  emptyBody: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 22, color: Colors.textSecondary, textAlign: "center", marginTop: 4 },
  emptyBtn: { marginTop: 16, minHeight: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: SOLID, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  // بطاقة عامة
  card: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.border, ...Colors.shadow.card },
  row: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, lineHeight: 24, color: Colors.textPrimary, textAlign: "right" },
  cardOrg: { fontFamily: "Cairo_600SemiBold", fontSize: 13, textAlign: "right" },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 22, color: Colors.textSecondary, textAlign: "right" },
  cancelled: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: DANGER, textAlign: "right" },
  dateBox: { width: 52, height: 56, borderRadius: Colors.radius.md, alignItems: "center", justifyContent: "center" },
  dateDay: { fontFamily: "Cairo_700Bold", fontSize: 20, lineHeight: 26 },
  dateMonth: { fontFamily: "Cairo_600SemiBold", fontSize: 12, lineHeight: 16 },
  campIcon: { width: 48, height: 48, borderRadius: Colors.radius.md, alignItems: "center", justifyContent: "center" },
  meta: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  metaText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", flexShrink: 1 },
  outlineBtn: { minHeight: 44, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.borderGlow, backgroundColor: Colors.primarySoft, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  outlineBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primaryDeep },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.isDark ? "rgba(255,255,255,0.10)" : "rgba(26,44,37,0.08)", overflow: "hidden", flexDirection: "row-reverse" },
  progressFill: { height: 8, borderRadius: 4 },
  amountRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  amountStrong: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  note: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  payBox: { backgroundColor: Colors.bg, borderRadius: Colors.radius.md, padding: 12, gap: 6, borderWidth: 1, borderColor: Colors.border },
  payLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primaryDeep },
  payText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, lineHeight: 22, color: Colors.textPrimary, textAlign: "right" },
  manageBar: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 8 },
  manageBtn: { minHeight: 36, paddingHorizontal: 10, borderRadius: Colors.radius.sm, flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: Colors.bg },
  manageText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },

  // نموذج
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl, maxHeight: "90%" },
  sheetHead: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  sheetSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  input: { borderWidth: 1, borderColor: Colors.borderStrong, borderRadius: Colors.radius.md, backgroundColor: Colors.bg, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: DANGER, textAlign: "right" },
  submit: { minHeight: 48, borderRadius: Colors.radius.md, backgroundColor: SOLID, alignItems: "center", justifyContent: "center", marginTop: 4 },
  submitText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
