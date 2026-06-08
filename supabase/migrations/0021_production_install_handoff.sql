-- ============================================================
-- JR Beta — 0021 ส่ง planned_install_date → install_scheduled ตอน production READY
-- idempotent (create or replace function) · รันหลัง 0020
-- ============================================================
-- เหตุผล: trigger เดิม (0015) ใช้ on conflict do nothing → ไม่ copy planned_install_date
-- แก้เป็น on conflict do update set install_scheduled = coalesce(existing, new)
-- ไม่เพิ่มคอลัมน์ใหม่ — reuse install_scheduled + planned_install_date เดิม
-- ============================================================

create or replace function public.tg_production_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text;
begin
  -- อัปเดต status_updated_at ทุกครั้งที่ status เปลี่ยน
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;

  -- READY → สร้าง/อัปเดต installations พร้อม install_scheduled + เลื่อน stage 20
  if new.status = 'READY' and (tg_op = 'INSERT' or old.status is distinct from 'READY') then
    insert into public.installations(job_id, status, install_scheduled)
    values (new.job_id, 'PENDING', new.planned_install_date)
    on conflict (job_id) do update
      set install_scheduled = coalesce(
        public.installations.install_scheduled,
        excluded.install_scheduled
      );
    update public.jobs
    set current_stage = 20
    where id = new.job_id and current_stage < 20;
  end if;

  -- notes เปลี่ยน → สร้าง issue อัตโนมัติ (คงจาก 0015)
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
