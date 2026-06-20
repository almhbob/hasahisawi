import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const reportPath = resolve(root, 'service-audit-report.json');

const requiredFiles = [
  'app/(tabs)/index.tsx',
  'app/(tabs)/women.tsx',
  'app/(tabs)/restaurants.tsx',
  'app/(tabs)/transport.tsx',
  'app/(tabs)/market.tsx',
  'app/(tabs)/product-showcase.tsx',
  'app/(tabs)/social.tsx',
  'app/(tabs)/medical.tsx',
  'app/(tabs)/jobs.tsx',
  'app/(tabs)/orgs.tsx',
  'app/(tabs)/cv-builder.tsx',
  'lib/translations.ts',
];

const requiredTexts = [
  { file: 'app/(tabs)/women.tsx', text: '/api/women/join-request', label: 'women join request endpoint' },
  { file: 'app/(tabs)/restaurants.tsx', text: '/api/food/products', label: 'food product backend endpoint' },
  { file: 'app/(tabs)/restaurants.tsx', text: '/api/food/orders', label: 'food order backend endpoint' },
  { file: 'app/(tabs)/restaurants.tsx', text: '/api/food/invoices', label: 'food invoice backend endpoint' },
  { file: 'app/(tabs)/transport.tsx', text: '/accept', label: 'atomic trip accept endpoint' },
  { file: 'app/(tabs)/social.tsx', text: 'decodePostImages', label: 'social multi-image decoder applied' },
  { file: 'scripts/apply-latest-sections.mjs', text: 'apply-women-label-cleanup', label: 'women label cleanup patch runs' },
];

const forbiddenTexts = [
  { file: 'app/(tabs)/women.tsx', text: 'حواء', label: 'old Hawa label in women screen' },
  { file: 'app/(tabs)/index.tsx', text: 'حواء', label: 'old Hawa label in home screen' },
  { file: 'lib/translations.ts', text: 'حواء', label: 'old Hawa label in translations' },
  { file: 'app/(tabs)/index.tsx', text: 'id: "men"', label: 'standalone men section still linked' },
];

const warnings = [];
const failures = [];
const passed = [];

function readRel(rel) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

for (const rel of requiredFiles) {
  if (existsSync(resolve(root, rel))) passed.push(`exists:${rel}`);
  else failures.push(`missing required file: ${rel}`);
}

for (const rule of requiredTexts) {
  const src = readRel(rule.file);
  if (!src) failures.push(`missing file for rule ${rule.label}: ${rule.file}`);
  else if (src.includes(rule.text)) passed.push(`required:${rule.label}`);
  else failures.push(`missing required text (${rule.label}) in ${rule.file}`);
}

for (const rule of forbiddenTexts) {
  const src = readRel(rule.file);
  if (!src) continue;
  if (src.includes(rule.text)) failures.push(`forbidden text (${rule.label}) found in ${rule.file}`);
  else passed.push(`forbidden-clean:${rule.label}`);
}

const index = readRel('app/(tabs)/index.tsx') || '';
const routes = [...index.matchAll(/route:\s*"\/\(tabs\)\/([^"]+)"/g)].map(m => m[1]);
for (const route of routes) {
  const file = resolve(root, `app/(tabs)/${route}.tsx`);
  const indexFile = resolve(root, `app/(tabs)/${route}/index.tsx`);
  if (existsSync(file) || existsSync(indexFile)) passed.push(`route-ok:${route}`);
  else warnings.push(`home route has no matching file yet: ${route}`);
}

const packageJson = JSON.parse(readRel('package.json') || '{}');
const scripts = packageJson.scripts || {};
for (const [name, command] of Object.entries(scripts)) {
  if (['dev','prebuild','build','release:check'].includes(name) && !String(command).includes('audit-app-services')) {
    warnings.push(`script ${name} does not run audit-app-services yet`);
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  passed,
  warnings,
  failures,
};
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
