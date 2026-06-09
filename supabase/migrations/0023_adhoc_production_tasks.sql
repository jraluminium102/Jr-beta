-- ============================================================
-- JR Beta — 0023 ตารางงานผลิตแบบจดเอง (adhoc) สำหรับหน้า "ตารางผลิต (ช่าง)"
-- idempotent · รันหลัง 0022
-- ============================================================
-- เหตุผล: ช่างต้องการตารางผลิตที่ดูง่าย + เพิ่มงานผลิตเองได้ (งานซ่อม/งานด่วน/งานนอกระบบ)
-- โดยไม่ต้องผ่าน flow ใบเสนอ/ลูกค้า — เก็บแยกจาก productions (ซึ่งผูก job_id + มี trigger)
-- งานในระบบยังดึงจาก productions (status QUEUED/MANUFACTURING) ตามเดิม — หน้าเว็บ merge 2 แหล่ง
-- ============================================================

create table if not exists public.adhoc_production_tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,                 -- ชื่องาน เช่น "ซ่อมบานเลื่อน คุณเอ"
  customer_name text,                           -- ลูกค้า (ไม่บังคับ)
  produce_date  date,                           -- วันผลิต
  install_date  date,                           -- วันติดตั้ง/ส่ง (ไม่บังคับ)
  producer_note text,                           -- ช่างผลิตที่รับผิดชอบ
  status        text not null default 'QUEUED', -- QUEUED | DONE
  created_by    uuid,
  created_at    timestamptz default now()
);

alter table public.adhoc_production_tasks enable row level security;

-- policies (idempotent)
do $$ begin
  create policy adhoc_prod_read on public.adhoc_production_tasks
    for select using (public.is_active());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy adhoc_prod_write on public.adhoc_production_tasks
    for all using (public.is_active()) with check (public.is_active());
exception when duplicate_object then null; end $$;

grant all on public.adhoc_production_tasks to anon, authenticated, service_role;
