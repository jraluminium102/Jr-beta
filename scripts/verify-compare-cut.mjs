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
import { compareCut, COMPARABLE, cutOptionsFor } from "../src/lib/calculator40/compare-cut.ts";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCutList } from "../src/lib/cutlist/engine.ts";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { cutHardwareLines } from "../src/lib/calculator40/hardware-from-cutlist.ts";
import { buildPriceOverride, applyPriceOverride, isAluCode } from "../src/lib/calculator40/stock-link.ts";

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
    Math.abs(r.totals.calcAluBars - direct.lines.filter((l) => l.cat === "alu").reduce((s, l) => s + l.qty, 0)) < 0.02, "");

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
  ok("รายชื่อรุ่นที่เทียบได้ ตรงกับที่ from-recipe รองรับ", COMPARABLE.length === 12, String(COMPARABLE.length));   // +fold_euro +fold_lift (21 ส.ค.69) · +roof กันสาด (26 ส.ค.69) · +roof_gable หลังคาจั่ว (27 ส.ค.69)
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

// ── ③c SMS ปิดจบ: คิดราคา = ใบตัด ทุกรูปแบบ × ทุกราง (เจ้าของเคาะ 19 ส.ค.69) ──
//   ① ตบปิดรางเตี้ย B20050 = 2 เส้นคงที่ (ตามใบตัด ไม่ใช่ตามจำนวนบาน)
//   ② เปิดคู่กลาง ต้องมีชนกลาง B20046 1 ชิ้น (เดิมคิดราคาไม่คิดเงิน = ขาดของ)
//   ③ ตบรางล้อ F7994 คิดตาม "ร่องราง" (อิสระ/สลับ/ลากจูง = จำนวนบาน · เปิดคู่กลาง = 2)
//      และรางเตี้ยไม่ใช้ F7994 เลย (ใช้ B20050 แทน — เจ้าของยืนยัน 8 ส.ค.69)
console.log("\n═══ ③c SMS บานเลื่อน — คิดราคา = ใบตัด ทุกเคส ═══");
{
  const SK = ["JR00576","JR00368","JR00369","JR00370","JR00478","JR00479","JR00476",
    "JR00475","JR00477","JR00864","JR00863","JR00794","JR00589","JR00485","JR00504"];
  const pbFull = applyPriceOverride(JSON.parse(JSON.stringify(PB)),
    buildPriceOverride(SK.map((s) => ({ name: s, sku: s, unit_cost: 100 })), PB));
  let bad = 0, n = 0;
  for (const [form, p] of [["อิสระ", 3], ["อิสระ", 2], ["สลับ", 3], ["ลากจูง", 3], ["เปิดคู่กลาง", 4]])
    for (const rail of ["รางกันน้ำ", "รางเตี้ย (งานใน)"])
      for (const h of [200, 300]) {
        n++;
        const r = compareCut(pbFull, { ...IN, p, h, form, spec: { bottomrail: rail } });
        const diff = [...r.alu, ...r.hardware].filter((x) => x.status !== "ตรง");
        if (diff.length) { bad++; console.log(`   ${form}(${p}) ${rail} สูง${h}: ${diff.map((d) => (d.code || d.sku) + ":" + d.status).join(", ")}`); }
      }
  ok(`ทุกรูปแบบ × ทุกราง × 2 ความสูง (${n} เคส) คิดราคาตรงใบตัดหมด`, bad === 0, `ไม่ตรง ${bad} เคส`);

  const at = (form, p, rail) => compareCut(pbFull, { ...IN, p, form, spec: { bottomrail: rail } });
  const bar = (r, c) => r.alu.find((a) => a.code === c);
  ok("รางเตี้ย: ไม่ใช้ตบรางล้อ F7994 ทั้งสองฝั่ง", !bar(at("อิสระ", 3, "รางเตี้ย (งานใน)"), "F7994"), "");
  ok("รางเตี้ย: ตบปิดราง B20050 = 2 ชิ้น (ตามใบตัด)",
    bar(at("อิสระ", 3, "รางเตี้ย (งานใน)"), "B20050")?.calcPieces === 2, "");
  ok("รางกันน้ำ: ไม่มี B20050", !bar(at("อิสระ", 3, "รางกันน้ำ"), "B20050"), "");
  ok("อิสระ 3 บาน: ตบรางล้อ 3 ชิ้น (ตามร่องราง)",
    bar(at("อิสระ", 3, "รางกันน้ำ"), "F7994")?.calcPieces === 3, "");
  ok("ลากจูง 3 บาน: ตบรางล้อ 3 ชิ้น (ไม่ใช่ 2 ตามบานเลื่อน)",
    bar(at("ลากจูง", 3, "รางกันน้ำ"), "F7994")?.calcPieces === 3, "");
  ok("เปิดคู่กลาง: ตบรางล้อ 2 ชิ้น", bar(at("เปิดคู่กลาง", 4, "รางกันน้ำ"), "F7994")?.calcPieces === 2, "");
  ok("เปิดคู่กลาง: มีชนกลาง B20046 1 ชิ้น (เดิมคิดราคาไม่คิดเงิน)",
    bar(at("เปิดคู่กลาง", 4, "รางกันน้ำ"), "B20046")?.calcPieces === 1, "");
  ok("รูปแบบอื่นต้องไม่มีชนกลาง", !bar(at("อิสระ", 3, "รางกันน้ำ"), "B20046"), "");
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

// ── เสารับแรง F7951 (บานเลื่อน FUJI/ยูโร) — สูงเกิน 2.6 ม. ต้องมี ทั้งคิดราคาและใบตัด ──
//   เจ้าของเช็คหน้างานยืนยัน 20 ส.ค.69: ใช้ "ผสมกับ" ตบเกี่ยว ไม่ใช่แทนกัน · ตัดยาวเท่ากัน จำนวนเท่ากัน
//   ไฟล์ Excel ใบตัดไม่ได้ใส่มา — เพิ่มในเว็บตามที่เจ้าของสั่ง
console.log("\n═══ เสารับแรง F7951 สูงเกิน 2.6 ม. (คิดราคา + ใบตัด) ═══");
{
  const postOf = (h) => {
    const r = computeCost(PB, PRODUCTS.euro_slide, { w: 600, h, p: 3, form: "อิสระ", color: "white" });
    const g = (re) => r.lines.filter((l) => re.test(l.name)).reduce((s, l) => s + (l.pieces || 0), 0);
    return { hook: g(/^ตบเกี่ยว/), post: g(/^เสารับแรง/) };
  };
  ok("คิดราคา สูง 2.4 ม. → ไม่มีเสารับแรง", postOf(240).post === 0, String(postOf(240).post));
  ok("คิดราคา สูง 2.6 ม. → ยังไม่มี (เกณฑ์คือ 'เกิน' 2.6)", postOf(260).post === 0, String(postOf(260).post));
  ok("คิดราคา สูง 2.7 ม. → มีเสารับแรง", postOf(270).post > 0, String(postOf(270).post));
  const at300 = postOf(300);
  // จำนวนตบเกี่ยวยึดไฟล์ตัดประกอบ (3 บาน = 4 ท่อน) · เสารับแรงไม่มีในไฟล์ → เพิ่มเท่าตบเกี่ยว
  //   ⚠ รอเจ้าของยืนยัน: "เพิ่มเข้ามา" (4+4) หรือ "แบ่งครึ่ง" (2+2)
  ok("คิดราคา 600×300 3 บาน: ตบเกี่ยวตามไฟล์ 4 + เสารับแรง 4",
    at300.hook === 4 && at300.post === 4, "ตบเกี่ยว " + at300.hook + " · เสารับแรง " + at300.post);
  ok("สูงไม่เกิน 2.6 ม. = ตบเกี่ยว 4 ตามไฟล์ · ไม่มีเสารับแรง",
    postOf(240).hook === 4 && postOf(240).post === 0, "ตบเกี่ยว " + postOf(240).hook + " · เสารับแรง " + postOf(240).post);

  const cutAt = (H) => {
    const r = computeCutList(CUT_SPEC_BY_ID.fuji_slide, { W: 600, H, N: 2, rail: "2ราง" }, 1);
    const row = (n) => r.rows.find((x) => x.name === n);
    return { hook: row("ตบเกี่ยว"), post: row("เสารับแรง") };
  };
  ok("ใบตัด FUJI มีบรรทัดเสารับแรง F7951", cutAt(300).post?.code === "F7951", "");
  ok("ใบตัด สูง 2.4 ม. → เสารับแรง 0 ท่อน", cutAt(240).post?.qty === 0, "");
  ok("ใบตัด สูง 3.0 ม. → จำนวนเท่าตบเกี่ยว", cutAt(300).post?.qty === cutAt(300).hook?.qty, "");
  ok("ใบตัด เสารับแรง ตัดยาวเท่าตบเกี่ยว", cutAt(300).post?.len === cutAt(300).hook?.len, "");
}


// ── บานเลื่อน ยูโร (FUJI) ↔ ใบตัด — เจ้าของสั่ง 20 ส.ค.69 "ผูกสโตร์ถูกตัว" ──────
//   ค่าของอุปกรณ์ต้องมาจากใบตัดชุดเดียวกับที่ช่างเบิก (รหัสสโตร์ครบทุกบรรทัด)
console.log("\n═══ ยูโร (FUJI) — ค่าของอุปกรณ์ต้องมาจากใบตัด ═══");
{
  // จำลองว่าสโตร์ตั้งราคาอุปกรณ์ครบแล้ว (ไม่ครบ = engine ถอยไปใช้รายการเดิมในสูตรโดยตั้งใจ)
  const SIM = { JR00577: 40, JR00592: 12, JR00480: 2, JR00589: 5, JR00485: 5, JR00794: 375, JR00504: 90, JR00864: 1,
    JR00368: 520, JR00369: 480, JR00370: 300, JR00377: 99, JR00378: 99, JR00379: 62, JR00475: 20, JR00476: 15, JR00477: 25, JR00478: 60, JR00479: 60 };
  const PBs = { ...PB, SKUPRICE: { ...(PB.SKUPRICE || {}), ...SIM } };
  const at = (form, p, bottomrail, handleBrand) => compareCut(PBs, { prodId: "euro_slide", w: 600, h: 300, p, form, spec: { bottomrail }, ...(handleBrand ? { cut: { handleBrand } } : {}) });

  const free3 = at("อิสระ", 3, "รางกันน้ำ");
  ok("อิสระ 3 บาน แมปเข้าใบตัด FUJI ได้", free3?.ok !== false, "");
  // ยี่ห้อมือจับ: ใช้ได้ทั้ง 2 ยี่ห้อ แต่ค่าเริ่มต้น = Align (เจ้าของเคาะ 20 ส.ค.69 · เมโทรแพงกว่า ~3.4 เท่า)
  ok("ค่าเริ่มต้นยี่ห้อมือจับ = Align",
    free3.hardware.some((h) => /Align/.test(h.name)) && !free3.hardware.some((h) => /เมโทร/.test(h.name)),
    free3.hardware.filter((h) => /มือจับ/.test(h.name)).map((h) => h.name).join(","));
  ok("เลือกเมโทรได้ (ยังเป็นออปชั่น ไม่ได้ตัดทิ้ง)",
    at("อิสระ", 3, "รางกันน้ำ", "เมโทร").hardware.some((h) => /เมโทร/.test(h.name)), "");
  ok("อุปกรณ์ทุกบรรทัดมีรหัสสโตร์ (ไม่มี 'ไม่มีรหัส')",
    free3.hardware.every((h) => !!h.sku), free3.hardware.filter((h) => !h.sku).map((h) => h.name).join(","));
  ok("อุปกรณ์ตรงกับใบตัดทุกบรรทัด",
    free3.hardware.every((h) => h.status === "ตรง"), free3.hardware.filter((h) => h.status !== "ตรง").map((h) => h.name + ":" + h.status).join(","));
  ok("มี ยางรูน้ำ + วาวรูน้ำ (ของที่เบิกจริง เดิมคิดราคาไม่มี)",
    free3.hardware.some((h) => h.sku === "JR00589") && free3.hardware.some((h) => h.sku === "JR00485"), "");
  ok("มี ซิลิโคน + น็อต ครบ (ใบตัด FUJI เดิมไม่มี)",
    free3.hardware.some((h) => h.sku === "JR00504") && free3.hardware.some((h) => h.sku === "JR00864"), "");

  // งานใน (รางเตี้ย) ต้องสลับเฟรมล่างเป็น F7902 จริง ทั้งสองฝั่ง
  // ⚠ ใช้ "เส้น" ไม่ใช่ "ชิ้น" — บรรทัดที่ไฟล์นับเป็นเส้น ช่องชิ้นจะว่าง (calcPieces = 0)
  const codesOf = (r, side) => new Set(r.alu.filter((a) => (side === "cut" ? a.cutBars : a.calcBars) > 0).map((a) => a.code));
  const inner = at("สลับ", 3, "รางเตี้ย (งานใน)");
  const outer = at("สลับ", 3, "รางกันน้ำ");
  ok("งานใน: ใบตัดใช้เฟรมล่าง F7902", codesOf(inner, "cut").has("F7902"), "");
  ok("งานใน: คิดราคาก็ใช้ F7902 เหมือนกัน", codesOf(inner, "calc").has("F7902"), "");
  ok("งานนอก: ทั้งสองฝั่งไม่มี F7902", !codesOf(outer, "cut").has("F7902") && !codesOf(outer, "calc").has("F7902"), "");
  // ตบกันสาด F7992 — งานใน (รางเตี้ย) ไม่ใช้ ทั้งคิดราคาและใบตัด (เจ้าของเคาะ 20 ส.ค.69)
  //   ของเดิม: คิดราคาคิด 1 เส้นทุกกรณี ใบตัดงานในไม่มี → งานในคิดเกิน ~฿500/ชุด
  const noAwning = (r) => !codesOf(r, "calc").has("F7992") && !codesOf(r, "cut").has("F7992");
  ok("งานใน อิสระ: ไม่มีตบกันสาด F7992 ทั้งสองฝั่ง", noAwning(inner), "");
  ok("งานใน เปิดคู่กลาง: ไม่มีตบกันสาด F7992 ทั้งสองฝั่ง", noAwning(at("เปิดคู่กลาง", 4, "รางเตี้ย (งานใน)")), "");
  // บรรทัดที่ไฟล์นับเป็น "เส้น" (ไม่บอกความยาวชิ้น) → เทียบที่ช่องเส้น ไม่ใช่ช่องชิ้น
  //   เจ้าของถาม 20 ส.ค.69: ป้าย "นับคนละหน่วย" เดิมขึ้นทุกบรรทัดพวกนี้ ทั้งที่เส้นตรงกันอยู่แล้ว
  {
    const row = (c) => outer.alu.find((a) => a.code === c);
    // เจ้าของสั่ง 20 ส.ค.69: "แค่แยกท่อนกับเส้นให้ออก อย่ามากำหนดจำนวน"
    //   ทุกเส้นต้องคิดจาก ยาวจริง × จำนวนท่อน แล้วให้ระบบหารเส้นเอง → เปลี่ยนขนาดงาน จำนวนเส้นต้องขยับ
    ok("ยูโร: ไม่มีบรรทัดไหนล็อกจำนวนเส้นตายตัวแล้ว",
      outer.alu.every((a) => !a.barCounted), outer.alu.filter((a) => a.barCounted).map((a) => a.code).join(","));
    ok("ทุกบรรทัดมีจำนวนท่อนให้เทียบกับใบตัด",
      outer.alu.filter((a) => a.calcBars > 0).every((a) => a.calcPieces > 0), "");
    ok("ตบเกี่ยว/เดือย/ตบกันสาด ตรงใบตัดทุกตัว",
      [ "F7983", "F7951", "F7986", "F7992" ].every((c) => row(c)?.status === "ตรง"),
      [ "F7983", "F7951", "F7986", "F7992" ].map((c) => c + ":" + row(c)?.status).join(","));
    // บานเตี้ยกว่าต้องใช้อลูน้อยกว่า — ของเดิมล็อกจำนวนเส้นไว้ สูง 1.5 ม. กับ 3 ม. คิดเท่ากัน
    //   เทียบ 1.5 ม. กับ 2.4 ม. (อยู่ใต้เกณฑ์ 2.6 ทั้งคู่ → จำนวนท่อนเท่ากัน ต่างแค่ความยาว)
    {
      const at2 = (h) => compareCut(PBs, { prodId: "euro_slide", w: 600, h, p: 3, form: "อิสระ", spec: { bottomrail: "รางกันน้ำ" } });
      const short = at2(150), mid = at2(240);
      const barsOf = (rr, c) => rr.alu.find((a) => a.code === c)?.calcBars ?? 0;
      for (const c of ["F7983", "F7986", "F7980", "F7978"])
        ok(`บานเตี้ยกว่าใช้อลูน้อยกว่า (${c})`, barsOf(short, c) < barsOf(mid, c),
          `${barsOf(short, c)} < ${barsOf(mid, c)}`);
    }
    ok("บรรทัดนับเป็นชิ้น: ยังเทียบชิ้นเหมือนเดิม", row("F7980")?.calcPieces === 12 && row("F7980")?.status === "ตรง", "");
    // F7988 แก้แล้ว 20 ส.ค.69: นับ "ท่อนจริง" แทน "ท่อนละเส้น" เพราะเจ้าของยืนยันว่าเศษใช้งานอื่นต่อได้
    //   ท่อนต้องตรงใบตัด · เส้นต้องน้อยกว่าท่อน (เพราะ 1 เส้นตัดได้หลายท่อน) = พิสูจน์ว่าเอาเศษไปใช้จริง
    ok("F7988 นับท่อนตรงใบตัดแล้ว", row("F7988")?.status === "ตรง", row("F7988")?.status);
    ok("F7988 เส้นน้อยกว่าท่อน (เอาเศษไปใช้ต่อ)", row("F7988")?.calcBars < row("F7988")?.calcPieces,
      `${row("F7988")?.calcBars} เส้น / ${row("F7988")?.calcPieces} ท่อน`);
  }

  ok("งานนอก: ยังมีตบกันสาด F7992 ทั้งสองฝั่ง",
    codesOf(outer, "calc").has("F7992") && codesOf(outer, "cut").has("F7992"), "");

  // เปิดคู่กลาง — ไฟล์มีแค่ 4 กับ 6 บาน
  ok("เปิดคู่กลาง 4 บาน แมปได้", at("เปิดคู่กลาง", 4, "รางกันน้ำ")?.ok !== false, "");
  ok("เปิดคู่กลาง 6 บาน แมปได้", at("เปิดคู่กลาง", 6, "รางกันน้ำ")?.ok !== false, "");
  ok("เปิดคู่กลาง 5 บาน ไม่มีสูตร → บอกตรง ๆ ไม่เดา", at("เปิดคู่กลาง", 5, "รางกันน้ำ")?.ok === false, "");
  ok("ลากจูง ยังไม่มีชีตในไฟล์ใบตัด → ไม่เดา", at("ลากจูง", 3, "รางกันน้ำ")?.ok === false, "");
  // 4-5 บาน ลงระบบแล้ว 20 ส.ค.69 (ชีต "เลื่อน4 (2)" / "เลื่อน5") — เฟรม 2 ชุดต่อกัน
  ok("อิสระ 4 บาน แมปได้ (ชีต เลื่อน4)", at("อิสระ", 4, "รางกันน้ำ")?.ok !== false, "");
  ok("อิสระ 5 บาน แมปได้ (ชีต เลื่อน5)", at("อิสระ", 5, "รางกันน้ำ")?.ok !== false, "");
  // ตบเฟรมบน/ราง — จำนวนต้องยึดไฟล์รายชีต ไม่ใช่สูตรตามจำนวนบานเลื่อน (เจอ 20 ส.ค.69: 2 บานขาด 1 เส้น)
  {
    const pcs = (r, c) => r.alu.find((a) => a.code === c)?.calcPieces ?? 0;
    for (const [p, w7993, w7994] of [[2, 3, 3], [3, 3, 3], [4, 4, 4], [5, 5, 5]]) {
      const r = at("อิสระ", p, "รางกันน้ำ");
      ok(`อิสระ ${p} บาน: ตบเฟรมบน ${w7993} · ราง ${w7994} (ตามไฟล์)`,
        pcs(r, "F7993") === w7993 && pcs(r, "F7994") === w7994,
        `${pcs(r, "F7993")} / ${pcs(r, "F7994")}`);
    }
    ok("เปิดคู่กลาง 4 บาน: ตบเฟรมบน 3 · ราง 2 (ตามชีตแบ่ง4)",
      pcs(at("เปิดคู่กลาง", 4, "รางกันน้ำ"), "F7993") === 3 && pcs(at("เปิดคู่กลาง", 4, "รางกันน้ำ"), "F7994") === 2, "");
  }
  ok("4-5 บาน ใช้ตัวต่อเฟรม F7989 + F7990 ทั้งสองฝั่ง", (() => {
    const r = at("อิสระ", 4, "รางกันน้ำ");
    const has = (c) => { const x = r.alu.find((a) => a.code === c); return x && x.calcPieces > 0 && x.cutPieces > 0; };
    return has("F7989") && has("F7990") && has("F7979");
  })(), "");
  ok("อิสระ 4-5 บาน อลูตรงใบตัดทุกรหัส",
    at("อิสระ", 4, "รางกันน้ำ").alu.every((a) => a.status === "ตรง") && at("อิสระ", 5, "รางกันน้ำ").alu.every((a) => a.status === "ตรง"),
    at("อิสระ", 4, "รางกันน้ำ").alu.filter((a) => a.status !== "ตรง").map((a) => a.code + ":" + a.status).join(","));
  // เจ้าของเคาะ 20 ส.ค.69: งานใน 4/5 บาน ตัดออก ไม่รับงาน · 2-3 บาน ใช้เฟรม 3 ราง เป็นหลัก
  ok("งานใน 4 บาน = ไม่รับงาน (บอกเหตุผลบนหน้าจอ)",
    at("อิสระ", 4, "รางเตี้ย (งานใน)")?.ok === false, "");
  ok("งานใน 5 บาน = ไม่รับงาน", at("อิสระ", 5, "รางเตี้ย (งานใน)")?.ok === false, "");
  ok("2-3 บาน ใช้เฟรม 3 ราง (F7976/F7978) ไม่ใช่ 2 ราง (F7977/F7979)", (() => {
    const codes = (p) => new Set(at("อิสระ", p, "รางกันน้ำ").alu.filter((a) => a.cutBars > 0).map((a) => a.code));
    return [2, 3].every((p) => codes(p).has("F7978") && !codes(p).has("F7977") && !codes(p).has("F7979"));
  })(), "");
}


// ── SlimLux — คิดราคา ↔ ใบตัด ต้องตรงกันทุกเส้น (เจ้าของสั่งลุยต่อ 21 ส.ค.69) ──────
//   จำนวนท่อน/ความยาวยึดไฟล์ตัดประกอบ "SlimLux เลื่อน" (ยัดในช่อง · คาน 1×4 · เสารับ 1×3)
console.log("\n═══ SlimLux — คิดราคา ↔ ใบตัด ═══");
{
  const at = (w, h, p, form, slxhandle = "X-J", slxhwcolor = "ขาว") =>
    compareCut(PB, { prodId: "slimlux", w, h, p, form, spec: { slxhandle, slxhwcolor } });
  const CASES = [[300, 240, 3, "อิสระ", "X-J"], [200, 200, 2, "อิสระ", "X-J"],
    [400, 240, 4, "ลากจูง", "X-J"], [500, 240, 4, "เปิดคู่กลาง", "มือจับล็อค (มาตรฐาน)"],
    [300, 240, 3, "อิสระ", "มือจับล็อค (มาตรฐาน)"], [300, 240, 3, "อิสระ", "ลูกค้าเตรียมเอง"]];
  for (const [w, h, p, form, hd] of CASES) {
    const r = at(w, h, p, form, hd);
    // ซิลิโคน = ข้อยกเว้นที่เจ้าของสั่งไม่ใส่ในใบตัด (เก็บไว้ฝั่งคิดราคาอย่างเดียว)
    const bad = [...r.alu, ...r.hardware].filter((x) => x.status !== "ตรง" && !/ซิลิโคน/.test(x.name));
    ok(`${w}×${h} ${p} บาน ${form} · ${hd}`, bad.length === 0,
      bad.map((x) => (x.code || x.sku || x.name) + ":" + x.status).join(","));
  }
  // มือจับ: เลือก X-J → ไม่มีมือจับล็อค · เลือกมือจับล็อค → ไม่มีเสา X-J (ใช้ร่วมกันไม่ได้)
  const xj = at(300, 240, 3, "อิสระ", "X-J"), lk = at(300, 240, 3, "อิสระ", "มือจับล็อค (มาตรฐาน)");
  const pcs = (r, c) => r.alu.find((a) => a.code === c)?.calcPieces ?? 0;
  const hw = (r, c) => r.hardware.find((a) => a.sku === c)?.calcQty ?? 0;
  ok("เลือก X-J → มีเสา X-J · ไม่มีมือจับล็อค", pcs(xj, "JR02890") > 0 && hw(xj, "JR00366") === 0, "");
  ok("เลือกมือจับล็อค → มีมือจับล็อค · ไม่มีเสา X-J", pcs(lk, "JR02890") === 0 && hw(lk, "JR00366") > 0, "");
  ok("สีมือจับล็อค ดำ → JR00367", hw(at(300, 240, 3, "อิสระ", "มือจับล็อค (มาตรฐาน)", "ดำ"), "JR00367") > 0, "");
  // สีนอกจากขาว/ดำ → เสา X-J ใช้ตัวมิว JR02891 (สีดิบ) แล้วบวกค่าอบ
  const gray = compareCut(PB, { prodId: "slimlux", w: 300, h: 240, p: 3, form: "อิสระ", color: "sahara", spec: { slxhandle: "X-J" } });
  ok("สีเทาซาฮาร่า → เสา X-J ใช้มิว JR02891", (gray.alu.find((a) => a.code === "JR02891")?.calcPieces ?? 0) > 0, "");
  // ตัวเลือกบนหน้าเทียบต้องเป็นของรุ่นนั้นจริง ๆ — เจ้าของเจอ 21 ส.ค.69: เปิด SlimLux แล้วมี "ล็อค+ดัมมี่" ของ SMS โผล่
  {
    const labels = (id, w, h, p, form) => cutOptionsFor({ prodId: id, w, h, p, form, spec: {} }).map((o) => o.label);
    const slx = labels("slimlux", 300, 240, 3, "อิสระ");
    ok("SlimLux ไม่มีช่องมือจับของ SMS (ซ้าย/ขวา)", !slx.some((l) => /ซ้าย|ขวา|ยี่ห้อ/.test(l)), slx.join(","));
    // ช่องที่คิดราคาคุมอยู่แล้ว (มือจับ/คาน/เสารับ ของ SlimLux) ต้องไม่โผล่ซ้ำบนหน้าเทียบ
    //   ไม่งั้นกดช่องใบตัดแล้วราคาไม่ขยับ (เจ้าของเจอ: เลือก X-J แล้วยังคิดมือจับล็อค)
    ok("SlimLux ไม่มีช่องมือจับซ้ำ (คิดราคาคุมอยู่แล้ว)", !slx.some((l) => /มือจับ/.test(l)), slx.join(","));
    ok("SMS ยังมีช่องมือจับ ซ้าย/ขวา ตามเดิม", labels("sms_slide", 600, 300, 3, "อิสระ").some((l) => /ซ้าย/.test(l)), "");
    ok("Velora โชว์เฉพาะช่องสีอุปกรณ์ (เพิ่ม 21 ส.ค.69 · ผูกรหัสตามสี)", JSON.stringify(labels("velora", 220, 200, 1, "เดี่ยว")) === JSON.stringify(["สีอุปกรณ์"]), JSON.stringify(labels("velora", 220, 200, 1, "เดี่ยว")));
  }
  // รหัสที่เขียนเป็น "สูตร" (เลือกตามสี/ความหนา) ต้องผูกสโตร์ได้ทุกตัว
  //   เจ้าของเจอ 21 ส.ค.69: มือจับ X-J JR02890 ไม่มีราคา ทั้งที่สโตร์ตั้งไว้แล้ว
  //   ต้นเหตุ: stock-link เก็บ "ทั้งสูตร" เป็นรหัส แทนที่จะดึงรหัสในเครื่องหมายคำพูดออกมา
  {
    for (const c of ["JR02890", "JR02889", "JR02891", "F7917", "F7919"])
      ok(`รหัสในสูตร ${c} ผูกสโตร์ได้`, isAluCode(c), "");
    // ตั้งราคาในสโตร์ → ราคาบนคิดราคาต้องเด้งตาม
    const rows = [{ name: "มือจับ xj ยาว 2.8m", sku: "JR02890", color: "ขาว", unit_cost: 820 },
      { name: "มือจับ xj ยาว 2.8m", sku: "JR02891", color: "มิว", unit_cost: 320 }];
    const PBs = applyPriceOverride(JSON.parse(JSON.stringify(PB)), buildPriceOverride(rows, PB));
    ok("ตั้งราคา X-J ในสโตร์ → ALUCODE รับค่า", PBs.ALUCODE?.JR02890 === 820 && PBs.ALUCODE?.JR02891 === 320, "");
    const xjPrice = (colorKey) => computeCost(PBs, PRODUCTS.slimlux,
      { w: 300, h: 240, p: 3, form: "อิสระ", color: colorKey === "white" ? "white" : "sahara", colorKey, spec: { slxhandle: "X-J" } })
      .lines.find((l) => /X-J/.test(l.name))?.unitPrice;
    ok("สีขาว → เสา X-J ใช้ราคา JR02890 (฿820)", xjPrice("white") === 820, String(xjPrice("white")));
    ok("สีเทา → เสา X-J ใช้ราคา JR02891 มิว (฿320)", xjPrice("sahara") === 320, String(xjPrice("sahara")));
  }
}


console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
