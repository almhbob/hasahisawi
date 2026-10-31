import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { REPORT_REASONS, reportContent, type ReportReason } from "@/lib/social-safety";
import { notify } from "@/lib/xplatform";

export type ReportTarget = { type: "post" | "comment"; id: number } | null;

/** نافذة الإبلاغ عن منشور أو تعليق: اختيار السبب + تفاصيل اختيارية. */
export default function ReportSheet({
  target, token, onClose, onReported,
}: {
  target: ReportTarget;
  token?: string | null;
  onClose: () => void;
  onReported?: (target: NonNullable<ReportTarget>) => void;
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (target) { setReason(null); setDetails(""); }
  }, [target?.type, target?.id]);

  const submit = async () => {
    if (!target || !reason) return;
    setSending(true);
    try {
      const r = await reportContent(target.type, target.id, reason, details.trim(), token);
      onClose();
      onReported?.(target);
      notify(
        "شكراً لك",
        r.already
          ? "سبق أن أبلغت عن هذا المحتوى، وهو قيد المراجعة."
          : "وصل بلاغك إلى فريق الإدارة وسيُراجع في أقرب وقت. لن يعرف صاحب المحتوى أنك أبلغت.",
      );
    } catch (e: any) {
      notify("تعذّر الإبلاغ", e?.message || "حاول مرة أخرى");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={s.overlay} onPress={onClose}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.handle} />
            <View style={s.head}>
              <Ionicons name="flag" size={18} color={Colors.danger} />
              <Text style={s.title}>
                الإبلاغ عن {target?.type === "comment" ? "تعليق" : "منشور"}
              </Text>
            </View>
            <Text style={s.hint}>لماذا تبلّغ عن هذا المحتوى؟</Text>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
              {REPORT_REASONS.map((r) => {
                const on = reason === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    style={[s.reason, on && s.reasonOn]}
                    onPress={() => setReason(r.key)}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Ionicons name={r.icon as any} size={18} color={on ? Colors.danger : Colors.textMuted} />
                    <Text style={[s.reasonText, on && { color: Colors.danger }]}>{r.label}</Text>
                    <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={18} color={on ? Colors.danger : Colors.divider} />
                  </TouchableOpacity>
                );
              })}
              <TextInput
                style={s.input}
                value={details}
                onChangeText={setDetails}
                placeholder="تفاصيل إضافية (اختياري)"
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={500}
                textAlign="right"
              />
            </ScrollView>
            <View style={s.actions}>
              <TouchableOpacity style={[s.btn, s.btnPrimary, (!reason || sending) && { opacity: 0.5 }]} disabled={!reason || sending} onPress={submit}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryText}>إرسال البلاغ</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={onClose}>
                <Text style={s.btnGhostText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type ActionItem = { key: string; label: string; icon: string; danger?: boolean; onPress: () => void };

/** قائمة إجراءات سفلية بسيطة (⋯) — تعمل على أندرويد وiOS والويب بنفس الشكل. */
export function ActionSheet({ visible, title, items, onClose }: {
  visible: boolean; title?: string; items: ActionItem[]; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.handle} />
          {title ? <Text style={[s.hint, { textAlign: "center", marginBottom: 6 }]} numberOfLines={1}>{title}</Text> : null}
          {items.map((it) => (
            <TouchableOpacity
              key={it.key}
              style={s.item}
              onPress={() => { onClose(); setTimeout(it.onPress, 250); }}
              activeOpacity={0.75}
            >
              <Ionicons name={it.icon as any} size={20} color={it.danger ? Colors.danger : Colors.text} />
              <Text style={[s.itemText, it.danger && { color: Colors.danger }]}>{it.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[s.btn, s.btnGhost, { marginTop: 8 }]} onPress={onClose}>
            <Text style={s.btnGhostText}>إلغاء</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 4 },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginVertical: 10 },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 4 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 10 },
  reason: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
  },
  reasonOn: { borderColor: Colors.danger, backgroundColor: Colors.dangerSoft },
  reasonText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right" },
  input: {
    minHeight: 70, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, padding: 10,
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.text, textAlignVertical: "top",
  },
  actions: { flexDirection: "row-reverse", gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: Colors.danger },
  btnPrimaryText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  btnGhost: { backgroundColor: Colors.bg },
  btnGhostText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  item: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider },
  itemText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.text, textAlign: "right", flex: 1 },
});
