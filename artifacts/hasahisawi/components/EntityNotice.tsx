/**
 * شاشة تنبيه حالة المنشأة + لوحة صاحبها:
 *  • <EntityNotice>: «موقوف لمخالفة» (يرى صاحبه السبب) أو «غير متاح مؤقتاً» برسالة وموعد الاستئناف.
 *  • <PauseControl>: يفعّل به صاحب المنشأة الإيقاف المؤقت ويحدد رسالة وموعد العودة.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";

export type EntityType = "food" | "store" | "fuel" | "club" | "org" | "community";
export type EntityStatus = { suspended: boolean; suspend_reason?: string | null; paused: boolean; pause_message?: string | null; resume_at?: string | null };

export function useEntityStatus(type: EntityType, id?: number | string | null) {
  const { token } = useAuth();
  const [status, setStatus] = useState<EntityStatus | null>(null);
  const [isOwner, setOwner] = useState(false);
  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`${getApiUrl()}/api/entity-status/${type}/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const d = await r.json();
      if (r.ok) { setStatus(d.status); setOwner(!!d.is_owner); }
    } catch { /* الحالة اختيارية: لا نعطّل الصفحة */ }
  }, [type, id, token]);
  useEffect(() => { reload(); }, [reload]);
  return { status, isOwner, reload, unavailable: !!status && (status.suspended || status.paused) };
}

/** حالات عدة منشآت دفعة واحدة (للقوائم) */
export async function fetchStatuses(type: EntityType, ids: number[]): Promise<Record<number, EntityStatus>> {
  if (!ids.length) return {};
  try {
    const r = await fetch(`${getApiUrl()}/api/entity-status?type=${type}&ids=${ids.slice(0, 300).join(",")}`);
    return (await r.json()).statuses || {};
  } catch { return {}; }
}

export function fmtResume(iso?: string | null) {
  if (!iso) return "قريباً";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("ar-SD", { hour: "numeric", minute: "2-digit" });
  return sameDay ? `اليوم ${time}` : tomorrow ? `غداً ${time}` : `${d.toLocaleDateString("ar-SD", { weekday: "long", day: "numeric", month: "long" })} ${time}`;
}

export function EntityNotice({ status, isOwner, compact }: { status: EntityStatus | null; isOwner?: boolean; compact?: boolean }) {
  if (!status || (!status.suspended && !status.paused)) return null;
  if (status.suspended) {
    return (
      <Animated.View entering={FadeIn} style={[s.card, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]} accessibilityRole="alert">
        <View style={[s.icon, { backgroundColor: "#FEE2E2" }]}><Ionicons name="ban" size={compact ? 20 : 26} color="#B91C1C" /></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: "#991B1B" }]}>{isOwner ? "أوقفت الإدارة منشأتك" : "الخدمة موقوفة حالياً"}</Text>
          <Text style={s.body}>{isOwner ? `السبب: ${status.suspend_reason || "مخالفة لشروط الاستخدام"}. منشأتك مخفية عن الجمهور حتى تُعالج المخالفة — تواصل مع إدارة التطبيق.` : "هذه المنشأة غير متاحة للطلب أو التواصل عبر التطبيق في الوقت الحالي."}</Text>
        </View>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={FadeIn} style={[s.card, { backgroundColor: "#FFFBEB", borderColor: "#FCD34D" }]} accessibilityRole="alert">
      <View style={[s.icon, { backgroundColor: "#FEF3C7" }]}><Ionicons name="moon" size={compact ? 20 : 26} color="#B45309" /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: "#92400E" }]}>غير متاح مؤقتاً</Text>
        {status.pause_message ? <Text style={s.body}>{status.pause_message}</Text> : null}
        <View style={s.resume}><Ionicons name="time-outline" size={14} color="#B45309" /><Text style={s.resumeText}>نعود {fmtResume(status.resume_at)}</Text></View>
      </View>
    </Animated.View>
  );
}

const PRESETS = [
  { label: "ساعة", h: 1 }, { label: "3 ساعات", h: 3 }, { label: "حتى الغد", h: -1 }, { label: "أسبوع", h: 24 * 7 }, { label: "دون موعد", h: 0 },
];
const MSGS = ["مغلق للصلاة وسنعود قريباً", "نفد المخزون مؤقتاً", "إجازة رسمية", "صيانة وتجديد", "خارج أوقات العمل"];

export function PauseControl({ type, id, onChanged }: { type: EntityType; id: number; onChanged?: () => void }) {
  const { token } = useAuth();
  const { status, reload } = useEntityStatus(type, id);
  const [msg, setMsg] = useState("");
  const [preset, setPreset] = useState(2);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (status?.pause_message) setMsg(status.pause_message); }, [status?.pause_message]);

  const apply = async (paused: boolean) => {
    setBusy(true);
    try {
      const p = PRESETS[preset];
      let resume: string | null = null;
      if (paused && p.h > 0) resume = new Date(Date.now() + p.h * 3600000).toISOString();
      if (paused && p.h === -1) { const t = new Date(Date.now() + 86400000); t.setHours(8, 0, 0, 0); resume = t.toISOString(); }
      const r = await fetch(`${getApiUrl()}/api/entity-status/${type}/${id}/pause`, {
        method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ paused, message: msg, resume_at: resume }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error);
      await reload(); onChanged?.();
      notify(paused ? "تم تفعيل التنبيه" : "عادت الخدمة", paused ? "يرى العملاء رسالتك وموعد العودة." : "منشأتك متاحة للعملاء الآن.");
    } catch (e: any) { notify("تعذّر التحديث", e?.message); }
    setBusy(false);
  };

  if (!status) return <ActivityIndicator color={Colors.primary} />;
  return (
    <View style={s.panel}>
      {status.suspended ? <EntityNotice status={status} isOwner /> : null}
      <View style={s.panelHead}>
        <View style={[s.icon, { backgroundColor: status.paused ? "#FEF3C7" : Colors.primary + "18" }]}>
          <Ionicons name={status.paused ? "moon" : "sunny"} size={22} color={status.paused ? "#B45309" : Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.panelTitle}>{status.paused ? "الخدمة متوقفة مؤقتاً" : "الخدمة متاحة"}</Text>
          <Text style={s.panelSub}>{status.paused ? `تعود ${fmtResume(status.resume_at)}` : "فعّل التنبيه إن توقفت الخدمة مؤقتاً (صلاة، نفاد، إجازة…)"}</Text>
        </View>
        <Switch value={status.paused} onValueChange={v => (v ? apply(true) : apply(false))} disabled={busy} accessibilityLabel="غير متاح مؤقتاً"
          trackColor={{ true: "#F59E0B88", false: Colors.divider }} thumbColor={status.paused ? "#F59E0B" : "#f4f4f4"} />
      </View>
      {!status.paused && (
        <>
          <Text style={s.label}>رسالة للعملاء</Text>
          <View style={s.chips}>
            {MSGS.map(m => <TouchableOpacity key={m} onPress={() => setMsg(m)} style={[s.chip, msg === m && s.chipOn]}><Text style={[s.chipText, msg === m && { color: "#fff" }]}>{m}</Text></TouchableOpacity>)}
          </View>
          <TextInput value={msg} onChangeText={setMsg} placeholder="أو اكتب رسالتك…" placeholderTextColor={Colors.textMuted} style={s.input} maxLength={300} />
          <Text style={s.label}>مدة التوقف</Text>
          <View style={s.chips}>
            {PRESETS.map((p, i) => <TouchableOpacity key={p.label} onPress={() => setPreset(i)} style={[s.chip, preset === i && s.chipOn]}><Text style={[s.chipText, preset === i && { color: "#fff" }]}>{p.label}</Text></TouchableOpacity>)}
          </View>
          <TouchableOpacity onPress={() => apply(true)} disabled={busy} style={s.pauseBtn}>
            {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="pause-circle" size={18} color="#fff" /><Text style={s.pauseText}>تفعيل «غير متاح مؤقتاً»</Text></>}
          </TouchableOpacity>
        </>
      )}
      {status.paused && (
        <TouchableOpacity onPress={() => apply(false)} disabled={busy} style={[s.pauseBtn, { backgroundColor: Colors.primary }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="play-circle" size={18} color="#fff" /><Text style={s.pauseText}>استئناف العمل الآن</Text></>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: "row-reverse", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1.5, alignItems: "flex-start" },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15.5, textAlign: "right" },
  body: { fontFamily: "Cairo_500Medium", fontSize: 13, color: "#44403C", textAlign: "right", lineHeight: 21, marginTop: 2 },
  resume: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 6, alignSelf: "flex-end", backgroundColor: "#FDE68A", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  resumeText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#92400E" },
  panel: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 14, gap: 10, ...Colors.shadow.card },
  panelHead: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  panelTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  panelSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  label: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  chipOn: { backgroundColor: "#F59E0B", borderColor: "#F59E0B" },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  input: { backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  pauseBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#F59E0B", borderRadius: 14, paddingVertical: 12 },
  pauseText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
});
