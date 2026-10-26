-- 0162 · สถานะสั่งมุ้งจีบ ต่อชุดงาน (screen_order) — เจ้าของสั่ง 26 ต.ค.69
--   "มุ้งจีบก็สั่งเอาเหมือนกระจก เอาสถานะเหมือนกันเป๊ะเลย" → ช่องใหม่ข้าง "สั่งกระจก" ตัวเลือกชุดเดียวกับ glass_order
--   เสริมเท่านั้น ไม่ผูก gate ส่งติดตั้ง (gate ยังดู screen_installed='ใส่แล้ว' เหมือนเดิม)
-- idempotent · เจ้าของรัน · ไม่กระทบข้อมูลเดิม
-- ============================================================

alter table public.production_sets
  add column if not exists screen_order text not null default '';

comment on column public.production_sets.screen_order is
  'สถานะสั่งมุ้งจีบ (รอวัด/วัดแล้ว/สั่งแล้ว รอของ/มาแล้ว/มายังไม่ครบ) — ตัวเลือกชุดเดียวกับ glass_order (0162)';

-- ตัวเลือกดรอปดาวน์ (0099) — แก้/เพิ่มได้จากหน้าเว็บเหมือนช่องอื่น
insert into public.production_set_options (field_key, value, sort_order, is_locked) values
  ('screen_order', 'รอวัด',          1, false),
  ('screen_order', 'วัดแล้ว',         2, false),
  ('screen_order', 'สั่งแล้ว รอของ',   3, false),
  ('screen_order', 'มาแล้ว',          4, false),
  ('screen_order', 'มายังไม่ครบ',      5, false)
on conflict (field_key, value) do nothing;
