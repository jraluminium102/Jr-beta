// เทียบเลข "เฟี้ยมยก" ที่พอร์ต vs สูตรใน JR_เฟี้ยมยก.xlsx (ค่าเริ่มต้นในไฟล์ W=200 H=120 N=2 ชุด=1)
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { computeCutList } from "../src/lib/cutlist/engine.ts";

const W = 200, H = 120;
// คำนวณตามสูตร Excel ตรง ๆ (E14..E23 + F32..F43)
const D = { เฟรมข้าง:2, เฟรมล่าง:11, เฟรมบน:0, คิ้วเฟรมบน:15, ตบตั้ง:6.5, ตบนอน:11, กรอบตั้ง:8.2, กรอบนอน:12.4, คิ้วตั้ง:39.5, คิ้วนอน:24 };
const excel = [
  ["เฟรมข้าง (เดิมเฟรมบน)", "F7968", H - D.เฟรมข้าง, 2],
  ["เฟรมล่าง",              "F7969", W - D.เฟรมล่าง, 1],
  ["เฟรมบน (เดิมเฟรมข้าง)", "F7970", W - D.เฟรมบน, 1],
  ["คิ้วเฟรมบน",            "F7971", W - D.คิ้วเฟรมบน, 1],
  ["ตบปิดเฟรม ตั้ง (ข้าง)", "F7973", H - D.ตบตั้ง, 2],
  ["ตบปิดเฟรม นอน (ล่าง)",  "F7973", W - D.ตบนอน, 1],
  ["กรอบบาน ตั้ง",          "F7972", (H - D.กรอบตั้ง) / 2, 4],
  ["กรอบบาน นอน",          "F7972", W - D.กรอบนอน, 4],
  ["คิ้วกระจก ตั้ง",         "F7935", (H - D.คิ้วตั้ง) / 2, 4],
  ["คิ้วกระจก นอน",         "F7935", W - D.คิ้วนอน, 4],
];

// เอนจินปัดยาวตัดเป็นทศนิยม 1 ตำแหน่ง (round1) เหมือนทุกรุ่น → เทียบแบบเดียวกัน ไม่ใช่ปัดให้ผ่าน
const round1 = (x) => Math.round(x * 10) / 10;
const spec = CUT_SPEC_BY_ID["euro_lift"];
const res = computeCutList(spec, { ...spec.defaults, W, H }, 1);
let bad = 0;
console.log("รายการ".padEnd(26) + "รหัส".padEnd(9) + "ยาวตัด(เว็บ)".padStart(12) + "ยาวตัด(Excel)".padStart(14) + "  จำนวน");
for (const [name, code, len, qty] of excel) {
  const row = res.rows.find((r) => r.name === name);
  const okLen = row && Math.abs(row.len - round1(len)) < 0.001;
  const okQty = row && row.qty === qty;
  const okCode = row && row.code === code;
  if (!okLen || !okQty || !okCode) bad++;
  console.log(
    (okLen && okQty && okCode ? "✅ " : "❌ ") + name.padEnd(24) + String(row?.code ?? "-").padEnd(9) +
    String(row?.len ?? "-").padStart(12) + String(round1(len)).padStart(14) + `   ${row?.qty ?? "-"}/${qty}`
  );
}
// กระจก: กว้าง = W − กรอบนอน(12.4) − 13 · สูง = (H − 8.2)/2 − 13
console.log(`\nกระจก (จากไฟล์): กว้าง ${W - 12.4 - 13} × สูง ${(H - 8.2) / 2 - 13} ซม. · 2 แผ่น/ชุด`);
console.log(bad ? `\n❌ ไม่ตรง ${bad} รายการ` : "\n✅ ตรงกับ Excel ทุกรายการ (10/10)");
process.exit(bad ? 1 : 0);
