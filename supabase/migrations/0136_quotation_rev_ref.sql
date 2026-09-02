-- 0136 · ใบปะหน้า/แบบช่าง อ้างอิงใบเสนอราคาให้เลือก rev ได้ + เตือนเมื่อใบเสนอถูก Rev หลังสร้าง
-- เจ้าของเคาะ: (1) ไม่ auto-overwrite — ใบปะหน้า/แบบช่างที่สร้างแล้วยึด quotation_id/rev ตอนสร้าง
--   ถ้าใบเสนอถูก Rev ทีหลัง (revision_no ปัจจุบัน > ที่จำไว้) แค่ "เตือน" (chip หน้าผลิต + banner ในหน้า) ไม่ทับของที่แก้มือ
--   (2) มีดรอปดาวน์เลือกใบเสนอ/rev ได้เอง (pin quotation_id) default = ตัวที่ pickJobQuotation เลือก (บิลก่อน/ล่าสุด)
-- idempotent · add column if not exists เท่านั้น · เจ้าของรันเอง
-- ============================================================

alter table public.cover_sheets
  add column if not exists quotation_rev_no int not null default 0;

alter table public.job_drawings
  add column if not exists quotation_id bigint references public.quotations(id) on delete set null;
alter table public.job_drawings
  add column if not exists quotation_rev_no int not null default 0;

notify pgrst, 'reload schema';
