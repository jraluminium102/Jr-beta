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

// ── ตารางค่าแรงต้นทาง: ชีต "ค่าแรง" ของ ถอดทุน_รวมทั้งหมด.xlsx (ส.ค.69) ──────
//   ชีตกรอกเป็น "ชั่วโมง × ค่าแรง/ชม. × จำนวนคน" แล้วให้คอลัมน์ B–E เป็นบาท:
//     B(ผลิตฐาน)=G×I×L · C(ผลิต/ตร.ม.)=J×I×L · D(ติดตั้งฐาน)=H×I×M · E(ติดตั้ง/ตร.ม.)=K×I×M
//   ⚠ ห้ามแก้ตัวเลขตรงนี้ด้วยมือ — ต้องมาจากไฟล์เท่านั้น (นี่คือด่านกัน pricebook หลุดจากไฟล์)
//   hp=ชม.ฐานผลิต jp=ชม.เพิ่มผลิต/ตร.ม. np=คนผลิต · hi/ki/ni=ฝั่งติดตั้ง · rate=ค่าแรง/ชม.
//   baht = ชีตกรอกเป็นบาทตรง ๆ [ผลิตฐาน, ผลิต/ตร.ม., ติดตั้งฐาน, ติดตั้ง/ตร.ม.]
const LABOR_SRC = {
  'บานเลื่อน SMS': { hp: 5, jp: 0.3333, np: 1, hi: 6.5, ki: 0.3333, ni: 1, rate: 87.5 },
  'บานเลื่อน ยูโร': { hp: 7, jp: 0.5, np: 1, hi: 8, ki: 0.573, ni: 1, rate: 87.5 },
  'SlimLux': { hp: 11.9, jp: 0.667, np: 1, hi: 8, ki: 0.667, ni: 1, rate: 87.5 },
  'Velora': { hp: 4.24, jp: 0.3333, np: 1, hi: 6, ki: 0.3333, ni: 1, rate: 87.5 },
  'บานเปิด (ยูโร)': { hp: 6, jp: 0.281, np: 1, hi: 7.84, ki: 0.542, ni: 1, rate: 87.5 },
  'บานกระทุ้ง (ยูโร)': { hp: 6, jp: 0.667, np: 1, hi: 4.25, ki: 0.667, ni: 1, rate: 87.5 },
  'บานเฟี้ยม (sms)': { hp: 12, jp: 1, np: 1, hi: 14, ki: 1, ni: 1, rate: 87.5 },
  'บานยก (เซมิ)': { hp: 16, jp: 0.3333, np: 1, hi: 7, ki: 0.3333, ni: 1, rate: 87.5 },
  'หลังคา': { baht: [0, 597, 0, 852] },
  'บานติดตาย': { hp: 4, jp: 0.25, np: 1, hi: 4, ki: 0.25, ni: 2, rate: 87.5 },
  'ตายดัดโค้ง': { hp: 8, jp: 0.25, np: 1, hi: 8, ki: 0.25, ni: 2, rate: 87.5 },
  'PC Door': { hp: 14, jp: 0.3333, np: 1, hi: 8, ki: 0.25, ni: 3, rate: 87.5 },
  'บานเฟี้ยมยูโร': { hp: 18, jp: 0.5833, np: 1, hi: 14, ki: 0.5, ni: 4, rate: 87.5 },
  'มุ้งเฟรมเล็ก': { hp: 3, jp: 0.1667, np: 1, hi: 2, ki: 0.0833, ni: 1, rate: 87.5 },
  'หลังคาจั่ว': { baht: [0, 707, 0, 982] },
  'หลังคาเลื่อน': { baht: [0, 804, 0, 1530] },
  'บานเลื่อนรางบน': { hp: 8, jp: 0.3333, np: 1, hi: 8, ki: 0.3333, ni: 2, rate: 87.5 },
  'บานหมุน': { hp: 8, jp: 0.4167, np: 1, hi: 8, ki: 0.4167, ni: 2, rate: 87.5 },
  'บานโซลิด': { hp: 17, jp: 0.5833, np: 1, hi: 8, ki: 0.25, ni: 3, rate: 87.5 },
  'บานระแนงเลื่อน': { hp: 12, jp: 0.3333, np: 2, hi: 8, ki: 0.3333, ni: 2, rate: 87.5 },
  'บานเฟี้ยมยก': { hp: 14, jp: 0.4167, np: 2, hi: 8, ki: 0.25, ni: 2, rate: 87.5 },
  'บานเปลือย': { baht: [0, 0, 0, 280] },
  'ประตูรั้ว': { baht: [0, 560, 0, 1120] },
  'บานเกล็ด': { baht: [0, 196, 0, 196] },
  'เปิดดัดโค้ง': { baht: [0, 90, 690, 47] },
};
/** แปลงแถวในชีต "ค่าแรง" → บาท {pBase,pRate,iBase,iRate} (สูตรเดียวกับ B–E ในชีต) */
function laborFromSheet(s) {
  if (s.baht) return { pBase: s.baht[0], pRate: s.baht[1], iBase: s.baht[2], iRate: s.baht[3] };
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  return {
    pBase: r2(s.hp * s.rate * s.np), pRate: r2(s.jp * s.rate * s.np),
    iBase: r2(s.hi * s.rate * s.ni), iRate: r2(s.ki * s.rate * s.ni),
  };
}

// ── ANCHORS: ทุนวัสดุจากชีต "คิดทุน ___" (subagent self-verify diff≈0) ────────
//   ⚠ cost = ค่าจากชีต (ห้ามแก้ตามผล engine) · mfg/inst ไม่ฝังเลข — คิดสดจาก cost + ตารางค่าแรง
//     ตามสูตรในชีตคิดทุนแต่ละใบ: ขายผลิต = ROUNDUP((ทุน+ค่าแรงผลิต)×(1+กำไร%)/100)×100
//                                 ขาย+ติดตั้ง = ขายผลิต + ROUNDUP(ค่าแรงติดตั้ง×(1+กำไร%)/100)×100
//   labor: รูปแบบค่าแรงตามสูตรจริงในชีตคิดทุนของรุ่นนั้น
//     'rate'      = ฐาน + เรต×ตร.ม.        (ค่า default — ชีตส่วนใหญ่)
//     'baseXpanel'= ฐาน × จำนวนบาน          (ชีต "คิดทุน เฟี้ยม" D64/D65)
//     'baseOnly'  = ฐานเฉย ๆ                (ชีต "คิดทุน เฟี้ยมยูโร" E46/E47)
const ANCHORS = [
  // ⚠ ฐานราคาอลูเปลี่ยนที่มา 19 ส.ค.69 (เจ้าของสั่ง): ราคาเส้น = น้ำหนักจริง × เรต ฿/กก.
  //    น้ำหนัก = ชีต "น้ำหนักโปรไฟล์" (ชั่งจริง) ไม่ใช่คอลัมน์น้ำหนักในชีตราคาสี (= ราคา ÷ 187)
  //    ชีต "คิดทุน ___" ยังเขียนราคาเก่าอยู่ (ยังไม่ซิงก์) → anchor ชุดนี้จึงต่างจากชีตคิดทุน
  //    ตัวยึดที่ตรวจเลขได้เองอยู่ที่ ②g (ราคาขาว = กก. × 187)
  { id: 'sms_slide', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 16711.8 },
  { id: 'euro_slide', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 28079.3 },
  { id: 'slimlux', in: { w: 200, h: 200, p: 2, form: 'อิสระ' }, cost: 13635 },
  { id: 'open_door', in: { w: 150, h: 200, p: 1, form: 'มีธรณี' }, cost: 10597.6 },
  { id: 'awning', in: { w: 40, h: 40, p: 1, form: 'อิสระ' }, cost: 5303.94 },
  { id: 'folding', in: { w: 180, h: 280, p: 2, form: '2บาน: รวบเปิดซ้าย (2-0)' }, cost: 17733.76, labor: 'baseXpanel' },   // calibrate HW ตรง matrix มด
  { id: 'fixed', in: { w: 150, h: 200, p: 1, form: 'กระจกล้วน' }, cost: 4302 },
  { id: 'topslide', in: { w: 360, h: 240, p: 2, form: 'เลื่อนซ้อน' }, cost: 21034.96 },
  // ระแนง/รั้ว: ชีตขายแบบตาราง R3.9 (ไม่ใช่ทุน×2) → ตรวจเฉพาะ "ทุนวัสดุ"
  // louver = BOM cost (ชีต "คิดทุน ระแนง") · default 1.6×4 โชว์1.6 ช่องห่าง5 ไม่โครง ขาว/ดำ → pitch9.06 · ใบ27 · เส้นใบ9 × กล่อง1220 = ทุนใบ 10,980
  { id: 'louver', in: { w: 200, h: 240, p: 1, form: 'นอน' }, cost: 10980, costOnly: true },
  { id: 'gate', in: { w: 350, h: 180, p: 1, form: 'นอน' }, cost: 49448, costOnly: true },
  { id: 'roof', in: { w: 400, h: 200, p: 1, form: 'หลังคาเพิง' }, cost: 38286 },

  // ── รุ่นใหม่ (Wave 1+2) — subagent self-verify diff≈0 ──
  { id: 'eseries', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 19026.4 },
  { id: 'velora', in: { w: 220, h: 200, p: 1, form: 'เดี่ยว', color: 'sahara', glassType: 'เทมเปอร์ใส 6มม.' }, cost: 7111.6 },
  { id: 'pcdoor', in: { w: 150, h: 200, p: 2, form: 'แบ่ง 2' }, cost: 11403 },
  { id: 'banyok', in: { w: 100, h: 50, p: 1, form: 'เดี่ยว' }, cost: 7962 },
  { id: 'fold_euro', in: { w: 180, h: 280, p: 2, form: '2บาน: 2-0 พับข้างเดียว' }, cost: 18065.76, labor: 'baseOnly' },
  { id: 'banklet', in: { w: 300, h: 150, p: 2, form: 'นอน' }, cost: 9842.8 },
  { id: 'curve_fixed', in: { w: 100, h: 50, p: 1, form: 'กระจกล้วน' }, cost: 4200 },
  // เปิดดัดโค้ง: ชีตตัวอย่างใช้กำไร 30% (บานสั่งร้านอื่น) → ตรวจที่กำไร 30 ให้ตรงชีต
  { id: 'curve_open', in: { w: 90, h: 240, p: 1, form: 'ดัดโค้ง', glassType: 'เทมเปอร์ 6มม.', profitPct: 30 }, cost: 17050.48 },
  // ระแนงสลับ/หมุน: ชีตขาย R3.9/รวมค่าแรง → ตรวจเฉพาะทุนวัสดุ
  { id: 'louver_slip', in: { w: 400, h: 200, p: 1, form: 'นอน' }, cost: 11685, costOnly: true },
  { id: 'louver_rotate', in: { w: 200, h: 240, p: 1, form: 'นอน' }, cost: 36708, costOnly: true },
  { id: 'roof_gable', in: { w: 400, h: 200, p: 1, form: 'หลังคาจั่ว' }, cost: 50936 },
  // หลังคาเลื่อน: ค่าแรงฝังในวัสดุ (laborKey ศูนย์) → ตรวจเฉพาะทุน · มอเตอร์เป็น addon บวกยอดขายทีหลัง สูตรกลางไม่ครอบ
  { id: 'roof_slide', in: { w: 400, h: 200, p: 2, form: 'เลื่อนยื่น', addons: { slide_motor: { kw: '80' } } }, cost: 88836, costOnly: true },
  // มุ้ง: ทุนวัสดุตรง (ค่าแรงต่างชีตที่คิดต่อใบ)
  { id: 'screen', in: { w: 600, h: 300, p: 3, form: 'อิสระ' }, cost: 3689, costOnly: true },
];

// ── ANCHOR ชุดที่ 2: ทุนวัสดุ @150×150 ซม. จากชีต "บันทึกราคาขึ้น" ───────────
//   ทำไมต้องมี: anchor ชุดแรกตรวจรุ่นละ 1 ขนาด — ทุนต่อ ตร.ม. ไม่คงที่ (มีของตายตัวอย่างราง/มือจับ)
//   ขนาดเดียวจึงจับบั๊กที่โผล่เฉพาะบางขนาด/บางสีไม่ได้ (เจอจริง: Velora สีขาวไม่คิดค่าอบ — anchor เดิมใช้สีเทาเลยรอด)
//   ชีตนี้ล็อกทุนวัสดุจริงไว้ที่ 150×150 ทุกรุ่น = จุดยึดที่ 2 ฟรี ๆ จากไฟล์
//   ⚠ ไม่ใส่ เฟี้ยม/เฟี้ยมยูโร — ชีตเขียนกำกับเองว่า "สูตร live ประมาณ" (ไม่ใช่เลขเป๊ะ)
const ANCHORS150 = [
  { id: 'sms_slide', in: { p: 2, form: 'อิสระ' }, cost: 9158.25 },   // 9,190.85 − 285 (ยึดราคาสี/สโตร์)
  { id: 'euro_slide', in: { p: 2, form: 'อิสระ' }, cost: 13178.15 },
  { id: 'eseries', in: { p: 2, form: 'อิสระ' }, cost: 12684.85 },
  { id: 'velora', in: { p: 2, form: 'เดี่ยว', color: 'white' }, cost: 5469.55 },      // สีขาว = ต้องมีค่าอบเรตเทา (rawAlu)
  { id: 'velora', in: { p: 2, form: 'เดี่ยว', color: 'sahara' }, cost: 5469.55 },     // เทา = เท่ากันเป๊ะตามสูตรชีต
  { id: 'open_door', in: { p: 2, form: 'มีธรณี' }, cost: 11940.6 },
  { id: 'pcdoor', in: { p: 1, form: 'แบ่ง 2', spec: { pcsill: 'มีธรณี', pcsoft: 'ใส่' } }, cost: 8474 },
  { id: 'awning', in: { p: 1, form: 'อิสระ' }, cost: 5948.1 },
  { id: 'banyok', in: { p: 1, form: 'เดี่ยว' }, cost: 8424 },
  { id: 'fixed', in: { p: 1, form: 'กระจกล้วน' }, cost: 4004 },
  { id: 'topslide', in: { p: 2, form: 'เลื่อนซ้อน' }, cost: 12573 },
  { id: 'curve_fixed', in: { p: 1, form: 'กระจกล้วน' }, cost: 5100 },
];

// ── ① ค่าแรงใน pricebook ต้องตรงชีต "ค่าแรง" เป๊ะ ────────────────────────────
//   ถ้าใครแก้ pricebook.LABOR ด้วยมือโดยไม่แก้ไฟล์ → ตรงนี้แดงทันที
console.log('═══ ① ค่าแรงใน pricebook ↔ ชีต "ค่าแรง" (ถอดทุน_รวมทั้งหมด.xlsx) ═══');
for (const [key, src] of Object.entries(LABOR_SRC)) {
  const want = laborFromSheet(src);
  const got = PB.LABOR[key];
  if (!got) { console.log(`  ❌ ${key}: ไม่มีคีย์นี้ใน pricebook.LABOR`); fail++; continue; }
  const bad = ['pBase', 'pRate', 'iBase', 'iRate'].filter((k) => Math.abs((got[k] ?? 0) - want[k]) > 0.5);
  const fmt = (o) => `ผลิต ${o.pBase}+${o.pRate}/ตร.ม. · ติดตั้ง ${o.iBase}+${o.iRate}/ตร.ม.`;
  if (bad.length) { console.log(`  ❌ ${key}: got ${fmt(got)}  want ${fmt(want)}  <-- ${bad.join(',')} ไม่ตรงไฟล์`); fail++; }
  else { console.log(`  ✅ ${key}: ${fmt(want)}`); pass++; }
}

console.log('\n═══ ② ด่านตรวจราคา R4.0 (engine ↔ xlsx) — ' + ANCHORS.length + ' รุ่น ═══\n');
const ceil100 = (n) => Math.ceil(n / 100) * 100;
for (const a of ANCHORS) {
  const prod = PRODUCTS[a.id];
  if (!prod) { console.log('❌ ไม่พบรุ่น', a.id); fail++; continue; }
  const r = computeCost(PB, prod, a.in);
  console.log(`▶ ${prod.name} (${a.in.w}×${a.in.h} ${a.in.p}บาน):`);
  check('ทุนรวม', r.cost.total, a.cost, 1);
  if (a.costOnly) { console.log('     (ขายใช้ตาราง R3.9 / มี add-on — ข้าม · ทุนวัสดุตรวจแล้ว)'); continue; }

  // คาดคะเนราคาขาย "จากไฟล์" ล้วน ๆ: ทุนชีต + ค่าแรงชีต + สูตรในชีตคิดทุน — ไม่แตะผลลัพธ์ engine
  const L = laborFromSheet(LABOR_SRC[prod.laborKey] ?? {});
  const area = (a.in.w * a.in.h) / 10000;
  const shape = a.labor || 'rate';
  const lp = shape === 'baseXpanel' ? a.in.p : 1;
  const rateOn = shape === 'rate' ? 1 : 0;
  const wProd = Math.max(0, L.pBase + L.pRate * area * rateOn) * lp;
  const wInst = Math.max(0, L.iBase + L.iRate * area * rateOn) * lp;
  const pf = a.in.profitPct ?? 100;
  const wantMfg = ceil100((a.cost + wProd) * (1 + pf / 100));
  const wantInst = wantMfg + ceil100(wInst * (1 + pf / 100));
  check(`ค่าแรงผลิต (${shape})`, r.labor.prod, Math.round(wProd * 100) / 100, 1);
  check('ค่าแรงติดตั้ง', r.labor.install, Math.round(wInst * 100) / 100, 1);
  check('ขายผลิตอย่างเดียว (ตามชีต)', r.sell.mfgOnly, wantMfg, 1);
  check('ขายผลิต+ติดตั้ง', r.sell.withInstall, wantInst, 1);
  // ราคาขายส่ง = ยอดผลิตอย่างเดียว ลดอีก WHOLESALE_DISCOUNT_PCT (นโยบายขาย ไม่ใช่สูตรทุน)
  check(`ขายส่ง (ลด ${PB.WHOLESALE_DISCOUNT_PCT}%)`, r.sell.mfgOnlyNet, ceil100(wantMfg * (1 - (PB.WHOLESALE_DISCOUNT_PCT || 0) / 100)), 1);
}

// ── เทสพฤติกรรมกลาง ─────────────────────────────────────────────────────────
console.log('\n═══ เทสพฤติกรรม cost engine ═══');
console.log('▶ แก้อลู SMS 187→200 (กระจก/อุปกรณ์ต้องนิ่ง):');
{
  const base = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 3, form: 'อิสระ' });
  const PB2 = JSON.parse(JSON.stringify(PB)); PB2.ALU.SMS = 200;
  const r = computeCost(PB2, PRODUCTS.sms_slide, { w: 600, h: 300, p: 3, form: 'อิสระ' });
  check('ทุนอลู = 10113.6×200/187', r.cost.alu, 10113.6 * 200 / 187, 1);   // ฐานขาว SMS ยึดชีตราคาสี v9 (เดิม 10080)
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
// ── ②b ทุนวัสดุที่ขนาดที่ 2 (150×150) + ตัวคูณต่อขนาด ─────────────────────────
console.log('\n═══ ②b ทุนวัสดุ @150×150 ↔ ชีต "บันทึกราคาขึ้น" (จุดยึดขนาดที่ 2) ═══');
for (const a of ANCHORS150) {
  const prod = PRODUCTS[a.id];
  if (!prod) { console.log('❌ ไม่พบรุ่น', a.id); fail++; continue; }
  const r = computeCost(PB, prod, { w: 150, h: 150, ...a.in });
  check(`${prod.name}${a.in.color ? ' (' + a.in.color + ')' : ''} ${a.in.p}บาน`, r.cost.total, a.cost, 1);
}

// ── ②c ราคาต้องขึ้นตามขนาด (ตัวคูณต่อ ตร.ม. ไม่เท่ากันทุกขนาด — เจ้าของสั่งให้เช็ค) ──
//   ทุนต่อ ตร.ม. ต้องลดเมื่อบานใหญ่ขึ้น (ของตายตัวเฉลี่ยได้มากขึ้น) · ราคารวมต้องเพิ่มเสมอ
console.log('\n═══ ②c ไล่ราคาหลายขนาดต่อรุ่น (ใหญ่ขึ้น→แพงขึ้น · ทุน/ตร.ม. ถูกลง) ═══');
for (const [id, form] of [['sms_slide', 'อิสระ'], ['euro_slide', 'อิสระ'], ['open_door', 'มีธรณี'], ['fixed', 'กระจกล้วน']]) {
  const prod = PRODUCTS[id];
  const sizes = [[140, 150, 2], [200, 200, 2], [240, 200, 2], [270, 300, 3], [390, 300, 3], [600, 300, 3]]
    .filter((s) => s[2] <= (prod.maxP ?? 9) && s[2] >= (prod.minP ?? 1));
  // เกณฑ์: ① ใหญ่ขึ้นราคารวมต้องเพิ่มเสมอ (เข้ม)
  //        ② ทุน/ตร.ม. ตัวใหญ่สุดต้องถูกกว่าตัวเล็กสุด (ดูแนวโน้มรวม ไม่ไล่ทีละขั้น)
  //           — ไล่ทีละขั้นใช้ไม่ได้ เพราะบางรุ่นมีเส้นที่โผล่เฉพาะขนาดใหญ่ (ยูโร: โหนกเกี่ยว ≥3ม.)
  let prevSell = -1, firstPer = null, lastPer = null, ok = true, detail = [];
  for (const [w, h, p] of sizes) {
    const r = computeCost(PB, prod, { w, h, p, form });
    const per = r.cost.total / r.input.area;
    if (r.sell.withInstall <= prevSell) { ok = false; detail.push(`${w}×${h} ราคารวมไม่เพิ่ม`); }
    prevSell = r.sell.withInstall;
    if (firstPer == null) firstPer = per;
    lastPer = per;
  }
  if (!(lastPer < firstPer)) { ok = false; detail.push(`ทุน/ตร.ม. ไม่ถูกลงเมื่อบานใหญ่ขึ้น (${Math.round(firstPer)}→${Math.round(lastPer)})`); }
  check(`${prod.name} — ${sizes.length} ขนาด${detail.length ? ' · ' + detail.join(' · ') : ''}`, ok ? 1 : 0, 1, 0);
}

// ── ②d ราคาตามสี: เส้นที่มีราคาสีในตาราง ใช้ราคานั้น · เส้นที่ไม่มี ใช้ ขาว+ค่าอบ×กก. ─
//   ชีตคิดทุนผสม 2 แบบจริง (SMS/ยูโร VLOOKUP คอลัมน์สี · บานเปิด F7863/F7864 ใช้ +rate_grey×กก.)
//   คิดคาดหวังเองจาก BOM สีขาว + ตาราง PB.ALUCOLOR/PB.BAKE → ไม่พึ่งสาขาสีของ engine
//   ⚠ ค่าคาดหวังตรึงไว้ (ห้ามคิดสดจาก PB.ALUCOLOR — จะกลายเป็นด่านหลอก ลบตารางสีแล้วยังเขียว)
//   ที่มาของเลข: ทุนสีขาว + Σ บาร์×(ราคาสี−ราคาขาว) จากชีต "ราคาสี" คอลัมน์ E/H
//                + Σ บาร์×กก.×ค่าอบ สำหรับเส้นที่ชีตไม่ได้ VLOOKUP (เช่น F7863/F7864 ของบานเปิด)
console.log('\n═══ ②d ราคาตามสี (เทาซาฮาร่า / ลายไม้สต็อค) ═══');
const ANCHORS_COLOR = [
  // SMS ขยับ −285 ทุกสีเท่ากัน (ฐานขาวเปลี่ยน · ตารางราคาสีเท่าเดิม) — ยึดชีตราคาสี v9
  ['sms_slide', { w: 150, h: 150, p: 2, form: 'อิสระ' }, { white: 9158.25, sahara: 9796.95, woodStock: 13637.85 }],
  ['euro_slide', { w: 150, h: 150, p: 2, form: 'อิสระ' }, { white: 13178.15, sahara: 13980.75, woodStock: 18231.85 }],
  ['open_door', { w: 150, h: 150, p: 2, form: 'มีธรณี' }, { white: 11940.6, sahara: 14855.22, woodStock: 16880.72 }],
];
for (const [id, inp, want] of ANCHORS_COLOR) {
  const prod = PRODUCTS[id];
  for (const col of ['white', 'sahara', 'woodStock']) {
    const KEY = { white: 'white', sahara: 'sahara', woodStock: 'wood_teak' };
    const r = computeCost(PB, prod, { ...inp, color: col, colorKey: KEY[col] });
    const up = Math.round((r.cost.total / want.white - 1) * 1000) / 10;
    check(`${prod.name} ${col}${col === 'white' ? '' : ' (+' + up + '% จากขาว)'}`, r.cost.total, want[col], 1);
  }
}

// ── ②e ราง 2 แบบ ต้องใช้เฟรมล่าง+ตบราง คนละรหัส (เจ้าของยืนยัน 8 ส.ค.69) ──────
//   รางกันน้ำ (นอก) = B20041 + F7994 · รางเตี้ย (งานใน) = B20047 + B20050
//   ของเดิมเลือกรางแล้ววัสดุไม่เปลี่ยนเลย → รางเตี้ยคิดราคาเฟรมล่างกันน้ำ แพงเกิน
console.log('\n═══ ②e ราง กันน้ำ / เตี้ย ต้องสลับวัสดุจริง ═══');
{
  const codesOf = (spec) => {
    const r = computeCost(PB, PRODUCTS.sms_slide, { w: 300, h: 220, p: 3, form: 'อิสระ', spec });
    const out = new Set();
    for (const l of r.lines.filter((x) => x.cat === 'alu')) {
      const it = PRODUCTS.sms_slide.alu.find((a) => l.name.startsWith(a.name));
      if (it?.code && l.qty > 0) out.add(it.code);
    }
    return { codes: out, cost: r.cost.total };
  };
  const out = codesOf({ bottomrail: 'รางกันน้ำ' });
  const low = codesOf({ bottomrail: 'รางเตี้ย (งานใน)' });
  check('รางกันน้ำ ใช้ B20041 (เฟรมล่างกันน้ำ)', out.codes.has('B20041') ? 1 : 0, 1, 0);
  check('รางกันน้ำ ใช้ F7994 (ตบรางล้อ)', out.codes.has('F7994') ? 1 : 0, 1, 0);
  check('รางกันน้ำ ต้องไม่มี B20047/B20050', (out.codes.has('B20047') || out.codes.has('B20050')) ? 0 : 1, 1, 0);
  check('รางเตี้ย ใช้ B20047 (เฟรมล่างภายใน)', low.codes.has('B20047') ? 1 : 0, 1, 0);
  check('รางเตี้ย ใช้ B20050 (ตบปิดรางเตี้ย)', low.codes.has('B20050') ? 1 : 0, 1, 0);
  check('รางเตี้ย ต้องไม่มี B20041/F7994', (low.codes.has('B20041') || low.codes.has('F7994')) ? 0 : 1, 1, 0);
  check('รางเตี้ยต้องถูกกว่ารางกันน้ำ (ต่าง 1,262)', Math.round(out.cost - low.cost), 1262, 1);
  check('ไม่ระบุราง = รางกันน้ำ (ค่ามาตรฐาน)', codesOf({}).cost, out.cost, 0.01);
}

// ── ②f เส้นสีเงินไม่อบสี (F7994) — ราคาเดียวทุกสี ห้ามบวกค่าอบ ─────────────────
console.log('\n═══ ②f F7994 ตบรางล้อ สีเงิน — ราคาเดียวทุกสี ═══');
{
  check('อยู่ในรายการไม่คิดค่าสี', (PB.ALUCODE_NOCOLOR || []).includes('F7994') ? 1 : 0, 1, 0);
  // SMS สีเทา: ค่าอบต้องมาจาก B20001+B20003 เท่านั้น (2 เส้นที่ยังไม่มีราคาสี)
  //   ถ้า F7994 (3 เส้น × 0.833 กก.) หลุดเข้าไปด้วย ค่าอบจะเกินมา 250 บาท
  const smsBake = computeCost(PB, PRODUCTS.sms_slide, { w: 300, h: 220, p: 3, form: 'อิสระ', color: 'sahara' }).cost.bake;
  check('ค่าอบ SMS สีเทา = เฉพาะ B20001+B20003 (F7994 ไม่ปน)', Math.round(smsBake * 100) / 100, Math.round((6.86111 + 5.80556) * 100 * 100) / 100, 0.5);
  const f = PRODUCTS.euro_slide.alu.find((a) => a.code === 'F7994');
  const white = computeCost(PB, PRODUCTS.euro_slide, { w: 600, h: 300, p: 3, form: 'อิสระ', color: 'white' });
  const line = white.lines.find((l) => l.name.startsWith(f.name));
  for (const c of ['sahara', 'woodStock', 'special']) {
    const r = computeCost(PB, PRODUCTS.euro_slide, { w: 600, h: 300, p: 3, form: 'อิสระ', color: c });
    check(`ราคาต่อเส้น F7994 สี ${c} = เท่าสีขาว`, r.lines.find((l) => l.name.startsWith(f.name)).unitPrice, line.unitPrice, 0.01);
  }
}

// ── ③ สวิตช์ "คิดค่าแรงแบบไหน" ในหน้าคิดราคา — ราคาที่ขึ้นใบต้องเปลี่ยนตามจริง ──
//   เคยพลาดมาแล้ว: ทำปุ่มสวย ๆ แต่ลืมต่อสาย → กดแล้วราคาไม่ขยับ · ตรงนี้อ่านซอร์สจริง
// ── ②g ราคาแยกสีจริงจากไฟล์ v9 (ALUCOLOR_KEY) — เจ้าของเคาะ 19 ส.ค.69 "เอา" ──
//   ค่าตรึงจากชีต "ราคาสี" v9 บล็อก "ปัจจุบัน" (คอลัมน์ L–R) · ห้ามคิดสดจาก PB (ลบตารางแล้วต้องแดง)
console.log('\n═══ ②g ราคาเส้นแยกสีจริง 6 สี (ไฟล์ v9 ชีตราคาสี) ═══');
{
  const WANT = {
    B20001: { sahara: 1272.6, sahara_black: 1272.6, aztec: 2250.2, wood_teak: 1896, wood_maho: 2356.2, wood_whiteoak: 2356.2 },
    B20003: { sahara: 986.9, sahara_black: 986.9, aztec: 1740, wood_teak: 1449.2, wood_maho: 1822.1, wood_whiteoak: 1822.1 },
    B20041: { sahara: 2342.7, wood_teak: 3557.2 },
  };
  for (const [code, m] of Object.entries(WANT))
    for (const [col, px] of Object.entries(m))
      check(code + ' ' + col, PB.ALUCOLOR_KEY?.[col]?.[code], px, 0.01);
  // ราคาขาว = น้ำหนักจริง (ชีต "น้ำหนักโปรไฟล์") × เรต 187 ฿/กก. — เลขตรวจเองได้จากไฟล์
  check('ฐานขาว B20001 = 6.25 กก. × 187', PB.ALUCODE?.B20001, 6.25 * 187, 0.05);
  check('ฐานขาว B20003 = 4.833 กก. × 187', PB.ALUCODE?.B20003, 4.833 * 187, 0.05);
  check('ฐานขาว B20041 = 11.5 กก. × 187', PB.ALUCODE?.B20041, 11.5 * 187, 0.05);
  check('ครบ 6 สี', Object.keys(PB.ALUCOLOR_KEY ?? {}).length, 6, 0);
  check('ไม่ดึงระบบราคาประเมิน — SlimLux WM-K04 ต้องไม่โผล่', PB.ALUCOLOR_KEY?.sahara?.['WM-K04'] == null ? 1 : 0, 1, 0);
  check('ไม่ดึง E-series — E-03 ต้องไม่โผล่', PB.ALUCOLOR_KEY?.sahara?.['E-03'] == null ? 1 : 0, 1, 0);
  check('SlimLux ราคาขาวไม่ถูกทับด้วยราคาประเมิน', PB.ALUCODE?.['WM-K04'] == null ? 1 : 0, 1, 0);

  const sell = (key, bake) => computeCost(PB, PRODUCTS.sms_slide,
    { w: 600, h: 300, p: 3, form: 'อิสระ', color: bake, colorKey: key }).sell.withInstall;
  const teak = sell('wood_teak', 'woodStock'), maho = sell('wood_maho', 'woodStock');
  check('ลายไม้สักทอง ≠ มะฮอกกานี (แยกราคาได้แล้ว)', maho > teak ? 1 : 0, 1, 0);
  check('SMS ลายไม้สักทอง', teak, 49600, 1);
  check('SMS มะฮอกกานี', maho, 57300, 1);
  check('SMS เทาซาฮาร่า', sell('sahara', 'sahara'), 39300, 1);
  check('SMS สีขาว', sell('white', 'white'), 37600, 1);

  const az = computeCost(PB, PRODUCTS.sms_slide, { w: 600, h: 300, p: 3, form: 'อิสระ', color: 'special', colorKey: 'aztec' });
  check('Aztec: ค่าเปิดตู้อบยังคิดอยู่ (คงที่ ไม่ผูก กก.)', az.cost.openOven, PB.BAKE_OPEN_OVEN, 0.01);
  check('Aztec: ไม่คิดค่าอบซ้ำ (ราคาสีรวมค่าอบแล้ว)', az.cost.bake, 0, 0.01);
  check("น้ำหนัก กก./เส้น (ชีตน้ำหนักโปรไฟล์ = ชั่งจริง)", Object.keys(PB.ALUWEIGHT ?? {}).length, 130, 0);
  check("น้ำหนัก B20001 = 6.25 กก./เส้น (ไม่ใช่ 6.016 ที่เป็นราคา÷187)", PB.ALUWEIGHT?.B20001, 6.25, 0.001);
}

console.log('\n═══ ③ สวิตช์ค่าแรงในหน้าคิดราคา 4.0 (ต่อสายครบไหม) ═══');
{
  const src = fs.readFileSync(path.join(__dirname, '../src/components/Calculator40Client.tsx'), 'utf8');
  const has = (label, re) => { const ok = re.test(src); console.log(`  ${ok ? '✅' : '❌'} ${label}`); ok ? pass++ : fail++; };
  has('ค่าตั้งต้น = ค่าแรงรวม (useState "all")', /useState<"all" \| "mfg">\("all"\)/);
  // ⚠ ต้องใช้ mfgOnlyNet (ราคาหลังลดขายส่ง) ไม่ใช่ mfgOnly (ค่าดิบตามชีต) — ใช้ผิด = ลืมลด 10%
  has('ราคาต่อหน่วยที่ขึ้นใบ = ราคาขายส่งหลังลด', /perUnit:\s*\(laborMode === "mfg" \? result\.sell\.mfgOnlyNet : result\.sell\.withInstall\)/);
  has('หลังคาช่วงเพิ่ม (subLines) ใช้ราคาหลังลดด้วย', /laborMode === "mfg" \? sr\.sell\.mfgOnlyNet : sr\.sell\.withInstall/);
  has('การ์ดราคาโชว์ราคาขายส่งหลังลด', /baht\(result\.sell\.mfgOnlyNet\)/);
  has('ยอดรวม (มีรายการเสริม) ใช้ราคาหลังลด', /laborMode === "mfg" \? result\.sell\.mfgOnlyNet : result\.sell\.withInstall\) \+ \(\(result as any\)\.subSell/);
  has('เลือก "ผลิตอย่างเดียว" แล้วเขียนกำกับลงใบว่าไม่รวมติดตั้ง', /laborMode === "mfg"\)\s*jobLines\.push\("- ราคานี้ไม่รวมค่าติดตั้ง/);
  has('บันทึกลงสูตร (recipe) เพื่อกลับมาแก้ข้อได้', /profit,\s*laborMode,/);
  has('โหลดสูตรเก่ากลับมาแล้วตั้งค่าสวิตช์คืน', /setLaborMode\(r\.laborMode === "mfg"/);
  has('โชว์ค่าแรงแยก ผลิต/ติดตั้ง/รวม', /result\.labor\.prod \+ result\.labor\.install/);
}

console.log('\n═══ ④ ตาข่ายทุกรุ่น: sanity sweep (คิดออกราคาได้ · ไม่ติดลบ · ขาย≥ทุน) ═══');
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
