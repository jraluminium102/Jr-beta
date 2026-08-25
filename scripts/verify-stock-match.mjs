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
import { matchStock, nameHasCode, stockColorOf, isStockTracked, MATCH_REASON_TH } from "../src/lib/cutlist/stock-match.ts";

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

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
