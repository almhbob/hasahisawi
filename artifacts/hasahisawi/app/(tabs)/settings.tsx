import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, Modal, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import type { LostItem } from "./missing";
import type { Job } from "./jobs";
import type { Facility } from "./medical";
import type { School, Institution } from "./student";
import { LOST_ITEMS_KEY } from "./missing";
import { MEDICAL_KEY, loadFacilities, getTypeLabel, getTypeIcon, getTypeColor } from "./medical";
import { SCHOOLS_KEY, loadSchools, getSchoolTypeLabel, getSchoolTypeIcon, getSchoolTypeColor, INSTITUTIONS_KEY, loadInstitutions, getInstitutionTypeLabel, getInstitutionTypeColor, getInstitutionTypeIcon } from "./student";
import type { FamilyItem, AuctionItem } from "./market";
import type { SportClub, SportEvent } from "./sports";
import { SPORT_CLUBS_KEY, SPORT_EVENTS_KEY, loadSportClubs, loadSportEvents, getSportLabel, getSportColor } from "./sports";
import type { CulturalCenter, CulturalEvent } from "./culture";
import { CULTURAL_CENTERS_KEY, CULTURAL_EVENTS_KEY, loadCulturalCenters, loadCulturalEvents, getCenterTypeLabel, getCenterTypeColor, getEventTypeLabel, getEventTypeColor } from "./culture";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";

const DEFAULT_ADMIN_PIN = "4444";
const ADMIN_PIN_KEY = "admin_pin";
const ADMIN_NAME_KEY = "admin_name";
const ADMIN_KEY = "admin_logged_in";
const JOBS_KEY = "jobs_listings";
const FAMILY_KEY = "family_market_v1";
const AUCTION_KEY = "auction_market_v1";

type AdminTab = "overview" | "medical" | "schools" | "institutions" | "sports" | "culture" | "lost" | "jobs" | "market" | "notifications" | "news" | "profile" | "users";

type ManagedUser = {
  id: number;
  name: string;
  national_id_masked?: string | null;
  phone?: string | null;
  email?: string | null;
  role: string;
  created_at: string;
  permissions?: string[];
};

export async function getAdminPin(): Promise<string> {
  const stored = await AsyncStorage.getItem(ADMIN_PIN_KEY);
  return stored || DEFAULT_ADMIN_PIN;
}


// ─── Add Facility Modal ───────────────────────────────────────────────────────

// ─── Add Job Modal ───────────────────────────────────────────────────────────
function AddJobModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void;
  onSave: (j: Omit<Job, "id" | "createdAt">) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState<Job["type"]>("fulltime");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [salary, setSalary] = useState("");
  const reset = () => { setTitle(""); setCompany(""); setType("fulltime"); setLocation(""); setDescription(""); setContactPhone(""); setSalary(""); };
  const TYPE_OPTIONS: { key: Job["type"]; label: string; color: string }[] = [
    { key: "fulltime", label: "دوام كامل", color: Colors.primary },
    { key: "parttime", label: "دوام جزئي", color: "#2E7D9A" },
    { key: "freelance", label: "مستقل", color: "#6A5ACD" },
    { key: "volunteer", label: "تطوع", color: Colors.accent },
  ];
  const handleSave = async () => {
    if (!title.trim() || !company.trim() || !contactPhone.trim()) {
      Alert.alert(t("common", "error"), "يرجى ملء الحقول المطلوبة");
      return;
    }
    await onSave({ title: title.trim(), company: company.trim(), type, location: location.trim(), description: description.trim(), contactPhone: contactPhone.trim(), salary: salary.trim() || undefined });
    reset(); onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={ms.handle} />
          <View style={ms.sheetHead}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={ms.sheetTitle}>إضافة وظيفة</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={ms.form}>
              <FieldRow label="نوع الوظيفة">
                <View style={ms.chipRow}>
                  {TYPE_OPTIONS.map(o => (
                    <TouchableOpacity key={o.key} style={[ms.chip, type === o.key && { backgroundColor: o.color, borderColor: o.color }]} onPress={() => setType(o.key)}>
                      <Text style={[ms.chipText, type === o.key && { color: "#fff" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>
              <FieldInput label="المسمى الوظيفي *" value={title} onChange={setTitle} placeholder="مثال: مدرس رياضيات" />
              <FieldInput label="جهة العمل *" value={company} onChange={setCompany} placeholder="اسم الشركة أو المؤسسة" />
              <FieldInput label="الموقع" value={location} onChange={setLocation} placeholder="مثال: حصاحيصا - السوق المركزي" />
              <FieldInput label="الراتب" value={salary} onChange={setSalary} placeholder="مثال: 3000 جنيه أو يُحدد عند المقابلة" />
              <FieldInput label="الوصف والمتطلبات" value={description} onChange={setDescription} placeholder="اكتب تفاصيل الوظيفة والمتطلبات..." multi />
              <FieldInput label="رقم التواصل *" value={contactPhone} onChange={setContactPhone} placeholder="+249..." numeric />
              <SaveBtn label={t("common", "save")} onPress={handleSave} color="#1E6E8A" />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AddFacilityModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void;
  onSave: (f: Omit<Facility, "id">) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const [name, setName] = useState("");
  const [type, setType] = useState<Facility["type"]>("pharmacy");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");
  const [isOnCall, setIsOnCall] = useState(false);
  const [specialties, setSpecialties] = useState("");

  const reset = () => { setName(""); setType("pharmacy"); setAddress(""); setPhone(""); setHours(""); setIsOnCall(false); setSpecialties(""); };

  const TYPE_OPTIONS: { key: Facility["type"]; label: string }[] = [
    { key: "pharmacy", label: t("medical", "pharmacy") },
    { key: "hospital", label: t("medical", "hospital") },
    { key: "clinic", label: t("medical", "clinic") },
  ];

  const handleSave = async () => {
    if (!name.trim() || !address.trim() || !phone.trim() || !hours.trim()) {
      Alert.alert(t("common", "error"), t("auth", "fillAll"));
      return;
    }
    const specs = specialties.trim() ? specialties.split("،").map(s => s.trim()).filter(Boolean) : undefined;
    await onSave({ name: name.trim(), type, address: address.trim(), phone: phone.trim(), hours: hours.trim(), isOnCall, specialties: specs });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={ms.handle} />
          <View style={ms.sheetHead}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={ms.sheetTitle}>{t("admin", "addFacility")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={ms.form}>
              <FieldRow label={t("common", "type")}>
                <View style={ms.chipRow}>
                  {TYPE_OPTIONS.map(o => (
                    <TouchableOpacity key={o.key} style={[ms.chip, type === o.key && { backgroundColor: getTypeColor(o.key), borderColor: getTypeColor(o.key) }]} onPress={() => setType(o.key)}>
                      <Text style={[ms.chipText, type === o.key && { color: "#fff" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>
              <FieldInput label={t("common", "name") + " *"} value={name} onChange={setName} placeholder={t("auth", "namePlaceholder")} />
              <FieldInput label={t("common", "address") + " *"} value={address} onChange={setAddress} placeholder={t("common", "address")} />
              <FieldInput label={t("common", "phone") + " *"} value={phone} onChange={setPhone} placeholder="+249..." numeric />
              <FieldInput label={t("common", "hours") + " *"} value={hours} onChange={setHours} placeholder="مثال: 8ص - 10م أو 24 ساعة" />
              <FieldInput label={t("medical", "specialties") + " (افصل بـ ،)"} value={specialties} onChange={setSpecialties} placeholder="مثال: طوارئ، أطفال، جراحة" />
              <FieldRow label={t("medical", "onCall")}>
                <TouchableOpacity style={[ms.toggle, isOnCall && ms.toggleOn]} onPress={() => setIsOnCall(v => !v)}>
                  <View style={[ms.toggleThumb, isOnCall && ms.toggleThumbOn]} />
                </TouchableOpacity>
              </FieldRow>
              <SaveBtn label={t("common", "save")} onPress={handleSave} color={Colors.primary} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Add School Modal ─────────────────────────────────────────────────────────

function AddSchoolModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void;
  onSave: (s: Omit<School, "id">) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const [name, setName] = useState("");
  const [type, setType] = useState<School["type"]>("primary");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [grades, setGrades] = useState("");
  const [shifts, setShifts] = useState("");

  const reset = () => { setName(""); setType("primary"); setAddress(""); setPhone(""); setGrades(""); setShifts(""); };

  const TYPE_OPTIONS: { key: School["type"]; label: string }[] = [
    { key: "primary", label: t("student", "schoolTypes.primary") },
    { key: "secondary", label: t("student", "schoolTypes.secondary") },
    { key: "institute", label: t("student", "schoolTypes.middle") },
    { key: "university", label: t("student", "institutionTypes.university") },
  ];

  const handleSave = async () => {
    if (!name.trim() || !address.trim() || !phone.trim()) {
      Alert.alert(t("common", "error"), t("auth", "fillAll"));
      return;
    }
    await onSave({ name: name.trim(), type, address: address.trim(), phone: phone.trim(), grades: grades.trim() || undefined, shifts: shifts.trim() || undefined, services: [], status: "active" as const, createdAt: new Date().toISOString() });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={ms.handle} />
          <View style={ms.sheetHead}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={ms.sheetTitle}>{t("admin", "addSchool")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={ms.form}>
              <FieldRow label={t("common", "type")}>
                <View style={ms.chipRow}>
                  {TYPE_OPTIONS.map(o => (
                    <TouchableOpacity key={o.key} style={[ms.chip, type === o.key && { backgroundColor: getSchoolTypeColor(o.key), borderColor: getSchoolTypeColor(o.key) }]} onPress={() => setType(o.key)}>
                      <Text style={[ms.chipText, type === o.key && { color: "#fff" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>
              <FieldInput label={t("common", "name") + " *"} value={name} onChange={setName} placeholder={t("auth", "namePlaceholder")} />
              <FieldInput label={t("common", "address") + " *"} value={address} onChange={setAddress} placeholder={t("common", "address")} />
              <FieldInput label={t("common", "phone") + " *"} value={phone} onChange={setPhone} placeholder="+249..." numeric />
              <FieldInput label={t("student", "grades")} value={grades} onChange={setGrades} placeholder="مثال: الصف الأول - الثامن" />
              <FieldInput label="الفترات" value={shifts} onChange={setShifts} placeholder="مثال: صباحية ومسائية" />
              <SaveBtn label={t("common", "save")} onPress={handleSave} color={Colors.primary} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Add Institution Modal ────────────────────────────────────────────────────

function AddInstitutionModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void;
  onSave: (i: Omit<Institution, "id">) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const [name, setName] = useState("");
  const [type, setType] = useState<Institution["type"]>("primary");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");

  const reset = () => { setName(""); setType("primary"); setAddress(""); setPhone(""); setDescription(""); setWebsite(""); };

  const INST_TYPES: { key: Institution["type"]; label: string }[] = [
    { key: "kindergarten", label: "روضة" },
    { key: "primary",      label: t("student", "schoolTypes.primary") },
    { key: "secondary",    label: t("student", "schoolTypes.secondary") },
    { key: "university",   label: t("student", "institutionTypes.university") },
    { key: "institute",    label: t("student", "institutionTypes.institute") },
    { key: "training",     label: t("student", "institutionTypes.training") },
    { key: "quran",        label: t("student", "schoolTypes.khalwa") },
    { key: "other",        label: t("common", "other") },
  ];

  const handleSave = async () => {
    if (!name.trim() || !address.trim() || !phone.trim()) {
      Alert.alert(t("common", "error"), t("auth", "fillAll"));
      return;
    }
    await onSave({
      name: name.trim(), type, address: address.trim(), phone: phone.trim(),
      description: description.trim() || undefined,
      website: website.trim() || undefined,
      services: [],
      status: "active" as const,
      createdAt: new Date().toISOString(),
    });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={ms.handle} />
          <View style={ms.sheetHead}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={ms.sheetTitle}>{t("admin", "addInstitution")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={ms.form}>
              <FieldRow label={t("common", "type")}>
                <View style={ms.chipRow}>
                  {INST_TYPES.map(o => (
                    <TouchableOpacity
                      key={o.key}
                      style={[ms.chip, type === o.key && { backgroundColor: getInstitutionTypeColor(o.key), borderColor: getInstitutionTypeColor(o.key) }]}
                      onPress={() => setType(o.key)}
                    >
                      <Text style={[ms.chipText, type === o.key && { color: "#fff" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>
              <FieldInput label={t("common", "name") + " *"} value={name} onChange={setName} placeholder={t("auth", "namePlaceholder")} />
              <FieldInput label={t("common", "address") + " *"} value={address} onChange={setAddress} placeholder={t("common", "address")} />
              <FieldInput label={t("common", "phone") + " *"} value={phone} onChange={setPhone} placeholder="+249..." numeric />
              <FieldInput label={t("common", "description")} value={description} onChange={setDescription} placeholder={t("common", "description")} multi />
              <FieldInput label="الموقع الإلكتروني" value={website} onChange={setWebsite} placeholder="www.example.com" />
              <SaveBtn label={t("common", "save")} onPress={handleSave} color="#27AE60" />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Add Sport Club Modal ─────────────────────────────────────────────────────

function AddSportClubModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void;
  onSave: (c: Omit<SportClub, "id">) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const [name, setName] = useState("");
  const [sport, setSport] = useState<SportClub["sport"]>("football");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [founded, setFounded] = useState("");

  const reset = () => { setName(""); setSport("football"); setAddress(""); setPhone(""); setDescription(""); setFounded(""); };

  const SPORT_OPTIONS: { key: SportClub["sport"]; label: string }[] = [
    { key: "football",   label: t("sports", "sportTypes.football") },
    { key: "basketball", label: t("sports", "sportTypes.basketball") },
    { key: "volleyball", label: t("sports", "sportTypes.volleyball") },
    { key: "athletics",  label: t("sports", "sportTypes.athletics") },
    { key: "swimming",   label: "سباحة" },
    { key: "boxing",     label: "ملاكمة" },
    { key: "other",      label: t("sports", "sportTypes.other") },
  ];

  const handleSave = async () => {
    if (!name.trim() || !address.trim() || !phone.trim()) {
      Alert.alert(t("common", "error"), t("auth", "fillAll"));
      return;
    }
    await onSave({ name: name.trim(), sport, address: address.trim(), phone: phone.trim(), description: description.trim() || undefined, founded: founded.trim() || undefined });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={ms.handle} />
          <View style={ms.sheetHead}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={ms.sheetTitle}>{t("admin", "addClub")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={ms.form}>
              <FieldRow label={t("common", "type")}>
                <View style={ms.chipRow}>
                  {SPORT_OPTIONS.map(o => (
                    <TouchableOpacity
                      key={o.key}
                      style={[ms.chip, sport === o.key && { backgroundColor: getSportColor(o.key), borderColor: getSportColor(o.key) }]}
                      onPress={() => setSport(o.key)}
                    >
                      <Text style={[ms.chipText, sport === o.key && { color: "#fff" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>
              <FieldInput label={t("common", "name") + " *"} value={name} onChange={setName} placeholder={t("auth", "namePlaceholder")} />
              <FieldInput label={t("common", "address") + " *"} value={address} onChange={setAddress} placeholder={t("common", "address")} />
              <FieldInput label={t("common", "phone") + " *"} value={phone} onChange={setPhone} placeholder="+249..." numeric />
              <FieldInput label={t("common", "description")} value={description} onChange={setDescription} placeholder={t("common", "description")} multi />
              <FieldInput label={t("sports", "founded")} value={founded} onChange={setFounded} placeholder="مثال: 2005" numeric />
              <SaveBtn label={t("common", "save")} onPress={handleSave} color="#27AE60" />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Add Sport Event Modal ────────────────────────────────────────────────────

function AddSportEventModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void;
  onSave: (e: Omit<SportEvent, "id">) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState<SportEvent["sport"]>("football");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const reset = () => { setTitle(""); setSport("football"); setDate(""); setLocation(""); setDescription(""); setContactPhone(""); };

  const SPORT_OPTIONS: { key: SportEvent["sport"]; label: string }[] = [
    { key: "football",   label: t("sports", "sportTypes.football") },
    { key: "basketball", label: t("sports", "sportTypes.basketball") },
    { key: "volleyball", label: t("sports", "sportTypes.volleyball") },
    { key: "athletics",  label: t("sports", "sportTypes.athletics") },
    { key: "swimming",   label: "سباحة" },
    { key: "boxing",     label: "ملاكمة" },
    { key: "other",      label: t("sports", "sportTypes.other") },
  ];

  const handleSave = async () => {
    if (!title.trim() || !date.trim() || !location.trim()) {
      Alert.alert(t("common", "error"), t("auth", "fillAll"));
      return;
    }
    await onSave({ title: title.trim(), sport, date: date.trim(), location: location.trim(), description: description.trim() || undefined, contactPhone: contactPhone.trim() || undefined });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={ms.handle} />
          <View style={ms.sheetHead}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={ms.sheetTitle}>{t("admin", "addEvent")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={ms.form}>
              <FieldRow label={t("common", "type")}>
                <View style={ms.chipRow}>
                  {SPORT_OPTIONS.map(o => (
                    <TouchableOpacity
                      key={o.key}
                      style={[ms.chip, sport === o.key && { backgroundColor: getSportColor(o.key), borderColor: getSportColor(o.key) }]}
                      onPress={() => setSport(o.key)}
                    >
                      <Text style={[ms.chipText, sport === o.key && { color: "#fff" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>
              <FieldInput label={t("common", "name") + " *"} value={title} onChange={setTitle} placeholder={t("auth", "namePlaceholder")} />
              <FieldInput label={t("common", "date") + " *"} value={date} onChange={setDate} placeholder="مثال: 15 مارس 2026" />
              <FieldInput label={t("common", "location") + " *"} value={location} onChange={setLocation} placeholder={t("common", "location")} />
              <FieldInput label={t("common", "description")} value={description} onChange={setDescription} placeholder={t("common", "description")} multi />
              <FieldInput label={t("common", "phone")} value={contactPhone} onChange={setContactPhone} placeholder="+249..." numeric />
              <SaveBtn label={t("common", "save")} onPress={handleSave} color="#E67E22" />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Add Cultural Center Modal ────────────────────────────────────────────────

function AddCulturalCenterModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void;
  onSave: (c: Omit<CulturalCenter, "id">) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const [name, setName] = useState("");
  const [type, setType] = useState<CulturalCenter["type"]>("cultural_center");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");

  const reset = () => { setName(""); setType("cultural_center"); setAddress(""); setPhone(""); setDescription(""); setHours(""); };

  const TYPE_OPTIONS: { key: CulturalCenter["type"]; label: string }[] = [
    { key: "library",         label: t("culture", "centerTypes.library") },
    { key: "cultural_center", label: t("culture", "centerTypes.community") },
    { key: "art_center",      label: t("culture", "centerTypes.gallery") },
    { key: "theater",         label: t("culture", "centerTypes.theater") },
    { key: "museum",          label: "متحف" },
    { key: "heritage",        label: "تراث" },
    { key: "other",           label: t("common", "other") },
  ];

  const handleSave = async () => {
    if (!name.trim() || !address.trim() || !phone.trim()) {
      Alert.alert(t("common", "error"), t("auth", "fillAll"));
      return;
    }
    await onSave({ name: name.trim(), type, address: address.trim(), phone: phone.trim(), description: description.trim() || undefined, hours: hours.trim() || undefined });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={ms.handle} />
          <View style={ms.sheetHead}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={ms.sheetTitle}>{t("admin", "addInstitution")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={ms.form}>
              <FieldRow label={t("common", "type")}>
                <View style={ms.chipRow}>
                  {TYPE_OPTIONS.map(o => (
                    <TouchableOpacity
                      key={o.key}
                      style={[ms.chip, type === o.key && { backgroundColor: getCenterTypeColor(o.key), borderColor: getCenterTypeColor(o.key) }]}
                      onPress={() => setType(o.key)}
                    >
                      <Text style={[ms.chipText, type === o.key && { color: "#fff" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>
              <FieldInput label={t("common", "name") + " *"} value={name} onChange={setName} placeholder={t("auth", "namePlaceholder")} />
              <FieldInput label={t("common", "address") + " *"} value={address} onChange={setAddress} placeholder={t("common", "address")} />
              <FieldInput label={t("common", "phone") + " *"} value={phone} onChange={setPhone} placeholder="+249..." numeric />
              <FieldInput label={t("common", "hours")} value={hours} onChange={setHours} placeholder="مثال: 8 صباحاً - 8 مساءً" />
              <FieldInput label={t("common", "description")} value={description} onChange={setDescription} placeholder={t("common", "description")} multi />
              <SaveBtn label={t("common", "save")} onPress={handleSave} color="#8E44AD" />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Add Cultural Event Modal ─────────────────────────────────────────────────

function AddCulturalEventModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void;
  onSave: (e: Omit<CulturalEvent, "id">) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CulturalEvent["type"]>("exhibition");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const reset = () => { setTitle(""); setType("exhibition"); setDate(""); setLocation(""); setDescription(""); setContactPhone(""); };

  const TYPE_OPTIONS: { key: CulturalEvent["type"]; label: string }[] = [
    { key: "exhibition", label: t("culture", "eventTypes.exhibition") },
    { key: "workshop",   label: "ورشة عمل" },
    { key: "lecture",    label: t("culture", "eventTypes.lecture") },
    { key: "festival",   label: "مهرجان" },
    { key: "book_fair",  label: "معرض كتاب" },
    { key: "theater",    label: "مسرحية" },
    { key: "other",      label: t("common", "other") },
  ];

  const handleSave = async () => {
    if (!title.trim() || !date.trim() || !location.trim()) {
      Alert.alert(t("common", "error"), t("auth", "fillAll"));
      return;
    }
    await onSave({ title: title.trim(), type, date: date.trim(), location: location.trim(), description: description.trim() || undefined, contactPhone: contactPhone.trim() || undefined });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={[ms.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={ms.handle} />
          <View style={ms.sheetHead}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={ms.sheetTitle}>{t("admin", "addEvent")}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={ms.form}>
              <FieldRow label={t("common", "type")}>
                <View style={ms.chipRow}>
                  {TYPE_OPTIONS.map(o => (
                    <TouchableOpacity
                      key={o.key}
                      style={[ms.chip, type === o.key && { backgroundColor: getEventTypeColor(o.key), borderColor: getEventTypeColor(o.key) }]}
                      onPress={() => setType(o.key)}
                    >
                      <Text style={[ms.chipText, type === o.key && { color: "#fff" }]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldRow>
              <FieldInput label={t("common", "name") + " *"} value={title} onChange={setTitle} placeholder={t("auth", "namePlaceholder")} />
              <FieldInput label={t("common", "date") + " *"} value={date} onChange={setDate} placeholder="مثال: 20 مارس 2026" />
              <FieldInput label={t("common", "location") + " *"} value={location} onChange={setLocation} placeholder={t("common", "location")} />
              <FieldInput label={t("common", "description")} value={description} onChange={setDescription} placeholder={t("common", "description")} multi />
              <FieldInput label={t("common", "phone")} value={contactPhone} onChange={setContactPhone} placeholder="+249..." numeric />
              <SaveBtn label={t("common", "save")} onPress={handleSave} color="#D35400" />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Shared Form Components ───────────────────────────────────────────────────

function FieldInput({ label, value, onChange, placeholder, numeric, multi }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; numeric?: boolean; multi?: boolean;
}) {
  return (
    <View style={ms.fieldWrap}>
      <Text style={ms.fieldLabel}>{label}</Text>
      <TextInput
        style={[ms.fieldInput, multi && ms.fieldTextArea]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={numeric ? "phone-pad" : "default"}
        textAlign="right"
        multiline={multi}
        textAlignVertical={multi ? "top" : undefined}
      />
    </View>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={ms.fieldWrap}>
      <Text style={ms.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SaveBtn({ label, onPress, color }: { label: string; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity style={[ms.saveBtn, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.85}>
      <Text style={ms.saveBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Admin Card ───────────────────────────────────────────────────────────────

function AdminCard({
  title, subtitle, meta, statusColor, extraBadge,
  onDelete, onAction, actionLabel, actionIcon, actionColor,
}: {
  title: string; subtitle?: string; meta?: string; statusColor?: string;
  extraBadge?: string;
  onDelete?: () => void;
  onAction?: () => void; actionLabel?: string; actionIcon?: string; actionColor?: string;
}) {
  return (
    <View style={ac.card}>
      <View style={ac.row}>
        <View style={ac.actions}>
          {onDelete && (
            <TouchableOpacity style={ac.delBtn} onPress={onDelete}>
              <Ionicons name="trash-outline" size={15} color={Colors.danger} />
            </TouchableOpacity>
          )}
          {onAction && actionIcon && (
            <TouchableOpacity style={[ac.actionBtn, { backgroundColor: (actionColor ?? Colors.success) + "15" }]} onPress={onAction}>
              <Ionicons name={actionIcon as any} size={15} color={actionColor ?? Colors.success} />
            </TouchableOpacity>
          )}
        </View>
        <View style={ac.info}>
          <View style={ac.titleRow}>
            {statusColor && <View style={[ac.dot, { backgroundColor: statusColor }]} />}
            {extraBadge && <View style={ac.badge}><Text style={ac.badgeText}>{extraBadge}</Text></View>}
            <Text style={ac.title} numberOfLines={2}>{title}</Text>
          </View>
          {subtitle && <Text style={ac.sub} numberOfLines={1}>{subtitle}</Text>}
          {meta && <Text style={ac.meta} numberOfLines={1}>{meta}</Text>}
        </View>
      </View>
    </View>
  );
}

// ─── Section Header with Add Button ──────────────────────────────────────────

function SectionBar({ label, count, onAdd, addColor }: {
  label: string; count: number; onAdd: () => void; addColor?: string;
}) {
  const { t } = useLang();
  return (
    <View style={sh.row}>
      <TouchableOpacity style={[sh.addBtn, { backgroundColor: addColor ?? Colors.primary }]} onPress={onAdd}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={sh.addText}>{t("common", "add")}</Text>
      </TouchableOpacity>
      <View style={sh.labelWrap}>
        <Text style={sh.label}>{label}</Text>
        <View style={sh.countBadge}><Text style={sh.countText}>{count}</Text></View>
      </View>
    </View>
  );
}

function EmptySection({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name={icon as any} size={38} color={Colors.textMuted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/// ─── Notifications Admin Section ────────────────────────────────────────────

function NotificationsAdminSection({ t, isRTL, lang }: { t: any; isRTL: boolean; lang: string }) {
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newBody, setNewBody] = React.useState("");
  const [newType, setNewType] = React.useState("general");
  const [saving, setSaving] = React.useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const base = getApiUrl();
      const res = await fetch(`${base}api/notifications`);
      if (res.ok) setNotifications(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  React.useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newTitle.trim() || !newBody.trim()) return;
    setSaving(true);
    try {
      const base = getApiUrl();
      await fetch(`${base}api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim(), type: newType }),
        credentials: "include",
      });
      setNewTitle(""); setNewBody(""); setNewType("general"); setShowAdd(false);
      await load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      const base = getApiUrl();
      await fetch(`${base}api/notifications/${id}`, { method: "DELETE", credentials: "include" });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e) { console.error(e); }
  };

  const TYPES = ["general", "medical", "news", "alert", "event"];

  return (
    <View style={styles.section}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Text style={styles.sectionTitle}>{t("notifications", "title")}</Text>
        <TouchableOpacity onPress={() => setShowAdd(v => !v)} style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
          <Text style={{ color: "#fff", fontFamily: "Cairo_600SemiBold", fontSize: 13 }}>{t("common", "add")}</Text>
          <Ionicons name="add" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {showAdd && (
        <View style={{ backgroundColor: Colors.cardBg, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.primary + "30" }}>
          <Text style={{ color: Colors.textPrimary, fontFamily: "Cairo_600SemiBold", fontSize: 14, textAlign: "right", marginBottom: 8 }}>{lang === "ar" ? "إشعار جديد" : "New Notification"}</Text>
          <TextInput
            style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "right", borderWidth: 1, borderColor: Colors.divider, marginBottom: 8 }}
            placeholder={lang === "ar" ? "العنوان" : "Title"}
            placeholderTextColor={Colors.textMuted}
            value={newTitle}
            onChangeText={setNewTitle}
          />
          <TextInput
            style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "right", borderWidth: 1, borderColor: Colors.divider, marginBottom: 8, minHeight: 80, textAlignVertical: "top" }}
            placeholder={lang === "ar" ? "المحتوى" : "Body"}
            placeholderTextColor={Colors.textMuted}
            value={newBody}
            onChangeText={setNewBody}
            multiline
          />
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {TYPES.map(tp => (
              <TouchableOpacity key={tp} onPress={() => setNewType(tp)} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: newType === tp ? Colors.primary : Colors.divider, backgroundColor: newType === tp ? Colors.primary + "15" : "transparent" }}>
                <Text style={{ color: newType === tp ? Colors.primary : Colors.textMuted, fontFamily: "Cairo_500Medium", fontSize: 12 }}>{t("notifications", `types.${tp}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={handleAdd} disabled={saving} style={{ backgroundColor: Colors.primary, borderRadius: 10, padding: 12, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontFamily: "Cairo_600SemiBold", fontSize: 14 }}>{saving ? (lang === "ar" ? "جاري الحفظ..." : "Saving...") : t("common", "save")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 30 }}><Ionicons name="notifications-outline" size={36} color={Colors.textMuted} /></View>
      ) : notifications.length === 0 ? (
        <EmptySection icon="notifications-off-outline" text={t("notifications", "noNotifications")} />
      ) : (
        notifications.map(n => (
          <AdminCard
            key={n.id}
            title={n.title}
            subtitle={n.body}
            meta={n.type}
            statusColor={n.is_read ? Colors.textMuted : Colors.primary}
            onDelete={() => handleDelete(n.id)}
          />
        ))
      )}
    </View>
  );
}

// ─── News Admin Section ───────────────────────────────────────────────────────

function NewsAdminSection({ t, isRTL, lang }: { t: any; isRTL: boolean; lang: string }) {
  const [news, setNews] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newContent, setNewContent] = React.useState("");
  const [newCategory, setNewCategory] = React.useState("general");
  const [newAuthor, setNewAuthor] = React.useState("");
  const [newPinned, setNewPinned] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const base = getApiUrl();
      const res = await fetch(`${base}api/news`);
      if (res.ok) setNews(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  React.useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      const base = getApiUrl();
      await fetch(`${base}api/news`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim(), category: newCategory, author_name: newAuthor.trim() || undefined, is_pinned: newPinned }),
        credentials: "include",
      });
      setNewTitle(""); setNewContent(""); setNewCategory("general"); setNewAuthor(""); setNewPinned(false); setShowAdd(false);
      await load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      const base = getApiUrl();
      await fetch(`${base}api/news/${id}`, { method: "DELETE", credentials: "include" });
      setNews(prev => prev.filter(n => n.id !== id));
    } catch (e) { console.error(e); }
  };

  const CATEGORIES = ["general", "health", "education", "sports", "culture", "economy", "security"];

  return (
    <View style={styles.section}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Text style={styles.sectionTitle}>{t("news", "title")}</Text>
        <TouchableOpacity onPress={() => setShowAdd(v => !v)} style={{ backgroundColor: "#2E7D9A", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
          <Text style={{ color: "#fff", fontFamily: "Cairo_600SemiBold", fontSize: 13 }}>{t("common", "add")}</Text>
          <Ionicons name="add" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {showAdd && (
        <View style={{ backgroundColor: Colors.cardBg, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#2E7D9A30" }}>
          <Text style={{ color: Colors.textPrimary, fontFamily: "Cairo_600SemiBold", fontSize: 14, textAlign: "right", marginBottom: 8 }}>{lang === "ar" ? "خبر جديد" : "New Article"}</Text>
          <TextInput
            style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "right", borderWidth: 1, borderColor: Colors.divider, marginBottom: 8 }}
            placeholder={lang === "ar" ? "العنوان *" : "Title *"}
            placeholderTextColor={Colors.textMuted}
            value={newTitle}
            onChangeText={setNewTitle}
          />
          <TextInput
            style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "right", borderWidth: 1, borderColor: Colors.divider, marginBottom: 8, minHeight: 100, textAlignVertical: "top" }}
            placeholder={lang === "ar" ? "محتوى الخبر *" : "Content *"}
            placeholderTextColor={Colors.textMuted}
            value={newContent}
            onChangeText={setNewContent}
            multiline
          />
          <TextInput
            style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 12, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "right", borderWidth: 1, borderColor: Colors.divider, marginBottom: 8 }}
            placeholder={lang === "ar" ? "اسم الكاتب" : "Author Name"}
            placeholderTextColor={Colors.textMuted}
            value={newAuthor}
            onChangeText={setNewAuthor}
          />
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity key={cat} onPress={() => setNewCategory(cat)} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: newCategory === cat ? "#2E7D9A" : Colors.divider, backgroundColor: newCategory === cat ? "#2E7D9A15" : "transparent" }}>
                <Text style={{ color: newCategory === cat ? "#2E7D9A" : Colors.textMuted, fontFamily: "Cairo_500Medium", fontSize: 12 }}>{t("news", `categories.${cat}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setNewPinned(v => !v)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Ionicons name={newPinned ? "pin" : "pin-outline"} size={18} color={newPinned ? Colors.accent : Colors.textMuted} />
            <Text style={{ color: newPinned ? Colors.accent : Colors.textMuted, fontFamily: "Cairo_500Medium", fontSize: 13 }}>{lang === "ar" ? "تثبيت الخبر" : "Pin Article"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleAdd} disabled={saving} style={{ backgroundColor: "#2E7D9A", borderRadius: 10, padding: 12, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontFamily: "Cairo_600SemiBold", fontSize: 14 }}>{saving ? (lang === "ar" ? "جاري الحفظ..." : "Saving...") : t("common", "save")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 30 }}><Ionicons name="newspaper-outline" size={36} color={Colors.textMuted} /></View>
      ) : news.length === 0 ? (
        <EmptySection icon="newspaper-outline" text={t("news", "noNews")} />
      ) : (
        news.map(n => (
          <AdminCard
            key={n.id}
            title={n.title}
            subtitle={n.content.substring(0, 80) + (n.content.length > 80 ? "..." : "")}
            meta={`${n.author_name} · ${n.category}`}
            statusColor={n.is_pinned ? Colors.accent : Colors.textMuted}
            extraBadge={n.is_pinned ? (lang === "ar" ? "مثبت" : "Pinned") : undefined}
            onDelete={() => handleDelete(n.id)}
          />
        ))
      )}
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { t, isRTL, lang, setLanguage } = useLang();

  const ALL_ADMIN_TABS: { key: AdminTab; label: string; icon: string }[] = [
    { key: "overview",     label: t("admin", "overview"), icon: "bar-chart-outline" },
    { key: "users",        label: t("admin", "users"), icon: "people-outline" },
    { key: "medical",      label: t("admin", "medical"), icon: "medkit-outline" },
    { key: "schools",      label: t("admin", "schools"), icon: "school-outline" },
    { key: "institutions", label: t("admin", "institutions"), icon: "business-outline" },
    { key: "sports",       label: t("admin", "sports"), icon: "football-outline" },
    { key: "culture",      label: t("admin", "culture"), icon: "color-palette-outline" },
    { key: "lost",         label: t("admin", "lost"), icon: "search-outline" },
    { key: "jobs",         label: t("admin", "jobs"), icon: "briefcase-outline" },
    { key: "market",        label: t("admin", "market"), icon: "storefront-outline" },
    { key: "notifications", label: t("notifications", "title"), icon: "notifications-outline" },
    { key: "news",          label: t("news", "title"), icon: "newspaper-outline" },
    { key: "profile",       label: t("admin", "profile"), icon: "person-circle-outline" },
  ];

  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const isModerator = auth.user?.role === "moderator";
  const hasAccess = isAdmin || isModerator;
  const moderatorPermissions = (auth.user as any)?.permissions as string[] | undefined;
  const adminName = auth.user?.name || (lang === "ar" ? "المسؤول" : "Admin");

  const ADMIN_TABS = hasAccess ? ALL_ADMIN_TABS.filter(tab => {
    if (isAdmin) return true;
    if (tab.key === "profile") return true;
    if (tab.key === "overview") return true;
    if (tab.key === "users") return false;
    return moderatorPermissions?.includes(tab.key) ?? false;
  }) : ALL_ADMIN_TABS;

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [loginMode, setLoginMode] = useState<"login" | "register">("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginAdminCode, setLoginAdminCode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [editName, setEditName] = useState(auth.user?.name || "المسؤول");
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [pinChangeError, setPinChangeError] = useState("");
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [familyItems, setFamilyItems] = useState<FamilyItem[]>([]);
  const [auctionItems, setAuctionItems] = useState<AuctionItem[]>([]);
  const [marketSub, setMarketSub] = useState<"family" | "auction">("family");

  const [sportClubs, setSportClubs] = useState<SportClub[]>([]);
  const [sportEvents, setSportEvents] = useState<SportEvent[]>([]);
  const [sportsSub, setSportsSub] = useState<"clubs" | "events">("clubs");

  const [culturalCenters, setCulturalCenters] = useState<CulturalCenter[]>([]);
  const [culturalEvents, setCulturalEvents] = useState<CulturalEvent[]>([]);
  const [cultureSub, setCultureSub] = useState<"centers" | "events">("centers");

  const [showAddJob, setShowAddJob] = useState(false);
  const [showAddFacility, setShowAddFacility] = useState(false);
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [showAddInstitution, setShowAddInstitution] = useState(false);
  const [showAddSportClub, setShowAddSportClub] = useState(false);
  const [showAddSportEvent, setShowAddSportEvent] = useState(false);
  const [showAddCulturalCenter, setShowAddCulturalCenter] = useState(false);
  const [showAddCulturalEvent, setShowAddCulturalEvent] = useState(false);

  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  const checkAdmin = async () => {
    if (hasAccess) loadAll();
  };

  const loadAll = async () => {
    const [facs, schs, insts, clubs, sevents, ccenters, cevents, rawLost, rawJobs, rawFam, rawAuc] = await Promise.all([
      loadFacilities(),
      loadSchools(),
      loadInstitutions(),
      loadSportClubs(),
      loadSportEvents(),
      loadCulturalCenters(),
      loadCulturalEvents(),
      AsyncStorage.getItem(LOST_ITEMS_KEY),
      AsyncStorage.getItem(JOBS_KEY),
      AsyncStorage.getItem(FAMILY_KEY),
      AsyncStorage.getItem(AUCTION_KEY),
    ]);
    setFacilities(facs);
    setSchools(schs);
    setInstitutions(insts);
    setSportClubs(clubs);
    setSportEvents(sevents);
    setCulturalCenters(ccenters);
    setCulturalEvents(cevents);
    setLostItems(rawLost ? JSON.parse(rawLost) : []);
    setJobs(rawJobs ? JSON.parse(rawJobs) : []);
    setFamilyItems(rawFam ? JSON.parse(rawFam) : []);
    setAuctionItems(rawAuc ? JSON.parse(rawAuc) : []);
  };

  useEffect(() => { checkAdmin(); }, [hasAccess]);
  useFocusEffect(useCallback(() => {
    if (hasAccess) {
      loadAll();
      auth.refreshUser();
    }
  }, [hasAccess]));
  useEffect(() => { if (activeTab === "users" && isAdmin) loadUsers(); }, [activeTab]);

  const apiBase = () => {
    const base = getApiUrl();
    return (path: string) => new URL(path, base).toString();
  };

  const handleLogin = async () => {
    setLoginError("");
    if (!loginEmail.trim()) { setLoginError("أدخل البريد الإلكتروني"); return; }
    if (!loginPassword) { setLoginError("أدخل كلمة المرور"); return; }
    if (loginMode === "register" && !loginName.trim()) { setLoginError("أدخل الاسم"); return; }
    if (loginMode === "register" && !loginAdminCode.trim()) { setLoginError("أدخل رمز التسجيل"); return; }
    setLoginLoading(true);
    try {
      if (loginMode === "login") {
        await auth.loginAdmin(loginEmail.trim(), loginPassword);
      } else {
        await auth.registerAdmin(loginName.trim(), loginEmail.trim(), loginPassword, loginAdminCode.trim());
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLoginEmail(""); setLoginPassword(""); setLoginName(""); setLoginAdminCode("");
      loadAll();
    } catch (e: any) {
      setLoginError(e.message || "فشل تسجيل الدخول");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await auth.logout();
  };

  const handleSaveName = async () => {
    Alert.alert("تنبيه", "لتغيير الاسم، يرجى التواصل مع مدير النظام");
  };

  const handleChangePin = async () => {
    setPinChangeError(""); setPinChangeSuccess(false);
    if (newPinInput.length < 4) {
      setPinChangeError("رمز PIN الجديد يجب أن يكون 4 أرقام على الأقل");
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setPinChangeError("رمز PIN الجديد وتأكيده غير متطابقين");
      return;
    }
    try {
      const url = apiBase()("/api/admin/change-pin");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: currentPinInput, newPin: newPinInput }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPinChangeError(json.error || "فشل تغيير رمز PIN");
        return;
      }
      await AsyncStorage.setItem(ADMIN_PIN_KEY, newPinInput);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPinChangeSuccess(true);
      setCurrentPinInput(""); setNewPinInput(""); setConfirmPinInput("");
    } catch {
      setPinChangeError("تعذّر الاتصال بالخادم");
    }
  };

  // ── Medical ──
  const addFacility = async (data: Omit<Facility, "id">) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newF: Facility = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8) };
    const current = await loadFacilities();
    await AsyncStorage.setItem(MEDICAL_KEY, JSON.stringify([newF, ...current]));
    loadAll();
  };

  const deleteFacility = (id: string) => {
    Alert.alert("حذف", "حذف هذه المنشأة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const current = await loadFacilities();
        await AsyncStorage.setItem(MEDICAL_KEY, JSON.stringify(current.filter(f => f.id !== id)));
        loadAll();
      }},
    ]);
  };

  const toggleOnCall = async (id: string) => {
    const current = await loadFacilities();
    await AsyncStorage.setItem(MEDICAL_KEY, JSON.stringify(current.map(f => f.id === id ? { ...f, isOnCall: !f.isOnCall } : f)));
    loadAll();
  };

  // ── Schools ──
  const addSchool = async (data: Omit<School, "id">) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newS: School = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8) };
    const current = await loadSchools();
    await AsyncStorage.setItem(SCHOOLS_KEY, JSON.stringify([newS, ...current]));
    loadAll();
  };

  const deleteSchool = (id: string) => {
    Alert.alert("حذف", "حذف هذه المدرسة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const current = await loadSchools();
        await AsyncStorage.setItem(SCHOOLS_KEY, JSON.stringify(current.filter((s: School) => s.id !== id)));
        loadAll();
      }},
    ]);
  };

  // ── Institutions ──
  const addInstitution = async (data: Omit<Institution, "id">) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newI: Institution = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8) };
    const current = await loadInstitutions();
    await AsyncStorage.setItem(INSTITUTIONS_KEY, JSON.stringify([newI, ...current]));
    loadAll();
  };

  const deleteInstitution = (id: string) => {
    Alert.alert("حذف", "حذف هذه المؤسسة التعليمية؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const current = await loadInstitutions();
        await AsyncStorage.setItem(INSTITUTIONS_KEY, JSON.stringify(current.filter((i: Institution) => i.id !== id)));
        loadAll();
      }},
    ]);
  };

  // ── Sports ──
  const addSportClub = async (data: Omit<SportClub, "id">) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newC: SportClub = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8) };
    const current = await loadSportClubs();
    await AsyncStorage.setItem(SPORT_CLUBS_KEY, JSON.stringify([newC, ...current]));
    loadAll();
  };

  const deleteSportClub = (id: string) => {
    Alert.alert("حذف", "حذف هذا النادي الرياضي؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const current = await loadSportClubs();
        await AsyncStorage.setItem(SPORT_CLUBS_KEY, JSON.stringify(current.filter(c => c.id !== id)));
        loadAll();
      }},
    ]);
  };

  const addSportEvent = async (data: Omit<SportEvent, "id">) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newE: SportEvent = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8) };
    const current = await loadSportEvents();
    await AsyncStorage.setItem(SPORT_EVENTS_KEY, JSON.stringify([newE, ...current]));
    loadAll();
  };

  const deleteSportEvent = (id: string) => {
    Alert.alert("حذف", "حذف هذه الفعالية؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const current = await loadSportEvents();
        await AsyncStorage.setItem(SPORT_EVENTS_KEY, JSON.stringify(current.filter(e => e.id !== id)));
        loadAll();
      }},
    ]);
  };

  // ── Culture ──
  const addCulturalCenter = async (data: Omit<CulturalCenter, "id">) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newC: CulturalCenter = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8) };
    const current = await loadCulturalCenters();
    await AsyncStorage.setItem(CULTURAL_CENTERS_KEY, JSON.stringify([newC, ...current]));
    loadAll();
  };

  const deleteCulturalCenter = (id: string) => {
    Alert.alert("حذف", "حذف هذا المركز الثقافي؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const current = await loadCulturalCenters();
        await AsyncStorage.setItem(CULTURAL_CENTERS_KEY, JSON.stringify(current.filter(c => c.id !== id)));
        loadAll();
      }},
    ]);
  };

  const addCulturalEvent = async (data: Omit<CulturalEvent, "id">) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newE: CulturalEvent = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8) };
    const current = await loadCulturalEvents();
    await AsyncStorage.setItem(CULTURAL_EVENTS_KEY, JSON.stringify([newE, ...current]));
    loadAll();
  };

  const deleteCulturalEvent = (id: string) => {
    Alert.alert("حذف", "حذف هذه الفعالية الثقافية؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const current = await loadCulturalEvents();
        await AsyncStorage.setItem(CULTURAL_EVENTS_KEY, JSON.stringify(current.filter(e => e.id !== id)));
        loadAll();
      }},
    ]);
  };

  // ── Lost Items ──
  const markLostFound = async (id: string) => {
    const raw = await AsyncStorage.getItem(LOST_ITEMS_KEY);
    const saved: LostItem[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(LOST_ITEMS_KEY, JSON.stringify(saved.map(i => i.id === id ? { ...i, status: "found" as const } : i)));
    loadAll();
  };

  const deleteLostItem = (id: string) => {
    Alert.alert("حذف", "حذف هذا الإعلان؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const raw = await AsyncStorage.getItem(LOST_ITEMS_KEY);
        const saved: LostItem[] = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem(LOST_ITEMS_KEY, JSON.stringify(saved.filter(i => i.id !== id)));
        loadAll();
      }},
    ]);
  };

  // ── Jobs ──
  const addJob = async (data: Omit<Job, "id" | "createdAt">) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newJ: Job = { ...data, id: Date.now().toString() + Math.random().toString(36).substr(2, 8), createdAt: new Date().toISOString() };
    const raw = await AsyncStorage.getItem(JOBS_KEY);
    const saved: Job[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(JOBS_KEY, JSON.stringify([newJ, ...saved]));
    loadAll();
  };
  const deleteJob = (id: string) => {
    Alert.alert("حذف", "حذف هذه الوظيفة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const raw = await AsyncStorage.getItem(JOBS_KEY);
        const saved: Job[] = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem(JOBS_KEY, JSON.stringify(saved.filter(j => j.id !== id)));
        loadAll();
      }},
    ]);
  };

  // ── Market ──
  const deleteFamilyItem = (id: string) => {
    Alert.alert("حذف", "حذف هذا المنتج؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const raw = await AsyncStorage.getItem(FAMILY_KEY);
        const saved: FamilyItem[] = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem(FAMILY_KEY, JSON.stringify(saved.filter(i => i.id !== id)));
        loadAll();
      }},
    ]);
  };

  const markFamilySold = async (id: string) => {
    const raw = await AsyncStorage.getItem(FAMILY_KEY);
    const saved: FamilyItem[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(FAMILY_KEY, JSON.stringify(saved.map(i => i.id === id ? { ...i, status: "sold" as const } : i)));
    loadAll();
  };

  const deleteAuctionItem = (id: string) => {
    Alert.alert("حذف", "حذف هذا الإعلان؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        const raw = await AsyncStorage.getItem(AUCTION_KEY);
        const saved: AuctionItem[] = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem(AUCTION_KEY, JSON.stringify(saved.filter(i => i.id !== id)));
        loadAll();
      }},
    ]);
  };

  const markAuctionSold = async (id: string) => {
    const raw = await AsyncStorage.getItem(AUCTION_KEY);
    const saved: AuctionItem[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(AUCTION_KEY, JSON.stringify(saved.map(i => i.id === id ? { ...i, status: "sold" as const } : i)));
    loadAll();
  };

  // ── User Management (admin only) ──
  const loadUsers = async () => {
    if (!isAdmin || !auth.token) return;
    try {
      const res = await fetch(new URL("/api/admin/users", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setManagedUsers(data);
      }
    } catch { }
  };

  const changeUserRole = async (userId: number, newRole: "user" | "moderator") => {
    if (!auth.token) return;
    try {
      const res = await fetch(new URL(`/api/admin/users/${userId}/role`, getApiUrl()).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        Alert.alert(lang === "ar" ? "تم" : "Done", lang === "ar" ? "تم تحديث الدور بنجاح" : "Role updated successfully");
        loadUsers();
      } else {
        const json = await res.json();
        Alert.alert(lang === "ar" ? "خطأ" : "Error", json.error || "Failed");
      }
    } catch { }
  };

  const updateUserPermissions = async (userId: number, sections: string[]) => {
    if (!auth.token) return;
    try {
      const res = await fetch(new URL(`/api/admin/users/${userId}/permissions`, getApiUrl()).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ sections }),
      });
      if (res.ok) {
        loadUsers();
      }
    } catch { }
  };

  const deleteUser = (userId: number, userName: string) => {
    Alert.alert(
      lang === "ar" ? "حذف المستخدم" : "Delete User",
      lang === "ar" ? `حذف حساب "${userName}"؟` : `Delete account "${userName}"?`,
      [
        { text: lang === "ar" ? "إلغاء" : "Cancel", style: "cancel" },
        { text: lang === "ar" ? "حذف" : "Delete", style: "destructive", onPress: async () => {
          if (!auth.token) return;
          try {
            await fetch(new URL(`/api/admin/users/${userId}`, getApiUrl()).toString(), {
              method: "DELETE",
              headers: { Authorization: `Bearer ${auth.token}` },
            });
            loadUsers();
          } catch { }
        }},
      ]
    );
  };

  const SECTION_OPTIONS = [
    { key: "medical",      label: t("admin", "sectionMedical"),       icon: "medkit-outline" },
    { key: "schools",      label: t("admin", "sectionSchools"),       icon: "school-outline" },
    { key: "institutions", label: t("admin", "sectionInstitutions"),  icon: "business-outline" },
    { key: "sports",       label: t("admin", "sectionSports"),        icon: "football-outline" },
    { key: "culture",      label: t("admin", "sectionCulture"),       icon: "color-palette-outline" },
    { key: "lost",         label: t("admin", "sectionMissing"),       icon: "search-outline" },
    { key: "jobs",         label: t("admin", "sectionJobs"),          icon: "briefcase-outline" },
    { key: "market",       label: t("admin", "sectionMarket"),        icon: "storefront-outline" },
    { key: "social",       label: t("admin", "sectionSocial"),        icon: "people-outline" },
    { key: "calendar",     label: t("admin", "sectionCalendar"),      icon: "calendar-outline" },
  ];

  // ─── Stats ────────────────────────────────────────────────────────────────
  const userAddedFacs = facilities.filter(f => !f.id.startsWith("med"));
  const userAddedSchs = schools.filter(s => !s.id.startsWith("sch"));

  const STATS = [
    { label: "منشأة طبية",    value: facilities.length,      color: Colors.primary },
    { label: "مدارس وجامعات", value: schools.length,          color: "#2E7D9A" },
    { label: "مؤسسات تعليمية",value: institutions.length,     color: "#27AE60" },
    { label: "أندية رياضية",  value: sportClubs.length,       color: "#E67E22" },
    { label: "مراكز ثقافية",  value: culturalCenters.length,  color: "#8E44AD" },
    { label: "مفقود نشط",     value: lostItems.filter(i => i.status === "lost").length,  color: Colors.danger },
    { label: "وظائف",         value: jobs.length,             color: "#1E6E8A" },
    { label: "منتجات السوق",  value: familyItems.filter(i => i.status === "available").length + auctionItems.filter(i => i.status === "available").length, color: Colors.accent },
  ];

  // ─── Login Screen ─────────────────────────────────────────────────────────
  if (!hasAccess) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: topPad + 16 }]}>
          <Text style={styles.headerTitle}>لوحة الإدارة</Text>
        </View>
        <ScrollView contentContainerStyle={styles.loginWrap} keyboardShouldPersistTaps="handled">
          <View style={styles.loginCard}>
            <View style={styles.loginIconWrap}>
              <Ionicons name="shield-checkmark" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.loginTitle}>
              {loginMode === "login" ? "دخول المشرف" : "تسجيل مشرف جديد"}
            </Text>
            <Text style={styles.loginSub}>
              {loginMode === "login"
                ? "سجّل الدخول بالبريد الإلكتروني وكلمة المرور"
                : "أنشئ حساب مشرف جديد باستخدام رمز التسجيل"}
            </Text>

            {/* Mode toggle */}
            <View style={styles.loginToggleRow}>
              <TouchableOpacity
                style={[styles.loginToggleBtn, loginMode === "register" && styles.loginToggleBtnActive]}
                onPress={() => { setLoginMode("register"); setLoginError(""); }}
              >
                <Text style={[styles.loginToggleText, loginMode === "register" && styles.loginToggleTextActive]}>تسجيل جديد</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.loginToggleBtn, loginMode === "login" && styles.loginToggleBtnActive]}
                onPress={() => { setLoginMode("login"); setLoginError(""); }}
              >
                <Text style={[styles.loginToggleText, loginMode === "login" && styles.loginToggleTextActive]}>دخول</Text>
              </TouchableOpacity>
            </View>

            {loginMode === "register" && (
              <View style={styles.loginFieldWrap}>
                <TextInput
                  style={styles.loginField}
                  placeholder="الاسم الكامل"
                  placeholderTextColor={Colors.textMuted}
                  value={loginName}
                  onChangeText={setLoginName}
                  textAlign="right"
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.loginFieldWrap}>
              <TextInput
                style={styles.loginField}
                placeholder="البريد الإلكتروني"
                placeholderTextColor={Colors.textMuted}
                value={loginEmail}
                onChangeText={(v) => { setLoginEmail(v); setLoginError(""); }}
                keyboardType="email-address"
                autoCapitalize="none"
                textAlign="right"
              />
            </View>

            <View style={[styles.loginFieldWrap, { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 14 }]}>
              <TouchableOpacity onPress={() => setShowLoginPassword(p => !p)} hitSlop={8}>
                <Ionicons name={showLoginPassword ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textMuted} />
              </TouchableOpacity>
              <TextInput
                style={[styles.loginField, { flex: 1 }]}
                placeholder="كلمة المرور"
                placeholderTextColor={Colors.textMuted}
                value={loginPassword}
                onChangeText={(v) => { setLoginPassword(v); setLoginError(""); }}
                secureTextEntry={!showLoginPassword}
                textAlign="right"
              />
            </View>

            {loginMode === "register" && (
              <View style={styles.loginFieldWrap}>
                <TextInput
                  style={styles.loginField}
                  placeholder="رمز التسجيل (admin code)"
                  placeholderTextColor={Colors.textMuted}
                  value={loginAdminCode}
                  onChangeText={(v) => { setLoginAdminCode(v); setLoginError(""); }}
                  textAlign="center"
                  keyboardType="numeric"
                  secureTextEntry
                />
              </View>
            )}

            {loginError ? <Text style={styles.pinError}>{loginError}</Text> : null}

            <TouchableOpacity
              style={[styles.loginBtn, loginLoading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loginLoading}
              activeOpacity={0.85}
            >
              {loginLoading
                ? <Text style={styles.loginBtnText}>جاري التحقق...</Text>
                : <Text style={styles.loginBtnText}>{loginMode === "login" ? "دخول" : "إنشاء الحساب"}</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── Admin Dashboard ──────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <TouchableOpacity onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color={Colors.danger} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("admin", "overview")}</Text>
        <View style={[styles.adminBadge, isModerator && { backgroundColor: Colors.accent + "18" }]}>
          <Ionicons name={isModerator ? "shield-half-outline" : "shield-checkmark"} size={13} color={isModerator ? Colors.accent : Colors.primary} />
          <Text style={[styles.adminBadgeText, isModerator && { color: Colors.accent }]}>{isModerator ? t("admin", "moderatorBadge") : adminName}</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {ADMIN_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.key ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.tabBtnText, activeTab === tab.key && styles.tabBtnTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>إحصائيات التطبيق</Text>
            <View style={styles.statsGrid}>
              {STATS.map((s, i) => (
                <View key={i} style={[styles.statCard, { borderTopColor: s.color }]}>
                  <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>ملخص الإضافات</Text>
            {[
              { icon: "add-circle-outline", label: `${userAddedFacs.length} منشأة طبية مضافة من قِبلك`, color: Colors.primary },
              { icon: "add-circle-outline", label: `${userAddedSchs.length} مدرسة مضافة من قِبلك`, color: "#2E7D9A" },
              { icon: "refresh-circle-outline", label: "تحديث البيانات", color: Colors.accent, onPress: loadAll },
            ].map((t, i) => (
              <TouchableOpacity key={i} style={styles.toolRow} onPress={t.onPress} activeOpacity={0.8}>
                <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                <Text style={styles.toolLabel}>{t.label}</Text>
                <View style={[styles.toolIcon, { backgroundColor: t.color + "18" }]}>
                  <Ionicons name={t.icon as any} size={20} color={t.color} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── MEDICAL ── */}
        {activeTab === "medical" && (
          <View style={styles.section}>
            <SectionBar label="الدليل الطبي" count={facilities.length} onAdd={() => setShowAddFacility(true)} />
            {facilities.length === 0 && <EmptySection icon="medkit-outline" text="لا توجد منشآت" />}
            {facilities.map(f => (
              <AdminCard
                key={f.id}
                title={f.name}
                subtitle={`${getTypeLabel(f.type, t)} · ${f.hours}`}
                meta={f.address}
                statusColor={f.isOnCall ? Colors.success : Colors.textMuted}
                extraBadge={f.isOnCall ? "مناوبة" : undefined}
                onDelete={() => deleteFacility(f.id)}
                onAction={() => toggleOnCall(f.id)}
                actionLabel="مناوبة"
                actionIcon={f.isOnCall ? "moon-outline" : "sunny-outline"}
                actionColor={f.isOnCall ? Colors.accent : Colors.success}
              />
            ))}
          </View>
        )}

        {/* ── SCHOOLS ── */}
        {activeTab === "schools" && (
          <View style={styles.section}>
            <SectionBar label="المدارس والجامعات" count={schools.length} onAdd={() => setShowAddSchool(true)} addColor="#2E7D9A" />
            {schools.length === 0 && <EmptySection icon="school-outline" text="لا توجد مدارس" />}
            {schools.map(s => (
              <AdminCard
                key={s.id}
                title={s.name}
                subtitle={`${getSchoolTypeLabel(s.type, t)} · ${s.shifts ?? ""}`}
                meta={s.address}
                statusColor={getSchoolTypeColor(s.type)}
                onDelete={() => deleteSchool(s.id)}
              />
            ))}
          </View>
        )}

        {/* ── INSTITUTIONS ── */}
        {activeTab === "institutions" && (
          <View style={styles.section}>
            <SectionBar
              label="المؤسسات التعليمية"
              count={institutions.length}
              onAdd={() => setShowAddInstitution(true)}
              addColor="#27AE60"
            />
            {institutions.length === 0 && (
              <EmptySection icon="business-outline" text="لا توجد مؤسسات — اضغط إضافة لإدخال أول مؤسسة" />
            )}
            {institutions.map(inst => (
              <AdminCard
                key={inst.id}
                title={inst.name}
                subtitle={`${getInstitutionTypeLabel(inst.type, t)} · ${inst.address}`}
                meta={inst.phone}
                statusColor={getInstitutionTypeColor(inst.type)}
                onDelete={() => deleteInstitution(inst.id)}
              />
            ))}
          </View>
        )}

        {/* ── SPORTS ── */}
        {activeTab === "sports" && (
          <View style={styles.section}>
            <View style={styles.marketSubTabs}>
              <TouchableOpacity
                style={[styles.subTabBtn, sportsSub === "events" && styles.subTabBtnActive]}
                onPress={() => setSportsSub("events")}
              >
                <Text style={[styles.subTabText, sportsSub === "events" && { color: "#8E44AD" }]}>الفعاليات ({sportEvents.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTabBtn, sportsSub === "clubs" && styles.subTabBtnActive]}
                onPress={() => setSportsSub("clubs")}
              >
                <Text style={[styles.subTabText, sportsSub === "clubs" && { color: "#27AE60" }]}>الأندية ({sportClubs.length})</Text>
              </TouchableOpacity>
            </View>

            {sportsSub === "clubs" && (
              <>
                <SectionBar label="الأندية الرياضية" count={sportClubs.length} onAdd={() => setShowAddSportClub(true)} addColor="#27AE60" />
                {sportClubs.length === 0
                  ? <EmptySection icon="football-outline" text="لا توجد أندية — اضغط إضافة" />
                  : sportClubs.map(club => (
                    <AdminCard
                      key={club.id}
                      title={club.name}
                      subtitle={`${getSportLabel(club.sport)} · ${club.address}`}
                      meta={club.phone}
                      statusColor={getSportColor(club.sport)}
                      onDelete={() => deleteSportClub(club.id)}
                    />
                  ))
                }
              </>
            )}

            {sportsSub === "events" && (
              <>
                <SectionBar label="الفعاليات والبطولات" count={sportEvents.length} onAdd={() => setShowAddSportEvent(true)} addColor="#E67E22" />
                {sportEvents.length === 0
                  ? <EmptySection icon="trophy-outline" text="لا توجد فعاليات — اضغط إضافة" />
                  : sportEvents.map(event => (
                    <AdminCard
                      key={event.id}
                      title={event.title}
                      subtitle={`${getSportLabel(event.sport)} · ${event.date}`}
                      meta={event.location}
                      statusColor={getSportColor(event.sport)}
                      onDelete={() => deleteSportEvent(event.id)}
                    />
                  ))
                }
              </>
            )}
          </View>
        )}

        {/* ── CULTURE ── */}
        {activeTab === "culture" && (
          <View style={styles.section}>
            <View style={styles.marketSubTabs}>
              <TouchableOpacity
                style={[styles.subTabBtn, cultureSub === "events" && styles.subTabBtnActive]}
                onPress={() => setCultureSub("events")}
              >
                <Text style={[styles.subTabText, cultureSub === "events" && { color: "#D35400" }]}>الفعاليات ({culturalEvents.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTabBtn, cultureSub === "centers" && styles.subTabBtnActive]}
                onPress={() => setCultureSub("centers")}
              >
                <Text style={[styles.subTabText, cultureSub === "centers" && { color: "#8E44AD" }]}>المراكز ({culturalCenters.length})</Text>
              </TouchableOpacity>
            </View>

            {cultureSub === "centers" && (
              <>
                <SectionBar label="المراكز الثقافية" count={culturalCenters.length} onAdd={() => setShowAddCulturalCenter(true)} addColor="#8E44AD" />
                {culturalCenters.length === 0
                  ? <EmptySection icon="library-outline" text="لا توجد مراكز — اضغط إضافة" />
                  : culturalCenters.map(center => (
                    <AdminCard
                      key={center.id}
                      title={center.name}
                      subtitle={`${getCenterTypeLabel(center.type)} · ${center.address}`}
                      meta={center.phone}
                      statusColor={getCenterTypeColor(center.type)}
                      onDelete={() => deleteCulturalCenter(center.id)}
                    />
                  ))
                }
              </>
            )}

            {cultureSub === "events" && (
              <>
                <SectionBar label="الفعاليات الثقافية" count={culturalEvents.length} onAdd={() => setShowAddCulturalEvent(true)} addColor="#D35400" />
                {culturalEvents.length === 0
                  ? <EmptySection icon="sparkles-outline" text="لا توجد فعاليات — اضغط إضافة" />
                  : culturalEvents.map(event => (
                    <AdminCard
                      key={event.id}
                      title={event.title}
                      subtitle={`${getEventTypeLabel(event.type)} · ${event.date}`}
                      meta={event.location}
                      statusColor={getEventTypeColor(event.type)}
                      onDelete={() => deleteCulturalEvent(event.id)}
                    />
                  ))
                }
              </>
            )}
          </View>
        )}

        {/* ── LOST ITEMS ── */}
        {activeTab === "lost" && (
          <View style={styles.section}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionTitle}>المفقودات ({lostItems.length})</Text>
              <Text style={styles.sectionHint}>الإعلانات من قِبل المستخدمين</Text>
            </View>
            {lostItems.length === 0 && <EmptySection icon="search-outline" text="لا توجد إعلانات" />}
            {lostItems.map(item => (
              <AdminCard
                key={item.id}
                title={item.itemName}
                subtitle={item.contactPhone}
                meta={item.lastSeen}
                statusColor={item.status === "lost" ? Colors.danger : Colors.success}
                extraBadge={item.status === "found" ? "وُجد" : undefined}
                onDelete={() => deleteLostItem(item.id)}
                onAction={item.status === "lost" ? () => markLostFound(item.id) : undefined}
                actionIcon="checkmark-done-outline"
                actionLabel="تم الإيجاد"
                actionColor={Colors.success}
              />
            ))}
          </View>
        )}

        {/* ── JOBS ── */}
        {activeTab === "jobs" && (
          <View style={styles.section}>
            <SectionBar label="الوظائف" count={jobs.length} onAdd={() => setShowAddJob(true)} addColor="#1E6E8A" />
            {jobs.length === 0 && <EmptySection icon="briefcase-outline" text="لا توجد وظائف" />}
            {jobs.map(job => (
              <AdminCard
                key={job.id}
                title={job.title}
                subtitle={`${job.company} · ${job.location}`}
                meta={job.contactPhone}
                onDelete={() => deleteJob(job.id)}
              />
            ))}
          </View>
        )}

        {/* ── MARKET ── */}
        {activeTab === "market" && (
          <View style={styles.section}>
            <View style={styles.marketSubTabs}>
              <TouchableOpacity
                style={[styles.subTabBtn, marketSub === "auction" && styles.subTabBtnActive]}
                onPress={() => setMarketSub("auction")}
              >
                <Text style={[styles.subTabText, marketSub === "auction" && { color: Colors.violet }]}>دلالة وأدوات ({auctionItems.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTabBtn, marketSub === "family" && styles.subTabBtnActive]}
                onPress={() => setMarketSub("family")}
              >
                <Text style={[styles.subTabText, marketSub === "family" && { color: Colors.primary }]}>الأسر المنتجة ({familyItems.length})</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionHint}>لإضافة منتج جديد اذهب لتبويب السوق</Text>

            {marketSub === "family" && (
              familyItems.length === 0
                ? <EmptySection icon="storefront-outline" text="لا توجد منتجات" />
                : familyItems.map(item => (
                  <AdminCard
                    key={item.id}
                    title={item.itemName}
                    subtitle={`${item.sellerName} · ${item.price}`}
                    meta={item.contactPhone}
                    statusColor={item.status === "available" ? Colors.success : Colors.textMuted}
                    extraBadge={item.status === "sold" ? "نفذ" : undefined}
                    onDelete={!item.id.startsWith("fs") ? () => deleteFamilyItem(item.id) : undefined}
                    onAction={item.status === "available" && !item.id.startsWith("fs") ? () => markFamilySold(item.id) : undefined}
                    actionIcon="checkmark-circle-outline"
                    actionColor={Colors.success}
                  />
                ))
            )}

            {marketSub === "auction" && (
              auctionItems.length === 0
                ? <EmptySection icon="hammer-outline" text="لا توجد إعلانات" />
                : auctionItems.map(item => (
                  <AdminCard
                    key={item.id}
                    title={item.itemName}
                    subtitle={`${item.price} · ${item.condition === "new" ? "جديد" : item.condition === "like_new" ? "شبه جديد" : "مستعمل"}`}
                    meta={item.contactPhone}
                    statusColor={item.status === "available" ? Colors.success : Colors.textMuted}
                    extraBadge={item.status === "sold" ? "بيع" : undefined}
                    onDelete={!item.id.startsWith("as") ? () => deleteAuctionItem(item.id) : undefined}
                    onAction={item.status === "available" && !item.id.startsWith("as") ? () => markAuctionSold(item.id) : undefined}
                    actionIcon="checkmark-circle-outline"
                    actionColor={Colors.violet}
                  />
                ))
            )}
          </View>
        )}

        {/* ── NOTIFICATIONS (admin only) ── */}
        {activeTab === "notifications" && isAdmin && (
          <NotificationsAdminSection t={t} isRTL={isRTL} lang={lang} />
        )}

        {/* ── NEWS (admin only) ── */}
        {activeTab === "news" && isAdmin && (
          <NewsAdminSection t={t} isRTL={isRTL} lang={lang} />
        )}

        {/* ── USERS MANAGEMENT (admin only) ── */}
        {activeTab === "users" && isAdmin && (
          <View style={styles.section}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={styles.sectionTitle}>{t("admin", "userManagement")}</Text>
              <TouchableOpacity onPress={loadUsers} style={{ padding: 8 }}>
                <Ionicons name="refresh" size={22} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            {managedUsers.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                <Text style={[styles.emptyText, { marginTop: 12 }]}>{t("admin", "noUsers")}</Text>
                <TouchableOpacity onPress={loadUsers} style={{ marginTop: 16, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 }}>
                  <Text style={{ color: "#fff", fontFamily: "Cairo_600SemiBold", fontSize: 14 }}>{lang === "ar" ? "تحميل المستخدمين" : "Load Users"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              managedUsers.filter(u => u.role !== "admin").map(u => {
                const expanded = expandedUserId === u.id;
                const isMod = u.role === "moderator";
                const userPerms = u.permissions || [];
                return (
                  <View key={u.id} style={{ backgroundColor: Colors.cardBg, borderRadius: 12, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: expanded ? Colors.primary + "40" : Colors.divider }}>
                    <TouchableOpacity onPress={() => setExpandedUserId(expanded ? null : u.id)} activeOpacity={0.7}>
                      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", flex: 1 }}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isMod ? Colors.accent + "20" : Colors.primary + "15", alignItems: "center", justifyContent: "center", marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }}>
                            <Ionicons name={isMod ? "shield-half-outline" : "person-outline"} size={18} color={isMod ? Colors.accent : Colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: Colors.textPrimary, fontFamily: "Cairo_600SemiBold", fontSize: 14, textAlign: isRTL ? "right" : "left" }}>{u.name}</Text>
                            <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: isRTL ? "right" : "left" }}>{u.email || u.phone || ""}</Text>
                          </View>
                        </View>
                        <View style={{ backgroundColor: isMod ? Colors.accent + "20" : Colors.textMuted + "20", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }}>
                          <Text style={{ color: isMod ? Colors.accent : Colors.textMuted, fontFamily: "Cairo_500Medium", fontSize: 11 }}>{isMod ? t("admin", "roleModerator") : t("admin", "roleUser")}</Text>
                        </View>
                        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} style={{ marginLeft: isRTL ? 0 : 6, marginRight: isRTL ? 6 : 0 }} />
                      </View>
                    </TouchableOpacity>

                    {expanded && (
                      <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.divider }}>
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginBottom: 14 }}>
                          {isMod ? (
                            <TouchableOpacity onPress={() => changeUserRole(u.id, "user")} style={{ flex: 1, backgroundColor: Colors.textMuted + "20", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}>
                              <Text style={{ color: Colors.textPrimary, fontFamily: "Cairo_600SemiBold", fontSize: 13 }}>{t("admin", "demoteToUser")}</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity onPress={() => changeUserRole(u.id, "moderator")} style={{ flex: 1, backgroundColor: Colors.accent + "20", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}>
                              <Text style={{ color: Colors.accent, fontFamily: "Cairo_600SemiBold", fontSize: 13 }}>{t("admin", "promoteToModerator")}</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={() => deleteUser(u.id, u.name)} style={{ backgroundColor: Colors.danger + "20", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: "center" }}>
                            <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>

                        {isMod && (
                          <View>
                            <Text style={{ color: Colors.textPrimary, fontFamily: "Cairo_600SemiBold", fontSize: 13, marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>{t("admin", "assignSections")}</Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                              {SECTION_OPTIONS.map(sec => {
                                const active = userPerms.includes(sec.key);
                                return (
                                  <TouchableOpacity
                                    key={sec.key}
                                    onPress={() => {
                                      const newPerms = active ? userPerms.filter(p => p !== sec.key) : [...userPerms, sec.key];
                                      updateUserPermissions(u.id, newPerms);
                                    }}
                                    style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", backgroundColor: active ? Colors.primary + "20" : Colors.divider, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: active ? Colors.primary + "50" : "transparent" }}
                                  >
                                    <Ionicons name={sec.icon as any} size={14} color={active ? Colors.primary : Colors.textMuted} style={{ marginRight: isRTL ? 0 : 5, marginLeft: isRTL ? 5 : 0 }} />
                                    <Text style={{ color: active ? Colors.primary : Colors.textMuted, fontFamily: "Cairo_500Medium", fontSize: 12 }}>{sec.label}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── PROFILE ── */}
        {activeTab === "profile" && (
          <View style={styles.section}>
            <View style={[styles.profileAvatar]}>
              <Ionicons name="shield-checkmark" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.profileNameDisplay}>{adminName}</Text>
            
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>{t("admin", "language")}</Text>
              <View style={styles.langToggleRow}>
                <TouchableOpacity style={[styles.langBtn, lang === "ar" && styles.langBtnActive]} onPress={() => lang !== "ar" && setLanguage("ar")}>
                  <Text style={[styles.langBtnText, lang === "ar" && styles.langBtnTextActive]}>{t("admin", "languageArabic")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.langBtn, lang === "en" && styles.langBtnActive]} onPress={() => lang !== "en" && setLanguage("en")}>
                  <Text style={[styles.langBtnText, lang === "en" && styles.langBtnTextActive]}>{t("admin", "languageEnglish")}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.langNote}>{t("admin", "changeLangNote")}</Text>
            </View>

            <View style={styles.dividerLine} />

            <Text style={styles.sectionTitle}>{t("auth", "name")}</Text>
            <View style={styles.profileFieldWrap}>
              <TextInput
                style={styles.profileField}
                value={editName}
                onChangeText={setEditName}
                placeholder={t("auth", "namePlaceholder")}
                placeholderTextColor={Colors.textMuted}
                textAlign={isRTL ? "right" : "left"}
              />
            </View>
            <TouchableOpacity style={styles.profileSaveBtn} onPress={handleSaveName} activeOpacity={0.85}>
              <Text style={styles.profileSaveBtnText}>{t("admin", "changePin")}</Text>
            </TouchableOpacity>

            <View style={styles.dividerLine} />

            <Text style={styles.sectionTitle}>{t("admin", "changePin")}</Text>
            <View style={styles.profileFieldWrap}>
              <TextInput
                style={styles.profileField}
                value={currentPinInput}
                onChangeText={(v) => { setCurrentPinInput(v); setPinChangeError(""); setPinChangeSuccess(false); }}
                placeholder={t("admin", "currentPin")}
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
                textAlign="center"
              />
            </View>
            <View style={styles.profileFieldWrap}>
              <TextInput
                style={styles.profileField}
                value={newPinInput}
                onChangeText={(v) => { setNewPinInput(v); setPinChangeError(""); setPinChangeSuccess(false); }}
                placeholder={t("admin", "newPin")}
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
                textAlign="center"
              />
            </View>
            <View style={styles.profileFieldWrap}>
              <TextInput
                style={styles.profileField}
                value={confirmPinInput}
                onChangeText={(v) => { setConfirmPinInput(v); setPinChangeError(""); setPinChangeSuccess(false); }}
                placeholder={t("admin", "confirmPin")}
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
                textAlign="center"
              />
            </View>
            {pinChangeError ? <Text style={styles.pinChangeError}>{pinChangeError}</Text> : null}
            {pinChangeSuccess ? <Text style={styles.pinChangeSuccess}>{t("admin", "pinChanged")} ✓</Text> : null}
            <TouchableOpacity style={[styles.profileSaveBtn, { backgroundColor: Colors.danger }]} onPress={handleChangePin} activeOpacity={0.85}>
              <Text style={styles.profileSaveBtnText}>{t("admin", "changePin")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <AddJobModal visible={showAddJob} onClose={() => setShowAddJob(false)} onSave={addJob} />
      <AddFacilityModal visible={showAddFacility} onClose={() => setShowAddFacility(false)} onSave={addFacility} />
      <AddSchoolModal visible={showAddSchool} onClose={() => setShowAddSchool(false)} onSave={addSchool} />
      <AddInstitutionModal visible={showAddInstitution} onClose={() => setShowAddInstitution(false)} onSave={addInstitution} />
      <AddSportClubModal visible={showAddSportClub} onClose={() => setShowAddSportClub(false)} onSave={addSportClub} />
      <AddSportEventModal visible={showAddSportEvent} onClose={() => setShowAddSportEvent(false)} onSave={addSportEvent} />
      <AddCulturalCenterModal visible={showAddCulturalCenter} onClose={() => setShowAddCulturalCenter(false)} onSave={addCulturalCenter} />
      <AddCulturalEventModal visible={showAddCulturalEvent} onClose={() => setShowAddCulturalEvent(false)} onSave={addCulturalEvent} />
    </View>
  );
}

// ─── Shared Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.cardBg, paddingHorizontal: 16, paddingBottom: 16,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  adminBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    backgroundColor: Colors.primary + "12", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  adminBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primary },
  langToggleRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  langBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.primary, alignItems: "center" },
  langBtnActive: { backgroundColor: Colors.primary },
  langBtnText: { color: Colors.primary, fontFamily: "Cairo_600SemiBold" },
  langBtnTextActive: { color: "#fff" },
  langNote: { fontSize: 12, color: Colors.textMuted, marginTop: 6, textAlign: "center" },
  settingSection: { marginBottom: 20 },
  settingLabel: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: Colors.textPrimary, marginBottom: 4 },
  loginWrap: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24, paddingBottom: 60 },
  loginCard: {
    backgroundColor: Colors.cardBg, borderRadius: 24, padding: 28,
    width: "100%", maxWidth: 380, alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 6,
  },
  loginIconWrap: { width: 70, height: 70, borderRadius: 20, backgroundColor: Colors.primary + "14", justifyContent: "center", alignItems: "center" },
  loginTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  loginSub: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  pinWrap: { borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 14, width: "100%", backgroundColor: Colors.bg },
  pinWrapErr: { borderColor: Colors.danger },
  pinInput: { fontFamily: "Cairo_700Bold", fontSize: 28, color: Colors.textPrimary, paddingVertical: 14, letterSpacing: 12 },
  pinError: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.danger },
  loginBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, width: "100%", alignItems: "center",
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  loginBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.cardBg },
  pinHint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  loginToggleRow: {
    flexDirection: "row-reverse", backgroundColor: Colors.bg, borderRadius: 14,
    padding: 3, gap: 3, width: "100%",
  },
  loginToggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: "center" },
  loginToggleBtnActive: {
    backgroundColor: Colors.cardBg,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },
  loginToggleText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted },
  loginToggleTextActive: { color: Colors.primary, fontFamily: "Cairo_700Bold" },
  loginFieldWrap: {
    borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 14,
    backgroundColor: Colors.bg, width: "100%", overflow: "hidden",
  },
  loginField: {
    fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  tabBar: { backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tabBarContent: { flexDirection: "row-reverse", paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  tabBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  tabBtnActive: { backgroundColor: Colors.primary + "12" },
  tabBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  tabBtnTextActive: { fontFamily: "Cairo_600SemiBold", color: Colors.primary },
  body: { padding: 16, gap: 10 },
  section: { gap: 10 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  sectionHint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  sectionLabelRow: { gap: 2 },
  statsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "47.5%", backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14,
    alignItems: "flex-end", borderTopWidth: 3, borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 28 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  toolRow: {
    backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14,
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  toolIcon: { width: 40, height: 40, borderRadius: 11, justifyContent: "center", alignItems: "center" },
  toolLabel: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  marketSubTabs: {
    flexDirection: "row-reverse", backgroundColor: Colors.bg, borderRadius: 12, padding: 3, gap: 2,
  },
  subTabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center" },
  subTabBtnActive: { backgroundColor: Colors.cardBg, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  subTabText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  emptyWrap: { alignItems: "center", paddingVertical: 30, gap: 8 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted },
  profileAvatar: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.primary + "14",
    justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: 8,
    borderWidth: 2, borderColor: Colors.primary + "30",
  },
  profileNameDisplay: {
    fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary,
    textAlign: "center", marginBottom: 20,
  },
  profileFieldWrap: {
    borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 14,
    backgroundColor: Colors.cardBg, overflow: "hidden",
  },
  profileField: {
    fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  profileSaveBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    alignItems: "center",
  },
  profileSaveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  dividerLine: { height: 1, backgroundColor: Colors.divider, marginVertical: 8 },
  pinChangeError: {
    fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.danger, textAlign: "center",
  },
  pinChangeSuccess: {
    fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.success, textAlign: "center",
  },
});

// ─── Admin Card Styles ────────────────────────────────────────────────────────

const ac = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  row: { flexDirection: "row-reverse", padding: 12, gap: 10, alignItems: "flex-start" },
  actions: { flexDirection: "column", gap: 6 },
  delBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: Colors.danger + "12", justifyContent: "center", alignItems: "center" },
  actionBtn: { width: 32, height: 32, borderRadius: 9, justifyContent: "center", alignItems: "center" },
  info: { flex: 1, alignItems: "flex-end", gap: 3 },
  titleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 7, flexWrap: "wrap" },
  dot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  badge: { backgroundColor: Colors.accent + "20", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.accent },
  title: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", flex: 1 },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
});

// ─── Section Bar Styles ───────────────────────────────────────────────────────

const sh = StyleSheet.create({
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  labelWrap: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  countBadge: { backgroundColor: Colors.primary + "18", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  addText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
});

// ─── Modal Styles ─────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" },
  handle: { width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  sheetHead: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  form: { padding: 16, gap: 14 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  fieldInput: {
    backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.divider,
  },
  fieldTextArea: { minHeight: 80, lineHeight: 22 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg,
  },
  chipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  toggle: {
    width: 50, height: 28, borderRadius: 14, backgroundColor: Colors.divider,
    justifyContent: "center", paddingHorizontal: 3,
  },
  toggleOn: { backgroundColor: Colors.success },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignSelf: "flex-end" },
  toggleThumbOn: { alignSelf: "flex-start" },
  saveBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.cardBg },
});
