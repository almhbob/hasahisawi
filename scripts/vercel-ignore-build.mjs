import { spawnSync } from 'node:child_process';

function changedFiles() {
  const candidates = [
    ['diff', '--name-only', 'HEAD^', 'HEAD'],
    ['diff', '--name-only', 'HEAD~1', 'HEAD'],
  ];

  for (const args of candidates) {
    const res = spawnSync('git', args, { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) {
      return res.stdout.split('\n').map((x) => x.trim()).filter(Boolean);
    }
  }

  return [];
}

const files = changedFiles();

const mobileOnlyPrefixes = [
  'artifacts/hasahisawi/',
  '.github/workflows/release-v6.yml',
  '.github/workflows/eas-android-release.yml',
  '.github/workflows/service-smoke-check.yml',
  'STORE_LISTING_AR.md',
  'PRIVACY_POLICY_AR.md',
  'FINAL_RELEASE_CHECKLIST.md',
  'privacy.html',
  'delete-account.html',
];

const likelyServerOrWebPrefixes = [
  'api/',
  'server/',
  'backend/',
  'admin/',
  'apps/',
  'web/',
  'artifacts/api',
  'artifacts/admin',
  'artifacts/hasahisawi-api',
  'artifacts/hasahisawi-admin',
  'package.json',
  'pnpm-lock.yaml',
  'vercel.json',
  'scripts/vercel-ignore-build.mjs',
];

const hasServerOrWebChange = files.some((file) => likelyServerOrWebPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)));
const hasOnlyMobileReleaseChanges = files.length > 0 && files.every((file) => mobileOnlyPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)));

console.log('[vercel-ignore-build] changed files:', files.join(', ') || '(none)');

if (hasServerOrWebChange) {
  console.log('[vercel-ignore-build] Server/web-related change detected. Continue Vercel build.');
  process.exit(1);
}

if (hasOnlyMobileReleaseChanges) {
  console.log('[vercel-ignore-build] Mobile-only release changes detected. Ignore Vercel build to avoid rate-limit failures.');
  process.exit(0);
}

console.log('[vercel-ignore-build] Unknown change scope. Continue Vercel build for safety.');
process.exit(1);
