-- 0139: ลบรหัสอุปกรณ์ที่เจ้าของสั่งเลิกใช้ (ย้ายไปผูกรหัสใหม่ในสูตรเรียบร้อยแล้ว)
--
-- เจ้าของสั่ง 4 ก.ย.69 — ทุกตัวย้ายในสูตรแล้ว ไม่มีที่ไหนอ้างถึงอีก (เทส verify-hw-cutlist คุมไว้)
--   JR00228 ล้อ 27        → JR00576      JR00242 สักหลาด → JR00794
--   JR00195 ชุดกลอนใบลอง  → JR00596+598  JR00226 น็อต    → JR00864
--   JR00267 ฉากประคองมุม  → JR00480      JR00244 ยาง     → JR00771
--   JR00200 ฉากประกอบมุม  → JR00480      JR00276         → JR00592
--   JR00243               → JR00564
--
-- ⚠ ห้ามใช้ temp table — หน้า SQL ของ Supabase รันทีละคำสั่งแยก transaction
--   temp table แบบ on commit drop จะหายทันทีหลังคำสั่งแรก (เจ้าของเจอ error 42P01 มาแล้ว)
--   → เขียนเป็นคำสั่งเดี่ยว ๆ ที่จบในตัวเอง รันซ้ำได้ไม่พัง
--
-- ปลอดภัย: ลบเฉพาะแถวที่ ยอดคงเหลือ = 0 · ไม่เคยมีความเคลื่อนไหวในสมุดสโตร์ · ไม่เคยเข้าใบตัด/BOQ

-- ① ลบราคาที่ผูกกับแถวพวกนี้ก่อน (ตาราง stock_prices อ้าง stock_items อยู่)
delete from public.stock_prices p
using public.stock_items s
where p.stock_item_id = s.id
  and s.sku in ('JR00228','JR00195','JR00242','JR00226','JR00244','JR00267','JR00200','JR00276','JR00243')
  and coalesce(s.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = s.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = s.id);

-- ② ลบตัวรายการ
delete from public.stock_items s
where s.sku in ('JR00228','JR00195','JR00242','JR00226','JR00244','JR00267','JR00200','JR00276','JR00243')
  and coalesce(s.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = s.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = s.id);

-- ③ เหลืออะไรบ้าง (ถ้าว่าง = ลบครบแล้ว) — ตัวที่ยังอยู่คือมียอด/เคยเบิก/เคยเข้าใบตัด
select s.sku, s.name, coalesce(s.qty_on_hand, 0) as คงเหลือ,
       (select count(*) from public.stock_moves m where m.stock_item_id = s.id) as ครั้งที่เคลื่อนไหว,
       (select count(*) from public.boq_items b where b.stock_item_id = s.id) as ใช้ในใบตัด
from public.stock_items s
where s.sku in ('JR00228','JR00195','JR00242','JR00226','JR00244','JR00267','JR00200','JR00276','JR00243')
order by s.sku;
