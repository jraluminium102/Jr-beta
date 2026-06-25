-- 0062: เก็บเช็คลิสต์ QC (เทคนิค) เป็น jsonb ในตาราง qc_checks
--   { "ขนาดตรงตามแบบ": true, ... } — บันทึกพร้อมผลตรวจ (ผ่าน/ไม่ผ่าน) เพื่อ audit
alter table public.qc_checks
  add column if not exists checklist jsonb;

notify pgrst, 'reload schema';
