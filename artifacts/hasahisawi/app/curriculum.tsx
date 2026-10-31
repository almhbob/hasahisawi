import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Platform, RefreshControl,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router , useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { uploadToTarget } from "@/lib/big-upload";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction, openExternal } from "@/lib/xplatform";
import RtlScrollRow from "@/components/ui/RtlScrollRow";

type Grade = { n: number; label: string; count: number };
type Stage = { key: string; label: string; grades: Grade[] };
type Meta = { stages: Stage[]; tracks: string[]; kinds: Record<string, string>; subjects: Record<string, string[]>; max_file_mb: number };
type Book = {
  id: number; stage: string; grade: number; track: string; subject: string; kind: string; kind_label: string;
  title: string; description: string; source: "upload" | "link"; file_size: number | null; file_format: string | null;
  school_year: string | null; uploader_name: string; downloads: number; created_at: string; status: string; review_note?: string | null;
};
type Tab = "browse" | "upload" | "mine" | "review";

const BLUE = "#2A6FA8";
const STAGE_STYLE: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  kg:           { icon: "happy-outline",     color: "#D9822B" },
  primary:      { icon: "pencil-outline",    color: Colors.primary },
  intermediate: { icon: "book-outline",      color: BLUE },
  secondary:    { icon: "school-outline",    color: "#7B4BA8" },
};
const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  textbook: "book", teacher_guide: "easel", exam: "document-text", summary: "reader", worksheet: "create", lesson_plan: "calendar",
};
const SERVICES: { kind: string; title: string; sub: string; who: string }[] = [
  { kind: "textbook",      title: "الكتب المدرسية",    sub: "نسخ رقمية للمقرر",        who: "للطلاب" },
  { kind: "exam",          title: "امتحانات سابقة",    sub: "استعد للشهادة والنقل",     who: "للطلاب" },
  { kind: "summary",       title: "ملخصات ومذكرات",    sub: "مراجعة سريعة ومركّزة",     who: "للطلاب" },
  { kind: "teacher_guide", title: "أدلة المعلم",        sub: "طرق تدريس كل وحدة",        who: "للمعلمين" },
  { kind: "lesson_plan",   title: "تحضير الدروس",       sub: "خطط جاهزة قابلة للتعديل",  who: "للمعلمين" },
  { kind: "worksheet",     title: "أوراق عمل وتمارين",  sub: "تدريبات للصف والمنزل",      who: "للجميع" },
];

function fmtSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}

export default function CurriculumScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, isGuest, logout } = useAuth();
  const api = getApiUrl();
  const isMod = user?.role === "admin" || user?.role === "moderator";
  const signedIn = !!token && !!user && !isGuest;

  const [meta, setMeta] = useState<Meta | null>(null);
  const qp = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(qp.tab === "upload" ? "upload" : "browse");
  const [stage, setStage] = useState<string>("primary");
  const [grade, setGrade] = useState<number | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  useEffect(() => {
    fetch(`${api}/api/curriculum/meta`).then((r) => r.json()).then(setMeta).catch(() => notify("تعذّر تحميل المكتبة", "تحقق من اتصالك بالإنترنت."));
  }, [api]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (tab === "mine") p.set("mine", "1");
      else if (tab === "review") p.set("status", "pending");
      else {
        p.set("stage", stage);
        if (grade) p.set("grade", String(grade));
        if (track) p.set("track", track);
        if (subject) p.set("subject", subject);
        if (kind) p.set("kind", kind);
        if (q.trim()) p.set("q", q.trim());
      }
      const r = await fetch(`${api}/api/curriculum/books?${p}`, { headers });
      const data = await r.json().catch(() => ({}));
      setBooks(r.ok ? data.books || [] : []);
    } catch { setBooks([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [api, headers, tab, stage, grade, track, subject, kind, q]);

  useEffect(() => { if (tab !== "upload") load(); }, [tab, stage, grade, track, subject, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentStage = meta?.stages.find((s) => s.key === stage);
  const subjects = meta?.subjects[stage] ?? [];
  const showTrack = stage === "secondary" && (grade ?? 0) >= 2;

  const download = async (b: Book) => {
    try { await openExternal(`${api}/api/curriculum/books/${b.id}/download`); }
    catch { notify("تعذّر فتح الملف"); }
    setBooks((list) => list.map((x) => (x.id === b.id ? { ...x, downloads: x.downloads + 1 } : x)));
  };

  const review = async (b: Book, status: "approved" | "rejected") => {
    let note = "";
    if (status === "rejected" && Platform.OS === "web" && typeof window !== "undefined") note = window.prompt("سبب الرفض (اختياري)") || "";
    const r = await fetch(`${api}/api/curriculum/books/${b.id}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ status, review_note: note }) });
    if (!r.ok) { notify("تعذّر تنفيذ الإجراء"); return; }
    setBooks((list) => list.filter((x) => x.id !== b.id));
  };

  const remove = async (b: Book) => {
    if (!(await confirmAction("حذف الملف", `هل تريد حذف «${b.title}»؟`, "حذف", true))) return;
    const r = await fetch(`${api}/api/curriculum/books/${b.id}`, { method: "DELETE", headers });
    if (r.ok) setBooks((list) => list.filter((x) => x.id !== b.id)); else notify("تعذّر الحذف");
  };

  const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "browse", label: "تصفّح", icon: "library-outline" },
    { key: "upload", label: "رفع كتاب", icon: "cloud-upload-outline" },
    ...(signedIn ? [{ key: "mine" as Tab, label: "مساهماتي", icon: "person-outline" as const }] : []),
    ...(isMod ? [{ key: "review" as Tab, label: "المراجعة", icon: "shield-checkmark-outline" as const }] : []),
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المكتبة المنهجية</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={tab !== "upload" ? <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={BLUE} /> : undefined}
      >
        <LinearGradient colors={["#1E4F7A", BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="library" size={26} color="#fff" /></View>
          <Text style={styles.heroTitle}>المنهج السوداني بين يديك</Text>
          <Text style={styles.heroSub}>كتب ومراجع جميع المراحل من رياض الأطفال حتى الثانوي — يرفعها المعلمون والطلاب وتراجعها الإدارة قبل النشر.</Text>
        </LinearGradient>

        <View style={styles.tabs}>
          {tabs.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
              <Ionicons name={t.icon} size={16} color={tab === t.key ? "#fff" : Colors.textSecondary} />
              <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "browse" && meta && (
          <>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                onSubmitEditing={load}
                returnKeyType="search"
                placeholder="ابحث باسم الكتاب أو المادة…"
                placeholderTextColor={Colors.textSubtle}
                style={styles.searchInput}
                textAlign="right"
              />
              {q ? <TouchableOpacity onPress={() => { setQ(""); setTimeout(load, 0); }}><Ionicons name="close-circle" size={18} color={Colors.textSubtle} /></TouchableOpacity> : null}
            </View>

            <Text style={styles.section}>المرحلة</Text>
            <View style={styles.stageGrid}>
              {meta.stages.map((s) => {
                const st = STAGE_STYLE[s.key];
                const on = stage === s.key;
                const total = s.grades.reduce((a, g) => a + g.count, 0);
                return (
                  <TouchableOpacity key={s.key} onPress={() => { setStage(s.key); setGrade(null); setTrack(null); setSubject(null); }} style={[styles.stageCard, on && { borderColor: st.color, backgroundColor: st.color + "10" }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <View style={[styles.stageIcon, { backgroundColor: st.color + "18" }]}><Ionicons name={st.icon} size={20} color={st.color} /></View>
                    <Text style={[styles.stageLabel, on && { color: st.color }]}>{s.label}</Text>
                    <Text style={styles.stageCount}>{total} ملف</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Chips
              label="الصف"
              items={[{ key: "", label: "كل الصفوف" }, ...(currentStage?.grades ?? []).map((g) => ({ key: String(g.n), label: g.label, badge: g.count }))]}
              value={grade ? String(grade) : ""}
              onChange={(k) => { setGrade(k ? Number(k) : null); setTrack(null); }}
            />
            {showTrack && (
              <Chips label="المساق" items={[{ key: "", label: "الكل" }, ...meta.tracks.map((t) => ({ key: t, label: t }))]} value={track ?? ""} onChange={(k) => setTrack(k || null)} />
            )}
            <Chips label="المادة" items={[{ key: "", label: "كل المواد" }, ...subjects.map((s) => ({ key: s, label: s }))]} value={subject ?? ""} onChange={(k) => setSubject(k || null)} />

            <Text style={styles.section}>خدمات الطلاب والمعلمين</Text>
            <RtlScrollRow contentContainerStyle={styles.servicesRow}>
              {SERVICES.map((s) => {
                const on = kind === s.kind;
                return (
                  <TouchableOpacity key={s.kind} onPress={() => setKind(on ? null : s.kind)} style={[styles.service, on && styles.serviceOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <View style={styles.serviceTop}>
                      <Ionicons name={KIND_ICON[s.kind]} size={18} color={on ? "#fff" : BLUE} />
                      <Text style={[styles.serviceWho, on && { color: "#DCE9F5" }]}>{s.who}</Text>
                    </View>
                    <Text style={[styles.serviceTitle, on && { color: "#fff" }]}>{s.title}</Text>
                    <Text style={[styles.serviceSub, on && { color: "#DCE9F5" }]}>{s.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </RtlScrollRow>

            <BookList books={books} loading={loading} onDownload={download} emptyText="لا توجد ملفات هنا بعد — كن أول من يرفع كتاباً لهذا الصف." onEmptyAction={() => setTab("upload")} />
          </>
        )}

        {tab === "browse" && !meta && <View style={styles.center}><ActivityIndicator color={BLUE} /></View>}

        {tab === "upload" && (
          signedIn && meta ? (
            <UploadForm meta={meta} api={api} token={token!} isMod={isMod} onDone={() => setTab(isMod ? "browse" : "mine")} />
          ) : (
            <View style={styles.signInBox}>
              <Ionicons name="cloud-upload-outline" size={36} color={BLUE} />
              <Text style={styles.signInTitle}>شارك كتاباً مع طلاب الحصاحيصا</Text>
              <Text style={styles.signInText}>سجّل الدخول لرفع الكتب والمراجع. تُراجع الإدارة كل ملف قبل نشره.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => logout()}>
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>تسجيل الدخول</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {tab === "mine" && (
          <BookList books={books} loading={loading} onDownload={download} showStatus onDelete={remove} emptyText="لم ترفع أي ملف بعد." onEmptyAction={() => setTab("upload")} />
        )}

        {tab === "review" && isMod && (
          <BookList books={books} loading={loading} onDownload={(b) => openExternal(`${api}/api/curriculum/books/${b.id}/download`).catch(() => {})} review={review} onDelete={remove} emptyText="لا توجد ملفات بانتظار المراجعة." />
        )}
      </ScrollView>
    </View>
  );
}

function Chips({ label, items, value, onChange }: { label: string; items: { key: string; label: string; badge?: number }[]; value: string; onChange: (k: string) => void }) {
  return (
    <>
      <Text style={styles.section}>{label}</Text>
      <RtlScrollRow contentContainerStyle={styles.chipsRow}>
        {items.map((it) => {
          const on = value === it.key;
          return (
            <TouchableOpacity key={it.key || "all"} onPress={() => onChange(it.key)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{it.label}</Text>
              {it.badge ? <Text style={[styles.chipBadge, on && { color: "#fff" }]}>{it.badge}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </RtlScrollRow>
    </>
  );
}

function BookList({ books, loading, onDownload, emptyText, onEmptyAction, showStatus, onDelete, review }: {
  books: Book[]; loading: boolean; onDownload: (b: Book) => void; emptyText: string; onEmptyAction?: () => void;
  showStatus?: boolean; onDelete?: (b: Book) => void; review?: (b: Book, s: "approved" | "rejected") => void;
}) {
  if (loading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  if (!books.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="file-tray-outline" size={34} color={Colors.textSubtle} />
        <Text style={styles.emptyText}>{emptyText}</Text>
        {onEmptyAction && (
          <TouchableOpacity style={styles.ghostBtn} onPress={onEmptyAction}>
            <Ionicons name="cloud-upload-outline" size={16} color={BLUE} />
            <Text style={styles.ghostBtnText}>رفع كتاب</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  return (
    <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 14 }}>
      {books.map((b, i) => (
        <Animated.View key={b.id} entering={FadeInDown.delay(Math.min(i * 40, 300)).springify()} style={styles.book}>
          <View style={styles.bookRow}>
            <View style={styles.bookIcon}>
              <Ionicons name={KIND_ICON[b.kind] ?? "document"} size={22} color={BLUE} />
              {b.file_format ? <Text style={styles.bookFmt}>{b.file_format.toUpperCase()}</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bookTitle} numberOfLines={2}>{b.title}</Text>
              <Text style={styles.bookMeta} numberOfLines={1}>{b.subject} · {gradeLabel(b)}{b.track !== "عام" ? ` · ${b.track}` : ""}</Text>
              <View style={styles.bookTags}>
                <Text style={styles.kindTag}>{b.kind_label}</Text>
                {fmtSize(b.file_size) ? <Text style={styles.tag}>{fmtSize(b.file_size)}</Text> : null}
                {b.source === "link" ? <Text style={styles.tag}>رابط خارجي</Text> : null}
                <Text style={styles.tag}>⬇ {b.downloads}</Text>
              </View>
            </View>
          </View>
          {b.description ? <Text style={styles.bookDesc} numberOfLines={3}>{b.description}</Text> : null}
          <Text style={styles.uploader}>بواسطة {b.uploader_name}{b.school_year ? ` · ${b.school_year}` : ""}</Text>
          {showStatus && (
            <View style={[styles.status, b.status === "approved" ? styles.stOk : b.status === "rejected" ? styles.stNo : styles.stWait]}>
              <Text style={styles.statusText}>
                {b.status === "approved" ? "منشور" : b.status === "rejected" ? `مرفوض${b.review_note ? ` — ${b.review_note}` : ""}` : "بانتظار المراجعة"}
              </Text>
            </View>
          )}
          <View style={styles.bookActions}>
            {(b.status === "approved" || review) && (
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1, height: 42 }]} onPress={() => onDownload(b)} accessibilityRole="button" accessibilityLabel={`تحميل ${b.title}`}>
                <Ionicons name={review ? "eye-outline" : "download-outline"} size={17} color="#fff" />
                <Text style={styles.primaryBtnText}>{review ? "معاينة" : "تحميل"}</Text>
              </TouchableOpacity>
            )}
            {review && (
              <>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: Colors.primary }]} onPress={() => review(b, "approved")}><Ionicons name="checkmark" size={18} color="#fff" /><Text style={styles.smallBtnText}>نشر</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#B4232F" }]} onPress={() => review(b, "rejected")}><Ionicons name="close" size={18} color="#fff" /><Text style={styles.smallBtnText}>رفض</Text></TouchableOpacity>
              </>
            )}
            {onDelete && !review && (
              <TouchableOpacity style={styles.iconAction} onPress={() => onDelete(b)} accessibilityLabel="حذف"><Ionicons name="trash-outline" size={18} color="#B4232F" /></TouchableOpacity>
            )}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

function gradeLabel(b: Book) {
  if (b.stage === "kg") return `رياض الأطفال ${b.grade === 1 ? "(المستوى الأول)" : "(المستوى الثاني)"}`;
  const ord = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"][b.grade - 1] ?? String(b.grade);
  const st = b.stage === "primary" ? "الابتدائي" : b.stage === "intermediate" ? "المتوسط" : "الثانوي";
  return `الصف ${ord} ${st}`;
}

function UploadForm({ meta, api, token, isMod, onDone }: { meta: Meta; api: string; token: string; isMod: boolean; onDone: () => void }) {
  const [stage, setStage] = useState("primary");
  const [grade, setGrade] = useState(1);
  const [track, setTrack] = useState("عام");
  const [subject, setSubject] = useState("");
  const [kind, setKind] = useState("textbook");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [mode, setMode] = useState<"file" | "link">("file");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const st = meta.stages.find((s) => s.key === stage)!;
  const showTrack = stage === "secondary" && grade >= 2;

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/epub+zip", "application/zip", "audio/*", "video/mp4", "image/*"], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > meta.max_file_mb * 1024 * 1024) { notify("الملف كبير جداً", `الحد الأقصى ${meta.max_file_mb} م.ب. يمكنك إضافته كرابط (Google Drive مثلاً).`); return; }
    setFile(a);
    if (!title.trim()) setTitle(a.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 160));
  };

  const uploadToCloud = async (a: DocumentPicker.DocumentPickerAsset): Promise<string> => {
    // الملفات الكبيرة تذهب مباشرةً إلى التخزين السحابي الكبير (حتى 500MB).
    const tr = await fetch(`${api}/api/curriculum/upload-target`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ file_name: a.name, size: a.size ?? 0, content_type: a.mimeType || "" }),
    }).catch(() => null);
    const target = tr ? await tr.json().catch(() => ({})) : {};
    if (tr && !tr.ok && tr.status === 413) throw new Error(target.error || "الملف أكبر من المسموح");
    if (tr?.ok && target.provider === "blob") {
      return uploadToTarget(target, { uri: a.uri, file: (a as any).file, mimeType: a.mimeType, size: a.size }, setProgress);
    }
    const sr = await fetch(`${api}/api/curriculum/upload-signature`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ size: a.size ?? 0 }) });
    const sig = await sr.json().catch(() => ({}));
    if (!sr.ok) throw new Error(sig.error || "تعذّر بدء الرفع");
    const form = new FormData();
    if (Platform.OS === "web" && (a as any).file) form.append("file", (a as any).file as File);
    else form.append("file", { uri: a.uri, name: a.name, type: a.mimeType || "application/octet-stream" } as any);
    form.append("api_key", sig.api_key);
    form.append("timestamp", String(sig.timestamp));
    form.append("folder", sig.folder);
    form.append("signature", sig.signature);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${sig.resource_type}/upload`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        try {
          const body = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) resolve(body.secure_url);
          else reject(new Error(/size|large/i.test(body?.error?.message || "") ? "حجم الملف أكبر من المسموح لخدمة الرفع. أضفه كرابط (Google Drive مثلاً)." : (body?.error?.message || "فشل رفع الملف")));
        } catch { reject(new Error("فشل رفع الملف")); }
      };
      xhr.onerror = () => reject(new Error("انقطع الاتصال أثناء الرفع"));
      xhr.send(form as any);
    });
  };

  const submit = async () => {
    if (subject.trim().length < 2) return notify("اختر المادة", "اختر المادة من القائمة أو اكتب اسمها.");
    if (title.trim().length < 3) return notify("العنوان مطلوب", "اكتب عنواناً واضحاً، مثل: كتاب الرياضيات — الصف الخامس.");
    if (mode === "file" && !file) return notify("اختر الملف", "اختر ملف الكتاب من جهازك أو أضفه كرابط.");
    if (mode === "link" && !/^https:\/\/\S+$/i.test(link.trim())) return notify("رابط غير صالح", "الرابط يجب أن يبدأ بـ https://");
    setSaving(true); setProgress(null);
    try {
      const fileUrl = mode === "file" ? await uploadToCloud(file!) : link.trim();
      const ext = mode === "file" ? (file!.name.split(".").pop() || "").toLowerCase() : (link.match(/\.(pdf|docx?|pptx?)(\?|$)/i)?.[1] || "").toLowerCase();
      const r = await fetch(`${api}/api/curriculum/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stage, grade, track: showTrack ? track : "عام", subject: subject.trim(), kind, title: title.trim(), description: description.trim(), school_year: schoolYear.trim(), file_url: fileUrl, file_size: mode === "file" ? file!.size : null, file_format: ext }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "تعذّر الحفظ");
      notify("شكراً لمساهمتك", data.message || "تم الاستلام");
      onDone();
    } catch (e: any) {
      notify("تعذّر الرفع", e?.message || "حاول مرة أخرى");
    } finally { setSaving(false); setProgress(null); }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>رفع كتاب أو مادة تعليمية</Text>
      <Text style={styles.formHint}>{isMod ? "ستُنشر مباشرة لأنك مشرف." : "يُنشر الملف بعد مراجعة الإدارة. ارفع المحتوى المسموح بمشاركته فقط."}</Text>

      <Label text="المرحلة" />
      <View style={styles.wrap}>
        {meta.stages.map((s) => <Pill key={s.key} on={stage === s.key} label={s.label} onPress={() => { setStage(s.key); setGrade(s.grades[0].n); setSubject(""); }} />)}
      </View>
      <Label text="الصف" />
      <View style={styles.wrap}>
        {st.grades.map((g) => <Pill key={g.n} on={grade === g.n} label={g.label} onPress={() => setGrade(g.n)} />)}
      </View>
      {showTrack && (
        <>
          <Label text="المساق" />
          <View style={styles.wrap}>{meta.tracks.map((t) => <Pill key={t} on={track === t} label={t} onPress={() => setTrack(t)} />)}</View>
        </>
      )}
      <Label text="المادة" />
      <View style={styles.wrap}>
        {(meta.subjects[stage] ?? []).map((s) => <Pill key={s} on={subject === s} label={s} onPress={() => setSubject(s)} />)}
      </View>
      <TextInput value={subject} onChangeText={(v) => setSubject(v.slice(0, 80))} placeholder="أو اكتب اسم المادة" placeholderTextColor={Colors.textSubtle} style={styles.input} textAlign="right" />

      <Label text="نوع المادة" />
      <View style={styles.wrap}>
        {Object.entries(meta.kinds).map(([k, v]) => <Pill key={k} on={kind === k} label={v} onPress={() => setKind(k)} />)}
      </View>

      <Label text="العنوان" />
      <TextInput value={title} onChangeText={(v) => setTitle(v.slice(0, 160))} placeholder="مثال: كتاب الرياضيات — الصف الخامس" placeholderTextColor={Colors.textSubtle} style={styles.input} textAlign="right" />
      <Label text="وصف مختصر (اختياري)" />
      <TextInput value={description} onChangeText={(v) => setDescription(v.slice(0, 1000))} placeholder="الطبعة، الوحدات المشمولة، ملاحظات…" placeholderTextColor={Colors.textSubtle} style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]} multiline textAlign="right" />
      <Label text="العام الدراسي (اختياري)" />
      <TextInput value={schoolYear} onChangeText={(v) => setSchoolYear(v.slice(0, 20))} placeholder="مثال: 2025/2026" placeholderTextColor={Colors.textSubtle} style={styles.input} textAlign="right" />

      <Label text="الملف" />
      <View style={styles.modeRow}>
        <Pill on={mode === "file"} label="رفع من جهازي" onPress={() => setMode("file")} />
        <Pill on={mode === "link"} label="إضافة رابط" onPress={() => setMode("link")} />
      </View>
      {mode === "file" ? (
        <TouchableOpacity style={styles.drop} onPress={pick} disabled={saving} accessibilityRole="button">
          <Ionicons name={file ? "document-attach" : "cloud-upload-outline"} size={28} color={BLUE} />
          <Text style={styles.dropTitle} numberOfLines={1}>{file ? file.name : "اختر ملف PDF أو Word أو صورة"}</Text>
          <Text style={styles.dropSub}>{file ? fmtSize(file.size ?? null) || "" : `حتى ${meta.max_file_mb} م.ب`}</Text>
        </TouchableOpacity>
      ) : (
        <TextInput value={link} onChangeText={setLink} placeholder="https://drive.google.com/…" placeholderTextColor={Colors.textSubtle} style={styles.input} autoCapitalize="none" keyboardType="url" textAlign="left" />
      )}

      {progress !== null && (
        <View style={styles.progress}><View style={[styles.progressBar, { width: `${progress}%` }]} /><Text style={styles.progressText}>{progress}%</Text></View>
      )}

      <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16, height: 50 }]} onPress={submit} disabled={saving} accessibilityRole="button">
        {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={19} color="#fff" />}
        <Text style={styles.primaryBtnText}>{saving ? "جارٍ الرفع…" : isMod ? "نشر" : "إرسال للمراجعة"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Label({ text }: { text: string }) { return <Text style={styles.label}>{text}</Text>; }
function Pill({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  iconBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  center: { paddingVertical: 40, alignItems: "center" },

  hero: { marginHorizontal: 16, borderRadius: 22, padding: 18, alignItems: "flex-end", gap: 6 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff", textAlign: "right" },
  heroSub: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 21, color: "#DCE9F5", textAlign: "right" },

  tabs: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, marginTop: 14, flexWrap: "wrap" },
  tab: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 13, height: 38, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  tabOn: { backgroundColor: BLUE, borderColor: BLUE },
  tabText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  tabTextOn: { color: "#fff" },

  searchBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 14, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, paddingVertical: 0 },

  section: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", marginHorizontal: 16, marginTop: 16, marginBottom: 8 },
  stageGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 },
  stageCard: { width: "47%", flexGrow: 1, backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.border, padding: 12, alignItems: "flex-end", gap: 2 },
  stageIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  stageLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  stageCount: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted },

  chipsRow: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 13, height: 36, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  chipOn: { backgroundColor: BLUE, borderColor: BLUE },
  chipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  chipTextOn: { color: "#fff", fontFamily: "Cairo_600SemiBold" },
  chipBadge: { fontFamily: "Cairo_700Bold", fontSize: 11, color: BLUE },

  servicesRow: { flexDirection: "row-reverse", gap: 10, paddingHorizontal: 16 },
  service: { width: 150, backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 3 },
  serviceOn: { backgroundColor: BLUE, borderColor: BLUE },
  serviceTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  serviceWho: { fontFamily: "Cairo_600SemiBold", fontSize: 10.5, color: BLUE },
  serviceTitle: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right", marginTop: 4 },
  serviceSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },

  empty: { alignItems: "center", gap: 10, paddingVertical: 30, paddingHorizontal: 30 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },

  book: { backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 8 },
  bookRow: { flexDirection: "row-reverse", gap: 12 },
  bookIcon: { width: 52, height: 64, borderRadius: 10, backgroundColor: BLUE + "12", borderWidth: 1, borderColor: BLUE + "30", alignItems: "center", justifyContent: "center", gap: 2 },
  bookFmt: { fontFamily: "Cairo_700Bold", fontSize: 11, color: BLUE },
  bookTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right", lineHeight: 22 },
  bookMeta: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  bookTags: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 4 },
  kindTag: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: BLUE, backgroundColor: BLUE + "12", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  tag: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, backgroundColor: Colors.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  bookDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 21 },
  uploader: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textSubtle, textAlign: "right" },
  status: { alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  stOk: { backgroundColor: Colors.primary + "18" }, stNo: { backgroundColor: "#B4232F18" }, stWait: { backgroundColor: "#E8A90022" },
  statusText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary },
  bookActions: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  smallBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, height: 42, paddingHorizontal: 12, borderRadius: 12 },
  smallBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  iconAction: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "#B4232F40", alignItems: "center", justifyContent: "center" },

  primaryBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: BLUE, paddingHorizontal: 18, height: 46, borderRadius: 14 },
  primaryBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  ghostBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, borderWidth: 1, borderColor: BLUE + "40", backgroundColor: BLUE + "0D", paddingHorizontal: 14, height: 40, borderRadius: 12 },
  ghostBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: BLUE },

  signInBox: { margin: 16, backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 22, alignItems: "center", gap: 10 },
  signInTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "center" },
  signInText: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },

  form: { margin: 16, backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 16 },
  formTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  formHint: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginTop: 14, marginBottom: 7 },
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 },
  modeRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 13, backgroundColor: Colors.bg, paddingHorizontal: 13, paddingVertical: Platform.OS === "web" ? 11 : 9, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, marginTop: 4 },
  drop: { borderWidth: 1.5, borderStyle: "dashed", borderColor: BLUE + "60", backgroundColor: BLUE + "08", borderRadius: 16, paddingVertical: 20, paddingHorizontal: 12, alignItems: "center", gap: 4 },
  dropTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, maxWidth: "95%" },
  dropSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  progress: { height: 22, borderRadius: 11, backgroundColor: Colors.bg, marginTop: 12, overflow: "hidden", justifyContent: "center" },
  progressBar: { position: "absolute", right: 0, top: 0, bottom: 0, backgroundColor: BLUE + "55" },
  progressText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: BLUE, textAlign: "center" },
});
