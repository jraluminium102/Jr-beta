-- ============================================================
-- JR Beta — 0013 Journey ops: พักงาน(ON_HOLD) + สั่งของ(PO) + QC + หลักฐานส่งงาน
-- ใช้ flag/ตารางใหม่ ไม่แตะ enum job_status (เลี่ยงปัญหา ADD VALUE)
-- idempotent ทั้งไฟล์ · รันได้หลัง 0011/0012
-- ============================================================

create extension if not exists "pgcrypto";

do $$ begin create type po_status_t as enum ('PENDING','ORDERED','RECEIVED'); exception when duplicate_object then null; end $$;
do $$ begin create type qc_stage_t as enum ('FACTORY','INSTALL','CUSTOMER'); exception when duplicate_object then null; end $$;

-- ---------- 1) พักงาน (ON_HOLD) เป็น flag ไม่ทับเฟส ----------
alter table public.jobs add column if not exists on_hold        boolean not null default false;
alter table public.jobs add column if not exists on_hold_reason text;

-- ---------- 2) ใบสั่งของ (PO) — รอบอลู/กระจก/อื่นๆ + เตือน lead-time ----------
create table if not exists public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  material      text not null default 'OTHER',     -- ALUM / GLASS / HARDWARE / OTHER
  title         text not null default '',
  status        po_status_t not null default 'PENDING',
  supplier      text,
  order_date    date,
  expected_date date,                              -- กำหนดของเข้า (lead-time)
  received_date date,
  note          text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists po_job_idx    on public.purchase_orders(job_id);
create index if not exists po_status_idx on public.purchase_orders(status);
drop trigger if exists touch_purchase_orders on public.purchase_orders;
create trigger touch_purchase_orders before update on public.purchase_orders
  for each row execute function public.tg_touch_updated_at();

-- ---------- 3) QC checks (โรงงาน/ติดตั้ง/ลูกค้าตรวจ) ----------
create table if not exists public.qc_checks (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  stage       qc_stage_t not null default 'FACTORY',
  result      qc_result_t not null default 'PASSED',  -- reuse enum เดิม (PASSED/FAILED)
  defects     text,
  photo_url   text,
  checked_by  uuid references public.profiles(id),
  checked_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists qc_job_idx on public.qc_checks(job_id);

-- ---------- 4) หลักฐานส่งงาน (handover) เพิ่มใน installations ----------
alter table public.installations add column if not exists handover_date         date;
alter table public.installations add column if not exists handover_signoff_url  text;   -- ลายเซ็น/ใบรับงาน
alter table public.installations add column if not exists handover_photo_url    text;   -- รูปหลังติดตั้ง

-- ============================================================
-- RLS — อ่านได้ทุก active user · เขียนตาม role
-- ============================================================
alter table public.purchase_orders enable row level security;
alter table public.qc_checks       enable row level security;

drop policy if exists po_read  on public.purchase_orders;
drop policy if exists po_write on public.purchase_orders;
create policy po_read  on public.purchase_orders for select using (public.is_active());
create policy po_write on public.purchase_orders for all using (public.has_role('ADMIN','PRODUCTION')) with check (public.has_role('ADMIN','PRODUCTION'));

drop policy if exists qc_read  on public.qc_checks;
drop policy if exists qc_write on public.qc_checks;
create policy qc_read  on public.qc_checks for select using (public.is_active());
create policy qc_write on public.qc_checks for all using (public.has_role('ADMIN','PRODUCTION','INSTALLER')) with check (public.has_role('ADMIN','PRODUCTION','INSTALLER'));

grant all on public.purchase_orders, public.qc_checks to anon, authenticated, service_role;
