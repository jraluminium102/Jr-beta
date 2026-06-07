-- ============================================================
-- ไฟล์สำหรับรันมือใน Supabase Dashboard → SQL Editor
-- สร้างตาราง "ใบปะหน้า" (cover_sheet_notes) — เฟส 3
--
-- วิธีใช้: ก๊อปทั้งไฟล์นี้ → วางใน SQL Editor → กด Run ครั้งเดียวจบ
-- (รวมฟังก์ชัน set_updated_at ที่จำเป็นไว้ในตัวแล้ว — รันได้เลยไม่ต้องรัน 0011 ก่อน)
--
-- ปลอดภัย: รันซ้ำได้ ไม่พังของเดิม (ใช้ if not exists / or replace ทุกจุด)
-- ============================================================

-- 1) ฟังก์ชันอัปเดตเวลาแก้ล่าสุด (ปกติมาจาก migration 0011 — ใส่ไว้กันพลาด)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) ตารางเก็บโน้ตใบปะหน้า (คอลัมน์ 2-3 + คำเตือน) ต่อ 1 ใบสั่งผลิต
create table if not exists public.cover_sheet_notes (
  id                  bigint  generated always as identity primary key,
  production_order_id  bigint  not null
                       references public.production_orders(id) on delete cascade,
  installer_notes      text    not null default '',   -- คอลัมน์ 2 แจ้งช่างติดตั้ง
  customer_notes       text    not null default '',   -- คอลัมน์ 3 แจ้งลูกค้าเตรียมของ
  warning_left         text    not null default '',   -- คำเตือนแดงมุมซ้าย
  warning_right        text    not null default '',   -- คำเตือนแดงมุมขวา
  updated_by           uuid    references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint uq_cover_sheet_per_order unique (production_order_id)
);

create index if not exists cover_sheet_notes_order_idx
  on public.cover_sheet_notes (production_order_id);

-- 3) trigger อัปเดต updated_at อัตโนมัติ
drop trigger if exists cover_sheet_notes_updated_at on public.cover_sheet_notes;
create trigger cover_sheet_notes_updated_at
  before update on public.cover_sheet_notes
  for each row execute function public.set_updated_at();

-- 4) สิทธิ์ (RLS): อ่าน=ผู้ใช้ที่ใช้งานอยู่ทุกคน · เขียน=แอดมิน/ผลิต/เซลล์
alter table public.cover_sheet_notes enable row level security;

drop policy if exists "read cover_sheet_notes" on public.cover_sheet_notes;
create policy "read cover_sheet_notes" on public.cover_sheet_notes
  for select to authenticated
  using (public.is_active());

drop policy if exists "write cover_sheet_notes" on public.cover_sheet_notes;
create policy "write cover_sheet_notes" on public.cover_sheet_notes
  for all to authenticated
  using  (public.is_active() and public.auth_role() in ('ADMIN','PRODUCTION','SALES'))
  with check (public.is_active() and public.auth_role() in ('ADMIN','PRODUCTION','SALES'));
