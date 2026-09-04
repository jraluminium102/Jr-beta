// verify-link5.mjs — ด่านกัน "5 รุ่นที่เชื่อมสโตร์ 21 ส.ค.69 หลุดการผูก"
// รัน:  node scripts/verify-link5.mjs
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง 21 ส.ค.69: เชื่อม บานติดตาย / เฟี้ยม SMS (B####) / Velora / PC Door / เฟี้ยมยูโร (F####)
//   เข้าสโตร์ให้ครบ — เช็คสโตร์ + ไฟล์ตัดประกอบ (รวมใบตัด_JR_2) + ไฟล์ต้นทุน (ถอดทุน v9)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeCost } from '../src/lib/calculator40/engine.mjs';
import { PRODUCTS } from '../src/lib/calculator40/products.mjs';
import { isAluCode, applyPriceOverride, buildPriceOverride } from '../src/lib/calculator40/stock-link.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/calculator40/pricebook.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (label, cond, got = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${label}${cond || got === '' ? '' : `  (${got})`}`);
};

// code ของบางเส้นเป็น "สูตรเลือกรหัส" เช่น (GMM<=12?'F7935':'F7949') — ต้องตรวจทุกรหัสที่สูตรเลือกได้
const codesOf = (code) => {
  const s = String(code ?? '');
  if (!s) return [];
  if (!s.includes('?')) return [s];
  return [...s.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]).filter(Boolean);
};
const allCodesOk = (code) => { const c = codesOf(code); return c.length > 0 && c.every(isAluCode); };
// รหัสที่ "ไม่มีราคาในไฟล์" ได้ เพราะสโตร์เก็บไว้ใต้ sku อื่น แล้ว stock-link อ่านรหัสจากชื่อของให้เอง
const PRICED_FROM_STOCK = {
  F7949: 'สโตร์เก็บเป็น JR02893 (คิ้วมุ้ง F7949) — stock-link อ่านรหัสจากชื่อ · ใช้เฉพาะกระจกหนา >12 มม.',
};
const allPriced = (code) => {
  const c = codesOf(code);
  return c.length > 0 && c.every((x) => PB.ALUCODE?.[x] > 0 || x in PRICED_FROM_STOCK);
};

// ── ① เฟี้ยม SMS (B####) — ทุกเส้นผูกรหัสสโตร์ + มีราคา + มีน้ำหนัก ──────────────
console.log('\n═══ ① บานเฟี้ยม SMS — รหัส B#### ผูกสโตร์ครบ ═══');
{
  const P = PRODUCTS.folding;
  for (const a of P.alu) {
    ok(`${a.name}: ผูกสโตร์ได้ (${a.code})`, !!a.code && isAluCode(a.code));
    ok(`${a.name}: มีราคาไฟล์ (${PB.ALUCODE?.[a.code] ?? '—'})`, PB.ALUCODE?.[a.code] > 0);
    ok(`${a.name}: มีน้ำหนัก (${a.kg})`, a.kg > 0);
  }
  const sil = P.consum.find((c) => /ซิลิโคน/.test(c.name));
  ok('ซิลิโคน ผูก JR00504', sil?.sku === 'JR00504', String(sil?.sku));
}

// ── ② เฟี้ยมยูโร (F####) — เดิม kg:0 ทุกเส้น = สีอบพิเศษไม่คิดค่าอบเลย ──────────
console.log('\n═══ ② บานเฟี้ยมยูโร — น้ำหนักครบ (ค่าอบสีพิเศษไม่หาย) ═══');
{
  const P = PRODUCTS.fold_euro;
  for (const a of P.alu) {
    ok(`${a.name}: ผูกสโตร์ (${a.code}) + kg ${a.kg}`, allCodesOk(a.code) && a.kg > 0);
    ok(`${a.name}: ราคาไฟล์ (${codesOf(a.code).map((c) => PB.ALUCODE?.[c] ?? '—').join('/')})`, allPriced(a.code));
  }
  const hd474 = P.hardware.find((h) => /HD-474/.test(h.name));
  ok('HD-474 มือจับกลอน ผูก JR00213 (สโตร์ ฿85 ตรงชื่อ+ราคา)', hd474?.sku === 'JR00213', String(hd474?.sku));
  // สีอบพิเศษต้องมีค่าอบแล้ว (เดิม kg 0 → ค่าอบ 0 เงียบ ๆ)
  const sp = computeCost(PB, P, { w: 180, h: 280, p: 2, form: '2บาน: รวบเปิดซ้าย (2-0)', color: 'special', colorKey: 'special', glassType: 'เขียว 6มม.' });
  ok(`สีอบพิเศษ: ค่าอบ > 0 (฿${Math.round(sp.cost.bake)})`, sp.cost.bake > 0);
  // สีขาวต้องไม่ขยับจากเดิม (น้ำหนักไม่กระทบราคาขาว)
  const wh = computeCost(PB, P, { w: 180, h: 280, p: 2, form: '2บาน: รวบเปิดซ้าย (2-0)', color: 'white', colorKey: 'white', glassType: 'เขียว 6มม.' });
  ok('สีขาว: ไม่มีค่าอบ (เท่าเดิม)', wh.cost.bake === 0, String(wh.cost.bake));
  // เฟี้ยมยก ใช้เส้นชุดเดียวกัน — ต้องได้น้ำหนักด้วย
  ok('เฟี้ยมยก: เส้น F79xx มีน้ำหนักครบ', PRODUCTS.fold_lift.alu.filter((a) => /^F79/.test(String(a.code))).every((a) => a.kg > 0));
}

// ── ③ PC Door — รหัสยึด sku สโตร์ + อุปกรณ์ผูกตามไฟล์ใบตัด ─────────────────────
console.log('\n═══ ③ PC Door — รหัส + อุปกรณ์ผูกสโตร์ ═══');
{
  const P = PRODUCTS.pcdoor;
  const codes = P.alu.map((a) => String(a.code || ''));
  ok('ใช้ F7938B/F7945C ตามที่มีในสโตร์ (เจ้าของยืนยัน)', codes.includes('F7938B') && codes.includes('F7945C'));
  // F7935 (คิ้วกระจก) ถอดออก 3 ก.ย.69 — เจ้าของสั่ง "PC Door คิ้วกระจกไม่ใช้"
  //   B20051 เสาตั้ง · B20054 เสานอน = รหัสใหม่ที่เจ้าของให้มา
  for (const c of ['F7859', 'F7938B', 'F7960', 'F7863', 'F7864', 'F7945C', 'B20051', 'B20054'])
    ok(`ใช้รหัส ${c}`, codes.includes(c));
  for (const [name, sku] of [['บานพับ', 'JR00473'], ['ล้อรางบน', 'JR00544'], ['มือจับ Align', 'JR00378'], ['กลอน', 'JR00630'], ['น็อตเฟรม', 'JR00864']]) {
    const h = P.hardware.find((x) => x.name.includes(name));
    ok(`${name} → ${sku}`, h?.sku === sku, String(h?.sku));
  }
  ok('ซิลิโคน → JR00504', P.consum.some((c) => c.sku === 'JR00504'));
  // ราคา/ราคาสี ต้องเข้าแม้สโตร์เขียน sku สั้นกว่าชื่อ (sku=F7938 · ชื่อ F7938B-...) — อ่านรหัสจากชื่อ
  {
    const rows = [{ sku: 'F7938', name: 'F7938B-เฟรมบานกระทุ้ง (ติดมุ้ง)', color: 'อบขาว', unit_cost: 1350 },
      { sku: 'F7938', name: 'F7938B-เฟรมบานกระทุ้ง (ติดมุ้ง)', color: 'เทาซาฮาร่า', unit_cost: 1450 },
      { sku: 'F7945', name: 'F7945C-เสารับล็อกเปิดกลาง', color: 'อบขาว', unit_cost: 695 }];
    const PB3 = applyPriceOverride(JSON.parse(JSON.stringify(PB)), buildPriceOverride(rows, PB));
    ok('อ่านรหัสจากชื่อ: ALUCODE F7938B = 1350', PB3.ALUCODE?.F7938B === 1350, String(PB3.ALUCODE?.F7938B));
    ok('อ่านรหัสจากชื่อ: ALUCODE F7945C = 695', PB3.ALUCODE?.F7945C === 695, String(PB3.ALUCODE?.F7945C));
    ok('ราคาสีเทา F7938B = 1450', PB3.ALUCOLOR_STOCK?.['เทาซาฮาร่า']?.F7938B === 1450, String(PB3.ALUCOLOR_STOCK?.['เทาซาฮาร่า']?.F7938B));
  }
  // ยอดอุปกรณ์ (แบ่ง 2 มีธรณี ใส่ซอฟโค้ด)
  //   ชีตถอดทุนเดิม: 468+1170+396+450+8 = 2,492 · +ยาง 154 = 2,646
  //   +324 = ชิ้นส่วนมือจับที่แตกตามใบตัด (แกน A 72 · แกน B 36 · ปลายมือจับ 120 · ตัวที 60 · ก้ามปูรับล็อค 36)
  //   เจ้าของเคาะ 1 ก.ย.69 ให้ยึดใบตัด (commit 75d3bcf) — anchor เดิมค้างที่เลขก่อนเคาะ เลยฟ้องแดงมาตั้งแต่วันนั้น
  const r = computeCost(PB, P, { w: 150, h: 200, p: 2, form: 'แบ่ง 2', color: 'white', colorKey: 'white', glassType: 'เขียว 6มม.', spec: { pcsill: 'มีธรณี', pcsoft: 'ใส่' } });
  ok(`ค่าอุปกรณ์ = 2,646 ตามชีต + 324 ชิ้นส่วนมือจับตามใบตัด = 2,970 (฿${Math.round(r.cost.hardware)})`, Math.abs(r.cost.hardware - 2970) <= 1, String(r.cost.hardware));
}

// ── ④ Velora + บานติดตาย — ผูกครบ ────────────────────────────────────────────
console.log('\n═══ ④ Velora + บานติดตาย ═══');
{
  const V = PRODUCTS.velora;
  ok('Velora อลูผูก JR02885/JR02886 ครบทุกบรรทัด', V.alu.every((a) => a.code === 'JR02885' || a.code === 'JR02886'), V.alu.map((a) => a.code).join(','));
  ok('Velora ซิลิโคน → JR00504', V.consum.some((c) => c.sku === 'JR00504'));
  ok('Velora บานพับ/มือจับ ผูกตามสี (JR00560/561 · JR00355/356)',
    V.hardware.every((h) => String(h.sku || '').includes('JR')));
  const F = PRODUCTS.fixed;
  ok('บานติดตาย: กล่องผูกด้วยชื่อ (BOXPRICE) + 9014 มีรหัส', F.alu.some((a) => a.box) && F.alu.some((a) => a.code === '9014'));
  ok('บานติดตาย ซิลิโคน → JR00504', F.consum.some((c) => c.sku === 'JR00504'));
}

// ── ⑤ อุปกรณ์ HD — ผูกสโตร์ด้วย "รหัสในชื่อ" (เจ้าของยืนยัน 21 ส.ค.69 ว่ามีในสโตร์) ──
//   สโตร์ตั้งชื่อตามรหัสผู้ผลิต (HD-640 ...) แต่ sku เป็น JR##### ที่รันอัตโนมัติ
//   stock-link ทำดัชนีจากชื่อให้ → สูตรอ้างรหัส HD ตรง ๆ ได้ ไม่ต้องรู้เลข JR
console.log('\n═══ ⑤ อุปกรณ์ HD ผูกสโตร์ด้วยรหัสในชื่อ ═══');
{
  const HD = ['HD-640', 'HD-641', 'HD-642', 'HD-643', 'HD-312', 'HD-1180', 'HD-213', 'HD-200'];
  for (const id of ['fold_euro', 'fold_lift']) {
    const Pr = PRODUCTS[id];
    ok(`${Pr.name}: อุปกรณ์ทุกบรรทัดมีรหัสสโตร์`, Pr.hardware.every((h) => !!h.sku),
      Pr.hardware.filter((h) => !h.sku).map((h) => h.name).join(','));
    for (const c of HD) ok(`${Pr.name}: ใช้รหัส ${c}`, Pr.hardware.some((h) => h.sku === c));
  }
  const rows = [{ sku: 'JR09001', name: 'HD-640 บานพับล้อบนเฟี้ยม', unit_cost: 350 },
    { sku: 'JR09002', name: 'HD-1180 ก้าน AL สไลด์ 19.5 mm', unit_cost: 90 }];
  const PB2 = applyPriceOverride(JSON.parse(JSON.stringify(PB)), buildPriceOverride(rows, PB));
  ok('ดัชนี HD-640 จากชื่อ = 350', PB2.SKUPRICE?.['HD-640'] === 350, String(PB2.SKUPRICE?.['HD-640']));
  ok('ดัชนี HD-1180 จากชื่อ = 90', PB2.SKUPRICE?.['HD-1180'] === 90, String(PB2.SKUPRICE?.['HD-1180']));
  const opt = { w: 180, h: 280, p: 2, form: '2บาน: รวบเปิดซ้าย (2-0)', color: 'white', colorKey: 'white', glassType: 'เขียว 6มม.' };
  const a = computeCost(PB, PRODUCTS.fold_euro, opt), b = computeCost(PB2, PRODUCTS.fold_euro, opt);
  ok(`ตั้งราคาสโตร์ → ทุนขยับ (${Math.round(a.cost.total)} → ${Math.round(b.cost.total)})`, b.cost.total > a.cost.total);
  const l = b.lines.find((x) => x.sku === 'HD-640');
  ok('HD-640 ใช้ราคาสโตร์ ฿350 (ไม่ใช่ ฿299 ในไฟล์)', l?.unitPrice === 350, String(l?.unitPrice));
}

// ── ⑥ แถวสโตร์ที่ "รหัสอยู่กลางชื่อ" ห้ามทับราคาสีของเส้นจริง ─────────────
//   เจ้าของจับได้ 3 ก.ย.69: สโตร์มีแถว "ชนกลาง (F7855)" ทั้งที่ F7855 มีอยู่แล้ว 7 สี
//   สโตร์จริงตั้งชื่อขึ้นต้นด้วยรหัสเสมอ (ตรวจแล้ว 730/730 แถว) → รหัสกลางชื่อ = แถวที่คนสร้างเองทีหลัง
console.log('\n═══ ⑥ แถวซ้ำที่รหัสอยู่กลางชื่อ ต้องไม่ทับราคาสีของเส้นจริง ═══');
{
  const real = [
    { name: 'F7855-ชนกลางบานเลื่อนรับแรง-อบขาว', sku: 'F7855', unit_cost: 750, color: 'อบขาว' },
    { name: 'F7855-ชนกลางบานเลื่อนรับแรง-เทาซาฮาร่า', sku: 'F7855', unit_cost: 805, color: 'เทาซาฮาร่า' },
  ];
  for (const [label, fake] of [
    ['ไม่ใส่สี', { name: 'ชนกลาง (F7855)', sku: '', unit_cost: 120, color: '' }],
    ['ใส่สีอบขาว', { name: 'ชนกลาง (F7855)', sku: '', unit_cost: 120, color: 'อบขาว' }],
    ['ใส่สีเทาซาฮาร่า', { name: 'ชนกลาง (F7855)', sku: '', unit_cost: 120, color: 'เทาซาฮาร่า' }],
    ['ชื่อแบบ migration 0083', { name: 'ธรณี F7855', sku: '', unit_cost: 120, color: 'อบขาว' }],
  ]) {
    const ov = buildPriceOverride([...real, fake], PB);
    ok(`แถวปลอม (${label}) ไม่ทับราคาสีอบขาว 750`, ov.ALUCOLOR_STOCK?.['อบขาว']?.F7855 === 750, String(ov.ALUCOLOR_STOCK?.['อบขาว']?.F7855));
    ok(`แถวปลอม (${label}) ไม่ทับราคาสีเทาซาฮาร่า 805`, ov.ALUCOLOR_STOCK?.['เทาซาฮาร่า']?.F7855 === 805, String(ov.ALUCOLOR_STOCK?.['เทาซาฮาร่า']?.F7855));
    ok(`แถวปลอม (${label}) ไม่ทับราคาเส้น ALUCODE 750`, ov.ALUCODE?.F7855 === 750, String(ov.ALUCODE?.F7855));
  }
  // แถวจริงที่ "ชื่อขึ้นต้นด้วยรหัส แต่ช่อง sku สั้นกว่า" ต้องยังผูกได้ (F7938B ในชื่อ · sku F7938)
  const ov2 = buildPriceOverride([{ name: 'F7938B-เฟรมบานกระทุ้ง-อบขาว', sku: 'F7938', unit_cost: 1400, color: 'อบขาว' }], PB);
  ok('ชื่อขึ้นต้นด้วยรหัส (F7938B) ยังอ่านรหัสจากชื่อได้', ov2.ALUCODE?.F7938B === 1400, String(ov2.ALUCODE?.F7938B));
  // แถว BOM ที่ ชื่อขึ้นต้นด้วยรหัส (เช่น 'F7935 คิ้วกระจก' จาก migration 0083) ห้ามกดราคาเส้นจริงลง
  //   ราคาเส้น = อบขาว → ถูกสุดในบรรดาแถวที่มีสี → ค่อยตกมาแถวไม่มีสี (ใช้ตอนไม่มีเส้นจริงเลย)
  {
    const realOnly = [{ name: 'F7935-คิ้วกรอบบาน-ลายไม้สักทอง', sku: 'F7935', unit_cost: 570, color: 'ลายไม้สักทอง' }];
    const bom = { name: 'F7935 คิ้วกระจก', sku: '', unit_cost: 385, color: '' };
    ok('แถว BOM ไม่กดราคาเส้นจริง (570 ไม่ใช่ 385)', buildPriceOverride([...realOnly, bom], PB).ALUCODE?.F7935 === 570, String(buildPriceOverride([...realOnly, bom], PB).ALUCODE?.F7935));
    ok('ไม่มีเส้นจริงเลย → ยังใช้ราคา BOM ได้ (385)', buildPriceOverride([bom], PB).ALUCODE?.F7935 === 385, String(buildPriceOverride([bom], PB).ALUCODE?.F7935));
  }
  // แถว migration 0083 ยังผูกราคาผ่าน PARTS (ชื่อ) ได้ตามเดิม
  const ov3 = buildPriceOverride([{ name: 'วงกบ 3 ด้าน F7859', sku: '', unit_cost: 1100, color: '' }], PB);
  ok('แถว PARTS (ชื่อ) ยังผูกราคาได้เหมือนเดิม', ov3.PARTS?.['วงกบ 3 ด้าน F7859'] === 1100, String(ov3.PARTS?.['วงกบ 3 ด้าน F7859']));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
