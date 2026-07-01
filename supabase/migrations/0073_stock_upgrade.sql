-- ============================================================
-- 0073 · ยกระบบสโตร์วัสดุ
--   (1) หมวดหมู่จัดการได้ (dropdown)         → stock_categories
--   (2) วัสดุ: รูป, ต้นทุน, อลูคิดต่อโล×น้ำหนัก, ร้านค้า
--   (3) ประวัติราคา (บันทึกราคาเก่าได้)        → stock_prices + trigger sync ต้นทุนล่าสุด
--   (4) การเคลื่อนไหว: ผู้เบิก, ผูกงาน, ต้นทุน/ราคารวม, รูปใบเสร็จ
--   (5) storage bucket 'stock' สำหรับอัปโหลดรูปเข้าระบบเราเอง
-- idempotent · เจ้าของรัน · ไม่แตะข้อมูลเดิม
-- ============================================================

-- ── (1) หมวดหมู่วัสดุ (จัดการได้ · dropdown) ──
create table if not exists public.stock_categories (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── (2) วัสดุ: เพิ่มฟิลด์ต้นทุน/น้ำหนัก/รูป/ร้าน/หมวด(FK) ──
alter table public.stock_items
  add column if not exists category_id     bigint references public.stock_categories(id),
  add column if not exists image_url       text          not null default '',
  add column if not exists supplier        text          not null default '',
  add column if not exists unit_cost       numeric(14,2) not null default 0,   -- ต้นทุนต่อหน่วยฐาน (ต่อเส้น/ชิ้น) ล่าสุด
  add column if not exists is_weight_based boolean       not null default false,-- true = อลู คิดต่อโล
  add column if not exists weight_per_unit numeric(14,3) not null default 0,   -- กก. ต่อ 1 หน่วย (เช่น กก./เส้น)
  add column if not exists price_per_kg    numeric(14,2) not null default 0;   -- ราคาต่อโลล่าสุด (เฉพาะ weight-based)

-- ── (3) ประวัติราคา ──
create table if not exists public.stock_prices (
  id             bigint generated always as identity primary key,
  stock_item_id  bigint not null references public.stock_items(id) on delete cascade,
  price_per_kg   numeric(14,2),                       -- ราคาต่อโล (weight-based) · null = คิดต่อหน่วยตรง
  unit_cost      numeric(14,2) not null default 0,    -- ต้นทุนต่อหน่วยฐาน ณ วันนั้น
  effective_date date not null default current_date,  -- ราคานี้มีผลวันไหน (ย้อนหลังได้)
  supplier       text not null default '',
  note           text not null default '',
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index if not exists stock_prices_item_idx on public.stock_prices(stock_item_id, effective_date desc);

-- sync ต้นทุนล่าสุดเข้า stock_items เมื่อเพิ่ม/แก้ราคา — เฉพาะเมื่อเป็นราคาที่ใหม่ที่สุด (กันราคาเก่าทับ)
create or replace function public.apply_stock_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare latest date;
begin
  select max(effective_date) into latest from public.stock_prices where stock_item_id = new.stock_item_id;
  if latest is null or new.effective_date >= latest then
    update public.stock_items
      set unit_cost = new.unit_cost,
          price_per_kg = coalesce(new.price_per_kg, price_per_kg)
      where id = new.stock_item_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_stock_price on public.stock_prices;
create trigger trg_stock_price after insert on public.stock_prices
  for each row execute function public.apply_stock_price();

-- ── (4) การเคลื่อนไหว: เพิ่มผู้เบิก/งาน/ต้นทุน/รูป ──
alter table public.stock_moves
  add column if not exists requester   text          not null default '',   -- ผู้เบิก (พิมพ์ชื่อ)
  add column if not exists job_id       uuid          references public.jobs(id), -- ผูกงานจริง (ต้นทุนงาน/BOQ)
  add column if not exists unit_cost    numeric(14,2) not null default 0,    -- ต้นทุน/หน่วย ณ ตอนเคลื่อนไหว (snapshot)
  add column if not exists total_price  numeric(14,2) not null default 0,    -- ราคารวม (qty×unit_cost หรือกรอกตอนรับเข้า)
  add column if not exists image_url    text          not null default '';   -- รูปใบเสร็จ/ของ (ตอนรับเข้า)
create index if not exists stock_moves_job_idx on public.stock_moves(job_id);

-- ── (5) RLS หมวด/ราคา — อ่านทุกคน · เขียนตาม role (ตามแม่แบบ BOQ 0017) ──
alter table public.stock_categories enable row level security;
alter table public.stock_prices     enable row level security;

drop policy if exists stock_cat_read  on public.stock_categories;
drop policy if exists stock_cat_write on public.stock_categories;
create policy stock_cat_read  on public.stock_categories for select using (true);
create policy stock_cat_write on public.stock_categories for all
  using      (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'));

drop policy if exists stock_price_read  on public.stock_prices;
drop policy if exists stock_price_write on public.stock_prices;
create policy stock_price_read  on public.stock_prices for select using (true);
create policy stock_price_write on public.stock_prices for all
  using      (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'));

grant select, insert, update, delete on public.stock_categories, public.stock_prices to authenticated, service_role;

-- ── (5b) เปิดให้ฝ่ายผลิต/สโตร์ (PRODUCTION) บันทึกวัสดุ+เคลื่อนไหวได้ (เดิม can_write = ADMIN/SALES/ACCOUNTING) ──
-- พนักงานสโตร์ล็อกอินเป็น PRODUCTION → ต้องรับเข้า/เบิกออกได้ · อ่านเหมือนเดิม
drop policy if exists "write stock_items" on public.stock_items;
drop policy if exists "write stock_moves" on public.stock_moves;
create policy "write stock_items" on public.stock_items for all to authenticated
  using      (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'));
create policy "write stock_moves" on public.stock_moves for all to authenticated
  using      (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'));

-- ── (6) storage bucket 'stock' (อัปโหลดรูปเข้าระบบ) ──
insert into storage.buckets (id, name, public)
values ('stock', 'stock', true)
on conflict (id) do nothing;

drop policy if exists "stock bucket read"  on storage.objects;
drop policy if exists "stock bucket write" on storage.objects;
create policy "stock bucket read"  on storage.objects for select using (bucket_id = 'stock');
create policy "stock bucket write" on storage.objects for insert to authenticated with check (bucket_id = 'stock');
