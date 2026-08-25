-- 0125 — แยก "ของมีสต็อก" ออกจาก "ของสั่งตามงาน" (เจ้าของเคาะ 24 ส.ค.69 แบบ ก. ไม่บันทึกความเคลื่อนไหว)
--
-- ปัญหา: ของบางอย่างไม่ได้สต็อกไว้ สั่งซื้อเมื่อมีงานเท่านั้น (มอเตอร์ · รีโมท · ล้อประตูรั้ว · อุปกรณ์ HD เฟี้ยมยูโร)
--        เดิมแยกด้วย "ธรรมเนียมการกรอก" (ผู้ขาย = ถอดทุน R4.0 · หมายเหตุ = ใช้คิดราคา 4.0) ซึ่งระบบอ่านไม่ออก
--        → ตอนกด "ตัดออกสโตร์" ระบบไปหักของพวกนี้จนติดลบ ทั้งที่ไม่เคยมีของในสต็อก
--
-- แก้: ธงจริง is_stocked
--        true  (ค่าตั้งต้น) = ของมีสต็อก — หักสต็อก · เตือนของใกล้หมด · นับรายวัน
--        false                = ของสั่งตามงาน — ใช้เป็น "ราคา" อย่างเดียว ไม่หัก ไม่เตือน ไม่ต้องนับ
--
-- ⚠ ยังใช้เป็นแหล่งราคาของคิดราคา 4.0 เหมือนเดิมทุกประการ — ธงนี้กระทบแค่ "การหักสต็อก"

alter table public.stock_items
  add column if not exists is_stocked boolean not null default true;

comment on column public.stock_items.is_stocked is
  'true = ของมีสต็อก (หักสต็อก/เตือน/นับ) · false = ของสั่งตามงาน ใช้เป็นราคาอย่างเดียว';

-- ตั้งธงย้อนหลังให้แถวที่สร้างมาเป็น "ราคาล้วน" อยู่แล้ว
--   เงื่อนไขต้องเข้าทุกข้อ กันไปโดนของสต็อกจริงที่บังเอิญยอดเป็น 0 ชั่วคราว
update public.stock_items
   set is_stocked = false
 where is_stocked = true
   and coalesce(supplier, '') = 'ถอดทุน R4.0'
   and coalesce(note, '') = 'ใช้คิดราคา 4.0'
   and coalesce(qty_on_hand, 0) = 0
   and not exists (select 1 from public.stock_moves m where m.stock_item_id = stock_items.id);

-- ดูรายการที่ตั้งธงไปแล้ว (ไว้ตรวจ) — ไม่กระทบข้อมูล
--   select id, sku, name, unit_cost from public.stock_items where is_stocked = false order by id;
create index if not exists stock_items_is_stocked_idx on public.stock_items (is_stocked) where is_stocked = false;
