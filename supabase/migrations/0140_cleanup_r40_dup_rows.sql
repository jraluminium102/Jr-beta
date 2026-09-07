-- 0140: ล้างแถวสโตร์ "ตัวเปล่า" ที่ migration 0083 สร้างซ้ำไว้ (supplier = 'ถอดทุน R4.0')
--
-- เจ้าของสั่ง 4 ก.ย.69 "ไปไล่เช็คและลบตัวที่สร้างมาเปล่า ๆ — ไม่มีรูป ไม่มีจำนวนสโตร์"
--
-- แทนที่ 0137 (เขียนด้วย temp table รันในหน้า SQL ของ Supabase ไม่ได้) และ 0138 (รายชื่อยาวเกินใช้จริง)
--   หลักการที่ใช้แทนรายชื่อ: ลบเฉพาะแถวที่ "มีของจริงตัวเดียวกันอยู่ในสโตร์แล้ว"
--   → ลบแล้วราคาไม่หาย เพราะระบบไปอ่านจากแถวของจริงแทน
--   แถวที่ไม่มีของจริงคู่กัน = ยังไม่ลบ (อาจเป็นแหล่งราคาเดียวของสูตร) ขึ้นในตารางท้ายให้ดู
--
-- ปลอดภัยทุกคำสั่ง: ยอดคงเหลือ = 0 · ไม่เคยมีความเคลื่อนไหว · ไม่เคยเข้าใบตัด/BOQ
-- stock_prices ผูกแบบ on delete cascade อยู่แล้ว → ลบ stock_items ราคาหายตามเอง
-- ⚠ ห้ามใช้ temp table (หน้า SQL รันทีละคำสั่งแยก transaction)

-- ① แถวที่ชื่อมีรหัสอลูปนอยู่ (เช่น 'วงกบ 3 ด้าน F7859') และสโตร์มี "เส้นจริง" ของรหัสนั้นแล้ว
delete from public.stock_items s
where s.supplier = 'ถอดทุน R4.0'
  and coalesce(s.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = s.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = s.id)
  and exists (
    select 1 from public.stock_items r
    where coalesce(r.supplier, '') <> 'ถอดทุน R4.0'
      and r.name ilike ((regexp_match(s.name, '([FBE][0-9]{4,5}[A-Za-z]?)'))[1] || '%')
  );

-- ② แถวที่ชื่อ "ตรงกันเป๊ะ" กับของจริงที่มีอยู่แล้ว (ซ้ำกันตรง ๆ)
delete from public.stock_items s
where s.supplier = 'ถอดทุน R4.0'
  and coalesce(s.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = s.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = s.id)
  and exists (
    select 1 from public.stock_items r
    where r.id <> s.id
      and coalesce(r.supplier, '') <> 'ถอดทุน R4.0'
      and btrim(r.name) = btrim(s.name)
  );

-- ③ เคสพิเศษ 'กรอบประตู 7864' (เขียนรหัสไม่มีตัวอักษรนำ ข้อ ① จับไม่ได้) — ของจริงคือ F7864
delete from public.stock_items s
where s.supplier = 'ถอดทุน R4.0'
  and s.name = 'กรอบประตู 7864'
  and coalesce(s.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = s.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = s.id)
  and exists (select 1 from public.stock_items r
              where r.name like 'F7864%' and coalesce(r.supplier, '') <> 'ถอดทุน R4.0');

-- ④ เหลืออะไรบ้าง — แถว 0083 ที่ยังอยู่ (ยังไม่มีของจริงคู่กัน / มียอด / เคยเบิก)
select s.sku, s.name, coalesce(s.qty_on_hand, 0) as คงเหลือ,
       (select count(*) from public.stock_moves m where m.stock_item_id = s.id) as ครั้งที่เคลื่อนไหว,
       (select count(*) from public.boq_items b where b.stock_item_id = s.id) as ใช้ในใบตัด
from public.stock_items s
where s.supplier = 'ถอดทุน R4.0'
order by s.name;
