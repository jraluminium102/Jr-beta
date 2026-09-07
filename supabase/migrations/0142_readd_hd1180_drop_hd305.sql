-- 0142: เฟี้ยมยูโร — เพิ่ม HD-1180 ก้านสไลด์ กลับเข้าสโตร์ + ลบ HD-305 ที่ไม่ได้ใช้
--
-- เจ้าของแจ้ง 4 ก.ย.69 "เผลอลบ HD-1180 ก้านสไลด์ ไปตัวนึง รบกวนเพิ่มใหม่"
--   ราคา 73 บาท/ตัว — ยึดไฟล์ ถอดทุน_รวมทั้งหมด v20.1.xlsx ชีต "คิดทุน เฟี้ยมยูโร" แถว 28
--   (ใช้ 2 ตัว/ชุด ตามไฟล์ · สูตรในเว็บผูกด้วยชื่อ "HD-1180 ก้านสไลด์" ห้ามแก้ชื่อ)
--
-- HD-305 กลอนบานเฟี้ยม (JR02950): ไล่ทั้งไฟล์ถอดทุนแล้วไม่มีบรรทัดนี้เลย และไม่มีสูตรไหนในเว็บอ้างถึง
--   → เจ้าของยืนยัน "ไม่ได้ใช้" ลบทิ้ง
--
-- ⚠ ห้ามใช้ temp table (หน้า SQL ของ Supabase รันทีละคำสั่งแยก transaction)

-- ① เพิ่ม HD-1180 กลับ (ก๊อปหมวด/หน่วยจากพี่น้องมัน HD-641 · กันเพิ่มซ้ำด้วย not exists)
insert into public.stock_items (name, category, unit, unit_cost, qty_on_hand, is_active)
select 'HD-1180 ก้านสไลด์', s.category, coalesce(nullif(s.unit, ''), 'ตัว'), 73, 0, true
from public.stock_items s
where s.name = 'HD-641 บานพับเฟี้ยม'
  and not exists (select 1 from public.stock_items x where btrim(x.name) = 'HD-1180 ก้านสไลด์')
limit 1;

-- ② เติมรหัสให้แถวใหม่ตามกติกาเดิมของระบบ (JR + id 5 หลัก · migration 0103)
update public.stock_items
set sku = 'JR' || lpad(id::text, 5, '0')
where btrim(name) = 'HD-1180 ก้านสไลด์' and btrim(coalesce(sku, '')) = '';

-- ③ ลบ HD-305 กลอนบานเฟี้ยม — ไม่มีในไฟล์ถอดทุน ไม่มีสูตรไหนใช้ (ยังคุมด้วยยอด 0 · ไม่เคยเบิก · ไม่เคยเข้าใบตัด)
delete from public.stock_items s
where s.sku = 'JR02950'
  and coalesce(s.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = s.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = s.id);

-- ④ ตรวจผล — อุปกรณ์เฟี้ยมยูโรตามไฟล์ ต้องครบ 9 บรรทัด (HD-640/641/642/643/474/312/1180/213/200)
select s.sku, s.name, s.unit, coalesce(s.unit_cost, 0) as ต้นทุน, coalesce(s.qty_on_hand, 0) as คงเหลือ
from public.stock_items s
where s.name like 'HD-%'
order by s.name;
