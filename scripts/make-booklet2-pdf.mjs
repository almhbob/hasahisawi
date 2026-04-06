import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

const pages = [
  'screenshots/booklet/v2-01-cover.jpg',
  'screenshots/booklet/v2-02-women.jpg',
  'screenshots/booklet/v2-03-transport.jpg',
  'screenshots/booklet/v2-04-occasions.jpg',
  'screenshots/booklet/v2-05-merchants.jpg',
  'screenshots/booklet/v2-06-phones.jpg',
  'screenshots/booklet/v2-07-libraries.jpg',
  'screenshots/booklet/v2-08-backcover.jpg',
];

const pdfDoc = await PDFDocument.create();
pdfDoc.setTitle('حصاحيصاوي — كتيب الشرح المفصّل للخدمات');
pdfDoc.setAuthor('Hasahisawi');
pdfDoc.setSubject('البوابة الذكية لمدينة الحصاحيصا — شرح تفصيلي لكل الخدمات');
pdfDoc.setCreationDate(new Date());

for (const imgPath of pages) {
  const jpgBytes = fs.readFileSync(imgPath);
  const jpgImage = await pdfDoc.embedJpg(jpgBytes);
  const { width, height } = jpgImage.scale(1);
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(jpgImage, { x:0, y:0, width, height });
}

const pdfBytes = await pdfDoc.save();
fs.writeFileSync('screenshots/booklet/hasahisawi-booklet-detailed.pdf', pdfBytes);
console.log('PDF ready:', 'screenshots/booklet/hasahisawi-booklet-detailed.pdf');
