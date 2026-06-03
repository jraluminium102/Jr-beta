-- ============================================================
-- JR OMS — 0002 Business-rule functions & triggers
-- ฝัง invariant ไว้ใน DB → data integrity ไม่พังเหมือน Sheets
-- ============================================================

-- ---------- updated_at auto-stamp ----------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger touch_jobs          before update on public.jobs          for each row execute function public.tg_touch_updated_at();
create trigger touch_productions   before update on public.productions   for each row execute function public.tg_touch_updated_at();
create trigger touch_installations before update on public.installations for each row execute function public.tg_touch_updated_at();
create trigger touch_issues        before update on public.issues        for each row execute function public.tg_touch_updated_at();
create trigger touch_finance       before update on public.finance_entries for each row execute function public.tg_touch_updated_at();
create trigger touch_profiles      before update on public.profiles      for each row execute function public.tg_touch_updated_at();

-- ---------- new auth user → profile ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Job code: JR{YYYY}-{NNN} ต่อเลขเดิม (OQ-01) ----------
create or replace function public.tg_assign_job_code()
returns trigger language plpgsql as $$
declare y int; seq int;
begin
  if new.job_code is not null then return new; end if;       -- migration: เคารพ code เดิม
  y := extract(year from new.assess_date)::int;
  insert into public.job_sequence(year, last_seq) values (y, 1)
    on conflict (year) do update set last_seq = public.job_sequence.last_seq + 1
    returning last_seq into seq;
  new.year := y;
  new.sequence := seq;
  new.job_code := 'JR' || y::text || '-' || lpad(seq::text, 3, '0');
  return new;
end $$;

create trigger assign_job_code before insert on public.jobs
  for each row execute function public.tg_assign_job_code();

-- ---------- VAT/total auto จาก net (OQ-04) ----------
create or replace function public.tg_calc_financials()
returns trigger language plpgsql as $$
begin
  if new.net_amount is not null then
    new.vat_amount   := round(new.net_amount * 0.07, 2);
    new.total_amount := new.net_amount + new.vat_amount;
  end if;
  return new;
end $$;

create trigger calc_financials before insert or update of net_amount on public.jobs
  for each row execute function public.tg_calc_financials();

-- ---------- มัดจำแล้ว → auto สร้าง Production + Finance entry ----------
create or replace function public.tg_on_deposit()
returns trigger language plpgsql as $$
begin
  if new.status = 'DEPOSITED'
     and (tg_op = 'INSERT' or old.status is distinct from 'DEPOSITED') then

    -- 1) Production record (ครั้งเดียว)
    insert into public.productions(job_id, status)
    values (new.id, 'PENDING_MEASURE')
    on conflict (job_id) do nothing;

    -- 2) Finance entry สำหรับมัดจำ (ครั้งเดียว, วัน+ยอดจาก Master)
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

create trigger on_deposit after insert or update of status on public.jobs
  for each row execute function public.tg_on_deposit();

-- ---------- Production: stamp status_updated_at + READY → auto Installation + notes → Issue ----------
create or replace function public.tg_production_changes()
returns trigger language plpgsql as $$
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

create trigger production_changes before insert or update on public.productions
  for each row execute function public.tg_production_changes();

-- ---------- Installation: warranty +12เดือน + COMPLETED→job + ปัญหา→Issues ----------
create or replace function public.tg_installation_changes()
returns trigger language plpgsql as $$
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

create trigger installation_changes before insert or update on public.installations
  for each row execute function public.tg_installation_changes();

-- ---------- Issue code auto ----------
create or replace function public.tg_assign_issue_code()
returns trigger language plpgsql as $$
declare jcode text;
begin
  if new.issue_code is null then
    select job_code into jcode from public.jobs where id = new.job_id;
    new.issue_code := 'ISS-'||coalesce(jcode,'NA')||'-'||substr(gen_random_uuid()::text,1,4);
  end if;
  return new;
end $$;

create trigger assign_issue_code before insert on public.issues
  for each row execute function public.tg_assign_issue_code();
