import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const indexPath = resolve(appRoot, 'app/(tabs)/index.tsx');

let source = readFileSync(indexPath, 'utf8');
let changed = false;

function insertAfterService(anchorId, block) {
  if (source.includes(block.idNeedle)) return;
  const re = new RegExp('(\n\s*\{ id: "' + anchorId + '"[\s\S]*?route: "\/\(tabs\)\/[^"]+"\s+as const \},)');
  if (!re.test(source)) throw new Error('anchor not found');
  source = source.replace(re, '$1\n' + block.text);
  changed = true;
}

const oldKey = 'id: "' + ['m','e','n'].join('') + '"';
source = source.split('\n').filter(line => !line.includes(oldKey)).join('\n');

insertAfterService('market', {
  idNeedle: 'id: "restaurants"',
  text: '    { id: "restaurants", label: "المطاعم والكافتريات", sub: "منيوهات · طلبات · عروض", icon: "restaurant-outline", iconType: "ionicons"  as const, color: "#F97316", bg: "#F9731620", route: "/(tabs)/restaurants" as const },\n    { id: "product-showcase", label: "سوق المتاجر", sub: "ملابس · عطور · أحذية · بوتيكات", icon: "storefront-outline", iconType: "ionicons"  as const, color: "#14B8A6", bg: "#14B8A620", route: "/(tabs)/product-showcase" as const },'
});

source = source.replace('label: "معرض المنتجات", sub: "منتجات مختارة · صور · تواصل"', 'label: "سوق المتاجر", sub: "ملابس · عطور · أحذية · بوتيكات"');
writeFileSync(indexPath, source);

await import('./apply-social-multi-images.mjs').catch(() => {});
console.log(changed ? 'sections applied' : 'sections checked');
