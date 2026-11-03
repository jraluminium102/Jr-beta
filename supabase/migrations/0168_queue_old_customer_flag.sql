-- ============================================================
-- 0168 · คิวประเมิน: ติ๊ก "ลูกค้าเก่า (ไม่มีในระบบ)" — เจ้าของสั่ง 3 พ.ย.69
--   ลูกค้าเก่าบางคนไม่มีชื่อในทะเบียน (งานเก่าก่อนมีระบบ) เลือกผูกไม่ได้ → แค่รีมาร์คให้คนทำใบเสนอ/เช็คลิสต์/แบบรู้
--   แท็ก "ลูกค้าเก่า" = old_customer หรือ target_customer_id/target_job_id (ลูกค้าเก่าที่มีในระบบ) — ดู isOldCustomer() ใน src/lib/queue.ts
-- ============================================================
alter table public.queue_entries
  add column if not exists old_customer boolean not null default false;
comment on column public.queue_entries.old_customer is 'ลูกค้าเก่าที่ไม่มีในระบบ (รีมาร์คอย่างเดียว ไม่ผูกทะเบียน) 0168';

notify pgrst, 'reload schema';
