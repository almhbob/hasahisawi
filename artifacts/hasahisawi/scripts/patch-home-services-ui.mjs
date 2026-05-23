import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../app/(tabs)/index.tsx', import.meta.url);
let src = readFileSync(file, 'utf8');
const before = src;

function replaceOnce(from, to, label) {
  if (src.includes(to)) return;
  if (!src.includes(from)) {
    console.warn(`[patch-home-services-ui] skipped ${label}: source block not found`);
    return;
  }
  src = src.replace(from, to);
}

function replaceEvery(from, to) {
  src = src.split(from).join(to);
}

// 1) Arabic labels should not be truncated after one line.
replaceOnce(
  '<Text style={styles.gridLabel} numberOfLines={1}>{item.label}</Text>',
  '<Text style={styles.gridLabel} numberOfLines={2}>{item.label}</Text>',
  'grid label lines',
);
replaceOnce(
  '<Text style={styles.gridSub} numberOfLines={1}>{item.sub}</Text>',
  '<Text style={styles.gridSub} numberOfLines={2}>{item.sub}</Text>',
  'grid sub lines',
);

// 2) Keep icons, but reduce their visual weight inside the card.
replaceOnce(
`          <View style={[styles.gridIconWrap, { backgroundColor: item.color + "18", borderColor: item.color + "40" }]}>
            {item.iconType === "ionicons"
              ? <Ionicons name={item.icon} size={22} color={item.color} />
              : <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />}
          </View>`,
`          <View style={[styles.gridIconWrap, { backgroundColor: item.color + "14", borderColor: item.color + "30" }]}>
            {item.iconType === "ionicons"
              ? <Ionicons name={item.icon} size={19} color={item.color} />
              : <MaterialCommunityIcons name={item.icon} size={19} color={item.color} />}
          </View>`,
  'icon visual weight',
);

// 3) Make long service names suitable for a compact card. The description keeps the meaning.
const labelReplacements = new Map([
  ['label: t(\'home\',\'calendarService\').label', 'label: "التقويم"'],
  ['label: t(\'home\',\'orgsService\').label', 'label: "المنظمات"'],
  ['label: "حجز المواعيد"', 'label: "المواعيد"'],
  ['label: "مشاويرك علينا وخدمات التوصيل"', 'label: "مشاويرك علينا"'],
  ['sub: "سيارات · ركشات · طلبات"', 'sub: "توصيل · ركشات · طلبات"'],
  ['label: "شركات الاتصالات"', 'label: "الاتصالات"'],
  ['label: "النقابات المهنية"', 'label: "النقابات"'],
]);
for (const [from, to] of labelReplacements) replaceEvery(from, to);

// 4) Give Arabic text breathing room without changing the 3-column layout.
replaceOnce(
`  gridItem: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20, padding: 14,
    alignItems: "center", height: 128,
    justifyContent: "center",
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },`,
`  gridItem: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 134,
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },`,
  'grid item layout',
);

replaceOnce(
`  gridGlow: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 55, borderRadius: 20,
  },`,
`  gridGlow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 42,
    borderRadius: 20,
  },`,
  'grid glow',
);

replaceOnce(
`  gridIconWrap: {
    width: 48, height: 48, borderRadius: 15,
    justifyContent: "center", alignItems: "center",
    marginBottom: 9, borderWidth: 0.5,
  },`,
`  gridIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 7,
    borderWidth: 0.5,
  },`,
  'icon box style',
);

replaceOnce(
`  gridLabel: {
    fontFamily: "Cairo_700Bold", fontSize: 12,
    color: "rgba(240,253,244,0.92)", textAlign: "center",
    letterSpacing: 0.1,
  },`,
`  gridLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "rgba(240,253,244,0.94)",
    textAlign: "center",
    letterSpacing: 0.1,
    lineHeight: 18,
    minHeight: 36,
  },`,
  'grid label style',
);

replaceOnce(
`  gridSub: {
    fontFamily: "Cairo_400Regular", fontSize: 9,
    color: "rgba(167,243,208,0.60)", textAlign: "center", marginTop: 2,
    lineHeight: 13,
  },`,
`  gridSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 9,
    color: "rgba(167,243,208,0.62)",
    textAlign: "center",
    marginTop: 2,
    lineHeight: 13,
    minHeight: 26,
  },`,
  'grid sub style',
);

if (src !== before) {
  writeFileSync(file, src);
  console.log('[patch-home-services-ui] Home service cards patched.');
} else {
  console.log('[patch-home-services-ui] Home service cards already clean.');
}
