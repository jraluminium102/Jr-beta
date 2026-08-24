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
// 24 ส.ค.69: ว่างแล้ว — เจ้าของเคาะ PC Door (รหัส F#### ลงใบตัด + แถวที่ชีตตกหล่น) และอุปกรณ์เฟี้ยมยกลงใบตัดครบ
const KNOWN = {};

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
process.exit(bad ? 1 : 0);
