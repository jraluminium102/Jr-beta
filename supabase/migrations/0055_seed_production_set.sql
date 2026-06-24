-- ============================================================
-- 0055 · auto-seed production_sets — กันงานเงียบหาย
--   job เข้าผลิต (QUEUED/MANUFACTURING/QC/READY) แต่ออฟฟิศลืมเพิ่มชุด
--   → ช่างไม่มีอะไรให้เช็ค งานค้างเงียบ. สร้างชุด 1 ให้อัตโนมัติ
--   prefill จาก productions (วันวัด/คนวัด/วันติดตั้ง). ออฟฟิศแก้/เพิ่มชุดได้ตามปกติ
-- ============================================================

create or replace function public.seed_production_set()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if NEW.status in ('QUEUED','MANUFACTURING','QC','READY')
     and NEW.job_id is not null
     and not exists (select 1 from public.production_sets ps where ps.job_id = NEW.job_id) then
    insert into public.production_sets
      (job_id, set_label, seq, measure_actual, measurer_name, install_date, must_finish_date)
    values
      (NEW.job_id, 'ชุด 1', 0, NEW.measure_actual, coalesce(NEW.measurer_name, ''),
       NEW.planned_install_date, NEW.planned_install_date);
  end if;
  return NEW;
end $$;

drop trigger if exists tg_seed_production_set on public.productions;
create trigger tg_seed_production_set
  after insert or update of status on public.productions
  for each row execute function public.seed_production_set();

-- backfill งานในผลิตที่ยังไม่มีชุด (23 งานปัจจุบัน)
insert into public.production_sets
  (job_id, set_label, seq, measure_actual, measurer_name, install_date, must_finish_date)
select p.job_id, 'ชุด 1', 0, p.measure_actual, coalesce(p.measurer_name, ''),
       p.planned_install_date, p.planned_install_date
from public.productions p
join public.jobs j on j.id = p.job_id and j.status <> 'CANCELLED'
where p.status in ('QUEUED','MANUFACTURING','QC','READY')
  and not exists (select 1 from public.production_sets ps where ps.job_id = p.job_id);

notify pgrst, 'reload schema';
