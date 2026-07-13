-- 0092: ส่วนลดเป็น "จำนวนเงิน" + "หัวข้อส่วนลด" (ใบเสนอราคา + ใบวางบิล) ทั้งระบบ
-- discount_amt (มีอยู่แล้ว) กลายเป็นตัวตั้งจริง (authoritative) · discount_pct = อ้างอิงเพื่อโชว์
-- discount_label = หัวข้อว่าเป็นส่วนลดอะไร (เช่น "ส่วนลดโปรโมชัน", "ส่วนลดลูกค้าเก่า") — โชว์บนเอกสาร
alter table public.quotations
  add column if not exists discount_label text not null default '';

alter table public.billing_notes
  add column if not exists discount_label text not null default '';
