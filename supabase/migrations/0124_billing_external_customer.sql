-- ============================================================
-- 0124_billing_external_customer.sql  (idempotent)
-- ใบวางบิล "ลูกค้านอกระบบ" — ออกบิลได้ก่อนมีใบเสนอราคา/งานในระบบ
--   เจ้าของสั่ง 7 ส.ค.69: บางเคสต้องวางบิลก่อน (ลูกค้าเร่ง/งานเล็ก) ค่อยออกใบเสนอทีหลัง
--   แล้วดึงบิลใบนั้นเข้าระบบ = ผูกกับใบเสนอ/งานย้อนหลัง (เงินจะไหลเข้าบัญชี/ค้างรับตามงาน)
--
-- โมเดล: ใช้ตาราง billing_notes เดิม (quotation_id/job_id = null ตอนสร้าง)
--   is_external = ธงว่า "ยังไม่ผูกระบบ" → หน้า list/detail ขึ้นป้าย + โชว์ปุ่มผูก
--   ผูกแล้ว → set quotation_id/job_id + is_external=false + linked_at (ไว้ตามรอย)
-- ============================================================

alter table public.billing_notes
  add column if not exists is_external boolean not null default false,
  add column if not exists linked_at   timestamptz,
  add column if not exists linked_by   uuid references auth.users(id);

-- ใช้หา "บิลนอกระบบที่ยังไม่ผูก" ตอนเปิดหน้ารายการ (partial index — แถวส่วนใหญ่เป็น false)
create index if not exists billing_notes_external_idx
  on public.billing_notes (created_at desc)
  where is_external = true;

comment on column public.billing_notes.is_external is
  'true = ใบวางบิลลูกค้านอกระบบ ยังไม่ผูกใบเสนอ/งาน (ออกก่อน ผูกทีหลัง) · ผูกแล้วกลับเป็น false';
comment on column public.billing_notes.linked_at is
  'เวลาที่ดึงบิลนอกระบบเข้าระบบ (ผูกใบเสนอ/งาน) — null = ยังไม่เคยผูก';
