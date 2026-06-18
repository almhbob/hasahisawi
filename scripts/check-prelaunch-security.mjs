import { readFileSync, existsSync } from 'node:fs';

const checks = [];
const warnings = [];

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function fail(name, detail) {
  checks.push({ name, pass: false, detail });
}

function pass(name) {
  checks.push({ name, pass: true, detail: '' });
}

function warn(name, detail) {
  warnings.push({ name, detail });
}

const securityRouter = read('artifacts/api-server/src/routes/security-hardening.ts');
const routesIndex = read('artifacts/api-server/src/routes/index.ts');
const uploadRouter = read('artifacts/api-server/src/routes/upload.ts');
const healthRouter = read('artifacts/api-server/src/routes/health.ts');
const eas = read('artifacts/hasahisawi/eas.json');
const releaseWorkflow = read('.github/workflows/release-v6.yml');
const prepareRelease = read('scripts/prepare-mobile-store-release.mjs');
const legacyRoutes = read('artifacts/api-server/src/routes/hasahisawi.ts');

if (securityRouter.includes('ALLOW_ADMIN_REGISTRATION') && securityRouter.includes('REQUIRE_OTP') && securityRouter.includes('ALLOW_PUBLIC_UPLOAD')) {
  pass('security hardening middleware exists');
} else {
  fail('security hardening middleware exists', 'artifacts/api-server/src/routes/security-hardening.ts is missing expected guards');
}

if (routesIndex.includes('securityHardeningRouter') && routesIndex.indexOf('securityHardeningRouter') < routesIndex.indexOf('uploadRouter')) {
  pass('security middleware is registered before upload and legacy routes');
} else {
  fail('security middleware is registered before upload and legacy routes', 'routes/index.ts must register securityHardeningRouter before uploadRouter and hasahisawiRouter');
}

if (!uploadRouter.includes('application/octet-stream') && uploadRouter.includes('MAX_IMAGE_UPLOAD_MB') && uploadRouter.includes('MAX_VIDEO_UPLOAD_MB')) {
  pass('upload endpoint has strict MIME and size limits');
} else {
  fail('upload endpoint has strict MIME and size limits', 'upload.ts must reject octet-stream and enforce image/video limits');
}

if (healthRouter.includes('HEALTH_DETAILS_TOKEN') && !healthRouter.includes('details: status.body.checks')) {
  pass('public readiness endpoint does not expose full dependency details');
} else {
  fail('public readiness endpoint does not expose full dependency details', 'health.ts must hide detailed checks unless HEALTH_DETAILS_TOKEN is supplied');
}

if (prepareRelease.includes("EXPO_PUBLIC_DISABLE_OTP = process.env.EXPO_PUBLIC_DISABLE_OTP || 'false'")) {
  pass('release preparation keeps OTP enabled by default');
} else {
  fail('release preparation keeps OTP enabled by default', 'prepare-mobile-store-release.mjs must not force EXPO_PUBLIC_DISABLE_OTP=true');
}

if (eas.includes('EXPO_PUBLIC_DISABLE_OTP') && eas.includes('"true"')) {
  fail('EAS profiles do not disable OTP', 'artifacts/hasahisawi/eas.json still contains EXPO_PUBLIC_DISABLE_OTP=true');
} else {
  pass('EAS profiles do not disable OTP');
}

if (releaseWorkflow.includes('EXPO_PUBLIC_DISABLE_OTP=true') || releaseWorkflow.includes("EXPO_PUBLIC_DISABLE_OTP: 'true'")) {
  fail('GitHub release workflow does not disable OTP', '.github/workflows/release-v6.yml still writes EXPO_PUBLIC_DISABLE_OTP=true');
} else {
  pass('GitHub release workflow does not disable OTP');
}

if (releaseWorkflow.includes("Hasahisawi@2026#Secure")) {
  fail('release workflow has no hardcoded signing fallback', 'remove hardcoded keystore/password fallback from .github/workflows/release-v6.yml');
} else {
  pass('release workflow has no hardcoded signing fallback');
}

if (legacyRoutes.includes('DEFAULT_ADMIN_PIN ?? "4444"')) {
  warn('legacy default admin PIN remains in monolithic route', 'runtime hardening blocks PIN in production, but remove the legacy fallback in a later cleanup');
}

for (const c of checks) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ` - ${c.detail}` : ''}`);
}
for (const w of warnings) {
  console.warn(`WARN ${w.name} - ${w.detail}`);
}

const failed = checks.filter(c => !c.pass);
if (failed.length) {
  console.error(`\nPrelaunch security check failed: ${failed.length} issue(s).`);
  process.exit(1);
}
console.log('\nPrelaunch security check passed.');
