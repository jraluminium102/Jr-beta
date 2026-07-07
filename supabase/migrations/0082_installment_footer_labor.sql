-- 0082: ตั้ง footer ต่องวด (โชว์แตกยอด) — เก็บ "% ค่าแรง" ของแต่ละงวด
-- ยอดงวด (amount) คงเดิม ไม่เปลี่ยน · footer เป็นแค่การ "อธิบายยอด" ตอนพิมพ์งวดนั้น
-- footer_labor_pct: null = ไม่แยก (โชว์แค่ยอดก่อน VAT/VAT) · 0 = ค่าของล้วน · 100 = ค่าแรงล้วน · 40 = แยก 40/60
-- ตั้งต่องวดได้อิสระ (งวด 1 = ค่าของ, งวด 2 = ค่าแรง ฯลฯ) — display-only ไม่กระทบบัญชี/ยอดรวม

alter table public.billing_installments
  add column if not exists footer_labor_pct numeric(5,2);
