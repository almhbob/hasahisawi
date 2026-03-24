import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";

// ─── Storage ──────────────────────────────────────────────────────────────────

export const NUMBERS_KEY = "important_numbers_v1";
export const NUMBERS_ADMIN_KEY = "admin_logged_in";
export const NUMBERS_PIN_KEY = "admin_pin";
const DEFAULT_PIN = "4444";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NumberEntry = {
  id: string;
  name: string;
  number: string;
  icon: string;
  color: string;
  category: string;
  note?: string;
};

type Category = {
  id: string;
  title: string;
  icon: string;
  color: string;
  numbers: NumberEntry[];
};

// ─── Static Emergency Numbers (real Sudan numbers) ────────────────────────────

const EMERGENCY_CATEGORY: Category = {
  id: "emergency",
  title: "الطوارئ",
  icon: "warning-outline",
  color: "#EF4444",
  numbers: [
    { id: "police",    name: "الشرطة",               number: "999", icon: "shield-checkmark-outline", color: "#3B82F6", category: "emergency", note: "متاح 24 ساعة" },
    { id: "ambulance", name: "الإسعاف",               number: "998", icon: "medkit-outline",           color: "#EF4444", category: "emergency", note: "متاح 24 ساعة" },
    { id: "fire",      name: "الدفاع المدني والإطفاء", number: "998", icon: "flame-outline",            color: "#F97316", category: "emergency", note: "متاح 24 ساعة" },
  ],
};

const CATEGORY_META: Record<string, { title: string; icon: string; color: string }> = {
  health:     { title: "الصحة",              icon: "heart-outline",     color: "#2D8A96" },
  services:   { title: "الخدمات العامة",     icon: "construct-outline", color: "#E07830" },
  government: { title: "الجهات الحكومية",    icon: "business-outline",  color: "#6366F1" },
  education:  { title: "التعليم",            icon: "school-outline",    color: "#8B5CF6" },
  other:      { title: "أخرى",              icon: "apps-outline",      color: Colors.primary },
};

const ICON_OPTIONS = [
  "hospital-outline","add-circle-outline","pulse-outline","flask-outline",
  "water-outline","flash-outline","car-outline","trash-outline",
  "business-outline","card-outline","scale-outline","receipt-outline",
  "school-outline","document-text-outline","call-outline","people-outline",
  "home-outline","shield-checkmark-outline","medkit-outline","flame-outline",
];

const COLOR_OPTIONS = ["#2D8A96","#27AE68","#E07830","#6366F1","#8B5CF6","#EF4444","#F97316","#EAB308","#EC4899","#10B981","#06B6D4","#3B82F6"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByCategory(entries: NumberEntry[]): Category[] {
  const map: Record<string, NumberEntry[]> = {};
  for (const e of entries) {
    const cat = e.category || "other";
    if (!map[cat]) map[cat] = [];
    map[cat].push(e);
  }
  return Object.entries(map).map(([catId, numbers]) => {
    const meta = CATEGORY_META[catId] ?? CATEGORY_META.other;
    return { id: catId, ...meta, numbers };
  });
}

async function loadNumbers(): Promise<NumberEntry[]> {
  const raw = await AsyncStorage.getItem(NUMBERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveNumbers(nums: NumberEntry[]): Promise<void> {
  await AsyncStorage.setItem(NUMBERS_KEY, JSON.stringify(nums));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NumberCard({ entry, index, isAdmin, onDelete }: { entry: NumberEntry; index: number; isAdmin: boolean; onDelete?: (id: string) => void }) {
  const handleCall = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${entry.number}`);
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify().damping(18)}>
      <AnimatedPress onPress={handleCall}>
        <View style={styles.card}>
          <View style={[styles.cardIcon, { backgroundColor: entry.color + "20" }]}>
            <Ionicons name={entry.icon as any} size={22} color={entry.color} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{entry.name}</Text>
            <Text style={[styles.cardNumber, { color: entry.color }]}>{entry.number}</Text>
            {entry.note ? <Text style={styles.cardNote}>{entry.note}</Text> : null}
          </View>
          {isAdmin && onDelete ? (
            <TouchableOpacity
              onPress={() => Alert.alert("حذف", `حذف "${entry.name}"؟`, [
                { text: "إلغاء", style: "cancel" },
                { text: "حذف", style: "destructive", onPress: () => onDelete(entry.id) },
              ])}
              style={styles.deleteBtn}
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          ) : (
            <View style={[styles.callBtn, { backgroundColor: entry.color + "18", borderColor: entry.color + "50" }]}>
              <Ionicons name="call" size={18} color={entry.color} />
              <Text style={[styles.callLabel, { color: entry.color }]}>اتصال</Text>
            </View>
          )}
        </View>
      </AnimatedPress>
    </Animated.View>
  );
}

function CategorySection({ cat, catIndex, isAdmin, onDelete }: { cat: Category; catIndex: number; isAdmin: boolean; onDelete?: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const isEmergency = cat.id === "emergency";

  return (
    <Animated.View entering={FadeInDown.delay(catIndex * 80).springify()} style={styles.section}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.selectionAsync();
          setExpanded(v => !v);
        }}
      >
        <LinearGradient
          colors={[cat.color + "28", cat.color + "10"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.sectionHeader}
        >
          <View style={[styles.sectionIconWrap, { backgroundColor: cat.color + "25", borderColor: cat.color + "40" }]}>
            <Ionicons name={cat.icon as any} size={18} color={cat.color} />
          </View>
          <Text style={[styles.sectionTitle, { color: cat.color }]}>{cat.title}</Text>
          {isEmergency && (
            <View style={[styles.pinBadge, { backgroundColor: "#EF444420", borderColor: "#EF444440" }]}>
              <Ionicons name="lock-closed" size={10} color="#EF4444" />
              <Text style={[styles.pinText, { color: "#EF4444" }]}>ثابت</Text>
            </View>
          )}
          <View style={styles.sectionBadge}>
            <Text style={[styles.sectionBadgeText, { color: cat.color }]}>{cat.numbers.length}</Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} style={{ marginRight: 4 }} />
        </LinearGradient>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.sectionBody}>
          {cat.numbers.map((entry, idx) => (
            <NumberCard
              key={entry.id}
              entry={entry}
              index={catIndex * 10 + idx}
              isAdmin={isAdmin && !isEmergency}
              onDelete={onDelete}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Add Number Modal ─────────────────────────────────────────────────────────

function AddNumberModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (e: NumberEntry) => void }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("health");
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [icon, setIcon] = useState(ICON_OPTIONS[0]);

  const reset = () => { setName(""); setNumber(""); setNote(""); setCategory("health"); setColor(COLOR_OPTIONS[0]); setIcon(ICON_OPTIONS[0]); };

  const save = () => {
    if (!name.trim() || !number.trim()) { Alert.alert("خطأ", "الاسم والرقم مطلوبان"); return; }
    onSave({ id: Date.now().toString(), name: name.trim(), number: number.trim(), note: note.trim() || undefined, category, color, icon });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            <Text style={modal.title}>إضافة رقم جديد</Text>

            <Text style={modal.label}>اسم الجهة *</Text>
            <TextInput style={modal.input} value={name} onChangeText={setName} placeholder="مثال: مستشفى الحصاحيصا" placeholderTextColor={Colors.textMuted} textAlign="right" />

            <Text style={modal.label}>رقم الهاتف *</Text>
            <TextInput style={modal.input} value={number} onChangeText={setNumber} placeholder="+249..." placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign="right" />

            <Text style={modal.label}>ملاحظة (اختياري)</Text>
            <TextInput style={modal.input} value={note} onChangeText={setNote} placeholder="مثال: 7ص – 5م" placeholderTextColor={Colors.textMuted} textAlign="right" />

            <Text style={modal.label}>التصنيف</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {Object.entries(CATEGORY_META).map(([id, meta]) => (
                <TouchableOpacity
                  key={id}
                  style={[modal.catChip, category === id && { backgroundColor: meta.color + "30", borderColor: meta.color }]}
                  onPress={() => setCategory(id)}
                >
                  <Ionicons name={meta.icon as any} size={14} color={category === id ? meta.color : Colors.textSecondary} />
                  <Text style={[modal.catChipText, category === id && { color: meta.color }]}>{meta.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={modal.label}>لون الأيقونة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {COLOR_OPTIONS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[modal.colorDot, { backgroundColor: c }, color === c && modal.colorDotActive]} />
              ))}
            </ScrollView>

            <Text style={modal.label}>الأيقونة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {ICON_OPTIONS.map(ic => (
                <TouchableOpacity key={ic} onPress={() => setIcon(ic)} style={[modal.iconBtn, icon === ic && { backgroundColor: color + "30", borderColor: color }]}>
                  <Ionicons name={ic as any} size={18} color={icon === ic ? color : Colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={modal.actions}>
              <TouchableOpacity style={modal.cancelBtn} onPress={() => { reset(); onClose(); }}>
                <Text style={modal.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modal.saveBtn, { backgroundColor: Colors.primary }]} onPress={save}>
                <Text style={modal.saveText}>حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NumbersScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [customNumbers, setCustomNumbers] = useState<NumberEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState("");

  const load = async () => {
    const nums = await loadNumbers();
    setCustomNumbers(nums);
    const adm = await AsyncStorage.getItem(NUMBERS_ADMIN_KEY);
    setIsAdmin(adm === "true");
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const customCategories = groupByCategory(customNumbers);
  const allCategories = [EMERGENCY_CATEGORY, ...customCategories];
  const total = allCategories.reduce((s, c) => s + c.numbers.length, 0);

  const handleDelete = async (id: string) => {
    const updated = customNumbers.filter(n => n.id !== id);
    await saveNumbers(updated);
    setCustomNumbers(updated);
  };

  const handleAdd = async (entry: NumberEntry) => {
    const updated = [...customNumbers, entry];
    await saveNumbers(updated);
    setCustomNumbers(updated);
  };

  const handleAdminLogin = async () => {
    const storedPin = await AsyncStorage.getItem(NUMBERS_PIN_KEY) || DEFAULT_PIN;
    if (pin === storedPin) {
      await AsyncStorage.setItem(NUMBERS_ADMIN_KEY, "true");
      setIsAdmin(true);
      setPin("");
      setShowPinModal(false);
    } else {
      Alert.alert("خطأ", "رمز PIN غير صحيح");
    }
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <LinearGradient
        colors={[Colors.bg, Colors.cardBg]}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <Animated.View entering={FadeIn.delay(60).duration(500)} style={styles.headerContent}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="call" size={26} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>الأرقام المهمة</Text>
            <Text style={styles.headerSub}>{total} رقم في {allCategories.length} أقسام — اضغط للاتصال المباشر</Text>
          </View>
          {isAdmin ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.adminBtn} onPress={() => setShowPinModal(true)}>
              <Ionicons name="settings-outline" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* ملخص الطوارئ */}
        <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.emergencyStrip}>
          <Ionicons name="alert-circle" size={16} color="#EF4444" />
          <Text style={styles.emergencyText}>طوارئ سريعة:</Text>
          <TouchableOpacity onPress={() => Linking.openURL("tel:999")} style={styles.emergencyChip}>
            <Ionicons name="shield" size={12} color="#3B82F6" />
            <Text style={[styles.emergencyChipText, { color: "#3B82F6" }]}>شرطة 999</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL("tel:998")} style={styles.emergencyChip}>
            <Ionicons name="medkit" size={12} color="#EF4444" />
            <Text style={[styles.emergencyChipText, { color: "#EF4444" }]}>إسعاف 998</Text>
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>

      {/* Categories */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {allCategories.map((cat, idx) => (
          <CategorySection
            key={cat.id}
            cat={cat}
            catIndex={idx}
            isAdmin={isAdmin}
            onDelete={handleDelete}
          />
        ))}

        {customNumbers.length === 0 && !isAdmin && (
          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.emptyHint}>
            <Ionicons name="phone-portrait-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyHintTitle}>لا توجد أرقام محلية بعد</Text>
            <Text style={styles.emptyHintSub}>يمكن للمسؤول إضافة أرقام المستشفيات والجهات المحلية والخدمات من خلال لوحة التحكم</Text>
          </Animated.View>
        )}

        {isAdmin && (
          <TouchableOpacity
            style={styles.addRow}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
            <Text style={styles.addRowText}>إضافة رقم جديد</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Add Modal */}
      <AddNumberModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleAdd} />

      {/* Admin PIN Modal */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <View style={modal.overlay}>
          <View style={[modal.sheet, { paddingBottom: 24 }]}>
            <Text style={modal.title}>دخول المسؤول</Text>
            <Text style={modal.label}>رمز PIN</Text>
            <TextInput
              style={modal.input}
              value={pin}
              onChangeText={setPin}
              placeholder="أدخل رمز PIN"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              keyboardType="number-pad"
              textAlign="right"
            />
            <View style={modal.actions}>
              <TouchableOpacity style={modal.cancelBtn} onPress={() => { setPin(""); setShowPinModal(false); }}>
                <Text style={modal.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modal.saveBtn, { backgroundColor: Colors.primary }]} onPress={handleAdminLogin}>
                <Text style={modal.saveText}>دخول</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  headerIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.primary + "20", borderWidth: 1, borderColor: Colors.primary + "40", justifyContent: "center", alignItems: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 26, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  addBtn: { backgroundColor: Colors.primary, borderRadius: 12, padding: 10 },
  adminBtn: { backgroundColor: Colors.cardBg, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.divider },

  emergencyStrip: { flexDirection: "row", alignItems: "center", backgroundColor: "#EF444415", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#EF444430", gap: 8, flexWrap: "wrap" },
  emergencyText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  emergencyChip: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, gap: 5, borderWidth: 1, borderColor: Colors.divider },
  emergencyChipText: { fontFamily: "Cairo_700Bold", fontSize: 12 },

  scroll: { flex: 1 },
  section: { marginBottom: 16, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: Colors.divider },
  sectionHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  sectionIconWrap: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, flex: 1 },
  pinBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1 },
  pinText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  sectionBadge: { backgroundColor: Colors.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.divider },
  sectionBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  sectionBody: { backgroundColor: Colors.cardBg, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },

  card: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bg, borderRadius: 14, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: Colors.divider, gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: "center", alignItems: "center" },
  cardInfo: { flex: 1 },
  cardName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  cardNumber: { fontFamily: "Cairo_700Bold", fontSize: 17, marginTop: 2, textAlign: "right", letterSpacing: 0.5 },
  cardNote: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right", marginTop: 2 },
  callBtn: { flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, gap: 3, minWidth: 52 },
  callLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  deleteBtn: { backgroundColor: "#EF444415", borderRadius: 10, padding: 8, borderWidth: 1, borderColor: "#EF444430" },

  emptyHint: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 32, gap: 10 },
  emptyHintTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textSecondary, textAlign: "center" },
  emptyHintSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },

  addRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + "40", borderStyle: "dashed", marginBottom: 16 },
  addRowText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.primary },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, gap: 4 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, textAlign: "center", marginBottom: 12 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 4 },
  input: { backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, marginBottom: 10 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, marginRight: 8, backgroundColor: Colors.bg },
  catChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  colorDot: { width: 28, height: 28, borderRadius: 14, marginRight: 8, borderWidth: 2, borderColor: "transparent" },
  colorDotActive: { borderColor: Colors.textPrimary, transform: [{ scale: 1.2 }] },
  iconBtn: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg, marginRight: 8 },
  actions: { flexDirection: "row", gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  cancelText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  saveText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
