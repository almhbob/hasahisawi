/**
 * 🛡️ لوحة صلاحيات المشرفين: امنح كل مشرف إدارة أقسام وخدمات بعينها لتخفيف العبء عن مدير التطبيق.
 * الصلاحيات تُطبَّق على الخادم: المشرف لا يصل إلا إلى مسارات الأقسام الممنوحة له.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { confirmAction, notify } from "@/lib/xplatform";
import { neu, NeuButton, NeuInset, NeuRaised } from "@/components/auth/neu";
import UserAvatar from "@/components/UserAvatar";

type Perm = { key: string; label: string; group: string };
type Mod = { id: number; name: string; phone?: string | null; email?: string | null; avatar_url?: string | null; sections: string[] };
const ACCENT = "#E8A900";

export default function AdminPermissions() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const api = getApiUrl();
  const [catalog, setCatalog] = useState<Perm[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Mod | null>(null);
  const [adding, setAdding] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${api}/api/admin/moderator-permissions`, { headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCatalog(d.catalog); setMods(d.moderators);
    } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    setLoading(false);
  }, [api, token]);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const g: Record<string, Perm[]> = {};
    for (const p of catalog) (g[p.group] ??= []).push(p);
    return g;
  }, [catalog]);

  const demote = async (m: Mod) => {
    if (!(await confirmAction("إلغاء الإشراف", `إعادة «${m.name}» مستخدماً عادياً وسحب كل صلاحياته؟`, "إلغاء الإشراف", true))) return;
    await fetch(`${api}/api/admin/users/${m.id}/permissions`, { method: "PUT", headers, body: JSON.stringify({ sections: [] }) });
    await fetch(`${api}/api/admin/users/${m.id}/role`, { method: "PATCH", headers, body: JSON.stringify({ role: "user" }) });
    load();
  };

  if (user && user.role !== "admin") return <View style={s.center}><Text style={s.muted}>هذه اللوحة لمدير التطبيق فقط</Text></View>;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>صلاحيات المشرفين</Text>
          <Text style={s.sub}>وزّع إدارة الأقسام على فريقك</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ACCENT} />}>
        <NeuRaised radius={20} depth={6} style={s.intro}>
          <Ionicons name="shield-half" size={26} color={ACCENT} />
          <Text style={s.introText}>كل مشرف يرى ويدير الأقسام المحددة له فقط، والخادم يمنعه من غيرها. تبقى للمدير وحده: الأدوار والصلاحيات، الأمان، الإعدادات المتقدمة، وحسابات البوابات.</Text>
        </NeuRaised>
        <NeuButton label="إضافة مشرف" icon="person-add-outline" onPress={() => setAdding(true)} />
        {loading ? <ActivityIndicator color={ACCENT} style={{ marginTop: 30 }} /> : mods.length === 0 ? (
          <Text style={[s.muted, { textAlign: "center", padding: 30 }]}>لا يوجد مشرفون بعد</Text>
        ) : mods.map((m, i) => (
          <Animated.View key={m.id} entering={FadeInDown.delay(Math.min(i, 8) * 40)}>
            <NeuRaised radius={20} depth={7} style={{ padding: 14, gap: 10 }}>
              <View style={s.row}>
                <UserAvatar name={m.name} avatarUrl={m.avatar_url || undefined} size={44} borderRadius={14} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{m.name}</Text>
                  <Text style={s.muted}>{m.phone || m.email || ""}</Text>
                </View>
                <View style={s.count}><Text style={s.countText}>{m.sections.length} قسم</Text></View>
              </View>
              {m.sections.length ? (
                <View style={s.tags}>
                  {m.sections.slice(0, 8).map(k => <View key={k} style={s.tag}><Text style={s.tagText}>{catalog.find(c => c.key === k)?.label || k}</Text></View>)}
                  {m.sections.length > 8 ? <Text style={s.muted}>+{m.sections.length - 8}</Text> : null}
                </View>
              ) : <Text style={[s.muted, { color: "#946B00" }]}>لم تُمنح أي صلاحية بعد</Text>}
              <View style={s.row}>
                <TouchableOpacity onPress={() => setEdit(m)} style={[s.btn, { backgroundColor: ACCENT, flex: 2 }]}>
                  <Ionicons name="key" size={15} color="#fff" /><Text style={s.btnText}>تعديل الصلاحيات</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => demote(m)} style={[s.btn, { borderWidth: 1, borderColor: "#EF444455", flex: 1 }]}>
                  <Text style={[s.btnText, { color: "#D93636" }]}>إلغاء الإشراف</Text>
                </TouchableOpacity>
              </View>
            </NeuRaised>
          </Animated.View>
        ))}
      </ScrollView>
      <PermSheet mod={edit} groups={groups} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} api={api} headers={headers} />
      <AddSheet visible={adding} onClose={() => setAdding(false)} api={api} headers={headers} onAdded={(m) => { setAdding(false); load().then(() => setEdit({ ...m, sections: [] })); }} />
    </View>
  );
}

function PermSheet({ mod, groups, onClose, onSaved, api, headers }: { mod: Mod | null; groups: Record<string, Perm[]>; onClose: () => void; onSaved: () => void; api: string; headers: any }) {
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSel(new Set(mod?.sections || [])); }, [mod?.id]);
  if (!mod) return null;
  const toggle = (k: string) => setSel(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleGroup = (items: Perm[]) => setSel(p => { const n = new Set(p); const all = items.every(i => n.has(i.key)); items.forEach(i => all ? n.delete(i.key) : n.add(i.key)); return n; });
  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${api}/api/admin/users/${mod.id}/permissions`, { method: "PUT", headers, body: JSON.stringify({ sections: [...sel] }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error);
      notify("تم الحفظ", `${mod.name}: ${sel.size} قسم`); onSaved();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
    setBusy(false);
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={s.grabber} />
          <Text style={s.sheetTitle}>صلاحيات {mod.name}</Text>
          <Text style={s.muted}>{sel.size} قسم محدد</Text>
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 14, paddingVertical: 8 }}>
            {Object.entries(groups).map(([g, items]) => {
              const all = items.every(i => sel.has(i.key));
              return (
                <View key={g} style={{ gap: 6 }}>
                  <View style={s.groupHead}>
                    <Text style={s.groupTitle}>{g}</Text>
                    <TouchableOpacity onPress={() => toggleGroup(items)}><Text style={s.link}>{all ? "إلغاء الكل" : "تحديد الكل"}</Text></TouchableOpacity>
                  </View>
                  <View style={s.grid}>
                    {items.map(p => {
                      const on = sel.has(p.key);
                      return (
                        <Pressable key={p.key} onPress={() => toggle(p.key)} style={[s.perm, on && s.permOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                          <Ionicons name={on ? "checkbox" : "square-outline"} size={18} color={on ? ACCENT : Colors.textMuted} />
                          <Text style={[s.permText, on && { color: Colors.textPrimary, fontFamily: "Cairo_700Bold" }]}>{p.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <NeuButton label="حفظ الصلاحيات" icon="save-outline" onPress={save} loading={busy} />
        </View>
      </View>
    </Modal>
  );
}

function AddSheet({ visible, onClose, api, headers, onAdded }: { visible: boolean; onClose: () => void; api: string; headers: any; onAdded: (m: Mod) => void }) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Mod[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`${api}/api/admin/users/search?q=${encodeURIComponent(q.trim())}`, { headers }).then(x => x.json()).catch(() => ({ users: [] }));
      setRes(r.users || []);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const promote = async (u: Mod) => {
    setBusy(u.id);
    const r = await fetch(`${api}/api/admin/users/${u.id}/role`, { method: "PATCH", headers, body: JSON.stringify({ role: "moderator" }) });
    setBusy(null);
    if (!r.ok) return notify("خطأ", (await r.json().catch(() => ({}))).error);
    setQ(""); onAdded(u);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={s.grabber} />
          <Text style={s.sheetTitle}>إضافة مشرف</Text>
          <NeuInset radius={14} style={s.search}>
            <Ionicons name="search" size={16} color={Colors.textMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder="ابحث بالاسم أو رقم الهاتف" placeholderTextColor={Colors.textMuted} style={s.input} autoFocus />
          </NeuInset>
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
            {res.map(u => (
              <View key={u.id} style={s.row}>
                <UserAvatar name={u.name} avatarUrl={u.avatar_url || undefined} size={38} borderRadius={12} />
                <View style={{ flex: 1 }}><Text style={s.name}>{u.name}</Text><Text style={s.muted}>{u.phone || ""}</Text></View>
                <TouchableOpacity onPress={() => promote(u)} style={[s.btn, { backgroundColor: ACCENT, paddingHorizontal: 14 }]}>
                  {busy === u.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnText}>تعيين مشرفاً</Text>}
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: neu.base },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  intro: { flexDirection: "row-reverse", gap: 12, padding: 14, alignItems: "flex-start" },
  introText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  count: { backgroundColor: ACCENT + "1F", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  countText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#946B00" },
  tags: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  tag: { backgroundColor: Colors.bg, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textSecondary },
  btn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: neu.base, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, gap: 6, width: "100%", maxWidth: 680, alignSelf: "center" },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, marginBottom: 8 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right" },
  groupHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  groupTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  link: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#946B00" },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  perm: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1.2, borderColor: Colors.divider, backgroundColor: Colors.cardBg, width: "48.5%" },
  permOn: { borderColor: ACCENT, backgroundColor: ACCENT + "12" },
  permText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  input: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
});
