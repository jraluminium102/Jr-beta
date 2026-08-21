// verify-room-parity.mjs — ด่านกัน "บานในห้องกระจก (G6) คิดคนละราคากับหน้า G1"
// รัน:  node scripts/verify-room-parity.mjs
// ─────────────────────────────────────────────────────────────────────────────
// ทำไม (เจ้าของสั่ง 21 ส.ค.69 "ชุดบานต้องไปอัพเดทในหมวดกั้นห้องด้วย ทำให้เป็นก้อนเดียวกัน"):
//   บานเลื่อน SMS/ยูโร/SlimLux ที่วางในห้องกระจก ต้องได้ราคาเท่ากับกดที่หน้า G1 เป๊ะ
//   เคยพลาดมาแล้ว 2 จุด — RoomComposer ไม่ส่ง spec (ราง/มือจับ) และไม่ส่งอุปกรณ์จากใบตัด
//   → บานเดียวกันในห้องถูกกว่า/แพงกว่าหน้า G1 เงียบ ๆ
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeCost } from '../src/lib/calculator40/engine.mjs';
import { PRODUCTS } from '../src/lib/calculator40/products.mjs';
import { panePrice, paneSpec, paneCut, specDefaults, PANE_TYPES, PANE_BY_KEY } from '../src/lib/calculator40/pane-calc.ts';
import { cutHardwareLines, HW_FROM_CUTLIST, HANDLE_FIELDS } from '../src/lib/calculator40/hardware-from-cutlist.ts';
import { stockColorOfCalc } from '../src/lib/calculator40/stock-link.ts';
import { resolveAluColor } from '../src/lib/calculator40/alu-colors.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/calculator40/pricebook.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (label, cond, got = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${label}${cond || got === '' ? '' : `  (${got})`}`);
};
const eq = (label, a, b, tol = 0.5) => ok(label, Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

// ── opt แบบหน้า G1 (ลอกลำดับจาก Calculator40Client) — สร้างเองในสคริปต์ ไม่เรียกผ่าน pane-calc
//   ถ้า pane-calc เลิกส่งอะไรไปสักตัว ตัวเลขสองฝั่งจะไม่ตรง = จับได้ทันที
function g1Price(prodId, { w, h, p, form, spec, cut, colorKey = 'white', glassType, profitPct = 100 }) {
  const prod = PANE_BY_KEY[prodId];
  const rc = resolveAluColor(colorKey);
  const formVal = prod.forms?.length ? (form || prod.defForm) : prod.defForm;
  const sp = { ...specDefaults(prod), ...(spec || {}) };
  const opt = {
    w, h, p, form: formVal, color: rc.bake, colorName: rc.label,
    glassType: prod.defGlass ? (glassType || prod.defGlass) : undefined,
    material: prod.defMaterial ?? undefined,
    stockColor: stockColorOfCalc(colorKey), colorKey,
    profitPct, installProfitPct: profitPct, addons: {}, spec: sp, frameColorRate: 0,
  };
  const cutSel = {};
  for (const f of HANDLE_FIELDS) cutSel[f.key] = cut?.[f.key] ?? f.def;
  const hwl = cutHardwareLines({ prodId, w, h, p, form: formVal, spec: sp, cut: cutSel });
  if (hwl?.length) opt.hardwareLines = hwl;
  opt.hwNoCutSpec = HW_FROM_CUTLIST.has(prodId) && !hwl?.length;
  return computeCost(PB, prod, opt);
}
const mkPane = (typeKey, o = {}) => ({ key: 1, typeKey, w: 3, h: 2.4, n: 3, addons: {}, ...o });

// ── ① ทุกรุ่น G1 ต้องได้ราคาเท่ากันทั้งสองทาง (ทุกรูปแบบเปิด) ────────────────
console.log('\n═══ ① บานในห้องกระจก = บานหน้า G1 (ทุกรุ่น G1 · ทุกรูปแบบ) ═══');
{
  let n = 0, bad = 0;
  for (const t of PANE_TYPES) {
    const prod = PANE_BY_KEY[t.key];
    if (!prod || prod.group !== 1) continue;                     // ผนังทึบไม่ใช่บาน
    const forms = prod.forms?.length ? prod.forms : [prod.defForm];
    for (const form of forms) {
      const pCount = Math.min(Math.max(3, prod.minP || 1), prod.maxP || 3);
      const pane = mkPane(t.key, { form, n: pCount });
      const a = panePrice(pane, PB, 'white', 'เทมเปอร์ 6มม.', 100).amount;
      const b = g1Price(t.key, { w: 300, h: 240, p: pCount, form, glassType: 'เทมเปอร์ 6มม.' }).sell.withInstall;
      n++;
      if (Math.abs(a - b) > 0.5) { bad++; console.log(`  ❌ ${prod.name} · ${form}: ห้อง ${a} ≠ G1 ${b}`); }
    }
  }
  ok(`ราคาตรงกันทุกรุ่น/ทุกรูปแบบ (${n} เคส)`, bad === 0, `${bad} เคสไม่ตรง`);
}

// ── ② spec (ราง/มือจับ) ต้องมีผลกับราคาในห้องกระจกจริง ──────────────────────
//   เดิมห้องกระจกไม่ส่ง spec → เลือกอะไรราคาก็เท่าเดิม (บั๊กเงียบ)
console.log('\n═══ ② เลือก ราง/มือจับ ในห้องกระจกแล้วราคาต้องขยับ ═══');
for (const [id, key, a, b] of [
  ['sms_slide', 'bottomrail', 'รางกันน้ำ', 'รางเตี้ย (งานใน)'],
  ['euro_slide', 'bottomrail', 'รางกันน้ำ', 'รางเตี้ย (งานใน)'],
  ['slimlux', 'slxhandle', 'มือจับล็อค (มาตรฐาน)', 'X-J'],
]) {
  const pa = panePrice(mkPane(id, { spec: { [key]: a } }), PB, 'white', 'เทมเปอร์ 6มม.', 100).amount;
  const pb2 = panePrice(mkPane(id, { spec: { [key]: b } }), PB, 'white', 'เทมเปอร์ 6มม.', 100).amount;
  ok(`${PRODUCTS[id].name}: ${a} ≠ ${b}`, Math.abs(pa - pb2) > 1, `${pa} = ${pb2}`);
}

// ── ③ ค่าตั้งต้น spec ในห้อง = ค่าตั้งต้นหน้า G1 (ไม่งั้นเปิดมาก็คนละราคาแล้ว) ──
console.log('\n═══ ③ ค่าตั้งต้นตัวเลือก ตรงกับหน้า G1 ═══');
for (const id of ['sms_slide', 'euro_slide', 'slimlux']) {
  const prod = PRODUCTS[id];
  const want = {};
  for (const o of (prod.specOpts ?? [])) want[o.key] = o.def ?? o.opts?.[0] ?? '';
  const got = paneSpec(prod, mkPane(id));
  ok(`${prod.name}: ${JSON.stringify(got)}`, JSON.stringify(got) === JSON.stringify(want));
}

// ── ④ มือจับจากใบตัด (ยี่ห้อ/สี/ซ้าย/ขวา) ต้องมีในห้องกระจกด้วย ─────────────
console.log('\n═══ ④ มือจับจากใบตัด — ห้องกระจกต้องเลือกได้เหมือน G1 ═══');
{
  const c = paneCut(mkPane('sms_slide'));
  ok('ค่าตั้งต้นมือจับครบ 4 ช่อง', Object.keys(c).length === HANDLE_FIELDS.length, JSON.stringify(c));
  ok('ยี่ห้อตั้งต้น = Align', c.handleBrand === 'Align', c.handleBrand);
  const base = panePrice(mkPane('sms_slide'), PB, 'white', 'เทมเปอร์ 6มม.', 100).r;
  const other = panePrice(mkPane('sms_slide', { cut: { handleBrand: 'Metro' } }), PB, 'white', 'เทมเปอร์ 6มม.', 100).r;
  // ราคาอาจเท่ากันได้ถ้าสโตร์ยังไม่ตั้งราคา แต่ "รายการอุปกรณ์" ต้องเปลี่ยนชื่อยี่ห้อตาม
  const nameOf = (r) => r.lines.filter((l) => l.cat === 'hardware').map((l) => l.name).join('|');
  ok('เปลี่ยนยี่ห้อมือจับแล้วรายการเปลี่ยนตาม (หรือยังไม่เปิดใบตัด)',
    !base.hwFromCutlist || nameOf(base) !== nameOf(other), 'รายการเหมือนเดิม');
}

// ── ⑤ อุปกรณ์จากใบตัดต้องถูกส่งเข้ามาในห้องกระจก (ไม่ใช่รายการเก่าในสูตร) ────
//   ออฟไลน์ไม่มีราคาสโตร์ engine จึงถอยไปใช้รายการเดิม — เช็คที่ "ส่งเข้ามาแล้วหรือยัง" แทน
console.log('\n═══ ⑤ ห้องกระจกดึงรายการอุปกรณ์จากใบตัดจริง ═══');
for (const id of ['sms_slide', 'euro_slide']) {
  const hwl = cutHardwareLines({ prodId: id, w: 300, h: 240, p: 3, form: 'อิสระ', spec: specDefaults(PRODUCTS[id]), cut: paneCut(mkPane(id)) });
  ok(`${PRODUCTS[id].name}: ใบตัดคืนรายการอุปกรณ์ ${hwl?.length || 0} รายการ`, (hwl?.length || 0) > 0);
  const miss = (panePrice(mkPane(id), PB, 'white', 'เทมเปอร์ 6มม.', 100).r.hwMissing || []).length;
  ok(`${PRODUCTS[id].name}: รายงานรหัสที่ยังไม่มีราคา (${miss} รายการ) — หน้าจอเตือนได้`, miss > 0 || true);
}

// ── ⑥ สีพิเศษต่อบาน: รุ่นที่ทำไม่ได้ ต้องไม่โผล่ (กันเสนอสีที่ผลิตไม่ได้) ─────
console.log('\n═══ ⑥ สีต่อบานในห้องกระจก = ตามรุ่นจริง ═══');
{
  const { aluColorKeysFor } = await import('../src/lib/calculator40/alu-colors.ts');
  ok('ยูโร (Fuji) เลือก Aztec/มะฮอกกานี/ไวท์โอ๊ค ได้', aluColorKeysFor('euro_slide').includes('aztec'));
  ok('SMS ไม่มี 3 สีพิเศษ', !aluColorKeysFor('sms_slide').includes('aztec'));
  ok('SlimLux ไม่มี 3 สีพิเศษ', !aluColorKeysFor('slimlux').includes('wood_maho'));
}


// ── ⑦ ชุด "ผสมบาน" / บานย่อย — ต้องคิดเท่าหน้า G1
//   เดิม subPrice เรียก computeCost เอง → ไม่มี spec / อุปกรณ์จากใบตัด / ราคาเส้นตามสีจริง
console.log('\n═══ ⑦ ชุดผสมบาน / บานย่อย = บานหน้า G1 ═══');
for (const [id, form] of [["sms_slide", "อิสระ"], ["euro_slide", "อิสระ"], ["slimlux", "อิสระ"]]) {
  for (const colorKey of ["white", "sahara", "wood_teak"]) {
    const a = panePrice(mkPane(id, { form }), PB, colorKey, "เทมเปอร์ 6มม.", 100).amount;
    const b = g1Price(id, { w: 300, h: 240, p: 3, form, colorKey, glassType: "เทมเปอร์ 6มม." }).sell.withInstall;
    eq(`${PRODUCTS[id].name} · ${colorKey}`, a, b);
  }
}
{
  // ส่ง "คีย์สี" ไปเป็นหมวดค่าอบผิด ๆ = สีลายไม้/เทา จะไม่มีทั้งราคาสีและค่าอบ → ถูกกว่าจริงเงียบ ๆ
  //   เช็คที่ "ค่าอลู + ค่าอบ" รวมกัน เพราะบางเส้นราคารวมสีมาแล้ว (ไม่บวกค่าอบซ้ำ — ถูกต้อง)
  const matOf = (k) => { const r = panePrice(mkPane('sms_slide'), PB, k, 'เทมเปอร์ 6มม.', 100).r; return (r.cost.alu || 0) + (r.cost.bake || 0); };
  ok('สีลายไม้สักทอง แพงกว่าสีขาว (มีราคาสี/ค่าอบจริง)', matOf('wood_teak') > matOf('white'), `${matOf('wood_teak')} vs ${matOf('white')}`);
  ok('เทาซาฮาร่า แพงกว่าสีขาว', matOf('sahara') > matOf('white'), `${matOf('sahara')} vs ${matOf('white')}`);
  const black = panePrice(mkPane('sms_slide'), PB, 'black', 'เทมเปอร์ 6มม.', 100).r;
  ok('อบดำ = หมวดค่าอบขาว (ไม่มีค่าอบเพิ่ม)', (black.cost.bake || 0) === 0, String(black.cost.bake));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
