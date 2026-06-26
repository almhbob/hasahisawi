import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../app/(tabs)/travel.tsx', import.meta.url);
let s = readFileSync(file, 'utf8');
const pkg = ['react','native','qrcode','svg'].join('-');
s = s.replace('// @ts-ignore\nimport QRCode from "' + pkg + '";\n', '');
s = s.replace(/<QRCode[\s\S]*?\/>/m, '<QRVisual code={booking.verify_token || booking.ticket_number} />');
writeFileSync(file, s);
console.log('travel qr ready');
