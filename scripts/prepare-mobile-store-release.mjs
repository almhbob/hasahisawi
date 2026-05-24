import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const appRoot = resolve(repoRoot, 'artifacts/hasahisawi');

const RELEASE_VERSION = process.env.RELEASE_VERSION || '6.3.3';
const RELEASE_CODE = Number(process.env.RELEASE_CODE || '233');
const API_HOST = process.env.STORE_API_HOST || 'hasahisawi.onrender.com';
const API_URL = `https://${API_HOST}`;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureScript(pkg, name, command) {
  pkg.scripts = pkg.scripts || {};
  pkg.scripts[name] = command;
}

const appJsonPath = resolve(appRoot, 'app.json');
const appJson = readJson(appJsonPath);
appJson.expo = appJson.expo || {};
appJson.expo.version = RELEASE_VERSION;
appJson.expo.ios = appJson.expo.ios || {};
appJson.expo.ios.buildNumber = String(RELEASE_CODE);
appJson.expo.ios.supportsTablet = true;
appJson.expo.android = appJson.expo.android || {};
appJson.expo.android.versionCode = RELEASE_CODE;
appJson.expo.android.edgeToEdgeEnabled = true;
writeJson(appJsonPath, appJson);

const easJsonPath = resolve(appRoot, 'eas.json');
const easJson = readJson(easJsonPath);
for (const profile of Object.values(easJson.build || {})) {
  profile.env = profile.env || {};
  profile.env.EXPO_PUBLIC_API_URL = API_URL;
  profile.env.EXPO_PUBLIC_DISABLE_OTP = 'true';
}
if (easJson.build?.preview) {
  easJson.build.preview.distribution = 'internal';
  easJson.build.preview.credentialsSource = 'remote';
  easJson.build.preview.android = { ...(easJson.build.preview.android || {}), buildType: 'apk' };
}
if (easJson.build?.production) {
  easJson.build.production.distribution = 'store';
  easJson.build.production.credentialsSource = 'remote';
  easJson.build.production.android = { ...(easJson.build.production.android || {}), buildType: 'app-bundle' };
}
if (easJson.build?.['production-ios']) {
  easJson.build['production-ios'].distribution = 'store';
  easJson.build['production-ios'].credentialsSource = 'remote';
  easJson.build['production-ios'].ios = { ...(easJson.build['production-ios'].ios || {}), buildConfiguration: 'Release' };
}
writeJson(easJsonPath, easJson);

const packageJsonPath = resolve(appRoot, 'package.json');
const packageJson = readJson(packageJsonPath);
packageJson.version = RELEASE_VERSION;
ensureScript(packageJson, 'release:check', 'pnpm -C ../.. run prelaunch:check && pnpm run typecheck');
ensureScript(packageJson, 'release:android:apk', 'pnpm run release:check && pnpm exec eas build --platform android --profile preview');
ensureScript(packageJson, 'release:android:aab', 'pnpm run release:check && pnpm exec eas build --platform android --profile production');
ensureScript(packageJson, 'release:ios', 'pnpm run release:check && pnpm exec eas build --platform ios --profile production-ios');
ensureScript(packageJson, 'release:all', 'pnpm run release:android:apk && pnpm run release:android:aab && pnpm run release:ios');
writeJson(packageJsonPath, packageJson);

console.log(`Prepared mobile store release ${RELEASE_VERSION} (${RELEASE_CODE})`);
console.log(`API URL: ${API_URL}`);
console.log('Next: cd artifacts/hasahisawi && pnpm run release:check');
