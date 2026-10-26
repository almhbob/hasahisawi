// بطاقة إعدادات الأذان — تشغيل/إيقاف، الصوت، الصلوات، والتذكير المسبق
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { ADHAN_PRAYERS, ADHAN_VOICES, AdhanSettings, previewAdhan, stopAdhanPreview } from "@/lib/adhan";

const REMINDERS = [0, 5, 10, 15, 30];

export default function AdhanSettingsCard({ value, onChange }: { value: AdhanSettings; onChange: (v: AdhanSettings) => void }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const on = value.enabled;
  const activeCount = ADHAN_PRAYERS.filter((p) => value.prayers[p.key]).length;
  const voice = ADHAN_VOICES.find((v) => v.id === value.voice) || ADHAN_VOICES[0];

  const togglePreview = async (id: string) => {
    if (playing === id) { await stopAdhanPreview(); setPlaying(null); return; }
    const ok = await previewAdhan(id);
    setPlaying(ok ? id : null);
  };

  return (
    <View style={[st.card, on && st.cardOn]}>
      {/* السطر الرئيسي */}
      <View style={st.row}>
        <View style={[st.icon, { backgroundColor: on ? Colors.primary + "1A" : Colors.divider }]}>
          <Ionicons name={on ? "notifications" : "notifications-off-outline"} size={20} color={on ? Colors.primary : Colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[st.title, on && { color: Colors.primary }]}>{on ? "الأذان مُفعَّل" : "الأذان متوقف"}</Text>
          <Text style={st.sub}>
            {on ? `${voice.name} · ${activeCount} من 5 صلوات${value.remindBefore ? ` · تذكير قبل ${value.remindBefore} د` : ""}` : "لن يصلك أذان عند دخول الوقت"}
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={(v) => onChange({ ...value, enabled: v })}
          trackColor={{ false: Colors.divider, true: Colors.primary + "60" }}
          thumbColor={on ? Colors.primary : Colors.textMuted}
        />
      </View>

      <Pressable onPress={() => setOpen((o) => !o)} style={st.expand}>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
        <Text style={st.expandText}>{open ? "إخفاء الإعدادات" : "صوت الأذان والصلوات والتذكير"}</Text>
      </Pressable>

      {open && (
        <View style={{ gap: 14, marginTop: 6 }}>
          {/* الصوت */}
          <View style={{ gap: 8 }}>
            <Text style={st.section}>صوت الأذان</Text>
            {ADHAN_VOICES.map((v) => {
              const sel = value.voice === v.id;
              return (
                <Pressable
                  key={v.id}
                  disabled={!v.available}
                  onPress={() => onChange({ ...value, enabled: true, voice: v.id })}
                  style={[st.voice, sel && st.voiceSel, !v.available && { opacity: 0.55 }]}
                >
                  <Ionicons name={sel ? "radio-button-on" : "radio-button-off"} size={20} color={sel ? Colors.primary : Colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.voiceName, sel && { color: Colors.primary }]}>{v.name}</Text>
                    <Text style={st.voiceDesc}>{v.desc}</Text>
                  </View>
                  {v.asset && Platform.OS !== "web" && (
                    <Pressable hitSlop={8} onPress={() => togglePreview(v.id)} style={st.play}>
                      <Ionicons name={playing === v.id ? "stop" : "play"} size={14} color="#fff" />
                    </Pressable>
                  )}
                  {!v.available && <Text style={st.soon}>قريباً</Text>}
                </Pressable>
              );
            })}
          </View>

          {/* الصلوات */}
          <View style={{ gap: 8 }}>
            <Text style={st.section}>الصلوات التي يُؤذَّن لها</Text>
            <View style={st.chips}>
              {ADHAN_PRAYERS.map((p) => {
                const sel = value.prayers[p.key];
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => onChange({ ...value, prayers: { ...value.prayers, [p.key]: !sel } })}
                    style={[st.chip, sel && st.chipSel]}
                  >
                    <Ionicons name={sel ? "checkmark-circle" : "ellipse-outline"} size={15} color={sel ? "#fff" : Colors.textMuted} />
                    <Text style={[st.chipText, sel && { color: "#fff" }]}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* التذكير */}
          <View style={{ gap: 8 }}>
            <Text style={st.section}>تذكير قبل الأذان</Text>
            <View style={st.chips}>
              {REMINDERS.map((m) => {
                const sel = value.remindBefore === m;
                return (
                  <Pressable key={m} onPress={() => onChange({ ...value, remindBefore: m })} style={[st.chip, sel && st.chipSel]}>
                    <Text style={[st.chipText, sel && { color: "#fff" }]}>{m === 0 ? "بدون" : `${m} د`}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={st.note}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={st.noteText}>
              يعمل الأذان والتطبيق مغلق. إن لم تسمعه فتأكد من السماح بالإشعارات وعدم تفعيل وضع عدم الإزعاج، واستثنِ التطبيق من «توفير البطارية».
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    direction: "ltr",
    marginHorizontal: 16, marginTop: 10, marginBottom: 4, padding: 14, borderRadius: 18,
    backgroundColor: Colors.cardBg, borderWidth: 1.5, borderColor: Colors.divider,
  },
  cardOn: { borderColor: Colors.primary + "45" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 1 },
  expand: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  expandText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  section: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  voice: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider },
  voiceSel: { borderColor: Colors.primary, backgroundColor: Colors.primary + "0D" },
  voiceName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  voiceDesc: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  play: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  soon: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider },
  chipSel: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  note: { flexDirection: "row-reverse", gap: 6, alignItems: "flex-start" },
  noteText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 11.5, lineHeight: 19, color: Colors.textSecondary, textAlign: "right" },
});
