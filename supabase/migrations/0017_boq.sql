-- ============================================================
-- JR Beta — 0017 BOQ ตัดอลู: หัวบิล + รายการวัสดุ (ผูกงาน/ใบเสนอ/สต็อก)
-- ตาราง+enum+RLS ใหม่ · ไม่แตะของเดิม · idempotent · รันหลัง 0016
-- ============================================================

-- ---------- enum สถานะ BOQ ----------
do $$ begin
  create type boq_status_t as enum ('draft','confirmed','ordered');
exception when duplicate_object then null; end $$;

-- ---------- หัว BOQ ----------
create table if not exists public.boqs (
  id                bigint generated always as identity primary key,
  code              text unique,
  job_id            uuid references public.jobs(id),
  quotation_id      bigint references public.quotations(id),
  customer_snapshot jsonb not null default '{}',
  status            boq_status_t not null default 'draft',
  note              text not null default '',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------- รายการวัสดุใน BOQ ----------
create table if not exists public.boq_items (
  id            bigint generated always as identity primary key,
  boq_id        bigint not null references public.boqs(id) on delete cascade,
  category      text not null default '',
  name          text not null,
  spec          text not null default '',
  qty           numeric(12,2) not null default 0,
  unit          text not null default 'เส้น',
  stock_item_id bigint references public.stock_items(id),
  sort_order    int not null default 0
);

create index if not exists boqs_job_idx        on public.boqs(job_id);
create index if not exists boqs_quotation_idx   on public.boqs(quotation_id);
create index if not exists boq_items_boq_idx    on public.boq_items(boq_id);

-- ---------- touch updated_at (reuse function เดิมจาก 0005) ----------
do $$ begin
  create trigger trg_boqs_touch before update on public.boqs
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- RLS — อ่านได้ทุกคน · เขียนตาม role (ตามแม่แบบ 0013)
-- ============================================================
alter table public.boqs      enable row level security;
alter table public.boq_items enable row level security;

drop policy if exists boqs_read  on public.boqs;
drop policy if exists boqs_write on public.boqs;
create policy boqs_read  on public.boqs for select using (true);
create policy boqs_write on public.boqs for all
  using      (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'));

drop policy if exists boq_items_read  on public.boq_items;
drop policy if exists boq_items_write on public.boq_items;
create policy boq_items_read  on public.boq_items for select using (true);
create policy boq_items_write on public.boq_items for all
  using      (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'));

grant select, insert, update, delete on public.boqs, public.boq_items to authenticated, service_role;
