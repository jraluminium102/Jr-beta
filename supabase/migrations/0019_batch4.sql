-- ============================================================
-- JR — 0019 Batch 4: designers lookup + queue assistant + production dates
-- idempotent (do$$ duplicate_object / add column if not exists / on conflict do nothing)
-- reuse has_role()/is_active() จาก 0003 · RLS ของตารางเดิมครอบอยู่แล้ว (ไม่เพิ่ม policy ซ้ำ)
-- ============================================================

-- ------------------------------------------------------------
-- A) designers — lookup ไม่ผูก auth (แก้ปัญหา dropdown คนเขียนแบบว่าง)
-- ------------------------------------------------------------
create table if not exists public.designers (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- jobs อ้างถึง designer (เพิ่มอ้างอิงใหม่ ไม่ทับ designer_id เดิมที่ผูก auth)
alter table public.jobs
  add column if not exists designer_ref bigint references public.designers(id);

-- seed ชื่อคนเขียนแบบ
insert into public.designers (name) values ('ส้ม'), ('จา'), ('เบน')
on conflict (name) do nothing;

-- RLS: อ่านได้ทุกคน · เขียนเฉพาะ ADMIN/DESIGNER
alter table public.designers enable row level security;

drop policy if exists designers_read  on public.designers;
drop policy if exists designers_write on public.designers;
create policy designers_read  on public.designers for select using (true);
create policy designers_write on public.designers for all
  using (public.has_role('ADMIN','DESIGNER'))
  with check (public.has_role('ADMIN','DESIGNER'));

grant select, insert, update, delete on public.designers
  to authenticated, service_role;

-- ------------------------------------------------------------
-- B) queue — ผู้ช่วยเซลล์ (queue_sales.id เป็น uuid)
-- ------------------------------------------------------------
do $$ begin
  create type queue_sales_role_t as enum ('MAIN','ASSISTANT');
exception when duplicate_object then null; end $$;

alter table public.queue_sales
  add column if not exists role queue_sales_role_t not null default 'MAIN',
  add column if not exists parent_sales_id uuid references public.queue_sales(id) on delete set null;

-- คิวงานอ้างผู้ช่วยที่ไปด้วย (uuid ตรงกับ queue_sales.id)
alter table public.queue_entries
  add column if not exists assistant_id uuid references public.queue_sales(id) on delete set null;

-- seed ผู้ช่วยเซลล์ (columns ตาม schema จริง 0010: code/name/team/active)
insert into public.queue_sales (code, name, team, role, active) values
  ('som', 'ส้ม',   'BKK', 'ASSISTANT'::queue_sales_role_t, true),
  ('amp', 'แอมป์', 'BKK', 'ASSISTANT'::queue_sales_role_t, true)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- C) production — วันกำหนด/วันจริง
-- ------------------------------------------------------------
alter table public.productions
  add column if not exists production_due_date date,
  add column if not exists production_actual   date;

-- RPC ตั้งวัน (วัด/กำหนดผลิต/วางแผนติดตั้ง) — guard ADMIN
create or replace function public.set_production_dates(
  p_job                 uuid,
  p_measure_scheduled   date,
  p_production_due_date  date,
  p_planned_install_date date
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('ADMIN') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.productions set
    measure_scheduled    = coalesce(p_measure_scheduled,    measure_scheduled),
    production_due_date   = coalesce(p_production_due_date,   production_due_date),
    planned_install_date = coalesce(p_planned_install_date,  planned_install_date)
  where job_id = p_job;
end $$;

grant execute on function public.set_production_dates(uuid, date, date, date)
  to authenticated, service_role;
