/**
 * verify-compare-cut — ตัวตรวจหน้า "เทียบคิดราคา 4.0 ↔ ใบตัด"
 * รัน: node --experimental-strip-types scripts/verify-compare-cut.mjs
 *
 * ⚠ ข้อกังวลหลักของเจ้าของ (19 ส.ค.69): "ห้ามสร้างใหม่ ดึงข้อมูลเดิมมาแสดง
 *    เวลาอัพเดทจะได้อัพเดทก้อนเดียวเปลี่ยนทั้งเว็บ ชั้นกังวลมากว่ามันอัพเดทแยกกัน"
 *
 * ตัวตรวจนี้จึงล็อก 2 ชั้น:
 *   ① ผลบนหน้าเทียบ ต้อง "เท่ากันเป๊ะ" กับผลที่ได้จากการเรียก engine ตัวจริงตรง ๆ
 *      (ถ้าวันหน้าใครไปเขียนสูตรซ้ำในหน้านี้ ตัวเลขจะเริ่มเพี้ยน → เทสแดง)
 *   ② แก้สูตรที่ต้นทาง แล้วหน้าเทียบต้องขยับตาม (เทสด้วย pricebook ปลอมที่ราคาต่าง)
 *   ③ ตัวไฟล์เองต้องไม่มีเลขราคา/สูตรฝังไว้
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareCut, COMPARABLE } from "../src/lib/calculator40/compare-cut.ts";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCutList } from "../src/lib/cutlist/engine.ts";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { cutHardwareLines } from "../src/lib/calculator40/hardware-from-cutlist.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/calculator40/pricebook.json"), "utf8"));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  " + extra}`); };

const CUT = { handleBrand: "เมโทร", handleColor: "อบขาว", handleL: "กุญแจ+ล็อค", handleR: "ล็อค+ดัมมี่" };
const IN = { prodId: "sms_slide", w: 600, h: 300, p: 3, form: "อิสระ", color: "white", spec: { bottomrail: "รางกันน้ำ" }, cut: CUT };

console.log("\n═══ ① ตัวเลขบนหน้าเทียบ = ผลจาก engine ตัวจริง (ไม่ได้คิดใหม่) ═══");
{
  const r = compareCut(PB, IN);
  ok("เทียบได้ (แมปเข้าสูตรใบตัดสำเร็จ)", r?.ok === true, r?.note ?? "");

  // ฝั่งคิดราคา: เรียก computeCost ตรง ๆ ด้วยอินพุตเดียวกัน ต้องได้เลขเดียวกัน
  const hwl = cutHardwareLines({ prodId: "sms_slide", w: 600, h: 300, p: 3, form: "อิสระ", spec: IN.spec, cut: CUT });
  const direct = computeCost(PB, PRODUCTS.sms_slide, {
    w: 600, h: 300, p: 3, form: "อิสระ", color: "white", colorName: "อบขาว", stockColor: "อบขาว",
    glassType: PRODUCTS.sms_slide.defGlass, spec: IN.spec, addons: {},
    profitPct: 100, installProfitPct: 100, ...(hwl?.length ? { hardwareLines: hwl } : {}),
  });
  ok("ทุนรวม ตรงกับ computeCost เป๊ะ", r.totals.costTotal === direct.cost.total, `${r.totals.costTotal} vs ${direct.cost.total}`);
  ok("ทุนอลู ตรงเป๊ะ", r.totals.aluCost === direct.cost.alu, `${r.totals.aluCost} vs ${direct.cost.alu}`);
  ok("ค่าของ ตรงเป๊ะ", r.totals.hwCost === direct.cost.hardware + direct.cost.consum, "");
  ok("ราคาขาย (พร้อมติดตั้ง) ตรงเป๊ะ", r.totals.sellInstall === direct.sell.withInstall, `${r.totals.sellInstall} vs ${direct.sell.withInstall}`);
  ok("ค่าแรง ตรงเป๊ะ", r.totals.laborProd === direct.labor.prod && r.totals.laborInstall === direct.labor.install, "");
  ok("น้ำหนักอลู ตรงเป๊ะ", r.totals.aluKg === direct.aluKg, "");
  ok("จำนวนเส้นฝั่งคิดราคา = ผลรวมบรรทัดอลูของ engine",
    r.totals.calcAluBars === direct.lines.filter((l) => l.cat === "alu").reduce((s, l) => s + l.qty, 0), "");

  // ฝั่งใบตัด: เรียก computeCutList ตรง ๆ ต้องได้เลขเดียวกัน
  const cut = computeCutList(CUT_SPEC_BY_ID["sms_slide_free"],
    { W: 600, H: 300, N: 3, rail: "3รางเสียบ", honk: false, ...CUT }, 1);
  ok("จำนวนเส้นฝั่งใบตัด = barsByCode ของ computeCutList",
    r.totals.cutBarsByCode === cut.barsByCode.reduce((s, b) => s + b.bars, 0), "");
  ok("บรรทัดใบตัดที่โชว์ = rows ของ computeCutList", r.cutRows.length === cut.rows.length, "");
  for (const b of cut.barsByCode) {
    const row = r.alu.find((a) => a.code === b.code);
    if (!row) { ok(`รหัส ${b.code} ต้องมีในตารางเทียบ`, false, ""); continue; }
    ok(`${b.code}: เส้นฝั่งใบตัดตรงกับ engine (${b.bars})`, row.cutBars === b.bars, `${row.cutBars}`);
  }
  // รหัสเดียวโผล่หลายบรรทัดในใบตัด (เช่น JR00864 น็อต ประกอบบาน+ประกอบเฟรม) = ของชิ้นเดียวกัน
  //   หน้าเทียบยุบเป็นแถวเดียวต่อรหัส (ตรงกับที่หักสต็อกจริง) → เทียบยอดรวมต่อรหัส
  const cutBySku = new Map();
  for (const h of cut.hardware) cutBySku.set(h.sku || h.name, (cutBySku.get(h.sku || h.name) ?? 0) + h.qty);
  for (const [sku, qty] of cutBySku) {
    const row = r.hardware.find((x) => x.sku === sku || x.name === sku);
    ok(`อุปกรณ์ ${sku}: ยอดรวมฝั่งใบตัดตรงกับ engine (${qty})`, row && Math.abs(row.cutQty - qty) < 0.05, String(row?.cutQty));
  }
  ok("รหัสซ้ำหลายบรรทัด ยุบเป็นแถวเดียว (ตรงกับที่หักสต็อกจริง)",
    r.hardware.filter((x) => x.sku === "JR00864").length === 1, "");
}

console.log("\n═══ ② แก้ราคาที่ต้นทาง → หน้าเทียบต้องขยับตาม (ไม่ได้ก๊อปราคาไว้เอง) ═══");
{
  const before = compareCut(PB, IN);
  const PB2 = JSON.parse(JSON.stringify(PB));
  PB2.ALU.SMS = PB.ALU.SMS * 2;                       // ขึ้นเรตอลูเท่าตัว
  const afterAlu = compareCut(PB2, IN);
  ok("ขึ้นเรตอลูที่ pricebook → ทุนอลูบนหน้าเทียบขยับ", afterAlu.totals.aluCost > before.totals.aluCost, "");
  ok("หัวตารางโชว์เรต ฿/กก. ตามที่ตั้งจริง", afterAlu.aluRate.rate === PB.ALU.SMS * 2, String(afterAlu.aluRate.rate));
  ok("ตัวคูณ (เรตปัจจุบัน ÷ ตั้งต้น) คิดจากของจริง", afterAlu.aluRate.mult === 2, String(afterAlu.aluRate.mult));

  const PB3 = JSON.parse(JSON.stringify(PB));
  PB3.GLASS[PRODUCTS.sms_slide.defGlass] = (PB.GLASS[PRODUCTS.sms_slide.defGlass] ?? 0) + 500;
  ok("ขึ้นราคากระจกที่ pricebook → กระจกบนหน้าเทียบขยับ",
    compareCut(PB3, IN).totals.glassCost > before.totals.glassCost, "");

  const PB4 = JSON.parse(JSON.stringify(PB));
  PB4.LABOR[PRODUCTS.sms_slide.laborKey].pBase += 1000;
  ok("ขึ้นค่าแรงที่ pricebook → ค่าแรงบนหน้าเทียบขยับ",
    compareCut(PB4, IN).totals.laborProd > before.totals.laborProd, "");
}

console.log("\n═══ ③ จับ 'ไม่ตรงกัน' ได้จริง (ไม่ใช่ขึ้นเขียวหมดทุกกรณี) ═══");
{
  const r = compareCut(PB, IN);
  const all = [...r.alu, ...r.hardware];
  ok("มีคอลัมน์สถานะครบทุกแถว", all.every((x) => ["ตรง", "จำนวนต่าง", "มีแต่คิดราคา", "มีแต่ใบตัด", "ไม่มีรหัส"].includes(x.status)), "");
  // ยัดบรรทัดอลูปลอมเข้าไปในสูตรคิดราคา → ต้องขึ้น "มีแต่คิดราคา"
  const fake = JSON.parse(JSON.stringify(PRODUCTS.sms_slide));
  fake.alu.push({ name: "เส้นปลอมทดสอบ", code: "ZZ9999", price: 100, kg: 1, seg: "W", count: "1" });
  const savedProd = PRODUCTS.sms_slide;
  PRODUCTS.sms_slide = fake;
  const r2 = compareCut(PB, IN);
  PRODUCTS.sms_slide = savedProd;
  const z = r2.alu.find((a) => a.code === "ZZ9999");
  ok("อลูที่มีแต่ฝั่งคิดราคา → ขึ้น 'มีแต่คิดราคา'", z?.status === "มีแต่คิดราคา", z?.status ?? "ไม่เจอ");
  ok("เรียงแถวที่ไม่ตรงขึ้นก่อนแถวที่ตรง", r2.alu[0].status !== "ตรง" || r2.alu.every((a) => a.status === "ตรง"), r2.alu[0].status);
  ok("ฟ้อง ฿/กก. รายเส้น (ราคาเส้น ÷ น้ำหนักเส้น)",
    r.alu.filter((a) => a.kgPerBar > 0).every((a) => Math.abs(a.bahtPerKg - a.calcPricePerBar / a.kgPerBar) < 0.02), "");
  ok("รุ่นที่แมปใบตัดไม่ได้ → บอกเหตุผล ไม่ใช่พังเงียบ",
    compareCut(PB, { ...IN, form: "เปิดคู่กลาง", p: 3 })?.ok === false, "");
  ok("รุ่นที่ไม่มีในระบบ → คืน null ไม่ throw", compareCut(PB, { ...IN, prodId: "ไม่มีจริง" }) === null, "");
  ok("รายชื่อรุ่นที่เทียบได้ ตรงกับที่ from-recipe รองรับ", COMPARABLE.length === 7, String(COMPARABLE.length));
  for (const id of COMPARABLE) ok(`รุ่น ${id} มีอยู่จริงในคิดราคา`, !!PRODUCTS[id], "");
}

// ── ③b โหนกเกี่ยว: ใบตัดต้องออโต้ตามความสูงเท่ากับคิดราคา (เจ้าของเจอเอง 19 ส.ค.69) ──
//   คิดราคา 4.0 ใช้กฎ H > 2.4 ม. → เสาเกี่ยวรับแรง B20010 (สูตร count: 'H>2.4?F6:0')
//   ใบตัดเดิมให้ติ๊กเอง + from-recipe ส่ง honk:false ตายตัว → บานสูงแล้วสองฝั่งไม่ตรงกัน
console.log("\n═══ ③b โหนกเกี่ยว ออโต้ตามความสูง (คิดราคา ↔ ใบตัด ต้องตรงกัน) ═══");
{
  const at = (h) => compareCut(PB, { ...IN, h });
  const row = (r, c) => r.alu.find((a) => a.code === c);
  for (const h of [150, 200, 240]) {
    const r = at(h);
    ok(`สูง ${h} ซม. (ไม่เกิน 240) → ใช้เสาเกี่ยวธรรมดา ตรงกันสองฝั่ง`, row(r, 'B20009')?.status === 'ตรง', row(r, 'B20009')?.status);
    ok(`สูง ${h} ซม. → ไม่มีเสาเกี่ยวรับแรงทั้งสองฝั่ง`, !row(r, 'B20010'), JSON.stringify(row(r, 'B20010') ?? {}));
  }
  for (const h of [241, 280, 300]) {
    const r = at(h);
    ok(`สูง ${h} ซม. (เกิน 240) → เสาเกี่ยวรับแรง B20010 ตรงกันสองฝั่ง`, row(r, 'B20010')?.status === 'ตรง', row(r, 'B20010')?.status);
    ok(`สูง ${h} ซม. → เสาเกี่ยวธรรมดาก็ต้องตรงด้วย`, row(r, 'B20009')?.status === 'ตรง', row(r, 'B20009')?.status);
  }
  ok('เส้นแบ่งอยู่ที่ 240 พอดี (240 = ธรรมดา · 241 = โหนก)',
    !row(at(240), 'B20010') && row(at(241), 'B20010')?.cutBars > 0, '');
  ok('ติ๊กโหนกเองยังบังคับเปิดได้ แม้บานเตี้ย',
    compareCut(PB, { ...IN, h: 200, cut: { ...CUT, honk: true } }).alu.find((a) => a.code === 'B20010')?.cutBars > 0, '');
  ok('600×300 3 บาน — อลูตรงกันทุกรหัส (เคสที่เจ้าของเจอ)',
    at(300).alu.every((a) => a.status === 'ตรง'), at(300).alu.filter((a) => a.status !== 'ตรง').map((a) => `${a.code}:${a.status}`).join(','));
}

console.log("\n═══ ④ ห้ามมีสูตร/ราคาฝังในหน้านี้ (กันอัปเดตแยกกัน) ═══");
{
  const lib = fs.readFileSync(path.join(ROOT, "src/lib/calculator40/compare-cut.ts"), "utf8");
  const cli = fs.readFileSync(path.join(ROOT, "src/app/(app)/calculator40/compare/CompareClient.tsx"), "utf8");
  const page = fs.readFileSync(path.join(ROOT, "src/app/(app)/calculator40/compare/page.tsx"), "utf8");

  ok("ดึงสูตรคิดราคาจาก engine.mjs", lib.includes("from \"./engine.mjs\""), "");
  ok("ดึงสูตรใบตัดจาก cutlist/engine", lib.includes("computeCutList"), "");
  ok("ดึงตัวแมปจาก from-recipe (ไม่ทำ mapping เอง)", lib.includes("cutInputFromRecipe"), "");
  ok("ดึงรายการอุปกรณ์จากตัวเดียวกับหน้าคิดราคา", lib.includes("cutHardwareLines"), "");
  ok("ราคาสโตร์ใช้ชุดเดียวกับหน้าคิดราคา (buildPriceOverride)", page.includes("buildPriceOverride") && page.includes("applyPriceOverride"), "");
  ok("ดึงสต็อกแบบแบ่งหน้า (กัน cap 1,000 แถว)", page.includes("fetchAllPaged"), "");
  ok("ต้องมีสิทธิ์เขียนถึงเข้าได้", page.includes("canWrite"), "");

  // ตัวเลขราคาห้ามฝังในไฟล์ — ยอมเฉพาะเลขจัดหน้า/ปัดเศษ
  const litLib = [...lib.matchAll(/(?<![\w.])\d{3,}(?![\w])/g)].map((m) => m[0]).filter((x) => x !== "100" && x !== "1000");
  ok("compare-cut.ts ไม่มีเลขราคาฝังไว้", litLib.length === 0, litLib.join(","));
  ok("ไม่ได้เขียนสูตรราคา/ค่าแรงเองในหน้าจอ",
    !/\*\s*\(1\s*\+/.test(cli) && !cli.includes("pBase") && !cli.includes("ALUCODE"), "");
  ok("หน้าจอไม่เรียก computeCost/computeCutList ตรง ๆ (ผ่าน compare-cut ชั้นเดียว)",
    !cli.includes("computeCost(") && !cli.includes("computeCutList("), "");
  ok("มีทางเข้าจากหน้าคิดราคา",
    fs.readFileSync(path.join(ROOT, "src/components/Calculator40Client.tsx"), "utf8").includes("/calculator40/compare"), "");
  ok("โชว์ ฿/กก. ของอลูที่ใช้ (เจ้าของสั่ง)", cli.includes("฿/กก.") && cli.includes("aluRate"), "");
  ok("โชว์ รหัส/ชื่อ/ราคา/จำนวน ทั้งสองฝั่ง",
    cli.includes("รหัส") && cli.includes("คิดราคา") && cli.includes("ใบตัด") && cli.includes("฿/เส้น"), "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
