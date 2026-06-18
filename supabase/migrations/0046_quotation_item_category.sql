-- ============================================================
-- 0046 · เพิ่มหมวดสินค้าใน quotation_items → ทำสถิติ "สินค้าขายดี"
--   category   = หมวดจาก calculator PRODUCTS[].cat (บานเลื่อน/บานเปิด/หลังคา/มุ้ง/...)
--   product_id = id ของ ProductDef (เช่น sliding_sms) สำหรับสถิติละเอียด
-- ของเดิม (ใบเบา/ทำมือ/import) = '' (ว่าง) → ไม่นับในสถิติจนกว่าจะ backfill
-- ============================================================
alter table public.quotation_items
  add column if not exists category   text not null default '',
  add column if not exists product_id text not null default '';

create index if not exists quotation_items_category_idx
  on public.quotation_items (category) where category <> '';

-- รีโหลด schema cache (กัน PostgREST ไม่เห็นคอลัมน์ใหม่ → insert พังเงียบ)
notify pgrst, 'reload schema';
