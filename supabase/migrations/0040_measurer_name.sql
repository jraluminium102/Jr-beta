-- 0040_measurer_name.sql
-- เพิ่มชื่อช่างวัดแบบข้อความ (ไม่ผูก profiles — ช่างวัดไม่มี user account)
-- idempotent: ใช้ add column if not exists

alter table public.productions
  add column if not exists measurer_name text;

comment on column public.productions.measurer_name is
  'ชื่อช่างวัดแบบ free-text (เช่น "เป", "เนียน") — ไม่ผูก profiles เพราะช่างวัดไม่มี user account; ใช้แทน/คู่กับ measurer_id';
