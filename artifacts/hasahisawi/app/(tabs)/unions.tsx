import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity,
  Linking, Alert, ActivityIndicator, RefreshControl, Modal,
  Pressable, TextInput, Dimensions, KeyboardAvoidingView, FlatList,
} from "react-native";
import Animated, {
  FadeInDown, FadeIn, ZoomIn, useSharedValue,
  useAnimatedStyle, withSpring, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

const { width: W } = Dimensions.get("window");

const UC  = "#8B5CF6";
const UC2 = "#6D28D9";
const UC3 = "#C4B5FD";
const GOLD = "#F59E0B";

type Union = {
  id: number; name: string; short_name?: string; field?: string;
  description?: string; logo_url?: string; banner_url?: string;
  website?: string; email?: string; phone?: string; address?: string;
  founded?: string; members_count?: string; is_active: boolean;
  announcements?: Announcement[];
};

type Announcement = {
  id: number; union_id?: number; union_name?: string;
  title: string; body?: string; image_url?: string;
  link?: string; is_pinned: boolean; created_at: string;
};

type Program = {
  id: number; union_id?: number; union_name?: string; union_short_name?: string;
  title: string; description?: string; type: string;
  start_date?: string; end_date?: string; location?: string;
  max_participants?: number; fee?: string; contact?: string; link?: string;
  is_active: boolean; created_at: string;
};

type UnionLaw = {
  id: number; union_id?: number; union_name?: string; union_short_name?: string;
  title: string; body?: string; category: string;
  document_url?: string; effective_date?: string; version?: string;
  is_active: boolean; created_at: string;
};

type PrevUnion = { name: string; role: string; from: string; to: string };
type Reference = { name: string; phone: string; relation: string };

type MemberForm = {
  union_id: number | null;
  // شخصية
  full_name: string; national_id: string; birth_date: string; birth_place: string;
  gender: "male" | "female" | "";
  nationality: string; phone: string; alt_phone: string; email: string;
  address: string; neighborhood: string; city: string;
  // مهنية
  job_title: string; employer: string; work_address: string; work_phone: string;
  specialty: string; work_start_date: string; work_years: string;
  // أكاديمية
  degree: string; institution: string; graduation_year: string; field_of_study: string;
  // نقابية
  previous_unions: PrevUnion[]; union_roles: string; existing_membership_no: string;
  // أنشطة
  workshops: string[]; conferences: string[]; trainings: string[];
  achievements: string; skills: string;
  // مراجع
  references_list: Reference[];
  // عضوية
  membership_type: "regular" | "associate" | "honorary";
  notes: string;
};

const EMPTY_FORM: MemberForm = {
  union_id: null,
  full_name: "", national_id: "", birth_date: "", birth_place: "",
  gender: "", nationality: "سودانية", phone: "", alt_phone: "", email: "",
  address: "", neighborhood: "", city: "الحصاحيصا",
  job_title: "", employer: "", work_address: "", work_phone: "",
  specialty: "", work_start_date: "", work_years: "",
  degree: "", institution: "", graduation_year: "", field_of_study: "",
  previous_unions: [], union_roles: "", existing_membership_no: "",
  workshops: [], conferences: [], trainings: [],
  achievements: "", skills: "",
  references_list: [],
  membership_type: "regular", notes: "",
};

const DEGREES = ["دبلوم", "بكالوريوس", "ماجستير", "دكتوراه", "شهادة مهنية", "أخرى"];
const MEMBERSHIP_TYPES = [
  { key: "regular",   label: "عضو عامل"   },
  { key: "associate", label: "عضو منتسب"  },
  { key: "honorary",  label: "عضو فخري"   },
];

export default function UnionsScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [tab, setTab] = useState<"unions" | "programs" | "laws" | "apply" | "my">("unions");

  // Unions list
  const [unions, setUnions] = useState<Union[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUnion, setSelectedUnion] = useState<Union | null>(null);

  // Programs
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programTypeFilter, setProgramTypeFilter] = useState<string>("all");
  const [programUnionFilter, setProgramUnionFilter] = useState<number | null>(null);

  // Laws
  const [laws, setLaws] = useState<UnionLaw[]>([]);
  const [lawsLoading, setLawsLoading] = useState(false);
  const [lawCatFilter, setLawCatFilter] = useState<string>("all");
  const [lawUnionFilter, setLawUnionFilter] = useState<number | null>(null);
  const [expandedLaw, setExpandedLaw] = useState<number | null>(null);

  // Application form
  const [form, setForm] = useState<MemberForm>({ ...EMPTY_FORM });
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // My memberships
  const [myMemberships, setMyMemberships] = useState<any[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  const apiHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, aRes] = await Promise.all([
        fetchWithTimeout(`${getApiUrl()}/api/unions`, { headers: apiHeaders() }),
        fetchWithTimeout(`${getApiUrl()}/api/unions/announcements/all`, { headers: apiHeaders() }),
      ]);
      if (uRes.ok) setUnions(await uRes.json());
      if (aRes.ok) setAnnouncements(await aRes.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [apiHeaders]);

  const loadMyMemberships = useCallback(async () => {
    if (!token) return;
    setMyLoading(true);
    try {
      const r = await fetchWithTimeout(`${getApiUrl()}/api/unions/my-membership`, { headers: apiHeaders() });
      if (r.ok) setMyMemberships(await r.json());
    } catch {}
    finally { setMyLoading(false); }
  }, [token, apiHeaders]);

  const loadPrograms = useCallback(async () => {
    setProgramsLoading(true);
    try {
      const params = new URLSearchParams();
      if (programTypeFilter !== "all") params.set("type", programTypeFilter);
      if (programUnionFilter) params.set("union_id", String(programUnionFilter));
      const r = await fetchWithTimeout(`${getApiUrl()}/api/unions/programs?${params}`);
      if (r.ok) setPrograms(await r.json());
    } catch {} finally { setProgramsLoading(false); }
  }, [programTypeFilter, programUnionFilter]);

  const loadLaws = useCallback(async () => {
    setLawsLoading(true);
    try {
      const params = new URLSearchParams();
      if (lawCatFilter !== "all") params.set("category", lawCatFilter);
      if (lawUnionFilter) params.set("union_id", String(lawUnionFilter));
      const r = await fetchWithTimeout(`${getApiUrl()}/api/unions/laws?${params}`);
      if (r.ok) setLaws(await r.json());
    } catch {} finally { setLawsLoading(false); }
  }, [lawCatFilter, lawUnionFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (tab === "my") loadMyMemberships(); }, [tab, loadMyMemberships]);
  useEffect(() => { if (tab === "programs") loadPrograms(); }, [tab, loadPrograms]);
  useEffect(() => { if (tab === "laws") loadLaws(); }, [tab, loadLaws]);

  // ── Submit application ──
  async function submitApplication() {
    if (!form.union_id) { Alert.alert("خطأ", "يرجى اختيار النقابة أولاً"); return; }
    if (!form.full_name) { Alert.alert("خطأ", "الاسم الكامل مطلوب"); return; }
    setSubmitting(true);
    try {
      const body = {
        ...form,
        work_years: form.work_years ? Number(form.work_years) : null,
        graduation_year: form.graduation_year ? Number(form.graduation_year) : null,
        user_id: user?.id || null,
      };
      const r = await fetchWithTimeout(`${getApiUrl()}/api/unions/apply`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setSubmitted(true);
        setForm({ ...EMPTY_FORM });
        setStep(1);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const err = await r.json();
        Alert.alert("خطأ", err.error || "فشل الإرسال");
      }
    } catch (e) {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally { setSubmitting(false); }
  }

  // ── Union card ──
  function UnionCard({ u, idx }: { u: Union; idx: number }) {
    const initial = (u.short_name || u.name).charAt(0);
    return (
      <Animated.View entering={FadeInDown.delay(idx * 80).springify()}>
        <Pressable
          style={styles.unionCard}
          onPress={() => { setSelectedUnion(u); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <LinearGradient colors={[UC + "22", "#0A1628"]} style={styles.unionCardGrad}>
            <View style={styles.unionCardRow}>
              <View style={styles.unionInitial}>
                <Text style={styles.unionInitialText}>{initial}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.unionName}>{u.name}</Text>
                {u.field && <Text style={styles.unionField}>{u.field}</Text>}
                {u.description && (
                  <Text style={styles.unionDesc} numberOfLines={2}>{u.description}</Text>
                )}
              </View>
            </View>
            <View style={styles.unionStats}>
              {u.founded && <StatChip icon="calendar-outline" val={`منذ ${u.founded}`} />}
              {u.members_count && <StatChip icon="people-outline" val={u.members_count} />}
              {u.phone && <StatChip icon="call-outline" val={u.phone} />}
            </View>
            <View style={styles.unionActions}>
              <Pressable style={[styles.uBtn, { backgroundColor: UC + "20", borderColor: UC + "50" }]}
                onPress={() => { setForm(p => ({ ...p, union_id: u.id })); setTab("apply"); }}>
                <Ionicons name="person-add-outline" size={14} color={UC} />
                <Text style={[styles.uBtnText, { color: UC }]}>انضم الآن</Text>
              </Pressable>
              {u.phone && (
                <Pressable style={[styles.uBtn, { backgroundColor: Colors.primary + "20", borderColor: Colors.primary + "50" }]}
                  onPress={() => Linking.openURL(`tel:${u.phone}`)}>
                  <Ionicons name="call-outline" size={14} color={Colors.primary} />
                  <Text style={[styles.uBtnText, { color: Colors.primary }]}>اتصل</Text>
                </Pressable>
              )}
              {u.website && (
                <Pressable style={[styles.uBtn, { backgroundColor: "#0EA5E920", borderColor: "#0EA5E950" }]}
                  onPress={() => Linking.openURL(u.website!)}>
                  <Ionicons name="globe-outline" size={14} color="#0EA5E9" />
                  <Text style={[styles.uBtnText, { color: "#0EA5E9" }]}>الموقع</Text>
                </Pressable>
              )}
            </View>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  // ── Announcement card ──
  function AnnCard({ a, idx }: { a: Announcement; idx: number }) {
    const dateStr = new Date(a.created_at).toLocaleDateString("ar-SD", { year: "numeric", month: "short", day: "numeric" });
    return (
      <Animated.View entering={FadeInDown.delay(idx * 60).springify()}>
        <View style={[styles.annCard, a.is_pinned && styles.annCardPinned]}>
          {a.is_pinned && (
            <View style={styles.pinnedBadge}>
              <Ionicons name="pin" size={11} color={GOLD} />
              <Text style={styles.pinnedText}>مثبّت</Text>
            </View>
          )}
          <Text style={styles.annTitle}>{a.title}</Text>
          {a.union_name && <Text style={styles.annUnion}>📌 {a.union_name}</Text>}
          {a.body && <Text style={styles.annBody}>{a.body}</Text>}
          <Text style={styles.annDate}>{dateStr}</Text>
          {a.link && (
            <Pressable onPress={() => Linking.openURL(a.link!)}>
              <Text style={styles.annLink}>اقرأ المزيد ←</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  }

  // ── Form step indicator ──
  function StepDot({ n }: { n: number }) {
    const active = n === step;
    const done = n < step;
    return (
      <View style={[styles.stepDot, done && styles.stepDone, active && styles.stepActive]}>
        {done ? (
          <Ionicons name="checkmark" size={13} color="#fff" />
        ) : (
          <Text style={[styles.stepNum, active && styles.stepNumActive]}>{n}</Text>
        )}
      </View>
    );
  }

  // ── Form field ──
  function FInput({ label, placeholder, value, onChangeText, keyboardType, multiline, required }: {
    label: string; placeholder?: string; value: string; onChangeText: (v: string) => void;
    keyboardType?: any; multiline?: boolean; required?: boolean;
  }) {
    return (
      <View style={styles.fGroup}>
        <Text style={styles.fLabel}>{label}{required && <Text style={{ color: "#EF4444" }}> *</Text>}</Text>
        <TextInput
          style={[styles.fInput, multiline && { minHeight: 72, textAlignVertical: "top" }]}
          placeholder={placeholder || label}
          placeholderTextColor="#4B6E58"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType || "default"}
          multiline={multiline}
          textAlign="right"
        />
      </View>
    );
  }

  // ── Union detail modal ──
  function UnionModal() {
    if (!selectedUnion) return null;
    return (
      <Modal visible animationType="slide" onRequestClose={() => setSelectedUnion(null)}>
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <LinearGradient colors={[UC2 + "40", "#050E08"]} style={StyleSheet.absoluteFill} />
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setSelectedUnion(null)} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.modalTitle}>{selectedUnion.name}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.unionModalInitial}>
              <Text style={styles.unionModalInitialText}>
                {(selectedUnion.short_name || selectedUnion.name).charAt(0)}
              </Text>
            </View>
            {selectedUnion.field && <Text style={styles.modalField}>{selectedUnion.field}</Text>}
            {selectedUnion.description && (
              <Text style={styles.modalDesc}>{selectedUnion.description}</Text>
            )}
            <View style={styles.modalInfoGrid}>
              {selectedUnion.founded && <InfoRow icon="calendar-outline" label="التأسيس" val={selectedUnion.founded} />}
              {selectedUnion.members_count && <InfoRow icon="people-outline" label="الأعضاء" val={selectedUnion.members_count} />}
              {selectedUnion.phone && <InfoRow icon="call-outline" label="الهاتف" val={selectedUnion.phone} />}
              {selectedUnion.email && <InfoRow icon="mail-outline" label="البريد" val={selectedUnion.email} />}
              {selectedUnion.address && <InfoRow icon="location-outline" label="العنوان" val={selectedUnion.address} />}
            </View>
            {/* الإعلانات */}
            {selectedUnion.announcements && selectedUnion.announcements.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <Text style={styles.sectionTitle}>📢 أحدث الإعلانات</Text>
                {selectedUnion.announcements.map((a, i) => (
                  <View key={a.id} style={styles.annInModal}>
                    <Text style={styles.annInModalTitle}>{a.title}</Text>
                    {a.body && <Text style={styles.annInModalBody}>{a.body}</Text>}
                  </View>
                ))}
              </View>
            )}
            {/* أزرار */}
            <View style={styles.modalBtns}>
              <Pressable
                style={styles.modalJoinBtn}
                onPress={() => { setSelectedUnion(null); setForm(p => ({ ...p, union_id: selectedUnion.id })); setTab("apply"); }}
              >
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.modalJoinText}>تقديم طلب العضوية</Text>
              </Pressable>
              {selectedUnion.phone && (
                <Pressable style={styles.modalCallBtn} onPress={() => Linking.openURL(`tel:${selectedUnion.phone}`)}>
                  <Ionicons name="call-outline" size={18} color={Colors.primary} />
                </Pressable>
              )}
              {selectedUnion.website && (
                <Pressable style={styles.modalCallBtn} onPress={() => Linking.openURL(selectedUnion.website!)}>
                  <Ionicons name="globe-outline" size={18} color="#0EA5E9" />
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  // ── Application form ──
  function ApplicationForm() {
    const sel = unions.find(u => u.id === form.union_id);

    if (submitted) {
      return (
        <View style={styles.successBox}>
          <Animated.View entering={ZoomIn.springify()}>
            <LinearGradient colors={[UC + "22", "#050E08"]} style={styles.successCard}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={64} color={UC} />
              </View>
              <Text style={styles.successTitle}>تم إرسال طلبك بنجاح! 🎉</Text>
              <Text style={styles.successSub}>
                سيتم مراجعة طلبك من قِبل إدارة النقابة وإخطارك بالنتيجة.
              </Text>
              <Pressable style={styles.successBtn} onPress={() => { setSubmitted(false); setTab("my"); loadMyMemberships(); }}>
                <Text style={styles.successBtnText}>عرض طلباتي</Text>
              </Pressable>
            </LinearGradient>
          </Animated.View>
        </View>
      );
    }

    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.formContainer}>
          {/* اختيار النقابة */}
          <Text style={styles.formSectionTitle}>🏛️ اختر النقابة</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 2 }}>
              {unions.map(u => (
                <Pressable
                  key={u.id}
                  style={[styles.unionChip, form.union_id === u.id && styles.unionChipActive]}
                  onPress={() => setForm(p => ({ ...p, union_id: u.id }))}
                >
                  <Text style={[styles.unionChipText, form.union_id === u.id && styles.unionChipTextActive]}>
                    {u.short_name || u.name}
                  </Text>
                </Pressable>
              ))}
              {unions.length === 0 && (
                <Text style={{ color: "#4B6E58", fontFamily: "Cairo_400Regular" }}>لا توجد نقابات بعد</Text>
              )}
            </View>
          </ScrollView>
          {sel && <Text style={styles.selectedUnion}>النقابة المختارة: {sel.name}</Text>}

          {/* Step indicator */}
          <View style={styles.steps}>
            {[1, 2, 3, 4, 5].map(n => (
              <React.Fragment key={n}>
                <StepDot n={n} />
                {n < 5 && <View style={[styles.stepLine, n < step && styles.stepLineDone]} />}
              </React.Fragment>
            ))}
          </View>
          <Text style={styles.stepLabel}>
            {["البيانات الشخصية", "البيانات المهنية", "المؤهل الأكاديمي", "التاريخ النقابي والأنشطة", "المراجع والإرسال"][step - 1]}
          </Text>

          {/* Step 1: بيانات شخصية */}
          {step === 1 && (
            <Animated.View entering={FadeInDown.springify()}>
              <FInput label="الاسم الكامل" value={form.full_name} onChangeText={v => setForm(p => ({ ...p, full_name: v }))} required />
              <FInput label="رقم الهوية الوطنية" value={form.national_id} onChangeText={v => setForm(p => ({ ...p, national_id: v }))} keyboardType="numeric" />
              <FInput label="تاريخ الميلاد" placeholder="YYYY-MM-DD" value={form.birth_date} onChangeText={v => setForm(p => ({ ...p, birth_date: v }))} />
              <FInput label="مكان الميلاد" value={form.birth_place} onChangeText={v => setForm(p => ({ ...p, birth_place: v }))} />
              {/* الجنس */}
              <View style={styles.fGroup}>
                <Text style={styles.fLabel}>الجنس</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {([{ k: "male", l: "ذكر" }, { k: "female", l: "أنثى" }] as const).map(g => (
                    <Pressable key={g.k} style={[styles.genderBtn, form.gender === g.k && styles.genderBtnActive]}
                      onPress={() => setForm(p => ({ ...p, gender: g.k }))}>
                      <Text style={[styles.genderText, form.gender === g.k && styles.genderTextActive]}>{g.l}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <FInput label="الجنسية" value={form.nationality} onChangeText={v => setForm(p => ({ ...p, nationality: v }))} />
              <FInput label="رقم الهاتف" value={form.phone} onChangeText={v => setForm(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />
              <FInput label="هاتف بديل" value={form.alt_phone} onChangeText={v => setForm(p => ({ ...p, alt_phone: v }))} keyboardType="phone-pad" />
              <FInput label="البريد الإلكتروني" value={form.email} onChangeText={v => setForm(p => ({ ...p, email: v }))} keyboardType="email-address" />
              <FInput label="العنوان التفصيلي" value={form.address} onChangeText={v => setForm(p => ({ ...p, address: v }))} multiline />
              <FInput label="الحي" value={form.neighborhood} onChangeText={v => setForm(p => ({ ...p, neighborhood: v }))} />
              <FInput label="المدينة" value={form.city} onChangeText={v => setForm(p => ({ ...p, city: v }))} />
            </Animated.View>
          )}

          {/* Step 2: بيانات مهنية */}
          {step === 2 && (
            <Animated.View entering={FadeInDown.springify()}>
              <FInput label="المسمى الوظيفي" value={form.job_title} onChangeText={v => setForm(p => ({ ...p, job_title: v }))} />
              <FInput label="جهة العمل" value={form.employer} onChangeText={v => setForm(p => ({ ...p, employer: v }))} />
              <FInput label="عنوان العمل" value={form.work_address} onChangeText={v => setForm(p => ({ ...p, work_address: v }))} multiline />
              <FInput label="هاتف العمل" value={form.work_phone} onChangeText={v => setForm(p => ({ ...p, work_phone: v }))} keyboardType="phone-pad" />
              <FInput label="التخصص المهني" value={form.specialty} onChangeText={v => setForm(p => ({ ...p, specialty: v }))} />
              <FInput label="تاريخ بدء العمل" placeholder="YYYY-MM-DD" value={form.work_start_date} onChangeText={v => setForm(p => ({ ...p, work_start_date: v }))} />
              <FInput label="سنوات الخبرة" value={form.work_years} onChangeText={v => setForm(p => ({ ...p, work_years: v }))} keyboardType="numeric" />
            </Animated.View>
          )}

          {/* Step 3: مؤهل أكاديمي */}
          {step === 3 && (
            <Animated.View entering={FadeInDown.springify()}>
              {/* الدرجة */}
              <View style={styles.fGroup}>
                <Text style={styles.fLabel}>الدرجة العلمية</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {DEGREES.map(d => (
                    <Pressable key={d} style={[styles.degreeChip, form.degree === d && styles.degreeChipActive]}
                      onPress={() => setForm(p => ({ ...p, degree: d }))}>
                      <Text style={[styles.degreeText, form.degree === d && styles.degreeTextActive]}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <FInput label="المؤسسة التعليمية" value={form.institution} onChangeText={v => setForm(p => ({ ...p, institution: v }))} />
              <FInput label="سنة التخرج" value={form.graduation_year} onChangeText={v => setForm(p => ({ ...p, graduation_year: v }))} keyboardType="numeric" />
              <FInput label="مجال الدراسة" value={form.field_of_study} onChangeText={v => setForm(p => ({ ...p, field_of_study: v }))} />
            </Animated.View>
          )}

          {/* Step 4: التاريخ النقابي والأنشطة */}
          {step === 4 && (
            <Animated.View entering={FadeInDown.springify()}>
              <Text style={styles.formSectionTitle}>📋 النقابات والجمعيات السابقة</Text>
              {form.previous_unions.map((pu, i) => (
                <View key={i} style={styles.prevUnionRow}>
                  <Text style={styles.prevUnionLabel}>{i + 1}. {pu.name} — {pu.role}</Text>
                  <Pressable onPress={() => setForm(p => ({ ...p, previous_unions: p.previous_unions.filter((_, j) => j !== i) }))}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </Pressable>
                </View>
              ))}
              <AddPrevUnion onAdd={pu => setForm(p => ({ ...p, previous_unions: [...p.previous_unions, pu] }))} />
              <FInput label="المناصب النقابية الحالية" value={form.union_roles} onChangeText={v => setForm(p => ({ ...p, union_roles: v }))} placeholder="رئيس، نائب، أمين..." />
              <FInput label="رقم العضوية الحالي (إن وجد)" value={form.existing_membership_no} onChangeText={v => setForm(p => ({ ...p, existing_membership_no: v }))} />
              <Text style={[styles.formSectionTitle, { marginTop: 16 }]}>🏆 الأنشطة والإنجازات</Text>
              <AddListItems label="ورش العمل التي حضرتها" items={form.workshops}
                onAdd={v => setForm(p => ({ ...p, workshops: [...p.workshops, v] }))}
                onRemove={i => setForm(p => ({ ...p, workshops: p.workshops.filter((_, j) => j !== i) }))} />
              <AddListItems label="المؤتمرات والندوات" items={form.conferences}
                onAdd={v => setForm(p => ({ ...p, conferences: [...p.conferences, v] }))}
                onRemove={i => setForm(p => ({ ...p, conferences: p.conferences.filter((_, j) => j !== i) }))} />
              <AddListItems label="الدورات التدريبية" items={form.trainings}
                onAdd={v => setForm(p => ({ ...p, trainings: [...p.trainings, v] }))}
                onRemove={i => setForm(p => ({ ...p, trainings: p.trainings.filter((_, j) => j !== i) }))} />
              <FInput label="الإنجازات والمساهمات" value={form.achievements} onChangeText={v => setForm(p => ({ ...p, achievements: v }))} multiline placeholder="اذكر أبرز إنجازاتك..." />
              <FInput label="المهارات" value={form.skills} onChangeText={v => setForm(p => ({ ...p, skills: v }))} multiline placeholder="مهارات تقنية، لغات، قيادة..." />
            </Animated.View>
          )}

          {/* Step 5: مراجع وإرسال */}
          {step === 5 && (
            <Animated.View entering={FadeInDown.springify()}>
              <Text style={styles.formSectionTitle}>👥 المراجع الشخصية</Text>
              {form.references_list.map((ref, i) => (
                <View key={i} style={styles.prevUnionRow}>
                  <Text style={styles.prevUnionLabel}>{ref.name} — {ref.relation} — {ref.phone}</Text>
                  <Pressable onPress={() => setForm(p => ({ ...p, references_list: p.references_list.filter((_, j) => j !== i) }))}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </Pressable>
                </View>
              ))}
              <AddReference onAdd={ref => setForm(p => ({ ...p, references_list: [...p.references_list, ref] }))} />
              {/* نوع العضوية */}
              <View style={[styles.fGroup, { marginTop: 16 }]}>
                <Text style={styles.fLabel}>نوع العضوية المطلوبة</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {MEMBERSHIP_TYPES.map(mt => (
                    <Pressable key={mt.key} style={[styles.degreeChip, form.membership_type === mt.key && styles.degreeChipActive]}
                      onPress={() => setForm(p => ({ ...p, membership_type: mt.key as any }))}>
                      <Text style={[styles.degreeText, form.membership_type === mt.key && styles.degreeTextActive]}>{mt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <FInput label="ملاحظات إضافية" value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))} multiline />
              {/* ملخص الطلب */}
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>📄 ملخص الطلب</Text>
                <SummaryRow label="النقابة" val={sel?.name || "—"} />
                <SummaryRow label="الاسم" val={form.full_name || "—"} />
                <SummaryRow label="الهوية" val={form.national_id || "—"} />
                <SummaryRow label="المسمى" val={form.job_title || "—"} />
                <SummaryRow label="التخصص" val={form.specialty || "—"} />
                <SummaryRow label="المؤهل" val={form.degree ? `${form.degree} - ${form.field_of_study || ""}` : "—"} />
                <SummaryRow label="نوع العضوية" val={MEMBERSHIP_TYPES.find(m => m.key === form.membership_type)?.label || "—"} />
              </View>
            </Animated.View>
          )}

          {/* أزرار التنقل */}
          <View style={styles.formNavBtns}>
            {step > 1 && (
              <Pressable style={styles.prevBtn} onPress={() => setStep(s => s - 1)}>
                <Ionicons name="arrow-back-outline" size={16} color={UC} />
                <Text style={styles.prevBtnText}>السابق</Text>
              </Pressable>
            )}
            {step < 5 ? (
              <Pressable style={styles.nextBtn} onPress={() => {
                if (step === 1 && !form.full_name) { Alert.alert("تنبيه", "الاسم الكامل مطلوب"); return; }
                setStep(s => s + 1);
              }}>
                <Text style={styles.nextBtnText}>التالي</Text>
                <Ionicons name="arrow-forward-outline" size={16} color="#fff" />
              </Pressable>
            ) : (
              <Pressable style={styles.submitBtn} onPress={submitApplication} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="send-outline" size={16} color="#fff" />
                    <Text style={styles.submitBtnText}>إرسال الطلب</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── My memberships ──
  function MyMemberships() {
    if (!token) {
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="lock-closed-outline" size={48} color={UC + "80"} />
          <Text style={styles.emptyText}>سجّل دخولك لعرض طلبات عضويتك</Text>
        </View>
      );
    }
    if (myLoading) return <ActivityIndicator color={UC} style={{ marginTop: 60 }} />;
    if (myMemberships.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="document-text-outline" size={48} color={UC + "80"} />
          <Text style={styles.emptyText}>لا توجد طلبات عضوية بعد</Text>
          <Pressable style={styles.applyNowBtn} onPress={() => setTab("apply")}>
            <Text style={styles.applyNowText}>تقديم طلب الآن</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {myMemberships.map((m, i) => {
          const statusColor = m.status === "approved" ? "#22C55E" : m.status === "rejected" ? "#EF4444" : GOLD;
          const statusLabel = m.status === "approved" ? "مقبول ✓" : m.status === "rejected" ? "مرفوض" : "قيد المراجعة";
          return (
            <Animated.View key={m.id} entering={FadeInDown.delay(i * 80).springify()}>
              <View style={styles.myCard}>
                <View style={styles.myCardHeader}>
                  <View>
                    <Text style={styles.myCardUnion}>{m.union_name}</Text>
                    <Text style={styles.myCardDate}>
                      تقدّمت: {new Date(m.applied_at).toLocaleDateString("ar-SD")}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "20", borderColor: statusColor + "60" }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                </View>
                {m.membership_no && (
                  <View style={styles.membershipNoRow}>
                    <Ionicons name="card-outline" size={14} color={Colors.primary} />
                    <Text style={styles.membershipNoText}>رقم العضوية: {m.membership_no}</Text>
                  </View>
                )}
                {m.rejection_reason && (
                  <Text style={styles.rejectionReason}>سبب الرفض: {m.rejection_reason}</Text>
                )}
                <View style={styles.myCardInfo}>
                  <MiniInfo label="النوع" val={MEMBERSHIP_TYPES.find(t => t.key === m.membership_type)?.label || m.membership_type} />
                  {m.specialty && <MiniInfo label="التخصص" val={m.specialty} />}
                  {m.degree && <MiniInfo label="المؤهل" val={m.degree} />}
                </View>
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient colors={[UC2 + "60", "#050E08"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Ionicons name="people-circle" size={28} color={UC} />
          </View>
          <View>
            <Text style={styles.headerTitle}>النقابات المهنية</Text>
            <Text style={styles.headerSub}>نقابات وجمعيات الحصاحيصا</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Tabs — scrollable row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 52 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, paddingVertical: 6 }}>
        {[
          { key: "unions",   label: "النقابات", icon: "business-outline" },
          { key: "programs", label: "البرامج",  icon: "school-outline" },
          { key: "laws",     label: "القوانين", icon: "document-lock-outline" },
          { key: "apply",    label: "انضم",     icon: "person-add-outline" },
          { key: "my",       label: "طلباتي",   icon: "document-text-outline" },
        ].map(t => (
          <Pressable key={t.key}
            style={[styles.tabBtn, { flex: 0, paddingHorizontal: 14 }, tab === t.key && styles.tabBtnActive]}
            onPress={() => { setTab(t.key as any); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
            <Ionicons name={t.icon as any} size={15} color={tab === t.key ? "#fff" : UC + "99"} />
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Content */}
      {tab === "unions" && (
        loading ? (
          <ActivityIndicator color={UC} style={{ marginTop: 60 }} />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 14, gap: 14 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={UC} />}
          >
            {announcements.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.sectionTitle}>📢 أحدث الإعلانات</Text>
                {announcements.slice(0, 3).map((a, i) => <AnnCard key={a.id} a={a} idx={i} />)}
              </View>
            )}
            <Text style={styles.sectionTitle}>🏛️ النقابات والجمعيات</Text>
            {unions.map((u, i) => <UnionCard key={u.id} u={u} idx={i} />)}
            {unions.length === 0 && (
              <View style={styles.emptyBox}>
                <Ionicons name="business-outline" size={48} color={UC + "60"} />
                <Text style={styles.emptyText}>لا توجد نقابات مضافة بعد</Text>
              </View>
            )}
          </ScrollView>
        )
      )}

      {/* ══ تبويب البرامج ══ */}
      {tab === "programs" && (
        programsLoading ? <ActivityIndicator color={UC} style={{ marginTop: 60 }} /> : (
          <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}
            refreshControl={<RefreshControl refreshing={false} onRefresh={loadPrograms} tintColor={UC} />}>
            {/* فلتر النوع */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  { k: "all", l: "الكل" }, { k: "training", l: "تدريب" },
                  { k: "event", l: "فعالية" }, { k: "workshop", l: "ورشة" }, { k: "course", l: "دورة" },
                ].map(f => (
                  <Pressable key={f.k}
                    style={[styles.degreeChip, programTypeFilter === f.k && styles.degreeChipActive]}
                    onPress={() => setProgramTypeFilter(f.k)}>
                    <Text style={[styles.degreeText, programTypeFilter === f.k && styles.degreeTextActive]}>{f.l}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {/* فلتر النقابة */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable style={[styles.degreeChip, !programUnionFilter && styles.degreeChipActive]}
                  onPress={() => setProgramUnionFilter(null)}>
                  <Text style={[styles.degreeText, !programUnionFilter && styles.degreeTextActive]}>كل النقابات</Text>
                </Pressable>
                {unions.map(u => (
                  <Pressable key={u.id} style={[styles.degreeChip, programUnionFilter === u.id && styles.degreeChipActive]}
                    onPress={() => setProgramUnionFilter(u.id)}>
                    <Text style={[styles.degreeText, programUnionFilter === u.id && styles.degreeTextActive]}>{u.short_name || u.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {programs.map((p, i) => {
              const TYPE_ICONS: Record<string, string> = { training: "🎓", event: "🎉", workshop: "🔧", course: "📚" };
              const icon = TYPE_ICONS[p.type] || "📌";
              const TYPE_LABELS: Record<string, string> = { training: "تدريب", event: "فعالية", workshop: "ورشة عمل", course: "دورة" };
              return (
                <Animated.View key={p.id} entering={FadeInDown.delay(i * 60).springify()}>
                  <View style={[styles.annCard, { borderLeftWidth: 3, borderLeftColor: UC }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 16 }}>{icon}</Text>
                        <View style={[styles.statusBadge, { borderColor: UC + "44", backgroundColor: UC + "18" }]}>
                          <Text style={[styles.statusText, { color: UC, fontSize: 11 }]}>{TYPE_LABELS[p.type] || p.type}</Text>
                        </View>
                      </View>
                      {p.union_short_name && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: UC + "bb" }}>{p.union_short_name}</Text>}
                    </View>
                    <Text style={styles.annTitle}>{p.title}</Text>
                    {p.description && <Text style={styles.annBody}>{p.description}</Text>}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {p.start_date && <View style={styles.statChip}><Ionicons name="calendar-outline" size={11} color={UC3} /><Text style={styles.statChipText}>{p.start_date}</Text></View>}
                      {p.end_date && p.end_date !== p.start_date && <View style={styles.statChip}><Ionicons name="calendar-outline" size={11} color="#F59E0B" /><Text style={[styles.statChipText, { color: "#F59E0B" }]}>حتى {p.end_date}</Text></View>}
                      {p.location && <View style={styles.statChip}><Ionicons name="location-outline" size={11} color={UC3} /><Text style={styles.statChipText}>{p.location}</Text></View>}
                      {p.fee && <View style={styles.statChip}><Ionicons name="cash-outline" size={11} color={Colors.primary} /><Text style={[styles.statChipText, { color: Colors.primary }]}>{p.fee}</Text></View>}
                      {p.max_participants && <View style={styles.statChip}><Ionicons name="people-outline" size={11} color={UC3} /><Text style={styles.statChipText}>حتى {p.max_participants}</Text></View>}
                    </View>
                    {p.contact && (
                      <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}
                        onPress={() => Linking.openURL(`tel:${p.contact}`)}>
                        <Ionicons name="call-outline" size={13} color={Colors.primary} />
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primary }}>{p.contact}</Text>
                      </Pressable>
                    )}
                    {p.link && (
                      <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}
                        onPress={() => Linking.openURL(p.link!)}>
                        <Ionicons name="link-outline" size={13} color="#0EA5E9" />
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#0EA5E9" }}>رابط التسجيل</Text>
                      </Pressable>
                    )}
                  </View>
                </Animated.View>
              );
            })}
            {programs.length === 0 && (
              <View style={styles.emptyBox}>
                <Ionicons name="school-outline" size={48} color={UC + "60"} />
                <Text style={styles.emptyText}>لا توجد برامج متاحة حالياً</Text>
              </View>
            )}
          </ScrollView>
        )
      )}

      {/* ══ تبويب القوانين واللوائح ══ */}
      {tab === "laws" && (
        lawsLoading ? <ActivityIndicator color={UC} style={{ marginTop: 60 }} /> : (
          <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}
            refreshControl={<RefreshControl refreshing={false} onRefresh={loadLaws} tintColor={UC} />}>
            {/* فلتر التصنيف */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  { k: "all", l: "الكل" }, { k: "bylaw", l: "لائحة" },
                  { k: "regulation", l: "نظام" }, { k: "policy", l: "سياسة" }, { k: "decision", l: "قرار" },
                ].map(f => (
                  <Pressable key={f.k}
                    style={[styles.degreeChip, lawCatFilter === f.k && styles.degreeChipActive]}
                    onPress={() => setLawCatFilter(f.k)}>
                    <Text style={[styles.degreeText, lawCatFilter === f.k && styles.degreeTextActive]}>{f.l}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {/* فلتر النقابة */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable style={[styles.degreeChip, !lawUnionFilter && styles.degreeChipActive]}
                  onPress={() => setLawUnionFilter(null)}>
                  <Text style={[styles.degreeText, !lawUnionFilter && styles.degreeTextActive]}>كل النقابات</Text>
                </Pressable>
                {unions.map(u => (
                  <Pressable key={u.id} style={[styles.degreeChip, lawUnionFilter === u.id && styles.degreeChipActive]}
                    onPress={() => setLawUnionFilter(u.id)}>
                    <Text style={[styles.degreeText, lawUnionFilter === u.id && styles.degreeTextActive]}>{u.short_name || u.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {laws.map((l, i) => {
              const CAT_LABELS: Record<string, string> = { bylaw: "لائحة", regulation: "نظام داخلي", policy: "سياسة", decision: "قرار" };
              const CAT_COLORS: Record<string, string> = { bylaw: "#8B5CF6", regulation: "#0EA5E9", policy: "#22C55E", decision: "#F59E0B" };
              const cc = CAT_COLORS[l.category] || UC;
              const expanded = expandedLaw === l.id;
              return (
                <Animated.View key={l.id} entering={FadeInDown.delay(i * 50).springify()}>
                  <Pressable onPress={() => setExpandedLaw(expanded ? null : l.id)}
                    style={[styles.annCard, { borderLeftWidth: 3, borderLeftColor: cc }]}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <View style={[styles.statusBadge, { borderColor: cc + "44", backgroundColor: cc + "18" }]}>
                            <Text style={[styles.statusText, { color: cc, fontSize: 11 }]}>{CAT_LABELS[l.category] || l.category}</Text>
                          </View>
                          {l.union_short_name && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: UC + "bb" }}>{l.union_short_name}</Text>}
                          {l.version && <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: "#4B6E58" }}>v{l.version}</Text>}
                        </View>
                        <Text style={styles.annTitle}>{l.title}</Text>
                        {l.effective_date && (
                          <Text style={styles.annDate}>نافذة منذ: {l.effective_date}</Text>
                        )}
                      </View>
                      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={UC + "80"} />
                    </View>
                    {expanded && l.body && (
                      <Animated.View entering={FadeInDown.springify()} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#1B3626" }}>
                        <Text style={[styles.annBody, { lineHeight: 24 }]}>{l.body}</Text>
                        {l.document_url && (
                          <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}
                            onPress={() => Linking.openURL(l.document_url!)}>
                            <Ionicons name="document-outline" size={16} color="#F59E0B" />
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#F59E0B" }}>تحميل الوثيقة الكاملة</Text>
                          </Pressable>
                        )}
                      </Animated.View>
                    )}
                  </Pressable>
                </Animated.View>
              );
            })}
            {laws.length === 0 && (
              <View style={styles.emptyBox}>
                <Ionicons name="document-lock-outline" size={48} color={UC + "60"} />
                <Text style={styles.emptyText}>لا توجد قوانين ولوائح مضافة بعد</Text>
              </View>
            )}
          </ScrollView>
        )
      )}

      {tab === "apply" && <ApplicationForm />}
      {tab === "my" && <MyMemberships />}

      <UnionModal />
    </View>
  );
}

// ── مكوّنات مساعدة صغيرة ──────────────────────────────────────────────────

function StatChip({ icon, val }: { icon: any; val: string }) {
  return (
    <View style={styles.statChip}>
      <Ionicons name={icon} size={12} color={UC3} />
      <Text style={styles.statChipText}>{val}</Text>
    </View>
  );
}

function InfoRow({ icon, label, val }: { icon: any; label: string; val: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={15} color={UC} />
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoVal}>{val}</Text>
    </View>
  );
}

function SummaryRow({ label, val }: { label: string; val: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}:</Text>
      <Text style={styles.summaryVal}>{val}</Text>
    </View>
  );
}

function MiniInfo({ label, val }: { label: string; val: string }) {
  return (
    <View style={styles.miniInfo}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniVal}>{val}</Text>
    </View>
  );
}

function AddPrevUnion({ onAdd }: { onAdd: (pu: PrevUnion) => void }) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState(""); const [role, setRole] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  if (!show) return (
    <Pressable style={styles.addBtn} onPress={() => setShow(true)}>
      <Ionicons name="add-circle-outline" size={16} color={UC} />
      <Text style={styles.addBtnText}>إضافة نقابة سابقة</Text>
    </Pressable>
  );
  return (
    <View style={styles.addBox}>
      {[{ label: "اسم النقابة/الجمعية", val: name, set: setName }, { label: "الدور/المنصب", val: role, set: setRole }, { label: "من (سنة)", val: from, set: setFrom }, { label: "حتى (سنة)", val: to, set: setTo }].map(f => (
        <TextInput key={f.label} style={styles.addInput} placeholder={f.label} placeholderTextColor="#4B6E58" value={f.val} onChangeText={f.set} textAlign="right" />
      ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable style={styles.addConfirm} onPress={() => { if (name) { onAdd({ name, role, from, to }); setName(""); setRole(""); setFrom(""); setTo(""); setShow(false); } }}>
          <Text style={styles.addConfirmText}>إضافة</Text>
        </Pressable>
        <Pressable style={styles.addCancel} onPress={() => setShow(false)}>
          <Text style={styles.addCancelText}>إلغاء</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AddListItems({ label, items, onAdd, onRemove }: { label: string; items: string[]; onAdd: (v: string) => void; onRemove: (i: number) => void }) {
  const [val, setVal] = useState("");
  return (
    <View style={styles.fGroup}>
      <Text style={styles.fLabel}>{label}</Text>
      {items.map((item, i) => (
        <View key={i} style={styles.listItem}>
          <Text style={styles.listItemText}>• {item}</Text>
          <Pressable onPress={() => onRemove(i)}><Ionicons name="close-circle" size={16} color="#EF4444" /></Pressable>
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput style={[styles.fInput, { flex: 1 }]} placeholder="أضف عنصراً..." placeholderTextColor="#4B6E58" value={val} onChangeText={setVal} textAlign="right" />
        <Pressable style={styles.smallAddBtn} onPress={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); } }}>
          <Ionicons name="add" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function AddReference({ onAdd }: { onAdd: (r: Reference) => void }) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [relation, setRelation] = useState("");
  if (!show) return (
    <Pressable style={styles.addBtn} onPress={() => setShow(true)}>
      <Ionicons name="add-circle-outline" size={16} color={UC} />
      <Text style={styles.addBtnText}>إضافة مرجع شخصي</Text>
    </Pressable>
  );
  return (
    <View style={styles.addBox}>
      {[{ label: "الاسم", val: name, set: setName }, { label: "رقم الهاتف", val: phone, set: setPhone }, { label: "صلة القرابة / صفة", val: relation, set: setRelation }].map(f => (
        <TextInput key={f.label} style={styles.addInput} placeholder={f.label} placeholderTextColor="#4B6E58" value={f.val} onChangeText={f.set} textAlign="right" />
      ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable style={styles.addConfirm} onPress={() => { if (name && phone) { onAdd({ name, phone, relation }); setName(""); setPhone(""); setRelation(""); setShow(false); } }}>
          <Text style={styles.addConfirmText}>إضافة</Text>
        </Pressable>
        <Pressable style={styles.addCancel} onPress={() => setShow(false)}>
          <Text style={styles.addCancelText}>إلغاء</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050E08" },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: UC + "20", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: UC + "40" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#FAFAFA" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#79A890" },

  tabRow: { flexDirection: "row", gap: 6, paddingHorizontal: 14, marginBottom: 12 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: UC + "12", borderWidth: 1, borderColor: UC + "30" },
  tabBtnActive: { backgroundColor: UC, borderColor: UC },
  tabLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: UC + "99" },
  tabLabelActive: { color: "#fff" },

  // Union card
  unionCard: { borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: UC + "30" },
  unionCardGrad: { padding: 16 },
  unionCardRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  unionInitial: { width: 48, height: 48, borderRadius: 24, backgroundColor: UC + "30", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: UC + "50", flexShrink: 0 },
  unionInitialText: { fontFamily: "Cairo_700Bold", fontSize: 20, color: UC },
  unionName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#FAFAFA" },
  unionField: { fontFamily: "Cairo_400Regular", fontSize: 12, color: UC3 },
  unionDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#79A890", lineHeight: 18 },
  unionStats: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  statChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: UC + "15" },
  statChipText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: UC3 },
  unionActions: { flexDirection: "row", gap: 8 },
  uBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  uBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },

  // Announcement
  annCard: { backgroundColor: "#0B1A12", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#1B3626" },
  annCardPinned: { borderColor: GOLD + "50", backgroundColor: GOLD + "08" },
  pinnedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  pinnedText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: GOLD },
  annTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#FAFAFA", marginBottom: 4 },
  annUnion: { fontFamily: "Cairo_400Regular", fontSize: 12, color: UC, marginBottom: 4 },
  annBody: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#9DBFAA", lineHeight: 20, marginBottom: 6 },
  annDate: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#4B6E58" },
  annLink: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: UC, marginTop: 4 },

  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#FAFAFA", marginBottom: 10, paddingRight: 4 },
  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 14 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: "#4B6E58", textAlign: "center" },
  applyNowBtn: { backgroundColor: UC, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  applyNowText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: UC + "30" },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#FAFAFA", flex: 1, textAlign: "center" },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#1B2E22", alignItems: "center", justifyContent: "center" },
  modalContent: { padding: 20, gap: 10, paddingBottom: 60 },
  unionModalInitial: { width: 72, height: 72, borderRadius: 36, backgroundColor: UC + "25", alignItems: "center", justifyContent: "center", alignSelf: "center", borderWidth: 2, borderColor: UC + "50", marginBottom: 8 },
  unionModalInitialText: { fontFamily: "Cairo_700Bold", fontSize: 30, color: UC },
  modalField: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: UC, textAlign: "center" },
  modalDesc: { fontFamily: "Cairo_400Regular", fontSize: 14, color: "#9DBFAA", textAlign: "center", lineHeight: 22 },
  modalInfoGrid: { backgroundColor: "#0B1A12", borderRadius: 12, padding: 14, gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#79A890" },
  infoVal: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#FAFAFA", flex: 1 },
  annInModal: { backgroundColor: "#0B1A12", borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: UC },
  annInModalTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#FAFAFA", marginBottom: 4 },
  annInModalBody: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#79A890" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalJoinBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: UC, paddingVertical: 13, borderRadius: 12 },
  modalJoinText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  modalCallBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: "#0B1A12", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#1B3626" },

  // Form
  formContainer: { padding: 16, paddingBottom: 100 },
  formSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: UC, marginBottom: 12 },
  fGroup: { marginBottom: 14 },
  fLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#9DBFAA", marginBottom: 6 },
  fInput: { backgroundColor: "#0B1A12", borderWidth: 1, borderColor: "#1B3626", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: "#FAFAFA", fontFamily: "Cairo_400Regular", fontSize: 14 },
  genderBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#1B3626", alignItems: "center", backgroundColor: "#0B1A12" },
  genderBtnActive: { borderColor: UC, backgroundColor: UC + "20" },
  genderText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#79A890" },
  genderTextActive: { color: UC },
  degreeChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: "#1B3626", backgroundColor: "#0B1A12" },
  degreeChipActive: { borderColor: UC, backgroundColor: UC + "20" },
  degreeText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#79A890" },
  degreeTextActive: { color: UC },
  unionChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "#1B3626", backgroundColor: "#0B1A12" },
  unionChipActive: { borderColor: UC, backgroundColor: UC + "25" },
  unionChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#79A890" },
  unionChipTextActive: { color: UC },
  selectedUnion: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary, marginBottom: 14 },

  // Steps
  steps: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#0B1A12", borderWidth: 1.5, borderColor: "#1B3626", alignItems: "center", justifyContent: "center" },
  stepActive: { borderColor: UC, backgroundColor: UC + "25" },
  stepDone: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  stepLine: { flex: 1, height: 2, backgroundColor: "#1B3626", maxWidth: 40 },
  stepLineDone: { backgroundColor: Colors.primary },
  stepNum: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#4B6E58" },
  stepNumActive: { color: UC },
  stepLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: UC, textAlign: "center", marginBottom: 18 },

  prevUnionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#0B1A12", borderRadius: 8, padding: 10, marginBottom: 6 },
  prevUnionLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#9DBFAA", flex: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, marginBottom: 12 },
  addBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: UC },
  addBox: { backgroundColor: "#0B1A12", borderRadius: 12, padding: 14, gap: 8, marginBottom: 12, borderWidth: 1, borderColor: UC + "30" },
  addInput: { backgroundColor: "#071210", borderWidth: 1, borderColor: "#1B3626", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: "#FAFAFA", fontFamily: "Cairo_400Regular", fontSize: 13 },
  addConfirm: { flex: 1, backgroundColor: UC, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  addConfirmText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  addCancel: { flex: 1, backgroundColor: "#1B3626", paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  addCancelText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#79A890" },
  listItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  listItemText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#9DBFAA", flex: 1 },
  smallAddBtn: { backgroundColor: UC, width: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  summaryBox: { backgroundColor: "#0B1A12", borderRadius: 12, padding: 16, marginTop: 16, borderWidth: 1, borderColor: UC + "40" },
  summaryTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: UC, marginBottom: 10 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderColor: "#1B3626" },
  summaryLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#79A890" },
  summaryVal: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#FAFAFA", flex: 1, textAlign: "right" },

  formNavBtns: { flexDirection: "row", gap: 12, marginTop: 24 },
  prevBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: UC + "50", backgroundColor: UC + "10" },
  prevBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: UC },
  nextBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12, backgroundColor: UC },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  submitBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.primary },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  successBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  successCard: { borderRadius: 20, padding: 30, alignItems: "center", width: W - 48, borderWidth: 1, borderColor: UC + "40" },
  successIcon: { marginBottom: 16 },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#FAFAFA", textAlign: "center", marginBottom: 10 },
  successSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#79A890", textAlign: "center", lineHeight: 22, marginBottom: 20 },
  successBtn: { backgroundColor: UC, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  successBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  // My memberships
  myCard: { backgroundColor: "#0B1A12", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#1B3626" },
  myCardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 },
  myCardUnion: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#FAFAFA" },
  myCardDate: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#4B6E58", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  membershipNoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, padding: 8, backgroundColor: Colors.primary + "15", borderRadius: 8 },
  membershipNoText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },
  rejectionReason: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#EF4444", marginBottom: 8 },
  myCardInfo: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  miniInfo: { backgroundColor: "#071210", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "#1B3626" },
  miniLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: "#4B6E58" },
  miniVal: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#9DBFAA" },
});
