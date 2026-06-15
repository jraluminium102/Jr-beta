-- 0039_measure_time.sql
-- เพิ่มเวลานัดวัดหน้างาน (HH:MM) ให้ productions
-- idempotent: ใช้ add column if not exists

alter table public.productions
  add column if not exists measure_time text;

comment on column public.productions.measure_time is
  'เวลานัดวัดหน้างาน รูปแบบ "HH:MM" (24h) — ใช้คู่กับ measure_scheduled';
