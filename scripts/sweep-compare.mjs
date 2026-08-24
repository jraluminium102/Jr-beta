#!/usr/bin/env node
/**
 * กวาดหน้า "🔍 เทียบคิดราคา 4.0 ↔ ใบตัด" ทุกรุ่น ทุกรูปแบบ ทุกจำนวนบาน
 * ใช้ตอนไล่ให้เขียวล้วน — `node scripts/sweep-compare.mjs [prodId ...]`
 */
import fs from "node:fs";
import { compareCut, COMPARABLE } from "../src/lib/calculator40/compare-cut.ts";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { allowedPanes } from "../src/lib/calculator40/form-rules.ts";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));

// จุดที่ "ตั้งใจต่าง" — ต้องมีเหตุผลกำกับเสมอ ห้ามใส่เพื่อปิดเทสเฉย ๆ
// (ชื่อบรรทัดฝั่งคิดราคา → เหตุผล) · ปลดออกเมื่อเจ้าของเคาะว่าจะผูกเส้นไหนกับแถวไหนในใบตัด
const KNOWN = {
  "วงกบ 3 ด้าน F7859": "ใบตัด PC Door เขียน 'วงกบบานเปิด' ไม่ใส่รหัส และตัดแค่เสาข้างเดียว (H−คาน) ส่วนคิดราคาคิดวงกบ 3 ด้าน (W+2H) — รอเจ้าของเคาะว่าอันไหนถูก",
  "กรอบประตู F7864": "ใบตัดเขียน 'กรอบบานเปิด เมืองทอง' ไม่ใส่รหัส — รอเจ้าของยืนยันว่าใช่ F7864 ไหม",
  "คิ้ว F7935": "ใบตัด PC Door ไม่มีแถวคิ้วกระจกเลย (ชีตตกหล่น) — คิดราคายังคิดไว้ ไม่ให้ของขาด",
  "ธรณี F7938B": "ใบตัด PC Door ไม่มีแถวธรณี (มีแค่ออปชั่น 'มีธรณี' ที่ไปหักความยาว) — คิดราคายังคิดไว้",
  "ตบธรณี F7960": "ใบตัด PC Door ไม่มีแถวตบธรณี — คิดราคายังคิดไว้",
  "เปิดกลาง F7945C": "ใบตัดเขียน 'ชนกลางรับบานเลื่อน'/'เสารับบานเลื่อน' ไม่ใส่รหัส — รอเจ้าของเคาะว่าตัวไหนคือ F7945C",
};
// บานเฟี้ยมยก: ใบตัด (euro_lift) ไม่มีอุปกรณ์เลยสักตัว — ชีตตัดประกอบมีแต่เส้นอลู
//   คิดราคาคิดชุด HD ครบตามชีตถอดทุน "คิดทุน เฟี้ยมยก" (ไม่ขาดเงิน) แต่ช่างเปิดใบตัดแล้วไม่เห็นบานพับ
//   จะเติมลงใบตัดก็ได้ แต่กระทบ "ตัดสต็อกจริง" ด้วย → รอเจ้าของสั่ง
for (const n of ["HD-640 บานพับล้อบน", "HD-641 บานพับเฟี้ยม", "HD-642 บานพับมือจับ", "HD-643 บานพับไกด์ล่าง",
  "HD-474 มือจับกลอน", "HD-312 ตลับกลอนล็อค", "HD-1180 ก้านสไลด์", "HD-213 ฉากเข้ามุม", "HD-200 ฉากประคองมุม"]) {
  KNOWN[n] = "ใบตัดบานเฟี้ยมยกไม่มีรายการอุปกรณ์เลย (ชีตมีแต่เส้นอลู) — เติมลงใบตัดจะไปตัดสต็อกด้วย รอเจ้าของสั่ง";
}
const only = process.argv.slice(2);
const ids = (only.length ? only : [...COMPARABLE]).filter((id) => PRODUCTS[id]);

let ok = 0;
let bad = 0;
for (const id of ids) {
  const prod = PRODUCTS[id];
  const forms = prod.forms?.length ? prod.forms : [""];
  for (const form of forms) {
    for (const p of allowedPanes(prod, form)) {
      const r = compareCut(PB, {
        prodId: id,
        w: 200,
        h: 200,
        p,
        form,
        color: "white",
        glassType: "เขียว 6มม.",
        spec: {},
      });
      if (r.note) continue;
      // สีเดียวกับหน้าจอ (CompareClient): แดง=จำนวนต่าง/มีแต่ใบตัด · เหลือง=มีแต่คิดราคา · เทา=ไม่มีรหัส (แค่บอกว่ายังไม่ผูกสโตร์)
      const diff = [...(r.alu || []), ...(r.hardware || [])].filter(
        (x) =>
          (x.status === "จำนวนต่าง" || x.status === "มีแต่ใบตัด" || x.status === "มีแต่คิดราคา") &&
          !(x.name in KNOWN),
      );
      if (!diff.length) {
        ok++;
        continue;
      }
      bad++;
      const detail = diff
        .map((x) => `${x.name}[${x.calcPieces ?? x.calcQty}/${x.cutPieces ?? x.cutQty}]`)
        .join(" · ");
      console.log(`❌ ${id.padEnd(11)} ${String(form).padEnd(26)} ${p}บาน  ${detail}`);
    }
  }
}
console.log(`\nรวม ✅ ${ok} · ❌ ${bad}`);
if (!only.length) {
  console.log(`\nรอเจ้าของเคาะ (ยังโชว์เหลืองในหน้าเทียบ) — ${Object.keys(KNOWN).length} เส้นของ PC Door:`);
  for (const [name, why] of Object.entries(KNOWN)) console.log(`  · ${name} — ${why}`);
}
process.exit(bad ? 1 : 0);
