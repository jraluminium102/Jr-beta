-- ============================================================
-- JR Beta — 0016 Designer board: สถานะงานเขียนแบบ + due date + นับรอบแก้
-- เพิ่ม field/enum/RPC ใหม่บน jobs · ไม่แตะ flow เดิม · idempotent · รันหลัง 0015
-- ============================================================

-- ---------- enum สถานะงานเขียนแบบ ----------
do $$ begin
  create type design_state_t as enum ('NOT_STARTED','DRAWING','PENDING_CUSTOMER','REVISING','DONE');
exception when duplicate_object then null; end $$;

-- ---------- field ใหม่บน jobs ----------
alter table public.jobs add column if not exists design_due_date    date;
alter table public.jobs add column if not exists design_state       design_state_t not null default 'NOT_STARTED';
alter table public.jobs add column if not exists design_revise_count smallint not null default 0;

-- ---------- index (เฉพาะงานที่ยังไม่เสร็จ + ตามผู้ออกแบบ) ----------
create index if not exists jobs_design_state_idx on public.jobs(design_state) where design_state <> 'DONE';
create index if not exists jobs_designer_idx     on public.jobs(designer_id);

-- ---------- backfill: เดา design_state จาก current_stage (เฉพาะ row ที่ยัง NOT_STARTED) ----------
update public.jobs
  set design_state = case
      when current_stage >= 8            then 'DONE'
      when current_stage between 3 and 7 then 'DRAWING'
      else 'NOT_STARTED' end
  where design_state = 'NOT_STARTED' and status <> 'CANCELLED';

-- ---------- RPC set_design_state: เปลี่ยนสถานะ + นับรอบแก้ + ปิด design_end ----------
create or replace function public.set_design_state(p_job uuid, p_state design_state_t, p_note text default '')
returns design_state_t language plpgsql security definer set search_path = public as $$
declare cur design_state_t;
begin
  if not (public.has_role('ADMIN') or public.has_role('DESIGNER')) then
    raise exception 'forbidden: ต้องเป็น ADMIN หรือ DESIGNER';
  end if;

  select design_state into cur from public.jobs where id = p_job for update;
  if cur is null then raise exception 'ไม่พบงาน %', p_job; end if;

  -- เข้าสู่ REVISING รอบใหม่ (ต่างจากเดิม) -> นับรอบแก้ +1
  if p_state = 'REVISING' and cur is distinct from 'REVISING' then
    update public.jobs set design_revise_count = design_revise_count + 1 where id = p_job;
  end if;

  -- ปิดงานเขียนแบบ -> stamp design_end ถ้ายังไม่มี
  if p_state = 'DONE' then
    update public.jobs set design_end = coalesce(design_end, current_date) where id = p_job;
  end if;

  update public.jobs set design_state = p_state where id = p_job;
  return p_state;
end $$;

grant execute on function public.set_design_state(uuid, design_state_t, text) to authenticated, service_role;
