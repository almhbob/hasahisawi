// سجل الأعضاء والدفعات + نافذة تعديل العضو (الدور، الوحدة، الجهة، الدفعة، الصلاحيات، الحظر وإلغاء البطاقة)
// + نافذة ملف العضو الكامل + إعدادات الشهادة (لمدير حصاحيصاوي فقط).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import UserAvatar from "@/components/UserAvatar";
import { srcsStyles } from "@/components/srcs/styles";
import DossierView from "@/components/srcs/DossierView";
import { ExportButtons } from "@/components/srcs/AdminOps";
import { UnitPicker, type UnitOption } from "@/components/srcs/AdminUnits";
import {
  srcsApi, ROLE_LABEL, PERM_LABEL, PERM_ICON, ROLE_DEFAULT_PERMS, SRCS_RED,
  type SrcsMember, type SrcsRole, type SrcsPerm, type SrcsCohort, type SrcsDossier, type SrcsSettings, type UnitFilter,
} from "@/lib/red-crescent";

const ALL_PERMS = Object.keys(PERM_LABEL) as SrcsPerm[];
const STATUS_LABEL: Record<string, string> = { active: "نشط", pending: "معلّق", suspended: "موقوف", rejected: "مرفوض", banned: "محظور" };

// ═══ قائمة الأعضاء ═══
export function MembersList({ members, cohorts, perms, isAppAdmin, canGrantAdmin, units, unitFilter, onChanged }: {
  members: SrcsMember[]; cohorts: SrcsCohort[]; perms: SrcsPerm[]; isAppAdmin: boolean; canGrantAdmin: boolean; units: UnitOption[]; unitFilter: UnitFilter; onChanged: () => void;
}) {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [cohort, setCohort] = useState<number | "all">("all");
  const [edit, setEdit] = useState<SrcsMember | null>(null);
  const [dossierFor, setDossierFor] = useState<SrcsMember | null>(null);
  const list = useMemo(() => members.filter((m) => m.status !== "pending"
    && (status === "all" || m.status === status || (status === "revoked" && !!m.revoked_at))
    && (cohort === "all" || m.cohort_id === cohort)
    && (!q.trim() || [m.name, m.card_no, m.phone, m.account_phone, m.unit, m.affiliation, m.national_id_no].some((x) => String(x || "").includes(q.trim())))), [members, q, status, cohort]);
  const canManage = perms.includes("members");
  const update = async (m: SrcsMember, b: Record<string, unknown>, msg?: string) => {
    try { await srcsApi.admin.updateMember(token!, m.id, b); if (msg) notify(msg); onChanged(); } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={s.search}><Ionicons name="search" size={18} color={Colors.textMuted} /><TextInput value={q} onChangeText={setQ} placeholder="ابحث بالاسم، رقم البطاقة، الهاتف، الوحدة…" placeholderTextColor={Colors.textMuted} style={s.searchIn} /></View>
      <RtlScrollRow contentContainerStyle={{ gap: 6 }}>
        {[["all", "الكل"], ["active", "نشط"], ["suspended", "موقوف"], ["banned", "محظور"], ["revoked", "بطاقة ملغاة"], ["rejected", "مرفوض"]].map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setStatus(k)} style={[s.chip, status === k && s.chipOn]}><Text style={[s.chipTxt, status === k && { color: "#fff" }]}>{l}</Text></TouchableOpacity>
        ))}
      </RtlScrollRow>
      {cohorts.length ? (
        <RtlScrollRow contentContainerStyle={{ gap: 6 }}>
          <TouchableOpacity onPress={() => setCohort("all")} style={[s.chip, cohort === "all" && s.chipOn]}><Text style={[s.chipTxt, cohort === "all" && { color: "#fff" }]}>كل الدفعات</Text></TouchableOpacity>
          {cohorts.map((c) => <TouchableOpacity key={c.id} onPress={() => setCohort(c.id)} style={[s.chip, cohort === c.id && s.chipOn]}><Text style={[s.chipTxt, cohort === c.id && { color: "#fff" }]}>{c.name}</Text></TouchableOpacity>)}
        </RtlScrollRow>
      ) : null}
      <View style={s.row}><Text style={[s.meta, { flex: 1 }]}>{list.length} عضو</Text></View>
      <ExportButtons kind="members" id={null} unit={unitFilter} compact />
      {list.map((m) => (
        <View key={m.id} style={[s.card, (m.status === "banned" || m.revoked_at) && { borderColor: "#B91C1C55" }]}>
          <TouchableOpacity style={s.row} onPress={() => setDossierFor(m)}>
            <UserAvatar name={m.name || "؟"} avatarUrl={m.avatar_url ?? null} size={42} borderRadius={12} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{m.name}</Text>
              <Text style={s.meta} numberOfLines={1}>{ROLE_LABEL[m.role]} · {STATUS_LABEL[m.status] ?? m.status}{m.unit_name || m.unit ? ` · ${m.unit_name || m.unit}` : ""}{m.affiliation ? ` · ${m.affiliation}` : ""}</Text>
              <Text style={s.meta} numberOfLines={1}>{m.card_no ? `${m.card_no}` : "بلا بطاقة"}{m.cohort_name ? ` · ${m.cohort_name}` : ""}{m.revoked_at ? " · ⛔ بطاقة ملغاة" : ""}{(m.perms?.length ?? 0) ? ` · 🔑 ${m.perms!.length} صلاحية` : ""}</Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            {(canManage || isAppAdmin) && (m.role !== "admin" || canGrantAdmin) ? <TouchableOpacity style={s.ghost} onPress={() => setEdit(m)}><Ionicons name="create-outline" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>تعديل وصلاحيات</Text></TouchableOpacity> : null}
            {canManage && m.status === "active" && !m.revoked_at ? <TouchableOpacity style={[s.ghost, { flex: 0, paddingHorizontal: 12 }]} onPress={() => update(m, { renew_card: true }, "جُدّدت البطاقة لعام")}><Ionicons name="refresh" size={16} color={SRCS_RED} /></TouchableOpacity> : null}
            <TouchableOpacity style={[s.ghost, { flex: 0, paddingHorizontal: 12 }]} onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(m.user_id) } })}><Ionicons name="person" size={16} color={SRCS_RED} /></TouchableOpacity>
          </View>
        </View>
      ))}
      <MemberEditModal member={edit} cohorts={cohorts} perms={perms} isAppAdmin={isAppAdmin} canGrantAdmin={canGrantAdmin} units={units} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); }} />
      <DossierModal member={dossierFor} onClose={() => setDossierFor(null)} />
    </View>
  );
}

// ═══ تعديل العضو ═══
function MemberEditModal({ member, cohorts, perms, isAppAdmin, canGrantAdmin, units, onClose, onSaved }: {
  member: SrcsMember | null; cohorts: SrcsCohort[]; perms: SrcsPerm[]; isAppAdmin: boolean; canGrantAdmin: boolean; units: UnitOption[]; onClose: () => void; onSaved: () => void;
}) {
  const { token } = useAuth();
  const [f, setF] = useState<Partial<SrcsMember>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (member) { setF({ role: member.role, unit_id: member.unit_id ?? 0, affiliation: member.affiliation, cohort_id: member.cohort_id ?? null, perms: [...(member.perms || [])] }); setReason(""); } }, [member]);
  if (!member) return null;
  const canManage = perms.includes("members");
  const defaults = ROLE_DEFAULT_PERMS[(f.role || member.role) as SrcsRole] ?? [];
  const save = async (extra: Record<string, unknown> = {}, msg = "تم الحفظ") => {
    setBusy(true);
    try {
      const b: Record<string, unknown> = { ...extra };
      if (canManage) Object.assign(b, { role: f.role, affiliation: f.affiliation ?? "", cohort_id: f.cohort_id ?? 0 });
      // تُرسل الوحدة فقط إن تغيّرت (مدير الوحدة لا يستطيع النقل خارج وحداته — والخادم يتحقق)
      if (canManage && (f.unit_id ?? 0) !== (member.unit_id ?? 0)) b.unit_id = f.unit_id || null;
      if (isAppAdmin) b.perms = f.perms;
      await srcsApi.admin.updateMember(token!, member.id, b);
      notify(msg); onSaved();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };
  const togglePerm = (p: SrcsPerm) => setF((x) => ({ ...x, perms: x.perms?.includes(p) ? x.perms.filter((y) => y !== p) : [...(x.perms || []), p] }));
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBg}>
        <View style={s.sheet}>
          <View style={s.sheetHead}><Text style={s.cardTitle} numberOfLines={1}>{member.name}</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {canManage ? (
              <>
                <Text style={s.label}>الصفة</Text>
                <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
                  {(Object.keys(ROLE_LABEL) as SrcsRole[]).filter((r) => r !== "admin" || canGrantAdmin || member.role === "admin").map((r) => (
                    <TouchableOpacity key={r} onPress={() => setF((x) => ({ ...x, role: r }))} style={[s.chip, f.role === r && s.chipOn]}><Text style={[s.chipTxt, f.role === r && { color: "#fff" }]}>{ROLE_LABEL[r]}</Text></TouchableOpacity>
                  ))}
                </View>
                <UnitPicker label="الوحدة (تظهر على البطاقة)" value={f.unit_id ?? 0} onChange={(id) => setF((x) => ({ ...x, unit_id: id, cohort_id: null }))}
                  options={units.some((u) => u.id === (member.unit_id ?? 0)) ? units : [{ id: member.unit_id ?? 0, name: member.unit_name || member.unit || "بلا وحدة" }, ...units]} />
                <Text style={s.label}>الجهة التابع لها (تظهر على البطاقة)</Text>
                <TextInput value={f.affiliation || ""} onChangeText={(v) => setF((x) => ({ ...x, affiliation: v }))} placeholder="مثال: مستشفى الحصاحيصا / محلية الحصاحيصا" placeholderTextColor={Colors.textMuted} style={s.input} />
                {cohorts.length ? (
                  <>
                    <Text style={s.label}>الدفعة</Text>
                    <RtlScrollRow contentContainerStyle={{ gap: 6 }}>
                      <TouchableOpacity onPress={() => setF((x) => ({ ...x, cohort_id: null }))} style={[s.chip, !f.cohort_id && s.chipOn]}><Text style={[s.chipTxt, !f.cohort_id && { color: "#fff" }]}>بلا دفعة</Text></TouchableOpacity>
                      {cohorts.filter((c) => !c.unit_id || c.unit_id === (f.unit_id || null)).map((c) => <TouchableOpacity key={c.id} onPress={() => setF((x) => ({ ...x, cohort_id: c.id }))} style={[s.chip, f.cohort_id === c.id && s.chipOn]}><Text style={[s.chipTxt, f.cohort_id === c.id && { color: "#fff" }]}>{c.name}</Text></TouchableOpacity>)}
                    </RtlScrollRow>
                  </>
                ) : null}
              </>
            ) : null}

            {isAppAdmin ? (
              <View style={s.permBox}>
                <View style={s.row}><Ionicons name="key" size={18} color={SRCS_RED} /><Text style={[s.cardTitle, { flex: 1 }]}>الصلاحيات (منحها لمدير حصاحيصاوي)</Text></View>
                <Text style={s.hint}>المفعّل تلقائياً بحكم الصفة «{ROLE_LABEL[(f.role || member.role) as SrcsRole]}» يظهر بعلامة 🔒، ويمكنك إضافة صلاحيات أخرى لهذا الفرد.</Text>
                <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
                  {ALL_PERMS.map((p) => {
                    const byRole = defaults.includes(p);
                    const on = byRole || !!f.perms?.includes(p);
                    return (
                      <TouchableOpacity key={p} disabled={byRole} onPress={() => togglePerm(p)} style={[s.permChip, on && s.permOn]}>
                        <Ionicons name={(byRole ? "lock-closed" : PERM_ICON[p]) as any} size={13} color={on ? "#fff" : SRCS_RED} />
                        <Text style={[s.chipTxt, { fontSize: 12.5 }, on && { color: "#fff" }]}>{PERM_LABEL[p]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <TouchableOpacity style={s.primary} onPress={() => save()} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>حفظ</Text>}</TouchableOpacity>

            {canManage && member.status !== "banned" ? (
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                {member.status === "active"
                  ? <TouchableOpacity style={s.ghost} onPress={async () => { if (await confirmAction("إيقاف مؤقت", member.name || "", "إيقاف", true)) save({ status: "suspended" }, "أُوقفت العضوية"); }}><Text style={s.ghostTxt}>إيقاف مؤقت</Text></TouchableOpacity>
                  : <TouchableOpacity style={s.ghost} onPress={() => save({ status: "active" }, "فُعّلت العضوية")}><Text style={s.ghostTxt}>تفعيل</Text></TouchableOpacity>}
              </View>
            ) : null}

            {isAppAdmin ? (
              <View style={s.danger}>
                <View style={s.row}><Ionicons name="shield" size={18} color="#B91C1C" /><Text style={[s.cardTitle, { flex: 1, color: "#B91C1C" }]}>الحظر وإلغاء البطاقة (مدير حصاحيصاوي)</Text></View>
                <TextInput value={reason} onChangeText={setReason} placeholder="سبب الإجراء (يظهر للعضو وفي صفحة التحقق)" placeholderTextColor={Colors.textMuted} style={s.input} />
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  {member.revoked_at
                    ? <TouchableOpacity style={s.ghost} onPress={() => save({ revoke_card: false }, "أُعيد تفعيل البطاقة")}><Text style={s.ghostTxt}>إعادة البطاقة</Text></TouchableOpacity>
                    : <TouchableOpacity style={[s.ghost, { borderColor: "#B91C1C" }]} onPress={async () => { if (await confirmAction("إلغاء البطاقة", `ستظهر البطاقة «ملغاة» عند التحقق. متابعة؟`, "إلغاء البطاقة", true)) save({ revoke_card: true, revoke_reason: reason }, "أُلغيت البطاقة"); }}><Text style={[s.ghostTxt, { color: "#B91C1C" }]}>إلغاء البطاقة</Text></TouchableOpacity>}
                  {member.status === "banned"
                    ? <TouchableOpacity style={s.ghost} onPress={() => save({ status: "active", revoke_card: false }, "رُفع الحظر")}><Text style={s.ghostTxt}>رفع الحظر</Text></TouchableOpacity>
                    : <TouchableOpacity style={[s.primary, { backgroundColor: "#7F1D1D" }]} onPress={async () => { if (await confirmAction("حظر العضو", `حظر ${member.name} وإلغاء بطاقته لمخالفة القوانين؟`, "حظر", true)) save({ status: "banned", revoke_reason: reason }, "حُظر العضو وأُلغيت بطاقته"); }}><Ionicons name="ban" size={16} color="#fff" /><Text style={s.primaryTxt}>حظر</Text></TouchableOpacity>}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══ ملف العضو ═══
export function DossierModal({ member, onClose }: { member: SrcsMember | null; onClose: () => void }) {
  const { token } = useAuth();
  const [data, setData] = useState<SrcsDossier | null>(null);
  const load = useCallback(async () => {
    if (!member || !token) return;
    try { setData(await srcsApi.admin.dossier(token, member.id)); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
  }, [member, token]);
  useEffect(() => { setData(null); load(); }, [load]);
  return (
    <Modal visible={!!member} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBg}>
        <View style={[s.sheet, { maxHeight: "94%", backgroundColor: Colors.bg }]}>
          <View style={s.sheetHead}><Text style={s.cardTitle}>ملف العضو</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {!data ? <ActivityIndicator color={SRCS_RED} style={{ margin: 30 }} /> : (
              <DossierView data={data} admin onVerifyDoc={async (doc, v) => { try { await srcsApi.admin.verifyDoc(token!, doc.id, v); load(); } catch (e: any) { notify("تعذّر", e?.message); } }} />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ═══ الدفعات ═══
export function CohortsPanel({ cohorts, members, units, defaultUnitId, onChanged }: { cohorts: SrcsCohort[]; members: SrcsMember[]; units: UnitOption[]; defaultUnitId: number; onChanged: () => void }) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState(defaultUnitId);
  useEffect(() => { setUnitId(defaultUnitId); }, [defaultUnitId]);
  const [open, setOpen] = useState<SrcsCohort | null>(null);
  const [q, setQ] = useState("");
  const [assign, setAssign] = useState(false);
  const [dossierFor, setDossierFor] = useState<SrcsMember | null>(null);
  const create = async () => {
    if (name.trim().length < 2) return notify("اكتب اسم الدفعة", "مثال: دفعة 2026 — الإسعافات الأولية");
    try { await srcsApi.admin.createCohort(token!, { name: name.trim(), year: new Date().getFullYear(), unit_id: unitId || null }); setName(""); onChanged(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const inCohort = open ? members.filter((m) => m.cohort_id === open.id && (!q.trim() || [m.name, m.card_no, m.phone, m.unit].some((x) => String(x || "").includes(q.trim())))) : [];
  const unassigned = open ? members.filter((m) => m.status === "active" && m.cohort_id !== open.id && (!open.unit_id || m.unit_id === open.unit_id)) : [];
  return (
    <View style={{ gap: 10 }}>
      <View style={[s.card, { gap: 8 }]}>
        <Text style={s.cardTitle}>دفعة جديدة</Text>
        <UnitPicker options={units} value={unitId} onChange={setUnitId} />
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          <TextInput value={name} onChangeText={setName} placeholder="اسم الدفعة" placeholderTextColor={Colors.textMuted} style={[s.input, { flex: 1 }]} />
          <TouchableOpacity style={[s.primary, { flex: 0, paddingHorizontal: 18 }]} onPress={create}><Ionicons name="add" size={18} color="#fff" /></TouchableOpacity>
        </View>
      </View>
      {!cohorts.length ? <Text style={s.empty}>لا توجد دفعات بعد.</Text> : cohorts.map((c) => (
        <TouchableOpacity key={c.id} style={s.card} onPress={() => { setOpen(c); setQ(""); setAssign(false); }}>
          <View style={s.row}>
            <View style={s.cohortIcon}><Ionicons name="albums" size={20} color={SRCS_RED} /></View>
            <View style={{ flex: 1 }}><Text style={s.itemTitle}>{c.name}</Text><Text style={s.meta}>{c.year ?? ""} · {c.members} عضو · {c.courses} دورة · {c.unit_name || "عام للفرع"}</Text></View>
            <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
          </View>
        </TouchableOpacity>
      ))}
      <Modal visible={!!open} animationType="slide" transparent onRequestClose={() => setOpen(null)}>
        <View style={s.modalBg}>
          <View style={[s.sheet, { maxHeight: "94%" }]}>
            <View style={s.sheetHead}><Text style={s.cardTitle} numberOfLines={1}>سجل {open?.name}</Text><TouchableOpacity onPress={() => setOpen(null)}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity></View>
            <View style={s.search}><Ionicons name="search" size={18} color={Colors.textMuted} /><TextInput value={q} onChangeText={setQ} placeholder="ابحث داخل الدفعة" placeholderTextColor={Colors.textMuted} style={s.searchIn} /></View>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <TouchableOpacity style={s.ghost} onPress={() => setAssign((v) => !v)}><Ionicons name="person-add" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>إضافة أعضاء للدفعة</Text></TouchableOpacity>
              <TouchableOpacity style={[s.ghost, { flex: 0, paddingHorizontal: 12 }]} onPress={async () => { if (open && await confirmAction("حذف الدفعة", "يبقى الأعضاء دون دفعة", "حذف", true)) { await srcsApi.admin.deleteCohort(token!, open.id); setOpen(null); onChanged(); } }}><Ionicons name="trash-outline" size={16} color={SRCS_RED} /></TouchableOpacity>
            </View>
            {open ? <ExportButtons kind="cohort" id={open.id} compact /> : null}
            <ScrollView contentContainerStyle={{ gap: 6, paddingBottom: 20 }}>
              {assign ? unassigned.map((m) => (
                <TouchableOpacity key={m.id} style={[s.row, { paddingVertical: 6 }]} onPress={async () => { await srcsApi.admin.updateCohort(token!, open!.id, { member_ids: [m.id] }); onChanged(); }}>
                  <Ionicons name="add-circle" size={20} color={SRCS_RED} /><Text style={[s.body, { flex: 1 }]}>{m.name}</Text><Text style={s.meta}>{m.cohort_name || "بلا دفعة"}</Text>
                </TouchableOpacity>
              )) : inCohort.length ? inCohort.map((m) => (
                <TouchableOpacity key={m.id} style={s.regRow} onPress={() => setDossierFor(m)}>
                  <UserAvatar name={m.name || "؟"} avatarUrl={m.avatar_url ?? null} size={36} borderRadius={10} />
                  <View style={{ flex: 1 }}><Text style={s.itemTitle}>{m.name}</Text><Text style={s.meta} numberOfLines={1}>{ROLE_LABEL[m.role]} · {m.card_no || "بلا بطاقة"}{m.unit ? ` · ${m.unit}` : ""}</Text></View>
                  <Ionicons name="document-text" size={18} color={SRCS_RED} />
                </TouchableOpacity>
              )) : <Text style={s.empty}>لا يوجد أعضاء في هذه الدفعة.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <DossierModal member={dossierFor} onClose={() => setDossierFor(null)} />
    </View>
  );
}

// ═══ إعدادات الشهادة (مدير حصاحيصاوي فقط) ═══
export function SettingsPanel() {
  const { token } = useAuth();
  const [f, setF] = useState<SrcsSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { srcsApi.settings().then(setF).catch(() => setF({ cert_price: 0, cert_currency: "SDG", cert_payment_info: "" })); }, []);
  if (!f) return <ActivityIndicator color={SRCS_RED} />;
  const save = async () => {
    setBusy(true);
    try { setF(await srcsApi.admin.settings(token!, { cert_price: Number(f.cert_price) || 0, cert_currency: f.cert_currency, cert_payment_info: f.cert_payment_info })); notify("تم الحفظ", "طُبّق السعر الجديد على الطلبات القادمة"); }
    catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };
  return (
    <View style={s.card}>
      <View style={s.row}><Ionicons name="ribbon" size={20} color={SRCS_RED} /><Text style={[s.cardTitle, { flex: 1 }]}>الشهادة الإلكترونية</Text></View>
      <Text style={s.hint}>يُطلب الدفع من الناجحين قبل إصدار الشهادة. اجعل السعر 0 لإصدارها مجاناً. هذا الإعداد لمدير حصاحيصاوي فقط.</Text>
      <View style={{ flexDirection: "row-reverse", gap: 8 }}>
        <View style={{ flex: 2, gap: 4 }}><Text style={s.label}>السعر</Text><TextInput value={String(f.cert_price)} onChangeText={(v) => setF({ ...f, cert_price: v.replace(/[^\d.]/g, "") as any })} keyboardType="decimal-pad" style={[s.input, { textAlign: "center", fontSize: 18 }]} /></View>
        <View style={{ flex: 1, gap: 4 }}><Text style={s.label}>العملة</Text><TextInput value={f.cert_currency} onChangeText={(v) => setF({ ...f, cert_currency: v })} style={[s.input, { textAlign: "center" }]} /></View>
      </View>
      <Text style={s.label}>تعليمات الدفع (تظهر للعضو)</Text>
      <TextInput value={f.cert_payment_info} onChangeText={(v) => setF({ ...f, cert_payment_info: v })} multiline placeholder="مثال: حوّل المبلغ عبر بنكك إلى الحساب … باسم … ثم أرفق الإشعار" placeholderTextColor={Colors.textMuted} style={[s.input, { height: 100, textAlignVertical: "top" }]} />
      <TouchableOpacity style={s.primary} onPress={save} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>حفظ الإعدادات</Text>}</TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  ...srcsStyles,
  chipOn: { backgroundColor: SRCS_RED, borderColor: SRCS_RED },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, height: 46, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBg, paddingHorizontal: 12 },
  searchIn: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right" },
  permBox: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: SRCS_RED + "08", borderWidth: 1, borderColor: SRCS_RED + "30" },
  permChip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 17, borderWidth: 1, borderColor: SRCS_RED + "55", backgroundColor: Colors.cardBg },
  permOn: { backgroundColor: SRCS_RED, borderColor: SRCS_RED },
  danger: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: "#B91C1C0A", borderWidth: 1, borderColor: "#B91C1C40" },
  cohortIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: SRCS_RED + "12", alignItems: "center", justifyContent: "center" },
  regRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
});
