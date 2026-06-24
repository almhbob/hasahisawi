import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const socialPath = resolve(__dirname, '../app/(tabs)/social.tsx');
let source = readFileSync(socialPath, 'utf8');
const before = source;

const declaration = '  const [imageItems, setImageItems] = useState<MediaAsset[]>([]);';
const lines = source.split('\n');
let seen = false;
const cleaned = [];

for (const line of lines) {
  if (line === declaration) {
    if (seen) continue;
    seen = true;
  }
  cleaned.push(line);
}

source = cleaned.join('\n');

if (source !== before) {
  writeFileSync(socialPath, source);
  console.log('[fix-social-image-items-duplicates] duplicate imageItems declarations removed.');
} else {
  console.log('[fix-social-image-items-duplicates] social imageItems declarations already clean.');
}
