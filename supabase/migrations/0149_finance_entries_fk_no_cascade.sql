-- 0149 — finance_entries.job_id: เปลี่ยน FK จาก on delete cascade → NO ACTION
-- เหตุผล: ปุ่ม "ลบงานทิ้ง" (jobs DELETE) จะทำให้งานที่มี finance_entries ถูก cascade ลบเงินทิ้งเงียบ ๆ
--   (QA จับ 11 ก.ย.69: เดิม 0001:151 = on delete cascade → เงินหายถาวรใต้ race condition)
-- แก้เป็น NO ACTION = ให้ DB "ปฏิเสธการลบงาน" ถ้ายังมีแถวเงินผูกอยู่ (fail-safe ชั้นฐานข้อมูลจริง)
--   ตรงกับ quotations/billing_notes/boq/stock_moves ที่เป็น NO ACTION อยู่แล้ว
-- ไม่มี flow ไหน hard-delete jobs มาก่อน (ปุ่มลบเป็นของใหม่) → เปลี่ยน FK นี้ปลอดภัย ไม่กระทบของเดิม
-- การถอยมัดจำ/ยกเลิก = void ไม่ลบ finance_entries อยู่แล้ว (ไม่พึ่ง cascade)

do $$
declare cn text;
begin
  select conname into cn
  from pg_constraint
  where conrelid = 'public.finance_entries'::regclass
    and confrelid = 'public.jobs'::regclass
    and contype = 'f'
  limit 1;

  if cn is not null then
    execute format('alter table public.finance_entries drop constraint %I', cn);
  end if;

  alter table public.finance_entries
    add constraint finance_entries_job_id_fkey
    foreign key (job_id) references public.jobs(id);   -- NO ACTION (ไม่ cascade) = กันลบงานที่มีเงิน
end $$;
