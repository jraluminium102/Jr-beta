-- 0093: ระบบ Rev ใบเสนอราคา + สูตรคิดราคาต่อข้อ (calc_recipe)
-- ① Rev: แก้ใบแต่ละครั้งเลือกได้ว่า นับเป็น Rev ไหม (ป้าย Rev01/Rev02 พิมพ์บนใบ · แก้เองได้)
--    + เก็บประวัติเวอร์ชันเดิม (snapshot) เมื่อเลือก "Rev ใหม่ (เก็บของเดิม)"
-- ② calc_recipe: เก็บ "สูตร" (ทุก input ที่กดตอนคิดราคา 4.0) ต่อรายการ → คลิกข้อในเครื่องคิดแล้วโหลดกลับมาแก้ได้

alter table public.quotations add column if not exists revision_no int not null default 0;
alter table public.quotations add column if not exists revision_label text not null default '';
alter table public.quotation_items add column if not exists calc_recipe jsonb;

create table if not exists public.quotation_revisions (
  id bigserial primary key,
  quotation_id bigint not null references public.quotations(id) on delete cascade,
  revision_no int not null default 0,          -- เลข rev ของ "ฉบับที่ถูกเก็บ" (ก่อนแก้)
  label text not null default '',              -- ป้าย Rev ของฉบับนั้น
  snapshot jsonb not null,                     -- ใบเต็ม + รายการ + สูตร ณ เวลานั้น
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_qrev_quotation on public.quotation_revisions(quotation_id);

alter table public.quotation_revisions enable row level security;
create policy qrev_read  on public.quotation_revisions for select using (public.is_active());
create policy qrev_write on public.quotation_revisions for all
  using (public.has_role('ADMIN','SALES','ACCOUNTING'))
  with check (public.has_role('ADMIN','SALES','ACCOUNTING'));

-- ③ replace รายการใบเสนอแบบ atomic (บัญชีสั่ง) — delete+insert ใน transaction เดียว
--    กันเคส insert ล้มหลัง delete สำเร็จ → หัวใบมียอดแต่ไม่มีรายการ (ยอดพัง)
create or replace function public.replace_quotation_items(p_q_id bigint, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- guard สิทธิ์ในตัวฟังก์ชัน (บัญชีสั่ง): security definer ข้าม RLS → ต้องเช็คเองว่า caller เขียนได้
  -- ไม่งั้น role ใดก็ได้ (DESIGNER/VIEWER ฯลฯ) เรียก RPC ตรงผ่าน PostgREST ทับรายการใบไหนก็ได้
  if not public.can_write() then
    raise exception 'forbidden: ต้องมีสิทธิ์เขียนใบเสนอราคา (ADMIN/SALES/ACCOUNTING)';
  end if;
  delete from public.quotation_items where quotation_id = p_q_id;
  insert into public.quotation_items
    (quotation_id, name, detail, qty, unit_price, line_total, sort_order, category, product_id, group_label, calc_recipe)
  select
    p_q_id,
    coalesce(it->>'name', ''),
    coalesce(it->>'detail', ''),
    coalesce((it->>'qty')::numeric, 0),
    coalesce((it->>'unit_price')::numeric, 0),
    coalesce((it->>'line_total')::numeric, 0),
    coalesce((it->>'sort_order')::int, 0),
    coalesce(it->>'category', ''),
    coalesce(it->>'product_id', ''),
    coalesce(it->>'group_label', ''),   -- หัวข้อชุด (0076) — ต้องรอดตอนแก้ผ่านเครื่องคิด (QA HIGH-3)
    it->'calc_recipe'
  from jsonb_array_elements(p_items) as it;
end;
$$;
revoke all on function public.replace_quotation_items(bigint, jsonb) from public;
grant execute on function public.replace_quotation_items(bigint, jsonb) to authenticated;
