import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../app/(tabs)/index.tsx', import.meta.url);
let src = readFileSync(file, 'utf8');
const before = src;

const marker = '    { id: "market",    label: t(\'home\',\'marketService\').label,   sub: t(\'home\',\'marketService\').sub,    icon: "storefront",        iconType: "ionicons"  as const, color: "#FF6B35", bg: "#FF6B3520", route: "/(tabs)/market"    as const },';
const card = marker + '\n    { id: "restaurants", label: "المطاعم والكافتريات", sub: "منتجات · عروض · وجبات", icon: "food-fork-drink", iconType: "material" as const, color: Colors.accent, bg: Colors.accent+"20", route: "/(tabs)/restaurants" as const },';

if (!src.includes('id: "restaurants"') && src.includes(marker)) {
  src = src.replace(marker, card);
}

if (src !== before) {
  writeFileSync(file, src);
  console.log('[restaurants-section] restaurants launcher card added.');
} else {
  console.log('[restaurants-section] already applied or marker missing.');
}
