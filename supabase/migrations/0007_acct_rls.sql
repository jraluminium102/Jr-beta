-- ============================================================
-- JR ERP บัญชี · Row Level Security (เดิมจาก Quotation 0003)
-- ปรับสำหรับแอพรวม:
--   - ตัด policy บน profiles (ใช้ของ OMS 0003 แล้ว)
--   - can_write() เทียบ role_t: เขียนได้ = ADMIN / SALES / ACCOUNTING
-- ============================================================

alter table public.customers          enable row level security;
alter table public.quotations         enable row level security;
alter table public.quotation_items    enable row level security;
alter table public.document_sequences enable row level security;

-- helper: เขียนเอกสารบัญชีได้ไหม (map จาก sales/admin/owner เดิม → role_t)
create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_active and role in ('ADMIN','SALES','ACCOUNTING')
       from public.profiles where id = auth.uid()),
    false);
$$;

-- ---------- customers ----------
create policy "อ่าน customers (login)" on public.customers
  for select to authenticated using (true);
create policy "เพิ่ม customers" on public.customers
  for insert to authenticated with check (public.can_write());
create policy "แก้ customers" on public.customers
  for update to authenticated using (public.can_write()) with check (public.can_write());

-- ---------- quotations ----------
create policy "อ่าน quotations (login)" on public.quotations
  for select to authenticated using (true);
create policy "เพิ่ม quotations" on public.quotations
  for insert to authenticated with check (public.can_write());
create policy "แก้ quotations" on public.quotations
  for update to authenticated using (public.can_write()) with check (public.can_write());

-- ---------- quotation_items ----------
create policy "อ่าน items (login)" on public.quotation_items
  for select to authenticated using (true);
create policy "จัดการ items" on public.quotation_items
  for all to authenticated using (public.can_write()) with check (public.can_write());

-- document_sequences: ไม่เปิด policy ใด ๆ → เข้าถึงผ่าน function (security definer) เท่านั้น
