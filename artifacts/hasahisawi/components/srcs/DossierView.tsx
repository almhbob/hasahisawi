// عرض ملف العضو الكامل: البيانات، المستندات، الدورات والنتائج والشهادات، الأنشطة.
// يُستخدم في «ملفي» للعضو، وفي سجل الدفعات/الأعضاء للإدارة.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import UserAvatar from "@/components/UserAvatar";
import ZoomViewer from "@/components/srcs/ZoomViewer";
import { openExternal } from "@/lib/xplatform";
import { DOC_KIND_LABEL, ROLE_LABEL, SRCS_RED, type SrcsDoc, type SrcsDossier } from "@/lib/red-crescent";

const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }) : "—");
const isImage = (u: string) => /\.(jpe?g|png|webp|heic|gif)(\?|$)/i.test(u) || /image/i.test(u) || /\/pfile\//.test(u);
const STATUS: Record<string, [string, string]> = {
  active: ["نشط", "#16A34A"], pending: ["قيد المراجعة", "#B45309"], suspended: ["موقوف", "#B45309"], rejected: ["مرفوض", "#6B7280"], banned: ["محظور", "#B91C1C"],
};
export const CERT_STATUS: Record<string, [string, string]> = {
  none: ["—", "#6B7280"], pending: ["دفع قيد المراجعة", "#B45309"], issued: ["صادرة", "#16A34A"], rejected: ["مرفوض الدفع", "#B91C1C"], revoked: ["ملغاة", "#B91C1C"],
};

export default function DossierView({ data, admin, onVerifyDoc, onDeleteDoc, showSensitive = true }: {
  data: SrcsDossier; admin?: boolean; onVerifyDoc?: (doc: SrcsDoc, v: boolean) => void; onDeleteDoc?: (doc: SrcsDoc) => void; showSensitive?: boolean;
}) {
  const [view, setView] = useState<SrcsDoc | null>(null);
  const m = data.member;
  const st = m ? STATUS[m.status] ?? ["—", "#6B7280"] : null;
  return (
    <View style={{ gap: 12 }}>
      {m ? (
        <View style={s.card}>
          <View style={s.row}>
            <UserAvatar name={m.name || "؟"} avatarUrl={m.avatar_url ?? null} size={52} borderRadius={14} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name}>{m.name}</Text>
              <View style={s.row}>
                <View style={[s.pill, { backgroundColor: SRCS_RED + "15" }]}><Text style={[s.pillTxt, { color: SRCS_RED }]}>{ROLE_LABEL[m.role]}</Text></View>
                {st ? <View style={[s.pill, { backgroundColor: st[1] + "18" }]}><Text style={[s.pillTxt, { color: st[1] }]}>{st[0]}</Text></View> : null}
                {m.revoked_at ? <View style={[s.pill, { backgroundColor: "#B91C1C18" }]}><Text style={[s.pillTxt, { color: "#B91C1C" }]}>بطاقة ملغاة</Text></View> : null}
              </View>
            </View>
          </View>
          <View style={s.grid}>
            <Info k="الوحدة" v={m.unit} /><Info k="الجهة" v={m.affiliation} /><Info k="الدفعة" v={m.cohort_name} />
            <Info k="رقم البطاقة" v={m.card_no} ltr /><Info k="صالحة حتى" v={d(m.card_expires_at)} /><Info k="فصيلة الدم" v={m.blood_type} ltr />
            <Info k="الهاتف" v={m.phone || m.account_phone} ltr />{showSensitive ? <Info k="الرقم الوطني" v={m.national_id_no} ltr /> : null}
            <Info k="عضو منذ" v={d(m.created_at)} /><Info k="نقاط الأنشطة" v={String(data.points)} /><Info k="حضور الاجتماعات" v={`${data.meetings?.attended ?? 0} من ${data.meetings?.invited ?? 0}`} />
          </View>
          {m.revoke_reason ? <Text style={[s.meta, { color: "#B91C1C" }]}>سبب الإلغاء: {m.revoke_reason}</Text> : null}
          {m.experience ? <Text style={s.body}>الخبرة: {m.experience}</Text> : null}
          {m.certifications ? <Text style={s.body}>الشهادات المذكورة: {m.certifications}</Text> : null}
          {admin && m.admin_note ? <Text style={s.meta}>ملاحظة الإدارة: {m.admin_note}</Text> : null}
        </View>
      ) : null}

      <Section icon="folder-open" title={`ملف المستندات (${data.docs.length})`}>
        {data.docs.length ? data.docs.map((doc) => (
          <View key={doc.id} style={s.docRow}>
            <TouchableOpacity style={s.thumb} onPress={() => (isImage(doc.url) ? setView(doc) : openExternal(doc.url))}>
              {isImage(doc.url) ? <Image source={{ uri: doc.url }} style={{ width: "100%", height: "100%" }} /> :
                <Ionicons name={doc.kind === "srcs_certificate" ? "ribbon" : "document-text"} size={22} color={SRCS_RED} />}
            </TouchableOpacity>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={s.docTitle} numberOfLines={2}>{doc.title}</Text>
              <Text style={s.meta}>{(doc as any).url_private ? "🔒 " : ""}{DOC_KIND_LABEL[doc.kind] ?? "مستند"} · {d(doc.created_at)}{doc.profile_cert_id ? " · نسخة في الملف الشخصي" : ""}</Text>
              <View style={s.row}>
                <Ionicons name={doc.verified ? "shield-checkmark" : "time-outline"} size={13} color={doc.verified ? "#16A34A" : Colors.textMuted} />
                <Text style={[s.meta, { color: doc.verified ? "#16A34A" : Colors.textMuted }]}>{doc.verified ? "موثّق" : "بانتظار التوثيق"}</Text>
              </View>
            </View>
            {admin && onVerifyDoc && doc.source !== "srcs" ? (
              <TouchableOpacity onPress={() => onVerifyDoc(doc, !doc.verified)} style={s.smallBtn}><Text style={s.smallBtnTxt}>{doc.verified ? "إلغاء التوثيق" : "توثيق"}</Text></TouchableOpacity>
            ) : null}
            {!admin && onDeleteDoc && doc.source === "member" && !doc.verified ? (
              <TouchableOpacity onPress={() => onDeleteDoc(doc)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={Colors.danger} /></TouchableOpacity>
            ) : null}
          </View>
        )) : <Text style={s.empty}>لا توجد مستندات.</Text>}
      </Section>

      <Section icon="school" title={`الدورات والنتائج والشهادات (${data.enrollments.length})`}>
        {data.enrollments.length ? data.enrollments.map((e) => {
          const cs = CERT_STATUS[e.cert_status] ?? CERT_STATUS.none;
          return (
            <View key={e.id} style={s.enr}>
              <View style={s.row}>
                <Ionicons name={e.kind === "workshop" ? "construct" : "school"} size={16} color={SRCS_RED} />
                <Text style={[s.docTitle, { flex: 1 }]} numberOfLines={2}>{e.title}</Text>
                {e.passed === true ? <Text style={[s.pillTxt, { color: "#16A34A" }]}>ناجح</Text> : e.passed === false ? <Text style={[s.pillTxt, { color: "#B91C1C" }]}>لم يجتز</Text> : null}
              </View>
              <Text style={s.meta}>{d(e.starts_at)} · {e.score !== null && e.score !== undefined ? `الدرجة ${Number(e.score)} من ${Number(e.max_score ?? 100)}` : e.results_published ? "لا توجد درجة" : "النتيجة لم تُعلن"}{e.attended ? " · حضر" : ""}</Text>
              {e.cert_status !== "none" ? (
                <View style={s.row}>
                  <Text style={[s.meta, { color: cs[1] }]}>الشهادة: {cs[0]}{e.cert_no ? ` · ${e.cert_no}` : ""}</Text>
                  {e.cert_url ? <TouchableOpacity onPress={() => openExternal(e.cert_url!)}><Text style={s.link}>عرض الشهادة</Text></TouchableOpacity> : null}
                </View>
              ) : null}
            </View>
          );
        }) : <Text style={s.empty}>لم يلتحق بدورات بعد.</Text>}
      </Section>

      {data.activities.length ? (
        <Section icon="heart" title={`الأنشطة الميدانية (${data.activities.length})`}>
          {data.activities.map((a) => (
            <View key={a.id} style={s.row}><Text style={[s.body, { flex: 1 }]} numberOfLines={1}>{a.title}</Text><Text style={s.meta}>{d(a.happened_at)} · +{a.points}</Text></View>
          ))}
        </Section>
      ) : null}

      <ZoomViewer visible={!!view} onClose={() => setView(null)} title={view?.title} pages={view ? [{ label: view.title, ratio: 0.75, render: (w) => <Image source={{ uri: view.url }} style={{ width: w, height: w * 0.75 }} resizeMode="contain" /> }] : []} />
    </View>
  );
}

function Info({ k, v, ltr }: { k: string; v?: string | null; ltr?: boolean }) {
  return (
    <View style={s.info}>
      <Text style={s.infoK}>{k}</Text>
      <Text style={[s.infoV, ltr && { writingDirection: "ltr" }]} numberOfLines={1} selectable>{v || "—"}</Text>
    </View>
  );
}
function Section({ icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.row}><Ionicons name={icon} size={18} color={SRCS_RED} /><Text style={[s.secTitle, { flex: 1 }]}>{title}</Text></View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 14, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 6, flexWrap: "wrap" },
  name: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text, textAlign: "right" },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  pillTxt: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  info: { width: "31.8%", padding: 8, borderRadius: 10, backgroundColor: Colors.bg },
  infoK: { fontFamily: "Cairo_400Regular", fontSize: 10.5, color: Colors.textMuted, textAlign: "right" },
  infoV: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.text, textAlign: "right" },
  secTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.text, textAlign: "right" },
  docRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  thumb: { width: 54, height: 54, borderRadius: 10, backgroundColor: SRCS_RED + "10", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  docTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 12.5, lineHeight: 20, color: Colors.textSecondary, textAlign: "right" },
  smallBtn: { paddingHorizontal: 10, height: 32, borderRadius: 10, borderWidth: 1, borderColor: SRCS_RED + "66", alignItems: "center", justifyContent: "center" },
  smallBtnTxt: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: SRCS_RED },
  enr: { gap: 3, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  link: { fontFamily: "Cairo_700Bold", fontSize: 12, color: SRCS_RED },
  empty: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textMuted, textAlign: "center", paddingVertical: 6 },
});
