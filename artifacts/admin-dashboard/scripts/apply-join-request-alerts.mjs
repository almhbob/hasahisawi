import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), 'src/components/Layout.tsx');
let src = readFileSync(file, 'utf8');
let changed = false;
if (!src.includes('AdminJoinRequestAlerts')) {
  src = src.replace('import AdminOrderAlerts from "@/components/AdminOrderAlerts";\n', 'import AdminOrderAlerts from "@/components/AdminOrderAlerts";\nimport AdminJoinRequestAlerts from "@/components/AdminJoinRequestAlerts";\n');
  src = src.replace('<AdminOrderAlerts />', '<AdminOrderAlerts />\n      <AdminJoinRequestAlerts />');
  changed = true;
}
if (changed) writeFileSync(file, src);
console.log(changed ? 'join request alerts applied' : 'join request alerts already applied');
