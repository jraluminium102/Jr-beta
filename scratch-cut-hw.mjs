import { readFileSync } from 'fs';
const src = readFileSync('src/lib/cutlist/products.ts','utf8');
// ดึงบล็อกอุปกรณ์ที่มี sku ในไฟล์ใบตัด แบบหยาบ ๆ เพื่อดูว่ามีรหัสอะไรบ้าง
const hits = [...src.matchAll(/name:\s*(["'`])([^"'`]+)\1[^\n]*?sku:\s*(["'`])([A-Za-z0-9]+)\3/g)];
const m = new Map();
for (const h of hits) m.set(h[2].trim(), h[4]);
const hits2 = [...src.matchAll(/sku:\s*(["'`])([A-Za-z0-9]+)\1[^\n]*?name:\s*(["'`])([^"'`]+)\3/g)];
for (const h of hits2) m.set(h[4].trim(), h[2]);
console.log('รหัสในไฟล์ใบตัด', m.size, 'ชื่อ');
for (const [n,s] of [...m].sort()) console.log(s, '|', n);
