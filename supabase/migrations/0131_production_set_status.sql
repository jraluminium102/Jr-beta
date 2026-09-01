-- ============================================================
-- 0131 · ผลิต/ติดตั้ง แยกชุด + Hold — ให้บางชุดพักรอ (เช่น รอสีลูกค้าคอนเฟิร์ม)
--   โดยชุดอื่นเดินหน้าผลิต/ติดตั้งต่อได้ ไม่ต้องรอทั้งงาน
--   เจ้าของเคาะ 1 ก.ย.2569:
--     3) ชุดที่ไม่ hold ผลิต/ครบ + มี hold ค้าง → เฟสรวม = READY (พร้อมติดตั้ง) + ป้าย hold
--     4) ติดตั้งครบชุด active เหลือ hold → คงงานเปิดไว้ ไม่ปิด/ไม่เก็บงวดสุดท้าย รอปลด hold
--   idempotent · รันได้ซ้ำปลอดภัย (add column if not exists + backfill มีเงื่อนไข where)
-- ============================================================

alter table public.production_sets
  add column if not exists produce_status  text not null default 'PENDING',   -- PENDING | PRODUCING | DONE
  add column if not exists install_status  text not null default 'PENDING',   -- PENDING | INSTALLED
  add column if not exists hold            boolean not null default false,
  add column if not exists hold_reason     text,
  add column if not exists produce_done_at timestamptz,
  add column if not exists produce_done_by text,
  add column if not exists installed_at    timestamptz,
  add column if not exists installed_by    text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'production_sets_produce_status_chk') then
    alter table public.production_sets
      add constraint production_sets_produce_status_chk check (produce_status in ('PENDING','PRODUCING','DONE'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'production_sets_install_status_chk') then
    alter table public.production_sets
      add constraint production_sets_install_status_chk check (install_status in ('PENDING','INSTALLED'));
  end if;
end $$;

create index if not exists production_sets_status_idx
  on public.production_sets (job_id, produce_status, install_status, hold);

-- backfill (idempotent — เงื่อนไข where กันรันซ้ำทับของที่ผู้ใช้แก้ไปแล้ว):
--   ชุดที่ QC หลังใส่กระจก "ผ่าน" แล้ว (สัญญาณเดียวกับที่หน้าเว็บใช้ตัดสิน setIsDone) = ผลิตเสร็จจริง
update public.production_sets
  set produce_status = 'DONE'
  where produce_status = 'PENDING' and qc_after_glass = 'ผ่าน';

-- ---------- redefine tg_installation_changes (0015) — guard hold ค้าง ห้ามปิดงานอัตโนมัติ ----------
create or replace function public.tg_installation_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare jcode text; p text; r text; i int; v_hold boolean;
begin
  if new.completed_date is not null then new.warranty_until := new.completed_date + interval '12 months'; end if;

  if new.status = 'COMPLETED' and (tg_op='INSERT' or old.status is distinct from 'COMPLETED') then
    -- 0131: ยังมีชุดผลิต hold ค้างของงานนี้ → ห้ามปิดงาน/เลื่อน stage อัตโนมัติ (เจ้าของเคาะ: คงงานเปิดไว้ รอปลด hold)
    select exists(
      select 1 from public.production_sets where job_id = new.job_id and hold = true
    ) into v_hold;
    if not coalesce(v_hold, false) then
      update public.jobs set status = 'COMPLETED', current_stage = 24 where id = new.job_id;
    end if;
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

-- ---------- RLS: ให้ INSTALLER เขียน production_sets ได้ (ติ๊ก "ติดตั้งชุดนี้แล้ว") ----------
-- qa เจอ (1 ก.ย.69): endpoint /production-sets/[id]/install-status สำหรับช่างติดตั้ง (INSTALLER)
--   แต่ policy เขียนเดิม (0058) มีแค่ ADMIN/PRODUCTION/CHANG → INSTALLER UPDATE โดน RLS ตัด = 0 แถว = 404
--   เพิ่ม INSTALLER (แนวเดียวกับที่ 0058 เพิ่ม CHANG)
drop policy if exists production_sets_write on public.production_sets;
create policy production_sets_write on public.production_sets for all
  using (public.has_role('ADMIN','PRODUCTION','CHANG','INSTALLER'))
  with check (public.has_role('ADMIN','PRODUCTION','CHANG','INSTALLER'));

-- backfill install_status: งานที่ "ปิดแล้ว/ติดตั้งเสร็จแล้ว" ก่อนมีฟีเจอร์นี้ → มาร์คทุกชุด INSTALLED
--   กัน gate ปิดงาน (install-gate) ย้อนไปบล็อกงานที่จบไปแล้ว (qa เตือน) · งานที่ยังติดตั้งอยู่คงเป็น PENDING
--   ให้ทีมติ๊กรายชุดตามฟีเจอร์ใหม่ (idempotent — where install_status='PENDING')
update public.production_sets ps
  set install_status = 'INSTALLED'
  where ps.install_status = 'PENDING'
    and exists (
      select 1 from public.jobs j
      where j.id = ps.job_id and j.status = 'COMPLETED'
    );

notify pgrst, 'reload schema';
