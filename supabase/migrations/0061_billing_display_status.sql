-- 0061: ช่อง display_status ของใบวางบิล — override "ป้ายสถานะ" ที่โชว์บนเอกสาร
--   null = ใช้สถานะอัตโนมัติจากการชำระ (unpaid/partial/paid/cancelled) เหมือนเดิม
--   ตั้งค่าได้เฉพาะ unpaid/partial/paid (ยกเลิกต้องผ่าน void เท่านั้น)
-- ⚠ เป็นแค่ป้ายที่แสดงผล — ไม่กระทบการคำนวณยอด/งวด/VAT/finance_entries
alter table public.billing_notes
  add column if not exists display_status text;

comment on column public.billing_notes.display_status is
  'override ป้ายสถานะบนเอกสาร (null = อัตโนมัติจากการชำระ) — ไม่กระทบการคำนวณเงิน';

notify pgrst, 'reload schema';
