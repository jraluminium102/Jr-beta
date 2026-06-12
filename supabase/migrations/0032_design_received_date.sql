-- ============================================================
-- JR — 0032 วันได้รับแบบ (design received date) บนงานเขียนแบบ
-- เพิ่มฟิลด์ "วันที่ทีมเขียนแบบได้รับงาน" แยกจากวันเริ่มทำ/วันเสร็จ
-- ใช้ในหน้าจัดการงานเขียนแบบ (designer board) + sync จาก Excel master (คอลัมน์ L)
-- idempotent — รันซ้ำได้
-- ============================================================

alter table public.jobs
  add column if not exists design_received_date date;

comment on column public.jobs.design_received_date is 'วันที่ทีมเขียนแบบได้รับงาน (คอลัมน์ L ใน master sheet)';
