import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';

async function readPDF(filePath) {
  const data = new Uint8Array(readFileSync(filePath));
  const loadingTask = pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // ดึงตำแหน่ง + text เพื่อเรียงบรรทัด
    const items = content.items;
    // group by Y (rounded)
    const rows = {};
    for (const item of items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!rows[y]) rows[y] = [];
      rows[y].push({ x: item.transform[4], str: item.str });
    }
    const sortedY = Object.keys(rows).map(Number).sort((a,b) => b-a);
    let pageText = '';
    for (const y of sortedY) {
      const line = rows[y].sort((a,b) => a.x-b.x).map(i=>i.str).join(' ');
      pageText += line + '\n';
    }
    fullText += `\n=== หน้า ${i}/${pdf.numPages} ===\n${pageText}`;
  }
  return fullText;
}

const BASE = 'C:/Users/Nut/Documents/Claude/Projects/วิศวกรสูตร (Formula Engineer JR)/07_ต้นฉบับทุน_อ้างอิง/ตัวอย่างใบเสนอราคา';
const files = [
  ['โอ๋', `${BASE}/QT2025010036_คุณโอ๋_250123_153901.pdf`],
  ['ยี', `${BASE}/QT2025060015_คุณยี_250609_130550.pdf`],
  ['ใบเฟริล', `${BASE}/QT2025100046_คุณใบเฟริล_251023_162530.pdf`],
];

for (const [name, f] of files) {
  console.log('\n\n==============================');
  console.log(`ใบ: ${name}  (${f.split('/').pop()})`);
  console.log('==============================');
  try {
    console.log(await readPDF(f));
  } catch(e) {
    console.error('ERROR:', e.message);
  }
}
