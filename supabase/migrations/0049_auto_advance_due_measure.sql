-- ============================================================
-- 0049 · Auto-advance "รอวัดจริง" → "เตรียมประชุมแก้แบบ" เมื่อถึงวันวัด
--   production PENDING_MEASURE + measure_scheduled (= รอวัดจริง) ที่เลยวันนัดวัดแล้ว
--   → status = PENDING_MEETING (กลุ่มเตรียม/ประชุม/แก้แบบ) เหมือนกดวัดเสร็จมือ
--   measure_actual = วันนัด (ถือว่าวัดตามนัด) ถ้ายังไม่มี
--   trigger tg_production_changes (0036) จะเลื่อน current_stage → 11 ให้เอง
--   เฉพาะนัด >= cutoff (ไม่ปลุกงานค้างเก่าที่ไม่ได้วัดจริง) · ถ้าวัดเสร็จมือแล้วจะไม่ใช่ PENDING_MEASURE → ไม่โดน
-- รันด้วย pg_cron วันละครั้ง 02:05 UTC = 09:05 ไทย (หลัง auto-complete คิว)
-- ============================================================

create or replace function public.auto_advance_due_measure()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cutoff date := date '2026-06-18';  -- เฉพาะนัดวัดตั้งแต่วันนี้ไป
  cnt int := 0;
begin
  with due as (
    update public.productions p
    set status = 'PENDING_MEETING',
        measure_actual = coalesce(p.measure_actual, p.measure_scheduled)
    where p.status = 'PENDING_MEASURE'
      and p.measure_scheduled is not null
      and p.measure_scheduled <  current_date   -- เลยวันนัดวัดแล้ว (ให้วันวัดผ่านไปก่อน)
      and p.measure_scheduled >= v_cutoff
    returning 1
  )
  select count(*) into cnt from due;
  return cnt;
end $$;

revoke all on function public.auto_advance_due_measure() from public;
grant execute on function public.auto_advance_due_measure() to service_role;

-- ตั้ง pg_cron (extension เปิดแล้วจาก 0047)
select cron.unschedule('auto-advance-measure')
  where exists (select 1 from cron.job where jobname = 'auto-advance-measure');
select cron.schedule('auto-advance-measure', '5 2 * * *',
  $$ select public.auto_advance_due_measure(); $$);
