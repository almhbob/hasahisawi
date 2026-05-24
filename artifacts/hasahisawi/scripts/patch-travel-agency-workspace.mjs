import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../app/travel-agencies.tsx', import.meta.url);
let src = readFileSync(file, 'utf8');
const before = src;

function once(from, to, label) {
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.warn(`[patch-travel-agency-workspace] skipped ${label}`);
    return;
  }
  src = src.replace(from, to);
}

// Add professional booking products constants.
once(
`const POPULAR_DEST = [
  { name: "القاهرة", flag: "🇪🇬", color: "#EF4444" },
  { name: "مكة المكرمة", flag: "🇸🇦", color: "#F59E0B" },
  { name: "دبي", flag: "🇦🇪", color: "#3B82F6" },
  { name: "إسطنبول", flag: "🇹🇷", color: "#8B5CF6" },
  { name: "الخرطوم", flag: "🇸🇩", color: "#10B981" },
  { name: "لندن", flag: "🇬🇧", color: "#EC4899" },
  { name: "أبو ظبي", flag: "🇦🇪", color: "#06B6D4" },
  { name: "أديس أبابا", flag: "🇪🇹", color: "#F97316" },
];`,
`const POPULAR_DEST = [
  { name: "القاهرة", flag: "🇪🇬", color: "#EF4444" },
  { name: "مكة المكرمة", flag: "🇸🇦", color: "#F59E0B" },
  { name: "دبي", flag: "🇦🇪", color: "#3B82F6" },
  { name: "إسطنبول", flag: "🇹🇷", color: "#8B5CF6" },
  { name: "الخرطوم", flag: "🇸🇩", color: "#10B981" },
  { name: "لندن", flag: "🇬🇧", color: "#EC4899" },
  { name: "أبو ظبي", flag: "🇦🇪", color: "#06B6D4" },
  { name: "أديس أبابا", flag: "🇪🇹", color: "#F97316" },
];

const BOOKING_PRODUCTS = [
  { key: "air", title: "تذاكر الطيران", desc: "طلبات سعر وحجز للرحلات الداخلية والدولية", icon: "airplane-takeoff", color: "#3B82F6" },
  { key: "hotel", title: "الفنادق والإقامة", desc: "حجوزات فنادق وشقق مفروشة وبرامج إقامة", icon: "bed-king-outline", color: "#10B981" },
  { key: "visa", title: "التأشيرات", desc: "متابعة طلبات التأشيرات والمستندات", icon: "passport", color: "#F59E0B" },
  { key: "packages", title: "الباقات السياحية", desc: "برامج سفر وسياحة وحج وعمرة", icon: "briefcase-check-outline", color: "#8B5CF6" },
];

const WORKSPACE_MODULES = [
  { title: "طلبات الحجوزات", sub: "استلام ومتابعة طلبات العملاء", icon: "clipboard-list-outline", color: "#60A5FA" },
  { title: "أسعار وتوافر", sub: "تحديث عروض الطيران والفنادق", icon: "tag-multiple-outline", color: "#34D399" },
  { title: "فريق الوكالة", sub: "صلاحيات الموظفين والمسؤولين", icon: "account-cog-outline", color: "#FBBF24" },
  { title: "إعدادات الدفع", sub: "حسابات التحويل وسياسة التأكيد", icon: "credit-card-cog-outline", color: "#F472B6" },
];`,
  'booking constants'
);

// Add booking workspace section after popular destinations section.
once(
`        {/* ── CTA الانضمام ── */}`,
`        {/* ── مساحة حجوزات احترافية ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🎫 مساحة حجوزات الوكالات</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingVertical: 6 }}>
            {BOOKING_PRODUCTS.map((p, i) => (
              <Animated.View key={p.key} entering={FadeInRight.delay(i * 70)}>
                <LinearGradient colors={[p.color + "22", "#0F172A"]} style={[s.bookingProductCard, { borderColor: p.color + "44" }]}>
                  <View style={[s.bookingProductIcon, { backgroundColor: p.color + "22" }]}>
                    <MaterialCommunityIcons name={p.icon as any} size={25} color={p.color} />
                  </View>
                  <Text style={s.bookingProductTitle}>{p.title}</Text>
                  <Text style={s.bookingProductDesc}>{p.desc}</Text>
                </LinearGradient>
              </Animated.View>
            ))}
          </ScrollView>
        </View>

        {/* ── لوحة إعدادات الوكالة ── */}
        <View style={[s.section, { paddingHorizontal: 16 }]}>
          <LinearGradient colors={["#020617", "#0F172A", "#1E3A8A"]} style={s.workspacePreview}>
            <View style={s.workspacePreviewHeader}>
              <View>
                <Text style={s.workspacePreviewTitle}>لوحة إدارة مساحة الوكالة</Text>
                <Text style={s.workspacePreviewSub}>جاهزة للاعتماد بعد قبول طلب الانضمام</Text>
              </View>
              <View style={s.workspaceStatusBadge}><Text style={s.workspaceStatusText}>تمهيد</Text></View>
            </View>
            <View style={s.workspaceGrid}>
              {WORKSPACE_MODULES.map((m, i) => (
                <View key={i} style={[s.workspaceModule, { borderColor: m.color + "35" }]}>
                  <MaterialCommunityIcons name={m.icon as any} size={21} color={m.color} />
                  <Text style={s.workspaceModuleTitle}>{m.title}</Text>
                  <Text style={s.workspaceModuleSub}>{m.sub}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* ── CTA الانضمام ── */}`,
  'workspace sections'
);

// Add booking products form state.
once(
`  const [targetRoutes,    setTargetRoutes]    = useState("");
  const [servicesOffered, setServicesOffered] = useState("");`,
`  const [targetRoutes,    setTargetRoutes]    = useState("");
  const [servicesOffered, setServicesOffered] = useState("");
  const [bookingProducts, setBookingProducts] = useState<string[]>(["تذاكر طيران"]);`,
  'booking products state'
);

once(
`    setDescription(""); setSpecialtiesText(""); setDestinationsText(""); setTargetRoutes(""); setServicesOffered("");`,
`    setDescription(""); setSpecialtiesText(""); setDestinationsText(""); setTargetRoutes(""); setServicesOffered(""); setBookingProducts(["تذاكر طيران"]);`,
  'booking reset'
);

// Submit booking_products.
once(
`          services_offered: servicesOffered,
          target_routes: targetRoutes,`,
`          services_offered: servicesOffered,
          booking_products: bookingProducts,
          target_routes: targetRoutes,`,
  'submit booking products'
);

// Add selector UI in step 3.
once(
`              <Field
                label="الخدمات المقدمة"
                value={servicesOffered} onChangeText={setServicesOffered}
                placeholder="مثال: حجز تذاكر طيران، تأشيرات، فنادق، باقات سياحية"
                multiline
              />`,
`              <Field
                label="الخدمات المقدمة"
                value={servicesOffered} onChangeText={setServicesOffered}
                placeholder="مثال: حجز تذاكر طيران، تأشيرات، فنادق، باقات سياحية"
                multiline
              />

              <Text style={m.label}>الخدمات التي تريدون استقبال طلبات حجز لها</Text>
              <View style={m.productGrid}>
                {["تذاكر طيران", "فنادق", "تأشيرات", "باقات سياحية", "حج وعمرة", "تذاكر داخلية"].map(p => {
                  const active = bookingProducts.includes(p);
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[m.productChip, active && m.productChipActive]}
                      onPress={() => setBookingProducts(list => active ? list.filter(x => x !== p) : [...list, p])}
                    >
                      <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={15} color={active ? "#fff" : Colors.textMuted} />
                      <Text style={[m.productChipText, active && { color: "#fff" }]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>`,
  'booking products selector'
);

// Add styles.
once(
`  intlBtnText:{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#1D4ED8" },
});`,
`  intlBtnText:{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#1D4ED8" },

  bookingProductCard: { width: 188, minHeight: 142, borderRadius: 18, borderWidth: 1, padding: 15, gap: 8, overflow: "hidden" },
  bookingProductIcon: { width: 45, height: 45, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  bookingProductTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", textAlign: "right" },
  bookingProductDesc: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.68)", textAlign: "right", lineHeight: 18 },

  workspacePreview: { borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "#60A5FA35", gap: 14, overflow: "hidden" },
  workspacePreviewHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  workspacePreviewTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right" },
  workspacePreviewSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#93C5FD", textAlign: "right", marginTop: 2 },
  workspaceStatusBadge: { backgroundColor: "#FBBF2420", borderColor: "#FBBF2444", borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  workspaceStatusText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#FBBF24" },
  workspaceGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 9 },
  workspaceModule: { width: "47%", borderWidth: 1, borderRadius: 14, padding: 12, backgroundColor: "rgba(255,255,255,0.04)", gap: 5 },
  workspaceModuleTitle: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff", textAlign: "right" },
  workspaceModuleSub: { fontFamily: "Cairo_400Regular", fontSize: 10, color: "rgba(255,255,255,0.62)", textAlign: "right", lineHeight: 15 },
});`,
  'screen styles'
);

once(
`  noticeText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, flex: 1, textAlign: "right" },

  footer:`,
`  noticeText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, flex: 1, textAlign: "right" },

  productGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  productChip: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 10, paddingVertical: 9 },
  productChipActive: { backgroundColor: "#1D4ED8", borderColor: "#60A5FA" },
  productChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary },

  footer:`,
  'modal styles'
);

if (src !== before) {
  writeFileSync(file, src);
  console.log('[patch-travel-agency-workspace] patched travel agencies workspace UI.');
} else {
  console.log('[patch-travel-agency-workspace] already patched.');
}
