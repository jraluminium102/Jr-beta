-- ============================================================
-- 0146 · ส่วนลดในใบเสนอราคางานพื้น
--   floor_quotations.total = ผลบวก line_total (ยอดก่อนส่วนลด) · discount = ส่วนลดเป็นบาท
--   ยอดสุทธิ (net) = total - discount (คิดตอนแสดง · ไม่มี VAT ตามฟอร์มช่าง)
-- idempotent · เจ้าของรัน
-- ============================================================

alter table public.floor_quotations
  add column if not exists discount numeric(14,2) not null default 0;

comment on column public.floor_quotations.discount is 'ส่วนลดเป็นบาท · ยอดสุทธิ = total - discount (ฟอร์มงานพื้น ไม่มี VAT)';
