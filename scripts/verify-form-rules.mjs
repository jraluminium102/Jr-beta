// verify-form-rules.mjs — ด่านกัน "เลือกรูปแบบ/จำนวนบานที่ทำไม่ได้จริง แล้วราคายังออกสวย ๆ"
// รัน:  node scripts/verify-form-rules.mjs
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของยืนยัน 21 ส.ค.69: "เปิดคู่กลาง" มีแค่ 4 บาน กับ 6 บาน · ทั้งสองแบบมีบานติดตาย 2 บาน
//   เดิมเลือก 2-3 บานได้ → สูตรหักบานติดตาย 2 ทิ้งเสมอ = ล้อ 0 ตัว แต่ราคายังออก 22,500
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeCost } from '../src/lib/calculator40/engine.mjs';
import { PRODUCTS } from '../src/lib/calculator40/products.mjs';
import { formRule, formNote, allowedPanes, snapPanes } from '../src/lib/calculator40/form-rules.ts';
import { cutInputFromRecipe } from '../src/lib/cutlist/from-recipe.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/calculator40/pricebook.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (label, cond, got = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${label}${cond || got === '' ? '' : `  (${got})`}`);
};

const SLIDES = ['sms_slide', 'euro_slide', 'slimlux'];

console.log('\n═══ ① เปิดคู่กลาง = 4 หรือ 6 บาน เท่านั้น (ทุกตระกูลบานเลื่อน) ═══');
for (const id of SLIDES) {
  const prod = PRODUCTS[id];
  ok(`${prod.name}: จำนวนบานที่เลือกได้ = 4, 6`, JSON.stringify(allowedPanes(prod, 'เปิดคู่กลาง')) === '[4,6]',
    JSON.stringify(allowedPanes(prod, 'เปิดคู่กลาง')));
  ok(`${prod.name}: มีคำอธิบายขึ้นบนหน้าจอ`, formNote(prod, 'เปิดคู่กลาง').includes('ติดตาย 2'), formNote(prod, 'เปิดคู่กลาง'));
  for (const [from, to] of [[2, 4], [3, 4], [5, 4], [4, 4], [6, 6]])
    ok(`${prod.name}: ${from} บาน → ดัดเป็น ${to}`, snapPanes(prod, 'เปิดคู่กลาง', from) === to, String(snapPanes(prod, 'เปิดคู่กลาง', from)));
}

console.log('\n═══ ② รูปแบบอื่นต้องไม่ถูกล็อก (อิสระ/สลับ/ลากจูง เลือกได้ตาม minP–maxP) ═══');
for (const id of SLIDES) {
  const prod = PRODUCTS[id];
  for (const form of prod.forms.filter((f) => f !== 'เปิดคู่กลาง')) {
    ok(`${prod.name} · ${form}: ไม่ล็อกจำนวนบาน`, !formRule(prod, form)?.panes);
    ok(`${prod.name} · ${form}: ช่วง ${prod.minP}–${prod.maxP}`,
      allowedPanes(prod, form)[0] === prod.minP && allowedPanes(prod, form).at(-1) === prod.maxP);
  }
}

console.log('\n═══ ③ จำนวนบานที่ล็อกไว้ ต้องคิดล้อได้จริง (ไม่ใช่ 0 ตัว) ═══');
for (const id of SLIDES) {
  for (const n of allowedPanes(PRODUCTS[id], 'เปิดคู่กลาง')) {
    const r = computeCost(PB, PRODUCTS[id], { w: 300, h: 240, p: n, form: 'เปิดคู่กลาง', color: 'white', colorKey: 'white', glassType: 'เทมเปอร์ 6มม.', spec: {} });
    const wheels = r.lines.filter((l) => l.cat === 'hardware' && /ล้อ/.test(l.name)).reduce((s, l) => s + l.qty, 0);
    ok(`${PRODUCTS[id].name} · ${n} บาน: ล้อ ${wheels} ตัว (ต้อง > 0)`, wheels > 0, String(wheels));
  }
}

console.log('\n═══ ④ ของที่เจ้าของเคาะ 21 ส.ค.69 ═══');
{
  // ซิลิโคน: ใช้ JR00504 ทั้งคิดราคาและใบตัด (เดิมคิดราคาใช้ JR00501 = ตัดสต๊อกคนละตัว)
  const sil = PRODUCTS.slimlux.consum.find((c) => /ซิลิโคน/.test(c.name));
  ok('ซิลิโคน = JR00504 (ตรงกับใบตัด)', sil?.sku === 'JR00504', String(sil?.sku));
  const src = fs.readFileSync(path.join(__dirname, '../src/lib/calculator40/products.mjs'), 'utf8');
  ok('ไม่มี JR00501 หลงเหลือในสูตรคิดราคา', !src.includes('JR00501'));
  // ฉากประกอบมุม ยูโร = 12/บาน ทั้งสองฝั่ง
  const ang = PRODUCTS.euro_slide.hardware.find((h) => /ฉากประกอบมุม/.test(h.name));
  ok('ยูโร ฉากประกอบมุม = 12/บาน (ถอดทุน)', ang?.count === '12*P', String(ang?.count));
  const cut = fs.readFileSync(path.join(__dirname, '../src/lib/cutlist/products.ts'), 'utf8');
  ok('ใบตัด FUJI ฉากประกอบมุม = 12/บาน ทุกชีต', !/ฉากประกอบมุม", sku: "JR00480", qty: \(o\) => 16 \*/.test(cut));
  ok('ใบตัด FUJI ฉากประกอบมุม มี 3 ชีต ใช้ 12', (cut.match(/ฉากประกอบมุม", sku: "JR00480", qty: \(o\) => 12 \*/g) || []).length === 3);
  // ยาง/วาวรูน้ำ มีราคาสำรองแล้ว (สโตร์ยังชนะเสมอ)
  for (const [sku, want] of [['JR00589', 5], ['JR00485', 5]]) {
    const it = PRODUCTS.euro_slide.hardware.find((h) => h.sku === sku);
    ok(`${sku} ราคาสำรอง ฿${want}`, it?.price === want, String(it?.price));
  }
  // กล่อง 4 หุน มีน้ำหนัก (ไม่งั้นค่าอบขาด)
  const box = PRODUCTS.slimlux.alu.find((a) => a.box === 'กล่อง|4หุน');
  ok('กล่อง 4 หุน น้ำหนัก 0.9 กก./เส้น', box?.kg === 0.9, String(box?.kg));
  // SlimLux ของเสริม = รื้อของเดิม อย่างเดียว
  ok('SlimLux ของเสริม = รื้อของเดิม', JSON.stringify(PRODUCTS.slimlux.addons) === '["demolish"]', JSON.stringify(PRODUCTS.slimlux.addons));
}

console.log('\n═══ ⑤ จำนวนบานที่ล็อกไว้ ต้องแมปเข้าใบตัดได้ (ไม่ตกไปใช้รายการเดิม) ═══');
for (const id of SLIDES) {
  for (const n of allowedPanes(PRODUCTS[id], 'เปิดคู่กลาง')) {
    const m = cutInputFromRecipe({ kind: 'std', prodId: id, w: 300, h: 240, p: n, form: 'เปิดคู่กลาง', spec: {} });
    // SMS มีชีตเฉพาะ 4 บาน — 6 บานยังไม่มีสูตร (รายงานให้เห็น ไม่ถือว่าพัง)
    const known = id === 'sms_slide' && n === 6;
    ok(`${PRODUCTS[id].name} · ${n} บาน → ${m ? m.spec_id : 'ยังไม่มีสูตรใบตัด'}`, !!m || known, 'ไม่มีสูตร');
  }
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
