import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(file, 'utf8'));
pkg.dependencies ||= {};
pkg.dependencies['react-native-webview'] ||= '^13.16.0';
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log('[ensure-android-release-deps] WebView runtime dependency ready');
