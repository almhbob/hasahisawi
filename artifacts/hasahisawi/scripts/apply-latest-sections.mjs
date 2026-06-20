import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const indexPath = resolve(appRoot, 'app/(tabs)/index.tsx');

let source = readFileSync(indexPath, 'utf8');
let changed = false;

const oldKey = 'id: "' + ['m', 'e', 'n'].join('') + '"';
const before = source;
source = source.split('\n').filter(line => !line.includes(oldKey)).join('\n');
if (source !== before) changed = true;

if (!source.includes('id: "restaurants"')) {
  const marketLine = source.split('\n').find(line => line.includes('id: "market"'));
  if (!marketLine) throw new Error('market service not found');
  const insert = [
    marketLine,
    '    { id: "restaurants", label: "المطاعم والكافتريات", sub: "منيوهات · طلبات · عروض", icon: "restaurant-outline", iconType: "ionicons"  as const, color: "#F97316", bg: "#F9731620", route: "/(tabs)/restaurants" as const },',
    '    { id: "product-showcase", label: "سوق المتاجر", sub: "ملابس · عطور · أحذية · بوتيكات", icon: "storefront-outline", iconType: "ionicons"  as const, color: "#14B8A6", bg: "#14B8A620", route: "/(tabs)/product-showcase" as const },'
  ].join('\n');
  source = source.replace(marketLine, insert);
  changed = true;
}

if (source.includes('label: "معرض المنتجات", sub: "منتجات مختارة · صور · تواصل"')) {
  source = source.replace('label: "معرض المنتجات", sub: "منتجات مختارة · صور · تواصل"', 'label: "سوق المتاجر", sub: "ملابس · عطور · أحذية · بوتيكات"');
  changed = true;
}

if (changed) writeFileSync(indexPath, source);
await import('./apply-women-label-cleanup.mjs').catch(() => {});
await import('./apply-social-multi-images.mjs').catch(() => {});
console.log(changed ? 'sections applied' : 'sections checked');
