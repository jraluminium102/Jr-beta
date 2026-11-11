-- ============================================================
-- 0173 · คิวที่ไม่ใช่ประเมินหน้างาน (เคลียร์แบบ/โชว์รูม/วัดจริง/อื่น ๆ) เลยวันแล้ว → ปิด DONE ให้เอง
--   เจ้าของสั่ง 11 พ.ย.69: "ติดให้กดเสร็จเต็มเลย เกะกะ · ตั้งให้เสร็จเองเหมือนประเมิน แค่ไม่ต้องเข้าแบบ"
--   ต่างจากประเมิน (0047/0066): ไม่สร้างงาน ไม่ promote ไม่ดันงานเดิมเข้าเขียนแบบ (เคลียร์แบบกดมือถึงจะ REVISING) — แค่ status = DONE
--   รันไฟล์นี้ = ปิดของค้างทั้งหมดทันที + ตั้ง pg_cron รันทุกวัน 09:03 ไทย (หลัง auto-complete-assess 09:00)
-- ============================================================
create or replace function public.auto_complete_overdue_other()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cutoff date := date '2026-06-18';   -- เท่ากับ 0047: ไม่ยุ่งของเก่า/import ก่อนเริ่มใช้ระบบจริง
  cnt      int := 0;
begin
  update public.queue_entries
     set status = 'DONE'
   where status in ('PENDING','PROPOSED','CONFIRMED')
     and queue_date is not null
     and queue_date >= v_cutoff
     and queue_date < current_date                                   -- เลยวันนัดแล้ว (วันนัดผ่านไปก่อน)
     and coalesce(job_type,'') not in ('', 'ประเมินหน้างาน', 'ประเมิน')  -- ประเมินเป็นของ auto_complete_overdue_assess
     and coalesce(job_type,'') not like '%ประเมิน%';
  get diagnostics cnt = row_count;
  return cnt;
end $$;
revoke all on function public.auto_complete_overdue_other() from public;
grant execute on function public.auto_complete_overdue_other() to service_role;

-- ปิดของค้างตอนนี้เลย
select public.auto_complete_overdue_other() as closed_now;

-- pg_cron รายวัน 02:03 UTC = 09:03 ไทย
create extension if not exists pg_cron;
select cron.unschedule('auto-complete-other')
  where exists (select 1 from cron.job where jobname = 'auto-complete-other');
select cron.schedule('auto-complete-other', '3 2 * * *',
  $$ select public.auto_complete_overdue_other(); $$);
