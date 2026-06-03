-- ============================================================
-- JR OMS — 0001 Schema (enums, tables, indexes)
-- ยอดงาน = ยอดก่อน VAT หักส่วนลดแล้ว (OQ-04)
-- Job code = JR{YYYY}-{NNN} ต่อเลขเดิม (OQ-01)
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

-- ---------- PROFILES (1:1 กับ auth.users, เก็บ role) ----------
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
  -- การเงิน (OQ-04)
  discount_amount numeric(12,2),
  net_amount      numeric(12,2),                       -- ยอดก่อน VAT หักส่วนลดแล้ว
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
  warranty_until    date,                              -- completed_date + 12 เดือน (auto)
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
  owner_name      text,                                -- ชื่อ free-text (auto-sync จาก Phase 3)
  resolved_at     timestamptz,
  resolution      text,
  status          issue_status_t not null default 'OPEN',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index issues_job_idx    on public.issues(job_id);
create index issues_status_idx on public.issues(status);

-- ---------- FINANCE ENTRIES (05_บัญชี) ----------
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
