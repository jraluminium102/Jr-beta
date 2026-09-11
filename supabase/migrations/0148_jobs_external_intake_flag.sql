-- 0148 — ธง "งานนอกระบบลัดคิววัด" (external intake)
-- งานที่สร้างจากปุ่ม "เพิ่มลูกค้านอกระบบ" ในหน้านัดวัดจริง (measure-schedule/external)
-- = ลัดเข้าคิวผลิตโดยยังไม่มีดีล/เงินจริง (status=DEPOSITED เพื่อให้ trigger สร้างคิววัด แต่ไม่มีมัดจำ)
-- ธงนี้ให้รายงานการเงิน/สถิติ "กัน" ไม่ให้กลายเป็นลูกหนี้ผี + ไม่ปั่น close-rate
--   (accountant 11 ก.ย.69: DEPOSITED-ไม่มีเงิน โผล่ finance/outstanding เป็นลูกหนี้ผี + stats won เฟ้อ)
-- เมื่อมีบิล/มัดจำจริงภายหลัง → logic เดิม (billing_notes/deposit_date) คิดถูกเองอยู่แล้ว ธงไม่กระทบ

alter table public.jobs
  add column if not exists external_intake boolean not null default false;

comment on column public.jobs.external_intake is
  'true = งานลัดคิววัดจากลูกค้านอกระบบ (ยังไม่มีดีล/เงินจริง) — รายงานลูกหนี้/close-rate ให้ข้าม';
