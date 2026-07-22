-- 0105: ส่วนลดหลายรายการในใบเสนอราคา (multi-discount)
-- เดิม: discount_pct/discount_amt/discount_label (0092) = ส่วนลดเดียว
-- ใหม่: discounts jsonb = [{label, pct, amt}] หลายข้อ (แต่ละข้อกรอก % หรือ บาท เหมือนเดิม)
--   ⚠ discount_amt (คอลัมน์เดิม) ยังเป็น "ยอดรวมส่วนลดทั้งหมด (บาท)" = ตัวตั้งจริงป้อน computeTotals
--      → billing/VAT/WHT/verify ไม่กระทบ (money core รับ discount_amt เดียวเหมือนเดิม)
--   discounts = display/breakdown เท่านั้น (โชว์แยกข้อบนเอกสาร) · ว่าง/[] = ใช้ discount เดี่ยวเดิม (backward compat)
-- idempotent
alter table public.quotations
  add column if not exists discounts jsonb not null default '[]'::jsonb;

-- กัน PostgREST schema cache ค้าง (ให้ API เห็นคอลัมน์ใหม่ทันที)
notify pgrst, 'reload schema';
