-- 0086: หน้าติดตั้งใหม่ (ปฏิทินวางแผนคิวช่าง) — ทีมประจำ + assignment หลายวัน/ไม่ต่อเนื่อง/ต่อทีม
-- ของเดิม installations = 1 งาน/วันเดียว/ไม่มีทีม → เพิ่ม 2 ตารางนี้ให้วางแผนคิวจริงได้ (display/planning layer)

create table if not exists public.install_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lead_name text not null default '',        -- หัวหน้าช่าง (พิมพ์ชื่อ)
  color text not null default 'red',         -- red|blue|green|amber|purple|teal (สีในปฏิทิน)
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.install_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  team_id uuid references public.install_teams(id) on delete set null,
  date date not null,                        -- วันที่เข้าติดตั้ง (1 แถว = 1 วัน)
  crew text not null default '',             -- ลูกน้องช่าง (พิมพ์ชื่ออิสระ คั่นด้วย ,)
  day_no int,                                -- วันที่เท่าไหร่ (1..n) ใช้โชว์ "2/3"
  day_total int,                             -- ทั้งหมดกี่วัน
  note text not null default '',             -- โน้ต/ปัญหา ต่อวัน
  created_at timestamptz default now(),
  created_by uuid
);
create index if not exists idx_ia_date on public.install_assignments(date);
create index if not exists idx_ia_job on public.install_assignments(job_id);

alter table public.install_teams enable row level security;
alter table public.install_assignments enable row level security;
create policy it_read  on public.install_teams for select using (public.is_active());
create policy it_write on public.install_teams for all using (public.has_role('ADMIN','INSTALLER')) with check (public.has_role('ADMIN','INSTALLER'));
create policy ia_read  on public.install_assignments for select using (public.is_active());
create policy ia_write on public.install_assignments for all using (public.has_role('ADMIN','INSTALLER')) with check (public.has_role('ADMIN','INSTALLER'));

-- seed 3 ทีมเริ่มต้น (เปลี่ยนชื่อ/หัวหน้าได้ทีหลังในหน้า)
insert into public.install_teams (name, lead_name, color, sort_order)
select v.name, v.lead_name, v.color, v.sort_order
from (values ('ทีม A','','red',1), ('ทีม B','','blue',2), ('ทีม C','','green',3)) as v(name, lead_name, color, sort_order)
where not exists (select 1 from public.install_teams);
