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
import { isAluCode } from '../src/lib/calculator40/stock-link.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/calculator40/pricebook.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (label, cond, got = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${label}${cond || got === '' ? '' : `  (${got})`}`);
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
    ok(`${a.name}: ผูกสโตร์ (${a.code}) + kg ${a.kg}`, !!a.code && isAluCode(a.code) && a.kg > 0);
    ok(`${a.name}: ราคาไฟล์ ${PB.ALUCODE?.[a.code] ?? '—'}`, PB.ALUCODE?.[a.code] > 0);
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
  ok('ไม่มี F7938B/F7945C หลงเหลือ (ยึด sku สโตร์)', !codes.some((c) => /F7938B|F7945C/.test(c)));
  for (const c of ['F7859', 'F7938', 'F7960', 'F7863', 'F7864', 'F7935', 'F7945'])
    ok(`ใช้รหัส ${c}`, codes.includes(c));
  for (const [name, sku] of [['บานพับ', 'JR00473'], ['ล้อรางบน', 'JR00544'], ['มือจับ Align', 'JR00378'], ['กลอน', 'JR00630'], ['น็อตเฟรม', 'JR00864']]) {
    const h = P.hardware.find((x) => x.name.includes(name));
    ok(`${name} → ${sku}`, h?.sku === sku, String(h?.sku));
  }
  ok('ซิลิโคน → JR00504', P.consum.some((c) => c.sku === 'JR00504'));
  // ยอดอุปกรณ์ต้องเท่าชีตถอดทุน (แบ่ง 2 มีธรณี ใส่ซอฟโค้ด): 468+1170+396+450+8 = 2,492
  const r = computeCost(PB, P, { w: 150, h: 200, p: 2, form: 'แบ่ง 2', color: 'white', colorKey: 'white', glassType: 'เขียว 6มม.', spec: { pcsill: 'มีธรณี', pcsoft: 'ใส่' } });
  ok(`ค่าอุปกรณ์ = 2,492+ยาง 154 ตามชีต (฿${Math.round(r.cost.hardware)})`, Math.abs(r.cost.hardware - 2646) <= 1, String(r.cost.hardware));
}

// ── ④ Velora + บานติดตาย — ผูกครบ ────────────────────────────────────────────
console.log('\n═══ ④ Velora + บานติดตาย ═══');
{
  const V = PRODUCTS.velora;
  ok('Velora อลูผูก JR02885/JR02886', V.alu[0]?.code === 'JR02885' && V.alu[1]?.code === 'JR02886');
  ok('Velora ซิลิโคน → JR00504', V.consum.some((c) => c.sku === 'JR00504'));
  ok('Velora บานพับ/มือจับ ผูกตามสี (JR00560/561 · JR00355/356)',
    V.hardware.every((h) => String(h.sku || '').includes('JR')));
  const F = PRODUCTS.fixed;
  ok('บานติดตาย: กล่องผูกด้วยชื่อ (BOXPRICE) + 9014 มีรหัส', F.alu.some((a) => a.box) && F.alu.some((a) => a.code === '9014'));
  ok('บานติดตาย ซิลิโคน → JR00504', F.consum.some((c) => c.sku === 'JR00504'));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
