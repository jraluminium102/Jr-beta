-- ============================================================
-- 0064 · แก้ต้นตอ: คิวประเมินที่ "มี job_id แล้วแต่ status ค้าง CONFIRMED"
--   ของเดิม (0047) กรอง job_id IS NULL → ข้ามคิว desync ถาวร (ไม่เด้งไป DONE)
--   แก้: reconcile — คิวประเมินเลยวันที่ยังไม่ DONE ทุกใบ → สร้างงานถ้ายังไม่มี
--        (_promote_queue_core idempotent) + ปั๊ม status='DONE' ให้ตรง
--   cron เดิม (auto-complete-assess 09:00 ไทย) เรียกฟังก์ชันนี้ — ไม่ต้องตั้งใหม่
-- idempotent · เจ้าของรัน
-- ============================================================
create or replace function public.auto_complete_overdue_assess()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cutoff date := date '2026-06-18';   -- เฉพาะคิวตั้งแต่วันเปิดใช้ (ไม่ยุ่งของเก่า/import)
  r        record;
  cnt      int := 0;
begin
  for r in
    select id, job_id from public.queue_entries
    where status in ('PENDING','PROPOSED','CONFIRMED')   -- ยังไม่ DONE/ยกเลิก
      and queue_date is not null
      and queue_date <  current_date                     -- เลยวันมาแล้ว
      and queue_date >= v_cutoff
      and coalesce(job_type,'') in ('', 'ประเมินหน้างาน', 'ประเมิน')  -- เฉพาะประเมิน
  loop
    begin
      if r.job_id is null then
        perform public._promote_queue_core(r.id);        -- สร้างงานเข้าฝ่ายแบบ (ถ้ายังไม่มี)
      end if;
      update public.queue_entries set status = 'DONE' where id = r.id;  -- ปั๊ม DONE ให้ตรง (กัน desync ค้าง)
      cnt := cnt + 1;
    exception when others then
      raise warning 'auto_complete skip queue %: %', r.id, sqlerrm;
    end;
  end loop;
  return cnt;
end $$;
revoke all on function public.auto_complete_overdue_assess() from public;
grant execute on function public.auto_complete_overdue_assess() to service_role;
