-- ============================================================
-- 0010 — RBAC: เพิ่มสิทธิ์ PRODUCTION เขียน stock ได้
-- ตาม permission matrix เป้าหมาย (roadmap-rbac-features.md):
--   สต๊อก: ADMIN=R/W, SALES=R, PRODUCTION=R/W, ACCOUNTING=R
--
-- RLS เดิม (0008_acct_documents.sql) ใช้ can_write() = ADMIN/SALES/ACCOUNTING
-- policy "write stock_items" และ "write stock_moves" ต้องเพิ่ม PRODUCTION
-- ============================================================

-- drop policy เดิมที่ใช้ can_write() กับ stock_items และ stock_moves
drop policy if exists "write stock_items" on public.stock_items;
drop policy if exists "write stock_moves" on public.stock_moves;

-- สร้าง policy ใหม่: เขียน stock = ADMIN / PRODUCTION
-- (BFF layer ยัง block SALES ไม่ให้ write อยู่แล้ว — RLS เป็น defense-in-depth)
create policy "write stock_items" on public.stock_items
  for all to authenticated
  using (public.is_active() and public.auth_role() in ('ADMIN', 'PRODUCTION'))
  with check (public.is_active() and public.auth_role() in ('ADMIN', 'PRODUCTION'));

create policy "write stock_moves" on public.stock_moves
  for all to authenticated
  using (public.is_active() and public.auth_role() in ('ADMIN', 'PRODUCTION'))
  with check (public.is_active() and public.auth_role() in ('ADMIN', 'PRODUCTION'));

-- หมายเหตุ: policy "read stock_items" และ "read stock_moves" (for select using true)
-- ยังคงอยู่ตามเดิมจาก 0008 — ทุก login อ่านได้ (BFF กรองรายละเอียดที่ขาดสิทธิ์แทน)
