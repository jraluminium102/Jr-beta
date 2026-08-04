-- 0115: แท็กประเภทเอกสาร "ค่าประเมินหน้างาน" (standalone — ไม่ผูกใบเสนอราคา)
--   บริบท: เจ้าของ+accountant เคาะ (แนว A) ให้ออกใบวางบิล/ใบเสร็จค่าประเมินผ่านตาราง billing_notes/receipts เดิม
--   (quotation_id/billing_note_id = null) — ใช้เลขเอกสารชุดเดียวกับปกติ (BL/INV) ไม่แยกชุด
--   doc_kind = ป้ายกำกับกันปนสถิติภายหลัง (เช่น รายงานยอดขายงาน ไม่อยากรวมค่าประเมิน) — default 'work' = เอกสารงานปกติเดิมทั้งหมด
-- optional · โค้ด API insert แบบ non-fatal fallback อยู่แล้ว (ยังไม่รัน migration นี้ก็ออกเอกสารได้ปกติ แค่ไม่มี doc_kind)
alter table public.billing_notes add column if not exists doc_kind text not null default 'work';
alter table public.receipts add column if not exists doc_kind text not null default 'work';

comment on column public.billing_notes.doc_kind is 'ประเภทเอกสาร: work = งานปกติ (ผูก/ไม่ผูกใบเสนอ) · assess = ค่าประเมินหน้างาน (standalone)';
comment on column public.receipts.doc_kind is 'ประเภทเอกสาร: work = งานปกติ · assess = ค่าประเมินหน้างาน (standalone)';

-- index ช่วยกรองรายงาน/สถิติแยกประเภทภายหลัง (ตารางไม่ใหญ่มาก แต่กันสแกนเต็มตารางเมื่อข้อมูลโต)
create index if not exists idx_billing_notes_doc_kind on public.billing_notes (doc_kind);
create index if not exists idx_receipts_doc_kind on public.receipts (doc_kind);

-- ให้ PostgREST เห็น column ใหม่ทันที
notify pgrst, 'reload schema';
