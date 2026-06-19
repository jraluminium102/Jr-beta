-- ============================================================
-- JR OMS — 0042 ติ๊ก "ชำระค่าประเมินแล้ว" ในคิวประเมิน
--
-- เดิม queue_entries มี: assess_fee (ยอดค่าประเมิน), payment (ข้อความวิธีจ่าย),
--   receipt_done (ติ๊กส่งใบเสร็จแล้ว)
-- เพิ่ม fee_paid boolean — ติ๊กว่าลูกค้าจ่ายค่าประเมินแล้ว (แบบเดียวกับ receipt_done)
-- idempotent · รันก่อน deploy โค้ดที่ select/อัปเดตคอลัมน์นี้
-- ============================================================

alter table public.queue_entries add column if not exists fee_paid boolean not null default false;

comment on column public.queue_entries.fee_paid is 'ลูกค้าชำระค่าประเมินแล้ว (ติ๊ก checklist · 0042)';
