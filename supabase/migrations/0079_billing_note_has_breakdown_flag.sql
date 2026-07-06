-- 0079: ธงบอกว่าใบวางบิลมี "ยอดก่อนภาษีจริง" (subtotal เป็นยอดก่อน VAT ที่เชื่อถือได้)
-- ปัญหาที่แก้ (บัญชีตรวจเจอ): guard subtotal>0 แยกไม่ออกระหว่าง
--   (ก) subtotal ที่เป็นยอดก่อน VAT จริง (สร้างจากใบเสนอที่มี subtotal) → แก้ footer/ติ๊ก VAT ได้
--   (ข) subtotal ที่ backfill = total (ยอดหลัง VAT/WHT แล้ว — ใบเก่า/ใบนำเข้า) → ห้ามติ๊ก VAT (คิดทับ ยอดเกิน)
-- has_tax_breakdown = true เฉพาะ (ก) เท่านั้น → ปุ่ม "แก้ VAT/ส่วนลด" โผล่/แก้ได้เฉพาะใบพวกนี้

alter table public.billing_notes
  add column if not exists has_tax_breakdown boolean not null default false;

-- ใบเดิมทั้งหมดตั้ง false (ปลอดภัยไว้ก่อน) — subtotal ที่ backfill จาก 0078 อาจเป็นยอดหลัง VAT
-- ใบใหม่ที่สร้างหลังจากนี้จะตั้ง true เองเมื่อใบเสนอมี subtotal จริง (โค้ด POST)
