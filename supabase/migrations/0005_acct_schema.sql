-- ============================================================
-- JR ERP — ระบบบัญชี · Schema (เดิมจาก Quotation 0001)
-- ปรับสำหรับแอพรวม: ตัด profiles + enum user_role + handle_new_user
--   → ใช้ public.profiles (role_t) ที่สร้างไว้แล้วใน 0001_oms_schema.sql
-- ตารางบัญชีคงโครงสร้างเดิมทุกคอลัมน์
-- ============================================================

-- ---------- Enums (เฉพาะของบัญชี — ไม่ชนกับ OMS) ----------
create type quotation_status as enum ('draft', 'sent', 'approved', 'cancelled');

-- ---------- customers (P0-1) ----------
create table public.customers (
  id             bigint generated always as identity primary key,
  name           text not null,                 -- ชื่อลูกค้า/งาน
  job            text not null default '',       -- ชื่องาน/โปรเจกต์
  address        text not null default '',       -- ที่อยู่ออกบิล
  tax_id         text not null default '',       -- เลขผู้เสียภาษี
  line_id        text not null default '',
  phone          text not null default '',
  contact_person text not null default '',
  is_active      boolean not null default true,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.customers using gin (to_tsvector('simple', name || ' ' || job || ' ' || phone || ' ' || line_id));

-- ---------- document_sequences (รหัสออโต้ — reset รายเดือน) ----------
create table public.document_sequences (
  doc_type     text not null,        -- 'QT' | 'BL' | 'INV' | 'PO' | 'WR'
  year_be      int  not null,        -- พ.ศ. เช่น 2568
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

-- ---------- updated_at trigger (ฟังก์ชันคนละชื่อกับ OMS tg_touch_updated_at) ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_customers_touch  before update on public.customers  for each row execute function public.touch_updated_at();
create trigger trg_quotations_touch before update on public.quotations for each row execute function public.touch_updated_at();
