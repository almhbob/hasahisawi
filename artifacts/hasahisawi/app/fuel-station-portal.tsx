/**
 * ⛽ لوحة إدارة محطة الوقود — لصاحب المحطة ومديريها (والإدارة ترى كل المحطات):
 *  • تحديث حالة كل وقود بلمسة: متوفر/نفد، السعر، الزحام.
 *  • هوية المحطة: الشعار والغلاف والخدمات والمواعيد ووسائل التواصل.
 *  • إضافة مديرين برقم هواتفهم، واعتماد/تعليق المحطات للإدارة.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PauseControl } from "@/components/EntityNotice";
import {
  ActivityIndicator, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import HoursPicker from "@/components/HoursPicker";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { confirmAction, notify } from "@/lib/xplatform";
import { onlyDigits, toLatinDigits } from "@/lib/digits";
import { neu, NeuButton, NeuInset, NeuRaised } from "@/components/auth/neu";
import { ImageUploadField } from "@/components/union/ImageUploadField";
import {
  ago, FUEL_META, fuelApi, fuelsFor, KIND_META, QUEUE_LABEL, SERVICE_ICONS, type FuelKey, type FuelState, type FuelStation, type StationKind,
} from "@/lib/fuel-api";

const FUEL_KEYS: FuelKey[] = ["gasoline", "diesel", "gas"];
const ACCENT = "#CB9200";
const STATUS_META: Record<string, { label: string; color: string }> = {
  approved: { label: "معتمدة وظاهرة للمواطنين", color: "#00966A" },
  pending: { label: "بانتظار اعتماد الإدارة", color: "#E8A900" },
  suspended: { label: "موقوفة", color: "#D93636" },
};

type Draft = { available: boolean; price: string; queue: "none" | "short" | "long" };

export default function FuelStationPortal() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [services, setServices] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<number | null>(null);
  const [view, setView] = useState<"fuel" | "profile" | "team">("fuel");
  const [registering, setRegistering] = useState(false);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const d = await fuelApi.mine(token);
      setStations(d.stations || []);
      setServices(d.services || {});
      setIsAdmin(!!d.is_admin);
      setSelId(cur => cur && d.stations.some(s => s.id === cur) ? cur : d.stations[0]?.id ?? null);
    } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const station = stations.find(s => s.id === selId) || null;
  const replace = (s: FuelStation) => setStations(prev => prev.map(x => x.id === s.id ? s : x));

  if (!token || !user || (user as any).isGuest) {
    return (
      <Shell title="لوحة محطة الوقود" insets={insets}>
        <View style={st.center}>
          <Ionicons name="lock-closed-outline" size={44} color={Colors.textMuted} />
          <Text style={st.centerText}>سجّل الدخول بحسابك لإدارة محطتك أو تسجيل محطة جديدة</Text>
          <NeuButton label="تسجيل الدخول" icon="log-in-outline" onPress={() => router.push("/login" as any)} />
        </View>
      </Shell>
    );
  }

  return (
    <Shell title={station ? station.name : "لوحة محطة الوقود"} insets={insets} right={
      <TouchableOpacity onPress={() => router.push("/fuel-stations" as any)} style={st.iconBtn} accessibilityLabel="عرض المحطات كما يراها المواطن">
        <Ionicons name="eye-outline" size={18} color={Colors.textPrimary} />
      </TouchableOpacity>
    }>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ACCENT} />}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} /> : (stations.length === 0 || registering) ? (
          <RegisterForm token={token} services={services} onCancel={stations.length ? () => setRegistering(false) : undefined}
            onDone={async () => { setRegistering(false); await load(); }} />
        ) : (
          <>
            {/* اختيار المحطة */}
            {(stations.length > 1 || isAdmin) && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse" }}>
                {stations.map(s => (
                  <TouchableOpacity key={s.id} onPress={() => setSelId(s.id)} style={[st.stChip, s.id === selId && st.stChipOn]}>
                    <View style={[st.dot, { backgroundColor: STATUS_META[s.status]?.color }]} />
                    <Text style={[st.stChipText, s.id === selId && { color: ACCENT }]} numberOfLines={1}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setRegistering(true)} style={st.stChip}>
                  <Ionicons name="add" size={16} color={ACCENT} />
                  <Text style={[st.stChipText, { color: ACCENT }]}>محطة جديدة</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {station && (
              <>
                <Header s={station} isAdmin={isAdmin} token={token} onChanged={load} />
                <NeuInset radius={16} style={st.tabs}>
                  {([["fuel", "الوقود والأسعار", "speedometer"], ["profile", "هوية المحطة", "storefront"], ["team", "المديرون", "people"]] as const).map(([k, label, icon]) => (
                    <Pressable key={k} onPress={() => setView(k)} style={{ flex: 1 }} accessibilityRole="tab" accessibilityState={{ selected: view === k }}>
                      {view === k ? (
                        <NeuRaised radius={12} depth={4} style={st.tab}>
                          <Ionicons name={icon as any} size={15} color={ACCENT} />
                          <Text style={[st.tabText, { color: ACCENT }]}>{label}</Text>
                        </NeuRaised>
                      ) : (
                        <View style={st.tab}>
                          <Ionicons name={(icon + "-outline") as any} size={15} color={Colors.textMuted} />
                          <Text style={st.tabText}>{label}</Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </NeuInset>
                {view === "fuel" && <FuelPanel s={station} token={token} onSaved={replace} />}
                {view === "profile" && <ProfilePanel s={station} token={token} services={services} onSaved={replace} />}
                {view === "team" && <TeamPanel s={station} token={token} />}
              </>
            )}
          </>
        )}
      </ScrollView>
    </Shell>
  );
}

function Shell({ title, insets, right, children }: { title: string; insets: any; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.iconBtn} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.title} numberOfLines={1}>{title}</Text>
          <Text style={st.sub}>لوحة إدارة محطة الوقود</Text>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

function Header({ s, isAdmin, token, onChanged }: { s: FuelStation; isAdmin: boolean; token: string; onChanged: () => void }) {
  const meta = STATUS_META[s.status];
  const setStatus = async (status: string) => {
    if (status === "suspended" && !(await confirmAction("إيقاف المحطة", `إخفاء «${s.name}» عن المواطنين؟`, "إيقاف", true))) return;
    try { await fuelApi.setStatus(token, s.id, status); onChanged(); } catch (e: any) { notify("خطأ", e?.message); }
  };
  return (
    <NeuRaised radius={22} depth={8} style={st.headCard}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
        {s.logo_url ? <Image source={{ uri: s.logo_url }} style={st.logo} /> : (
          <View style={[st.logo, { backgroundColor: ACCENT + "18", alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="speedometer" size={26} color={ACCENT} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={st.headName} numberOfLines={1}>{s.name}</Text>
          <View style={st.statusRow}>
            <View style={[st.dot, { backgroundColor: meta.color }]} />
            <Text style={[st.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={st.sub}>آخر تحديث {ago(s.updated_at)}</Text>
        </View>
      </View>
      {isAdmin && (
        <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 12 }}>
          {s.status !== "approved" && <SmallBtn label="اعتماد" icon="checkmark-circle" color="#00966A" onPress={() => setStatus("approved")} />}
          {s.status !== "suspended" && <SmallBtn label="إيقاف" icon="pause-circle" color="#D93636" onPress={() => setStatus("suspended")} />}
        </View>
      )}
    </NeuRaised>
  );
}

function SmallBtn({ label, icon, color, onPress }: { label: string; icon: any; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[st.smallBtn, { borderColor: color + "55", backgroundColor: color + "12" }]}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[st.smallBtnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FuelPanel({ s, token, onSaved }: { s: FuelStation; token: string; onSaved: (s: FuelStation) => void }) {
  const KEYS = fuelsFor(s.kind);
  const init = useMemo(() => Object.fromEntries(KEYS.map(k => {
    const f = s.fuels.find(x => x.fuel === k);
    return [k, { available: !!f?.available, price: f?.price != null ? String(Number(f.price)) : "", queue: (f?.queue as any) || "none" }];
  })) as Record<FuelKey, Draft>, [s]);
  const [d, setD] = useState(init);
  const [saving, setSaving] = useState(false);
  useEffect(() => setD(init), [init]);
  const dirty = JSON.stringify(d) !== JSON.stringify(init);
  const set = (k: FuelKey, patch: Partial<Draft>) => setD(prev => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const fuels: Partial<FuelState>[] = KEYS.map(k => ({ fuel: k, available: d[k].available, price: d[k].price || null, queue: d[k].queue }));
      const r = await fuelApi.setFuels(token, s.id, fuels);
      onSaved(r.station);
      notify("تم النشر", "ظهرت الحالة الجديدة للمواطنين فوراً.");
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
    setSaving(false);
  };

  return (
    <Animated.View entering={FadeIn} style={{ gap: 12 }}>
      <PauseControl type="fuel" id={s.id} />
      <Text style={st.hint}>حدّث الحالة كلما تغيّرت — المواطنون يرون وقت آخر تحديث، والتحديث المتكرر يرفع ثقتهم في محطتك.</Text>
      {KEYS.map(k => {
        const meta = FUEL_META[k];
        const x = d[k];
        return (
          <NeuRaised key={k} radius={20} depth={7} style={st.fuelCard}>
            <View style={st.fuelHead}>
              <View style={[st.fuelIcon, { backgroundColor: meta.color + "1C" }]}>
                <Ionicons name={meta.icon as any} size={22} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.fuelName}>{meta.label}</Text>
                <Text style={[st.fuelState, { color: x.available ? "#00966A" : "#D93636" }]}>{x.available ? "متوفر الآن" : "غير متوفر"}</Text>
              </View>
              <Switch
                value={x.available}
                onValueChange={v => set(k, { available: v })}
                trackColor={{ true: "#10B98166", false: "#EF444444" }}
                thumbColor={x.available ? "#00966A" : "#D93636"}
                accessibilityLabel={`${meta.label} متوفر`}
              />
            </View>
            {x.available && (
              <View style={{ gap: 10 }}>
                <NeuInset radius={14} style={st.priceBox}>
                  <Text style={st.priceUnit}>جنيه / {meta.unit}</Text>
                  <TextInput
                    value={x.price}
                    onChangeText={v => set(k, { price: onlyDigits(v, 8) })}
                    keyboardType="number-pad"
                    placeholder="السعر"
                    placeholderTextColor={Colors.textSubtle}
                    style={st.priceInput}
                    accessibilityLabel={`سعر ${meta.label}`}
                  />
                </NeuInset>
                <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                  {(["none", "short", "long"] as const).map(q => {
                    const on = x.queue === q; const c = QUEUE_LABEL[q].color;
                    return (
                      <TouchableOpacity key={q} onPress={() => set(k, { queue: q })} style={[st.qBtn, on && { borderColor: c, backgroundColor: c + "18" }]}>
                        <Text style={[st.qText, on && { color: c, fontFamily: "Cairo_700Bold" }]}>{QUEUE_LABEL[q].label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </NeuRaised>
        );
      })}
      <NeuButton label={dirty ? "نشر التحديث للمواطنين" : "لا توجد تغييرات"} icon="cloud-upload-outline" onPress={save} loading={saving} disabled={!dirty} />
    </Animated.View>
  );
}

function ProfilePanel({ s, token, services, onSaved }: { s: FuelStation; token: string; services: Record<string, string>; onSaved: (s: FuelStation) => void }) {
  const [f, setF] = useState(() => ({ ...s }));
  const [saving, setSaving] = useState(false);
  useEffect(() => setF({ ...s }), [s.id]);
  const up = (patch: Partial<FuelStation>) => setF(prev => ({ ...prev, ...patch }));
  const toggleSvc = (k: string) => up({ services: f.services.includes(k) ? f.services.filter(x => x !== k) : [...f.services, k] });

  const save = async () => {
    setSaving(true);
    try {
      const r = await fuelApi.update(token, s.id, {
        name: f.name, brand: f.brand, logo_url: f.logo_url, cover_url: f.cover_url, phone: f.phone, whatsapp: f.whatsapp,
        area: f.area, address: f.address, hours: f.hours, is_24h: f.is_24h, services: f.services, notes: f.notes,
      });
      onSaved(r.station);
      notify("تم الحفظ", "حُدّثت بيانات المحطة.");
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
    setSaving(false);
  };

  return (
    <Animated.View entering={FadeIn} style={{ gap: 14 }}>
      <ImageUploadField label="شعار المحطة" value={f.logo_url || ""} onChange={url => up({ logo_url: url || null })} folder="fuel" aspect={1} />
      <ImageUploadField label="صورة الغلاف" value={f.cover_url || ""} onChange={url => up({ cover_url: url || null })} folder="fuel" aspect={16 / 9} />
      <Field label="اسم المحطة" value={f.name} onChange={v => up({ name: v })} />
      <Field label="الشركة / العلامة (اختياري)" value={f.brand || ""} onChange={v => up({ brand: v })} placeholder="مثال: النيل للبترول" />
      <View style={{ flexDirection: "row-reverse", gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="الهاتف" value={f.phone || ""} onChange={v => up({ phone: onlyDigits(v, 14) })} keyboard="phone-pad" /></View>
        <View style={{ flex: 1 }}><Field label="واتساب" value={f.whatsapp || ""} onChange={v => up({ whatsapp: onlyDigits(v, 14) })} keyboard="phone-pad" /></View>
      </View>
      <Field label="الحي / المنطقة" value={f.area || ""} onChange={v => up({ area: v })} />
      <Field label="العنوان التفصيلي" value={f.address || ""} onChange={v => up({ address: v })} />
      <TouchableOpacity onPress={() => up({ is_24h: !f.is_24h })} style={st.checkRow}>
        <View style={[st.check, f.is_24h && { backgroundColor: ACCENT, borderColor: ACCENT }]}>{f.is_24h && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
        <Text style={st.checkText}>تعمل 24 ساعة</Text>
      </TouchableOpacity>
      {!f.is_24h && <HoursPicker value={f.hours || ""} onChange={v => up({ hours: v })} label="مواعيد العمل" allow24={false} />}

      <Text style={st.section}>الخدمات المتوفرة</Text>
      <View style={st.svcGrid}>
        {Object.entries(services).map(([k, label]) => {
          const on = f.services.includes(k);
          return (
            <TouchableOpacity key={k} onPress={() => toggleSvc(k)} style={[st.svc, on && { borderColor: ACCENT, backgroundColor: ACCENT + "14" }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <Ionicons name={(SERVICE_ICONS[k] || "ellipse") as any} size={15} color={on ? ACCENT : Colors.textMuted} />
              <Text style={[st.svcText, on && { color: ACCENT, fontFamily: "Cairo_700Bold" }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Field label="ملاحظات للسائقين (اختياري)" value={f.notes || ""} onChange={v => up({ notes: v })} multiline placeholder="عروض، طرق الدفع، تعليمات الدخول…" />
      <NeuButton label="حفظ بيانات المحطة" icon="save-outline" onPress={save} loading={saving} />
    </Animated.View>
  );
}

function TeamPanel({ s, token }: { s: FuelStation; token: string }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { const r = await fuelApi.addManager(token, s.id, phone); notify("تمت الإضافة", `أصبح ${r.manager.name} مديراً للمحطة.`); setPhone(""); }
    catch (e: any) { notify("تعذّرت الإضافة", e?.message); }
    setBusy(false);
  };
  return (
    <Animated.View entering={FadeIn} style={{ gap: 12 }}>
      <Text style={st.hint}>أضف العاملين الذين يحدّثون حالة الوقود برقم هاتف حسابهم في التطبيق. سيجدون المحطة في هذه اللوحة.</Text>
      <Field label="رقم هاتف المدير" value={phone} onChange={v => setPhone(onlyDigits(v, 14))} keyboard="phone-pad" placeholder="0912345678" />
      <NeuButton label="إضافة مدير" icon="person-add-outline" onPress={add} loading={busy} disabled={phone.length < 9} />
    </Animated.View>
  );
}

function RegisterForm({ token, services, onDone, onCancel }: { token: string; services: Record<string, string>; onDone: () => void; onCancel?: () => void }) {
  const [f, setF] = useState({ kind: "station" as StationKind, name: "", brand: "", phone: "", area: "", address: "", logo_url: "", is_24h: false, hours: "", services: [] as string[] });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (f.name.trim().length < 3) { notify("بيانات ناقصة", "اكتب اسم المحطة"); return; }
    if (onlyDigits(f.phone).length < 9) { notify("بيانات ناقصة", "رقم هاتف المحطة مطلوب"); return; }
    setBusy(true);
    try {
      const r = await fuelApi.create(token, { ...f, logo_url: f.logo_url || null } as any);
      notify("تم التسجيل", r.message);
      onDone();
    } catch (e: any) { notify("تعذّر التسجيل", e?.message); }
    setBusy(false);
  };
  return (
    <NeuRaised radius={24} depth={9} style={{ padding: 16, gap: 14 }}>
      <View style={{ alignItems: "center", gap: 6 }}>
        <View style={[st.logo, { backgroundColor: ACCENT + "18", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="speedometer" size={28} color={ACCENT} />
        </View>
        <Text style={st.headName}>سجّل نشاطك مجاناً</Text>
        <Text style={[st.hint, { textAlign: "center" }]}>تظهر محطتك للمواطنين بعد اعتماد الإدارة، وتحدّث حالة الوقود والأسعار من هنا.</Text>
      </View>
      <Text style={st.section}>نوع النشاط</Text>
      <View style={{ flexDirection: "row-reverse", gap: 8 }}>
        {(Object.keys(KIND_META) as StationKind[]).map(k => {
          const on = f.kind === k;
          return (
            <TouchableOpacity key={k} onPress={() => setF({ ...f, kind: k })} style={[st.svc, { flex: 1, justifyContent: "center", paddingVertical: 12 }, on && { borderColor: ACCENT, backgroundColor: ACCENT + "14" }]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <Ionicons name={KIND_META[k].icon as any} size={18} color={on ? ACCENT : Colors.textMuted} />
              <View>
                <Text style={[st.svcText, on && { color: ACCENT, fontFamily: "Cairo_700Bold" }]}>{KIND_META[k].label}</Text>
                <Text style={st.hint}>{k === "gas_shop" ? "أسطوانات غاز الطبخ فقط" : "بنزين · جازولين · غاز"}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <ImageUploadField label="الشعار (اختياري)" value={f.logo_url} onChange={url => setF({ ...f, logo_url: url })} folder="fuel" aspect={1} />
      <Field label={f.kind === "gas_shop" ? "اسم المحل" : "اسم المحطة"} value={f.name} onChange={v => setF({ ...f, name: v })} placeholder="مثال: محطة النيل — السوق الكبير" />
      <Field label="الشركة / العلامة (اختياري)" value={f.brand} onChange={v => setF({ ...f, brand: v })} />
      <Field label="هاتف المحطة" value={f.phone} onChange={v => setF({ ...f, phone: onlyDigits(v, 14) })} keyboard="phone-pad" placeholder="0912345678" />
      <Field label="الحي / المنطقة" value={f.area} onChange={v => setF({ ...f, area: v })} />
      <Field label="العنوان التفصيلي (اختياري)" value={f.address} onChange={v => setF({ ...f, address: v })} />
      <Text style={st.section}>الخدمات</Text>
      <View style={st.svcGrid}>
        {Object.entries(services).map(([k, label]) => {
          const on = f.services.includes(k);
          return (
            <TouchableOpacity key={k} onPress={() => setF({ ...f, services: on ? f.services.filter(x => x !== k) : [...f.services, k] })} style={[st.svc, on && { borderColor: ACCENT, backgroundColor: ACCENT + "14" }]}>
              <Ionicons name={(SERVICE_ICONS[k] || "ellipse") as any} size={15} color={on ? ACCENT : Colors.textMuted} />
              <Text style={[st.svcText, on && { color: ACCENT, fontFamily: "Cairo_700Bold" }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <NeuButton label="إرسال طلب التسجيل" icon="send" onPress={submit} loading={busy} />
      {onCancel && <TouchableOpacity onPress={onCancel} style={{ alignSelf: "center" }}><Text style={st.cancel}>إلغاء</Text></TouchableOpacity>}
    </NeuRaised>
  );
}

function Field({ label, value, onChange, placeholder, keyboard, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: any; multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.label}>{label}</Text>
      <NeuInset radius={14}>
        <TextInput
          value={value}
          onChangeText={v => onChange(keyboard === "phone-pad" ? toLatinDigits(v) : v)}
          placeholder={placeholder}
          placeholderTextColor={Colors.textSubtle}
          keyboardType={keyboard}
          multiline={multiline}
          style={[st.input, multiline && { minHeight: 84, textAlignVertical: "top" }]}
          accessibilityLabel={label}
        />
      </NeuInset>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  center: { alignItems: "center", justifyContent: "center", gap: 14, padding: 30, flex: 1 },
  centerText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },

  stChip: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, maxWidth: 200 },
  stChipOn: { borderColor: ACCENT, backgroundColor: ACCENT + "12" },
  stChipText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary },
  dot: { width: 8, height: 8, borderRadius: 4 },

  headCard: { padding: 14 },
  logo: { width: 60, height: 60, borderRadius: 18, backgroundColor: "#fff" },
  headName: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
  smallBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  smallBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13 },

  tabs: { flexDirection: "row-reverse", padding: 5, gap: 4 },
  tab: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9 },
  tabText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textMuted },

  hint: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textMuted, textAlign: "right", lineHeight: 20 },
  fuelCard: { padding: 14, gap: 12 },
  fuelHead: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  fuelIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  fuelName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  fuelState: { fontFamily: "Cairo_700Bold", fontSize: 12.5, textAlign: "right" },
  priceBox: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 14 },
  priceInput: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, textAlign: "right", paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  priceUnit: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  qBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 12, borderWidth: 1.2, borderColor: Colors.divider },
  qText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },

  label: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  input: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", paddingHorizontal: 14, paddingVertical: 12, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  section: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  svcGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  svc: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, borderWidth: 1.2, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  svcText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  checkRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.divider, alignItems: "center", justifyContent: "center" },
  checkText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  cancel: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textMuted, padding: 6 },
});
