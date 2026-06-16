-- ============================================================
-- JR OMS — 0041 บันทึกรายละเอียดการวัดจริง: ใครวัด + กี่โมง
--
-- เดิม productions มีแค่ measure_actual (วันที่วัดจริง · date)
-- เพิ่ม:
--   measure_actual_time  เวลาที่วัดจริง (text "HH:MM" · เหมือน measure_time ของนัด)
--   measured_by_name     ชื่อช่างที่วัดจริง (free-text · เหมือน measurer_name ของนัด
--                        เพราะช่างวัดไม่มี user account)
-- idempotent · รันก่อน deploy โค้ดที่ select คอลัมน์นี้ (กัน /api/production 500)
-- ============================================================

alter table public.productions add column if not exists measure_actual_time text;
alter table public.productions add column if not exists measured_by_name text;

comment on column public.productions.measure_actual_time is 'เวลาที่วัดจริง HH:MM (0041)';
comment on column public.productions.measured_by_name is 'ชื่อช่างที่วัดจริง free-text (0041)';
