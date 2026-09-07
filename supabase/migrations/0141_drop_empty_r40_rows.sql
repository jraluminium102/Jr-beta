-- 0141: ลบแถวเปล่าที่เหลือของ 0083 — ตรวจทีละแถวกับสูตรจริงแล้ว (เจ้าของส่งรายการมาให้ 4 ก.ย.69)
--
-- จากแถว supplier='ถอดทุน R4.0' ที่เหลือ 143 แถว → ลบได้ 22 · เก็บไว้ 121
--   เก็บไว้ = ยังเป็น "แหล่งราคา" ของสูตรอยู่ (ผูกด้วยรหัส · ผูกด้วยชื่อผ่าน PB.PARTS · หรือเป็นรหัสอลูที่สูตรใช้)
--   ลบได้   = ① แถวซ้ำเป๊ะ 8 คู่ (เก็บตัวแรกไว้ 1 ตัว)  ② 14 แถวที่ไม่มีสูตรไหนอ้างถึงเลย
--
-- ตรวจแล้วว่าไม่มีตัวไหนอยู่ใน PB.PARTS (คีย์ผูกราคาด้วยชื่อ) และไม่มีรหัสไหนอยู่ในสูตร
-- ปลอดภัย: ยังคุมด้วย ยอด 0 · ไม่เคยเคลื่อนไหว · ไม่เคยเข้าใบตัด/BOQ เหมือนเดิม
-- ⚠ ห้ามใช้ temp table (หน้า SQL ของ Supabase รันทีละคำสั่งแยก transaction)

-- ① แถวซ้ำเป๊ะ — เก็บตัวที่ id น้อยสุดไว้ 1 ตัว ลบที่เหลือ
--   ⚠ ต้องเทียบ 'สี' ด้วย (เจ้าของท้วง 4 ก.ย.69: 'มันมีตัวสีขาว สีดำอะ')
--   ชื่อ+รหัสเหมือนกันแต่คนละสี = คนละของ ห้ามลบ — กฎเดิมของระบบ: สีอ่านจาก stock_items.color เสมอ
delete from public.stock_items s
where s.supplier = 'ถอดทุน R4.0'
  and coalesce(s.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = s.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = s.id)
  and exists (
    select 1 from public.stock_items k
    where k.id < s.id
      and btrim(k.name) = btrim(s.name)
      and coalesce(k.sku, '') = coalesce(s.sku, '')
      and coalesce(k.color, '') = coalesce(s.color, '')
  );

-- ② แถวที่ไม่มีสูตรไหนอ้างถึงเลย (ตรวจทีละตัวกับ products.mjs + ใบตัด + PB.PARTS แล้ว)
delete from public.stock_items s
where s.supplier = 'ถอดทุน R4.0'
  and s.sku in ('JR03025','JR03024','JR03022','JR03002','JR03005','JR03003',
                'JR03063','JR03065','JR03061','JR03027','JR03006','JR03020','JR03004','JR03032')
  and coalesce(s.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = s.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = s.id);

-- ③ เหลือกี่แถว (ควรเหลือ 121 = ตัวที่ยังเป็นแหล่งราคาของสูตร)
select count(*) as แถวที่เหลือของ_0083 from public.stock_items where supplier = 'ถอดทุน R4.0';
