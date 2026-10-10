#!/usr/bin/env node
/**
 * verify-stock-match — กฎการจับคู่ "รหัส (+สี) → ของในสต็อก" ห้ามเดา
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไมต้องมี (เจ้าของสั่ง 24 ส.ค.69 "กลัวมันจะบัคแบบนี้มานานแล้ว"):
 *   สต็อกเก็บของแบบเดียวกันไว้หลายแถว = หลายสี (B24007 มี 5 สี · F7968 มี 7 สี)
 *   ของเดิมถ้าจับคู่แล้วยังชี้ชัดไม่ได้ จะ "หยิบตัวแรก" ให้เลย → หักผิดสีเงียบ ๆ ไม่มี error
 *   กฎใหม่: ไม่ชัด = ไม่หัก + บอกเหตุผล · ล็อกไว้ที่นี่ ห้ามถอย
 *
 *   node scripts/verify-stock-match.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBoxName, normSize } from "../src/lib/calculator40/box-link.ts";
import { FAMILIES, familyCodeSets, familyLabelsOfSku, skuInFamily } from "../src/lib/cutlist/family-codes.ts";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
import { matchStock, nameHasCode, stockColorOf, isStockTracked, MATCH_REASON_TH, normBoxName } from "../src/lib/cutlist/stock-match.ts";

let pass = 0, fail = 0;
const ok = (label, cond, got = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${label}${cond || got === "" ? "" : `  (${got})`}`);
};

// สต็อกจำลองตามของจริง: อลู sku = รหัส ใช้ร่วมทุกสี · แยกแถวตามสี · ช่องสีคือ color
const A = (id, sku, nm, color) => ({ id, sku, name: `${sku}-${nm}-${color}`, color, qty: 9 });
const STOCK = [
  A(1, "B24007", "เสาบานเฟี้ยม", "อบขาว"),
  A(2, "B24007", "เสาบานเฟี้ยม", "ดำ"),
  A(3, "B24007", "เสาบานเฟี้ยม", "เทาซาฮาร่า"),
  A(4, "B24001", "เฟรมบนบานเฟี้ยม", "อบขาว"),
  // ของกลาง ไม่ระบุสี (เส้นสีเงิน/ผิวเดิม)
  { id: 5, sku: "F7994", name: "F7994-ตบรางล้อ", color: "", qty: 9 },
  // สีใหม่ที่ยังไม่อยู่ในรายการสีที่ระบบรู้จัก — ต้องใช้ได้ทันทีเพราะอ่านจากช่องสีจริง
  A(6, "B24007", "เสาบานเฟี้ยม", "บรอนซ์เงา"),
  // ของเก่า ช่องสีว่าง แต่ชื่อลงท้ายด้วยสี → ต้องยังเดาจากชื่อได้
  { id: 7, sku: "B24003", name: "B24003-เฟรมล่างบานเฟี้ยม-ดำ", color: "", qty: 9 },
];

console.log("\n═══ ① สีมาจาก \"ช่องสีจริง\" ก่อน แล้วค่อยเดาจากชื่อ ═══");
ok("อ่านสีจากช่องสี", stockColorOf(STOCK[0]) === "อบขาว", stockColorOf(STOCK[0]));
ok("สีใหม่ที่ระบบไม่เคยรู้จัก ก็อ่านได้", stockColorOf(STOCK[5]) === "บรอนซ์เงา", stockColorOf(STOCK[5]));
ok("ช่องสีว่าง → เดาจากท้ายชื่อ", stockColorOf(STOCK[6]) === "ดำ", stockColorOf(STOCK[6]));
ok("ไม่มีสีเลย = ของกลาง", stockColorOf(STOCK[4]) === "", stockColorOf(STOCK[4]));

console.log("\n═══ ② เลือกสีแล้ว ต้องได้ตัวที่สีตรงเป๊ะ ═══");
for (const [color, id] of [["อบขาว", 1], ["ดำ", 2], ["เทาซาฮาร่า", 3], ["บรอนซ์เงา", 6]]) {
  const m = matchStock(STOCK, "B24007", color);
  ok(`B24007 + ${color} → id ${id}`, m.item?.id === id && m.reason === "ok", `${m.item?.id ?? "null"} / ${m.reason}`);
}
ok("B24007 + สีที่สต็อกไม่มี → ไม่หัก", matchStock(STOCK, "B24007", "มะฮอกกานี").reason === "color_not_found");
ok("ของกลาง (ไม่ระบุสี) ใช้ได้ทุกสี", matchStock(STOCK, "F7994", "ดำ").item?.id === 5);

console.log("\n═══ ③ ห้ามเดา — นี่คือหัวใจของการแก้รอบนี้ ═══");
{
  const m = matchStock(STOCK, "B24007", "");   // มี 4 สี แต่ไม่บอกสีมา
  ok("รหัสหลายสี + ไม่เลือกสี → ไม่หัก (เดิมหยิบตัวแรก)", m.item === null && m.reason === "need_color", `${m.item?.name ?? "null"} / ${m.reason}`);
  ok("  มีข้อความบอกเหตุผลให้คนอ่าน", MATCH_REASON_TH[m.reason].includes("เลือกสี"), MATCH_REASON_TH[m.reason]);
}
ok("รหัสสีเดียว + ไม่เลือกสี → หักได้ปกติ", matchStock(STOCK, "B24001", "").item?.id === 4);
{
  const dup = [A(1, "X1", "ของซ้ำ", "ดำ"), A(2, "X1", "ของซ้ำอีกตัว", "ดำ")];
  ok("สีเดียวกันแต่มี 2 แถว → ไม่หัก", matchStock(dup, "X1", "ดำ").reason === "ambiguous");
}
ok("ไม่มีรหัสเลย → not_found", matchStock(STOCK, "B99999", "ดำ").reason === "not_found");

console.log("\n═══ ④ ขอบรหัส — รหัสสั้นห้ามไปจับรหัสยาว ═══");
ok("B2400 ไม่จับ B24001", !nameHasCode("B24001-เฟรมบน-อบขาว", "B2400"));
ok("HD-200 ไม่จับ HD-2000", !nameHasCode("HD-2000 อะไหล่", "HD-200"));
ok("B24001 จับ B24001 ได้", nameHasCode("B24001-เฟรมบน-อบขาว", "B24001"));
ok("F7938 ยังจับ F7938B ได้ (สโตร์เขียนตัวห้อยในชื่อ)", nameHasCode("F7938B-เฟรมบานกระทุ้ง", "F7938"));
ok("ยางอัดตัวเล็ก/ตัวใหญ่ 044 → เจอ 2 ตัว ไม่หัก",
  matchStock([{ id: 1, sku: "", name: "ยางอัดตัวเล็ก 044", color: "", qty: 1 },
    { id: 2, sku: "", name: "ยางอัดตัวใหญ่ 044", color: "", qty: 1 }], "044", "").reason === "ambiguous");

// ── ⑤ ของสั่งตามงาน (migration 0125) — ยังเป็น "ราคา" ได้ แต่ห้ามหักสต็อก ──
//    เจ้าของเคาะ 24 ส.ค.69 แบบ ก. "ไม่บันทึกเลย แค่เป็นราคา"
//    เคสจริง: HD-640 ในสโตร์เป็นแถวราคาล้วน (ผู้ขาย "ถอดทุน R4.0" ยอด 0) — หักแล้วติดลบเปล่า ๆ
console.log("\n═══ ⑤ ของสั่งตามงาน — ใช้เป็นราคาได้ แต่ห้ามหักสต็อก ═══");
{
  const orderOnly = { id: 9, sku: "JR00198", name: "HD-640 บานพับล้อบน", color: "", qty: 0, isStocked: false };
  const stocked = { id: 8, sku: "JR00489", name: "บานพับ HD-631", color: "", qty: 3 };
  ok("ยังจับคู่เจอ (ใช้เป็นราคา + โชว์ในใบตัดได้)", matchStock([orderOnly], "HD-640", "").item?.id === 9);
  ok("ธงบอกว่าอย่าหักสต็อก", isStockTracked(orderOnly) === false);
  ok("ของมีสต็อกปกติ → หักตามเดิม", isStockTracked(stocked) === true);
  ok("ของเก่าที่ยังไม่มีธง → หักตามเดิม (ไม่เปลี่ยนพฤติกรรมย้อนหลัง)",
    isStockTracked({ id: 1, sku: "X", name: "ของเก่า", qty: 1 }) === true);
  ok("หาไม่เจอ → ไม่หัก", isStockTracked(null) === false && isStockTracked(undefined) === false);
}

// ── ⑥ กล่อง/ฉากเมืองทอง — ใบตัดเขียนเป็น "ชื่อกล่อง" ไม่ใช่รหัส (21 ก.ย.69) ──
//    บั๊กเดิม: คาน/เสา/ฉาก ทุกรุ่นไม่เคยถูกหักสต็อกเลย เพราะ "กล่อง 1\"x4\"" ไม่ตรง sku ไหนเลย
//    แก้: เทียบด้วยชื่อที่ปัดรูปแบบ (ฟุต/คูณ/ช่องว่าง) แล้วให้ตัวกรองสีเดิมทำงานต่อ
console.log("\n═══ ⑥ กล่อง/ฉาก จับคู่ด้วยชื่อ (ใบตัดไม่มีรหัสกล่อง) ═══");
{
  const BOX = [
    { id: 1, sku: "JR01840", name: "JR01840-กล่อง 1×4-อบขาว", color: "อบขาว", qty: 9 },
    { id: 2, sku: "JR01841", name: "JR01841-กล่อง 1×4-ดำ", color: "ดำ", qty: 9 },
    { id: 3, sku: "JR01985", name: "กล่องเรียบ 1.6\"x4\"-ดำ", color: "ดำ", qty: 9 },
    { id: 4, sku: "JR01751", name: "กล่อง 1.6\"×4\"", color: "ดำ", qty: 9 },
    { id: 5, sku: "JR01777", name: "กล่อง 1\"×1½\"", color: "อบขาว", qty: 9 },
    { id: 6, sku: "JR01687", name: "กล่อง 4 หุน", color: "เทาซาฮาร่า", qty: 9 },
    { id: 7, sku: "JR01903", name: "ฉาก 4 หุน", color: "อบขาว", qty: 9 },
  ];
  const hit = (code, color) => matchStock(BOX, code, color).item?.id ?? null;
  ok("กล่อง 1\"x4\" ดำ → JR01841", hit('กล่อง 1"x4"', "ดำ") === 2);
  ok("กล่อง 1\"x4\" อบขาว → JR01840", hit('กล่อง 1"x4"', "อบขาว") === 1);
  ok("กล่อง 1.6\"x4\" ไม่ไปโดน \"กล่องเรียบ 1.6x4\"", hit('กล่อง 1.6"x4"', "ดำ") === 4);
  ok("ครึ่งนิ้ว: กล่อง 1\"x1.5\" = กล่อง 1×1½", hit('กล่อง 1"x1.5"', "อบขาว") === 5);
  ok("สีที่สโตร์เพิ่งเพิ่มเองก็ใช้ได้ (เทาซาฮาร่า)", hit("กล่อง 4 หุน", "เทาซาฮาร่า") === 6);
  ok("ฉากก็จับคู่ได้", hit("ฉาก 4 หุน", "อบขาว") === 7);
  ok("ไม่มีสีที่ขอ → ไม่หัก (ห้ามเดาสี)", matchStock(BOX, 'กล่อง 1"x4"', "เทาซาฮาร่า").reason === "color_not_found");
  ok("กล่องที่สโตร์ไม่มี → ไม่หัก", matchStock(BOX, 'กล่อง 9"x9"', "ดำ").reason === "not_found");
  ok("ชื่อที่ไม่ใช่กล่อง/ฉาก ไม่ถูกจับด้วยกติกานี้", normBoxName("F7935-คิ้วกระจก-ดำ") === "");
  ok("เจอ 2 ตัวในสีเดียวกัน → ไม่หัก", matchStock([
    { id: 1, sku: "A", name: "กล่อง 1×4", color: "ดำ", qty: 1 },
    { id: 2, sku: "B", name: "กล่อง 1\"x4\"", color: "ดำ", qty: 1 }], 'กล่อง 1"x4"', "ดำ").reason === "ambiguous");
}

// ── ⑦ รหัส JR ตรงเป๊ะ = ชี้ตัวเดียว ไม่ต้องกรองสีซ้ำ (21 ก.ย.69 จาก QA) ──
//    รหัส JR ผูกสีมาในตัวแล้ว (JR01841 = กล่อง 1×4 ดำ) · แต่เส้นอลู (F/B) ใช้รหัสเดียวทุกสี ต้องกรองสีตามเดิม
console.log("\n═══ ⑦ รหัส JR ตรงเป๊ะ ข้ามการกรองสี · เส้นอลูยังกรองสีเหมือนเดิม ═══");
{
  const S7 = [
    { id: 1, sku: "JR01841", name: "JR01841-กล่อง 1×4-ดำ", color: "ดำ", qty: 9 },
    { id: 2, sku: "JR01840", name: "JR01840-กล่อง 1×4-อบขาว", color: "อบขาว", qty: 9 },
    { id: 3, sku: "F7935", name: "F7935-คิ้วกระจก-ดำ", color: "ดำ", qty: 9 },
    { id: 4, sku: "", name: "กล่องเปิดปิด", color: "ดำ", qty: 5 },
    { id: 5, sku: "", name: "กล่องเปิดปิด ตัวตบ", color: "อบขาว", qty: 5 },
  ];
  const hit = (code, color) => matchStock(S7, code, color).item?.id ?? null;
  ok("กล่องเมืองทองสีดำ บนงานสีเทา → ยังหักได้ (รหัส JR ผูกสีมาแล้ว)", hit("JR01841", "เทาซาฮาร่า") === 1);
  ok("รหัส JR ไม่ระบุสี → หักได้", hit("JR01841", "") === 1);
  ok("เส้นอลู F7935 สีที่สโตร์ไม่มี → ไม่หัก (กันหักผิดสี)", matchStock(S7, "F7935", "เทาซาฮาร่า").reason === "color_not_found");
  ok("เส้นอลู F7935 สีตรง → หักได้", hit("F7935", "ดำ") === 3);
  ok("ชื่อกล่องขึ้นต้นเหมือนกัน ต้องไม่หักข้ามตัว (กล่องเปิดปิด ≠ ตัวตบ)", hit("กล่องเปิดปิด", "ดำ") === 4);
  ok("กล่องเปิดปิด ตัวตบ หักตัวของมันเอง", hit("กล่องเปิดปิด ตัวตบ", "อบขาว") === 5);
}


// ── ⑦ ชื่อกล่อง/ฉากที่สโตร์เขียนจริง (จากของที่ "เบิกออก" จริง 2 เดือน · เจ้าของสั่งเช็ค 5 ต.ค.69) ──
console.log("\n═══ ⑦ ชื่อจริงในสโตร์ ต้องจับคู่คีย์ในสูตรได้ถูกตัว ═══");
{
  const key = (name) => { const p = parseBoxName(name); return p ? `${p.kind}|${normSize(p.size)}` : null; };
  const CASES = [
    // [ชื่อในสโตร์, คีย์ที่ต้องได้ (null = ต้องไม่จับคู่), เหตุผล]
    ['Z 4"-ดำ', "ตัวZ|4", "สโตร์เขียน Z แต่สูตรใช้ ตัวZ — แซด 4\" ของหลังคา"],
    ['แซด 4"-อบขาว', "ตัวZ|4", "เขียน แซด ก็ต้องได้ของเดียวกัน"],
    ['กล่อง 1"x1"1/2 (เทาซาฮาร่า)', "กล่อง|1X1.5", "เลขผสม 1 กับ 1/2 = 1.5 ไม่ใช่ 11/2"],
    ['กล่อง 1"x1.5"-อบขาว', "กล่อง|1X1.5", "เขียนแบบทศนิยมก็ต้องได้คีย์เดียวกัน"],
    ['กล่องเปิด 4"-อบขาว', "กล่อง|4", "กล่องเปิด = กล่อง (รางน้ำอลู JR02987)"],
    ['กล่องเรียบ 4"x4" (อบขาว)', null, "คนละโปรไฟล์กับ กล่อง 4x4 — ห้ามเดาไปผูกให้"],
    ['ฉากเสริม-อบขาว', null, "ไม่ใช่ ฉาก ตามขนาด — ห้ามเดา"],
  ];
  for (const [name, want, why] of CASES) {
    const got = key(name);
    ok(`${name} → ${want ?? "ไม่จับคู่"} (${why})`, got === want, String(got));
  }
}

// ── ⑧ "เส้นกลาง" (= เส้นคาดตาราง) ต้องหักตามสีของงาน ไม่ใช่ล็อกสีเดียว (เจ้าของสั่ง 10 ต.ค.69) ──
console.log("\n═══ ⑧ เส้นกลาง — หักตามสีของงาน ═══");
{
  // สโตร์จริง: เส้นกลาง 8 สี · sku JR01677-JR01684
  const STOCK = [
    { id: 1677, sku: "JR01677", name: "เส้นกลาง-มิว", color: "มิว", qty: 10 },
    { id: 1678, sku: "JR01678", name: "เส้นกลาง-อบขาว", color: "อบขาว", qty: 0 },
    { id: 1679, sku: "JR01679", name: "เส้นกลาง-ดำ", color: "ดำ", qty: 0 },
    { id: 1680, sku: "JR01680", name: "เส้นกลาง-เทาซาฮาร่า", color: "เทาซาฮาร่า", qty: 52 },
    { id: 1682, sku: "JR01682", name: "เส้นกลาง-ลายไม้สักทอง", color: "ลายไม้สักทอง", qty: 50 },
  ];
  for (const [color, wantId] of [["เทาซาฮาร่า", 1680], ["ลายไม้สักทอง", 1682], ["ดำ", 1679], ["อบขาว", 1678], ["มิว", 1677]]) {
    const r = matchStock(STOCK, "เส้นกลาง", color);
    ok(`งานสี ${color} → หัก id${wantId}`, r.item?.id === wantId, `${r.item?.id ?? "-"} (${r.reason})`);
  }
  ok("ไม่ระบุสี → ไม่หัก (มีหลายสี ห้ามเดา)", matchStock(STOCK, "เส้นกลาง", "").reason === "need_color",
    matchStock(STOCK, "เส้นกลาง", "").reason);
  ok("สีที่สโตร์ไม่มี → ไม่หัก", matchStock(STOCK, "เส้นกลาง", "มะฮอกกานี").item === null, "");
  // ⚠ สูตรทั้งสองฝั่งต้องใช้รหัสกลางนี้ ไม่ใช่ sku สีใดสีหนึ่ง
  const prods = fs.readFileSync(path.join(ROOT, "src/lib/calculator40/products.mjs"), "utf8");
  const cuts = fs.readFileSync(path.join(ROOT, "src/lib/cutlist/products.ts"), "utf8");
  ok("คิดราคา: บรรทัดเส้นคาดตาราง ใช้รหัสกลาง + priceCode เดิม",
    /เส้นคาดตาราง 2 ฝั่ง', code: 'เส้นกลาง', priceCode: 'JR01679'/.test(prods), "");
  ok("ใบตัด: เส้นคาด บานแม่/บานลูก ใช้รหัสกลาง ไม่ผูก sku สีเดียว",
    /name: "เส้นคาด บานแม่ \(2ฝั่ง\)", code: "เส้นกลาง"/.test(cuts)
    && /name: "เส้นคาด บานลูก \(2ฝั่ง\)", code: "เส้นกลาง"/.test(cuts), "");
  // ตัดคอมเมนต์ + ช่อง priceCode (ตัวนั้นใช้หาราคาอย่างเดียว ไม่ได้ใช้หักสต็อก) แล้วค่อยตรวจ
  const noCmt = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/priceCode:\s*'[^']*'/g, "");
  ok("ไม่มีบรรทัดไหนหักสต็อกด้วย sku เส้นกลางสีเดียวอีก",
    !/JR0167[789]|JR0168[0-4]/.test(noCmt(prods)) && !/JR0167[789]|JR0168[0-4]/.test(noCmt(cuts)),
    "ยังเจอ sku เส้นกลางในสูตร");
}

// ── ⑨ หมวด "ใช้กับรุ่น" ในหน้าเช็คสต๊อกวัสดุ (เจ้าของสั่ง 10 ต.ค.69) ──
//    หมวดตามประเภทบาน = โปรไฟล์ประตูเท่านั้น · อลูเสริม (กล่อง/ฉาก/ลูกฟูก/เส้นกลาง/ตบร่อง)
//    ใช้กับรุ่นไหนก็ได้ จึงต้องไม่ติดป้ายรุ่น · งานโครง (กันสาด/หลังคา/กลาสเฮ้าส์/ระแนง/รั้ว)
//    วัสดุคือกล่องจริง ๆ ต้องยังจับคู่ได้ ไม่งั้นหมวดโชว์ 0 รายการ
console.log("\n═══ ⑨ หมวดใช้กับรุ่น — บานเอาแค่โปรไฟล์ประตู ═══");
{
  const DOOR = ["sms_slide", "fuji_slide", "slimlux", "toprail", "sms_bifold", "euro_bifold", "euro_lift",
    "fixed", "fuji_fix", "fuji_swing", "fuji_door", "fuji_hung", "velora", "pcdoor", "solid", "woodjamb"];
  const sets = familyCodeSets();
  const AUX = /^(กล่อง|ฉาก|แซด|ตัวZ|ลูกฟูก|เส้นกลาง|เส้นคาด|ยู|ท่อ|แป๊ป|ตบร่อง|ตบเรียบ|ฝาแจ๊คสัน|บังใบกล่อง)/;
  for (const key of DOOR) {
    const bad = [...(sets.get(key) ?? [])].filter((c) => AUX.test(c));
    ok(`${key}: ไม่มีอลูเสริมปนในหมวด`, bad.length === 0, bad.join(", "));
  }
  // งานโครงต้องไม่ว่าง (เคยโชว์ 0 เพราะสูตรเขียนชื่อกล่อง แต่สโตร์เป็นรหัส JR)
  for (const key of ["awning", "gable", "glasshouse", "louver", "gate"])
    ok(`${key}: หมวดงานโครงยังมีวัสดุ (ไม่ว่าง)`, (sets.get(key)?.size ?? 0) > 0, String(sets.get(key)?.size ?? 0));

  // เคสจริงจากสโตร์
  const CASES = [
    ["B20001", "B20001-เฟรมบนบานเลื่อน-ดำ", "บานเลื่อน SMS", true],
    ["F7980", "F7980-กรอบบานเลื่อน-ดำ", "บานเลื่อน FUJI", true],
    ["JR02925", "B24013-คิ้วตบกระจก 14-22 มม.-ดำ", "บานเฟี้ยม SMS", true],   // รหัสซ่อนหน้าชื่อ + คิ้วตามความหนากระจก
    ["JR03126", "JR03126-กรอบบานเปิด เมืองทอง-ดำ", "ประตู PC Door", true],
    ["JR01840", 'กล่อง 1"x4"-อบขาว', "กันสาด", true],                        // งานโครงใช้กล่องจริง
  ];
  for (const [sku, name, label, want] of CASES) {
    const got = familyLabelsOfSku(sku, name).includes(label);
    ok(`${name} → ${want ? "อยู่" : "ไม่อยู่"}หมวด ${label}`, got === want, familyLabelsOfSku(sku, name).join(" · ") || "(ไม่อยู่หมวดไหน)");
  }
  // อลูเสริมต้องไม่ติดป้ายรุ่น "บาน" ใดเลย
  const DOOR_LABELS = new Set(FAMILIES.filter((f) => DOOR.includes(f.key)).map((f) => f.label));
  for (const [sku, name] of [["JR01948", 'ฉาก 4"-อบขาว'], ["JR02085", "ตบร่อง-ดำ"],
    ["JR01994", "ลูกฟูกเรียบ 2 หน้า-ดำ"], ["JR01679", "เส้นกลาง-ดำ"], ["JR01841", 'กล่อง 1"x4"-ดำ']]) {
    const hit = familyLabelsOfSku(sku, name).filter((l) => DOOR_LABELS.has(l));
    ok(`${name} ไม่ติดป้ายรุ่นบาน (เป็นอลูเสริม)`, hit.length === 0, hit.join(" · "));
  }
  ok("skuInFamily รับชื่อแถวด้วย (รหัสซ่อนหน้าชื่อ)",
    skuInFamily("JR02925", "sms_bifold", "B24013-คิ้วตบกระจก 14-22 มม.-ดำ")
    && !skuInFamily("JR02925", "sms_bifold"), "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
