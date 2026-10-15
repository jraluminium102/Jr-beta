-- 0155: ชนกลางรับบานเลื่อน (เมืองทอง 4149) — เติมสีให้ครบ + น้ำหนัก + รูป
--
-- เจ้าของแจ้ง 15 ต.ค.69: "ชนกลางรับบานเลื่อน(เมืองทอง) 0.358 Kg./m. เจอว่ามีสีเดียวคือดำ … เพิ่มให้ครบ ขาว เทาซาฮาร่า มิว ใส่รูปด้วย"
--   โปรไฟล์ 4149 (42.20 × 17.50 หนา 1.60) · 0.358 กก./ม. × เส้น 6 ม. = 2.148 กก./เส้น
--   ใช้กับ: บานเลื่อนรางบน (topslide) · ประตู PC Door — ทั้งคิดราคาและใบตัด (byColor: ดำ = JR03125 · อบขาว = JR03128)
--   เดิมในสโตร์: JR03125 ดำ (ชื่อ "ชนกลางรับบานเลื่อน(เมืองทอง)") + JR03128 อบขาว (ชื่อ "ชนกลางบานเลื่อน(เมืองทอง)" — ตัวเดียวกัน ชื่อไม่ตรง)
--     ทั้งคู่ต้นทุน 0 · ไม่คิดต่อโล · ไม่มีน้ำหนัก → สีพิเศษไม่ได้คิดค่าสีเลย
--   ราคาต่อโล = เรตแบรนด์ "ตลาด" (กล่อง/ฉากเมืองทองที่มีชื่อเรียก) — อบขาว 188 · ดำ 203 · เทาซาฮาร่า 203 · มิว 183 (pricebook ALU_BRAND.market)
--   มิว = ของสั่งตามงาน (is_stocked = false) ตามกติกาสีมิวทุกโปรไฟล์
--   รูป = ไฟล์ในเว็บ /stock-img/mtong-4149.png (ไม่ต้องอัปโหลดเข้า storage)
--
-- ⚠ ห้ามใช้ temp table (หน้า SQL ของ Supabase รันทีละคำสั่งแยก transaction) · รันซ้ำได้ (กันเพิ่มซ้ำด้วย not exists)

-- ① แถวเดิม 2 สี: ชื่อเดียวกัน + คิดต่อโล + น้ำหนัก + รูป
update public.stock_items
set name = 'ชนกลางรับบานเลื่อน(เมืองทอง)',
    is_weight_based = true,
    weight_per_unit = 2.148,
    price_per_kg = case when sku = 'JR03125' then 203 else 188 end,
    unit_cost = round(2.148 * case when sku = 'JR03125' then 203 else 188 end, 2),
    image_url = case when btrim(coalesce(image_url, '')) = '' then '/stock-img/mtong-4149.png' else image_url end
where sku in ('JR03125', 'JR03128');

-- ② เพิ่ม เทาซาฮาร่า (สต็อก) + มิว (สั่งตามงาน) — ก๊อปหมวด/หน่วย/ร้านจากแถวดำ
insert into public.stock_items (name, color, category, category_id, unit, supplier, is_weight_based, weight_per_unit, price_per_kg, unit_cost, qty_on_hand, is_active, is_stocked, image_url)
select 'ชนกลางรับบานเลื่อน(เมืองทอง)', c.color, s.category, s.category_id, coalesce(nullif(s.unit, ''), 'เส้น'), s.supplier,
       true, 2.148, c.rate, round(2.148 * c.rate, 2), 0, true, c.stocked, '/stock-img/mtong-4149.png'
from public.stock_items s
cross join (values ('เทาซาฮาร่า', 203::numeric, true), ('มิว', 183::numeric, false)) as c(color, rate, stocked)
where s.sku = 'JR03125'
  and not exists (select 1 from public.stock_items x where btrim(x.name) = 'ชนกลางรับบานเลื่อน(เมืองทอง)' and x.color = c.color);

-- ③ เติมรหัสแถวใหม่ตามกติกาเดิม (JR + id 5 หลัก · migration 0103)
update public.stock_items
set sku = 'JR' || lpad(id::text, 5, '0')
where btrim(name) = 'ชนกลางรับบานเลื่อน(เมืองทอง)' and btrim(coalesce(sku, '')) = '';

-- ④ ตรวจผล — ต้องได้ 4 แถว: อบขาว · ดำ · เทาซาฮาร่า · มิว
select s.sku, s.name, s.color, s.weight_per_unit as กก_ต่อเส้น, s.price_per_kg as บาท_ต่อกก, s.unit_cost as ต้นทุน_ต่อเส้น, s.is_stocked as สต็อก, s.image_url
from public.stock_items s
where btrim(s.name) = 'ชนกลางรับบานเลื่อน(เมืองทอง)'
order by s.sku;
