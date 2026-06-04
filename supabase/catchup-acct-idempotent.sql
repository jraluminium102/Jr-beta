-- ============================================================
-- JR Beta — เติมตารางฝั่งบัญชี (0005-0008) แบบ idempotent
-- ใช้กับ environment ที่ติดตั้งเฉพาะ OMS(0001-0004)+queue(0010)+0011
-- แต่ยังไม่มีฝั่งบัญชี (customers/quotations/billing/receipts/ฯลฯ)
-- ปลอดภัยกับ jobs/profiles/queue ที่มีอยู่ · ไม่มี RESET/drop/truncate · รันซ้ำได้
-- รันก่อน 0012 (เพื่อให้ 0012 เชื่อม FK customers/quotations ครบ)
-- ============================================================

-- ===================== ENUMS (0005 + 0008) =====================
do $$ begin create type quotation_status as enum ('draft','sent','approved','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type billing_status as enum ('unpaid','partial','paid','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type installment_status as enum ('pending','paid'); exception when duplicate_object then null; end $$;
do $$ begin create type production_status as enum ('queued','measuring','manufacturing','qc','ready','installed','done','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type stock_move_type as enum ('in','out','adjust'); exception when duplicate_object then null; end $$;

-- ===================== FUNCTIONS (สร้างก่อน trigger) =====================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.current_user_role()
returns role_t language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.next_document_code(p_doc_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_now    timestamptz := now() at time zone 'Asia/Bangkok';
  v_year   int := extract(year  from v_now)::int + 543;
  v_month  int := extract(month from v_now)::int;
  v_run    int;
begin
  insert into public.document_sequences (doc_type, year_be, month, last_running)
  values (p_doc_type, v_year, v_month, 1)
  on conflict (doc_type, year_be, month)
  do update set last_running = public.document_sequences.last_running + 1
  returning last_running into v_run;
  return p_doc_type || lpad(v_year::text, 4, '0') || lpad(v_month::text, 2, '0') || lpad(v_run::text, 4, '0');
end $$;

create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active and role in ('ADMIN','SALES','ACCOUNTING') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.apply_stock_move()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'in' then update public.stock_items set qty_on_hand = qty_on_hand + new.qty where id = new.stock_item_id;
  elsif new.type = 'out' then update public.stock_items set qty_on_hand = qty_on_hand - new.qty where id = new.stock_item_id;
  elsif new.type = 'adjust' then update public.stock_items set qty_on_hand = new.qty where id = new.stock_item_id;
  end if;
  return new;
end $$;

-- ===================== TABLES (0005) =====================
create table if not exists public.customers (
  id bigint generated always as identity primary key,
  name text not null, job text not null default '', address text not null default '',
  tax_id text not null default '', line_id text not null default '', phone text not null default '',
  contact_person text not null default '', is_active boolean not null default true,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists customers_search_idx on public.customers using gin (to_tsvector('simple', name || ' ' || job || ' ' || phone || ' ' || line_id));

create table if not exists public.document_sequences (
  doc_type text not null, year_be int not null, month int not null, last_running int not null default 0,
  primary key (doc_type, year_be, month)
);

create table if not exists public.quotations (
  id bigint generated always as identity primary key, code text not null unique,
  customer_id bigint references public.customers(id), customer_snapshot jsonb not null,
  issue_date date not null default current_date, status quotation_status not null default 'draft',
  vat_rate numeric(5,2) not null default 7, discount_pct numeric(5,2) not null default 0, wht_rate numeric(5,2) not null default 0,
  subtotal numeric(14,2) not null default 0, discount_amt numeric(14,2) not null default 0, vat_amt numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0, wht_amt numeric(14,2) not null default 0, net numeric(14,2) not null default 0,
  note text not null default '', created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists quotations_status_idx on public.quotations (status);
create index if not exists quotations_customer_idx on public.quotations (customer_id);

create table if not exists public.quotation_items (
  id bigint generated always as identity primary key,
  quotation_id bigint not null references public.quotations(id) on delete cascade,
  name text not null, detail text not null default '', qty numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null default 0, line_total numeric(14,2) not null default 0, sort_order int not null default 0
);
create index if not exists quotation_items_qid_idx on public.quotation_items (quotation_id);

-- ===================== TABLES (0008) =====================
create table if not exists public.billing_notes (
  id bigint generated always as identity primary key, code text not null unique,
  quotation_id bigint references public.quotations(id), customer_snapshot jsonb not null,
  issue_date date not null default current_date, total numeric(14,2) not null default 0,
  status billing_status not null default 'unpaid', note text not null default '',
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists billing_notes_qid_idx on public.billing_notes (quotation_id);

create table if not exists public.billing_installments (
  id bigint generated always as identity primary key,
  billing_note_id bigint not null references public.billing_notes(id) on delete cascade,
  seq int not null, label text not null default '', amount numeric(14,2) not null default 0,
  due_date date, status installment_status not null default 'pending', paid_amount numeric(14,2) not null default 0,
  paid_date date, sort_order int not null default 0
);
create index if not exists billing_installments_bid_idx on public.billing_installments (billing_note_id);

create table if not exists public.receipts (
  id bigint generated always as identity primary key, code text not null unique,
  billing_note_id bigint references public.billing_notes(id), installment_id bigint references public.billing_installments(id),
  customer_snapshot jsonb not null, issue_date date not null default current_date, amount numeric(14,2) not null default 0,
  vat_rate numeric(5,2) not null default 7, vat_amt numeric(14,2) not null default 0, net numeric(14,2) not null default 0,
  payment_method text not null default 'transfer', note text not null default '',
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create index if not exists receipts_bid_idx on public.receipts (billing_note_id);

create table if not exists public.production_orders (
  id bigint generated always as identity primary key, code text not null unique,
  quotation_id bigint references public.quotations(id), customer_snapshot jsonb not null,
  items jsonb not null default '[]', status production_status not null default 'queued',
  measure_date date, due_date date, note text not null default '',
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists production_orders_status_idx on public.production_orders (status);

create table if not exists public.warranties (
  id bigint generated always as identity primary key, code text not null unique,
  quotation_id bigint references public.quotations(id), customer_snapshot jsonb not null,
  items jsonb not null default '[]', issue_date date not null default current_date, warranty_months int not null default 12,
  expires_date date, coverage text not null default 'รับประกันงานติดตั้งและวัสดุตามเงื่อนไขบริษัท',
  note text not null default '', created_by uuid references auth.users(id), created_at timestamptz not null default now()
);

create table if not exists public.stock_items (
  id bigint generated always as identity primary key, sku text not null default '', name text not null,
  category text not null default '', unit text not null default 'เส้น', qty_on_hand numeric(14,2) not null default 0,
  min_qty numeric(14,2) not null default 0, note text not null default '', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists stock_items_search_idx on public.stock_items using gin (to_tsvector('simple', name || ' ' || sku || ' ' || category));

create table if not exists public.stock_moves (
  id bigint generated always as identity primary key,
  stock_item_id bigint not null references public.stock_items(id) on delete cascade,
  type stock_move_type not null, qty numeric(14,2) not null, ref text not null default '', note text not null default '',
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create index if not exists stock_moves_sid_idx on public.stock_moves (stock_item_id);

-- ===================== TRIGGERS (drop if exists → create) =====================
drop trigger if exists trg_customers_touch on public.customers;
create trigger trg_customers_touch before update on public.customers for each row execute function public.touch_updated_at();
drop trigger if exists trg_quotations_touch on public.quotations;
create trigger trg_quotations_touch before update on public.quotations for each row execute function public.touch_updated_at();
drop trigger if exists trg_billing_touch on public.billing_notes;
create trigger trg_billing_touch before update on public.billing_notes for each row execute function public.touch_updated_at();
drop trigger if exists trg_prod_touch on public.production_orders;
create trigger trg_prod_touch before update on public.production_orders for each row execute function public.touch_updated_at();
drop trigger if exists trg_stockitem_touch on public.stock_items;
create trigger trg_stockitem_touch before update on public.stock_items for each row execute function public.touch_updated_at();
drop trigger if exists trg_stock_move on public.stock_moves;
create trigger trg_stock_move after insert on public.stock_moves for each row execute function public.apply_stock_move();

-- ===================== RLS — enable =====================
alter table public.customers enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.document_sequences enable row level security;
alter table public.billing_notes enable row level security;
alter table public.billing_installments enable row level security;
alter table public.receipts enable row level security;
alter table public.production_orders enable row level security;
alter table public.warranties enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_moves enable row level security;

-- ===================== RLS — policies =====================
drop policy if exists "อ่าน customers (login)" on public.customers;
create policy "อ่าน customers (login)" on public.customers for select to authenticated using (true);
drop policy if exists "เพิ่ม customers" on public.customers;
create policy "เพิ่ม customers" on public.customers for insert to authenticated with check (public.can_write());
drop policy if exists "แก้ customers" on public.customers;
create policy "แก้ customers" on public.customers for update to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists "อ่าน quotations (login)" on public.quotations;
create policy "อ่าน quotations (login)" on public.quotations for select to authenticated using (true);
drop policy if exists "เพิ่ม quotations" on public.quotations;
create policy "เพิ่ม quotations" on public.quotations for insert to authenticated with check (public.can_write());
drop policy if exists "แก้ quotations" on public.quotations;
create policy "แก้ quotations" on public.quotations for update to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists "อ่าน items (login)" on public.quotation_items;
create policy "อ่าน items (login)" on public.quotation_items for select to authenticated using (true);
drop policy if exists "จัดการ items" on public.quotation_items;
create policy "จัดการ items" on public.quotation_items for all to authenticated using (public.can_write()) with check (public.can_write());

do $$
declare t text;
begin
  foreach t in array array['billing_notes','billing_installments','receipts','production_orders','warranties','stock_items','stock_moves']
  loop
    execute format('drop policy if exists "read %1$s" on public.%1$s;', t);
    execute format('create policy "read %1$s" on public.%1$s for select to authenticated using (true);', t);
    execute format('drop policy if exists "write %1$s" on public.%1$s;', t);
    execute format('create policy "write %1$s" on public.%1$s for all to authenticated using (public.can_write()) with check (public.can_write());', t);
  end loop;
end $$;

-- ===================== GRANTS =====================
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
