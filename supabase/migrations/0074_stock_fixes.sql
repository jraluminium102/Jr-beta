-- ============================================================
-- 0074 · แก้บั๊ก/ช่องโหว่สโตร์ (ตามผล QA + บัญชี)
--   (1) กันสต๊อกติดลบ (CHECK qty_on_hand >= 0)
--   (2) สิทธิ์แก้ราคา = ADMIN/ACCOUNTING เท่านั้น (RLS stock_prices ให้ตรง business rule)
--   (3) storage bucket 'stock' เขียนได้เฉพาะ role ที่บันทึกวัสดุได้ (กัน VIEWER อัปโหลด)
--   (4) trigger ราคา: ราคา "อนาคต" (effective_date > วันนี้) ไม่ sync ต้นทุนทันที
-- idempotent · เจ้าของรัน
-- ============================================================

-- (1) กันสต๊อกติดลบ (adjust/เบิกเกิน) — กันทุกทางที่ DB
do $$ begin
  alter table public.stock_items add constraint stock_items_qty_nonneg check (qty_on_hand >= 0);
exception when duplicate_object then null; end $$;

-- (2) แก้ราคา = บัญชี/แอดมิน เท่านั้น (เดิม RLS กว้างเกิน — SALES/PRODUCTION เขียนราคาตรงผ่าน client ได้)
drop policy if exists stock_price_write on public.stock_prices;
create policy stock_price_write on public.stock_prices for all
  using      (public.has_role('ADMIN','ACCOUNTING'))
  with check (public.has_role('ADMIN','ACCOUNTING'));

-- (3) storage bucket 'stock' — เขียนเฉพาะ role ที่บันทึกวัสดุได้ (กัน VIEWER/DESIGNER/INSTALLER สแปมไฟล์)
drop policy if exists "stock bucket write" on storage.objects;
create policy "stock bucket write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'stock'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('ADMIN','PRODUCTION','SALES','ACCOUNTING')
    )
  );

-- (4) trigger ราคา: sync ต้นทุนล่าสุด "เฉพาะราคาที่มีผลถึงวันนี้" (ราคาอนาคตไม่ทับต้นทุนปัจจุบัน)
create or replace function public.apply_stock_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare latest date;
begin
  -- ราคาล่าสุดในบรรดาที่ "มีผลถึงวันนี้" (รวมแถวที่เพิ่ง insert ถ้าไม่ใช่อนาคต)
  select max(effective_date) into latest
    from public.stock_prices
    where stock_item_id = new.stock_item_id and effective_date <= current_date;
  if new.effective_date <= current_date and (latest is null or new.effective_date >= latest) then
    update public.stock_items
      set unit_cost = new.unit_cost,
          price_per_kg = coalesce(new.price_per_kg, price_per_kg)
      where id = new.stock_item_id;
  end if;
  return new;
end $$;
