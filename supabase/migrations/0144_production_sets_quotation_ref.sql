-- ============================================================
-- 0144 · production_sets อ้างอิง Rev ใบเสนอ
--   เพื่อรองรับ "Rev ใบเสนอหลังมัดจำ → ดึงรายละเอียดใหม่ทั้งหมดเข้าผลิต/ติดตั้งอัตโนมัติ"
--   quotation_id  = ใบเสนอที่ชุดนี้ดึงมา (auto จากปุ่ม/Rev) · null = ชุดที่เพิ่มมือ (ไม่ถูกแทนที่ตอน Rev)
--   quotation_rev_no = เลข Rev ตอนดึง (ไว้เทียบ stale ถ้าต้องใช้)
-- idempotent · เจ้าของรัน
-- ============================================================

alter table public.production_sets
  add column if not exists quotation_id bigint,
  add column if not exists quotation_rev_no integer not null default 0;

comment on column public.production_sets.quotation_id is 'ใบเสนอที่ชุดนี้ดึงมา (auto) · null = เพิ่มมือ → ไม่ถูกแทนที่ตอน Rev';
comment on column public.production_sets.quotation_rev_no is 'เลข Rev ของใบเสนอตอนดึงชุดนี้เข้า';
