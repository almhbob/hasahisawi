/**
 * 📄 ماسح المستندات للطالب والمعلم:
 *  • تصوير الصفحات بالكاميرا مع أداة القص لضبط حواف الورقة (أو اختيارها من المعرض)، صفحات متعددة.
 *  • مرشّحات تحسين: أصلي، مستند (نص واضح)، أبيض وأسود، رمادي، ألوان زاهية — وتدوير وترتيب وحذف.
 *  • تصدير PDF بمقاس A4 مع ترويسة اختيارية (العنوان، الاسم، التاريخ) ومشاركته أو حفظه.
 */
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import { neu, NeuButton, NeuInset, NeuRaised } from "@/components/auth/neu";
import ImageLightbox from "@/components/ImageLightbox";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { captureRef } from "react-native-view-shot";
import PdfToImages from "@/components/scanner/PdfToImages";
import { autoCropWeb, buildPdfWeb, canvasToBlob, pdfToImagesWeb, renderPageWeb, shareOrDownload } from "@/lib/scanner-tools";

const WATERMARK = "مُمسوح بتطبيق حصاحيصاوي";

type FilterKey = "original" | "document" | "bw" | "gray" | "vivid";
type Page = { id: string; uri: string; b64?: string; mime: string; filter: FilterKey; rotate: 0 | 90 | 180 | 270 };

const FILTERS: Record<FilterKey, { label: string; icon: any; css: string; rn: any[] }> = {
  original: { label: "أصلي", icon: "image-outline", css: "none", rn: [] },
  document: { label: "مستند", icon: "document-text-outline", css: "grayscale(1) contrast(1.7) brightness(1.12)", rn: [{ grayscale: 1 }, { contrast: 1.7 }, { brightness: 1.12 }] },
  bw: { label: "أبيض وأسود", icon: "contrast-outline", css: "grayscale(1) contrast(2.6) brightness(1.25)", rn: [{ grayscale: 1 }, { contrast: 2.6 }, { brightness: 1.25 }] },
  gray: { label: "رمادي", icon: "color-filter-outline", css: "grayscale(1)", rn: [{ grayscale: 1 }] },
  vivid: { label: "زاهٍ", icon: "sunny-outline", css: "saturate(1.45) contrast(1.15)", rn: [{ saturate: 1.45 }, { contrast: 1.15 }] },
};
const DOC_TYPES = ["واجب", "ملخص", "اختبار", "تحضير درس", "شهادة", "مستند"];
const ACCENT = "#2A6FA8";

const uid = () => Math.random().toString(36).slice(2, 10);

export default function DocScanner() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [pages, setPages] = useState<Page[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [header, setHeader] = useState(true);
  const [name, setName] = useState(user && !(user as any).isGuest ? user.name || "" : "");
  const [busy, setBusy] = useState<"capture" | "pdf" | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  // العلامة المائية: تظهر دائماً، والحسابات الموثقة وحدها تستطيع إخفاءها
  const verified = !!(user as any)?.is_verified;
  const [watermark, setWatermark] = useState(true);
  const showWm = watermark || !verified;
  const [pdfB64, setPdfB64] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const previewRef = React.useRef<View>(null);

  const current = pages.find(p => p.id === sel) || null;
  const update = (id: string, patch: Partial<Page>) => setPages(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));

  const add = async (from: "camera" | "library") => {
    try {
      setBusy("capture");
      if (from === "camera" && Platform.OS !== "web") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { notify("إذن الكاميرا", "اسمح للتطبيق باستخدام الكاميرا لتصوير المستندات."); return; }
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"] as any, quality: 0.85, base64: true, exif: false,
        // أداة القص الحرة لضبط حواف الورقة بعد التصوير
        allowsEditing: Platform.OS !== "web" && from === "camera",
        allowsMultipleSelection: from === "library", selectionLimit: 20,
      };
      const r = from === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled) return;
      const added: Page[] = r.assets.map(a => ({ id: uid(), uri: a.uri, b64: a.base64 || undefined, mime: a.mimeType || "image/jpeg", filter: "document", rotate: 0 }));
      setPages(ps => [...ps, ...added]);
      setSel(added[added.length - 1].id);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) { notify("تعذّر التصوير", e?.message); }
    finally { setBusy(null); }
  };

  /** مسح ذكي: كشف حواف الورقة وقصها وتصحيح المنظور تلقائياً (ML Kit على أندرويد، VisionKit على آيفون) */
  const smartScan = async () => {
    if (Platform.OS === "web") return add("camera");
    let DS: any = null;
    try { DS = require("react-native-document-scanner-plugin").default; } catch { DS = null; }
    if (!DS?.scanDocument) return add("camera");
    try {
      setBusy("capture");
      const r = await DS.scanDocument({ croppedImageQuality: 85, maxNumDocuments: 20, responseType: "base64" });
      if (r?.status !== "success" || !r.scannedImages?.length) return;
      const added: Page[] = r.scannedImages.map((b64: string) => {
        const data = b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`;
        return { id: uid(), uri: data, b64: data.split(",")[1], mime: "image/jpeg", filter: "document", rotate: 0 };
      });
      setPages(ps => [...ps, ...added]);
      setSel(added[added.length - 1].id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch { await add("camera"); }
    finally { setBusy(null); }
  };

  const autoCrop = async () => {
    if (!current) return;
    if (Platform.OS !== "web") { notify("القص التلقائي", "استخدم «مسح ذكي» لقص الورقة تلقائياً بالكاميرا."); return; }
    try {
      const r = await autoCropWeb(current.uri);
      if (!r.cropped) { notify("لم تُكتشف حواف واضحة", "صوّر الورقة على خلفية داكنة لنتيجة أفضل."); return; }
      update(current.id, { uri: r.uri, b64: r.uri.split(",")[1], mime: "image/jpeg" });
    } catch (e: any) { notify("تعذّر القص", e?.message); }
  };

  const importPdf = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a: any = r.assets[0];
      setProgress("جارٍ تحويل صفحات PDF إلى صور…");
      if (Platform.OS === "web") {
        const imgs = await pdfToImagesWeb(a.file ?? a.uri);
        addImages(imgs);
      } else {
        setPdfB64(await FileSystem.readAsStringAsync(a.uri, { encoding: "base64" as any }));
      }
    } catch (e: any) { setProgress(""); notify("تعذّر فتح الملف", e?.message); }
  };
  const addImages = (imgs: string[]) => {
    setProgress(""); setPdfB64(null);
    if (!imgs.length) return notify("الملف فارغ");
    const added: Page[] = imgs.map(u => ({ id: uid(), uri: u, b64: u.split(",")[1], mime: "image/jpeg", filter: "original", rotate: 0 }));
    setPages(ps => [...ps, ...added]);
    setSel(added[0].id);
    notify("تم التحويل", `أُضيفت ${imgs.length} صفحة كصور — يمكنك تحسينها أو مشاركتها أو تصديرها PDF من جديد.`);
  };

  /** مشاركة الصور: الويب كل الصفحات بمرشحاتها، والهاتف الصفحة الحالية كما تظهر */
  const shareImages = async () => {
    if (!pages.length) return;
    try {
      if (Platform.OS === "web") {
        const files: File[] = [];
        for (let i = 0; i < pages.length; i++) {
          const c = await renderPageWeb({ uri: pages[i].uri, css: FILTERS[pages[i].filter].css, rotate: pages[i].rotate }, showWm ? WATERMARK : null);
          files.push(new File([await canvasToBlob(c)], `${docTitle}-${i + 1}.jpg`, { type: "image/jpeg" }));
        }
        const nav: any = navigator;
        if (nav?.canShare?.({ files })) await nav.share({ files, title: docTitle });
        else for (const f of files) await shareOrDownload(f, f.name, docTitle);
      } else {
        if (!previewRef.current) return;
        const uri = await captureRef(previewRef, { format: "jpg", quality: 0.92, result: "tmpfile" });
        await Sharing.shareAsync(uri, { mimeType: "image/jpeg", dialogTitle: docTitle });
      }
    } catch (e: any) { if (!/cancel|abort/i.test(String(e?.message))) notify("تعذّرت المشاركة", e?.message); }
  };

  const move = (id: string, d: -1 | 1) => setPages(ps => {
    const i = ps.findIndex(p => p.id === id); const j = i + d;
    if (i < 0 || j < 0 || j >= ps.length) return ps;
    const n = [...ps]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const remove = (id: string) => setPages(ps => { const n = ps.filter(p => p.id !== id); if (sel === id) setSel(n[n.length - 1]?.id ?? null); return n; });

  const applyAll = (f: FilterKey) => setPages(ps => ps.map(p => ({ ...p, filter: f })));

  const docTitle = (title.trim() || `${docType} — ${new Date().toLocaleDateString("ar-SD")}`);

  const html = useMemo(() => {
    const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const date = new Date().toLocaleDateString("ar-SD", { year: "numeric", month: "long", day: "numeric" });
    const body = pages.map((p, i) => {
      const src = p.b64 ? `data:${p.mime};base64,${p.b64}` : p.uri;
      const rot = p.rotate % 180 !== 0;
      return `<section class="page">
        ${header ? `<header><b>${esc(docTitle)}</b><span>${esc(name)}${name ? " · " : ""}${date}</span></header>` : ""}
        <div class="img"><img src="${src}" style="filter:${FILTERS[p.filter].css};transform:rotate(${p.rotate}deg);${rot ? "max-width:24cm;max-height:17cm;" : ""}"/></div>
        ${showWm ? `<div class="wm">${WATERMARK}</div>` : ""}
        <footer>صفحة ${i + 1} من ${pages.length}${showWm ? " · حصاحيصاوي" : ""}</footer>
      </section>`;
    }).join("");
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
      <style>
        @page { size: A4; margin: 0; }
        body { margin: 0; font-family: 'Cairo', 'Noto Naskh Arabic', Tahoma, sans-serif; }
        .page { width: 21cm; height: 29.6cm; padding: 1cm; box-sizing: border-box; display: flex; flex-direction: column; page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #2A6FA8; padding-bottom: 6px; margin-bottom: 10px; font-size: 13px; color: #1A2C25; }
        header span { color: #64748B; font-size: 11px; }
        .img { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .img img { max-width: 100%; max-height: 100%; object-fit: contain; }
        footer { text-align: center; font-size: 10px; color: #94A3B8; margin-top: 6px; }
        .page { position: relative; }
        .wm { position: absolute; left: 1.2cm; bottom: 1.4cm; background: rgba(11,107,73,0.85); color: #fff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 10px; }
      </style></head><body>${body}</body></html>`;
  }, [pages, header, docTitle, name, showWm]);

  const exportPdf = async () => {
    if (!pages.length) return;
    setBusy("pdf");
    try {
      if (Platform.OS === "web") {
        // ملف PDF حقيقي بالمرشحات والعلامة المائية، يُشارك أو يُنزّل
        const blob = await buildPdfWeb(pages.map(p => ({ uri: p.uri, css: FILTERS[p.filter].css, rotate: p.rotate })), showWm ? WATERMARK : null);
        const how = await shareOrDownload(blob, `${docTitle}.pdf`, docTitle);
        if (how === "downloaded") notify("تم حفظ الملف", "حُفظ ملف PDF في التنزيلات.");
      } else {
        const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: docTitle });
        else notify("تم إنشاء الملف", uri);
      }
    } catch (e: any) { if (!/cancel/i.test(String(e?.message))) notify("تعذّر إنشاء PDF", e?.message); }
    finally { setBusy(null); }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>ماسح المستندات</Text>
          <Text style={s.sub}>صوّر أوراقك وحوّلها إلى PDF واضح</Text>
        </View>
        {pages.length ? <View style={s.countPill}><Text style={s.countText}>{pages.length} صفحة</Text></View> : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {pages.length === 0 ? (
          <Animated.View entering={FadeIn}>
            <NeuRaised radius={26} depth={10} style={s.empty}>
              <View style={s.emptyIcon}><Ionicons name="scan" size={46} color={ACCENT} /></View>
              <Text style={s.emptyTitle}>امسح واجبك أو ملخصك أو شهادتك</Text>
              {[
                ["sunny-outline", "صوّر في إضاءة جيدة والورقة على سطح داكن"],
                ["crop-outline", "اضبط حواف الورقة بأداة القص بعد التصوير"],
                ["documents-outline", "أضف صفحات متعددة ثم صدّرها PDF واحداً"],
              ].map(([ic, t]) => (
                <View key={t} style={s.tip}><Ionicons name={ic as any} size={16} color={ACCENT} /><Text style={s.tipText}>{t}</Text></View>
              ))}
            </NeuRaised>
          </Animated.View>
        ) : (
          <>
            {/* المعاينة */}
            {current && (
              <Animated.View entering={FadeIn} key={current.id}>
                <NeuInset radius={22} style={s.preview}>
                  <View ref={previewRef} collapsable={false} style={s.previewTap}>
                  <Pressable onPress={() => setZoom(current.uri)} style={s.previewTap} accessibilityLabel="تكبير الصفحة">
                    <Image
                      source={{ uri: current.uri }}
                      resizeMode="contain"
                      style={[s.previewImg, { transform: [{ rotate: `${current.rotate}deg` }] }, Platform.OS === "web" ? ({ filter: FILTERS[current.filter].css } as any) : ({ filter: FILTERS[current.filter].rn } as any)]}
                    />
                  </Pressable>
                  {showWm ? <View style={s.wm} pointerEvents="none"><Text style={s.wmText}>{WATERMARK}</Text></View> : null}
                  </View>
                  <View style={s.pageBadge}><Text style={s.pageBadgeText}>{pages.indexOf(current) + 1} / {pages.length}</Text></View>
                </NeuInset>
              </Animated.View>
            )}

            {/* المرشّحات */}
            {current && (
              <View style={{ gap: 8 }}>
                <View style={s.rowBetween}>
                  <Text style={s.section}>تحسين الصفحة</Text>
                  <TouchableOpacity onPress={() => applyAll(current.filter)}><Text style={s.link}>تطبيق على كل الصفحات</Text></TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse" }}>
                  {(Object.keys(FILTERS) as FilterKey[]).map(k => {
                    const on = current.filter === k;
                    return (
                      <Pressable key={k} onPress={() => update(current.id, { filter: k })} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                        {on ? (
                          <NeuInset radius={14} tint={ACCENT} style={s.filter}><Ionicons name={FILTERS[k].icon} size={18} color={ACCENT} /><Text style={[s.filterText, { color: ACCENT }]}>{FILTERS[k].label}</Text></NeuInset>
                        ) : (
                          <NeuRaised radius={14} depth={4} style={s.filter}><Ionicons name={FILTERS[k].icon} size={18} color={Colors.textMuted} /><Text style={s.filterText}>{FILTERS[k].label}</Text></NeuRaised>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={s.tools}>
                  <Tool icon="crop" label="قص تلقائي" onPress={autoCrop} />
                  <Tool icon="refresh" label="تدوير" onPress={() => update(current.id, { rotate: (((current.rotate + 90) % 360) as Page["rotate"]) })} />
                  <Tool icon="arrow-forward" label="للأمام" onPress={() => move(current.id, -1)} />
                  <Tool icon="arrow-back" label="للخلف" onPress={() => move(current.id, 1)} />
                  <Tool icon="trash-outline" label="حذف" color="#EF4444" onPress={() => remove(current.id)} />
                </View>
              </View>
            )}

            {/* الصفحات */}
            <Text style={s.section}>الصفحات</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 10, flexDirection: "row-reverse", paddingVertical: 4 }}>
              {pages.map((p, i) => (
                <Pressable key={p.id} onPress={() => setSel(p.id)} style={[s.thumb, sel === p.id && { borderColor: ACCENT }]} accessibilityLabel={`الصفحة ${i + 1}`}>
                  <Image source={{ uri: p.uri }} style={[s.thumbImg, { transform: [{ rotate: `${p.rotate}deg` }] }, Platform.OS === "web" ? ({ filter: FILTERS[p.filter].css } as any) : ({ filter: FILTERS[p.filter].rn } as any)]} />
                  <View style={s.thumbNum}><Text style={s.thumbNumText}>{i + 1}</Text></View>
                </Pressable>
              ))}
              <Pressable onPress={() => add("camera")} style={[s.thumb, s.addThumb]} accessibilityLabel="إضافة صفحة">
                <Ionicons name="add" size={28} color={ACCENT} />
              </Pressable>
            </ScrollView>

            {/* بيانات الملف */}
            <NeuRaised radius={20} depth={6} style={{ padding: 14, gap: 10 }}>
              <Text style={s.section}>بيانات الملف</Text>
              <View style={s.typeRow}>
                {DOC_TYPES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setDocType(t)} style={[s.typeChip, docType === t && { backgroundColor: ACCENT, borderColor: ACCENT }]}>
                    <Text style={[s.typeText, docType === t && { color: "#fff" }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <NeuInset radius={12}><TextInput value={title} onChangeText={setTitle} placeholder={`العنوان (مثال: ${docType} الرياضيات)`} placeholderTextColor={Colors.textSubtle} style={s.input} /></NeuInset>
              <NeuInset radius={12}><TextInput value={name} onChangeText={setName} placeholder="اسم الطالب / المعلم" placeholderTextColor={Colors.textSubtle} style={s.input} /></NeuInset>
              <View style={s.rowBetween}>
                <Text style={s.label}>ترويسة بالعنوان والاسم والتاريخ في كل صفحة</Text>
                <Switch value={header} onValueChange={setHeader} trackColor={{ true: ACCENT + "88", false: Colors.divider }} thumbColor={header ? ACCENT : "#f4f4f4"} />
              </View>
              <View style={s.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>العلامة المائية «{WATERMARK}»</Text>
                  {!verified ? <Text style={s.lock}><Ionicons name="lock-closed" size={11} color="#B45309" /> إخفاؤها متاح للحسابات الموثقة فقط</Text> : null}
                </View>
                <Switch value={showWm} onValueChange={setWatermark} disabled={!verified} trackColor={{ true: ACCENT + "88", false: Colors.divider }} thumbColor={showWm ? ACCENT : "#f4f4f4"} accessibilityLabel="العلامة المائية" />
              </View>
            </NeuRaised>
          </>
        )}
      </ScrollView>

      {/* شريط الأوامر */}
      <View style={[s.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flexDirection: "row-reverse", gap: 10 }}>
          <View style={{ flex: 1.4 }}>
            <NeuButton label={Platform.OS === "web" ? (pages.length ? "صفحة جديدة" : "صوّر مستنداً") : "مسح ذكي (قص تلقائي)"} icon={Platform.OS === "web" ? "camera" : "scan"} onPress={smartScan} loading={busy === "capture"} />
          </View>
          <View style={{ flex: 1 }}>
            <NeuButton variant="soft" label="من المعرض" icon="images-outline" onPress={() => add("library")} />
          </View>
        </View>
        <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 8 }}>
          <TouchableOpacity onPress={importPdf} style={s.miniBtn} accessibilityRole="button"><Ionicons name="document-attach-outline" size={16} color={ACCENT} /><Text style={s.miniText}>تحويل PDF إلى صور</Text></TouchableOpacity>
          {pages.length > 0 && <TouchableOpacity onPress={shareImages} style={s.miniBtn} accessibilityRole="button"><Ionicons name="share-social-outline" size={16} color={ACCENT} /><Text style={s.miniText}>{Platform.OS === "web" ? "مشاركة كصور" : "مشاركة الصفحة كصورة"}</Text></TouchableOpacity>}
        </View>
        {progress ? <Text style={[s.sub, { textAlign: "center", marginTop: 6 }]}>{progress}</Text> : null}
        {pages.length > 0 && (
          <Animated.View entering={FadeInDown} style={{ marginTop: 10 }}>
            <NeuButton label={`مشاركة / حفظ PDF (${pages.length} صفحة)`} icon="document-attach-outline" onPress={exportPdf} loading={busy === "pdf"} />
          </Animated.View>
        )}
      </View>

      <ImageLightbox uri={zoom} onClose={() => setZoom(null)} title="معاينة الصفحة" />
      {pdfB64 && Platform.OS !== "web" ? (
        <PdfToImages base64={pdfB64} onDone={addImages} onError={(m) => { setPdfB64(null); setProgress(""); notify("تعذّر التحويل", m); }}
          onProgress={(d, t) => setProgress(`جارٍ تحويل الصفحة ${d} من ${t}…`)} />
      ) : null}
    </View>
  );
}

function Tool({ icon, label, onPress, color = Colors.textSecondary }: { icon: any; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={label}>
      <NeuRaised radius={14} depth={4} style={s.tool}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={[s.toolText, { color }]}>{label}</Text>
      </NeuRaised>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wm: { position: "absolute", left: 10, bottom: 10, backgroundColor: "rgba(11,107,73,0.85)", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  wmText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  lock: { fontFamily: "Cairo_500Medium", fontSize: 11, color: "#B45309", textAlign: "right" },
  miniBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 12, borderWidth: 1.2, borderColor: ACCENT + "50", backgroundColor: Colors.cardBg },
  miniText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: ACCENT },
  root: { flex: 1, backgroundColor: neu.base },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  countPill: { backgroundColor: ACCENT + "18", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: ACCENT },

  empty: { padding: 22, alignItems: "center", gap: 12 },
  emptyIcon: { width: 92, height: 92, borderRadius: 30, backgroundColor: ACCENT + "16", alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "center" },
  tip: { flexDirection: "row-reverse", alignItems: "center", gap: 8, alignSelf: "stretch" },
  tipText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },

  preview: { height: 380, padding: 10, alignItems: "center", justifyContent: "center" },
  previewTap: { width: "100%", height: "100%" },
  previewImg: { width: "100%", height: "100%" },
  pageBadge: { position: "absolute", top: 12, left: 12, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pageBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },

  rowBetween: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  section: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: ACCENT },
  filter: { alignItems: "center", gap: 2, paddingHorizontal: 14, paddingVertical: 8, minWidth: 74 },
  filterText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  tools: { flexDirection: "row-reverse", gap: 8 },
  tool: { alignItems: "center", gap: 2, paddingVertical: 8 },
  toolText: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },

  thumb: { width: 74, height: 98, borderRadius: 12, overflow: "hidden", borderWidth: 2.5, borderColor: "transparent", backgroundColor: Colors.cardBg },
  thumbImg: { width: "100%", height: "100%" },
  thumbNum: { position: "absolute", bottom: 4, right: 4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  thumbNumText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  addThumb: { alignItems: "center", justifyContent: "center", borderStyle: "dashed", borderColor: ACCENT + "70" },

  typeRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  typeText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary },
  input: { fontFamily: "Cairo_600SemiBold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right", paddingHorizontal: 12, paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  label: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },

  bar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: neu.base, borderTopWidth: 1, borderTopColor: Colors.divider },
});
