-- ============================================================
-- 0068 · "รอวัดจริง" เด้งสเตจถัดไป (เตรียม/ประชุม/แก้แบบ) "ในวันที่วัดเลย" + ดันตกค้าง
--
-- เดิม (0049): cron เด้งเฉพาะเมื่อ measure_scheduled < current_date (= วันถัดไป)
-- ผู้ใช้อยากให้เด้ง "ในวันที่วัด" → เปลี่ยนเป็น <= current_date
--   production PENDING_MEASURE + ลงคิววัดแล้ว (measure_scheduled) ถึง/เลยวันนัด
--   → PENDING_MEETING + measure_actual = วันนัด (ถ้ายังไม่มี) · trigger เลื่อน stage ให้เอง
-- + รัน backfill ทันที (ดันงานตกค้างที่ยังค้าง PENDING_MEASURE ทั้งที่เลยวันวัด)
-- idempotent · เจ้าของรัน
-- ============================================================

create or replace function public.auto_advance_due_measure()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cutoff date := date '2026-06-18';  -- เฉพาะนัดวัดตั้งแต่วันเปิดใช้ (ไม่ปลุกงานเก่า/import ที่ไม่ได้วัดจริง)
  cnt int := 0;
begin
  with due as (
    update public.productions p
    set status = 'PENDING_MEETING',
        measure_actual = coalesce(p.measure_actual, p.measure_scheduled)
    where p.status = 'PENDING_MEASURE'
      and p.measure_scheduled is not null
      and p.measure_scheduled <= current_date   -- เด้งในวันที่วัดเลย (เดิมเป็น <)
      and p.measure_scheduled >= v_cutoff
    returning 1
  )
  select count(*) into cnt from due;
  return cnt;
end $$;

revoke all on function public.auto_advance_due_measure() from public;
grant execute on function public.auto_advance_due_measure() to service_role;

-- cron เดิม (auto-advance-measure 09:05 ไทย) เรียกฟังก์ชันนี้อยู่แล้ว — ไม่ต้องตั้งใหม่

-- ── backfill ทันที: ดันงานตกค้างที่เลยวันวัดแล้วยังค้าง รอวัดจริง ──
select public.auto_advance_due_measure();
