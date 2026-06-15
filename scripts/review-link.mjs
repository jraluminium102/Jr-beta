// review-link.mjs — "ลิงก์ตรวจงาน": copy any HTML deliverable to public/review/ → print localhost link
// ใช้: node scripts/review-link.mjs "<path ไฟล์ html>"  [ชื่อลิงก์(optional)]
// ผลลัพธ์: คัดลอกไป public/review/<ชื่อ>.html แล้วพิมพ์ URL ให้กดเปิดตรวจในเครื่อง (ผ่าน dev server :5599)
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const src = process.argv[2];
if (!src) { console.error('ใส่ path ไฟล์ html: node scripts/review-link.mjs "<file>"'); process.exit(1); }
const srcAbs = resolve(src);
if (!existsSync(srcAbs)) { console.error('ไม่พบไฟล์: ' + srcAbs); process.exit(1); }

// ชื่อลิงก์: arg2 ถ้ามี ไม่งั้นใช้ชื่อไฟล์ (ตัด .html, แทนที่ช่องว่าง/อักขระแปลกด้วย -)
let name = process.argv[3] || basename(srcAbs).replace(/\.html?$/i, '');
name = name.replace(/[^\w฀-๿.-]+/g, '-').replace(/^-+|-+$/g, '') || 'review';
const fname = name.toLowerCase().endsWith('.html') ? name : name + '.html';

const reviewDir = join(process.cwd(), 'public', 'review');
mkdirSync(reviewDir, { recursive: true });
const dest = join(reviewDir, fname);
copyFileSync(srcAbs, dest);

const port = process.env.JR_PREVIEW_PORT || '5599';
const url = 'http://localhost:' + port + '/review/' + encodeURIComponent(fname);
console.log('REVIEW_LINK_OK');
console.log('ไฟล์: ' + srcAbs);
console.log('วางที่: public/review/' + fname);
console.log('ลิงก์ตรวจงาน → ' + url);
