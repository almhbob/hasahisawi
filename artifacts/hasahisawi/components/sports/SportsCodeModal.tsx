/**
 * رمز القسم الرياضي: يعرضه (استرجاع) ويولّد رمزاً جديداً لمدير القسم — للمدير ومشرف «الرياضة والدوريات».
 * الرمز مستقل عن رمز الإدارة العام، والرمز القديم يتوقف فور توليد الجديد.
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { confirmAction, copyText, notify } from "@/lib/xplatform";

export default function SportsCodeModal({ token, visible, onClose }: { token: string; visible: boolean; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!visible) return;
    setBusy(true);
    fetch(`${getApiUrl()}/api/admin/sports/code`, { headers }).then(r => r.json())
      .then(d => { if (d.error) notify("تنبيه", d.error); setCode(d.code ?? null); setAt(d.updated_at ?? null); })
      .catch(() => notify("خطأ", "تعذّر الاتصال")).finally(() => setBusy(false));
  }, [visible]);

  const regenerate = async () => {
    if (code && !(await confirmAction("رمز جديد", "سيتوقف الرمز الحالي فوراً لكل من يستخدمه. متابعة؟", "توليد"))) return;
    setBusy(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/admin/sports/code`, { method: "POST", headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCode(d.code); setAt(d.updated_at);
    } catch (e: any) { notify("تعذّر التوليد", e?.message); }
    setBusy(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        <Pressable style={st.card} onPress={() => {}}>
          <View style={st.head}>
            <View style={st.icon}><Ionicons name="key" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>رمز القسم الرياضي</Text>
              <Text style={st.sub}>أعطه لمدير القسم ليدير الأخبار واللاعبين والمباريات دون رمز الإدارة العام</Text>
            </View>
          </View>
          {busy ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} /> : code ? (
            <>
              <Text style={st.code} selectable accessibilityLabel={`الرمز ${code.split("").join(" ")}`}>{code}</Text>
              {at ? <Text style={st.meta}>أُنشئ {new Date(at).toLocaleString("ar-SD", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</Text> : null}
              <TouchableOpacity style={st.copy} onPress={() => copyText(code).then(r => r === "copied" && notify("تم نسخ الرمز"))}>
                <Ionicons name="copy-outline" size={18} color={Colors.primary} /><Text style={st.copyText}>نسخ الرمز</Text>
              </TouchableOpacity>
            </>
          ) : <Text style={[st.meta, { marginVertical: 14 }]}>لم يُنشأ رمز للقسم بعد.</Text>}
          <TouchableOpacity style={st.primary} onPress={regenerate} disabled={busy}>
            <Ionicons name="refresh" size={18} color="#fff" /><Text style={st.primaryText}>{code ? "توليد رمز جديد" : "إنشاء رمز للقسم"}</Text>
          </TouchableOpacity>
          <Text style={st.hint}>المشرف الممنوح صلاحية «الرياضة والدوريات» من لوحة صلاحيات المشرفين يدخل الإدارة مباشرة بحسابه، بلا رمز.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 22 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 18, gap: 10, width: "100%", maxWidth: 460, alignSelf: "center" },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 14, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textMuted, textAlign: "right", lineHeight: 20 },
  code: { fontFamily: "Cairo_700Bold", fontSize: 30, letterSpacing: 4, color: Colors.primary, textAlign: "center", paddingVertical: 10, borderRadius: 16, backgroundColor: Colors.primary + "12", marginTop: 6 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  copy: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 14, borderWidth: 1.2, borderColor: Colors.primary + "50" },
  copyText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary },
  primary: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.primary },
  primaryText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right", lineHeight: 19 },
});
