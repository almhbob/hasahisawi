import { readFileSync, writeFileSync } from 'node:fs';

const file = 'artifacts/hasahisawi/app/(tabs)/index.tsx';
let src = readFileSync(file, 'utf8');

function replaceOnce(from, to) {
  if (!src.includes(from)) {
    throw new Error(`Expected block was not found:\n${from}`);
  }
  src = src.replace(from, to);
}

// Keep icons, but stop them from dominating the card. The Arabic service name
// should be the main visual element, not the icon box.
replaceOnce(
`          <View style={[styles.gridIconWrap, { backgroundColor: item.color + "18", borderColor: item.color + "40" }]}>\n            {item.iconType === "ionicons"\n              ? <Ionicons name={item.icon} size={22} color={item.color} />\n              : <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />}\n          </View>\n          <Text style={styles.gridLabel} numberOfLines={1}>{item.label}</Text>\n          <Text style={styles.gridSub} numberOfLines={1}>{item.sub}</Text>`,
`          <View style={[styles.gridIconWrap, { backgroundColor: item.color + "14", borderColor: item.color + "30" }]}>\n            {item.iconType === "ionicons"\n              ? <Ionicons name={item.icon} size={18} color={item.color} />\n              : <MaterialCommunityIcons name={item.icon} size={18} color={item.color} />}\n          </View>\n          <Text style={styles.gridLabel} numberOfLines={2}>{item.label}</Text>\n          <Text style={styles.gridSub} numberOfLines={2}>{item.sub}</Text>`
);

// Shorten only the long visible labels; keep meaning in the subtitle.
replaceOnce(
`    { id: "appointments",label: "حجز المواعيد",                    sub: "صحي وحكومي",                     icon: "calendar",          iconType: "ionicons"  as const, color: Colors.accent,  bg: Colors.accent+"20",    route: "/(tabs)/appointments" as const },\n    { id: "reports",   label: "التبليغ السريع",                   sub: "مياه · كهرباء · بيئة",           icon: "megaphone",         iconType: "ionicons"  as const, color: Colors.danger,  bg: Colors.danger+"20",    route: "/(tabs)/reports"      as const },\n    { id: "numbers",   label: "أرقام مهمة",                       sub: "طوارئ وخدمات",                   icon: "call",              iconType: "ionicons"  as const, color: "#3E9CBF",  bg: "#3E9CBF20",    route: "/(tabs)/numbers"      as const },\n    { id: "transport", label: "مشاويرك علينا وخدمات التوصيل",      sub: "سيارات · ركشات · طلبات",         icon: "car-side",          iconType: "material"  as const, color: "#F97316",  bg: "#F9731620",    route: "/(tabs)/transport"    as const, rideStatus: ride_status },\n    { id: "telecom",   label: "شركات الاتصالات",                     sub: "MTN · Zain · Sudani · عروض",      icon: "cellular",          iconType: "ionicons"  as const, color: "#0EA5E9",  bg: "#0EA5E920",    route: "/(tabs)/telecom"      as const },\n    { id: "unions",    label: "النقابات المهنية",                    sub: "انضمام · إعلانات · عضوية",         icon: "people-circle-outline", iconType: "ionicons" as const, color: "#8B5CF6",  bg: "#8B5CF620",    route: "/(tabs)/unions"       as const },`,
`    { id: "appointments",label: "المواعيد",                       sub: "صحي · حكومي",                    icon: "calendar",          iconType: "ionicons"  as const, color: Colors.accent,  bg: Colors.accent+"20",    route: "/(tabs)/appointments" as const },\n    { id: "reports",   label: "التبليغ",                          sub: "مياه · كهرباء · بيئة",           icon: "megaphone",         iconType: "ionicons"  as const, color: Colors.danger,  bg: Colors.danger+"20",    route: "/(tabs)/reports"      as const },\n    { id: "numbers",   label: "أرقام مهمة",                       sub: "طوارئ · خدمات",                  icon: "call",              iconType: "ionicons"  as const, color: "#3E9CBF",  bg: "#3E9CBF20",    route: "/(tabs)/numbers"      as const },\n    { id: "transport", label: "مشاويرك علينا",                    sub: "توصيل · ركشات · طلبات",          icon: "car-side",          iconType: "material"  as const, color: "#F97316",  bg: "#F9731620",    route: "/(tabs)/transport"    as const, rideStatus: ride_status },\n    { id: "telecom",   label: "الاتصالات",                         sub: "MTN · Zain · Sudani",             icon: "cellular",          iconType: "ionicons"  as const, color: "#0EA5E9",  bg: "#0EA5E920",    route: "/(tabs)/telecom"      as const },\n    { id: "unions",    label: "النقابات",                          sub: "عضوية · إعلانات",                 icon: "people-circle-outline", iconType: "ionicons" as const, color: "#8B5CF6",  bg: "#8B5CF620",    route: "/(tabs)/unions"       as const },`
);

replaceOnce(
`  gridItem: {\n    backgroundColor: "rgba(255,255,255,0.04)",\n    borderRadius: 20, padding: 14,\n    alignItems: "center", height: 128,\n    justifyContent: "center",\n    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.09)",\n    overflow: "hidden",\n  },`,
`  gridItem: {\n    backgroundColor: "rgba(255,255,255,0.04)",\n    borderRadius: 18,\n    paddingHorizontal: 10,\n    paddingVertical: 12,\n    alignItems: "center",\n    height: 132,\n    justifyContent: "center",\n    borderWidth: 0.5,\n    borderColor: "rgba(255,255,255,0.09)",\n    overflow: "hidden",\n  },`
);

replaceOnce(
`  gridIconWrap: {\n    width: 48, height: 48, borderRadius: 15,\n    justifyContent: "center", alignItems: "center",\n    marginBottom: 9, borderWidth: 0.5,\n  },`,
`  gridIconWrap: {\n    width: 38,\n    height: 38,\n    borderRadius: 13,\n    justifyContent: "center",\n    alignItems: "center",\n    marginBottom: 8,\n    borderWidth: 0.5,\n  },`
);

replaceOnce(
`  gridLabel: {\n    fontFamily: "Cairo_700Bold", fontSize: 12,\n    color: "rgba(240,253,244,0.92)", textAlign: "center",\n    letterSpacing: 0.1,\n  },`,
`  gridLabel: {\n    fontFamily: "Cairo_700Bold",\n    fontSize: 12,\n    color: "rgba(240,253,244,0.94)",\n    textAlign: "center",\n    letterSpacing: 0.1,\n    lineHeight: 18,\n    minHeight: 36,\n  },`
);

replaceOnce(
`  gridSub: {\n    fontFamily: "Cairo_400Regular", fontSize: 9,\n    color: "rgba(167,243,208,0.60)", textAlign: "center", marginTop: 2,\n    lineHeight: 13,\n  },`,
`  gridSub: {\n    fontFamily: "Cairo_400Regular",\n    fontSize: 9.5,\n    color: "rgba(167,243,208,0.62)",\n    textAlign: "center",\n    marginTop: 2,\n    lineHeight: 14,\n    minHeight: 28,\n  },`
);

writeFileSync(file, src);
console.log('Applied professional home services UI fix.');
