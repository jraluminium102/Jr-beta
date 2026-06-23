-- ============================================================
-- 0052 · แก้บั๊ก "ลูกค้าประเมินเสร็จไม่เด้งเข้าเขียนแบบ" (landmine cancelled job)
-- ปัญหา: คิวประเมินบางใบ job_id ชี้ไปงานที่ถูก cleanup ยกเลิกไว้ (CANCELLED
--   + design NOT_STARTED + stage≤2). ตอนกดเสร็จ "มือ" route queue/[id] มี logic
--   คืนชีพ (CANCELLED→LEAD) แต่ cron auto_complete เรียก _promote_queue_core ตรงๆ
--   ซึ่ง idempotent คืน job_id เดิมโดยไม่คืนชีพ → งานค้าง CANCELLED ไม่ขึ้นบอร์ดเขียนแบบ
-- แก้: ย้าย logic คืนชีพเข้า _promote_queue_core → ทั้ง cron + กดมือ พฤติกรรมเดียวกัน
-- พบ 7 ราย landmine (มิ.ย.69): วิไล/สิริ/จอมชัย/แบ๊งค์/ปทิตตา/ศรายุทธ/รุ่งทิพย์
-- ปลอดภัย: คืนชีพเฉพาะงานยังไม่เริ่มแบบ stage≤2 (ไม่มีเงิน/ไม่กระทบงานที่เดินไปแล้ว)
-- idempotent · เจ้าของรัน
-- ============================================================

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
    -- ★ คืนชีพ landmine: งานที่ cleanup ยกเลิกไว้ (ยังไม่เริ่มแบบ stage≤2)
    --   ให้ cron auto-complete + กดเสร็จมือ พฤติกรรมเดียวกัน → ลูกค้าเด้งเข้าเขียนแบบเสมอ
    update public.jobs
       set status = 'LEAD'
     where id = q.job_id
       and status = 'CANCELLED'
       and design_state = 'NOT_STARTED'
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
