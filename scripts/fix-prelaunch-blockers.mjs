import { readFileSync, writeFileSync, existsSync } from 'node:fs';

function replaceInFile(path, transforms) {
  if (!existsSync(path)) return false;
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const [pattern, replacement] of transforms) {
    after = after.replace(pattern, replacement);
  }
  if (after !== before) {
    writeFileSync(path, after);
    console.log(`fixed ${path}`);
    return true;
  }
  console.log(`ok ${path}`);
  return false;
}

replaceInFile('artifacts/hasahisawi/eas.json', [
  [/"EXPO_PUBLIC_DISABLE_OTP"\s*:\s*"true"/g, '"EXPO_PUBLIC_DISABLE_OTP": "false"'],
  [/"credentialsSource"\s*:\s*"local"/g, '"credentialsSource": "remote"'],
]);

replaceInFile('.github/workflows/release-v6.yml', [
  [/EXPO_PUBLIC_DISABLE_OTP=true/g, 'EXPO_PUBLIC_DISABLE_OTP=false'],
  [/EXPO_PUBLIC_DISABLE_OTP:\s*'true'/g, "EXPO_PUBLIC_DISABLE_OTP: 'false'"],
  [/\$\{\{\s*secrets\.KEYSTORE_PASSWORD\s*\|\|\s*'[^']+'\s*\}\}/g, '${{ secrets.KEYSTORE_PASSWORD }}'],
  [/\$\{\{\s*secrets\.KEY_PASSWORD\s*\|\|\s*'[^']+'\s*\}\}/g, '${{ secrets.KEY_PASSWORD }}'],
  [/\$\{\{\s*secrets\.KEY_ALIAS\s*\|\|\s*'[^']+'\s*\}\}/g, '${{ secrets.KEY_ALIAS }}'],
  [/Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/g, 'Permissions-Policy: camera=(self), microphone=(), geolocation=(self)'],
  [/echo "⚠️  KEYSTORE_BASE64 not set — build will use hardcoded signing config"\n\s*fi/g, 'echo "ERROR: KEYSTORE_BASE64 is required for release signing"\n            exit 1\n          fi'],
]);

replaceInFile('package.json', [
  [/@tailwindcss\/oxide>@tailwindcss-oxide-darwin-x64/g, '@tailwindcss/oxide>@tailwindcss/oxide-darwin-x64'],
]);

console.log('prelaunch blocker fixer completed');
