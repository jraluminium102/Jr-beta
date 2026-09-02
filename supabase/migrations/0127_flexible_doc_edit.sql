-- 0127 — แก้เอกสารได้ตลอด ไม่ต้องยกเลิกเป็นทอด ๆ (เจ้าของสั่ง 1 ก.ย.69)
--
-- ปัญหาเดิม: จะแก้ใบเสนอราคา ต้องไปยกเลิกใบวางบิลก่อน · จะยกเลิกใบวางบิล ต้อง void ใบเสร็จก่อน
--   งานจริงแก้ราคาบ่อย ระบบเลยบังคับรื้อเอกสารทั้งชุดทุกครั้ง — วุ่นวายจนคนเลี่ยงไปแก้นอกระบบ
--
-- แนวคิดใหม่: เอกสารแต่ละใบเก็บยอดของตัวเองอยู่แล้ว (billing_notes.total · billing_installments.amount
--   · receipts.amount) การแก้ใบเสนอไม่ได้ไปเปลี่ยนยอดใบที่ออกไปแล้วอยู่แล้ว
--   → เลิกบล็อก เปลี่ยนเป็น "ติดป้ายว่าอ้างอิง Rev เก่า" ให้คนตัดสินใจเอง
--
--   source_revision_no = ตอนออกเอกสาร ใบเสนออยู่ Rev ไหน
--   ack_revision_no    = คนดูแล้วกด "รับทราบ" ตอนใบเสนออยู่ Rev ไหน (กันป้ายเตือนค้างตลอด)
--   เก่ากว่าปัจจุบัน = ขึ้นป้ายเตือน "เช็คยอดใหม่" · ระบบไม่แตะยอดให้เอง (เจ้าของเคาะ: เตือนอย่างเดียว)

alter table public.billing_notes
  add column if not exists source_revision_no int,
  add column if not exists ack_revision_no    int;

alter table public.receipts
  add column if not exists source_revision_no int,
  add column if not exists ack_revision_no    int;

comment on column public.billing_notes.source_revision_no is
  'Rev ของใบเสนอราคา ณ ตอนออกใบวางบิล — ถ้าใบเสนอ Rev สูงกว่านี้ = ใบนี้อ้างยอดเก่า';
comment on column public.billing_notes.ack_revision_no is
  'Rev ที่ผู้ใช้กดรับทราบแล้ว — ป้ายเตือนจะหายจนกว่าใบเสนอจะ Rev ใหม่อีก';

-- backfill: ของเดิมถือว่าตรงกับ Rev ปัจจุบัน (ไม่งั้นเปิดมาเจอป้ายเตือนแดงทั้งระบบ)
--   quotations.revision_no มาจาก 0093 — เผื่อยังไม่ได้รัน ใช้ 0
update public.billing_notes b
   set source_revision_no = coalesce(q.revision_no, 0)
  from public.quotations q
 where b.quotation_id = q.id
   and b.source_revision_no is null;

update public.billing_notes
   set source_revision_no = 0
 where source_revision_no is null;

update public.receipts r
   set source_revision_no = coalesce(b.source_revision_no, 0)
  from public.billing_notes b
 where r.billing_note_id = b.id
   and r.source_revision_no is null;

update public.receipts
   set source_revision_no = 0
 where source_revision_no is null;
