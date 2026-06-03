-- ============================================================================
-- JR Beta — UPGRADE: เพิ่มระบบ OMS เข้า "DB Quotation เดิมที่มีข้อมูล"
-- ปลอดภัย · ไม่ลบข้อมูล · รันซ้ำได้ (idempotent)
--
-- ⚠️  BACKUP ก่อนเสมอ (Supabase → Database → Backups)
-- ใช้ไฟล์นี้ "แทน" setup-all.sql เมื่อ DB มีตารางบัญชีเดิมอยู่แล้ว
--
-- ทำอะไรบ้าง:
--   1) สร้าง enum + ตาราง + trigger + RLS ฝั่ง OMS (ของใหม่ทั้งหมด)
--   2) อัปเกรด public.profiles: เพิ่ม email/avatar_url/is_active/updated_at
--      + แปลง role จาก user_role → role_t (map: owner/admin→ADMIN, sales→SALES, viewer→VIEWER)
--   3) ปรับ function/RLS ฝั่งบัญชีให้ใช้ role_t (can_write, current_user_role)
--   ตารางบัญชีเดิม (customers/quotations/...) ไม่ถูกแตะ structure เลย
-- ============================================================================

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1 — ENUMS (ฝั่ง OMS) · สร้างเฉพาะที่ยังไม่มี
-- ────────────────────────────────────────────────────────────────────────────
do $$ begin create type role_t            as enum ('ADMIN','SALES','DESIGNER','PRODUCTION','INSTALLER','ACCOUNTING','VIEWER'); exception when duplicate_object then null; end $$;
do $$ begin create type channel_t         as enum ('LINE','FACEBOOK','INSTAGRAM','OTHER'); exception when duplicate_object then null; end $$;
do $$ begin create type job_status_t      as enum ('PENDING_QUOTE','QUOTE_SENT','PENDING_DECISION','DEPOSITED','CANCELLED','COMPLETED'); exception when duplicate_object then null; end $$;
do $$ begin create type prod_status_t     as enum ('PENDING_MEASURE','MEASURED','PENDING_MEETING','REVISING','PENDING_CONFIRM','QUEUED','MANUFACTURING','QC','READY','ISSUE'); exception when duplicate_object then null; end $$;
do $$ begin create type inst_status_t     as enum ('PENDING','INSTALLING','PENDING_INSPECT','REVISING','COMPLETED','ISSUE'); exception when duplicate_object then null; end $$;
do $$ begin create type inspect_result_t  as enum ('PASSED','MINOR_FIX','REJECTED'); exception when duplicate_object then null; end $$;
do $$ begin create type qc_result_t       as enum ('PASSED','FAILED'); exception when duplicate_object then null; end $$;
do $$ begin create type issue_status_t    as enum ('OPEN','IN_PROGRESS','CLOSED'); exception when duplicate_object then null; end $$;
do $$ begin create type issue_phase_t     as enum ('SALES','MEASUREMENT','PRODUCTION','INSTALLATION','POST_SALE'); exception when duplicate_object then null; end $$;
do $$ begin create type issue_type_t      as enum ('WRONG_DESIGN','CUSTOMER_CHANGES','MATERIAL_SHORTAGE','PRODUCTION_DELAY','INSTALLATION_DELAY','CUSTOMER_COMPLAINT','OTHER'); exception when duplicate_object then null; end $$;
do $$ begin create type payment_type_t    as enum ('DEPOSIT','INSTALLMENT_2','INSTALLMENT_3','FINAL'); exception when duplicate_object then null; end $$;
do $$ begin create type payment_channel_t as enum ('TRANSFER','CASH','CHEQUE'); exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2 — เคลียร์ policy + function เดิมที่ผูกกับ user_role (เพื่อแปลง role ได้)
--   ลบเฉพาะ policy (ไม่ลบตาราง/ข้อมูล) แล้วจะสร้างใหม่ทั้งหมดใน STEP 7
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'profiles','customers','quotations','quotation_items',
        'billing_notes','billing_installments','receipts',
        'production_orders','warranties','stock_items','stock_moves',
        'jobs','productions','installations','issues','finance_entries',
        'audit_logs','job_sequence'])
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

drop function if exists public.can_write();
drop function if exists public.current_user_role();

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3 — อัปเกรด profiles (เก็บข้อมูล user เดิมไว้)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists is_active  boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- เติม email จาก auth.users (ถ้ายังว่าง)
update public.profiles p set email = u.email
  from auth.users u where u.id = p.id and (p.email is null or p.email = '');

-- แปลง profiles.role: user_role → role_t (ทำครั้งเดียว)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='role' and udt_name='user_role'
  ) then
    alter table public.profiles add column role_new role_t not null default 'VIEWER';
    update public.profiles set role_new =
      case lower(role::text)
        when 'owner'  then 'ADMIN'::role_t
        when 'admin'  then 'ADMIN'::role_t
        when 'sales'  then 'SALES'::role_t
        when 'viewer' then 'VIEWER'::role_t
        else 'VIEWER'::role_t
      end;
    alter table public.profiles drop column role;
    alter table public.profiles rename column role_new to role;
    alter table public.profiles alter column role set default 'VIEWER';
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4 — FUNCTIONS (สร้าง/แทนที่ ให้ใช้ role_t)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- สร้าง profile เมื่อมี user ใหม่ (เวอร์ชัน role_t) — แทนที่ของเดิม
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
          new.raw_user_meta_data->>'avatar_url', 'VIEWER')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- role helper ฝั่ง OMS
create or replace function public.auth_role()
returns role_t language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.has_role(variadic roles role_t[])
returns boolean language sql stable as $$
  select public.is_active() and public.auth_role() = any(roles)
$$;

-- ฝั่งบัญชี — current_user_role คืน role_t · can_write = ADMIN/SALES/ACCOUNTING
create or replace function public.current_user_role()
returns role_t language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;
create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_active and role in ('ADMIN','SALES','ACCOUNTING')
       from public.profiles where id = auth.uid()),
    false);
$$;

-- next_document_code / apply_stock_move / touch_updated_at เดิมยังอยู่ ไม่ต้องแตะ

-- OMS business-rule triggers
create or replace function public.tg_assign_job_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare y int; seq int;
begin
  if new.job_code is not null then return new; end if;
  y := extract(year from new.assess_date)::int;
  insert into public.job_sequence(year, last_seq) values (y, 1)
    on conflict (year) do update set last_seq = public.job_sequence.last_seq + 1
    returning last_seq into seq;
  new.year := y; new.sequence := seq;
  new.job_code := 'JR' || y::text || '-' || lpad(seq::text, 3, '0');
  return new;
end $$;

create or replace function public.tg_calc_financials()
returns trigger language plpgsql as $$
begin
  if new.net_amount is not null then
    new.vat_amount   := round(new.net_amount * 0.07, 2);
    new.total_amount := new.net_amount + new.vat_amount;
  end if;
  return new;
end $$;

create or replace function public.tg_on_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'DEPOSITED' and (tg_op = 'INSERT' or old.status is distinct from 'DEPOSITED') then
    insert into public.productions(job_id, status) values (new.id, 'PENDING_MEASURE')
      on conflict (job_id) do nothing;
    if new.deposit_amount is not null and new.deposit_date is not null
       and not exists (select 1 from public.finance_entries
         where job_id = new.id and type = 'DEPOSIT' and is_auto_created and not is_voided) then
      insert into public.finance_entries(job_id, payment_date, amount, type, channel, note, is_auto_created)
      values (new.id, new.deposit_date, new.deposit_amount, 'DEPOSIT', 'TRANSFER', 'มัดจำ (auto)', true);
    end if;
  end if;
  return new;
end $$;

create or replace function public.tg_production_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then new.status_updated_at := now(); end if;
  if new.status = 'READY' and (tg_op='INSERT' or old.status is distinct from 'READY') then
    insert into public.installations(job_id, status) values (new.job_id, 'PENDING') on conflict (job_id) do nothing;
  end if;
  if new.notes is not null and new.notes <> '' and (tg_op='INSERT' or new.notes is distinct from old.notes) then
    select job_code into jcode from public.jobs where id = new.job_id;
    if not exists (select 1 from public.issues where job_id=new.job_id and detail=new.notes and is_auto_created) then
      insert into public.issues(issue_code, job_id, phase, type, detail, is_auto_created, status)
      values ('ISS-'||jcode||'-'||substr(gen_random_uuid()::text,1,4), new.job_id,'PRODUCTION','OTHER', new.notes, true,'OPEN');
    end if;
  end if;
  return new;
end $$;

create or replace function public.tg_installation_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text; p text; r text; i int;
begin
  if new.completed_date is not null then new.warranty_until := new.completed_date + interval '12 months'; end if;
  if new.status = 'COMPLETED' and (tg_op='INSERT' or old.status is distinct from 'COMPLETED') then
    update public.jobs set status = 'COMPLETED' where id = new.job_id;
  end if;
  select job_code into jcode from public.jobs where id = new.job_id;
  for i in 1..4 loop
    p := case i when 1 then new.problem1 when 2 then new.problem2 when 3 then new.problem3 else new.problem4 end;
    r := case i when 1 then new.responsible1 when 2 then new.responsible2 when 3 then new.responsible3 else new.responsible4 end;
    if p is not null and p <> '' then
      if not exists (select 1 from public.issues where job_id=new.job_id and detail=p and is_auto_created) then
        insert into public.issues(issue_code, job_id, phase, type, detail, owner_name, is_auto_created, status)
        values ('ISS-'||jcode||'-'||substr(gen_random_uuid()::text,1,4), new.job_id,'INSTALLATION','OTHER', p, r, true, 'OPEN');
      end if;
    end if;
  end loop;
  return new;
end $$;

create or replace function public.tg_assign_issue_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text;
begin
  if new.issue_code is null then
    select job_code into jcode from public.jobs where id = new.job_id;
    new.issue_code := 'ISS-'||coalesce(jcode,'NA')||'-'||substr(gen_random_uuid()::text,1,4);
  end if;
  return new;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 5 — ตาราง OMS (ของใหม่)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.job_sequence (
  year int primary key, last_seq int not null default 0
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_code text unique, year int not null, sequence int not null,
  customer_name text not null, customer_tel text, customer_area text,
  channel channel_t not null default 'OTHER',
  assess_date date not null default current_date,
  estimator_id uuid references public.profiles(id),
  designer_id uuid references public.profiles(id),
  design_start date, design_end date, quote_sent_date date,
  discount_amount numeric(12,2), net_amount numeric(12,2),
  vat_amount numeric(12,2), total_amount numeric(12,2),
  status job_status_t not null default 'PENDING_QUOTE',
  deposit_amount numeric(12,2), deposit_date date,
  cancel_reason text, remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_status_idx   on public.jobs(status);
create index if not exists jobs_year_seq_idx on public.jobs(year, sequence);
create index if not exists jobs_name_idx     on public.jobs(customer_name);

create table if not exists public.productions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  status prod_status_t not null default 'PENDING_MEASURE',
  planned_install_date date, measure_scheduled date, measure_actual date,
  measurer_id uuid references public.profiles(id),
  meeting_after_measure date, design_revision_done date, quote_revision_done date,
  customer_confirmed date, production_queued date, alum_order_date date, glass_order_date date,
  production_done date, qc_result qc_result_t, qc_date date, qc_note text,
  notes text, status_updated_at timestamptz, remark text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists productions_status_idx on public.productions(status);

create table if not exists public.installations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  status inst_status_t not null default 'PENDING',
  install_scheduled date, install_actual date,
  lead_installer_id uuid references public.profiles(id),
  inspect_date date, inspect_result inspect_result_t, inspect_note text,
  revision_done date, completed_date date, warranty_until date,
  problem1 text, responsible1 text, problem2 text, responsible2 text,
  problem3 text, responsible3 text, problem4 text, responsible4 text,
  remark text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists installations_status_idx on public.installations(status);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  issue_code text unique,
  job_id uuid not null references public.jobs(id) on delete cascade,
  phase issue_phase_t not null, type issue_type_t not null default 'OTHER',
  detail text not null, is_auto_created boolean not null default false,
  reporter_id uuid references public.profiles(id), reported_at timestamptz not null default now(),
  owner_id uuid references public.profiles(id), owner_name text,
  resolved_at timestamptz, resolution text, status issue_status_t not null default 'OPEN',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists issues_job_idx    on public.issues(job_id);
create index if not exists issues_status_idx on public.issues(status);

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  payment_date date not null, amount numeric(12,2) not null,
  type payment_type_t not null, channel payment_channel_t not null default 'TRANSFER',
  note text, is_auto_created boolean not null default false,
  is_voided boolean not null default false, void_reason text,
  voided_at timestamptz, voided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists finance_job_idx  on public.finance_entries(job_id);
create index if not exists finance_date_idx on public.finance_entries(payment_date);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  job_id uuid references public.jobs(id) on delete set null,
  user_id uuid references public.profiles(id),
  action text not null, table_name text not null, record_id uuid,
  old_value jsonb, new_value jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_job_idx  on public.audit_logs(job_id);
create index if not exists audit_time_idx on public.audit_logs(created_at);

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 6 — TRIGGERS (OMS + touch profiles) · drop ก่อน create ให้รันซ้ำได้
-- ────────────────────────────────────────────────────────────────────────────
drop trigger if exists touch_profiles      on public.profiles;
drop trigger if exists touch_jobs          on public.jobs;
drop trigger if exists touch_productions   on public.productions;
drop trigger if exists touch_installations on public.installations;
drop trigger if exists touch_issues        on public.issues;
drop trigger if exists touch_finance       on public.finance_entries;
create trigger touch_profiles      before update on public.profiles      for each row execute function public.tg_touch_updated_at();
create trigger touch_jobs          before update on public.jobs          for each row execute function public.tg_touch_updated_at();
create trigger touch_productions   before update on public.productions   for each row execute function public.tg_touch_updated_at();
create trigger touch_installations before update on public.installations for each row execute function public.tg_touch_updated_at();
create trigger touch_issues        before update on public.issues        for each row execute function public.tg_touch_updated_at();
create trigger touch_finance       before update on public.finance_entries for each row execute function public.tg_touch_updated_at();

drop trigger if exists assign_job_code      on public.jobs;
drop trigger if exists calc_financials      on public.jobs;
drop trigger if exists on_deposit           on public.jobs;
drop trigger if exists production_changes   on public.productions;
drop trigger if exists installation_changes on public.installations;
drop trigger if exists assign_issue_code    on public.issues;
create trigger assign_job_code      before insert on public.jobs for each row execute function public.tg_assign_job_code();
create trigger calc_financials      before insert or update of net_amount on public.jobs for each row execute function public.tg_calc_financials();
create trigger on_deposit           after  insert or update of status on public.jobs for each row execute function public.tg_on_deposit();
create trigger production_changes   before insert or update on public.productions   for each row execute function public.tg_production_changes();
create trigger installation_changes before insert or update on public.installations for each row execute function public.tg_installation_changes();
create trigger assign_issue_code    before insert on public.issues for each row execute function public.tg_assign_issue_code();

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 7 — RLS (enable + สร้าง policy ใหม่ทั้งหมด · role_t)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.jobs              enable row level security;
alter table public.productions       enable row level security;
alter table public.installations     enable row level security;
alter table public.issues            enable row level security;
alter table public.finance_entries   enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.job_sequence      enable row level security;
alter table public.customers         enable row level security;
alter table public.quotations        enable row level security;
alter table public.quotation_items   enable row level security;
alter table public.document_sequences enable row level security;
alter table public.billing_notes        enable row level security;
alter table public.billing_installments enable row level security;
alter table public.receipts             enable row level security;
alter table public.production_orders    enable row level security;
alter table public.warranties           enable row level security;
alter table public.stock_items          enable row level security;
alter table public.stock_moves          enable row level security;

-- profiles
create policy profiles_self_read on public.profiles for select using (auth.uid() = id or public.has_role('ADMIN'));
create policy profiles_self_upd  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_admin_all on public.profiles for all    using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

-- OMS
create policy jobs_read   on public.jobs for select using (public.is_active());
create policy jobs_write  on public.jobs for insert with check (public.has_role('ADMIN','SALES','DESIGNER'));
create policy jobs_update on public.jobs for update using (public.has_role('ADMIN','SALES','DESIGNER')) with check (true);
create policy prod_read   on public.productions for select using (public.is_active());
create policy prod_write  on public.productions for all using (public.has_role('ADMIN','PRODUCTION')) with check (public.has_role('ADMIN','PRODUCTION'));
create policy inst_read   on public.installations for select using (public.is_active());
create policy inst_write  on public.installations for all using (public.has_role('ADMIN','INSTALLER')) with check (public.has_role('ADMIN','INSTALLER'));
create policy issues_read  on public.issues for select using (public.is_active());
create policy issues_write on public.issues for all using (public.has_role('ADMIN','PRODUCTION','INSTALLER','SALES')) with check (true);
create policy finance_read  on public.finance_entries for select using (public.has_role('ADMIN','ACCOUNTING','SALES'));
create policy finance_write on public.finance_entries for all using (public.has_role('ADMIN','ACCOUNTING')) with check (public.has_role('ADMIN','ACCOUNTING'));
create policy audit_read   on public.audit_logs for select using (public.has_role('ADMIN'));
create policy audit_insert on public.audit_logs for insert with check (public.is_active());
create policy seq_read     on public.job_sequence for select using (public.is_active());

-- บัญชี (ใช้ can_write role_t)
create policy cust_read on public.customers for select to authenticated using (true);
create policy cust_ins  on public.customers for insert to authenticated with check (public.can_write());
create policy cust_upd  on public.customers for update to authenticated using (public.can_write()) with check (public.can_write());
create policy quo_read on public.quotations for select to authenticated using (true);
create policy quo_ins  on public.quotations for insert to authenticated with check (public.can_write());
create policy quo_upd  on public.quotations for update to authenticated using (public.can_write()) with check (public.can_write());
create policy qi_read on public.quotation_items for select to authenticated using (true);
create policy qi_all  on public.quotation_items for all to authenticated using (public.can_write()) with check (public.can_write());
do $$
declare t text;
begin
  foreach t in array array['billing_notes','billing_installments','receipts','production_orders','warranties','stock_items','stock_moves']
  loop
    execute format('create policy "read %1$s" on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy "write %1$s" on public.%1$s for all to authenticated using (public.can_write()) with check (public.can_write());', t);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 8 — ลบ enum user_role ที่ไม่ใช้แล้ว (ถ้าไม่มีอะไรอ้างถึง)
-- ────────────────────────────────────────────────────────────────────────────
do $$ begin drop type if exists user_role; exception when others then null; end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 9 — GRANTS + seed running ปีปัจจุบัน (RLS ยังคุมรายแถว)
-- ────────────────────────────────────────────────────────────────────────────
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to anon, authenticated, service_role;

insert into public.job_sequence(year, last_seq) values (extract(year from now())::int, 0)
  on conflict (year) do nothing;

-- ✅ เสร็จ — ตั้งสิทธิ์ admin (แก้อีเมลให้ตรง):
-- update public.profiles set role='ADMIN' where email = 'you@jr-aluminium.com';
