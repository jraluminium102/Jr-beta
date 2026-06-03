-- ============================================================
-- JR ERP v2 — เอกสารครบวงจร (เฟส 2-4)
-- ใบวางบิล + ใบเสร็จ + ใบสั่งผลิต + ใบรับประกัน + เช็คสต๊อก
-- รหัสเอกสารใช้ next_document_code() เดิม (พ.ศ. รีเซ็ตรายเดือน): BL/INV/PO/WR
-- ============================================================

-- ---------- Enums ----------
create type billing_status     as enum ('unpaid', 'partial', 'paid', 'cancelled');
create type installment_status as enum ('pending', 'paid');
create type production_status  as enum ('queued', 'measuring', 'manufacturing', 'qc', 'ready', 'installed', 'done', 'cancelled');
create type stock_move_type    as enum ('in', 'out', 'adjust');

-- ============================================================
-- เฟส 2 — ใบวางบิล (Billing Note) + งวดชำระ
-- ============================================================
create table public.billing_notes (
  id                bigint generated always as identity primary key,
  code              text not null unique,              -- BL2568060001
  quotation_id      bigint references public.quotations(id),
  customer_snapshot jsonb not null,
  issue_date        date not null default current_date,
  total             numeric(14,2) not null default 0,  -- = ยอดสุทธิใบเสนอ
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
  seq             int not null,                        -- งวดที่ 1,2,3...
  label           text not null default '',            -- "งวด 1/3 (40%)"
  amount          numeric(14,2) not null default 0,
  due_date        date,
  status          installment_status not null default 'pending',
  paid_amount     numeric(14,2) not null default 0,
  paid_date       date,
  sort_order      int not null default 0
);
create index on public.billing_installments (billing_note_id);

-- ============================================================
-- เฟส 2 — ใบเสร็จ/ใบกำกับภาษี (Receipt/Tax Invoice)
-- ============================================================
create table public.receipts (
  id                bigint generated always as identity primary key,
  code              text not null unique,              -- INV2568060001
  billing_note_id   bigint references public.billing_notes(id),
  installment_id    bigint references public.billing_installments(id),
  customer_snapshot jsonb not null,
  issue_date        date not null default current_date,
  amount            numeric(14,2) not null default 0,  -- ยอดก่อน VAT
  vat_rate          numeric(5,2) not null default 7,
  vat_amt           numeric(14,2) not null default 0,
  net               numeric(14,2) not null default 0,  -- รวม VAT
  payment_method    text not null default 'transfer',  -- transfer/cash/cheque
  note              text not null default '',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);
create index on public.receipts (billing_note_id);

-- ============================================================
-- เฟส 3 — ใบสั่งผลิต (Production Order)
-- ============================================================
create table public.production_orders (
  id                bigint generated always as identity primary key,
  code              text not null unique,              -- PO2568060001
  quotation_id      bigint references public.quotations(id),
  customer_snapshot jsonb not null,
  items             jsonb not null default '[]',        -- รายการ+ขนาด+วัสดุ (snapshot จากใบเสนอ)
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
-- เฟส 3 — ใบรับประกัน (Warranty)
-- ============================================================
create table public.warranties (
  id                bigint generated always as identity primary key,
  code              text not null unique,              -- WR2568060001
  quotation_id      bigint references public.quotations(id),
  customer_snapshot jsonb not null,
  items             jsonb not null default '[]',
  issue_date        date not null default current_date,
  warranty_months   int not null default 12,
  expires_date      date,                               -- issue_date + months (เซ็ตจาก BFF)
  coverage          text not null default 'รับประกันงานติดตั้งและวัสดุตามเงื่อนไขบริษัท',
  note              text not null default '',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);

-- ============================================================
-- เฟส 4 — เช็คสต๊อกวัสดุ (Inventory)
-- ============================================================
create table public.stock_items (
  id           bigint generated always as identity primary key,
  sku          text not null default '',
  name         text not null,
  category     text not null default '',              -- เส้นอลู/กระจก/อุปกรณ์
  unit         text not null default 'เส้น',
  qty_on_hand  numeric(14,2) not null default 0,
  min_qty      numeric(14,2) not null default 0,       -- จุดเตือนสั่งเพิ่ม
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
  qty           numeric(14,2) not null,               -- +รับเข้า / -จ่ายออก (adjust = ตั้งค่าใหม่)
  ref           text not null default '',             -- อ้างอิงงาน/PO
  note          text not null default '',
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index on public.stock_moves (stock_item_id);

-- ---------- updated_at triggers ----------
create trigger trg_billing_touch    before update on public.billing_notes     for each row execute function public.touch_updated_at();
create trigger trg_prod_touch        before update on public.production_orders for each row execute function public.touch_updated_at();
create trigger trg_stockitem_touch   before update on public.stock_items       for each row execute function public.touch_updated_at();

-- ---------- ปรับ qty_on_hand อัตโนมัติเมื่อมี stock move ----------
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
-- RLS — อ่าน=login · เขียน=sales/admin/owner (ใช้ can_write() เดิม)
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
