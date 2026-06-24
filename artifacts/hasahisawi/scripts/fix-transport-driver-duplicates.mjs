import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const transportPath = resolve(__dirname, '../app/(tabs)/transport.tsx');
let source = readFileSync(transportPath, 'utf8');
const before = source;

const declarations = new Set([
  '  const [driverModeId, setDriverModeId] = useState<number | null>(null);',
  '  const [incomingTrips, setIncomingTrips] = useState<Trip[]>([]);',
  '  const [incomingLoading, setIncomingLoading] = useState(false);',
  '  const [acceptingTripId, setAcceptingTripId] = useState<number | null>(null);',
]);

const seen = new Set();
const cleaned = [];

for (const line of source.split('\n')) {
  if (declarations.has(line)) {
    if (seen.has(line)) continue;
    seen.add(line);
  }
  cleaned.push(line);
}

source = cleaned.join('\n');

if (source !== before) {
  writeFileSync(transportPath, source);
  console.log('[fix-transport-driver-duplicates] duplicate transport driver declarations removed.');
} else {
  console.log('[fix-transport-driver-duplicates] transport driver declarations already clean.');
}
