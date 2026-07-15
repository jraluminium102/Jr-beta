-- 0094: ใบตัดอลู (cut list) + BOQ ต่องาน + ตัดสต็อก
-- โฟลว์: งานลูกค้า → ดึงข้อจากใบเสนอ (calc_recipe 0093) อัตโนมัติ / กรอกมือ → ใบตัดต่อข้อ
--        → สรุป "เส้นต่อรหัสอลู" ทั้งงาน (BOQ) → ปุ่ม "ตัดสต็อก" หักจริงผ่าน stock_moves (sku = รหัส B####)
-- สูตรตัด (CutSpec) อยู่ในโค้ด (src/lib/cutlist) — DB เก็บเฉพาะอินพุตต่อข้อ (spec_id + input) แล้วคิดสดตอนเปิด

create table if not exists public.cutlists (
  id bigserial primary key,
  code text not null default '',                 -- CL-<id> (ตั้งหลัง insert) — ใช้เป็น ref ใน stock_moves
  job_id uuid references public.jobs(id) on delete set null,
  name text not null default '',                 -- ชื่อใบตัด เช่น "คุณตะวัน — บานเลื่อน 2 ชุด"
  status text not null default 'draft' check (status in ('draft','stock_cut')),
  stock_cut_at timestamptz,
  stock_cut_by uuid,
  stock_cut_summary jsonb,                       -- ผลการหัก: [{code, bars, stock_item_id|null}] — รหัสที่ไม่มีในสต็อกจะ null (ข้าม)
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cutlists_job on public.cutlists(job_id);

create table if not exists public.cutlist_items (
  id bigserial primary key,
  cutlist_id bigint not null references public.cutlists(id) on delete cascade,
  spec_id text not null,                         -- id ของ CutSpec ในโค้ด เช่น 'sms_slide_free'
  label text not null default '',                -- ชื่อข้อ (จากใบเสนอ/พิมพ์เอง)
  input jsonb not null default '{}'::jsonb,      -- {W,H,N,rail,honk,...} อินพุตของสเปกนั้น
  sets int not null default 1,                   -- จำนวนชุดผลิต
  sort_order int not null default 0
);
create index if not exists idx_cutlist_items_cl on public.cutlist_items(cutlist_id);

alter table public.cutlists enable row level security;
alter table public.cutlist_items enable row level security;
-- อ่าน: ทุกคนที่ active · เขียน: ทีมที่แตะงานผลิต/สโตร์ (ตรงชุด STORE_WRITE ของ stock)
create policy cl_read  on public.cutlists for select using (public.is_active());
create policy cl_write on public.cutlists for all
  using (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'));
create policy cli_read  on public.cutlist_items for select using (public.is_active());
create policy cli_write on public.cutlist_items for all
  using (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING'));

-- replace ข้อใบตัดแบบ atomic (delete+insert ใน txn เดียว — pattern เดียวกับ replace_quotation_items 0093)
create or replace function public.replace_cutlist_items(p_cl_id bigint, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- guard สิทธิ์ในตัวฟังก์ชัน: security definer ข้าม RLS → เช็คเองให้ตรงชุด cl_write
  if not public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING') then
    raise exception 'forbidden: ต้องมีสิทธิ์เขียนใบตัด (ADMIN/PRODUCTION/SALES/ACCOUNTING)';
  end if;
  -- ใบที่ตัดสต็อกแล้ว แก้ข้อไม่ได้ (ยอดหักไปแล้วจะไม่ตรง)
  if exists (select 1 from public.cutlists where id = p_cl_id and status = 'stock_cut') then
    raise exception 'cutlist already stock_cut';
  end if;
  delete from public.cutlist_items where cutlist_id = p_cl_id;
  insert into public.cutlist_items (cutlist_id, spec_id, label, input, sets, sort_order)
  select
    p_cl_id,
    coalesce(it->>'spec_id', ''),
    coalesce(it->>'label', ''),
    coalesce(it->'input', '{}'::jsonb),
    greatest(1, coalesce((it->>'sets')::int, 1)),
    coalesce((it->>'sort_order')::int, 0)
  from jsonb_array_elements(p_items) as it
  where coalesce(it->>'spec_id', '') <> '';
end;
$$;
revoke all on function public.replace_cutlist_items(bigint, jsonb) from public;
grant execute on function public.replace_cutlist_items(bigint, jsonb) to authenticated;

-- updated_at อัตโนมัติ (ใช้ helper กลางถ้ามี — สร้างเฉพาะทางถ้าไม่มี)
create or replace function public.tg_cutlists_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists cutlists_touch on public.cutlists;
create trigger cutlists_touch before update on public.cutlists
  for each row execute function public.tg_cutlists_touch();
