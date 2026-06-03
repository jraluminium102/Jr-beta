-- ============================================================
-- JR Beta — setup-all.sql  (รวมทุก migration + grants + seed)
-- วางทั้งไฟล์ใน Supabase SQL editor แล้ว Run ได้ทันที
-- ลำดับ: reset → OMS(0001-0004) → บัญชี(0005-0008) → grants → seed(0009)
-- ⚠️ reset จะลบ schema public ทั้งหมด — เปิดใช้เฉพาะตอนติดตั้งใหม่
-- ============================================================

-- ---------- RESET (uncomment เมื่อติดตั้งใหม่ทั้งหมด) ----------
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop schema if exists public cascade;
-- create schema public;
-- grant usage on schema public to anon, authenticated, service_role;
-- grant all on schema public to postgres, service_role;

-- >>>>>>>>>> 0001_oms_schema.sql >>>>>>>>>>
-- ============================================================
-- JR OMS โ€” 0001 Schema (enums, tables, indexes)
-- เธขเธญเธ”เธเธฒเธ = เธขเธญเธ”เธเนเธญเธ VAT เธซเธฑเธเธชเนเธงเธเธฅเธ”เนเธฅเนเธง (OQ-04)
-- Job code = JR{YYYY}-{NNN} เธ•เนเธญเน€เธฅเธเน€เธ”เธดเธก (OQ-01)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
create type role_t            as enum ('ADMIN','SALES','DESIGNER','PRODUCTION','INSTALLER','ACCOUNTING','VIEWER');
create type channel_t         as enum ('LINE','FACEBOOK','INSTAGRAM','OTHER');
create type job_status_t      as enum ('PENDING_QUOTE','QUOTE_SENT','PENDING_DECISION','DEPOSITED','CANCELLED','COMPLETED');
create type prod_status_t     as enum ('PENDING_MEASURE','MEASURED','PENDING_MEETING','REVISING','PENDING_CONFIRM','QUEUED','MANUFACTURING','QC','READY','ISSUE');
create type inst_status_t     as enum ('PENDING','INSTALLING','PENDING_INSPECT','REVISING','COMPLETED','ISSUE');
create type inspect_result_t  as enum ('PASSED','MINOR_FIX','REJECTED');
create type qc_result_t       as enum ('PASSED','FAILED');
create type issue_status_t    as enum ('OPEN','IN_PROGRESS','CLOSED');
create type issue_phase_t     as enum ('SALES','MEASUREMENT','PRODUCTION','INSTALLATION','POST_SALE');
create type issue_type_t      as enum ('WRONG_DESIGN','CUSTOMER_CHANGES','MATERIAL_SHORTAGE','PRODUCTION_DELAY','INSTALLATION_DELAY','CUSTOMER_COMPLAINT','OTHER');
create type payment_type_t    as enum ('DEPOSIT','INSTALLMENT_2','INSTALLMENT_3','FINAL');
create type payment_channel_t as enum ('TRANSFER','CASH','CHEQUE');

-- ---------- PROFILES (1:1 เธเธฑเธ auth.users, เน€เธเนเธ role) ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  role        role_t not null default 'VIEWER',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- JOB SEQUENCE (running per year) ----------
create table public.job_sequence (
  year      int primary key,
  last_seq  int not null default 0
);

-- ---------- JOBS (Master) ----------
create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  job_code        text unique,                         -- JR2026-001 (auto trigger)
  year            int  not null,
  sequence        int  not null,
  customer_name   text not null,
  customer_tel    text,
  customer_area   text,
  channel         channel_t not null default 'OTHER',
  assess_date     date not null default current_date,
  estimator_id    uuid references public.profiles(id),
  designer_id     uuid references public.profiles(id),
  design_start    date,
  design_end      date,
  quote_sent_date date,
  -- เธเธฒเธฃเน€เธเธดเธ (OQ-04)
  discount_amount numeric(12,2),
  net_amount      numeric(12,2),                       -- เธขเธญเธ”เธเนเธญเธ VAT เธซเธฑเธเธชเนเธงเธเธฅเธ”เนเธฅเนเธง
  vat_amount      numeric(12,2),                       -- net * 0.07
  total_amount    numeric(12,2),                       -- net + vat
  status          job_status_t not null default 'PENDING_QUOTE',
  deposit_amount  numeric(12,2),
  deposit_date    date,
  cancel_reason   text,
  remark          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index jobs_status_idx   on public.jobs(status);
create index jobs_year_seq_idx on public.jobs(year, sequence);
create index jobs_name_idx     on public.jobs(customer_name);

-- ---------- PRODUCTION (Phase 2) ----------
create table public.productions (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null unique references public.jobs(id) on delete cascade,
  status                prod_status_t not null default 'PENDING_MEASURE',
  planned_install_date  date,
  measure_scheduled     date,
  measure_actual        date,
  measurer_id           uuid references public.profiles(id),
  meeting_after_measure date,
  design_revision_done  date,
  quote_revision_done   date,
  customer_confirmed    date,
  production_queued     date,
  alum_order_date       date,
  glass_order_date      date,
  production_done       date,
  qc_result             qc_result_t,
  qc_date               date,
  qc_note               text,
  notes                 text,
  status_updated_at     timestamptz,
  remark                text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index productions_status_idx on public.productions(status);

-- ---------- INSTALLATION (Phase 3) ----------
create table public.installations (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null unique references public.jobs(id) on delete cascade,
  status            inst_status_t not null default 'PENDING',
  install_scheduled date,
  install_actual    date,
  lead_installer_id uuid references public.profiles(id),
  inspect_date      date,
  inspect_result    inspect_result_t,
  inspect_note      text,
  revision_done     date,
  completed_date    date,
  warranty_until    date,                              -- completed_date + 12 เน€เธ”เธทเธญเธ (auto)
  problem1 text, responsible1 text,
  problem2 text, responsible2 text,
  problem3 text, responsible3 text,
  problem4 text, responsible4 text,
  remark            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index installations_status_idx on public.installations(status);

-- ---------- ISSUES ----------
create table public.issues (
  id              uuid primary key default gen_random_uuid(),
  issue_code      text unique,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  phase           issue_phase_t not null,
  type            issue_type_t not null default 'OTHER',
  detail          text not null,
  is_auto_created boolean not null default false,
  reporter_id     uuid references public.profiles(id),
  reported_at     timestamptz not null default now(),
  owner_id        uuid references public.profiles(id),
  owner_name      text,                                -- เธเธทเนเธญ free-text (auto-sync เธเธฒเธ Phase 3)
  resolved_at     timestamptz,
  resolution      text,
  status          issue_status_t not null default 'OPEN',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index issues_job_idx    on public.issues(job_id);
create index issues_status_idx on public.issues(status);

-- ---------- FINANCE ENTRIES (05_เธเธฑเธเธเธต) ----------
create table public.finance_entries (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs(id) on delete cascade,
  payment_date    date not null,
  amount          numeric(12,2) not null,
  type            payment_type_t not null,
  channel         payment_channel_t not null default 'TRANSFER',
  note            text,
  is_auto_created boolean not null default false,
  is_voided       boolean not null default false,
  void_reason     text,
  voided_at       timestamptz,
  voided_by       uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index finance_job_idx  on public.finance_entries(job_id);
create index finance_date_idx on public.finance_entries(payment_date);

-- ---------- AUDIT LOG ----------
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  job_id     uuid references public.jobs(id) on delete set null,
  user_id    uuid references public.profiles(id),
  action     text not null,
  table_name text not null,
  record_id  uuid,
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz not null default now()
);
create index audit_job_idx  on public.audit_logs(job_id);
create index audit_time_idx on public.audit_logs(created_at);


-- >>>>>>>>>> 0002_oms_functions.sql >>>>>>>>>>
-- ============================================================
-- JR OMS โ€” 0002 Business-rule functions & triggers
-- เธเธฑเธ invariant เนเธงเนเนเธ DB โ’ data integrity เนเธกเนเธเธฑเธเน€เธซเธกเธทเธญเธ Sheets
-- ============================================================

-- ---------- updated_at auto-stamp ----------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger touch_jobs          before update on public.jobs          for each row execute function public.tg_touch_updated_at();
create trigger touch_productions   before update on public.productions   for each row execute function public.tg_touch_updated_at();
create trigger touch_installations before update on public.installations for each row execute function public.tg_touch_updated_at();
create trigger touch_issues        before update on public.issues        for each row execute function public.tg_touch_updated_at();
create trigger touch_finance       before update on public.finance_entries for each row execute function public.tg_touch_updated_at();
create trigger touch_profiles      before update on public.profiles      for each row execute function public.tg_touch_updated_at();

-- ---------- new auth user โ’ profile ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Job code: JR{YYYY}-{NNN} เธ•เนเธญเน€เธฅเธเน€เธ”เธดเธก (OQ-01) ----------
create or replace function public.tg_assign_job_code()
returns trigger language plpgsql as $$
declare y int; seq int;
begin
  if new.job_code is not null then return new; end if;       -- migration: เน€เธเธฒเธฃเธ code เน€เธ”เธดเธก
  y := extract(year from new.assess_date)::int;
  insert into public.job_sequence(year, last_seq) values (y, 1)
    on conflict (year) do update set last_seq = public.job_sequence.last_seq + 1
    returning last_seq into seq;
  new.year := y;
  new.sequence := seq;
  new.job_code := 'JR' || y::text || '-' || lpad(seq::text, 3, '0');
  return new;
end $$;

create trigger assign_job_code before insert on public.jobs
  for each row execute function public.tg_assign_job_code();

-- ---------- VAT/total auto เธเธฒเธ net (OQ-04) ----------
create or replace function public.tg_calc_financials()
returns trigger language plpgsql as $$
begin
  if new.net_amount is not null then
    new.vat_amount   := round(new.net_amount * 0.07, 2);
    new.total_amount := new.net_amount + new.vat_amount;
  end if;
  return new;
end $$;

create trigger calc_financials before insert or update of net_amount on public.jobs
  for each row execute function public.tg_calc_financials();

-- ---------- เธกเธฑเธ”เธเธณเนเธฅเนเธง โ’ auto เธชเธฃเนเธฒเธ Production + Finance entry ----------
create or replace function public.tg_on_deposit()
returns trigger language plpgsql as $$
begin
  if new.status = 'DEPOSITED'
     and (tg_op = 'INSERT' or old.status is distinct from 'DEPOSITED') then

    -- 1) Production record (เธเธฃเธฑเนเธเน€เธ”เธตเธขเธง)
    insert into public.productions(job_id, status)
    values (new.id, 'PENDING_MEASURE')
    on conflict (job_id) do nothing;

    -- 2) Finance entry เธชเธณเธซเธฃเธฑเธเธกเธฑเธ”เธเธณ (เธเธฃเธฑเนเธเน€เธ”เธตเธขเธง, เธงเธฑเธ+เธขเธญเธ”เธเธฒเธ Master)
    if new.deposit_amount is not null and new.deposit_date is not null
       and not exists (
         select 1 from public.finance_entries
         where job_id = new.id and type = 'DEPOSIT' and is_auto_created and not is_voided
       ) then
      insert into public.finance_entries(job_id, payment_date, amount, type, channel, note, is_auto_created)
      values (new.id, new.deposit_date, new.deposit_amount, 'DEPOSIT', 'TRANSFER', 'เธกเธฑเธ”เธเธณ (auto)', true);
    end if;
  end if;
  return new;
end $$;

create trigger on_deposit after insert or update of status on public.jobs
  for each row execute function public.tg_on_deposit();

-- ---------- Production: stamp status_updated_at + READY โ’ auto Installation + notes โ’ Issue ----------
create or replace function public.tg_production_changes()
returns trigger language plpgsql as $$
declare jcode text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;

  if new.status = 'READY' and (tg_op='INSERT' or old.status is distinct from 'READY') then
    insert into public.installations(job_id, status)
    values (new.job_id, 'PENDING') on conflict (job_id) do nothing;
  end if;

  if new.notes is not null and new.notes <> '' and (tg_op='INSERT' or new.notes is distinct from old.notes) then
    select job_code into jcode from public.jobs where id = new.job_id;
    if not exists (select 1 from public.issues where job_id=new.job_id and detail=new.notes and is_auto_created) then
      insert into public.issues(issue_code, job_id, phase, type, detail, is_auto_created, status)
      values ('ISS-'||jcode||'-'||substr(gen_random_uuid()::text,1,4), new.job_id, 'PRODUCTION','OTHER', new.notes, true,'OPEN');
    end if;
  end if;
  return new;
end $$;

create trigger production_changes before insert or update on public.productions
  for each row execute function public.tg_production_changes();

-- ---------- Installation: warranty +12เน€เธ”เธทเธญเธ + COMPLETEDโ’job + เธเธฑเธเธซเธฒโ’Issues ----------
create or replace function public.tg_installation_changes()
returns trigger language plpgsql as $$
declare jcode text; p text; r text; i int;
begin
  if new.completed_date is not null then
    new.warranty_until := new.completed_date + interval '12 months';
  end if;

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

create trigger installation_changes before insert or update on public.installations
  for each row execute function public.tg_installation_changes();

-- ---------- Issue code auto ----------
create or replace function public.tg_assign_issue_code()
returns trigger language plpgsql as $$
declare jcode text;
begin
  if new.issue_code is null then
    select job_code into jcode from public.jobs where id = new.job_id;
    new.issue_code := 'ISS-'||coalesce(jcode,'NA')||'-'||substr(gen_random_uuid()::text,1,4);
  end if;
  return new;
end $$;

create trigger assign_issue_code before insert on public.issues
  for each row execute function public.tg_assign_issue_code();


-- >>>>>>>>>> 0003_oms_rls.sql >>>>>>>>>>
-- ============================================================
-- JR OMS โ€” 0003 Row Level Security (defense-in-depth)
-- BFF เธเธฑเธเธเธฑเธ RBAC เธเธฑเนเธเนเธฃเธ, RLS เน€เธเนเธเธเธฑเนเธเธชเธธเธ”เธ—เนเธฒเธขเธ—เธตเน DB
-- ============================================================

-- helper: role เธเธญเธ caller
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

-- enable RLS
alter table public.profiles        enable row level security;
alter table public.jobs            enable row level security;
alter table public.productions     enable row level security;
alter table public.installations   enable row level security;
alter table public.issues          enable row level security;
alter table public.finance_entries enable row level security;
alter table public.audit_logs      enable row level security;
alter table public.job_sequence    enable row level security;

-- ---------- PROFILES ----------
create policy profiles_self_read on public.profiles for select using (auth.uid() = id or public.has_role('ADMIN'));
create policy profiles_self_upd  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_admin_all on public.profiles for all    using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

-- ---------- JOBS ----------
-- เธ—เธธเธ active user เธญเนเธฒเธเนเธ”เน (finance fields เธ–เธนเธเธเธฃเธญเธเธ—เธตเน BFF เธ•เธฒเธก role)
create policy jobs_read on public.jobs for select using (public.is_active());
create policy jobs_write on public.jobs for insert with check (public.has_role('ADMIN','SALES','DESIGNER'));
create policy jobs_update on public.jobs for update using (public.has_role('ADMIN','SALES','DESIGNER')) with check (true);

-- ---------- PRODUCTIONS ----------
create policy prod_read on public.productions for select using (public.is_active());
create policy prod_write on public.productions for all using (public.has_role('ADMIN','PRODUCTION')) with check (public.has_role('ADMIN','PRODUCTION'));

-- ---------- INSTALLATIONS ----------
create policy inst_read on public.installations for select using (public.is_active());
create policy inst_write on public.installations for all using (public.has_role('ADMIN','INSTALLER')) with check (public.has_role('ADMIN','INSTALLER'));

-- ---------- ISSUES ----------
create policy issues_read on public.issues for select using (public.is_active());
create policy issues_write on public.issues for all using (public.has_role('ADMIN','PRODUCTION','INSTALLER','SALES')) with check (true);

-- ---------- FINANCE ----------
create policy finance_read on public.finance_entries for select using (public.has_role('ADMIN','ACCOUNTING','SALES'));
create policy finance_write on public.finance_entries for all using (public.has_role('ADMIN','ACCOUNTING')) with check (public.has_role('ADMIN','ACCOUNTING'));

-- ---------- AUDIT ----------
create policy audit_read on public.audit_logs for select using (public.has_role('ADMIN'));
create policy audit_insert on public.audit_logs for insert with check (public.is_active());

-- ---------- JOB SEQUENCE (เน€เธเธเธฒเธฐ trigger เธ—เธตเนเน€เธเนเธ definer เนเธ•เธฐ) ----------
create policy seq_read on public.job_sequence for select using (public.is_active());


-- >>>>>>>>>> 0004_oms_fix.sql >>>>>>>>>>
-- ============================================================
-- JR OMS โ€” 0004 FIX: trigger functions เธ—เธตเนเน€เธเธตเธขเธเธเนเธฒเธกเธ•เธฒเธฃเธฒเธ เธ•เนเธญเธเน€เธเนเธ SECURITY DEFINER
-- เธเธฑเธเธซเธฒ: trigger เธฃเธฑเธเธ”เนเธงเธขเธชเธดเธ—เธเธดเน user โ’ RLS เธเธฅเนเธญเธเธเธฒเธฃเน€เธเธตเธขเธ job_sequence/productions/
--        finance_entries/installations/issues โ’ user เธเธฃเธดเธเธชเธฃเนเธฒเธเธเธฒเธ/เธกเธฑเธ”เธเธณเนเธกเนเนเธ”เน (42501)
-- เนเธเน: เนเธซเน trigger function เธฃเธฑเธเธ”เนเธงเธขเธชเธดเธ—เธเธดเนเน€เธเนเธฒเธเธญเธ (bypass RLS) โ€” เน€เธเนเธ pattern เธกเธฒเธ•เธฃเธเธฒเธ
-- create or replace เนเธกเนเธเธฃเธฐเธ—เธ trigger เน€เธ”เธดเธก (เธเธนเธเธ•เธฒเธกเธเธทเนเธญ function เธญเธขเธนเนเนเธฅเนเธง)
-- ============================================================

-- Job code: เน€เธเธตเธขเธ job_sequence
create or replace function public.tg_assign_job_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare y int; seq int;
begin
  if new.job_code is not null then return new; end if;
  y := extract(year from new.assess_date)::int;
  insert into public.job_sequence(year, last_seq) values (y, 1)
    on conflict (year) do update set last_seq = public.job_sequence.last_seq + 1
    returning last_seq into seq;
  new.year := y;
  new.sequence := seq;
  new.job_code := 'JR' || y::text || '-' || lpad(seq::text, 3, '0');
  return new;
end $$;

-- เธกเธฑเธ”เธเธณ โ’ เน€เธเธตเธขเธ productions + finance_entries
create or replace function public.tg_on_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'DEPOSITED'
     and (tg_op = 'INSERT' or old.status is distinct from 'DEPOSITED') then
    insert into public.productions(job_id, status)
    values (new.id, 'PENDING_MEASURE')
    on conflict (job_id) do nothing;

    if new.deposit_amount is not null and new.deposit_date is not null
       and not exists (
         select 1 from public.finance_entries
         where job_id = new.id and type = 'DEPOSIT' and is_auto_created and not is_voided
       ) then
      insert into public.finance_entries(job_id, payment_date, amount, type, channel, note, is_auto_created)
      values (new.id, new.deposit_date, new.deposit_amount, 'DEPOSIT', 'TRANSFER', 'เธกเธฑเธ”เธเธณ (auto)', true);
    end if;
  end if;
  return new;
end $$;

-- Production: READY โ’ installations, notes โ’ issues
create or replace function public.tg_production_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;

  if new.status = 'READY' and (tg_op='INSERT' or old.status is distinct from 'READY') then
    insert into public.installations(job_id, status)
    values (new.job_id, 'PENDING') on conflict (job_id) do nothing;
  end if;

  if new.notes is not null and new.notes <> '' and (tg_op='INSERT' or new.notes is distinct from old.notes) then
    select job_code into jcode from public.jobs where id = new.job_id;
    if not exists (select 1 from public.issues where job_id=new.job_id and detail=new.notes and is_auto_created) then
      insert into public.issues(issue_code, job_id, phase, type, detail, is_auto_created, status)
      values ('ISS-'||jcode||'-'||substr(gen_random_uuid()::text,1,4), new.job_id, 'PRODUCTION','OTHER', new.notes, true,'OPEN');
    end if;
  end if;
  return new;
end $$;

-- Installation: warranty + COMPLETEDโ’job + problems โ’ issues
create or replace function public.tg_installation_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text; p text; r text; i int;
begin
  if new.completed_date is not null then
    new.warranty_until := new.completed_date + interval '12 months';
  end if;

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

-- Issue code: เธญเนเธฒเธ jobs (select เธเนเธฒเธ RLS เธญเธขเธนเนเนเธฅเนเธง เนเธ•เนเธ—เธณ definer เธเธฑเธเธเธฅเธฒเธ”เน€เธงเธฅเธฒ auto-insert)
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


-- >>>>>>>>>> 0005_acct_schema.sql >>>>>>>>>>
-- ============================================================
-- JR ERP โ€” เธฃเธฐเธเธเธเธฑเธเธเธต ยท Schema (เน€เธ”เธดเธกเธเธฒเธ Quotation 0001)
-- เธเธฃเธฑเธเธชเธณเธซเธฃเธฑเธเนเธญเธเธฃเธงเธก: เธ•เธฑเธ” profiles + enum user_role + handle_new_user
--   โ’ เนเธเน public.profiles (role_t) เธ—เธตเนเธชเธฃเนเธฒเธเนเธงเนเนเธฅเนเธงเนเธ 0001_oms_schema.sql
-- เธ•เธฒเธฃเธฒเธเธเธฑเธเธเธตเธเธเนเธเธฃเธเธชเธฃเนเธฒเธเน€เธ”เธดเธกเธ—เธธเธเธเธญเธฅเธฑเธกเธเน
-- ============================================================

-- ---------- Enums (เน€เธเธเธฒเธฐเธเธญเธเธเธฑเธเธเธต โ€” เนเธกเนเธเธเธเธฑเธ OMS) ----------
create type quotation_status as enum ('draft', 'sent', 'approved', 'cancelled');

-- ---------- customers (P0-1) ----------
create table public.customers (
  id             bigint generated always as identity primary key,
  name           text not null,                 -- เธเธทเนเธญเธฅเธนเธเธเนเธฒ/เธเธฒเธ
  job            text not null default '',       -- เธเธทเนเธญเธเธฒเธ/เนเธเธฃเน€เธเธเธ•เน
  address        text not null default '',       -- เธ—เธตเนเธญเธขเธนเนเธญเธญเธเธเธดเธฅ
  tax_id         text not null default '',       -- เน€เธฅเธเธเธนเนเน€เธชเธตเธขเธ เธฒเธฉเธต
  line_id        text not null default '',
  phone          text not null default '',
  contact_person text not null default '',
  is_active      boolean not null default true,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.customers using gin (to_tsvector('simple', name || ' ' || job || ' ' || phone || ' ' || line_id));

-- ---------- document_sequences (เธฃเธซเธฑเธชเธญเธญเนเธ•เน โ€” reset เธฃเธฒเธขเน€เธ”เธทเธญเธ) ----------
create table public.document_sequences (
  doc_type     text not null,        -- 'QT' | 'BL' | 'INV' | 'PO' | 'WR'
  year_be      int  not null,        -- เธ.เธจ. เน€เธเนเธ 2568
  month        int  not null,        -- 1-12
  last_running int  not null default 0,
  primary key (doc_type, year_be, month)
);

-- ---------- quotations (P0-2) ----------
create table public.quotations (
  id                bigint generated always as identity primary key,
  code              text not null unique,         -- QT2568060001
  customer_id       bigint references public.customers(id),
  customer_snapshot jsonb not null,
  issue_date        date not null default current_date,
  status            quotation_status not null default 'draft',
  vat_rate          numeric(5,2) not null default 7,
  discount_pct      numeric(5,2) not null default 0,
  wht_rate          numeric(5,2) not null default 0,
  subtotal          numeric(14,2) not null default 0,
  discount_amt      numeric(14,2) not null default 0,
  vat_amt           numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  wht_amt           numeric(14,2) not null default 0,
  net               numeric(14,2) not null default 0,
  note              text not null default '',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.quotations (status);
create index on public.quotations (customer_id);

-- ---------- quotation_items ----------
create table public.quotation_items (
  id           bigint generated always as identity primary key,
  quotation_id bigint not null references public.quotations(id) on delete cascade,
  name         text not null,
  detail       text not null default '',
  qty          numeric(12,2) not null default 1,
  unit_price   numeric(14,2) not null default 0,
  line_total   numeric(14,2) not null default 0,
  sort_order   int not null default 0
);
create index on public.quotation_items (quotation_id);

-- ---------- updated_at trigger (เธเธฑเธเธเนเธเธฑเธเธเธเธฅเธฐเธเธทเนเธญเธเธฑเธ OMS tg_touch_updated_at) ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_customers_touch  before update on public.customers  for each row execute function public.touch_updated_at();
create trigger trg_quotations_touch before update on public.quotations for each row execute function public.touch_updated_at();


-- >>>>>>>>>> 0006_acct_functions.sql >>>>>>>>>>
-- ============================================================
-- JR ERP เธเธฑเธเธเธต ยท Functions (เน€เธ”เธดเธกเธเธฒเธ Quotation 0002)
-- เธเธฃเธฑเธเธชเธณเธซเธฃเธฑเธเนเธญเธเธฃเธงเธก:
--   - เธ•เธฑเธ” handle_new_user() + trigger on_auth_user_created (เนเธเนเธเธญเธ OMS 0002 เนเธฅเนเธง)
--   - current_user_role() เธเธทเธ role_t (เนเธกเนเนเธเน user_role) เธญเนเธฒเธเธเธฒเธ profiles เน€เธ”เธตเธขเธงเธเธฑเธ
-- ============================================================

-- ---------- role เธเธญเธเธเธนเนเนเธเนเธเธฑเธเธเธธเธเธฑเธ (เนเธเนเนเธ RLS เธเธฑเนเธเธเธฑเธเธเธต) โ€” เธเธทเธ role_t ----------
create or replace function public.current_user_role()
returns role_t language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------- เธญเธญเธเธฃเธซเธฑเธชเน€เธญเธเธชเธฒเธฃเธญเธฑเธ•เนเธเธกเธฑเธ•เธด (เธ.เธจ. ยท reset เธฃเธฒเธขเน€เธ”เธทเธญเธ) ----------
-- เธเธทเธเธเนเธฒ เน€เธเนเธ QT2568060001  (atomic เธเนเธฒเธ upsert)
create or replace function public.next_document_code(p_doc_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_now    timestamptz := now() at time zone 'Asia/Bangkok';
  v_year   int := extract(year  from v_now)::int + 543;  -- เธ.เธจ.
  v_month  int := extract(month from v_now)::int;
  v_run    int;
begin
  insert into public.document_sequences (doc_type, year_be, month, last_running)
  values (p_doc_type, v_year, v_month, 1)
  on conflict (doc_type, year_be, month)
  do update set last_running = public.document_sequences.last_running + 1
  returning last_running into v_run;

  return p_doc_type
       || lpad(v_year::text, 4, '0')
       || lpad(v_month::text, 2, '0')
       || lpad(v_run::text, 4, '0');
end $$;


-- >>>>>>>>>> 0007_acct_rls.sql >>>>>>>>>>
-- ============================================================
-- JR ERP เธเธฑเธเธเธต ยท Row Level Security (เน€เธ”เธดเธกเธเธฒเธ Quotation 0003)
-- เธเธฃเธฑเธเธชเธณเธซเธฃเธฑเธเนเธญเธเธฃเธงเธก:
--   - เธ•เธฑเธ” policy เธเธ profiles (เนเธเนเธเธญเธ OMS 0003 เนเธฅเนเธง)
--   - can_write() เน€เธ—เธตเธขเธ role_t: เน€เธเธตเธขเธเนเธ”เน = ADMIN / SALES / ACCOUNTING
-- ============================================================

alter table public.customers          enable row level security;
alter table public.quotations         enable row level security;
alter table public.quotation_items    enable row level security;
alter table public.document_sequences enable row level security;

-- helper: เน€เธเธตเธขเธเน€เธญเธเธชเธฒเธฃเธเธฑเธเธเธตเนเธ”เนเนเธซเธก (map เธเธฒเธ sales/admin/owner เน€เธ”เธดเธก โ’ role_t)
create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_active and role in ('ADMIN','SALES','ACCOUNTING')
       from public.profiles where id = auth.uid()),
    false);
$$;

-- ---------- customers ----------
create policy "เธญเนเธฒเธ customers (login)" on public.customers
  for select to authenticated using (true);
create policy "เน€เธเธดเนเธก customers" on public.customers
  for insert to authenticated with check (public.can_write());
create policy "เนเธเน customers" on public.customers
  for update to authenticated using (public.can_write()) with check (public.can_write());

-- ---------- quotations ----------
create policy "เธญเนเธฒเธ quotations (login)" on public.quotations
  for select to authenticated using (true);
create policy "เน€เธเธดเนเธก quotations" on public.quotations
  for insert to authenticated with check (public.can_write());
create policy "เนเธเน quotations" on public.quotations
  for update to authenticated using (public.can_write()) with check (public.can_write());

-- ---------- quotation_items ----------
create policy "เธญเนเธฒเธ items (login)" on public.quotation_items
  for select to authenticated using (true);
create policy "เธเธฑเธ”เธเธฒเธฃ items" on public.quotation_items
  for all to authenticated using (public.can_write()) with check (public.can_write());

-- document_sequences: เนเธกเนเน€เธเธดเธ” policy เนเธ” เน โ’ เน€เธเนเธฒเธ–เธถเธเธเนเธฒเธ function (security definer) เน€เธ—เนเธฒเธเธฑเนเธ


-- >>>>>>>>>> 0008_acct_documents.sql >>>>>>>>>>
-- ============================================================
-- JR ERP v2 โ€” เน€เธญเธเธชเธฒเธฃเธเธฃเธเธงเธเธเธฃ (เน€เธเธช 2-4)
-- เนเธเธงเธฒเธเธเธดเธฅ + เนเธเน€เธชเธฃเนเธ + เนเธเธชเธฑเนเธเธเธฅเธดเธ• + เนเธเธฃเธฑเธเธเธฃเธฐเธเธฑเธ + เน€เธเนเธเธชเธ•เนเธญเธ
-- เธฃเธซเธฑเธชเน€เธญเธเธชเธฒเธฃเนเธเน next_document_code() เน€เธ”เธดเธก (เธ.เธจ. เธฃเธตเน€เธเนเธ•เธฃเธฒเธขเน€เธ”เธทเธญเธ): BL/INV/PO/WR
-- ============================================================

-- ---------- Enums ----------
create type billing_status     as enum ('unpaid', 'partial', 'paid', 'cancelled');
create type installment_status as enum ('pending', 'paid');
create type production_status  as enum ('queued', 'measuring', 'manufacturing', 'qc', 'ready', 'installed', 'done', 'cancelled');
create type stock_move_type    as enum ('in', 'out', 'adjust');

-- ============================================================
-- เน€เธเธช 2 โ€” เนเธเธงเธฒเธเธเธดเธฅ (Billing Note) + เธเธงเธ”เธเธณเธฃเธฐ
-- ============================================================
create table public.billing_notes (
  id                bigint generated always as identity primary key,
  code              text not null unique,              -- BL2568060001
  quotation_id      bigint references public.quotations(id),
  customer_snapshot jsonb not null,
  issue_date        date not null default current_date,
  total             numeric(14,2) not null default 0,  -- = เธขเธญเธ”เธชเธธเธ—เธเธดเนเธเน€เธชเธเธญ
  status            billing_status not null default 'unpaid',
  note              text not null default '',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.billing_notes (quotation_id);

create table public.billing_installments (
  id              bigint generated always as identity primary key,
  billing_note_id bigint not null references public.billing_notes(id) on delete cascade,
  seq             int not null,                        -- เธเธงเธ”เธ—เธตเน 1,2,3...
  label           text not null default '',            -- "เธเธงเธ” 1/3 (40%)"
  amount          numeric(14,2) not null default 0,
  due_date        date,
  status          installment_status not null default 'pending',
  paid_amount     numeric(14,2) not null default 0,
  paid_date       date,
  sort_order      int not null default 0
);
create index on public.billing_installments (billing_note_id);

-- ============================================================
-- เน€เธเธช 2 โ€” เนเธเน€เธชเธฃเนเธ/เนเธเธเธณเธเธฑเธเธ เธฒเธฉเธต (Receipt/Tax Invoice)
-- ============================================================
create table public.receipts (
  id                bigint generated always as identity primary key,
  code              text not null unique,              -- INV2568060001
  billing_note_id   bigint references public.billing_notes(id),
  installment_id    bigint references public.billing_installments(id),
  customer_snapshot jsonb not null,
  issue_date        date not null default current_date,
  amount            numeric(14,2) not null default 0,  -- เธขเธญเธ”เธเนเธญเธ VAT
  vat_rate          numeric(5,2) not null default 7,
  vat_amt           numeric(14,2) not null default 0,
  net               numeric(14,2) not null default 0,  -- เธฃเธงเธก VAT
  payment_method    text not null default 'transfer',  -- transfer/cash/cheque
  note              text not null default '',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);
create index on public.receipts (billing_note_id);

-- ============================================================
-- เน€เธเธช 3 โ€” เนเธเธชเธฑเนเธเธเธฅเธดเธ• (Production Order)
-- ============================================================
create table public.production_orders (
  id                bigint generated always as identity primary key,
  code              text not null unique,              -- PO2568060001
  quotation_id      bigint references public.quotations(id),
  customer_snapshot jsonb not null,
  items             jsonb not null default '[]',        -- เธฃเธฒเธขเธเธฒเธฃ+เธเธเธฒเธ”+เธงเธฑเธชเธ”เธธ (snapshot เธเธฒเธเนเธเน€เธชเธเธญ)
  status            production_status not null default 'queued',
  measure_date      date,
  due_date          date,
  note              text not null default '',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.production_orders (status);

-- ============================================================
-- เน€เธเธช 3 โ€” เนเธเธฃเธฑเธเธเธฃเธฐเธเธฑเธ (Warranty)
-- ============================================================
create table public.warranties (
  id                bigint generated always as identity primary key,
  code              text not null unique,              -- WR2568060001
  quotation_id      bigint references public.quotations(id),
  customer_snapshot jsonb not null,
  items             jsonb not null default '[]',
  issue_date        date not null default current_date,
  warranty_months   int not null default 12,
  expires_date      date,                               -- issue_date + months (เน€เธเนเธ•เธเธฒเธ BFF)
  coverage          text not null default 'เธฃเธฑเธเธเธฃเธฐเธเธฑเธเธเธฒเธเธ•เธดเธ”เธ•เธฑเนเธเนเธฅเธฐเธงเธฑเธชเธ”เธธเธ•เธฒเธกเน€เธเธทเนเธญเธเนเธเธเธฃเธดเธฉเธฑเธ—',
  note              text not null default '',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);

-- ============================================================
-- เน€เธเธช 4 โ€” เน€เธเนเธเธชเธ•เนเธญเธเธงเธฑเธชเธ”เธธ (Inventory)
-- ============================================================
create table public.stock_items (
  id           bigint generated always as identity primary key,
  sku          text not null default '',
  name         text not null,
  category     text not null default '',              -- เน€เธชเนเธเธญเธฅเธน/เธเธฃเธฐเธเธ/เธญเธธเธเธเธฃเธ“เน
  unit         text not null default 'เน€เธชเนเธ',
  qty_on_hand  numeric(14,2) not null default 0,
  min_qty      numeric(14,2) not null default 0,       -- เธเธธเธ”เน€เธ•เธทเธญเธเธชเธฑเนเธเน€เธเธดเนเธก
  note         text not null default '',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.stock_items using gin (to_tsvector('simple', name || ' ' || sku || ' ' || category));

create table public.stock_moves (
  id            bigint generated always as identity primary key,
  stock_item_id bigint not null references public.stock_items(id) on delete cascade,
  type          stock_move_type not null,             -- in/out/adjust
  qty           numeric(14,2) not null,               -- +เธฃเธฑเธเน€เธเนเธฒ / -เธเนเธฒเธขเธญเธญเธ (adjust = เธ•เธฑเนเธเธเนเธฒเนเธซเธกเน)
  ref           text not null default '',             -- เธญเนเธฒเธเธญเธดเธเธเธฒเธ/PO
  note          text not null default '',
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index on public.stock_moves (stock_item_id);

-- ---------- updated_at triggers ----------
create trigger trg_billing_touch    before update on public.billing_notes     for each row execute function public.touch_updated_at();
create trigger trg_prod_touch        before update on public.production_orders for each row execute function public.touch_updated_at();
create trigger trg_stockitem_touch   before update on public.stock_items       for each row execute function public.touch_updated_at();

-- ---------- เธเธฃเธฑเธ qty_on_hand เธญเธฑเธ•เนเธเธกเธฑเธ•เธดเน€เธกเธทเนเธญเธกเธต stock move ----------
create or replace function public.apply_stock_move()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'in' then
    update public.stock_items set qty_on_hand = qty_on_hand + new.qty where id = new.stock_item_id;
  elsif new.type = 'out' then
    update public.stock_items set qty_on_hand = qty_on_hand - new.qty where id = new.stock_item_id;
  elsif new.type = 'adjust' then
    update public.stock_items set qty_on_hand = new.qty where id = new.stock_item_id;
  end if;
  return new;
end $$;
create trigger trg_stock_move after insert on public.stock_moves
  for each row execute function public.apply_stock_move();

-- ============================================================
-- RLS โ€” เธญเนเธฒเธ=login ยท เน€เธเธตเธขเธ=sales/admin/owner (เนเธเน can_write() เน€เธ”เธดเธก)
-- ============================================================
alter table public.billing_notes        enable row level security;
alter table public.billing_installments enable row level security;
alter table public.receipts             enable row level security;
alter table public.production_orders    enable row level security;
alter table public.warranties           enable row level security;
alter table public.stock_items          enable row level security;
alter table public.stock_moves          enable row level security;

do $$
declare t text;
begin
  foreach t in array array['billing_notes','billing_installments','receipts','production_orders','warranties','stock_items','stock_moves']
  loop
    execute format('create policy "read %1$s" on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy "write %1$s" on public.%1$s for all to authenticated using (public.can_write()) with check (public.can_write());', t);
  end loop;
end $$;


-- ============================================================
-- GRANTS — เปิด base privilege ให้ PostgREST (RLS ยังคุมรายแถว)
-- ============================================================
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to anon, authenticated, service_role;
-- >>>>>>>>>> 0009_seed.sql >>>>>>>>>>
-- ============================================================
-- JR Beta โ€” Seed (เธ•เธฑเธงเธญเธขเนเธฒเธ dev) ยท เธฃเธฑเธเธซเธฅเธฑเธ migrations
-- เนเธชเนเธเนเธฒเธ service role / SQL editor (เธเนเธฒเธก RLS)
-- เธซเธกเธฒเธขเน€เธซเธ•เธธ: profiles เธชเธฃเนเธฒเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธดเน€เธกเธทเนเธญเธชเธกเธฑเธเธฃ user (trigger on_auth_user_created)
--   เธ•เธฑเนเธ role เธเธเนเธฃเธเน€เธเนเธ ADMIN เธ”เนเธงเธขเธเธณเธชเธฑเนเธเธ—เนเธฒเธขเนเธเธฅเน (เนเธเนเธญเธตเน€เธกเธฅเนเธซเนเธ•เธฃเธ)
-- ============================================================

-- ---------- OMS: เน€เธฅเธ running เน€เธฃเธดเนเธกเธ•เนเธ + เธเธฒเธเธ•เธฑเธงเธญเธขเนเธฒเธ ----------
insert into public.job_sequence(year, last_seq) values (2026, 0)
  on conflict (year) do nothing;

insert into public.jobs (customer_name, customer_tel, customer_area, channel, assess_date, net_amount, status, deposit_amount, deposit_date)
values
  ('เธเธธเธ“เธเธคเธ•เธดเธเธฒ','081-234-5678','เธ เธนเน€เธเนเธ•','LINE','2026-01-12', 85000, 'COMPLETED', 42500, '2026-01-20'),
  ('เธเธธเธ“เธชเธกเธเธฒเธข','089-111-2222','เธเธฃเธธเธเน€เธ—เธเธฏ','FACEBOOK','2026-02-03', 128000, 'DEPOSITED', 64000, '2026-02-10'),
  ('เธเธธเธ“เธงเธตเธฃเธฐ','062-333-4444','เธเธเธ—เธเธธเธฃเธต','INSTAGRAM','2026-02-18', 54000, 'DEPOSITED', 27000, '2026-02-25'),
  ('เธเธธเธ“เธเธ เธฒ','095-555-6666','เธ เธนเน€เธเนเธ•','LINE','2026-03-01', 210000, 'DEPOSITED', 105000, '2026-03-08'),
  ('เธเธธเธ“เธญเธฃเธธเธ“เธต','061-999-0000','เธเธฃเธธเธเน€เธ—เธเธฏ','INSTAGRAM','2026-03-22', 96000, 'QUOTE_SENT', null, null),
  ('เธเธธเธ“เธเธดเธเธฑเธข','088-121-3434','เธชเธกเธธเธ—เธฃเธเธฃเธฒเธเธฒเธฃ','LINE','2026-04-02', null, 'PENDING_QUOTE', null, null);

-- ---------- เธเธฑเธเธเธต: เธฅเธนเธเธเนเธฒเธ•เธฑเธงเธญเธขเนเธฒเธ ----------
insert into public.customers (name, job, address, tax_id, line_id, phone, contact_person) values
  ('เธเธธเธ“เธชเธกเธเธฒเธข เธฃเธธเนเธเน€เธฃเธทเธญเธ', 'เธเนเธฒเธเธ—เธฃเธฒเธขเธ—เธญเธ', '13 เธเธซเธฅเนเธขเธเธดเธ 25 เธเธ•เธธเธเธฑเธเธฃ เธเธ—เธก. 10140', '1100xxxxxxxxx', '@somchai', '089-xxx-1234', 'เธเธธเธ“เธชเธกเธเธฒเธข'),
  ('เธเธธเธ“เน€เธญ เธ—เธธเนเธเธเธฃเธธ', 'เธ•เนเธญเน€เธ•เธดเธกเธเธฃเธฑเธงเธซเธฅเธฑเธเธเนเธฒเธ', '88/12 เธเธฃเธฐเธเธฒเธญเธธเธ—เธดเธจ เธ—เธธเนเธเธเธฃเธธ เธเธ—เธก.', '', '@aeyy', '081-xxx-5678', 'เธเธธเธ“เน€เธญ'),
  ('เธเธเธ. เธเธฃเธตเธเธงเธดเธง', 'เธญเธฒเธเธฒเธฃเธชเธณเธเธฑเธเธเธฒเธ 3 เธเธฑเนเธ', '200 เธฃเธฑเธเธ”เธฒเธ เธดเน€เธฉเธ เธซเนเธงเธขเธเธงเธฒเธ เธเธ—เธก.', '0105xxxxxxxxx', '@greenview', '02-xxx-9000', 'เธเนเธฒเธขเธเธฑเธ”เธเธทเนเธญ');

-- เธ•เธฑเนเธ role เนเธซเน user เธเธเนเธฃเธเน€เธเนเธ ADMIN (เนเธเนเธญเธตเน€เธกเธฅเนเธซเนเธ•เธฃเธ เนเธฅเนเธงเธฃเธฑเธเธเธฃเธฃเธ—เธฑเธ”เธเธตเน)
-- update public.profiles set role='ADMIN', full_name='เธเธตเนเธเธฑเธ—' where email = 'you@jr-aluminium.com';

