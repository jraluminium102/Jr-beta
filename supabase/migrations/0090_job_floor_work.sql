-- 0090: งานพื้น ผู้รับเหมา (ผรม.) ต่อ job — ติ๊กบนหน้าเช็คลิสต์ใบเสนอราคา
-- floor_work: none = ไม่มีงานพื้น · jr = มีงานพื้น JR ทำ · customer = มีงานพื้น แต่ ผรม.ของลูกค้าเอง
alter table public.jobs
  add column if not exists floor_work text not null default 'none',
  add column if not exists floor_note text not null default '';

do $$ begin
  alter table public.jobs add constraint jobs_floor_work_chk check (floor_work in ('none','jr','customer'));
exception when duplicate_object then null; end $$;

create index if not exists idx_jobs_floor_work on public.jobs(floor_work) where floor_work <> 'none';
