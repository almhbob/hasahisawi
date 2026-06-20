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
  const re = new RegExp(`(\\n\\s*\\{ id: "${anchorId}"[\\s\\S]*?route: "/\\(tabs\\)/[^\"]+"\\s+as const \\},)`);
  if (!re.test(source)) {
    throw new Error(`Could not find service anchor: ${anchorId}`);
  }
  source = source.replace(re, `$1\n${block.text}`);
  changed = true;
}

insertAfterService('market', {
  idNeedle: 'id: "restaurants"',
  text: '    { id: "restaurants", label: "المطاعم والكافتريات", sub: "منيوهات · طلبات · عروض", icon: "restaurant-outline", iconType: "ionicons"  as const, color: "#F97316", bg: "#F9731620", route: "/(tabs)/restaurants" as const },\n    { id: "product-showcase", label: "معرض المنتجات", sub: "منتجات مختارة · صور · تواصل", icon: "cube-outline", iconType: "ionicons"  as const, color: "#14B8A6", bg: "#14B8A620", route: "/(tabs)/product-showcase" as const },'
});

insertAfterService('women', {
  idNeedle: 'id: "men"',
  text: '    { id: "men", label: "قسم الرجال", sub: "حلاقين · أزياء · عناية", icon: "male-outline", iconType: "ionicons"  as const, color: "#38BDF8", bg: "#38BDF820", route: "/(tabs)/men" as const },'
});

if (changed) {
  writeFileSync(indexPath, source);
  console.log('✅ Latest Hasahisawi sections linked on home screen.');
} else {
  console.log('✅ Latest Hasahisawi sections already linked.');
}
