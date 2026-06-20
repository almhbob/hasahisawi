import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const files = [
  'app/(tabs)/women.tsx',
  'app/(tabs)/index.tsx',
  'lib/translations.ts',
].map(p => resolve(root, p));

let changed = false;

for (const file of files) {
  if (!existsSync(file)) continue;
  let src = readFileSync(file, 'utf8');
  const before = src;
  src = src
    .replaceAll('حواء', 'المرأة')
    .replaceAll('ركن المرأة', 'قسم المرأة')
    .replaceAll('ركن للمرأة', 'قسم المرأة')
    .replaceAll('ركن خاص بالمرأة', 'قسم خاص بالمرأة');
  if (src !== before) {
    writeFileSync(file, src);
    changed = true;
  }
}

console.log(changed ? 'women labels cleaned' : 'women labels already clean');
