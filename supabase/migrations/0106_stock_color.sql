-- 0106: เพิ่มช่อง "สี" ให้วัสดุสต็อก (แยกจากชื่อ · เดิมสีฝังในชื่อ "รหัส-ชื่อ-สี")
--   optional · โค้ด API เขียน/อ่านแบบ non-fatal อยู่แล้ว (เพิ่มวัสดุไม่พังถ้ายังไม่รัน)
alter table public.stock_items add column if not exists color text not null default '';

-- ให้ PostgREST เห็น column ใหม่ทันที
notify pgrst, 'reload schema';
