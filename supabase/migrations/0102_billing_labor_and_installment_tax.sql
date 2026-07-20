-- ============================================================
-- 0102 · หัก ณ ที่จ่ายเฉพาะ "ค่าแรง" + ภาษี booked ต่องวด (เจ้าของเคาะ 17 ก.ค.69)
--   - billing_notes.labor_amt = ค่าแรงก่อน VAT (บาท) → ฐานคิด WHT 3%
--   - billing_installments เก็บ base/vat/wht ต่องวด (booked จริง ไม่ใช่ display-only)
--     → ใบเสร็จอ่านภาษีของ "งวด" ตรง ๆ (แก้บั๊กที่บัญชีตั้งธง: เดิมอ่าน vat ของ "ใบ")
--   idempotent · legacy: คอลัมน์ nullable/default 0 → ใบเก่าไม่กระทบ (receipts เข้า path เดิม)
-- ============================================================

alter table public.billing_notes
  add column if not exists labor_amt numeric(14,2);
comment on column public.billing_notes.labor_amt is
  'ค่าแรงก่อน VAT (บาท) authoritative · ฐานคิดหัก ณ ที่จ่าย 3% · null = ไม่ระบุค่าแรง (legacy: หักทั้งบิล/ไม่หัก)';

alter table public.billing_installments
  add column if not exists base_amt numeric(14,2),                        -- ฐานก่อน VAT ของงวด (null = งวดเก่า → receipts ใช้ path เดิม)
  add column if not exists vat_amt  numeric(14,2) not null default 0,     -- VAT ของงวด (booked)
  add column if not exists wht_amt  numeric(14,2) not null default 0,     -- หัก ณ ที่จ่ายของงวด (booked · อยู่งวดค่าแรง)
  add column if not exists vat_rate numeric(5,2)  not null default 0,     -- อัตรา VAT ของงวด
  add column if not exists wht_rate numeric(5,2)  not null default 0,     -- อัตราหัก ณ ที่จ่ายของงวด
  add column if not exists kind     text;                                 -- 'material' | 'labor' | null(legacy)

notify pgrst, 'reload schema';
