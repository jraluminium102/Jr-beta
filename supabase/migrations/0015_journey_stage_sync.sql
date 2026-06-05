-- ============================================================
-- JR Beta — 0015 เชื่อม current_stage เข้ากับ flow เดิม (sync สองทาง)
-- แก้ผล E2E: BLOCKER-1 (promote ไม่ set stage) + HIGH-2/3 (มัดจำ/READY ไม่เลื่อน stage)
-- ขยาย trigger เดิม (create or replace) ให้เซ็ต jobs.current_stage ตามจุดสำคัญ
-- idempotent · รันหลัง 0014
-- ============================================================

-- ---------- BLOCKER-1: promote ตั้ง current_stage = 2 (เข้าทะเบียนแล้ว) ----------
create or replace function public.promote_queue_to_job(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.queue_entries%rowtype; v_cust bigint; v_job uuid; has_cust boolean;
begin
  if not public.has_role('ADMIN') then raise exception 'forbidden: ต้องเป็น ADMIN'; end if;
  select * into q from public.queue_entries where id = p_queue_id;
  if q.id is null then raise exception 'ไม่พบคิว %', p_queue_id; end if;
  if q.job_id is not null then return q.job_id; end if;

  has_cust := to_regclass('public.customers') is not null;
  if has_cust then
    if coalesce(q.tel,'') <> '' then
      execute 'select id from public.customers where phone = $1 limit 1' into v_cust using q.tel;
    end if;
    if v_cust is null then
      execute 'insert into public.customers (name, address, line_id, phone) values ($1,$2,$3,$4) returning id'
        into v_cust using q.customer_name, coalesce(q.address,''), coalesce(q.line_contact,''), coalesce(q.tel,'');
    end if;
  end if;

  insert into public.jobs (customer_name, customer_tel, customer_area, channel,
                           assess_date, status, current_stage, customer_id, queue_entry_id, year, sequence)
  values (q.customer_name, q.tel, q.address, 'OTHER',
          coalesce(q.queue_date, current_date), 'LEAD', 2, v_cust, q.id, 0, 0)
  returning id into v_job;

  update public.queue_entries set job_id = v_job where id = q.id;
  return v_job;
end $$;

-- ---------- HIGH-2: มัดจำ (status→DEPOSITED) → เลื่อน stage = 9 (รอวัดจริง) ----------
create or replace function public.tg_on_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'DEPOSITED'
     and (tg_op = 'INSERT' or old.status is distinct from 'DEPOSITED') then
    insert into public.productions(job_id, status) values (new.id, 'PENDING_MEASURE')
      on conflict (job_id) do nothing;

    if new.deposit_amount is not null and new.deposit_date is not null
       and not exists (select 1 from public.finance_entries
         where job_id = new.id and type = 'DEPOSIT' and is_auto_created and not is_voided) then
      insert into public.finance_entries(job_id, payment_date, amount, type, channel, note, is_auto_created)
      values (new.id, new.deposit_date, new.deposit_amount, 'DEPOSIT', 'TRANSFER', 'มัดจำ (auto)', true);
    end if;

    update public.jobs set current_stage = 9 where id = new.id and current_stage < 9;  -- เลื่อน stage อัตโนมัติ
  end if;
  return new;
end $$;

-- ---------- HIGH-3: Production READY → เลื่อน stage = 20 (รอติดตั้ง) ----------
create or replace function public.tg_production_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;

  if new.status = 'READY' and (tg_op='INSERT' or old.status is distinct from 'READY') then
    insert into public.installations(job_id, status) values (new.job_id, 'PENDING') on conflict (job_id) do nothing;
    update public.jobs set current_stage = 20 where id = new.job_id and current_stage < 20;  -- เลื่อน stage
  end if;

  if new.notes is not null and new.notes <> '' and (tg_op='INSERT' or new.notes is distinct from old.notes) then
    select job_code into jcode from public.jobs where id = new.job_id;
    if not exists (select 1 from public.issues where job_id=new.job_id and detail=new.notes and is_auto_created) then
      insert into public.issues(issue_code, job_id, phase, type, detail, is_auto_created, status)
      values ('ISS-'||jcode||'-'||substr(gen_random_uuid()::text,1,4), new.job_id, 'PRODUCTION','OTHER', new.notes, true,'OPEN');
    end if;
  end if;
  return new;
end $$;

-- ---------- ส่งงาน: Installation COMPLETED → job COMPLETED + stage = 24 ----------
create or replace function public.tg_installation_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text; p text; r text; i int;
begin
  if new.completed_date is not null then new.warranty_until := new.completed_date + interval '12 months'; end if;

  if new.status = 'COMPLETED' and (tg_op='INSERT' or old.status is distinct from 'COMPLETED') then
    update public.jobs set status = 'COMPLETED', current_stage = 24 where id = new.job_id;
  end if;

  select job_code into jcode from public.jobs where id = new.job_id;
  for i in 1..4 loop
    p := case i when 1 then new.problem1 when 2 then new.problem2 when 3 then new.problem3 else new.problem4 end;
    r := case i when 1 then new.responsible1 when 2 then new.responsible2 when 3 then new.responsible3 else new.responsible4 end;
    if p is not null and p <> '' then
      if not exists (select 1 from public.issues where job_id=new.job_id and detail=p and is_auto_created) then
        insert into public.issues(issue_code, job_id, phase, type, detail, owner_name, is_auto_created, status)
        values ('ISS-'||jcode||'-'||substr(gen_random_uuid()::text,1,4), new.job_id,'INSTALLATION','OTHER', p, r, true, 'OPEN');
      end if;
    end if;
  end loop;
  return new;
end $$;
