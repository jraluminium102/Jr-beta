-- ============================================================
-- JR — 0020 เชื่อมสายเอกสาร (ใบเสนอ/วางบิล/ชำระเงิน) → current_stage อัตโนมัติ
-- ปัญหา: สร้างใบเสนอ/ส่ง/วางบิล/ชำระงวด ไม่เลื่อน stage ของ job
--   (quotations.job_id ว่าง → ไม่มีสะพานเชื่อมกลับงาน)
-- แก้ที่ DB layer (ครอบทุกทาง: calculator/manual/API)
-- reuse _sync_legacy_status (0014) + tg_on_deposit (0015 status=DEPOSITED→stage9+production)
-- idempotent · forward-only (ไม่ถอย stage)
-- ============================================================

-- ---------- helper: เลื่อน stage ไปข้างหน้าเท่านั้น + sync status + history ----------
create or replace function public._bump_stage(p_job uuid, p_to smallint, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cur smallint;
begin
  select current_stage into cur from public.jobs where id = p_job for update;
  if cur is null then return; end if;
  if p_to > cur and cur < 24 then
    update public.jobs
      set current_stage = p_to,
          stage_history = stage_history || jsonb_build_object(
            'from', cur, 'to', p_to, 'at', now(), 'by', null, 'note', coalesce(p_note, 'auto'))
      where id = p_job;
    perform public._sync_legacy_status(p_job, p_to);
  end if;
end $$;
grant execute on function public._bump_stage(uuid, smallint, text) to authenticated, service_role;

-- ---------- 1) auto-link quotation.job_id จาก customer_id (BEFORE INSERT) ----------
create or replace function public.tg_quotation_link_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.job_id is null and new.customer_id is not null then
    select id into new.job_id from public.jobs
      where customer_id = new.customer_id and status <> 'CANCELLED'
      order by created_at desc limit 1;
  end if;
  return new;
end $$;
drop trigger if exists trg_quotation_link on public.quotations;
create trigger trg_quotation_link before insert on public.quotations
  for each row execute function public.tg_quotation_link_job();

-- ---------- 2) ใบเสนอ → stage (created=5, sent/approved=7) ----------
create or replace function public.tg_quotation_stage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.job_id is not null then
    if new.status in ('sent', 'approved') then
      perform public._bump_stage(new.job_id, 7::smallint, 'ใบเสนอ ' || new.status);
    else
      perform public._bump_stage(new.job_id, 5::smallint, 'สร้างใบเสนอ');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_quotation_stage on public.quotations;
create trigger trg_quotation_stage after insert or update on public.quotations
  for each row execute function public.tg_quotation_stage();

-- ---------- 3) ชำระงวด (paid) → มัดจำ → stage 9 (รอวัดจริง) + เปิดงานผลิต ----------
-- set status='DEPOSITED' → tg_on_deposit (0015) สร้าง production + เลื่อน current_stage=9
create or replace function public.tg_installment_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_job uuid;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select q.job_id into v_job
      from public.billing_notes bn
      join public.quotations q on q.id = bn.quotation_id
      where bn.id = new.billing_note_id;
    if v_job is not null then
      update public.jobs
        set status         = 'DEPOSITED',
            deposit_amount = coalesce(deposit_amount, new.paid_amount),
            deposit_date   = coalesce(deposit_date, new.paid_date, current_date)
        where id = v_job and current_stage < 9
          and status <> 'DEPOSITED' and status <> 'CANCELLED';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_installment_paid on public.billing_installments;
create trigger trg_installment_paid after insert or update on public.billing_installments
  for each row execute function public.tg_installment_paid();

-- ============================================================
-- BACKFILL ข้อมูลเดิม (คุณอาทิต ฯลฯ) — ครั้งเดียว
-- ============================================================
-- 4a) link ใบเสนอเดิมที่ job_id ว่าง → job ล่าสุดของลูกค้านั้น
update public.quotations q
  set job_id = sub.jid
from (
  select distinct on (j.customer_id) j.customer_id, j.id as jid
  from public.jobs j where j.status <> 'CANCELLED'
  order by j.customer_id, j.created_at desc
) sub
where q.job_id is null and q.customer_id = sub.customer_id;

-- 4b) งานที่ใบเสนอ sent/approved → stage >= 7
do $$ declare r record; begin
  for r in select distinct job_id from public.quotations
           where job_id is not null and status in ('sent','approved') loop
    perform public._bump_stage(r.job_id, 7::smallint, 'backfill: ใบเสนอส่ง/อนุมัติ');
  end loop;
end $$;

-- 4c) งานที่ชำระงวดแล้ว → มัดจำ → stage 9 (fires tg_on_deposit)
do $$ declare r record; begin
  for r in
    select q.job_id as jid, bi.paid_amount, bi.paid_date
    from public.billing_installments bi
    join public.billing_notes bn on bn.id = bi.billing_note_id
    join public.quotations q on q.id = bn.quotation_id
    where bi.status = 'paid' and q.job_id is not null
  loop
    update public.jobs
      set status='DEPOSITED',
          deposit_amount = coalesce(deposit_amount, r.paid_amount),
          deposit_date   = coalesce(deposit_date, r.paid_date, current_date)
      where id = r.jid and current_stage < 9
        and status <> 'DEPOSITED' and status <> 'CANCELLED';
  end loop;
end $$;
