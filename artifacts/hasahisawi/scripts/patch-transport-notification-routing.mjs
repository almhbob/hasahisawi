import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, '../app/_layout.tsx');
let src = readFileSync(file, 'utf8');

if (!src.includes('transport_admin_request')) {
  const anchor = '        // ── الإتحاد ──';
  src = src.replace(anchor, `        // ── مشوارك علينا: السائقون والإدارة والمشرفون ──
        if (type === "transport_admin_request" || screen === "admin-transport") {
          router.push("/admin-transport" as any);
          return;
        }
        if (type === "transport_request" || screen === "transport") {
          router.push("/transport" as any);
          return;
        }

${anchor}`);
  writeFileSync(file, src);
  console.log('Transport notification routing applied');
} else {
  console.log('Transport notification routing already present');
}
