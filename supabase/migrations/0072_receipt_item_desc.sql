-- ============================================================
-- 0072 · ใบเสร็จ: เพิ่มช่อง "รายการ" ที่แก้ข้อความได้ (item_desc)
--   เดิมรายการบนใบเสร็จ = label ของงวด (แก้ไม่ได้)
--   ใหม่: item_desc ถ้าใส่ → ใช้แทน · ไม่ใส่ → fallback label งวดเดิม
--   (note + payment_method มีอยู่แล้วใน 0008)
-- idempotent · เจ้าของรัน
-- ============================================================
alter table public.receipts add column if not exists item_desc text not null default '';
