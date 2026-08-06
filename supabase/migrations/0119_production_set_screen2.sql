-- 0119 · มุ้งอันที่ 2 ต่อชุดงาน (screen_type_2 / screen_installed_2)
-- ปัญหา: 1 ชุดใส่มุ้งได้มากกว่า 1 แบบ เช่น มุ้งจีบ + มุ้ง JR (คนละบาน/คนละจุด) แต่ช่องเดิม (screen_type/screen_installed)
--   เก็บได้แบบเดียว — ต้องมีช่องที่สองแยกต่างหาก (ไม่ผูก gate "ส่งติดตั้ง" ที่เช็คช่องแรกอยู่แล้ว)
-- idempotent · comment · เจ้าของรัน · ไม่กระทบข้อมูลเดิม
-- ============================================================

alter table public.production_sets
  add column if not exists screen_type_2 text,
  add column if not exists screen_installed_2 text;

comment on column public.production_sets.screen_type_2 is
  'มุ้งอันที่ 2 (ชนิด) — 1 ชุดใส่มุ้งได้ 2 แบบ เช่น มุ้งจีบ + มุ้ง JR (0119) · เสริมเท่านั้น ไม่ผูก gate ส่งติดตั้ง';
comment on column public.production_sets.screen_installed_2 is
  'มุ้งอันที่ 2 (สถานะใส่) — คู่กับ screen_type_2 (0119) · เสริมเท่านั้น ไม่ผูก gate ส่งติดตั้ง';
