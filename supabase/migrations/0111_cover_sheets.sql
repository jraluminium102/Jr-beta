-- 0111: ใบปะหน้า (job spec cover sheet) — สรุปสเปคเตรียมของ/ผลิต จากใบเสนอราคา ต่อ 1 งาน
--   ทำหลังลูกค้ามัดจำ · ดึงสเปคจากใบเสนอ (สี/กระจก/ราง/หลังคา/มือจับ/option) มาเป็นบุลเลท
--   1 งาน = 1 ใบปะหน้า (unique job_id) · content เก็บโครงที่ editor แก้ได้ทั้งหมด
create table if not exists public.cover_sheets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  quotation_id bigint references public.quotations(id) on delete set null, -- ใบเสนอที่ใช้ generate
  mode text not null default 'short' check (mode in ('short', 'grouped')), -- โหมดพิมพ์ (default สั้น)
  -- content = { floorNote, groups:[{n,title,lines:[{text,color,hl}]}], midLines:[...], rightLines:[...] }
  --   color: '' (ดำ) | 'red' | 'blue' | 'green' · hl: boolean (ไฮไลต์เหลือง)
  content jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists uq_cover_sheets_job on public.cover_sheets(job_id);

alter table public.cover_sheets enable row level security;
-- อ่าน: ทุกคน active (ทีมผลิต/เซลล์/แอดมิน ใช้เตรียมของ)
create policy cover_read on public.cover_sheets for select using (public.is_active());
-- เขียน: ตรงกับ rbac resource "production" (ADMIN/PRODUCTION/CHANG) — ใบปะหน้าไม่มีข้อมูลราคา
--   ⚠ ต้องมี CHANG (บทเรียน production_sets 0058) เพราะ CHANG มี production:write
create policy cover_write on public.cover_sheets for all
  using      (public.has_role('ADMIN', 'PRODUCTION', 'CHANG'))
  with check (public.has_role('ADMIN', 'PRODUCTION', 'CHANG'));
