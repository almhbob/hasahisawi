import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, '../app/(tabs)/transport.tsx');
let src = readFileSync(file, 'utf8');
let changed = false;

const rep = (from, to) => {
  if (!src.includes(from)) return false;
  src = src.replace(from, to);
  changed = true;
  return true;
};

rep(
  'useState<"book" | "drivers" | "mytrips" | "register">("book")',
  'useState<"book" | "driver-inbox" | "drivers" | "mytrips" | "register">("book")',
);

if (!src.includes('const [driverModeId, setDriverModeId]')) {
  rep(
    '  const [myTrips,    setMyTrips]    = useState<Trip[]>([]);\n',
    '  const [myTrips,    setMyTrips]    = useState<Trip[]>([]);\n  const [driverModeId, setDriverModeId] = useState<number | null>(null);\n  const [incomingTrips, setIncomingTrips] = useState<Trip[]>([]);\n  const [incomingLoading, setIncomingLoading] = useState(false);\n  const [acceptingTripId, setAcceptingTripId] = useState<number | null>(null);\n',
  );
}

// إلغاء اختبار السائق قبل التقديم: يصبح التقديم مفتوحاً مباشرة.
rep(
  'const [quizPhase,    setQuizPhase]    = useState<"intro" | "quiz" | "result">("intro");',
  'const [quizPhase,    setQuizPhase]    = useState<"intro" | "quiz" | "result">("result");',
);
rep(
  'const [quizScore,    setQuizScore]    = useState(0);',
  'const [quizScore,    setQuizScore]    = useState(DRIVER_QUIZ.length);',
);
rep(
  'const [quizPassed,   setQuizPassed]   = useState(false);',
  'const [quizPassed,   setQuizPassed]   = useState(true);',
);
rep(
  'قبل الانضمام كسائق، يجب اجتياز اختبار قصير يتحقق من فهمك لمراحل عمل التطبيق وقواعده.',
  'تم حذف اختبار السائق قبل التقديم. يمكنك إرسال طلب الانضمام مباشرة، وستراجع الإدارة البيانات.',
);
rep('المساحة التدريبية للسائقين', 'التقديم المباشر للسائقين');
rep('ابدأ الاختبار التدريبي', 'متابعة التقديم مباشرة');
rep('تهانينا! اجتزت الاختبار', 'جاهز لتقديم طلب الانضمام');
rep('أثبتت فهمك الكامل لمراحل التطبيق', 'تم حذف الاختبار — أكمل بياناتك وأرسل طلب الانضمام');
rep('مراجعة إجاباتك', 'ملاحظة التقديم');
rep('{DRIVER_QUIZ.map((q, i) => {', '{false && DRIVER_QUIZ.map((q, i) => {');

if (!src.includes('loadIncomingTripsLite')) {
  const anchor = `  const loadMyTrips = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchWithTimeout(\`${'${apiUrl}'}/api/transport/my-trips\`, {
        headers: { Authorization: \`Bearer ${'${token}'}\` },
      });
      if (res.ok) setMyTrips(await res.json());
    } catch {}
  }, [apiUrl, token]);
`;
  rep(anchor, `${anchor}
  const loadIncomingTripsLite = useCallback(async () => {
    setIncomingLoading(true);
    try {
      const url = driverModeId ? \`${'${apiUrl}'}/api/transport/driver/${'${driverModeId}'}/incoming-trips\` : \`${'${apiUrl}'}/api/transport/trips?status=pending\`;
      const res = await fetchWithTimeout(url);
      if (res.ok) setIncomingTrips(await res.json());
    } catch {} finally { setIncomingLoading(false); }
  }, [apiUrl, driverModeId]);

  const toggleDriverAvailabilityLite = useCallback(async (driver: Driver) => {
    const next = !driver.is_online;
    try {
      const res = await fetchWithTimeout(\`${'${apiUrl}'}/api/transport/drivers/${'${driver.id}'}/online\`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_online: next }),
      });
      if (res.ok) {
        setDriverModeId(next ? driver.id : null);
        setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, is_online: next } : d));
        if (next) loadIncomingTripsLite();
      }
    } catch { Alert.alert("خطأ", "تعذر تحديث حالة السائق"); }
  }, [apiUrl, loadIncomingTripsLite]);

  const acceptIncomingTripLite = useCallback(async (trip: Trip) => {
    const driver = drivers.find(d => d.id === driverModeId);
    if (!driver) { Alert.alert("اختر السائق", "فعّل حالة متاح أولاً"); return; }
    setAcceptingTripId(trip.id);
    try {
      const res = await fetchWithTimeout(\`${'${apiUrl}'}/api/transport/trips/${'${trip.id}'}/accept\`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: \`Bearer ${'${token}'}\` } : {}) },
        body: JSON.stringify({ driver_id: driver.id }),
      });
      if (res.ok) {
        setIncomingTrips(prev => prev.filter(t => t.id !== trip.id));
        setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, is_online: false, total_trips: d.total_trips + 1 } : d));
        setDriverModeId(null);
        Alert.alert("تم قبول الطلب", "أصبح الطلب رحلة جارية باسمك، ولن يتمكن سائق آخر من قبوله.");
      } else {
        const j = await res.json().catch(() => ({}));
        Alert.alert("تعذر القبول", (j as any).error || "ربما تم قبول الطلب بواسطة سائق آخر");
        loadIncomingTripsLite();
      }
    } catch { Alert.alert("خطأ", "تعذر قبول الطلب"); }
    setAcceptingTripId(null);
  }, [apiUrl, drivers, driverModeId, token, loadIncomingTripsLite]);
`);
}

if (!src.includes('activeTab !== "driver-inbox"')) {
  const anchor = `  // تحديث تلقائي لتبويب "طلباتي" كل ٣٠ ثانية
  useEffect(() => {
    if (activeTab !== "mytrips" || !token) return;
    const interval = setInterval(() => { loadMyTrips(); }, 30_000);
    return () => clearInterval(interval);
  }, [activeTab, token, loadMyTrips]);
`;
  rep(anchor, `${anchor}
  useEffect(() => {
    if (activeTab !== "driver-inbox") return;
    loadIncomingTripsLite();
    const interval = setInterval(() => { loadIncomingTripsLite(); }, 7_000);
    return () => clearInterval(interval);
  }, [activeTab, loadIncomingTripsLite]);
`);
}

if (!src.includes('key: "driver-inbox"')) {
  rep(
    '    { key: "book",     label: "اطلب الآن",  icon: "car-outline"       as const },\n',
    '    { key: "book",     label: "اطلب الآن",  icon: "car-outline"       as const },\n    { key: "driver-inbox", label: "طلبات السائق", icon: "radio-outline" as const },\n',
  );
}

if (!src.includes('activeTab === "driver-inbox"')) {
  const block = `
        {activeTab === "driver-inbox" && (
          <Animated.View entering={FadeInDown.springify()}>
            <View style={s.formCard}>
              <Text style={{ fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right", fontSize: 16 }}>طلبات السائقين الواردة</Text>
              <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textSecondary, textAlign: "right", marginTop: 4, fontSize: 12 }}>فعّل أحد السائقين كمتاح ثم اقبل الطلب. أول سائق يقبل الطلب يستلمه وحده.</Text>
              {drivers.map(d => (
                <TouchableOpacity key={d.id} onPress={() => toggleDriverAvailabilityLite(d)} style={{ marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: d.is_online ? GREEN + "55" : Colors.border, backgroundColor: d.is_online ? GREEN + "12" : Colors.cardBg, flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                  <MaterialCommunityIcons name={d.is_online ? "radio-tower" : "car-clock"} size={22} color={d.is_online ? GREEN : Colors.textMuted} />
                  <View style={{ flex: 1 }}><Text style={{ fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right" }}>{d.name}</Text><Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "right", fontSize: 11 }}>{d.vehicle_type} · {d.area || "الحصاحيصا"}</Text></View>
                  <Text style={{ fontFamily: "Cairo_700Bold", color: d.is_online ? GREEN : Colors.textMuted, fontSize: 12 }}>{d.is_online ? "متاح" : "غير متاح"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {incomingLoading && incomingTrips.length === 0 ? <View style={s.emptyCard}><ActivityIndicator color={ACCENT} /><Text style={s.emptyText}>جاري تحميل الطلبات...</Text></View> : null}
            {!incomingLoading && incomingTrips.length === 0 ? <View style={s.emptyCard}><MaterialCommunityIcons name="map-search-outline" size={48} color={Colors.textMuted} /><Text style={s.emptyText}>لا توجد طلبات واردة الآن</Text></View> : null}
            {incomingTrips.map(trip => (
              <View key={trip.id} style={[s.formCard, { borderColor: ACCENT + "35" }]}> 
                <Text style={{ fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right", fontSize: 15 }}>{trip.user_name}</Text>
                <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textSecondary, textAlign: "right", lineHeight: 22 }}>من: {trip.from_location}</Text>
                <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textSecondary, textAlign: "right", lineHeight: 22 }}>إلى: {trip.to_location}</Text>
                <TouchableOpacity onPress={() => acceptIncomingTripLite(trip)} disabled={acceptingTripId === trip.id || !driverModeId} style={{ marginTop: 14, backgroundColor: driverModeId ? GREEN : Colors.textMuted, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                  {acceptingTripId === trip.id ? <ActivityIndicator color="#001" /> : <Text style={{ fontFamily: "Cairo_700Bold", color: "#001" }}>قبول الطلب الآن</Text>}
                </TouchableOpacity>
              </View>
            ))}
          </Animated.View>
        )}
`;
  rep('        {/* ───ـ السائقون ───ـ */}\n', `${block}\n        {/* ───ـ السائقون ───ـ */}\n`) ||
    rep('        {/* ───ـ السائقون ──── */}\n', `${block}\n        {/* ───ـ السائقون ───ـ */}\n`) ||
    rep('        {/* ──── السائقون ──── */}\n', `${block}\n        {/* ───ـ السائقون ───ـ */}\n`);
}

const declarations = new Set([
  '  const [driverModeId, setDriverModeId] = useState<number | null>(null);',
  '  const [incomingTrips, setIncomingTrips] = useState<Trip[]>([]);',
  '  const [incomingLoading, setIncomingLoading] = useState(false);',
  '  const [acceptingTripId, setAcceptingTripId] = useState<number | null>(null);',
]);
const seen = new Set();
const cleaned = [];
for (const line of src.split('\n')) {
  if (declarations.has(line)) {
    if (seen.has(line)) { changed = true; continue; }
    seen.add(line);
  }
  cleaned.push(line);
}
src = cleaned.join('\n');

if (changed) writeFileSync(file, src);
console.log(changed ? 'Driver inbox applied and driver quiz requirement removed' : 'Driver inbox already present');
