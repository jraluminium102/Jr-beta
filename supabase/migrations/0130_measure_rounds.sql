-- ============================================================
-- 0130 · วัดซ้ำ (re-measure) — เก็บประวัติรอบวัดก่อนเคลียร์ไปวัดรอบใหม่
--   เจ้าของเคาะ 1 ก.ย.2569:
--     1) วัดซ้ำได้ทุกเฟสก่อนติดตั้ง (รวม QUEUED/MANUFACTURING/QC)
--     2) วัดซ้ำ "ไม่ถอย" jobs.current_stage ที่ลูกค้าเห็น — ใช้ป้ายภายใน "วัดรอบ N" แทน
--   flow: กด "วัดซ้ำ" ที่ ProductionStepModal → snapshot รอบปัจจุบันลง measure_rounds
--         → เคลียร์ measure_scheduled/actual/... บน productions → measure_round_no += 1
--         → status กลับ PENDING_MEASURE (โผล่หน้านัดวัดจริงเอง — query เดิมครอบอยู่แล้ว)
--   idempotent · รันได้ซ้ำปลอดภัย
-- ============================================================

create table if not exists public.measure_rounds (
  id            bigint generated always as identity primary key,
  production_id uuid not null references public.productions(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  round_no      int  not null,                 -- รอบที่ปิดไป (snapshot ของรอบนั้น)
  scheduled     date,                            -- measure_scheduled ของรอบนั้น
  sched_time    text,                            -- measure_time ของรอบนั้น
  measurer_name text,                            -- measurer_name (คนนัด) ของรอบนั้น
  measured      date,                            -- measure_actual ของรอบนั้น
  measured_time text,                            -- measure_actual_time ของรอบนั้น
  measured_by   text,                            -- measured_by_name ของรอบนั้น
  reason        text not null default '',        -- เหตุผลที่ต้องวัดซ้ำ
  scope_note    text not null default '',        -- ขอบเขตที่ต้องวัดใหม่ (ไม่บังคับ) เช่น "เฉพาะห้องนอน"
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists measure_rounds_production_job_idx
  on public.measure_rounds (production_id, job_id);

alter table public.productions
  add column if not exists measure_round_no int not null default 1;

-- RLS — mirror productions (0003): อ่าน = active user ทุกคน · เขียน = ADMIN/PRODUCTION (ออฟฟิศ/ผลิต)
alter table public.measure_rounds enable row level security;
drop policy if exists measure_rounds_read on public.measure_rounds;
create policy measure_rounds_read on public.measure_rounds for select
  using (public.is_active());
drop policy if exists measure_rounds_write on public.measure_rounds;
create policy measure_rounds_write on public.measure_rounds for all
  using (public.has_role('ADMIN','PRODUCTION')) with check (public.has_role('ADMIN','PRODUCTION'));

notify pgrst, 'reload schema';
