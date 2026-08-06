-- 0121: จัดคิวงานพื้น (floor-work queue scheduling)
--   ช่างงานพื้น (ปูกระเบื้อง/ไมโครไพล์/ต่องานสี-ไฟ-ฝ้า ฯลฯ) เป็นช่างนอก แต่ JR จัดคิวให้
--   ส่งคิวทั้งเดือนเข้าไลน์ · อัปเดตรายสัปดาห์ (วันเลื่อนบ่อย)
--   รองรับทั้งงาน JR (ผูก job) + ลูกค้าพิมพ์เอง (job_id null)
--   bucket: scheduled = ลงวันแล้ว (ขึ้นปฏิทิน) · after_jr = รอต่อหลัง JR เสร็จ (ยังไม่มีวัน)
--           deposit_wait = มัดจำแล้ว รอลงคิว (ยังไม่มีวัน)
create table if not exists public.floor_queue_entries (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid references public.jobs(id) on delete set null,  -- null = ลูกค้าพิมพ์เอง (ไม่ผูกงาน JR)
  customer_name  text not null,                                        -- snapshot ชื่อ (กันงานถูกลบ/แก้ชื่อภายหลัง)
  work_desc      text not null default '',                             -- รายละเอียดงาน เช่น "ต่องานเฟส2"
  extra_note     text not null default '',                             -- โน้ตเสริม เช่น "รอลูกค้าคอนเฟิร์มทำงาน"
  duration_note  text not null default '',                             -- เช่น "ทำ3วัน" / "10-15วัน"
  scheduled_date date,                                                 -- null = อยู่ในถัง (ไม่มีวัน)
  start_time     text not null default '09:00',                        -- "HH:MM" — แสดงผลเป็น "9.00 น."
  status         text not null default 'confirmed',
  bucket         text not null default 'scheduled',
  kind           text not null default 'work',
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $$ begin
  alter table public.floor_queue_entries
    add constraint floor_queue_status_chk check (status in ('confirmed','wait_cf','wait_cf_jr'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.floor_queue_entries
    add constraint floor_queue_bucket_chk check (bucket in ('scheduled','after_jr','deposit_wait'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.floor_queue_entries
    add constraint floor_queue_kind_chk check (kind in ('work','assess'));
exception when duplicate_object then null; end $$;

create index if not exists idx_floor_queue_date   on public.floor_queue_entries(scheduled_date);
create index if not exists idx_floor_queue_bucket on public.floor_queue_entries(bucket);
create index if not exists idx_floor_queue_job    on public.floor_queue_entries(job_id);

-- กัน auto-pull (ปุ่ม "ดึงลูกค้าอัตโนมัติ") สร้างซ้ำ + ผูกงาน JR ได้แค่แถวเดียวต่องาน
create unique index if not exists uq_floor_queue_job on public.floor_queue_entries(job_id) where job_id is not null;

alter table public.floor_queue_entries enable row level security;

drop policy if exists floor_queue_read  on public.floor_queue_entries;
drop policy if exists floor_queue_write on public.floor_queue_entries;
-- อ่าน: ทุกคนที่ใช้งานอยู่ (เหมือน cover_sheets/production_sets)
create policy floor_queue_read on public.floor_queue_entries for select using (public.is_active());
-- เขียน: ตรงกับ rbac resource "production" (ADMIN/PRODUCTION จัดคิวงานพื้น)
create policy floor_queue_write on public.floor_queue_entries for all
  using      (public.has_role('ADMIN', 'PRODUCTION'))
  with check (public.has_role('ADMIN', 'PRODUCTION'));

create or replace function public.tg_floor_queue_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_floor_queue_touch on public.floor_queue_entries;
create trigger trg_floor_queue_touch before update on public.floor_queue_entries
  for each row execute function public.tg_floor_queue_touch();

comment on table public.floor_queue_entries is
  'คิวงานพื้น (ผู้รับเหมานอกบริษัท JR จัดคิวให้) — ผูก job JR ได้หรือพิมพ์ชื่อลูกค้าเอง · ส่งคิวเข้าไลน์รายเดือน/อัปเดตรายสัปดาห์';

notify pgrst, 'reload schema';
