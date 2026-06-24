-- 0059: ตารางเก็บค่า config ทั่วไป (เช่น โทเคนลิงก์ช่าง) — แทนการตั้ง env บน Vercel
-- อ่าน/เขียนผ่าน service role เท่านั้น (RLS ล็อก ไม่มี policy → user ทั่วไปอ่านไม่ได้)
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
-- ไม่มี policy = ปิดให้ user ทั่วไป · service role (BFF/หน้า public) ยัง bypass ได้

notify pgrst, 'reload schema';
