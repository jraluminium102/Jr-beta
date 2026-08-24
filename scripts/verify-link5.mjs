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
  for (const c of ['F7859', 'F7938B', 'F7960', 'F7863', 'F7864', 'F7935', 'F7945C'])
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
  // ยอดอุปกรณ์ต้องเท่าชีตถอดทุน (แบ่ง 2 มีธรณี ใส่ซอฟโค้ด): 468+1170+396+450+8 = 2,492
  const r = computeCost(PB, P, { w: 150, h: 200, p: 2, form: 'แบ่ง 2', color: 'white', colorKey: 'white', glassType: 'เขียว 6มม.', spec: { pcsill: 'มีธรณี', pcsoft: 'ใส่' } });
  ok(`ค่าอุปกรณ์ = 2,492+ยาง 154 ตามชีต (฿${Math.round(r.cost.hardware)})`, Math.abs(r.cost.hardware - 2646) <= 1, String(r.cost.hardware));
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

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
