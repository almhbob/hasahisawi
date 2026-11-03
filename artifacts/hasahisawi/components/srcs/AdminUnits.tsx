// الوحدات: مرشّح الوحدة في لوحة الإدارة، منتقي الوحدة في نماذج الإنشاء،
// ولوحة «الوحدات» لمستوى إدارة الفرع (إنشاء/تعديل/إيقاف الوحدات وتعيين مدرائها وصلاحياتهم).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import UserAvatar from "@/components/UserAvatar";
import { srcsStyles } from "@/components/srcs/styles";
import {
  srcsApi, SRCS_RED, PERM_LABEL, PERM_ICON,
  type SrcsScope, type SrcsAdminUnit, type SrcsPerm, type SrcsMember, type UnitFilter,
} from "@/lib/red-crescent";

/** خيار وحدة في النماذج؛ id = 0 يعني «عام للفرع» */
export type UnitOption = { id: number; name: string };
export const BRANCH_WIDE: UnitOption = { id: 0, name: "عام للفرع" };

/** الوحدات التي يجوز النشر/النقل إليها: الفرع يختار أي وحدة نشطة أو «عام للفرع»، ومدير الوحدة وحداته فقط */
export function writeOptions(scope: SrcsScope | null, withBranchWide = true): UnitOption[] {
  if (!scope) return [];
  const active = scope.units.filter((u) => u.is_active).map((u) => ({ id: u.id, name: u.name }));
  return scope.level === "branch" ? [...(withBranchWide ? [BRANCH_WIDE] : []), ...active] : active;
}
/** الاختيار الافتراضي في نموذج جديد: الوحدة المرشّحة حالياً إن كانت مسموحة، وإلا أول خيار */
export function defaultUnit(options: UnitOption[], filter: UnitFilter): number {
  if (filter !== undefined && options.some((o) => o.id === filter)) return filter;
  return options[0]?.id ?? 0;
}
export const unitLabel = (name?: string | null) => name || BRANCH_WIDE.name;

// ═══ منتقي الوحدة داخل النماذج ═══
export function UnitPicker({ options, value, onChange, label = "تابع لـ" }: { options: UnitOption[]; value: number; onChange: (id: number) => void; label?: string }) {
  if (!options.length) return null;
  if (options.length === 1) {
    return (
      <View style={[s.row, st.fixed]}>
        <Ionicons name="people-circle" size={18} color={SRCS_RED} />
        <Text style={[s.label, { flex: 1 }]}>{label}: <Text style={{ color: SRCS_RED }}>{options[0].name}</Text></Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label} *</Text>
      <RtlScrollRow contentContainerStyle={{ gap: 6 }}>
        {options.map((o) => (
          <TouchableOpacity key={o.id} onPress={() => onChange(o.id)} style={[s.chip, st.chipRow, value === o.id && st.on]} accessibilityRole="radio" accessibilityState={{ selected: value === o.id }}>
            {o.id === 0 ? <Ionicons name="globe-outline" size={13} color={value === o.id ? "#fff" : SRCS_RED} /> : null}
            <Text style={[s.chipTxt, value === o.id && { color: "#fff" }]}>{o.name}</Text>
          </TouchableOpacity>
        ))}
      </RtlScrollRow>
    </View>
  );
}

// ═══ مرشّح الوحدة أعلى اللوحة ═══
export function UnitFilterRow({ scope, value, onChange }: { scope: SrcsScope; value: UnitFilter; onChange: (v: UnitFilter) => void }) {
  const branch = scope.level === "branch";
  const units = scope.units;
  if (!branch && units.length <= 1) return null; // مدير وحدة واحدة: كل شيء مرشّح لوحدته أصلاً
  if (branch && !units.length) return null;
  const items: [UnitFilter, string][] = [[undefined, branch ? "كل الوحدات" : "كل وحداتي"], ...(branch ? [[0, BRANCH_WIDE.name] as [UnitFilter, string]] : []),
    ...units.map((u) => [u.id, u.is_active ? u.name : `${u.name} (موقوفة)`] as [UnitFilter, string])];
  return (
    <RtlScrollRow contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
      <View style={st.filterIcon}><Ionicons name="funnel" size={13} color={SRCS_RED} /></View>
      {items.map(([k, l]) => (
        <TouchableOpacity key={String(k)} onPress={() => onChange(k)} style={[st.fChip, value === k && st.on]}>
          <Text style={[s.chipTxt, { fontSize: 12.5 }, value === k && { color: "#fff" }]}>{l}</Text>
        </TouchableOpacity>
      ))}
    </RtlScrollRow>
  );
}

// ═══ لوحة الوحدات (مستوى الفرع) ═══
export function UnitsPanel({ members, onChanged }: { members: SrcsMember[]; onChanged: () => void }) {
  const { token } = useAuth();
  const [units, setUnits] = useState<SrcsAdminUnit[] | null>(null);
  const [defaults, setDefaults] = useState<SrcsPerm[]>([]);
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<SrcsAdminUnit | null>(null);
  const load = useCallback(async () => {
    if (!token) return;
    try { const r = await srcsApi.admin.units(token); setUnits(r.units); setDefaults(r.defaultPerms); }
    catch (e: any) { notify("تعذّر التحميل", e?.message); setUnits([]); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { load(); onChanged(); };
  const create = async () => {
    if (name.trim().length < 2) return notify("اكتب اسم الوحدة", "مثال: وحدة الإسعاف الميداني");
    try { await srcsApi.admin.createUnit(token!, { name: name.trim() }); setName(""); refresh(); } catch (e: any) { notify("تعذّر الإنشاء", e?.message); }
  };
  const current = edit && units ? units.find((u) => u.id === edit.id) ?? edit : edit;
  return (
    <View style={{ gap: 10 }}>
      <View style={[s.card, { gap: 8 }]}>
        <View style={s.row}><Ionicons name="git-network" size={18} color={SRCS_RED} /><Text style={[s.cardTitle, { flex: 1 }]}>وحدة جديدة</Text></View>
        <Text style={s.hint}>لكل وحدة مدير (أو أكثر) يدير أعضاءها ومحتواها فقط، دون الاطلاع على بيانات الوحدات الأخرى.</Text>
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          <TextInput value={name} onChangeText={setName} placeholder="اسم الوحدة" placeholderTextColor={Colors.textMuted} style={[s.input, { flex: 1 }]} onSubmitEditing={create} />
          <TouchableOpacity style={[s.primary, { flex: 0, paddingHorizontal: 18 }]} onPress={create} accessibilityLabel="إضافة وحدة"><Ionicons name="add" size={18} color="#fff" /></TouchableOpacity>
        </View>
      </View>
      {!units ? <ActivityIndicator color={SRCS_RED} /> : !units.length ? <Text style={s.empty}>لا توجد وحدات بعد.</Text> : units.map((u) => (
        <TouchableOpacity key={u.id} style={[s.card, !u.is_active && { opacity: 0.6 }]} onPress={() => setEdit(u)}>
          <View style={s.row}>
            <View style={st.uIcon}><Ionicons name="people" size={20} color={SRCS_RED} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{u.name}{u.code ? <Text style={s.meta}>  ({u.code})</Text> : null}</Text>
              <Text style={s.meta}>{u.members.toLocaleString("ar-EG")} عضو نشط{u.pending ? ` · ${u.pending} طلب معلّق` : ""}{!u.is_active ? " · موقوفة" : ""}</Text>
              <Text style={[s.meta, { color: u.managers.length ? Colors.textSecondary : Colors.danger }]} numberOfLines={1}>
                {u.managers.length ? `المدير: ${u.managers.map((m) => m.name).join("، ")}` : "بلا مدير — عيّن مديراً للوحدة"}
              </Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
          </View>
        </TouchableOpacity>
      ))}
      <UnitModal unit={current} defaults={defaults} members={members} onClose={() => setEdit(null)} onChanged={refresh} />
    </View>
  );
}

function UnitModal({ unit, defaults, members, onClose, onChanged }: { unit: SrcsAdminUnit | null; defaults: SrcsPerm[]; members: SrcsMember[]; onClose: () => void; onChanged: () => void }) {
  const { token } = useAuth();
  const [f, setF] = useState({ name: "", code: "", description: "" });
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: number; name: string; avatar_url: string | null; phone: string | null; member_status: string | null; unit_name: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [permsFor, setPermsFor] = useState<{ user_id: number; name: string; perms: SrcsPerm[]; isNew: boolean } | null>(null);
  useEffect(() => { if (unit) { setF({ name: unit.name, code: unit.code || "", description: unit.description || "" }); setQ(""); setFound([]); setPermsFor(null); } }, [unit?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!unit || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { setFound((await srcsApi.admin.searchUsers(token!, q.trim())).users); } catch { setFound([]); } finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, unit, token]);
  if (!unit) return null;
  const unitMembers = members.filter((m) => m.unit_id === unit.id && m.status === "active" && !unit.managers.some((x) => x.user_id === m.user_id));
  const save = async (b: Parameters<typeof srcsApi.admin.updateUnit>[2], msg: string) => {
    try { await srcsApi.admin.updateUnit(token!, unit.id, b); notify(msg); onChanged(); } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };
  const savePerms = async () => {
    if (!permsFor) return;
    if (!permsFor.perms.length) return notify("اختر صلاحية واحدة على الأقل");
    try { await srcsApi.admin.setUnitManager(token!, unit.id, permsFor.user_id, permsFor.perms); notify(permsFor.isNew ? "عُيّن مدير الوحدة وأُشعر بذلك" : "حُدّثت الصلاحيات"); setPermsFor(null); setQ(""); onChanged(); }
    catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };
  const pick = (user_id: number, name: string) => setPermsFor({ user_id, name, perms: [...defaults], isNew: true });
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBg}>
        <View style={[s.sheet, { maxHeight: "94%" }]}>
          <View style={s.sheetHead}><Text style={s.cardTitle} numberOfLines={1}>{unit.name}</Text><TouchableOpacity onPress={onClose} accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>اسم الوحدة (يظهر على البطاقات وصفحة التحقق)</Text>
            <TextInput value={f.name} onChangeText={(v) => setF((x) => ({ ...x, name: v }))} style={s.input} />
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <View style={{ flex: 1, gap: 4 }}><Text style={s.label}>الرمز</Text><TextInput value={f.code} onChangeText={(v) => setF((x) => ({ ...x, code: v }))} placeholder="مثال: EMS" placeholderTextColor={Colors.textMuted} style={[s.input, { textAlign: "center" }]} /></View>
              <View style={{ flex: 2, gap: 4 }}>
                <Text style={s.label}>الحالة</Text>
                <View style={[s.row, st.fixed]}>
                  <Switch value={unit.is_active} onValueChange={async (v) => { if (!v && !(await confirmAction("إيقاف الوحدة", "سيفقد مدراؤها صلاحياتهم ولن تظهر في نموذج الانضمام. يبقى الأعضاء والمحتوى كما هم.", "إيقاف", true))) return; save({ is_active: v }, v ? "فُعّلت الوحدة" : "أُوقفت الوحدة"); }} />
                  <Text style={[s.body, { flex: 1 }]}>{unit.is_active ? "مفعّلة" : "موقوفة"}</Text>
                </View>
              </View>
            </View>
            <Text style={s.label}>نبذة</Text>
            <TextInput value={f.description} onChangeText={(v) => setF((x) => ({ ...x, description: v }))} multiline placeholder="مهام الوحدة ونطاق عملها (تظهر للمتقدمين)" placeholderTextColor={Colors.textMuted} style={[s.input, { height: 80, textAlignVertical: "top" }]} />
            <TouchableOpacity style={s.primary} onPress={() => save({ name: f.name.trim(), code: f.code.trim(), description: f.description.trim() }, "تم الحفظ")}><Text style={s.primaryTxt}>حفظ بيانات الوحدة</Text></TouchableOpacity>

            <View style={st.box}>
              <View style={s.row}><Ionicons name="key" size={18} color={SRCS_RED} /><Text style={[s.cardTitle, { flex: 1 }]}>مدراء الوحدة</Text></View>
              <Text style={s.hint}>يرى المدير ويدير أعضاء هذه الوحدة ومحتواها فقط، ولا يمنح صفة «إدارة الفرع» ولا يطّلع على الوحدات الأخرى.</Text>
              {!unit.managers.length ? <Text style={[s.meta, { color: Colors.danger }]}>لا يوجد مدير بعد.</Text> : unit.managers.map((m) => (
                <View key={m.user_id} style={st.mgr}>
                  <UserAvatar name={m.name || "؟"} avatarUrl={m.avatar_url ?? null} size={36} borderRadius={10} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemTitle}>{m.name}</Text>
                    <Text style={s.meta} numberOfLines={2}>{(m.perms || []).map((p) => PERM_LABEL[p]).join("، ")}</Text>
                  </View>
                  <TouchableOpacity style={st.iconSm} onPress={() => setPermsFor({ user_id: m.user_id, name: m.name, perms: [...(m.perms || [])], isNew: false })} accessibilityLabel="تعديل الصلاحيات"><Ionicons name="create-outline" size={17} color={SRCS_RED} /></TouchableOpacity>
                  <TouchableOpacity style={st.iconSm} accessibilityLabel="إعفاء من الإدارة" onPress={async () => {
                    if (!(await confirmAction("إعفاء مدير الوحدة", `إعفاء ${m.name} من إدارة ${unit.name}؟`, "إعفاء", true))) return;
                    try { await srcsApi.admin.removeUnitManager(token!, unit.id, m.user_id); notify("أُعفي من إدارة الوحدة"); onChanged(); } catch (e: any) { notify("تعذّر", e?.message); }
                  }}><Ionicons name="person-remove-outline" size={17} color={Colors.danger} /></TouchableOpacity>
                </View>
              ))}

              {permsFor ? (
                <View style={st.permEdit}>
                  <Text style={s.itemTitle}>صلاحيات {permsFor.name} في {unit.name}</Text>
                  <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
                    {(Object.keys(PERM_LABEL) as SrcsPerm[]).map((p) => {
                      const on = permsFor.perms.includes(p);
                      return (
                        <TouchableOpacity key={p} onPress={() => setPermsFor((x) => x && ({ ...x, perms: on ? x.perms.filter((y) => y !== p) : [...x.perms, p] }))} style={[st.permChip, on && st.on]}>
                          <Ionicons name={PERM_ICON[p] as any} size={13} color={on ? "#fff" : SRCS_RED} />
                          <Text style={[s.chipTxt, { fontSize: 12.5 }, on && { color: "#fff" }]}>{PERM_LABEL[p]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                    <TouchableOpacity style={s.primary} onPress={savePerms}><Text style={s.primaryTxt}>{permsFor.isNew ? "تعيين مديراً" : "حفظ الصلاحيات"}</Text></TouchableOpacity>
                    <TouchableOpacity style={[s.ghost, { flex: 0, paddingHorizontal: 16 }]} onPress={() => setPermsFor(null)}><Text style={s.ghostTxt}>إلغاء</Text></TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={s.label}>إضافة مدير</Text>
                  <View style={st.search}><Ionicons name="search" size={18} color={Colors.textMuted} /><TextInput value={q} onChangeText={setQ} placeholder="ابحث بالاسم أو الهاتف أو رقم الحساب" placeholderTextColor={Colors.textMuted} style={st.searchIn} /></View>
                  {searching ? <ActivityIndicator color={SRCS_RED} /> : null}
                  {found.filter((u) => !unit.managers.some((m) => m.user_id === u.id)).map((u) => (
                    <TouchableOpacity key={u.id} style={st.mgr} onPress={() => pick(u.id, u.name)}>
                      <UserAvatar name={u.name || "؟"} avatarUrl={u.avatar_url ?? null} size={32} borderRadius={9} />
                      <View style={{ flex: 1 }}><Text style={s.itemTitle}>{u.name}</Text><Text style={s.meta}>{u.member_status === "active" ? `عضو${u.unit_name ? ` · ${u.unit_name}` : ""}` : "ليس عضواً في الجمعية"}{u.phone ? ` · ${u.phone}` : ""}</Text></View>
                      <Ionicons name="add-circle" size={22} color={SRCS_RED} />
                    </TouchableOpacity>
                  ))}
                  {!q.trim() && unitMembers.length ? (
                    <>
                      <Text style={s.meta}>أو اختر من أعضاء الوحدة:</Text>
                      {unitMembers.slice(0, 30).map((m) => (
                        <TouchableOpacity key={m.id} style={st.mgr} onPress={() => pick(m.user_id, m.name || "")}>
                          <UserAvatar name={m.name || "؟"} avatarUrl={m.avatar_url ?? null} size={32} borderRadius={9} />
                          <Text style={[s.body, { flex: 1 }]}>{m.name}</Text>
                          <Ionicons name="add-circle-outline" size={22} color={SRCS_RED} />
                        </TouchableOpacity>
                      ))}
                    </>
                  ) : null}
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({ ...srcsStyles });
const st = StyleSheet.create({
  on: { backgroundColor: SRCS_RED, borderColor: SRCS_RED },
  chipRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4 },
  fixed: { padding: 10, borderRadius: 12, backgroundColor: SRCS_RED + "0A", borderWidth: 1, borderColor: SRCS_RED + "30" },
  fChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 12, height: 32, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBg },
  filterIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: SRCS_RED + "10" },
  uIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: SRCS_RED + "12", alignItems: "center", justifyContent: "center" },
  box: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: SRCS_RED + "06", borderWidth: 1, borderColor: SRCS_RED + "30" },
  mgr: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 6 },
  iconSm: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  permEdit: { gap: 8, padding: 10, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  permChip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 17, borderWidth: 1, borderColor: SRCS_RED + "55", backgroundColor: Colors.cardBg },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, height: 46, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBg, paddingHorizontal: 12 },
  searchIn: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right" },
});
