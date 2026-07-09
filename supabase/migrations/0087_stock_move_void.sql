-- 0087: แก้/ยกเลิก รายการเคลื่อนไหวสต็อก (stock_moves) แบบปลอดภัย
-- trigger สต็อกเป็น INSERT-only → แก้/ลบตรงๆ ยอดไม่ย้อน · วิธีปลอดภัย = soft void + recompute ยอด/ต้นทุนใหม่จาก moves ที่ยัง active
alter table stock_moves
  add column if not exists is_voided boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text,
  add column if not exists edited_at timestamptz;

create index if not exists idx_sm_item_active on stock_moves(stock_item_id) where is_voided = false;
