import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const pages = [
  'screenshots/booklet/01-cover.jpg',
  'screenshots/booklet/02-women.jpg',
  'screenshots/booklet/03-transport.jpg',
  'screenshots/booklet/04-occasions.jpg',
  'screenshots/booklet/05-merchants.jpg',
  'screenshots/booklet/06-phones.jpg',
  'screenshots/booklet/07-libraries.jpg',
  'screenshots/booklet/08-backcover.jpg',
];

const pdfDoc = await PDFDocument.create();
pdfDoc.setTitle('حصاحيصاوي — كتيب التعريف بالخدمات');
pdfDoc.setAuthor('Hasahisawi');
pdfDoc.setSubject('البوابة الذكية لمدينة الحصاحيصا');
pdfDoc.setCreationDate(new Date());

for (const imgPath of pages) {
  const jpgBytes = fs.readFileSync(imgPath);
  const jpgImage = await pdfDoc.embedJpg(jpgBytes);
  const { width, height } = jpgImage.scale(1);
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(jpgImage, { x: 0, y: 0, width, height });
}

const pdfBytes = await pdfDoc.save();
fs.writeFileSync('screenshots/booklet/hasahisawi-booklet.pdf', pdfBytes);
console.log('PDF created: screenshots/booklet/hasahisawi-booklet.pdf');
