-- ============================================================
-- JR Beta — 0014 State machine 24 stage (เชื่อม flow ลูกค้า)
-- jobs.current_stage (1–24) = single source of truth ของ UI
-- status enum เดิม = derived/sync (trigger เก่า + report ไม่พัง)
-- เพิ่มแค่ 2 field + 2 RPC · ไม่แตะ enum เดิม · idempotent · รันหลัง 0013
-- ============================================================

-- ---------- 1) 2 field ใหม่บน jobs ----------
alter table public.jobs add column if not exists current_stage smallint not null default 1
  check (current_stage between 1 and 24);
alter table public.jobs add column if not exists stage_history jsonb not null default '[]'::jsonb;
create index if not exists jobs_current_stage_idx on public.jobs(current_stage);

-- ---------- 2) backfill: เดา current_stage จาก status (เฉพาะ row ที่ยัง default 1) ----------
update public.jobs set current_stage = case status
    when 'LEAD'             then 2
    when 'PENDING_QUOTE'    then 3
    when 'QUOTE_SENT'       then 7
    when 'PENDING_DECISION' then 7
    when 'DEPOSITED'        then 9
    when 'IN_PRODUCTION'    then 15
    when 'INSTALLING'       then 21
    when 'COMPLETED'        then 24
    else 1 end
where current_stage = 1 and status <> 'CANCELLED';

-- ---------- 3) sync jobs.status จาก stage (macro) — ข้าม 8/20 ให้ trigger เดิมทำ ----------
create or replace function public._sync_legacy_status(p_job uuid, p_stage smallint)
returns void language plpgsql security definer set search_path = public as $$
declare new_status job_status_t;
begin
  new_status := case
    when p_stage in (1,2)        then 'LEAD'
    when p_stage in (3,4,5,6)    then 'PENDING_QUOTE'
    when p_stage = 7             then 'QUOTE_SENT'
    when p_stage between 9 and 19 then 'IN_PRODUCTION'
    when p_stage between 21 and 23 then 'INSTALLING'
    when p_stage = 24            then 'COMPLETED'
    else null end;   -- 8 (มัดจำ) / 20 (พร้อมติดตั้ง) ปล่อย flow เดิม
  if new_status is not null then
    update public.jobs set status = new_status
      where id = p_job and status <> new_status and status <> 'CANCELLED';
  end if;
end $$;

-- ---------- 4) RPC advance_stage: เดินหน้า/loop ตาม whitelist (atomic, ADMIN) ----------
create or replace function public.advance_stage(p_job uuid, p_to smallint, p_note text default null)
returns smallint language plpgsql security definer set search_path = public as $$
declare cur smallint;
begin
  if not public.has_role('ADMIN') then raise exception 'forbidden: ต้องเป็น ADMIN'; end if;
  select current_stage into cur from public.jobs where id = p_job for update;
  if cur is null then raise exception 'ไม่พบงาน %', p_job; end if;
  if cur >= 24 then raise exception 'งานจบแล้ว (stage 24)'; end if;

  -- valid: ไปหน้า +1 หรือ loop ที่ whitelist (4→3, 6→5, 12→11, 23→22)
  if not (p_to = cur + 1
          or (cur = 4 and p_to = 3) or (cur = 6 and p_to = 5)
          or (cur = 12 and p_to = 11) or (cur = 23 and p_to = 22)) then
    raise exception 'เปลี่ยนสเตจไม่ถูกต้อง % -> % (ไปทีละขั้น หรือ loop ที่อนุญาตเท่านั้น)', cur, p_to;
  end if;

  update public.jobs
    set current_stage = p_to,
        stage_history = stage_history || jsonb_build_object(
          'from', cur, 'to', p_to, 'at', now(), 'by', auth.uid(), 'note', p_note)
    where id = p_job;

  perform public._sync_legacy_status(p_job, p_to);
  return p_to;
end $$;

grant execute on function public.advance_stage(uuid, smallint, text) to authenticated, service_role;
grant execute on function public._sync_legacy_status(uuid, smallint) to authenticated, service_role;
