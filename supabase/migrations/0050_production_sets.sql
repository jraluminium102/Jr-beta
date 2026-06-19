-- ============================================================
-- 0050 · production_sets — ใบงานผลิตละเอียด (worksheet) 1 ชุด = 1 แถว
--   แทน Excel "แผนงานผลิตโรง1" ที่ทีมผลิต/QC ใช้จริง
--   1 job มีได้หลายชุด (เช่น คุณแป๋ม ชุด 1,4,5) · ออฟฟิศกรอก · ช่างดู
--   เฟสภาพรวม (productions.status) ยังใช้ sync ลูกค้าเหมือนเดิม
-- ============================================================
create table if not exists public.production_sets (
  id            bigint generated always as identity primary key,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  set_label     text not null default '',          -- ชื่อชุด เช่น "ชุด 1,4,5" / "ชุดแรก"
  seq           int  not null default 0,            -- ลำดับเรียง

  -- แบบ/วัด
  measure_actual   date,                            -- วันวัดจริง
  measurer_name    text not null default '',        -- คนวัดงาน
  design_received  text not null default '',        -- แบบถึงฝ่ายผลิต: ได้รับแบบ/ได้แบบไม่ครบ/ยังไม่ได้รับแบบ

  -- เดดไลน์
  must_finish_date date,                            -- ต้องผลิตเสร็จ
  glass_done_date  date,                            -- ใส่กระจกเสร็จ (กำหนด)
  actual_done_date date,                            -- วันที่เสร็จจริง

  -- วัสดุ 3 สาย (เบิกสต๊อกทั้งหมด / สั่งแล้ว รอของ / ของมาแล้ว / '')
  mat_equipment    text not null default '',        -- อุปกรณ์
  mat_alu_normal   text not null default '',        -- อลูฯปกติ
  mat_alu_painted  text not null default '',        -- อลูฯอบสี

  -- กระจก
  glass_spec       text not null default '',        -- สเปคกระจก
  glass_order      text not null default '',        -- สั่งกระจก: สั่งแล้ว รอของ / มาแล้ว
  glass_installed  text not null default '',        -- ใส่กระจก: ใส่แล้ว / ยังไม่ใส่
  qc_before_glass  text not null default '',        -- QC ก่อนสั่งกระจก: ผ่าน

  -- โครง
  frame_status     text not null default '',        -- สถานะ/ขึ้นโครง เช่น "ขึ้นโครงโรงงาน3"

  -- มุ้ง
  screen_type      text not null default '',        -- ชนิดมุ้ง: มุ้งนิรภัย/มุ้ง JR/...
  screen_installed text not null default '',        -- ใส่มุ้ง: มาแล้ว/ใส่แล้ว

  qc_after_glass   text not null default '',        -- QC หลังใส่กระจก: ผ่าน

  -- ติดตั้ง
  install_date     date,                            -- วันติดตั้ง
  note             text not null default '',        -- หมายเหตุ

  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists production_sets_job_idx on public.production_sets (job_id);
create index if not exists production_sets_seq_idx on public.production_sets (seq);

-- updated_at อัตโนมัติ (reuse touch_updated_at จาก 0005)
drop trigger if exists tg_production_sets_touch on public.production_sets;
create trigger tg_production_sets_touch before update on public.production_sets
  for each row execute function public.touch_updated_at();

-- RLS — อ่าน: active user ทุกคน (ช่างดูได้) · เขียน: ADMIN/PRODUCTION (ออฟฟิศ/ผลิต)
alter table public.production_sets enable row level security;
create policy production_sets_read  on public.production_sets for select
  using (public.is_active());
create policy production_sets_write on public.production_sets for all
  using (public.has_role('ADMIN','PRODUCTION')) with check (public.has_role('ADMIN','PRODUCTION'));

notify pgrst, 'reload schema';
