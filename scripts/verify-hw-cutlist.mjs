/**
 * verify-hw-cutlist — ตัวตรวจ "ค่าของ (อุปกรณ์) ในคิดราคา 4.0 = รายการในใบตัด"
 * รัน: node --experimental-strip-types scripts/verify-hw-cutlist.mjs
 *
 * เจ้าของสั่ง 19 ส.ค.69: ใบตัด SMS 15 บรรทัด มีรหัสครบ ไล่เช็คแล้วถูก → เอาเข้า "ค่าของ" ในคิดราคาด้วย
 *   มือจับต้องแยกสี (เมโทร อบขาว JR00368/369/370 · ดำ JR00371/372/373) และมี Align ให้เลือก
 *   ซิลิโคน = JR00504
 *
 * สิ่งที่ตัวตรวจนี้ล็อกไว้:
 *   ① รายการ/จำนวน/รหัส ตรงกับใบตัดเป๊ะ (ไม่ใช่ก๊อปมาแล้วแยกกันเดิน)
 *   ② มือจับ ยี่ห้อ×สี×ชนิด → รหัสสโตร์ถูกตัว
 *   ③ ราคามาจากสโตร์ · ขึ้นราคาในสโตร์แล้วค่าของขยับ
 *   ④ ⚠ รหัสไหนยังไม่ตั้งราคา → ห้ามคิดเป็น 0 เงียบ ๆ ต้องถอยไปใช้ราคาเดิม + รายงานรหัสที่ขาด
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { cutHardwareLines, HW_FROM_CUTLIST, HANDLE_FIELDS, SKU_PACK } from "../src/lib/calculator40/hardware-from-cutlist.ts";
import { buildPriceOverride, applyPriceOverride } from "../src/lib/calculator40/stock-link.ts";
import { computeCutList } from "../src/lib/cutlist/engine.ts";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/calculator40/pricebook.json"), "utf8"));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  " + extra}`); };

const BASE_IN = { w: 600, h: 300, p: 3, form: "อิสระ", spec: {} };
const DEF_CUT = { handleBrand: "เมโทร", handleColor: "อบขาว", handleL: "กุญแจ+ล็อค", handleR: "ล็อค+ดัมมี่" };
const linesOf = (cut = DEF_CUT, o = {}) => cutHardwareLines({ prodId: "sms_slide", ...BASE_IN, ...o, cut });
const skuOf = (ls, nameStart) => ls.find((l) => l.name.startsWith(nameStart))?.sku ?? "";
const qtyOf = (ls, nameStart) => ls.find((l) => l.name.startsWith(nameStart))?.qty ?? 0;

console.log("\n═══ ① รายการอุปกรณ์ต้องเป็น 'ชุดเดียวกับใบตัด' ไม่ใช่ก๊อปแยกกันเดิน ═══");
{
  const ls = linesOf();
  // เทียบกับเอนจินใบตัดตรง ๆ — ถ้าวันหน้าใครแก้ใบตัด แล้วคิดราคาไม่ตาม เทสนี้ต้องแดง
  const cut = computeCutList(CUT_SPEC_BY_ID["sms_slide_free"],
    { W: 600, H: 300, N: 3, rail: "3รางเสียบ", honk: false, ...DEF_CUT }, 1);
  ok("จำนวนบรรทัดตรงกับใบตัด", ls.length === cut.hardware.length, `${ls.length} vs ${cut.hardware.length}`);
  ok("ทุกบรรทัด ชื่อ+รหัส+จำนวน ตรงกับใบตัดเป๊ะ",
    ls.every((l, i) => l.name === cut.hardware[i].name && l.sku === cut.hardware[i].sku && l.qty === cut.hardware[i].qty), "");
  ok("ทุกบรรทัดมีรหัสสโตร์ (ไม่มีตัวไหนผูกไม่ติด)", ls.every((l) => /^JR\d+$/.test(l.sku)), ls.filter((l) => !l.sku).map((l) => l.name).join(","));
  ok("ซิลิโคน = JR00504 (เจ้าของให้)", skuOf(ls, "ซิลิโคน") === "JR00504", skuOf(ls, "ซิลิโคน"));
  ok("ล้อ 27 = 2 ลูก/บาน × 3 บาน", qtyOf(ls, "ล้อ 27") === 6, String(qtyOf(ls, "ล้อ 27")));
  ok("รุ่นที่ยังไม่เปิด ยังใช้รายการเดิมในสูตร (คืน null)",
    cutHardwareLines({ prodId: "pcdoor", ...BASE_IN, cut: DEF_CUT }) === null, "");
  ok("เปิดทีละรุ่น — ตอนนี้เปิดแค่ SMS บานเลื่อน", HW_FROM_CUTLIST.has("sms_slide") && HW_FROM_CUTLIST.size === 1, [...HW_FROM_CUTLIST].join(","));
}

console.log("\n═══ ② มือจับ: ยี่ห้อ × สี × ชนิด → รหัสสโตร์ถูกตัว (เจ้าของไล่เช็คมาแล้ว) ═══");
{
  // ตารางนี้ "ตรึงค่า" ไว้ตามที่เจ้าของส่งมา — ห้ามคำนวณจากตารางในโค้ด (ไม่งั้นลบตารางแล้วเทสยังผ่าน)
  const EXPECT = {
    "เมโทร|อบขาว": { กุญแจ: "JR00368", ล็อค: "JR00369", ดัมมี่: "JR00370" },
    "เมโทร|ดำ": { กุญแจ: "JR00371", ล็อค: "JR00372", ดัมมี่: "JR00373" },
    "Align|อบขาว": { กุญแจ: "JR00377", ล็อค: "JR00378", ดัมมี่: "JR00379" },
    "Align|ดำ": { กุญแจ: "JR00374", ล็อค: "JR00375", ดัมมี่: "JR00376" },
  };
  for (const [key, want] of Object.entries(EXPECT)) {
    const [handleBrand, handleColor] = key.split("|");
    const ls = linesOf({ ...DEF_CUT, handleBrand, handleColor });
    for (const [part, sku] of Object.entries(want))
      ok(`${key} · ${part} → ${sku}`, skuOf(ls, `มือจับ ${part}`) === sku, skuOf(ls, `มือจับ ${part}`));
  }
  // จำนวนต้องมาจากชนิดที่เลือก ไม่ใช่ตัวเลขตายตัว
  const a = linesOf({ ...DEF_CUT, handleL: "กุญแจ+ล็อค", handleR: "ล็อค+ดัมมี่" });
  ok("กุญแจ+ล็อค / ล็อค+ดัมมี่ → กุญแจ1 ล็อค2 ดัมมี่1",
    qtyOf(a, "มือจับ กุญแจ") === 1 && qtyOf(a, "มือจับ ล็อค") === 2 && qtyOf(a, "มือจับ ดัมมี่") === 1, "");
  const b = linesOf({ ...DEF_CUT, handleL: "ล็อค", handleR: "ล็อค" });
  ok("เลือก 'ล็อค' ทั้งสองข้าง → ไม่มีกุญแจ ไม่มีดัมมี่",
    qtyOf(b, "มือจับ กุญแจ") === 0 && qtyOf(b, "มือจับ ล็อค") === 2 && qtyOf(b, "มือจับ ดัมมี่") === 0, "");
  const c = linesOf({ ...DEF_CUT, handleL: "ดัมมี่+ดัมมี่", handleR: "-" });
  ok("ดัมมี่คู่ → ดัมมี่ 2 · ไม่มีล็อค (แกน/ก้ามปูก็ต้องไม่มี)",
    qtyOf(c, "มือจับ ดัมมี่") === 2 && qtyOf(c, "มือจับ ล็อค") === 0 && qtyOf(c, "แกนมือจับ A") === 0, "");
  ok("หน้าคิดราคามีให้เลือกครบ 4 ช่อง (ยี่ห้อ/สี/ซ้าย/ขวา)", HANDLE_FIELDS.length === 4, "");
  ok("ตัวเลือกยี่ห้อมี Align ด้วย (ไม่ใช่เมโทรอย่างเดียว)",
    HANDLE_FIELDS.find((f) => f.key === "handleBrand")?.choices.includes("Align"), "");
  ok("ชนิดมือจับเลือกได้ทั้ง กุญแจ/ล็อค/ดัมมี่",
    ["กุญแจ+ล็อค", "ล็อค+ดัมมี่", "ล็อค", "ดัมมี่"].every((t) => HANDLE_FIELDS.find((f) => f.key === "handleL")?.choices.includes(t)), "");
}

console.log("\n═══ ③ ค่าของคิดจากราคาในสโตร์ (รหัสเดียวกับที่ช่างเบิก) ═══");
{
  const PRICES = { JR00576: 80, JR00368: 260, JR00369: 230, JR00370: 150, JR00478: 18, JR00479: 22,
    JR00476: 9, JR00475: 14, JR00477: 12, JR00864: 1, JR00863: 1.2, JR00794: 400, JR00589: 6, JR00485: 6, JR00504: 90 };
  const pbWith = (px) => applyPriceOverride(JSON.parse(JSON.stringify(BASE)),
    buildPriceOverride(Object.entries(px).map(([sku, c]) => ({ name: sku, sku, unit_cost: c })), BASE));
  const run = (px, cut = DEF_CUT) => computeCost(pbWith(px), PRODUCTS.sms_slide, { ...BASE_IN, hardwareLines: linesOf(cut) });

  const r = run(PRICES);
  ok("ใช้รายการจากใบตัดจริง", r.hwFromCutlist === true, "");
  ok("ไม่มีรหัสไหนขาดราคา", r.hwMissing.length === 0, JSON.stringify(r.hwMissing));
  const line = (nm) => r.lines.find((l) => l.name.startsWith(nm));
  ok("ราคาต่อหน่วย = ราคาในสโตร์", line("มือจับ กุญแจ").unitPrice === 260, String(line("มือจับ กุญแจ").unitPrice));
  ok("ล็อค 2 ชุด → 2 × 230 = 460", line("มือจับ ล็อค").amount === 460, String(line("มือจับ ล็อค").amount));
  ok("สักหลาด: สโตร์ขายเป็นม้วน 250 ม. → คิดต่อเมตร (400÷250 = 1.6)",
    Math.abs(line("สักหลาด").unitPrice - 1.6) < 0.001, String(line("สักหลาด").unitPrice));
  ok("ตัวหารแพ็คมีแค่ที่ระบุไว้ ไม่หารมั่ว", Object.keys(SKU_PACK).length === 1 && SKU_PACK.JR00794.per === 250, "");
  ok("ทุกบรรทัดติดรหัสสโตร์ไว้ให้ตรวจย้อนได้",
    r.lines.filter((l) => l.cat === "hardware").every((l) => /^JR\d+$/.test(l.sku)), "");

  // ขึ้นราคาในสโตร์ → ค่าของต้องขยับตาม (คำถามค้างของเจ้าของ: "แก้ราคาแล้วเด้งไหม")
  const up = run({ ...PRICES, JR00368: 520 });
  ok("ขึ้นราคามือจับในสโตร์เท่าตัว → ค่าของขยับขึ้น 260 พอดี",
    Math.abs((up.cost.hardware - r.cost.hardware) - 260) < 0.01, String(up.cost.hardware - r.cost.hardware), "");
  // เลือกสีดำ = คนละรหัส → ราคาต่างกันได้จริง
  const blackPx = { ...PRICES, JR00371: 300, JR00372: 270, JR00373: 180 };
  const bk = run(blackPx, { ...DEF_CUT, handleColor: "ดำ" });
  ok("สีดำใช้คนละรหัส ราคาจึงต่างจากขาวได้จริง", bk.cost.hardware > r.cost.hardware && bk.hwMissing.length === 0,
    `${r.cost.hardware} → ${bk.cost.hardware}`);
}

console.log("\n═══ ④ ⚠ รหัสยังไม่ตั้งราคา = ห้ามคิดเป็น 0 เงียบ ๆ (เสนอราคาต่ำกว่าจริง) ═══");
{
  const noStock = computeCost(BASE, PRODUCTS.sms_slide, { ...BASE_IN, hardwareLines: linesOf() });
  const plain = computeCost(BASE, PRODUCTS.sms_slide, { ...BASE_IN });
  ok("สโตร์ยังไม่มีราคาเลย → ไม่ใช้รายการใบตัด", noStock.hwFromCutlist === false, "");
  ok("ค่าของต้องไม่หล่นเป็น 0 — ถอยไปใช้ราคาเดิมในสูตร",
    noStock.cost.hardware + noStock.cost.consum === plain.cost.hardware + plain.cost.consum
    && plain.cost.hardware + plain.cost.consum > 0, "");
  ok("ราคาขายเท่าเดิมเป๊ะ (ไม่มีใครโดนคิดถูกลงโดยไม่ตั้งใจ)",
    noStock.sell.withInstall === plain.sell.withInstall, `${noStock.sell.withInstall} vs ${plain.sell.withInstall}`);
  ok("รายงานรหัสที่ต้องไปตั้งราคา ครบทุกตัว", noStock.hwMissing.length === linesOf().length, String(noStock.hwMissing.length));
  ok("รายงานทั้งรหัสและชื่อ (เอาไปหาในสโตร์ได้)",
    noStock.hwMissing.every((m) => m.sku && m.name), "");
  // ขาดแค่ตัวเดียวก็ต้องถอยทั้งชุด (ไม่ใช่คิดครึ่ง ๆ)
  const partial = applyPriceOverride(JSON.parse(JSON.stringify(BASE)),
    buildPriceOverride([{ name: "ล้อ", sku: "JR00576", unit_cost: 80 }], BASE));
  const p1 = computeCost(partial, PRODUCTS.sms_slide, { ...BASE_IN, hardwareLines: linesOf() });
  ok("ตั้งราคาไม่ครบ (ขาดตัวเดียว) → ยังไม่สลับ ใช้ราคาเดิมทั้งชุด", p1.hwFromCutlist === false, "");
  ok("ไม่มี hardwareLines ส่งมา = ทำงานเหมือนเดิมทุกอย่าง",
    plain.hwFromCutlist === false && plain.hwMissing.length === 0, "");
}

console.log("\n═══ ⑤ หน้าจอต่อสายครบไหม ═══");
{
  const c = fs.readFileSync(path.join(ROOT, "src/components/Calculator40Client.tsx"), "utf8");
  ok("หน้าคิดราคาเรียกรายการอุปกรณ์จากใบตัด", c.includes("cutHardwareLines("), "");
  ok("ส่งเข้า engine ผ่าน opt.hardwareLines", c.includes("opt.hardwareLines = hwl"), "");
  ok("มีช่องเลือกมือจับบนหน้าจอ", c.includes("HANDLE_FIELDS.map") && c.includes("setCutSel"), "");
  ok("ตัวเลือกมือจับเข้า deps ของการคิดราคา (เปลี่ยนแล้วราคาขยับทันที)", c.includes("laborMode, cutSel]"), "");
  ok("เก็บตัวเลือกมือจับลงสูตรของข้อ (แก้ย้อนหลังได้รหัสเดิม)", c.includes("useSel, sillSel, cutSel,"), "");
  ok("เตือนบนหน้าจอว่ารหัสไหนยังไม่มีราคาในสโตร์", c.includes("hwMissing") && c.includes("ยังไม่มีราคาในสโตร์"), "");
  const cut = fs.readFileSync(path.join(ROOT, "src/lib/cutlist/hardware.ts"), "utf8");
  ok("ใบตัด SMS มีซิลิโคนแล้ว (เดิมไม่มี ทั้งที่คิดราคาคิดอยู่)", cut.includes('sku: "JR00504"'), "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
