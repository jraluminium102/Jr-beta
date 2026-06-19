-- ============================================================
-- 0047 · Auto-complete คิวประเมินที่เลยวัน → เข้าฝ่ายแบบ อัตโนมัติ
--   • คิว "ประเมินหน้างาน" ที่ queue_date < วันนี้ (เลยมา ≥1 วัน) + ยังไม่ปิด
--     → mark DONE + สร้างงาน (LEAD stage 2) เข้าฝ่ายแบบ ด้วย logic เดียวกับกดเสร็จมือ
--   • เฉพาะคิว queue_date >= cutoff (วันเปิดใช้) — ไม่ยุ่งของเก่า/import
--   • รันด้วย pg_cron วันละครั้ง 02:00 UTC = 09:00 ไทย
-- idempotent · เจ้าของรัน
-- ============================================================

-- ── 1) แยก core ของ promote ออกมา (ไม่เช็ค ADMIN) ให้ระบบ/cron เรียกได้ ──
-- body เดียวกับ promote_queue_to_job (0045) ตัดแค่ guard has_role('ADMIN')
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

-- core เป็น definer ไม่เช็คสิทธิ์ → ห้าม client เรียกตรง (เฉพาะ service_role/ภายใน)
revoke all on function public._promote_queue_core(uuid) from public;
grant execute on function public._promote_queue_core(uuid) to service_role;

-- ── 2) promote_queue_to_job เดิม → เช็ค ADMIN แล้ว delegate ไป core (ไม่ให้ logic ซ้ำ) ──
create or replace function public.promote_queue_to_job(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('ADMIN') then
    raise exception 'forbidden: ต้องเป็น ADMIN';
  end if;
  return public._promote_queue_core(p_queue_id);
end $$;
grant execute on function public.promote_queue_to_job(uuid) to authenticated, service_role;

-- ── 3) ฟังก์ชันกวาดคิวประเมินเลยวัน (เรียกโดย cron) ──
create or replace function public.auto_complete_overdue_assess()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cutoff date := date '2026-06-18';   -- วันเปิดใช้ — เฉพาะคิวตั้งแต่วันนี้ไป (ไม่ยุ่งของเก่า)
  r        record;
  cnt      int := 0;
begin
  for r in
    select id from public.queue_entries
    where status in ('PENDING','PROPOSED','CONFIRMED')   -- ยังไม่ปิด/ไม่ยกเลิก
      and job_id is null
      and queue_date is not null
      and queue_date <  current_date                     -- เลยวันมาแล้ว (≥1 วัน)
      and queue_date >= v_cutoff                          -- ตั้งแต่วันเปิดใช้ไป
      and coalesce(job_type,'') in ('', 'ประเมินหน้างาน', 'ประเมิน')  -- เฉพาะประเมิน
  loop
    begin
      perform public._promote_queue_core(r.id);          -- สร้างงานเข้าฝ่ายแบบ (idempotent)
      update public.queue_entries set status = 'DONE' where id = r.id;
      cnt := cnt + 1;
    exception when others then
      raise warning 'auto_complete skip queue %: %', r.id, sqlerrm;  -- ข้ามใบที่พัง ไม่ล้มทั้ง batch
    end;
  end loop;
  return cnt;
end $$;
revoke all on function public.auto_complete_overdue_assess() from public;
grant execute on function public.auto_complete_overdue_assess() to service_role;

-- ── 4) ตั้ง pg_cron รันวันละครั้ง 02:00 UTC (09:00 ไทย) ──
create extension if not exists pg_cron;
-- ลบ job เดิมถ้ามี (กันซ้ำตอนรัน migration ซ้ำ) แล้วตั้งใหม่
select cron.unschedule('auto-complete-assess')
  where exists (select 1 from cron.job where jobname = 'auto-complete-assess');
select cron.schedule('auto-complete-assess', '0 2 * * *',
  $$ select public.auto_complete_overdue_assess(); $$);
