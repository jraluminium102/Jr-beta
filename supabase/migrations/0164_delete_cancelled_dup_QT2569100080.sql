-- 0164 · ลบใบเสนอซ้ำที่ยกเลิกแล้ว QT2569100080 (คุณอาภากร จันทรบูรณ์)
--
-- เจ้าของ 26 ต.ค.69: "คุณอาภากร จันทรบูรณ์ ที่ยกเลิก เอาออกไปเลยได้ไหม"
--   ใบนี้เกิดจากกดบันทึกซ้ำ (ใบจริงคือ QT2569100081 · แก้ปุ่มกันกดซ้ำแล้ว)
--   ลบได้เฉพาะเมื่อ: สถานะยกเลิก + ไม่มีเอกสารอื่นอ้างถึง (ใบวางบิล/ใบสั่งผลิต/ใบรับประกัน/BOQ)
--   รายการในใบ (quotation_items) และ Rev ลบตามเอง · ใบปะหน้าที่อ้างถึง (ถ้ามี) จะเลิกอ้างเอง
-- รันซ้ำได้ (ถ้าลบไปแล้ว = ไม่มีอะไรเกิดขึ้น)

delete from public.quotations q
 where q.code = 'QT2569100080'
   and q.status = 'cancelled'
   and not exists (select 1 from public.billing_notes b where b.quotation_id = q.id)
   and not exists (select 1 from public.production_orders p where p.quotation_id = q.id)
   and not exists (select 1 from public.warranties w where w.quotation_id = q.id)
   and not exists (select 1 from public.boqs x where x.quotation_id = q.id);

-- ตรวจผล: ต้องเหลือแค่ QT2569100081 ของคุณอาภากร
select code as ใบเสนอ, status as สถานะ, net as ยอด
  from public.quotations
 where code in ('QT2569100080', 'QT2569100081')
 order by code;
