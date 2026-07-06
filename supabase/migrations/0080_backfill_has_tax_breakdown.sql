-- 0080: backfill has_tax_breakdown = true ให้ใบวางบิลที่ "ยอดก่อนภาษีเชื่อถือได้"
-- 0079 ตั้ง default false ทุกใบ (ปลอดภัยไว้ก่อน) → ทำให้ปุ่ม "แก้ VAT/ส่วนลด" ไม่โผล่กับใบที่มีอยู่แล้ว
--
-- เกณฑ์ที่ปลอดภัย: bn.subtotal ตรงกับ subtotal (ยอดก่อน VAT จริง) ของใบเสนอต้นทาง
--   → ใบที่สร้างจากใบเสนอในระบบที่มี subtotal จริง = ยอดก่อนภาษีถูกต้อง → แก้ footer ได้
--   → ใบนำเข้า/ใบเก่าที่ subtotal ถูก backfill = ยอดหลัง VAT (0078) จะไม่ตรง q.subtotal → คงเป็น false (กันคิด VAT ทับ)
-- แก้เฉพาะใบที่ยังไม่ถูกยกเลิก

update public.billing_notes bn
set has_tax_breakdown = true
from public.quotations q
where bn.quotation_id = q.id
  and q.subtotal is not null
  and q.subtotal > 0
  and abs(coalesce(bn.subtotal, 0) - q.subtotal) < 0.01
  and bn.status <> 'cancelled'
  and bn.has_tax_breakdown = false;
