-- ============================================================
-- JR Beta — 0036 แก้บั๊ก 2 จุด
--   A) tg_production_changes: sync current_stage ระหว่าง 9-19 (stage ค้างที่ 9)
--   B) set_design_state: design_end อัปเดตทุกครั้งที่ DONE (ไม่ใช่แค่ครั้งแรก)
-- idempotent (create or replace) · รันหลัง 0035
-- ============================================================

-- ============================================================
-- A) แก้ tg_production_changes — เพิ่ม map production.status → current_stage (9-19)
--    คงเนื้อเดิมทุกอย่าง + เพิ่ม sync block
--    sync เฉพาะเมื่อ current_stage ปัจจุบัน < เป้าหมาย (ไม่ถอยหลัง)
--    และงานยังไม่ COMPLETED/CANCELLED
-- ============================================================

create or replace function public.tg_production_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  jcode text;
  target_stage int;
begin
  -- ---- เดิม: stamp status_updated_at ทุกครั้งที่ status เปลี่ยน ----
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;

  -- ---- เดิม: READY → สร้าง installation + เลื่อน stage = 20 ----
  if new.status = 'READY' and (tg_op = 'INSERT' or old.status is distinct from 'READY') then
    insert into public.installations(job_id, status) values (new.job_id, 'PENDING')
      on conflict (job_id) do nothing;
    update public.jobs
    set current_stage = 20
    where id = new.job_id
      and current_stage < 20
      and status not in ('COMPLETED', 'CANCELLED');
  end if;

  -- ---- ใหม่: map production.status → current_stage สำหรับสถานะ 9-19 ----
  -- map: prod_status_t → stage int
  --   PENDING_MEASURE   → 9  (รอวัดจริง)       ← tg_on_deposit ตั้งไว้แล้ว แต่ sync ซ้ำไม่เป็นไร
  --   MEASURED          → 10 (หัวหน้าช่างเข้าวัด)
  --   PENDING_MEETING   → 11 (ประชุมหลังวัด)
  --   REVISING          → 12 (แก้แบบ + ใบเสนอ)
  --   PENDING_CONFIRM   → 13 (คอนเฟิร์มลูกค้า)
  --   QUEUED            → 15 (ลงคิวผลิต)
  --   MANUFACTURING     → 18 (ผลิตงาน)
  --   QC                → 19 (QC โรงงาน)
  --   READY             → 20 — ครอบคลุมข้างบนแล้ว
  --   ISSUE / PENDING_CONFIRM ที่ไม่ตรงกัน → ไม่ทำอะไร
  if (tg_op = 'INSERT' or new.status is distinct from old.status) then
    target_stage := case new.status
      when 'PENDING_MEASURE' then 9
      when 'MEASURED'        then 10
      when 'PENDING_MEETING' then 11
      when 'REVISING'        then 12
      when 'PENDING_CONFIRM' then 13
      when 'QUEUED'          then 15
      when 'MANUFACTURING'   then 18
      when 'QC'              then 19
      else null
    end;

    if target_stage is not null then
      update public.jobs
      set current_stage = target_stage
      where id = new.job_id
        and current_stage < target_stage
        and status not in ('COMPLETED', 'CANCELLED');
    end if;
  end if;

  -- ---- เดิม: บันทึก notes เป็น issue อัตโนมัติ ----
  if new.notes is not null and new.notes <> ''
     and (tg_op = 'INSERT' or new.notes is distinct from old.notes) then
    select job_code into jcode from public.jobs where id = new.job_id;
    if not exists (
      select 1 from public.issues
      where job_id = new.job_id and detail = new.notes and is_auto_created
    ) then
      insert into public.issues(issue_code, job_id, phase, type, detail, is_auto_created, status)
      values (
        'ISS-' || jcode || '-' || substr(gen_random_uuid()::text, 1, 4),
        new.job_id, 'PRODUCTION', 'OTHER', new.notes, true, 'OPEN'
      );
    end if;
  end if;

  return new;
end $$;

-- ============================================================
-- B) แก้ set_design_state — design_end = current_date ทุกครั้งที่ DONE
--    เดิม: coalesce(design_end, current_date) → ถ้า DONE→REVISING→DONE รอบ 2 design_end ค้างวันเดิม
--    ลอก logic ทั้งหมดจาก 0025 เปลี่ยนแค่บรรทัด coalesce เป็น current_date
-- ============================================================

create or replace function public.set_design_state(p_job uuid, p_state design_state_t, p_note text default '')
returns design_state_t language plpgsql security definer set search_path = public as $$
declare
  cur         design_state_t;
  prod_status text;
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

  -- ปิดงานเขียนแบบ -> stamp design_end ทุกครั้ง (แก้บั๊ก: เดิมใช้ coalesce ทำให้รอบ 2 ค้างวันเก่า)
  if p_state = 'DONE' then
    update public.jobs set design_end = current_date where id = p_job;

    -- ถ้า production ยังอยู่ที่ REVISING → เลื่อนเป็น PENDING_CONFIRM อัตโนมัติ
    -- (สัญญาณว่าแก้แบบเสร็จแล้ว รอลูกค้าคอนเฟิร์มก่อนลงคิวผลิต)
    select status into prod_status
    from public.productions
    where job_id = p_job
    order by created_at desc
    limit 1;

    if prod_status = 'REVISING' then
      update public.productions
      set status = 'PENDING_CONFIRM',
          status_updated_at = now()
      where job_id = p_job
        and status = 'REVISING';
    end if;
  end if;

  update public.jobs set design_state = p_state where id = p_job;
  return p_state;
end $$;

grant execute on function public.set_design_state(uuid, design_state_t, text) to authenticated, service_role;
