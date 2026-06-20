import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '../..');
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
  'lib/join-requests.ts',
];

const repoFiles = [
  'artifacts/api-server/src/routes/join-requests.ts',
  'artifacts/api-server/src/routes/extra.ts',
  'artifacts/api-server/src/routes/food-pos.ts',
  'artifacts/api-server/src/routes/stabilization.ts',
  'artifacts/admin-dashboard/src/components/AdminJoinRequestAlerts.tsx',
  'artifacts/admin-dashboard/scripts/register-travel-agency-requests.mjs',
];

const requiredTexts = [
  { file: 'app/(tabs)/women.tsx', text: '/api/women/join-request', label: 'women join request endpoint' },
  { file: 'app/(tabs)/restaurants.tsx', text: '/api/food/products', label: 'food product backend endpoint' },
  { file: 'app/(tabs)/restaurants.tsx', text: '/api/food/orders', label: 'food order backend endpoint' },
  { file: 'app/(tabs)/restaurants.tsx', text: '/api/food/invoices', label: 'food invoice backend endpoint' },
  { file: 'app/(tabs)/transport.tsx', text: '/accept', label: 'atomic trip accept endpoint' },
  { file: 'app/(tabs)/social.tsx', text: 'decodePostImages', label: 'social multi-image decoder applied' },
  { file: 'app/(tabs)/cv-builder.tsx', text: 'CV_TEMPLATES', label: 'CV template gallery exists' },
  { file: 'app/(tabs)/cv-builder.tsx', text: 'status: "free"', label: 'CV templates are free for now' },
  { file: 'app/(tabs)/cv-builder.tsx', text: 'Powered by <strong>Hasahisawi</strong>', label: 'CV Hasahisawi footer branding' },
  { file: 'app/(tabs)/cv-builder.tsx', text: 'ImagePicker.launchImageLibraryAsync', label: 'CV optional photo picker' },
  { file: 'app/(tabs)/cv-builder.tsx', text: 'CV_COLORS', label: 'CV color customization' },
  { file: 'scripts/apply-latest-sections.mjs', text: 'apply-women-label-cleanup', label: 'women label cleanup patch runs' },
  { file: 'lib/join-requests.ts', text: 'submitJoinRequest', label: 'unified join request app helper' },
];

const repoRequiredTexts = [
  { file: 'artifacts/api-server/src/routes/join-requests.ts', text: 'CREATE TABLE IF NOT EXISTS join_requests', label: 'join request table' },
  { file: 'artifacts/api-server/src/routes/join-requests.ts', text: '/admin/attention-events', label: 'admin join attention endpoint' },
  { file: 'artifacts/api-server/src/routes/extra.ts', text: 'initJoinRequestsDb', label: 'join routes registered in extra router' },
  { file: 'artifacts/admin-dashboard/src/components/AdminJoinRequestAlerts.tsx', text: '/admin/attention-events', label: 'admin join alert component' },
  { file: 'artifacts/admin-dashboard/scripts/register-travel-agency-requests.mjs', text: 'apply-join-request-alerts', label: 'admin join alert patch chained' },
];

const forbiddenTexts = [
  { file: 'app/(tabs)/women.tsx', text: 'حواء', label: 'old Hawa label in women screen' },
  { file: 'app/(tabs)/index.tsx', text: 'حواء', label: 'old Hawa label in home screen' },
  { file: 'lib/translations.ts', text: 'حواء', label: 'old Hawa label in translations' },
  { file: 'app/(tabs)/index.tsx', text: 'id: "men"', label: 'standalone men section still linked' },
  { file: 'app/(tabs)/cv-builder.tsx', text: 'قالب مدفوع', label: 'paid CV wording should be disabled' },
  { file: 'app/(tabs)/cv-builder.tsx', text: 'ادفع', label: 'CV payment prompt should be disabled' },
];

const warnings = [];
const failures = [];
const passed = [];

function readApp(rel) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}
function readRepo(rel) {
  const abs = resolve(repoRoot, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

for (const rel of requiredFiles) {
  if (existsSync(resolve(root, rel))) passed.push(`exists:${rel}`);
  else failures.push(`missing required file: ${rel}`);
}
for (const rel of repoFiles) {
  if (existsSync(resolve(repoRoot, rel))) passed.push(`exists:${rel}`);
  else failures.push(`missing required repo file: ${rel}`);
}
for (const rule of requiredTexts) {
  const src = readApp(rule.file);
  if (!src) failures.push(`missing file for rule ${rule.label}: ${rule.file}`);
  else if (src.includes(rule.text)) passed.push(`required:${rule.label}`);
  else failures.push(`missing required text (${rule.label}) in ${rule.file}`);
}
for (const rule of repoRequiredTexts) {
  const src = readRepo(rule.file);
  if (!src) failures.push(`missing repo file for rule ${rule.label}: ${rule.file}`);
  else if (src.includes(rule.text)) passed.push(`required:${rule.label}`);
  else failures.push(`missing required repo text (${rule.label}) in ${rule.file}`);
}
for (const rule of forbiddenTexts) {
  const src = readApp(rule.file);
  if (!src) continue;
  if (src.includes(rule.text)) failures.push(`forbidden text (${rule.label}) found in ${rule.file}`);
  else passed.push(`forbidden-clean:${rule.label}`);
}

const index = readApp('app/(tabs)/index.tsx') || '';
const routes = [...index.matchAll(/route:\s*"\/\(tabs\)\/([^"]+)"/g)].map(m => m[1]);
for (const route of routes) {
  const file = resolve(root, `app/(tabs)/${route}.tsx`);
  const indexFile = resolve(root, `app/(tabs)/${route}/index.tsx`);
  if (existsSync(file) || existsSync(indexFile)) passed.push(`route-ok:${route}`);
  else warnings.push(`home route has no matching file yet: ${route}`);
}

const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), passed, warnings, failures };
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
