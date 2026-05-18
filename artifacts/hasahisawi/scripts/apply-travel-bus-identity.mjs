import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'app/(tabs)/travel.tsx');
let src = fs.readFileSync(file, 'utf8');

src = src.replaceAll('name="airplane"', 'name="bus"');
src = src.replaceAll('name="airplane-takeoff"', 'name="bus-clock"');
src = src.replaceAll('icon:"airplane-outline"', 'icon:"bus-outline"');
src = src.replaceAll('✈️ تذكرة سفر', '🚌 تذكرة سفر');
src = src.replaceAll('✈️ تذكير — رحلتك بعد ساعتين!', '🚌 تذكير — رحلتك بعد ساعتين!');
src = src.replace('تذاكر السفر</Text>', 'السفريات</Text>');
src = src.replace('حجز آمن بين مدن السودان</Text>', 'حجوزات موثوقة عبر شركات ووكالات السفر</Text>');

fs.writeFileSync(file, src);
console.log('travel bus identity patch applied');
