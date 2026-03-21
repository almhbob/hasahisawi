import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";

export type Job = {
  id: string;
  title: string;
  company: string;
  type: "fulltime" | "parttime" | "freelance" | "volunteer";
  location: string;
  description: string;
  contactPhone: string;
  salary?: string;
  createdAt: string;
};

const STORAGE_KEY = "jobs_listings";

const SAMPLE_JOBS: Job[] = [
  {
    id: "sample1",
    title: "مدرس رياضيات",
    company: "ثانوية حصاحيصا الكبرى",
    type: "fulltime",
    location: "حصاحيصا",
    description: "مطلوب مدرس رياضيات للصفوف الثانوية، يُشترط وجود شهادة تربوية وخبرة لا تقل عن سنتين.",
    contactPhone: "+249912345800",
    salary: "يُحدد عند المقابلة",
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "sample2",
    title: "محاسب",
    company: "شركة النيل للتجارة",
    type: "fulltime",
    location: "حصاحيصا - السوق المركزي",
    description: "مطلوب محاسب حاصل على بكالوريوس محاسبة، يُجيد استخدام الحاسوب والبرامج المحاسبية.",
    contactPhone: "+249912345801",
    salary: "٣٠٠٠ - ٥٠٠٠ جنيه",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "sample3",
    title: "سائق توصيل",
    company: "متجر الأمانة",
    type: "parttime",
    location: "حصاحيصا والقرى المجاورة",
    description: "مطلوب سائق لتوصيل الطلبات، يملك رخصة قيادة سارية وسيارة خاصة.",
    contactPhone: "+249912345802",
    salary: "عمولة على كل توصيلة",
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "sample4",
    title: "مصمم جرافيك",
    company: "عمل حر",
    type: "freelance",
    location: "عن بُعد",
    description: "مطلوب مصمم جرافيك لتصميم مطبوعات وإعلانات لمنشآت تجارية. خبرة في Adobe أو Canva.",
    contactPhone: "+249912345803",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "sample5",
    title: "متطوع في الإسعاف المجتمعي",
    company: "منظمة الهلال الأحمر",
    type: "volunteer",
    location: "حصاحيصا",
    description: "نبحث عن متطوعين للمشاركة في حملات الإسعاف والتوعية الصحية في المجتمع المحلي.",
    contactPhone: "+249912345804",
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const TYPE_OPTIONS = [
  { key: "all", label: "الكل" },
  { key: "fulltime", label: "دوام كامل" },
  { key: "parttime", label: "دوام جزئي" },
  { key: "freelance", label: "مستقل" },
  { key: "volunteer", label: "تطوع" },
];

function getTypeLabel(type: Job["type"]) {
  switch (type) {
    case "fulltime": return "دوام كامل";
    case "parttime": return "دوام جزئي";
    case "freelance": return "مستقل";
    case "volunteer": return "تطوع";
  }
}

function getTypeColor(type: Job["type"]) {
  switch (type) {
    case "fulltime": return Colors.primary;
    case "parttime": return "#2E7D9A";
    case "freelance": return "#6A5ACD";
    case "volunteer": return Colors.accent;
  }
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (days >= 1) return `منذ ${days} ${days === 1 ? "يوم" : "أيام"}`;
  if (hours >= 1) return `منذ ${hours} ${hours === 1 ? "ساعة" : "ساعات"}`;
  return "منذ قليل";
}

function AddJobModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (job: Omit<Job, "id" | "createdAt">) => Promise<void>;
}) {
  const { t, isRTL } = useLang();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState<Job["type"]>("fulltime");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [salary, setSalary] = useState("");

  const reset = () => {
    setTitle(""); setCompany(""); setType("fulltime");
    setLocation(""); setDescription(""); setContactPhone(""); setSalary("");
  };

  const handleSave = async () => {
    if (!title.trim() || !company.trim() || !contactPhone.trim()) {
      Alert.alert(t("common", "error"), t("common", "fillAll"));
      return;
    }
    await onSave({ title: title.trim(), company: company.trim(), type, location: location.trim(), description: description.trim(), contactPhone: contactPhone.trim(), salary: salary.trim() || undefined });
    reset();
    onClose();
  };

  const typeColors: Record<Job["type"], string> = {
    fulltime: Colors.primary, parttime: "#2E7D9A", freelance: "#6A5ACD", volunteer: Colors.accent,
  };

  const jobTypes = t("jobs", "jobTypes");

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={modalStyles.handle} />
          <View style={[modalStyles.modalHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={modalStyles.modalTitle}>{t("jobs", "postJob")}</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={modalStyles.form}>
              <View style={modalStyles.field}>
                <Text style={[modalStyles.label, { textAlign: isRTL ? "right" : "left" }]}>{t("common", "name")} *</Text>
                <TextInput style={modalStyles.input} placeholder={t("jobs", "title")} placeholderTextColor={Colors.textMuted} value={title} onChangeText={setTitle} textAlign={isRTL ? "right" : "left"} />
              </View>
              <View style={modalStyles.field}>
                <Text style={[modalStyles.label, { textAlign: isRTL ? "right" : "left" }]}>{t("jobs", "employer")} *</Text>
                <TextInput style={modalStyles.input} placeholder={t("jobs", "employerPlaceholder")} placeholderTextColor={Colors.textMuted} value={company} onChangeText={setCompany} textAlign={isRTL ? "right" : "left"} />
              </View>
              <View style={modalStyles.field}>
                <Text style={[modalStyles.label, { textAlign: isRTL ? "right" : "left" }]}>{t("common", "type")}</Text>
                <View style={[modalStyles.typeGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  {(["fulltime", "parttime", "freelance", "volunteer"] as Job["type"][]).map((tKey) => (
                    <TouchableOpacity
                      key={tKey}
                      style={[modalStyles.typeBtn, type === tKey && { backgroundColor: typeColors[tKey], borderColor: typeColors[tKey] }]}
                      onPress={() => setType(tKey)}
                    >
                      <Text style={[modalStyles.typeBtnText, type === tKey && { color: "#fff" }]}>{jobTypes[tKey === "volunteer" ? "training" : tKey] ?? tKey}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={modalStyles.field}>
                <Text style={[modalStyles.label, { textAlign: isRTL ? "right" : "left" }]}>{t("common", "location")}</Text>
                <TextInput style={modalStyles.input} placeholder={t("common", "location")} placeholderTextColor={Colors.textMuted} value={location} onChangeText={setLocation} textAlign={isRTL ? "right" : "left"} />
              </View>
              <View style={modalStyles.field}>
                <Text style={[modalStyles.label, { textAlign: isRTL ? "right" : "left" }]}>{t("jobs", "salary")}</Text>
                <TextInput style={modalStyles.input} placeholder={t("jobs", "salaryPlaceholder")} placeholderTextColor={Colors.textMuted} value={salary} onChangeText={setSalary} textAlign={isRTL ? "right" : "left"} />
              </View>
              <View style={modalStyles.field}>
                <Text style={[modalStyles.label, { textAlign: isRTL ? "right" : "left" }]}>{t("common", "description")}</Text>
                <TextInput style={[modalStyles.input, modalStyles.textArea]} placeholder={t("jobs", "requirementsPlaceholder")} placeholderTextColor={Colors.textMuted} value={description} onChangeText={setDescription} multiline numberOfLines={4} textAlignVertical="top" textAlign={isRTL ? "right" : "left"} />
              </View>
              <View style={modalStyles.field}>
                <Text style={[modalStyles.label, { textAlign: isRTL ? "right" : "left" }]}>{t("common", "phone")} *</Text>
                <TextInput style={modalStyles.input} placeholder="+249..." placeholderTextColor={Colors.textMuted} value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" textAlign={isRTL ? "right" : "left"} />
              </View>
              <TouchableOpacity style={modalStyles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                <Text style={modalStyles.saveBtnText}>{t("jobs", "postJob")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function JobsScreen() {
  const { t, isRTL, tr } = useLang();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const jobTypes = t("jobs", "jobTypes");
  const TYPE_OPTIONS = useMemo(() => [
    { key: "all", label: t("common", "all") },
    { key: "fulltime", label: jobTypes.fulltime },
    { key: "parttime", label: jobTypes.parttime },
    { key: "freelance", label: jobTypes.freelance },
    { key: "volunteer", label: jobTypes.training },
  ], [jobTypes, t]);

  function getTypeLabel(type: Job["type"]) {
    switch (type) {
      case "fulltime": return jobTypes.fulltime;
      case "parttime": return jobTypes.parttime;
      case "freelance": return jobTypes.freelance;
      case "volunteer": return jobTypes.training;
    }
  }

  function timeAgo(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (days >= 1) return tr(`منذ ${days} ${days === 1 ? "يوم" : "أيام"}`, `${days} days ago`);
    if (hours >= 1) return tr(`منذ ${hours} ${hours === 1 ? "ساعة" : "ساعات"}`, `${hours} hours ago`);
    return tr("منذ قليل", "Just now");
  }

  useEffect(() => { loadJobs(); }, []);

  const loadJobs = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const saved: Job[] = raw ? JSON.parse(raw) : [];
      setJobs([...saved, ...SAMPLE_JOBS]);
    } catch {
      setJobs(SAMPLE_JOBS);
    }
  };

  const saveJob = async (jobData: Omit<Job, "id" | "createdAt">): Promise<void> => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const newJob: Job = {
      ...jobData,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const existing: Job[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([newJob, ...existing]));
    await loadJobs();
  };

  const deleteJob = (id: string) => {
    Alert.alert(t("jobs", "deleteConfirm") || t("common", "confirm"), t("common", "deleteMessage"), [
      { text: t("common", "cancel"), style: "cancel" },
      {
        text: t("common", "delete"),
        style: "destructive",
        onPress: async () => {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          const saved: Job[] = raw ? JSON.parse(raw) : [];
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saved.filter((j) => j.id !== id)));
          loadJobs();
        },
      },
    ]);
  };

  const filtered = jobs.filter((j) => filter === "all" || j.type === filter);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 16, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <AnimatedPress onPress={() => {
          if (auth.isGuest) {
            Alert.alert(
              tr("تسجيل مطلوب", "Login Required"),
              tr("يجب إنشاء حساب لنشر إعلانات الوظائف.", "You need an account to post job listings."),
              [{ text: tr("حسناً", "OK") }]
            );
            return;
          }
          setShowModal(true);
        }}>
          <View style={[styles.addBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Ionicons name="add" size={20} color={Colors.cardBg} />
            <Text style={styles.addBtnText}>{t("jobs", "postJob")}</Text>
          </View>
        </AnimatedPress>
        <Text style={styles.headerTitle}>{t("jobs", "title")}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow} contentContainerStyle={[styles.filtersContent, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {TYPE_OPTIONS.map((opt) => (
          <AnimatedPress key={opt.key} scaleDown={0.92} onPress={() => setFilter(opt.key)}>
            <View style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, filter === opt.key && styles.filterChipTextActive]}>{opt.label}</Text>
            </View>
          </AnimatedPress>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="briefcase-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>{t("jobs", "noJobs")}</Text>
            <Text style={styles.emptySubtitle}>{t("jobs", "noJobsSub")}</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const color = getTypeColor(item.type);
          const isExpanded = expandedId === item.id;
          return (
            <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
            <AnimatedPress
              onPress={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <View style={styles.jobCard}>
              <View style={[styles.jobCardTop, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={[styles.jobMeta, { alignItems: isRTL ? "flex-start" : "flex-end" }]}>
                  <Text style={styles.timeAgo}>{timeAgo(item.createdAt)}</Text>
                  {!item.id.startsWith("sample") && (
                    <AnimatedPress onPress={() => deleteJob(item.id)}>
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    </AnimatedPress>
                  )}
                </View>
                <View style={[styles.jobInfo, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                  <Text style={[styles.jobTitle, { textAlign: isRTL ? "right" : "left" }]}>{item.title}</Text>
                  <View style={[styles.companyRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <MaterialCommunityIcons name="office-building-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.companyName}>{item.company}</Text>
                  </View>
                  <View style={[styles.tagsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <View style={[styles.typeTag, { backgroundColor: color + "18" }]}>
                      <Text style={[styles.typeTagText, { color }]}>{getTypeLabel(item.type)}</Text>
                    </View>
                    {item.location ? (
                      <View style={[styles.locationTag, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                        <Text style={styles.locationText}>{item.location}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {isExpanded && (
                <View>
                  <View style={styles.cardDivider} />
                  <View style={styles.expandedContent}>
                    {item.salary ? (
                      <View style={[styles.salaryRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <Text style={[styles.salaryValue, { textAlign: isRTL ? "right" : "left" }]}>{item.salary}</Text>
                        <MaterialCommunityIcons name="cash" size={15} color={Colors.primary} />
                      </View>
                    ) : null}
                    {item.description ? (
                      <Text style={[styles.jobDesc, { textAlign: isRTL ? "right" : "left" }]}>{item.description}</Text>
                    ) : null}
                    <View style={[styles.contactRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      <AnimatedPress
                        style={{ flex: 1 }}
                        onPress={() => {
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          Linking.openURL(`tel:${item.contactPhone}`);
                        }}
                      >
                        <View style={[styles.applyBtn, { backgroundColor: color, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                          <Ionicons name="call" size={16} color={Colors.cardBg} />
                          <Text style={styles.applyBtnText}>{t("jobs", "contact")}</Text>
                        </View>
                      </AnimatedPress>
                      <AnimatedPress
                        style={{ flex: 1 }}
                        onPress={() => {
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          Linking.openURL(`https://wa.me/${item.contactPhone.replace(/[^0-9]/g, "")}`);
                        }}
                      >
                        <View style={[styles.applyBtn, { backgroundColor: "#25D366", flexDirection: isRTL ? "row-reverse" : "row" }]}>
                          <Ionicons name="logo-whatsapp" size={16} color={Colors.cardBg} />
                          <Text style={styles.applyBtnText}>WhatsApp</Text>
                        </View>
                      </AnimatedPress>
                    </View>
                  </View>
                </View>
              )}
              </View>
            </AnimatedPress>
            </Animated.View>
          );
        }}
      />

      <AddJobModal visible={showModal} onClose={() => setShowModal(false)} onSave={saveJob} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  addBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.cardBg },
  filtersRow: {
    backgroundColor: Colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  filtersContent: {
    flexDirection: "row-reverse",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterChipTextActive: { color: "#FFFFFF" },
  listContent: { padding: 14, gap: 12 },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 18, color: Colors.textSecondary },
  emptySubtitle: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  jobCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  jobCardTop: { flexDirection: "row-reverse", padding: 14, gap: 10 },
  jobMeta: { flexDirection: "column", alignItems: "flex-start", gap: 8, paddingTop: 2 },
  jobInfo: { flex: 1, alignItems: "flex-end", gap: 5 },
  jobTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  companyRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  companyName: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary },
  tagsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  typeTag: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  typeTagText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  locationTag: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  locationText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  timeAgo: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 14 },
  expandedContent: { padding: 14, gap: 12 },
  salaryRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  salaryValue: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary, flex: 1, textAlign: "right" },
  jobDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  contactRow: { flexDirection: "row-reverse", gap: 8 },
  applyBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  applyBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.cardBg },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.divider,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  form: { padding: 16, gap: 14 },
  field: { gap: 6 },
  label: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  input: {
    backgroundColor: Colors.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: Colors.textPrimary,
  },
  textArea: { minHeight: 90, lineHeight: 22 },
  typeGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  typeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  typeBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.cardBg },
});
