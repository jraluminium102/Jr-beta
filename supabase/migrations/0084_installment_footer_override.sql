-- 0084: footer แยกงวด (ใบวางบิลพิมพ์แยกงวด) แก้ทับได้ต่องวด
-- ค่าตั้งต้น = เฉลี่ยตามสัดส่วนงวด (คิดสดตอนพิมพ์) · override = ค่าที่ผู้ใช้แก้เอง (จำไว้) ทับค่าเฉลี่ย
-- รูปแบบ: {"subtotal":<number>,"discount":<number>,"vat":<number>,"wht":<number>} · null = ใช้ค่าเฉลี่ย
alter table billing_installments
  add column if not exists footer_override jsonb;

comment on column billing_installments.footer_override is
  'override footer ใบวางบิลพิมพ์แยกงวด {subtotal,discount,vat,wht} — null = เฉลี่ยตามสัดส่วนงวดอัตโนมัติ (display-only ไม่กระทบยอดงวด/ยอดบิล)';
