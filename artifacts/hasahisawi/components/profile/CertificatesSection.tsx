// الشهادات والخبرات — عرض مضغوط واحترافي: تصفية حسب النوع، أول 3 ثم «عرض الكل»،
// صف مدمج لكل شهادة، وإجراءات المالك داخل قائمة «⋯» بدل أيقونات ظاهرة دائماً.
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, LayoutAnimation, Platform, UIManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { isDarkTheme } from "@/constants/theme-mode";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { CERT_KINDS, type Cert } from "@/lib/profile-api";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

const COLLAPSED = 3;
const FS = 1.15; // سقف تكبير الخط حتى لا يتفكك التصميم مع خط الهاتف الكبير
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const monthYear = (d?: string | null) => { if (!d) return null; const m = /^(\d{4})-(\d{2})/.exec(String(d)); return m ? `${AR_MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim() : String(d); };
const period = (a?: string | null, b?: string | null) => { const x = monthYear(a), y = monthYear(b); return x && y ? `${x} – ${y}` : x ? `${x} – الآن` : y; };
const kindOf = (k: string) => CERT_KINDS.find((x) => x.key === k) || CERT_KINDS[CERT_KINDS.length - 1];
const SHORT: Record<string, string> = { degree: "مؤهلات", course: "دورات", license: "رخص", award: "جوائز", experience: "خبرات", other: "أخرى" };

type Props = {
  certs: Cert[];
  isOwn: boolean;
  hiddenFromOthers?: boolean;
  onAdd: () => void;
  onEdit: (c: Cert) => void;
  onDelete: (c: Cert) => void;
  onOpenFile: (c: Cert) => void;
  onOpenLink: (url: string) => void;
};

export default function CertificatesSection({ certs, isOwn, hiddenFromOthers, onAdd, onEdit, onDelete, onOpenFile, onOpenLink }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);

  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    certs.forEach((c) => m.set(c.kind, (m.get(c.kind) || 0) + 1));
    return CERT_KINDS.filter((k) => m.has(k.key)).map((k) => ({ ...k, n: m.get(k.key)! }));
  }, [certs]);
  const list = filter === "all" ? certs : certs.filter((c) => c.kind === filter);
  const shown = expanded ? list : list.slice(0, COLLAPSED);
  const verifiedCount = certs.filter((c) => c.credential_url).length;
  const anim = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

  return (
    <View>
      <View style={s.head}>
        <View style={s.headIcon}><Ionicons name="ribbon" size={18} color={Colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title} maxFontSizeMultiplier={FS}>الشهادات والخبرات</Text>
          {certs.length > 0 && (
            <Text style={s.sub} maxFontSizeMultiplier={FS}>
              {certs.length} {certs.length > 10 ? "عنصراً" : "عناصر"}{verifiedCount ? ` · ${verifiedCount} قابلة للتحقق` : ""}
            </Text>
          )}
        </View>
        {isOwn && (
          <TouchableOpacity style={s.add} onPress={onAdd} accessibilityLabel="إضافة شهادة" hitSlop={6}>
            <Ionicons name="add" size={18} color={Colors.primary} />
            <Text style={s.addTxt} maxFontSizeMultiplier={FS}>إضافة</Text>
          </TouchableOpacity>
        )}
      </View>

      {isOwn && hiddenFromOthers && (
        <View style={s.warn}><Ionicons name="eye-off-outline" size={14} color="#B45309" /><Text style={s.warnTxt} maxFontSizeMultiplier={FS}>مخفية عن الآخرين — أظهرها من «تعديل الملف».</Text></View>
      )}

      {certs.length === 0 ? (
        <TouchableOpacity style={s.empty} onPress={isOwn ? onAdd : undefined} disabled={!isOwn}>
          <Ionicons name="ribbon-outline" size={28} color={Colors.primary} />
          <Text style={s.emptyT} maxFontSizeMultiplier={FS}>أرفق شهاداتك</Text>
          <Text style={s.emptyS} maxFontSizeMultiplier={FS}>مؤهلاتك ودوراتك ورخصك وخبراتك تظهر تلقائياً في ملفك المهني.</Text>
        </TouchableOpacity>
      ) : (
        <>
          {kinds.length > 1 && (
            <RtlScrollRow contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
              {[{ key: "all", label: "الكل", n: certs.length, color: Colors.primary }, ...kinds.map((k) => ({ key: k.key, label: SHORT[k.key] || k.label, n: k.n, color: k.color }))].map((f) => {
                const on = filter === f.key;
                return (
                  <TouchableOpacity key={f.key} onPress={() => { anim(); setFilter(f.key); setExpanded(false); setMenu(null); }} style={[s.chip, on && { backgroundColor: f.color, borderColor: f.color }]}>
                    <Text style={[s.chipTxt, on && { color: "#fff" }]} maxFontSizeMultiplier={FS}>{f.label}</Text>
                    <Text style={[s.chipN, on && { color: "#ffffffCC" }]} maxFontSizeMultiplier={FS}>{f.n}</Text>
                  </TouchableOpacity>
                );
              })}
            </RtlScrollRow>
          )}

          <View style={s.list}>
            {shown.map((c, i) => {
              const k = kindOf(c.kind);
              const date = c.kind === "experience" ? period(c.issued_on, c.expires_on) : monthYear(c.issued_on);
              const meta = [c.issuer, date].filter(Boolean).join(" · ");
              const hasFile = !!c.file_url;
              return (
                <View key={c.id} style={[s.row, i > 0 && s.rowSep]}>
                  <TouchableOpacity onPress={() => hasFile && onOpenFile(c)} activeOpacity={hasFile ? 0.8 : 1} style={[s.thumb, { backgroundColor: k.color + (isDarkTheme ? "24" : "14") }]}>
                    {hasFile && c.file_type === "image"
                      ? <Image source={{ uri: c.file_url! }} style={s.thumbImg} />
                      : <Ionicons name={(c.file_type === "pdf" ? "document-text" : k.icon) as any} size={20} color={c.file_type === "pdf" ? "#E05555" : k.color} />}
                  </TouchableOpacity>

                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={s.cTitle} numberOfLines={2} maxFontSizeMultiplier={FS}>{c.title}</Text>
                    {meta ? <Text style={s.cMeta} numberOfLines={1} maxFontSizeMultiplier={FS}>{meta}</Text> : null}
                    <View style={s.tags}>
                      <Text style={[s.kindTag, { color: k.color }]} maxFontSizeMultiplier={FS}>{k.label}</Text>
                      {c.kind !== "experience" && c.expires_on ? <Text style={s.cMeta} maxFontSizeMultiplier={FS}>· ينتهي {monthYear(c.expires_on)}</Text> : null}
                      {!c.is_public && isOwn ? <Text style={[s.cMeta, { color: "#B45309" }]} maxFontSizeMultiplier={FS}>· مخفية</Text> : null}
                    </View>
                  </View>

                  <View style={s.side}>
                    {c.credential_url ? (
                      <TouchableOpacity onPress={() => onOpenLink(c.credential_url!)} style={s.verify} hitSlop={6} accessibilityLabel="التحقق من الشهادة">
                        <Ionicons name="shield-checkmark" size={13} color={Colors.primary} />
                        <Text style={s.verifyTxt} maxFontSizeMultiplier={FS}>تحقّق</Text>
                      </TouchableOpacity>
                    ) : null}
                    {hasFile && !c.credential_url ? (
                      <TouchableOpacity onPress={() => onOpenFile(c)} style={s.iconBtn} hitSlop={6} accessibilityLabel="عرض المرفق">
                        <Ionicons name="attach" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                    {isOwn && (
                      <TouchableOpacity onPress={() => { anim(); setMenu(menu === c.id ? null : c.id); }} style={s.iconBtn} hitSlop={6} accessibilityLabel="خيارات">
                        <Ionicons name="ellipsis-horizontal" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {isOwn && menu === c.id && (
                    <View style={s.menu}>
                      <MenuBtn icon="create-outline" t="تعديل" onPress={() => { setMenu(null); onEdit(c); }} />
                      {hasFile && <MenuBtn icon="attach" t="المرفق" onPress={() => { setMenu(null); onOpenFile(c); }} />}
                      <MenuBtn icon="trash-outline" t="حذف" danger onPress={() => { setMenu(null); onDelete(c); }} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {list.length > COLLAPSED && (
            <TouchableOpacity onPress={() => { anim(); setExpanded((e) => !e); setMenu(null); }} style={s.more}>
              <Text style={s.moreTxt} maxFontSizeMultiplier={FS}>{expanded ? "عرض أقل" : `عرض الكل (${list.length})`}</Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

function MenuBtn({ icon, t, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; t: string; onPress: () => void; danger?: boolean }) {
  const c = danger ? Colors.danger : Colors.textPrimary;
  return (
    <TouchableOpacity onPress={onPress} style={[s.menuBtn, danger && { borderColor: Colors.danger + "40" }]}>
      <Ionicons name={icon} size={15} color={c} />
      <Text style={[s.menuTxt, { color: c }]} maxFontSizeMultiplier={FS}>{t}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  headIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.primary + (isDarkTheme ? "22" : "12"), alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: -2 },
  add: { flexDirection: "row-reverse", alignItems: "center", gap: 2, paddingHorizontal: 10, height: 32, borderRadius: 10, borderWidth: 1, borderColor: Colors.primary + "50", backgroundColor: Colors.primary + "0D" },
  addTxt: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.primary },
  warn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "#B4530914" },
  warnTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#B45309", textAlign: "right" },
  empty: { alignItems: "center", gap: 4, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: Colors.primary + "50", marginTop: 12 },
  emptyT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primaryDeep },
  emptyS: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textMuted, textAlign: "center", lineHeight: 19 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 11, height: 30, borderRadius: 15, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  chipTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  chipN: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted },
  list: { marginTop: 6, borderRadius: 16, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden" },
  row: { flexDirection: "row-reverse", flexWrap: "wrap", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  rowSep: { borderTopWidth: 1, borderTopColor: Colors.divider },
  thumb: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  cTitle: { fontFamily: "Cairo_700Bold", fontSize: 13.5, lineHeight: 20, color: Colors.textPrimary, textAlign: "right", writingDirection: "auto" },
  cMeta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  tags: { flexDirection: "row-reverse", alignItems: "center", gap: 4, flexWrap: "wrap" },
  kindTag: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5 },
  side: { alignItems: "center", gap: 6 },
  verify: { flexDirection: "row-reverse", alignItems: "center", gap: 3, paddingHorizontal: 8, height: 26, borderRadius: 13, backgroundColor: Colors.primary + (isDarkTheme ? "22" : "12") },
  verifyTxt: { fontFamily: "Cairo_700Bold", fontSize: 11, color: Colors.primary },
  iconBtn: { width: 30, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  menu: { flexDirection: "row-reverse", gap: 8, width: "100%", paddingTop: 4, paddingRight: 52 },
  menuBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 12, height: 32, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBg },
  menuTxt: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
  more: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 10, height: 38, borderRadius: 12, backgroundColor: Colors.primary + "0D" },
  moreTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
});
