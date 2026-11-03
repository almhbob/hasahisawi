// «إثراء» — لوحة الإشراف: قائمة المراجعة (قبول/رفض/نقل رف/تمييز) + تعيين المشرفين (لمسؤول التطبيق).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction, openExternal } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import { ithraaApi, ITHRAA, ITHRAA_GOLD, fmtSize, fmtDate, RIGHTS_OPTIONS, type IthraaItem, type IthraaMeta, type IthraaModerator, type IthraaUserHit } from "@/lib/ithraa";
import { BookCover, Pill, Empty, StatusChip, ithraaStyles as u } from "@/components/ithraa/ui";

type Tab = "pending" | "approved" | "rejected" | "moderators";

export default function IthraaAdmin() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [meta, setMeta] = useState<IthraaMeta | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [shelf, setShelf] = useState("");
  const [items, setItems] = useState<IthraaItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const m = await ithraaApi.meta(token);
      setMeta(m);
      if (tab !== "moderators" && m.me.can_review) {
        const r = await ithraaApi.review(token, tab, shelf || undefined);
        setItems(r.items); setCounts(r.counts);
      }
    } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, tab, shelf]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => (router.canGoBack() ? router.back() : router.replace("/ithraa" as any));
  const myShelves = (meta?.shelves ?? []).filter((s) => meta?.me.review_all || (meta?.me.review_shelves ?? []).includes(s.key));
  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: `بانتظار المراجعة${counts.pending ? ` (${counts.pending})` : ""}` },
    { key: "approved", label: "المنشور" },
    { key: "rejected", label: "المرفوض" },
    ...(meta?.me.is_app_admin ? [{ key: "moderators" as Tab, label: "المشرفون" }] : []),
  ];

  if (!loading && meta && !meta.me.can_review) return (
    <View style={[st.center, { paddingTop: insets.top + 40 }]}>
      <Empty icon="lock-closed-outline" title="للمشرفين فقط" sub="لوحة الإشراف متاحة لمسؤولي التطبيق ومشرفي «إثراء» المعيّنين." action="رجوع" onAction={back} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={back} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.barTitle}>إشراف «إثراء»</Text>
          <Text style={st.barSub}>{meta?.me.review_all ? "كل الرفوف" : myShelves.map((s) => s.label).join("، ") || "—"}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ITHRAA} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={u.wrap}>{tabs.map((t) => <Pill key={t.key} label={t.label} on={tab === t.key} onPress={() => setTab(t.key)} color={t.key === "pending" ? "#B7791F" : ITHRAA} />)}</View>

        {tab !== "moderators" && myShelves.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
            {[{ key: "", label: "كل رفوفي", color: ITHRAA }, ...myShelves].map((s) => (
              <View key={s.key || "all"} style={{ transform: [{ scaleX: -1 }] }}>
                <Pill label={s.label} on={shelf === s.key} onPress={() => setShelf(s.key)} color={s.color} />
              </View>
            ))}
          </ScrollView>
        )}

        {loading && !refreshing && <ActivityIndicator color={ITHRAA} style={{ marginTop: 30 }} />}

        {!loading && tab === "moderators" && token && meta && <Moderators token={token} meta={meta} />}

        {!loading && tab !== "moderators" && (
          <View style={{ marginTop: 14, gap: 12 }}>
            {items.map((it) => <ReviewCard key={it.id} item={it} meta={meta!} token={token!} myShelves={myShelves.map((s) => s.key)} onDone={load} />)}
            {!items.length && (
              <Empty icon={tab === "pending" ? "checkmark-done-circle-outline" : "file-tray-outline"}
                title={tab === "pending" ? "لا توجد مساهمات بانتظار المراجعة" : "لا شيء هنا"}
                sub={tab === "pending" ? "أحسنت! ستصلك إشعارات عند وصول مساهمات جديدة." : undefined} />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ReviewCard({ item: it, meta, token, myShelves, onDone }: { item: IthraaItem; meta: IthraaMeta; token: string; myShelves: string[]; onDone: () => void }) {
  const [note, setNote] = useState(it.review_note || "");
  const [category, setCategory] = useState(it.category);
  const [moving, setMoving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const color = meta.shelves.find((s) => s.key === category)?.color ?? ITHRAA;
  const rights = RIGHTS_OPTIONS.find((r) => r.key === it.rights);

  const act = async (action: "approve" | "reject" | "feature" | "unfeature" | "unpublish") => {
    if (action === "reject" && note.trim().length < 3) return notify("سبب الرفض", "اكتب ملاحظة واضحة لصاحب المساهمة.");
    if (action === "unpublish" && !(await confirmAction("إلغاء النشر", "سيُخفى عن القرّاء ويعود لقائمة المراجعة.", "إلغاء النشر", true))) return;
    setBusy(true);
    try { await ithraaApi.act(token, it.id, action, note.trim() || undefined, category !== it.category ? category : undefined); onDone(); }
    catch (e: any) { notify("تعذّر التنفيذ", e?.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmAction("حذف نهائي", `حذف «${it.title}» وملفه نهائياً؟`, "حذف", true))) return;
    try { await ithraaApi.remove(token, it.id); onDone(); } catch (e: any) { notify("تعذّر الحذف", e?.message); }
  };

  return (
    <View style={[u.card, { borderRightWidth: 4, borderRightColor: color }]}>
      <Pressable onPress={() => router.push({ pathname: "/ithraa-item", params: { id: String(it.id) } } as any)} style={[u.rowR, { gap: 12, alignItems: "flex-start" }]}>
        {it.kind === "book" ? <BookCover item={it} color={color} width={58} /> : (
          <View style={[st.artIcon, { backgroundColor: ITHRAA_GOLD + "1F" }]}><Ionicons name="newspaper" size={24} color={ITHRAA_GOLD} /></View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <View style={[u.rowR, { gap: 6, flexWrap: "wrap" }]}>
            <Text style={[st.kindChip, { color }]}>{it.kind === "book" ? "كتاب" : "مقال"} · {meta.shelves.find((s) => s.key === category)?.label}</Text>
            {it.status !== "pending" && <StatusChip status={it.status} />}
            {it.featured && <Text style={[st.kindChip, { color: ITHRAA_GOLD }]}>★ مختار</Text>}
          </View>
          <Text style={st.title} numberOfLines={2}>{it.title}</Text>
          {!!it.author_name && <Text style={u.hint}>تأليف: {it.author_name}</Text>}
          <Text style={u.hint}>
            {fmtDate(it.created_at)}{it.file_format ? ` · ${it.file_format.toUpperCase()}` : ""}{it.file_size ? ` · ${fmtSize(it.file_size)}` : ""}
            {it.read_minutes ? ` · ${it.read_minutes} د قراءة` : ""}{it.source === "link" ? " · رابط خارجي" : ""}
          </Text>
        </View>
      </Pressable>

      <View style={[u.rowR, { gap: 8, marginTop: 10 }]}>
        <UserAvatar name={it.uploader_name} avatarUrl={it.uploader_avatar} size={26} />
        <Text style={[u.hint, { flex: 1 }]}>{it.uploader_name}{rights ? ` · ${rights.label}` : ""}{it.reviewer_name && it.status !== "pending" ? ` · راجعها ${it.reviewer_name}` : ""}</Text>
      </View>

      {(!!it.description || !!it.body) && (
        <Pressable onPress={() => setExpanded((e) => !e)}>
          <Text style={st.preview} numberOfLines={expanded ? undefined : 3}>{it.kind === "article" ? it.body : it.description}</Text>
          <Text style={st.more}>{expanded ? "إخفاء" : "عرض المزيد"}</Text>
        </Pressable>
      )}

      {it.kind === "book" && !!it.file_url && (
        <Pressable onPress={() => openExternal(it.file_url!)} style={[u.ghostBtn, { marginTop: 8 }]}>
          <Ionicons name="eye-outline" size={16} color={Colors.textPrimary} /><Text style={u.ghostText}>معاينة الملف قبل القرار</Text>
        </Pressable>
      )}

      {it.status === "pending" && (
        <>
          <Pressable onPress={() => setMoving((m) => !m)} style={[u.rowR, { gap: 4, marginTop: 10 }]}>
            <Ionicons name="swap-horizontal" size={14} color={ITHRAA} />
            <Text style={st.more}>{moving ? "إغلاق" : "نقل إلى رف آخر"}</Text>
          </Pressable>
          {moving && (
            <View style={[u.wrap, { marginTop: 8 }]}>
              {meta.shelves.filter((s) => myShelves.includes(s.key)).map((s) => <Pill key={s.key} label={s.label} on={category === s.key} onPress={() => setCategory(s.key)} color={s.color} />)}
            </View>
          )}
          <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة لصاحب المساهمة (إلزامية عند الرفض)" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 10, minHeight: 56, textAlignVertical: "top" }]} multiline maxLength={400} />
        </>
      )}

      <View style={[u.rowR, { gap: 8, marginTop: 10, flexWrap: "wrap" }]}>
        {it.status !== "approved" && <Btn label="موافقة ونشر" icon="checkmark-circle" color="#0E8A5F" onPress={() => act("approve")} busy={busy} />}
        {it.status === "pending" && <Btn label="رفض" icon="close-circle" color="#C0392B" onPress={() => act("reject")} busy={busy} />}
        {it.status === "approved" && <Btn label={it.featured ? "إلغاء التمييز" : "تمييز"} icon="star" color={ITHRAA_GOLD} onPress={() => act(it.featured ? "unfeature" : "feature")} busy={busy} />}
        {it.status === "approved" && <Btn label="إلغاء النشر" icon="eye-off" color="#B7791F" onPress={() => act("unpublish")} busy={busy} />}
        <Btn label="حذف" icon="trash" color="#7A8794" onPress={remove} busy={busy} />
      </View>
    </View>
  );
}

function Moderators({ token, meta }: { token: string; meta: IthraaMeta }) {
  const [mods, setMods] = useState<IthraaModerator[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<IthraaUserHit[]>([]);
  const [picked, setPicked] = useState<IthraaUserHit | null>(null);
  const [all, setAll] = useState(true);
  const [cats, setCats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { ithraaApi.moderators(token).then((r) => setMods(r.moderators)).catch((e) => notify("تعذّر التحميل", e?.message)); }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => ithraaApi.lookup(token, q.trim()).then((r) => setHits(r.users)).catch(() => setHits([])), 350);
    return () => clearTimeout(t);
  }, [q, token]);

  const label = (keys: string[] | null) => !keys ? "كل الرفوف" : keys.map((k) => meta.shelves.find((s) => s.key === k)?.label ?? k).join("، ");
  const toggle = (k: string) => setCats((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const edit = (m: IthraaModerator) => {
    setPicked({ id: m.user_id, name: m.name, phone: m.phone, avatar_url: m.avatar_url, role: "" });
    setAll(!m.categories); setCats(m.categories ?? []); setQ(""); setHits([]);
  };
  const save = async () => {
    if (!picked) return;
    if (!all && !cats.length) return notify("الرفوف", "اختر رفاً واحداً على الأقل أو «كل الرفوف».");
    setSaving(true);
    try {
      await ithraaApi.setModerator(token, picked.id, all ? null : cats);
      notify("تم", `${picked.name} مشرف على: ${all ? "كل الرفوف" : label(cats)}`);
      setPicked(null); setCats([]); setAll(true); load();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setSaving(false); }
  };
  const remove = async (m: IthraaModerator) => {
    if (!(await confirmAction("إزالة مشرف", `إزالة ${m.name} من مشرفي «إثراء»؟`, "إزالة", true))) return;
    try { await ithraaApi.removeModerator(token, m.user_id); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };

  return (
    <View style={{ marginTop: 14, gap: 12 }}>
      <View style={u.card}>
        <Text style={st.title}>{picked ? `صلاحيات ${picked.name}` : "تعيين مشرف جديد"}</Text>
        <Text style={u.hint}>المشرف يراجع الكتب والمقالات في رفوفه ويوافق عليها أو يرفضها، وينشر مساهماته مباشرة. مسؤولو التطبيق مشرفون على كل الرفوف تلقائياً.</Text>
        {!picked ? (
          <>
            <TextInput value={q} onChangeText={setQ} placeholder="ابحث بالاسم أو رقم الهاتف أو رقم الحساب" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 10 }]} />
            {hits.map((h) => (
              <Pressable key={h.id} onPress={() => { setPicked(h); setQ(""); setHits([]); }} style={st.hit}>
                <UserAvatar name={h.name} avatarUrl={h.avatar_url} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={st.hitName}>{h.name}</Text>
                  <Text style={u.hint}>#{h.id}{h.phone ? ` · ${h.phone}` : ""}</Text>
                </View>
                <Ionicons name="add-circle" size={22} color={ITHRAA} />
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <View style={[u.rowR, { gap: 8, marginTop: 10 }]}>
              <Pill label="كل الرفوف" on={all} onPress={() => setAll(true)} icon="albums-outline" />
              <Pill label="رفوف محددة" on={!all} onPress={() => setAll(false)} icon="funnel-outline" />
            </View>
            {!all && <View style={[u.wrap, { marginTop: 10 }]}>{meta.shelves.map((s) => <Pill key={s.key} label={s.label} on={cats.includes(s.key)} onPress={() => toggle(s.key)} color={s.color} />)}</View>}
            <View style={[u.rowR, { gap: 8, marginTop: 12 }]}>
              <Pressable onPress={save} disabled={saving} style={[u.primaryBtn, { flex: 1, paddingVertical: 10 }]}>
                {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="shield-checkmark" size={17} color="#fff" />}
                <Text style={[u.primaryText, { fontSize: 14 }]}>حفظ التعيين</Text>
              </Pressable>
              <Pressable onPress={() => setPicked(null)} style={[u.ghostBtn, { paddingHorizontal: 18 }]}><Text style={u.ghostText}>إلغاء</Text></Pressable>
            </View>
          </>
        )}
      </View>

      <Text style={[st.title, { marginTop: 4 }]}>المشرفون الحاليون ({mods.length})</Text>
      {mods.map((m) => (
        <View key={m.user_id} style={[u.card, { flexDirection: "row-reverse", alignItems: "center", gap: 10 }]}>
          <UserAvatar name={m.name} avatarUrl={m.avatar_url} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={st.hitName}>{m.name}</Text>
            <Text style={u.hint} numberOfLines={2}>{label(m.categories)} · راجع {m.reviewed}</Text>
          </View>
          <Pressable onPress={() => edit(m)} hitSlop={8} style={st.iconBtn} accessibilityLabel="تعديل"><Ionicons name="create-outline" size={18} color={ITHRAA} /></Pressable>
          <Pressable onPress={() => remove(m)} hitSlop={8} style={st.iconBtn} accessibilityLabel="إزالة"><Ionicons name="trash-outline" size={18} color="#C0392B" /></Pressable>
        </View>
      ))}
      {!mods.length && <Empty icon="people-outline" title="لم يُعيَّن مشرفون بعد" sub="ابحث عن عضو أعلاه وعيّنه مشرفاً على كل الرفوف أو على رفوف بعينها." />}
    </View>
  );
}

function Btn({ label, icon, color, onPress, busy }: { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={[st.btn, { backgroundColor: color + "14", borderColor: color + "55", opacity: busy ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[st.btnT, { color }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 24 },
  bar: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "center" },
  barSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "center" },
  artIcon: { width: 58, height: 58, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  kindChip: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right", lineHeight: 22 },
  preview: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22, marginTop: 10 },
  more: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: ITHRAA, textAlign: "right" },
  btn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 11, borderWidth: 1 },
  btnT: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
  hit: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  hitName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
});
