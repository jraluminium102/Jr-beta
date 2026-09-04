-- 0137: ลบแถวสโตร์ซ้ำที่ migration 0083 สร้างไว้ (เส้นอลูที่สโตร์มีอยู่แล้วแยกสี)
--
-- เจ้าของท้วง 3 ก.ย.69: "รหัสนี้มีในสโตร์แล้วหลายสี ทำไมดึงตัวนี้ไปคิดราคา"
--   0083 สร้างแถว "ราคา BOM ถอดทุน 4.0" (supplier = 'ถอดทุน R4.0') โดยตั้งชื่อมีรหัสอลูปนอยู่
--   เช่น 'วงกบ 3 ด้าน F7859' · 'F7935 คิ้วกระจก' ทั้งที่สโตร์มี F7859/F7935 อยู่แล้วอย่างละ 6-7 สี
--   ผลคือแถวเดียวที่ไม่มีสีไปแข่งราคากับเส้นจริง แล้วกดราคาลง (เจอจริง F7935: 570 -> 385)
--
-- ฝั่งคิดราคาไม่ต้องแก้สูตร — ทุกบรรทัดที่ใช้ของพวกนี้ผูก "รหัส" (code) อยู่แล้ว
--   ลบแถวซ้ำออก = ราคาไปอ่านจากเส้นจริงรายสีในสโตร์ทันที
--
-- ปลอดภัย: ลบเฉพาะแถวที่
--   ① supplier = 'ถอดทุน R4.0'  (แถวที่ 0083 สร้างเท่านั้น)
--   ② ชื่อมีรหัสอลู F####/B####/E-## ปนอยู่
--   ③ รหัสนั้นมี "เส้นจริง" ในสโตร์อยู่แล้ว (แถวที่ชื่อขึ้นต้นด้วยรหัส)
--   ④ ไม่มีความเคลื่อนไหวในสมุดสโตร์ และยอดคงเหลือเป็น 0
-- แถวที่มีประวัติเบิก/มียอด จะไม่ถูกลบ (ขึ้นในตารางสรุปท้ายไฟล์ให้ดูเอง)

begin;

create temp table _dup_parts on commit drop as
with coded as (
  select id, name, qty_on_hand, supplier,
         (regexp_match(name, '\m([FBE][0-9]{4,5}[A-Za-z]?)\M'))[1] as code_any,
         (regexp_match(name, '^([FBE][0-9]{4,5}[A-Za-z]?)\M'))[1] as code_head
  from public.stock_items
),
real_codes as (        -- รหัสที่มี "เส้นจริง" อยู่ในสโตร์ (ชื่อขึ้นต้นด้วยรหัส · ไม่ใช่แถว BOM)
  select distinct upper(code_head) as code
  from coded
  where code_head is not null and coalesce(supplier, '') <> 'ถอดทุน R4.0'
)
select c.id, c.name, c.code_any, c.qty_on_hand
from coded c
join real_codes rc on rc.code = upper(c.code_any)
where c.supplier = 'ถอดทุน R4.0'
  and c.code_any is not null

union

-- แถวที่เขียนรหัสแบบไม่มีตัวอักษรนำ (บานโซลิด: 'กรอบประตู 7864' = F7864 ที่สโตร์มี 7 สี)
--   เจ้าของสั่งเพิ่ม 3 ก.ย.69 "solid door อัพเข้าด้วย"
--   ⚠ ตัวนี้ไม่เคยไปกดราคาเส้นจริง (ไม่มีตัวอักษรนำ ระบบเลยไม่นับเป็นรหัสอลู) — ลบเพื่อความสะอาดอย่างเดียว
--   ไม่รวม 'HD-1180 ก้านสไลด์' เพราะ HD = รหัสผู้ผลิตอุปกรณ์ ไม่ใช่เส้นอลู และระบบใช้ชื่อนี้ผูกราคาอยู่
select c2.id, c2.name, 'F7864' as code_any, c2.qty_on_hand
from public.stock_items c2
where c2.supplier = 'ถอดทุน R4.0'
  and c2.name = 'กรอบประตู 7864'
  and exists (select 1 from public.stock_items s2
              where s2.name like 'F7864%' and coalesce(s2.supplier, '') <> 'ถอดทุน R4.0');

-- แยกตัวที่ลบได้จริง: ยอด 0 · ไม่มีความเคลื่อนไหว · ไม่มีใบตัด/BOQ อ้างถึง
create temp table _dup_deletable on commit drop as
select d.id, d.name
from _dup_parts d
where coalesce(d.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = d.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = d.id);

delete from public.stock_prices p using _dup_deletable d where p.stock_item_id = d.id;
delete from public.stock_items s using _dup_deletable d where s.id = d.id;

-- สรุปผล: ลบไปกี่แถว · เหลือแถวไหนที่ลบไม่ได้ (มียอด/มีประวัติเบิก/มีใบตัดอ้างถึง)
select 'ลบแล้ว' as สถานะ, count(*) as จำนวน, string_agg(name, ' · ' order by name) as รายการ
from _dup_deletable
union all
select 'ไม่ได้ลบ (มียอดคงเหลือ / มีประวัติเบิก / มีใบตัดอ้างถึง)', count(*), string_agg(name, ' · ' order by name)
from _dup_parts d
where not exists (select 1 from _dup_deletable x where x.id = d.id);

commit;
