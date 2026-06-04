-- ============================================================
-- JR Beta — 0011 Journey: enum values
-- ⚠️ ต้องรันไฟล์นี้ให้ commit จบก่อน แล้วค่อยรัน 0012
--    เพราะ Postgres ห้าม ALTER TYPE ... ADD VALUE แล้วใช้ค่าใหม่นั้น
--    ในทรานแซกชันเดียวกัน (0012 อ้างค่าใหม่ใน RPC)
-- รันใน Supabase SQL Editor: วางไฟล์นี้ → Run → (ค่อยเปิด query ใหม่รัน 0012)
-- ============================================================

-- เพิ่มสเตจ macro ให้ jobs (backbone ของเส้นทางลูกค้า)
alter type job_status_t add value if not exists 'LEAD'          before 'PENDING_QUOTE';
alter type job_status_t add value if not exists 'IN_PRODUCTION' after  'DEPOSITED';
alter type job_status_t add value if not exists 'INSTALLING'    after  'IN_PRODUCTION';

-- ระดับความรุนแรงของปัญหา (ใช้ในเฟสบันทึกปัญหา + สถิติ)
do $$ begin
  create type issue_severity_t as enum ('LOW','MEDIUM','HIGH');
exception when duplicate_object then null; end $$;
