#!/usr/bin/env node
/**
 * สร้าง migration 0138 — ลบแถวสโตร์ที่ migration 0083 สร้างไว้ "แล้วไม่มีสูตรไหนใช้แล้ว"
 *   node scripts/gen-0138.mjs
 * รายชื่อ "ห้ามลบ" สร้างจากสูตรจริง (ชื่อ + รหัส ที่คิดราคา/ใบตัดอ้างถึง) ไม่ได้พิมพ์มือ
 */
import fs from "node:fs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";

const names = new Set(), skus = new Set();
const addSku = (v) => { const m = String(v ?? "").match(/JR\d{5}/g); if (m) m.forEach((x) => skus.add(x)); };
for (const p of Object.values(PRODUCTS)) {
  for (const g of ["alu", "hardware", "consum"]) for (const it of (p[g] || [])) {
    if (it?.name) names.add(String(it.name).trim());
    addSku(it?.sku); if (it?.ref) names.add(String(it.ref).trim());
  }
}
for (const spec of Object.values(CUT_SPEC_BY_ID)) {
  const d = spec.defaults || {};
  for (const h of (spec.hardware || [])) {
    try { const n = typeof h.name === "function" ? h.name(d) : h.name; if (n) names.add(String(n).trim()); } catch { /* ข้าม */ }
    for (const v of [d, { ...d, hwColor: "ดำ" }, { ...d, handleColor: "ดำ" }]) {
      try { addSku(typeof h.sku === "function" ? h.sku(v) : h.sku); } catch { /* ข้าม */ }
    }
  }
}
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const sql = `-- 0138: ลบแถวสโตร์ของ migration 0083 ที่ "ไม่มีสูตรไหนใช้แล้ว" (ตัวเปล่า ไม่มีรูป ไม่มียอด)
--
-- เจ้าของสั่ง 4 ก.ย.69: "พวกตัวที่ใช้รหัสเปล่าที่คุณสร้าง มันสร้างซ้ำมีหลายตัวเลย
--   ไปไล่เช็คและลบตัวที่สร้างมาเปล่า ๆ (ไม่มีรูป ไม่มีจำนวนสโตร์)"
--
-- 0083 สร้างแถวไว้ ~85 แถว (supplier = 'ถอดทุน R4.0') เพื่อผูกราคา BOM ถอดทุน R4.0
--   0137 ลบไปแล้วเฉพาะกลุ่ม "เส้นอลูที่ซ้ำกับเส้นจริง"
--   ไฟล์นี้เก็บกวาดที่เหลือ: แถวที่ "ไม่มีสูตรไหนอ้างถึงแล้ว" หลังย้ายรหัสรอบ 4 ก.ย.69
--
-- ⚠ รายชื่อ "ห้ามลบ" ด้านล่างสร้างอัตโนมัติจากสูตรจริง (scripts/gen-0138.mjs)
--   ห้ามแก้มือ — ถ้าสูตรเปลี่ยน ให้รันสคริปต์สร้างไฟล์ใหม่
--   เหตุผล: ยังมีบรรทัดในสูตรที่ผูกสโตร์ "ด้วยชื่อ" (ไม่ใช่รหัส) อยู่อีกมาก
--   ลบชื่อพวกนั้นทิ้ง = ราคาหาย เงียบ ๆ
--
-- ปลอดภัย: ลบเฉพาะแถวที่ครบทุกข้อ
--   ① supplier = 'ถอดทุน R4.0'   (แถวที่ 0083 สร้างเท่านั้น)
--   ② ยอดคงเหลือ = 0 และไม่มีความเคลื่อนไหวในสมุดสโตร์
--   ③ ไม่เคยถูกใช้ในใบตัด/BOQ
--   ④ ชื่อ ไม่อยู่ในรายการที่สูตรอ้างถึง  และ  รหัส ไม่อยู่ในรายการที่สูตรอ้างถึง

begin;

create temp table _keep_name(name text primary key) on commit drop;
insert into _keep_name(name) values
${[...names].sort().map((n) => "  (" + q(n) + ")").join(",\n")}
on conflict do nothing;

create temp table _keep_sku(sku text primary key) on commit drop;
insert into _keep_sku(sku) values
${[...skus].sort().map((s) => "  (" + q(s) + ")").join(",\n")}
on conflict do nothing;

create temp table _dead on commit drop as
select s.id, s.name, s.sku, s.qty_on_hand
from public.stock_items s
where s.supplier = 'ถอดทุน R4.0'
  and coalesce(s.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = s.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = s.id)
  and not exists (select 1 from _keep_name k where btrim(k.name) = btrim(s.name))
  and not exists (select 1 from _keep_sku k where k.sku = s.sku);

delete from public.stock_items s using _dead d where s.id = d.id;

-- สรุปให้ดูว่าอะไรถูกลบ / อะไรเหลือไว้เพราะยังมีคนใช้
select 'ลบแล้ว' as ผล, count(*) as จำนวน from _dead
union all
select 'เหลือไว้ (ยังมีสูตรใช้ / มียอด / เคยเบิก)', count(*)
from public.stock_items where supplier = 'ถอดทุน R4.0';

commit;
`;
fs.writeFileSync("supabase/migrations/0138_drop_unused_r40_parts.sql", sql);
console.log("เขียนแล้ว supabase/migrations/0138_drop_unused_r40_parts.sql · ห้ามลบชื่อ " + names.size + " · ห้ามลบรหัส " + skus.size);
