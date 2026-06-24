-- ============================================================
-- 0056 · audit การมาร์คเช็คลิสต์ช่าง — ใครกด/เมื่อไหร่
--   4 ช่องที่ช่างกด (ได้แบบ/ใส่กระจก/QC ก่อน-หลัง) เก็บชื่อผู้กด + เวลา
--   ออฟฟิศเห็นเป็น read-only + รู้ว่าใครกด (กันเขียนทับ/สืบย้อนได้)
-- ============================================================
alter table public.production_sets
  add column if not exists design_received_by text,
  add column if not exists design_received_at timestamptz,
  add column if not exists glass_installed_by text,
  add column if not exists glass_installed_at timestamptz,
  add column if not exists qc_before_by text,
  add column if not exists qc_before_at timestamptz,
  add column if not exists qc_after_by text,
  add column if not exists qc_after_at timestamptz;

notify pgrst, 'reload schema';
