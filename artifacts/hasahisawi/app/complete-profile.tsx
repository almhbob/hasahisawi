import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator,
  Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

const NEIGHBORHOODS = [
  "الحي الشرقي", "الحي الأوسط", "حي الواحة", "حي الصفاء", "حي الزهور",
  "حي العمدة", "حي الموظفين", "حي كريمة", "حي الفيحاء", "حي الصداقة",
  "حي المايقوما", "حي الضقالة", "حي فور", "الامتداد", "الحلة الجديدة",
  "المنصورة", "المزاد", "الكرمك", "الكومبو", "الجملونات", "الطائف",
  "ود الكامل", "أركويت", "الطالباب", "الكشامر", "أم دغينة", "أم عضام",
  "أم شبانة", "مربع الفاتح", "جبرة", "حلة السودان", "ود حسون",
  "الشيخ أحمد", "حي البنك", "حي الكبير", "أبو صابر", "الكبش",
];

export default function CompleteProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, completeProfile } = useAuth();

  const [gender, setGender]           = useState<"male" | "female" | null>(user?.gender ?? null);
  const [neighborhood, setNeighborhood] = useState<string>(user?.neighborhood ?? "");
  const [search, setSearch]           = useState("");
  const [saving, setSaving]           = useState(false);

  const filtered = search.trim()
    ? NEIGHBORHOODS.filter(n => n.includes(search.trim()))
    : NEIGHBORHOODS;

  const canSave = !!gender && neighborhood.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await completeProfile(gender!, neighborhood.trim());
      router.replace("/(tabs)/" as any);
    } catch (e: any) {
      Alert.alert("خطأ", e?.message || "تعذّر الحفظ، حاول مرة أخرى");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* رأس الشاشة */}
        <View style={s.header}>
          <View style={s.iconWrap}>
            <Ionicons name="person-circle-outline" size={52} color={Colors.primary} />
          </View>
          <Text style={s.title}>أكمل ملفك الشخصي</Text>
          <Text style={s.subtitle}>
            بيانات مهمة تساعدنا على تقديم خدمات مناسبة لك
          </Text>
        </View>

        {/* ─── الجنس ─── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>الجنس</Text>
            <View style={s.required}><Text style={s.requiredTxt}>مطلوب</Text></View>
          </View>
          <View style={s.genderRow}>
            <TouchableOpacity
              style={[s.genderBtn, gender === "male" && s.genderBtnActive]}
              onPress={() => setGender("male")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="male"
                size={26}
                color={gender === "male" ? "#fff" : Colors.textMuted}
              />
              <Text style={[s.genderTxt, gender === "male" && s.genderTxtActive]}>ذكر</Text>
              {gender === "male" && (
                <View style={s.checkMark}>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.genderBtn, s.genderBtnFemale, gender === "female" && s.genderBtnFemaleActive]}
              onPress={() => setGender("female")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="female"
                size={26}
                color={gender === "female" ? "#fff" : Colors.textMuted}
              />
              <Text style={[s.genderTxt, gender === "female" && s.genderTxtActive]}>أنثى</Text>
              {gender === "female" && (
                <View style={s.checkMark}>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── الحي / المنطقة ─── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>الحي / المنطقة</Text>
            <View style={s.required}><Text style={s.requiredTxt}>مطلوب</Text></View>
          </View>

          {/* حقل بحث */}
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="ابحث عن حيك..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              textAlign="right"
              returnKeyType="search"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* الحي المختار */}
          {neighborhood ? (
            <View style={s.selectedBadge}>
              <Ionicons name="location" size={14} color={Colors.primary} />
              <Text style={s.selectedBadgeTxt}>{neighborhood}</Text>
              <TouchableOpacity onPress={() => setNeighborhood("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* قائمة الأحياء */}
          <View style={s.nbrGrid}>
            {filtered.map(nbr => (
              <TouchableOpacity
                key={nbr}
                style={[s.nbrChip, neighborhood === nbr && s.nbrChipActive]}
                onPress={() => { setNeighborhood(nbr); setSearch(""); }}
                activeOpacity={0.75}
              >
                <Text style={[s.nbrChipTxt, neighborhood === nbr && s.nbrChipTxtActive]}>
                  {nbr}
                </Text>
              </TouchableOpacity>
            ))}
            {/* خيار "خارج المدينة" */}
            {(search === "" || "خارج المدينة".includes(search)) && (
              <TouchableOpacity
                style={[s.nbrChip, neighborhood === "خارج المدينة" && s.nbrChipActive]}
                onPress={() => { setNeighborhood("خارج المدينة"); setSearch(""); }}
                activeOpacity={0.75}
              >
                <Text style={[s.nbrChipTxt, neighborhood === "خارج المدينة" && s.nbrChipTxtActive]}>
                  خارج المدينة
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* زر الحفظ */}
        <TouchableOpacity
          style={[s.saveBtn, !canSave && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={s.saveBtnTxt}>متابعة إلى التطبيق</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#070D0A",
  },
  scroll: {
    padding: 20,
    gap: 20,
  },
  header: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 8,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  section: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  sectionHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: Colors.textPrimary,
  },
  required: {
    backgroundColor: Colors.accent + "22",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  requiredTxt: {
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
    color: Colors.accent,
  },
  genderRow: {
    flexDirection: "row-reverse",
    gap: 12,
  },
  genderBtn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.divider,
    backgroundColor: Colors.surface1,
    gap: 6,
    position: "relative",
  },
  genderBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "22",
  },
  genderBtnFemale: {},
  genderBtnFemaleActive: {
    borderColor: "#E05567",
    backgroundColor: "#E0556720",
  },
  genderTxt: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 15,
    color: Colors.textMuted,
  },
  genderTxtActive: {
    color: Colors.textPrimary,
  },
  checkMark: {
    position: "absolute",
    top: 8,
    left: 8,
  },
  searchBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: Colors.surface1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
  },
  selectedBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary + "18",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-end",
    borderWidth: 1,
    borderColor: Colors.primary + "40",
  },
  selectedBadgeTxt: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.primary,
  },
  nbrGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  nbrChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.surface1,
  },
  nbrChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "20",
  },
  nbrChipTxt: {
    fontFamily: "Cairo_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
  },
  nbrChipTxtActive: {
    color: Colors.primary,
    fontFamily: "Cairo_600SemiBold",
  },
  saveBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnTxt: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#fff",
  },
});
