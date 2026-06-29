-- ============================================================
-- 0066 · ปิดต้นตอ "ลูกค้าประเมินเสร็จไม่เข้าระบบเขียนแบบ" ให้ขาด
--
-- เจอจากเคสจริง (ธวัชชัย 27 มิ.ย. · JR2026-118):
--   งานถูกสร้างแล้วแต่ status=CANCELLED + design_state=DONE + stage=2 (combo ผิดปกติ)
--   → 0052 revive ฟื้นเฉพาะ design_state='NOT_STARTED' → พลาดเคสนี้ → ไม่ขึ้นบอร์ดเขียนแบบ
--
-- + กับดักชั้น 2: คิว status='DONE' แต่ job_id ว่าง → cron (0064) กรองเฉพาะ
--   PENDING/PROPOSED/CONFIRMED → ไม่มีอะไรซ่อม → ค้างเงียบถาวร (พบ 1 ราย)
--
-- แก้ 3 อย่าง:
--   1) _promote_queue_core: ขยาย revive → ฟื้น CANCELLED stage≤2 "ทุก design_state"
--      + reset design_state='NOT_STARTED' ให้กลับเข้าเขียนแบบเสมอ
--   2) auto_complete_overdue_assess (cron): self-heal เคส DONE+job_id ว่าง ด้วย
--   3) ซ่อมของค้างย้อนหลัง: ฟื้นงาน cancelled ใต้คิว DONE + promote คิว DONE ที่ไม่มีงาน
-- idempotent · เจ้าของรัน
-- ============================================================

-- ── 1) ขยาย revive ใน _promote_queue_core ──────────────────────────────────
create or replace function public._promote_queue_core(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q              public.queue_entries%rowtype;
  v_cust         bigint;
  v_job          uuid;
  has_cust       boolean;
  v_tel_digits   text;
begin
  select * into q from public.queue_entries where id = p_queue_id;
  if q.id is null then
    raise exception 'ไม่พบคิว %', p_queue_id;
  end if;

  if q.job_id is not null then          -- idempotent
    -- ★ คืนชีพ landmine (0066 ขยาย): งานที่ถูก cancel ไว้ตั้งแต่ยังไม่เริ่มจริง (stage≤2)
    --   เดิมฟื้นเฉพาะ design_state='NOT_STARTED' → พลาดเคส design_state ค้างค่าอื่น (เช่น DONE)
    --   ใหม่: ฟื้นทุก CANCELLED stage≤2 + reset design_state='NOT_STARTED' → กลับเข้าเขียนแบบเสมอ
    update public.jobs
       set status = 'LEAD',
           design_state = 'NOT_STARTED'
     where id = q.job_id
       and status = 'CANCELLED'
       and coalesce(current_stage, 0) <= 2;
    return q.job_id;
  end if;

  if coalesce(q.job_type, '') = 'เคลียร์แบบ' and q.target_job_id is null then
    raise exception 'เคลียร์แบบ: ต้องระบุ target_job_id (งานเดิม) ก่อนปิดงาน';
  end if;

  if q.target_job_id is not null then   -- ผูกงานเดิม ไม่สร้างใหม่
    return q.target_job_id;
  end if;

  has_cust := to_regclass('public.customers') is not null;
  if q.target_customer_id is not null then
    v_cust := q.target_customer_id;
  elsif has_cust then
    v_tel_digits := nullif(regexp_replace(coalesce(q.tel, ''), '[^0-9]', '', 'g'), '');
    if v_tel_digits is not null then
      execute 'select id from public.customers
               where regexp_replace(coalesce(phone,''''), ''[^0-9]'', '''', ''g'') = $1 limit 1'
        into v_cust using v_tel_digits;
    end if;
    if v_cust is null then
      execute 'insert into public.customers (name, address, line_id, phone)
               values ($1,$2,$3,$4) returning id'
        into v_cust
        using q.customer_name, coalesce(q.address, ''), coalesce(q.line_contact, ''), coalesce(q.tel, '');
    end if;
  end if;

  insert into public.jobs (
    customer_name, customer_tel, customer_area, channel,
    assess_date, status, current_stage, customer_id, queue_entry_id, year, sequence
  ) values (
    q.customer_name, q.tel, q.address, 'OTHER',
    coalesce(q.queue_date, current_date), 'LEAD', 2, v_cust, q.id, 0, 0
  ) returning id into v_job;

  update public.queue_entries set job_id = v_job where id = q.id;
  return v_job;
end $$;

revoke all on function public._promote_queue_core(uuid) from public;
grant execute on function public._promote_queue_core(uuid) to service_role;

-- ── 2) cron self-heal: กวาด overdue-not-done + DONE-แต่ไม่มีงาน ──────────────
create or replace function public.auto_complete_overdue_assess()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cutoff date := date '2026-06-18';
  r        record;
  cnt      int := 0;
begin
  for r in
    select id, job_id, status from public.queue_entries
    where queue_date is not null
      and queue_date >= v_cutoff
      and coalesce(job_type,'') in ('', 'ประเมินหน้างาน', 'ประเมิน')
      and (
        (status in ('PENDING','PROPOSED','CONFIRMED') and queue_date < current_date)  -- เลยวัน ยังไม่ปิด
        or (status = 'DONE' and job_id is null)                                        -- กับดัก: ปิดแล้วแต่ไม่มีงาน
      )
  loop
    begin
      if r.job_id is null then
        perform public._promote_queue_core(r.id);   -- สร้างงานเข้าฝ่ายแบบ (idempotent + revive)
      end if;
      if r.status <> 'DONE' then
        update public.queue_entries set status = 'DONE' where id = r.id;
      end if;
      cnt := cnt + 1;
    exception when others then
      raise warning 'auto_complete skip queue %: %', r.id, sqlerrm;
    end;
  end loop;
  return cnt;
end $$;
revoke all on function public.auto_complete_overdue_assess() from public;
grant execute on function public.auto_complete_overdue_assess() to service_role;

-- ── 3) ซ่อมของค้างย้อนหลัง ────────────────────────────────────────────────
-- 3a) งานใต้คิวประเมิน DONE ที่ถูก cancel ไว้ stage≤2 → คืนชีพเข้าเขียนแบบ (รวมธวัชชัย JR2026-118)
update public.jobs j
   set status = 'LEAD', design_state = 'NOT_STARTED'
  from public.queue_entries q
 where q.job_id = j.id
   and q.status = 'DONE'
   and coalesce(q.job_type,'') in ('', 'ประเมินหน้างาน', 'ประเมิน')
   and j.status = 'CANCELLED'
   and coalesce(j.current_stage, 0) <= 2;

-- 3b) คิวประเมิน DONE ที่ไม่มีงานเลย (กับดัก) → สร้างงานย้อนหลัง
do $$
declare r record;
begin
  for r in
    select id from public.queue_entries
    where status = 'DONE' and job_id is null
      and coalesce(job_type,'') in ('', 'ประเมินหน้างาน', 'ประเมิน')
      and queue_date >= date '2026-06-18'
  loop
    begin
      perform public._promote_queue_core(r.id);
    exception when others then
      raise warning 'repair skip queue %: %', r.id, sqlerrm;
    end;
  end loop;
end $$;
