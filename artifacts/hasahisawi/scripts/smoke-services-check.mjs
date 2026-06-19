import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const requiredFiles = [
  'app/(tabs)/index.tsx',
  'app/(tabs)/women.tsx',
  'app/(tabs)/men.tsx',
  'app/(tabs)/restaurants.tsx',
  'app/(tabs)/transport.tsx',
  'app/(tabs)/cv-builder.tsx',
  'components/ProductShowcase.tsx',
  'scripts/patch-home-services-ui.mjs',
  'scripts/apply-fashion-sections.mjs',
  'scripts/apply-product-showcase.mjs',
  'scripts/apply-restaurants-section.mjs',
  'scripts/apply-transport-live-requests.mjs',
  'scripts/apply-cv-free-templates.mjs',
];

const checks = [];
function check(name, pass, details = '') {
  checks.push({ name, pass, details });
}

for (const file of requiredFiles) {
  check(`file exists: ${file}`, existsSync(join(root, file)));
}

function read(file) {
  return readFileSync(join(root, file), 'utf8');
}

const home = existsSync(join(root, 'app/(tabs)/index.tsx')) ? read('app/(tabs)/index.tsx') : '';
const womenPatch = existsSync(join(root, 'scripts/apply-fashion-sections.mjs')) ? read('scripts/apply-fashion-sections.mjs') : '';
const productPatch = existsSync(join(root, 'scripts/apply-product-showcase.mjs')) ? read('scripts/apply-product-showcase.mjs') : '';
const patchMain = existsSync(join(root, 'scripts/patch-home-services-ui.mjs')) ? read('scripts/patch-home-services-ui.mjs') : '';
const restaurants = existsSync(join(root, 'app/(tabs)/restaurants.tsx')) ? read('app/(tabs)/restaurants.tsx') : '';
const men = existsSync(join(root, 'app/(tabs)/men.tsx')) ? read('app/(tabs)/men.tsx') : '';
const productShowcase = existsSync(join(root, 'components/ProductShowcase.tsx')) ? read('components/ProductShowcase.tsx') : '';

check('home can route to restaurants through patch', patchMain.includes('apply-restaurants-section.mjs'));
check('home can route to men through patch', patchMain.includes('men service card'));
check('women fashion tabs render service area', womenPatch.includes('subTab === "fashion"') && womenPatch.includes('subTab === "beauty"'));
check('women filter includes fashion beauty perfume', womenPatch.includes('["fashion", "ملابس"]') && womenPatch.includes('["beauty", "تجميل"]') && womenPatch.includes('["perfume", "عطور"]'));
check('product showcase patches women and men', productPatch.includes("patchFile('../app/(tabs)/women.tsx'") && productPatch.includes("patchFile('../app/(tabs)/men.tsx'"));
check('product showcase has 3 images per sample', (productShowcase.match(/images:\s*\[/g) || []).length >= 6);
check('restaurant page has zoom modal', restaurants.includes('Modal') && restaurants.includes('zoomImage') && restaurants.includes('onZoom'));
check('restaurant page has offers strip', restaurants.includes('عروض اليوم') && restaurants.includes('offerStrip'));
check('men page has fashion marketplace', men.includes('محلات الملابس') && men.includes('بائعي الملابس') && men.includes('التفصيل'));

for (const script of [
  'scripts/patch-home-services-ui.mjs',
  'scripts/apply-fashion-sections.mjs',
  'scripts/apply-product-showcase.mjs',
  'scripts/apply-restaurants-section.mjs',
  'scripts/apply-transport-live-requests.mjs',
  'scripts/apply-cv-free-templates.mjs',
]) {
  if (!existsSync(join(root, script))) continue;
  const res = spawnSync(process.execPath, ['--check', join(root, script)], { encoding: 'utf8' });
  check(`syntax check: ${script}`, res.status === 0, res.stderr.trim());
}

const failed = checks.filter(c => !c.pass);
for (const c of checks) {
  console.log(`${c.pass ? '✅' : '❌'} ${c.name}${c.details ? ` — ${c.details}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} smoke checks failed.`);
  process.exit(1);
}

console.log('\nAll app service smoke checks passed.');
