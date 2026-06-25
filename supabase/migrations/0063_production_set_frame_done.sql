-- 0063: ช่อง "ผลิตเสร็จ" (เฟรมผลิตเสร็จ ก่อนใส่กระจก) ต่อชุดงาน
--   ช่างกด → ขึ้นแจ้งเตือนให้ QC มาตรวจก่อนใส่กระจก
--   ค่า: '' (ยังไม่เสร็จ) / 'ผลิตเสร็จ'
alter table public.production_sets
  add column if not exists frame_done text not null default '';

notify pgrst, 'reload schema';
