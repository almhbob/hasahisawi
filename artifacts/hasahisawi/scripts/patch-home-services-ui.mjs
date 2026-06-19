import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnceIn(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    console.warn(`[patch-home-services-ui] skipped ${label}: source block not found`);
    return source;
  }
  return source.replace(from, to);
}

function replaceEveryIn(source, from, to) {
  return source.split(from).join(to);
}

function patchHomeCards() {
  const file = new URL('../app/(tabs)/index.tsx', import.meta.url);
  let src = readFileSync(file, 'utf8');
  const before = src;

  src = replaceOnceIn(
    src,
    '<Text style={styles.gridLabel} numberOfLines={1}>{item.label}</Text>',
    '<Text style={styles.gridLabel} numberOfLines={2}>{item.label}</Text>',
    'grid label lines',
  );
  src = replaceOnceIn(
    src,
    '<Text style={styles.gridSub} numberOfLines={1}>{item.sub}</Text>',
    '<Text style={styles.gridSub} numberOfLines={2}>{item.sub}</Text>',
    'grid sub lines',
  );

  src = replaceOnceIn(
    src,
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

  const labelReplacements = new Map([
    ['label: t(\'home\',\'calendarService\').label', 'label: "التقويم"'],
    ['label: t(\'home\',\'orgsService\').label', 'label: "المنظمات"'],
    ['label: "حجز المواعيد"', 'label: "المواعيد"'],
    ['label: "مشاويرك علينا وخدمات التوصيل"', 'label: "مشاويرك علينا"'],
    ['sub: "سيارات · ركشات · طلبات"', 'sub: "توصيل · ركشات · طلبات"'],
    ['label: "شركات الاتصالات"', 'label: "الاتصالات"'],
    ['label: "النقابات المهنية"', 'label: "النقابات"'],
  ]);
  for (const [from, to] of labelReplacements) src = replaceEveryIn(src, from, to);

  const minimalPaletteReplacements = new Map([
    ['color: "#3E9CBF", bg: "#3E9CBF20"', 'color: Colors.primary, bg: Colors.primary+"20"'],
    ['color: "#A855F7", bg: "#A855F720"', 'color: Colors.primary, bg: Colors.primary+"20"'],
    ['color: "#FF6B35", bg: "#FF6B3520"', 'color: Colors.accent, bg: Colors.accent+"20"'],
    ['color: "#27AE68", bg: "#27AE6820"', 'color: Colors.primary, bg: Colors.primary+"20"'],
    ['color: "#FF4FA3", bg: "#FF4FA320"', 'color: Colors.primary, bg: Colors.primary+"20"'],
    ['color: "#FBBF24", bg: "#FBBF2420"', 'color: Colors.accent, bg: Colors.accent+"20"'],
    ['color: "#F87171", bg: "#F8717120"', 'color: Colors.danger, bg: Colors.danger+"20"'],
    ['color: "#3EFF9C", bg: "#3EFF9C20"', 'color: Colors.primary, bg: Colors.primary+"20"'],
    ['color: Colors.cyber, bg: Colors.cyber+"20"', 'color: Colors.primary, bg: Colors.primary+"20"'],
  ]);
  for (const [from, to] of minimalPaletteReplacements) src = replaceEveryIn(src, from, to);

  src = replaceOnceIn(
    src,
    '    { id: "women",     label: t(\'home\',\'womenService\').label,    sub: t(\'home\',\'womenService\').sub,     icon: "face-woman",        iconType: "material"  as const, color: "#FF4FA3", bg: "#FF4FA320", route: "/(tabs)/women"     as const },',
    '    { id: "women",     label: t(\'home\',\'womenService\').label,    sub: "أزياء · تجميل · عطور",     icon: "face-woman",        iconType: "material"  as const, color: Colors.primary, bg: Colors.primary+"20", route: "/(tabs)/women"     as const },\n    { id: "men",       label: "قسم الرجال",                         sub: "ملابس · بائعون · تفصيل",       icon: "hanger",            iconType: "material"  as const, color: Colors.accent, bg: Colors.accent+"20", route: "/(tabs)/men"       as const },',
    'men service card',
  );

  src = replaceEveryIn(src, 'color="#FBBF24"', 'color={Colors.accent}');
  src = replaceEveryIn(src, 'color: "#FBBF24"', 'color: Colors.accent');

  if (src !== before) {
    writeFileSync(file, src);
    console.log('[patch-home-services-ui] Home screen simplified and patched.');
  } else {
    console.log('[patch-home-services-ui] Home screen already clean.');
  }
}

function patchSocialScreen() {
  const file = new URL('../app/(tabs)/social.tsx', import.meta.url);
  let src = readFileSync(file, 'utf8');
  const before = src;

  const replacements = new Map([
    ['سؤال: "#2980B9"', 'سؤال: Colors.primary'],
    ['خبر: "#8E44AD"', 'خبر: Colors.primary'],
    ['إعلان: "#E67E22"', 'إعلان: Colors.accent'],
    ['نقاش: "#C0392B"', 'نقاش: Colors.danger'],
    ['شكر: "#27AE60"', 'شكر: Colors.primary'],
    ['color: "#2980B9"', 'color: Colors.primary'],
    ['color: "#9B59B6"', 'color: Colors.primary'],
    ['color: "#F39C12"', 'color: Colors.accent'],
    ['color: "#3498DB"', 'color: Colors.neutral'],
    ['"#E74C3C", "#3498DB", "#9B59B6", "#1ABC9C",\n  "#E67E22", "#27AE60", "#2980B9", "#D35400",', 'Colors.danger, Colors.neutral, Colors.primary, Colors.accent,\n  Colors.primary, Colors.accent, Colors.neutral, Colors.danger,'],
  ]);
  for (const [from, to] of replacements) src = replaceEveryIn(src, from, to);

  if (src !== before) {
    writeFileSync(file, src);
    console.log('[patch-home-services-ui] Social screen simplified and legacy posts fallback enabled.');
  } else {
    console.log('[patch-home-services-ui] Social screen already clean.');
  }
}

patchHomeCards();
patchSocialScreen();
await import('./apply-transport-live-requests.mjs').catch((error) => {
  console.warn('[patch-home-services-ui] transport live request patch skipped', error?.message ?? error);
});
await import('./apply-cv-free-templates.mjs').catch((error) => {
  console.warn('[patch-home-services-ui] cv templates patch skipped', error?.message ?? error);
});
await import('./apply-fashion-sections.mjs').catch((error) => {
  console.warn('[patch-home-services-ui] fashion sections patch skipped', error?.message ?? error);
});
