// 🧳 إدارة → وكالات السفر المعتمدة: عرض المالك والفريق لكل وكالة، وربط صاحب
// الوكالة (للوكالات المعتمدة قبل ميزة ربط المالك) عبر البحث بالاسم أو الهاتف.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import UserAvatar from "@/components/UserAvatar";
import { confirmAction, notify } from "@/lib/xplatform";

type Staff = { user_id: number; role: "owner" | "manager" | "agent"; name: string; phone: string | null; avatar_url: string | null };
type Agency = { id: number; name: string; city: string | null; phone: string | null; active: boolean; has_owner: boolean; staff: Staff[] };
type FoundUser = { id: number; name: string; phone: string | null; avatar_url: string | null };

const ROLE_LABEL: Record<Staff["role"], string> = { owner: "المالك", manager: "مدير", agent: "موظف حجوزات" };
const ACCENT = "#1D4ED8";

export default function TravelAgencyOwners({ apiBase, token }: { apiBase: string; token: string }) {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auth = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetch(`${apiBase}/api/admin/travel-agencies/approved`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "تعذّر تحميل الوكالات");
      setAgencies(Array.isArray(d.agencies) ? d.agencies : []);
    } catch (e: any) { setError(e?.message || "تعذّر الاتصال"); }
    finally { setLoading(false); }
  }, [apiBase, token]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (openId == null || term.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${apiBase}/api/admin/users/search?q=${encodeURIComponent(term)}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json().catch(() => ({}));
        setResults(r.ok && Array.isArray(d.users) ? d.users : []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, openId, apiBase, token]);

  function toggle(id: number) {
    setOpenId((cur) => (cur === id ? null : id));
    setQ(""); setResults([]);
  }

  async function link(a: Agency, u: FoundUser) {
    const prevOwner = a.staff.find((s) => s.role === "owner");
    const ok = await confirmAction("ربط صاحب الوكالة",
      `سيصبح «${u.name}» مالك «${a.name}» ويستلم لوحة إدارتها وإشعاراً بذلك.${prevOwner && prevOwner.user_id !== u.id ? `\nالمالك الحالي «${prevOwner.name}» يصبح مديراً.` : ""}`,
      "ربط");
    if (!ok) return;
    setLinking(u.id);
    try {
      const r = await fetch(`${apiBase}/api/admin/travel-agencies/${a.id}/owner`, {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: u.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "تعذّر الربط");
      notify("تم الربط", d.already ? `«${u.name}» هو مالك الوكالة مسبقاً.` : `أصبح «${u.name}» مالك «${a.name}» وأُرسل له إشعار.`);
      setOpenId(null); setQ(""); setResults([]);
      load();
    } catch (e: any) { notify("خطأ", e?.message || "تعذّر الاتصال"); }
    finally { setLinking(null); }
  }

  const term = filter.trim();
  const shown = term ? agencies.filter((a) => `${a.name} ${a.city ?? ""} ${a.phone ?? ""}`.includes(term)) : agencies;
  const missing = agencies.filter((a) => !a.has_owner).length;

  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={st.summary}>
        <Ionicons name={missing ? "alert-circle" : "checkmark-circle"} size={18} color={missing ? Colors.accentDeep : Colors.primaryDeep} />
        <Text style={st.summaryTxt}>
          {loading ? "جارٍ التحميل…" : missing ? `${missing} من ${agencies.length} وكالة بلا مالك مرتبط — اربط صاحب كل وكالة ليدير عروضها وطلباتها.` : `كل الوكالات (${agencies.length}) لها مالك مرتبط.`}
        </Text>
        <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={st.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="تحديث القائمة">
          <Ionicons name="refresh" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={st.searchBox}>
        <Ionicons name="search" size={16} color={Colors.textMuted} />
        <TextInput value={filter} onChangeText={setFilter} placeholder="ابحث باسم الوكالة أو المدينة" placeholderTextColor={Colors.textMuted}
          style={st.input} accessibilityLabel="بحث في الوكالات" />
      </View>

      {error ? (
        <View style={st.card}>
          <Text style={[st.muted, { color: Colors.danger }]}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={st.ghostBtn} accessibilityRole="button"><Text style={st.ghostTxt}>إعادة المحاولة</Text></TouchableOpacity>
        </View>
      ) : null}
      {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} /> : null}
      {!loading && !error && shown.length === 0 ? <Text style={[st.muted, { textAlign: "center", marginTop: 24 }]}>لا توجد وكالات معتمدة مطابقة</Text> : null}

      {shown.map((a) => {
        const owner = a.staff.find((s) => s.role === "owner");
        const open = openId === a.id;
        return (
          <View key={a.id} style={[st.card, !a.has_owner && st.cardWarn]}>
            <View style={st.row}>
              <View style={[st.logo, { backgroundColor: ACCENT + "1A" }]}><Ionicons name="airplane" size={18} color={ACCENT} /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.title} numberOfLines={2}>{a.name}</Text>
                <Text style={st.muted}>{[a.city, a.phone].filter(Boolean).join(" · ") || "—"}</Text>
              </View>
              <View style={[st.badge, { backgroundColor: a.has_owner ? Colors.successSoft : Colors.warningSoft }]}>
                <Text style={[st.badgeTxt, { color: a.has_owner ? Colors.primaryDeep : Colors.accentDeep }]}>{a.has_owner ? "له مالك" : "بلا مالك"}</Text>
              </View>
            </View>

            <View style={st.staffBox}>
              <Text style={st.lbl}>الفريق</Text>
              {a.staff.length === 0 ? <Text style={st.muted}>لا يوجد أحد مرتبط بهذه الوكالة بعد.</Text> : a.staff.map((s) => (
                <View key={s.user_id} style={st.staffRow}>
                  <UserAvatar name={s.name} avatarUrl={s.avatar_url} size={30} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.staffName}>{s.name}</Text>
                    {s.phone ? <Text style={st.muted}>{s.phone}</Text> : null}
                  </View>
                  <View style={[st.rolePill, s.role === "owner" && { backgroundColor: ACCENT }]}>
                    <Text style={[st.roleTxt, s.role === "owner" && { color: Colors.onColor }]}>{ROLE_LABEL[s.role] ?? s.role}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity onPress={() => toggle(a.id)} style={[st.linkBtn, open && st.linkBtnOpen]} accessibilityRole="button"
              accessibilityState={{ expanded: open }} accessibilityLabel={`ربط صاحب الوكالة ${a.name}`}>
              <Ionicons name={open ? "close" : "person-add"} size={16} color={open ? ACCENT : Colors.onColor} />
              <Text style={[st.linkTxt, open && { color: ACCENT }]}>{open ? "إغلاق" : owner ? "تغيير صاحب الوكالة" : "ربط صاحب الوكالة"}</Text>
            </TouchableOpacity>

            {open ? (
              <View style={st.lookup}>
                <Text style={st.lbl}>ابحث عن حساب صاحب الوكالة</Text>
                <View style={st.searchBox}>
                  <Ionicons name="person-circle-outline" size={18} color={Colors.textMuted} />
                  <TextInput value={q} onChangeText={setQ} autoFocus placeholder="الاسم أو رقم الهاتف (حرفان على الأقل)" placeholderTextColor={Colors.textMuted}
                    style={st.input} accessibilityLabel="بحث عن مستخدم بالاسم أو الهاتف" />
                  {searching ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
                </View>
                {q.trim().length >= 2 && !searching && results.length === 0 ? <Text style={st.muted}>لا يوجد مستخدم مطابق. تأكد أن صاحب الوكالة أنشأ حساباً في التطبيق.</Text> : null}
                {results.map((u) => {
                  const cur = a.staff.find((s) => s.user_id === u.id);
                  return (
                    <TouchableOpacity key={u.id} onPress={() => link(a, u)} disabled={linking != null || cur?.role === "owner"} style={[st.result, cur?.role === "owner" && { opacity: 0.55 }]}
                      accessibilityRole="button" accessibilityLabel={`اختيار ${u.name} مالكاً`}>
                      <UserAvatar name={u.name} avatarUrl={u.avatar_url} size={34} />
                      <View style={{ flex: 1 }}>
                        <Text style={st.staffName}>{u.name}</Text>
                        <Text style={st.muted}>{[u.phone, `#${u.id}`, cur ? `حالياً: ${ROLE_LABEL[cur.role]}` : ""].filter(Boolean).join(" · ")}</Text>
                      </View>
                      {linking === u.id ? <ActivityIndicator size="small" color={ACCENT} /> : <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 40, gap: 12 },
  summary: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle },
  summaryTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, lineHeight: 20, color: Colors.textSecondary, textAlign: "right" },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  searchBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, minHeight: 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  input: { flex: 1, minHeight: 44, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  card: { gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.cardBg },
  cardWarn: { borderRightWidth: 4, borderRightColor: Colors.warning },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  logo: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 18, color: Colors.textMuted, textAlign: "right" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeTxt: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  staffBox: { gap: 8, padding: 10, borderRadius: 12, backgroundColor: Colors.bg },
  lbl: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  staffRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  staffName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  rolePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  roleTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  linkBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, borderRadius: 12, backgroundColor: ACCENT },
  linkBtnOpen: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: ACCENT },
  linkTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.onColor },
  lookup: { gap: 8 },
  result: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 52, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.bg },
  ghostBtn: { alignSelf: "flex-end", minHeight: 40, paddingHorizontal: 14, justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  ghostTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
});
