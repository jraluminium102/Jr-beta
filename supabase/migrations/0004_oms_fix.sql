-- ============================================================
-- JR OMS — 0004 FIX: trigger functions ที่เขียนข้ามตาราง ต้องเป็น SECURITY DEFINER
-- ปัญหา: trigger รันด้วยสิทธิ์ user → RLS บล็อกการเขียน job_sequence/productions/
--        finance_entries/installations/issues → user จริงสร้างงาน/มัดจำไม่ได้ (42501)
-- แก้: ให้ trigger function รันด้วยสิทธิ์เจ้าของ (bypass RLS) — เป็น pattern มาตรฐาน
-- create or replace ไม่กระทบ trigger เดิม (ผูกตามชื่อ function อยู่แล้ว)
-- ============================================================

-- Job code: เขียน job_sequence
create or replace function public.tg_assign_job_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare y int; seq int;
begin
  if new.job_code is not null then return new; end if;
  y := extract(year from new.assess_date)::int;
  insert into public.job_sequence(year, last_seq) values (y, 1)
    on conflict (year) do update set last_seq = public.job_sequence.last_seq + 1
    returning last_seq into seq;
  new.year := y;
  new.sequence := seq;
  new.job_code := 'JR' || y::text || '-' || lpad(seq::text, 3, '0');
  return new;
end $$;

-- มัดจำ → เขียน productions + finance_entries
create or replace function public.tg_on_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'DEPOSITED'
     and (tg_op = 'INSERT' or old.status is distinct from 'DEPOSITED') then
    insert into public.productions(job_id, status)
    values (new.id, 'PENDING_MEASURE')
    on conflict (job_id) do nothing;

    if new.deposit_amount is not null and new.deposit_date is not null
       and not exists (
         select 1 from public.finance_entries
         where job_id = new.id and type = 'DEPOSIT' and is_auto_created and not is_voided
       ) then
      insert into public.finance_entries(job_id, payment_date, amount, type, channel, note, is_auto_created)
      values (new.id, new.deposit_date, new.deposit_amount, 'DEPOSIT', 'TRANSFER', 'มัดจำ (auto)', true);
    end if;
  end if;
  return new;
end $$;

-- Production: READY → installations, notes → issues
create or replace function public.tg_production_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;

  if new.status = 'READY' and (tg_op='INSERT' or old.status is distinct from 'READY') then
    insert into public.installations(job_id, status)
    values (new.job_id, 'PENDING') on conflict (job_id) do nothing;
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

-- Installation: warranty + COMPLETED→job + problems → issues
create or replace function public.tg_installation_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text; p text; r text; i int;
begin
  if new.completed_date is not null then
    new.warranty_until := new.completed_date + interval '12 months';
  end if;

  if new.status = 'COMPLETED' and (tg_op='INSERT' or old.status is distinct from 'COMPLETED') then
    update public.jobs set status = 'COMPLETED' where id = new.job_id;
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

-- Issue code: อ่าน jobs (select ผ่าน RLS อยู่แล้ว แต่ทำ definer กันพลาดเวลา auto-insert)
create or replace function public.tg_assign_issue_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text;
begin
  if new.issue_code is null then
    select job_code into jcode from public.jobs where id = new.job_id;
    new.issue_code := 'ISS-'||coalesce(jcode,'NA')||'-'||substr(gen_random_uuid()::text,1,4);
  end if;
  return new;
end $$;
