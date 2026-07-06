-- 0078: ใบวางบิลเก็บ "ยอดแยก" ของตัวเอง (ส่วนลด/VAT/หัก ณ ที่จ่าย) — ติ๊กปรับได้ตอนสร้าง
-- เดิมเก็บแค่ total (= net จากใบเสนอ) · ตอนนี้เก็บครบเพื่อโชว์ footer + ปรับได้
-- total ยังคง = ยอดที่ต้องเก็บจริง (net) · งวดชำระอิงยอดนี้เหมือนเดิม

alter table public.billing_notes
  add column if not exists subtotal     numeric(14,2) not null default 0,
  add column if not exists discount_pct numeric(5,2)  not null default 0,
  add column if not exists discount_amt numeric(14,2) not null default 0,
  add column if not exists vat_rate     numeric(5,2)  not null default 0,
  add column if not exists vat_amt      numeric(14,2) not null default 0,
  add column if not exists wht_rate     numeric(5,2)  not null default 0,
  add column if not exists wht_amt      numeric(14,2) not null default 0;

-- backfill ใบเดิม: ไม่มี breakdown → ตั้ง subtotal = total (ถือว่าเป็นยอดล้วน ไม่มีภาษีแยก · เอกสารเก่าคงเดิม)
update public.billing_notes set subtotal = total where subtotal = 0 and total > 0;
