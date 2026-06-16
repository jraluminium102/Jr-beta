-- ============================================================
-- JR OMS — 0043 ช่องทางติดต่อลูกค้าในคิว: Line / FB
--
-- เดิม queue_entries มี line_contact (text) สมมติเป็น Line เสมอ
-- เพิ่ม contact_channel — เลือกได้ว่าช่องทางคือ LINE หรือ FB (default LINE)
-- (line_contact เก็บ handle/ชื่อเหมือนเดิม · contact_channel บอกว่าเป็นช่องไหน)
-- idempotent · รันก่อน deploy โค้ดที่ select/อัปเดตคอลัมน์นี้
-- ============================================================

alter table public.queue_entries
  add column if not exists contact_channel text not null default 'LINE';

-- กันค่าแปลก (เฉพาะ LINE/FB) — ใช้ NOT VALID กันพังถ้ามีข้อมูลเดิม แล้ว validate
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'queue_entries_contact_channel_chk'
  ) then
    alter table public.queue_entries
      add constraint queue_entries_contact_channel_chk
      check (contact_channel in ('LINE','FB')) not valid;
    alter table public.queue_entries validate constraint queue_entries_contact_channel_chk;
  end if;
end $$;

comment on column public.queue_entries.contact_channel is 'ช่องทางติดต่อลูกค้า: LINE | FB (0043)';
