-- ============================================================
-- 0104 · ช่องทางชำระเงิน (payment_note) บนใบวางบิล
--   ข้อความ display-only ท้ายใบ (ซ้ายล่าง) · default = เลขบัญชีบริษัท · แก้ต่อใบได้บน PDF
--   null = ใช้ค่า default (DEFAULT_PAYMENT_NOTE ใน src/lib/constants.ts) · เก็บค่า = override เฉพาะใบนั้น
-- idempotent · เจ้าของรัน · ไม่แตะยอด/งวด
-- ============================================================
alter table public.billing_notes
  add column if not exists payment_note text;
