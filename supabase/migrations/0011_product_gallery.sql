-- ============================================================
-- 0011 — เฟส 2: Product Gallery (ภาพสินค้า)
-- tables: product_gallery, quotation_item_images
-- RLS: อ่าน = ทุก authenticated, เขียน = ADMIN / SALES
--
-- Supabase Storage bucket "product-images"
-- ต้องสร้างด้วยมือ (หรือ supabase CLI) ก่อน apply migration นี้:
--   supabase storage create product-images --public
-- หรือ Dashboard > Storage > Create bucket
--   Name: product-images, Public: ON (เพื่อให้ url ดูได้โดยไม่ต้อง signed)
-- ============================================================

-- ─── product_gallery ─────────────────────────────────────────────────────────
-- เก็บรูปผลงาน/ตัวอย่างสีผูกกับ product_key (ตรงกับ PRODUCTS[].id ใน engine.ts)
create table if not exists public.product_gallery (
  id            bigint  generated always as identity primary key,
  product_key   text    not null,          -- ตรงกับ ProductDef.id เช่น 'sliding_sms'
  title         text    not null default '', -- caption/ชื่อรูป (แสดงใต้รูป)
  storage_path  text    not null,          -- path ใน bucket product-images
  sort_order    smallint not null default 0,
  is_active     boolean  not null default true,
  created_by    uuid    references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists product_gallery_key_idx
  on public.product_gallery (product_key)
  where is_active = true;

-- updated_at trigger (reuse pattern จาก 0005)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists product_gallery_updated_at on public.product_gallery;
create trigger product_gallery_updated_at
  before update on public.product_gallery
  for each row execute function public.set_updated_at();

-- ─── quotation_item_images ────────────────────────────────────────────────────
-- ผูกรูปที่เลือกกับ quotation_item (many-to-many: 1 item → n รูป)
-- เก็บแค่ gallery_id (FK) ไม่ copy storage_path เพื่อให้ admin แก้รูปได้ทีหลัง
create table if not exists public.quotation_item_images (
  id                 bigint  generated always as identity primary key,
  quotation_item_id  integer not null references public.quotation_items(id) on delete cascade,
  gallery_id         bigint  not null references public.product_gallery(id) on delete cascade,
  sort_order         smallint not null default 0,
  constraint uq_item_gallery unique (quotation_item_id, gallery_id)
);

create index if not exists qii_item_idx on public.quotation_item_images (quotation_item_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.product_gallery enable row level security;
alter table public.quotation_item_images enable row level security;

-- product_gallery: read = ทุก authenticated (ลูกค้า/เซลล์/แอดมิน ดูได้หมด)
create policy "read product_gallery" on public.product_gallery
  for select to authenticated
  using (public.is_active());

-- product_gallery: write = ADMIN หรือ SALES
create policy "write product_gallery" on public.product_gallery
  for all to authenticated
  using  (public.is_active() and public.auth_role() in ('ADMIN', 'SALES'))
  with check (public.is_active() and public.auth_role() in ('ADMIN', 'SALES'));

-- quotation_item_images: read = ทุก authenticated
create policy "read quotation_item_images" on public.quotation_item_images
  for select to authenticated
  using (public.is_active());

-- quotation_item_images: write = ADMIN หรือ SALES (คนทำใบเสนอราคา)
create policy "write quotation_item_images" on public.quotation_item_images
  for all to authenticated
  using  (public.is_active() and public.auth_role() in ('ADMIN', 'SALES'))
  with check (public.is_active() and public.auth_role() in ('ADMIN', 'SALES'));

-- ─── Storage policies (เขียนเป็น comment — ต้อง apply ผ่าน Dashboard/CLI) ───
-- Storage bucket "product-images" policies:
--   SELECT (download): authenticated users only (bucket public=ON ครอบหมดแล้ว)
--   INSERT: auth_role() in ('ADMIN','SALES')
--   DELETE: auth_role() in ('ADMIN','SALES')
-- หรือตั้ง bucket เป็น public แล้วจำกัดแค่ write ที่ BFF layer (requirePermission)
