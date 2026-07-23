-- 0109_store_stock_rls — ให้ role STORE เขียนสต็อกได้ (categories/items/moves) แต่ "ห้ามยุ่งราคา"
-- ⚠ ต้องรันหลัง 0108 (ค่า enum 'STORE' commit แล้ว) · stock_prices เขียน = คงเดิม ไม่รวม STORE
drop policy if exists stock_cat_write on public.stock_categories;
create policy stock_cat_write on public.stock_categories for all
  using      (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'));

drop policy if exists "write stock_items" on public.stock_items;
create policy "write stock_items" on public.stock_items for all to authenticated
  using      (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'));

drop policy if exists "write stock_moves" on public.stock_moves;
create policy "write stock_moves" on public.stock_moves for all to authenticated
  using      (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'));
