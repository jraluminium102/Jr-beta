// verify-r40.mjs — ด่านกันราคาเพี้ยน R4.0: เทียบผล engine กับค่าจริงในชีต xlsx (golden-snapshot)
// รัน:  node scripts/verify-r40.mjs  (ต้องผ่าน 71/71 ก่อน deploy ทุกครั้งที่แตะ calculator40)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeCost } from '../src/lib/calculator40/engine.mjs';
import { PRODUCTS } from '../src/lib/calculator40/products.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/calculator40/pricebook.json'), 'utf8'));

let pass = 0, fail = 0;
function check(label, got, want, tol = 1) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`  ${ok ? '✅' : '❌'} ${label}: got=${got}  want=${want}${ok ? '' : '  <-- ไม่ตรง'}`);
  ok ? pass++ : fail++;
  return ok;
}

// ── ANCHORS: ค่าจริงจากชีต "คิดทุน ___" (subagent self-verify diff≈0) ─────────
const ANCHORS = [
  { id: 'sms_slide', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 16733.4, mfg: 34800, inst: 36100 },
  { id: 'euro_slide', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 28434.4, mfg: 58500, inst: 60000 },
  { id: 'slimlux', in: { w: 200, h: 200, p: 2, form: 'อิสระ' }, cost: 13635, mfg: 28900, inst: 30500 },
  { id: 'open_door', in: { w: 150, h: 200, p: 1, form: 'มีธรณี' }, cost: 10472, mfg: 22100, inst: 23100 },
  { id: 'awning', in: { w: 40, h: 40, p: 1, form: 'อิสระ' }, cost: 5619.84, mfg: 12400, inst: 13000 },
  { id: 'folding', in: { w: 180, h: 280, p: 2, form: '2บาน: รวบเปิดซ้าย (2-0)' }, cost: 17373.36, mfg: 36600, inst: 37400 },   // calibrate HW ตรง matrix มด (180×280 2บาน = 37,400 เป๊ะ)
  { id: 'fixed', in: { w: 150, h: 200, p: 1, form: 'กระจกล้วน' }, cost: 4302, mfg: 9100, inst: 9400 },
  { id: 'topslide', in: { w: 360, h: 240, p: 2, form: 'เลื่อนซ้อน' }, cost: 21034.96, mfg: 43400, inst: 45100 },
  // ระแนง/รั้ว: ชีตขายแบบตาราง R3.9 (ไม่ใช่ทุน×2) → ตรวจเฉพาะ "ทุนวัสดุ"
  // louver = BOM cost (ชีต "คิดทุน ระแนง") · default 1.6×4 โชว์1.6 ช่องห่าง5 ไม่โครง ขาว/ดำ → pitch9.06 · ใบ27 · เส้นใบ9 × กล่อง1220 = ทุนใบ 10,980
  { id: 'louver', in: { w: 200, h: 240, p: 1, form: 'นอน' }, cost: 10980, costOnly: true },
  { id: 'gate', in: { w: 350, h: 180, p: 1, form: 'นอน' }, cost: 49448, costOnly: true },
  // หลังคา: ชีตปัด ceil100 ก้อนเดียว → engine แยก ผลิต/ติดตั้ง อาจต่าง +100 (ยอมรับได้)
  { id: 'roof', in: { w: 400, h: 200, p: 1, form: 'หลังคาเพิง' }, cost: 38286, instApprox: 79200, tol: 100 },

  // ── รุ่นใหม่ (Wave 1+2) — subagent self-verify diff≈0 ──
  { id: 'eseries', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 19026.4, mfg: 39400, inst: 40700 },
  { id: 'velora', in: { w: 220, h: 200, p: 1, form: 'เดี่ยว', color: 'sahara', glassType: 'เทมเปอร์ใส 6มม.' }, cost: 7111.6, mfg: 16300, inst: 17400 },
  { id: 'pcdoor', in: { w: 150, h: 200, p: 2, form: 'แบ่ง 2' }, cost: 11403, mfg: 24400, inst: 25600 },
  { id: 'banyok', in: { w: 100, h: 50, p: 1, form: 'เดี่ยว' }, cost: 7962, mfg: 16700, inst: 17500 },
  { id: 'fold_euro', in: { w: 180, h: 280, p: 2, form: '2บาน: 2-0 พับข้างเดียว' }, cost: 17413.46, mfg: 36300, inst: 37100 },
  { id: 'banklet', in: { w: 300, h: 150, p: 2, form: 'นอน' }, cost: 9842.8, mfg: 21500, inst: 23300 },
  { id: 'curve_fixed', in: { w: 100, h: 50, p: 1, form: 'กระจกล้วน' }, cost: 4200, mfg: 9700, inst: 10300 },
  // เปิดดัดโค้ง: ชีตตัวอย่างใช้กำไร 30% (บานสั่งร้านอื่น) → ตรวจที่กำไร 30 ให้ตรงชีต
  { id: 'curve_open', in: { w: 90, h: 240, p: 1, form: 'ดัดโค้ง', glassType: 'เทมเปอร์ 6มม.', profitPct: 30 }, cost: 17050.48, inst: 23600 },
  // ระแนงสลับ/หมุน: ชีตขาย R3.9/รวมค่าแรง → ตรวจเฉพาะทุนวัสดุ
  { id: 'louver_slip', in: { w: 400, h: 200, p: 1, form: 'นอน' }, cost: 11685, costOnly: true },
  { id: 'louver_rotate', in: { w: 200, h: 240, p: 1, form: 'นอน' }, cost: 36708, costOnly: true },
  // หลังคาจั่ว: ตรวจทุนวัสดุ (ค่าแรงเรตล้วนตามชีตคิดทุน — เช็คซ้ำกับตารางค่าแรง)
  { id: 'roof_gable', in: { w: 400, h: 200, p: 1, form: 'หลังคาจั่ว' }, cost: 50936, costOnly: true },
  // หลังคาเลื่อน: ค่าแรงฝังในวัสดุ → ทุน+ขายตรงเป๊ะ · มอเตอร์ย้ายเป็น addon (ส่ง slide_motor 80กก. = ตรงชีต) · ขายมอเตอร์ ×2.5/6,000
  { id: 'roof_slide', in: { w: 400, h: 200, p: 2, form: 'เลื่อนยื่น', addons: { slide_motor: { kw: '80' } } }, cost: 88836, instApprox: 180000, tol: 100 },
  // มุ้ง: ทุนวัสดุตรง (ค่าแรงต่างชีตที่คิดต่อใบ)
  { id: 'screen', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 3689, costOnly: true },
];

console.log('═══ ด่านตรวจราคา R4.0 (engine ↔ xlsx) — ' + ANCHORS.length + ' รุ่น ═══\n');
for (const a of ANCHORS) {
  const prod = PRODUCTS[a.id];
  if (!prod) { console.log('❌ ไม่พบรุ่น', a.id); fail++; continue; }
  const r = computeCost(PB, prod, a.in);
  console.log(`▶ ${prod.name} (${a.in.w}×${a.in.h} ${a.in.p}บาน):`);
  check('ทุนรวม', r.cost.total, a.cost, 1);
  if (!a.costOnly) {
    if (a.mfg) check('ขายผลิตอย่างเดียว', r.sell.mfgOnly, a.mfg, a.tol || 1);
    if (a.inst) check('ขายผลิต+ติดตั้ง', r.sell.withInstall, a.inst, a.tol || 1);
    if (a.instApprox) check('ขาย+ติดตั้ง (≈ชีต ±100)', r.sell.withInstall, a.instApprox, a.tol || 100);
  } else {
    console.log(`     (ขายใช้ตาราง R3.9 — ข้าม · ทุนวัสดุตรวจแล้ว)`);
  }
}

// ── เทสพฤติกรรมกลาง ─────────────────────────────────────────────────────────
console.log('\n═══ เทสพฤติกรรม cost engine ═══');
console.log('▶ แก้อลู SMS 187→200 (กระจก/อุปกรณ์ต้องนิ่ง):');
{
  const base = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 3, form: 'อิสระ' });
  const PB2 = JSON.parse(JSON.stringify(PB)); PB2.ALU.SMS = 200;
  const r = computeCost(PB2, PRODUCTS.sms_slide, { w: 600, h: 300, p: 3, form: 'อิสระ' });
  check('ทุนอลู = 10135×200/187', r.cost.alu, 10135 * 200 / 187, 1);
  check('กระจกนิ่ง', r.cost.glass, base.cost.glass, 0.01);
  check('อุปกรณ์นิ่ง', r.cost.hardware + r.cost.consum, base.cost.hardware + base.cost.consum, 0.01);
  check('ราคาแพงขึ้น (36100→' + r.sell.withInstall + ')', r.sell.withInstall > base.sell.withInstall ? 1 : 0, 1, 0);
}
console.log('▶ จำนวนบานมากขึ้นแพงขึ้น (SMS 600×300):');
{
  const p2 = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 2, form: 'อิสระ' });
  const p4 = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 4, form: 'อิสระ' });
  check('4บาน(' + p4.cost.total + ') > 2บาน(' + p2.cost.total + ')', p4.cost.total > p2.cost.total ? 1 : 0, 1, 0);
}
console.log('▶ กำไร 100% = ceil100(ทุน×2):');
{
  const r = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 3, form: 'อิสระ', profitPct: 100 });
  check('ขายก่อนค่าแรง', r.sell.beforeLabor, Math.ceil(r.cost.total * 2 / 100) * 100, 0);
}

// ── ระแนง/ประตูรั้ว: ระยะ@ (ช่องห่าง) + กล่อง + โครง (ตรงชีต Excel) ─────────────
//   ล็อกว่า: UI-seeded default = golden เดิม · ห่างมาก→ใบน้อยลง→ถูกลง · ถี่ขึ้น→แพงขึ้น
console.log('▶ ระแนงบังตา — ระยะ@/กล่อง/โครง (200×240 นอน):');
{
  const L = (spec) => computeCost(PB, PRODUCTS.louver, { w: 200, h: 240, p: 1, form: 'นอน', spec }).cost.total;
  check('UI default spec = golden 10980', L({ rnBox: '1.6x4', rnFace: '4.06', rnGap: '5', rnFrame: 'ไม่รวมโครง' }), 10980, 1);
  check('ระยะ@15 (ห่างขึ้น→ใบน้อยลง)', L({ rnGap: '15' }), 6100, 1);
  check('ระยะ@2 (ถี่ขึ้น→ใบเยอะขึ้น)', L({ rnGap: '2' }), 17080, 1);
  check('กล่อง 1×1 (ถูกกว่า 1.6×4)', L({ rnBox: '1x1' }), 2790, 1);
  check('รวมโครง = +โครงดาม 485', L({ rnFrame: 'รวมโครง' }), 11465, 1);
}
console.log('▶ ประตูรั้ว — ระยะ@ ระแนง (350×180 นอน):');
{
  const G = (spec) => computeCost(PB, PRODUCTS.gate, { w: 350, h: 180, p: 1, form: 'นอน', spec }).cost.total;
  check('UI default spec = golden 49448', G({ rnFace: '4.06', rnGap: '5', drive: 'มอเตอร์อัตโนมัติ', gaterail: 'รางใหม่' }), 49448, 1);
  check('ระยะ@15 (ห่างขึ้น→ใบน้อยลง→ถูกลง)', G({ rnGap: '15' }), 37248, 1);
  check('ระยะ@2 (ถี่ขึ้น→ใบเยอะ→แพงขึ้น)', G({ rnGap: '2' }), 61648, 1);
}
// ระแนงสลับ (คละกล่อง 2 แบบ) — เลือกกล่อง A/B + ด้านโชว์ + จำนวน/ชุด + ระยะห่างเป้า + โครง (ตรงชีต "คิดทุน ระแนงสลับ")
console.log('▶ ระแนงสลับ — คละกล่อง/ระยะ/โครง (400×200 นอน):');
{
  const P = PRODUCTS.louver_slip;
  const def = {}; (P.specOpts || []).forEach((o) => { def[o.key] = o.def; });
  const S = (spec) => computeCost(PB, P, { w: 400, h: 200, p: 1, form: 'นอน', spec: { ...def, ...spec } }).cost.total;
  check('UI default spec = golden 11685', S({}), 11685, 1);
  check('ระยะห่างเป้า 6 (ห่างขึ้น→ท่อนน้อยลง→ถูกลง)', S({ rnGap: '6' }), 8275, 1);
  check('รวมโครง = +โครงดาม', S({ rnFrame: 'รวมโครง' }), 12655, 1);
  check('กล่อง A→1×1 (ถูกลง)', S({ boxA: '1x1', showA: '2.54' }), 9580, 1);
  check('คละ 4ต่อ4', S({ cntA: '4', cntB: '4' }), 11935, 1);
}

// ── ② ตาข่ายกันพังทุกรุ่น: ทุก product ต้องคิดออกราคาสมเหตุผล (ไม่ crash/NaN/ติดลบ/ขาย<ทุน) ──
// เสริม anchor (แม่นเฉพาะ 24 รุ่น) → sweep นี้คลุม "ทุกรุ่น" กันราคาพังเงียบ (รุ่นที่ไม่มี anchor)
console.log('\n═══ ② ตาข่ายทุกรุ่น: sanity sweep (คิดออกราคาได้ · ไม่ติดลบ · ขาย≥ทุน) ═══');
let sweepPass = 0, sweepFail = 0;
for (const [id, prod] of Object.entries(PRODUCTS)) {
  if (!prod || typeof prod !== 'object' || !prod.name) continue;
  const form = prod.defForm || (prod.forms && prod.forms[0]);
  let r;
  try { r = computeCost(PB, prod, { w: 200, h: 200, p: 1, form }); }
  catch (e) { console.log(`  ❌ ${id} (${prod.name}) CRASH: ${String(e.message).slice(0, 60)}`); sweepFail++; continue; }
  const c = r && r.cost ? r.cost.total : NaN, s = r && r.sell ? r.sell.withInstall : NaN;
  if (!Number.isFinite(c) || !Number.isFinite(s)) { console.log(`  ❌ ${id}: NaN (cost=${c} sell=${s})`); sweepFail++; continue; }
  if (c < 0 || s < 0) { console.log(`  ❌ ${id}: ติดลบ (cost=${c} sell=${s})`); sweepFail++; continue; }
  if (c > 0 && s < c - 1) { console.log(`  ❌ ${id}: ขาย<ทุน (cost=${c} sell=${s})`); sweepFail++; continue; }
  sweepPass++;
}
console.log(`  ✅ ${sweepPass} รุ่นคิดออกราคาได้สมเหตุผล · ❌ ${sweepFail} พัง`);

console.log(`\n═══ สรุป: ✅ ${pass} anchor ผ่าน · ❌ ${fail} ไม่ผ่าน · ② sweep ${sweepPass} รุ่นดี/${sweepFail} พัง ═══`);
process.exit((fail + sweepFail) > 0 ? 1 : 0);
