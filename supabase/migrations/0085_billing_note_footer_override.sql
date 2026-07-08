-- 0085: footer ใบวางบิลเต็ม (รวมทุกงวด) แก้ได้แบบ display-only บนหน้า PDF
-- ใช้เมื่อปุ่ม "แก้ VAT/ส่วนลด" ถูกซ่อน (จ่ายบางงวดแล้ว → re-split งวดไม่ได้) แต่ยังอยากปรับ footer บนใบ
-- display-only: ไม่กระทบ total/net/งวด · null = ใช้ค่าจริงจากคอลัมน์ subtotal/discount_amt/vat_amt/wht_amt
alter table billing_notes
  add column if not exists footer_override jsonb;

comment on column billing_notes.footer_override is
  'override footer ใบเต็ม {subtotal,discount,vat,wht} — null = ใช้ค่าจริงจากคอลัมน์ (display-only ไม่กระทบยอด/งวด)';
