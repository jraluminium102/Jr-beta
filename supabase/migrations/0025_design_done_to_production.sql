-- ============================================================
-- JR Beta — 0025 เขียนแบบเสร็จ (DONE) → กระตุ้น production REVISING → PENDING_CONFIRM
-- idempotent (create or replace function) · รันหลัง 0024
-- ============================================================
-- Use case: ช่างเขียนแบบกด DONE → ถ้า production ของงานนั้นอยู่ที่ REVISING
-- (หมายความว่าเคยส่งแก้แบบมาจากฝั่ง production) → auto-เลื่อนเป็น PENDING_CONFIRM
-- เพื่อส่งสัญญาณกลับว่า "แก้แล้ว รอลูกค้าคอนเฟิร์ม" โดยไม่ต้องให้ PM มาคลิกเอง
-- ============================================================

create or replace function public.set_design_state(p_job uuid, p_state design_state_t, p_note text default '')
returns design_state_t language plpgsql security definer set search_path = public as $$
declare
  cur    design_state_t;
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

  -- ปิดงานเขียนแบบ -> stamp design_end ถ้ายังไม่มี
  if p_state = 'DONE' then
    update public.jobs set design_end = coalesce(design_end, current_date) where id = p_job;

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
