import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../app/travel-agencies.tsx', import.meta.url);
let src = readFileSync(file, 'utf8');
const before = src;

function dedupeConstArray(name) {
  const marker = `const ${name} = [`;
  let first = true;
  let index = 0;
  let output = '';

  while (index < src.length) {
    const start = src.indexOf(marker, index);
    if (start === -1) {
      output += src.slice(index);
      break;
    }

    output += src.slice(index, start);
    const end = src.indexOf('\n];', start);
    if (end === -1) {
      output += src.slice(start);
      break;
    }

    const blockEnd = end + 4;
    const block = src.slice(start, blockEnd);
    if (first) {
      output += block;
      first = false;
    }
    index = blockEnd;
    while (src[index] === '\n') index += 1;
    if (!first) output += '\n\n';
  }

  src = output;
}

dedupeConstArray('BOOKING_PRODUCTS');
dedupeConstArray('WORKSPACE_MODULES');

const singleLines = new Set([
  '  const [bookingProducts, setBookingProducts] = useState<string[]>(["تذاكر طيران"]);',
]);
const seen = new Set();
const cleaned = [];
for (const line of src.split('\n')) {
  if (singleLines.has(line)) {
    if (seen.has(line)) continue;
    seen.add(line);
  }
  cleaned.push(line);
}
src = cleaned.join('\n');

if (src !== before) {
  writeFileSync(file, src);
  console.log('[patch-travel-agency-workspace] duplicate travel workspace patches removed.');
} else {
  console.log('[patch-travel-agency-workspace] travel agencies workspace already clean.');
}
